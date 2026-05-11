import { renderMarkdown, getFrontMatter } from './markdown-renderer';

// Source configuration interface
interface Source {
  name: string;
  indexUrl: string;
  contentBaseUrl: string;
}

const SOURCES_STORAGE_KEY = 'mdnet-sources';

// DOM elements
let contentElement: HTMLElement;
let errorElement: HTMLElement;
let layoutToggleElement: HTMLElement;
let themeToggleElement: HTMLElement;
let searchToggleElement: HTMLElement;
let settingsToggleElement: HTMLElement;
let containerElement: HTMLElement;
let searchModalElement: HTMLElement;
let searchInputElement: HTMLInputElement;
let searchResultsElement: HTMLElement;
let searchPaginationElement: HTMLElement;
let searchPageInfoElement: HTMLElement;
let searchPrevButton: HTMLButtonElement;
let searchNextButton: HTMLButtonElement;
let settingsModalElement: HTMLElement;
let closeSettingsElement: HTMLElement;
let addSourceBtnElement: HTMLButtonElement;

// Current page state
let currentPageContent: string = '';
let currentPageFilename: string = '';
let currentPageSource: string = '';
let currentLayout: string | undefined;

// Search state
interface SearchIndexItem {
  filename: string;
  title: string;
  headings: { level: number; text: string; }[];
  tags: string[];
  links: string[];
  properties: { [key: string]: string | string[] };
  _source?: string;         // Added by frontend (source name)
  _contentUrl?: string;     // Added by frontend (full URL to markdown file)
}

let searchIndex: SearchIndexItem[] = [];
let searchResults: any[] = [];
let currentSearchPage = 1;
const RESULTS_PER_PAGE = 10;

// Source editing state
let editingSourceIndex: number | null = null;

// Source management functions
function loadSources(): Source[] {
  const stored = localStorage.getItem(SOURCES_STORAGE_KEY);
  if (!stored) {
    // Default: try to detect local source
    return [];
  }
  return JSON.parse(stored);
}

function saveSources(sources: Source[]): void {
  localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources));
}

function addSource(name: string, indexUrl: string, contentBaseUrl: string): void {
  const sources = loadSources();
  sources.push({ name, indexUrl, contentBaseUrl });
  saveSources(sources);
  loadAllSearchIndexes(); // Reload indexes
  renderSourcesList();
}

function updateSource(index: number, name: string, indexUrl: string, contentBaseUrl: string): void {
  const sources = loadSources();
  if (index >= 0 && index < sources.length) {
    sources[index] = { name, indexUrl, contentBaseUrl };
    saveSources(sources);
    loadAllSearchIndexes(); // Reload indexes
    renderSourcesList();
  }
}

