import { renderMarkdown, getFrontMatter } from './markdown-renderer';
import { PluginManager } from './plugin-manager';
import { getProvider } from './git-providers/registry';
import { openSourceMap } from './source-map';
import { DockManager } from './dock-manager';
import { imageCache } from './image-cache';

// Global declarations
declare global {
  interface Window {
    pluginManager: PluginManager;
    dockManager: DockManager;
  }
}

// Source configuration interface
interface Source {
  name: string;
  enabled: boolean;

  // For regular (public) sources
  indexUrl?: string;
  contentBaseUrl?: string;

  // For private sources
  private?: {
    provider: 'github' | 'gitlab' | 'gitea';
    repoUrl: string;
    branch: string;
    indexPath: string;
    contentBase: string; // relative path (editable) or full URL (read-only)
    token?: string;
  };

  // Legacy field for migration
  editable?: {
    provider: 'github' | 'gitlab' | 'gitea';
    repoUrl: string;
    branch: string;
    basePath?: string;
    token?: string;
  };
}

const SOURCES_STORAGE_KEY = 'mdnet-sources';
const EDITING_PAGES_STORAGE_KEY = 'mdnet-editing-pages';

// Editing page data interface
interface EditingPageData {
  content: string;
  originalSource: string;
  timestamp: string;
  commitMessage: string;
}

// DOM elements
let contentElement: HTMLElement;
let errorElement: HTMLElement;
let layoutToggleElement: HTMLElement;
let themeToggleElement: HTMLElement;
let searchToggleElement: HTMLElement;
let sourceMapToggleElement: HTMLElement;
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
let settingsTabElements: NodeListOf<HTMLElement>;
let settingsNestedTabElements: NodeListOf<HTMLElement>;
let editingTabElement: HTMLElement;
let editingTabCountElement: HTMLElement;
let sourcesMainTabContentElement: HTMLElement;
let sourcesListTabContentElement: HTMLElement;
let addSourceTabContentElement: HTMLElement;
let editingTabContentElement: HTMLElement;
let pluginsMainTabContentElement: HTMLElement;
let themesMainTabContentElement: HTMLElement;
let addSourceBtnElement: HTMLButtonElement;
let pluginListElement: HTMLElement;
let panelToggleElement: HTMLElement;
let toggleButtonsElement: HTMLElement;
let metadataToggleElement: HTMLElement;
let asideToggleElement: HTMLElement;
let editModalElement: HTMLElement;
let editTextareaElement: HTMLTextAreaElement;
let editFilenameElement: HTMLElement;
let editSourceNameElement: HTMLElement;
let closeEditElement: HTMLElement;
let editCancelBtnElement: HTMLButtonElement;
let editSaveBtnElement: HTMLButtonElement;
let editSaveCloseBtnElement: HTMLButtonElement;
let editViewBtnElement: HTMLButtonElement;
let editActionsElement: HTMLElement;
let editActionsRegularElement: HTMLElement;
let editActionsEditingElement: HTMLElement;
let editPageBtnElement: HTMLButtonElement;
let editPageEditingBtnElement: HTMLButtonElement;
let publishPageBtnElement: HTMLButtonElement;
let commitMessageInputElement: HTMLInputElement;
let commitMessageCounterElement: HTMLElement;
let publishErrorModalElement: HTMLElement;
let publishErrorMessageElement: HTMLElement;
let publishErrorDetailsElement: HTMLElement;
let publishUpdateTokenBtnElement: HTMLButtonElement;
let publishRetryBtnElement: HTMLButtonElement;
let publishCancelBtnElement: HTMLButtonElement;
let closePublishErrorElement: HTMLElement;
let publishSuccessModalElement: HTMLElement;
let publishSuccessLinkElement: HTMLElement;
let regularSourceFieldsElement: HTMLElement;
let privateToggleElement: HTMLInputElement;
let privateSourceFieldsElement: HTMLElement;
let sourceProviderElement: HTMLSelectElement;
let sourceRepoUrlElement: HTMLInputElement;
let sourceBranchElement: HTMLInputElement;
let sourceIndexPathElement: HTMLInputElement;
let sourceContentBaseElement: HTMLInputElement;
let contentBaseIndicatorElement: HTMLElement;
let contentBaseIconElement: HTMLElement;
let contentBaseTextElement: HTMLElement;
let sourceTokenElement: HTMLInputElement;
let validateTokenBtnElement: HTMLButtonElement;
let tokenInstructionsLinkElement: HTMLAnchorElement;
let tokenValidationResultElement: HTMLElement;
let editingNotificationBarElement: HTMLElement;
let editingPageCountElement: HTMLElement;
let editingNotificationCloseElement: HTMLElement;
let newPageToggleElement: HTMLElement;
let newPageModalElement: HTMLElement;
let closeNewPageElement: HTMLElement;
let newPageStep1Element: HTMLElement;
let newPageStep2Element: HTMLElement;
let newPageSourceListElement: HTMLElement;
let newPageCancelBtnElement: HTMLButtonElement;
let newPageNextBtnElement: HTMLButtonElement;
let newPageBackBtnElement: HTMLButtonElement;
let newPageCreateBtnElement: HTMLButtonElement;
let newPageSelectedSourceNameElement: HTMLElement;
let newPageFilenameElement: HTMLInputElement;
let newPageFilenameErrorElement: HTMLElement;
let newPageFilenamePreviewElement: HTMLElement;
let newPageContentElement: HTMLTextAreaElement;
let pluginDashboardToggleElement: HTMLElement;
let leftPanelToggleElement: HTMLElement;
let leftToggleButtonsElement: HTMLElement;
let exportSourcesBtnElement: HTMLButtonElement;
let importSourcesBtnElement: HTMLButtonElement;
let importSourcesModalElement: HTMLElement;
let closeImportModalElement: HTMLElement;
let importMethodRadios: NodeListOf<HTMLInputElement>;
let importFileSectionElement: HTMLElement;
let importUrlSectionElement: HTMLElement;
let importFileInputElement: HTMLInputElement;
let importUrlInputElement: HTMLInputElement;
let importFileBtnElement: HTMLButtonElement;
let importUrlBtnElement: HTMLButtonElement;
let importStatusElement: HTMLElement;

// Dock manager
let dockManager: DockManager;

// Notification bar state
let editingNotificationDismissed: boolean = false;

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

// Edit modal state
let editingFilename: string = '';
let editingSourceName: string = '';
let editingOriginalContent: string = '';
let editingHasChanges: boolean = false;

// New page modal state
let newPageSelectedSource: string = '';
let newPageCurrentStep: number = 1;

// Source management functions
// Migrate old source format to new format
function migrateSource(source: Source): Source {
  // Already migrated or is a virtual editing source
  if (!source.editable || source.private) {
    return source;
  }

  // Migrate from old editable format to new private format
  const migrated: Source = {
    name: source.name,
    enabled: source.enabled,
    private: {
      provider: source.editable.provider,
      repoUrl: source.editable.repoUrl,
      branch: source.editable.branch,
      indexPath: 'search-index.json', // Default, old indexUrl was unused
      contentBase: source.editable.basePath || './', // Use old basePath
      token: source.editable.token
    }
  };

  // Remove legacy editable field
  delete migrated.editable;

  return migrated;
}

function loadSources(): Source[] {
  const stored = localStorage.getItem(SOURCES_STORAGE_KEY);
  const configuredSources: Source[] = stored ? JSON.parse(stored) : [];

  // Migrate old sources
  const migratedSources = configuredSources.map(migrateSource);

  // Save migrated sources if any changes were made
  const hasLegacy = configuredSources.some(s => s.editable);
  if (hasLegacy) {
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(migratedSources));
  }

  // Add virtual editing sources
  const editingPages = loadEditingPages();
  const editingSourceNames = new Set<string>();

  for (const key of Object.keys(editingPages)) {
    const [sourceName] = key.split('/');
    editingSourceNames.add(`editing-${sourceName}`);
  }

  const editingSources: Source[] = Array.from(editingSourceNames).map(name => ({
    name,
    indexUrl: '', // Not used for editing sources
    contentBaseUrl: '', // Not used
    enabled: true
  }));

  return [...migratedSources, ...editingSources];
}

function saveSources(sources: Source[]): void {
  // Filter out virtual editing sources before saving
  const configuredSources = sources.filter(s => !s.name.startsWith('editing-'));
  localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(configuredSources));
}

// Helper functions
function isFullUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

function isSourceEditable(source: Source): boolean {
  if (!source.private) return false;
  return !isFullUrl(source.private.contentBase);
}

// Form state management
let savedRegularFields = { indexUrl: '', contentBaseUrl: '' };
let savedPrivateFields = { provider: '', repoUrl: '', branch: '', indexPath: '', contentBase: '', token: '' };

function updateContentBaseIndicator(): void {
  const contentBase = sourceContentBaseElement.value.trim();

  if (!contentBase) {
    contentBaseIndicatorElement.style.display = 'none';
    return;
  }

  contentBaseIndicatorElement.style.display = 'flex';

  if (isFullUrl(contentBase)) {
    contentBaseIconElement.textContent = '👁️';
    contentBaseTextElement.textContent = 'Read-only (content from external URL)';
    contentBaseTextElement.style.color = 'var(--text-secondary)';
  } else {
    contentBaseIconElement.textContent = '✏️';
    contentBaseTextElement.textContent = 'Editable (content from repository)';
    contentBaseTextElement.style.color = 'var(--accent-green)';
  }
}

// Editing pages management functions
function loadEditingPages(): Record<string, EditingPageData> {
  const stored = localStorage.getItem(EDITING_PAGES_STORAGE_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function saveEditingPages(pages: Record<string, EditingPageData>): void {
  localStorage.setItem(EDITING_PAGES_STORAGE_KEY, JSON.stringify(pages));
}

function saveEditingPage(key: string, data: EditingPageData): void {
  const pages = loadEditingPages();
  pages[key] = data;
  saveEditingPages(pages);
}

function getEditingPage(key: string): EditingPageData | null {
  const pages = loadEditingPages();
  return pages[key] || null;
}

function removeEditingPage(key: string): void {
  const pages = loadEditingPages();
  delete pages[key];
  saveEditingPages(pages);
}

function getEditingSourcePages(sourceName: string): Record<string, EditingPageData> {
  const pages = loadEditingPages();
  const result: Record<string, EditingPageData> = {};
  const prefix = `${sourceName}/`;

  for (const [key, data] of Object.entries(pages)) {
    if (key.startsWith(prefix)) {
      result[key] = data;
    }
  }

  return result;
}

function clearEditingSource(sourceName: string): void {
  const pages = loadEditingPages();
  const keysToRemove = Object.keys(pages).filter(key => key.startsWith(`${sourceName}/`));
  keysToRemove.forEach(key => delete pages[key]);
  saveEditingPages(pages);
}

// Edit modal functions
function openEditModal(sourceName: string, filename: string, content: string) {
  editingSourceName = sourceName;
  editingFilename = filename;
  editingOriginalContent = content;
  editingHasChanges = false;

  editFilenameElement.textContent = `Editing: ${filename}.md`;
  editSourceNameElement.textContent = `Source: ${sourceName}`;
  editTextareaElement.value = content;

  editModalElement.classList.add('active');
  editTextareaElement.focus();
}

function closeEditModal() {
  if (editingHasChanges) {
    const confirmed = confirm('You have unsaved changes. Discard changes?');
    if (!confirmed) return;
  }

  editModalElement.classList.remove('active');
  editingFilename = '';
  editingSourceName = '';
  editingOriginalContent = '';
  editingHasChanges = false;
  editTextareaElement.value = '';
}

function saveEdit() {
  const content = editTextareaElement.value;
  const editKey = `${editingSourceName}/${editingFilename}`;

  // Save to localStorage
  saveEditingPage(editKey, {
    content,
    originalSource: editingSourceName,
    timestamp: new Date().toISOString(),
    commitMessage: '' // Empty by default, user can set later
  });

  // Update search index for this specific page
  updateEditingSourceIndex(editingSourceName, editingFilename, content);

  // Update state
  editingOriginalContent = content;
  editingHasChanges = false;

  // Update notification bar
  updateEditingNotificationBar();

  // Show feedback
  console.log(`Saved edit for ${editKey}`);
}

async function viewEditedPage() {
  const editingSource = `editing-${editingSourceName}`;
  const filename = editingFilename;
  closeEditModal();
  // Force navigation and reload
  window.location.hash = `#/${editingSource}/${filename}`;
  await loadPage(editingSource, filename);
}

// Edit actions functions
function updateEditActions() {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));

  if (currentPageSource.startsWith('editing-')) {
    // Page from editing source
    const originalSource = currentPageSource.replace('editing-', '');
    const editKey = `${originalSource}/${currentPageFilename}`;
    const editData = getEditingPage(editKey);

    editActionsElement.style.display = 'block';
    editActionsRegularElement.style.display = 'none';
    editActionsEditingElement.style.display = 'block';

    // Set commit message default
    const defaultMsg = editData?.commitMessage || `Update ${currentPageFilename}.md via MDNet`;
    commitMessageInputElement.value = defaultMsg;
    commitMessageInputElement.placeholder = `Update ${currentPageFilename}.md via MDNet`;
    updateCommitMessageCounter();
  } else {
    // Page from regular source - check if editable
    const source = sources.find(s => s.name === currentPageSource);

    if (source && isSourceEditable(source)) {
      editActionsElement.style.display = 'block';
      editActionsRegularElement.style.display = 'block';
      editActionsEditingElement.style.display = 'none';
    } else {
      editActionsElement.style.display = 'none';
    }
  }
}

