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
| Certification | `certification/trade-show-signup/` | Automated evidence tied to intent |

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

The narrative, model, and contract layers are completely technology-independent. The `specs/` directory works the same whether your implementation uses Spring Boot, Express, Django, Rails, Angular, React, or anything else. Implementation skills can be swapped or added for any stack without changing the upstream artifacts.

## Installation

### Quick start (from Git)

```bash
npm install --save-dev github:slusset/intention-driven-design
npx idd validate all          # run validators
npx idd install-skills claude  # install skills to ~/.claude/skills/
```

### Local development (from checkout)

```bash
git clone git@github.com:slusset/intention-driven-design.git
cd intention-driven-design
npm install
npm link                       # makes `idd` available globally
```

### Initialize a new project

```bash
npx idd init .                 # scaffolds specs/ structure + CI workflow
npx idd install-skills claude --with-technical
```

### CLI reference

```
idd validate <check...>       Run validators (or "all")
idd install-skills <target>   Install skills to claude/codex/all
  --with-technical             Include stack-specific skills
  --link                       Symlink instead of copy (dev mode)
  --check                      Check if installed skills are current
idd generate-evidence          Scaffold certification evidence manifest
idd init [dir]                 Scaffold IDD directory structure
idd version                    Print version
```

### Installing skills for AI agents

**Claude Code / Codex:**
```bash
idd install-skills claude      # copies versioned skills to ~/.claude/skills/
idd install-skills codex       # copies to ~/.codex/skills/
idd install-skills all         # both
```

**Other agents (Cursor, Gemini CLI, etc.):**
All skills follow the [Agent Skills open standard](https://agentskills.io).
Copy `skills/` and any needed `technical-skills/` into the agent's skill discovery path.

### CI with GitHub Actions

Consuming repos can use the reusable action:

```yaml
- uses: slusset/intention-driven-design/.github/actions/idd-check@v1
  with:
    checks: all
```

Or install the toolkit directly:

```yaml
- run: npm install github:slusset/intention-driven-design
- run: npx idd validate all --json
```

## Repo overlay and technical skills

IDD's narrative, model, and contract skills stay stack-agnostic. Repositories can layer stack-specific implementation guidance on top by:

1. Installing the technical skills they need from `technical-skills/`
2. Adding `specs/skills/repo-overlay.md` to declare which technical skills, architecture docs, test commands, and SDK/codegen workflows are authoritative for that repo

The `idd-workflow` skill should load that overlay before picking backend/frontend implementation skills. If the overlay is missing, it should warn, offer to scaffold one, and continue with explicit assumptions instead of blocking the session.

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

## Technical skills

These are intentionally orthogonal to IDD. They plug into the implementation and validation layers without changing the upstream `specs/` artifacts.

See [`technical-skills/README.md`](technical-skills/README.md) for the discovery convention and how to add new stack-specific skills.

| Skill | Purpose | Invocation |
|-------|---------|------------|
| **Angular Architecture** | Angular structure, test commands, and UI guardrails | `/angular-architecture` |
| **Angular Playwright** | Angular-focused Playwright workflow | `/angular-playwright` |
| **Angular From Design** | Convert static UI/design output into Angular implementation | `/angular-from-design` |
| **Spring Boot Architecture** | Spring Boot boundaries, package rules, and test commands | `/spring-boot-architecture` |

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

technical-skills/            Stack-specific implementation guidance
├── angular-architecture/    Angular architecture and test workflow
├── angular-playwright/      Angular Playwright patterns
├── angular-from-design/     Angular implementation from static design
└── spring-boot-architecture/ Spring Boot architecture and test workflow

tools/                       Validators and generators
├── validate-front-matter.js Validate required/recommended metadata fields
├── validate-traceability.js Validate cross-artifact reference integrity
├── validate-capability-scope.js Validate capability scope coverage
├── validate-contracts.js    Validate OpenAPI, AsyncAPI, and JSON-RPC contracts
├── validate-fixtures.js     Validate fixtures against protocol-specific contract schemas
├── validate-models.js       Validate model/lifecycle structural rules
├── validate-journey-maps.js Validate journey map structural rules
├── generate-evidence.js     Scaffold certification evidence manifests
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

Available validators: `contracts`, `traceability`, `front-matter`, `capability-scope`, `fixtures`, `models`, `journey-maps`, `evidence`.

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

IDD was developed collaboratively by [Ted Slusser](https://github.com/slusset) with AI as a design partner — human intuition driving the exploration, AI reasoning through the structure. The methodology was refined across multiple production projects and is resilient to different technology stacks. It represents a natural evolution beyond spec-driven development: intent as the stable layer above specifications.

## License

MIT
