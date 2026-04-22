/**
 * Regression test for the fixture validator's handling of nested `$ref`
 * composition in OpenAPI component schemas.
 *
 * Before the fix, compiling a named schema that used
 *   allOf: [{ $ref: '#/components/schemas/Base' }, ...]
 * would fail with:
 *   "can't resolve reference #/components/schemas/Base from id #"
 * because Ajv only saw the top-level schema; sibling components were
 * never registered as named schemas. The fix pre-registers every entry
 * under `components.schemas` with its canonical `$ref` as `$id` so
 * Ajv can resolve nested references on compile.
 *
 * This test builds a minimal specs/ tree in a temp dir with a contract
 * that uses allOf composition, adds fixtures that exercise both the
 * legacy (`_meta.schema`) path and the OpenAPI (`method/path`) path,
 * and asserts the validator returns zero errors.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');

function runJson(args, opts = {}) {
  const out = execFileSync(process.execPath, args, {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function makeTempSpecsDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-fixture-refs-'));
  const specs = path.join(root, 'specs');
  fs.mkdirSync(path.join(specs, 'contracts', 'openapi'), { recursive: true });
  fs.mkdirSync(path.join(specs, 'fixtures'), { recursive: true });

  const openapi = [
    'openapi: 3.1.0',
    'info:',
    '  title: ref-resolution fixture',
    '  version: 0.0.1',
    'paths:',
    '  /widgets:',
    '    post:',
    '      operationId: createWidget',
    '      requestBody:',
    '        required: true',
    '        content:',
    '          application/json:',
    "            schema: { $ref: '#/components/schemas/WidgetBase' }",
    '      responses:',
    "        '201':",
    '          description: created',
    '          content:',
    '            application/json:',
    "              schema: { $ref: '#/components/schemas/WidgetCreated' }",
    'components:',
    '  schemas:',
    '    WidgetBase:',
    '      type: object',
    '      required: [name]',
    '      properties:',
    '        name: { type: string }',
    '    WidgetCreated:',
    '      allOf:',
    "        - $ref: '#/components/schemas/WidgetBase'",
    '        - type: object',
    '          required: [id]',
    '          properties:',
    '            id: { type: string }',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(specs, 'contracts', 'openapi', 'api.yaml'), openapi);

  // Legacy-path fixture: references `WidgetCreated` via `_meta.schema`.
  // Without the fix, this trips on the nested $ref to WidgetBase.
  fs.writeFileSync(
    path.join(specs, 'fixtures', 'legacy-path.json'),
    JSON.stringify(
      {
        _meta: { id: 'legacy-path', type: 'fixture', schema: 'WidgetCreated' },
        request: { name: 'sample' },
        response: { name: 'sample', id: 'w_1' },
      },
      null,
      2,
    ),
  );

  // OpenAPI-path fixture: uses method+path; the response schema pulled
  // from the operation is `WidgetCreated`, same composition.
  fs.writeFileSync(
    path.join(specs, 'fixtures', 'openapi-path.json'),
    JSON.stringify(
      {
        _meta: { id: 'openapi-path', type: 'fixture' },
        request: {
          method: 'POST',
          path: '/widgets',
          body: { name: 'sample' },
        },
        response: { status: 201, body: { name: 'sample', id: 'w_2' } },
      },
      null,
      2,
    ),
  );

  return specs;
}

test('fixture validator resolves nested $refs in legacy and OpenAPI paths', () => {
  const specs = makeTempSpecsDir();
  const result = runJson([IDD_BIN, 'validate', 'fixtures', specs, '--json']);

  assert.deepEqual(
    result.errors,
    [],
    `Expected zero errors, got:\n${result.errors.join('\n')}`,
  );

  const info = result.info.join('\n');
  assert.match(info, /legacy-path\.json: valid/);
  assert.match(info, /openapi-path\.json: valid/);
});
