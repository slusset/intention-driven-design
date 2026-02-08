# Skill Harmonization Manifest

## Scope

This manifest documents the initial unification of:
- `~/.codex/skills`
- `~/.claude/skills`

into canonical repository state under `skills/`.

## Canonical selection rule (initial pass)

- Use `~/.codex/skills` as baseline because files are generally newer and include richer operational guidance.
- Keep `.system/` skills in the repository, but treat them as platform/system extensions.
- Track divergent files and revisit if downstream tool compatibility issues are discovered.

## Diff summary from initial pass

- Present only in Codex:
  - `.system/`
  - `angular-playwright/`
- Same skill present in both with differing `SKILL.md`:
  - `angular-architecture`
  - `angular-from-design`
  - `behavior-contract`
  - `e2e-journey-testing`
  - `solution-narrative`
  - `spring-boot-architecture`
  - `workflow-guide`
- No observed differences:
  - `domain-modeling`
  - non-`SKILL.md` support files under `angular-from-design/`

## Transcript-derived formalization

The shared transcript explicitly proposed three outputs. They are now formalized as:
- `docs/idd/manifesto.md`
- `docs/idd/project-template.md`
- `docs/idd/agent-operating-contract.md`

## Next merge policy

1. Make skill updates in this repo first.
2. Validate impacts in both Codex and Claude runtimes.
3. Sync outward with `tools/sync-skills.sh`.
4. Re-run diff checks and update this manifest when conflicts arise.
