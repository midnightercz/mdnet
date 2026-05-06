import { renderMarkdown, getFrontMatter } from './markdown-renderer';

// API base URL
const API_BASE = '/api';

// DOM elements
let contentElement: HTMLElement;
let errorElement: HTMLElement;
let layoutToggleElement: HTMLElement;
let themeToggleElement: HTMLElement;
let searchToggleElement: HTMLElement;
let containerElement: HTMLElement;
let searchModalElement: HTMLElement;
let searchInputElement: HTMLInputElement;
let searchResultsElement: HTMLElement;
let searchPaginationElement: HTMLElement;
let searchPageInfoElement: HTMLElement;
let searchPrevButton: HTMLButtonElement;
let searchNextButton: HTMLButtonElement;

// Current page state
let currentPageContent: string = '';
let currentLayout: string | undefined;

// Search state
interface SearchIndexItem {
  filename: string;
  title: string;
  headings: { level: number; text: string; }[];
  tags: string[];
  links: string[];
  properties: { [key: string]: string | string[] };
}

let searchIndex: SearchIndexItem[] = [];
let searchResults: any[] = [];
let currentSearchPage = 1;
const RESULTS_PER_PAGE = 10;

// Initialize the application
async function init() {
  contentElement = document.getElementById('content')!;
  errorElement = document.getElementById('error')!;
  layoutToggleElement = document.getElementById('layout-toggle')!;
  themeToggleElement = document.getElementById('theme-toggle')!;
  searchToggleElement = document.getElementById('search-toggle')!;
  containerElement = document.querySelector('.container')!;
  searchModalElement = document.getElementById('search-modal')!;
  searchInputElement = document.getElementById('search-input')! as HTMLInputElement;
  searchResultsElement = document.getElementById('search-results')!;
  searchPaginationElement = document.getElementById('search-pagination')!;
  searchPageInfoElement = document.getElementById('search-page-info')!;
  searchPrevButton = document.getElementById('search-prev-page')! as HTMLButtonElement;
  searchNextButton = document.getElementById('search-next-page')! as HTMLButtonElement;

  // Initialize theme from localStorage
  initTheme();

  // Load search index
  await loadSearchIndex();

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
    if (e.key === 'Escape' && searchModalElement.classList.contains('active')) {
      closeSearch();
    }
  });

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
  const page = hash.slice(1) || ''; // Remove leading /

  await loadPage(page || 'index');
}

// Load and render a page
async function loadPage(filename: string) {
  try {
    hideError();
    contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const url = filename ? `${API_BASE}/content/${encodeURIComponent(filename)}` : `${API_BASE}/content`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        showError(`Page "${filename}" not found`);
        return;
      }
      throw new Error('Failed to load page');
    }

    const data = await response.json();
    currentPageContent = data.content;
    currentLayout = undefined; // Reset layout override

    renderCurrentPage();
    updateLayoutToggle();
  } catch (error) {
    console.error('Error loading page:', error);
    showError('Failed to load page content');
  }
}

// Render the current page with current layout
function renderCurrentPage() {
  const html = renderMarkdown(currentPageContent, currentLayout);
  contentElement.innerHTML = html;

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

// Load search index
async function loadSearchIndex() {
  try {
    const response = await fetch('/search-index.json');
    if (response.ok) {
      searchIndex = await response.json();
      console.log(`Loaded search index with ${searchIndex.length} pages`);
    }
  } catch (error) {
    console.error('Failed to load search index:', error);
  }
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
        matchText: `${propertyQuery.property} ${propertyQuery.operator} ${propertyQuery.value}`
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
        matchText: item.tags.find(t => t.toLowerCase().includes(tag))
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
          matchText: item.title
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
          matchText: matchingHeading.text
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
    <div class="search-result-item" data-filename="${result.filename}">
      <div class="search-result-title">${escapeHtml(result.title)}</div>
      <div class="search-result-meta">
        ${result.matchType === 'tag' ? `#${escapeHtml(result.matchText)}` : escapeHtml(result.matchText)}
      </div>
    </div>
  `).join('');

  // Add click handlers to results
  searchResultsElement.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const filename = item.getAttribute('data-filename');
      if (filename) {
        window.location.hash = `#/${filename}`;
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
