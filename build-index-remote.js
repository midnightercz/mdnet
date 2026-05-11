const fs = require('fs');
const path = require('path');
const GitHubClient = require('./lib/github-client');
const GitLabClient = require('./lib/gitlab-client');
const { parseArguments } = require('./lib/cli-parser');
const { indexMarkdownContent } = require('./lib/remote-indexer-core');

const STATE_FILE = path.join(__dirname, '.index-state-remote.json');

/**
 * Load remote indexing state
 * @returns {object} State object with repository tracking
 */
function loadRemoteState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    return { repositories: {} };
  }
}

/**
 * Save remote indexing state
 * @param {object} state - State object to save
 */
function saveRemoteState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Format repository key for state tracking
 * @param {object} repository - Repository object
 * @returns {string} Repository key
 */
function formatRepoKey(repository) {
  if (repository.owner && repository.repo) {
    return `${repository.owner}/${repository.repo}`;
  }
  return repository.projectId;
}

/**
 * Format repository name for display
 * @param {object} repository - Repository object
 * @returns {string} Display name
 */
function formatRepoName(repository) {
  if (repository.owner && repository.repo) {
    return `${repository.owner}/${repository.repo}`;
  }
  return repository.projectId;
}

/**
 * Build file URL for GitHub or GitLab
 * @param {string} provider - 'github' or 'gitlab'
 * @param {object} repository - Repository object
 * @param {string} branch - Branch name
 * @param {string} filePath - File path in repository
 * @returns {string} URL to file on provider
 */
