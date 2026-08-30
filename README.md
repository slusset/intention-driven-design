# Intention-Driven Design

**Making meaning explicit, executable, and continuously verified — so systems can scale without semantic drift.**

Intention-Driven Design (IDD) is a methodology for building software where every artifact traces back to a declared human intent. Code is a downstream consequence of intent, never the starting point. We allow change, but we do not allow drift.

## Why IDD exists

Agentic coding tools are remarkably capable at execution but have a subtle failure mode: they optimize locally without a global ground truth. They can write perfect code for the wrong thing. Spec-driven development moved the answer earlier in the process, but still asks "what should the system do?" — IDD asks **"why should the system exist at all?"** and makes that *why* a first-class, traceable artifact.

The result is a framework where AI agents can autonomously implement, verify, and evolve software while humans focus on meaning, tradeoffs, and creative decisions.

IDD can also be extended through explicit agent roles: bounded execution
contracts that let multiple agents develop the methodology or a target system in
parallel without breaking traceability.

## How it works

```
┌──────────────────────────────────────────────────────────────┐
│                      NARRATIVE LAYER                         │
│   Personas ──▶ Journeys ──▶ Stories                          │
│   (who/why)    (experience)   (what)                         │
│                                          /solution-narrative │
├──────────────────────────────────────────────────────────────┤
│                       MODEL LAYER                            │
│                  Domain Models                               │
│                  (concepts, rules, lifecycles)               │
│                                           /domain-modeling   │
├─────────────────────────────────────────────────────────────┤
│                     CONTRACT LAYER                           │
│   Features ◀── Contracts ──▶ Fixtures                        │
│   (Gherkin)    (OpenAPI / AsyncAPI / JSON-RPC)               │
│                                        /behavior-contract    │
├──────────────────────────────────────────────────────────────┤
│                  IMPLEMENTATION LAYER                        │
│   Backend ◀──────────────────────▶ Frontend                  │
│   (any stack)                      (any stack)               │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                    VALIDATION LAYER                          │
│   Unit Tests ── Integration ── E2E Journey Tests             │
│   (domain)      (contract)     (experience)                  │
│                                     /e2e-journey-testing     │
├─────────────────────────────────────────────────────────────┤
│                   CERTIFICATION LAYER                        │
│   Evidence tied to intent ── published before merge          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Every downstream artifact references its upstream source:

```
Persona → Journey → Story → Feature → Contract → Tests → Evidence
```

No link in the chain is optional.

## Quick example: from intent to evidence

A stakeholder says: *"Someone at a trade show should be able to sign up and start an audit on their phone while we're talking to them."*

IDD breaks this into a traceable chain:

| Layer | Artifact | What it captures |
|-------|----------|------------------|
| Narrative | `specs/personas/trade-show-prospect.md` | Who: mobile, distracted, skeptical |
| Narrative | `specs/journeys/trade-show-signup.md` | Experience: QR scan → signup → first audit |
| Narrative | `specs/stories/onboarding/mobile-signup.md` | Capability: quick mobile account creation |
| Model | `specs/models/audit/audit.model.yaml` | Concept: Audit entity, states, rules |
| Contract | `specs/features/onboarding/mobile-signup.feature` | Behavior: Gherkin scenarios |
| Contract | `specs/contracts/openapi/api.yaml` | HTTP boundary: `POST /accounts`, `POST /audits` |
| Contract | `specs/contracts/asyncapi/audit-events.yaml` | Event boundary: `publish audits/created` |
| Contract | `specs/contracts/json-rpc/account-service.yaml` | RPC boundary: `account.getQuickStartPrompt` |
| Contract | `specs/fixtures/onboarding/mobile-signup.json` | Test data: request/response pairs |
| Implementation | Backend + Frontend code | Derived from contracts |
| Validation | `frontend/e2e/journeys/trade-show-signup.spec.ts` | E2E test following the journey |
| Certification | CI evidence report (per capability) | Automated evidence tied to intent — generated in CI, published as job summary, PR comment, and workflow artifact; never committed |

Every artifact in the chain references the one above it. An agent — or a human — can trace any line of code back to the persona goal that motivated it.

See [`examples/`](specs/) for a complete working fixture set of these artifact types, wired for tooling validation.

## Visualizing the spec graph

Generate a Mermaid traceability graph from front-matter metadata:

```bash
node tools/graph-generation/generate-spec-graph.js specs --format mermaid > specs/GRAPH.md
```

To inspect this repository's example fixtures:

```bash
node tools/graph-generation/generate-spec-graph.js examples --format mermaid
```

## Core principles

1. **Intent precedes code.** No implementation without an explicit intent artifact.
2. **Shared mental models are artifacts, not conversations.** If a concept matters, it has a file.
3. **Contracts define reality at boundaries.** OpenAPI, AsyncAPI, and JSON-RPC contracts are the source of truth, not implementation.
4. **Assumptions must become executable.** Untested assumptions are technical debt.
5. **Feedback must be fast, honest, and automated.** Evidence, not confidence theater.
6. **Human cognition is protected.** Agents handle bookkeeping; humans handle meaning.
7. **Evolution must preserve meaning.** We allow change, but we do not allow drift.

Read the full [manifesto](docs/idd/manifesto.md).

## Stack-agnostic by design

The narrative, model, and contract layers are completely technology-independent. The `specs/` directory works the same whether your implementation uses Spring Boot, Express, Django, Rails, Angular, React, or anything else. Each consumer binds its own stack-specific implementation skills in `specs/skills/repo-overlay.md` without changing the upstream artifacts.

## Installation

> **Internal UAT:** the toolkit is restarting its public version line at
> `0.1.0-uat.N`. These builds are prerelease, non-production candidates. The
> retired prototype line is preserved under `legacy/v1.*` tags, but should not
> be used for new installations.

### As a ChatGPT / Codex plugin (core skills)

The repo also exposes a Codex plugin through `.codex-plugin/plugin.json` and a
repo-scoped marketplace at `.agents/plugins/marketplace.json`. This surface
loads the core methodology skills from `skills/`. The plugin source also
carries the IDD CLI, validators, schemas, docs, and reusable GitHub Action.

For installation from GitHub:

```bash
codex plugin marketplace add slusset/intention-driven-design --ref main
codex plugin add idd-skills@idd
```

If `idd-skills` was installed from the retired `1.x` prototype line, remove it
once with `codex plugin remove idd-skills@idd`, refresh the marketplace, and
install again. A normal update cannot be assumed to accept a SemVer downgrade.

In the ChatGPT desktop app, restart after adding the repo marketplace, then
install `idd-skills` from the Intention-Driven Design marketplace. Use a new
conversation after installation so the host loads the current skill set.
Update both the desktop and CLI environments with:

```bash
codex plugin marketplace upgrade idd
codex plugin add idd-skills@idd
```

### As a Claude Code plugin (recommended)

The repo is a self-contained Claude Code plugin — `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` are at the repo root. One install brings the core methodology skills (`skills/`), schemas, and the `idd` validator CLI (the plugin's `bin/` is added to Bash PATH while active, so skills and you can run `idd validate all` with no separate install). Node dependencies install automatically from the committed lockfile.

In Claude Code:

```
/plugin marketplace add slusset/intention-driven-design
/plugin install idd-skills@idd
```

Skills are namespaced as `idd-skills:<name>` (e.g. `/idd-skills:certification`). If you previously copied skills via `idd install-skills claude`, remove those copies from `~/.claude/skills/` — copied and plugin skills coexist under different names and can double-trigger.

If the plugin was installed from the retired `1.x` prototype line, uninstall
it once with `claude plugin uninstall idd-skills@idd`, refresh the marketplace,
and install it again before following the normal update flow.

Update with `claude plugin update idd-skills@idd`, then restart Claude or
reload plugins when prompted. Third-party marketplace auto-update can also be
enabled in Claude's plugin manager.

For plugin development from a local checkout: `/plugin marketplace add ~/dev/idd`, refresh after edits with `/plugin marketplace update idd`, or use `claude --plugin-dir ~/dev/idd` for an ephemeral single-session load. Validate changes with `just validate-plugin` (runs `claude plugin validate --strict` on the marketplace and plugin manifests — CI runs the same checks).

### As an npm package (for CI and local dev ergonomics)

```bash
npm install --save-dev github:slusset/intention-driven-design#v0.1.0-uat.1
npx idd validate all          # run validators outside of Claude Code
```

Release Please versions the npm package, lockfile, and both plugin manifests
together on the `0.1.0-uat.N` line. `just validate-plugin` checks the
Codex/ChatGPT manifest, the core-only skills boundary, bundled tooling, and the
existing Claude plugin manifests.

### Local development (from checkout)

```bash
git clone git@github.com:slusset/intention-driven-design.git
cd intention-driven-design
just install                   # npm install && npm link
```

### Initialize a new project

```bash
npx idd init .                 # scaffolds specs/ structure + CI workflow
npx idd install-skills claude
```

### CLI reference

```
idd validate <check...>       Run validators (or "all")
idd install-skills <target>   Install skills to claude/codex/all
  --link                       Symlink instead of copy (dev mode)
  --check                      Check if installed skills are current
