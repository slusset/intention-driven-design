# Methodology Change Process

This repository should apply Intention-Driven Design to changes in IDD itself.

Methodology changes are not exempt from the methodology. They must move through
an explicit path from intent to evidence before they become canonical guidance.

## Why this exists

When exploring new practices such as eval frameworks, harnesses, or orchestration
patterns, the easiest failure mode is to let experiments silently become doctrine.

This process prevents that drift by separating:

- exploration
- provisional adoption
- canonical methodology

## Change states

### 1. Exploratory

Used for trying a new idea such as an eval harness, workflow pattern, or agent
coordination approach.

Requirements:

- a short design note or proposal describing the problem and intent
- a clearly named experiment status
- no claim that the practice is yet part of canonical IDD

Typical outputs:

- design notes in `docs/idd/`
- templates in `docs/idd/templates/`
- example workflows or trial notes

### 2. Provisional

Used when an exploratory idea has enough evidence to guide work, but has not yet
earned full promotion into the core methodology.

Requirements:

- explicit scope of what is being adopted
- at least one worked example
- evidence describing what the experiment changed or clarified
- human approval for provisional use

Typical outputs:

- updates to workflow skills
- PR review guidance
- reusable templates

### 3. Canonical

Used when the practice is accepted as part of IDD itself.

Requirements:

- clear intent artifact
- defined scope and affected repository surfaces
- repeatable evidence
- explicit human approval
- updates to top-level documentation such as `README.md`

Canonical changes affect how the repository teaches or enforces IDD.

## Required artifact path

Methodology changes should follow this path:

1. Intent
   Capture the change as a design note, story, or proposal artifact.
2. Scope
   Define the affected methodology boundary: docs, skills, tools, CI, governance.
3. Contract
   Describe the expected workflow or rule change.
4. Implementation
   Update docs, skills, templates, or tooling.
5. Verification
   Show a worked example, eval run, or review outcome.
6. Evidence
   Record why the change should remain exploratory, provisional, or become canonical.

## Lightweight governance rules

These are the minimum rules for this repository:

1. No methodology change merges without an intent artifact.
2. No workflow or skill change merges without at least one worked example or explicit rationale for why example-based verification is not yet possible.
3. No promotion from exploratory to canonical without explicit human approval.
4. Experiments may inform the methodology, but they do not redefine it on their own.

## Eval frameworks and harnesses

When evaluating a new framework or harness such as deer-flow:

1. Treat it as exploratory first.
2. Document what question the eval answers.
3. Record which failure modes or decisions the eval is meant to expose.
4. Keep the harness separate from canonical IDD language until evidence exists.
5. Promote only the lessons that remain legible to the IDD artifact spine.

The harness is not the methodology. It is evidence-producing infrastructure.

## PR review expectations

PRs that change the methodology should answer three questions:

1. What intent justifies this change?
2. What methodology boundary is in scope?
3. What evidence supports the proposed promotion state?

If a PR cannot answer those questions yet, the change should remain exploratory.
