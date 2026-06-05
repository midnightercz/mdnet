import { mainThreadPluginRegistry } from './main-thread-plugin-registry';
import { PluginWindowManager } from './plugin-window-manager';

// Plugin System Types
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entryPoint: string;
  type: 'renderer' | 'tool';
  triggers: string[];
  permissions: string[];
  defaultEnabled: boolean;
  icon?: string;
  runInMainThread?: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  config: Record<string, any>;
}

interface PluginInfo {
  manifest: PluginManifest;
  workerUrl: string;
  state: 'discovered' | 'enabled' | 'disabled' | 'error';
}

interface PluginRegistryEntry {
  id: string;
  manifestUrl: string;
  workerUrl: string;
}

interface RenderRequest {
  pluginId: string;
  blockId: string;
  content: string;
  language: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

// Plugin Manager - Manages plugin lifecycle and rendering
export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private workers: Map<string, Worker> = new Map();
  private mainThreadPlugins: Map<string, any> = new Map();
  private enabledPlugins: Set<string> = new Set();
  private pendingRequests: Map<string, RenderRequest> = new Map();
  private pendingInitializations: Map<string, { resolve: () => void; reject: (error: Error) => void }> = new Map();
  private readonly STORAGE_KEY = 'mdnet-enabled-plugins';
  private readonly AUTOLOAD_STORAGE_KEY = 'mdnet-autoload-plugins';
  private autoloadPlugins: Set<string> = new Set();
  private windowManager: PluginWindowManager;

  constructor() {
    this.windowManager = new PluginWindowManager();

    // Listen for window close events
    document.addEventListener('plugin-window-closed', ((e: CustomEvent) => {
      const pluginId = e.detail.pluginId;
      const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
      if (mainThreadPlugin && mainThreadPlugin.onWindowClose) {
        mainThreadPlugin.onWindowClose();
      }
    }) as EventListener);
  }

  async initialize(): Promise<void> {
    console.log('Initializing plugin manager...');
    await this.discoverPlugins();
    const savedPlugins = this.loadState();
    this.autoloadPlugins = new Set(this.loadAutoloadState());
    await this.enableSavedPlugins(savedPlugins);
    await this.enableDefaultPlugins();
    await this.autoloadToolPlugins();
    console.log(`Plugin manager initialized. ${this.plugins.size} plugins discovered, ${this.enabledPlugins.size} enabled`);
  }