function updateCommitMessageCounter() {
  const length = commitMessageInputElement.value.length;
  commitMessageCounterElement.textContent = `${length}/72`;

  if (length > 72) {
    commitMessageInputElement.classList.add('over-limit');
    commitMessageCounterElement.classList.add('over-limit');
  } else {
    commitMessageInputElement.classList.remove('over-limit');
    commitMessageCounterElement.classList.remove('over-limit');
  }
}

async function handleEditClick() {
  const isEditingSource = currentPageSource.startsWith('editing-');

  if (isEditingSource) {
    // Editing a page that's already in editing source
    const originalSource = currentPageSource.replace('editing-', '');
    const editKey = `${originalSource}/${currentPageFilename}`;
    const editData = getEditingPage(editKey);

    if (editData) {
      openEditModal(originalSource, currentPageFilename, editData.content);
    }
  } else {
    // Editing a page from regular source
    // Check if draft already exists
    const editKey = `${currentPageSource}/${currentPageFilename}`;
    const existingDraft = getEditingPage(editKey);

    if (existingDraft) {
      // Prompt user
      const choice = confirm(
        'You have unpublished edits for this page.\n\n' +
        'OK = Continue editing draft\n' +
        'Cancel = Discard draft and start fresh'
      );

      if (choice) {
        // Edit existing draft - navigate to editing source
        window.location.hash = `#/editing-${currentPageSource}/${currentPageFilename}`;
      } else {
        // Discard and start fresh
        removeEditingPage(editKey);
        openEditModal(currentPageSource, currentPageFilename, currentPageContent);
      }
    } else {
      // No draft exists, open edit modal with current content
      openEditModal(currentPageSource, currentPageFilename, currentPageContent);
    }
  }
}

// Publish functions
async function handlePublishClick() {
  const originalSource = currentPageSource.replace('editing-', '');
  const editKey = `${originalSource}/${currentPageFilename}`;
  const editData = getEditingPage(editKey);

  if (!editData) {
    alert('Error: Edited page data not found');
    return;
  }

  // Get source configuration
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));
  const source = sources.find(s => s.name === originalSource);

  if (!source || !isSourceEditable(source)) {
    showPublishError(
      'Cannot publish: Original source not found or not editable',
      'Please ensure the source is a private source with relative content base.',
      false
    );
    return;
  }

  // Get commit message
  const commitMessage = commitMessageInputElement.value.trim() ||
    `Update ${currentPageFilename}.md via MDNet`;

  // Show loading
  publishPageBtnElement.disabled = true;
  publishPageBtnElement.textContent = 'Publishing...';

  try {
    // Get git provider
    const provider = getProvider(source.private!.provider);
    if (!provider) {
      throw new Error(`Unsupported provider: ${source.private!.provider}`);
    }

    // Get token
    const token = provider.getToken(originalSource) || source.private!.token;
    if (!token) {
      showPublishError(
        'No authentication token found',
        'Please add a Personal Access Token in source settings.',
        true
      );
      return;
    }

    // Construct file path
    // Normalize contentBase: remove leading/trailing slashes
    let normalizedContentBase = source.private!.contentBase || '';
    normalizedContentBase = normalizedContentBase.replace(/^\/+|\/+$/g, '');
    const filePath = normalizedContentBase ? `${normalizedContentBase}${currentPageFilename}.md` : `${currentPageFilename}.md`;

    // Publish
    const result = await provider.publishFile({
      repoUrl: source.private!.repoUrl,
      branch: source.private!.branch,
      filePath,
      content: editData.content,
      message: commitMessage,
      token
    });

    if (result.success) {
      // Remove from editing source
      removeEditingPage(editKey);

      // Update notification bar
      updateEditingNotificationBar();

      // Reload search indexes to pick up the newly published page
      await loadAllSearchIndexes();

      // Show success
      showPublishSuccess(result.commitUrl);

      // Navigate to original source after delay with forced reload
      setTimeout(async () => {
        window.location.hash = `#/${originalSource}/${currentPageFilename}`;
        // Force reload the page content to get the updated version from server
        await loadPage(originalSource, currentPageFilename, undefined, true);
      }, 2000);
    } else {
      showPublishError(
        result.error || 'Unknown error',
        'Please check the error message and try again.',
        result.error?.includes('401') || result.error?.includes('403') || false
      );
    }
  } catch (error: any) {
    showPublishError(
      error.message || 'Network error',
      'Please check your connection and try again.',
      false
    );
  } finally {
    publishPageBtnElement.disabled = false;
    publishPageBtnElement.textContent = 'Publish';
  }
}

function showPublishError(message: string, details: string, showUpdateToken: boolean) {
  publishErrorMessageElement.textContent = message;
  publishErrorDetailsElement.textContent = details;
  publishUpdateTokenBtnElement.style.display = showUpdateToken ? 'inline-block' : 'none';
  publishErrorModalElement.classList.add('active');
}

function showPublishSuccess(commitUrl?: string) {
  if (commitUrl) {
    publishSuccessLinkElement.innerHTML = `<a href="${commitUrl}" target="_blank">View commit</a>`;
  } else {
    publishSuccessLinkElement.innerHTML = '';
  }

  publishSuccessModalElement.classList.add('active');

  // Auto-hide after 2 seconds
  setTimeout(() => {
    publishSuccessModalElement.classList.remove('active');
  }, 2000);
}

function updateEditingNotificationBar() {
  const editingPages = loadEditingPages();
  const count = Object.keys(editingPages).length;

  if (count > 0 && !editingNotificationDismissed) {
    editingPageCountElement.textContent = count.toString();
    editingNotificationBarElement.style.display = 'flex';
  } else {
    editingNotificationBarElement.style.display = 'none';
  }
}

// New Page Button State
function updateNewPageButtonState() {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-') && isSourceEditable(s));

  if (sources.length === 0) {
    newPageToggleElement.setAttribute('disabled', 'true');
    newPageToggleElement.title = 'No sources configured for editing. Add a private source with relative content base.';
  } else {
    newPageToggleElement.removeAttribute('disabled');
    newPageToggleElement.title = 'Create new page';
  }
}

// New Page Modal Functions
function openNewPageModal() {
  // Reset state
  newPageSelectedSource = '';
  newPageCurrentStep = 1;

  // Pre-select source if viewing an editing source page
  if (currentPageSource.startsWith('editing-')) {
    const originalSource = currentPageSource.replace('editing-', '');
    newPageSelectedSource = originalSource;
  }

  // Render sources and show modal
  renderNewPageSources();
  newPageModalElement.classList.add('active');

  // Show step 1
  newPageStep1Element.style.display = 'flex';
  newPageStep2Element.style.display = 'none';
}

function closeNewPageModal() {
  newPageModalElement.classList.remove('active');

  // Reset form
  newPageSelectedSource = '';
  newPageCurrentStep = 1;
  newPageFilenameElement.value = '';
  newPageContentElement.value = '';
  newPageFilenameErrorElement.style.display = 'none';
  newPageFilenamePreviewElement.textContent = '';
}

