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

## Technical Skill Discovery And Selection

Use a hybrid model: convention for discovery, explicit config for selection, repo inference as fallback.

### Selection Precedence

Resolve stack-specific implementation skills in this order:

1. `specs/skills/repo-overlay.md`
   - Preferred source of truth for backend, frontend, mobile, SDK, infrastructure, test, and design-to-code skill mapping.
2. Explicit `AGENTS.md` instructions
   - Use when the repo has hard requirements that override general conventions.
3. Discovered repo-local technical skills
   - Scan `technical-skills/*/SKILL.md` and treat each directory as an available candidate skill.
4. Repo implementation signals
   - Infer likely stack matches from files such as `package.json`, `angular.json`, `pom.xml`, `build.gradle`, `playwright.config.*`, OpenAPI/codegen configs, or other obvious framework markers.
5. User clarification
   - Ask only when multiple plausible skills remain and choosing the wrong one would likely cause drift.

### Discovery Procedure

1. Scan `technical-skills/` for available skill directories.
2. Extract each candidate's:
   - skill name
   - description
   - likely domain (`backend`, `frontend`, `mobile`, `sdk`, `design-to-code`, `e2e`, `infra`, or `cross-cutting`)
   - likely framework or stack keywords
3. Read `repo-overlay` mappings when present and bind implementation areas to explicit skills.
4. If no explicit mapping exists, inspect repo signals and rank candidates by fit.
5. If exactly one candidate clearly matches an area, select it.
6. If multiple candidates plausibly match, present the best options briefly and ask once.
7. If no dedicated skill matches, continue with a generic implementation checklist plus repo architecture docs and test commands.

### Repo Signal Examples

- `angular.json` or Angular workspace scripts → prefer Angular frontend skills
- `pom.xml` with Spring Boot dependencies → prefer Spring Boot backend skill
- `playwright.config.*` plus Angular frontend → prefer Angular Playwright for Angular-specific e2e work
- OpenAPI generator config or generated client directories → include SDK/codegen workflow constraints in downstream prompts

### Output Contract For Selection

Always produce a concrete result for each relevant area:

- selected skill
- selection source (`overlay`, `agents`, `discovered+inferred`, or `user`)
- supporting evidence (for example: matching repo files, overlay mapping, or explicit instruction)
- fallback plan when no dedicated skill exists

Discovery answers "what skills are available." Selection answers "which one should be used here."

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
| Contract ready | Backend implementation | Resolved backend technical skill |
| Contract ready | Frontend implementation | Resolved frontend technical skill |
| Design mockup/HTML | UI components | Your frontend-from-design skill |
| Journey + contract | E2E test coverage | `/e2e-journey-testing` |
| Bug report / defect | Spec + fix + evidence | `/idd-workflow fix` |
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

2. Create capability scope stub
   ├── Create specs/capabilities/{name}.capability.yaml
   ├── Fill `id`, `type`, `description`
   ├── Declare which personas, journeys, and stories are in scope
   └── Output: capability stub in specs/capabilities/

3. /domain-modeling
   ├── Identify entities and value objects
   ├── Define business rules
   ├── Document lifecycles
   └── Output: specs/models/

4. /behavior-contract
   ├── Write Gherkin feature files
   ├── Define OpenAPI contract
   ├── Create test fixtures
   ├── Finalize the capability scope with models, features, and contracts
   └── Output: specs/features/, specs/contracts/, specs/fixtures/ + finalized capability scope

5. Resolve implementation skills
   ├── Scan `technical-skills/`
   ├── Apply overlay/AGENTS mappings if present
   ├── Infer defaults from repo signals if mappings are absent
   ├── Ask only if multiple plausible matches remain
   └── Output: selected stack-specific skills + fallback assumptions

6. Define agent roles when using delegated or parallel execution
   ├── Assign each role an owned boundary and allowed write scope
   ├── Declare required upstream artifacts and preserved invariants
   ├── Define expected outputs and handoff target
   └── Route cross-boundary ambiguity back to the relevant upstream skill

7. Implementation (parallel, stack-specific)
   ├── Selected backend skill → backend/
   ├── Selected frontend skill → frontend/
   └── If no dedicated skill exists, follow repo architecture docs + generic implementation checklist

8. /e2e-journey-testing
   ├── Create journey map
   ├── Implement Playwright tests
   └── Output: specs/journey-maps/, frontend/e2e/

9. /certification
   ├── Verify capability scope is complete
   ├── Collect test evidence
   ├── Generate evidence manifest (references capability file)
   ├── Verify traceability chain
   └── Output: CI evidence report (job summary, PR comment, workflow
       artifact) — generated via .idd/evidence/, never committed
```

### Modifying Existing Features

```
0. Repo preflight (required)
   ├── Load AGENTS.md + repo overlay
   ├── If overlay missing, warn once and proceed with fallback assumptions
   └── Apply repo constraints to all downstream changes

1. Identify the change scope:
   - UI only? → Resolve frontend technical skill
   - API change? → /behavior-contract first, then resolve affected implementation skills
   - New behavior? → /solution-narrative to update story, then cascade

2. Update specs first:
   - Story changes → /solution-narrative
   - Model changes → /domain-modeling
   - Contract changes → /behavior-contract

3. Resolve implementation skills:
   - Overlay mapping first
   - `AGENTS.md` explicit requirements second
   - `technical-skills/` discovery + repo inference third
   - Ask once only if still ambiguous

