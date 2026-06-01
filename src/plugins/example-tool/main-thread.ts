// Example Tool Plugin - demonstrates tool plugin functionality

interface MainThreadPlugin {
  onInit?: (config: any) => void;
  onWindowRender?: () => Promise<string>;
  onWindowOpen?: () => void;
  onWindowClose?: () => void;
  onTerminate?: () => void;
}

let windowOpenTime: Date | null = null;

export function onInit(config: any): void {
  console.log('Example Tool plugin initialized with config:', config);
}

export async function onWindowRender(): Promise<string> {
  const now = new Date().toLocaleTimeString();

  return `
    <div style="padding: 20px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace;">
      <h2 style="color: var(--accent-orange); margin-top: 0;">Example Tool Plugin</h2>
      <p style="color: var(--text-primary); line-height: 1.6;">
        This is an example tool plugin demonstrating the new plugin window system.
      </p>

      <div style="background: var(--bg-secondary); padding: 15px; border-radius: 4px; margin: 20px 0;">
        <strong style="color: var(--accent-yellow);">Features:</strong>
        <ul style="margin: 10px 0; padding-left: 20px; color: var(--text-primary);">
          <li>Floating, resizable window</li>
          <li>Draggable by title bar</li>
          <li>Minimize to chip</li>
          <li>Position & size persistence</li>
          <li>Multiple windows supported</li>
        </ul>
      </div>

      <div style="background: var(--bg-secondary); padding: 15px; border-radius: 4px;">
        <div style="color: var(--text-secondary); font-size: 0.9em;">
          Window rendered at: <strong style="color: var(--accent-cyan);">${now}</strong>
        </div>
        <div style="color: var(--text-secondary); font-size: 0.9em; margin-top: 5px;">
          Try resizing, dragging, or minimizing this window!
        </div>
      </div>
    </div>
  `;
}

export function onWindowOpen(): void {
  windowOpenTime = new Date();
  console.log('Example Tool window opened at:', windowOpenTime);
}

export function onWindowClose(): void {
  console.log('Example Tool window closed');
  if (windowOpenTime) {
    const duration = Date.now() - windowOpenTime.getTime();
    console.log(`Window was open for ${Math.round(duration / 1000)} seconds`);
  }
  windowOpenTime = null;
}

export function onTerminate(): void {
  console.log('Example Tool plugin terminated');
}
