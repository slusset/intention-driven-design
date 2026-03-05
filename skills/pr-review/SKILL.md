---
name: pr-review
description: "Verify IDD compliance on pull requests. Use in CI/CD pipelines or manually before merge to check traceability, front-matter, capability scope, and spec-code alignment. Cross-cuts all layers like certification, but operates at PR-time on the diff."
argument-hint: "[PR number or branch name]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# PR Review

## Purpose

Enforce IDD compliance at the pull request boundary. This skill bridges the gap between development (where skills produce artifacts) and certification (where evidence is collected). It catches drift **before merge** by analyzing the PR diff against IDD traceability requirements.

Two execution modes:
1. **Automated** — GitHub Action runs deterministic checks on every PR.
2. **Agent-assisted** — Claude (or another agent) loads this skill for semantic review.

The automated layer is fast and cheap (no LLM). The agent layer catches what static checks cannot: misaligned intent, incomplete journeys, naming drift.

## When to Use

- On every pull request (automated via GitHub Action).
- Before requesting human review.
- After `/certification` identifies gaps and a fix-forward PR is opened.
- When onboarding a contributor unfamiliar with IDD conventions.

## Two-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PR Opened / Updated                   │
│                                                         │
│  Layer 1: Deterministic Checks (no LLM, fast, CI)      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  • Front-matter presence (id, type on new files)  │  │
│  │  • Traceability links resolve (refs point to      │  │
│  │    files that exist)                              │  │
│  │  • Capability scope updated (changed files are    │  │
│  │    listed in a capability)                        │  │
│  │  • No orphan artifacts (features have stories,    │  │
│  │    endpoints have features)                       │  │
│  │  • Schema consistency (fixtures match schemas)    │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                     pass / fail                         │
│                          │                              │
│  Layer 2: Semantic Review (LLM, optional, deeper)       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  • Story ↔ feature alignment (does the scenario   │  │
│  │    actually test what the story says?)             │  │
│  │  • Journey coherence (do new steps make sense     │  │
│  │    in the flow?)                                  │  │
│  │  • Naming consistency (ubiquitous language)       │  │
│  │  • Completeness (missing edge-case scenarios,     │  │
│  │    missing error responses)                       │  │
│  │  • Model drift (code diverging from model rules)  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                  comment on PR                          │
└─────────────────────────────────────────────────────────┘
```

## Layer 1: Deterministic Checks

These run without an LLM. They use the `tools/validate-*.js` suite in diff mode for PRs and full-scan mode on `main`.

### Check 1: Front-Matter Presence

Every new or modified spec file must have front-matter with at least `id` and `type`.

| File pattern | Required front-matter |
|---|---|
| `specs/personas/*.md` | `id`, `type: persona` |
| `specs/journeys/*.md` | `id`, `type: journey`, `refs.persona` |
| `specs/stories/**/*.md` | `id`, `type: story`, `refs.journey`, `refs.persona` |
| `specs/models/**/*.model.yaml` | `id`, `type: model` |
| `specs/features/**/*.feature` | `# id:`, `# type: feature`, `# story:` |
| `specs/fixtures/**/*.json` | `_meta.id`, `_meta.type: fixture`, `_meta.story` |
| `specs/journey-maps/*.map.yaml` | `id`, `type: journey-map` |
| `specs/capabilities/*.capability.yaml` | `id`, `type: capability`, `scope` |

See `docs/idd/front-matter-spec.md` for the full schema.

**Pass criteria**: All new/modified spec files have required front-matter fields.

### Check 2: Traceability Links Resolve

Every `refs` path, `sources` path, `_meta.story`, `_meta.feature`, `# story:`, and `# journey:` value must point to a file that exists in the repo.

```bash
# Run the traceability validator
node tools/validate-traceability.js
```

**Pass criteria**: Zero broken links (exit code 0 from `validate-traceability.js`).

### Check 3: Capability Scope Updated

If the PR adds or modifies files in `specs/features/`, `specs/contracts/`, `specs/models/`, or `specs/stories/`, at least one `specs/capabilities/*.capability.yaml` must list the changed file in its `scope` block.

```
Changed: specs/features/audits/cancel-audit.feature
Expected: Some capability.yaml contains this path in scope.features[]
```

**Pass criteria**: Every changed spec file appears in at least one capability scope. New capabilities are allowed (the PR may introduce both the capability and its artifacts).

### Check 4: No Orphan Artifacts

Extends the existing traceability checker:

| Artifact | Must reference |
|---|---|
| Feature file | A story (`# story:` header) |
| OpenAPI operation | A feature (`x-feature` extension) |
| Fixture | A story and scenario (`_meta.story`, `_meta.scenario`) |
| E2E test file | A journey (`// Journey:` header) |
| Journey map | A journey (`sources.journey`) |

**Pass criteria**: Zero orphans in changed files.

### Check 5: Spec-Before-Code

If the PR modifies implementation files (`backend/src/`, `frontend/src/`) but no spec files (`specs/`), emit a warning. This doesn't block the PR — pure refactors and bug fixes may legitimately touch only code — but it flags potential drift.

```
⚠️  Implementation files changed without spec updates.
    If this changes behavior, update specs first (C13 Fix Forward).
    Changed: backend/src/audits/AuditService.java
    No changes in: specs/
```

**Pass criteria**: Warning only (never blocks).

## Layer 2: Semantic Review

These checks require an LLM (Claude or equivalent) and are optional. They provide deeper analysis as PR comments.

