---
name: idd-workflow
description: "Meta-skill explaining when to use each development skill. Use when starting new work, onboarding, or unsure which skill applies to a task."
user-invocable: true
disable-model-invocation: true
argument-hint: "[topic or situation]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Development Workflow Guide

## Overview

This project follows **Intention-Driven Development**. We start with human needs and work down to code, maintaining traceability at every step. The narrative, model, and contract layers are stack-agnostic — implementation skills can be swapped for any technology.

## Required Preflight: Repo Overlay Check

Before applying any workflow step, load repo-specific constraints from the repository overlay.

1. Resolve overlay path in this order:
   - Path explicitly declared in `AGENTS.md` (for example: `Repo overlay: specs/skills/repo-overlay.md`)
   - Fallback default: `specs/skills/repo-overlay.md`
2. If the overlay exists, read it before selecting or invoking downstream skills.
3. If the overlay is missing, warn but continue.
   - Explain what the overlay is: a repo-local map of preferred stack skills, architecture rules, test commands/libraries, SDK/client generation workflow, and CI expectations.
   - Report which path was attempted.
   - Offer to scaffold one now by asking a few short questions.
   - If the user declines, continue with `AGENTS.md`, repo docs, and explicit assumptions as fallback.
4. Do not repeat the same missing-overlay warning on every invocation within the same session.
   - Mark the first pass as `missing-warned`.
   - If the user explicitly chooses to continue without scaffolding, mark the repo as `skipped` for the remainder of the session unless they ask to revisit it.
5. Carry overlay constraints forward into all downstream skill prompts (architecture, tests, certification, CI expectations). If no overlay exists, carry forward the fallback assumptions you made.

This preflight check is required for reliable orchestration and prevents architecture/test-policy drift, but a missing overlay is not itself a blocker.

### Overlay Scaffold Questions

When scaffolding `specs/skills/repo-overlay.md`, ask only enough to capture the repo's operational constraints:

1. Which backend, frontend, mobile, infra, or SDK stacks are in play?
2. Which stack-specific skills should be preferred for each area?
3. Which architecture docs, ADRs, or module boundaries are authoritative?
4. Which test commands and libraries are required for unit, integration, contract, and e2e coverage?
5. Are there SDK/client generation steps, mock servers, or schema-driven test tools that implementation skills must honor?
6. What CI or certification expectations must every downstream skill preserve?

If the user wants a starting point, scaffold from `skills/idd-workflow/templates/repo-overlay-template.md` into `specs/skills/repo-overlay.md` and fill the known fields first.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         NARRATIVE LAYER                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │  Personas   │───▶│  Journeys   │───▶│   Stories   │                    │
│  │  (who/why)  │    │ (experience)│    │   (what)    │                    │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                    │
│                                               │                           │
│                        /solution-narrative    │                           │
├───────────────────────────────────────────────┼───────────────────────────┤
│                       CAPABILITY SCOPE        │                           │
│                                               ▼                           │
│                                   ┌───────────────────┐                   │
│                                   │   Capability      │                   │
│                                   │  (cert boundary)  │                   │
│                                   └────────┬──────────┘                   │
│                                            │                              │
│               specs/capabilities/          │                              │
├────────────────────────────────────────────┼──────────────────────────────┤
│                         MODEL LAYER        │                              │
│                                            ▼                              │
│                                        ┌─────────────┐                    │
│                                        │   Models    │                    │
│                                        │ (concepts)  │                    │
│                                        └──────┬──────┘                    │
│                                               │                           │
│                         /domain-modeling      │                           │
├───────────────────────────────────────────────┼───────────────────────────┤
│                        CONTRACT LAYER         │                           │
│                                               ▼                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │  Features   │◀───│  Contract   │───▶│  Fixtures   │                    │
│  │  (Gherkin)  │    │  (OpenAPI)  │    │ (test data) │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                           │
│                        /behavior-contract                                 │
├───────────────────────────────────────────────────────────────────────────┤
│                      IMPLEMENTATION LAYER  (stack-specific)               │
│                                                                           │
│  ┌─────────────────────────┐    ┌─────────────────────────┐               │
│  │        Backend          │    │        Frontend         │               │
│  │     (any framework)     │◀──▶│     (any framework)     │               │
│  └─────────────────────────┘    └─────────────────────────┘               │
│                                                                           │
│  Implementation skills are stack-specific and interchangeable.            │
│  Examples: /spring-boot-architecture, /angular-architecture,              │
│  /angular-from-design — or your own stack's equivalent.                   │
│                                                                           │
├───────────────────────────────────────────────────────────────────────────┤
│                        VALIDATION LAYER                                   │
│                                                                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │ Unit Tests  │    │ Integration │    │  E2E Tests  │                    │
│  │  (domain)   │    │  (contract) │    │ (journeys)  │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                           │
│                        /e2e-journey-testing                               │
├───────────────────────────────────────────────────────────────────────────┤
│                      CERTIFICATION LAYER                                  │
│                                                                           │
│  Evidence manifest ── references capability ── published before merge     │
│                                                                           │
│                        /certification                                     │
├───────────────────────────────────────────────────────────────────────────┤
│                        PR REVIEW GATE                                     │
│                                                                           │
│  CI checks ── traceability + front-matter + scope ── blocks merge on fail │
│  Agent review ── semantic alignment ── advisory comments                  │
│                                                                           │
│                        /pr-review + .github/workflows/idd-check.yml       │
└───────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference: Which Skill?