function renderNewPageSources() {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-') && isSourceEditable(s));

  if (sources.length === 0) {
    newPageSourceListElement.innerHTML = '<div style="color: var(--text-secondary); padding: 15px; text-align: center;">No sources configured for editing. Please add a private source with relative content base.</div>';
    return;
  }

  newPageSourceListElement.innerHTML = sources.map(source => {
    const isSelected = newPageSelectedSource === source.name;
    return `
      <div class="new-page-source-item ${isSelected ? 'selected' : ''}" data-source="${source.name}">
        <div class="new-page-source-item-name">${source.name}</div>
        <div class="new-page-source-item-info">
          ${source.private!.provider} - ${source.private!.repoUrl}
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers
  newPageSourceListElement.querySelectorAll('.new-page-source-item').forEach(item => {
    item.addEventListener('click', () => {
      const sourceName = (item as HTMLElement).dataset.source!;
      selectNewPageSource(sourceName);
    });
  });

  // Update next button state
  newPageNextBtnElement.disabled = !newPageSelectedSource;
}

function selectNewPageSource(sourceName: string) {
  newPageSelectedSource = sourceName;

  // Update UI
  newPageSourceListElement.querySelectorAll('.new-page-source-item').forEach(item => {
    if ((item as HTMLElement).dataset.source === sourceName) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  newPageNextBtnElement.disabled = false;
}

function goToNewPageStep2() {
  newPageCurrentStep = 2;
  newPageStep1Element.style.display = 'none';
  newPageStep2Element.style.display = 'flex';

  // Show selected source
  newPageSelectedSourceNameElement.textContent = newPageSelectedSource;

  // Reset step 2 form
  newPageFilenameElement.value = '';
  newPageContentElement.value = '';
  newPageFilenameErrorElement.style.display = 'none';
  newPageFilenamePreviewElement.textContent = '';
  newPageCreateBtnElement.disabled = true;

  // Focus filename input
  setTimeout(() => newPageFilenameElement.focus(), 100);
}

function goBackToNewPageStep1() {
  newPageCurrentStep = 1;
  newPageStep1Element.style.display = 'flex';
  newPageStep2Element.style.display = 'none';
}

function validateFilename(filename: string): { valid: boolean; error?: string } {
  // Remove .md extension if user typed it
  filename = filename.replace(/\.md$/i, '');

  if (!filename.trim()) {
    return { valid: false, error: 'Filename is required' };
  }

  if (filename.length > 100) {
    return { valid: false, error: 'Filename must be 100 characters or less' };
  }

  // Allow alphanumeric, dashes, underscores, and slashes (for subdirectories)
  if (!/^[a-zA-Z0-9_\/-]+$/.test(filename)) {
    return { valid: false, error: 'Filename can only contain letters, numbers, dashes (-), underscores (_), and slashes (/) for subdirectories' };
  }

  // Warn about index
  if (filename === 'index') {
    return { valid: true }; // Still valid, but we'll show a note
  }

  return { valid: true };
}

function checkFilenameConflict(filename: string): { conflict: boolean; message?: string } {
  // Remove .md extension
  filename = filename.replace(/\.md$/i, '');

  // Check in published source's search index
  const publishedExists = searchIndex.some(item =>
    item.filename === filename && item._source === newPageSelectedSource
  );

  if (publishedExists) {
    return {
      conflict: true,
      message: 'Page already exists in this source. Use Edit instead.'
    };
  }

  // Check in editing pages
  const editKey = `${newPageSelectedSource}/${filename}`;
  const draftExists = getEditingPage(editKey);

  if (draftExists) {
    return {
      conflict: true,
      message: 'You already have a draft for this page. Open it from the Editing tab.'
    };
  }

  return { conflict: false };
}

function updateFilenamePreview() {
  let filename = newPageFilenameElement.value.trim();

  if (!filename) {
    newPageFilenamePreviewElement.textContent = '';
    newPageFilenameErrorElement.style.display = 'none';
    newPageCreateBtnElement.disabled = true;
    newPageFilenameElement.classList.remove('error');
    return;
  }

  // Validate filename
  const validation = validateFilename(filename);

  if (!validation.valid) {
    newPageFilenameErrorElement.textContent = validation.error!;
    newPageFilenameErrorElement.style.display = 'block';
    newPageFilenamePreviewElement.textContent = '';
    newPageCreateBtnElement.disabled = true;
    newPageFilenameElement.classList.add('error');
    return;
  }

  // Remove .md extension for consistency
  filename = filename.replace(/\.md$/i, '');

  // Check for conflicts
  const conflict = checkFilenameConflict(filename);

  if (conflict.conflict) {
    newPageFilenameErrorElement.textContent = conflict.message!;
    newPageFilenameErrorElement.style.display = 'block';
    newPageFilenamePreviewElement.textContent = '';
    newPageCreateBtnElement.disabled = true;
    newPageFilenameElement.classList.add('error');
    return;
  }

  // Show preview
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));
  const source = sources.find(s => s.name === newPageSelectedSource);

  if (source && source.private) {
    let contentBase = source.private.contentBase || '';
    contentBase = contentBase.replace(/^\/+|\/+$/g, ''); // Normalize
    const fullPath = contentBase ? `${contentBase}${filename}.md` : `${filename}.md`;
    newPageFilenamePreviewElement.innerHTML = `Full path: <strong>${fullPath}</strong>`;
  }

  // Show note if filename is index
  if (filename === 'index') {
    newPageFilenamePreviewElement.innerHTML += '<br><em style="color: var(--accent-orange);">Note: This will be the default landing page for this source.</em>';
  }

  // All checks passed
  newPageFilenameErrorElement.style.display = 'none';
  newPageCreateBtnElement.disabled = false;
  newPageFilenameElement.classList.remove('error');
}

function generateDefaultContent(filename: string): string {
  // Remove .md extension and path
  filename = filename.replace(/\.md$/i, '');
  const basename = filename.split('/').pop() || filename;

  // Convert filename to title (e.g., "getting-started" -> "Getting Started")
  const title = basename
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `# ${title}\n\nWrite your content here...\n`;
}

async function createNewPage() {
  let filename = newPageFilenameElement.value.trim().replace(/\.md$/i, '');
  const initialContent = newPageContentElement.value.trim();

  // Save values before closing modal (closeNewPageModal resets these)
  const sourceName = newPageSelectedSource;

  // Generate content
  const content = initialContent || generateDefaultContent(filename);

  // Create editing page
  const editKey = `${sourceName}/${filename}`;
  saveEditingPage(editKey, {
    content,
    originalSource: sourceName,
    timestamp: new Date().toISOString(),
    commitMessage: `Create ${filename}.md via MDNet`
  });

  // Update search index
  updateEditingSourceIndex(sourceName, filename, content);

  // Update notification bar
  updateEditingNotificationBar();

  // Update editing tab visibility
  updateEditingTabVisibility();

  // Close modal
  closeNewPageModal();

  // Navigate to new page
  const editingSource = `editing-${sourceName}`;
  window.location.hash = `#/${editingSource}/${filename}`;
  await loadPage(editingSource, filename);

  // Open edit modal automatically
  openEditModal(sourceName, filename, content);
}

// Indexing functions for editing sources
function extractTitle(frontMatter: Record<string, any> | null, content: string): string {
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

function extractHeadings(content: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
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

function extractTextTags(content: string): string[] {
  const tags = new Set<string>();
  const tagRegex = /#([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

function extractFrontMatterTags(frontMatter: Record<string, any> | null): string[] {
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

function extractLinks(content: string): string[] {
  const links = new Set<string>();
  const wikiLinkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    links.add(match[1].trim());
  }

  return Array.from(links);
}

function normalizeFrontMatterProperties(frontMatter: Record<string, any> | null): Record<string, string | string[]> {
  if (!frontMatter) return {};

  const normalized: Record<string, string | string[]> = {};

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

function createIndexEntryFromContent(filename: string, content: string, sourceName: string): SearchIndexItem {
  const frontMatter = getFrontMatter(content);

  const title = extractTitle(frontMatter, content);
  const headings = extractHeadings(content);
  const textTags = extractTextTags(content);
  const fmTags = extractFrontMatterTags(frontMatter);
  const tags = [...new Set([...textTags, ...fmTags])];
  const links = extractLinks(content);
  const properties = normalizeFrontMatterProperties(frontMatter);

  return {
    filename,
    title,
    headings,
    tags,
    links,
    properties,
    _source: sourceName,
    _contentUrl: `localStorage://${sourceName.replace('editing-', '')}/${filename}`
  };
}

function updateEditingSourceIndex(originalSource: string, filename: string, content: string): void {
  const editingSourceName = `editing-${originalSource}`;

  // Remove old entry if exists
  searchIndex = searchIndex.filter(item =>
    !(item._source === editingSourceName && item.filename === filename)
  );

  // Add new entry
  const newEntry = createIndexEntryFromContent(filename, content, editingSourceName);
  searchIndex.push(newEntry);

  console.log(`Updated search index for ${editingSourceName}/${filename}`);
}

function loadEditingSourceIndexes(): void {
  const editingPages = loadEditingPages();

  for (const [key, data] of Object.entries(editingPages)) {
    const [originalSource, ...filenameParts] = key.split('/');
    const filename = filenameParts.join('/');
    const editingSourceName = `editing-${originalSource}`;

    const entry = createIndexEntryFromContent(filename, data.content, editingSourceName);
    searchIndex.push(entry);
  }
}

function addSource(name: string, indexUrl: string, contentBaseUrl: string, privateConfig?: any): void {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));
  const newSource: Source = { name, enabled: true };

  if (privateConfig && privateConfig.enabled) {
    // Private source
    newSource.private = {
      provider: privateConfig.provider,
      repoUrl: privateConfig.repoUrl,
      branch: privateConfig.branch,
      indexPath: privateConfig.indexPath || 'search-index.json',
      contentBase: privateConfig.contentBase || './',
      token: privateConfig.token
    };
  } else {
    // Regular source
    newSource.indexUrl = indexUrl;
    newSource.contentBaseUrl = contentBaseUrl;
  }

  sources.push(newSource);
  saveSources(sources);
  loadAllSearchIndexes(); // Reload indexes
  renderSourcesList();
  updateNewPageButtonState();
}

function updateSource(index: number, name: string, indexUrl: string, contentBaseUrl: string, privateConfig?: any): void {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));
  if (index >= 0 && index < sources.length) {
    const currentEnabled = sources[index].enabled;
    const updatedSource: Source = { name, enabled: currentEnabled };

    if (privateConfig && privateConfig.enabled) {
      // Private source
      updatedSource.private = {
        provider: privateConfig.provider,
        repoUrl: privateConfig.repoUrl,
        branch: privateConfig.branch,
        indexPath: privateConfig.indexPath || 'search-index.json',
        contentBase: privateConfig.contentBase || './',
        token: privateConfig.token
      };
    } else {
      // Regular source
      updatedSource.indexUrl = indexUrl;
      updatedSource.contentBaseUrl = contentBaseUrl;
    }

    sources[index] = updatedSource;
    saveSources(sources);
    loadAllSearchIndexes(); // Reload indexes
    renderSourcesList();
    updateNewPageButtonState();
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

    // Populate private source configuration if present
    if (source.private) {
      privateToggleElement.checked = true;
      regularSourceFieldsElement.style.display = 'none';
      privateSourceFieldsElement.style.display = 'block';

      indexUrlInput.value = '';
      contentUrlInput.value = '';

      sourceProviderElement.value = source.private.provider || '';
      sourceRepoUrlElement.value = source.private.repoUrl || '';
      sourceBranchElement.value = source.private.branch || '';
      sourceIndexPathElement.value = source.private.indexPath || 'search-index.json';
      sourceContentBaseElement.value = source.private.contentBase || './';
      sourceTokenElement.value = source.private.token || '';

      // Update token instructions link if provider is selected
      if (source.private.provider) {
        const provider = getProvider(source.private.provider);
        if (provider) {
          tokenInstructionsLinkElement.href = provider.getTokenInstructions();
        }
      }

      updateContentBaseIndicator();
    } else {
      // Regular source
      privateToggleElement.checked = false;
      regularSourceFieldsElement.style.display = 'block';
      privateSourceFieldsElement.style.display = 'none';

      indexUrlInput.value = source.indexUrl || '';
      contentUrlInput.value = source.contentBaseUrl || '';
    }

    // Update button text and show cancel button
    const submitBtn = document.getElementById('add-source-btn')!;
    const cancelBtn = document.getElementById('cancel-edit-btn')!;
    const formTitle = document.querySelector('.add-source-form h3')!;

    submitBtn.textContent = 'Update Source';
    cancelBtn.style.display = 'inline-block';
    formTitle.textContent = `Edit Source: ${source.name}`;

    // Switch to add-source nested tab
    settingsNestedTabElements.forEach(t => t.classList.remove('active'));
    sourcesListTabContentElement.classList.remove('active');
    addSourceTabContentElement.classList.add('active');
    editingTabContentElement.classList.remove('active');
    settingsNestedTabElements[1].classList.add('active'); // Activate second nested tab (add-source)

    // Scroll to form
    setTimeout(() => {
      document.querySelector('.add-source-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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

  // Clear private source configuration fields
  privateToggleElement.checked = false;
  regularSourceFieldsElement.style.display = 'block';
  privateSourceFieldsElement.style.display = 'none';
  sourceProviderElement.value = '';
  sourceRepoUrlElement.value = '';
  sourceBranchElement.value = '';
  sourceIndexPathElement.value = 'search-index.json';
  sourceContentBaseElement.value = '';
  sourceTokenElement.value = '';
  tokenValidationResultElement.textContent = '';
  contentBaseIndicatorElement.style.display = 'none';

  // Reset button text and hide cancel button
  const submitBtn = document.getElementById('add-source-btn')!;
  const cancelBtn = document.getElementById('cancel-edit-btn')!;
  const formTitle = document.querySelector('.add-source-form h3')!;

  submitBtn.textContent = 'Add Source';
  cancelBtn.style.display = 'none';
  formTitle.textContent = 'Add New Source';

  // Switch to sources-list nested tab
  settingsNestedTabElements.forEach(t => t.classList.remove('active'));
  sourcesListTabContentElement.classList.add('active');
  addSourceTabContentElement.classList.remove('active');
  editingTabContentElement.classList.remove('active');
  settingsNestedTabElements[0].classList.add('active'); // Activate first nested tab (sources-list)
}

function removeSource(index: number): void {
  const sources = loadSources();
  sources.splice(index, 1);
  saveSources(sources);
  loadAllSearchIndexes(); // Reload indexes
  renderSourcesList();
  updateNewPageButtonState();

  // If we were editing this source, cancel the edit
  if (editingSourceIndex === index) {
    cancelEdit();
  } else if (editingSourceIndex !== null && editingSourceIndex > index) {
    // Adjust editing index if a source before it was removed
    editingSourceIndex--;
  }
}

function toggleSourceEnabled(index: number): void {
  const sources = loadSources();
  if (index >= 0 && index < sources.length) {
    sources[index].enabled = !sources[index].enabled;
    saveSources(sources);
    loadAllSearchIndexes(); // Reload indexes
    renderSourcesList();
  }
}

// Export/Import functions
function exportSources(): void {
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));

  // Create export object with metadata
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    sources: sources
  };

  // Convert to JSON
  const jsonString = JSON.stringify(exportData, null, 2);

  // Create blob and download
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mdnet-sources-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('Sources exported successfully');
}

function validateSourcesImport(data: any): { valid: boolean; error?: string; sources?: Source[] } {
  // Check if data is an object
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON format' };
  }

  // Support both old format (array) and new format (object with metadata)
  let sourcesToImport: any[];

  if (Array.isArray(data)) {
    // Old format: direct array of sources
    sourcesToImport = data;
  } else if (data.sources && Array.isArray(data.sources)) {
    // New format: object with sources array
    sourcesToImport = data.sources;
  } else {
    return { valid: false, error: 'Invalid format: expected array of sources or object with sources property' };
  }

  // Validate each source
  for (const source of sourcesToImport) {
    if (!source.name || typeof source.name !== 'string') {
      return { valid: false, error: 'Invalid source: missing or invalid name' };
    }

    if (source.enabled !== undefined && typeof source.enabled !== 'boolean') {
      return { valid: false, error: `Invalid source "${source.name}": enabled must be boolean` };
    }

    // Validate source has either public or private configuration
    const hasPublic = source.indexUrl && source.contentBaseUrl;
    const hasPrivate = source.private && source.private.provider && source.private.repoUrl && source.private.branch;

    if (!hasPublic && !hasPrivate) {
      return { valid: false, error: `Invalid source "${source.name}": must have either public (indexUrl/contentBaseUrl) or private configuration` };
    }
  }

  return { valid: true, sources: sourcesToImport };
}

function importSourcesFromData(data: any): void {
  const validation = validateSourcesImport(data);

  if (!validation.valid) {
    showImportStatus('error', validation.error || 'Validation failed');
    return;
  }

  const currentSources = loadSources().filter(s => !s.name.startsWith('editing-'));
  const currentSourceNames = new Set(currentSources.map(s => s.name));
  const importedSources = validation.sources!;

  let addedCount = 0;
  let skippedCount = 0;
  const skippedNames: string[] = [];

  for (const source of importedSources) {
    if (currentSourceNames.has(source.name)) {
      skippedCount++;
      skippedNames.push(source.name);
    } else {
      // Ensure enabled field exists
      if (source.enabled === undefined) {
        source.enabled = true;
      }
      currentSources.push(source);
      addedCount++;
    }
  }

  // Save updated sources
  saveSources(currentSources);
  loadAllSearchIndexes();
  renderSourcesList();
  updateNewPageButtonState();

  // Show result
  let message = `✓ Successfully imported ${addedCount} source(s)`;
  if (skippedCount > 0) {
    message += `\n⚠ Skipped ${skippedCount} duplicate(s): ${skippedNames.join(', ')}`;
  }

  showImportStatus('success', message);

  // Close modal after 2 seconds
  setTimeout(() => {
    closeImportModal();
  }, 2000);
}

async function importSourcesFromFile(): Promise<void> {
  const file = importFileInputElement.files?.[0];

  if (!file) {
    showImportStatus('error', 'Please select a file');
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    importSourcesFromData(data);
  } catch (error: any) {
    showImportStatus('error', `Failed to read file: ${error.message}`);
  }
}

async function importSourcesFromUrl(): Promise<void> {
  const url = importUrlInputElement.value.trim();

  if (!url) {
    showImportStatus('error', 'Please enter a URL');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showImportStatus('error', 'URL must start with http:// or https://');
    return;
  }

  showImportStatus('info', 'Fetching sources from URL...');

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    importSourcesFromData(data);
  } catch (error: any) {
    showImportStatus('error', `Failed to fetch from URL: ${error.message}`);
  }
}

function showImportStatus(type: 'success' | 'error' | 'info', message: string): void {
  importStatusElement.style.display = 'block';

  if (type === 'success') {
    importStatusElement.style.background = 'var(--accent-green)';
    importStatusElement.style.color = 'var(--bg-primary)';
    importStatusElement.style.borderLeft = '4px solid var(--accent-green)';
  } else if (type === 'error') {
    importStatusElement.style.background = 'var(--bg-secondary)';
    importStatusElement.style.color = 'var(--accent-red)';
    importStatusElement.style.borderLeft = '4px solid var(--accent-red)';
  } else {
    importStatusElement.style.background = 'var(--bg-secondary)';
    importStatusElement.style.color = 'var(--accent-blue)';
    importStatusElement.style.borderLeft = '4px solid var(--accent-blue)';
  }

  importStatusElement.textContent = message;
  importStatusElement.style.whiteSpace = 'pre-line';
}

function openImportModal(): void {
  importSourcesModalElement.style.display = 'flex';
  importStatusElement.style.display = 'none';
  importFileInputElement.value = '';
  importUrlInputElement.value = '';
}

function closeImportModal(): void {
  importSourcesModalElement.style.display = 'none';
  importStatusElement.style.display = 'none';
}

function renderSourcesList(): void {
  // Filter out editing sources - they're shown in the editing sources tab
  const sources = loadSources().filter(s => !s.name.startsWith('editing-'));
  const container = document.getElementById('sources-list')!;

  if (sources.length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); padding: 15px; text-align: center;">No sources configured. Add one below to get started.</div>';
    return;
  }

  container.innerHTML = sources.map((source, index) => {
    let badgeHtml = '';
    let detailsHtml = '';

    if (source.private) {
      // Private source
      const editable = isSourceEditable(source);
      const editableIcon = editable ? '✏️' : '👁️';
      const editableText = editable ? 'Editable' : 'Read-only';
      badgeHtml = `<span style="background: var(--accent-blue); color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.75em; margin-left: 8px;">🔒 Private</span>`;
      detailsHtml = `
        <div>Provider: ${source.private.provider}</div>
        <div>Repository: ${source.private.repoUrl}</div>
        <div>Branch: ${source.private.branch}</div>
        <div>Index: ${source.private.indexPath}</div>
        <div>Content: ${source.private.contentBase} ${editableIcon} <em style="color: ${editable ? 'var(--accent-green)' : 'var(--text-secondary)'}">${editableText}</em></div>
      `;
    } else {
      // Regular source
      badgeHtml = `<span style="background: var(--bg-secondary); color: var(--text-primary); padding: 2px 8px; border-radius: 3px; font-size: 0.75em; margin-left: 8px; border: 1px solid var(--border-color);">📄 Public</span>`;
      detailsHtml = `
        <div>Index: ${source.indexUrl || 'N/A'}</div>
        <div>Content: ${source.contentBaseUrl || 'N/A'}</div>
      `;
    }

    return `
      <div class="source-item ${source.enabled ? '' : 'disabled'}">
        <div class="source-info">
          <strong>${source.name}</strong>${badgeHtml}
          <div class="source-urls" style="font-size: 0.85em; color: var(--text-secondary); margin-top: 5px;">
            ${detailsHtml}
          </div>
        </div>
        <div class="source-actions">
          <label class="source-toggle">
            <input type="checkbox"
                   class="source-toggle-checkbox"
                   data-index="${index}"
                   ${source.enabled ? 'checked' : ''}>
            <span class="source-toggle-label">${source.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <button class="edit-source-btn" data-index="${index}">Edit</button>
          <button class="remove-source-btn" data-index="${index}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach toggle handlers
  container.querySelectorAll('.source-toggle-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt((e.target as HTMLInputElement).dataset.index!);
      toggleSourceEnabled(index);
    });
  });

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
  } else {
    // Migrate old sources without enabled field
    let needsSave = false;
    sources.forEach(source => {
      if (source.enabled === undefined) {
        source.enabled = true;
        needsSave = true;
      }
    });
    if (needsSave) {
      saveSources(sources);
      console.log('Migrated sources to include enabled field');
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
  sourceMapToggleElement = document.getElementById('source-map-toggle')!;
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
  settingsTabElements = document.querySelectorAll('.settings-tab')!;
  settingsNestedTabElements = document.querySelectorAll('.settings-nested-tab')!;
  editingTabElement = document.getElementById('editing-tab')!;
  editingTabCountElement = document.getElementById('editing-tab-count')!;
  sourcesMainTabContentElement = document.getElementById('sources-main-tab-content')!;
  sourcesListTabContentElement = document.getElementById('sources-list-tab-content')!;
  addSourceTabContentElement = document.getElementById('add-source-tab-content')!;
  editingTabContentElement = document.getElementById('editing-tab-content')!;
  pluginsMainTabContentElement = document.getElementById('plugins-main-tab-content')!;
  themesMainTabContentElement = document.getElementById('themes-main-tab-content')!;
  addSourceBtnElement = document.getElementById('add-source-btn')! as HTMLButtonElement;
  pluginListElement = document.getElementById('plugin-list')!;
  panelToggleElement = document.getElementById('panel-toggle')!;
  toggleButtonsElement = document.querySelector('.toggle-buttons')!;
  metadataToggleElement = document.getElementById('metadata-toggle')!;
  asideToggleElement = document.getElementById('aside-toggle')!;
  editModalElement = document.getElementById('edit-modal')!;
  editTextareaElement = document.getElementById('edit-textarea')! as HTMLTextAreaElement;
  editFilenameElement = document.getElementById('edit-filename')!;
  editSourceNameElement = document.getElementById('edit-source-name')!;
  closeEditElement = document.getElementById('close-edit')!;
  editCancelBtnElement = document.getElementById('edit-cancel-btn')! as HTMLButtonElement;
  editSaveBtnElement = document.getElementById('edit-save-btn')! as HTMLButtonElement;
  editSaveCloseBtnElement = document.getElementById('edit-save-close-btn')! as HTMLButtonElement;
  editViewBtnElement = document.getElementById('edit-view-btn')! as HTMLButtonElement;
  editActionsElement = document.getElementById('edit-actions')!;
  editActionsRegularElement = document.getElementById('edit-actions-regular')!;
  editActionsEditingElement = document.getElementById('edit-actions-editing')!;
  editPageBtnElement = document.getElementById('edit-page-btn')! as HTMLButtonElement;
  editPageEditingBtnElement = document.getElementById('edit-page-editing-btn')! as HTMLButtonElement;
  publishPageBtnElement = document.getElementById('publish-page-btn')! as HTMLButtonElement;
  commitMessageInputElement = document.getElementById('commit-message-input')! as HTMLInputElement;
  commitMessageCounterElement = document.querySelector('.commit-message-counter')!;
  publishErrorModalElement = document.getElementById('publish-error-modal')!;
  publishErrorMessageElement = document.getElementById('publish-error-message')!;
  publishErrorDetailsElement = document.getElementById('publish-error-details')!;
  publishUpdateTokenBtnElement = document.getElementById('publish-update-token-btn')! as HTMLButtonElement;
  publishRetryBtnElement = document.getElementById('publish-retry-btn')! as HTMLButtonElement;
  publishCancelBtnElement = document.getElementById('publish-cancel-btn')! as HTMLButtonElement;
  closePublishErrorElement = document.getElementById('close-publish-error')!;
  publishSuccessModalElement = document.getElementById('publish-success-modal')!;
  publishSuccessLinkElement = document.getElementById('publish-success-link')!;
  regularSourceFieldsElement = document.getElementById('regular-source-fields')!;
  privateToggleElement = document.getElementById('source-private-toggle')! as HTMLInputElement;
  privateSourceFieldsElement = document.getElementById('private-source-fields')!;
  sourceProviderElement = document.getElementById('source-provider')! as HTMLSelectElement;
  sourceRepoUrlElement = document.getElementById('source-repo-url')! as HTMLInputElement;
  sourceBranchElement = document.getElementById('source-branch')! as HTMLInputElement;
  sourceIndexPathElement = document.getElementById('source-index-path')! as HTMLInputElement;
  sourceContentBaseElement = document.getElementById('source-content-base')! as HTMLInputElement;
  contentBaseIndicatorElement = document.getElementById('content-base-indicator')!;
  contentBaseIconElement = document.getElementById('content-base-icon')!;
  contentBaseTextElement = document.getElementById('content-base-text')!;
  sourceTokenElement = document.getElementById('source-token')! as HTMLInputElement;
  validateTokenBtnElement = document.getElementById('validate-token-btn')! as HTMLButtonElement;
  tokenInstructionsLinkElement = document.getElementById('token-instructions-link')! as HTMLAnchorElement;
  tokenValidationResultElement = document.getElementById('token-validation-result')!;
  editingNotificationBarElement = document.getElementById('editing-notification-bar')!;
  pluginDashboardToggleElement = document.getElementById('plugin-dashboard-toggle')!;
  leftPanelToggleElement = document.getElementById('left-panel-toggle')!;
  leftToggleButtonsElement = document.querySelector('.left-toggle-buttons')!;
  editingPageCountElement = document.getElementById('editing-page-count')!;
  editingNotificationCloseElement = document.getElementById('editing-notification-close')!;
  newPageToggleElement = document.getElementById('new-page-toggle')!;
  newPageModalElement = document.getElementById('new-page-modal')!;
  closeNewPageElement = document.getElementById('close-new-page')!;
  newPageStep1Element = document.getElementById('new-page-step-1')!;
  newPageStep2Element = document.getElementById('new-page-step-2')!;
  newPageSourceListElement = document.getElementById('new-page-source-list')!;
  newPageCancelBtnElement = document.getElementById('new-page-cancel-btn')! as HTMLButtonElement;
  newPageNextBtnElement = document.getElementById('new-page-next-btn')! as HTMLButtonElement;
  newPageBackBtnElement = document.getElementById('new-page-back-btn')! as HTMLButtonElement;
  newPageCreateBtnElement = document.getElementById('new-page-create-btn')! as HTMLButtonElement;
  newPageSelectedSourceNameElement = document.getElementById('new-page-selected-source-name')!;
  newPageFilenameElement = document.getElementById('new-page-filename')! as HTMLInputElement;
  newPageFilenameErrorElement = document.getElementById('new-page-filename-error')!;
  newPageFilenamePreviewElement = document.getElementById('new-page-filename-preview')!;
  newPageContentElement = document.getElementById('new-page-content')! as HTMLTextAreaElement;
  exportSourcesBtnElement = document.getElementById('export-sources-btn')! as HTMLButtonElement;
  importSourcesBtnElement = document.getElementById('import-sources-btn')! as HTMLButtonElement;
  importSourcesModalElement = document.getElementById('import-sources-modal')!;
  closeImportModalElement = document.getElementById('close-import-modal')!;
  importMethodRadios = document.querySelectorAll('input[name="import-method"]')! as NodeListOf<HTMLInputElement>;
  importFileSectionElement = document.getElementById('import-file-section')!;
  importUrlSectionElement = document.getElementById('import-url-section')!;
  importFileInputElement = document.getElementById('import-file-input')! as HTMLInputElement;
  importUrlInputElement = document.getElementById('import-url-input')! as HTMLInputElement;
  importFileBtnElement = document.getElementById('import-file-btn')! as HTMLButtonElement;
  importUrlBtnElement = document.getElementById('import-url-btn')! as HTMLButtonElement;
  importStatusElement = document.getElementById('import-status')!;

  // Initialize theme from localStorage
  initTheme();

  // Initialize metadata visibility from localStorage
  initMetadata();

  // Initialize aside visibility from localStorage
  initAsides();

  // Set up panel toggle
  panelToggleElement.addEventListener('click', togglePanel);

  // Set up metadata toggle
  metadataToggleElement.addEventListener('click', toggleMetadata);

  // Set up aside toggle
  asideToggleElement.addEventListener('click', toggleAsides);

  // Set up edit modal
  closeEditElement.addEventListener('click', closeEditModal);
  editCancelBtnElement.addEventListener('click', closeEditModal);
  editSaveBtnElement.addEventListener('click', saveEdit);
  editSaveCloseBtnElement.addEventListener('click', () => { saveEdit(); closeEditModal(); });
  editViewBtnElement.addEventListener('click', () => { saveEdit(); viewEditedPage(); });
  editModalElement.addEventListener('click', (e) => {
    if (e.target === editModalElement) closeEditModal();
  });

  // Track changes in textarea
  editTextareaElement.addEventListener('input', () => {
    editingHasChanges = editTextareaElement.value !== editingOriginalContent;
  });

  // Keyboard shortcuts for edit modal
  editTextareaElement.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveEdit();
    }
    // Ctrl+Enter or Cmd+Enter to save & close
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
      closeEditModal();
    }
    // Tab key inserts tab character
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editTextareaElement.selectionStart;
      const end = editTextareaElement.selectionEnd;
      editTextareaElement.value =
        editTextareaElement.value.substring(0, start) +
        '\t' +
        editTextareaElement.value.substring(end);
      editTextareaElement.selectionStart = editTextareaElement.selectionEnd = start + 1;
    }
  });

  // Set up edit actions
  editPageBtnElement.addEventListener('click', handleEditClick);
  editPageEditingBtnElement.addEventListener('click', handleEditClick);
  publishPageBtnElement.addEventListener('click', handlePublishClick);
  commitMessageInputElement.addEventListener('input', updateCommitMessageCounter);

  // Set up publish modals
  closePublishErrorElement.addEventListener('click', () => publishErrorModalElement.classList.remove('active'));
  publishCancelBtnElement.addEventListener('click', () => publishErrorModalElement.classList.remove('active'));
  publishRetryBtnElement.addEventListener('click', handlePublishClick);
  publishErrorModalElement.addEventListener('click', (e) => {
    if (e.target === publishErrorModalElement) publishErrorModalElement.classList.remove('active');
  });

  // Set up editable config form
  privateToggleElement.addEventListener('change', () => {
    if (privateToggleElement.checked) {
      // Save regular fields
      const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
      const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;
      savedRegularFields.indexUrl = indexUrlInput.value;
      savedRegularFields.contentBaseUrl = contentUrlInput.value;

      // Clear regular fields
      indexUrlInput.value = '';
      contentUrlInput.value = '';

      // Hide regular, show private
      regularSourceFieldsElement.style.display = 'none';
      privateSourceFieldsElement.style.display = 'block';

      // Restore saved private fields
      sourceProviderElement.value = savedPrivateFields.provider;
      sourceRepoUrlElement.value = savedPrivateFields.repoUrl;
      sourceBranchElement.value = savedPrivateFields.branch;
      sourceIndexPathElement.value = savedPrivateFields.indexPath || 'search-index.json';
      sourceContentBaseElement.value = savedPrivateFields.contentBase;
      sourceTokenElement.value = savedPrivateFields.token;

      updateContentBaseIndicator();
    } else {
      // Save private fields
      savedPrivateFields.provider = sourceProviderElement.value;
      savedPrivateFields.repoUrl = sourceRepoUrlElement.value;
      savedPrivateFields.branch = sourceBranchElement.value;
      savedPrivateFields.indexPath = sourceIndexPathElement.value;
      savedPrivateFields.contentBase = sourceContentBaseElement.value;
      savedPrivateFields.token = sourceTokenElement.value;

      // Show regular, hide private
      regularSourceFieldsElement.style.display = 'block';
      privateSourceFieldsElement.style.display = 'none';

      // Restore saved regular fields
      const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
      const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;
      indexUrlInput.value = savedRegularFields.indexUrl;
      contentUrlInput.value = savedRegularFields.contentBaseUrl;
    }
  });

  // Update indicator when content base changes
  sourceContentBaseElement.addEventListener('input', updateContentBaseIndicator);

  sourceProviderElement.addEventListener('change', () => {
    const provider = getProvider(sourceProviderElement.value);
    if (provider) {
      tokenInstructionsLinkElement.href = provider.getTokenInstructions();
    }
  });

  validateTokenBtnElement.addEventListener('click', async () => {
    const token = sourceTokenElement.value;
    const repoUrl = sourceRepoUrlElement.value;
    const providerName = sourceProviderElement.value;

    if (!token || !repoUrl || !providerName) {
      alert('Please fill in provider, repository URL, and token');
      return;
    }

    const provider = getProvider(providerName);
    if (!provider) {
      alert('Invalid provider');
      return;
    }

    tokenValidationResultElement.textContent = 'Validating...';
    tokenValidationResultElement.style.color = 'var(--text-secondary)';

    try {
      const result = await provider.validateToken(token, repoUrl);
      if (result.valid) {
        tokenValidationResultElement.textContent = `✓ Token is valid${result.username ? ` (${result.username})` : ''}`;
        tokenValidationResultElement.style.color = 'var(--green)';
      } else {
        tokenValidationResultElement.textContent = `✗ ${result.error || 'Token validation failed'}`;
        tokenValidationResultElement.style.color = 'var(--red)';
      }
    } catch (error: any) {
      tokenValidationResultElement.textContent = `✗ Error: ${error.message}`;
      tokenValidationResultElement.style.color = 'var(--red)';
    }
  });

  // Set up editing notification bar
  editingNotificationBarElement.addEventListener('click', (e) => {
    if (e.target !== editingNotificationCloseElement) {
      openSettings();
      // Scroll to editing sources section
      setTimeout(() => {
        document.getElementById('editing-sources-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  });

  editingNotificationCloseElement.addEventListener('click', (e) => {
    e.stopPropagation();
    editingNotificationDismissed = true;
    updateEditingNotificationBar();
  });

  // Set up new page modal
  newPageToggleElement.addEventListener('click', openNewPageModal);
  closeNewPageElement.addEventListener('click', closeNewPageModal);
  newPageCancelBtnElement.addEventListener('click', closeNewPageModal);
  newPageNextBtnElement.addEventListener('click', goToNewPageStep2);
  newPageBackBtnElement.addEventListener('click', goBackToNewPageStep1);
  newPageCreateBtnElement.addEventListener('click', createNewPage);
  newPageFilenameElement.addEventListener('input', updateFilenamePreview);
  newPageModalElement.addEventListener('click', (e) => {
    if (e.target === newPageModalElement) closeNewPageModal();
  });

  // Set up export/import sources
  exportSourcesBtnElement.addEventListener('click', exportSources);
  importSourcesBtnElement.addEventListener('click', openImportModal);
  closeImportModalElement.addEventListener('click', closeImportModal);
  importSourcesModalElement.addEventListener('click', (e) => {
    if (e.target === importSourcesModalElement) closeImportModal();
  });

  // Import method radio buttons
  importMethodRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const method = (e.target as HTMLInputElement).value;
      if (method === 'file') {
        importFileSectionElement.style.display = 'block';
        importUrlSectionElement.style.display = 'none';
      } else {
        importFileSectionElement.style.display = 'none';
        importUrlSectionElement.style.display = 'block';
      }
      importStatusElement.style.display = 'none';
    });
  });

  importFileBtnElement.addEventListener('click', importSourcesFromFile);
  importUrlBtnElement.addEventListener('click', importSourcesFromUrl);

  // Initialize plugin manager
  window.pluginManager = new PluginManager();
  await window.pluginManager.initialize();

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

  // Set up source map
  sourceMapToggleElement.addEventListener('click', () => {
    // Parse current page from URL hash to ensure we always have the latest
    const hash = window.location.hash.slice(1); // Remove #
    let pagePart = hash.slice(1) || ''; // Remove leading /

    // Remove anchor if present
    const anchorIndex = pagePart.indexOf('#');
    if (anchorIndex !== -1) {
      pagePart = pagePart.slice(0, anchorIndex);
    }

    let sourceName = '';
    let filename = '';

    if (pagePart) {
      const firstSlash = pagePart.indexOf('/');
      if (firstSlash === -1) {
        // No slash - could be source name or filename
        const sources = loadSources();
        const decodedPagePart = decodeURIComponent(pagePart);
        const isSourceName = sources.some(s => s.name === decodedPagePart);
        if (isSourceName) {
          sourceName = decodedPagePart;
          filename = 'index';
        } else {
          // It's a filename, use first source
          const enabledSources = sources.filter(s => s.enabled && !s.name.startsWith('editing-'));
          if (enabledSources.length > 0) {
            sourceName = enabledSources[0].name;
            filename = decodedPagePart;
          }
        }
      } else {
        // Has slash - split into source and filename
        sourceName = decodeURIComponent(pagePart.slice(0, firstSlash));
        filename = decodeURIComponent(pagePart.slice(firstSlash + 1));
      }
    }

    // If no valid source/filename from hash, use defaults
    if (!sourceName || sourceName.startsWith('editing-')) {
      const sources = loadSources();
      const enabledSources = sources.filter(s => s.enabled && !s.name.startsWith('editing-'));
      if (enabledSources.length > 0) {
        sourceName = enabledSources[0].name;
        filename = filename || 'index';
      } else {
        alert('No sources available for map view');
        return;
      }
    }

    openSourceMap(sourceName, filename, searchIndex);
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (editModalElement.classList.contains('active')) {
        closeEditModal();
      }
      if (searchModalElement.classList.contains('active')) {
        closeSearch();
      }
      if (settingsModalElement.classList.contains('active')) {
        closeSettings();
      }
      if (newPageModalElement.classList.contains('active')) {
        closeNewPageModal();
      }
      if (importSourcesModalElement.style.display === 'flex') {
        closeImportModal();
      }
    }

    // Ctrl/Cmd+Shift+B - Add bookmark
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      triggerAddBookmark();
    }
  });

  // Set up settings modal
  settingsToggleElement.addEventListener('click', openSettings);
  // Set up main settings tab switching
  settingsTabElements.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      settingsTabElements.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      sourcesMainTabContentElement.classList.remove('active');
      pluginsMainTabContentElement.classList.remove('active');
      themesMainTabContentElement.classList.remove('active');

      if (targetTab === 'sources-main') {
        sourcesMainTabContentElement.classList.add('active');
      } else if (targetTab === 'plugins-main') {
        pluginsMainTabContentElement.classList.add('active');
        renderPluginList(); // Refresh plugin list when switching to plugins tab
      } else if (targetTab === 'themes-main') {
        themesMainTabContentElement.classList.add('active');
      }
    });
  });

  // Set up nested tab switching for Sources
  settingsNestedTabElements.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.nestedTab;

      // Update active nested tab
      settingsNestedTabElements.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active nested content
      sourcesListTabContentElement.classList.remove('active');
      addSourceTabContentElement.classList.remove('active');
      editingTabContentElement.classList.remove('active');

      if (targetTab === 'sources-list') {
        sourcesListTabContentElement.classList.add('active');
      } else if (targetTab === 'add-source') {
        addSourceTabContentElement.classList.add('active');
      } else if (targetTab === 'editing') {
        editingTabContentElement.classList.add('active');
      }
    });
  });

  closeSettingsElement.addEventListener('click', closeSettings);
  settingsModalElement.addEventListener('click', (e) => {
    if (e.target === settingsModalElement) closeSettings();
  });
  addSourceBtnElement.addEventListener('click', () => {
    const nameInput = document.getElementById('source-name') as HTMLInputElement;
    const indexUrlInput = document.getElementById('source-index-url') as HTMLInputElement;
    const contentUrlInput = document.getElementById('source-content-url') as HTMLInputElement;

    const name = nameInput.value.trim();

    // Validate source name - no spaces allowed (use dashes or underscores instead)
    if (!name) {
      alert('Source name is required');
      return;
    }

    if (name.includes(' ')) {
      alert('Source name cannot contain spaces. Please use dashes (-) or underscores (_) instead.\nExample: "local-sop-2" or "local_sop_2"');
      return;
    }

    // Validate source name - only alphanumeric, dashes, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      alert('Source name can only contain letters, numbers, dashes (-), and underscores (_)');
      return;
    }

    let privateConfig = null;
    let indexUrl = '';
    let contentBaseUrl = '';

    if (privateToggleElement.checked) {
      // Private source validation
      const provider = sourceProviderElement.value;
      const repoUrl = sourceRepoUrlElement.value.trim();
      const branch = sourceBranchElement.value.trim();
      const indexPath = sourceIndexPathElement.value.trim();
      const contentBase = sourceContentBaseElement.value.trim();
      const token = sourceTokenElement.value.trim();

      if (!provider) {
        alert('Please select a git provider');
        return;
      }

      if (!repoUrl || !repoUrl.startsWith('https://')) {
        alert('Please provide a valid repository URL starting with https://');
        return;
      }

      if (!branch) {
        alert('Please specify a branch');
        return;
      }

      if (!indexPath) {
        alert('Please specify the search index path');
        return;
      }

      // Normalize paths
      let normalizedIndexPath = indexPath.startsWith('/') ? indexPath.substring(1) : indexPath;
      let normalizedContentBase = contentBase || './';

      // Normalize content base (add trailing slash if relative path)
      if (!isFullUrl(normalizedContentBase) && !normalizedContentBase.endsWith('/')) {
        normalizedContentBase = normalizedContentBase + '/';
      }

      // Strip leading slash from content base if present
      if (!isFullUrl(normalizedContentBase) && normalizedContentBase.startsWith('/')) {
        normalizedContentBase = normalizedContentBase.substring(1);
      }

      privateConfig = {
        enabled: true,
        provider,
        repoUrl,
        branch,
        indexPath: normalizedIndexPath,
        contentBase: normalizedContentBase,
        token
      };
    } else {
      // Regular source validation
      indexUrl = indexUrlInput.value.trim();
      contentBaseUrl = contentUrlInput.value.trim();

      if (!indexUrl || !contentBaseUrl) {
        alert('Index URL and Content base URL are required');
        return;
      }

      // Ensure contentBaseUrl ends with /
      contentBaseUrl = contentBaseUrl.endsWith('/') ? contentBaseUrl : contentBaseUrl + '/';
    }

    // Check if we're editing or adding
    if (editingSourceIndex !== null) {
      updateSource(editingSourceIndex, name, indexUrl, contentBaseUrl, privateConfig);
      cancelEdit();
    } else {
      addSource(name, indexUrl, contentBaseUrl, privateConfig);

      // Clear form
      nameInput.value = '';
      indexUrlInput.value = '';
      contentUrlInput.value = '';
      privateToggleElement.checked = false;
      regularSourceFieldsElement.style.display = 'block';
      privateSourceFieldsElement.style.display = 'none';
      sourceProviderElement.value = '';
      sourceRepoUrlElement.value = '';
      sourceBranchElement.value = '';
      sourceIndexPathElement.value = 'search-index.json';
      sourceContentBaseElement.value = '';
      sourceTokenElement.value = '';
      tokenValidationResultElement.textContent = '';
      contentBaseIndicatorElement.style.display = 'none';

      // Switch to sources-list nested tab to show the newly added source
      settingsNestedTabElements.forEach(t => t.classList.remove('active'));
      sourcesListTabContentElement.classList.add('active');
      addSourceTabContentElement.classList.remove('active');
      editingTabContentElement.classList.remove('active');
      settingsNestedTabElements[0].classList.add('active'); // Activate first nested tab (sources-list)
    }
  });

  // Set up cancel edit button
  const cancelEditBtn = document.getElementById('cancel-edit-btn')!;
  cancelEditBtn.addEventListener('click', cancelEdit);

  // Set up theme toggle (only toggles dark/light mode)
  themeToggleElement.addEventListener('click', toggleTheme);

  // Set up theme selector in settings
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const themeFamily = (e.target as HTMLInputElement).value;
      const currentMode = getCurrentMode();
      applyTheme(`${themeFamily}-${currentMode}`);
      localStorage.setItem('themeFamily', themeFamily);
    });
  });

  // Set up mode selector in settings
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = (e.target as HTMLInputElement).value;
      const currentFamily = getCurrentThemeFamily();
      applyTheme(`${currentFamily}-${mode}`);
      localStorage.setItem('themeMode', mode);
    });
  });

  // Set up left panel toggle
  leftPanelToggleElement.addEventListener('click', () => {
    leftToggleButtonsElement.classList.toggle('collapsed');
    leftPanelToggleElement.classList.toggle('collapsed');
  });

  // Set up layout toggle
  layoutToggleElement.addEventListener('click', toggleLayout);

  // Set up dock manager
  dockManager = new DockManager();
  window.dockManager = dockManager;

  // Dock toggle button (reuse old plugin dashboard toggle)
  pluginDashboardToggleElement.addEventListener('click', () => {
    dockManager.toggle();
  });

  // Dock events
  document.addEventListener('dock-opened', () => {
    updateDockAvailablePlugins();
    updateDockToggleBadge();
  });

  document.addEventListener('dock-closed', () => {
    // Don't close plugins, just hide the dock
    // Plugins remain open and maintain their state
  });

  document.addEventListener('dock-plugin-launch', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { pluginId } = customEvent.detail;
    try {
      await window.pluginManager.openPluginDocked(pluginId, true); // expanded
    } catch (error) {
      console.error('Failed to launch docked plugin:', error);
    }
  });

  document.addEventListener('dock-plugin-undock', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { pluginId } = customEvent.detail;
    try {
      await window.pluginManager.undockPlugin(pluginId);
    } catch (error) {
      console.error('Failed to undock plugin:', error);
    }
  });

  document.addEventListener('dock-plugin-close', (e: Event) => {
    const customEvent = e as CustomEvent;
    const { pluginId } = customEvent.detail;
    window.pluginManager.closePlugin(pluginId, 'docked');
  });

  document.addEventListener('plugin-request-dock', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { pluginId } = customEvent.detail;
    try {
      await window.pluginManager.dockPlugin(pluginId);
    } catch (error) {
      console.error('Failed to dock plugin:', error);
    }
  });

  document.addEventListener('dock-updated', () => {
    updateDockAvailablePlugins();
    updateDockToggleBadge();
  });

  document.addEventListener('plugin-window-refresh', async (e: Event) => {
    const customEvent = e as CustomEvent;
    const { pluginId } = customEvent.detail;
    await window.pluginManager.refreshPluginWindow(pluginId);
  });

  // Call initial update after plugin manager initializes
  window.pluginManager.initialize().then(() => {
    updateDockToggleBadge();
    // Restore docked plugins from persisted state
    restoreDockedPlugins();
  });

  // Listen for custom event to open settings modal
  document.addEventListener('open-settings-modal', ((e: CustomEvent) => {
    settingsModalElement.classList.add('active');
    if (e.detail && e.detail.tab) {
      // Switch to the specified tab
      settingsTabElements.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === e.detail.tab) {
          tab.classList.add('active');
        }
      });
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === `${e.detail.tab}-tab-content`) {
          content.classList.add('active');
        }
      });
      // Render plugin list if switching to plugins tab
      if (e.detail.tab === 'plugins-main') {
        renderPluginList();
      }
    }
  }) as EventListener);

  // Set up routing
  window.addEventListener('hashchange', handleRouteChange);

  // Update editing notification bar
  updateEditingNotificationBar();

  // Update new page button state
  updateNewPageButtonState();

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

// Extract image URLs from markdown content
function extractImageUrls(markdown: string): string[] {
  const imageUrls: string[] = [];

  // Match markdown image syntax: ![alt](url)
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  while ((match = markdownImageRegex.exec(markdown)) !== null) {
    imageUrls.push(match[2]); // match[2] is the URL
  }

  return imageUrls;
}

// Fetch private GitHub images and return as data URLs
async function fetchPrivateImages(
  imageUrls: string[],
  source: Source,
  sourceName: string
): Promise<{ [url: string]: string }> {
  const privateImages: { [url: string]: string } = {};

  // Only process if GitHub private source with token
  if (!source.private || source.private.provider !== 'github') {
    return privateImages;
  }

  const provider = getProvider('github');
  if (!provider || !(provider as any).fetchBinaryFileAsDataUrl) {
    return privateImages;
  }

  const token = provider.getToken(sourceName) || source.private.token;
  if (!token) {
    return privateImages;
  }

  // Process each image URL
  const fetchPromises = imageUrls.map(async (url) => {
    // Skip external URLs (http://, https://, //)
    if (url.match(/^https?:\/\//) || url.startsWith('//')) {
      return;
    }

    // Check cache first
    if (imageCache.has(url)) {
      privateImages[url] = imageCache.get(url)!;
      return;
    }

    try {
      // Construct file path
      let filePath: string;

      if (url.startsWith('/')) {
        // Absolute path relative to content base
        // Remove leading slash
        filePath = url.slice(1);
      } else {
        // Relative path - resolve relative to current file
        const currentDir = filename.includes('/')
          ? filename.substring(0, filename.lastIndexOf('/'))
          : '';

        if (url.startsWith('./')) {
          // ./image.png → same directory
          filePath = currentDir ? `${currentDir}/${url.slice(2)}` : url.slice(2);
        } else if (url.startsWith('../')) {
          // ../image.png → parent directory
          let path = url;
          let dir = currentDir.split('/');

          while (path.startsWith('../')) {
            path = path.substring(3);
            dir.pop();
          }

          filePath = dir.length > 0 ? `${dir.join('/')}/${path}` : path;
        } else {
          // image.png (no ./ prefix) → same directory
          filePath = currentDir ? `${currentDir}/${url}` : url;
        }
      }

      // Add content base if configured (only if relative)
      if (source.private.contentBase && !isFullUrl(source.private.contentBase)) {
        const normalizedContentBase = source.private.contentBase.replace(/^\/+|\/+$/g, '');
        if (normalizedContentBase) {
          filePath = `${normalizedContentBase}/${filePath}`;
        }
      }

      console.log(`Fetching image from GitHub: ${filePath}`);

      // Fetch image via GitHub API
      const result = await (provider as any).fetchBinaryFileAsDataUrl(
        source.private.repoUrl,
        source.private.branch,
        filePath,
        token
      );

      if (result.success && result.dataUrl) {
        privateImages[url] = result.dataUrl;
        imageCache.set(url, result.dataUrl);
        console.log(`Image fetched successfully: ${url}`);
      } else {
        console.warn(`Failed to fetch image ${url}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error fetching image ${url}:`, error);
    }
  });

  // Wait for all image fetches to complete
  await Promise.all(fetchPromises);

  return privateImages;
}

// Load and render a page
async function loadPage(sourceName: string, filename: string, anchor?: string, forceReload: boolean = false) {
  try {
    hideError();
    contentElement.innerHTML = '<div class="loading">Loading...</div>';
    console.log(`Loading page: ${filename} from source: ${sourceName}${anchor ? ` with anchor: ${anchor}` : ''}`);

    // Update current page state immediately (before async operations)
    currentPageFilename = filename;
    currentPageSource = sourceName;

    // Check if it's an editing source
    if (sourceName.startsWith('editing-')) {
      const originalSource = sourceName.replace('editing-', '');
      const editKey = `${originalSource}/${filename}`;
      const editData = getEditingPage(editKey);

      if (editData) {
        currentPageContent = editData.content;
        currentLayout = undefined;

        renderCurrentPage();
        updateLayoutToggle();

        if (anchor) {
          scrollToAnchor(anchor);
        }
        return;
      } else {
        showError(`Edited page not found`);
        return;
      }
    }

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
      if (source.private && isFullUrl(source.private.contentBase)) {
        // Private source with full URL contentBase
        const baseUrl = source.private.contentBase.endsWith('/') ? source.private.contentBase : source.private.contentBase + '/';
        contentUrl = `${baseUrl}${filename}.md`;
      } else if (source.contentBaseUrl) {
        // Regular source
        contentUrl = `${source.contentBaseUrl}${filename}.md`;
      } else if (source.private && !isFullUrl(source.private.contentBase)) {
        // Private source with relative contentBase - will use git provider API below
        contentUrl = ''; // placeholder, will be handled by provider
      } else {
        showError(`Cannot construct content URL for source "${sourceName}"`);
        return;
      }
      if (contentUrl) {
        console.log(`Page "${filename}" not found in index, trying source URL: ${contentUrl}`);
      }
    }

    // Check if we should use git provider API (for private sources with relative contentBase)
    if (source.private && source.private.provider === 'github' && !isFullUrl(source.private.contentBase)) {
      const provider = getProvider('github');
      if (provider && provider.fetchFileContent) {
        const token = provider.getToken(sourceName) || source.private.token;
        if (token) {
          // Construct file path using contentBase (relative)
          let filePath = `${filename}.md`;
          const normalizedContentBase = source.private.contentBase.replace(/^\/+|\/+$/g, '');
          if (normalizedContentBase) {
            filePath = `${normalizedContentBase}/${filePath}`;
          }

          console.log(`Fetching from GitHub API: ${source.private.repoUrl} - ${filePath}`);

          const result = await provider.fetchFileContent(
            source.private.repoUrl,
            source.private.branch,
            filePath,
            token
          );

          if (result.success && result.content) {
            currentPageContent = result.content;
            currentLayout = undefined;

            renderCurrentPage();
            updateLayoutToggle();

            if (anchor) {
              scrollToAnchor(anchor);
            }
            return;
          } else {
            throw new Error(result.error || 'Failed to fetch content from GitHub API');
          }
        }
      }
    }

    // Fallback to regular fetch for public repos or non-GitHub sources
    const fetchOptions: RequestInit = forceReload ? { cache: 'reload' } : {};
    const response = await fetch(contentUrl, fetchOptions);

    if (!response.ok) {
      if (response.status === 404) {
        showError(`Page "${filename}" not found`);
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Fetch markdown as text (not JSON)
    currentPageContent = await response.text();
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
async function renderCurrentPage() {
  // Extract image URLs from markdown
  const imageUrls = extractImageUrls(currentPageContent);

  // Fetch private images if needed
  const sources = loadSources();
  const source = sources.find(s => s.name === currentPageSource);
  let privateImages = {};

  if (source && imageUrls.length > 0) {
    privateImages = await fetchPrivateImages(imageUrls, source, currentPageSource);
  }

  // Render markdown with private images
  const html = renderMarkdown(currentPageContent, currentPageFilename, currentPageSource, currentLayout, {
    sources: loadSources(),
    searchIndex: searchIndex,
    privateImages: privateImages
  });
  contentElement.innerHTML = html;

  // Update source badge
  const sourceBadgeElement = document.getElementById('source-badge')!;
  if (currentPageSource) {
    sourceBadgeElement.innerHTML = `Source: <span class="source-name">${currentPageSource}</span>`;
    sourceBadgeElement.classList.add('visible');
  } else {
    sourceBadgeElement.classList.remove('visible');
  }

  // Update edit actions
  updateEditActions();

  // Apply page width from front matter
  const frontMatter = getFrontMatter(currentPageContent);
  const pageWidth = frontMatter?.['md-page-width'];

  // Check if mobile viewport
  const isMobile = window.innerWidth <= 768;

  if (pageWidth) {
    containerElement.style.width = isMobile ? '100%' : pageWidth;
  } else {
    containerElement.style.width = isMobile ? '100%' : '80%';
  }

  // Add click handlers to hashtags
  attachHashtagHandlers();

  // Render plugin blocks - wait for plugins to be ready
  await renderPluginBlocks();

  // Dispatch page-loaded event for plugins (e.g., browsing history)
  dispatchPageLoadedEvent();
}

// Dispatch page-loaded event for plugins
function dispatchPageLoadedEvent(): void {
  // Extract page title
  let title = '';

  // 1. Try frontmatter title
  const frontMatter = getFrontMatter(currentPageContent);
  if (frontMatter && frontMatter.title) {
    title = frontMatter.title;
  }

  // 2. Try first H1 in rendered content
  if (!title) {
    const h1 = contentElement.querySelector('h1');
    if (h1) {
      title = h1.textContent || '';
    }
  }

  // 3. Fallback to formatted filename
  if (!title) {
    title = currentPageFilename
      .split('/')
      .pop()!
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Get current URL parts
  const hash = window.location.hash.slice(1); // Remove #
  let anchor = '';
  const anchorIndex = hash.indexOf('#', 1);
  if (anchorIndex !== -1) {
    anchor = hash.slice(anchorIndex + 1);
  }

  const event = new CustomEvent('page-loaded', {
    detail: {
      fullUrl: window.location.hash,
      source: currentPageSource,
      filename: currentPageFilename,
      anchor: anchor,
      title: title
    }
  });

  document.dispatchEvent(event);
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

// Toggle controls panel
function togglePanel() {
  const isCollapsed = toggleButtonsElement.classList.toggle('collapsed');
  panelToggleElement.classList.toggle('collapsed', isCollapsed);
  panelToggleElement.title = isCollapsed ? 'Show controls' : 'Hide controls';
}

// Toggle between layouts
function toggleLayout() {
  const frontMatter = getFrontMatter(currentPageContent);
  const defaultLayout = frontMatter?.['md-layout'] || 'simple';

  // Cycle through layouts: simple -> columns -> center -> simple
  const layouts = ['simple', 'columns', 'center'];
  const currentEffective = currentLayout || defaultLayout;
  const currentIndex = layouts.indexOf(currentEffective);
  const nextIndex = (currentIndex + 1) % layouts.length;
  const nextLayout = layouts[nextIndex];

  // If next layout is the default, clear override, otherwise set it
  if (nextLayout === defaultLayout) {
    currentLayout = undefined;
  } else {
    currentLayout = nextLayout;
  }

  renderCurrentPage();
  updateLayoutToggle();
}

// Update layout toggle button icon
function updateLayoutToggle() {
  const frontMatter = getFrontMatter(currentPageContent);
  const defaultLayout = frontMatter?.['md-layout'] || 'simple';
  const effectiveLayout = currentLayout || defaultLayout;

  // Set icon based on current layout
  const icons: Record<string, string> = {
    'simple': '▯',
    'columns': '▦',
    'center': '◯'
  };

  const nextLayout: Record<string, string> = {
    'simple': 'columns',
    'columns': 'center',
    'center': 'simple'
  };

  layoutToggleElement.textContent = icons[effectiveLayout] || '|||';
  layoutToggleElement.title = `Current: ${effectiveLayout} - Click for ${nextLayout[effectiveLayout]}`;
}

// Initialize theme
function initTheme() {
  const savedFamily = localStorage.getItem('themeFamily') || 'solarized';
  const savedMode = localStorage.getItem('themeMode') || 'dark';
  applyTheme(`${savedFamily}-${savedMode}`);

  // Update radio buttons in settings
  updateThemeSelectors(savedFamily, savedMode);
}

// Get current theme family (solarized, monokai, gruvbox)
function getCurrentThemeFamily(): string {
  const saved = localStorage.getItem('themeFamily');
  if (saved) return saved;

  // Parse from current body class
  const classes = document.body.className.split(' ');
  for (const cls of classes) {
    if (cls.startsWith('theme-')) {
      const parts = cls.replace('theme-', '').split('-');
      if (parts.length >= 2) {
        return parts.slice(0, -1).join('-'); // Everything except last part (mode)
      }
    }
  }
  return 'solarized';
}

// Get current mode (dark or light)
function getCurrentMode(): string {
  const saved = localStorage.getItem('themeMode');
  if (saved) return saved;

  // Parse from current body class
  const classes = document.body.className.split(' ');
  for (const cls of classes) {
    if (cls.startsWith('theme-')) {
      const parts = cls.replace('theme-', '').split('-');
      if (parts.length >= 2) {
        return parts[parts.length - 1]; // Last part is mode
      }
    }
  }
  return 'dark';
}

// Apply theme
function applyTheme(themeName: string) {
  // Remove all theme classes
  const allThemes = ['solarized-dark', 'solarized-light', 'monokai-dark', 'monokai-light', 'gruvbox-dark', 'gruvbox-light', 'farout-dark', 'farout-light', 'e-ink-dark', 'e-ink-light'];
  allThemes.forEach(theme => {
    document.body.classList.remove(`theme-${theme}`);
  });

  // Add selected theme class
  document.body.classList.add(`theme-${themeName}`);

  // Update button
  updateThemeButton();
}

// Toggle theme (only toggles dark/light mode)
function toggleTheme() {
  const currentFamily = getCurrentThemeFamily();
  const currentMode = getCurrentMode();

  // Toggle mode
  const newMode = currentMode === 'dark' ? 'light' : 'dark';

  // Apply and save
  applyTheme(`${currentFamily}-${newMode}`);
  localStorage.setItem('themeMode', newMode);

  // Update selectors in settings
  updateThemeSelectors(currentFamily, newMode);

  // Re-render plugin blocks after theme changes (with a small delay to let plugins update)
  setTimeout(() => {
    renderPluginBlocks();
  }, 100);
}

// Update theme button icon and title
function updateThemeButton() {
  const mode = getCurrentMode();
  themeToggleElement.textContent = mode === 'dark' ? '☾' : '☀';
  themeToggleElement.title = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

// Update theme selector radio buttons
function updateThemeSelectors(family: string, mode: string) {
  // Update theme family radio
  const themeRadio = document.querySelector(`input[name="theme"][value="${family}"]`) as HTMLInputElement;
  if (themeRadio) themeRadio.checked = true;

  // Update mode radio
  const modeRadio = document.querySelector(`input[name="mode"][value="${mode}"]`) as HTMLInputElement;
  if (modeRadio) modeRadio.checked = true;
}

// Initialize metadata visibility
function initMetadata() {
  const hideMetadata = localStorage.getItem('hideMetadata') === 'true';
  if (hideMetadata) {
    document.body.classList.add('hide-metadata');
    updateMetadataButton(true);
  } else {
    updateMetadataButton(false);
  }
}

// Toggle metadata visibility
function toggleMetadata() {
  const hideMetadata = document.body.classList.toggle('hide-metadata');
  localStorage.setItem('hideMetadata', hideMetadata ? 'true' : 'false');
  updateMetadataButton(hideMetadata);
}

// Update metadata button state and title
function updateMetadataButton(hidden: boolean) {
  if (hidden) {
    metadataToggleElement.classList.add('hidden-metadata');
    metadataToggleElement.title = 'Show metadata';
  } else {
    metadataToggleElement.classList.remove('hidden-metadata');
    metadataToggleElement.title = 'Hide metadata';
  }
}

// Initialize aside visibility
function initAsides() {
  const hideAsides = localStorage.getItem('hideAsides') === 'true';
  if (hideAsides) {
    document.body.classList.add('hide-asides');
    updateAsideButton(true);
  } else {
    updateAsideButton(false);
  }
}

// Toggle aside visibility
function toggleAsides() {
  const hideAsides = document.body.classList.toggle('hide-asides');
  localStorage.setItem('hideAsides', hideAsides ? 'true' : 'false');
  updateAsideButton(hideAsides);
}

// Update aside button state and title
function updateAsideButton(hidden: boolean) {
  if (hidden) {
    asideToggleElement.classList.add('hidden-asides');
    asideToggleElement.title = 'Show asides';
  } else {
    asideToggleElement.classList.remove('hidden-asides');
    asideToggleElement.title = 'Hide asides';
  }
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

  // Only load indexes from enabled sources (exclude editing sources)
  const enabledSources = sources.filter(source =>
    source.enabled && !source.name.startsWith('editing-')
  );

  if (enabledSources.length === 0) {
    console.log('No enabled sources');
    searchIndex = [];
    return;
  }

  for (const source of enabledSources) {
    try {
      let indexData: SearchIndexItem[] = [];

      // Use git provider API for private sources
      if (source.private) {
        const provider = getProvider(source.private.provider);
        if (provider && provider.fetchFileContent) {
          const token = provider.getToken(source.name) || source.private.token;
          if (token) {
            const indexPath = source.private.indexPath;

            console.log(`Fetching search index from ${source.private.provider} API: ${source.name} - ${indexPath}`);

            const result = await provider.fetchFileContent(
              source.private.repoUrl,
              source.private.branch,
              indexPath,
              token
            );

            if (result.success && result.content) {
              indexData = JSON.parse(result.content);
            } else {
              console.error(`Failed to load index from ${source.name}: ${result.error}`);
              continue;
            }
          } else {
            console.error(`No token for private source ${source.name}`);
            continue;
          }
        } else {
          console.error(`Provider ${source.private.provider} not supported or doesn't support file fetching`);
          continue;
        }
      } else {
        // Regular fetch for public sources
        if (!source.indexUrl) {
          console.error(`Source ${source.name} has no indexUrl`);
          continue;
        }
        const response = await fetch(source.indexUrl);
        if (!response.ok) {
          console.error(`Failed to load index from ${source.name}: ${response.statusText}`);
          continue;
        }
        indexData = await response.json();
      }

      // Augment each item with source information
      const augmentedItems = indexData.map(item => {
        let contentUrl: string | undefined;

        if (source.private && isFullUrl(source.private.contentBase)) {
          // Private source with full URL contentBase (read-only external content)
          const baseUrl = source.private.contentBase.endsWith('/') ? source.private.contentBase : source.private.contentBase + '/';
          contentUrl = `${baseUrl}${item.filename}.md`;
        } else if (source.contentBaseUrl) {
          // Regular source
          contentUrl = `${source.contentBaseUrl}${item.filename}.md`;
        }
        // For private sources with relative contentBase, don't set _contentUrl (will use API)

        return {
          ...item,
          _source: source.name,
          _contentUrl: contentUrl
        };
      });

      allIndexes.push(...augmentedItems);
      console.log(`Loaded ${augmentedItems.length} pages from ${source.name}`);
    } catch (error) {
      console.error(`Error loading index from ${source.name}:`, error);
    }
  }

  searchIndex = allIndexes;
  console.log(`Total: ${allIndexes.length} pages from ${enabledSources.length} enabled source(s)`);

  // Load editing source indexes
  loadEditingSourceIndexes();

  const editingCount = searchIndex.length - allIndexes.length;
  if (editingCount > 0) {
    console.log(`Added ${editingCount} page(s) from editing sources`);
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

// Open settings modal
function renderEditingSourcesList() {
  const container = document.getElementById('editing-sources-list')!;
  const editingPages = loadEditingPages();

  // Group by source
  const grouped: Record<string, string[]> = {};
  for (const key of Object.keys(editingPages)) {
    const [sourceName, ...rest] = key.split('/');
    const filename = rest.join('/');
    if (!grouped[sourceName]) grouped[sourceName] = [];
    grouped[sourceName].push(filename);
  }

  if (Object.keys(grouped).length === 0) {
    container.innerHTML = '<div style="color: var(--text-secondary); padding: 15px; text-align: center;">No pages in edit mode</div>';
    return;
  }

  container.innerHTML = Object.entries(grouped).map(([sourceName, filenames]) => `
    <div class="editing-source-item">
      <div class="editing-source-header">
        <div>
          <div class="editing-source-name">editing-${sourceName}</div>
          <div class="editing-source-count">${filenames.length} page(s)</div>
        </div>
        <button class="editing-source-clear" data-source="${sourceName}">Clear All</button>
      </div>
      <div class="editing-pages-list">
        ${filenames.map(filename => `
          <div class="editing-page-item">
            <div class="editing-page-name">${filename}.md</div>
            <div class="editing-page-actions">
              <button class="editing-page-view" data-source="${sourceName}" data-filename="${filename}">View</button>
              <button class="editing-page-discard" data-source="${sourceName}" data-filename="${filename}">Discard</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Attach handlers
  container.querySelectorAll('.editing-source-clear').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sourceName = (e.target as HTMLElement).dataset.source!;
      if (confirm(`Discard all edits for ${sourceName}? This cannot be undone.`)) {
        clearEditingSource(sourceName);
        renderEditingSourcesList();
        updateEditingNotificationBar();
        loadAllSearchIndexes(); // Refresh indexes
        updateEditingTabVisibility();
      }
    });
  });

  container.querySelectorAll('.editing-page-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sourceName = (e.target as HTMLElement).dataset.source!;
      const filename = (e.target as HTMLElement).dataset.filename!;
      closeSettings();
      window.location.hash = `#/editing-${sourceName}/${filename}`;
    });
  });

  container.querySelectorAll('.editing-page-discard').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sourceName = (e.target as HTMLElement).dataset.source!;
      const filename = (e.target as HTMLElement).dataset.filename!;
      if (confirm(`Discard edits for ${filename}.md? This cannot be undone.`)) {
        removeEditingPage(`${sourceName}/${filename}`);
        renderEditingSourcesList();
        updateEditingNotificationBar();
        loadAllSearchIndexes(); // Refresh indexes
        updateEditingTabVisibility();
      }
    });
  });
}

