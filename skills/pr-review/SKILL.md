---
name: pr-review
description: "Verify IDD compliance on pull requests. Use in CI/CD pipelines or manually before merge to check traceability, front-matter, capability scope, and spec-code alignment. Cross-cuts all layers like certification, but operates at PR-time on the diff."
license: MIT
argument-hint: "[PR number or branch name]"
allowed-tools: Read Glob Grep Bash
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

These run without an LLM. The plugin bundles the validators under `tools/` and the `idd` CLI under `bin/`. Resolve the tool root from the active host (`PLUGIN_ROOT` for Codex when exposed, `CLAUDE_PLUGIN_ROOT` for Claude), use an `idd` already on `PATH`, or fall back to `npx idd` in CI/outside a plugin. Keep the checks scoped to the PR diff rather than the full repo.

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

See [front-matter-spec.md](references/front-matter-spec.md) for the full schema.

**Pass criteria**: All new/modified spec files have required front-matter fields.

### Check 2: Traceability Links Resolve

Every `refs` path, `sources` path, `_meta.story`, `_meta.feature`, `# story:`, and `# journey:` value must point to a file that exists in the repo.

If the active plugin host exposes its root, run the bundled validator with the corresponding root (`$PLUGIN_ROOT` in Codex or `$CLAUDE_PLUGIN_ROOT` in Claude); otherwise use:

```bash
npx idd validate traceability --json
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

If the PR modifies implementation files — anything outside the spec paths, documentation, and CI configuration — but no spec files, emit a warning. This doesn't block the PR — pure refactors and bug fixes may legitimately touch only code — but it flags potential drift.

```
⚠️  Implementation files changed without spec updates.
    If this changes behavior, update specs first (C8 Evolution Preserves Meaning).
    Changed: {source file the PR touched}
    No changes in: specs/
```

**Pass criteria**: Warning only (never blocks).

### Check 6: Methodology Change Coverage

If the PR changes methodology-defining surfaces — the methodology library,
skills, validators, or CI workflows — verify that it includes enough context to
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

### Semantic Check: Telos Alignment

When the repository declares a telos (`specs/telos.md`):

- flag a new or changed capability whose description does not visibly serve the
  declared purpose
- flag work that moves toward a declared non-goal
- quote the purpose or the non-goal in the finding and leave the judgment to the
  author

**Output**: PR comment naming the tension. Never blocking — a telos is a
statement of intent, not a rule carrying evidence.

### Semantic Check: Methodology Change Legibility

When the PR changes methodology-defining files:

- identify whether the change declares intent clearly
- identify whether the scope of the change is explicit
- identify whether evidence matches the claimed promotion state
- flag experiments that are being written as canonical doctrine too early

**Output**: PR comment summarizing whether the methodology change is legible, scoped, and evidenced.

## GitHub Action Integration

The deterministic checks run as the `idd-check` GitHub Action, invoked by the consuming repository's own workflow.

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
- `{source file}` changed without spec updates
- If this changes behavior, update specs first (C8)

### Orphans ✅
- No orphan artifacts detected

---
*Automated by IDD PR Review*
```

## Relationship to Certification

PR review and certification are complementary, not redundant:

| Aspect | PR Review | Certification |
|--------|-----------|---------------|
| **When** | Every PR, before merge | After all tests pass, before release |
| **Scope** | Changed files in the PR diff | Entire capability boundary |
| **Depth** | Link existence + optional semantics | Full evidence collection with test reports |
| **Output** | PR comments | CI evidence report (job summary, PR comment, `idd-evidence` workflow artifact) |
| **Blocks merge?** | Layer 1 can block; Layer 2 advises | Always blocks if gaps exist |
| **Cost** | Fast (Layer 1: ms; Layer 2: one LLM call) | Heavier (collects test reports, walks full chain) |

PR review catches problems early and cheaply. Certification provides the formal evidence record.

## Concepts Carried

| Concept | Role |
|---------|------|
| C3 — Traceability Spine | **primary**: validates spine links on every PR |
| C7 — Claims Require Evidence | **primary**: immediate deterministic feedback, and no merge without evidence tied to intent |
| C8 — Evolution Preserves Meaning | **primary**: the spec-before-code warning keeps repairs classified |
| C9 — Humans Own Meaning | **primary**: deterministic checks report; humans decide semantic findings |
| C5 — Capability Is the Unit of Verification | referenced: capability scope check uses capability artifacts |

## Guardrails

- Layer 1 checks must be deterministic — same input, same output, no LLM variance.
- Layer 2 checks must be clearly marked as AI-generated observations, not authoritative decisions.
- Never block a PR on Layer 2 results alone. Humans decide on semantic issues.
- The spec-before-code check is a warning, never a blocker. Pure refactors are valid.
- PR review does not replace certification. It complements it.
- Methodology-change checks are warnings unless the repo explicitly promotes them to blockers.
- Check scripts must exit 0 (pass) or 1 (fail) — no partial states.
