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
When role contracts are present, it should also catch cross-boundary changes
that violate the declared execution contract.

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
│  │  • Role-boundary drift in delegated work          │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│                  comment on PR                          │
└─────────────────────────────────────────────────────────┘
```

## Layer 1: Deterministic Checks

These run without an LLM. They invoke validators bundled with this plugin at `${CLAUDE_PLUGIN_ROOT}/tools/validate-*.js`, scoped to the PR diff rather than the full repo. (In CI or outside the plugin, the same scripts are also available via `npx idd validate <name>` when `idd-toolkit` is installed.)

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
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-traceability.js" --json
```

**Pass criteria**: Zero broken links (exit code 0).

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

### Check 6: Role Contract Coverage

If the PR includes delegated or multi-agent work and role contracts are present,
verify that:

- each changed file falls within at least one declared role boundary
- methodology or governance docs changed by an implementation role are flagged
- artifact changes outside a role's allowed scope are reported for review

This check is advisory by default because repositories may adopt role contracts
incrementally.

**Pass criteria**: Warning only unless the repo explicitly makes role contracts mandatory.

### Check 7: Methodology Change Coverage

If the PR changes methodology-defining surfaces such as `docs/idd/`, `skills/`,
`tools/`, or `.github/workflows/`, verify that the PR includes enough context to
justify the change:

- an intent artifact or design note describing the change
- clear statement of the affected methodology boundary
- evidence or worked example supporting the proposed adoption state
- explicit indication of whether the change is exploratory, provisional, or canonical

This check is advisory by default. It exists to ensure changes to the
methodology follow the methodology.

**Pass criteria**: Warning only unless the repo chooses to make methodology artifacts mandatory.

## Layer 2: Semantic Review

Optional LLM-assisted pass that covers what deterministic checks cannot:

- **Story ↔ feature alignment** — scenarios match the story's acceptance criteria and narrative.
- **Journey coherence** — steps form a logical sequence with realistic system responses and identified failure modes.
- **Ubiquitous language** — terms in changed files agree with the glossary (`specs/models/README.md`).
- **Completeness** — features cover happy-path, validation, authorization, and contract-defined error responses.

Output: PR comments. Never blocks merge on Layer 2 alone.

### Semantic Check: Role-Boundary Drift

When role contracts are available:

- compare the changed files to the active role boundaries
- flag actors changing artifacts outside their declared ownership
- flag downstream edits that should have been routed through an upstream skill
- flag methodology or governance changes that lack explicit human approval

**Output**: PR comment summarizing role-boundary drift risks.

### Semantic Check: Methodology Change Legibility

When the PR changes methodology-defining files:

- identify whether the change declares intent clearly
- identify whether the scope of the change is explicit
- identify whether evidence matches the claimed promotion state
- flag experiments that are being written as canonical doctrine too early

**Output**: PR comment summarizing whether the methodology change is legible, scoped, and evidenced.

## GitHub Action Integration

The deterministic checks run as a GitHub Action. See `.github/workflows/idd-check.yml` for the workflow definition.

```
PR opened/updated
    │
    ├── Layer 1: idd-check.yml (automatic, every PR)
    │   ├── validate-traceability.js
    │   ├── validate-front-matter.js
    │   ├── validate-capability-scope.js
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
## IDD Compliance Review

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

## Adding a New Validator

Add `tools/validate-<name>.js` (standalone, exit 0/1, support `--json`), then register it in the `VALIDATORS` map in [bin/idd.js](bin/idd.js). It becomes available as `idd validate <name>` and is picked up by `idd validate all`.

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
| C16 — Agent Role as Execution Contract | referenced: role-boundary drift checks delegated work |

## Guardrails

- Layer 1 checks must be deterministic — same input, same output, no LLM variance.
- Layer 2 checks must be clearly marked as AI-generated observations, not authoritative decisions.
- Never block a PR on Layer 2 results alone. Humans decide on semantic issues.
- The spec-before-code check is a warning, never a blocker. Pure refactors are valid.
- PR review does not replace certification. It complements it.
- Methodology-change checks are warnings unless the repo explicitly promotes them to blockers.
- Check scripts must exit 0 (pass) or 1 (fail) — no partial states.
