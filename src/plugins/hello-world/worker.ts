declare const PluginAPI: any;
declare const self: any;

let greeting = 'Hello';

// Expose lifecycle functions globally for the Plugin API wrapper
(self as any).onInit = function(config: any): void {
  greeting = config.greeting || 'Hello';
  PluginAPI.log(`Hello World plugin initialized with greeting: ${greeting}`);
};

(self as any).onRender = async function(blockId: string, content: string, language: string): Promise<void> {
  PluginAPI.log(`Rendering block ${blockId} with language: ${language}`);

  const html = `
    <div style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white; font-family: sans-serif;">
      <h2 style="margin: 0 0 10px 0;">👋 ${greeting}, World!</h2>
      <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px; margin-top: 10px;">
        <strong>Language:</strong> ${language}<br>
        <strong>Block ID:</strong> ${blockId}<br>
        <strong>Content length:</strong> ${content.length} characters
      </div>
      <pre style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; margin-top: 10px; overflow-x: auto;">${content}</pre>
    </div>
  `;

  PluginAPI.renderContent(blockId, html);
};

(self as any).onConfigUpdate = function(config: any): void {
  greeting = config.greeting || 'Hello';
  PluginAPI.log(`Config updated, new greeting: ${greeting}`);
};

(self as any).onTerminate = function(): void {
  PluginAPI.log('Hello World plugin terminated');
};
