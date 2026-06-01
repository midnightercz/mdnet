// Browsing History Plugin
// Tracks navigation history with configurable limit and localStorage persistence

interface HistoryEntry {
  fullUrl: string;
  source: string;
  filename: string;
  anchor: string;
  title: string;
  timestamp: number;
}

interface HistoryConfig {
  historyLimit: number;
}

let config: HistoryConfig = { historyLimit: 20 };
let history: HistoryEntry[] = [];
const STORAGE_KEY = 'mdnet-plugin-history-browsing-history';

export function onInit(initialConfig: any): void {
  config = { ...config, ...initialConfig };
  loadHistory();

  // Listen for page navigation events
  document.addEventListener('page-loaded', ((e: CustomEvent) => {
    const { fullUrl, source, filename, anchor, title } = e.detail;
    addToHistory({ fullUrl, source, filename, anchor, title, timestamp: Date.now() });
  }) as EventListener);

  console.log('Browsing History plugin initialized');
}

export async function onWindowRender(): Promise<string> {
  if (history.length === 0) {
    return `
      <div style="padding: 30px; text-align: center; color: var(--text-secondary);">
        <div style="font-size: 3em; margin-bottom: 15px;">🕒</div>
        <div style="font-size: 0.95em;">No browsing history yet</div>
        <div style="font-size: 0.85em; margin-top: 8px; opacity: 0.7;">Navigate to pages to build your history</div>
      </div>
    `;
  }

  const currentUrl = window.location.hash;

  const entriesHtml = history.map((entry, index) => {
    const isCurrent = currentUrl === entry.fullUrl;
    const relativeTime = formatRelativeTime(entry.timestamp);
    const absoluteTime = formatAbsoluteTime(entry.timestamp);

    return `
      <div class="history-entry ${isCurrent ? 'current' : ''}" data-index="${index}">
        <div class="history-entry-main">
          ${isCurrent ? '<span class="history-current-indicator">●</span>' : '<span class="history-icon">📄</span>'}
          <a href="${escapeHtml(entry.fullUrl)}" class="history-link" data-url="${escapeHtml(entry.fullUrl)}">
            <div class="history-title">${escapeHtml(entry.title)}</div>
            <div class="history-meta" title="${escapeHtml(absoluteTime)}">
              ${escapeHtml(entry.source)} • ${escapeHtml(relativeTime)}
            </div>
          </a>
        </div>
        <button class="history-delete" data-index="${index}" title="Remove from history">×</button>
      </div>
    `;
  }).join('');

  return `
    <div class="history-container">
      <div class="history-list">
        ${entriesHtml}
      </div>
      <div class="history-footer">
        <button class="history-clear-btn" id="clear-history-btn">Clear All History</button>
      </div>
    </div>

    <style>
      .history-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      }
      .history-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      .history-list::-webkit-scrollbar {
        width: 6px;
      }
      .history-list::-webkit-scrollbar-track {
        background: var(--bg-secondary);
      }
      .history-list::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
      }
      .history-entry {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 8px;
        border-bottom: 1px solid var(--bg-primary);
        transition: background 0.2s;
        position: relative;
      }
      .history-entry:hover {
        background: var(--bg-primary);
      }
      .history-entry:hover .history-delete {
        opacity: 1;
      }
      .history-entry.current {
        background: rgba(42, 161, 152, 0.1);
      }
      .history-entry-main {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .history-icon {
        font-size: 1em;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .history-current-indicator {
        color: var(--accent-cyan);
        font-size: 1.2em;
        flex-shrink: 0;
        margin-top: 0;
      }
      .history-link {
        display: flex;
        flex-direction: column;
        gap: 4px;
        text-decoration: none;
        color: inherit;
        flex: 1;
        min-width: 0;
      }
      .history-link:hover .history-title {
        color: var(--accent-blue);
        text-decoration: underline;
      }
      .history-title {
        color: var(--text-primary);
        font-size: 0.9em;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-meta {
        color: var(--text-secondary);
        font-size: 0.75em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-delete {
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.2em;
        padding: 2px 6px;
        opacity: 0;
        transition: opacity 0.2s, color 0.2s;
        flex-shrink: 0;
      }
      .history-delete:hover {
        color: var(--accent-red);
      }
      .history-footer {
        padding: 12px;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: center;
      }
      .history-clear-btn {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 0.85em;
        transition: background 0.2s, color 0.2s;
      }
      .history-clear-btn:hover {
        background: var(--accent-red);
        color: var(--bg-primary);
        border-color: var(--accent-red);
      }
    </style>
  `;
}

