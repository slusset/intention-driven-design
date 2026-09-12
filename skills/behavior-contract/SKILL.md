---
name: behavior-contract
description: "Convert solution narratives into BDD feature files and boundary contracts. Use when translating user stories into testable specifications and the contract for whatever boundary the capability crosses — HTTP, events, RPC, a command line, or a schema. Consumes output from the solution-narrative skill, produces artifacts consumed by implementation and verification."
license: MIT
argument-hint: "[feature-area or story]"
allowed-tools: Read Write Glob Grep
---

# Behavior Contract

## Purpose

Transform narrative artifacts into executable specifications and boundary
contracts. This is the bridge between "what" and "how."

## Workflow

1. Review the journey and story in `specs/journeys/` and `specs/stories/`.
2. Write Gherkin feature files capturing the behavior.
3. Identify which boundaries the story actually crosses — see
   [boundary-kinds.md](references/boundary-kinds.md). A capability with no HTTP
   surface needs no HTTP contract.
4. Define or update the contract document for each boundary.
5. Create fixtures for test data.
6. Finalize the capability scope by adding the relevant models, features, and
   contracts.
7. Update the capability's verification map: rule entries, reciprocal contract
   `x-rules`, and literal current-evidence bindings.
8. Ensure traceability: story → feature → contract → implementation.

## Artifact locations

```
specs/
├── features/
│   └── {feature-area}/
│       └── {feature-name}.feature
├── contracts/
│   ├── openapi/                   ← HTTP boundary
│   ├── asyncapi/                  ← event boundary
│   ├── json-rpc/                  ← RPC boundary
│   ├── cli/                       ← command-line boundary
│   └── *.schema.json              ← structures crossing module boundaries
├── fixtures/
│   └── {feature-area}/
│       └── {fixture-name}.json
└── verification/
    └── {capability}/
        └── verification.yaml      ← rule inventory + evidence bindings
```

## Domain model awareness

Before defining contract schemas, check `specs/models/`:

1. Does the entity exist? If not, model it first.
2. Are all attributes accounted for?
3. Do the business rules match the feature scenarios?
4. Is the lifecycle reflected in the status values the contract exposes?

When the model and the contract disagree, the model wins and the contract is
wrong.

## Feature file template

```gherkin
# specs/features/{area}/{name}.feature

# id: {feature-name}
# type: feature
# story: specs/stories/{area}/{story}.md
# journey: specs/journeys/{journey}.md
# contract: {operation or command}

@{feature-area}
Feature: {Feature Title}
  As a {persona}
  I want to {capability}
  So that {benefit}

  Background:
    Given I am {precondition shared by every scenario}

  @happy-path
  Scenario: {Success scenario name}
    Given {precondition}
    When {action}
    Then {expected outcome}

  @validation
  Scenario: {Validation scenario name}
    Given {precondition}
    When {action with invalid input}
    Then I receive a {error-type} error
    And the error indicates {reason}

  @edge-case
  Scenario Outline: {Parameterized scenario}
    Given {precondition}
    When {action with <parameter>}
    Then {outcome with <expected>}

    Examples:
      | parameter | expected |
      | value1    | result1  |
```

Every scenario traces to a story; every declared rule that governs the boundary
has a scenario that exercises it.

## Deriving operations from a journey

A journey's system responses become boundary operations: "the system shows X"
is a read, "the system creates X" is a create, "the system does Y to X" is an
action. Name them by the boundary's own conventions — an HTTP method and path,
an event name, an RPC method, a subcommand — using
[boundary-kinds.md](references/boundary-kinds.md) to pick the document and
[http-contracts.md](references/http-contracts.md) when the boundary is HTTP.

## Fixture template

```json
{
  "_meta": {
    "id": "{fixture-name}",
    "type": "fixture",
    "story": "specs/stories/{area}/{story}.md",
    "feature": "specs/features/{area}/{feature}.feature",
    "scenario": "{scenario name}"
  },
  "request": {},
  "response": {}
}
```

## Rules, contracts, and evidence

A rule is the join key between the model, the contract, and the proof. In the
verification map:

```yaml
- id: ACCT-1-cancel-account
  source_models: [specs/models/account.model.yaml]
  contracts: [specs/contracts/openapi/api.yaml]
  current_evidence:
    bindings:
      - files: [tests/account-contract.test.js]
        selectors: [cancel-completed-account-is-refused]
        match: literal
```

The contract reciprocates with a root-level `x-rules` entry naming
`ACCT-1-cancel-account`. A selector counts as evidence only when it appears
literally in one of its bound files. For a contract consumed from another
module, add a `contract_pins` entry with a `jcs-sha256@1` digest.

## Traceability requirements

- Feature files reference the source story, journey, and contract.
- Contract operations carry `x-story`, `x-feature`, and `x-journey`.
- A rule-bound contract exposes a root `x-rules` array naming every rule it
  implements, and every named rule exists in a verification map.
- Current-evidence selectors are literal anchors bound to exact files.
- Cross-module contract consumption records a `jcs-sha256@1` pin.
- Fixtures include a `_meta` block naming the story and scenario.

See [front-matter-spec.md](references/front-matter-spec.md) for the full metadata schema.

## Guardrails

- Every scenario traces to a story.
- Every boundary operation traces to a feature scenario.
- Scenarios test behavior, not implementation detail.
- The contract is the source of truth for the boundary's shape.
- Breaking contract changes require a version bump.
- Fixtures match the schemas exactly.
- Contract `x-rules` and verification-map rule references agree in both
  directions.
- Do not invent a boundary the journey does not cross.

## Validation checklist

Before handoff to implementation:

- [ ] All acceptance criteria have corresponding scenarios
- [ ] Scenarios cover the happy path and the key error cases
- [ ] Each boundary the journey crosses has exactly one contract document
- [ ] Schemas mark required fields and carry examples
- [ ] Fixtures match the schemas
- [ ] Rule-bound contracts name the same IDs through root-level `x-rules`
- [ ] Every current-evidence selector resolves in its bound files
- [ ] Cross-module contract references have a recomputable `contract_pins` entry
- [ ] No orphan operations and no orphan scenarios
- [ ] Errors are defined consistently across the boundary

## Handoff

- **Capability scope**: finalize `specs/capabilities/{name}.capability.yaml`
  with `scope.models`, `scope.features`, and `scope.contracts`.
- **Verification map**: add or update rule entries, reciprocal `x-rules`, and
  literal evidence bindings, then run `idd validate verification`.
- **Implementation**: the overlay-bound skill for each affected area, or the
  repository's architecture docs and a generic checklist when none is bound.
- **Journey checks**: `/e2e-journey-testing` for journey maps and their tests.
