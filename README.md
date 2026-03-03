# Intention-Driven Design

**Making meaning explicit, executable, and continuously verified — so systems can scale without semantic drift.**

Intention-Driven Design (IDD) is a methodology for building software where every artifact traces back to a declared human intent. Code is a downstream consequence of intent, never the starting point. We allow change, but we do not allow drift.

## Why IDD exists

Agentic coding tools are remarkably capable at execution but have a subtle failure mode: they optimize locally without a global ground truth. They can write perfect code for the wrong thing. Spec-driven development moved the answer earlier in the process, but still asks "what should the system do?" — IDD asks **"why should the system exist at all?"** and makes that *why* a first-class, traceable artifact.

The result is a framework where AI agents can autonomously implement, verify, and evolve software while humans focus on meaning, tradeoffs, and creative decisions.

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
├──────────────────────────────────────────────────────────────┤
│                     CONTRACT LAYER                           │
│   Features ◀── Contracts ──▶ Fixtures                        │
│   (Gherkin)    (OpenAPI)     (test data)                     │
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
├──────────────────────────────────────────────────────────────┤
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
| Contract | `specs/contracts/openapi/api.yaml` | API: `POST /accounts`, `POST /audits` |
| Contract | `specs/fixtures/onboarding/mobile-signup.json` | Test data: request/response pairs |
| Implementation | Backend + Frontend code | Derived from contracts |
| Validation | `frontend/e2e/journeys/trade-show-signup.spec.ts` | E2E test following the journey |
| Certification | `certification/trade-show-signup/` | Automated evidence tied to intent |

Every artifact in the chain references the one above it. An agent — or a human — can trace any line of code back to the persona goal that motivated it.

## Core principles

1. **Intent precedes code.** No implementation without an explicit intent artifact.
2. **Shared mental models are artifacts, not conversations.** If a concept matters, it has a file.
3. **Contracts define reality at boundaries.** API contracts are the source of truth, not implementation.
4. **Assumptions must become executable.** Untested assumptions are technical debt.
5. **Feedback must be fast, honest, and automated.** Evidence, not confidence theater.
6. **Human cognition is protected.** Agents handle bookkeeping; humans handle meaning.
7. **Evolution must preserve meaning.** We allow change, but we do not allow drift.

Read the full [manifesto](docs/idd/manifesto.md).

## Stack-agnostic by design

The narrative, model, and contract layers are completely technology-independent. The `specs/` directory works the same whether your implementation uses Spring Boot, Express, Django, Rails, Angular, React, or anything else. Implementation skills can be swapped or added for any stack without changing the upstream artifacts.

## Installing as a plugin

### Claude Code / Cowork

**Local testing** (loads skills directly):
```bash
claude --plugin-dir /path/to/intention-driven-design
```

**From GitHub**:
```bash
claude plugin marketplace add slusset/intention-driven-design
claude plugin install idd-skills@intention-driven-design
```

### Codex CLI

```bash
./tools/link-skills.sh codex
```

### Other agents (Cursor, Gemini CLI, etc.)

All skills follow the [Agent Skills open standard](https://agentskills.io).
Copy `skills/` to the agent's skill discovery path.

## Skills

| Skill | Purpose | Invocation |
|-------|---------|------------|
| **Solution Narrative** | Personas, journeys, stories — the "why" | `/solution-narrative` |
| **Domain Modeling** | Entities, aggregates, business rules | `/domain-modeling` |
| **Behavior Contract** | BDD features, OpenAPI contracts, fixtures | `/behavior-contract` |
| **E2E Journey Testing** | Playwright tests from journey maps | `/e2e-journey-testing` |
| **Certification** | Traceability verification and evidence manifests | `/certification` |
| **IDD Workflow** | Meta-skill: when to use which skill | `/idd-workflow` |

Skills are designed to be invoked in sequence: narrative → model → contract → implementation → validation → certification. Each skill's output feeds the next.

## Repository layout

```
docs/idd/                    IDD philosophy and concept library
├── manifesto.md             Core principles (the "why")
├── concepts.md              Atomic concept catalog (C1–C14)
├── concept-skill-map.md     Which concepts each skill carries
├── agent-operating-contract.md  Non-negotiable agent rules
├── project-template.md      Artifact spine and delivery loop
└── certification-guide.md   Evidence standards and templates

skills/                      IDD methodology skills
├── solution-narrative/      Personas, journeys, stories
├── domain-modeling/         Entities, aggregates, business rules
├── behavior-contract/       BDD features, OpenAPI contracts, fixtures
├── e2e-journey-testing/     Playwright journey tests
├── certification/           Traceability verification and evidence
└── idd-workflow/            Meta-skill: when to use which skill

tools/                       Build, link, and validation utilities
├── build.sh                 Package plugin zip for distribution
├── link-skills.sh           Symlink skills into agent runtimes
├── generate-spec-graph.js   Generate interactive spec traceability graph
└── check-traceability.js    Validate cross-references between spec artifacts
```

## How concepts and skills relate

Concepts ([`docs/idd/concepts.md`](docs/idd/concepts.md)) are the atomic units of IDD philosophy. Skills ([`skills/`](skills/)) are operational implementations that embody subsets of those concepts. The mapping between them is tracked in [`docs/idd/concept-skill-map.md`](docs/idd/concept-skill-map.md).

When converting a skill to a new agent platform:
1. Check which concepts the skill carries (the map).
2. Use the concept catalog as the acceptance checklist.
3. Ensure no concept is lost or contradicted in translation.

## Source of truth policy

1. Concept definitions in `docs/idd/` are authoritative for meaning.
2. Skills in `skills/` are authoritative for operational implementation.
3. Runtime copies (`~/.codex/skills`, `~/.claude/skills`) are symlinked from this repo via `tools/link-skills.sh` — never create standalone copies.

## Self-referential note

This repository is itself organized as an IDD project. `docs/idd/` is the narrative and concept layer. `skills/` is the implementation layer. `tools/` is the validation layer. `concepts.md` is the domain model for the methodology itself. The framework describes itself.

## Origin

IDD was developed collaboratively by [Ted Slusser](https://github.com/slusset) with AI as a design partner — human intuition driving the exploration, AI reasoning through the structure. The methodology was refined across multiple production projects and is resilient to different technology stacks. It represents a natural evolution beyond spec-driven development: intent as the stable layer above specifications.

## License

MIT
