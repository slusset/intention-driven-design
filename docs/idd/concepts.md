# IDD Concept Catalog

Canonical definitions of every IDD concept. Each concept is defined once here.
Skills implement subsets of these concepts; the [concept-skill map](concept-skill-map.md)
tracks which concepts each skill carries.

When converting concepts to another agent's skill format, use this catalog as the
acceptance checklist: every concept a skill claims must be faithfully represented
in the output.

---

## C1 — Intent Precedes Implementation

No implementation begins without an explicit intent artifact. Intent starts as
human narrative — who needs this (persona), what experience they have (journey),
what the system does for them (story) — and implementation is a downstream
consequence of that declared intent, never the starting point.

**Manifesto principle**: 1
**Artifacts**: personas, journeys, stories

---

## C2 — Shared Mental Models Are Artifacts

Understanding lives in versioned documents, not conversations or tribal
knowledge. If a concept matters, it has a file, and that file is what gets
referenced, reviewed, and changed.

**Manifesto principle**: 2
**Artifacts**: every specification document

---

## C3 — Traceability Spine

Artifacts follow a layered order, and every artifact names the upstream artifact
it serves:

```
(Telos) → Persona → Journey → Story → Capability → Model and rules → Contracts and scenarios → Evidence
```

The telos (C10) is optional and sits above the spine; every layer below it is
required once the layer above exists.

Layers have clear boundaries, and skipping one requires explicit justification.
No link is optional: if an artifact exists, its provenance is declared. How a
link is declared — typed front matter, contract extensions, metadata blocks — is
a mechanical question answered by the front-matter specification.

**Manifesto principles**: 1, 2
**Artifacts**: every specification document

---

## C4 — Formal Model, Rules as the Join Key

Business concepts are captured as structured, typed artifacts — entities, value
objects, aggregates, lifecycles — before implementation. The model is the shared
vocabulary between narrative and code.

Within the model, a rule is the unit of meaning. Each rule carries a stable
identifier, and that identifier is what joins the model to contracts, scenarios,
verification, and evidence. A rule without an identifier can be read but not
cited, so it cannot be verified.

**Manifesto principles**: 2, 4
**Artifacts**: models, lifecycles, verification maps

---

## C5 — Capability Is the Unit of Verification

A capability is the smallest unit of intent that delivers independently
verifiable value. It groups the artifacts that must be true together — personas,
journeys, stories, models, contracts, scenarios — into one declared scope with a
verification and certification boundary.

A capability is declared before verification and stays stable across the
implementation lifecycle. It is the single source of truth for "what are we
building and proving?" Evidence references capabilities; capabilities enumerate
their constituent artifacts.

**Manifesto principle**: 1
**Artifacts**: capability definitions, verification maps, evidence manifests

---

## C6 — Modules and Contracts at Boundaries

Every capability belongs to exactly one module, and modules relate only through
a declared acyclic dependency graph. Ownership and dependency are declared, never
inferred from file placement.

Contracts define reality where boundaries meet: implementation conforms to the
contract, not the other way around. A contract consumed across a module boundary
is pinned to the exact document it was agreed against, so an upstream change is
visible rather than silent.

**Manifesto principle**: 3
**Artifacts**: module manifest, contracts, contract pins, scenarios, fixtures

---

## C7 — Claims Require Evidence

Every assumption about behavior becomes an automated check, and a check counts
as evidence only when its result is bound to the rule it exercises. Untested
assumptions are technical debt; unbound results are not evidence.

Claims about a capability stay separate rather than collapsing into one status:

| Claim | Question it answers |
|---|---|
| Intent | Is the declared intent coherent, and still open to change? |
| Verification | What has executable checking established, and where? |
| Certification | What have review and independent evidence established? |
| Production | Is operational, deployment, recovery, and security posture explicit? |

No claim exceeds the weakest claim it depends on. Evidence is derived output: it
describes exactly one revision, so it is regenerated and published with the
change rather than stored as a standing assertion. Done means verified — nothing
is accepted on manual confidence alone, and gaps are declared instead of hidden.

**Manifesto principle**: 4
**Artifacts**: verification maps, evidence manifests, published evidence reports

---

## C8 — Evolution Preserves Meaning

Change is expected. Drift is not. Refactors preserve declared invariants, and
references are updated when upstream artifacts change.

A defect is classified before it is repaired:

- **Specification gap** — the intent, rule, contract, or scenario is missing or
  wrong. Correct the specification first, then bring the implementation to it.
- **Implementation gap** — the specification is already correct and citable.
  Repair the implementation and add a regression check bound to the existing
  rule.

Either way the repair produces evidence. A defect whose repair leaves no
evidence behind is not repaired, and a rule too vague to cite is itself a
specification gap.

Larger change is an evolution: it names its source and target state, declares
what is preserved, transformed, retired, or unproven, and leaves a traceable
migration record. Continuity is the quality being preserved; backward
compatibility is one strategy for it, not the goal. Where state exists, removal
requires a migration or an explicit disposition, and a clean validator run does
not establish continuity by itself.

**Manifesto principle**: 6
**Applies to**: defect repair, refactors, artifact and schema migration, deprecation

---

## C9 — Humans Own Meaning

People own meaning, tradeoffs, and creative decisions. Agents own bookkeeping:
traceability, repetitive artifact generation, and deterministic checking.
Automated review reports; humans decide.

Whoever is acting works within the boundary they were given. A gap found outside
that boundary is routed to the artifact that owns it rather than improvised
across it.

**Manifesto principle**: 5
**Applies to**: agent behavior rules, delegated work, review

---

## C10 — Telos

A repository may declare one telos: why this system exists at all, and what it
deliberately will not become. Personas say who needs the system; the telos says
why the system is worth building, and it stands above the spine as the
statement every capability serves.

A telos is optional, and a repository has at most one. Nothing cites it — with
a single declaration the link is implicit — so alignment with it is a judgment
made in review, never a link a validator can check. Qualities the system must
preserve remain rules with identifiers and evidence (C4); the telos may name
them in prose, but it does not enforce them.

**Manifesto principle**: 1
**Artifacts**: the repository telos
