const yaml = require('js-yaml');

/**
 * Parse front matter from markdown content
 * @param {string} content - The markdown content with optional front matter
 * @returns {{ frontMatter: object|null, content: string }}
 */
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

/**
 * Extract title from front matter or content
 * @param {object|null} frontMatter - Parsed front matter
 * @param {string} content - Markdown content
 * @returns {string} The extracted title or 'Untitled'
 */
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

/**
 * Extract all headings from markdown content
 * @param {string} content - Markdown content
 * @returns {Array<{level: number, text: string}>}
 */
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

/**
 * Extract tags from text (#tag format)
 * @param {string} content - Markdown content
 * @returns {string[]} Array of tags
 */
function extractTextTags(content) {
  const tags = new Set();
  const tagRegex = /#([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Extract tags from front matter
 * @param {object|null} frontMatter - Parsed front matter
 * @returns {string[]} Array of tags
 */
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

/**
 * Extract wiki links from content
 * @param {string} content - Markdown content
 * @returns {string[]} Array of wiki link targets
 */
function extractLinks(content) {
  const links = new Set();
  const wikiLinkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.add(match[1].trim());
  }

  return Array.from(links);
}

/**
 * Normalize front matter properties for indexing
 * @param {object|null} frontMatter - Parsed front matter
 * @returns {object} Normalized properties
 */
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

/**
 * Index markdown content from a string
 * @param {string} content - Raw markdown content
 * @param {object} metadata - Metadata about the file
 * @param {string} metadata.filename - Filename without .md extension
 * @param {object} [metadata.source] - Source information for remote files
 * @returns {object} Index entry
 */
function indexMarkdownContent(content, metadata) {
  const { frontMatter, content: markdownContent } = parseFrontMatter(content);

  const title = extractTitle(frontMatter, markdownContent);
  const headings = extractHeadings(markdownContent);
  const textTags = extractTextTags(markdownContent);
  const fmTags = extractFrontMatterTags(frontMatter);
  const tags = [...new Set([...textTags, ...fmTags])];
  const links = extractLinks(markdownContent);
  const properties = normalizeFrontMatterProperties(frontMatter);

  const entry = {
    filename: metadata.filename,
    title,
    headings,
    tags,
    links,
    properties,
    indexedAt: new Date().toISOString()
  };

  // Add source metadata if provided (for remote files)
  if (metadata.source) {
    entry.source = metadata.source;
  }

  return entry;
}

module.exports = {
  parseFrontMatter,
  extractTitle,
  extractHeadings,
  extractTextTags,
  extractFrontMatterTags,
  extractLinks,
  normalizeFrontMatterProperties,
  indexMarkdownContent
};
