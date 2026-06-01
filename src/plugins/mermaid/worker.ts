import mermaid from 'mermaid';

declare const PluginAPI: any;
declare const self: any;

let mermaidInitialized = false;

// Expose lifecycle functions globally for the Plugin API wrapper
(self as any).onInit = function(config: any): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: config.theme || 'default',
    securityLevel: config.securityLevel || 'strict',
    fontFamily: 'Consolas, Monaco, Courier New, monospace'
  });
  mermaidInitialized = true;
  PluginAPI.log('Mermaid plugin initialized');
};

(self as any).onRender = async function(blockId: string, content: string, language: string): Promise<void> {
  PluginAPI.error('Rendering mermain plugin -1-');
  if (!mermaidInitialized) {
    PluginAPI.error('Mermaid not initialized');
    PluginAPI.reportError(blockId, 'Mermaid not initialized');
    return;
  }
  PluginAPI.error('Rendering mermain plugin -2-');

  try {
    const svgId = `mermaid-${blockId}`;
    PluginAPI.log(`Rendering mermain mermaid-${blockId}`);
    const { svg } = await mermaid.render(svgId, content);
    PluginAPI.log(`Rendered SVG for blockId: ${blockId}`);
    PluginAPI.log(`Rendered SVG for blockId: ${svg}`);

    PluginAPI.renderContent(blockId, `
      <div class="mermaid-diagram">
        ${svg}
      </div>
    `);
  } catch (error: any) {
    PluginAPI.error(`${error.message}`);
    PluginAPI.reportError(blockId, `Mermaid rendering failed: ${error.message}`);
  }
  PluginAPI.error('Rendering mermain plugin 3');
};

(self as any).onConfigUpdate = function(config: any): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: config.theme || 'default',
    securityLevel: config.securityLevel || 'strict',
    fontFamily: 'Consolas, Monaco, Courier New, monospace'
  });
};

(self as any).onTerminate = function(): void {
  // Cleanup if needed
};
