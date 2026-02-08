# Intention-Driven Design

Single source of truth for intention-driven development artifacts:
- reusable agent skills
- core principles and operating doctrine
- repeatable project scaffolding

## Repository layout

- `skills/`: canonical IDD-focused skills (method, narrative, contracts, workflow)
- `technical-skills/`: technical implementation skills (Angular, Spring, platform-specific)
- `docs/idd/`: formalized method artifacts
- `tools/`: sync/validation utilities

## Source of truth policy

1. `skills/` and `technical-skills/` in this repository are authoritative.
2. Personal runtime folders (`~/.codex/skills`, `~/.claude/skills`) are downstream copies.
3. Proposed skill changes should be committed here first, then synced out.

## Initial harmonization baseline

- Baseline source: `~/.codex/skills` (newer, richer SKILL.md coverage)
- Additive source: `~/.claude/skills` (used for diff validation)
- Merge details: see `skills/HARMONIZATION.md`
