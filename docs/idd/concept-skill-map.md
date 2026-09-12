# Concept → Skill Map

How IDD concepts distribute across skills. Use this when:
- **Creating a new skill**: identify which concepts it must embody.
- **Converting a skill to another agent format**: verify no concept is lost.
- **Updating a concept**: find every skill that needs to reflect the change.

## Matrix

| Concept | solution-narrative | domain-modeling | behavior-contract | module-scaffolding | e2e-journey-testing | certification | pr-review | idd-workflow | idd-doctor |
|---------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| C1 Intent Precedes Implementation | **primary** | referenced | referenced | | | | referenced | referenced | |
| C2 Shared Mental Models Are Artifacts | **primary** | **primary** | **primary** | referenced | | referenced | | referenced | |
| C3 Traceability Spine | **primary** | referenced | **primary** | referenced | **primary** | **primary** | **primary** | **primary** | referenced |
| C4 Formal Model, Rules as the Join Key | | **primary** | **primary** | referenced | referenced | referenced | referenced | referenced | referenced |
| C5 Capability Is the Unit of Verification | referenced | | **primary** | **primary** | | **primary** | referenced | **primary** | referenced |
| C6 Modules and Contracts at Boundaries | | referenced | **primary** | **primary** | referenced | referenced | referenced | referenced | referenced |
| C7 Claims Require Evidence | | referenced | referenced | referenced | **primary** | **primary** | **primary** | referenced | referenced |
| C8 Evolution Preserves Meaning | referenced | referenced | referenced | | referenced | referenced | **primary** | **primary** | **primary** |
| C9 Humans Own Meaning | referenced | referenced | referenced | | referenced | referenced | **primary** | **primary** | referenced |
| C10 Telos | **primary** | | | | | | referenced | **primary** | |

**primary** = skill is the main vehicle for this concept; it defines templates and enforces it.
**referenced** = skill mentions or depends on the concept but doesn't define it.

The certification skill is cross-cutting — it verifies the connections *between*
layers rather than quality *within* a layer. Its primary role is closing the
traceability spine at the evidence level. Detailed standards are in
[certification-guide.md](certification-guide.md).

The pr-review skill is also cross-cutting — it enforces IDD compliance at the
pull request boundary before merge, in two layers: deterministic checks and
optional semantic review.

## Conversion checklist

When converting a skill to a new agent platform:

1. Look up the skill in the matrix above.
2. For each **primary** concept, verify the converted skill:
   - Defines or enforces the concept explicitly.
   - Includes the relevant templates and schemas from the original skill.
3. For each **referenced** concept, verify the converted skill:
   - Does not contradict the concept.
   - Mentions it where relevant, such as traceability headers in output templates.
4. Cross-reference concept definitions in [concepts.md](concepts.md) if wording
   diverges — the catalog is authoritative.

## Impact analysis

When updating a concept definition in `concepts.md`:

1. Find the concept row in the matrix.
2. Update every skill marked **primary** — these define the concept operationally.
3. Review skills marked **referenced** — they may need wording adjustments.
