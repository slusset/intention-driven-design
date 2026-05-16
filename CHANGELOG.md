# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-16

The language-theoretic schema effort ([#24](https://github.com/slusset/intention-driven-design/issues/24)) lands as 1.0. The IDD specification format now has a single normative source, closed-world key validation, kinded vocabularies, declarative artifact shapes, and two cross-document obligations that JSON Schema cannot express. Schema registry at **v1.5.0**; toolkit and plugin promoted to **1.0.0**.

### Added — schema effort ([#24](https://github.com/slusset/intention-driven-design/issues/24))

- **`schemas/v1/`** — nine JSON Schemas (Draft 2020-12) under stable `$id` URLs at `github.com/slusset/intention-driven-design/schemas/v1/`, indexed by `schemas/v1/index.json`. One schema per artifact kind: persona, journey, story, feature, model, lifecycle, journey-map, capability, fixture. ([#43](https://github.com/slusset/intention-driven-design/pull/43))
- **`tools/lib/schema-loader.js`** — centralized ajv loader with `getValidator(kind)` + `categorize()` for severity-based error reporting.
- **`SCHEMA.md`** — entry point for downstream adopters: artifact set, dialect, version policy, extension model, kinded grammars, declarative shapes, reference graph, enforcement bindings, consumer integration (HTTP fetch / npm / yaml-language-server).
- **Closed-world keys + `$conformance` tiers** — every enumerated object level rejects unknown properties. `$conformance: canonical | legacy-compatible | experimental` is reserved at every level. Unknown keys are warnings by default, demoted to info when tagged experimental. ([#44](https://github.com/slusset/intention-driven-design/pull/44))
- **Kinded grammars** — relationships, actions, and assertions express a `kind` plus attributes. Legacy enum values remain valid as named combinations the validator expands. New kinds include `pointer` + `temporality: pinned`, `cookie`, `classification`, `tag`, `context`. The authoritative registry is `tools/lib/kinds.js`. ([#45](https://github.com/slusset/intention-driven-design/pull/45))
- **Declarative shapes** — lifecycles declare `bounded | unbounded | absorbing | cyclic`; journey maps declare `sequential | branching | hierarchical`. The author tells the validator what kind of artifact this is; the validator applies the matching rule set. ([#46](https://github.com/slusset/intention-driven-design/pull/46))
- **`tools/lib/reference-graph.js`** + **`tools/validate-capability-closure.js`** — cross-document validator that computes the transitive closure of artifacts reachable from a capability's scope and warns when something is reachable but not declared, or declared but unreferenced (narrative tier only). `scope.excluded` names cross-capability shares explicitly. ([#47](https://github.com/slusset/intention-driven-design/pull/47))
- **`tools/lib/enforcement-bindings.js`** + **`tools/validate-enforcement-bindings.js`** — model rule `enforced:` fields now accept three forms: narrative string (legacy), `{ pending: "tracker" }` (in-flight), or array of `{ kind, binding }` (verifiable). Bindings resolve to real SQL constraints, OpenAPI fragments, Markdown invariant headings, Gherkin scenarios, or named tests. ([#48](https://github.com/slusset/intention-driven-design/pull/48))
- **`tests/schemas/`** — 75 schema-effort tests covering conformance, closed-world, kinded grammars, shapes, closure, and enforcement bindings. `specs/` examples double as conformance fixtures auto-discovered by the suite.

### Added — methodology

- **Agent role extension** — `docs/idd/agent-role.md` defines a bounded execution contract for delegated and multi-agent work (responsibility, inputs, allowed decisions, outputs, handoff). Reusable template at `docs/idd/templates/agent-role-contract.yaml`. Integrated into `idd-workflow` and `pr-review` skills. ([#42](https://github.com/slusset/intention-driven-design/pull/42))
- **Methodology change process** — `docs/idd/methodology-change-process.md` with explicit exploratory → provisional → canonical states and an improvement-proposal template. The same vocabulary now drives the schema's `$conformance` tiers. ([#42](https://github.com/slusset/intention-driven-design/pull/42))
- **Self-evolving ecosystem note** — `docs/idd/self-evolving-ecosystem.md` describing the three-layer model (seed structure / runtime / adaptive substrate).

### Added — packaging

- `.claude-plugin/marketplace.json` — local marketplace descriptor so the repo can be installed in Claude Code via `/plugin marketplace add` + `/plugin install idd-skills@idd`.
- `justfile` — wraps common local flows (`just install`, `just validate`, `just test`, `just install-skills`, lint tasks).

### Changed

- Skills invoke bundled validators via `${CLAUDE_PLUGIN_ROOT}/tools/validate-*.js`, making the plugin self-contained. `npx idd validate` remains available for CI and non-plugin contexts via the sibling `idd-toolkit` npm package.
- README installation section leads with the plugin install path; npm install is documented as the CI/dev alternative.
- Existing per-document validators (`validate-models`, `validate-journey-maps`, `validate-capability-scope`, `validate-fixtures`) now run their schema before applying imperative checks. Schema errors surface as `schema: …` lines; behavior is strictly additive in 1.0.

### Removed

- `tools/check-capability-scope.js`, `tools/check-front-matter.js`, `tools/check-traceability.js` — deprecated compatibility wrappers; use `validate-*` directly.
- `tools/link-skills.sh` — superseded by `idd install-skills --link`.
- `tools/build.sh` — plugin-zip build script; distribution is now directly via the plugin marketplace against a git checkout.
- `.github/workflows/release-claude-plugin.yml` — no longer builds a plugin zip release.
- `tools/package.json`, `tools/package-lock.json` — redundant private sub-package; root `idd-toolkit` owns dependencies.
- `WORKFLOW.md` — Symphony-orchestration experiment, no longer reflects repo workflow.

### Fixed

- `validate fixtures`: nested `$ref` composition in `components.schemas` (e.g. `allOf: [{ $ref: '#/components/schemas/Base' }, ...]`) now resolves correctly in both the legacy `_meta.schema` path and the OpenAPI `method/path` path. The fix pre-registers every `components.schemas.*` entry with its canonical `#/components/schemas/<Name>` as `$id` so Ajv can resolve nested references at compile time. Regression test in `test/fixture-ref-resolution.test.js`.

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

