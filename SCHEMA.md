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
| Modules | document | [`modules.schema.json`](schemas/v1/modules.schema.json) | `specs/modules.yaml` |
| Verification Map | document | [`verification-map.schema.json`](schemas/v1/verification-map.schema.json) | `*/verification/*/verification.yaml` |
| Consumer Contract | front-matter | [`consumer-contract.schema.json`](schemas/v1/consumer-contract.schema.json) | optional `idd_consumer` block in `specs/skills/repo-overlay.md` |
| Fixture | document | [`fixture.schema.json`](schemas/v1/fixture.schema.json) | `specs/fixtures/**/*.{fixture.yaml,json}` |

**Front-matter** schemas describe the YAML or comment header of a Markdown,
Gherkin, or JSON artifact. The body of these files is freeform narrative or
parsed by a separate grammar (Gherkin parser, JSON parser).

**Document** schemas describe the entire parsed YAML or JSON document.
Reusable embedded shapes are published separately when multiple artifacts or
tools need the same vocabulary. The four-claims object is
[`evidence-classification.schema.json`](schemas/v1/evidence-classification.schema.json),
and literal rule-to-file anchors use
[`evidence-binding.schema.json`](schemas/v1/evidence-binding.schema.json).
Cross-module contract consumption uses
[`contract-pin.schema.json`](schemas/v1/contract-pin.schema.json).
Consumer toolkit adoption uses
[`consumer-contract.schema.json`](schemas/v1/consumer-contract.schema.json).

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
| Module ownership and dependency DAG | `tools/validate-modules.js` | Exact capability assignment, unique rule-family ownership, declared roots, and acyclic dependencies |
| Verification-map relations | `tools/validate-verification.js` | Expected root-aware maps, module-DAG dependency direction, rule-family direction, source-model existence, and classification monotonicity |
| Evidence selectors and `x-rules` | `tools/validate-verification.js` | Literal selectors resolve in explicitly bound files; rule-to-contract references are reciprocal |
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

The current version is **`1.11.0`** (declared in
[`schemas/v1/index.json`](schemas/v1/index.json)). Closed-world key validation
with `$conformance` tiers landed in 1.1; kinded grammars for relationships,
actions, and assertions landed in 1.2; declarative lifecycle and journey-map
shapes landed in 1.3; the reference graph + capability-scope closure rule
landed in 1.4; enforcement bindings on model rules landed in 1.5; schema
completeness from downstream contact landed in 1.6 (constraints as array or
object; primitive value-objects; canonical IDs, immutable, ref, versioning,
invariants, retires, guards/effects/api on transitions, plus open-keyed
actions/assertions/steps for author-extensible per-kind vocabularies). The
module manifest landed in 1.7, adding exact capability-chain ownership,
explicit spec roots, unique rule-family ownership, and an acyclic module
dependency graph.

The module validator follows every
declared `root` when discovering capabilities, so relocating a chain cannot
silently remove it from module accounting. Verification maps and the reusable
four-claims classification landed in 1.8. The verification validator follows
the same roots, requires one map per module capability, constrains map
dependencies and rule-family citations to the transitive module DAG, and
prevents verification or certification claims from exceeding an explicitly
declared dependency. Literal evidence bindings and reciprocal contract
`x-rules` landed in 1.9. Cross-module contract digest pins landed in 1.10.
Consumer toolkit contract pins landed in 1.11.

When the major version increments, the new schemas are published under a new
directory (`schemas/v2/`) and the previous directory is retained for backward
compatibility for at least one minor release of `idd-toolkit`.

## Verification maps and four maturity claims (v1.8)

Every capability assigned by `specs/modules.yaml` has one expected map at
`<module-root>/verification/<capability-id>/verification.yaml`. The map owns:

- the capability's rule inventory and source-model links;
- explicit dependencies on other verification maps;
- planned and current evidence descriptions; and
- four independent maturity claims under the canonical
  `evidence.classification` key.

The four claims deliberately do not collapse into one status:

