---
name: domain-modeling
description: "Define domain entities, value objects, aggregates, and business rules. Use when translating user stories into a formal domain model before creating API contracts. Bridges solution-narrative and behavior-contract skills."
license: MIT
argument-hint: "[entity-name or feature-area]"
allowed-tools: Read Write Glob Grep
---

# Domain Modeling

## Purpose

Capture the essential business concepts and rules that emerge from user stories. This skill creates the conceptual foundation that informs both Gherkin scenarios and API schemas.

## When to Use

- After completing journeys and stories (solution-narrative)
- Before writing feature files and contracts (behavior-contract)
- When a story introduces new business concepts
- When clarifying relationships between entities
- When capturing business rules and invariants

## Workflow

1. Review stories in specs/stories/ for business concepts.
2. Identify entities, value objects, and aggregates.
3. Document business rules and invariants.
4. Define entity lifecycles (state machines).
5. Output to specs/models/ for use by behavior-contract and implementation.

## Artifact Locations

```
specs/
└── models/
    ├── README.md                    ← Model overview and glossary
    ├── {aggregate-name}/
    │   ├── {entity}.model.yaml      ← Entity definition
    │   └── {entity}.lifecycle.yaml  ← State machine (if applicable)
    └── shared/
        └── {value-object}.model.yaml
```

## Entity Model Schema

```yaml
# specs/models/{aggregate}/{entity}.model.yaml

id: audit
type: model
entity: Audit
aggregate: Audit                    # Aggregate root this belongs to
description: |
  Represents an identity verification audit for a person or business.
  Created by users to analyze public information about an entity.

# Where this concept comes from
sources:
  stories:
    - specs/stories/audits/create-first-audit.md
    - specs/stories/audits/cancel-pending-audit.md
  journeys:
    - specs/journeys/first-audit-creation.md

# Core identity
identity:
  field: id
  type: string
  format: prefixed-ulid
  prefix: "aud_"
  example: "aud_01HQ3K4N5M6P7R8S9T0UVWXYZ"

# Attributes
attributes:
  entityName:
    type: string
    required: true
    constraints:
      minLength: 1
      maxLength: 200
    description: "Name of person or business being audited"
    example: "Acme Plumbing LLC"

  entityType:
    type: enum
    required: true
    values: [individual, business]
    description: "Whether auditing a person or organization"

  status:
    type: enum
    required: true
    values: [pending, analyzing, completed, cancelled]
    description: "Current state in the audit lifecycle"
    see: lifecycle.yaml

  createdAt:
    type: datetime
    required: true
    immutable: true
    description: "When the audit was created"

  completedAt:
    type: datetime
    required: false
    description: "When analysis finished (null if not completed)"

  cancelledAt:
    type: datetime
    required: false
    description: "When user cancelled (null if not cancelled)"

# Relationships
relationships:
  owner:
    type: belongs-to
    entity: User
    required: true
    description: "User who created this audit"

  findings:
    type: has-many
    entity: Finding
    description: "Results discovered during analysis"

# Business rules (invariants)
rules:
  - id: audit-owner-immutable
    description: "Audit owner cannot be changed after creation"
    enforced: domain

  - id: completed-requires-findings
    description: "Audit cannot transition to completed without at least one finding"
    enforced: domain

  - id: cancelled-only-from-pending
    description: "Only pending audits can be cancelled"
    enforced: domain
    see: lifecycle.yaml

  - id: entity-name-not-empty
    description: "Entity name must have meaningful content"
    enforced: validation

# Audit trail
versioning:
  tracked: true
  fields: [status, completedAt, cancelledAt]
```

## Lifecycle (State Machine) Schema

```yaml
# specs/models/{aggregate}/{entity}.lifecycle.yaml

id: audit-lifecycle
type: model
entity: Audit
description: "State transitions for an audit through its lifecycle"

# Where this lifecycle is documented
sources:
  stories:
    - specs/stories/audits/cancel-pending-audit.md
  journeys:
    - specs/journeys/audit-completion.md

initial_state: pending

states:
  pending:
    description: "Audit created, waiting to start analysis"
    terminal: false

  analyzing:
    description: "LLM analysis in progress"
    terminal: false

  completed:
    description: "Analysis finished, results available"
    terminal: true

  cancelled:
    description: "User cancelled before completion"
    terminal: true

transitions:
  start_analysis:
    from: pending
    to: analyzing
    trigger: system
    description: "System begins processing the audit"
    guards: []

  complete:
    from: analyzing
    to: completed
    trigger: system
    description: "Analysis finishes successfully"
    guards:
      - has-at-least-one-finding
    effects:
      - set completedAt to current timestamp

  cancel:
    from: pending
    to: cancelled
    trigger: user
    description: "User cancels a pending audit"
    guards: []
    effects:
      - set cancelledAt to current timestamp
    api: "POST /audits/{id}/cancel"

  # Invalid transitions (documented for clarity)
  _invalid:
    - from: analyzing
      to: cancelled
      reason: "Cannot cancel once analysis has started"
    - from: completed
      to: cancelled
      reason: "Cannot cancel a completed audit"
    - from: cancelled
      to: any
      reason: "Cancelled is a terminal state"
```

