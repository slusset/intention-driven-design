#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const { createModule, linkModule, statusModules } = require('../tools/lib/module-scaffold');
const { SEVERITIES, filterReport, formatDoctorReport, runDoctor } = require('../tools/lib/doctor');
const { applyMigrationPlan, buildMigrationPlan, formatApplyResult } = require('../tools/lib/evolution');
const { toolCommand } = require('../tools/lib/tool-runner');
const { findToolkitRoot } = require('../tools/lib/toolkit-root');

// The CLI runs from the source tree, an npm install, or the self-contained
// dist/ bundle inside a plugin cache, so the toolkit root that holds
// package.json, skills/, and schemas/ is resolved at runtime.
const PACKAGE_ROOT = findToolkitRoot(__dirname) || path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PACKAGE_ROOT, 'skills');
const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));

// ── Subcommand dispatch ──────────────────────────────────────────────

const commands = {
  validate: cmdValidate,
  'install-skills': cmdInstallSkills,
  'generate-evidence': cmdGenerateEvidence,
  init: cmdInit,
  module: cmdModule,
  doctor: cmdDoctor,
  version: cmdVersion,
  help: cmdHelp,
  __tool: cmdTool,
};

// ── __tool (internal) ───────────────────────────────────────────────
// Hidden dispatch that lets the self-contained bundle re-enter itself as a
// child process to run an inlined tool script. Static requires keep every
// tool inside the bundle; in the source tree the same requires load the
// scripts from tools/.

const BUNDLED_TOOLS = {
  'validate-modules': () => require('../tools/validate-modules.js'),
  'validate-verification': () => require('../tools/validate-verification.js'),
  'validate-contracts': () => require('../tools/validate-contracts.js'),
  'validate-traceability': () => require('../tools/validate-traceability.js'),
  'validate-front-matter': () => require('../tools/validate-front-matter.js'),
  'validate-capability-scope': () => require('../tools/validate-capability-scope.js'),
  'validate-capability-closure': () => require('../tools/validate-capability-closure.js'),
  'validate-fixtures': () => require('../tools/validate-fixtures.js'),
  'validate-models': () => require('../tools/validate-models.js'),
  'validate-enforcement-bindings': () => require('../tools/validate-enforcement-bindings.js'),
  'validate-journey-maps': () => require('../tools/validate-journey-maps.js'),
  'validate-evidence': () => require('../tools/validate-evidence.js'),
  'generate-evidence': () => require('../tools/generate-evidence.js'),
};

function cmdTool(argv) {
  const name = argv[0];
  const load = BUNDLED_TOOLS[name];
  if (!load) {
    console.error(`Unknown tool: ${name || '(none)'}`);
    process.exit(1);
  }
  // Tool scripts read process.argv.slice(2) at require time.
  process.argv = [process.argv[0], name, ...argv.slice(1)];
  load();
}

const args = process.argv.slice(2);
const subcommand = args[0] || 'help';

if (commands[subcommand]) {
  commands[subcommand](args.slice(1));
} else {
  console.error(`Unknown command: ${subcommand}\n`);
  cmdHelp();
  process.exit(1);
}

// ── doctor ──────────────────────────────────────────────────────────

function cmdDoctor(argv) {
  const operation = argv[0] === 'plan' || argv[0] === 'apply' ? argv[0] : null;
  const rest = operation ? argv.slice(1) : argv;

  let repoRoot = process.cwd();
  let json = false;
  let out = null;
  let planPath = null;
  let verbose = false;
  let summary = false;
  const severities = [];
  const accept = [];
  const valueOptions = { '--repo': 'repo', '--out': 'out', '--plan': 'plan', '--accept': 'accept', '--severity': 'severity' };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--json') json = true;
    else if (rest[i] === '--verbose') verbose = true;
    else if (rest[i] === '--summary') summary = true;
    else if (valueOptions[rest[i]]) {
      if (!rest[i + 1] || rest[i + 1].startsWith('--')) {
        console.error(`${rest[i]} requires a value`);
        process.exit(1);
      }
      const value = rest[++i];
      if (rest[i - 1] === '--repo') repoRoot = path.resolve(value);
      else if (rest[i - 1] === '--out') out = path.resolve(value);
      else if (rest[i - 1] === '--plan') planPath = path.resolve(value);
      else if (rest[i - 1] === '--severity') {
        for (const level of value.split(',')) {
          if (!SEVERITIES.includes(level)) {
            console.error(`--severity must be one of ${SEVERITIES.join(', ')} (comma-separated); got ${level}`);
            process.exit(1);
          }
          severities.push(level);
        }
      } else accept.push(value);
    } else {
      console.error(`Unknown doctor option: ${rest[i]}`);
      process.exit(1);
    }
  }

  if (operation === 'plan') {
    const { plan } = buildMigrationPlan({ repoRoot });
    const output = `${JSON.stringify(plan, null, 2)}\n`;
    if (out) {
      fs.writeFileSync(out, output);
      console.log(`Wrote migration plan to ${out}`);
      if (plan.acceptance_required.length > 0) {
        console.log(`Apply requires: ${plan.acceptance_required.map((id) => `--accept ${id}`).join(' ')}`);
      }
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (operation === 'apply') {
    if (!planPath) {
      console.error('Usage: idd doctor apply --plan <file> [--accept <migration-id>...] [--repo <dir>] [--json]');
      process.exit(1);
    }
    const result = applyMigrationPlan({ repoRoot, planPath, accept });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatApplyResult(result));
    process.exit(result.status === 'applied' ? 0 : 1);
  }

  const report = filterReport(runDoctor({ repoRoot }), severities);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatDoctorReport(report, { verbose, summary }));
}

