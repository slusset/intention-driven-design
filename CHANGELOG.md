# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `.claude-plugin/marketplace.json` — local marketplace descriptor so the repo can be installed in Claude Code via `/plugin marketplace add` + `/plugin install idd-skills@idd`
- `justfile` — wraps common local flows (`just install`, `just validate`, `just test`, `just install-skills`, lint tasks)

### Changed

- Skills now invoke bundled validators via `${CLAUDE_PLUGIN_ROOT}/tools/validate-*.js`, making the plugin self-contained. `npx idd validate` remains available for CI and non-plugin contexts via the sibling `idd-toolkit` npm package.
- README installation section leads with the plugin install path; npm install is documented as the CI/dev alternative.

### Removed

- `tools/check-capability-scope.js`, `tools/check-front-matter.js`, `tools/check-traceability.js` — deprecated compatibility wrappers; use `validate-*` directly
- `tools/link-skills.sh` — superseded by `idd install-skills --link`
- `tools/build.sh` — plugin-zip build script; distribution is now directly via the plugin marketplace against a git checkout
- `.github/workflows/release-claude-plugin.yml` — no longer builds a plugin zip release
- `tools/package.json`, `tools/package-lock.json` — redundant private sub-package; root `idd-toolkit` owns dependencies
- `WORKFLOW.md` — Symphony-orchestration experiment, no longer reflects repo workflow

### Fixed

- `validate fixtures`: nested `$ref` composition in `components.schemas`
  (e.g. `allOf: [{ $ref: '#/components/schemas/Base' }, ...]`) now resolves
  correctly in both the legacy `_meta.schema` path and the OpenAPI
  `method/path` path. Previously the validator called `ajv.compile(schema)`
  in isolation and failed with `can't resolve reference from id #`
  whenever a named schema referenced a sibling component. The fix
  pre-registers every `components.schemas.*` entry with its canonical
  `#/components/schemas/<Name>` as `$id` so Ajv can resolve nested
  references at compile time. Added regression test
  `test/fixture-ref-resolution.test.js`.

## [0.1.0] - 2026-03-07

### Added

- `bin/idd.js` CLI entrypoint with subcommands: `validate`, `install-skills`, `generate-evidence`, `init`, `version`
- Root `package.json` making the repo installable as `idd-toolkit` via npm or git URL
- `idd validate all` runs all 6 core validators in a single command
- `idd install-skills <claude|codex|all>` copies versioned skills with `.idd-skills-version` marker
- `idd install-skills --check` detects outdated installations
- `idd init` scaffolds `specs/` directory structure and CI workflow for new projects
- `.github/actions/idd-check/` reusable composite GitHub Action for consuming repos

### Changed

- `.github/workflows/idd-check.yml` simplified from ~400 lines to use the reusable action

