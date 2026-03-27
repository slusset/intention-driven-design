# Methodology Improvement Proposal

## Summary

- Title: P1 — Shared Memory as Knowledge Artifact
- Status: exploratory
- Owner: Ted Slusser
- Date: 2026-03-27

## Intent

- What problem in the methodology are we addressing?
  Multi-agent IDD sessions rediscover the same facts repeatedly. An
  implementation-role agent encounters a constraint, works around it, and the
  next agent (or the same agent in a new session) encounters it again with no
  memory of the prior resolution. This wastes action budget and introduces
  inconsistent workarounds.

- What decision or outcome should this improve?
  Agents should be able to query accumulated operational knowledge before acting.
  The methodology should distinguish between declared intent artifacts (specs/)
  and discovered operational facts (things learned during execution that aren't
  intent but are critical for future work).

- Why is the current approach insufficient?
  IDD's artifact spine traces intent. Certification captures outcomes. Neither
  captures the intermediate discoveries agents make during execution: API
  quirks, undocumented invariants, performance cliffs, tooling gotchas. These
  live in agent context windows and vanish between sessions.

## Scope

- Affected docs: concepts.md (new concept), self-evolving-ecosystem.md
- Affected skills: idd-workflow (memory query step), certification (memory as
  evidence source)
- Affected tools or CI: potential memory store integration
- Governance impact: memory entries need a confidence classification
  (confirmed vs hypothesis) to prevent unverified claims from becoming doctrine

## Proposed change

- What is the new practice, rule, or artifact?
  A structured knowledge ledger that agents write to during execution and query
  before acting. Each entry has:
  - summary (one-line, scannable)
  - details (full context, explicit CONFIRMED vs HYPOTHESIS tags)
  - source (which role/session produced it)
  - scope (which capability or boundary it applies to)
  - timestamp and expiry policy

- What remains unchanged?
  The artifact spine. Specs still declare intent. Contracts still define
  boundaries. Memory does not replace any existing artifact — it captures a
  different kind of knowledge (discovered facts about the system-as-built).

- Why is this the smallest useful change?
  Without shared memory, every other primitive (hypothesis lifecycle, action
  budgets, observation frames) operates without cumulative learning. Memory is
  what closes the self-improvement loop.

## Evaluation plan

- Harness or environment: IDD skill sessions on a reference project
- Scenarios to test:
  - Agent A discovers an API constraint; Agent B (different session) encounters
    the same constraint. Does B query memory and avoid rediscovery?
  - Memory entries with HYPOTHESIS tag: do agents treat them differently from
    CONFIRMED entries?
  - Memory pollution: does an incorrect entry propagate errors, and how is it
    corrected?
- Failure modes to watch:
  - Memory becomes a dump of unstructured notes (no discipline)
  - Agents trust HYPOTHESIS entries as fact
  - Memory grows without pruning and becomes noise
- Signals or metrics:
  - Rediscovery rate: how often do agents re-encounter known facts?
  - Time-to-productive-action: how quickly does an agent reach its first
    meaningful change after session start?
  - Memory accuracy: ratio of CONFIRMED entries that remain valid over time

## Worked example

- Not yet run. First experiment should use two sequential IDD sessions on the
  same capability, measuring whether the second session avoids rediscovery of
  constraints found in the first.

## Evidence

- ARC-AGI-3 Agentica template uses a `Memories` class (thread-safe, NLP-queryable,
  CONFIRMED/HYPOTHESIS separation) shared across all subagents. Agents query
  before acting. This is a working implementation of the pattern in a different
  domain.
- No IDD-specific evidence yet.

## Promotion decision

- Recommended state after this PR: exploratory
- Human approval required: yes, before any promotion
- Follow-up needed before promotion: at least one worked example with
  measurable rediscovery reduction
