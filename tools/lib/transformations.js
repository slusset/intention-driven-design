'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const OVERLAY_RELATIVE = 'specs/skills/repo-overlay.md';

function splitFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontMatter: null, body: source };
  return { frontMatter: yaml.load(match[1]) || {}, body: source.slice(match[0].length) };
}

function walkFiles(dir, pattern, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, pattern, out);
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function relative(repoRoot, file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

/**
 * Rewrite a set of files with a pure text → text function. Files whose text
 * does not change are not written, so a second run reports changed:false.
 */
function rewriteFiles(repoRoot, files, rewrite) {
  const paths = [];
  let changed = false;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const next = rewrite(source, file);
    if (next !== source) {
      fs.writeFileSync(file, next);
      changed = true;
      paths.push(relative(repoRoot, file));
    }
  }
  return { changed, paths };
}

function detectJsonIndent(source) {
  const match = source.match(/^\{\r?\n([ \t]+)"/);
  return match ? match[1] : '  ';
}

/**
 * Line-level YAML surgery keeps comments and formatting intact: the
 * transformations below never round-trip a document through the YAML
 * serializer, so a consumer's hand-written spec keeps its shape.
 */
function rewriteRequiredLines(source) {
  // `required: conditional-x` (bare string) → `required: { when: conditional-x }`.
  // Booleans, quoted booleans, flow/objects, and anchors are left alone.
  return source.replace(/^([ \t]+required:[ \t]+)([A-Za-z][A-Za-z0-9._-]*)[ \t]*$/gm, (line, prefix, value) => {
    if (['true', 'false', 'yes', 'no', 'null', '~'].includes(value.toLowerCase())) return line;
    return `${prefix}{ when: ${value} }`;
  });
}

function rewriteIdentityBlocks(source) {
  // Insert `kind:` as the first key of a top-level `identity:` block when it
  // is absent, inferred from which of field / fields / equality is present.
  const lines = source.split(/\r?\n/);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^identity:[ \t]*$/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && (/^[ \t]+\S/.test(lines[end]) || /^[ \t]*$/.test(lines[end]) || /^[ \t]*#/.test(lines[end]))) end += 1;
    const block = lines.slice(i + 1, end);
    const keys = new Set(block.map((line) => (line.match(/^[ \t]+([A-Za-z_][A-Za-z0-9_-]*):/) || [])[1]).filter(Boolean));
    if (keys.has('kind')) continue;
    const kind = keys.has('field') ? 'field' : keys.has('fields') ? 'composite' : keys.has('equality') ? 'content' : null;
    if (!kind) continue;
    const first = block.find((line) => /^[ \t]+[A-Za-z_]/.test(line));
    const indent = first ? first.match(/^[ \t]+/)[0] : '  ';
    lines.splice(i + 1, 0, `${indent}kind: ${kind}`);
  }
  return lines.join(eol);
}

/**
 * Registry of deterministic doctor transformations (#69). Each transformation
 * is a pure function of the repository tree and the running toolkit
 * installation: given the same inputs it produces the same bytes. Doctor
 * apply executes a transformation only from an accepted migration plan, and
 * none of them touch journal history.
 */
const TRANSFORMATIONS = {
  'record-consumer-contract': {
    summary: 'Record or update the idd_consumer contract pins in the repo overlay front matter.',
    apply(repoRoot, context) {
      const overlayPath = path.join(repoRoot, OVERLAY_RELATIVE);
      const exists = fs.existsSync(overlayPath);
      const source = exists ? fs.readFileSync(overlayPath, 'utf8') : '# Repo Overlay\n';
      const { frontMatter, body } = splitFrontMatter(source);
      const record = {
        schemaVersion: 1,
        toolkit: {
          version: context.toolkit.version,
          schema: {
            version: context.toolkit.schema_version,
            digest: context.toolkit.schema_digest,
          },
          source: {
            kind: context.source.kind,
            ref: context.source.ref,
          },
        },
      };
      const nextFrontMatter = { ...(frontMatter || {}), idd_consumer: record };
      const serialized = `---\n${yaml.dump(nextFrontMatter, { lineWidth: 120, noRefs: true })}---\n${body}`;
      const changed = !exists || serialized !== source;
      if (changed) {
        fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
        fs.writeFileSync(overlayPath, serialized);
      }
      return { changed, paths: [OVERLAY_RELATIVE] };
    },
  },

  'fixture-meta-kind': {
    summary: 'Move a non-constant JSON fixture `_meta.type` into `_meta.kind` and restore `type: fixture` (#81).',
    // Error findings this rewrite removes. The plan lists them as
    // resolved_by_plan instead of blockers, so apply is not refused on the
    // very errors it exists to fix.
    resolves: [
      'validator-fixtures-schema-const',
      'validator-front-matter-declared-type-doesnt-match-expected-for',
    ],
    apply(repoRoot) {
      const files = walkFiles(path.join(repoRoot, 'specs', 'fixtures'), /\.json$/i);
      return rewriteFiles(repoRoot, files, (source) => {
        let doc;
        try { doc = JSON.parse(source); } catch { return source; }
        const meta = doc && doc._meta;
        if (!meta || typeof meta !== 'object' || typeof meta.type !== 'string' || meta.type === 'fixture') return source;
        if (!/^[a-z][a-z0-9-]*$/.test(meta.type)) return source;
        const next = {};
        for (const [key, value] of Object.entries(meta)) {
          if (key === 'type') {
            next.type = 'fixture';
            if (meta.kind === undefined) next.kind = value;
          } else {
            next[key] = value;
          }
        }
        doc._meta = next;
        return `${JSON.stringify(doc, null, detectJsonIndent(source))}\n`;
      });
    },
  },

  'identity-kind': {
    summary: 'Write the inferred `identity.kind` (field / composite / content) into model documents that omit it (#83).',
    resolves: [],
    apply(repoRoot) {
      const files = walkFiles(path.join(repoRoot, 'specs', 'models'), /\.model\.ya?ml$/i);
      return rewriteFiles(repoRoot, files, rewriteIdentityBlocks);
    },
  },

  'attribute-required-when': {
    summary: 'Rewrite bare-string conditional `required:` values into the canonical `{ when: … }` form (#82).',
    resolves: [],
    apply(repoRoot) {
      const files = walkFiles(path.join(repoRoot, 'specs', 'models'), /\.model\.ya?ml$/i);
      return rewriteFiles(repoRoot, files, rewriteRequiredLines);
    },
  },
};

module.exports = { TRANSFORMATIONS };