export function onWindowOpen(): void {
  // Set up event listeners for history management
  const handleDelete = ((e: CustomEvent) => {
    const { index } = e.detail;
    deleteEntry(index);
    refreshWindow();
  }) as EventListener;

  const handleClearAll = (() => {
    clearAllHistory();
    refreshWindow();
  }) as EventListener;

  document.addEventListener('history-delete-entry', handleDelete);
  document.addEventListener('history-clear-all', handleClearAll);

  // Set up delegated click handlers for dynamically rendered content
  setupDelegatedHandlers();

  // Store cleanup function
  (window as any)._historyCleanup = () => {
    document.removeEventListener('history-delete-entry', handleDelete);
    document.removeEventListener('history-clear-all', handleClearAll);
  };
}

function setupDelegatedHandlers(): void {
  // Use event delegation on the document to handle clicks on dynamically rendered elements
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Handle history link clicks
    if (target.closest('.history-link')) {
      e.preventDefault();
      const link = target.closest('.history-link') as HTMLElement;
      const url = link.getAttribute('data-url');
      if (url) {
        window.location.hash = url;
      }
      return;
    }

    // Handle delete button clicks
    if (target.closest('.history-delete')) {
      e.stopPropagation();
      const btn = target.closest('.history-delete') as HTMLElement;
      const index = parseInt(btn.getAttribute('data-index') || '0');
      const event = new CustomEvent('history-delete-entry', { detail: { index } });
      document.dispatchEvent(event);
      return;
    }

    // Handle clear all button clicks
    if (target.id === 'clear-history-btn' || target.closest('#clear-history-btn')) {
      if (confirm('Clear all browsing history?')) {
        const event = new CustomEvent('history-clear-all');
        document.dispatchEvent(event);
      }
      return;
    }
  });
}

export function onWindowClose(): void {
  // Cleanup event listeners
  if ((window as any)._historyCleanup) {
    (window as any)._historyCleanup();
    delete (window as any)._historyCleanup;
  }
}

export function onConfigUpdate(newConfig: any): void {
  const oldLimit = config.historyLimit;
  config = { ...config, ...newConfig };

  // If limit decreased, trim history
  if (config.historyLimit < oldLimit && history.length > config.historyLimit) {
    history = history.slice(0, config.historyLimit);
    saveHistory();
    refreshWindow();
  }
}

export function onTerminate(): void {
  console.log('Browsing History plugin terminated');
}

// Helper functions

function addToHistory(entry: HistoryEntry): void {
  // Check if entry already exists (by fullUrl including anchor)
  const existingIndex = history.findIndex(e => e.fullUrl === entry.fullUrl);

  if (existingIndex !== -1) {
    // Remove existing entry
    history.splice(existingIndex, 1);
  }

  // Add to top
  history.unshift(entry);

  // Trim to limit
  if (history.length > config.historyLimit) {
    history = history.slice(0, config.historyLimit);
  }

  saveHistory();
  refreshWindow();
}

function deleteEntry(index: number): void {
  if (index >= 0 && index < history.length) {
    history.splice(index, 1);
    saveHistory();
  }
}

function clearAllHistory(): void {
  history = [];
  saveHistory();
}

function loadHistory(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      history = JSON.parse(stored);
      // Validate and trim to current limit
      if (history.length > config.historyLimit) {
        history = history.slice(0, config.historyLimit);
        saveHistory();
      }
    }
  } catch (error) {
    console.error('Failed to load browsing history:', error);
    history = [];
  }
}

function saveHistory(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save browsing history:', error);
  }
}

function refreshWindow(): void {
  // Trigger window re-render
  const event = new CustomEvent('plugin-window-refresh', { detail: { pluginId: 'browsing-history' } });
  document.dispatchEvent(event);
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return 'over a week ago';
}

function formatAbsoluteTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
