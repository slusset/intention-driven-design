#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');
const CLAUDE_MANIFEST_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const CODEX_MANIFEST_PATH = path.join(REPO_ROOT, '.codex-plugin', 'plugin.json');
const MARKETPLACE_PATH = path.join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json');

const errors = [];
const warnings = [];
const info = [];

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} is missing: ${path.relative(REPO_ROOT, filePath)}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireFile(relativePath, label) {
  if (!fs.existsSync(path.join(REPO_ROOT, relativePath))) {
    errors.push(`${label} is missing: ${relativePath}`);
  }
}

function validateCodexManifest(pkg) {
  const manifest = readJson(CODEX_MANIFEST_PATH, 'Codex plugin manifest');
  if (!manifest) return;

  requireString(manifest.name, 'Codex plugin name');
  requireString(manifest.version, 'Codex plugin version');
  requireString(manifest.description, 'Codex plugin description');
  if (manifest.name !== 'idd-skills') {
    errors.push(`Codex plugin name must be idd-skills, got ${manifest.name}`);
  }
  if (manifest.version !== pkg.version) {
    errors.push(`Codex plugin version ${manifest.version} does not match package.json ${pkg.version}`);
  }

  if (manifest.skills !== './skills/') {
    errors.push('Codex plugin skills must be exactly ./skills/');
  }
  if (JSON.stringify(manifest).includes('technical-skills')) {
    errors.push('Codex plugin manifest must not declare technical-skills');
  }

  const interfaceMetadata = manifest.interface;
  if (!interfaceMetadata || typeof interfaceMetadata !== 'object') {
    errors.push('Codex plugin interface metadata is missing');
  } else {
    for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
      requireString(interfaceMetadata[field], `Codex plugin interface.${field}`);
    }
    if (!Array.isArray(interfaceMetadata.capabilities) || interfaceMetadata.capabilities.length === 0) {
      errors.push('Codex plugin interface.capabilities must be a non-empty array');
    }
    if (!Array.isArray(interfaceMetadata.defaultPrompt) || interfaceMetadata.defaultPrompt.length === 0) {
      errors.push('Codex plugin interface.defaultPrompt must be a non-empty array');
    }
  }

  const skillsRoot = path.join(REPO_ROOT, 'skills');
  const skillDirs = fs.existsSync(skillsRoot)
    ? fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    : [];
  if (skillDirs.length === 0) {
    errors.push('Codex plugin skills root contains no skill directories');
  }
  for (const skillName of skillDirs) {
    if (!fs.existsSync(path.join(skillsRoot, skillName, 'SKILL.md'))) {
      errors.push(`Codex skill ${skillName} is missing SKILL.md`);
    }
  }
}

function validateClaudeManifest(pkg) {
  const manifest = readJson(CLAUDE_MANIFEST_PATH, 'Claude plugin manifest');
  if (!manifest) return;

  requireString(manifest.name, 'Claude plugin name');
  requireString(manifest.version, 'Claude plugin version');
  requireString(manifest.description, 'Claude plugin description');
  if (manifest.name !== 'idd-skills') {
    errors.push(`Claude plugin name must be idd-skills, got ${manifest.name}`);
  }
  if (manifest.version !== pkg.version) {
    errors.push(`Claude plugin version ${manifest.version} does not match package.json ${pkg.version}`);
  }
  if (!Array.isArray(manifest.skills) || manifest.skills.length !== 1 || manifest.skills[0] !== './skills') {
    errors.push('Claude plugin skills must be exactly ["./skills"]');
  }
  if (JSON.stringify(manifest).includes('technical-skills')) {
    errors.push('Claude plugin manifest must not declare technical-skills');
  }
}

function validateMarketplace() {
  const marketplace = readJson(MARKETPLACE_PATH, 'Codex repo marketplace');
  if (!marketplace) return;

  requireString(marketplace.name, 'Marketplace name');
  if (!marketplace.interface || typeof marketplace.interface !== 'object') {
    errors.push('Marketplace interface metadata is missing');
  } else {
    requireString(marketplace.interface.displayName, 'Marketplace interface.displayName');
  }

  if (!Array.isArray(marketplace.plugins)) {
    errors.push('Marketplace plugins must be an array');
    return;
  }

  const entry = marketplace.plugins.find((plugin) => plugin && plugin.name === 'idd-skills');
  if (!entry) {
    errors.push('Marketplace has no idd-skills entry');
    return;
  }
  if (!entry.source || entry.source.source !== 'local' || entry.source.path !== './') {
    errors.push('Marketplace idd-skills entry must point to the local repo root with ./');
  }
  if (!entry.policy || entry.policy.installation !== 'AVAILABLE' || entry.policy.authentication !== 'ON_INSTALL') {
    errors.push('Marketplace idd-skills entry has an invalid installation policy');
  }
  requireString(entry.category, 'Marketplace idd-skills category');
}

function validateTooling() {
  requireFile('bin/idd.js', 'IDD CLI');
  requireFile('bin/idd', 'IDD PATH shim');
  requireFile('.github/actions/idd-check/action.yml', 'IDD GitHub Action');
  requireFile('schemas/v1/index.json', 'IDD schema registry');

  if (fs.existsSync(path.join(REPO_ROOT, 'technical-skills'))) {
    errors.push('Bundled technical-skills directory must be removed; consumers bind stack skills in repo-overlay');
  }

  const validatorCount = fs.readdirSync(path.join(REPO_ROOT, 'tools'))
    .filter((name) => name.startsWith('validate-') && name.endsWith('.js'))
    .length;
  if (validatorCount === 0) {
    errors.push('No IDD validators are bundled under tools/');
  } else {
    info.push(`Bundled ${validatorCount} IDD validators`);
  }
}

const pkg = readJson(PACKAGE_PATH, 'package.json');
if (pkg) {
  validateClaudeManifest(pkg);
  validateCodexManifest(pkg);
}
validateMarketplace();
validateTooling();

const result = {
  ok: errors.length === 0,
  errors,
  warnings,
  info,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const line of info) console.log(`INFO: ${line}`);
  for (const line of warnings) console.warn(`WARN: ${line}`);
  for (const line of errors) console.error(`ERROR: ${line}`);
  console.log(result.ok ? 'Plugin manifest validation passed.' : 'Plugin manifest validation failed.');
}

process.exit(result.ok ? 0 : 1);
