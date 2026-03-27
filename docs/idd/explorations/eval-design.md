# Evaluation Design: Methodology Attribution

## Problem statement

IDD skills and tools produce good outcomes, but we cannot attribute improvement
to the methodology versus better LLMs, better harnesses, or operator
familiarity. Without attribution, the methodology risks becoming cargo cult.

This document describes how to measure methodology contribution independently
of confounding variables.

## Confounding variables

| Variable | What it affects | How it changes independently |
|----------|----------------|------------------------------|
| LLM capability | reasoning quality, context use, instruction following | model upgrades (outside our control) |
| Harness quality | tool-calling reliability, context management, IDE integration | tooling updates (partially in our control) |
| Operator familiarity | prompt quality, task decomposition, skill selection | practice (changes over time) |
| Methodology | artifact structure, traceability, verification discipline | IDD changes (fully in our control) |

## Attribution strategy

We cannot run controlled experiments with fixed LLMs (models deprecate).
Instead, we use **relative metrics** that are meaningful regardless of
absolute capability level.

### Principle: measure what the methodology adds on top of baseline capability

For any given model + harness + operator combination, the methodology either:
1. reduces waste (fewer turns to reach the same outcome)
2. reduces drift (fewer traceability violations over time)
3. reduces rework (fewer "fix the fix" cycles)
4. improves handoff fidelity (less information lost between roles)

These ratios are attributable to the methodology because they compare
with-methodology to without-methodology on the same underlying platform.

## Proposed metrics

### M1 — Rediscovery rate

**What**: How often does an agent re-encounter and re-solve a problem that was
already solved in a prior session or by a prior role?

**How to measure**: Count instances where an agent spends turns on a problem
whose resolution already exists in artifacts or (if P1 is active) in shared
memory.

**Attribution**: A better LLM might solve the rediscovered problem faster,
but it still wastes turns rediscovering it. Only the methodology (via shared
memory or better artifact completeness) prevents the rediscovery entirely.

### M2 — Drift rate

**What**: How many traceability violations appear per N agent sessions?

**How to measure**: Run pr-review checks on agent-produced PRs. Count
violations: missing front-matter, spec-code divergence, capability scope
creep, cross-boundary edits.

**Attribution**: A better LLM might produce fewer accidental violations,
but the methodology is what defines what constitutes a violation and
enforces the check. The delta between "LLM with IDD checks" and "LLM
without IDD checks" is methodology contribution.

### M3 — Fix-forward compliance

**What**: When a defect is found, does the agent update the spec before fixing
the code?

**How to measure**: In bug-fix sessions, check whether spec artifacts are
modified before or simultaneously with implementation artifacts. Score as:
compliant (spec first), partial (spec and code together), non-compliant
(code only).

**Attribution**: Fix-forward is a methodology discipline. A better LLM
might produce better code fixes, but only the methodology dictates the
order of operations. This metric is almost purely methodology-attributable.

### M4 — Budget efficiency

**What**: What fraction of an agent's turns produce artifacts that survive to
certification?

**How to measure**: Compare total turns in execution trace to artifacts that
appear in final certification evidence. Turns that produced discarded work,
rediscovered facts, or explored dead ends are "waste."

**Attribution**: A better LLM reduces waste by making better decisions per
turn. But action budgets (P2) and shared memory (P1) reduce waste by
preventing unnecessary exploration. The methodology contribution is the
delta between budgeted+memory sessions and unbounded sessions on the same
model.

### M5 — Handoff fidelity

**What**: How much context is lost when work transfers between roles?

**How to measure**: After a handoff, count how many turns the receiving role
spends re-establishing context that the sending role already had. Compare
with-protocol (P6) to without-protocol.

**Attribution**: LLM capability affects how well an agent reconstructs
context from artifacts. But the handoff protocol determines how much
context is explicitly transferred. The delta is methodology contribution.

## Experimental design

### Baseline comparison

For each metric, establish a baseline:
1. Same task, same model, no IDD methodology (just the LLM + harness)
2. Same task, same model, with IDD methodology
3. Same task, same model, with IDD + candidate primitive

This three-way comparison separates:
- (2 vs 1) = IDD methodology contribution
- (3 vs 2) = candidate primitive contribution
- (3 vs 1) = total methodology contribution

### Controlling for model changes

When the underlying model changes, re-run baselines on the same task set.
The absolute numbers will change, but the ratios should remain stable if
the methodology contribution is real.

If a model upgrade eliminates the delta (e.g., the model naturally does
fix-forward without prompting), that's signal that the primitive is now
redundant — which is useful information.

### Task set

Start with a small, repeatable set of IDD tasks:
1. New capability: persona -> journey -> story -> feature -> contract -> implementation
2. Bug fix: defect report -> diagnosis -> spec update -> code fix -> evidence
3. Contract change: upstream story change -> contract update -> implementation update
4. Multi-role delivery: narrative-role -> contract-role -> implementation-role handoffs

These four cover the primary IDD workflows and exercise different primitives.

## Relationship to primitive proposals

| Metric | Primary primitive tested | Secondary primitives |
|--------|------------------------|---------------------|
| M1 Rediscovery rate | P1 Shared Memory | P3 Observation Frame |
| M2 Drift rate | (baseline IDD) | P4 Hypothesis Lifecycle |
| M3 Fix-forward compliance | P4 Hypothesis Lifecycle | (baseline IDD) |
| M4 Budget efficiency | P2 Action Budget | P1 Shared Memory |
| M5 Handoff fidelity | P6 Handoff Protocol | P5 Execution Trace |

## What success looks like

The exploration succeeds if we can say, with evidence:

- "IDD methodology produces X% less drift than raw LLM execution, and this
  ratio holds across model versions A, B, and C."
- "Adding primitive Pn to IDD produces Y% improvement in metric Mn, and this
  improvement is not explained by model capability alone."

The exploration fails (also usefully) if we discover:

- "The methodology's contribution is small relative to model improvements."
- "Primitive Pn adds overhead without measurable improvement."
- "The attribution question cannot be answered with available tooling."

All three failure modes are valuable — they tell us where to invest.

## Next steps

1. Define the reference task set in enough detail to be repeatable.
2. Run baselines (no IDD, with IDD, with IDD + P4) on the current model.
3. Record execution traces (even informally) for the baseline runs.
4. Compute M1-M5 for each condition.
5. Write up findings as evidence in the relevant primitive proposals.
