// Relay build — reproduces the shipped bundles exactly.
// Verified: this esbuild configuration rebuilds Relay 0.9.2's dist byte-identically
// from the recovered sources, so 0.10.0 diffs are purely the intended changes.
//
//   npm run build      → dist/
//   npm run package    → dist/ + Relay-<version>.vsix
//
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

await Promise.all([
  build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    target: 'node18',
    sourcemap: true,
    define: { __RELAY_VERSION__: JSON.stringify(pkg.version) },
    outfile: 'dist/extension.js'
  }),
  build({
    entryPoints: ['src/ui/webview.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    sourcemap: true,
    outfile: 'dist/webview.js'
  }),
  build({
    entryPoints: ['src/ui/webview-bootstrap.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2018',
    minify: true,
    sourcemap: false,
    outfile: 'dist/webview-bootstrap.js'
  }),
  build({
    entryPoints: ['src/ui/webview.css'],
    bundle: true,
    minify: true,
    outfile: 'dist/webview.css'
  })
]);
console.log('built dist/');

if (process.argv.includes('--package')) {
  const stage = '.vsix-stage';
  if (existsSync(stage)) rmSync(stage, { recursive: true });
  mkdirSync(`${stage}/extension`, { recursive: true });
  cpSync('packaging/[Content_Types].xml', `${stage}/[Content_Types].xml`);
  const manifest = readFileSync('packaging/extension.vsixmanifest', 'utf8')
    .replace(/Version="[0-9.]+"/, `Version="${pkg.version}"`);
  writeFileSync(`${stage}/extension.vsixmanifest`, manifest);
  for (const item of ['dist', 'media', 'docs', 'vendor', 'package.json', 'readme.md', 'changelog.md', 'LICENSE.txt']) {
    cpSync(item, `${stage}/extension/${item}`, { recursive: true });
  }
  const out = `Relay-${pkg.version.replaceAll('.', '_')}.vsix`;
  const zip = new JSZip();
  for (const filePath of walkFiles(stage)) {
    zip.file(relative(stage, filePath).replaceAll('\\', '/'), readFileSync(filePath));
  }
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  writeFileSync(out, archive);
  rmSync(stage, { recursive: true });
  console.log('packaged', out);
}
