---
name: behavior-contract
description: "Convert solution narratives into BDD feature files and protocol contracts. Use when translating user stories into testable specifications and API/event/RPC definitions. Consumes output from solution-narrative skill, produces artifacts consumed by architecture skills."
license: MIT
argument-hint: "[feature-area or story]"
allowed-tools: Read Write Glob Grep
---

# Behavior Contract

## Purpose

Transform narrative artifacts into executable specifications and API contracts. This is the bridge between "what" and "how."

## Workflow

1. Review journey and story from specs/journeys/ and specs/stories/.
2. Write Gherkin feature files capturing behavior.
3. Identify API touchpoints from journey system responses.
4. Define or update the appropriate OpenAPI, AsyncAPI, or JSON-RPC contract.
5. Create fixtures for test data.
6. Finalize the capability scope by adding the relevant models, features, and contracts.
7. Update the capability's verification map with rule-to-contract references and literal current-evidence bindings.
8. Ensure traceability: story → feature → contract → implementation.

## Artifact Locations

Store in specs/ directory:

```
specs/
├── features/
│   └── {feature-area}/
│       └── {feature-name}.feature
├── contracts/
│   ├── openapi/
│   │   └── api.yaml              ← HTTP boundary
│   ├── asyncapi/
│   │   └── events.yaml           ← event boundary
│   └── json-rpc/
│       └── service.yaml          ← RPC boundary
├── fixtures/
    └── {feature-area}/
        └── {fixture-name}.json
└── verification/
    └── {capability}/
        └── verification.yaml   ← rule inventory + evidence bindings
```

## Fixture Template (with traceability)

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

## Domain Model Awareness

Before defining contract schemas, check specs/models/:

1. Does the entity exist? If not, create it first.
2. Are all attributes accounted for?
3. Do business rules match feature scenarios?
4. Is the lifecycle reflected in status enum?

## Traceability Requirements

- Feature files must reference the source story, journey, and contract at the top of the file.
- Contract operations must include `x-story`, `x-feature`, and `x-journey`.
- A rule-bound contract must expose a root `x-rules` array naming every verification-map rule it implements.
- Current-evidence selectors must be literal anchors bound to exact repository files or directories.
- A cross-module contract consumption must be recorded in the verification map with a `jcs-sha256@1` pin to the upstream JSON Schema.
- Fixtures must include a `_meta` block with the story and scenario they support.

## Feature File Template

```gherkin
# specs/features/{area}/{name}.feature

# id: {feature-name}
# type: feature
# story: specs/stories/{area}/{story}.md
# journey: specs/journeys/{journey}.md
# contract: {METHOD} {endpoint}

@{feature-area}
Feature: {Feature Title}
  As a {persona}
  I want to {capability}
  So that {benefit}

  Background:
    Given I am authenticated as {persona-type}

  @happy-path
  Scenario: {Success scenario name}
    Given {precondition}
    When {action}
    Then {expected outcome}
    And {additional verification}

  @validation
  Scenario: {Validation scenario name}
    Given {precondition}
    When {action with invalid input}
    Then I receive a {error-type} error
    And the error message indicates {reason}

  @authorization
  Scenario: {Authorization scenario name}
    Given I am authenticated as {different-persona}
    When {action on protected resource}
    Then I receive a {forbidden/not-found} error

  @edge-case
  Scenario Outline: {Parameterized scenario}
    Given {precondition}
    When {action with <parameter>}
    Then {outcome with <expected>}

    Examples:
      | parameter | expected |
      | value1    | result1  |
      | value2    | result2  |
```

## Deriving Endpoints from Journeys

Journey system responses map to API endpoints:

| Journey Says | Contract Defines |
|--------------|------------------|
| "System displays list of X" | `GET /x` |
| "System creates X" | `POST /x` |
| "System shows X details" | `GET /x/{id}` |
| "System updates X" | `PUT /x/{id}` or `PATCH /x/{id}` |
| "System removes X" | `DELETE /x/{id}` |
| "System does Y to X" | `POST /x/{id}/y` (action endpoint) |
| "System searches for X" | `GET /x?query=...` |

## OpenAPI Structure