function editSource(index: number): void {
  const sources = loadSources();
  if (index >= 0 && index < sources.length) {
    const source = sources[index];
    editingSourceIndex = index;

    // Populate form fields
    const nameInput = document.getElementById('source-name') as HTMLInputElement;
    const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
    const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;

    nameInput.value = source.name;
    indexUrlInput.value = source.indexUrl;
    contentUrlInput.value = source.contentBaseUrl;

    // Update button text and show cancel button
    const submitBtn = document.getElementById('add-source-btn')!;
    const cancelBtn = document.getElementById('cancel-edit-btn')!;
    const formTitle = document.querySelector('.add-source-form h3')!;

    submitBtn.textContent = 'Update Source';
    cancelBtn.style.display = 'inline-block';
    formTitle.textContent = `Edit Source: ${source.name}`;

    // Scroll to form
    document.querySelector('.add-source-form')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function cancelEdit(): void {
  editingSourceIndex = null;

  // Clear form
  const nameInput = document.getElementById('source-name') as HTMLInputElement;
  const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
  const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;

  nameInput.value = '';
  indexUrlInput.value = '';
  contentUrlInput.value = '';

  // Reset button text and hide cancel button
  const submitBtn = document.getElementById('add-source-btn')!;
  const cancelBtn = document.getElementById('cancel-edit-btn')!;
  const formTitle = document.querySelector('.add-source-form h3')!;

  submitBtn.textContent = 'Add Source';
  cancelBtn.style.display = 'none';
  formTitle.textContent = 'Add New Source';
}

function removeSource(index: number): void {
  const sources = loadSources();
  sources.splice(index, 1);
  saveSources(sources);
  loadAllSearchIndexes(); // Reload indexes
  renderSourcesList();

  // If we were editing this source, cancel the edit
  if (editingSourceIndex === index) {
    cancelEdit();
  } else if (editingSourceIndex !== null && editingSourceIndex > index) {
    // Adjust editing index if a source before it was removed
    editingSourceIndex--;
  }
}

function renderSourcesList(): void {
  const sources = loadSources();
  const container = document.getElementById('sources-list')!;

  if (sources.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); padding: 15px; text-align: center;">No sources configured. Add one below to get started.</div>';
    return;
  }

  container.innerHTML = sources.map((source, index) => `
    <div class="source-item">
      <div class="source-info">
        <strong>${source.name}</strong>
        <div class="source-urls">
          <div>Index: ${source.indexUrl}</div>
          <div>Content: ${source.contentBaseUrl}</div>
        </div>
      </div>
      <div class="source-actions">
        <button class="edit-source-btn" data-index="${index}">Edit</button>
        <button class="remove-source-btn" data-index="${index}">Remove</button>
      </div>
    </div>
  `).join('');

  // Attach edit handlers
  container.querySelectorAll('.edit-source-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index!);
      editSource(index);
    });
  });

  // Attach remove handlers
  container.querySelectorAll('.remove-source-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index!);
      removeSource(index);
    });
  });
}

async function initializeDefaultSource(): Promise<void> {
  const sources = loadSources();

  // If no sources, try to detect local source
  if (sources.length === 0) {
    try {
      const response = await fetch('/search-index.json');
      if (response.ok) {
        addSource('Local', '/search-index.json', '/content/');
        console.log('Auto-configured local source');
      }
    } catch (error) {
      console.log('No local search index found. Please configure sources manually.');
    }
  }
}

// Initialize the application
async function init() {
  console.log('Initializing MDNet application...');
  contentElement = document.getElementById('content')!;
  errorElement = document.getElementById('error')!;
  layoutToggleElement = document.getElementById('layout-toggle')!;
  themeToggleElement = document.getElementById('theme-toggle')!;
  searchToggleElement = document.getElementById('search-toggle')!;
  settingsToggleElement = document.getElementById('settings-toggle')!;
  containerElement = document.querySelector('.container')!;
  searchModalElement = document.getElementById('search-modal')!;
  searchInputElement = document.getElementById('search-input')! as HTMLInputElement;
  searchResultsElement = document.getElementById('search-results')!;
  searchPaginationElement = document.getElementById('search-pagination')!;
  searchPageInfoElement = document.getElementById('search-page-info')!;
  searchPrevButton = document.getElementById('search-prev-page')! as HTMLButtonElement;
  searchNextButton = document.getElementById('search-next-page')! as HTMLButtonElement;
  settingsModalElement = document.getElementById('settings-modal')!;
  closeSettingsElement = document.getElementById('close-settings')!;
  addSourceBtnElement = document.getElementById('add-source-btn')! as HTMLButtonElement;

  // Initialize theme from localStorage
  initTheme();

  // Initialize default source (if needed)
  await initializeDefaultSource();

  // Load search indexes from all sources
  await loadAllSearchIndexes();

  // Set up search
  searchToggleElement.addEventListener('click', openSearch);
  searchModalElement.addEventListener('click', (e) => {
    if (e.target === searchModalElement) closeSearch();
  });
  searchInputElement.addEventListener('input', handleSearch);
  searchPrevButton.addEventListener('click', () => changePage(-1));
  searchNextButton.addEventListener('click', () => changePage(1));

  // Close search on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (searchModalElement.classList.contains('active')) {
        closeSearch();
      }
      if (settingsModalElement.classList.contains('active')) {
        closeSettings();
      }
    }
  });

  // Set up settings modal
  settingsToggleElement.addEventListener('click', openSettings);
  closeSettingsElement.addEventListener('click', closeSettings);
  settingsModalElement.addEventListener('click', (e) => {
    if (e.target === settingsModalElement) closeSettings();
  });
  addSourceBtnElement.addEventListener('click', () => {
    const nameInput = document.getElementById('source-name') as HTMLInputElement;
    const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
    const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;

    const name = nameInput.value.trim();
    const indexUrl = indexUrlInput.value.trim();
    const contentBaseUrl = contentUrlInput.value.trim();

    if (!name || !indexUrl || !contentBaseUrl) {
      alert('All fields are required');
      return;
    }

    // Validate source name - no spaces allowed (use dashes or underscores instead)
    if (name.includes(' ')) {
      alert('Source name cannot contain spaces. Please use dashes (-) or underscores (_) instead.\nExample: "local-sop-2" or "local_sop_2"');
      return;
    }

    // Validate source name - only alphanumeric, dashes, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      alert('Source name can only contain letters, numbers, dashes (-), and underscores (_)');
      return;
    }

    // Ensure contentBaseUrl ends with /
    const normalizedContentUrl = contentBaseUrl.endsWith('/') ? contentBaseUrl : contentBaseUrl + '/';

    // Check if we're editing or adding
    if (editingSourceIndex !== null) {
      updateSource(editingSourceIndex, name, indexUrl, normalizedContentUrl);
      cancelEdit();
    } else {
      addSource(name, indexUrl, normalizedContentUrl);

      // Clear form
      nameInput.value = '';
      indexUrlInput.value = '';
      contentUrlInput.value = '';
    }
  });

  // Set up cancel edit button
  const cancelEditBtn = document.getElementById('cancel-edit-btn')!;
  cancelEditBtn.addEventListener('click', cancelEdit);

  // Set up theme toggle
  themeToggleElement.addEventListener('click', toggleTheme);

  // Set up layout toggle
  layoutToggleElement.addEventListener('click', toggleLayout);

  // Set up routing
  window.addEventListener('hashchange', handleRouteChange);

  // Initial route
  handleRouteChange();
}

