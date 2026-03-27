# Methodology Improvement Proposal

## Summary

- Title: P4 — Hypothesis Lifecycle as Epistemic Discipline
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  IDD has strong declaration discipline (intent before code) and strong
  verification discipline (done means verified). But it has no explicit
  discovery discipline — no formalized way for agents to reason about
  uncertainty when they encounter gaps, ambiguities, or unexpected behavior.

  When an agent finds a contract gap or a test that fails unexpectedly, IDD
  says "route to upstream." But the agent must still reason about what it
  found, form a judgment about what's wrong, and communicate that judgment
  effectively. Currently this reasoning is ad-hoc and invisible.

- What decision or outcome should this improve?
  Agents should follow a structured reasoning protocol when encountering
  uncertainty: observe, hypothesize, test minimally, classify (confirm or
  reject), then act (proceed or escalate). This makes the reasoning auditable
  and improvable.

- Why is the current approach insufficient?
  The methodology-change-process already embodies this pattern at the
  methodology level (exploratory -> provisional -> canonical). But it isn't
  named as a reusable primitive that agents apply during execution. The same
  epistemic discipline that governs how IDD evolves should govern how agents
  reason within IDD.

## Scope

- Affected docs: concepts.md (new concept if promoted), methodology-change-process.md
  (explicit connection to hypothesis lifecycle)
- Affected skills: all skills that encounter ambiguity (idd-workflow gap handling,
  pr-review semantic checks, certification evidence evaluation)
- Affected tools or CI: potential structured hypothesis log
- Governance impact: hypotheses must be classified before they influence
  decisions. Unverified hypotheses cannot become the basis for artifact changes.

## Proposed change

- What is the new practice, rule, or artifact?
  A hypothesis lifecycle with five stages:

  1. **Observe**: detect anomaly, gap, or unexpected behavior
  2. **Hypothesize**: form a testable explanation with explicit confidence
  3. **Test**: design the smallest action that distinguishes the hypothesis
     from alternatives
  4. **Classify**: mark as CONFIRMED, REJECTED, or REFINED (with updated
     hypothesis)
  5. **Act**: proceed (if confirmed), escalate (if gap is upstream), or
     iterate (if refined)

  This maps directly to:
  - ARC-AGI-3's prompted methodology: "observe -> hypothesize -> test ->
    post-hoc analyze"
  - IDD's methodology-change-process: exploratory -> provisional -> canonical
  - Scientific method: observe -> hypothesize -> experiment -> conclude

  The lifecycle is a reusable protocol, not a new artifact type. It governs
  how agents reason, not what they produce.

- What remains unchanged?
  Artifact spine, role contracts, certification. The hypothesis lifecycle
  operates within existing structures — it formalizes how agents handle
  the spaces between artifacts.

- Why is this the smallest useful change?
  It names and standardizes a reasoning pattern that agents already perform
  implicitly. The change is primarily in prompting and logging, not in
  artifact structure.

## Evaluation plan

- Harness or environment: IDD sessions with and without hypothesis protocol
- Scenarios to test:
  - Agent encounters a contract gap: does structured hypothesis reasoning
    produce a more actionable escalation than ad-hoc reasoning?
  - Agent encounters unexpected test failure: does the lifecycle prevent
    premature "fixes" that don't address root cause?
  - Hypothesis refinement: when initial hypothesis is wrong, does the
    lifecycle help the agent converge faster than unstructured retry?
- Failure modes to watch:
  - Over-formalization: agents spend more time documenting hypotheses than
    testing them
  - False confidence: CONFIRMED tag applied without sufficient evidence
  - Infinite refinement: agents never reach CONFIRMED or REJECTED
- Signals or metrics:
  - Root cause accuracy: when agents escalate, is the identified cause correct?
  - Fix-forward compliance: do structured hypotheses lead to spec-first fixes
    more reliably?
  - Convergence rate: how many hypothesis cycles to reach resolution?

## Worked example

- Not yet run. First experiment should compare two bug-fix sessions: one
  with explicit hypothesis lifecycle prompting, one without. Measure whether
  the structured approach produces a more accurate diagnosis and a spec-first
  fix more reliably.

## Evidence

- ARC-AGI-3's GAME_REFERENCE prompt enforces: "note relationships, not just
  events" and requires observe -> hypothesize -> test -> analyze. The
  ReasoningAgent tracks per-level hypothesis + findings. Memories separate
  CONFIRMED from HYPOTHESIS. This structured reasoning is a key contributor
  to the ~30% ARC-AGI-3 score.
- IDD's own methodology-change-process is this pattern applied to methodology
  evolution. This proposal names the pattern as a reusable primitive.
- No IDD execution evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: comparative study showing hypothesis
  lifecycle improves diagnosis accuracy or fix-forward compliance
