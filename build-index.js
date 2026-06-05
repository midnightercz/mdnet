const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Default paths (can be overridden via CLI arguments)
const DEFAULT_CONTENT_DIR = process.env.CONTENT_DIR || path.join(__dirname, 'content');
const DEFAULT_INDEX_FILE = path.join(__dirname, 'public', 'search-index.json');
const DEFAULT_STATE_FILE = path.join(__dirname, '.index-state.json');

/**
 * Display help text and exit
 */
function showHelp() {
  console.log(`
Usage: node build-index.js [options]

Options:
  --input <dir>       Input directory containing markdown files (default: content/)
  --output <file>     Output file path for search index (default: public/search-index.json)
  --state <file>      State file path for incremental indexing (default: .index-state.json)
  --base-path <path>  Base path to strip from generated filenames
  --help              Show this help message

Examples:
  # Use defaults (content/ -> public/search-index.json)
  node build-index.js

  # Custom input directory
  node build-index.js --input docs/

  # Custom output file
  node build-index.js --output dist/search-index.json

  # Custom input and output with base path stripping
  node build-index.js --input content/test --base-path content

Environment Variables:
  CONTENT_DIR         Default input directory (overridden by --input)
`);
  process.exit(0);
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

  const config = {
    contentDir: DEFAULT_CONTENT_DIR,
    indexFile: DEFAULT_INDEX_FILE,
    stateFile: DEFAULT_STATE_FILE,
    basePath: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--input':
        if (i + 1 >= args.length) {
          throw new Error('--input requires a directory path');
        }
        config.contentDir = path.resolve(args[++i]);
        break;

      case '--output':
        if (i + 1 >= args.length) {
          throw new Error('--output requires a file path');
        }
        config.indexFile = path.resolve(args[++i]);
        break;

      case '--state':
        if (i + 1 >= args.length) {
          throw new Error('--state requires a file path');
        }
        config.stateFile = path.resolve(args[++i]);
        break;

      case '--base-path':
        if (i + 1 >= args.length) {
          throw new Error('--base-path requires a path');
        }
        config.basePath = args[++i];
        break;

      default:
        if (arg.startsWith('--')) {
          console.warn(`Warning: Unknown option: ${arg}`);
        }
    }
  }

  return config;
}

// Load previous index state
function loadState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch (e) {
    return { indexed: {} };
  }
}

// Save index state
function saveState(state, stateFile) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// Parse front matter from markdown
function parseFrontMatter(content) {
  const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontMatterRegex);

  if (match) {
    try {
      const frontMatter = yaml.load(match[1]);
      return { frontMatter, content: match[2] };
    } catch (e) {
      return { frontMatter: null, content };
    }
  }

  return { frontMatter: null, content };
}

// Extract title from content
function extractTitle(frontMatter, content) {
  // Try front matter title first
  if (frontMatter?.title) {
    return frontMatter.title;
  }

  // Try first H1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return 'Untitled';
}

// Extract all headings
function extractHeadings(content) {
  const headings = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim()
    });
  }

  return headings;
}

