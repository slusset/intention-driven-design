---
name: solution-narrative
description: "User journey and story development. Use when capturing requirements, mapping user experiences, defining personas, or creating the narrative foundation that drives features and contracts. Output feeds into behavior-contract skill."
argument-hint: "[persona, journey, or story]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Solution Narrative

## Purpose

Capture the human-centered narrative that drives system behavior. This is the "why" and "what" before the "how."

## Workflow

1. Identify or create personas for the actors involved.
2. Map user journeys for key flows (happy path first, then edge cases).
3. Derive user stories from journey steps.
4. Define acceptance criteria in plain language.
5. Output structured artifacts that feed into behavior-contract skill.

## Traceability Requirements

- Journeys must reference a persona file.
- Stories must reference the journey and persona.
- Each story must list the journey steps it covers.

## Artifact Locations

Store in specs/ directory (system of record):

```
specs/
├── personas/
│   └── {persona-name}.md
├── journeys/
│   └── {journey-name}.md
└── stories/
    └── {feature-area}/
        └── {story-name}.md
```

## Persona Template

```markdown
# Persona: {Name}

## Role
{Role description - e.g., "Small business owner"}

## Goals
- {Primary goal}
- {Secondary goal}

## Frustrations
- {Pain point relevant to solution}

## Context
- Tech comfort: {low/medium/high}
- Usage frequency: {daily/weekly/occasional}
- Key devices: {mobile/desktop/both}

## Quotes
> "{Something they might say that captures their mindset}"
```

## Journey Template

```markdown
# Journey: {Journey Name}

## Actor
{Persona name and context}
Source Persona: specs/personas/{persona-name}.md

## Trigger
{What initiates this journey}

## Preconditions
- {System state required}
- {User state required}

## Flow

### 1. {Step Name}
- **User intent**: {What they're trying to do}
- **System response**: {What happens}
- **Next**: {What step follows}
- → `{API endpoint if applicable}`

### 2. {Step Name}
...

## Outcomes
- **Success**: {Desired end state}
- **Failure modes**: {What could go wrong}

## Related Stories
- {story-reference}

## E2E Coverage
- {test-file-reference}
```

## User Story Template

```markdown
# Story: {Story Title}

## Narrative
As a {persona},
I want to {action},
So that {benefit}.

## Acceptance Criteria
- [ ] {Criterion 1 - plain language}
- [ ] {Criterion 2}

## Journey Reference
- Journey: specs/journeys/{journey-name}.md
- Steps: {step numbers this covers}

## Persona Reference
- Persona: specs/personas/{persona-name}.md

## Notes
{Context, constraints, open questions}
```

## Guardrails

- Journeys describe experience, not implementation.
- Stories are small enough to implement in one PR.
- Acceptance criteria are testable but not technical.
- One persona per journey (guest actors are secondary).
- Name files kebab-case matching the title.

## Process Tips

### Starting a New Capability

1. **Listen first**: What is the human need? Who has it? When?
2. **Check existing personas**: Does this fit? Or is there a new actor?
3. **Map the happy path**: What does success look like?
4. **Identify failure modes**: What could go wrong?
5. **Break into stories**: What's the smallest valuable increment?

### Refining Existing Journeys

1. **Review feedback**: What's not working?
2. **Trace to steps**: Which journey step is the problem?
3. **Update narrative**: How should it work instead?
4. **Cascade changes**: Update stories, then features, then contract.

### Collaborative Discovery

When working with stakeholders:
- Let them narrate—don't jump to solutions
- Ask "what happens next?" to discover flow
- Ask "what could go wrong?" to find edge cases
- Ask "why?" to uncover real goals behind requests

## Handoff

When narrative is complete, invoke behavior-contract skill to:
1. Convert acceptance criteria → Gherkin scenarios
2. Derive API contract from system responses in journeys
3. Map journey steps to feature files

## Example

### Input (from stakeholder conversation)

> "We were at a trade show and someone wanted to sign up right there. 
> They should be able to create an account and start their first audit 
> on their phone while we're talking to them."

### Output

**Persona**: `specs/personas/trade-show-prospect.md`
- Role: Potential customer meeting us at events
- Goals: Quick evaluation, see value fast
- Context: Mobile, distracted, skeptical

**Journey**: `specs/journeys/trade-show-signup.md`
- Trigger: Scans QR code at booth
- Flow: Landing → Sign up → First audit → See preview
- Success: Leaves with audit in progress, follows up later

**Stories**:
- `specs/stories/onboarding/mobile-signup.md`
- `specs/stories/audits/quick-start-audit.md`
- `specs/stories/audits/audit-preview.md`
