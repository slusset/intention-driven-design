# Methodology Improvement Proposal

## Summary

- Title: P3 — Observation Frame as Structured Perception
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  Agents interacting with IDD artifacts re-implement their own perception every
  session. One agent reads specs/ by globbing files, another parses YAML
  front-matter, another diffs git history. There is no standardized way for an
  agent to ask: "What is the current state of this capability's artifact spine,
  what changed since last checkpoint, and where are the gaps?"

- What decision or outcome should this improve?
  Agents should have a consistent, structured view of methodology state —
  analogous to a dashboard — that any role can query. This makes agent
  reasoning auditable and comparable across sessions.

- Why is the current approach insufficient?
  Each skill reimplements artifact discovery. The idd-workflow skill has its
  own discovery sequence, pr-review has its own file scanning, certification
  has its own evidence gathering. These are three different lenses on the same
  underlying state, with no guarantee of consistency.

## Scope

- Affected docs: concepts.md (new concept if promoted)
- Affected skills: all skills would consume the frame; a new utility or
  shared module would produce it
- Affected tools or CI: potential CLI tool or skill helper
- Governance impact: minimal — frames are read-only views, not new artifacts

## Proposed change

- What is the new practice, rule, or artifact?
  An observation frame is a structured snapshot of methodology state for a
  given scope (capability, role boundary, or full project). It includes:
  - artifact inventory (what exists, what's missing per the spine)
  - delta since last checkpoint (new, modified, deleted artifacts)
  - gap analysis (missing traceability links, uncovered scenarios)
  - status summary (per-layer completion)

  Frames are computed, not stored. They are the methodology equivalent of
  ARC-AGI-3's `Frame.render()` + `Frame.diff()` + `Frame.change_summary()`.

- What remains unchanged?
  The artifacts themselves. Frames don't create or modify artifacts — they
  provide a consistent lens for reading them.

- Why is this the smallest useful change?
  It standardizes what every skill already does ad-hoc: scan the repo,
  figure out what state things are in, and decide what to do next.

## Evaluation plan

- Harness or environment: compare skill behavior with and without shared frames
- Scenarios to test:
  - Two skills (idd-workflow and pr-review) analyzing the same capability:
    do they reach consistent conclusions about state?
  - Agent given a frame vs agent discovering state ad-hoc: time to first
    productive action
  - Frame accuracy: does the frame correctly identify gaps that the agent
    would otherwise miss?
- Failure modes to watch:
  - Frame becomes stale (computed once, not refreshed)
  - Frame is too coarse (project-level) or too fine (file-level) to be useful
  - Agents over-rely on frame and stop reading actual artifacts
- Signals or metrics:
  - Cross-skill consistency: do different skills agree on artifact state?
  - Discovery time: how long does an agent spend figuring out what exists
    before starting work?
  - Gap detection rate: does frame-based analysis find more gaps than ad-hoc?

## Worked example

- Not yet run. First experiment should produce a frame for a reference
  capability and compare what idd-workflow and pr-review independently
  conclude about that capability's completeness.

## Evidence

- ARC-AGI-3's `Frame` wrapper provides `render()`, `diff()`, `find()`,
  `bounding_box()`, `color_counts()`, and `change_summary()`. Agents never
  reason about raw grid data — they reason through these structured views.
  This pattern directly reduced the reasoning burden on the LLM.
- No IDD-specific evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: working frame implementation for at
  least one capability with cross-skill consistency measurement
