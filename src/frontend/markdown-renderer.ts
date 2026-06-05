import MarkdownIt from 'markdown-it';
import * as yaml from 'js-yaml';
import markdownItAnchor from 'markdown-it-anchor';

// Create markdown-it instance
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

// Helper function to check if URL can be converted to local link
function tryConvertUrlToLocal(url: string, env: any): string | null {
  if (!env.sources || !env.searchIndex) {
    return null;
  }

  // Extract path from URL if it's an absolute URL
  let urlPath = url;
  try {
    // If it looks like an absolute URL, parse it
    if (url.match(/^https?:\/\//)) {
      const urlObj = new URL(url);
      urlPath = urlObj.pathname;
    } else if (url.startsWith('//')) {
      const urlObj = new URL('https:' + url);
      urlPath = urlObj.pathname;
    }
  } catch (e) {
    // If URL parsing fails, use the original URL
    urlPath = url;
  }

  // Try each source
  for (const source of env.sources) {
    let baseUrl = source.contentBaseUrl;

    // If baseUrl is absolute, extract path
    try {
      if (baseUrl.match(/^https?:\/\//)) {
        const baseUrlObj = new URL(baseUrl);
        baseUrl = baseUrlObj.pathname;
      } else if (baseUrl.startsWith('//')) {
        const baseUrlObj = new URL('https:' + baseUrl);
        baseUrl = baseUrlObj.pathname;
      }
    } catch (e) {
      // Keep original baseUrl if parsing fails
    }

    // Ensure baseUrl ends with /
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    if (urlPath.startsWith(baseUrl)) {
      // Extract the filename part
      let filename = urlPath.substring(baseUrl.length);

      // Remove .md extension if present
      if (filename.endsWith('.md')) {
        filename = filename.substring(0, filename.length - 3);
      }

      // Remove any query string or hash
      const queryIndex = filename.indexOf('?');
      if (queryIndex !== -1) {
        filename = filename.substring(0, queryIndex);
      }
      const hashIndex = filename.indexOf('#');
      if (hashIndex !== -1) {
        filename = filename.substring(0, hashIndex);
      }

      // Check if this page exists in the search index for this source
      const pageExists = env.searchIndex.some((item: any) =>
        item.filename === filename && item._source === source.name
      );

      if (pageExists) {
        // Convert to local link
        return `#/${encodeURIComponent(source.name)}/${encodeURIComponent(filename)}`;
      }
    }
  }

  return null;
}

// Obsidian Wiki-Links and Hashtags Plugin
// Converts [[Page Name]] to links
// Converts #tag to clickable tag links
function wikiLinksPlugin(md: MarkdownIt) {
  // Pattern for hashtags (word boundary before, alphanumeric/underscore/dash after)
  const hashtagPattern = /(?:^|[^a-zA-Z0-9_-])#([a-zA-Z0-9_-]+)/g;

  // Inline rule for wiki-links - runs before linkify
  function wikiLinkRule(state: any, silent: boolean) {
    const max = state.posMax;
    const start = state.pos;

    // Check if we're at [[
    if (state.src.charCodeAt(start) !== 0x5B /* [ */ ||
        state.src.charCodeAt(start + 1) !== 0x5B /* [ */) {
      return false;
    }

    // Find the closing ]]
    let pos = start + 2;
    let foundEnd = false;

    while (pos < max - 1) {
      if (state.src.charCodeAt(pos) === 0x5D /* ] */ &&
          state.src.charCodeAt(pos + 1) === 0x5D /* ] */) {
        foundEnd = true;
        break;
      }
      pos++;
    }

    if (!foundEnd) {
      return false;
    }

    // Extract content between [[ and ]]
    const content = state.src.slice(start + 2, pos);

    // Split by | to get target and optional display text
    const pipeIndex = content.indexOf('|');
    let linkTarget: string;
    let linkText: string;

    if (pipeIndex !== -1) {
      linkTarget = content.slice(0, pipeIndex).trim();
      linkText = content.slice(pipeIndex + 1).trim();
    } else {
      linkTarget = content.trim();
      linkText = linkTarget;
    }

    if (!silent) {
      const token = state.push('wiki_link', '', 0);
      token.meta = { target: linkTarget, text: linkText };
      token.markup = '[[';
    }

    state.pos = pos + 2;
    return true;
  }

  // Register the inline rule before linkify
  md.inline.ruler.before('linkify', 'wiki_link', wikiLinkRule);

  // Renderer for wiki-links - treat as normal internal links (no URL conversion)
  md.renderer.rules.wiki_link = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const { target, text } = token.meta;

    // Treat as regular wiki link - Include source in URL: #/source/page
    const source = env.currentSource || 'Local';
    return `<a href="#/${encodeURIComponent(source)}/${encodeURIComponent(target)}" class="wiki-link">${md.utils.escapeHtml(text)}</a>`;
  };

  // Keep text rule for hashtags only
  const defaultRender = md.renderer.rules.text || ((tokens, idx) => tokens[idx].content);

  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    let content = tokens[idx].content;

    // Replace hashtag patterns
    content = content.replace(hashtagPattern, (match, tag) => {
      // Check if we're at the start of the string or after whitespace/punctuation
      const prefix = match[0] === '#' ? '' : match[0];
      return `${prefix}<a href="#" class="hashtag-link" data-tag="${tag}">#${tag}</a>`;
    });

    return content;
  };
}

