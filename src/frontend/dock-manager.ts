// Dock Manager
// Manages the plugin dock state, layout, and persistence

interface DockState {
  open: boolean;
  width: number;
  availableSectionCollapsed: boolean;
  dockedPlugins: DockedPluginState[];
}

interface DockedPluginState {
  pluginId: string;
  expanded: boolean;
}

export class DockManager {
  private dockElement: HTMLElement;
  private dockContentElement: HTMLElement;
  private availableHeaderElement: HTMLElement;
  private availableListElement: HTMLElement;
  private availableCountElement: HTMLElement;
  private availableSectionElement: HTMLElement;
  private activeListElement: HTMLElement;
  private backdropElement: HTMLElement;
  private resizeHandleElement: HTMLElement;
  private toggleButtonElement: HTMLElement;

  private isOpen: boolean = false;
  private dockWidth: number = 400;
  private availableSectionCollapsed: boolean = false;
  private dockedPluginStates: Map<string, boolean> = new Map(); // pluginId -> expanded

  private readonly STORAGE_KEY = 'mdnet-dock-state';
  private readonly MIN_DOCK_WIDTH = 280;
  private readonly MIN_CONTENT_WIDTH = 500;

  private resizeDragState: { startX: number; startWidth: number } | null = null;

  private slotDragState: {
    slot: HTMLElement;
    pluginId: string;
    startY: number;
    currentY: number;
    hasMoved: boolean;
    longPressTimer: number | null;
  } | null = null;
  private autoScrollInterval: number | null = null;

  constructor() {
    this.dockElement = document.getElementById('plugin-dock')!;
    this.dockContentElement = this.dockElement.querySelector('.dock-content')!;
    this.availableHeaderElement = document.getElementById('dock-available-header')!;
    this.availableListElement = document.getElementById('dock-available-list')!;
    this.availableCountElement = document.getElementById('dock-available-count')!;
    this.availableSectionElement = document.getElementById('dock-available-section')!;
    this.activeListElement = document.getElementById('dock-active-list')!;
    this.backdropElement = document.getElementById('dock-backdrop')!;
    this.resizeHandleElement = this.dockElement.querySelector('.dock-resize-handle')!;
    this.toggleButtonElement = document.getElementById('plugin-dashboard-toggle')!;

    this.setupEventListeners();
    this.loadState();
  }

