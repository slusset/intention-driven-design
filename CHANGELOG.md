# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-05-17

Schema completeness pass driven by first contact with `slusset/edyoucate-ai`. Closed-world validation against the downstream repo surfaced 21 hard errors and 233 warnings — most were load-bearing IDD patterns the v1.0 schema simply didn't enumerate, not novel additions in the downstream repo. v1.1 promotes those patterns to canonical so downstream adopters don't have to tag them experimental.

After bumping to v1.1.0 in a downstream repo, errors drop to zero with no spec changes; remaining warnings are genuine migration signals (shape declarations, novel domain assertions, etc.) rather than schema gaps.

Schema registry: **1.5.0 → 1.6.0**. Toolkit/plugin: **1.0.0 → 1.1.0**.

### Fixed

- **`constraints` accepts both array and object form.** Array form (`constraints: [non-empty, immutable]`) was the only canonical shape in v1.0; object form (`constraints: { minLength: 2, maxLength: 200 }`) is widely used downstream and is strictly more expressive. Both are now first-class. This was the source of the 21 hard errors in the edyoucate-ai contact.

### Added — canonical keys on model documents

- `identity.{format, prefix, example, notes}` — ID format declaration (e.g., `prefixed-ulid` + `cust_` → `cust_01HZZ…`). Promoted from 25× downstream usage.
- `attribute.{immutable, default, ref, format, prefix, example, itemType, sensitive, minimum, maximum, see, properties}` — semantic and shape hints on attributes. `ref` lets an attribute reference a shared value-object model.
- Document root: `versioning`, `invariants`, `retires` — versioning policy, document-level invariants, retired-artifact declarations.
- Primitive value-object form: `value_type` (`string | object | number | boolean | …`), top-level `format`, top-level `constraints`, top-level `required` (array of property names for `value_type: object`), `validation`, `equality`, `example`. Allows `email-address.model.yaml` (string + format: email + maxLength) and `money.model.yaml` (object + required + properties + validation) to validate as first-class value objects.

### Added — canonical keys on lifecycle documents

- `sources.{reference, issues}` — additional source references.
- Document root `invariants` — lifecycle-level invariants.
- `transition.{guards, effects, api}` — preconditions, side effects, and the API operation that drives a transition.

### Added — canonical keys on capability documents

- Document root `retires` and `scope.retires` — declares artifacts retired from the capability. Closure validator ignores these on both sides, matching `excluded:` semantics.

### Added — canonical keys on journey-map documents

- Document root: `description`, `preconditions`, `state_diagram`, `landing_decision_table`.
- Step: `description` (on both step-array and step-object forms).
- Action: `url`, `description`. The action object is now **open-keyed** by design — per-kind property vocabulary is author-extensible (variant, capture, timeout, until, …).
- Assertion: `endpoint`, `expected_status`, `contains`, `pattern`, `name`, `description`. Like actions, assertions are now open-keyed.
- Step (both forms) is now open-keyed for the same reason — step-level vocabulary varies per project.

### Added — kinded grammar shorthands

`tools/lib/kinds.js` gains six domain-assertion named combinations: `cookie-set`, `cookie-present`, `cookie-max-age`, `principal-classification`, `lead-tag-present`, `intake-prefill-available`. The validator now expands the legacy short names and reports the kinded structure (`kind:cookie, property:set`, etc.) instead of warning that the type is unknown.

### Tests

`tests/schemas/v1.6-canonical-keys.test.js` (13 cases) regression-pins every newly-canonical key against its real-world shape. Full suite: **88/88**.

### Migration

Downstream repos pinning `idd-toolkit#v1.0.0` should bump to `#v1.1.0`. No spec changes required — all additions are additive and back-compat. The closed-world principle still applies; v1.1 just enumerates more canonical keys.

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