// Handle route changes
async function handleRouteChange() {
  const hash = window.location.hash.slice(1); // Remove #

  // Split by # to handle anchors (e.g., /source/page#anchor)
  let pagePart = hash.slice(1) || ''; // Remove leading /
  let anchor = '';

  const anchorIndex = pagePart.indexOf('#');
  if (anchorIndex !== -1) {
    anchor = pagePart.slice(anchorIndex + 1); // Get anchor without #
    pagePart = pagePart.slice(0, anchorIndex); // Get page path before #
  }

  // Parse source and filename from pagePart
  // Format: source-name/path/to/file
  let sourceName = '';
  let filename = '';

  if (!pagePart || pagePart === 'index') {
    // Default to first source and index page
    const sources = loadSources();
    if (sources.length > 0) {
      sourceName = sources[0].name;
      filename = 'index';
    } else {
      showError('No sources configured');
      return;
    }
  } else {
    const firstSlash = pagePart.indexOf('/');
    if (firstSlash === -1) {
      // No slash - treat as source name with index page
      // OR if it looks like a filename, use first source
      const sources = loadSources();
      if (sources.length > 0) {
        // Check if pagePart is a known source name
        const isSourceName = sources.some(s => s.name === pagePart);
        if (isSourceName) {
          sourceName = pagePart;
          filename = 'index';
        } else {
          // It's a filename, use first source
          sourceName = sources[0].name;
          filename = pagePart;
        }
      }
    } else {
      // Has slash - split into source and filename
      sourceName = pagePart.slice(0, firstSlash);
      filename = pagePart.slice(firstSlash + 1);
    }
  }

  console.log(`Route changed: source="${sourceName}", file="${filename}", anchor="${anchor || 'none'}"`);
  await loadPage(sourceName, filename, anchor);
}

