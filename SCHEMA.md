# IDD Schemas

The Intention-Driven Design specification format is published as a set of
machine-readable JSON Schemas under [`schemas/v1/`](schemas/v1/). Every
validator, certification check, documentation generator, IDE plugin, and AI
assistant that touches an IDD artifact should derive its understanding of the
format from these schemas.

The registry is [`schemas/v1/index.json`](schemas/v1/index.json). Each schema
declares a stable `$id` URL under
`https://github.com/slusset/intention-driven-design/schemas/v1/`.

## Dialect

All schemas use **JSON Schema Draft 2020-12**
(`https://json-schema.org/draft/2020-12/schema`).

## Artifact set (v1)

| Artifact | Kind | Schema | Applies to |
|---|---|---|---|
| Persona | front-matter | [`persona.schema.json`](schemas/v1/persona.schema.json) | `specs/personas/**/*.md` |
| Journey | front-matter | [`journey.schema.json`](schemas/v1/journey.schema.json) | `specs/journeys/**/*.md` |
| Story | front-matter | [`story.schema.json`](schemas/v1/story.schema.json) | `specs/stories/**/*.md` |
| Feature | front-matter | [`feature.schema.json`](schemas/v1/feature.schema.json) | `specs/features/**/*.feature` |
| Model | document | [`model.schema.json`](schemas/v1/model.schema.json) | `specs/models/**/*.model.yaml` |
| Lifecycle | document | [`lifecycle.schema.json`](schemas/v1/lifecycle.schema.json) | `specs/models/**/*.lifecycle.yaml` |
| Journey Map | document | [`journey-map.schema.json`](schemas/v1/journey-map.schema.json) | `specs/journey-maps/**/*.{journey-map,map}.yaml` |
| Capability | document | [`capability.schema.json`](schemas/v1/capability.schema.json) | `specs/capabilities/**/*.capability.yaml` |
| Fixture | document | [`fixture.schema.json`](schemas/v1/fixture.schema.json) | `specs/fixtures/**/*.{fixture.yaml,json}` |

**Front-matter** schemas describe the YAML or comment header of a Markdown,
Gherkin, or JSON artifact. The body of these files is freeform narrative or
parsed by a separate grammar (Gherkin parser, JSON parser).

**Document** schemas describe the entire parsed YAML or JSON document.

## What the schemas cover

The schemas express **per-document grammar**: types, required fields, enum
membership, nested structure, and reference relationships within a single
document. Validators consume the schema via
[`tools/lib/schema-loader.js`](tools/lib/schema-loader.js) and run it against
parsed artifact content before applying any remaining imperative checks.

## What the schemas do not cover

Constraints that span more than one document live in imperative checkers, not
in JSON Schema:

| Constraint | Checker | Notes |
|---|---|---|
| Traceability — every referenced file exists | `tools/validate-traceability.js` | Filesystem resolution |
| Capability scope coverage | `tools/validate-capability-scope.js` | Cross-file accounting |
| Fixture payload ↔ contract operation | `tools/validate-fixtures.js` (delegates to OpenAPI/AsyncAPI/JSON-RPC) | Multi-file payload validation |
| Evidence manifest references real outputs | `tools/validate-evidence.js` | Filesystem resolution |

Two future initiatives extend the cross-document layer:

- **#40 — reference closure as a capability-scope obligation.** A capability's
  declared scope is checked against the transitive closure of artifacts
  reachable from its journeys, stories, features, models, and contracts.
- **#41 — enforced rules bound to concrete enforcement points.** Each model
  rule with `enforced:` resolves to a real DB constraint, OpenAPI schema
  fragment, named invariant, or test scenario.

## Version policy

The schema set is versioned with semantic versioning:

- **Patch** — non-substantive changes (descriptions, examples, comments).
- **Minor** — additive changes: new fields, new optional artifact kinds, new
  variants. Existing valid documents remain valid.
- **Major** — breaking changes: removed fields, tightened constraints that
  invalidate previously valid documents, removed artifact kinds. Major bumps
  ship with a documented migration path.

The current version is **`1.0.0`** (declared in
[`schemas/v1/index.json`](schemas/v1/index.json)).

When the major version increments, the new schemas are published under a new
directory (`schemas/v2/`) and the previous directory is retained for backward
compatibility for at least one minor release of `idd-toolkit`.

## Extension model

Today schemas allow unknown keys by default. **Issue #37** introduces
closed-world key validation with a `$conformance` marker that tags each field
as `canonical`, `legacy-compatible`, or `experimental`. Until #37 lands,
extensions are silently accepted; once it lands, every key must be enumerated
in the schema and tagged with a conformance tier.

The change-process states for the schemas mirror the methodology-change-process
states in [`docs/idd/methodology-change-process.md`](docs/idd/methodology-change-process.md):

| Schema tier | Methodology state | Meaning |
|---|---|---|
| `canonical` | canonical | Load-bearing. Downstream tools depend on this. |
| `legacy-compatible` | provisional | Retained for back-compat. Scheduled for retirement. |
| `experimental` | exploratory | Proposed extension. Warnings rather than errors. |

## Conformance fixtures

The artifacts under [`specs/`](specs/) double as the schema test suite. Every
file in `specs/` must validate against its corresponding schema. The test that
enforces this is
[`tests/schemas/conformance.test.js`](tests/schemas/conformance.test.js); it
runs as part of `npm test`.

When you add a new spec example, no additional registration is required —
the test discovers it via the directory layout and looks up the right schema
in the registry.

## Adding a new artifact kind

1. Draft the schema under `schemas/v1/<kind>.schema.json` with a stable `$id`.
2. Add a registry entry under `schemas/v1/index.json#/artifacts/<kind>`.
3. Add a conformance fixture under `specs/<plural>/` and confirm
   `npm test` passes.
4. If the artifact has a validator, load its schema via
   `getValidator('<kind>')` in `tools/lib/schema-loader.js`.
5. Bump the minor version in `schemas/v1/index.json#/version`.

## Consuming the schemas externally

Downstream tools resolve schemas by `$id`. Two convenient access patterns:

- **HTTP fetch** — `curl https://raw.githubusercontent.com/slusset/intention-driven-design/main/schemas/v1/<kind>.schema.json`
- **npm install** — `npm install idd-toolkit` ships the `schemas/` directory in
  its `files:` manifest entry. Schemas can be loaded from
  `node_modules/idd-toolkit/schemas/v1/`.

IDE integration: editors with `yaml-language-server` support can attach a
schema to a file via a comment at the top of the YAML file:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/slusset/intention-driven-design/main/schemas/v1/model.schema.json
```