function updateEditingTabVisibility() {
  const editingPages = loadEditingPages();
  const count = Object.keys(editingPages).length;

  if (count > 0) {
    editingTabElement.style.display = 'block';
    editingTabCountElement.textContent = count.toString();
  } else {
    editingTabElement.style.display = 'none';
    // Switch to sources-list nested tab if currently on editing tab
    if (editingTabContentElement.classList.contains('active')) {
      settingsNestedTabElements.forEach(t => t.classList.remove('active'));
      sourcesListTabContentElement.classList.add('active');
      addSourceTabContentElement.classList.remove('active');
      editingTabContentElement.classList.remove('active');
      settingsNestedTabElements[0].classList.add('active'); // Activate first nested tab (sources-list)
    }
  }
}

function openSettings() {
  settingsModalElement.classList.add('active');
  renderSourcesList();
  renderEditingSourcesList();
  updateEditingTabVisibility();
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

// Plugin Management Functions

function updateDockToggleBadge() {
  if (!dockManager || !pluginDashboardToggleElement) return;

  const dockedCount = dockManager.getDockedPluginCount();

  if (dockedCount > 0) {
    pluginDashboardToggleElement.setAttribute('data-badge', String(dockedCount));
  } else {
    pluginDashboardToggleElement.removeAttribute('data-badge');
  }
}

function updateDockAvailablePlugins() {
  if (!window.pluginManager || !dockManager) return;

  const toolPlugins = window.pluginManager.getToolPlugins();
  const dockedPluginIds = new Set(dockManager.getDockedPlugins().map(p => p.pluginId));

  // Filter out docked plugins from available list
  const availablePlugins = toolPlugins
    .filter(p => window.pluginManager.isEnabled(p.manifest.id) && !dockedPluginIds.has(p.manifest.id))
    .map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      icon: p.manifest.icon || '🔌'
    }));

  dockManager.setAvailablePlugins(availablePlugins);
}

