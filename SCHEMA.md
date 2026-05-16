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
- **Minor** — additive changes: new canonical fields, promotion of
  `experimental` to `canonical`, new optional artifact kinds, new variants.
  Existing valid documents remain valid.
- **Major** — breaking changes: removed `canonical` fields, tightened
  constraints that invalidate previously valid documents, removed artifact
  kinds. Major bumps ship with a documented migration path.

The current version is **`1.2.0`** (declared in
[`schemas/v1/index.json`](schemas/v1/index.json)). Closed-world key validation
with `$conformance` tiers landed in 1.1; kinded grammars for relationships,
actions, and assertions landed in 1.2.

When the major version increments, the new schemas are published under a new
directory (`schemas/v2/`) and the previous directory is retained for backward
compatibility for at least one minor release of `idd-toolkit`.

## Closed-world keys and `$conformance` (v1.1)

Every structured-tier schema sets `additionalProperties: false` (or
`unevaluatedProperties: false` at the document root where variants
participate). An unknown key at any enumerated object level is reported by the
validator.

### Severity

The validator does not fail the build on unknown keys by default. It
*categorizes* each one against the document so that intent is observable:

| Author intent (carried on the value) | Severity | Validator output |
|---|---|---|
| `$conformance: canonical` (or known field, default) | — | Field is accepted; no message. |
| `$conformance: legacy-compatible` | warning | "unknown property X retained under $conformance:legacy-compatible" |
| `$conformance: experimental` | info | "unknown property X accepted under $conformance:experimental" |
| no marker | warning | "unknown property X (schema: …)" |

A `--strict` flag on each validator promotes warnings to errors.

### Tier vocabulary

| Tier | Methodology state | Meaning |
|---|---|---|
| `canonical` | canonical | Load-bearing. Downstream tools depend on this. |
| `legacy-compatible` | provisional | Retained for back-compat. Scheduled for retirement. |
| `experimental` | exploratory | Proposed extension. Warnings rather than errors. |

The tiers mirror the methodology-change-process states documented in
[`docs/idd/methodology-change-process.md`](docs/idd/methodology-change-process.md).

### Declaring an experimental field

Authors who need a field the schema does not yet enumerate can ship it with
explicit intent:

```yaml
attributes:
  profileDescription:
    type: string
    placeholder:
      $conformance: experimental
      $conformance-notes: "promotion tracked in issue X"
      value: "Chiropractor providing family and prenatal care..."
```

The validator emits an info line acknowledging the experimental field.
Reviewers see the extension explicitly; downstream tools can choose to honor
or ignore it.

### Promotion path

1. **Exploratory:** ship the field under `$conformance: experimental` with a
   tracking issue in `$conformance-notes`. The validator emits info, not
   warnings.
2. **Provisional:** open a PR that adds the field to the relevant schema with
   `$conformance: experimental` on the schema property itself. Validators stop
   emitting the unknown-property message; the experimental status persists.
3. **Canonical:** open a follow-up PR promoting the field to `$conformance:
   canonical`. This is a minor version bump.

### Reserved keys

`$conformance` and `$conformance-notes` are reserved at every object level and
are always accepted. They are metadata about the enclosing field, not part of
its payload.

## Kinded grammars (v1.2)

Three slots previously expressed as closed enums are now kinded — they declare
a `kind` and a set of attributes rather than collapsing a multi-attribute
concept into a single token. The legacy names remain valid as **named
combinations** that the validator expands. Authors can use either form; new
documents are encouraged to use the expanded form where the additional axes
are load-bearing.

The authoritative table lives at
[`tools/lib/kinds.js`](tools/lib/kinds.js).

### Relationships

Expanded form attributes:

- `kind`: `composition` | `association` | `aggregation` | `pointer`
- `cardinality`: `one-to-one` | `one-to-many` | `many-to-one` | `many-to-many`
- `temporality`: `live` | `pinned` | `snapshotted` | `versioned`
- `ownership`: `owned` | `not-owned`
- `required`: boolean

Named combinations:

| Legacy `type` | `kind` | `cardinality` | `ownership` |
|---|---|---|---|
| `belongs-to` | association | many-to-one | not-owned |
| `has-one` | composition | one-to-one | owned |
| `has-many` | composition | one-to-many | owned |
| `many-to-many` | association | many-to-many | not-owned |

The new `pointer` kind covers cases like a `Scan` referencing a specific
historical `TruthFileRevision` — neither owned by the scan nor live-tracking
the latest revision. With `temporality: pinned` the read-only-pinned semantics
are explicit:

```yaml
relationships:
  pinnedRevision:
    entity: TruthFileRevision
    kind: pointer
    cardinality: many-to-one
    temporality: pinned
```

### Journey-map actions

Expanded form attributes:

- `kind`: `ui-interaction` | `navigation` | `wait` | `network`
- `verb`: optional fine-grained verb (e.g., `double-click`)
- `target`, `value`: as before

Named combinations cover the Playwright vocabulary (`navigate`, `click`,
`fill`, `select`, `check`, `uncheck`, `wait`, `hover`, `scroll`, `press`,
`type`, `upload`). See `ACTION_COMBINATIONS` in
[`tools/lib/kinds.js`](tools/lib/kinds.js).

### Journey-map assertions

Expanded form attributes:

- `kind`: `dom` | `url` | `api` | `cookie` | `classification` | `tag` | `context`
- `property`: per-kind property name (e.g., `visibility`, `text`, `set`,
  `max-age`)
- `target`: selector / URL / endpoint / cookie name / classification name / …
- `expected`: as before
- `selector`: legacy alias for `target` on DOM kinds

Named combinations cover the legacy `visible | hidden | text | url | api |
count | polling | attribute | value | enabled | disabled` vocabulary. New
domain assertions like `kind: cookie, property: set, target: session-cookie`
or `kind: classification, target: principal-classification` are first-class
in v1.2.

### Validator behavior

When a slot carries a legacy `type`, the validator emits an INFO line showing
the expansion so the underlying grammar is observable:

```
specs/models/scan.model.yaml: Relationship "owner" type:belongs-to ⇒ kind:association, cardinality:many-to-one, ownership:not-owned
```

When a slot carries both a legacy `type` and expanded fields that disagree
with the named combination, the validator emits a WARNING listing each
conflict. When a slot carries an unrecognized `type` (and no `kind`), the
validator emits a WARNING suggesting either the known legacy names or the
expanded form.

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