// Anchor Links Plugin
// Converts relative anchor links (#anchor) to absolute paths (/#/page#anchor)
// Also converts relative .md links to hash-based routes
function anchorLinksPlugin(md: MarkdownIt) {
  const defaultLinkOpenRender = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => {
    return self.renderToken(tokens, idx, options);
  });

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');

    if (hrefIndex >= 0) {
      const href = token.attrs![hrefIndex][1];

      // Check if this is an anchor-only link (starts with #)
      if (href.startsWith('#') && env.currentPage && env.currentSource) {
        // Convert to absolute path: /#/source/currentpage#anchor
        const newHref = `#/${encodeURIComponent(env.currentSource)}/${env.currentPage}${href}`;
        token.attrs![hrefIndex][1] = newHref;
      }
      // Check if this is an absolute URL that can be converted to local link
      else if ((href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//'))) {
        const localUrl = tryConvertUrlToLocal(href, env);
        if (localUrl) {
          token.attrs![hrefIndex][1] = localUrl;
        }
        // Otherwise leave as external URL
      }
      // Check if this is a relative .md link
      else if (href.endsWith('.md') && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
        // Remove .md extension
        let targetPath = href.replace(/\.md$/, '');

        // If we have a current page, resolve relative path
        if (env.currentPage) {
          // Get directory of current page
          const currentDir = env.currentPage.includes('/')
            ? env.currentPage.substring(0, env.currentPage.lastIndexOf('/'))
            : '';

          // Resolve relative path
          if (targetPath.startsWith('./')) {
            // ./file.md → same directory
            targetPath = targetPath.substring(2);
            targetPath = currentDir ? `${currentDir}/${targetPath}` : targetPath;
          } else if (targetPath.startsWith('../')) {
            // ../file.md → parent directory
            let path = targetPath;
            let dir = currentDir.split('/');

            while (path.startsWith('../')) {
              path = path.substring(3);
              dir.pop();
            }

            targetPath = dir.length > 0 ? `${dir.join('/')}/${path}` : path;
          } else if (!targetPath.includes('/')) {
            // file.md (no slash) → same directory as current page
            targetPath = currentDir ? `${currentDir}/${targetPath}` : targetPath;
          }
          // else: absolute path like infra/file.md → keep as is
        }

        // Convert to hash-based route with source
        const source = env.currentSource || 'Local';
        const newHref = `#/${encodeURIComponent(source)}/${targetPath}`;
        token.attrs![hrefIndex][1] = newHref;
      }
    }

    return defaultLinkOpenRender(tokens, idx, options, env, self);
  };
}

