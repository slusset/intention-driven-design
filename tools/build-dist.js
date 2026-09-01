#!/usr/bin/env node

'use strict';

/**
 * Build the committed self-contained CLI bundle for plugin installs (#77).
 *
 * Plugin host caches clone this repository without installing node_modules,
 * so the PATH-visible bin/idd wrapper falls back to dist/bin/idd.js: one file
 * that inlines the CLI, every consumer-facing tool script, and the runtime
 * dependencies (ajv, ajv-formats, js-yaml). Tool subprocesses re-enter the
 * bundle through the hidden `idd __tool <name>` dispatch. Schemas, skills,
 * and the migration catalog remain data files resolved from the repository
 * tree at runtime, so the bundle only changes when source code changes.
 *
 * Usage:
 *   node tools/build-dist.js          # rebuild dist/bin/idd.js in place
 *   node tools/build-dist.js --check  # fail if the committed bundle is stale
 */

const fs = require('fs');
const path = require('path');
const { buildSync } = require('esbuild');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_RELATIVE = path.join('dist', 'bin', 'idd.js');
const OUT_FILE = path.join(REPO_ROOT, OUT_RELATIVE);

function build(write) {
  return buildSync({
    entryPoints: [path.join(REPO_ROOT, 'bin', 'idd.js')],
    outfile: OUT_FILE,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    minify: true,
    keepNames: true,
    sourcemap: false,
    // The tool-runner switches to bundle self-dispatch on this global.
    banner: { js: 'globalThis.__IDD_BUNDLE__ = true;' },
    write,
    logLevel: 'warning',
  });
}

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const result = build(false);
  const built = result.outputFiles.find((file) => path.resolve(file.path) === OUT_FILE);
  const committed = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
  if (committed === null) {
    console.error(`${OUT_RELATIVE} is missing — run \`node tools/build-dist.js\` and commit the result.`);
    process.exit(1);
  }
  if (built.text !== committed) {
    console.error(`${OUT_RELATIVE} is stale — run \`node tools/build-dist.js\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUT_RELATIVE} is current.`);
} else {
  build(true);
  fs.chmodSync(OUT_FILE, 0o755);
  const { size } = fs.statSync(OUT_FILE);
  console.log(`Built ${OUT_RELATIVE} (${(size / 1024).toFixed(0)} KiB).`);
}