function buildFileUrl(provider, repository, branch, filePath) {
  if (provider === 'github') {
    return `https://github.com/${repository.owner}/${repository.repo}/blob/${branch}/${filePath}`;
  } else {
    // GitLab - use hostname from repository or default to gitlab.com
    const hostname = repository.hostname || 'https://gitlab.com';
    const projectPath = repository.projectId.replace(/%2F/g, '/');
    return `${hostname}/${projectPath}/-/blob/${branch}/${filePath}`;
  }
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Load existing index entry for a file
 * @param {string} outputFile - Index file path
 * @param {string} filePath - File path to find
 * @returns {object|null} Existing index entry or null
 */
function loadExistingEntry(outputFile, filePath) {
  try {
    const index = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    const filename = filePath.replace(/\.md$/i, '').replace(/\\/g, '/');
    return index.find(entry => entry.filename === filename);
  } catch (e) {
    return null;
  }
}

/**
 * Main indexing function
 */
async function main() {
  console.log('MDNet Remote Repository Indexer\n');

  let config;
  try {
    config = parseArguments(process.argv);
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    process.exit(1);
  }

  // Display configuration
  const repoName = formatRepoName(config.repository);
  console.log(`Provider:   ${config.provider}`);
  console.log(`Repository: ${repoName}`);
  console.log(`Branch:     ${config.branch}`);
  if (config.pathFilter) {
    console.log(`Path:       ${config.pathFilter}`);
  }
  console.log(`Output:     ${config.outputFile}`);
  if (config.merge) {
    console.log(`Merge:      enabled`);
  }
  console.log('');

  // Initialize API client
  const client = config.provider === 'github'
    ? new GitHubClient(config.token)
    : new GitLabClient(config.token, config.repository.hostname);

  try {
    // Load state
    const state = loadRemoteState();
    const repoKey = `${config.provider}:${formatRepoKey(config.repository)}:${config.branch}`;

    // Initialize repository state if needed
    if (!state.repositories[repoKey]) {
      state.repositories[repoKey] = { files: {} };
    }

    // Fetch latest commit SHA
    console.log('Fetching repository metadata...');
    let latestCommit;
    if (config.provider === 'github') {
      latestCommit = await client.getBranchCommit(
        config.repository.owner,
        config.repository.repo,
        config.branch
      );
    } else {
      latestCommit = await client.getBranchCommit(
        config.repository.projectId,
        config.branch
      );
    }

    // Check if re-indexing needed
    if (state.repositories[repoKey].lastCommitSha === latestCommit.sha && !config.merge) {
      console.log('Repository unchanged since last index.');
      console.log('Using cached index (run with --force to re-index)\n');

      // Load and display cached index
      if (fs.existsSync(config.outputFile)) {
        const cachedIndex = JSON.parse(fs.readFileSync(config.outputFile, 'utf-8'));
        const remoteEntries = cachedIndex.filter(e => e.source?.repository === repoName);
        console.log(`Cached entries: ${remoteEntries.length} files from ${repoName}`);
        console.log(`Output: ${config.outputFile}`);
        return;
      }
    }

    const useCache = state.repositories[repoKey].lastCommitSha === latestCommit.sha;
    if (useCache) {
      console.log('Repository unchanged, using cached entries.\n');
    }

    // Fetch file tree (skip if using cache)
    let index = [];
    let mdFiles = [];

    if (!useCache) {
      console.log('Fetching file tree...');
      let tree;
      if (config.provider === 'github') {
        tree = await client.getTree(
          config.repository.owner,
          config.repository.repo,
          config.branch
        );
      } else {
        tree = await client.getTree(
          config.repository.projectId,
          config.branch,
          config.pathFilter || ''
        );
      }

      // Filter by path for GitHub (GitLab does it server-side)
      mdFiles = tree;
      if (config.provider === 'github' && config.pathFilter) {
        mdFiles = tree.filter(f => f.path.startsWith(config.pathFilter));
      }

      console.log(`Found ${mdFiles.length} markdown files\n`);

      if (mdFiles.length === 0) {
        console.log('No markdown files found. Nothing to index.');
        if (!config.merge) return;
      } else {
        // Process files with progress indication
        const previousFiles = state.repositories[repoKey].files || {};
        const showProgress = mdFiles.length > 20;

        for (let i = 0; i < mdFiles.length; i++) {
          const file = mdFiles[i];

          // Show progress for large repos
          if (showProgress && i % 10 === 0) {
            console.log(`Processing... ${i}/${mdFiles.length}`);
          }
	  console.log(`Processing file: ${file.path}`);

          // Check if file SHA changed (skip unchanged)
          if (previousFiles[file.path]?.sha === file.sha || previousFiles[file.path]?.sha === file.id) {
            const existingEntry = loadExistingEntry(config.outputFile, file.path);
            if (existingEntry) {
              index.push(existingEntry);
              continue;
            }
          }

          // Fetch and index new/changed file
          try {
            let content;
            if (config.provider === 'github') {
              content = await client.getBlob(
                config.repository.owner,
                config.repository.repo,
                file.sha
              );
            } else {
              content = await client.getFileRaw(
                config.repository.projectId,
                file.path,
                config.branch
              );
            }

            const sourceMetadata = {
              type: config.provider,
              repository: repoName,
              branch: config.branch,
              path: file.path,
              url: buildFileUrl(config.provider, config.repository, config.branch, file.path),
              commitSha: file.sha || file.id
            };

            // Add hostname for GitLab (especially for private instances)
            if (config.provider === 'gitlab' && config.repository.hostname) {
              sourceMetadata.hostname = config.repository.hostname;
            }

            const entry = indexMarkdownContent(content, {
              filename: file.path.replace(/\.md$/i, '').replace(/\\/g, '/'),
              source: sourceMetadata
            });

            index.push(entry);

            // Update state tracking
            state.repositories[repoKey].files[file.path] = {
              sha: file.sha || file.id
            };
          } catch (error) {
            console.error(`Warning: Failed to index ${file.path}: ${error.message}`);
          }
        }

        if (showProgress) {
          console.log(`Processing... ${mdFiles.length}/${mdFiles.length}`);
        }
      }
    } else {
      // Load from cached remote index
      const remoteIndexPath = 'public/search-index-remote.json';
      if (fs.existsSync(remoteIndexPath)) {
        const cachedIndex = JSON.parse(fs.readFileSync(remoteIndexPath, 'utf-8'));
        const remoteEntries = cachedIndex.filter(e =>
          e.source?.type === config.provider &&
          e.source?.repository === repoName &&
          e.source?.branch === config.branch
        );
        console.log(`Loaded ${remoteEntries.length} cached entries from ${repoName}\n`);
        index = remoteEntries;
      }
    }

    // Merge with local index if requested
    if (config.merge) {
      const localIndexPath = 'public/search-index.json';
      try {
        if (fs.existsSync(localIndexPath)) {
          const localIndex = JSON.parse(fs.readFileSync(localIndexPath, 'utf-8'));
          const localEntries = localIndex.filter(entry => !entry.source);
          console.log(`\nMerging with local index (${localEntries.length} files)`);
          index.push(...localEntries);
        } else {
          console.log(`\nWarning: No local index found at ${localIndexPath}`);
        }
      } catch (error) {
        console.error(`Warning: Failed to merge local index: ${error.message}`);
      }
    }

    // Save index
    console.log(`\nSaving index...`);
    ensureDirectoryExists(path.dirname(config.outputFile));
    fs.writeFileSync(config.outputFile, JSON.stringify(index, null, 2));

    // Update state
    state.repositories[repoKey].lastCommitSha = latestCommit.sha;
    state.repositories[repoKey].lastIndexed = new Date().toISOString();
    state.repositories[repoKey].fileCount = mdFiles.length;
    saveRemoteState(state);

    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Indexed ${mdFiles.length} files from ${repoName}`);
    if (config.merge) {
      console.log(`Total entries: ${index.length} (remote + local)`);
    }
    console.log(`Output: ${config.outputFile}`);
    console.log(`${'='.repeat(50)}`);

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = { main };
