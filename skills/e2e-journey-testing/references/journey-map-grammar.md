# Journey Map Grammar

The journey map is the stack-neutral bridge between a journey narrative and an
executable check. `SCHEMA.md` in the toolkit is the authoritative grammar; this
reference is the working subset.

## Structure

```yaml
# specs/journey-maps/{journey-name}.map.yaml

id: {journey-name}
type: journey-map
journey: {journey-name}                  # matches the journey artifact
description: {what this journey proves}

sources:
  journey: specs/journeys/{journey-name}.md
  stories:
    - specs/stories/{area}/{story}.md
  features:
    - specs/features/{area}/{feature}.feature

preconditions:
  auth: {persona-type | none}
  state: {what must be true before step 1}

steps:
  {step-id}:                             # kebab-case
    journey_step: {number}               # position in the journey narrative
    title: "{step title}"                # matches the journey heading

    setup:                               # optional, per step
      - type: api
        method: POST
        endpoint: /resource
        body: "{{fixtures.resource}}"
        capture: resourceId              # available to later steps

    actions:                             # what the actor does
      - type: {named action}
        target: "{selector, command, or endpoint}"
        value: "{{fixtures.fieldValue}}"

    assertions:                          # what must then be true
      - type: {named assertion}
        target: "{what is being checked}"
        expected: {value}
        description: "{the claim in words}"

fixtures:
  {name}:
    ref: specs/fixtures/{path}.json      # preferred: reuse spec fixtures
  {name}:
    inline:
      field: value                       # only for trivial values

cleanup:                                 # optional teardown
  - type: api
    method: DELETE
    endpoint: "/resource/{{resourceId}}"
```

Steps may be a mapping keyed by step id, as above, or a list of `{id, story}`
entries when the journey is narrative-only and the assertions live in the test.

## Named forms and expanded forms

Every action and assertion can be written two ways. A **named** form is a
shorthand the validator expands:

```yaml
actions:
  - type: click
    target: "[data-testid='submit']"
```

An **expanded** form states the categorization directly, and is what to use
when no named form fits:

```yaml
actions:
  - kind: ui-interaction
    verb: click
    target: "[data-testid='submit']"
```

Action kinds: `ui-interaction`, `navigation`, `wait`, `network`, `cli`,
`install`, `mcp`, `harness`.

Assertion kinds: `dom`, `url`, `api`, `cookie`, `classification`, `tag`,
`context`, `lifecycle`, `authority`, `content`, `package`.

## Named vocabulary by surface

**Browser**: `navigate`, `click`, `fill`, `select`, `check`, `uncheck`, `hover`,
`scroll`, `press`, `type`, `upload`, `wait`; assertions `visible`, `hidden`,
`text`, `url`, `count`, `attribute`, `value`, `enabled`, `disabled`, `polling`,
`api`, and the `cookie-*` family.

**Executable and protocol**: `npm-global-install`, `npm-global-uninstall`,
`installed-executable`, `installed-cli`, `installed-mcp`,
`harness-integration`; assertions `required-content`, `forbidden-content`,
`package-installed`, `package-removal`, `principal-continuity`.

**Domain shorthands**: `principal-classification`, `lead-tag-present`,
`intake-prefill-available` — and any expanded `kind`/`property`/`target`
combination a domain needs. The vocabulary is open on purpose: a journey that
needs a new claim writes the expanded form rather than bending an unrelated
named one.

## Example: browser journey step

```yaml
steps:
  create-first-audit:
    journey_step: 3
    title: "Create the first audit"
    actions:
      - type: navigate
        url: "/audits/new"
      - type: fill
        target: "[data-testid='entity-name-input']"
        value: "{{fixtures.audit.create.entityName}}"
      - type: click
        target: "[data-testid='submit']"
    assertions:
      - type: url
        pattern: "/audits/[\\w-]+"
      - type: text
        selector: "[data-testid='audit-status']"
        contains: "pending"
      - type: api
        endpoint: "GET /audits/{{auditId}}"
        expected_status: 200
```

## Example: executable journey step

```yaml
steps:
  recover-after-loss:
    journey_step: 4
    title: "Recover from the exported archive"
    actions:
      - type: installed-cli
        commands: [import, verify]
    assertions:
      - kind: content
        property: required
        target: verify-output
        description: Verification reports the same head the export recorded.
      - kind: authority
        property: continuity
        target: principal
        description: The recovered store keeps the original identity.
```

## Validator behavior

A named form is reported as an informational expansion so the underlying
grammar stays observable. Unknown keys validate — the schemas are open-world —
but an unenumerated key is never checked, so prefer an expanded kinded form
over inventing a sibling key.
