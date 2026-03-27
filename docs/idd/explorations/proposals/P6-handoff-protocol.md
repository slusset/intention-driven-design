# Methodology Improvement Proposal

## Summary

- Title: P6 — Handoff Protocol as Coordination Primitive
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  Role contracts define `handoff_to` and `success_evidence`, but they do not
  standardize the handoff itself — what information must be transferred, what
  format, and how the receiving role validates the handoff before accepting
  responsibility. Lossy handoffs are where multi-agent systems fail most: the
  sending role considers its work done, the receiving role lacks context, and
  the gap manifests as drift or rework.

- What decision or outcome should this improve?
  Handoffs should be structured transitions with explicit context transfer,
  acceptance criteria, and bounce-back semantics. The receiving role should
  be able to validate that it has everything it needs before beginning work.

- Why is the current approach insufficient?
  The current `handoff_to` field names a target role but does not specify the
  protocol. In practice, handoffs are unstructured — an agent finishes its
  work, the next agent starts, and whatever context survived in artifacts is
  the only shared state. This works when the artifact spine is complete, but
  fails when in-progress work must transfer (partial implementation, open
  hypotheses, discovered constraints).

## Scope

- Affected docs: agent-role.md (handoff protocol section),
  agent-role-contract.yaml (handoff fields)
- Affected skills: idd-workflow (handoff step), pr-review (handoff
  completeness check)
- Affected tools or CI: potential handoff validation
- Governance impact: failed handoffs need an explicit resolution path
  (bounce-back to sender with specific gap description)

## Proposed change

- What is the new practice, rule, or artifact?
  Extend role contracts with a handoff protocol section:
  ```yaml
  handoff_protocol:
    context_transfer:
      - completed_artifacts: list of artifacts produced or modified
      - open_hypotheses: unresolved questions with confidence levels
      - discovered_constraints: operational facts found during execution
      - budget_report: turns used, turns remaining, efficiency notes
    acceptance_criteria:
      - all declared outputs exist and are reachable from the artifact spine
      - no open hypothesis is blocking for the receiving role's work
    on_rejection:
      - sender receives specific gap description
      - sender may request budget extension or escalate
  ```

- What remains unchanged?
  Role boundaries, artifact spine, certification. The protocol adds structure
  to an existing field (`handoff_to`), not a new concept.

- Why is this the smallest useful change?
  It extends the existing role contract template with a structured handoff
  section. The protocol can be advisory initially and tightened as evidence
  accumulates about what makes handoffs succeed or fail.

## Evaluation plan

- Harness or environment: multi-role IDD sessions with and without protocol
- Scenarios to test:
  - Contract role hands off to implementation role: does structured handoff
    reduce "where do I start?" discovery time?
  - Partial work handoff (role ran out of budget): does the protocol preserve
    enough context for another agent to continue without rediscovery?
  - Bounce-back: when a handoff is rejected, does the gap description help
    the sender produce a complete handoff on retry?
- Failure modes to watch:
  - Protocol overhead: handoff documentation costs more than the information
    is worth
  - False acceptance: receiving role accepts handoff without validating, then
    discovers gaps later
  - Rigid protocol on simple handoffs: not every transition needs a full
    context transfer
- Signals or metrics:
  - Rework rate: how often does the receiving role redo work the sending role
    already completed?
  - Discovery time: how long does the receiving role spend figuring out where
    the sending role left off?
  - Handoff success rate: percentage of handoffs accepted without bounce-back

## Worked example

- Not yet run. First experiment should compare two multi-role IDD sessions
  (narrative -> contract -> implementation) with and without structured
  handoff protocol, measuring rework and discovery time.

## Evidence

- ARC-AGI-3 Agentica's orchestrator manages handoffs: subagents return
  control with structured reports (what was tried, what was learned, what
  remains). The `history()` function lets any agent review all prior actions.
  `wins_only=True` filters to successful completions. This structured
  return-with-report pattern is the runtime equivalent of a handoff protocol.
- No IDD-specific evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: comparative study of multi-role sessions
  with and without structured handoff, measuring rework and context loss
