'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');

const {
  extractReferences,
  loadCapability,
  computeClosure,
} = require('../../tools/lib/reference-graph');

const REPO_ROOT = path.join(__dirname, '..', '..');
const VALIDATE_CLOSURE = path.join(REPO_ROOT, 'tools', 'validate-capability-closure.js');

function runJson(specsDir, extra = []) {
  const out = execFileSync(process.execPath, [VALIDATE_CLOSURE, specsDir, '--json', ...extra], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof content === 'string' ? content : yaml.dump(content));
}

function makeTinyRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-closure-'));
  const specs = path.join(tmp, 'specs');

  writeFile(path.join(specs, 'personas', 'visitor.persona.md'), '---\nid: visitor\ntype: persona\n---\n');
  writeFile(path.join(specs, 'journeys', 'sign-up.journey.md'),
    '---\nid: sign-up\ntype: journey\nrefs:\n  persona: specs/personas/visitor.persona.md\n---\n');
  writeFile(path.join(specs, 'stories', 'mobile-signup.story.md'),
    '---\nid: mobile-signup\ntype: story\nrefs:\n  journey: specs/journeys/sign-up.journey.md\n  persona: specs/personas/visitor.persona.md\n---\n');
  writeFile(path.join(specs, 'features', 'mobile-signup.feature'),
    '# id: mobile-signup\n# type: feature\n# story: specs/stories/mobile-signup.story.md\n# journey: specs/journeys/sign-up.journey.md\nFeature: Mobile Signup\n');

  return { tmp, specs };
}

test('extracts refs from a story front-matter', () => {
  const { specs } = makeTinyRepo();
  const refs = extractReferences(path.join(specs, 'stories', 'mobile-signup.story.md'));
  assert.ok(refs.has('specs/journeys/sign-up.journey.md'));
  assert.ok(refs.has('specs/personas/visitor.persona.md'));
});

test('extracts refs from a Gherkin feature header block', () => {
  const { specs } = makeTinyRepo();
  const refs = extractReferences(path.join(specs, 'features', 'mobile-signup.feature'));
  assert.ok(refs.has('specs/stories/mobile-signup.story.md'));
  assert.ok(refs.has('specs/journeys/sign-up.journey.md'));
});

test('computeClosure walks transitively from the declared scope', () => {
  const { specs } = makeTinyRepo();
  writeFile(path.join(specs, 'capabilities', 'sign-up.capability.yaml'), {
    id: 'sign-up',
    type: 'capability',
    scope: {
      personas: ['specs/personas/visitor.persona.md'],
      journeys: ['specs/journeys/sign-up.journey.md'],
      stories: ['specs/stories/mobile-signup.story.md'],
      features: ['specs/features/mobile-signup.feature'],
    },
  });
  const cap = loadCapability(path.join(specs, 'capabilities', 'sign-up.capability.yaml'));
  const { closure } = computeClosure(cap, { repoRoot: path.dirname(specs) });
  assert.equal(closure.size, 4);
  assert.ok(closure.has('specs/stories/mobile-signup.story.md'));
  assert.ok(closure.has('specs/personas/visitor.persona.md'));
});

test('validate-capability-closure flags missing-from-scope artifacts', () => {
  const { tmp, specs } = makeTinyRepo();
  // Capability scope omits the story even though feature references it.
  writeFile(path.join(specs, 'capabilities', 'sign-up.capability.yaml'), {
    id: 'sign-up',
    type: 'capability',
    scope: {
      personas: ['specs/personas/visitor.persona.md'],
      journeys: ['specs/journeys/sign-up.journey.md'],
      features: ['specs/features/mobile-signup.feature'],
    },
  });
  const result = runJson(specs);
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.warnings.some((w) => w.includes('reachable from scope but not declared') && w.includes('mobile-signup.story.md')),
    `expected missing-from-scope warning, got: ${result.warnings.join('\n')}`,
  );
});

test('validate-capability-closure flags declared-but-unreachable artifacts', () => {
  const { specs } = makeTinyRepo();
  writeFile(path.join(specs, 'stories', 'dead.story.md'),
    '---\nid: dead\ntype: story\n---\n');
  writeFile(path.join(specs, 'capabilities', 'sign-up.capability.yaml'), {
    id: 'sign-up',
    type: 'capability',
    scope: {
      personas: ['specs/personas/visitor.persona.md'],
      journeys: ['specs/journeys/sign-up.journey.md'],
      stories: [
        'specs/stories/mobile-signup.story.md',
        'specs/stories/dead.story.md',
      ],
      features: ['specs/features/mobile-signup.feature'],
    },
  });
  const result = runJson(specs);
  assert.ok(
    result.warnings.some((w) => w.includes('declared in scope but not reachable') && w.includes('dead.story.md')),
    `expected unreachable warning, got: ${result.warnings.join('\n')}`,
  );
});

test('validate-capability-closure respects scope.excluded for cross-capability shares', () => {
  const { specs } = makeTinyRepo();
  writeFile(path.join(specs, 'capabilities', 'sign-up.capability.yaml'), {
    id: 'sign-up',
    type: 'capability',
    scope: {
      personas: ['specs/personas/visitor.persona.md'],
      journeys: ['specs/journeys/sign-up.journey.md'],
      stories: ['specs/stories/mobile-signup.story.md'],
      features: ['specs/features/mobile-signup.feature'],
      excluded: ['specs/personas/visitor.persona.md'],
    },
  });
  const result = runJson(specs);
  assert.equal(result.errors.length, 0);
  // visitor.persona should not appear as missing-from-scope (it was excluded
  // from the closure walk), and should not appear as unreachable either
  // because excluded entries are ignored on both sides.
  assert.ok(
    !result.warnings.some((w) => w.includes('visitor.persona.md')),
    `expected no warning about excluded persona, got: ${result.warnings.join('\n')}`,
  );
});

test('trade-show-signup repo capability validates against its computed closure (conformance fixture)', () => {
  const result = runJson(path.join(REPO_ROOT, 'specs'));
  assert.equal(result.errors.length, 0, `errors: ${result.errors.join('\n')}`);
  assert.equal(result.warnings.length, 0, `warnings: ${result.warnings.join('\n')}`);
  assert.ok(
    result.info.some((i) => i.includes('trade-show-signup.capability.yaml') && i.includes('closure OK')),
    `expected closure OK info, got: ${result.info.join('\n')}`,
  );
});