| Claim | v1 values | Meaning |
|---|---|---|
| Intent | `exploratory` | The intent is coherent but remains open to fix-forward change. |
| Verification | `not-verified`, `locally-verified`, `verified` | What executable checking has established and where. |
| Certification | `not-certified`, `locally-certified`, `certified` | What review and independent evidence have established. |
| Production | `not-ready`, `production-ready` | Whether operational, deployment, recovery, and security posture is explicit. |

Verification and certification are ordered for module-dependency
monotonicity. Production readiness remains independent: certification alone
never makes a capability production-ready. For migration from the two shapes
observed downstream, `evidence_plan.classification` remains accepted with a
warning; new maps use `evidence.classification`.

Rule entries require a stable ID and an explicit `source_models` list, which
may be empty when the absence of a model is deliberate. Evidence/formal-tool
payloads remain author-extensible because their vocabulary depends on the
verification method; the map's identity, rule references, dependency paths,
and maturity claims are the canonical closed contract.

## Literal evidence bindings and reciprocal contracts (v1.9)

Current evidence binds selectors to exact repository files or directories:

```yaml
current_evidence:
  bindings:
    - files:
        - tests/account-contract.test.js
      selectors:
        - rejects-unknown-account-fields
      match: literal
```

Each selector must occur literally in at least one file from its own binding.
Bindings do not accept regular expressions or semantic query languages in v1;
that keeps the check deterministic and makes every claimed anchor directly
inspectable. Missing paths, empty corpora, and phantom selectors are errors.

Rules may reference contracts through path-valued fields such as `contract` or
`contracts`. A referenced JSON Schema contract must expose a root `x-rules`
array containing the rule ID. OpenAPI, AsyncAPI, JSON-RPC, and other structured
contracts participate when they declare `x-rules`. The reverse is also
enforced: every ID in a contract's `x-rules` must appear as a rule entry in a
verification map discovered from `specs/modules.yaml`.

The downstream `selector`, `selectors`, and `integration_selectors` fields
remain legacy-compatible. The validator still resolves them against declared
evidence paths but emits one migration warning per map. Planned-evidence labels
are deliberately excluded: a plan is not proof that a file or selector exists.

## Cross-module contract digest pins (v1.10)

When a module consumes a contract owned by a dependency module, its
verification map records the exact contract identity:

```yaml
contract_pins:
  - contract: specs/contracts/context-instrument.schema.json
    canonicalization: jcs-sha256@1
    digest: sha256:27cceecaea2ed7ca67a45525d558eec7a29a76b74247a0a0f5abceff3c1724f7
```

The validator resolves the contract through declared capability scopes,
requires its owner to be in the consuming module's dependency DAG, parses the
JSON document, applies JCS key ordering, and recomputes the lowercase SHA-256
digest. A changed schema document therefore produces a red gate even when its
filename and module dependency are unchanged. Pins are deliberately limited
to JSON Schema documents in v1; YAML contract canonicalization and runtime
constant synchronization remain separate contracts.

## Consumer toolkit contract (v1.11)

A repository consuming the IDD Toolkit may record its accepted toolkit contract
in the front matter of `specs/skills/repo-overlay.md`:

```yaml
idd_consumer:
  schemaVersion: 1
  toolkit:
    version: 0.1.0-uat.1
    schema:
      version: 1.11.0
      digest: sha256:<JCS digest of schemas/v1/index.json>
    source:
      kind: github-tag
      ref: v0.1.0-uat.1
```

This record pins the toolkit adoption surface. It does not version the
consumer's own capabilities, module DAG, or verification maps. `idd doctor`
compares the record with the toolkit and schema registry it is running and
reports drift without applying a migration.

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

## Declarative shapes (v1.3)

Two artifact kinds previously had a fixed grammar baked into the validator —
lifecycles required a terminal state, journey maps required strictly increasing
`journey_step` numbers. Both rules are correct for the common case and misfire
on legitimate alternatives.

v1.3 makes the shape explicit. The author declares the kind of artifact, and
the validator applies the matching rule set. The default for each is the
previous rule, so existing files remain valid.

### Lifecycle shapes

`shape` is an optional top-level field on `.lifecycle.yaml`:

