import MarkdownIt from 'markdown-it';
import * as yaml from 'js-yaml';
import markdownItAnchor from 'markdown-it-anchor';

// Create markdown-it instance
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

// Obsidian Wiki-Links and Hashtags Plugin
// Converts [[Page Name]] to links
// Converts #tag to clickable tag links
function wikiLinksPlugin(md: MarkdownIt) {
  // Pattern for [[link]] or [[link|text]]
  const wikiLinkPattern = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  // Pattern for hashtags (word boundary before, alphanumeric/underscore/dash after)
  const hashtagPattern = /(?:^|[^a-zA-Z0-9_-])#([a-zA-Z0-9_-]+)/g;

  const defaultRender = md.renderer.rules.text || ((tokens, idx) => tokens[idx].content);

  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    let content = tokens[idx].content;

    // Replace wiki-link patterns first
    content = content.replace(wikiLinkPattern, (match, target, pipe, displayText) => {
      const linkTarget = target.trim();
      const linkText = displayText ? displayText.trim() : linkTarget;
      // Include source in URL: #/source/page
      const source = env.currentSource || 'Local';
      return `<a href="#/${encodeURIComponent(source)}/${encodeURIComponent(linkTarget)}" class="wiki-link">${linkText}</a>`;
    });

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
      return `<div class="plugin-block" data-plugin="${langName}">
  <div class="plugin-header">Plugin: ${langName}</div>
  <pre class="plugin-content">${md.utils.escapeHtml(content)}</pre>
</div>`;
    }

    // Standard code block
    return defaultFenceRender(tokens, idx, options, env, self);
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

function parseColumns(content: string): { columns: ColumnContent; hasColumns: boolean } {
  // Mask code blocks to prevent parsing column markers inside them
  const { masked, blocks } = maskCodeBlocks(content);

  const columnRegex = /^::column\[([^\]]+)\]\s*$/gm;
  const matches = [...masked.matchAll(columnRegex)];

  if (matches.length === 0) {
    return { columns: {}, hasColumns: false };
  }

  const columns: ColumnContent = {};
  const parts = masked.split(columnRegex);

  // parts[0] is content before first ::column marker
  // After that, pattern is: [columnName, content, columnName, content, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const columnName = parts[i].trim();
    const columnContent = parts[i + 1] || '';

    if (!columns[columnName]) {
      columns[columnName] = '';
    }
    // Restore code blocks in this column's content
    columns[columnName] += unmaskCodeBlocks(columnContent, blocks);
  }

  return { columns, hasColumns: true };
}

// Render content with layout
function renderWithLayout(
  content: string,
  frontMatter: Record<string, any> | null,
  currentPage: string | undefined,
  currentSource: string | undefined,
  layoutOverride?: string
): string {
  const layout = layoutOverride || frontMatter?.['md-layout'] || 'simple';
  const { columns, hasColumns } = parseColumns(content);

  // Environment for markdown-it renderer
  const env = { currentPage, currentSource };

  // If no columns found, render as simple layout
  if (!hasColumns || layout === 'simple') {
    return md.render(content, env);
  }

  // Get column configuration from front matter
  const columnsConfig = frontMatter?.['md-layout-columns'];
  const columnsWidth = frontMatter?.['md-layout-columns-width'];

  let columnNames: string[];
  if (typeof columnsConfig === 'string') {
    columnNames = columnsConfig.split(',').map(c => c.trim());
  } else if (Array.isArray(columnsConfig)) {
    columnNames = columnsConfig;
  } else {
    // Use columns in order they appear
    columnNames = Object.keys(columns);
  }

  let columnWidths: string[] = [];
  if (typeof columnsWidth === 'string') {
    columnWidths = columnsWidth.split(',').map(w => w.trim());
  } else if (Array.isArray(columnsWidth)) {
    columnWidths = columnsWidth;
  }

  // Render each column
  const renderedColumns = columnNames.map((name, idx) => {
    const columnContent = columns[name] || '';
    const renderedContent = md.render(columnContent, env);
    const width = columnWidths[idx] || '';
    const style = width ? `style="width: ${width}"` : '';
    return `<div class="layout-column" data-column="${name}" ${style}>${renderedContent}</div>`;
  }).join('\n');

  return `<div class="layout-container" data-layout="${layout}">${renderedColumns}</div>`;
}

// Export render function
export function renderMarkdown(content: string, currentPage?: string, currentSource?: string, layoutOverride?: string): string {
  const { frontMatter, content: markdownContent } = parseFrontMatter(content);

  // Render content with layout
  let html = renderWithLayout(markdownContent, frontMatter, currentPage, currentSource, layoutOverride);

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