idd generate-evidence          Generate certification evidence manifest
                               (into .idd/evidence/ — CI report input, not committed)
idd init [dir]                 Scaffold IDD directory structure
idd version                    Print version
```

### Installing skills for AI agents

**Claude Code:** prefer the plugin install above. The copy flow below still works but is deprecated for Claude Code — copied skills coexist with plugin skills under different names and can double-trigger.

**Codex (and Claude Code legacy copy flow):**
```bash
idd install-skills codex       # copies versioned skills to ~/.codex/skills/
idd install-skills claude      # deprecated for Claude Code — use the plugin
idd install-skills all         # both
```

**GitHub Copilot App, CLI, VS Code, cloud agent, and code review:**

```bash
gh skill install slusset/intention-driven-design --all \
  --agent github-copilot --scope user
gh skill update --all
```

Project scope is the default and is the right choice when Copilot cloud agent
or code review must consume committed skills from a downstream repository.
GitHub's installer records source provenance, so `gh skill update` can detect
upstream changes.

**Other agents (Cursor, Gemini CLI, etc.):**
All skills follow the [Agent Skills open standard](https://agentskills.io), and
current GitHub CLI releases can install them for many supported hosts with
`gh skill install --agent <host>`.

See [Release and Distribution](docs/idd/release-and-distribution.md) for the
release lifecycle, desktop/CLI update matrix, verification commands, and the
boundary with field synchronization work in issues #56–#58.

### CI with GitHub Actions

Consuming repos can use the reusable action:

```yaml
- uses: slusset/intention-driven-design/.github/actions/idd-check@v0.1.0-uat.1
  with:
    checks: all