async function restoreDockedPlugins() {
  if (!window.pluginManager || !dockManager) return;

  const persistedPlugins = dockManager.getPersistedDockedPlugins();

  for (const { pluginId, expanded } of persistedPlugins) {
    if (window.pluginManager.isEnabled(pluginId)) {
      try {
        await window.pluginManager.openPluginDocked(pluginId, expanded);
      } catch (error) {
        console.error(`Failed to restore docked plugin ${pluginId}:`, error);
      }
    }
  }

  updateDockAvailablePlugins();
  updateDockToggleBadge();
}

async function triggerAddBookmark() {
  // Ensure bookmarks plugin is enabled
  if (!window.pluginManager || !window.pluginManager.isEnabled('bookmarks')) {
    console.log('Bookmarks plugin is not enabled');
    return;
  }

  // Open dock if closed
  if (!dockManager.isOpened()) {
    dockManager.open();
  }

  // Open bookmarks plugin if not already open
  if (!window.pluginManager.isPluginOpen('bookmarks')) {
    try {
      await window.pluginManager.openPluginDocked('bookmarks', true);
    } catch (error) {
      console.error('Failed to open bookmarks plugin:', error);
      return;
    }
  }

  // Trigger add bookmark action
  setTimeout(() => {
    const addBtn = document.getElementById('add-bookmark-btn');
    if (addBtn) {
      addBtn.click();
    }
  }, 100);
}

