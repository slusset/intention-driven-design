# Self-Evolving Engineering Ecosystem

This note describes how Intention-Driven Design can act as the control plane for
a persistent, self-improving engineering environment.

IDD remains the methodology. The runtime and adaptive layers are optional
operating environment choices that help agents execute the methodology at
scale.

## Three-layer model

### 1. Seed structure

IDD is the seed structure. It defines the artifact grammar that turns human
intent into executable work:

```
Intent → Journey → Story → Feature → Contract → Verification → Certification
```

This layer provides:

- traceability from goals to implementation
- structured decomposition of work
- verifiable outcomes

Without this layer, agents optimize locally and drift.

### 2. Runtime nervous system

A persistent runtime coordinates agents, tools, and workflows over time.

This runtime is responsible for:

- agent supervision
- task orchestration
- workflow execution
- tool integration
- state persistence
- event logging

BEAM is one plausible fit because it offers lightweight concurrency,
supervision trees, message-driven coordination, and fault tolerance. It is an
implementation option, not an IDD requirement.

### 3. Adaptive substrate

A world model or similar learned system provides adaptive understanding of the
environment:

- system behavior
- tool capabilities
- workflow outcomes
- error patterns
- emergent system properties

This layer helps agents:

- predict outcomes
- detect anomalies
- compare strategies
- improve tools and workflows

It does not replace explicit engineering artifacts. It augments them.

## Self-improvement loop

The ecosystem improves through a closed loop:

```text
intent
↓
artifact formation
↓
agent execution
↓
environmental feedback
↓
verification
↓
learning and adaptation
↓
improved tooling and workflows
↓
stronger manifestation of intent
```

Each stage must remain legible to the IDD artifact spine.

## Role of agent contracts

Agent roles make the loop governable.

Each active role should declare:

- owned boundary
- required inputs
- decisions it may make autonomously
- outputs it must produce
- invariants it must preserve
- handoff target
- success evidence

See [Agent Role](agent-role.md) and the reusable template at
[docs/idd/templates/agent-role-contract.yaml](templates/agent-role-contract.yaml).

## Governance guardrails

Self-evolving systems need stable constraints:

1. Intent clarity
   Every change must trace to explicit intent artifacts.
2. Verification rigor
   Changes must pass structured verification, not narrative confidence.
3. Human oversight
   Humans approve major structural, methodological, or governance changes.

These guardrails prevent:

- uncontrolled optimization
- architectural drift
- loss of coherence

## What belongs in this repo now

Within this methodology repository, the practical next steps are:

1. Define agent roles as reusable contracts.
2. Extend workflow skills to require role contracts for delegated work.
3. Teach PR review to flag cross-boundary drift.
4. Define improvement proposals as first-class artifacts before automating them.
5. Explore candidate primitives that operationalize the self-improvement loop.
6. Build evaluation methods that attribute improvement to the methodology
   independently of model and harness changes.

## Active exploration

The `explore/methodology-attribution` branch investigates six candidate
primitives for the runtime and adaptive layers:

- **Shared Memory** (P1) — cross-agent knowledge persistence
- **Action Budget** (P2) — bounded resource envelopes on role contracts
- **Observation Frame** (P3) — structured perception of methodology state
- **Hypothesis Lifecycle** (P4) — epistemic discipline for handling uncertainty
- **Execution Trace** (P5) — process evidence alongside outcome evidence
- **Handoff Protocol** (P6) — structured transitions between roles

These follow the methodology-change-process: exploratory first, promoted only
with evidence and human approval. See [explorations/](explorations/) for
proposals and evaluation design.

## What does not belong here yet

This repository should not hard-code a specific persistent runtime, agent
framework, or world model implementation. Those belong in downstream systems or
reference implementations once the methodology contracts are stable.
