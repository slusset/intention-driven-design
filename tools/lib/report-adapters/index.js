'use strict';

/**
 * Report adapters, keyed by format rather than by runner (#94).
 *
 * A report format is an interchange contract; a runner is a stack choice.
 * Adding a format is adding one file here — the CLI, the record builder and
 * the roll-up learn nothing new.
 *
 * Every adapter exports { format, probeKind, description, parse(text) } and
 * parse returns { observations: [{ name, outcome, durationMs, scope, detail }],
 * skipped }.
 */

const junit = require('./junit');

const ADAPTERS = { [junit.format]: junit };

function formats() {
  return Object.keys(ADAPTERS).sort();
}

function getAdapter(format) {
  const adapter = ADAPTERS[format];
  if (!adapter) {
    throw new Error(`unknown report format: ${format} (known formats: ${formats().join(', ')})`);
  }
  return adapter;
}

module.exports = { ADAPTERS, formats, getAdapter };