```

During UAT, pin the exact accepted candidate. No floating major Action tag is
published for prerelease or `0.x` builds.

Or install the toolkit directly:

```yaml
- run: npm install github:slusset/intention-driven-design
- run: npx idd validate all --json
```

## Repo overlay and implementation skills

IDD's narrative, model, and contract skills stay stack-agnostic. The core pack does not bundle or discover framework-specific implementation skills. Each consumer repository uses `specs/skills/repo-overlay.md` to bind exact skill identifiers to backend, frontend, mobile, infrastructure, SDK, design, or framework-specific testing areas and to state where those skills are provided from.

The `idd-workflow` skill loads that overlay before implementation work. If a binding is absent, IDD selects no stack-specific skill and follows the repository's architecture docs, commands, and a generic implementation checklist. Framework files and the active plugin catalog never authorize automatic skill selection.

## Agent roles as an IDD extension

When work is split across multiple humans or agents, define a role contract for
each actor:

- owned boundary
- required inputs
- decisions it may make autonomously
- outputs it must produce
- invariants it must preserve
- handoff target and success evidence

This extends IDD through agency rather than bypassing it. The role governs how
work is executed; the artifact spine still governs what must remain true.

See [Agent Role](docs/idd/agent-role.md) and [Agent Operating Contract](docs/idd/agent-operating-contract.md).
For the broader systems view, see [Self-Evolving Engineering Ecosystem](docs/idd/self-evolving-ecosystem.md).
For governing changes to IDD itself, see [Methodology Change Process](docs/idd/methodology-change-process.md).

## Skills

| Skill | Purpose | Invocation |
|-------|---------|------------|
| **Solution Narrative** | Personas, journeys, stories — the "why" | `/solution-narrative` |
| **Domain Modeling** | Entities, aggregates, business rules | `/domain-modeling` |
| **Behavior Contract** | BDD features, OpenAPI/AsyncAPI/JSON-RPC contracts, fixtures | `/behavior-contract` |
| **E2E Journey Testing** | Playwright tests from journey maps | `/e2e-journey-testing` |
| **Certification** | Traceability verification and evidence manifests | `/certification` |
| **IDD Workflow** | Meta-skill: when to use which skill | `/idd-workflow` |

Skills are designed to be invoked in sequence: narrative → model → contract → implementation → validation → certification. Each skill's output feeds the next.

## Implementation skill bindings

Stack-specific skills are consumer-owned dependencies, not part of the IDD release. Install them through the mechanism appropriate to the active agent host, then bind them explicitly in the consuming repository's overlay. This keeps framework choices and versions local to the repository that depends on them.

## Repository layout

```
bin/
└── idd.js                   CLI entrypoint (npm bin)

