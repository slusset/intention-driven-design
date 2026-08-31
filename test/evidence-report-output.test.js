const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');
const CAPABILITY = 'specs/capabilities/trade-show-signup.capability.yaml';

function runNode(args) {
  return execFileSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function runNodeIn(cwd, args) {
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
  });
}

function runJson(args) {
  return JSON.parse(runNode(args));
}

test('generate-evidence defaults to the gitignored .idd/evidence/ workspace', () => {
  const result = runJson([IDD_BIN, 'generate-evidence', '--capability', CAPABILITY, '--json']);

  assert.deepEqual(result.errors, []);
  assert.equal(result.evidence_path, '.idd/evidence/trade-show-signup/evidence.yaml');
  assert.ok(!result.evidence_path.startsWith('certification/'));
});

test('generate-evidence --json includes the full manifest for report rendering', () => {
  const result = runJson([IDD_BIN, 'generate-evidence', '--capability', CAPABILITY, '--json']);

  assert.ok(result.manifest, 'manifest missing from --json output');
  assert.equal(result.manifest.capability, CAPABILITY);
  assert.ok(result.manifest.evidence.unit_tests, 'manifest.evidence.unit_tests missing');
  assert.equal(result.manifest.traceability.stories_with_features, '2/2');
  assert.ok(Array.isArray(result.manifest.gaps), 'manifest.gaps missing');
  assert.deepEqual(result.manifest.module, {
    name: 'trade-show-onboarding',
    root: 'specs',
    verification_map: 'specs/verification/trade-show-signup/verification.yaml',
  });
});

test('generate-evidence carries module metadata for a colocated capability root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-colocated-evidence-'));
  const capability = 'evals/specs/capabilities/instruments.capability.yaml';
  const manifest = `version: 1\nmodules:\n  instruments:\n    root: evals/specs\n    capabilities:\n      - ${capability}\n    rule_families: []\n    depends_on: []\n`;
  const capabilityDocument = `id: instruments\ntype: capability\nscope:\n  personas: []\n  journeys: []\n  stories: []\n  features: []\n  models: []\n  contracts: []\n  fixtures: []\n  journey_maps: []\n`;
  fs.mkdirSync(path.join(repoRoot, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'evals', 'specs', 'capabilities'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'specs', 'modules.yaml'), manifest);
  fs.writeFileSync(path.join(repoRoot, capability), capabilityDocument);

  try {
    const result = JSON.parse(runNodeIn(repoRoot, [
      IDD_BIN,
      'generate-evidence',
      '--capability', capability,
      '--modules-manifest', 'specs/modules.yaml',
      '--json',
    ]));

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.manifest.module, {
      name: 'instruments',
      root: 'evals/specs',
      verification_map: 'evals/specs/verification/instruments/verification.yaml',
    });
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('generate-evidence --write honors an explicit --output outside the repo', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-evidence-'));
  const outPath = path.join(outDir, 'trade-show-signup', 'evidence.yaml');

  try {
    runNode([IDD_BIN, 'generate-evidence', '--capability', CAPABILITY, '--output', outPath, '--write']);

    assert.ok(fs.existsSync(outPath), 'evidence manifest was not written');
    const written = fs.readFileSync(outPath, 'utf8');
    assert.match(written, /capability: specs\/capabilities\/trade-show-signup\.capability\.yaml/);
    assert.match(written, /traceability:/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('idd-check evidence discovery follows declared module roots', () => {
  const action = fs.readFileSync(path.join(REPO_ROOT, '.github', 'actions', 'idd-check', 'action.yml'), 'utf8');

  assert.match(action, /module status --repo/);
  assert.match(action, /CAPABILITY_LIST/);
  assert.match(action, /CAP_KEY/);
  assert.doesNotMatch(action, /for CAP_FILE in "\$SPECS_DIR"\/capabilities/);
});