// Load and render a page
async function loadPage(sourceName: string, filename: string, anchor?: string) {
  try {
    hideError();
    contentElement.innerHTML = '<div class="loading">Loading...</div>';
    console.log(`Loading page: ${filename} from source: ${sourceName}${anchor ? ` with anchor: ${anchor}` : ''}`);

    // Find the source
    const sources = loadSources();
    const source = sources.find(s => s.name === sourceName);

    if (!source) {
      showError(`Source "${sourceName}" not found`);
      return;
    }

    // Find the item in search index from this specific source
    const item = searchIndex.find(item =>
      item.filename === filename && item._source === sourceName
    );

    let contentUrl: string;
    if (item && item._contentUrl) {
      // Use pre-calculated content URL from index
      contentUrl = item._contentUrl;
      console.log(`Loading page "${filename}" from source "${sourceName}": ${contentUrl}`);
    } else {
      // Fallback: construct URL from source
      contentUrl = `${source.contentBaseUrl}${filename}.md`;
      console.log(`Page "${filename}" not found in index, trying source URL: ${contentUrl}`);
    }

    const response = await fetch(contentUrl);

    if (!response.ok) {
      if (response.status === 404) {
        showError(`Page "${filename}" not found`);
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Fetch markdown as text (not JSON)
    currentPageContent = await response.text();
    currentPageFilename = filename; // Store current page filename for anchor links
    currentPageSource = sourceName; // Store current source for link generation
    currentLayout = undefined; // Reset layout override

    renderCurrentPage();
    updateLayoutToggle();

    // Scroll to anchor if specified
    if (anchor) {
      scrollToAnchor(anchor);
    }
  } catch (error) {
    console.error('Error loading page:', error);
    showError(`Failed to load page: ${(error as Error).message}`);
  }
}

// Render the current page with current layout
function renderCurrentPage() {
  const html = renderMarkdown(currentPageContent, currentPageFilename, currentPageSource, currentLayout);
  contentElement.innerHTML = html;

  // Update source badge
  const sourceBadgeElement = document.getElementById('source-badge')!;
  if (currentPageSource) {
    sourceBadgeElement.innerHTML = `Source: <span class="source-name">${currentPageSource}</span>`;
    sourceBadgeElement.classList.add('visible');
  } else {
    sourceBadgeElement.classList.remove('visible');
  }

  // Apply page width from front matter
  const frontMatter = getFrontMatter(currentPageContent);
  const pageWidth = frontMatter?.['md-page-width'];

  if (pageWidth) {
    containerElement.style.width = pageWidth;
  } else {
    containerElement.style.width = '80%';
  }

  // Add click handlers to hashtags
  attachHashtagHandlers();
}

// Attach click handlers to hashtag links
function attachHashtagHandlers() {
  const hashtagLinks = contentElement.querySelectorAll('.hashtag-link');
  hashtagLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tag = (e.target as HTMLElement).getAttribute('data-tag');
      if (tag) {
        searchForTag(tag);
      }
    });
  });
}

// Scroll to anchor element
function scrollToAnchor(anchor: string) {
  // Wait a bit for the page to fully render
  setTimeout(() => {
    console.log(`Attempting to scroll to anchor: ${anchor}`);
    const element = document.getElementById(anchor);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      console.log(`Scrolled to anchor: ${anchor}`);
    } else {
      console.warn(`Anchor element not found: #${anchor}`);
      console.log(`Available IDs in page:`, Array.from(document.querySelectorAll('[id]')).map(el => el.id));
    }
  }, 200);
}

// Open search modal with a specific tag
function searchForTag(tag: string) {
  openSearch();
  searchInputElement.value = `#${tag}`;
  handleSearch();
}

// Toggle between layouts
function toggleLayout() {
  const frontMatter = getFrontMatter(currentPageContent);
  const defaultLayout = frontMatter?.['md-layout'] || 'simple';

  if (!currentLayout) {
    // Currently using default layout, switch to the other
    currentLayout = defaultLayout === 'simple' ? 'two-column' : 'simple';
  } else if (currentLayout === defaultLayout) {
    // Currently at default, switch to the other
    currentLayout = defaultLayout === 'simple' ? 'two-column' : 'simple';
  } else {
    // Currently overridden, go back to default
    currentLayout = undefined;
  }

  renderCurrentPage();
  updateLayoutToggle();
}

