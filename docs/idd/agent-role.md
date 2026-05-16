# Agent Role

Agent role is an IDD extension for orchestrated agency. It defines how a human
or agent participates in delivery without weakening the traceability chain.

## Definition

An agent role is a bounded execution contract that states:

- what responsibility the actor owns
- which intent artifacts it must honor
- what decisions it may make autonomously
- what outputs it must produce
- how it hands work to the next role

Roles are not job titles. They are operational boundaries. A single agent may
perform multiple roles sequentially, but each role must still have a clear
contract.

## Why IDD needs it

IDD already defines what artifacts must exist and how they trace back to human
intent. Multi-agent execution introduces a second problem: how work is divided
without losing that intent.

Agent role closes that gap. It lets the methodology evolve through agency while
keeping every actor aligned to the same declared meaning.

## Role contract

Use this minimum structure when defining a role:

```yaml
role: contract-steward
mission: Keep boundary behavior aligned with declared stories and features.
owns:
  - specs/features/
  - specs/contracts/openapi/
inputs:
  - specs/stories/
  - specs/models/
must_preserve:
  - capability scope
  - traceability references
may_change:
  - feature scenarios
  - OpenAPI operations
must_not_change:
  - persona intent without narrative update
handoff_to:
  - implementation-role
success_evidence:
  - changed artifacts reference upstream sources
  - validation passes
```

## Actionable adoption steps

1. Define roles before parallelizing work.
   - Name each role, its owned boundary, and the artifacts it may edit.
2. Put role contracts in the orchestrator handoff.
   - Include inputs, outputs, invariants, and success evidence.
3. Route decisions back to the right upstream layer.
   - If a role discovers a narrative, model, or contract gap, update the spec
     before implementation.
4. Certify role outputs, not just code changes.
   - The role succeeded only when its outputs still trace to intent and remain
     certifiable.

## Example role set

- Narrative role: refines personas, journeys, and stories
- Model role: maintains entities, rules, and lifecycles
- Contract role: owns features, API contracts, and fixtures
- Implementation role: changes code to satisfy upstream contracts
- Validation role: proves journeys and contract behavior
- Certification role: closes the chain with evidence

These roles do not replace IDD layers. They operationalize them.