docs/idd/                    IDD philosophy and concept library
├── manifesto.md             Core principles (the "why")
├── concepts.md              Atomic concept catalog (C1–C16)
├── concept-skill-map.md     Which concepts each skill carries
├── agent-operating-contract.md  Non-negotiable agent rules
├── agent-role.md            Agent-role extension for orchestrated agency
├── self-evolving-ecosystem.md  Runtime + world-model framing around IDD
├── methodology-change-process.md  How IDD changes should follow IDD
├── templates/               Reusable methodology templates
├── project-template.md      Artifact spine and delivery loop
└── certification-guide.md   Evidence standards and templates

skills/                      IDD methodology skills (bundled in package)
├── solution-narrative/      Personas, journeys, stories
├── domain-modeling/         Entities, aggregates, business rules
├── behavior-contract/       BDD features, protocol contracts, fixtures
├── e2e-journey-testing/     Playwright journey tests
├── certification/           Traceability verification and evidence
└── idd-workflow/            Meta-skill: when to use which skill

tools/                       Validators and generators
├── validate-front-matter.js Validate required/recommended metadata fields
├── validate-traceability.js Validate cross-artifact reference integrity
├── validate-capability-scope.js Validate capability scope coverage
├── validate-capability-closure.js Validate capability scope as a reference closure
├── validate-contracts.js    Validate OpenAPI, AsyncAPI, and JSON-RPC contracts
├── validate-fixtures.js     Validate fixtures against protocol-specific contract schemas
├── validate-models.js       Validate model/lifecycle structural rules
├── validate-enforcement-bindings.js Validate model rule enforced: bindings resolve to real artifacts
├── validate-journey-maps.js Validate journey map structural rules
├── generate-evidence.js     Generate certification evidence manifests (CI report input)
├── graph-generation/        Mermaid spec traceability graph generators
└── lib/                     Shared parsing and formatting helpers

.github/actions/idd-check/   Reusable GitHub Action for consuming repos
```

## Validation Suite

Run all validators at once:

```bash
idd validate all --json
```

Or run individual checks:

```bash
idd validate traceability front-matter --json
idd validate fixtures models --strict
```

Available validators: `contracts`, `traceability`, `front-matter`, `capability-scope`, `capability-closure`, `fixtures`, `models`, `enforcement-bindings`, `journey-maps`, `evidence`.

Common CLI options:
- `--files <paths...>` limit checks to specific files
- `--json` machine-readable output for CI aggregation
- `--strict` treat warnings as errors

## How concepts and skills relate

Concepts ([`docs/idd/concepts.md`](docs/idd/concepts.md)) are the atomic units of IDD philosophy. Skills ([`skills/`](skills/)) are operational implementations that embody subsets of those concepts. The mapping between them is tracked in [`docs/idd/concept-skill-map.md`](docs/idd/concept-skill-map.md).

When converting a skill to a new agent platform:
1. Check which concepts the skill carries (the map).
2. Use the concept catalog as the acceptance checklist.
3. Ensure no concept is lost or contradicted in translation.

## Source of truth policy

1. Concept definitions in `docs/idd/` are authoritative for meaning.
2. Skills in `skills/` are authoritative for operational implementation.
3. Runtime copies (`~/.claude/skills`, `~/.codex/skills`) are installed via `idd install-skills` and version-stamped. Run `idd install-skills --check` to detect staleness.

## Self-referential note

This repository is itself organized as an IDD project. `docs/idd/` is the narrative and concept layer. `skills/` is the implementation layer. `tools/` is the validation layer. `concepts.md` is the domain model for the methodology itself. The framework describes itself.

## Origin

IDD was developed collaboratively by [Ted Slusser](https://github.com/slusset) with AI as a design partner — human intuition driving the exploration, AI reasoning through the structure. The methodology is being refined through prototype and downstream projects across different technology stacks. Its current UAT status is an explicit maturity boundary, not a production-readiness claim.

## License

MIT
