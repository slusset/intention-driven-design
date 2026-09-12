'use strict';

/**
 * JUnit XML → test observations.
 *
 * JUnit XML is an interchange format, not a runner: cargo-nextest, pytest,
 * surefire, jest and ctest all emit it behind a reporter flag. This adapter
 * therefore knows the format and nothing about the stack that produced it.
 *
 * It returns one observation per `<testcase>` — name, outcome, duration, the
 * suite as scope — and nothing else. Which rule a test proves is decided once,
 * downstream, rather than reinvented per format.
 *
 * Skipped cases are counted and dropped: a test that did not run observed
 * nothing, and `test-selector` outcomes are pass or fail only.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : match;
  });
}

function attributes(tagBody) {
  const found = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of tagBody.matchAll(pattern)) {
    found[match[1]] = decode(match[3] !== undefined ? match[3] : match[4]);
  }
  return found;
}

/**
 * Find the end of the tag that starts at `open`, respecting quoted attribute
 * values so that an unescaped `>` inside a name does not truncate the tag.
 */
function tagEnd(xml, open) {
  let quote = null;
  for (let i = open; i < xml.length; i += 1) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '>') return i;
  }
  return -1;
}

function failureDetail(inner) {
  const match = inner.match(/<(?:failure|error)\b([^>]*)>/);
  if (!match) return null;
  const message = attributes(match[1]).message;
  if (!message) return null;
  const collapsed = message.replace(/\s+/g, ' ').trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 297)}…` : collapsed;
}

function parse(xml) {
  if (!/<testsuites?[\s>]/.test(xml)) {
    throw new Error('not a JUnit XML report: no <testsuite> or <testsuites> element');
  }

  const observations = [];
  let skipped = 0;

  for (let index = xml.indexOf('<testcase'); index !== -1; index = xml.indexOf('<testcase', index + 1)) {
    const after = xml[index + '<testcase'.length];
    if (after && !/[\s/>]/.test(after)) continue; // e.g. <testcases>
    const end = tagEnd(xml, index);
    if (end === -1) break;

    const body = xml.slice(index + '<testcase'.length, end);
    const selfClosing = xml[end - 1] === '/';
    let inner = '';
    if (!selfClosing) {
      const close = xml.indexOf('</testcase', end);
      inner = close === -1 ? xml.slice(end + 1) : xml.slice(end + 1, close);
    }

    const attrs = attributes(body);
    const name = (attrs.name || '').trim();
    if (!name) continue;

    if (/<skipped\b/.test(inner)) {
      skipped += 1;
      continue;
    }

    const failed = /<(?:failure|error)\b/.test(inner);
    const seconds = Number.parseFloat(attrs.time);
    const suite = (attrs.classname || '').trim();

    observations.push({
      name,
      outcome: failed ? 'fail' : 'pass',
      durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
      scope: suite || null,
      detail: failed ? failureDetail(inner) : null,
    });
  }

  return { observations, skipped };
}

module.exports = {
  format: 'junit',
  probeKind: 'test-selector',
  description: 'JUnit XML, as emitted by most runners behind a reporter flag',
  parse,
};
