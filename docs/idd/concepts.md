# IDD Concept Catalog

Canonical definitions of every IDD concept. Each concept is defined once here.
Skills implement subsets of these concepts; the [concept-skill map](concept-skill-map.md)
tracks which concepts each skill carries.

When converting concepts to a new agent's skill format, use this catalog as the
acceptance checklist: every concept a skill claims must be faithfully represented
in the output.

---

## C1 — Intent Precedes Code

No implementation begins without an explicit intent artifact (persona, journey,
or story). Code is a downstream consequence of declared intent, never the
starting point.

**Manifesto principle**: 1
**Artifacts involved**: personas, journeys, stories

---

## C2 — Shared Mental Models Are Artifacts

Understanding lives in versioned documents, not conversations or tribal
knowledge. If a concept matters, it has a file.

**Manifesto principle**: 2
**Artifacts involved**: all `specs/` documents

---

## C3 — Contracts Define Reality at Boundaries

API contracts (OpenAPI, Gherkin features) are the authoritative source of truth
for how systems interact. Implementation must conform to the contract, not the
other way around.

**Manifesto principle**: 3
**Artifacts involved**: features, contracts/openapi, fixtures

---

## C4 — Assumptions Become Executable

Every assumption about behavior is expressed as an automated check — BDD
scenario, contract test, or e2e assertion. Untested assumptions are technical
debt.

**Manifesto principle**: 4
**Artifacts involved**: features, fixtures, e2e tests

---

## C5 — Fast Honest Automated Feedback

Verification is evidence-based, not opinion-based. Feedback loops are automated,
deterministic, and run continuously.

**Manifesto principle**: 5
**Artifacts involved**: certification/, CI pipelines

---

## C6 — Protect Human Cognition

Agents handle bookkeeping, traceability enforcement, and repetitive artifact
generation. Humans focus on meaning, tradeoffs, and creative decisions.

**Manifesto principle**: 6
**Applies to**: agent behavior rules, workflow automation

---

## C7 — Evolution Preserves Meaning

Change is expected. Drift is not. Refactors must preserve declared invariants.
Artifact references must be updated when upstream artifacts change.

**Manifesto principle**: 7
**Applies to**: modification workflows, traceability maintenance

---

## C8 — Traceability Chain

Every downstream artifact references its upstream source. The full chain:

```
Persona → Journey → Story → Capability → Feature → Contract → Tests → Evidence
```

The capability groups artifacts into a certifiable scope. No link in the chain
is optional. If an artifact exists, its provenance is declared.

**Enforced via**: YAML front-matter (preferred), comment headers,
`x-story`/`x-feature`/`x-journey` OpenAPI extensions, `_meta` blocks in
fixtures, test file headers. See `docs/idd/front-matter-spec.md` for the
uniform front-matter schema.

---

## C9 — Narrative-First Requirements

Requirements begin as human stories, not technical specifications. The sequence
is always: who needs this (persona) → what experience they have (journey) →
what the system does (story) → how it behaves (feature/contract).

**Skill entry point**: solution-narrative
**Artifacts produced**: personas, journeys, stories

---

## C10 — Domain as Formal Model

Business concepts are captured in structured, typed artifacts (entity
definitions, lifecycle state machines, aggregate boundaries) before
implementation. The model is the shared vocabulary between narrative and code.

**Skill entry point**: domain-modeling
**Artifacts produced**: entity YAML, lifecycle YAML, aggregate definitions

---

## C11 — Layered Artifact Spine

The project structure follows a fixed layered order. Each layer produces
artifacts that feed the next:

```
Narrative  →  Model  →  Contract  →  Implementation  →  Validation
```

Layers have clear boundaries. Skipping a layer requires explicit justification.

**Defined in**: project-template.md
**Directory structure**: `specs/` subdirectories mirror the layers

---

## C12 — Done Means Verified

A capability is done when:
1. Every story references its journey and persona.
2. Every contract operation references its source story/feature.
3. Every automated test maps to an explicit intent artifact.
4. No feature is accepted on manual confidence alone.

**Defined in**: project-template.md (done criteria)

---

## C13 — Fix Forward

When a defect is found, the response is never "fix the code." The response is:

1. Add the missing specification (feature scenario, contract clause, business rule).
2. Fix the implementation to match the updated spec.
3. Update certification evidence to cover the gap.

Fixing code without updating specs is drift — the single most common way
systems lose alignment with their intent. This concept is a critical safeguard
for the entire traceability chain (C8).

**Manifesto principle**: 7 (Evolution preserves meaning)
**Applies to**: bug fix workflows, post-incident response, regression handling
**See also**: manifesto.md (Fix Forward section), certification-guide.md

---

## C14 — Agent Operating Non-Negotiables

Four rules agents must never violate:
1. No implementation without an explicit intent artifact.
2. No boundary behavior without a contract artifact.
3. No merge without verifiable evidence tied to intent.
4. No silent drift: refactors must preserve declared invariants.

**Defined in**: agent-operating-contract.md

---

## C15 — Capability as Certification Unit

A capability is the smallest unit of intent that delivers independently
verifiable user value. It groups the artifacts that must be true together —
personas, journeys, stories, features, contracts, and models — into a declared
scope with a certification boundary.

Capabilities are defined before certification and remain stable across the
implementation lifecycle. The capability artifact is the single source of truth
for "what are we building and certifying?" Evidence manifests reference
capabilities; capabilities enumerate their constituent artifacts.

**Artifacts involved**: `specs/capabilities/{name}.capability.yaml`,
`certification/{capability}/evidence.yaml`
**Defined in**: front-matter-spec.md (capability schema), certification-guide.md
(certification workflow)
**Related concepts**: C8 (closes the chain at scope level), C11 (adds a
grouping layer above the spine), C12 (defines what "done" means for)