| Shape | Default rule | Use for |
|---|---|---|
| `bounded` (default) | at least one terminal state required | Order, Audit, Signup |
| `absorbing` | at least one terminal state required | Order (one reachable terminal) |
| `unbounded` | terminal state NOT required | Customer, TruthFile, BusinessAccount |
| `cyclic` | terminal state NOT required; transitions may return to initial | Subscription, Membership |

When `shape: unbounded` (or `cyclic`) is declared, the "Lifecycle should have at
least one terminal state" warning is silenced.

```yaml
id: truth-file-lifecycle
type: model
entity: TruthFile
shape: unbounded
initial_state: active
states:
  active:
    description: "The canonical record for the customer's full lifetime."
```

### Journey-map shapes

`shape` is an optional top-level field on `.journey-map.yaml`:

| Shape | Default rule | Use for |
|---|---|---|
| `sequential` (default) | strictly increasing `journey_step` | Linear flows |
| `branching` | duplicate `journey_step` numbers allowed when each step has a `branch:` key | Magic-link redemption (link vs code), retry alternates |
| `hierarchical` | sub-step notation (`3a`, `3b`) accepted in `journey_step` | Nested journeys |

Under `shape: branching`, each step at a shared step number declares which
branch it belongs to:

```yaml
shape: branching
steps:
  exchange-link:
    journey_step: 3
    branch: link-redeem
  exchange-code:
    journey_step: 3
    branch: code-redeem
```

The validator emits an INFO line summarizing each fan-out (`shape:branching —
journey_step 3 fans out across branches: link-redeem, code-redeem`) and warns
when a step under `shape: branching` is missing its `branch:` key.

### Why this inverts the relationship

The previous rules assumed one grammar and warned on everything else. The
shape selector inverts that: the author tells the validator what kind of
artifact this is, and the validator applies the matching rule set. That is
the load-bearing move — it replaces an assumed grammar with a chosen
grammar.

## Reference graph + capability closure (v1.4)

JSON Schema cannot express constraints that span more than one document. The
**reference graph** defines which front-matter and body conventions count as
references between artifacts, and the **capability closure rule** turns the
graph into a cross-document validation: every artifact reachable from a
capability's declared scope must itself be in scope, with `scope.excluded`
naming the exceptions.

### Reference graph

The authoritative extractor lives at
[`tools/lib/reference-graph.js`](tools/lib/reference-graph.js).

| Source artifact | Reference fields |
|---|---|
| Persona (`.md`) | `refs.*` (any string path under refs) |
| Journey (`.md`) | `refs.persona` |
| Story (`.md`) | `refs.journey`, `refs.persona` |
| Feature (`.feature`) | `# story:`, `# journey:`, `# contract:`, `# feature:` (Gherkin header) |
| Model (`.model.yaml`) | `sources.stories`, `sources.journeys`, `sources.features` |
| Lifecycle (`.lifecycle.yaml`) | `sources.stories`, `sources.journeys`, `sources.features` |
| Journey-map (`.journey-map.yaml`) | `sources.journey`, `sources.stories`, `sources.features`, `fixtures.*.ref` |
| Fixture (`.fixture.yaml` / `.json`) | `story`, `feature`, `contract` (string or `.ref`) |
| Contract (OpenAPI / AsyncAPI / JSON-RPC) | `x-story`, `x-feature`, `x-journey` extensions on any node |
| Capability (`.capability.yaml`) | Not walked as a source — its `scope` is the *declared* set the closure is compared against. |

Only paths under `specs/` or `examples/` count as references. Absolute and
external URLs are ignored.

### Closure rule

For each capability, the validator at
[`tools/validate-capability-closure.js`](tools/validate-capability-closure.js):

1. Walks the reference graph from the declared scope, accumulating every
   reachable artifact.
2. Compares the closure to the declared scope:
   - **Reachable but not declared** → WARNING. The author should add the
     artifact to scope, or list it under `scope.excluded` if owned by another
     capability.
   - **Declared but no incoming reference (narrative tier only)** → WARNING.
     Likely dead spec; otherwise add a reference somewhere in the closure.
3. Artifacts listed under `scope.excluded` are ignored on both sides — they
   are explicit cross-capability shares and are not pulled into the closure.

