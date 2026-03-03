---
name: workflow-guide
description: "Meta-skill explaining when to use each development skill. Use when starting new work, onboarding, or unsure which skill applies to a task."
user-invocable: true
disable-model-invocation: true
argument-hint: "[topic or situation]"
allowed-tools:
  - Read
  - Glob
  - Grep
---

# Development Workflow Guide

## Overview

This project follows **Intention-Driven Development**. We start with human needs and work down to code, maintaining traceability at every step. The narrative, model, and contract layers are stack-agnostic — implementation skills can be swapped for any technology.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         NARRATIVE LAYER                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │  Personas   │───▶│  Journeys   │───▶│   Stories   │                    │
│  │  (who/why)  │    │ (experience)│    │   (what)    │                    │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                    │
│                                               │                            │
│                        /solution-narrative    │                            │
├───────────────────────────────────────────────┼────────────────────────────┤
│                         MODEL LAYER           │                            │
│                                               ▼                            │
│                                        ┌─────────────┐                     │
│                                        │   Models    │                     │
│                                        │ (concepts)  │                     │
│                                        └──────┬──────┘                     │
│                                               │                            │
│                         /domain-modeling      │                            │
├───────────────────────────────────────────────┼────────────────────────────┤
│                        CONTRACT LAYER         │                            │
│                                               ▼                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │  Features   │◀───│  Contract   │───▶│  Fixtures   │                    │
│  │  (Gherkin)  │    │  (OpenAPI)  │    │ (test data) │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                            │
│                        /behavior-contract                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                      IMPLEMENTATION LAYER  (stack-specific)                │
│                                                                            │
│  ┌─────────────────────────┐    ┌─────────────────────────┐               │
│  │        Backend          │    │        Frontend         │               │
│  │     (any framework)     │◀──▶│     (any framework)     │               │
│  └─────────────────────────┘    └─────────────────────────┘               │
│                                                                            │
│  Implementation skills are stack-specific and interchangeable.             │
│  Examples: /spring-boot-architecture, /angular-architecture,              │
│  /angular-from-design — or your own stack's equivalent.                   │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                        VALIDATION LAYER                                    │
│                                                                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │ Unit Tests  │    │ Integration │    │  E2E Tests  │                    │
│  │  (domain)   │    │  (contract) │    │ (journeys)  │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                            │
│                        /e2e-journey-testing                                │
├────────────────────────────────────────────────────────────────────────────┤
│                      CERTIFICATION LAYER                                   │
│                                                                            │
│  Evidence manifest ── tied to intent ── published before merge             │
│                                                                            │
│                   See: docs/idd/certification-guide.md                     │
└────────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference: Which Skill?

| You Have | You Need | Use Skill |
|----------|----------|-----------|
| New feature request | Requirements captured | `/solution-narrative` |
| Journeys and stories | Domain concepts defined | `/domain-modeling` |
| Stories and models | API contract + Gherkin | `/behavior-contract` |
| Contract ready | Backend implementation | Your backend architecture skill |
| Contract ready | Frontend implementation | Your frontend architecture skill |
| Design mockup/HTML | UI components | Your frontend-from-design skill |
| Journey + contract | E2E test coverage | `/e2e-journey-testing` |
| All tests passing | Certifiable evidence | See certification-guide.md |
| Unsure where to start | This guide | `/workflow-guide` |

## Detailed Workflow

### Starting a New Capability

```
1. /solution-narrative
   ├── Create or review persona
   ├── Map the user journey
   ├── Extract user stories
   └── Output: specs/personas/, specs/journeys/, specs/stories/

2. /domain-modeling
   ├── Identify entities and value objects
   ├── Define business rules
   ├── Document lifecycles
   └── Output: specs/models/

3. /behavior-contract
   ├── Write Gherkin feature files
   ├── Define OpenAPI contract
   ├── Create test fixtures
   └── Output: specs/features/, specs/contracts/, specs/fixtures/

4. Implementation (parallel, stack-specific)
   ├── Backend architecture skill → backend/
   └── Frontend architecture skill → frontend/

5. /e2e-journey-testing
   ├── Create journey map
   ├── Implement Playwright tests
   └── Output: specs/journey-maps/, frontend/e2e/

6. Certification
   ├── Collect test evidence
   ├── Generate evidence manifest
   ├── Verify traceability chain
   └── Output: certification/{capability}/
```

### Modifying Existing Features

```
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

## Artifact Locations

```
specs/                          ← Source of truth (stack-agnostic)
├── personas/                   ← /solution-narrative
├── journeys/                   ← /solution-narrative
├── stories/                    ← /solution-narrative
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
           certification        ← Stack-agnostic
```

## Getting Help

- **IDD philosophy**: `docs/idd/manifesto.md`
- **Concept definitions**: `docs/idd/concepts.md`
- **Certification standards**: `docs/idd/certification-guide.md`
- **Process questions**: This guide (`/workflow-guide`)
- **Specific patterns**: Each skill has templates and examples