// Extract tags from text (#tag format)
function extractTextTags(content) {
  const tags = new Set();
  const tagRegex = /#([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

// Extract tags from front matter
function extractFrontMatterTags(frontMatter) {
  const mdTags = frontMatter?.['md-tags'];
  if (!mdTags) return [];

  if (typeof mdTags === 'string') {
    return mdTags.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (Array.isArray(mdTags)) {
    return mdTags;
  }

  return [];
}

// Extract wiki links
function extractLinks(content) {
  const links = new Set();
  const wikiLinkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.add(match[1].trim());
  }

  return Array.from(links);
}

// Normalize front matter properties for indexing
function normalizeFrontMatterProperties(frontMatter) {
  if (!frontMatter) return {};

  const normalized = {};

  for (const [key, value] of Object.entries(frontMatter)) {
    // Skip md-specific properties that are already indexed separately
    if (key === 'md-tags') continue;

    // Convert arrays to arrays, everything else to strings
    if (Array.isArray(value)) {
      normalized[key] = value.map(v => String(v));
    } else if (typeof value === 'object' && value !== null) {
      normalized[key] = JSON.stringify(value);
    } else {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

// Recursively find all markdown files in a directory
function findMarkdownFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip hidden files and directories (starting with .)
    if (entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip common non-content directories
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
        continue;
      }
      // Recursively search subdirectories
      results.push(...findMarkdownFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      // Only index files with .md extension (case-insensitive)
      const lowerName = entry.name.toLowerCase();
      if (lowerName.endsWith('.md') && !lowerName.endsWith('.bak.md')) {
        // Store relative path from base directory
        const relativePath = path.relative(baseDir, fullPath);
        results.push(relativePath);
      }
    }
  }

  return results;
}

// Index a single file
function indexFile(relativePath, filePath, timestamp, basePath = null) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontMatter, content: markdownContent } = parseFrontMatter(content);

  const title = extractTitle(frontMatter, markdownContent);
  const headings = extractHeadings(markdownContent);
  const textTags = extractTextTags(markdownContent);
  const fmTags = extractFrontMatterTags(frontMatter);
  const tags = [...new Set([...textTags, ...fmTags])];
  const links = extractLinks(markdownContent);
  const properties = normalizeFrontMatterProperties(frontMatter);

  // Use relative path without .md extension as filename
  // This preserves subdirectory structure (e.g., "guides/intro")
  // Case-insensitive to handle .MD, .Md, etc.
  let filename = relativePath.replace(/\.md$/i, '').replace(/\\/g, '/');

  // Strip base path if provided
  if (basePath) {
    const normalizedBasePath = basePath.replace(/\\/g, '/').replace(/\/$/, '');
    if (filename.startsWith(normalizedBasePath + '/')) {
      filename = filename.substring(normalizedBasePath.length + 1);
    } else if (filename === normalizedBasePath) {
      filename = '';
    }
  }

  return {
    filename,
    title,
    headings,
    tags,
    links,
    properties,
    indexedAt: timestamp
  };
}

// Build the search index
function buildIndex(config = {}) {
  // Use provided config or defaults
  const contentDir = config.contentDir || DEFAULT_CONTENT_DIR;
  const outputFile = config.indexFile || DEFAULT_INDEX_FILE;
  const stateFile = config.stateFile || DEFAULT_STATE_FILE;
  const basePath = config.basePath || null;

  const state = loadState(stateFile);
  const index = [];
  const indexTimestamp = new Date().toISOString();

  // Recursively find all markdown files
  const files = findMarkdownFiles(contentDir);

  console.log(`Found ${files.length} markdown files`);

  for (const relativePath of files) {
    const filePath = path.join(contentDir, relativePath);
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;

    const lastIndexed = state.indexed[relativePath];

    // Re-index if file is new or modified
    if (!lastIndexed || lastIndexed < mtime) {
      console.log(`Indexing: ${relativePath}`);
      const indexed = indexFile(relativePath, filePath, indexTimestamp, basePath);
      index.push(indexed);
      state.indexed[relativePath] = mtime;
    } else {
      console.log(`Skipping (unchanged): ${relativePath}`);
      // Load from existing index if available
      try {
        const existingIndex = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        const filenameKey = relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
        const existing = existingIndex.find(item => item.filename === filenameKey);
        if (existing) {
          // Keep existing entry but update timestamp if it doesn't have one
          if (!existing.indexedAt) {
            existing.indexedAt = indexTimestamp;
          }
          index.push(existing);
        } else {
          // File exists in state but not in index, re-index
          const indexed = indexFile(relativePath, filePath, indexTimestamp, basePath);
          index.push(indexed);
          state.indexed[relativePath] = mtime;
        }
      } catch (e) {
        // No existing index, re-index
        const indexed = indexFile(relativePath, filePath, indexTimestamp, basePath);
        index.push(indexed);
        state.indexed[relativePath] = mtime;
      }
    }
  }

  // Remove deleted files from state
  for (const file in state.indexed) {
    if (!files.includes(file)) {
      console.log(`Removing deleted file from index: ${file}`);
      delete state.indexed[file];
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(path.dirname(outputFile))) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  }

  // Save index
  fs.writeFileSync(outputFile, JSON.stringify(index, null, 2));
  console.log(`\nIndex saved to ${outputFile}`);
  console.log(`Total indexed pages: ${index.length}`);

  // Save state
  saveState(state, stateFile);
}

// Run the indexer
if (require.main === module) {
  try {
    const config = parseArguments(process.argv);
    buildIndex(config);
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { buildIndex };
