# Front-Matter Specification

## Problem

IDD artifacts use five different reference conventions parsed five different ways:

| Artifact | Reference mechanism |
|----------|-------------------|
| Feature files | `# Story:` / `# Journey:` Gherkin comments |
| Contract operations | `x-story` / `x-feature` / `x-journey` extensions |
| Fixtures | `_meta.story` / `_meta.feature` JSON blocks |
| Journey maps | `sources.journey` / `sources.stories` YAML fields |
| Stories/journeys | `Journey:` / `Persona:` embedded in markdown prose |

This works for a single checker that knows all patterns, but every new tool — graph generation, evidence collection, CI integration, external agents — must re-learn each format. Markdown artifacts (personas, journeys, stories) have no structured metadata at all.

## Solution

Add optional YAML front-matter to every artifact type. Front-matter provides a uniform, machine-readable substrate without replacing the human-readable body.

### Design principles

1. **File paths remain canonical identifiers.** The `id` field is a slug matching the filename — it enables rename detection and stable references in non-file contexts, not a parallel identity system.
2. **Front-matter is additive.** Existing reference conventions (comment headers, OpenAPI extensions, `_meta` blocks) continue to work. Tools prefer front-matter when present and fall back to conventions.
3. **Typed links, not free-text.** The `refs` block uses named edges so tools can traverse the graph without heuristic parsing.
4. **Minimal by default.** Only `id` and `type` are required. Everything else is optional but recommended.

## Schema by artifact type

### Personas

```yaml
---
id: trade-show-prospect         # slug matching filename
type: persona
---
```

Personas are root nodes in the traceability chain — they have no upstream `refs`. Downstream links (which journeys reference this persona) are discovered by tools, not declared here.

### Journeys

```yaml
---
id: trade-show-signup
type: journey
refs:
  persona: specs/personas/trade-show-prospect.md
---
```

### Stories

```yaml
---
id: mobile-signup
type: story
refs:
  journey: specs/journeys/trade-show-signup.md
  persona: specs/personas/trade-show-prospect.md
  steps: [1, 2, 3]              # journey steps this story covers
---
```

### Models (YAML files)

Models already have structured YAML. Add `id` and `type` at the top level. The existing `sources` block maps to `refs`:

```yaml
# specs/models/{aggregate}/{entity}.model.yaml
id: audit
type: model
entity: Audit
aggregate: AuditAggregate

# existing sources block serves as refs
sources:
  stories:
    - specs/stories/audits/quick-start-audit.md
  journeys:
    - specs/journeys/trade-show-signup.md

# ... rest of model definition
```

No structural change needed — just add `id` and `type` fields.

### Features (Gherkin files)

Gherkin doesn't support YAML front-matter natively. Continue using comment headers, but standardize the format:

```gherkin
# id: mobile-signup
# type: feature
# story: specs/stories/onboarding/mobile-signup.md
# journey: specs/journeys/trade-show-signup.md
# contract: POST /api/accounts

@onboarding
Feature: Mobile Signup
  ...
```

The `id`, `type`, `story`, `journey`, `contract` comment headers are the feature-file equivalent of front-matter. Tools parse the `# key: value` block at the top of the file.

Features may declare multiple links with `stories` and `journeys` (schema
1.15). Lists accept YAML flow syntax or indented comment items:

```gherkin
# id: shared-signup
# type: feature
# stories:
#   - specs/stories/onboarding/mobile-signup.md
#   - specs/stories/audits/quick-start-audit.md
# journeys: [specs/journeys/trade-show-signup.md]
Feature: Shared signup
```

