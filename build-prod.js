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

// Bundle frontend TypeScript for production
esbuild.build({
  entryPoints: ['src/frontend/app.ts'],
  bundle: true,
  minify: true,
  sourcemap: false, // Disable sourcemaps for production
  target: ['es2020'],
  splitting: true,        // Enable code splitting
  format: 'esm',          // Required for splitting (changed from 'iife')
  outdir: 'public/js',    // Output all JS to /public/js/
  entryNames: 'app',      // Keep main file as app.js
  chunkNames: '[name]-[hash]', // Lazy-loaded chunks in same directory
  treeShaking: true,
  drop: ['console', 'debugger'], // Remove console.log and debugger statements
  legalComments: 'none', // Remove comments
}).then(() => {
  console.log('Production build completed successfully');

  // Show file sizes
  const stats = fs.statSync('public/js/app.js');
  console.log(`app.js size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}).catch(() => process.exit(1));
