# Explorations

This directory holds exploratory methodology work that has not yet been promoted
to provisional or canonical status.

Everything here follows the methodology-change-process: artifacts begin as
exploratory design notes, earn provisional status with worked examples and
evidence, and become canonical only with explicit human approval.

## Active exploration: Methodology Attribution

**Branch**: `explore/methodology-attribution`
**Core question**: Which IDD primitives produce measurable improvement
independent of LLM capability gains, harness improvements, and tooling changes?

### Why this exploration exists

IDD skills and tools are working well in practice, but the improvement signal is
confounded. Better outcomes could be caused by:

- the methodology (artifact spine, traceability, role contracts)
- better core LLM reasoning (model upgrades)
- better harnesses (tool-calling, context management, IDE integration)
- more practice with the tooling (operator familiarity)

Without controlled attribution, the methodology risks becoming cargo cult — we
follow the rituals because outcomes improved, but we cannot say which rituals
actually mattered.

### What belongs here

- Methodology improvement proposals for candidate primitives
- Evaluation design notes describing how to measure methodology contribution
- Worked examples with before/after evidence
- Decision logs tracking what was tried and what was learned

### What does not belong here

- Changes to canonical IDD docs (those go through normal PR process on main)
- Skill modifications that affect production workflows
- Claims that anything here is "the answer"

### Candidate primitives under investigation

| ID | Primitive | Status | Proposal |
|----|-----------|--------|----------|
| P1 | Shared Memory as Knowledge Artifact | exploratory | [proposal](proposals/P1-shared-memory.md) |
| P2 | Action Budget as Resource Contract | exploratory | [proposal](proposals/P2-action-budget.md) |
| P3 | Observation Frame as Structured Perception | exploratory | [proposal](proposals/P3-observation-frame.md) |
| P4 | Hypothesis Lifecycle as Epistemic Discipline | exploratory | [proposal](proposals/P4-hypothesis-lifecycle.md) |
| P5 | Execution Trace as First-Class Artifact | exploratory | [proposal](proposals/P5-execution-trace.md) |
| P6 | Handoff Protocol as Coordination Primitive | exploratory | [proposal](proposals/P6-handoff-protocol.md) |

### Evaluation approach

See [eval-design.md](eval-design.md) for how we plan to measure methodology
contribution independently of model and harness improvements.