Leading blank lines and ordinary comments may separate headers. Parsing ends
at the first Gherkin token, including a tag; comments within scenarios do not
add metadata. Repeated singular headers remain supported. When singular and
plural forms coexist, their distinct values are combined; neither masks the
other. Malformed lists are parse errors. Empty lists do not satisfy a
recommended reference field. These rules apply to front-matter validation,
traceability, and reference-graph extraction ([#99](https://github.com/slusset/intention-driven-design/issues/99)).

### Fixtures (JSON files)

The existing `_meta` block serves as front-matter. Add `id` and `type`:

```json
{
  "_meta": {
    "id": "mobile-signup-happy-path",
    "type": "fixture",
    "story": "specs/stories/onboarding/mobile-signup.md",
    "feature": "specs/features/onboarding/mobile-signup.feature",
    "scenario": "Successful mobile signup"
  },
  "request": {},
  "response": {}
}
```

Fixtures may use `stories` and `scenarios` arrays instead of `story` and
`scenario`. JSON stores these in `_meta`; YAML supports top-level metadata
or `_meta`. Every story link is checked, including additional links alongside
a singular primary story. Scenario names remain labels; a scenario value that
is a spec path also contributes a reference-graph edge and is checked for
existence. The same singular/plural union and empty-list rules apply.

### Journey maps (YAML files)

Journey maps already have structured YAML. Add `id` and `type`:

```yaml
# specs/journey-maps/{journey-name}.map.yaml
id: trade-show-signup
type: journey-map

journey: trade-show-signup
sources:
  journey: specs/journeys/trade-show-signup.md
  stories:
    - specs/stories/onboarding/mobile-signup.md
  features:
    - specs/features/onboarding/mobile-signup.feature

# ... rest of map definition
```

### Capabilities

See [capability artifact specification](#relationship-to-capability-artifacts) below.

```yaml
# specs/capabilities/{name}.capability.yaml
id: trade-show-signup
type: capability
description: "Mobile signup and first audit at trade show"

scope:
  personas:
    - specs/personas/trade-show-prospect.md
  journeys:
    - specs/journeys/trade-show-signup.md
  stories:
    - specs/stories/onboarding/mobile-signup.md
    - specs/stories/audits/quick-start-audit.md
  features:
    - specs/features/onboarding/mobile-signup.feature
    - specs/features/audits/create-audit.feature
  models:
    - specs/models/account/account.model.yaml
    - specs/models/audit/audit.model.yaml
  contracts:
    - specs/contracts/openapi/api.yaml
```

## Valid types

```
persona | journey | story | model | feature | fixture | journey-map | capability
```

These correspond 1:1 to `specs/` subdirectories (with `capability` added).

## Link resolution

Tools resolve `refs` entries as relative paths from the project root:

```
refs:
  journey: specs/journeys/trade-show-signup.md
```

This resolves to `{project-root}/specs/journeys/trade-show-signup.md`. The target file must exist or the link is broken.

For list-valued refs (stories in a capability scope, sources in a model), each entry follows the same rule:

```
sources:
  stories:
    - specs/stories/onboarding/mobile-signup.md    # must exist
    - specs/stories/audits/quick-start-audit.md    # must exist
```

## Relationship to capability artifacts

Capabilities are the highest-level grouping artifact. They define the scope of what gets certified. The capability's `scope` block is the authoritative enumeration of which artifacts belong together, including OpenAPI, AsyncAPI, and JSON-RPC contracts. It replaces the inline `intent` block that previously lived only in the generated evidence manifest.

See `docs/idd/certification-guide.md` for how capabilities relate to certification.

## Migration path

1. **Document** (this spec): Define the schema. Done.
2. **Generate**: Skills start producing front-matter when creating new artifacts.
3. **Validate**: `validate-traceability.js` prefers front-matter when present, falls back to existing conventions.
4. **Backfill**: Optionally add front-matter to existing artifacts.
5. **Enforce**: Once adoption is high, make front-matter required for new artifacts.

There is no flag day. Both conventions coexist indefinitely. The checker just gets more reliable as front-matter coverage increases.

## Relationship to existing concepts

- **C2 (Models Are Artifacts)**: Front-matter makes artifact metadata machine-readable, not just human-readable.
- **C8 (Traceability Chain)**: Typed `refs` make chain links explicit and parseable.
- **C11 (Layered Artifact Spine)**: `type` field codifies which layer an artifact belongs to.
- **C15 (Capability as Certification Unit)**: Capability front-matter defines the certification boundary.
