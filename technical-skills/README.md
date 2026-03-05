# Technical Skills

Technical skills are the stack-specific layer that plugs into IDD after `/behavior-contract` and before `/e2e-journey-testing`.

Use this directory for framework, platform, SDK, and tooling guidance that is specific to implementation work. These skills are intentionally orthogonal to the core IDD skills in `skills/`.

## Discovery Convention

`idd-workflow` discovers repo-local technical skills by scanning:

```text
technical-skills/*/SKILL.md
```

Each subdirectory under `technical-skills/` is treated as one candidate skill.

Examples in this repo:

- `technical-skills/angular-architecture/SKILL.md`
- `technical-skills/angular-from-design/SKILL.md`
- `technical-skills/angular-playwright/SKILL.md`
- `technical-skills/spring-boot-architecture/SKILL.md`

## How Selection Works

Discovery is not the same as selection.

`idd-workflow` resolves which technical skill to use in this order:

1. `specs/skills/repo-overlay.md`
2. Explicit `AGENTS.md` instructions
3. Discovered skills in `technical-skills/`
4. Repo signals such as `angular.json`, `package.json`, `pom.xml`, `build.gradle`, `playwright.config.*`, or codegen config
5. User clarification if ambiguity remains

If no dedicated skill matches, the agent should continue with repo architecture docs, repo test commands, and a generic implementation checklist instead of blocking.

## Adding A New Technical Skill

1. Create a new directory under `technical-skills/`.
2. Add a `SKILL.md` file.
3. Give the skill a clear name and description that make its stack and responsibility obvious.
4. State when to use it, what repo signals it expects, and which test commands or libraries it should prefer.
5. Keep the skill focused on implementation concerns, not on replacing the narrative, model, or contract layers.

Recommended directory shape:

```text
technical-skills/
└── your-skill-name/
    └── SKILL.md
```

Optional supporting assets:

```text
technical-skills/
└── your-skill-name/
    ├── SKILL.md
    ├── templates/
    ├── patterns/
    └── examples/
```

## Minimal Skill Template

```md
---
name: your-skill-name
description: "What this stack-specific skill does and when to use it."
argument-hint: "[feature, module, or task]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Your Skill Title

## When to use

- Use for ...

## Workflow

1. Read the relevant repo architecture docs.
2. Follow stack-specific implementation boundaries.
3. Use the repo's required test commands and libraries.

## Validation

- Run ...
```

## Authoring Guidelines

- Prefer one skill per clear responsibility area, such as backend architecture, frontend architecture, SDK generation, design-to-code, or framework-specific e2e testing.
- Name skills by stack plus responsibility, for example `spring-boot-architecture` or `angular-playwright`.
- Include concrete test commands when the stack has standard validation flows.
- Reference repo architecture docs, ADRs, or generated-code workflows when those constraints matter.
- Avoid duplicating core IDD guidance that already belongs in `skills/`.

## Repo Integration

To make a new technical skill reliably selectable in a target repo:

1. Install or link the skill into the agent's skill path.
2. Add it to `technical-skills/` in the repo.
3. Declare it in `specs/skills/repo-overlay.md` when the repo wants that skill to be the preferred choice for a specific area.

That gives the agent both discovery and an explicit selection signal.