The "declared but unreachable" check applies only to the narrative tier
(personas, journeys, stories). The structured tier (features, models,
lifecycles, journey-maps, fixtures, contracts) often legitimately sits at
graph leaves with no inbound references, so warning on those would be noise.

### `excluded:` semantics

`scope.excluded` lists artifacts that the capability legitimately *references*
but does not *own* — typically shared models, shared personas, or contracts
declared by another capability. The closure walker treats excluded entries as
walls: they are not added to the closure and not pulled in transitively. The
inverse-scope check ignores them too.

```yaml
id: full-scan-fulfillment
type: capability
scope:
  stories: [specs/stories/fulfill-scan.story.md]
  models: [specs/models/scan.model.yaml]
  contracts: [specs/contracts/openapi/fulfillment.yaml]
  excluded:
    - specs/models/account.model.yaml          # owned by trade-show-signup
    - specs/personas/trade-show-prospect.persona.md
```

## Enforcement bindings on model rules (v1.5)

Model rules historically carried a narrative `enforced:` tag — `persistence`,
`validation`, `domain` — that told a reader *where* the rule was supposed to
be enforced. The tag didn't bind to anything checkable. v1.5 makes the
binding concrete.

### Three accepted forms

A rule's `enforced` field can take one of three forms:

```yaml
# 1. Narrative — legacy form, retained for back-compat. Not bound; cannot be verified.
rules:
  - id: one-canonical-per-customer
    description: "..."
    enforced: persistence

# 2. Pending — explicit acknowledgement that binding is in flight.
rules:
  - id: one-canonical-per-customer
    description: "..."
    enforced:
      pending: "issue #99"

# 3. Bound — array of concrete bindings the validator resolves.
rules:
  - id: one-canonical-per-customer
    description: "..."
    enforced:
      - kind: persistence
        binding: migrations/0042_truth_files.sql#unique_customer_id
      - kind: validation
        binding: specs/contracts/openapi/api.yaml#/components/schemas/TruthFile/required
```

### Binding kinds

| Kind | Resolves to |
|---|---|
| `validation` | OpenAPI / AsyncAPI / JSON-RPC schema fragment via JSON pointer; or a Gherkin `Scenario:` name; or a typed DTO declaration |
| `persistence` | DB migration file with a named CONSTRAINT / INDEX / TABLE / TYPE; or a typed DTO in the repository layer |
| `invariant` | Heading in `docs/invariants-in-production.md` (or wherever your invariants live) referenced by slug |
| `domain` | Unit test or BDD scenario referenced by name |

### Binding format

The `binding` string takes one of three shapes:

| Form | Resolves |
|---|---|
| `path#anchor` | File + anchor. Anchor resolution depends on file type: SQL identifier (case-insensitive substring against a `CONSTRAINT \| INDEX \| TABLE \| TYPE \| TRIGGER` token), JSON pointer in YAML/JSON, or heading slug in Markdown. |
| `path:label` | File + labeled entity. Resolves to a `Scenario:` / `Scenario Outline:` name in a `.feature` file, or a `test('…')` / `it('…')` name in a Node test file. |
| `path` | File existence only. |

Per-kind expectations are advisory — a `persistence` binding pointing at a
`.feature` file gets an advisory warning that the kind and file type look
mismatched, but the binding still resolves if the file is present.

### Validator behavior

[`tools/validate-enforcement-bindings.js`](tools/validate-enforcement-bindings.js):

| Rule form | Default | `--strict` |
|---|---|---|
| `enforced: <narrative-string>` | INFO | WARNING |
| `enforced: { pending: "..." }` | INFO with tracker | WARNING |
| `enforced: [{ kind, binding }, …]` — all resolve | INFO per binding | INFO per binding |
| `enforced: [{ kind, binding }, …]` — any unresolved | **ERROR** | ERROR |
| no `enforced` field | (silent) | (silent) |

The strict mode is meant for CI in downstream repos that want to forbid the
narrative form entirely. The default keeps existing models valid while
encouraging migration.

### CI rule for downstream repos

A PR that introduces a rule with `enforced:` should either bind it to a
concrete artifact or mark it `pending:` with a tracking issue. The validator
catches the binding case automatically; the `pending:` case is an explicit
signal in code review that the binding is in flight.

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
