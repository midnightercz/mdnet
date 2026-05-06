const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONTENT_DIR = process.env.CONTENT_DIR || path.join(__dirname, 'content');
const INDEX_FILE = path.join(__dirname, 'public', 'search-index.json');
const STATE_FILE = path.join(__dirname, '.index-state.json');

// Load previous index state
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    return { indexed: {} };
  }
}

// Save index state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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

// Index a single file
function indexFile(filename, filePath, timestamp) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontMatter, content: markdownContent } = parseFrontMatter(content);

  const title = extractTitle(frontMatter, markdownContent);
  const headings = extractHeadings(markdownContent);
  const textTags = extractTextTags(markdownContent);
  const fmTags = extractFrontMatterTags(frontMatter);
  const tags = [...new Set([...textTags, ...fmTags])];
  const links = extractLinks(markdownContent);
  const properties = normalizeFrontMatterProperties(frontMatter);

  return {
    filename: filename.replace('.md', ''),
    title,
    headings,
    tags,
    links,
    properties,
    indexedAt: timestamp
  };
}

// Build the search index
function buildIndex() {
  const state = loadState();
  const index = [];
  const indexTimestamp = new Date().toISOString();
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

  console.log(`Found ${files.length} markdown files`);

  for (const file of files) {
    const filePath = path.join(CONTENT_DIR, file);
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;

    const lastIndexed = state.indexed[file];

    // Re-index if file is new or modified
    if (!lastIndexed || lastIndexed < mtime) {
      console.log(`Indexing: ${file}`);
      const indexed = indexFile(file, filePath, indexTimestamp);
      index.push(indexed);
      state.indexed[file] = mtime;
    } else {
      console.log(`Skipping (unchanged): ${file}`);
      // Load from existing index if available
      try {
        const existingIndex = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        const existing = existingIndex.find(item => item.filename === file.replace('.md', ''));
        if (existing) {
          // Keep existing entry but update timestamp if it doesn't have one
          if (!existing.indexedAt) {
            existing.indexedAt = indexTimestamp;
          }
          index.push(existing);
        } else {
          // File exists in state but not in index, re-index
          const indexed = indexFile(file, filePath, indexTimestamp);
          index.push(indexed);
          state.indexed[file] = mtime;
        }
      } catch (e) {
        // No existing index, re-index
        const indexed = indexFile(file, filePath, indexTimestamp);
        index.push(indexed);
        state.indexed[file] = mtime;
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

  // Ensure public directory exists
  if (!fs.existsSync(path.dirname(INDEX_FILE))) {
    fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  }

  // Save index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nIndex saved to ${INDEX_FILE}`);
  console.log(`Total indexed pages: ${index.length}`);

  // Save state
  saveState(state);
}

// Run the indexer
if (require.main === module) {
  buildIndex();
}

// Export for programmatic use
module.exports = { buildIndex };