// ── module scaffolding ─────────────────────────────────────────────

function cmdModule(argv) {
  const operation = argv[0];
  if (!operation || operation === 'help') {
    console.log(`Usage:
  idd module create <name> [--root <path>] [--capability <name>] [--description <text>] [--repo <dir>] [--dry-run] [--json]
  idd module link <name> [--depends-on <module>] [--capability <name>] [--contract <path>] [--update] [--repo <dir>] [--dry-run] [--json]
  idd module status [--repo <dir>] [--json]

Creation writes a capability stub, module-owned spec directories, a verification-map template, and one modules.yaml entry.
Linking changes only explicit module dependencies or a selected verification map's contract_pins entry.
Existing specs are never moved or overwritten.`);
    return;
  }

  const positionals = [];
  const options = { dryRun: false, json: false, update: false };
  const valueOptions = new Set(['--root', '--capability', '--description', '--repo', '--depends-on', '--contract']);
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--update') options.update = true;
    else if (valueOptions.has(arg)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        console.error(`${arg} requires a value`);
        process.exit(1);
      }
      const parsedKey = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const key = parsedKey === 'repo' ? 'repoRoot' : parsedKey === 'dependsOn' ? 'dependency' : parsedKey;
      options[key] = argv[++i];
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else positionals.push(arg);
  }

  if (operation === 'create') {
    options.name = positionals[0];
    if (!options.name || positionals.length > 1) {
      console.error('Usage: idd module create <name> [options]');
      process.exit(1);
    }
    outputModuleResult(createModule(options), options.json, options.dryRun);
  } else if (operation === 'link') {
    options.name = positionals[0];
    if (!options.name || positionals.length > 1) {
      console.error('Usage: idd module link <name> [options]');
      process.exit(1);
    }
    outputModuleResult(linkModule(options), options.json, options.dryRun);
  } else if (operation === 'status') {
    if (positionals.length > 0 || options.update || options.dryRun) {
      console.error('Usage: idd module status [--repo <dir>] [--json]');
      process.exit(1);
    }
    const result = statusModules(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Module roots: ${result.roots.join(', ') || '(none)'}`);
      for (const module of result.modules) {
        console.log(`- ${module.name} (${module.root})`);
        console.log(`  capabilities: ${module.capabilities.join(', ') || '(none)'}`);
        console.log(`  depends_on: ${module.depends_on.join(', ') || '(none)'}`);
        console.log(`  verification: ${module.verification_maps.join(', ') || '(none)'}`);
      }
    }
    if (result.errors.length > 0) process.exit(1);
  } else {
    console.error(`Unknown module operation: ${operation}`);
    process.exit(1);
  }
}

function outputModuleResult(result, json, dryRun) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    if (result.errors.length > 0) console.error(result.errors.map((error) => `ERROR: ${error}`).join('\n'));
    for (const warning of result.warnings || []) console.warn(`WARN: ${warning}`);
    for (const action of result.actions || []) console.log(`${dryRun ? 'WOULD ' : ''}${action.action}: ${action.path}${action.detail ? ` — ${action.detail}` : ''}`);
    if (result.errors.length === 0 && (!result.actions || result.actions.length === 0)) console.log('No changes needed.');
  }
  if (result.errors.length > 0) process.exit(1);
}

// ── validate ─────────────────────────────────────────────────────────

function cmdValidate(argv) {
  const VALIDATORS = {
    modules: 'validate-modules',
    verification: 'validate-verification',
    contracts: 'validate-contracts',
    traceability: 'validate-traceability',
    'front-matter': 'validate-front-matter',
    'capability-scope': 'validate-capability-scope',
    'capability-closure': 'validate-capability-closure',
    fixtures: 'validate-fixtures',
    models: 'validate-models',
    'enforcement-bindings': 'validate-enforcement-bindings',
    'journey-maps': 'validate-journey-maps',
    evidence: 'validate-evidence',
  };

  // Separate check names from pass-through flags
  const checks = [];
  const passthrough = [];
  let parsingChecks = true;

  for (const arg of argv) {
    if (parsingChecks && !arg.startsWith('-') && (VALIDATORS[arg] || arg === 'all')) {
      checks.push(arg);
    } else {
      parsingChecks = false;
      passthrough.push(arg);
    }
  }

  if (checks.length === 0 && passthrough.length === 0) {
    console.log('Available validators:');
    for (const name of Object.keys(VALIDATORS)) {
      console.log(`  ${name}`);
    }
    console.log('\nUsage: idd validate <check...> [--json] [--files ...] [--strict]');
    console.log('       idd validate all [--json]');
    return;
  }

  // "all" expands to every validator except evidence (which needs --evidence flag)
  const toRun =
    checks.includes('all')
      ? Object.keys(VALIDATORS).filter((k) => k !== 'evidence')
      : checks;

  if (toRun.length === 0) {
    // No named checks — just pass everything through to the first validator
    // This handles `idd validate --evidence path --json` etc.
    runValidator(toolCommand(VALIDATORS.evidence), passthrough);
    return;
  }

  let failures = 0;

  for (const check of toRun) {
    const command = toolCommand(VALIDATORS[check]);
    if (!command) {
      console.error(`Validator not found: ${VALIDATORS[check]}`);
      failures++;
      continue;
    }

    if (toRun.length > 1) {
      console.log(`\n--- ${check} ---`);
    }

    const exitCode = runValidator(command, passthrough);
    if (exitCode !== 0) failures++;
  }

  if (toRun.length > 1) {
    console.log(`\n${toRun.length - failures}/${toRun.length} checks passed.`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

function runValidator(command, argv) {
  if (!command) {
    console.error('Validator not found');
    return 1;
  }
  try {
    execFileSync(process.execPath, [...command, ...argv], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    return 0;
  } catch (err) {
    return err.status || 1;
  }
}

// ── install-skills ───────────────────────────────────────────────────

function cmdInstallSkills(argv) {
  const AGENT_DIRS = {
    claude: path.join(homeDir(), '.claude', 'skills'),
    codex: path.join(homeDir(), '.codex', 'skills'),
  };

  let target = null;
  let useLink = false;
  let checkOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--link') useLink = true;
    else if (arg === '--check') checkOnly = true;
    else if (['claude', 'codex', 'all'].includes(arg)) target = arg;
    else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  if (!target) {
    console.log('Usage: idd install-skills <claude|codex|all> [--link] [--check]');
    console.log('\nOptions:');
    console.log('  --link            Symlink instead of copy (for development)');
    console.log('  --check           Check if installed skills are up to date (no changes made)');
    return;
  }

  // --check mode: compare installed version marker against current package version
  if (checkOnly) {
    const targets = target === 'all' ? ['claude', 'codex'] : [target];
    let stale = false;
    for (const agent of targets) {
      const markerPath = path.join(AGENT_DIRS[agent], '.idd-skills-version');
      if (!fs.existsSync(markerPath)) {
        console.log(`${agent}: not installed`);
        stale = true;
        continue;
      }
      try {
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (marker.version !== pkg.version) {
          console.log(`${agent}: outdated (installed ${marker.version}, current ${pkg.version})`);
          stale = true;
        } else {
          console.log(`${agent}: up to date (${marker.version})`);
        }
      } catch (err) {
        console.log(`${agent}: corrupt marker file`);
        stale = true;
      }
    }
    process.exit(stale ? 1 : 0);
  }

  const targets = target === 'all' ? ['claude', 'codex'] : [target];

  // Collect source skill directories
  const sourceDirs = listSubdirs(SKILLS_DIR);

  for (const agent of targets) {
    const destRoot = AGENT_DIRS[agent];
    fs.mkdirSync(destRoot, { recursive: true });

    for (const src of sourceDirs) {
      const name = path.basename(src);
      const dest = path.join(destRoot, name);

      // Remove existing
      if (fs.lstatSync(dest, { throwIfNoEntry: false })) {
        fs.rmSync(dest, { recursive: true, force: true });
      }

      if (useLink) {
        fs.symlinkSync(src, dest, 'dir');
        console.log(`  ${dest} -> ${src}`);
      } else {
        copyDirSync(src, dest);
        console.log(`  ${dest} (copied)`);
      }
    }

    // Write version marker
    const marker = path.join(destRoot, '.idd-skills-version');
    fs.writeFileSync(marker, JSON.stringify({
      version: pkg.version,
      installedAt: new Date().toISOString(),
      method: useLink ? 'link' : 'copy',
      source: PACKAGE_ROOT,
    }, null, 2) + '\n');
    console.log(`  ${marker}`);
    console.log(`Installed to ${destRoot}`);

    if (agent === 'claude') {
      console.log('');
      console.log('Note: for Claude Code, the plugin install is now preferred over copied skills:');
      console.log('  /plugin marketplace add slusset/intention-driven-design');
      console.log('  /plugin install idd-skills@idd');
      console.log('Copied skills coexist with plugin skills under different names and can');
      console.log('double-trigger — remove the copies from ~/.claude/skills when switching.');
    }
  }
}

// ── generate-evidence ────────────────────────────────────────────────

function cmdGenerateEvidence(argv) {
  const exitCode = runValidator(toolCommand('generate-evidence'), argv);
  process.exit(exitCode);
}

// ── init ─────────────────────────────────────────────────────────────

function cmdInit(argv) {
  const targetDir = argv.find((a) => !a.startsWith('-')) || '.';
  const root = path.resolve(targetDir);

  const dirs = [
    'specs/personas',
    'specs/journeys',
    'specs/stories',
    'specs/features',
    'specs/contracts/openapi',
    'specs/contracts/asyncapi',
    'specs/contracts/json-rpc',
    'specs/fixtures',
    'specs/models',
    'specs/capabilities',
    'specs/skills',
  ];

  let created = 0;
  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      // Add .gitkeep so empty dirs are tracked
      fs.writeFileSync(path.join(full, '.gitkeep'), '');
      created++;
    }
  }

  // Evidence manifests are generated into .idd/evidence/ (CI report input),
  // never committed — keep the workspace out of version control.
  const gitignorePath = path.join(root, '.gitignore');
  const gitignoreEntry = '.idd/';
  const existingGitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';
  if (!existingGitignore.split(/\r?\n/).some((line) => line.trim() === gitignoreEntry)) {
    const separator = existingGitignore && !existingGitignore.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, `${existingGitignore}${separator}${gitignoreEntry}\n`);
    console.log(`  Added ${gitignoreEntry} to ${path.relative(root, gitignorePath) || '.gitignore'}`);
  }

  // Scaffold repo overlay template if missing
  const overlayPath = path.join(root, 'specs', 'skills', 'repo-overlay.md');
  if (!fs.existsSync(overlayPath)) {
    const templatePath = path.join(SKILLS_DIR, 'idd-workflow', 'templates', 'repo-overlay-template.md');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, overlayPath);
      console.log(`  Created ${path.relative(root, overlayPath)} (from template)`);
    }
  }

  // Scaffold GitHub Actions workflow if missing
  const workflowDir = path.join(root, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'idd-check.yml');
  if (!fs.existsSync(workflowPath)) {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, `name: IDD Compliance

on:
  pull_request:
    paths: ['specs/**', 'backend/src/**', 'frontend/src/**']
  push:
    branches: [main]
    paths: ['specs/**', 'backend/src/**', 'frontend/src/**']

permissions:
  contents: read
  pull-requests: write

jobs:
  validate:
    name: IDD Validation
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx idd validate all --json
`);
    console.log(`  Created ${path.relative(root, workflowPath)}`);
  }

  console.log(`Initialized IDD structure in ${root} (${created} directories created)`);
}

// ── version / help ───────────────────────────────────────────────────

function cmdVersion() {
  console.log(`idd-toolkit ${pkg.version}`);
}

function cmdHelp() {
  console.log(`idd-toolkit ${pkg.version}

Usage: idd <command> [options]

Commands:
  validate <check...>          Run IDD validators (or "all")
  install-skills <target>      Install skills to claude/codex/all
  generate-evidence            Generate certification evidence manifest
                               (into .idd/evidence/ — CI report input, not committed)
  init [dir]                   Scaffold IDD directory structure
  module create <name>         Scaffold a bounded-context module chain
  module link <name>           Add an explicit DAG edge or contract pin
  module status                Show declared modules and verification maps
  doctor                       Inspect migration alignment (report-only)
                               [--severity error,advisory,info] [--summary] [--verbose]
  doctor plan [--out <file>]   Generate a deterministic migration plan
  doctor apply --plan <file>   Apply an accepted plan (writes evolution evidence)
  version                      Print version
  help                         Show this help

Examples:
  idd validate all --json
  idd validate traceability front-matter --strict
  idd install-skills claude
  idd generate-evidence --capability specs/capabilities/foo.capability.yaml
  idd init .
  idd module create billing --root specs
  idd doctor --json
  idd doctor --repo ../consumer --severity error --summary
  idd doctor plan --repo ../consumer --out migration-plan.json
  idd doctor apply --plan migration-plan.json --accept adopt-consumer-contract --repo ../consumer
`);
}

// ── Utilities ────────────────────────────────────────────────────────

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || require('os').homedir();
}

function listSubdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name));
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === '.DS_Store') continue;
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