function renderPluginList() {
  if (!window.pluginManager) {
    pluginListElement.innerHTML = '<div class="plugin-empty-state">Plugin manager not initialized</div>';
    return;
  }

  const plugins = window.pluginManager.getPluginList();

  if (plugins.length === 0) {
    pluginListElement.innerHTML = `
      <div class="plugin-empty-state">
        No plugins available.
        Install a remote plugin or add plugins to src/plugins/ and rebuild.
      </div>
    `;
    return;
  }

  pluginListElement.innerHTML = plugins.map(plugin => {
    const enabled = window.pluginManager.isEnabled(plugin.manifest.id);
    const pluginType = plugin.manifest.type || 'renderer';
    const typeBadge = pluginType === 'tool'
      ? '<span class="plugin-type-badge plugin-type-tool">Tool</span>'
      : '<span class="plugin-type-badge plugin-type-renderer">Renderer</span>';

    const isToolPlugin = pluginType === 'tool';
    const autoload = isToolPlugin ? window.pluginManager.isAutoload(plugin.manifest.id) : false;

    const autoloadToggle = isToolPlugin ? `
      <label class="plugin-autoload-toggle" title="Auto-open on page load (minimized)">
        <input type="checkbox"
               class="plugin-autoload-checkbox"
               data-plugin="${plugin.manifest.id}"
               ${autoload ? 'checked' : ''}
               ${!enabled ? 'disabled' : ''}>
        <span class="plugin-autoload-label">Autoload</span>
      </label>
    ` : '';

    // History limit config for browsing-history plugin
    const historyConfig = (plugin.manifest.id === 'browsing-history' && enabled) ? `
      <div class="plugin-config">
        <label class="plugin-config-label">
          History Limit:
          <input type="number"
                 class="plugin-config-input"
                 data-plugin="browsing-history"
                 data-config-key="historyLimit"
                 value="${plugin.manifest.config?.historyLimit || 20}"
                 min="5"
                 max="100"
                 title="Number of history entries to retain (5-100)">
          <span class="plugin-config-hint">entries</span>
        </label>
      </div>
    ` : '';

    return `
      <div class="plugin-item ${enabled ? 'enabled' : 'disabled'}">
        <div class="plugin-item-icon">${plugin.manifest.icon || '🔌'}</div>
        <div class="plugin-item-info">
          <div class="plugin-item-name">${escapeHtml(plugin.manifest.name)} ${typeBadge}</div>
          <div class="plugin-item-description">${escapeHtml(plugin.manifest.description)}</div>
          <div class="plugin-item-meta">
            v${escapeHtml(plugin.manifest.version)} • ${escapeHtml(plugin.manifest.author)}
            ${plugin.manifest.triggers && plugin.manifest.triggers.length > 0 ? ` • Triggers: ${plugin.manifest.triggers.join(', ')}` : ''}
          </div>
          ${historyConfig}
        </div>
        <div class="plugin-item-actions">
          ${autoloadToggle}
          <label class="plugin-toggle">
            <input type="checkbox"
                   class="plugin-toggle-checkbox"
                   data-plugin="${plugin.manifest.id}"
                   ${enabled ? 'checked' : ''}>
            <span class="plugin-toggle-slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join('');

  // Attach toggle handlers
  pluginListElement.querySelectorAll('.plugin-toggle-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const pluginId = (e.target as HTMLInputElement).getAttribute('data-plugin')!;
      const enabled = (e.target as HTMLInputElement).checked;

      try {
        if (enabled) {
          await window.pluginManager.enablePlugin(pluginId);
        } else {
          await window.pluginManager.disablePlugin(pluginId);
        }

        // Re-render the current page to show plugin changes
        renderCurrentPage();

        // Update dashboard badge
        updatePluginDashboardBadge();
      } catch (error: any) {
        console.error(`Failed to ${enabled ? 'enable' : 'disable'} plugin ${pluginId}:`, error);
        alert(`Failed to ${enabled ? 'enable' : 'disable'} plugin: ${error.message}`);
        // Revert checkbox state
        (e.target as HTMLInputElement).checked = !enabled;
      }

      renderPluginList(); // Re-render list
    });
  });

  // Attach autoload toggle handlers
  pluginListElement.querySelectorAll('.plugin-autoload-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const pluginId = (e.target as HTMLInputElement).getAttribute('data-plugin')!;
      const autoload = (e.target as HTMLInputElement).checked;

      window.pluginManager.setAutoload(pluginId, autoload);
      console.log(`Autoload ${autoload ? 'enabled' : 'disabled'} for plugin ${pluginId}`);
    });
  });

  // Attach plugin config input handlers
  pluginListElement.querySelectorAll('.plugin-config-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const pluginId = (e.target as HTMLInputElement).getAttribute('data-plugin')!;
      const configKey = (e.target as HTMLInputElement).getAttribute('data-config-key')!;
      const value = parseInt((e.target as HTMLInputElement).value);

      // Validate range
      const min = parseInt((e.target as HTMLInputElement).min);
      const max = parseInt((e.target as HTMLInputElement).max);

      if (value < min || value > max) {
        alert(`Value must be between ${min} and ${max}`);
        (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).defaultValue;
        return;
      }

      // Update plugin config
      const config = { [configKey]: value };
      window.pluginManager.updatePluginConfig(pluginId, config);
      console.log(`Updated ${pluginId} config: ${configKey} = ${value}`);
    });
  });
}

async function renderPluginBlocks(): Promise<void> {
  if (!window.pluginManager) {
    console.warn('Plugin manager not initialized');
    return;
  }

  const pluginBlocks = contentElement.querySelectorAll('.plugin-block[data-has-plugin="true"]');

  for (const block of pluginBlocks) {
    const language = block.getAttribute('data-plugin');
    const blockId = block.getAttribute('data-block-id');
    const content = block.getAttribute('data-content');

    if (!language || !blockId || !content) continue;

    // Map language trigger to actual plugin ID
    const pluginId = window.pluginManager.getPluginIdForLanguage(language);

    if (!pluginId) {
      // Plugin not found or not enabled
      const renderArea = block.querySelector('.plugin-render-area');
      if (renderArea) {
        renderArea.innerHTML = `<div class="plugin-disabled-message">
          No enabled plugin found for language "${escapeHtml(language)}".
        </div>`;
      }
      continue;
    }

    try {
      // Show loading state
      const renderArea = block.querySelector('.plugin-render-area');
      if (renderArea) {
        renderArea.innerHTML = '<div class="plugin-loading">Loading diagram...</div>';
      }

      await window.pluginManager.renderBlock(pluginId, blockId, content, language);
    } catch (error: any) {
      console.error(`Failed to render plugin block ${blockId}:`, error);
      const renderArea = block.querySelector('.plugin-render-area');
      if (renderArea) {
        renderArea.innerHTML = `<div class="plugin-error">
          <strong>Error rendering plugin:</strong> ${escapeHtml(error.message)}
        </div>`;
      }
    }
  }

  // Attach enable plugin click handlers
  attachEnablePluginHandlers();
}

function attachEnablePluginHandlers() {
  contentElement.querySelectorAll('.enable-plugin-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const pluginId = (e.target as HTMLElement).getAttribute('data-plugin');
      if (pluginId) {
        try {
          await window.pluginManager.enablePlugin(pluginId);
          renderCurrentPage(); // Re-render to show enabled plugin
        } catch (error: any) {
          console.error(`Failed to enable plugin ${pluginId}:`, error);
          alert(`Failed to enable plugin: ${error.message}`);
        }
      }
    });
  });
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
