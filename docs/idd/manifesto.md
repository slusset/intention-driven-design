# Intention-Driven Development Manifesto

## Definition

Intention-Driven Development is the practice of making meaning explicit, executable, and continuously verified so systems can scale without semantic drift.

## Motivation

Software systems drift from their original intent. Requirements live in conversations that fade. Specs describe *what* but not *why*. Tests verify behavior but can't tell you if the behavior still serves its purpose. As systems grow — and as AI agents take on more implementation — this drift accelerates silently.

IDD exists because intent is the most durable artifact in software. Technologies change, APIs evolve, frameworks go stale. But the reason a feature exists — the human need it serves — tends to be remarkably stable. IDD makes that intent a first-class, traceable, executable artifact that anchors everything downstream.

## Core principles

1. **Intent precedes code.** No implementation begins without an explicit intent artifact.
2. **Shared mental models are artifacts, not conversations.** If a concept matters, it has a file.
3. **Contracts define reality at boundaries.** Implementation conforms to the contract, not the other way around.
4. **Assumptions must become executable.** Untested assumptions are technical debt.
5. **Feedback must be fast, honest, and automated.** Evidence, not confidence theater.
6. **Human cognition is protected.** Agents handle bookkeeping and traceability; humans handle meaning, tradeoffs, and creative decisions.
7. **Evolution must preserve meaning.** Change is expected. Drift is not. Refactors must preserve declared invariants.

## Fix Forward

When a defect is found, the response is never "fix the code." The response is:

1. Add the missing specification (feature scenario, contract clause, business rule).
2. Fix the implementation to match.
3. Update evidence to cover the gap.

Fixing code without updating specs is drift. It's the single most common way systems lose alignment with their intent, and IDD treats it as a violation of the traceability chain.

## Working stance

- We externalize intent until disagreement is impossible.
- We treat uncertainty as a test-design problem.
- We optimize for evidence, not confidence theater.
- We allow change, but we do not allow drift.
