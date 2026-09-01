'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findMigrationPath, readMigrationCatalog } = require('../tools/lib/migrations');

const REPO_ROOT = path.resolve(__dirname, '..');

test('migration catalog is valid and resolves ordered schema paths', () => {
  const result = readMigrationCatalog(REPO_ROOT);
  assert.equal(result.status, 'valid', JSON.stringify(result.errors));

  const pathResult = findMigrationPath(result.catalog, '1.9.0', '1.11.0');
  assert.deepEqual(pathResult.map((migration) => migration.id), [
    'schema-1-9-0-to-1-10-0',
    'schema-1-10-0-to-1-11-0',
  ]);
  assert.equal(pathResult.flatMap((migration) => migration.steps).every((step) => step.mode !== 'transform'), true);
});

test('migration catalog rejects duplicate ids', (t) => {
  const toolkitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-migration-catalog-'));
  t.after(() => fs.rmSync(toolkitRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(toolkitRoot, 'migrations'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'migrations', 'catalog.schema.json'), path.join(toolkitRoot, 'migrations', 'catalog.schema.json'));
  const catalog = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'migrations', 'catalog.json'), 'utf8'));
  catalog.migrations.push({ ...catalog.migrations[0] });
  fs.writeFileSync(path.join(toolkitRoot, 'migrations', 'catalog.json'), JSON.stringify(catalog));

  const result = readMigrationCatalog(toolkitRoot);
  assert.equal(result.status, 'invalid');
  assert.ok(result.errors.some((message) => message.includes('duplicate migration id')));
});
