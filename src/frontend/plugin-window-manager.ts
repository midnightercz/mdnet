// Plugin Window Manager
// Handles creation, dragging, resizing, and state persistence for plugin windows (floating mode only)
// Docked plugins are managed by DockManager

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

interface PluginWindow {
  id: string;
  pluginId: string;
  element: HTMLElement;
  state: WindowState;
  zIndex: number;
  mode: 'floating' | 'docked';
}

export class PluginWindowManager {
  private windows: Map<string, PluginWindow> = new Map(); // Only floating windows
  private dockedPlugins: Map<string, { element: HTMLElement; expanded: boolean }> = new Map();
  private minimizedChips: Map<string, HTMLElement> = new Map();
  private baseZIndex = 2500;
  private currentZIndex = 2500;
  private dragState: { window: PluginWindow; offsetX: number; offsetY: number } | null = null;
  private resizeState: { window: PluginWindow; handle: string; startX: number; startY: number; startWidth: number; startHeight: number; startLeft: number; startTop: number } | null = null;

  constructor() {
    // Set up global event listeners for drag and resize
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));
    document.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
  }

  createWindow(
    pluginId: string,
    pluginName: string,
    pluginIcon: string,
    contentHtml: string,
    defaultWidth: number = 600,
    defaultHeight: number = 400,
    minWidth: number = 300,
    minHeight: number = 200,
    openMinimized: boolean = false
  ): string {
    const windowId = `plugin-window-${pluginId}`;

    // Check if window already exists
    if (this.windows.has(windowId)) {
      this.focusWindow(windowId);
      return windowId;
    }

    // Load saved state or use defaults
    const savedState = this.loadWindowState(pluginId);
    let state: WindowState = savedState || {
      x: window.innerWidth / 2 - defaultWidth / 2,
      y: window.innerHeight / 2 - defaultHeight / 2,
      width: defaultWidth,
      height: defaultHeight,
      minimized: false
    };

    // Override minimized state if explicitly requested
    if (openMinimized) {
      state.minimized = true;
    }

    // Constrain to current screen bounds (in case screen size changed)
    const maxX = window.innerWidth - state.width;
    const maxY = window.innerHeight - state.height;
    state.x = Math.max(0, Math.min(maxX, state.x));
    state.y = Math.max(0, Math.min(maxY, state.y));

    // Create window element
    const windowEl = document.createElement('div');
    windowEl.id = windowId;
    windowEl.className = 'plugin-window';
    windowEl.style.left = `${state.x}px`;
    windowEl.style.top = `${state.y}px`;
    windowEl.style.width = `${state.width}px`;
    windowEl.style.height = `${state.height}px`;
    windowEl.style.zIndex = String(++this.currentZIndex);
    windowEl.dataset.minWidth = String(minWidth);
    windowEl.dataset.minHeight = String(minHeight);

    windowEl.innerHTML = `
      <div class="plugin-window-header">
        <div class="plugin-window-title">
          <span class="plugin-window-icon">${pluginIcon}</span>
          <span class="plugin-window-name">${this.escapeHtml(pluginName)}</span>
        </div>
        <div class="plugin-window-controls">
          <button class="plugin-window-btn plugin-window-dock" title="Dock" data-plugin-id="${pluginId}">📌</button>
          <button class="plugin-window-btn plugin-window-close" title="Close">×</button>
        </div>
      </div>
      <div class="plugin-window-content">${contentHtml}</div>
      <div class="plugin-window-resize-handle plugin-window-resize-n" data-direction="n"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-s" data-direction="s"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-e" data-direction="e"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-w" data-direction="w"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-ne" data-direction="ne"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-nw" data-direction="nw"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-se" data-direction="se"></div>
      <div class="plugin-window-resize-handle plugin-window-resize-sw" data-direction="sw"></div>
    `;

    document.body.appendChild(windowEl);

    // Store window
    const pluginWindow: PluginWindow = {
      id: windowId,
      pluginId,
      element: windowEl,
      state,
      zIndex: this.currentZIndex
    };
    this.windows.set(windowId, pluginWindow);

    // Set up event listeners
    this.setupWindowEvents(pluginWindow, pluginName, pluginIcon);

    // If opening minimized, minimize immediately
    if (state.minimized) {
      this.minimizeWindow(windowId, pluginName, pluginIcon);
    }

    return windowId;
  }

  private setupWindowEvents(pluginWindow: PluginWindow, pluginName: string, pluginIcon: string): void {
    const el = pluginWindow.element;

    // Drag by header (mouse)
    const header = el.querySelector('.plugin-window-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.plugin-window-controls')) return;
      this.startDrag(pluginWindow, e.clientX, e.clientY);
    });

    // Drag by header (touch)
    header.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement).closest('.plugin-window-controls')) return;
      const touch = e.touches[0];
      this.startDrag(pluginWindow, touch.clientX, touch.clientY);
    }, { passive: true });

    // Close button
    const closeBtn = el.querySelector('.plugin-window-close') as HTMLElement;
    closeBtn.addEventListener('click', () => {
      this.closeWindow(pluginWindow.id);
    });

    // Dock button
    const dockBtn = el.querySelector('.plugin-window-dock') as HTMLElement;
    if (dockBtn) {
      dockBtn.addEventListener('click', () => {
        const pluginId = dockBtn.dataset.pluginId!;
        // Dispatch event for plugin manager to handle docking
        const event = new CustomEvent('plugin-request-dock', { detail: { pluginId } });
        document.dispatchEvent(event);
      });
    }

    // Resize handles (mouse)
    const resizeHandles = el.querySelectorAll('.plugin-window-resize-handle');
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        const mouseEvent = e as MouseEvent;
        this.startResize(pluginWindow, (handle as HTMLElement).dataset.direction!, mouseEvent.clientX, mouseEvent.clientY);
      });
    });

    // Resize handles (touch)
    resizeHandles.forEach(handle => {
      handle.addEventListener('touchstart', (e) => {
        const touchEvent = e as TouchEvent;
        const touch = touchEvent.touches[0];
        this.startResize(pluginWindow, (handle as HTMLElement).dataset.direction!, touch.clientX, touch.clientY);
      }, { passive: true });
    });

    // Focus on click/touch
    el.addEventListener('mousedown', () => {
      this.focusWindow(pluginWindow.id);
    });
    el.addEventListener('touchstart', () => {
      this.focusWindow(pluginWindow.id);
    }, { passive: true });
  }

  private startDrag(pluginWindow: PluginWindow, clientX: number, clientY: number): void {
    this.focusWindow(pluginWindow.id);

    const rect = pluginWindow.element.getBoundingClientRect();
    this.dragState = {
      window: pluginWindow,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top
    };
  }

  private startResize(pluginWindow: PluginWindow, handle: string, clientX: number, clientY: number): void {
    this.focusWindow(pluginWindow.id);

    const rect = pluginWindow.element.getBoundingClientRect();
    this.resizeState = {
      window: pluginWindow,
      handle,
      startX: clientX,
      startY: clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      startLeft: rect.left,
      startTop: rect.top
    };
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.dragState) {
      let newX = e.clientX - this.dragState.offsetX;
      let newY = e.clientY - this.dragState.offsetY;

      // Get window dimensions
      const rect = this.dragState.window.element.getBoundingClientRect();
      const windowWidth = rect.width;
      const windowHeight = rect.height;

      // Constrain to screen bounds
      // Allow title bar to go to edge but not beyond
      const minX = 0;
      const minY = 0;
      const maxX = window.innerWidth - windowWidth;
      const maxY = window.innerHeight - windowHeight;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      this.dragState.window.element.style.left = `${newX}px`;
      this.dragState.window.element.style.top = `${newY}px`;
      this.dragState.window.state.x = newX;
      this.dragState.window.state.y = newY;
    }

    if (this.resizeState) {
      const { window: win, handle, startX, startY, startWidth, startHeight, startLeft, startTop } = this.resizeState;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const minWidth = parseInt(win.element.dataset.minWidth || '300');
      const minHeight = parseInt(win.element.dataset.minHeight || '200');
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.9;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      // Handle different resize directions
      if (handle.includes('e')) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      }
      if (handle.includes('w')) {
        const proposedWidth = startWidth - deltaX;
        if (proposedWidth >= minWidth && proposedWidth <= maxWidth) {
          newWidth = proposedWidth;
          newLeft = startLeft + deltaX;
        }
      }
      if (handle.includes('s')) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      }
      if (handle.includes('n')) {
        const proposedHeight = startHeight - deltaY;
        if (proposedHeight >= minHeight && proposedHeight <= maxHeight) {
          newHeight = proposedHeight;
          newTop = startTop + deltaY;
        }
      }

      win.element.style.width = `${newWidth}px`;
      win.element.style.height = `${newHeight}px`;
      win.element.style.left = `${newLeft}px`;
      win.element.style.top = `${newTop}px`;

      win.state.width = newWidth;
      win.state.height = newHeight;
      win.state.x = newLeft;
      win.state.y = newTop;
    }
  }

  private handleMouseUp(): void {
    if (this.dragState) {
      this.saveWindowState(this.dragState.window.pluginId, this.dragState.window.state);
      this.dragState = null;
    }

    if (this.resizeState) {
      this.saveWindowState(this.resizeState.window.pluginId, this.resizeState.window.state);
      this.resizeState = null;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.dragState && !this.resizeState) return;

    e.preventDefault(); // Prevent scrolling during drag/resize
    const touch = e.touches[0];

    if (this.dragState) {
      let newX = touch.clientX - this.dragState.offsetX;
      let newY = touch.clientY - this.dragState.offsetY;

      // Get window dimensions
      const rect = this.dragState.window.element.getBoundingClientRect();
      const windowWidth = rect.width;
      const windowHeight = rect.height;

      // Constrain to screen bounds
      const minX = 0;
      const minY = 0;
      const maxX = window.innerWidth - windowWidth;
      const maxY = window.innerHeight - windowHeight;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      this.dragState.window.element.style.left = `${newX}px`;
      this.dragState.window.element.style.top = `${newY}px`;
      this.dragState.window.state.x = newX;
      this.dragState.window.state.y = newY;
    }

    if (this.resizeState) {
      const { window: win, handle, startX, startY, startWidth, startHeight, startLeft, startTop } = this.resizeState;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      const minWidth = parseInt(win.element.dataset.minWidth || '300');
      const minHeight = parseInt(win.element.dataset.minHeight || '200');
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.9;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      // Handle different resize directions
      if (handle.includes('e')) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      }
      if (handle.includes('w')) {
        const proposedWidth = startWidth - deltaX;
        if (proposedWidth >= minWidth && proposedWidth <= maxWidth) {
          newWidth = proposedWidth;
          newLeft = startLeft + deltaX;
        }
      }
      if (handle.includes('s')) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      }
      if (handle.includes('n')) {
        const proposedHeight = startHeight - deltaY;
        if (proposedHeight >= minHeight && proposedHeight <= maxHeight) {
          newHeight = proposedHeight;
          newTop = startTop + deltaY;
        }
      }

      win.element.style.width = `${newWidth}px`;
      win.element.style.height = `${newHeight}px`;
      win.element.style.left = `${newLeft}px`;
      win.element.style.top = `${newTop}px`;

      win.state.width = newWidth;
      win.state.height = newHeight;
      win.state.x = newLeft;
      win.state.y = newTop;
    }
  }

  private handleTouchEnd(): void {
    if (this.dragState) {
      this.saveWindowState(this.dragState.window.pluginId, this.dragState.window.state);
      this.dragState = null;
    }

    if (this.resizeState) {
      this.saveWindowState(this.resizeState.window.pluginId, this.resizeState.window.state);
      this.resizeState = null;
    }
  }

  focusWindow(windowId: string): void {
    const pluginWindow = this.windows.get(windowId);
    if (!pluginWindow) return;

    pluginWindow.zIndex = ++this.currentZIndex;
    pluginWindow.element.style.zIndex = String(pluginWindow.zIndex);
  }

  closeWindow(windowId: string): void {
    const pluginWindow = this.windows.get(windowId);
    if (!pluginWindow) return;

    pluginWindow.element.remove();
    this.windows.delete(windowId);

    // Also remove minimized chip if exists
    const chip = this.minimizedChips.get(windowId);
    if (chip) {
      chip.remove();
      this.minimizedChips.delete(windowId);
    }

    // Trigger close callback (handled by plugin manager)
    const event = new CustomEvent('plugin-window-closed', { detail: { pluginId: pluginWindow.pluginId } });
    document.dispatchEvent(event);
  }

  minimizeWindow(windowId: string, pluginName: string, pluginIcon: string): void {
    const pluginWindow = this.windows.get(windowId);
    if (!pluginWindow) return;

    pluginWindow.element.style.display = 'none';
    pluginWindow.state.minimized = true;

    // Create minimized chip
    const chip = document.createElement('div');
    chip.className = 'plugin-minimized-chip';
    chip.dataset.windowId = windowId;
    chip.style.zIndex = String(pluginWindow.zIndex);
    chip.innerHTML = `
      <span class="plugin-minimized-icon">${pluginIcon}</span>
      <span class="plugin-minimized-name">${this.escapeHtml(pluginName)}</span>
    `;

    chip.addEventListener('click', () => {
      this.restoreWindow(windowId);
    });

    document.body.appendChild(chip);
    this.minimizedChips.set(windowId, chip);
    this.repositionMinimizedChips();
  }

  restoreWindow(windowId: string): void {
    const pluginWindow = this.windows.get(windowId);
    if (!pluginWindow) return;

    pluginWindow.element.style.display = 'flex';
    pluginWindow.state.minimized = false;
    this.focusWindow(windowId);

    // Remove chip
    const chip = this.minimizedChips.get(windowId);
    if (chip) {
      chip.remove();
      this.minimizedChips.delete(windowId);
    }

    this.repositionMinimizedChips();
  }

  private repositionMinimizedChips(): void {
    const chips = Array.from(this.minimizedChips.values());
    const gap = 10;
    const chipHeight = 40;
    const leftOffset = 20;
    const bottomOffset = 20;

    chips.forEach((chip, index) => {
      chip.style.bottom = `${bottomOffset + index * (chipHeight + gap)}px`;
      chip.style.left = `${leftOffset}px`;
    });
  }

  updateWindowContent(pluginId: string, contentHtml: string): void {
    const windowId = `plugin-window-${pluginId}`;
    const pluginWindow = this.windows.get(windowId);
    if (!pluginWindow) return;

    const contentEl = pluginWindow.element.querySelector('.plugin-window-content');
    if (contentEl) {
      contentEl.innerHTML = contentHtml;
    }
  }

  isWindowOpen(pluginId: string): boolean {
    const windowId = `plugin-window-${pluginId}`;
    return this.windows.has(windowId);
  }

  private loadWindowState(pluginId: string): WindowState | null {
    try {
      const key = `mdnet-plugin-window-state-${pluginId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored) as WindowState;
      }
    } catch (error) {
      console.error(`Failed to load window state for ${pluginId}:`, error);
    }
    return null;
  }

  private saveWindowState(pluginId: string, state: WindowState): void {
    try {
      const key = `mdnet-plugin-window-state-${pluginId}`;
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Failed to save window state for ${pluginId}:`, error);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Docked plugin methods
  createDockedPlugin(pluginId: string, contentElement: HTMLElement, expanded: boolean = true): void {
    this.dockedPlugins.set(pluginId, { element: contentElement, expanded });
  }

  removeDockedPlugin(pluginId: string): void {
    this.dockedPlugins.delete(pluginId);
  }

  isPluginDocked(pluginId: string): boolean {
    return this.dockedPlugins.has(pluginId);
  }

  isPluginFloating(pluginId: string): boolean {
    const windowId = `plugin-window-${pluginId}`;
    return this.windows.has(windowId);
  }

  isPluginOpen(pluginId: string): boolean {
    return this.isPluginDocked(pluginId) || this.isPluginFloating(pluginId);
  }

  getPluginMode(pluginId: string): 'docked' | 'floating' | null {
    if (this.isPluginDocked(pluginId)) return 'docked';
    if (this.isPluginFloating(pluginId)) return 'floating';
    return null;
  }

  getDockedPluginContent(pluginId: string): HTMLElement | null {
    const docked = this.dockedPlugins.get(pluginId);
    return docked ? docked.element : null;
  }
}
