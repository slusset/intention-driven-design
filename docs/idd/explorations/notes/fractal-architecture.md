# Design Note: Fractal Architecture and the Reasoning-to-Program Spectrum

**Date**: 2026-03-27
**Status**: insight capture — not yet a proposal
**Context**: Emerged during hands-on exploration of Symphony (OpenAI's Elixir/OTP
multi-agent orchestrator) while investigating BEAM as a proving ground for IDD
primitives (see #33).

## The observation

The Sierpinski gasket is not just a visual metaphor for OTP supervision trees —
it is a structural description of how reasoning, learning, and execution relate
in a self-improving agent hierarchy.

A Sierpinski gasket has three properties:
1. **Self-similarity**: the same triangular pattern repeats at every scale
2. **Emergent voids**: the inverted triangles (negative space) are not drawn —
   they appear as a consequence of the recursive rule
3. **Infinite boundary, finite area**: the structure has unbounded complexity
   at its edges but bounded total substance

All three properties map directly to a BEAM-based agent architecture.

## Self-similarity across the supervision hierarchy

In an OTP supervision tree, every level follows the same contract:
- start children
- monitor children
- restart children on failure
- hand off to parent when local strategy is exhausted

If each node in the tree has access to an LLM for reasoning, the same
cognitive loop operates at every scale:

- **Leaf node** (worker): observe task state → hypothesize about approach →
  act → learn from outcome
- **Mid-level supervisor**: observe children's patterns → hypothesize about
  coordination strategy → restructure → learn from system behavior
- **Top-level governance**: observe methodology outcomes → hypothesize about
  policy → adapt governance rules → learn from long-term trends

This is the IDD three-layer ecosystem (`self-evolving-ecosystem.md`) — but
the layers are not stacked. They are **nested**. Each triangle in the gasket
contains all three layers at its own scale:

```
         ╱╲
        ╱  ╲         Governance (intent + policy)
       ╱    ╲
      ╱──────╲
     ╱╲      ╱╲
    ╱  ╲    ╱  ╲     Runtime (execution + coordination)
   ╱    ╲  ╱    ╲
  ╱──────╲╱──────╲
         ╱╲
        ╱  ╲         Adaptive (learning + crystallization)
       ╱    ╲
```

At every level of recursion, the same three concerns are present. A leaf
agent has its own governance (role contract), its own runtime (action
execution), and its own adaptive layer (memory of what worked). A supervisor
has the same three, operating on its children rather than on tasks.

## The reasoning-to-program spectrum

Not every node needs full LLM reasoning at all times. The key insight is that
reasoning is a resource, and learning is the process of **replacing reasoning
with program**:

```
full LLM reasoning  ←→  learned heuristic  ←→  compiled program
     (expensive)          (cheaper)              (near-zero cost)
     (flexible)           (adaptive)             (rigid)
     (novel situations)   (familiar patterns)    (solved problems)
```

A fresh node starts at the left — full reasoning on every decision. As it
accumulates evidence:

1. **P1 (Shared Memory)** captures what was learned
2. **P5 (Execution Trace)** records how decisions were made
3. **P4 (Hypothesis Lifecycle)** classifies patterns as CONFIRMED

When a pattern reaches sufficient confirmation, the node can **replace LLM
reasoning with a deterministic function** for that pattern. On BEAM, this is
operationally trivial — hot code loading allows you to swap a module's
implementation on a running process without stopping it.

This is not optimization in the engineering sense. It is **learning in the
biological sense**: conscious deliberation becoming unconscious competence.
The system compiles its experience into reflexes.

## The meaning of the voids

In the Sierpinski gasket, the inverted triangles (voids) are emergent. No one
draws them — they appear because the recursive rule creates them.

In the agent hierarchy, the voids represent **crystallized knowledge** —
patterns so reliable they no longer require active reasoning:

- **Filled triangles**: active reasoning nodes — still learning, still
  uncertain, still spending cognitive resources
- **Voids**: crystallized patterns — decisions that have been compiled into
  program, requiring no reasoning overhead
- **The boundary between them**: the **learning edge** — where hypotheses
  are being tested, where the system is actively uncertain

The system's growth is not about filling in the voids. The voids are the
*product* of growth. They represent problems that have been solved so
thoroughly that they disappear from the reasoning surface.

A mature system has more void than substance — most behavior is crystallized,
and reasoning concentrates at the edges where novelty lives.

## Connection to BEAM primitives

| Fractal property | BEAM realization |
|-----------------|-----------------|
| Self-similar nodes | Supervisors supervising supervisors, same callbacks at every level |
| Filled triangles (reasoning) | Processes with LLM access, GenServer state evolving through experience |
| Voids (crystallized) | Hot-loaded modules, compiled pattern matches, ETS lookup tables |
| Learning edge | Processes in hypothesis-testing mode, budget-bounded exploration |
| Emergent structure | Supervision tree topology that restructures based on learned patterns |
| Infinite boundary | Each solved problem reveals adjacent unsolved problems |

## Connection to IDD primitives (P1–P6)

Each primitive has a role in the fractal:

- **P1 Shared Memory**: the substrate that persists across node restarts —
  what the filled triangles write and the voids are compiled from
- **P2 Action Budget**: bounds how long a node reasons before crystallizing
  or handing off — prevents infinite exploration at any scale
- **P3 Observation Frame**: how a node at level N perceives the state of
  nodes at level N-1 — the "looking down into the fractal" operation
- **P4 Hypothesis Lifecycle**: the mechanism that moves a pattern from
  "reasoning required" to "crystallized" — the void-creation process
- **P5 Execution Trace**: the record of reasoning that enables
  crystallization — you can't compile a pattern you can't replay
- **P6 Handoff Protocol**: how a node at level N escalates to level N+1
  when local reasoning is insufficient — the "looking up the fractal"
  operation

## What this is not

This is not a proposal to build a Sierpinski-shaped system. The fractal is
a description of the **emergent property** of a self-improving hierarchy,
not a blueprint for one.

The practical implication is: if we build the primitives correctly on BEAM,
the fractal structure should **emerge** from the recursive application of
the same observe-hypothesize-act-learn loop at every level of the
supervision tree.

If it doesn't emerge — if we have to force the structure — that's signal
that the primitives are wrong.

## What this suggests for #33 (BEAM reference implementation)

Phase 1 should build the smallest possible triangle:
- One supervisor with one reasoning child
- The child uses an LLM to solve a task
- The child writes confirmed patterns to ETS
- On restart, the child reads ETS before reasoning
- Measure: does the second attempt reason less than the first?

If yes, the void-creation mechanism works. Then recurse: add a second level,
where the supervisor itself reasons about its children's patterns.

## Open questions

- At what confirmation threshold should a pattern crystallize into program?
  Too early and the system becomes rigid. Too late and it wastes reasoning
  resources.
- Can a crystallized pattern be **de-crystallized** when the environment
  changes? BEAM's hot code loading supports this, but what triggers it?
- Does the reasoning-to-program spectrum have discrete phases or is it
  continuous? Can a node be "partially crystallized" — using a heuristic
  for the common case and falling back to full reasoning for edge cases?
- How does this relate to the Hyperagents paper's concept of agents that
  modify the hierarchy they're part of? Is hierarchy modification a
  special case of crystallization at the supervisor level?
