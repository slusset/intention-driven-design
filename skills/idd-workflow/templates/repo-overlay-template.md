# Repo Overlay

Use this file to bind stack-specific skills and repo policies for implementation work. This file is the sole authority for those bindings; IDD does not discover or infer replacement skills. Keep it short, concrete, and repo-specific.

## Repo Summary

- Repo type: `application | library | monorepo | service | mobile | other`
- Primary languages: `...`
- Active stacks:
  - Backend: `...`
  - Frontend: `...`
  - Mobile: `...`
  - Infra/data: `...`
  - SDK/client generation: `...`

## Implementation Skill Bindings

For each area, provide an exact skill identifier and its provider or location. Use `none` when the repository intentionally has no bound skill.

- Backend: skill `/... | none`; provided by `plugin | personal install | repo path`; applies to `...`
- Frontend: skill `/... | none`; provided by `plugin | personal install | repo path`; applies to `...`
- Mobile: skill `/... | none`; provided by `plugin | personal install | repo path`; applies to `...`
- UI from design: skill `/... | none`; provided by `plugin | personal install | repo path`; applies to `...`
- Framework-specific E2E: skill `/... | none`; provided by `plugin | personal install | repo path`; applies to `...`
- Additional bindings:
  - Area: `...`; skill `/...`; provided by `...`; applies to `...`

If a named skill is unavailable, fallback to: `ask | generic checklist | ...`

## Architecture Sources

- Primary architecture docs:
  - `...`
- ADRs or design docs:
  - `...`
- Hard boundaries to preserve:
  - `...`
- Forbidden patterns:
  - `...`

## Test Commands And Libraries

- Backend unit/integration command: `...`
- Frontend unit/component command: `...`
- Contract/API validation command: `...`
- E2E command: `...`
- Required libraries, harnesses, or SDK test tools:
  - `...`

## Build, Codegen, And SDK Workflow

- OpenAPI or schema source of truth: `...`
- SDK/client generation command: `...`
- Mock server or fixture workflow: `...`
- Required generated artifacts to update:
  - `...`

## Delivery Rules

- CI gates that must pass:
  - `...`
- Certification or evidence requirements:
  - `...`
- Branch or PR rules:
  - `...`

## Agent Operating Notes

- When multiple overlay-bound skills apply, prefer: `...`
- Ask before changing foundational tooling: `yes | no`
- Default validation scope after each change:
  - `...`