| You Have | You Need | Use Skill |
|----------|----------|-----------|
| New feature request | Requirements captured | `/solution-narrative` |
| Journeys and stories | Capability scope defined | Define `specs/capabilities/` |
| Journeys and stories | Domain concepts defined | `/domain-modeling` |
| Stories and models | API contract + Gherkin | `/behavior-contract` |
| Contract ready | Backend implementation | Your backend architecture skill |
| Contract ready | Frontend implementation | Your frontend architecture skill |
| Design mockup/HTML | UI components | Your frontend-from-design skill |
| Journey + contract | E2E test coverage | `/e2e-journey-testing` |
| All tests passing | Certifiable evidence | `/certification` |
| PR open, need compliance check | IDD compliance verified | `/pr-review` (or CI auto) |
| Unsure where to start | This guide | `/idd-workflow` |

## Detailed Workflow

### Starting a New Capability

```
0. Repo preflight (required)
   ├── Load AGENTS.md in target repo
   ├── Resolve and load repo overlay (see Required Preflight)
   ├── If missing, warn once, offer scaffold, then continue
   └── Output: loaded repo constraints or fallback assumptions

1. /solution-narrative
   ├── Create or review persona
   ├── Map the user journey
   ├── Extract user stories
   └── Output: specs/personas/, specs/journeys/, specs/stories/

2. Define capability scope
   ├── Create specs/capabilities/{name}.capability.yaml
   ├── Declare which personas, journeys, stories are in scope
   ├── Scope grows as features/contracts/models are added
   └── Output: specs/capabilities/

3. /domain-modeling
   ├── Identify entities and value objects
   ├── Define business rules
   ├── Document lifecycles
   └── Output: specs/models/

4. /behavior-contract
   ├── Write Gherkin feature files
   ├── Define OpenAPI contract
   ├── Create test fixtures
   ├── Update capability scope with new features/contracts
   └── Output: specs/features/, specs/contracts/, specs/fixtures/

5. Implementation (parallel, stack-specific)
   ├── Backend architecture skill → backend/
   └── Frontend architecture skill → frontend/

6. /e2e-journey-testing
   ├── Create journey map
   ├── Implement Playwright tests
   └── Output: specs/journey-maps/, frontend/e2e/

7. /certification
   ├── Verify capability scope is complete
   ├── Collect test evidence
   ├── Generate evidence manifest (references capability file)
   ├── Verify traceability chain
   └── Output: certification/{capability}/
```

### Modifying Existing Features

```
0. Repo preflight (required)
   ├── Load AGENTS.md + repo overlay
   ├── If overlay missing, warn once and proceed with fallback assumptions
   └── Apply repo constraints to all downstream changes

1. Identify the change scope:
   - UI only? → Frontend architecture skill
   - API change? → /behavior-contract first, then both architecture skills
   - New behavior? → /solution-narrative to update story, then cascade

2. Update specs first:
   - Story changes → /solution-narrative
   - Model changes → /domain-modeling
   - Contract changes → /behavior-contract

3. Implement changes:
   - Backend → Backend architecture skill
   - Frontend → Frontend architecture skill

4. Update tests:
   - Journey affected? → /e2e-journey-testing

5. Update certification evidence if capability scope changed.
```

### Bug Fixes (Fix Forward)

Bug fixes follow the Fix Forward principle (C13): fix the spec first, then the code.

```
1. Identify where the bug manifests:
   - E2E test failing? Check journey map accuracy
   - Integration test failing? Check contract compliance
   - Unit test failing? Check domain logic vs model rules

2. Trace back to spec:
   - Does the feature file cover this case?
   - Is the contract accurate?
   - Is the business rule documented?

3. Fix forward:
   - Add missing scenario to feature file
   - Update contract if API was wrong
   - Fix implementation to match spec
   - Update certification evidence
```

**Never fix code without updating the spec.** Fixing code without updating specs is drift — the single most common way systems lose alignment with their intent.
Always apply repo overlay constraints while fixing forward (for example, architecture boundaries and test pyramid policy).

## Artifact Locations

