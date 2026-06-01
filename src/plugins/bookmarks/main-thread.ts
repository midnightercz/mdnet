// Bookmarks Plugin
// Save and organize bookmarks with categories, filtering, and management

interface Bookmark {
  id: string;
  url: string;
  title: string;
  category: string;
  source: string;
  filename: string;
  timestampAdded: number;
  timestampModified: number;
}

interface Category {
  id: string;
  name: string;
  order: number;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  categories: Category[];
  activeFilters: string[]; // category IDs, empty means "All"
  manageCategoriesExpanded: boolean;
  filterChipsExpanded: boolean;
}

const STORAGE_KEY = 'mdnet-plugin-bookmarks';
const UNCATEGORIZED_ID = 'uncategorized';

let state: BookmarksState = {
  bookmarks: [],
  categories: [
    { id: UNCATEGORIZED_ID, name: 'Uncategorized', order: 0 }
  ],
  activeFilters: [], // Empty = show all
  manageCategoriesExpanded: false,
  filterChipsExpanded: true
};

let dragState: {
  categoryId: string;
  element: HTMLElement;
  startY: number;
  currentY: number;
  hasMoved: boolean;
} | null = null;

export function onInit(initialConfig: any): void {
  loadState();
  console.log('Bookmarks plugin initialized');
}

export async function onWindowRender(): Promise<string> {
  return renderUI();
}

export function onWindowOpen(): void {
  setupDelegatedHandlers();
}

export function onWindowClose(): void {
  // Cleanup if needed
}

export function onConfigUpdate(newConfig: any): void {
  // No config currently
}

export function onTerminate(): void {
  console.log('Bookmarks plugin terminated');
}

// State Management

function loadState(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const loaded = JSON.parse(stored);
      state = {
        ...state,
        bookmarks: loaded.bookmarks || [],
        categories: loaded.categories || state.categories,
        activeFilters: loaded.activeFilters || [],
        manageCategoriesExpanded: false, // Always start collapsed
        filterChipsExpanded: loaded.filterChipsExpanded !== false // Default to expanded
      };
    }
  } catch (error) {
    console.error('Failed to load bookmarks state:', error);
  }
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bookmarks: state.bookmarks,
      categories: state.categories,
      activeFilters: state.activeFilters,
      filterChipsExpanded: state.filterChipsExpanded
    }));
  } catch (error) {
    console.error('Failed to save bookmarks state:', error);
  }
}

// Bookmark Operations

function addBookmark(url: string, title: string, source: string, filename: string, category: string = UNCATEGORIZED_ID): void {
  // Check for duplicates
  const existing = state.bookmarks.find(b => b.url === url);
  if (existing) {
    // Update existing - trigger edit mode
    const event = new CustomEvent('bookmark-edit', { detail: { bookmarkId: existing.id } });
    document.dispatchEvent(event);
    return;
  }

  const bookmark: Bookmark = {
    id: generateId(),
    url,
    title,
    category,
    source,
    filename,
    timestampAdded: Date.now(),
    timestampModified: Date.now()
  };

  state.bookmarks.unshift(bookmark);
  saveState();
  refreshWindow();
}

function updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): void {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  Object.assign(bookmark, updates, { timestampModified: Date.now() });
  saveState();
  refreshWindow();
}

function deleteBookmark(bookmarkId: string): void {
  state.bookmarks = state.bookmarks.filter(b => b.id !== bookmarkId);
  saveState();
  refreshWindow();
}

// Category Operations

function addCategory(name: string): void {
  if (!name.trim()) return;

  const maxOrder = Math.max(...state.categories.map(c => c.order), 0);
  const category: Category = {
    id: generateId(),
    name: name.trim(),
    order: maxOrder + 1
  };

  state.categories.push(category);
  saveState();
  refreshWindow();
}

function renameCategory(categoryId: string, newName: string): void {
  if (categoryId === UNCATEGORIZED_ID) return; // Can't rename Uncategorized
  if (!newName.trim()) return;

  const category = state.categories.find(c => c.id === categoryId);
  if (category) {
    category.name = newName.trim();
    saveState();
    refreshWindow();
  }
}

