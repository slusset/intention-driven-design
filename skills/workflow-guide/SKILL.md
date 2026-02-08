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

This project follows **narrative-driven development**. We start with human needs and work down to code, maintaining traceability at every step.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         NARRATIVE LAYER                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  Personas   │───▶│  Journeys   │───▶│   Stories   │                  │
│  │  (who/why)  │    │ (experience)│    │   (what)    │                  │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                  │
│                                               │                          │
│                        /solution-narrative    │                          │
├───────────────────────────────────────────────┼──────────────────────────┤
│                         MODEL LAYER           │                          │
│                                               ▼                          │
│                                        ┌─────────────┐                   │
│                                        │   Models    │                   │
│                                        │ (concepts)  │                   │
│                                        └──────┬──────┘                   │
│                                               │                          │
│                         /domain-modeling      │                          │
├───────────────────────────────────────────────┼──────────────────────────┤
│                        CONTRACT LAYER         │                          │
│                                               ▼                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  Features   │◀───│  Contract   │───▶│  Fixtures   │                  │
│  │  (Gherkin)  │    │  (OpenAPI)  │    │ (test data) │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                          │
│                        /behavior-contract                                │
├──────────────────────────────────────────────────────────────────────────┤
│                      IMPLEMENTATION LAYER                                │
│                                                                          │
│  ┌─────────────────────────┐    ┌─────────────────────────┐             │
│  │        Backend          │    │        Frontend         │             │
│  │   Spring Boot + Hex     │◀──▶│   Angular + Signals     │             │
│  │                         │    │                         │             │
│  │ /spring-boot-architecture│    │ /angular-architecture   │             │
│  │                         │    │ /angular-from-design    │             │
│  └─────────────────────────┘    └─────────────────────────┘             │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                        VALIDATION LAYER                                  │
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │ Unit Tests  │    │ Integration │    │  E2E Tests  │                  │
│  │  (domain)   │    │  (contract) │    │ (journeys)  │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                          │
│                        /e2e-journey-testing                              │
└──────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference: Which Skill?

| You Have | You Need | Use Skill |
|----------|----------|-----------|
| New feature request | Requirements captured | `/solution-narrative` |
| Journeys and stories | Domain concepts defined | `/domain-modeling` |
| Stories and models | API contract + Gherkin | `/behavior-contract` |
| Contract ready | Backend implementation | `/spring-boot-architecture` |
| Contract ready | Frontend implementation | `/angular-architecture` |
| Design mockup/HTML | Angular components | `/angular-from-design` |
| Journey + contract | E2E test coverage | `/e2e-journey-testing` |
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

4. Implementation (parallel)
   ├── /spring-boot-architecture → backend/
   └── /angular-architecture → frontend/

5. /e2e-journey-testing
   ├── Create journey map
   ├── Implement Playwright tests
   └── Output: specs/journey-maps/, frontend/e2e/
```

### Modifying Existing Features

```
1. Identify the change scope:
   - UI only? → /angular-architecture or /angular-from-design
   - API change? → /behavior-contract first, then both architecture skills
   - New behavior? → /solution-narrative to update story, then cascade

2. Update specs first:
   - Story changes → /solution-narrative
   - Model changes → /domain-modeling
   - Contract changes → /behavior-contract

3. Implement changes:
   - Backend → /spring-boot-architecture
   - Frontend → /angular-architecture

4. Update tests:
   - Journey affected? → /e2e-journey-testing
```

### Bug Fixes

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
```

## Artifact Locations

```
specs/                          ← Source of truth
├── personas/                   ← /solution-narrative
├── journeys/                   ← /solution-narrative
├── stories/                    ← /solution-narrative
├── models/                     ← /domain-modeling
├── features/                   ← /behavior-contract
├── contracts/openapi/          ← /behavior-contract
├── fixtures/                   ← /behavior-contract
└── journey-maps/               ← /e2e-journey-testing

backend/                        ← /spring-boot-architecture
├── src/main/java/
│   ├── domain/                 ← From specs/models/
│   ├── application/            ← From specs/features/
│   └── adapter/                ← From specs/contracts/
└── src/test/

frontend/                       ← /angular-architecture, /angular-from-design
├── src/app/
│   ├── core/                   ← API clients from contract
│   ├── shared/                 ← Reusable components
│   └── features/               ← From specs/journeys/
└── e2e/                        ← /e2e-journey-testing
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

## Common Questions

**Q: I have a design mockup. Where do I start?**
A: If this is a new feature, start with `/solution-narrative` to capture the journey. Then use `/angular-from-design` to convert the mockup. If it's UI for an existing feature, go straight to `/angular-from-design`.

**Q: The API contract needs to change. What's the process?**
A: Update the story if the capability changed (`/solution-narrative`), update the model if concepts changed (`/domain-modeling`), then update the contract and features (`/behavior-contract`). Finally, update implementations.

**Q: How do I know if my implementation is correct?**
A: It should:
1. Pass all Gherkin scenarios (feature files)
2. Comply with the OpenAPI contract
3. Follow the journey map in e2e tests
4. Respect business rules in the model

**Q: Can I skip the narrative layer for small changes?**
A: For pure bug fixes or minor UI tweaks, yes. For anything that changes behavior, no—update the spec first. When in doubt, ask: "Would someone need to update the feature file for this?"

## Skill Dependencies

```
solution-narrative
        │
        ▼
  domain-modeling
        │
        ▼
 behavior-contract
        │
        ├──────────────────────┐
        ▼                      ▼
spring-boot-architecture  angular-architecture
        │                      │
        │                      ├── angular-from-design
        │                      │
        └──────────┬───────────┘
                   ▼
         e2e-journey-testing
```

## Getting Help

- **Architecture questions**: Read the skill files in `~/.codex/skills/`
- **Process questions**: This guide (`/workflow-guide`)
- **Project structure**: `specs/README.md`
- **Specific patterns**: Each skill has templates and examples
