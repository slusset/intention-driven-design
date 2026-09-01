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
};

module.exports = { TRANSFORMATIONS };
