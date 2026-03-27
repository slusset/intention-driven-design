# Methodology Improvement Proposal

## Summary

- Title: P2 — Action Budget as Resource Contract
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  Role contracts define what an agent may do but not how much effort it may
  spend. An agent operating within its declared boundary can churn indefinitely —
  exploring, refactoring, or retrying — without violating any IDD constraint.
  There is no forcing function that requires the agent to evaluate whether its
  approach is working.

- What decision or outcome should this improve?
  Agents should have explicit resource envelopes. When a budget is exhausted,
  the agent must hand off with a structured report of what was attempted, what
  was learned, and what remains. This creates natural checkpoints and makes
  agent efficiency measurable.

- Why is the current approach insufficient?
  The current role contract has `owns`, `may_change`, `must_preserve` — but no
  concept of bounded effort. A well-scoped role that runs for 200 turns
  producing nothing useful is technically compliant. Budgets turn compliance
  into a meaningful signal.

## Scope

- Affected docs: agent-role.md (budget field), agent-role-contract.yaml template
- Affected skills: idd-workflow (budget allocation step), pr-review (budget
  efficiency as review signal)
- Affected tools or CI: potential budget tracking in execution traces
- Governance impact: budget exhaustion must trigger handoff, not failure. The
  methodology must treat "I couldn't solve this in N turns" as useful signal,
  not as agent failure.

## Proposed change

- What is the new practice, rule, or artifact?
  Add a `budget` section to role contracts:
  ```yaml
  budget:
    max_turns: 50
    free_actions: [reset, observe, query_memory]
    on_exhaustion: handoff_with_report
  ```
  - `max_turns`: hard cap on billable actions
  - `free_actions`: actions that don't count against budget (observation,
    memory queries, resets)
  - `on_exhaustion`: what happens when budget runs out (handoff, escalate,
    or request_extension)

- What remains unchanged?
  Role boundaries, artifact spine, certification. Budget is an additional
  constraint on role contracts, not a replacement for any existing field.

- Why is this the smallest useful change?
  Three fields on an existing template. No new artifact type. Enforcement can
  be advisory (log and warn) before becoming mandatory.

## Evaluation plan

- Harness or environment: IDD skill sessions with and without budget constraints
- Scenarios to test:
  - Same task, same role, with and without budget: does budgeted execution
    produce comparable outcomes in fewer turns?
  - Budget exhaustion: does the handoff report contain actionable information?
  - Free actions: does making observation/memory free change exploration behavior?
- Failure modes to watch:
  - Budget set too low → agents hand off before making progress
  - Budget set too high → no practical constraint
  - Agents game the budget by doing expensive work inside "free" actions
- Signals or metrics:
  - Turns-to-completion: total actions to achieve role success evidence
  - Budget utilization: ratio of productive vs exploratory turns
  - Handoff quality: does the receiving role have enough context to continue?

## Worked example

- Not yet run. First experiment should compare two IDD implementation sessions:
  one unbounded, one with a 50-turn budget and mandatory handoff report.

## Evidence

- ARC-AGI-3 Agentica uses `bounded_submit_action(limit)` per subagent.
  RESET and NOOP are free. Budget exhaustion raises ValueError, forcing
  the agent to return control. The orchestrator allocates budgets strategically
  across subagents. This is a working implementation.
- No IDD-specific evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: comparative study of budgeted vs
  unbounded execution on at least one IDD task
