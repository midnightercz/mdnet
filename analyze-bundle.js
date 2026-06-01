const esbuild = require('esbuild');
const fs = require('fs');

// Build with metafile to analyze bundle (matches production build config)
esbuild.build({
  entryPoints: ['src/frontend/app.ts'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2020'],
  splitting: true,        // Enable code splitting
  format: 'esm',          // Required for splitting
  outdir: 'public/js',    // Output all JS to /public/js/
  entryNames: 'app',      // Keep main file as app.js
  chunkNames: '[name]-[hash]',
  metafile: true,
}).then(result => {
  // Write metafile for external analysis
  fs.writeFileSync('meta.json', JSON.stringify(result.metafile));

  // Analyze the bundle
  const meta = result.metafile;
  const outputs = meta.outputs['public/js/app.js'];

  if (!outputs || !outputs.inputs) {
    console.error('No bundle data found');
    return;
  }

  // Calculate total size
  const totalBytes = outputs.bytes;

  // Collect all inputs with their sizes
  const inputs = Object.entries(outputs.inputs).map(([path, info]) => ({
    path,
    bytes: info.bytesInOutput,
    percentage: (info.bytesInOutput / totalBytes * 100).toFixed(2)
  }));

  // Sort by size (largest first)
  inputs.sort((a, b) => b.bytes - a.bytes);

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    BUNDLE SIZE ANALYSIS                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Total bundle size: ${formatBytes(totalBytes)}\n`);

  console.log('Top 20 files by size:\n');
  console.log('─'.repeat(80));

  inputs.slice(0, 20).forEach((input, i) => {
    const num = String(i + 1).padStart(2, ' ');
    const size = formatBytes(input.bytes).padStart(10, ' ');
    const pct = (input.percentage + '%').padStart(7, ' ');
    const barWidth = Math.floor(input.percentage / 2);
    const bar = '█'.repeat(barWidth);

    console.log(`${num}. ${size} ${pct}  ${bar}`);
    console.log(`    ${input.path}`);
  });

  console.log('\n' + '─'.repeat(80));

  // Group by node_modules vs source code
  const nodeModules = inputs.filter(i => i.path.includes('node_modules'));
  const sourceCode = inputs.filter(i => !i.path.includes('node_modules'));

  const nmBytes = nodeModules.reduce((sum, i) => sum + i.bytes, 0);
  const srcBytes = sourceCode.reduce((sum, i) => sum + i.bytes, 0);

  console.log('\nBreakdown by type:\n');
  console.log(`  Dependencies (node_modules): ${formatBytes(nmBytes)} (${(nmBytes/totalBytes*100).toFixed(1)}%)`);
  console.log(`  Source code:                 ${formatBytes(srcBytes)} (${(srcBytes/totalBytes*100).toFixed(1)}%)`);

  // Top packages from node_modules
  if (nodeModules.length > 0) {
    const packages = {};
    nodeModules.forEach(input => {
      const match = input.path.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)/);
      if (match) {
        const pkg = match[1];
        packages[pkg] = (packages[pkg] || 0) + input.bytes;
      }
    });

    const topPackages = Object.entries(packages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('\nTop 10 packages:\n');
    topPackages.forEach(([pkg, bytes], i) => {
      const size = formatBytes(bytes).padStart(10, ' ');
      const pct = ((bytes/totalBytes*100).toFixed(2) + '%').padStart(7, ' ');
      console.log(`  ${String(i+1).padStart(2, ' ')}. ${size} ${pct}  ${pkg}`);
    });
  }

  console.log('\n✓ Detailed metafile saved to meta.json');
  console.log('  View interactive analysis at: https://esbuild.github.io/analyze/\n');

}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
