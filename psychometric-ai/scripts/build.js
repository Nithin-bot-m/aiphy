#!/usr/bin/env node
// build.js — verification build for the static-frontend + Express-backend app.
//
// This project intentionally has NO bundler (vanilla JS frontend served by
// Express). A meaningful "build" therefore = correctness verification:
//   1. Syntax-check every backend/frontend JS file (node --check equivalent).
//   2. Verify index.html references only assets that exist (no broken links).
//   3. Verify no frontend file hardcodes a non-localhost absolute API URL.
//   4. Emit a build manifest with file counts + sha256 integrity hashes.
//
// Exit code 1 on any failure — suitable for CI gates.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

function listFiles(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'data') continue;
      listFiles(full, exts, out);
    } else if (exts.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

// ---- 1. Syntax check ----
const jsFiles = [
  ...listFiles(path.join(ROOT, 'backend'), ['.js']).filter(f => !f.includes(path.join('backend', 'data'))),
  ...listFiles(path.join(ROOT, 'frontend', 'js'), ['.js']),
  ...listFiles(path.join(ROOT, 'scripts'), ['.js'])
];
for (const file of jsFiles) {
  try {
    require('child_process').execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (checkErr) {
    errors.push(`Syntax error in ${path.relative(ROOT, file)}: ${String(checkErr.stderr || checkErr.message).split('\n')[0]}`);
  }
}

// ---- 2. index.html asset references ----
const indexPath = path.join(ROOT, 'frontend', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const assetRefs = [...indexHtml.matchAll(/(?:src|href)="([^"'#]+)(?:#[^"]*)?"/g)]
  .map(m => m[1])
  .filter(ref => ref && !/^(https?:)?\/\//.test(ref)); // ignore external/protocol-relative
let checkedRefs = 0;
for (const ref of assetRefs) {
  const local = path.join(ROOT, 'frontend', ref.split('?')[0]);
  checkedRefs += 1;
  if (!fs.existsSync(local)) errors.push(`index.html references missing asset: ${ref}`);
}

// ---- 3. No hardcoded absolute API URLs in frontend ----
for (const file of listFiles(path.join(ROOT, 'frontend', 'js'), ['.js'])) {
  const src = fs.readFileSync(file, 'utf8');
  const hardcoded = src.match(/https?:\/\/(?!localhost|127\.0\.0\.1)[\w.-]+/g);
  if (hardcoded) {
    errors.push(`${path.relative(ROOT, file)} hardcodes absolute URL(s): ${[...new Set(hardcoded)].join(', ')}`);
  }
}

// ---- 4. Manifest ----
const manifest = {
  build_time: new Date().toISOString(),
  node_version: process.version,
  files: jsFiles.map(f => ({
    path: path.relative(ROOT, f),
    bytes: fs.statSync(f).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  }))
};
fs.writeFileSync(path.join(ROOT, 'build-manifest.json'), JSON.stringify(manifest, null, 2));

if (errors.length > 0) {
  console.error('BUILD FAILED:');
  errors.forEach(e => console.error('  ✖ ' + e));
  process.exit(1);
}
console.log(`BUILD OK — ${manifest.files.length} JS files verified, ${checkedRefs} HTML asset refs checked.`);
console.log('Manifest: build-manifest.json');