```yaml
# specs/contracts/openapi/api.yaml
openapi: 3.1.0
x-rules: [ACCT-1-create-account]
info:
  title: {Service Name} API
  version: 1.0.0
  description: |
    API contract for {service description}.
    
    ## Changelog
    - 1.0.0: Initial release

servers:
  - url: /api/v1
    description: API v1

security:
  - bearerAuth: []

tags:
  - name: audits
    description: Identity audit operations
  - name: accounts
    description: User account operations

paths:
  /audits:
    $ref: './paths/audits.yaml#/collection'
  /audits/{auditId}:
    $ref: './paths/audits.yaml#/item'
  /audits/{auditId}/cancel:
    $ref: './paths/audits.yaml#/cancel'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Supabase JWT token
```

## Endpoint Definition Template

```yaml
# specs/contracts/openapi/paths/audits.yaml

collection:
  get:
    operationId: listAudits
    summary: List user's audits
    tags: [audits]
    x-story: list-audits
    x-feature: specs/features/audits/list-audits.feature
    x-journey: specs/journeys/{journey}.md
    parameters:
      - $ref: '../components/parameters.yaml#/PageSize'
      - $ref: '../components/parameters.yaml#/PageToken'
    responses:
      '200':
        description: Audits retrieved successfully
        content:
          application/json:
            schema:
              $ref: '../components/schemas.yaml#/AuditList'
      '401':
        $ref: '../components/responses.yaml#/Unauthorized'

  post:
    operationId: createAudit
    summary: Create a new identity audit
    tags: [audits]
    x-story: create-first-audit
    x-feature: specs/features/audits/create-audit.feature
    x-journey: specs/journeys/{journey}.md
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '../components/schemas.yaml#/CreateAuditRequest'
    responses:
      '201':
        description: Audit created successfully
        content:
          application/json:
            schema:
              $ref: '../components/schemas.yaml#/Audit'
      '400':
        $ref: '../components/responses.yaml#/BadRequest'
      '401':
        $ref: '../components/responses.yaml#/Unauthorized'

item:
  get:
    operationId: getAudit
    summary: Get audit details
    tags: [audits]
    parameters:
      - $ref: '../components/parameters.yaml#/AuditId'
    responses:
      '200':
        description: Audit retrieved successfully
        content:
          application/json:
            schema:
              $ref: '../components/schemas.yaml#/Audit'
      '404':
        $ref: '../components/responses.yaml#/NotFound'

cancel:
  post:
    operationId: cancelAudit
    summary: Cancel a pending audit
    tags: [audits]
    x-story: cancel-pending-audit
    x-feature: specs/features/audits/cancel-audit.feature
    x-journey: specs/journeys/{journey}.md
    parameters:
      - $ref: '../components/parameters.yaml#/AuditId'
    responses:
      '200':
        description: Audit cancelled successfully
        content:
          application/json:
            schema:
              $ref: '../components/schemas.yaml#/Audit'
      '409':
        description: Audit cannot be cancelled
        content:
          application/json:
            schema:
              $ref: '../components/schemas.yaml#/Error'
            example:
              code: "AUDIT_NOT_CANCELLABLE"
              message: "Audit in 'completed' status cannot be cancelled"
```

## Schema Definition Patterns

```yaml
# specs/contracts/openapi/components/schemas.yaml

Audit:
  type: object
  required: [id, status, entityName, entityType, createdAt]
  properties:
    id:
      type: string
      pattern: '^aud_[a-zA-Z0-9]+$'
      example: "aud_abc123"
    status:
      $ref: '#/AuditStatus'
    entityName:
      type: string
      minLength: 1
      maxLength: 200
      example: "Acme Plumbing LLC"
    entityType:
      $ref: '#/EntityType'
    createdAt:
      type: string
      format: date-time
    completedAt:
      type: string
      format: date-time
      nullable: true
    cancelledAt:
      type: string
      format: date-time
      nullable: true

AuditStatus:
  type: string
  enum: [pending, analyzing, completed, cancelled]
  description: |
    - pending: Audit created, waiting to start
    - analyzing: LLM analysis in progress
    - completed: Analysis finished, results available
    - cancelled: User cancelled before completion

EntityType:
  type: string
  enum: [individual, business]

CreateAuditRequest:
  type: object
  required: [entityName, entityType]
  properties:
    entityName:
      type: string
      minLength: 1
      maxLength: 200
    entityType:
      $ref: '#/EntityType'

Error:
  type: object
  required: [code, message]
  properties:
    code:
      type: string
      description: Machine-readable error code
    message:
      type: string
      description: Human-readable error message
    details:
      type: object
      additionalProperties: true
      description: Additional error context
```

