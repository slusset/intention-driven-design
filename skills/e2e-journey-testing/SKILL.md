---
name: e2e-journey-testing
description: "End-to-end journey verification. Use when creating or updating a journey map and the executable check that proves a user journey works. Consumes journeys from specs/, produces journey maps plus tests in whatever runner the repository already uses."
license: MIT
argument-hint: "[journey-name]"
allowed-tools: Read Write Glob Grep
---

# Journey Testing

## Purpose

Turn a user journey into an executable end-to-end check. The journey map is the
stack-neutral bridge: it names the steps, the actions that drive them, and the
assertions that prove them. The runner, the paths, and the driving mechanism
belong to the repository, not to this skill.

## Resolve the runner first

1. Read the repo overlay (`specs/skills/repo-overlay.md`) and take the
   framework-specific test binding, the e2e command, and the required test
   libraries from it.
2. If the overlay binds a skill for this area, that skill implements the test.
   This skill still owns the journey map, the step coverage, and traceability.
3. If nothing is bound, follow what the repository already does: its existing
   test directory, runner, and commands.
4. Never introduce a new runner, a new directory convention, a frontend
   directory, or an external service that the repository does not already have.
5. Report what you selected and where the choice came from.

## Workflow

1. Locate the journey narrative in `specs/journeys/`.
2. Locate or create the journey map in `specs/journey-maps/`.
3. Pick the action and assertion vocabulary matching the journey's surface
   (see the table below).
4. Implement the check with the resolved runner: one spec per journey, one test
   per journey step, substeps inside the step's test.
5. Cover every step and every assertion the map declares.
6. Add the traceability header, and bind each test's literal name as evidence
   for the rule it exercises.

## Journey surfaces

| Surface | Typical actions | Typical assertions | Reference |
|---|---|---|---|
| Browser UI | `navigate`, `click`, `fill`, `select` | `visible`, `text`, `url`, `count` | [browser-journeys.md](references/browser-journeys.md) |
| Executable or CLI | `installed-cli`, `installed-executable`, `npm-global-install` | `required-content`, `forbidden-content`, `package-installed` | [cli-and-protocol-journeys.md](references/cli-and-protocol-journeys.md) |
| Service or protocol | `api`, `installed-mcp`, `harness-integration` | `api`, `lifecycle`, `authority` | [cli-and-protocol-journeys.md](references/cli-and-protocol-journeys.md) |

The vocabulary is open: when no named action or assertion fits, write the
expanded `kind`/`property`/`target` form. The grammar, including the full
structure of a map, is in
[journey-map-grammar.md](references/journey-map-grammar.md).

## Journey map skeleton

```yaml
# specs/journey-maps/{journey-name}.map.yaml
id: {journey-name}
type: journey-map
journey: {journey-name}
sources:
  journey: specs/journeys/{journey-name}.md
  stories:
    - specs/stories/{area}/{story}.md
preconditions:
  auth: {persona-type | none}
  state: {what must be true before step 1}
steps:
  {step-id}:
    journey_step: {number}
    title: "{step title}"
    actions:
      - type: {action}
        target: "{selector, command, or endpoint}"
    assertions:
      - type: {assertion}
        target: "{what is checked}"
        description: "{the claim in words}"
fixtures:
  {name}:
    ref: specs/fixtures/{path}.json
```

## Traceability requirements

- The map references the journey and every story it covers.
- The test header references the journey, the map, the stories, and the
  features it exercises.
- Fixtures come from `specs/` and cite their source.
- Each test's literal name appears in the capability's verification map under
  the rule it proves (`current_evidence.bindings[].selectors`).

## Guardrails

- One map per journey; one test per journey step.
- Tests are independent and repeatable — no reliance on another test's state.
- Fixtures come from `specs/`; test data is never duplicated inline.
- Assertions check declared behavior — a rule, a contract, a journey promise —
  not implementation detail.
- No sleeps. Wait on an observable condition: a response, a state, a file, an
  exit status.
- Clean up whatever the test created.
- Stay inside the repository's stack and directory conventions.

## Validation checklist

Before merging:

- [ ] Every journey step has a corresponding test
- [ ] Every assertion in the map is implemented
- [ ] Fixtures load from `specs/` and are not duplicated
- [ ] No hardcoded test data
- [ ] Tests pass independently, in any order, and in CI
- [ ] Test names are bound as evidence in the verification map
- [ ] The traceability header names journey, map, stories, and features

## Handoff

`/certification` collects the results as evidence for the capability. A journey
test that no rule cites still runs, but the certification report cannot count
it.
