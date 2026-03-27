# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Deprecated

- `tools/link-skills.sh` — use `idd install-skills` instead
- `tools/build.sh` — use `npm pack` instead