function deleteCategory(categoryId: string): void {
  if (categoryId === UNCATEGORIZED_ID) return; // Can't delete Uncategorized

  // Move all bookmarks in this category to Uncategorized
  state.bookmarks.forEach(bookmark => {
    if (bookmark.category === categoryId) {
      bookmark.category = UNCATEGORIZED_ID;
    }
  });

  // Remove category
  state.categories = state.categories.filter(c => c.id !== categoryId);

  // Remove from active filters
  state.activeFilters = state.activeFilters.filter(id => id !== categoryId);

  saveState();
  refreshWindow();
}

function reorderCategories(categoryId: string, newIndex: number): void {
  const oldIndex = state.categories.findIndex(c => c.id === categoryId);
  if (oldIndex === -1) return;

  const [category] = state.categories.splice(oldIndex, 1);
  state.categories.splice(newIndex, 0, category);

  // Update order values
  state.categories.forEach((cat, idx) => {
    cat.order = idx;
  });

  saveState();
  refreshWindow();
}

// Filter Operations

function toggleFilter(categoryId: string): void {
  if (categoryId === 'all') {
    // Reset to show all
    state.activeFilters = [];
  } else {
    const index = state.activeFilters.indexOf(categoryId);
    if (index === -1) {
      state.activeFilters.push(categoryId);
    } else {
      state.activeFilters.splice(index, 1);
    }
  }

  saveState();
  refreshWindow();
}

function isFilterActive(categoryId: string): boolean {
  if (categoryId === 'all') {
    return state.activeFilters.length === 0;
  }
  return state.activeFilters.includes(categoryId);
}

// UI Rendering

function renderUI(): string {
  const headerHtml = `
    <div class="bookmarks-header">
      <button class="bookmarks-add-btn" id="add-bookmark-btn">★ Add</button>
      <button class="manage-categories-btn" id="manage-categories-btn">Categories</button>
    </div>
  `;

  const filterChipsHtml = renderFilterChips();
  const manageCategoriesHtml = renderManageCategories();
  const bookmarksListHtml = renderBookmarksList();

  return `
    <div class="bookmarks-container">
      ${headerHtml}
      ${filterChipsHtml}
      ${manageCategoriesHtml}
      ${bookmarksListHtml}
    </div>
    ${renderStyles()}
  `;
}

function renderFilterChips(): string {
  const expanded = state.filterChipsExpanded !== false; // Default to expanded
  const toggleIcon = expanded ? '▼' : '▶';
  const sectionClass = expanded ? 'expanded' : '';

  const allActive = isFilterActive('all');
  const allChipClass = allActive ? 'active' : '';

  const categoryChips = state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(cat => {
      const active = isFilterActive(cat.id);
      const count = state.bookmarks.filter(b => b.category === cat.id).length;
      return `
        <button class="filter-chip ${active ? 'active' : ''}" data-category-id="${cat.id}">
          ${escapeHtml(cat.name)} <span class="chip-count">${count}</span>
        </button>
      `;
    }).join('');

  return `
    <div class="filter-section ${sectionClass}">
      <div class="filter-section-header" id="filter-section-toggle">
        <span class="toggle-icon">${toggleIcon}</span>
        <span>Filter by Category</span>
      </div>
      <div class="filter-section-content">
        <div class="filter-chips">
          <button class="filter-chip ${allChipClass}" data-category-id="all">All</button>
          ${categoryChips}
        </div>
      </div>
    </div>
  `;
}

