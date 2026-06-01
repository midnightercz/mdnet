import mermaid from 'mermaid';

let initialized = false;

function getCurrentTheme(): 'dark' | 'default' {
  // Check if light-theme class is on body
  const isLight = document.body.classList.contains('light-theme');
  return isLight ? 'default' : 'dark';
}

function initializeMermaid(securityLevel: string = 'strict'): void {
  const theme = getCurrentTheme();
  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: securityLevel,
    fontFamily: 'Consolas, Monaco, Courier New, monospace'
  });
  console.log(`[Mermaid Main Thread] Initialized with theme: ${theme}`);
}

export function onInit(config: any): void {
  initializeMermaid(config.securityLevel || 'strict');
  initialized = true;

  // Listen for theme changes
  const themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const newTheme = getCurrentTheme();
        console.log(`[Mermaid Main Thread] Theme changed to: ${newTheme}`);
        initializeMermaid(config.securityLevel || 'strict');

        // Trigger re-render of all mermaid diagrams
        const event = new CustomEvent('mermaid-theme-changed');
        document.dispatchEvent(event);
      }
    }
  });

  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
}

export async function onRender(blockId: string, content: string, language: string): Promise<string> {
  if (!initialized) {
    throw new Error('Mermaid not initialized');
  }

  try {
    const svgId = `mermaid-${blockId}`;
    console.log(`[Mermaid Main Thread] Rendering block ${blockId} with theme ${getCurrentTheme()}`);
    const { svg } = await mermaid.render(svgId, content);
    console.log(`[Mermaid Main Thread] Rendered SVG for blockId: ${blockId}`);

    return `
      <div class="mermaid-diagram" data-content="${encodeURIComponent(content)}" data-block-id="${blockId}">
        ${svg}
      </div>
    `;
  } catch (error: any) {
    throw new Error(`Mermaid rendering failed: ${error.message}`);
  }
}

export function onConfigUpdate(config: any): void {
  initializeMermaid(config.securityLevel || 'strict');
}

export function onTerminate(): void {
  // Cleanup if needed
}
