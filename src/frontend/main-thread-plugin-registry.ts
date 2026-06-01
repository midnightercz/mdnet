// Registry for main-thread plugins with lazy loading support

interface MainThreadPlugin {
  onInit?: (config: any) => void;
  onRender?: (blockId: string, content: string, language: string) => Promise<string>;
  onWindowRender?: () => Promise<string>;
  onWindowOpen?: () => void;
  onWindowClose?: () => void;
  onConfigUpdate?: (config: any) => void;
  onTerminate?: () => void;
}

type PluginLoader = () => Promise<MainThreadPlugin>;

// Registry now holds lazy loaders instead of eager imports
export const mainThreadPluginRegistry: Record<string, PluginLoader> = {
  'mermaid': () => import('../plugins/mermaid/main-thread').then(m => m as MainThreadPlugin),
  'example-tool': () => import('../plugins/example-tool/main-thread').then(m => m as MainThreadPlugin),
  'browsing-history': () => import('../plugins/browsing-history/main-thread').then(m => m as MainThreadPlugin),
  'bookmarks': () => import('../plugins/bookmarks/main-thread').then(m => m as MainThreadPlugin)
};
