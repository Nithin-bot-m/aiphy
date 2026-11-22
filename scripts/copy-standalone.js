// scripts/copy-standalone.js
// Cross-platform copy utility for Next.js standalone output.
// Replaces platform-dependent "cp -r" commands in package.json build script.

const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const root = path.resolve(__dirname, '..');
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(root, '.next', 'standalone', '.next', 'static');
const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, '.next', 'standalone', 'public');

console.log('[build-post] Packaging Next.js standalone assets...');
copyRecursiveSync(staticSrc, staticDest);
copyRecursiveSync(publicSrc, publicDest);
console.log('[build-post] Assets copied to .next/standalone successfully.');

