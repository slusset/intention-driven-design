#!/usr/bin/env node

'use strict';

/**
 * Keep each skill's copy of a canonical methodology doc in sync (#122).
 *
 * A skill resolves relative paths from its own directory, and a skills-only
 * install (`gh skill install`, `idd install-skills`) carries no `docs/` tree
 * at all, so a skill that points at the methodology library resolves against
 * nothing. Every skill that needs one of those documents therefore ships a
 * generated copy under its own `references/`, and this script is the only
 * writer of those copies.
 *
 * Usage:
 *   node tools/sync-skill-references.js          # regenerate the copies
 *   node tools/sync-skill-references.js --check  # fail if any copy is stale
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const COPIES = [
  {
    source: 'docs/idd/front-matter-spec.md',
    targets: [
      'skills/behavior-contract/references/front-matter-spec.md',
      'skills/solution-narrative/references/front-matter-spec.md',
      'skills/pr-review/references/front-matter-spec.md',
    ],
  },
  {
    source: 'docs/idd/certification-guide.md',
    targets: ['skills/certification/references/certification-guide.md'],
  },
];

function render(sourceRelative, body) {
  const notice = `<!-- Generated from ${sourceRelative} by tools/sync-skill-references.js. `
    + 'Edit the source document, then re-run the script. -->';
  return `${notice}\n\n${body}`;
}

function expected(copy) {
  const sourcePath = path.join(REPO_ROOT, copy.source);
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source document is missing: ${copy.source}`);
    process.exit(1);
  }
  return render(copy.source, fs.readFileSync(sourcePath, 'utf8'));
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const stale = [];
  let written = 0;

  for (const copy of COPIES) {
    const content = expected(copy);
    for (const target of copy.targets) {
      const targetPath = path.join(REPO_ROOT, target);
      const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
      if (current === content) continue;
      if (checkOnly) {
        stale.push({ target, reason: current === null ? 'missing' : 'stale' });
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
      written += 1;
      console.log(`  ${target} ← ${copy.source}`);
    }
  }

  if (checkOnly) {
    if (stale.length > 0) {
      for (const entry of stale) {
        console.error(`${entry.target} is ${entry.reason} — run \`node tools/sync-skill-references.js\` and commit the result.`);
      }
      process.exit(1);
    }
    console.log('Skill reference copies are current.');
    return;
  }

  console.log(written === 0 ? 'Skill reference copies were already current.' : `Updated ${written} copy/copies.`);
}

if (require.main === module) main();

module.exports = { COPIES, REPO_ROOT };
