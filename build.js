const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ensure public directory exists
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

// Copy HTML to public directory
fs.copyFileSync(
  path.join(__dirname, 'src/frontend/index.html'),
  path.join(__dirname, 'public/index.html')
);

// Bundle frontend TypeScript (development build with sourcemaps)
esbuild.build({
  entryPoints: ['src/frontend/app.ts'],
  bundle: true,
  minify: false, // Easier debugging in dev mode
  sourcemap: true,
  target: ['es2020'],
  splitting: true,        // Enable code splitting
  format: 'esm',          // Required for splitting (changed from 'iife')
  outdir: 'public/js',    // Output all JS to /public/js/
  entryNames: 'app',      // Keep main file as app.js
  chunkNames: '[name]-[hash]', // Lazy-loaded chunks in same directory
}).then(() => {
  console.log('Development build completed successfully');
}).catch(() => process.exit(1));