function renderManageCategories(): string {
  if (!state.manageCategoriesExpanded) {
    return ''; // Hidden when collapsed
  }

  const categoriesHtml = state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter(cat => cat.id !== UNCATEGORIZED_ID) // Don't show Uncategorized in management
    .map(cat => {
      const count = state.bookmarks.filter(b => b.category === cat.id).length;
      return `
        <div class="category-item" data-category-id="${cat.id}">
          <span class="category-drag-handle">≡</span>
          <span class="category-name">${escapeHtml(cat.name)}</span>
          <span class="category-count">(${count})</span>
          <button class="category-delete" title="Delete category">×</button>
        </div>
      `;
    }).join('');

  return `
    <div class="manage-categories">
      <div class="categories-list" id="categories-list">
        ${categoriesHtml}
      </div>
      <button class="add-category-btn" id="add-category-btn">＋ Add Category</button>
    </div>
  `;
}

function renderBookmarksList(): string {
  const filteredBookmarks = getFilteredBookmarks();

  if (filteredBookmarks.length === 0) {
    return `
      <div class="bookmarks-empty">
        <div class="empty-icon">★</div>
        <div class="empty-text">No bookmarks yet</div>
        <div class="empty-hint">Click "★ Add Current Page" to save this page</div>
      </div>
    `;
  }

  // Group by category
  const grouped = groupBookmarksByCategory(filteredBookmarks);

  const groupsHtml = state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(category => {
      const bookmarks = grouped.get(category.id) || [];
      if (bookmarks.length === 0) return '';

      const bookmarksHtml = bookmarks.map(bookmark => renderBookmark(bookmark)).join('');

      return `
        <div class="bookmark-group">
          <div class="bookmark-group-header">${escapeHtml(category.name)}</div>
          ${bookmarksHtml}
        </div>
      `;
    })
    .filter(html => html)
    .join('');

  return `<div class="bookmarks-list">${groupsHtml}</div>`;
}

function renderBookmark(bookmark: Bookmark): string {
  const relativeTime = formatRelativeTime(bookmark.timestampModified);
  const category = state.categories.find(c => c.id === bookmark.category);
  const categoryName = category ? category.name : 'Uncategorized';

  return `
    <div class="bookmark-item" data-bookmark-id="${bookmark.id}">
      <div class="bookmark-main">
        <span class="bookmark-icon">★</span>
        <div class="bookmark-info">
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
          <div class="bookmark-meta">${escapeHtml(bookmark.source)} • ${escapeHtml(categoryName)} • ${escapeHtml(relativeTime)}</div>
        </div>
      </div>
      <div class="bookmark-actions">
        <button class="bookmark-edit" data-bookmark-id="${bookmark.id}" title="Edit">✎</button>
        <button class="bookmark-delete" data-bookmark-id="${bookmark.id}" title="Delete">×</button>
      </div>
    </div>
  `;
}