## Fixture Template

```json
{
  "_meta": {
    "id": "create-audit-happy-path",
    "type": "fixture",
    "description": "Successful audit creation",
    "story": "specs/stories/audits/create-first-audit.md",
    "feature": "specs/features/audits/create-audit.feature",
    "scenario": "Successfully create an audit"
  },
  "request": {
    "entityName": "Acme Plumbing LLC",
    "entityType": "business"
  },
  "response": {
    "id": "aud_abc123",
    "status": "pending",
    "entityName": "Acme Plumbing LLC",
    "entityType": "business",
    "createdAt": "2024-01-15T10:00:00Z",
    "completedAt": null,
    "cancelledAt": null
  }
}
```

## Traceability

Every artifact must reference its source. Use front-matter fields (`id`, `type`, and typed refs) so tools can parse links uniformly. See `docs/idd/front-matter-spec.md` for the full schema.

**In feature files** (comment-based front-matter):
```gherkin
# id: cancel-audit
# type: feature
# story: specs/stories/audits/cancel-pending-audit.md
# journey: specs/journeys/cancel-audit.md
# contract: POST /audits/{id}/cancel
```

**In contract** (root and operation traceability extensions):
```yaml
x-rules: [ACCT-1-cancel-account]
x-story: cancel-pending-audit
x-feature: specs/features/audits/cancel-audit.feature
```

**In the verification map**:
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

For a contract consumed from another module, also add:
```yaml
contract_pins:
  - contract: specs/contracts/upstream.schema.json
    canonicalization: jcs-sha256@1
    digest: sha256:{64 lowercase hex characters}
```

**In fixtures** (`_meta` block with `id` and `type`):
```json
{
  "_meta": {
    "id": "cancel-audit-happy-path",
    "type": "fixture",
    "story": "specs/stories/audits/cancel-pending-audit.md",
    "feature": "specs/features/audits/cancel-audit.feature",
    "scenario": "Successfully cancel a pending audit"
  }
}
```

## Guardrails

- Every scenario must trace to a story.
- Every endpoint must trace to a feature scenario.
- Scenarios test behavior, not implementation details.
- Contract is source of truth for API shape.
- Breaking contract changes require version bump.
- Fixtures must match schema definitions exactly.
- Use `x-` extensions for traceability metadata.
- Contract `x-rules` and verification-map rule references must agree in both directions.
- A selector is evidence only when it appears literally in one of its bound files.

## Validation Checklist

Before handoff to implementation:

- [ ] All acceptance criteria have corresponding scenarios
- [ ] All scenarios cover happy path and key error cases
- [ ] Contract covers all journey system responses
- [ ] Schemas have required fields marked
- [ ] Schemas have examples
- [ ] Fixtures match schemas exactly
- [ ] Rule-bound contracts name the same IDs through root-level `x-rules`
- [ ] Every current-evidence selector resolves in its explicit `bindings[].files`
- [ ] Cross-module contract references have a recomputable `contract_pins` entry
- [ ] No orphan endpoints (every endpoint has a scenario)
- [ ] No orphan scenarios (every scenario maps to contract)
- [ ] Error responses are defined consistently

## Common Patterns

### Authentication Background

```gherkin
Background:
  Given I am authenticated as a small business owner
```

Maps to:
- All endpoints require `bearerAuth`
- 401 response defined for unauthorized access

### Resource Not Found (Security)

```gherkin
Scenario: Cannot access another user's audit
  Given another user has an audit
  When I request their audit
  Then I receive a not found error
```

Return 404, not 403, to avoid leaking existence information.

### Conflict on Invalid State Transition

```gherkin
Scenario: Cannot cancel a completed audit
  Given I have an audit in "completed" status
  When I attempt to cancel the audit
  Then I receive a conflict error
```

Use 409 Conflict with descriptive error code.

## Handoff

When complete:
- **Capability scope**: Finalize `specs/capabilities/{name}.capability.yaml` so it includes the relevant `scope.models`, `scope.features`, and `scope.contracts` before implementation handoff.
- **Verification map**: Add or update rule entries, reciprocal contract `x-rules`, and literal current-evidence bindings; run `idd validate verification`.
- **Backend** (hexagonal-architecture skill): Implement ports/adapters from contract
- **Frontend** (repo-overlay binding): Generate client from contract, implement UI from journeys
- **E2E** (e2e-journey-testing skill): Create journey maps and tests
