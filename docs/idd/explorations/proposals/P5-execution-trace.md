# Methodology Improvement Proposal

## Summary

- Title: P5 — Execution Trace as First-Class Artifact
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  IDD certification captures evidence of outcomes (tests pass, traceability
  holds, features are covered). It does not capture evidence of process — how
  the agent actually worked through a capability, what it tried, what it
  rejected, where it spent its budget, and what reasoning led to each decision.

  Without process evidence, we can only improve outcomes. With it, we can
  improve how agents work — which is the core of the self-improvement loop.

- What decision or outcome should this improve?
  The adaptive substrate (layer 3 of the self-evolving ecosystem) needs raw
  signal to learn from. Execution traces provide that signal. They enable:
  - debugging failed sessions (what went wrong and where)
  - comparing approaches (which role allocation was more efficient)
  - identifying systematic waste (where do agents consistently spend budget
    without producing value)

- Why is the current approach insufficient?
  Agent sessions currently vanish after completion. The only record is the
  final artifact state and certification evidence. Two agents could reach the
  same outcome with wildly different efficiency, and the methodology has no
  way to know or learn from the difference.

## Scope

- Affected docs: concepts.md (new concept if promoted), certification-guide.md
  (trace as supplementary evidence)
- Affected skills: all skills (trace emission), certification (trace analysis)
- Affected tools or CI: trace storage, potential replay tooling
- Governance impact: traces contain agent reasoning and may include sensitive
  project context. Storage and retention policies needed.

## Proposed change

- What is the new practice, rule, or artifact?
  An execution trace is a structured log of agent activity during an IDD
  session. Each entry records:
  - timestamp
  - active role
  - action taken (artifact read, write, skill invocation, hypothesis formed)
  - reasoning summary (why this action)
  - budget state (turns used / remaining)
  - outcome (success, failure, escalation)

  Traces are emitted during execution and stored alongside certification
  evidence. They are supplementary — not required for certification — but
  available for process improvement.

- What remains unchanged?
  Artifact spine, certification requirements, role contracts. Traces are
  additive — they provide a new lens, not a new requirement.

- Why is this the smallest useful change?
  Structured logging with a consistent schema. No changes to existing
  artifacts or workflows. Traces can be ignored entirely without breaking
  anything — they only add value when someone (human or agent) analyzes them.

## Evaluation plan

- Harness or environment: IDD sessions with trace emission enabled
- Scenarios to test:
  - Session fails partway through: can the trace identify where and why?
  - Two sessions complete the same task: can traces reveal which was more
    efficient and why?
  - Trace-informed retry: does reviewing a failed session's trace help the
    next attempt succeed faster?
- Failure modes to watch:
  - Trace verbosity: too much data, no signal
  - Trace overhead: logging slows down execution
  - Privacy: traces contain reasoning that may include sensitive project details
- Signals or metrics:
  - Debuggability: time to identify root cause of a failed session
  - Process comparison: can traces distinguish efficient from inefficient
    approaches to the same task?
  - Replay fidelity: can a trace be replayed to reproduce agent behavior?

## Worked example

- Not yet run. First experiment should capture traces from two IDD sessions
  (one successful, one failed) on the same capability and determine whether
  the trace reveals actionable differences.

## Evidence

- ARC-AGI-3 has three trace layers: JSONL per-action logs, WebSocket event
  streams (agent spawns, token usage, reasoning), and AgentOps distributed
  tracing. All are replayable. The replay system (`logging/replay.py`) can
  reconstruct any session. This multi-layer tracing is essential to their
  iterative improvement of agent strategies.
- No IDD-specific evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: working trace implementation with at
  least one debugging or comparison use case demonstrated