### Semantic Check: Story ↔ Feature Alignment

For each feature file changed in the PR, read the referenced story and verify:
- The feature's `As a / I want / So that` matches the story narrative.
- Each scenario maps to an acceptance criterion in the story.
- No acceptance criteria are missing corresponding scenarios.

**Output**: Inline PR comment on the feature file listing coverage.

### Semantic Check: Journey Coherence

For each journey file changed in the PR:
- Do the steps form a logical sequence?
- Are system responses realistic given the contract?
- Are failure modes identified for each step?

**Output**: PR comment summarizing journey health.

### Semantic Check: Ubiquitous Language

Compare terms used in changed files against `specs/models/README.md` (glossary):
- Flag terms that appear in code but not in the glossary.
- Flag glossary terms that are misspelled or inconsistently cased in specs.

**Output**: PR comment with terminology suggestions.

### Semantic Check: Completeness

For changed feature files:
- Does the feature have `@happy-path`, `@validation`, and `@authorization` scenarios?
- Does the corresponding contract define error responses for each error scenario?
- Are edge cases from the story's acceptance criteria covered?

**Output**: PR comment listing potential missing scenarios.

## GitHub Action Integration

The deterministic checks run as a GitHub Action. See `.github/workflows/idd-check.yml` for the workflow definition.

```
PR opened/updated
    │
    ├── Layer 1: idd-check.yml (automatic, every PR)
    │   ├── validate-traceability.js
    │   ├── validate-front-matter.js
    │   ├── validate-capability-scope.js
    │   ├── validate-fixtures.js
    │   ├── validate-models.js
    │   ├── validate-journey-maps.js
    │   └── Posts results as PR comment
    │
    └── Layer 2: Agent review (optional, triggered by label or comment)
        ├── Claude loads this SKILL.md as context
        ├── Reads the PR diff
        ├── Runs semantic checks
        └── Posts review comments
```

### Triggering Layer 2

Layer 2 (semantic review) can be triggered by:
- Adding a `idd-review` label to the PR.
- Commenting `/idd-review` on the PR.
- Configuring it to run on all PRs (high cost, recommended only for critical repos).

## Review Comment Format

Both layers post results in a consistent format:

```markdown
## IDD Validation Report

### Traceability ✅
- Stories → Features: 3/3 (100%)
- Features → Contracts: 3/3 (100%)
- Endpoints → Tests: 5/5 (100%)
- Journeys → E2E: 1/1 (100%)

### Front-Matter ✅
- All 4 new/modified spec files have valid front-matter

### Capability Scope ✅
- All changed specs are listed in `specs/capabilities/trade-show-signup.capability.yaml`

### Spec-Before-Code ⚠️
- `backend/src/audits/AuditService.java` changed without spec updates
- If this changes behavior, update specs first (C13)

### Orphans ✅
- No orphan artifacts detected

---
*Automated by [IDD PR Review](docs/idd/pr-review.md) • [What is IDD?](docs/idd/manifesto.md)*
```

## Creating New Validator Scripts

The deterministic checks are implemented as standalone Node.js scripts in `tools/`. Each follows the same pattern:

```javascript
#!/usr/bin/env node
/**
 * Validator description
 * Usage: node tools/validate-{name}.js [specs-dir]
 * Exit: 0 = pass, 1 = fail
 */

const results = { errors: [], warnings: [], info: [] };

// ... check logic ...

// Output JSON for the GitHub Action to parse
console.log(JSON.stringify(results));
process.exit(results.errors.length > 0 ? 1 : 0);
```

The GitHub Action collects JSON output from each script and formats the combined result as a PR comment.

## Relationship to Certification

PR review and certification are complementary, not redundant:

| Aspect | PR Review | Certification |
|--------|-----------|---------------|
| **When** | Every PR, before merge | After all tests pass, before release |
| **Scope** | Changed files in the PR diff | Entire capability boundary |
| **Depth** | Link existence + optional semantics | Full evidence collection with test reports |
| **Output** | PR comments | `certification/{capability}/evidence.yaml` |
| **Blocks merge?** | Layer 1 can block; Layer 2 advises | Always blocks if gaps exist |
| **Cost** | Fast (Layer 1: ms; Layer 2: one LLM call) | Heavier (collects test reports, walks full chain) |

PR review catches problems early and cheaply. Certification provides the formal evidence record.

## Concepts Carried

| Concept | Role |
|---------|------|
| C5 — Fast Honest Feedback | **primary**: PR checks give immediate, automated feedback |
| C8 — Traceability Chain | **primary**: validates chain links on every PR |
| C13 — Fix Forward | **primary**: spec-before-code warning enforces fix-forward |
| C14 — Agent Non-Negotiables | **primary**: enforces rule 3 (no merge without evidence) at PR boundary |
| C12 — Done Means Verified | referenced: PR review is the first verification gate |
| C15 — Capability as Cert Unit | referenced: capability scope check uses capability artifacts |

## Guardrails

- Layer 1 checks must be deterministic — same input, same output, no LLM variance.
- Layer 2 checks must be clearly marked as AI-generated observations, not authoritative decisions.
- Never block a PR on Layer 2 results alone. Humans decide on semantic issues.
- The spec-before-code check is a warning, never a blocker. Pure refactors are valid.
- PR review does not replace certification. It complements it.
- Validator scripts must exit 0 (pass) or 1 (fail) — no partial states.
