// Plugin Dashboard
// Displays a centered modal with grid of tool plugin icons

interface ToolPluginInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
}

export class PluginDashboard {
  private modalElement: HTMLElement | null = null;
  private gridElement: HTMLElement | null = null;
  private onPluginLaunch: ((pluginId: string) => void) | null = null;

  constructor() {
    this.modalElement = document.getElementById('plugin-dashboard-modal');
    this.gridElement = document.getElementById('plugin-dashboard-grid');
  }

  setPluginLaunchHandler(handler: (pluginId: string) => void): void {
    this.onPluginLaunch = handler;
  }

  show(plugins: ToolPluginInfo[]): void {
    if (!this.modalElement || !this.gridElement) return;

    this.renderGrid(plugins);
    this.modalElement.classList.add('active');

    // Close on backdrop click
    this.modalElement.addEventListener('click', this.handleBackdropClick.bind(this), { once: true });

    // Close on ESC
    document.addEventListener('keydown', this.handleEscKey.bind(this), { once: true });
  }

  hide(): void {
    if (!this.modalElement) return;
    this.modalElement.classList.remove('active');
  }

  private renderGrid(plugins: ToolPluginInfo[]): void {
    if (!this.gridElement) return;

    // Filter to only enabled plugins
    const enabledPlugins = plugins.filter(p => p.enabled);

    if (enabledPlugins.length === 0) {
      this.gridElement.innerHTML = `
        <div class="plugin-dashboard-empty">
          <div class="plugin-dashboard-empty-icon">🧩</div>
          <div class="plugin-dashboard-empty-title">No Tool Plugins Available</div>
          <div class="plugin-dashboard-empty-desc">Install tool plugins from the Plugins section in Settings to add utilities like task managers, calendars, and more.</div>
          <button class="plugin-dashboard-empty-btn" id="open-settings-from-dashboard">Open Settings</button>
        </div>
      `;

      // Wire up settings button
      const settingsBtn = this.gridElement.querySelector('#open-settings-from-dashboard');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          this.hide();
          // Trigger settings modal open
          const event = new CustomEvent('open-settings-modal', { detail: { tab: 'plugins-main' } });
          document.dispatchEvent(event);
        });
      }
      return;
    }

    // Render grid
    this.gridElement.innerHTML = enabledPlugins.map(plugin => {
      const icon = plugin.icon || this.getDefaultIcon(plugin.name);
      return `
        <div class="plugin-dashboard-item" data-plugin-id="${plugin.id}" title="${this.escapeHtml(plugin.description)}">
          <div class="plugin-dashboard-icon">${icon}</div>
          <div class="plugin-dashboard-label">${this.escapeHtml(plugin.name)}</div>
        </div>
      `;
    }).join('');

    // Wire up click handlers
    const items = this.gridElement.querySelectorAll('.plugin-dashboard-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const pluginId = (item as HTMLElement).dataset.pluginId;
        if (pluginId && this.onPluginLaunch) {
          this.onPluginLaunch(pluginId);
          this.hide();
        }
      });
    });
  }

  private handleBackdropClick(e: MouseEvent): void {
    if (e.target === this.modalElement) {
      this.hide();
    } else {
      // Re-attach listener if not backdrop click
      this.modalElement?.addEventListener('click', this.handleBackdropClick.bind(this), { once: true });
    }
  }

  private handleEscKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.hide();
    } else {
      // Re-attach listener if not ESC
      document.addEventListener('keydown', this.handleEscKey.bind(this), { once: true });
    }
  }

  private getDefaultIcon(name: string): string {
    // Use first letter as fallback
    return name.charAt(0).toUpperCase();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