// Custom Plugin Blocks Plugin
// Detects ```pluginname blocks and wraps them in special containers
function customPluginBlocksPlugin(md: MarkdownIt) {
  const defaultFenceRender = md.renderer.rules.fence || ((tokens, idx, options, env, self) => {
    return self.renderToken(tokens, idx, options);
  });

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const langName = token.info.trim();

    // Check if this is a custom plugin block (not a standard language)
    const standardLanguages = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'css', 'html', 'json', 'xml', 'yaml', 'bash', 'sh'];

    if (langName && !standardLanguages.includes(langName.toLowerCase())) {
      // This is a custom plugin block
      const content = token.content;

      // Generate unique block ID
      const blockId = `plugin-block-${Math.random().toString(36).substr(2, 9)}`;

      // Check if a plugin is available for this language
      const hasPlugin = (window as any).pluginManager?.hasPluginForLanguage(langName) || false;

      return `<div class="plugin-block"
                   data-plugin="${langName}"
                   data-block-id="${blockId}"
                   data-content="${md.utils.escapeHtml(content)}"
                   data-has-plugin="${hasPlugin}">
  <div class="plugin-header">
    <span class="plugin-name">Plugin: ${langName}</span>
    ${hasPlugin ? '<span class="plugin-status">●</span>' : '<span class="plugin-status-disabled">○</span>'}
  </div>
  <div class="plugin-render-area" id="${blockId}">
    <pre class="plugin-content">${md.utils.escapeHtml(content)}</pre>
  </div>
</div>`;
    }

    // Standard code block
    return defaultFenceRender(tokens, idx, options, env, self);
  };
}

// Private Image Plugin
// Converts private GitHub images to data URLs
function privateImagePlugin(md: MarkdownIt) {
  const defaultImageRender = md.renderer.rules.image || ((tokens, idx, options, env, self) => {
    return self.renderToken(tokens, idx, options);
  });

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');

    if (srcIndex >= 0 && env.privateImages) {
      const src = token.attrs![srcIndex][1];

      // Check if we have a data URL for this image
      if (env.privateImages[src]) {
        // Replace src with data URL
        token.attrs![srcIndex][1] = env.privateImages[src];
      }
    }

    return defaultImageRender(tokens, idx, options, env, self);
  };
}

// Register plugins
md.use(markdownItAnchor, {
  permalink: false,
  slugify: (s: string) => s.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
});
md.use(wikiLinksPlugin);
md.use(anchorLinksPlugin);
md.use(privateImagePlugin);
md.use(customPluginBlocksPlugin);

// Parse front matter from markdown content
interface FrontMatterResult {
  frontMatter: Record<string, any> | null;
  content: string;
}

function parseFrontMatter(text: string): FrontMatterResult {
  const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = text.match(frontMatterRegex);

  if (match) {
    try {
      const frontMatter = yaml.load(match[1]) as Record<string, any>;
      const content = match[2];
      return { frontMatter, content };
    } catch (e) {
      console.error('Failed to parse front matter:', e);
      return { frontMatter: null, content: text };
    }
  }

  return { frontMatter: null, content: text };
}

// Render front matter as a collapsible table
function renderFrontMatterTable(frontMatter: Record<string, any>): string {
  const rows = Object.entries(frontMatter)
    .map(([key, value]) => {
      const displayValue = Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
      return `<tr><td class="fm-key">${md.utils.escapeHtml(key)}</td><td class="fm-value">${md.utils.escapeHtml(displayValue)}</td></tr>`;
    })
    .join('');

  return `<details class="front-matter">
  <summary>Properties</summary>
  <table class="fm-table">
    <tbody>
      ${rows}
    </tbody>
  </table>
</details>`;
}

// Parse column markers from content
interface ColumnContent {
  [columnName: string]: string;
}

interface ParseColumnsResult {
  columns: ColumnContent;
  hasColumns: boolean;
  beforeContent: string;
  afterContent: string;
}

// Parse aside markers from content
interface ParseAsidesResult {
  hasAsides: boolean;
}

