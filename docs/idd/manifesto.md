# Intention-Driven Design Manifesto

## Definition

Intention-Driven Design is the practice of making meaning explicit, executable, and continuously verified so systems can scale without semantic drift.

## Motivation

Software systems drift from their original intent. Requirements live in conversations that fade. Specifications describe *what* but not *why*. Tests verify behavior but cannot tell you whether the behavior still serves its purpose. As systems grow — and as agents take on more implementation — this drift accelerates silently.

IDD exists because intent is the most durable artifact in software. Technologies change, interfaces evolve, tools go stale. But the reason a capability exists — the human need it serves — tends to be remarkably stable. IDD makes that intent a first-class, traceable, executable artifact that anchors everything downstream.

## Core principles

1. **Intent precedes implementation.** No implementation begins without an explicit intent artifact.
2. **Shared mental models are artifacts, not conversations.** If a concept matters, it has a file.
3. **Boundaries are declared.** Every capability has one owner, dependencies are declared rather than inferred, and contracts govern what crosses a boundary.
4. **Claims require evidence.** An assumption becomes an executable check, and a claim stands only on what that check produced. Gaps are declared, not hidden.
5. **Human cognition is protected.** People own meaning, tradeoffs, and creative decisions; agents own bookkeeping and traceability.
6. **Evolution preserves meaning.** Change is expected. Drift is not. What changes is migrated or explicitly retired, and declared invariants survive the change.

## Working stance

- We externalize intent until disagreement surfaces early instead of late.
- We treat uncertainty as a test-design problem.
- We allow change, but we do not allow drift.