## Value Object Schema

```yaml
# specs/models/shared/{value-object}.model.yaml

id: email-address
type: model
value_object: EmailAddress
description: "A validated email address"

type: string
format: email

constraints:
  pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  maxLength: 254

validation:
  - Must be syntactically valid email format
  - Domain must have valid MX record (optional, at integration boundary)

equality: "Case-insensitive comparison of full address"

example: "user@example.com"
```

## Aggregate Definition

```yaml
# specs/models/{aggregate}/README.md (or _aggregate.yaml)

aggregate: Audit
root: Audit
description: |
  The Audit aggregate manages identity verification audits and their findings.
  All modifications go through the Audit root to maintain consistency.

entities:
  - Audit (root)
  - Finding

value_objects:
  - AuditId
  - FindingId
  - EntityType
  - AuditStatus

invariants:
  - An audit must have an owner
  - Findings can only be added while audit is in 'analyzing' state
  - Status transitions follow the defined lifecycle

boundaries:
  - Findings are only accessible through their parent Audit
  - User details are referenced by ID, not embedded
```

## Deriving Models from Stories

When reading a story, extract:

| Story Element | Model Artifact |
|---------------|----------------|
| "As a {persona}" | User/Actor entity or role |
| "I want to {action}" | Command, state transition, or relationship |
| "So that {benefit}" | Business rule or invariant |
| Acceptance criteria | Constraints, validations, guards |
| "Given {state}" | Entity state, lifecycle position |
| "When {event}" | Transition trigger, command |
| "Then {outcome}" | Effect, state change, relationship |

### Example Extraction

**Story**: "As a small business owner, I want to cancel a pending audit, so that I'm not charged for audits I no longer need."

**Extracted**:
- Entity: `Audit` (already exists)
- State: `pending` (precondition)
- Transition: `cancel` (from pending to cancelled)
- Guard: Must be in pending state
- Effect: Set cancelledAt timestamp
- Business rule: "Only pending audits can be cancelled"
- Implied: Billing concern (may need separate Billing context)

## Glossary Template

```yaml
# specs/models/README.md

# Domain Glossary

## Ubiquitous Language

| Term | Definition | Context |
|------|------------|---------|
| Audit | A verification process for a person or business identity | Core |
| Finding | A piece of information discovered during an audit | Core |
| Entity (audit target) | The person or business being audited | Core |
| Entity (DDD) | A domain object with identity | Technical |

## Aggregates

| Aggregate | Root | Description |
|-----------|------|-------------|
| Audit | Audit | Identity verification and findings |
| User | User | User accounts and preferences |

## Bounded Contexts

| Context | Description | Key Aggregates |
|---------|-------------|----------------|
| Identity Verification | Core audit functionality | Audit, Finding |
| User Management | Account and auth | User, Session |
| Billing | Payments and subscriptions | Subscription, Invoice |
```

## Validation Checklist

Before handoff to behavior-contract:

- [ ] All story nouns have corresponding entities or value objects
- [ ] All story verbs map to transitions or commands
- [ ] Business rules are explicit and traceable to stories
- [ ] Lifecycles cover all mentioned states
- [ ] Invalid transitions are documented
- [ ] Relationships are defined (belongs-to, has-many)
- [ ] Identity strategy is defined for each entity
- [ ] Glossary includes all domain terms

## Handoff

When models are complete:

1. **behavior-contract**: Use model attributes to define OpenAPI schemas
2. **behavior-contract**: Use lifecycle transitions to define action endpoints
3. **spring-boot-architecture**: Use models as blueprint for domain layer
4. **angular-architecture**: Use models to define TypeScript interfaces

## Guardrails

- Models describe WHAT, not HOW (no database columns, no framework annotations)
- One aggregate per directory
- Value objects in shared/ if used across aggregates
- Every model must trace to at least one story
- Use ubiquitous language consistently (same terms in models, features, code)
- Lifecycle diagrams are optional but recommended for complex entities
