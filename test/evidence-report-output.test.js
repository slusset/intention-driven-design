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
