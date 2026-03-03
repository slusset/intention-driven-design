# Intention-Driven Design

Single source of truth for IDD philosophy, concepts, and agent skills.

This repo serves two roles:
1. **Concept library** — canonical definitions of every IDD concept, principle,
   and operating rule.
2. **Skill source** — reference skill implementations that embody the concepts
   and can be converted to any agent platform's native format.

## Repository layout

```
docs/idd/
├── manifesto.md             Core principles (the "why")
├── agent-operating-contract.md  Non-negotiable agent rules
├── project-template.md      Artifact spine and delivery loop
├── concepts.md              Atomic concept catalog (C1–C14)
└── concept-skill-map.md     Which concepts each skill carries

skills/                      Reference IDD skill implementations
├── solution-narrative/      Personas, journeys, stories
├── domain-modeling/         Entities, aggregates, business rules
├── behavior-contract/       BDD features, OpenAPI contracts, fixtures
├── e2e-journey-testing/     Playwright journey tests
├── idd-workflow/            Meta-skill: when to use which skill
├── .system/                 Platform skills (skill-creator, skill-installer)
└── HARMONIZATION.md         Merge history from initial unification

tools/                       Sync and validation utilities
├── sync-skills.sh           Push skills to agent runtimes
└── diff-skills.sh           Detect drift between runtime copies
```

## How concepts and skills relate

Concepts (`docs/idd/concepts.md`) are the atomic units of IDD philosophy.
Skills (`skills/`) are operational implementations that embody subsets of those
concepts. The mapping between them is tracked in
`docs/idd/concept-skill-map.md`.

When converting a skill to a new agent platform:
1. Check which concepts the skill carries (the map).
2. Use the concept catalog as the acceptance checklist.
3. Ensure no concept is lost or contradicted in translation.

## Source of truth policy

1. Concept definitions in `docs/idd/` are authoritative for meaning.
2. Skills in `skills/` are authoritative for operational implementation.
3. Runtime copies (`~/.codex/skills`, `~/.claude/skills`) are downstream — never edit there first.
4. Proposed changes are committed here, then synced out via `tools/sync-skills.sh`.

## Initial harmonization baseline

- Baseline source: `~/.codex/skills` (newer, richer SKILL.md coverage)
- Additive source: `~/.claude/skills` (used for diff validation)
- Merge details: see `skills/HARMONIZATION.md`