function renderBookmarkEdit(bookmark: Bookmark): string {
  const categoryOptions = state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(cat => `<option value="${cat.id}" ${cat.id === bookmark.category ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`)
    .join('');

  return `
    <div class="bookmark-item editing" data-bookmark-id="${bookmark.id}">
      <div class="bookmark-edit-form">
        <input type="text" class="bookmark-title-input" value="${escapeHtml(bookmark.title)}" placeholder="Bookmark title">
        <div class="bookmark-category-select">
          <select class="category-dropdown">
            ${categoryOptions}
          </select>
          <input type="text" class="category-input" placeholder="Or type new category..." style="display: none;">
        </div>
        <div class="bookmark-edit-actions">
          <button class="bookmark-save" data-bookmark-id="${bookmark.id}">✓ Save</button>
          <button class="bookmark-cancel" data-bookmark-id="${bookmark.id}">✗ Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function renderStyles(): string {
  return `
    <style>
      .bookmarks-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        gap: 12px;
        padding: 12px;
      }

      /* Header */
      .bookmarks-header {
        display: flex;
        gap: 8px;
      }
      .bookmarks-add-btn {
        background: var(--accent-cyan);
        color: var(--bg-primary);
        border: none;
        padding: 10px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.9em;
        font-weight: 600;
        transition: background 0.2s;
      }
      .bookmarks-add-btn:hover {
        background: var(--accent-blue);
      }
      .manage-categories-btn {
        background: var(--bg-secondary);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        padding: 10px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.9em;
        transition: all 0.2s;
      }
      .manage-categories-btn:hover {
        background: var(--bg-primary);
        border-color: var(--accent-cyan);
        color: var(--accent-cyan);
      }

      /* Filter Section */
      .filter-section {
        border: 1px solid var(--border-color);
        border-radius: 4px;
        overflow: hidden;
      }
      .filter-section-header {
        background: var(--bg-secondary);
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85em;
        font-weight: 600;
        transition: background 0.2s;
        user-select: none;
      }
      .filter-section-header:hover {
        background: var(--bg-primary);
      }
      .filter-section-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.2s ease;
      }
      .filter-section.expanded .filter-section-content {
        max-height: 200px;
        padding: 12px;
      }
      .filter-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .filter-chip {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 4px 10px;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.8em;
        transition: all 0.2s;
      }
      .filter-chip:hover {
        background: var(--bg-primary);
        border-color: var(--accent-cyan);
      }
      .filter-chip.active {
        background: var(--accent-cyan);
        color: var(--bg-primary);
        border-color: var(--accent-cyan);
      }
      .chip-count {
        opacity: 0.7;
        font-size: 0.9em;
      }

      /* Manage Categories */
      .manage-categories {
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 8px;
      }
      .categories-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 8px;
      }
      .category-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: var(--bg-secondary);
        border-radius: 4px;
        transition: background 0.2s;
      }
      .category-item:hover {
        background: var(--bg-primary);
      }
      .category-item:hover .category-delete {
        opacity: 1;
      }
      .category-drag-handle {
        color: var(--text-secondary);
        cursor: grab;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .category-item:hover .category-drag-handle {
        opacity: 1;
      }
      .category-item.dragging {
        opacity: 0.5;
        cursor: grabbing;
      }
      .category-item.drag-over-top::before,
      .category-item.drag-over-bottom::after {
        content: '';
        display: block;
        height: 2px;
        background: var(--accent-cyan);
        margin: 0 -8px;
      }
      .category-name {
        flex: 1;
        color: var(--text-primary);
        font-size: 0.85em;
        cursor: text;
      }
      .category-count {
        color: var(--text-secondary);
        font-size: 0.8em;
      }
      .category-delete {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.2em;
        padding: 2px 6px;
        opacity: 0;
        transition: all 0.2s;
      }
      .category-delete:hover {
        color: var(--accent-red);
      }
      .add-category-btn {
        background: var(--bg-secondary);
        border: 1px dashed var(--border-color);
        color: var(--text-secondary);
        padding: 8px;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.85em;
        width: 100%;
        transition: all 0.2s;
      }
      .add-category-btn:hover {
        background: var(--bg-primary);
        border-color: var(--accent-cyan);
        color: var(--accent-cyan);
      }
      .category-input-new {
        padding: 8px;
        background: var(--bg-primary);
        border: 1px solid var(--accent-cyan);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.85em;
        border-radius: 4px;
        outline: none;
        width: 100%;
      }

      /* Bookmarks List */
      .bookmarks-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .bookmarks-list::-webkit-scrollbar {
        width: 6px;
      }
      .bookmarks-list::-webkit-scrollbar-track {
        background: var(--bg-secondary);
      }
      .bookmarks-list::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
      }
      .bookmark-group-header {
        font-size: 0.75em;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
        padding-left: 4px;
      }
      .bookmark-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 8px;
        border-bottom: 1px solid var(--bg-primary);
        transition: background 0.2s;
        cursor: pointer;
      }
      .bookmark-item:hover {
        background: var(--bg-primary);
      }
      .bookmark-item:hover .bookmark-actions {
        opacity: 1;
      }
      .bookmark-main {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .bookmark-icon {
        color: var(--accent-cyan);
        font-size: 1em;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .bookmark-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;
      }
      .bookmark-title {
        color: var(--text-primary);
        font-size: 0.9em;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bookmark-item:hover .bookmark-title {
        color: var(--accent-blue);
      }
      .bookmark-meta {
        color: var(--text-secondary);
        font-size: 0.75em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bookmark-actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .bookmark-edit,
      .bookmark-delete {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.1em;
        padding: 2px 6px;
        transition: color 0.2s;
      }
      .bookmark-edit:hover {
        color: var(--accent-cyan);
      }
      .bookmark-delete:hover {
        color: var(--accent-red);
      }

      /* Edit Mode */
      .bookmark-item.editing {
        background: var(--bg-primary);
        flex-direction: column;
        align-items: stretch;
        cursor: default;
        padding: 12px;
      }
      .bookmark-edit-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bookmark-title-input {
        padding: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.9em;
        border-radius: 4px;
        outline: none;
      }
      .bookmark-title-input:focus {
        border-color: var(--accent-cyan);
      }
      .bookmark-category-select {
        display: flex;
        gap: 4px;
      }
      .category-dropdown,
      .category-input {
        padding: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 0.85em;
        border-radius: 4px;
        outline: none;
        flex: 1;
      }
      .category-dropdown:focus,
      .category-input:focus {
        border-color: var(--accent-cyan);
      }
      .bookmark-edit-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .bookmark-save,
      .bookmark-cancel {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.85em;
        transition: background 0.2s;
      }
      .bookmark-save {
        background: var(--accent-cyan);
        color: var(--bg-primary);
      }
      .bookmark-save:hover {
        background: var(--accent-blue);
      }
      .bookmark-cancel {
        background: var(--bg-secondary);
        color: var(--text-secondary);
      }
      .bookmark-cancel:hover {
        background: var(--bg-primary);
      }

      /* Empty State */
      .bookmarks-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: var(--text-secondary);
        padding: 40px 20px;
      }
      .empty-icon {
        font-size: 3em;
        opacity: 0.3;
      }
      .empty-text {
        font-size: 0.95em;
      }
      .empty-hint {
        font-size: 0.85em;
        opacity: 0.7;
      }
    </style>
  `;
}

// Helper Functions

function getFilteredBookmarks(): Bookmark[] {
  if (state.activeFilters.length === 0) {
    return state.bookmarks;
  }
  return state.bookmarks.filter(b => state.activeFilters.includes(b.category));
}

function groupBookmarksByCategory(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
  const grouped = new Map<string, Bookmark[]>();

  bookmarks.forEach(bookmark => {
    const categoryId = bookmark.category;
    if (!grouped.has(categoryId)) {
      grouped.set(categoryId, []);
    }
    grouped.get(categoryId)!.push(bookmark);
  });

  // Sort bookmarks within each category by timestampModified (most recent first)
  grouped.forEach(bookmarks => {
    bookmarks.sort((a, b) => b.timestampModified - a.timestampModified);
  });

  return grouped;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return 'over a week ago';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function refreshWindow(): void {
  const event = new CustomEvent('plugin-window-refresh', { detail: { pluginId: 'bookmarks' } });
  document.dispatchEvent(event);
}

// Event Handlers

function setupDelegatedHandlers(): void {
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Custom events
  document.addEventListener('bookmark-edit', ((e: CustomEvent) => {
    const { bookmarkId } = e.detail;
    enterEditMode(bookmarkId);
  }) as EventListener);
}

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Add bookmark button
  if (target.id === 'add-bookmark-btn' || target.closest('#add-bookmark-btn')) {
    e.preventDefault();
    addCurrentPage();
    return;
  }

  // Filter chips
  if (target.closest('.filter-chip')) {
    e.preventDefault();
    const chip = target.closest('.filter-chip') as HTMLElement;
    const categoryId = chip.dataset.categoryId!;
    toggleFilter(categoryId);
    return;
  }

  // Filter section toggle
  if (target.id === 'filter-section-toggle' || target.closest('#filter-section-toggle')) {
    e.preventDefault();
    state.filterChipsExpanded = !state.filterChipsExpanded;
    saveState();
    refreshWindow();
    return;
  }

  // Manage categories button
  if (target.id === 'manage-categories-btn' || target.closest('#manage-categories-btn')) {
    e.preventDefault();
    state.manageCategoriesExpanded = !state.manageCategoriesExpanded;
    refreshWindow();
    return;
  }

  // Add category button
  if (target.id === 'add-category-btn' || target.closest('#add-category-btn')) {
    e.preventDefault();
    enterAddCategoryMode();
    return;
  }

  // Category delete
  if (target.closest('.category-delete')) {
    e.preventDefault();
    e.stopPropagation();
    const btn = target.closest('.category-delete') as HTMLElement;
    const item = btn.closest('.category-item') as HTMLElement;
    const categoryId = item.dataset.categoryId!;
    if (confirm('Delete this category? Bookmarks will be moved to Uncategorized.')) {
      deleteCategory(categoryId);
    }
    return;
  }

  // Bookmark navigation (click on bookmark item, but not on actions)
  if (target.closest('.bookmark-item') && !target.closest('.bookmark-actions') && !target.closest('.bookmark-item.editing')) {
    e.preventDefault();
    const item = target.closest('.bookmark-item') as HTMLElement;
    const bookmarkId = item.dataset.bookmarkId!;
    navigateToBookmark(bookmarkId);
    return;
  }

  // Bookmark edit
  if (target.closest('.bookmark-edit')) {
    e.preventDefault();
    e.stopPropagation();
    const btn = target.closest('.bookmark-edit') as HTMLElement;
    const bookmarkId = btn.dataset.bookmarkId!;
    enterEditMode(bookmarkId);
    return;
  }

  // Bookmark delete
  if (target.closest('.bookmark-delete')) {
    e.preventDefault();
    e.stopPropagation();
    const btn = target.closest('.bookmark-delete') as HTMLElement;
    const bookmarkId = btn.dataset.bookmarkId!;
    if (confirm('Delete this bookmark?')) {
      deleteBookmark(bookmarkId);
    }
    return;
  }

  // Bookmark save
  if (target.closest('.bookmark-save')) {
    e.preventDefault();
    const btn = target.closest('.bookmark-save') as HTMLElement;
    const bookmarkId = btn.dataset.bookmarkId!;
    saveBookmarkEdit(bookmarkId);
    return;
  }

  // Bookmark cancel
  if (target.closest('.bookmark-cancel')) {
    e.preventDefault();
    const btn = target.closest('.bookmark-cancel') as HTMLElement;
    cancelEditMode();
    return;
  }

  // Category name click (edit inline)
  if (target.closest('.category-name')) {
    e.preventDefault();
    const nameEl = target.closest('.category-name') as HTMLElement;
    const item = nameEl.closest('.category-item') as HTMLElement;
    const categoryId = item.dataset.categoryId!;
    enterRenameCategoryMode(categoryId, nameEl);
    return;
  }
}

function handleKeydown(e: KeyboardEvent): void {
  // Category input - Enter to save, Escape to cancel
  const categoryInput = document.querySelector('.category-input-new') as HTMLInputElement;
  if (categoryInput && document.activeElement === categoryInput) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = categoryInput.value.trim();
      if (name) {
        addCategory(name);
      } else {
        refreshWindow();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      refreshWindow();
    }
  }
}

// UI Operations

function addCurrentPage(): void {
  // Get current page info from window location and DOM
  const currentUrl = window.location.hash;

  // Try to extract page info from the global context
  let title = '';
  let source = 'local';
  let filename = '';

  // Try to get title from the page
  const h1 = document.querySelector('#content h1');
  if (h1) {
    title = h1.textContent || '';
  }

  // Fallback to URL-based title
  if (!title && currentUrl) {
    const parts = currentUrl.replace('#', '').split('/');
    const lastPart = parts[parts.length - 1] || parts[parts.length - 2] || 'page';
    title = lastPart.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    filename = currentUrl.replace('#', '');
  }

  if (!currentUrl || currentUrl === '#') {
    alert('No page to bookmark');
    return;
  }

  addBookmark(currentUrl, title, source, filename);
}

function navigateToBookmark(bookmarkId: string): void {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (bookmark) {
    window.location.hash = bookmark.url;
  }
}

function enterEditMode(bookmarkId: string): void {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  // Re-render just this bookmark in edit mode
  const item = document.querySelector(`.bookmark-item[data-bookmark-id="${bookmarkId}"]`);
  if (item) {
    item.outerHTML = renderBookmarkEdit(bookmark);

    // Focus title input
    setTimeout(() => {
      const input = document.querySelector('.bookmark-title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }
}

function cancelEditMode(): void {
  refreshWindow();
}

function saveBookmarkEdit(bookmarkId: string): void {
  const titleInput = document.querySelector('.bookmark-title-input') as HTMLInputElement;
  const categoryDropdown = document.querySelector('.category-dropdown') as HTMLSelectElement;

  if (!titleInput || !categoryDropdown) return;

  const newTitle = titleInput.value.trim();
  const newCategory = categoryDropdown.value;

  if (!newTitle) {
    alert('Title cannot be empty');
    return;
  }

  updateBookmark(bookmarkId, {
    title: newTitle,
    category: newCategory
  });
}

function enterAddCategoryMode(): void {
  const btn = document.getElementById('add-category-btn');
  if (!btn) return;

  // Replace button with input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'category-input-new';
  input.placeholder = 'Category name...';

  btn.replaceWith(input);
  input.focus();
}

function enterRenameCategoryMode(categoryId: string, nameEl: HTMLElement): void {
  const currentName = nameEl.textContent || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'category-input-new';
  input.style.width = '100%';

  const saveRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      renameCategory(categoryId, newName);
    } else {
      refreshWindow();
    }
  };

  input.addEventListener('blur', saveRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      refreshWindow();
    }
  });

  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

// Category Drag and Drop

function handleMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;

  if (target.closest('.category-drag-handle')) {
    const handle = target.closest('.category-drag-handle');
    const item = handle!.closest('.category-item') as HTMLElement;
    const categoryId = item.dataset.categoryId!;

    dragState = {
      categoryId,
      element: item,
      startY: e.clientY,
      currentY: e.clientY,
      hasMoved: false
    };
  }
}

function handleMouseMove(e: MouseEvent): void {
  if (!dragState) return;

  dragState.currentY = e.clientY;
  const deltaY = Math.abs(e.clientY - dragState.startY);

  if (deltaY > 5 && !dragState.hasMoved) {
    dragState.hasMoved = true;
    dragState.element.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
  }

  if (dragState.hasMoved) {
    updateDragIndicator(e.clientY);
  }
}

function handleMouseUp(e: MouseEvent): void {
  if (!dragState) return;

  if (dragState.hasMoved) {
    performCategoryReorder();
  }

  // Cleanup
  dragState.element.classList.remove('dragging');
  document.body.style.cursor = '';

  // Remove drag indicators
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  dragState = null;
}

function updateDragIndicator(clientY: number): void {
  if (!dragState) return;

  const items = Array.from(document.querySelectorAll('.category-item')) as HTMLElement[];

  // Remove all indicators
  items.forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  // Find target position
  for (const item of items) {
    if (item === dragState.element) continue;

    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (clientY >= rect.top && clientY < midY) {
      item.classList.add('drag-over-top');
      break;
    } else if (clientY >= midY && clientY <= rect.bottom) {
      item.classList.add('drag-over-bottom');
      break;
    }
  }
}

function performCategoryReorder(): void {
  if (!dragState) return;

  const items = Array.from(document.querySelectorAll('.category-item')) as HTMLElement[];

  let targetIndex = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === dragState.element) continue;

    if (item.classList.contains('drag-over-top')) {
      targetIndex = i;
      break;
    } else if (item.classList.contains('drag-over-bottom')) {
      targetIndex = i + 1;
      break;
    }
  }

  if (targetIndex !== -1) {
    // Adjust for the dragged item's current position
    const currentIndex = items.indexOf(dragState.element);
    if (currentIndex < targetIndex) {
      targetIndex--;
    }

    reorderCategories(dragState.categoryId, targetIndex);
  }
}
