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

// Bundle frontend TypeScript
esbuild.build({
  entryPoints: ['src/frontend/app.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  outfile: 'public/app.js',
  format: 'iife',
}).then(() => {
  console.log('Frontend built successfully');
}).catch(() => process.exit(1));
