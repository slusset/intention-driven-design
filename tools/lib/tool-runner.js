'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolve the argv prefix that spawns a tool script (a validator or the
 * evidence generator) as a child process.
 *
 * In the source tree the scripts live in tools/ next to this lib and are
 * spawned directly. In the self-contained dist bundle every tool module is
 * inlined into one file — the file this code runs from — so the same tools
 * are reached by re-invoking the bundle with the hidden `__tool` dispatch.
 * Returns null when the tool cannot be located.
 */
function toolCommand(name) {
  if (globalThis.__IDD_BUNDLE__) return [__filename, '__tool', name];
  const sourceScript = path.join(__dirname, '..', `${name}.js`);
  return fs.existsSync(sourceScript) ? [sourceScript] : null;
}

module.exports = { toolCommand };