  async discoverPlugins(): Promise<void> {
    try {
      const response = await fetch('./plugins/registry.json');
      if (!response.ok) {
        console.warn('No plugin registry found, starting with no plugins');
        return;
      }

      const registry: PluginRegistryEntry[] = await response.json();

      for (const entry of registry) {
        try {
          const manifestResponse = await fetch(entry.manifestUrl);
          const manifest: PluginManifest = await manifestResponse.json();

          this.plugins.set(manifest.id, {
            manifest,
            workerUrl: entry.workerUrl,
            state: 'discovered'
          });

          console.log(`Discovered plugin: ${manifest.name} (${manifest.id})`);
        } catch (error) {
          console.error(`Failed to load manifest for ${entry.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to discover plugins:', error);
    }
  }

  async enableSavedPlugins(savedPluginIds: string[]): Promise<void> {
    for (const pluginId of savedPluginIds) {
      if (this.plugins.has(pluginId) && !this.enabledPlugins.has(pluginId)) {
        try {
          await this.enablePlugin(pluginId);
        } catch (error) {
          console.error(`Failed to restore plugin ${pluginId}:`, error);
        }
      }
    }
  }

  async enableDefaultPlugins(): Promise<void> {
    for (const [pluginId, pluginInfo] of this.plugins.entries()) {
      if (pluginInfo.manifest.defaultEnabled && !this.enabledPlugins.has(pluginId)) {
        try {
          await this.enablePlugin(pluginId);
        } catch (error) {
          console.error(`Failed to enable default plugin ${pluginId}:`, error);
        }
      }
    }
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (this.enabledPlugins.has(pluginId)) {
      console.log(`Plugin ${pluginId} is already enabled`);
      return;
    }

    try {
      if (pluginInfo.manifest.runInMainThread) {
        // Load main-thread plugin
        console.log(`Loading main-thread plugin: ${pluginId}`);

        // Get the loader function from registry
        const loader = mainThreadPluginRegistry[pluginId];
        if (!loader) {
          throw new Error(`Main-thread plugin ${pluginId} not found in registry`);
        }

        // Lazy-load the plugin module (dynamic import)
        console.log(`Dynamically importing plugin module: ${pluginId}`);
        const module = await loader();

        const config = this.loadPluginConfig(pluginId);
        if (module.onInit) {
          module.onInit(config);
        }
        this.mainThreadPlugins.set(pluginId, module);
        console.log(`✓ Main-thread plugin loaded: ${pluginId}`);
      } else {
        // Create worker and wait for it to be ready
        console.log(`Creating worker for ${pluginId}`);

        // Set up promise to wait for ready message
        const readyPromise = new Promise<void>((resolve, reject) => {
          this.pendingInitializations.set(pluginId, { resolve, reject });

          // Set timeout
          setTimeout(() => {
            if (this.pendingInitializations.has(pluginId)) {
              this.pendingInitializations.delete(pluginId);
              reject(new Error(`Plugin ${pluginId} initialization timeout`));
            }
          }, 5000);
        });

        const worker = await this.createWorker(pluginId);
        this.workers.set(pluginId, worker);

        // Wait for ready message (will be resolved in handleWorkerMessage)
        await readyPromise;
        console.log(`✓ Worker ready for ${pluginId}`);
      }

      this.enabledPlugins.add(pluginId);
      pluginInfo.state = 'enabled';
      this.saveState();

      console.log(`✓ Plugin enabled: ${pluginInfo.manifest.name}`);
    } catch (error) {
      pluginInfo.state = 'error';
      throw error;
    }
  }

  async disablePlugin(pluginId: string): Promise<void> {
    if (!this.enabledPlugins.has(pluginId)) {
      return;
    }

    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
    if (mainThreadPlugin) {
      if (mainThreadPlugin.onTerminate) {
        mainThreadPlugin.onTerminate();
      }
      this.mainThreadPlugins.delete(pluginId);
    }

    const worker = this.workers.get(pluginId);
    if (worker) {
      worker.postMessage({ type: 'terminate' });
      worker.terminate();
      this.workers.delete(pluginId);
    }

    this.enabledPlugins.delete(pluginId);

    const pluginInfo = this.plugins.get(pluginId);
    if (pluginInfo) {
      pluginInfo.state = 'disabled';
    }

    this.saveState();
    console.log(`Plugin disabled: ${pluginId}`);
  }

  isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  async renderBlock(pluginId: string, blockId: string, content: string, language: string): Promise<void> {
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);

    if (mainThreadPlugin) {
      // Render using main-thread plugin
      try {
        const html = await mainThreadPlugin.onRender(blockId, content, language);
        const sanitizedHtml = this.sanitizeHTML(html);
        const element = document.getElementById(blockId);
        if (element) {
          element.innerHTML = sanitizedHtml;
        } else {
          console.error(`Element ${blockId} not found in DOM`);
        }
      } catch (error: any) {
        const element = document.getElementById(blockId);
        if (element) {
          element.innerHTML = `<div class="plugin-error">
            <strong>Plugin Error:</strong> ${this.escapeHtml(error.message)}
          </div>`;
        }
        throw error;
      }
      return;
    }

    // Worker-based plugin
    const worker = this.workers.get(pluginId);
    if (!worker) {
      throw new Error(`Plugin ${pluginId} is not enabled or worker not available`);
    }

    const requestId = `${pluginId}-${blockId}-${Date.now()}`;

    return new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        pluginId,
        blockId,
        content,
        language,
        resolve,
        reject
      });

      worker.postMessage({
        type: 'render',
        requestId,
        blockId,
        content,
        language
      });

      // Set timeout for render
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Render timeout for block ${blockId}`));
        }
      }, 10000);
    });
  }

  hasPluginForLanguage(language: string): boolean {
    for (const [pluginId, pluginInfo] of this.plugins.entries()) {
      if (pluginInfo.manifest.triggers.includes(language)) {
        return true;
      }
    }
    return false;
  }

  getPluginIdForLanguage(language: string): string | null {
    for (const [pluginId, pluginInfo] of this.plugins.entries()) {
      if (pluginInfo.manifest.triggers.includes(language) && this.enabledPlugins.has(pluginId)) {
        return pluginId;
      }
    }
    return null;
  }

  getPluginList(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  getToolPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).filter(p => p.manifest.type === 'tool');
  }

  getRendererPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).filter(p => p.manifest.type === 'renderer');
  }

  // Open plugin as floating window
  async openPluginWindow(pluginId: string, openMinimized: boolean = false): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (pluginInfo.manifest.type !== 'tool') {
      throw new Error(`Plugin ${pluginId} is not a tool plugin`);
    }

    if (!this.enabledPlugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is not enabled`);
    }

    // Check if already open
    if (this.windowManager.isPluginOpen(pluginId)) {
      if (this.windowManager.isPluginFloating(pluginId)) {
        this.windowManager.focusWindow(`plugin-window-${pluginId}`);
      }
      return;
    }

    // Get content from plugin
    const contentHtml = await this.getPluginContent(pluginId);

    // Create floating window
    const icon = pluginInfo.manifest.icon || pluginInfo.manifest.name.charAt(0).toUpperCase();
    const defaultWidth = pluginInfo.manifest.defaultWidth || 600;
    const defaultHeight = pluginInfo.manifest.defaultHeight || 400;
    const minWidth = pluginInfo.manifest.minWidth || 300;
    const minHeight = pluginInfo.manifest.minHeight || 200;

    this.windowManager.createWindow(
      pluginId,
      pluginInfo.manifest.name,
      icon,
      contentHtml,
      defaultWidth,
      defaultHeight,
      minWidth,
      minHeight,
      openMinimized
    );

    // Call onWindowOpen callback
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
    if (mainThreadPlugin && mainThreadPlugin.onWindowOpen) {
      mainThreadPlugin.onWindowOpen();
    }
  }

  // Open plugin in dock
  async openPluginDocked(pluginId: string, expanded: boolean = true): Promise<void> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (pluginInfo.manifest.type !== 'tool') {
      throw new Error(`Plugin ${pluginId} is not a tool plugin`);
    }

    if (!this.enabledPlugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is not enabled`);
    }

    // Check if already open
    if (this.windowManager.isPluginOpen(pluginId)) {
      return;
    }

    // Get content from plugin
    const contentHtml = await this.getPluginContent(pluginId);

    // Get dock manager from window
    const dockManager = (window as any).dockManager;
    if (!dockManager) {
      throw new Error('Dock manager not initialized');
    }

    // Add to dock
    const icon = pluginInfo.manifest.icon || pluginInfo.manifest.name.charAt(0).toUpperCase();
    const slotElement = dockManager.addDockedSlot(
      pluginId,
      pluginInfo.manifest.name,
      icon,
      contentHtml,
      expanded
    );

    this.windowManager.createDockedPlugin(pluginId, slotElement, expanded);

    // Call onWindowOpen callback
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
    if (mainThreadPlugin && mainThreadPlugin.onWindowOpen) {
      mainThreadPlugin.onWindowOpen();
    }

    // Update dock UI
    const event = new CustomEvent('dock-updated');
    document.dispatchEvent(event);
  }

  // Dock a floating plugin
  async dockPlugin(pluginId: string): Promise<void> {
    if (!this.windowManager.isPluginFloating(pluginId)) {
      return;
    }

    // Close floating window
    this.windowManager.closeWindow(`plugin-window-${pluginId}`);

    // Open in dock (expanded)
    await this.openPluginDocked(pluginId, true);
  }

  // Undock a docked plugin (convert to floating)
  async undockPlugin(pluginId: string): Promise<void> {
    if (!this.windowManager.isPluginDocked(pluginId)) {
      return;
    }

    // Get dock manager
    const dockManager = (window as any).dockManager;
    if (!dockManager) return;

    // Remove from dock
    dockManager.removeDockedSlot(pluginId);
    this.windowManager.removeDockedPlugin(pluginId);

    // Open as floating window
    await this.openPluginWindow(pluginId, false);

    // Update dock UI
    const event = new CustomEvent('dock-updated');
    document.dispatchEvent(event);
  }

  // Close plugin (works for both docked and floating)
  closePlugin(pluginId: string, mode?: 'docked' | 'floating'): void {
    const actualMode = mode || this.windowManager.getPluginMode(pluginId);

    if (actualMode === 'floating') {
      this.windowManager.closeWindow(`plugin-window-${pluginId}`);
    } else if (actualMode === 'docked') {
      const dockManager = (window as any).dockManager;
      if (dockManager) {
        dockManager.removeDockedSlot(pluginId);
        this.windowManager.removeDockedPlugin(pluginId);
      }
    }

    // Call onWindowClose callback
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
    if (mainThreadPlugin && mainThreadPlugin.onWindowClose) {
      mainThreadPlugin.onWindowClose();
    }

    // Update dock UI
    const event = new CustomEvent('dock-updated');
    document.dispatchEvent(event);
  }

  async refreshPluginWindow(pluginId: string): Promise<void> {
    if (!this.windowManager.isPluginOpen(pluginId)) {
      return;
    }

    // Get fresh content
    const contentHtml = await this.getPluginContent(pluginId);

    // Update the window/dock content
    const dockManager = (window as any).dockManager;

    if (this.windowManager.isPluginDocked(pluginId)) {
      // Update docked slot content
      if (dockManager) {
        dockManager.updateSlotContent(pluginId, contentHtml);
      }
    } else if (this.windowManager.isPluginFloating(pluginId)) {
      // Update floating window content
      this.windowManager.updateWindowContent(pluginId, contentHtml);
    }
  }

  private async getPluginContent(pluginId: string): Promise<string> {
    let contentHtml = '<div class="plugin-loading">Loading...</div>';
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);

    if (mainThreadPlugin && mainThreadPlugin.onWindowRender) {
      try {
        contentHtml = await mainThreadPlugin.onWindowRender();
        contentHtml = this.sanitizeHTML(contentHtml);
      } catch (error: any) {
        contentHtml = `<div class="plugin-error">
          <strong>Plugin Error:</strong> ${this.escapeHtml(error.message)}
        </div>`;
      }
    }

    return contentHtml;
  }

  private async createWorker(pluginId: string): Promise<Worker> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const worker = new Worker(pluginInfo.workerUrl);

    // Set up message handler
    worker.addEventListener('message', (event) => {
      this.handleWorkerMessage(pluginId, event.data);
    });

    // Set up error handler
    worker.addEventListener('error', (error) => {
      console.error(`Worker error for plugin ${pluginId}:`, error);
      pluginInfo.state = 'error';
    });

    // Initialize the worker
    const config = this.loadPluginConfig(pluginId);
    worker.postMessage({
      type: 'init',
      pluginId,
      config
    });

    return worker;
  }

  private handleWorkerMessage(pluginId: string, message: any): void {
    switch (message.type) {
      case 'render-complete':
        this.handleRenderComplete(message.requestId, message.blockId, message.html);
        break;

      case 'render-error':
        this.handleRenderError(message.requestId, message.blockId, message.error);
        break;

      case 'log':
        console.log(`[Plugin:${pluginId}] ${message.message}`);
        break;

      case 'ready':
        // Resolve pending initialization
        const pending = this.pendingInitializations.get(pluginId);
        if (pending) {
          this.pendingInitializations.delete(pluginId);
          pending.resolve();
        }
        break;

      default:
        console.warn(`Unknown message type from plugin ${pluginId}:`, message.type);
    }
  }

  private handleRenderComplete(requestId: string, blockId: string, html: string): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      console.warn(`No pending request found for ${requestId}`);
      return;
    }

    this.pendingRequests.delete(requestId);

    // Sanitize HTML
    const sanitizedHtml = this.sanitizeHTML(html);

    // Inject into DOM
    const element = document.getElementById(blockId);
    if (element) {
      element.innerHTML = sanitizedHtml;
    } else {
      console.error(`Element ${blockId} not found in DOM`);
    }

    request.resolve();
  }

  private handleRenderError(requestId: string, blockId: string, error: string): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      console.warn(`No pending request found for ${requestId}`);
      return;
    }

    this.pendingRequests.delete(requestId);

    // Display error in block
    const element = document.getElementById(blockId);
    if (element) {
      element.innerHTML = `<div class="plugin-error">
        <strong>Plugin Error:</strong> ${this.escapeHtml(error)}
      </div>`;
    }

    request.reject(new Error(error));
  }

  private sanitizeHTML(html: string): string {
    // Strip <script> tags and event handlers
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private loadState(): string[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as string[];
      }
    } catch (error) {
      console.error('Failed to load plugin state:', error);
    }
    return [];
  }

  private saveState(): void {
    try {
      const enabledIds = Array.from(this.enabledPlugins);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(enabledIds));
    } catch (error) {
      console.error('Failed to save plugin state:', error);
    }
  }

  private loadPluginConfig(pluginId: string): Record<string, any> {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      return {};
    }

    let config: Record<string, any> = { ...pluginInfo.manifest.config };

    try {
      const configKey = `mdnet-plugin-config-${pluginId}`;
      const stored = localStorage.getItem(configKey);
      if (stored) {
        config = { ...config, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error(`Failed to load config for plugin ${pluginId}:`, error);
    }

    // Inject current theme for mermaid plugin
    if (pluginId === 'mermaid') {
      const isLight = document.body.classList.contains('light-theme');
      config.theme = isLight ? 'default' : 'dark';
    }

    return config;
  }

  private savePluginConfig(pluginId: string, config: Record<string, any>): void {
    try {
      const configKey = `mdnet-plugin-config-${pluginId}`;
      localStorage.setItem(configKey, JSON.stringify(config));
    } catch (error) {
      console.error(`Failed to save config for plugin ${pluginId}:`, error);
    }
  }

  updatePluginConfig(pluginId: string, configUpdate: Record<string, any>): void {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo) {
      return;
    }

    // Load current config
    const currentConfig = this.loadPluginConfig(pluginId);

    // Merge update
    const newConfig = { ...currentConfig, ...configUpdate };

    // Save to localStorage
    this.savePluginConfig(pluginId, newConfig);

    // Notify plugin via onConfigUpdate
    const mainThreadPlugin = this.mainThreadPlugins.get(pluginId);
    if (mainThreadPlugin && mainThreadPlugin.onConfigUpdate) {
      mainThreadPlugin.onConfigUpdate(newConfig);
    }
  }

  setAutoload(pluginId: string, autoload: boolean): void {
    const pluginInfo = this.plugins.get(pluginId);
    if (!pluginInfo || pluginInfo.manifest.type !== 'tool') {
      return;
    }

    if (autoload) {
      this.autoloadPlugins.add(pluginId);
    } else {
      this.autoloadPlugins.delete(pluginId);
    }
    this.saveAutoloadState();
  }

  isAutoload(pluginId: string): boolean {
    return this.autoloadPlugins.has(pluginId);
  }

  private async autoloadToolPlugins(): Promise<void> {
    // Autoload plugins open in dock (minimized) unless already persisted in dock
    const dockManager = (window as any).dockManager;
    if (!dockManager) return;

    const persistedDockedIds = new Set(
      dockManager.getPersistedDockedPlugins().map((p: any) => p.pluginId)
    );

    for (const pluginId of this.autoloadPlugins) {
      // Skip if already in persisted dock state (will be restored separately)
      if (persistedDockedIds.has(pluginId)) {
        continue;
      }

      if (this.enabledPlugins.has(pluginId)) {
        const pluginInfo = this.plugins.get(pluginId);
        if (pluginInfo && pluginInfo.manifest.type === 'tool') {
          try {
            // Open dock if not already open
            if (!dockManager.isOpened()) {
              dockManager.open();
            }
            await this.openPluginDocked(pluginId, false); // minimized
            console.log(`Auto-loaded plugin: ${pluginId}`);
          } catch (error) {
            console.error(`Failed to autoload plugin ${pluginId}:`, error);
          }
        }
      }
    }
  }

  private loadAutoloadState(): string[] {
    try {
      const stored = localStorage.getItem(this.AUTOLOAD_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as string[];
      }
    } catch (error) {
      console.error('Failed to load autoload state:', error);
    }
    return [];
  }

  private saveAutoloadState(): void {
    try {
      const autoloadIds = Array.from(this.autoloadPlugins);
      localStorage.setItem(this.AUTOLOAD_STORAGE_KEY, JSON.stringify(autoloadIds));
    } catch (error) {
      console.error('Failed to save autoload state:', error);
    }
  }
}