// Extract code blocks and replace with placeholders
function maskCodeBlocks(content: string): { masked: string; blocks: string[] } {
  const blocks: string[] = [];
  let masked = content;

  // Match fenced code blocks (``` or ~~~)
  const fencedRegex = /^(```|~~~)[\s\S]*?\n\1\s*$/gm;
  masked = masked.replace(fencedRegex, (match) => {
    const index = blocks.length;
    blocks.push(match);
    return `___CODE_BLOCK_${index}___`;
  });

  // Match indented code blocks (4 spaces or 1 tab)
  const indentedRegex = /^([ ]{4}|\t).*$/gm;
  masked = masked.replace(indentedRegex, (match) => {
    const index = blocks.length;
    blocks.push(match);
    return `___CODE_BLOCK_${index}___`;
  });

  return { masked, blocks };
}

// Restore code blocks from placeholders
function unmaskCodeBlocks(content: string, blocks: string[]): string {
  let restored = content;
  blocks.forEach((block, index) => {
    restored = restored.replace(`___CODE_BLOCK_${index}___`, block);
  });
  return restored;
}

function parseColumns(content: string): ParseColumnsResult {
  // This function now just checks if there are any column markers
  // The actual rendering with multiple sections is handled in renderWithLayout
  const { masked, blocks } = maskCodeBlocks(content);

  // Check for layout boundaries
  const layoutStartRegex = /^::md-layout:columns\s*$/gm;
  const startMatches = [...masked.matchAll(layoutStartRegex)];

  if (startMatches.length === 0) {
    return { columns: {}, hasColumns: false, beforeContent: '', afterContent: '' };
  }

  // For now, return hasColumns true - rendering will handle multiple sections
  return { columns: {}, hasColumns: true, beforeContent: '', afterContent: '' };
}

function parseAsides(content: string): ParseAsidesResult {
  // Check if there are any aside markers
  const { masked } = maskCodeBlocks(content);

  // Check for aside boundaries
  const asideStartRegex = /^::md-aside\s*$/gm;
  const asideEndRegex = /^::md-aside-end\s*$/gm;

  const startMatches = [...masked.matchAll(asideStartRegex)];
  const endMatches = [...masked.matchAll(asideEndRegex)];

  // Only return true if we have matching pairs
  if (startMatches.length === 0 || startMatches.length !== endMatches.length) {
    if (startMatches.length > 0 && startMatches.length !== endMatches.length) {
      console.warn('[parseAsides] Mismatched aside markers! Found', startMatches.length, 'start and', endMatches.length, 'end markers');
    }
    return { hasAsides: false };
  }

  return { hasAsides: true };
}

// Render content with asides
function renderWithAsides(content: string, env: any): string {
  console.log('[renderWithAsides] Starting render with asides...');

  // Mask code blocks first
  const { masked, blocks } = maskCodeBlocks(content);

  // Find all aside section boundaries
  const asideStartRegex = /^::md-aside\s*$/gm;
  const asideEndRegex = /^::md-aside-end\s*$/gm;

  const startMatches = [...masked.matchAll(asideStartRegex)];
  const endMatches = [...masked.matchAll(asideEndRegex)];

  console.log('[renderWithAsides] Found', startMatches.length, 'aside pairs');

  // If mismatched, skip rendering asides
  if (startMatches.length !== endMatches.length) {
    console.warn('[renderWithAsides] Mismatched aside markers! Falling back to simple render');
    return md.render(content, env);
  }

  // Build sections array: [content, type] where type is 'main' or 'aside'
  const sections: Array<{ content: string; type: 'main' | 'aside' }> = [];
  let lastIndex = 0;

  for (let i = 0; i < startMatches.length; i++) {
    const startMatch = startMatches[i];
    const endMatch = endMatches[i];

    // Content before this aside (main content)
    if (startMatch.index !== undefined && startMatch.index > lastIndex) {
      const mainContent = masked.substring(lastIndex, startMatch.index);
      sections.push({ content: unmaskCodeBlocks(mainContent, blocks), type: 'main' });
    }

    // Aside content
    if (startMatch.index !== undefined && endMatch.index !== undefined) {
      const asideContent = masked.substring(startMatch.index + startMatch[0].length, endMatch.index);
      sections.push({ content: unmaskCodeBlocks(asideContent, blocks), type: 'aside' });
      lastIndex = endMatch.index + endMatch[0].length;
    }
  }

  // Content after last aside
  if (lastIndex < masked.length) {
    const mainContent = masked.substring(lastIndex);
    sections.push({ content: unmaskCodeBlocks(mainContent, blocks), type: 'main' });
  }

  console.log('[renderWithAsides] Built', sections.length, 'sections');

  // Render sections with proper alignment markers
  // We need to insert alignment anchors where asides begin
  let htmlParts: string[] = [];

  sections.forEach((section, idx) => {
    if (section.type === 'main') {
      const renderedMain = md.render(section.content, env);
      htmlParts.push(`<div class="main-content-section">${renderedMain}</div>`);
    } else {
      // Render aside with nested content div for styling
      const asideRendered = md.render(section.content, env);
      htmlParts.push(`<div class="aside-block" data-aside-index="${idx}"><div class="aside-content">${asideRendered}</div></div>`);
    }
  });

  // Wrap in grid container
  return `<div class="aside-layout-container">${htmlParts.join('')}</div>`;
}

// Render content with layout
function renderWithLayout(
  content: string,
  frontMatter: Record<string, any> | null,
  currentPage: string | undefined,
  currentSource: string | undefined,
  layoutOverride?: string,
  additionalEnv?: any
): string {
  console.log('[renderWithLayout] Starting render...');
  const layout = layoutOverride || frontMatter?.['md-layout'] || 'simple';
  console.log('[renderWithLayout] Layout:', layout);

  const { hasColumns } = parseColumns(content);
  const { hasAsides } = parseAsides(content);
  console.log('[renderWithLayout] hasColumns:', hasColumns, 'hasAsides:', hasAsides);

  // Check for forbidden combination: columns + asides
  if (hasColumns && hasAsides) {
    console.warn('[renderWithLayout] Both columns and asides detected - asides inside columns are forbidden, rendering without asides');
  }

  // Environment for markdown-it renderer
  const env = { currentPage, currentSource, ...additionalEnv };

  // If no columns found, check for asides or render simple
  if (!hasColumns) {
    console.log('[renderWithLayout] No columns found');

    // Check if we have asides to render
    if (hasAsides) {
      console.log('[renderWithLayout] Rendering with asides');
      return renderWithAsides(content, env);
    }

    if (layout === 'simple') {
      console.log('[renderWithLayout] Rendering as simple layout');
      return md.render(content, env);
    } else if (layout === 'center') {
      console.log('[renderWithLayout] Rendering as center layout (no columns)');
      const renderedContent = md.render(content, env);
      return `<div class="layout-container" data-layout="center"><div class="layout-column">${renderedContent}</div></div>`;
    } else {
      // Default to simple for unknown layouts
      return md.render(content, env);
    }
  }

  // If layout is simple and we have columns, ignore the layout markers
  if (layout === 'simple') {
    console.log('[renderWithLayout] Rendering as simple layout (ignoring column markers)');
    return md.render(content, env);
  }

  console.log('[renderWithLayout] Rendering with column layout(s)!');

  // Mask code blocks first
  const { masked, blocks } = maskCodeBlocks(content);

  // Find all column section boundaries
  const layoutStartRegex = /^::md-layout:columns\s*$/gm;
  const layoutEndRegex = /^::md-layout:columns-end\s*$/gm;

  const startMatches = [...masked.matchAll(layoutStartRegex)];
  const endMatches = [...masked.matchAll(layoutEndRegex)];

  console.log('[renderWithLayout] Found', startMatches.length, 'start markers and', endMatches.length, 'end markers');

  if (startMatches.length !== endMatches.length) {
    console.warn('[renderWithLayout] Mismatched column markers! Falling back to simple render');
    return md.render(content, env);
  }

  // Build sections array: [content, type] where type is 'normal' or 'columns'
  const sections: Array<{ content: string; type: 'normal' | 'columns' }> = [];
  let lastIndex = 0;

  for (let i = 0; i < startMatches.length; i++) {
    const startMatch = startMatches[i];
    const endMatch = endMatches[i];

    // Content before this column section
    if (startMatch.index > lastIndex) {
      const normalContent = masked.substring(lastIndex, startMatch.index);
      sections.push({ content: unmaskCodeBlocks(normalContent, blocks), type: 'normal' });
    }

    // Column section content
    const columnContent = masked.substring(startMatch.index + startMatch[0].length, endMatch.index);
    sections.push({ content: columnContent, type: 'columns' });

    lastIndex = endMatch.index + endMatch[0].length;
  }

  // Content after last column section
  if (lastIndex < masked.length) {
    const normalContent = masked.substring(lastIndex);
    sections.push({ content: unmaskCodeBlocks(normalContent, blocks), type: 'normal' });
  }

  console.log('[renderWithLayout] Built', sections.length, 'sections');

  // Get column configuration from front matter
  const columnsConfig = frontMatter?.['md-layout-columns'];
  const columnsWidth = frontMatter?.['md-layout-columns-width'];

  let columnWidths: string[] = [];
  if (typeof columnsWidth === 'string') {
    columnWidths = columnsWidth.split(',').map(w => w.trim());
  } else if (Array.isArray(columnsWidth)) {
    columnWidths = columnsWidth;
  }

  // Render all sections
  const renderedSections = sections.map((section, sectionIdx) => {
    if (section.type === 'normal') {
      // Render normal content
      return md.render(section.content, env);
    } else {
      // Parse and render column section
      const columnRegex = /^::md-layout:column\[([^\]]+)\]\s*$/gm;
      const matches = [...section.content.matchAll(columnRegex)];

      if (matches.length === 0) {
        console.warn('[renderWithLayout] Column section has no column markers');
        return md.render(unmaskCodeBlocks(section.content, blocks), env);
      }

      const columns: ColumnContent = {};
      const parts = section.content.split(columnRegex);

      for (let i = 1; i < parts.length; i += 2) {
        const columnName = parts[i].trim();
        const columnContent = parts[i + 1] || '';

        if (!columns[columnName]) {
          columns[columnName] = '';
        }
        columns[columnName] += unmaskCodeBlocks(columnContent, blocks);
      }

      // Determine column names
      let columnNames: string[];
      if (typeof columnsConfig === 'string') {
        columnNames = columnsConfig.split(',').map(c => c.trim());
      } else if (Array.isArray(columnsConfig)) {
        columnNames = columnsConfig;
      } else {
        columnNames = Object.keys(columns);
      }

      // Render columns
      const renderedColumns = columnNames.map((name, idx) => {
        const columnContent = columns[name] || '';
        const renderedContent = md.render(columnContent, env);
        const width = columnWidths[idx] || '';
        const style = width ? `style="width: ${width}"` : '';
        return `<div class="layout-column" data-column="${name}" ${style}>${renderedContent}</div>`;
      }).join('\n');

      return `<div class="layout-container" data-layout="${layout}">${renderedColumns}</div>`;
    }
  });

  console.log('[renderWithLayout] Rendered all sections, joining...');
  return renderedSections.join('\n');
}

// Export render function
export function renderMarkdown(content: string, currentPage?: string, currentSource?: string, layoutOverride?: string, additionalEnv?: any): string {
  const { frontMatter, content: markdownContent } = parseFrontMatter(content);

  // Render content with layout
  let html = renderWithLayout(markdownContent, frontMatter, currentPage, currentSource, layoutOverride, additionalEnv);

  // If there's front matter, inject it after the first H1
  if (frontMatter && Object.keys(frontMatter).length > 0) {
    const frontMatterHtml = renderFrontMatterTable(frontMatter);
    // Insert after the first h1 tag
    html = html.replace(/(<h1[^>]*>.*?<\/h1>)/, `$1\n${frontMatterHtml}`);
  }

  return html;
}

// Export front matter for external use
export function getFrontMatter(content: string): Record<string, any> | null {
  const { frontMatter } = parseFrontMatter(content);
  return frontMatter;
}
