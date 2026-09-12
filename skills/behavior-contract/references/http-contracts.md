# HTTP Contracts

Load this reference when the capability crosses an HTTP boundary. The examples
use OpenAPI 3.1.

## Deriving operations from a journey

| Journey says | Contract defines |
|--------------|------------------|
| "System displays a list of X" | `GET /x` |
| "System creates X" | `POST /x` |
| "System shows X details" | `GET /x/{id}` |
| "System updates X" | `PUT /x/{id}` or `PATCH /x/{id}` |
| "System removes X" | `DELETE /x/{id}` |
| "System does Y to X" | `POST /x/{id}/y` |
| "System searches for X" | `GET /x?query=...` |

## Document structure

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

security:
  - bearerAuth: []

tags:
  - name: audits
    description: Identity audit operations

paths:
  /audits:
    $ref: './paths/audits.yaml#/collection'
  /audits/{auditId}:
    $ref: './paths/audits.yaml#/item'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

The root `x-rules` array names every verification-map rule this contract
implements. The verification map must name the same IDs back.

## Operation template

```yaml
# specs/contracts/openapi/paths/audits.yaml

collection:
  get:
    operationId: listAudits
    summary: List a user's audits
    tags: [audits]
    x-story: list-audits
    x-feature: specs/features/audits/list-audits.feature
    x-journey: specs/journeys/{journey}.md
    parameters:
      - $ref: '../components/parameters.yaml#/PageSize'
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
    summary: Create an audit
    tags: [audits]
    x-story: create-first-audit
    x-feature: specs/features/audits/create-audit.feature
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
```

Every operation carries `x-story` and `x-feature` so the chain from journey to
endpoint stays parseable.

## Schema patterns

```yaml
# specs/contracts/openapi/components/schemas.yaml

Audit:
  type: object
  required: [id, status, entityName, createdAt]
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
    createdAt:
      type: string
      format: date-time
    completedAt:
      type: string
      format: date-time
      nullable: true

AuditStatus:
  type: string
  enum: [pending, analyzing, completed, cancelled]
  description: |
    - pending: created, waiting to start
    - analyzing: analysis in progress
    - completed: results available
    - cancelled: ended before completion

Error:
  type: object
  required: [code, message]
  properties:
    code:
      type: string
      description: Machine-readable error code
    message:
      type: string
    details:
      type: object
      additionalProperties: true
```

The status enum must match the lifecycle declared in `specs/models/`. If they
disagree, the model wins and the contract is wrong.

## Response conventions

**Authentication.** A `Given I am authenticated as {persona}` background maps
to `bearerAuth` on every operation plus a defined `401` response.

**Resource not found on another user's data.** Return `404`, not `403`, so the
response does not leak existence:

```gherkin
Scenario: Cannot access another user's audit
  Given another user has an audit
  When I request their audit
  Then I receive a not found error
```

**Invalid state transition.** Return `409` with a descriptive code:

```yaml
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

The rejected transition should already exist as a rule in the model's
lifecycle; the contract's error is that rule's boundary expression.
