# Intention-Driven Design

Single source of truth for IDD philosophy, concepts, and agent skills.

This repo serves two roles:
1. **Concept library** — canonical definitions of every IDD concept, principle,
   and operating rule.
2. **Skill source** — reference skill implementations that embody the concepts
   and can be converted to any agent platform's native format.

## Installation

### 1. Cross-platform skills CLI (recommended)

```bash
npx skills add slusset/intention-driven-design
```

Works with Claude Code, Codex, and any agent that supports the SKILL.md format.

### 2. Git clone

```bash
git clone https://github.com/slusset/intention-driven-design.git
cd intention-driven-design
make install          # both Claude Code and Codex
make install-claude   # Claude Code only
make install-codex    # Codex only
```

### 3. Download from GitHub Releases

Download the latest zip from [Releases](https://github.com/slusset/intention-driven-design/releases), then:

```bash
unzip idd-skills-*.zip
cd idd-skills
./install.sh                      # both agents
./install.sh --agent claude-code  # Claude Code only
./install.sh --agent codex        # Codex only
./install.sh --project            # project-local .claude/skills/
```

### 4. Manual copy

```bash
cp -R skills/* ~/.claude/skills/
cp -R technical-skills/* ~/.claude/skills/
```

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
├── workflow-guide/          Meta-skill: when to use which skill
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