4. Implement changes:
   - Backend → Selected backend technical skill or generic backend checklist
   - Frontend → Selected frontend technical skill or generic frontend checklist
   - Delegated work → define role contracts before parallel edits

5. Update tests:
   - Journey affected? → /e2e-journey-testing

6. Re-run `/certification` if capability scope changed — the next CI evidence report picks up the new scope.
```

### Bug Fixes (Fix Forward)

Bug fixes follow the Fix Forward principle (C13): fix the spec first, then the code.

```
1. Reproduce the defect
   ├── Start from the failing test, bug report, or user journey break
   ├── Identify the observable behavior that is wrong
   └── Capture which artifact or environment exposed it

2. Trace back to the nearest intent artifact
   ├── Journey missing or wrong? → inspect `specs/journeys/` and `specs/stories/`
   ├── Business rule or lifecycle missing? → inspect `specs/models/`
   ├── Scenario, API behavior, or fixture missing? → inspect `specs/features/`, `specs/contracts/`, and `specs/fixtures/`
   └── Journey-map or e2e expectation wrong? → inspect `specs/journey-maps/` and e2e sources

3. Identify the spec gap and invoke the right skill
   ├── Missing journey step, persona context, or story intent → `/solution-narrative`
   ├── Missing entity, invariant, state transition, or rule → `/domain-modeling`
   ├── Missing scenario, contract behavior, or fixture → `/behavior-contract`
   ├── Missing journey-map step or e2e assertion → `/e2e-journey-testing`
   └── If the spec is already correct, record that the gap is implementation-only and preserve the current spec

4. Update spec artifacts first
   ├── Add or correct the missing narrative/model/contract artifact
   ├── Update capability scope if new models, features, contracts, or journeys enter scope
   └── Re-check traceability before touching implementation

5. Implement the fix to match the updated spec
   ├── Resolve the appropriate technical skill using the repo overlay / discovery flow
   ├── Change code only after the spec describes the corrected behavior
   └── Add or update the validating tests that prove the repaired behavior

6. Recertify
   ├── Re-run the relevant verification layer(s)
   ├── Regenerate evidence via `/certification` — the CI evidence report is the published record
   └── Confirm the repaired gap is now represented in both traceability and evidence
```

**Never fix code without updating the spec.** Fixing code without updating specs is drift — the single most common way systems lose alignment with their intent.
Always apply repo overlay constraints while fixing forward (for example, architecture boundaries and test pyramid policy).

If multiple actors are involved in the repair, assign explicit role contracts so
each fix-forward step has a bounded owner.

### Fix Forward Skill Routing

Use this decision table when a defect is discovered:

| Gap Found | Primary Skill | Expected Artifact Update |
|-----------|---------------|--------------------------|
| Journey step, user intent, or story coverage missing | `/solution-narrative` | `specs/personas/`, `specs/journeys/`, `specs/stories/` |
| Business rule, invariant, aggregate boundary, or lifecycle missing | `/domain-modeling` | `specs/models/` |
| Scenario, API contract, error behavior, or fixture missing | `/behavior-contract` | `specs/features/`, `specs/contracts/`, `specs/fixtures/` |
| Journey-map step or e2e assertion missing | `/e2e-journey-testing` | `specs/journey-maps/`, `frontend/e2e/` |
| Spec is correct and code is wrong | Resolved technical skill | implementation + tests |
| Evidence out of date after the repair | `/certification` | CI evidence report (regenerated) |

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

.idd/evidence/                  ← Evidence layer (gitignored — generated, never committed)
└── {capability}/
    ├── evidence.yaml           ← Manifest linking tests to intent
    └── reports/                ← Raw test output

Published record: the CI evidence report — job summary + PR comment
rendered by the idd-check action, manifests attached as the
`idd-evidence` workflow artifact.
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
5. Have certification evidence published in the CI report

**Q: Can I skip the narrative layer for small changes?**
A: For pure bug fixes or minor UI tweaks, yes. For anything that changes behavior, no — update the spec first. When in doubt, ask: "Would someone need to update the feature file for this?"

**Q: What if the repo overlay file is missing?**
A: Warn once, explain what the overlay controls, offer to scaffold it, then continue with explicit fallback assumptions. If the user chooses to proceed without one, remember that decision for the rest of the session and stop re-warning unless they ask to revisit it.

**Q: What technology stacks does IDD support?**
A: The narrative, model, and contract layers are completely stack-agnostic. Implementation skills are interchangeable — add or swap skills for any backend/frontend framework. The `specs/` directory is portable across any technology choice.

**Q: How should technical skills be discovered?**
A: Discover by convention from `technical-skills/*/SKILL.md`, but do not stop there. Use the repo overlay as the preferred source of truth for which discovered skills are authoritative, then fall back to `AGENTS.md`, repo-file inference, and finally a brief user clarification only when ambiguity remains.

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
        ├────────── define role contracts when delegating
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
- **Agent role extension**: `docs/idd/agent-role.md`
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
- `technical_skills_discovered` (list of repo-local candidates with area/framework hints)
- `technical_skill_selection` (chosen skill per area with selection source and evidence)
- `agent_roles` (role contracts with owner, scope, invariants, outputs, and handoff target)
- `skills_selected` (ordered list for this task)
- `blocking_issues` (true blockers only; missing overlay alone does not belong here)

If `repo_overlay_status=missing-warned`, continue orchestration after surfacing the warning and scaffold offer. If `repo_overlay_status=skipped`, continue without re-warning in the same session unless the user asks to revisit the overlay.