```
specs/                          ← Source of truth (stack-agnostic)
├── personas/                   ← /solution-narrative
├── journeys/                   ← /solution-narrative
├── stories/                    ← /solution-narrative
├── capabilities/               ← Scope definition (after narrative)
├── models/                     ← /domain-modeling
├── features/                   ← /behavior-contract
├── contracts/openapi/          ← /behavior-contract
├── fixtures/                   ← /behavior-contract
└── journey-maps/               ← /e2e-journey-testing

backend/                        ← Backend architecture skill
├── src/                        ← Implementation from specs/
└── test/                       ← Tests from specs/features/

frontend/                       ← Frontend architecture skill
├── src/                        ← Implementation from specs/
└── e2e/                        ← /e2e-journey-testing

certification/                  ← Evidence layer
└── {capability}/
    ├── evidence.yaml           ← Manifest linking tests to intent
    └── reports/                ← Raw test output
```

## Traceability Requirements

Every implementation artifact should trace back:

```
Code file
  └── Why this code?
      └── Feature scenario
          └── Why this behavior?
              └── User story
                  └── What scope does this belong to?
                      └── Capability definition
                          └── Why this capability?
                              └── Journey step
                                  └── Why this experience?
                                      └── Persona goal
```

**In practice:**
- Feature files reference stories and journeys in comments
- OpenAPI operations have `x-story` and `x-feature` extensions
- Test files have header comments with source references
- Code files can reference feature scenarios in docstrings
- Certification manifests close the chain with evidence

## Common Questions

**Q: I have a design mockup. Where do I start?**
A: If this is a new feature, start with `/solution-narrative` to capture the journey. Then use your frontend-from-design skill to convert the mockup. If it's UI for an existing feature, go straight to the frontend skill.

**Q: The API contract needs to change. What's the process?**
A: Update the story if the capability changed (`/solution-narrative`), update the model if concepts changed (`/domain-modeling`), then update the contract and features (`/behavior-contract`). Finally, update implementations.

**Q: How do I know if my implementation is correct?**
A: It should:
1. Pass all Gherkin scenarios (feature files)
2. Comply with the OpenAPI contract
3. Follow the journey map in e2e tests
4. Respect business rules in the model
5. Have certification evidence committed

**Q: Can I skip the narrative layer for small changes?**
A: For pure bug fixes or minor UI tweaks, yes. For anything that changes behavior, no — update the spec first. When in doubt, ask: "Would someone need to update the feature file for this?"

**Q: What if the repo overlay file is missing?**
A: Warn once, explain what the overlay controls, offer to scaffold it, then continue with explicit fallback assumptions. If the user chooses to proceed without one, remember that decision for the rest of the session and stop re-warning unless they ask to revisit it.

**Q: What technology stacks does IDD support?**
A: The narrative, model, and contract layers are completely stack-agnostic. Implementation skills are interchangeable — add or swap skills for any backend/frontend framework. The `specs/` directory is portable across any technology choice.

## Skill Dependencies

```
solution-narrative              ← Stack-agnostic
        │
        ▼
  domain-modeling               ← Stack-agnostic
        │
        ▼
 behavior-contract              ← Stack-agnostic
        │
        ├──────────────────────┐
        ▼                      ▼
  backend-skill          frontend-skill     ← Stack-specific
        │                      │               (interchangeable)
        └──────────┬───────────┘
                   ▼
         e2e-journey-testing    ← Stack-aware (Playwright)
                   │
                   ▼
          /certification        ← Stack-agnostic (cross-cutting)
                   │
                   ▼
          /pr-review            ← CI gate (cross-cutting)
```

## Getting Help

- **IDD philosophy**: `docs/idd/manifesto.md`
- **Concept definitions**: `docs/idd/concepts.md`
- **Front-matter schema**: `docs/idd/front-matter-spec.md`
- **Certification standards**: `docs/idd/certification-guide.md`
- **PR compliance checks**: `skills/pr-review/SKILL.md`
- **CI workflow**: `.github/workflows/idd-check.yml`
- **Process questions**: This guide (`/idd-workflow`)
- **Specific patterns**: Each skill has templates and examples

## Orchestrator Handoff Contract

When this meta-skill is used by an orchestrator, include these fields in the handoff prompt/context:

- `repo_root`
- `agents_file` (resolved path)
- `repo_overlay_path` (resolved path)
- `repo_overlay_status` (`loaded`, `missing-warned`, or `skipped`)
- `repo_overlay_constraints` (summary bullets when loaded, otherwise the fallback assumptions or open gaps)
- `skills_selected` (ordered list for this task)
- `blocking_issues` (true blockers only; missing overlay alone does not belong here)

If `repo_overlay_status=missing-warned`, continue orchestration after surfacing the warning and scaffold offer. If `repo_overlay_status=skipped`, continue without re-warning in the same session unless the user asks to revisit the overlay.