  private setupEventListeners(): void {
    // Available section toggle
    this.availableHeaderElement.addEventListener('click', (e) => {
      // Don't toggle if clicking the dock toggle button
      if ((e.target as HTMLElement).closest('#plugin-dashboard-toggle')) return;
      this.toggleAvailableSection();
    });

    // Backdrop click (overlay mode)
    this.backdropElement.addEventListener('click', () => {
      this.close();
    });

    // Resize handle
    this.resizeHandleElement.addEventListener('mousedown', this.startResize.bind(this));
    document.addEventListener('mousemove', this.handleResizeMove.bind(this));
    document.addEventListener('mouseup', this.stopResize.bind(this));

    // Keyboard shortcut (Ctrl/Cmd+D)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Escape key to close (overlay mode)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && this.isOverlayMode()) {
        this.close();
      }
    });
  }

  private startResize(e: MouseEvent): void {
    if (this.isOverlayMode()) return; // No resize in overlay mode

    e.preventDefault();
    this.resizeDragState = {
      startX: e.clientX,
      startWidth: this.dockWidth
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.resizeDragState) return;

    const deltaX = e.clientX - this.resizeDragState.startX;
    const newWidth = this.resizeDragState.startWidth + deltaX;

    // Constrain width
    const maxWidth = window.innerWidth - this.MIN_CONTENT_WIDTH;
    const constrainedWidth = Math.max(this.MIN_DOCK_WIDTH, Math.min(maxWidth, newWidth));

    this.setDockWidth(constrainedWidth);
  }

  private stopResize(): void {
    if (!this.resizeDragState) return;

    this.resizeDragState = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.saveState();
  }

  private setDockWidth(width: number): void {
    this.dockWidth = width;
    if (this.isOpen && !this.isOverlayMode()) {
      this.dockElement.style.width = `${width}px`;
    }
  }

  private isOverlayMode(): boolean {
    return window.innerWidth < 900;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isOpen = true;
    this.dockElement.classList.add('open');

    // Move toggle button into dock header (before title)
    this.availableHeaderElement.insertBefore(this.toggleButtonElement, this.availableHeaderElement.firstChild);

    if (this.isOverlayMode()) {
      this.backdropElement.classList.add('visible');
    } else {
      this.setDockWidth(this.dockWidth);
    }

    // Restore plugin expanded/collapsed states
    this.dockedPluginStates.forEach((expanded, pluginId) => {
      if (expanded) {
        this.expandSlot(pluginId);
      } else {
        this.minimizeSlot(pluginId);
      }
    });

    this.saveState();

    // Dispatch event for other components
    const event = new CustomEvent('dock-opened');
    document.dispatchEvent(event);
  }

  close(): void {
    this.isOpen = false;
    this.dockElement.classList.remove('open');
    this.backdropElement.classList.remove('visible');

    // Move toggle button back to floating position (before dock element)
    this.dockElement.parentElement!.insertBefore(this.toggleButtonElement, this.dockElement);

    this.saveState();

    // Dispatch event for other components
    const event = new CustomEvent('dock-closed');
    document.dispatchEvent(event);
  }

  isOpened(): boolean {
    return this.isOpen;
  }

  getDockWidth(): number {
    return this.dockWidth;
  }

  toggleAvailableSection(): void {
    this.availableSectionCollapsed = !this.availableSectionCollapsed;

    if (this.availableSectionCollapsed) {
      this.availableHeaderElement.classList.add('collapsed');
      this.availableListElement.classList.add('collapsed');
    } else {
      this.availableHeaderElement.classList.remove('collapsed');
      this.availableListElement.classList.remove('collapsed');
    }

    this.saveState();
  }

  setAvailablePlugins(plugins: Array<{ id: string; name: string; icon: string }>): void {
    this.availableCountElement.textContent = `(${plugins.length})`;

    if (plugins.length === 0) {
      this.availableListElement.innerHTML = '';
      return;
    }

    this.availableListElement.innerHTML = plugins.map(plugin => `
      <div class="dock-available-item" data-plugin-id="${this.escapeHtml(plugin.id)}">
        <span class="dock-available-icon">${plugin.icon || '🔌'}</span>
        <span class="dock-available-name">${this.escapeHtml(plugin.name)}</span>
      </div>
    `).join('');

    // Attach click handlers
    this.availableListElement.querySelectorAll('.dock-available-item').forEach(item => {
      item.addEventListener('click', () => {
        const pluginId = (item as HTMLElement).dataset.pluginId!;
        const event = new CustomEvent('dock-plugin-launch', { detail: { pluginId } });
        document.dispatchEvent(event);
      });
    });
  }

  addDockedSlot(pluginId: string, pluginName: string, pluginIcon: string, content: string, expanded: boolean = true): HTMLElement {
    const slotEl = document.createElement('div');
    slotEl.className = `dock-slot ${expanded ? 'expanded' : ''}`;
    slotEl.dataset.pluginId = pluginId;
    slotEl.dataset.slotType = 'docked';

    const undockBtn = expanded ? '<button class="dock-slot-btn dock-slot-undock" title="Undock">↗</button>' : '';
    const closeBtn = '<button class="dock-slot-btn dock-slot-close" title="Close">×</button>';

    slotEl.innerHTML = `
      <div class="dock-slot-header">
        <span class="dock-drag-handle" title="Drag to reorder">≡</span>
        <span class="dock-slot-icon">${pluginIcon}</span>
        <span class="dock-slot-name">${this.escapeHtml(pluginName)}</span>
        <div class="dock-slot-controls">
          ${undockBtn}
          ${closeBtn}
        </div>
      </div>
      <div class="dock-slot-content">${content}</div>
    `;

    this.activeListElement.appendChild(slotEl);

    // Set up event listeners
    this.setupSlotEventListeners(slotEl, pluginId);

    // Store state
    this.dockedPluginStates.set(pluginId, expanded);
    this.saveState();

    // Scroll to show new slot
    setTimeout(() => {
      slotEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    return slotEl;
  }

  private setupSlotEventListeners(slotEl: HTMLElement, pluginId: string): void {
    const header = slotEl.querySelector('.dock-slot-header')!;
    const undockBtn = slotEl.querySelector('.dock-slot-undock');
    const closeBtn = slotEl.querySelector('.dock-slot-close')!;

    // Click header to toggle expand/minimize (only if not dragging)
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.dock-slot-controls')) return;
      if (this.slotDragState?.hasMoved) return; // Don't toggle if we just finished dragging

      if (slotEl.classList.contains('expanded')) {
        this.minimizeSlot(pluginId);
      } else {
        this.expandSlot(pluginId);
      }
    });

    // Drag to reorder (mouse)
    header.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.dock-slot-controls')) return;
      this.startSlotDrag(slotEl, pluginId, e.clientY, false);
    });

    // Drag to reorder (touch with long-press)
    header.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement).closest('.dock-slot-controls')) return;
      const touch = e.touches[0];
      this.startSlotDrag(slotEl, pluginId, touch.clientY, true);
    }, { passive: true });

    // Undock button
    if (undockBtn) {
      undockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const event = new CustomEvent('dock-plugin-undock', { detail: { pluginId } });
        document.dispatchEvent(event);
      });
    }

    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const event = new CustomEvent('dock-plugin-close', { detail: { pluginId } });
      document.dispatchEvent(event);
    });
  }

  expandSlot(pluginId: string): void {
    const slotEl = this.activeListElement.querySelector(`[data-plugin-id="${pluginId}"]`);
    if (!slotEl) return;

    slotEl.classList.add('expanded');
    this.dockedPluginStates.set(pluginId, true);

    // Show undock button when expanded
    const undockBtn = slotEl.querySelector('.dock-slot-undock') as HTMLElement;
    if (undockBtn) {
      undockBtn.style.display = '';
    }

    this.saveState();
  }

  minimizeSlot(pluginId: string): void {
    const slotEl = this.activeListElement.querySelector(`[data-plugin-id="${pluginId}"]`);
    if (!slotEl) return;

    slotEl.classList.remove('expanded');
    this.dockedPluginStates.set(pluginId, false);

    // Hide undock button when minimized
    const undockBtn = slotEl.querySelector('.dock-slot-undock') as HTMLElement;
    if (undockBtn) {
      undockBtn.style.display = 'none';
    }

    this.saveState();
  }

  removeDockedSlot(pluginId: string): void {
    const slotEl = this.activeListElement.querySelector(`[data-plugin-id="${pluginId}"]`);
    if (slotEl) {
      slotEl.remove();
    }
    this.dockedPluginStates.delete(pluginId);
    this.saveState();
  }

  updateSlotContent(pluginId: string, content: string): void {
    const slotEl = this.activeListElement.querySelector(`[data-plugin-id="${pluginId}"]`);
    if (!slotEl) return;

    const contentEl = slotEl.querySelector('.dock-slot-content');
    if (contentEl) {
      contentEl.innerHTML = content;
    }
  }

  getDockedPlugins(): Array<{ pluginId: string; expanded: boolean }> {
    const result: Array<{ pluginId: string; expanded: boolean }> = [];
    this.activeListElement.querySelectorAll('.dock-slot').forEach(slot => {
      const pluginId = (slot as HTMLElement).dataset.pluginId!;
      const expanded = this.dockedPluginStates.get(pluginId) || false;
      result.push({ pluginId, expanded });
    });
    return result;
  }

  getDockedPluginCount(): number {
    return this.dockedPluginStates.size;
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state: DockState = JSON.parse(stored);

        // Load width and section state, but NOT the open state
        // Dock should always start closed per spec (Question 1)
        this.dockWidth = state.width || 400;
        this.availableSectionCollapsed = state.availableSectionCollapsed || false;

        if (this.availableSectionCollapsed) {
          this.availableHeaderElement.classList.add('collapsed');
          this.availableListElement.classList.add('collapsed');
        }

        // Store docked plugin states for restoration
        if (state.dockedPlugins) {
          state.dockedPlugins.forEach(p => {
            this.dockedPluginStates.set(p.pluginId, p.expanded);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load dock state:', error);
    }
  }

  private saveState(): void {
    try {
      const state: DockState = {
        open: this.isOpen,
        width: this.dockWidth,
        availableSectionCollapsed: this.availableSectionCollapsed,
        dockedPlugins: this.getDockedPlugins()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save dock state:', error);
    }
  }

  getPersistedDockedPlugins(): Array<{ pluginId: string; expanded: boolean }> {
    return Array.from(this.dockedPluginStates.entries()).map(([pluginId, expanded]) => ({
      pluginId,
      expanded
    }));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Drag-and-drop reordering

  private startSlotDrag(slot: HTMLElement, pluginId: string, startY: number, isTouch: boolean): void {
    // Only allow dragging if there are 2+ docked plugins
    const slots = Array.from(this.activeListElement.querySelectorAll('.dock-slot'));
    if (slots.length < 2) return;

    this.slotDragState = {
      slot,
      pluginId,
      startY,
      currentY: startY,
      hasMoved: false,
      longPressTimer: null
    };

    if (isTouch) {
      // Long-press timer for touch
      this.slotDragState.longPressTimer = window.setTimeout(() => {
        this.activateSlotDrag();
      }, 500);

      // Add touch move/end listeners
      const touchMoveHandler = (e: TouchEvent) => {
        if (!this.slotDragState) return;
        const touch = e.touches[0];
        this.slotDragState.currentY = touch.clientY;

        // Cancel long-press if moved too much
        const deltaY = Math.abs(touch.clientY - this.slotDragState.startY);
        if (deltaY > 10 && this.slotDragState.longPressTimer !== null) {
          clearTimeout(this.slotDragState.longPressTimer);
          this.slotDragState.longPressTimer = null;
        }

        if (this.slotDragState.hasMoved) {
          e.preventDefault(); // Prevent scrolling during drag
          this.handleSlotDrag(touch.clientY);
        }
      };

      const touchEndHandler = () => {
        document.removeEventListener('touchmove', touchMoveHandler);
        document.removeEventListener('touchend', touchEndHandler);
        document.removeEventListener('touchcancel', touchEndHandler);
        this.endSlotDrag();
      };

      document.addEventListener('touchmove', touchMoveHandler, { passive: false });
      document.addEventListener('touchend', touchEndHandler);
      document.addEventListener('touchcancel', touchEndHandler);
    } else {
      // Mouse: activate immediately after movement threshold
      const mouseMoveHandler = (e: MouseEvent) => {
        if (!this.slotDragState) return;
        this.slotDragState.currentY = e.clientY;

        const deltaY = Math.abs(e.clientY - this.slotDragState.startY);
        if (deltaY > 10 && !this.slotDragState.hasMoved) {
          this.activateSlotDrag();
        }

        if (this.slotDragState.hasMoved) {
          this.handleSlotDrag(e.clientY);
        }
      };

      const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        this.endSlotDrag();
      };

      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', mouseUpHandler);
    }

    // Escape key to cancel
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.slotDragState) {
        this.cancelSlotDrag();
      }
    };
    document.addEventListener('keydown', escapeHandler, { once: true });
  }

  private activateSlotDrag(): void {
    if (!this.slotDragState) return;

    this.slotDragState.hasMoved = true;
    this.slotDragState.slot.classList.add('dragging');
    document.body.classList.add('dragging-dock-slot');
  }

  private handleSlotDrag(clientY: number): void {
    if (!this.slotDragState) return;

    const slots = Array.from(this.activeListElement.querySelectorAll('.dock-slot')) as HTMLElement[];
    const draggedSlot = this.slotDragState.slot;

    // Remove all drag-over classes
    slots.forEach(s => {
      s.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    // Find which slot we're over
    for (const slot of slots) {
      if (slot === draggedSlot) continue;

      const rect = slot.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (clientY >= rect.top && clientY < midY) {
        // Insert before this slot
        slot.classList.add('drag-over-top');
        break;
      } else if (clientY >= midY && clientY <= rect.bottom) {
        // Insert after this slot
        slot.classList.add('drag-over-bottom');
        break;
      }
    }

    // Auto-scroll near edges
    this.handleAutoScroll(clientY);
  }

  private handleAutoScroll(clientY: number): void {
    const listRect = this.activeListElement.getBoundingClientRect();
    const scrollZone = 60;
    const scrollSpeed = 5;

    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }

    if (clientY < listRect.top + scrollZone) {
      // Scroll up
      this.autoScrollInterval = window.setInterval(() => {
        this.activeListElement.scrollTop -= scrollSpeed;
      }, 16);
    } else if (clientY > listRect.bottom - scrollZone) {
      // Scroll down
      this.autoScrollInterval = window.setInterval(() => {
        this.activeListElement.scrollTop += scrollSpeed;
      }, 16);
    }
  }

  private endSlotDrag(): void {
    if (!this.slotDragState) return;

    // Clear timers
    if (this.slotDragState.longPressTimer !== null) {
      clearTimeout(this.slotDragState.longPressTimer);
    }
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }

    if (this.slotDragState.hasMoved) {
      // Perform the reorder
      const slots = Array.from(this.activeListElement.querySelectorAll('.dock-slot')) as HTMLElement[];
      const draggedSlot = this.slotDragState.slot;

      // Find target position
      let targetSlot: HTMLElement | null = null;
      let insertBefore = true;

      for (const slot of slots) {
        if (slot === draggedSlot) continue;

        if (slot.classList.contains('drag-over-top')) {
          targetSlot = slot;
          insertBefore = true;
          break;
        } else if (slot.classList.contains('drag-over-bottom')) {
          targetSlot = slot;
          insertBefore = false;
          break;
        }
      }

      // Reorder in DOM
      if (targetSlot) {
        if (insertBefore) {
          this.activeListElement.insertBefore(draggedSlot, targetSlot);
        } else {
          const nextSibling = targetSlot.nextSibling;
          if (nextSibling) {
            this.activeListElement.insertBefore(draggedSlot, nextSibling);
          } else {
            this.activeListElement.appendChild(draggedSlot);
          }
        }

        // Update order in dockedPluginStates map
        const newOrder = Array.from(this.activeListElement.querySelectorAll('.dock-slot'))
          .map(el => el.getAttribute('data-plugin-id')!);

        const newStates = new Map<string, boolean>();
        newOrder.forEach(pluginId => {
          newStates.set(pluginId, this.dockedPluginStates.get(pluginId) || false);
        });
        this.dockedPluginStates = newStates;

        this.saveState();

        // Dispatch reorder event
        const event = new CustomEvent('dock-updated');
        document.dispatchEvent(event);
      }

      // Clean up drag state
      slots.forEach(s => {
        s.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    }

    this.slotDragState.slot.classList.remove('dragging');
    document.body.classList.remove('dragging-dock-slot');

    // Keep hasMoved flag briefly to prevent toggle-click
    const hadMoved = this.slotDragState.hasMoved;
    this.slotDragState = null;

    if (hadMoved) {
      setTimeout(() => {
        // Reset flag after event propagation
      }, 50);
    }
  }

  private cancelSlotDrag(): void {
    if (!this.slotDragState) return;

    if (this.slotDragState.longPressTimer !== null) {
      clearTimeout(this.slotDragState.longPressTimer);
    }
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }

    const slots = Array.from(this.activeListElement.querySelectorAll('.dock-slot'));
    slots.forEach(s => {
      s.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    this.slotDragState.slot.classList.remove('dragging');
    document.body.classList.remove('dragging-dock-slot');
    this.slotDragState = null;
  }
}
