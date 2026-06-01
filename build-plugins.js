const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const pluginsDir = path.join(__dirname, 'src/plugins');
const outputDir = path.join(__dirname, 'public/plugins');

// Plugin API wrapper that gets prepended to each worker
const pluginAPIWrapper = `
// Plugin API - Auto-injected into worker context
const PluginAPI = {
  _currentRequest: null,
  _config: {},

  renderContent(blockId, html) {
    self.postMessage({
      type: 'render-complete',
      requestId: this._currentRequest,
      blockId,
      html
    });
  },

  reportError(blockId, error) {
    self.postMessage({
      type: 'render-error',
      requestId: this._currentRequest,
      blockId,
      error: String(error)
    });
  },

  log(message) {
    self.postMessage({ type: 'log', level: 'info', message });
  },

  warn(message) {
    self.postMessage({ type: 'log', level: 'warn', message });
  },

  error(message) {
    self.postMessage({ type: 'log', level: 'error', message });
  },

  getConfig() {
    return this._config || {};
  },

  requestConfigUpdate(key, value) {
    self.postMessage({
      type: 'config-update-request',
      key,
      value
    });
  }
};

// Message handler wrapper
self.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      PluginAPI._config = message.config;
      if (typeof onInit === 'function') {
        onInit(message.config);
      }
      self.postMessage({ type: 'ready', pluginId: message.pluginId });
      break;

    case 'render':
      PluginAPI._currentRequest = message.requestId;
      if (typeof onRender === 'function') {
        try {
          onRender(message.blockId, message.content, message.language);
        } catch (err) {
          PluginAPI.reportError(message.blockId, err.message);
        }
      }
      break;

    case 'config-update':
      PluginAPI._config = message.config;
      if (typeof onConfigUpdate === 'function') {
        onConfigUpdate(message.config);
      }
      break;

    case 'terminate':
      if (typeof onTerminate === 'function') {
        onTerminate();
      }
      self.close();
      break;
  }
});

// Plugin implementation follows below
`;

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Check if plugins directory exists
if (!fs.existsSync(pluginsDir)) {
  console.log('No plugins directory found, creating empty registry');
  fs.writeFileSync(path.join(outputDir, 'registry.json'), JSON.stringify([], null, 2));
  process.exit(0);
}

// Discover plugins
const plugins = [];
const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

console.log(`Found ${pluginDirs.length} plugin directories`);

for (const pluginName of pluginDirs) {
  const pluginPath = path.join(pluginsDir, pluginName);
  const manifestPath = path.join(pluginPath, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    console.warn(`⚠️  Skipping ${pluginName}: no plugin.json found`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const entryFileName = manifest.entryPoint.replace('.js', '.ts');
  const workerPath = path.join(pluginPath, entryFileName);

  if (!fs.existsSync(workerPath)) {
    console.error(`❌ Plugin ${pluginName}: entry point ${entryFileName} not found`);
    continue;
  }

  // Bundle the worker with esbuild
  const outputPath = path.join(outputDir, `${pluginName}.worker.js`);
  const tempOutputPath = path.join(outputDir, `${pluginName}.worker.temp.js`);

  try {
    // First, bundle the worker code
    esbuild.buildSync({
      entryPoints: [workerPath],
      bundle: true,
      minify: true, // Minify to reduce file size
      format: 'iife',
      outfile: tempOutputPath,
      target: ['es2020'],
      logLevel: 'warning',
      treeShaking: false, // Preserve plugin lifecycle functions
      globalName: '__pluginBundle' // Wrap in a global to prevent tree-shaking
    });

    // Read the bundled code
    const bundledCode = fs.readFileSync(tempOutputPath, 'utf-8');

    // Prepend the Plugin API wrapper
    const finalCode = pluginAPIWrapper + '\n' + bundledCode;

    // Write the final worker code
    fs.writeFileSync(outputPath, finalCode);

    // Clean up temp file
    fs.unlinkSync(tempOutputPath);

    // Copy manifest
    fs.copyFileSync(manifestPath, path.join(outputDir, `${pluginName}.json`));

    plugins.push({
      id: manifest.id,
      manifestUrl: `/plugins/${pluginName}.json`,
      workerUrl: `/plugins/${pluginName}.worker.js`
    });

    console.log(`✓ Built plugin: ${pluginName}`);
  } catch (error) {
    console.error(`❌ Failed to build plugin ${pluginName}:`, error.message);
  }
}

// Generate plugin registry
const registryPath = path.join(outputDir, 'registry.json');
fs.writeFileSync(registryPath, JSON.stringify(plugins, null, 2));
console.log(`\n✓ Plugin registry created: ${plugins.length} plugins\n`);
