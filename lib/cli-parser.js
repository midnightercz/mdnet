/**
 * Parse and validate command line arguments for build-index-remote.js
 */

/**
 * Display help text and exit
 */
function showHelp() {
  console.log(`
Usage: node build-index-remote.js <provider> <repo> [options]

Arguments:
  provider            'github' or 'gitlab'
  repo                Repository identifier:
                      - GitHub: owner/repo or https://github.com/owner/repo
                      - GitLab: project-id, group/project, or full URL
                                (use full URL for private GitLab instances)

Options:
  --branch <name>     Branch or tag name (default: main)
  --path <dir>        Filter to subdirectory (e.g., docs/)
  --output <file>     Output file path (default: public/search-index-remote.json)
  --token <token>     Auth token (or use GITHUB_TOKEN/GITLAB_TOKEN env var)
  --merge             Merge with local index from public/search-index.json
  --help              Show this help message

Examples:
  # GitHub repository
  node build-index-remote.js github microsoft/vscode-docs

  # GitHub with branch and auth
  export GITHUB_TOKEN=ghp_xxxxx
  node build-index-remote.js github owner/repo --branch develop

  # GitLab with subdirectory filter
  export GITLAB_TOKEN=glpat-xxxxx
  node build-index-remote.js gitlab gitlab-org/gitlab --path doc/

  # Merge with local index
  node build-index-remote.js github owner/repo --merge --output public/search-index.json

  # GitLab project ID
  node build-index-remote.js gitlab 12345

  # Full URLs
  node build-index-remote.js github https://github.com/owner/repo
  node build-index-remote.js gitlab https://gitlab.com/group/project

  # Private GitLab instance
  export GITLAB_TOKEN=glpat-xxxxx
  node build-index-remote.js gitlab https://gitlab.mycompany.com/team/project

Environment Variables:
  GITHUB_TOKEN        GitHub personal access token
  GITLAB_TOKEN        GitLab personal access token
`);
  process.exit(0);
}

/**
 * Parse GitHub repository from string
 * @param {string} repo - Repository string (owner/repo or URL)
 * @returns {{owner: string, repo: string}}
 */
function parseGitHubRepo(repo) {
  // Handle full URLs
  if (repo.startsWith('http://') || repo.startsWith('https://')) {
    const url = new URL(repo);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length < 2) {
      throw new Error(`Invalid GitHub URL: ${repo}\nExpected format: https://github.com/owner/repo`);
    }

    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, '')
    };
  }

  // Handle owner/repo format
  const parts = repo.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid GitHub repository: ${repo}\nExpected format: owner/repo`);
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

/**
 * Parse GitLab project from string
 * @param {string} project - Project string (ID, path, or URL)
 * @returns {{projectId: string, hostname?: string}}
 */
function parseGitLabProject(project) {
  // Handle full URLs
  if (project.startsWith('http://') || project.startsWith('https://')) {
    const url = new URL(project);
    const pathname = url.pathname.split('/').filter(Boolean).join('/');

    if (!pathname) {
      throw new Error(`Invalid GitLab URL: ${project}\nExpected format: https://gitlab.example.com/group/project`);
    }

    // Extract hostname for private GitLab instances
    const hostname = `${url.protocol}//${url.host}`;

    // URL-encode the path for GitLab API
    return {
      projectId: pathname,
      hostname: hostname
    };
  }

  // Project ID (numeric) or path (group/project)
  // No hostname means use default gitlab.com
  return {
    projectId: project
  };
}

/**
 * Parse command line arguments
 * @param {string[]} argv - Process arguments (process.argv)
 * @returns {object} Parsed configuration
 */
function parseArguments(argv) {
  // Remove node and script name
  const args = argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
  }

  // Need at least provider and repo
  if (args.length < 2) {
    console.error('Error: Missing required arguments\n');
    showHelp();
  }

  const provider = args[0].toLowerCase();
  const repoArg = args[1];

  // Validate provider
  if (provider !== 'github' && provider !== 'gitlab') {
    throw new Error(`Invalid provider: ${provider}\nMust be 'github' or 'gitlab'`);
  }

  // Parse repository
  let repository;
  try {
    if (provider === 'github') {
      repository = parseGitHubRepo(repoArg);
    } else {
      repository = parseGitLabProject(repoArg);
    }
  } catch (error) {
    throw new Error(`Failed to parse repository: ${error.message}`);
  }

  // Parse options
  const config = {
    provider,
    repository,
    branch: 'main',
    pathFilter: null,
    outputFile: 'public/search-index-remote.json',
    token: null,
    merge: false,
    force: false
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--branch':
        if (i + 1 >= args.length) {
          throw new Error('--branch requires a value');
        }
        config.branch = args[++i];
        break;

      case '--path':
        if (i + 1 >= args.length) {
          throw new Error('--path requires a value');
        }
        config.pathFilter = args[++i];
        break;

      case '--output':
        if (i + 1 >= args.length) {
          throw new Error('--output requires a value');
        }
        config.outputFile = args[++i];
        break;

      case '--token':
        if (i + 1 >= args.length) {
          throw new Error('--token requires a value');
        }
        config.token = args[++i];
        break;

      case '--merge':
        config.merge = true;
        break;

      case '--force':
        config.force = true;
        break;

      default:
        // Ignore unknown flags (already processed as values)
        if (arg.startsWith('--')) {
          console.warn(`Warning: Unknown option: ${arg}`);
        }
    }
  }

  // Get token from environment if not provided
  if (!config.token) {
    if (provider === 'github') {
      config.token = process.env.GITHUB_TOKEN;
    } else {
      config.token = process.env.GITLAB_TOKEN;
    }
  }

  // Token is optional for public repos, but warn if missing
  if (!config.token) {
    console.warn(`Warning: No authentication token provided. Rate limits will be lower.`);
    console.warn(`Set ${provider === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN'} environment variable or use --token\n`);
  }

  return config;
}

module.exports = {
  parseArguments,
  showHelp
};
