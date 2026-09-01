'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolve the installed toolkit root from a module directory. Works from the
 * source tree (bin/, tools/lib/) and from the self-contained dist/ bundle,
 * where the running file sits under <root>/dist/bin and node_modules may be
 * absent entirely. The walk starts inside the toolkit, so the first
 * `package.json` named `idd-toolkit` is the toolkit's own root.
 */
function findToolkitRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    const manifestPath = path.join(dir, 'package.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.name === 'idd-toolkit') return dir;
      } catch {
        // An unreadable package.json on the walk is not the toolkit root.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

module.exports = { findToolkitRoot };
