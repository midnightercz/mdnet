import mermaid from 'mermaid';

let initialized = false;

function getCurrentTheme(): 'dark' | 'default' {
  // Check if light-theme class is on body
  const isLight = document.body.classList.contains('light-theme');
  return isLight ? 'default' : 'dark';
}

function isEInkTheme(): boolean {
  // Check if current theme is e-ink
  return document.body.classList.contains('theme-e-ink-light') ||
         document.body.classList.contains('theme-e-ink-dark');
}

function initializeMermaid(securityLevel: string = 'strict'): void {
  const theme = getCurrentTheme();
  const isEInk = isEInkTheme();

  if (isEInk) {
    // Black and white theme for e-ink displays
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: securityLevel,
      fontFamily: 'Consolas, Monaco, Courier New, monospace',
      themeVariables: {
        primaryColor: 'transparent',
        primaryTextColor: '#000000',
        primaryBorderColor: '#000000',
        lineColor: '#000000',
        secondaryColor: 'transparent',
        tertiaryColor: 'transparent',
        background: 'transparent',
        mainBkg: 'transparent',
        secondBkg: 'transparent',
        tertiaryBkg: 'transparent',
        nodeBorder: '#000000',
        clusterBkg: 'transparent',
        clusterBorder: '#000000',
        defaultLinkColor: '#000000',
        titleColor: '#000000',
        edgeLabelBackground: 'transparent',
        actorBorder: '#000000',
        actorBkg: 'transparent',
        actorTextColor: '#000000',
        actorLineColor: '#000000',
        signalColor: '#000000',
        signalTextColor: '#000000',
        labelBoxBkgColor: 'transparent',
        labelBoxBorderColor: '#000000',
        labelTextColor: '#000000',
        loopTextColor: '#000000',
        noteBorderColor: '#000000',
        noteBkgColor: 'transparent',
        noteTextColor: '#000000',
        activationBorderColor: '#000000',
        activationBkgColor: 'transparent',
        sequenceNumberColor: '#000000'
      }
    });
    console.log(`[Mermaid Main Thread] Initialized with e-ink black & white theme`);
  } else {
    // Default colored themes for other themes
    mermaid.initialize({
      startOnLoad: false,
      theme: theme,
      securityLevel: securityLevel,
      fontFamily: 'Consolas, Monaco, Courier New, monospace'
    });
    console.log(`[Mermaid Main Thread] Initialized with theme: ${theme}`);
  }
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