// Update layout toggle button icon
function updateLayoutToggle() {
  const frontMatter = getFrontMatter(currentPageContent);
  const defaultLayout = frontMatter?.['md-layout'] || 'simple';
  const effectiveLayout = currentLayout || defaultLayout;

  layoutToggleElement.textContent = effectiveLayout === 'simple' ? '|||' : '□';
  layoutToggleElement.title = `Switch to ${effectiveLayout === 'simple' ? 'column' : 'simple'} layout`;
}

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeButton(true);
  } else {
    updateThemeButton(false);
  }
}

// Toggle theme
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  updateThemeButton(isLight);
}

// Update theme button icon and title
function updateThemeButton(isLight: boolean) {
  themeToggleElement.textContent = isLight ? '☾' : '☀';
  themeToggleElement.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

// Show error message
function showError(message: string) {
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  contentElement.innerHTML = '';
}

// Hide error message
function hideError() {
  errorElement.style.display = 'none';
}

// Load search indexes from all configured sources
async function loadAllSearchIndexes(): Promise<void> {
  const sources = loadSources();
  const allIndexes: SearchIndexItem[] = [];

  if (sources.length === 0) {
    console.log('No sources configured');
    searchIndex = [];
    return;
  }

  for (const source of sources) {
    try {
      const response = await fetch(source.indexUrl);
      if (!response.ok) {
        console.error(`Failed to load index from ${source.name}: ${response.statusText}`);
        continue;
      }

      const indexData: SearchIndexItem[] = await response.json();

      // Augment each item with source information
      const augmentedItems = indexData.map(item => ({
        ...item,
        _source: source.name,
        _contentUrl: `${source.contentBaseUrl}${item.filename}.md`
      }));

      allIndexes.push(...augmentedItems);
      console.log(`Loaded ${augmentedItems.length} pages from ${source.name}`);
    } catch (error) {
      console.error(`Error loading index from ${source.name}:`, error);
    }
  }

  searchIndex = allIndexes;
  console.log(`Total: ${allIndexes.length} pages from ${sources.length} source(s)`);
}

// Open search modal
function openSearch() {
  searchModalElement.classList.add('active');
  searchInputElement.value = '';
  searchInputElement.focus();
  searchResults = [];
  currentSearchPage = 1;
  renderSearchResults();
}

// Close search modal
function closeSearch() {
  searchModalElement.classList.remove('active');
}

// Open settings modal
function openSettings() {
  settingsModalElement.classList.add('active');
  renderSourcesList();
}

// Close settings modal
function closeSettings() {
  settingsModalElement.classList.remove('active');
}

// Parse property search query
function parsePropertyQuery(query: string): { property: string; operator: string; value: string } | null {
  // Pattern: property:operator:value or property:value (defaults to ==)
  const match = query.match(/^([a-zA-Z0-9_-]+):(==|!=|has|!has|)(.*)$/);
  if (!match) return null;

  const property = match[1];
  let operator = match[2] || '==';
  let value = match[3];

  // If no operator specified, the value is in match[2]
  if (!match[2] && match[3] === '') {
    operator = '==';
    value = query.substring(property.length + 1);
  }

  return { property, operator, value: value.trim() };
}

// Check if item matches property query
function matchesPropertyQuery(item: SearchIndexItem, property: string, operator: string, value: string): boolean {
  const propValue = item.properties?.[property];
  if (propValue === undefined) return false;

  const valueLower = value.toLowerCase();

  if (Array.isArray(propValue)) {
    // Property is an array
    switch (operator) {
      case 'has':
        return propValue.some(v => v.toLowerCase().includes(valueLower));
      case '!has':
        return !propValue.some(v => v.toLowerCase().includes(valueLower));
      case '==':
        return propValue.some(v => v.toLowerCase() === valueLower);
      case '!=':
        return !propValue.some(v => v.toLowerCase() === valueLower);
      default:
        return false;
    }
  } else {
    // Property is a string
    const propValueLower = String(propValue).toLowerCase();
    switch (operator) {
      case '==':
        return propValueLower === valueLower;
      case '!=':
        return propValueLower !== valueLower;
      case 'has':
        return propValueLower.includes(valueLower);
      case '!has':
        return !propValueLower.includes(valueLower);
      default:
        return false;
    }
  }
}

// Handle search input
function handleSearch() {
  const query = searchInputElement.value.trim();
  currentSearchPage = 1;

  if (!query) {
    searchResults = [];
    renderSearchResults();
    return;
  }

  // Check if it's a property search
  const propertyQuery = parsePropertyQuery(query);
  if (propertyQuery) {
    searchResults = searchIndex
      .filter(item => matchesPropertyQuery(item, propertyQuery.property, propertyQuery.operator, propertyQuery.value))
      .map(item => ({
        filename: item.filename,
        title: item.title,
        matchType: 'property',
        matchText: `${propertyQuery.property} ${propertyQuery.operator} ${propertyQuery.value}`,
        _source: item._source
      }));
  }
  // Check if it's a tag search
  else if (query.startsWith('#')) {
    const tag = query.slice(1).toLowerCase();
    searchResults = searchIndex
      .filter(item => item.tags.some(t => t.toLowerCase().includes(tag)))
      .map(item => ({
        filename: item.filename,
        title: item.title,
        matchType: 'tag',
        matchText: item.tags.find(t => t.toLowerCase().includes(tag)),
        _source: item._source
      }));
  } else {
    // Text search in titles and headings
    const queryLower = query.toLowerCase();
    searchResults = [];

    for (const item of searchIndex) {
      // Check title
      if (item.title.toLowerCase().includes(queryLower)) {
        searchResults.push({
          filename: item.filename,
          title: item.title,
          matchType: 'title',
          matchText: item.title,
          _source: item._source
        });
        continue;
      }

      // Check headings
      const matchingHeading = item.headings.find(h =>
        h.text.toLowerCase().includes(queryLower)
      );
      if (matchingHeading) {
        searchResults.push({
          filename: item.filename,
          title: item.title,
          matchType: 'heading',
          matchText: matchingHeading.text,
          _source: item._source
        });
      }
    }
  }

  renderSearchResults();
}

// Render search results with pagination
function renderSearchResults() {
  if (searchResults.length === 0) {
    if (searchInputElement.value.trim()) {
      searchResultsElement.innerHTML = '<div class="search-no-results">No results found</div>';
    } else {
      searchResultsElement.innerHTML = '<div class="search-no-results">Type to search...</div>';
    }
    searchPaginationElement.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(searchResults.length / RESULTS_PER_PAGE);
  const startIdx = (currentSearchPage - 1) * RESULTS_PER_PAGE;
  const endIdx = startIdx + RESULTS_PER_PAGE;
  const pageResults = searchResults.slice(startIdx, endIdx);

  searchResultsElement.innerHTML = pageResults.map(result => `
    <div class="search-result-item" data-filename="${result.filename}" data-source="${result._source || ''}">
      <div class="search-result-title">${escapeHtml(result.title)}</div>
      <div class="search-result-meta">
        ${result._source ? `<span class="search-result-source">[${escapeHtml(result._source)}]</span>` : ''}
        ${result.matchType === 'tag' ? `#${escapeHtml(result.matchText)}` : escapeHtml(result.matchText)}
      </div>
    </div>
  `).join('');

  // Add click handlers to results
  searchResultsElement.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const filename = item.getAttribute('data-filename');
      const source = item.getAttribute('data-source');
      if (filename && source) {
        window.location.hash = `#/${encodeURIComponent(source)}/${filename}`;
        closeSearch();
      }
    });
  });

  // Update pagination
  if (totalPages > 1) {
    searchPaginationElement.style.display = 'flex';
    searchPageInfoElement.textContent = `Page ${currentSearchPage} of ${totalPages}`;
    searchPrevButton.disabled = currentSearchPage === 1;
    searchNextButton.disabled = currentSearchPage === totalPages;
  } else {
    searchPaginationElement.style.display = 'none';
  }
}

// Change page in search results
function changePage(delta: number) {
  const totalPages = Math.ceil(searchResults.length / RESULTS_PER_PAGE);
  const newPage = currentSearchPage + delta;

  if (newPage >= 1 && newPage <= totalPages) {
    currentSearchPage = newPage;
    renderSearchResults();
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
