# Concept → Skill Map

How IDD concepts distribute across skills. Use this when:
- **Creating a new skill**: identify which concepts it must embody.
- **Converting a skill to another agent format**: verify no concept is lost.
- **Updating a concept**: find every skill that needs to reflect the change.

## Matrix

| Concept | solution-narrative | domain-modeling | behavior-contract | e2e-journey-testing | certification | workflow-guide |
|---------|:--:|:--:|:--:|:--:|:--:|:--:|
| C1  Intent Precedes Code        | **primary** | | | | | referenced |
| C2  Models Are Artifacts        | **primary** | **primary** | **primary** | | | referenced |
| C3  Contracts at Boundaries     | | | **primary** | referenced | | referenced |
| C4  Assumptions Executable      | | | **primary** | **primary** | referenced | referenced |
| C5  Fast Honest Feedback        | | | | **primary** | **primary** | referenced |
| C6  Protect Human Cognition     | referenced | referenced | referenced | referenced | | referenced |
| C7  Evolution Preserves Meaning | | referenced | referenced | | | referenced |
| C8  Traceability Chain          | **primary** | referenced | **primary** | **primary** | **primary** | **primary** |
| C9  Narrative-First             | **primary** | | | | | referenced |
| C10 Domain as Formal Model      | | **primary** | referenced | | | referenced |
| C11 Layered Artifact Spine      | referenced | referenced | referenced | referenced | | **primary** |
| C12 Done Means Verified         | | | referenced | **primary** | **primary** | referenced |
| C13 Fix Forward                 | | | referenced | referenced | referenced | **primary** |
| C14 Agent Non-Negotiables       | referenced | referenced | referenced | referenced | referenced | referenced |

**primary** = skill is the main vehicle for this concept; it defines templates and enforces it.
**referenced** = skill mentions or depends on the concept but doesn't define it.

The certification skill is cross-cutting — it verifies the connections *between* layers rather than quality *within* a layer. Its primary role is closing the traceability chain at the evidence level. Detailed standards are in `docs/idd/certification-guide.md`.

## Concept density by skill

| Skill | Primary concepts | Referenced concepts |
|-------|:---:|:---:|
| solution-narrative   | C1, C2, C8, C9        | C6, C11, C14 |
| domain-modeling      | C2, C10                | C6, C7, C8, C11, C14 |
| behavior-contract    | C2, C3, C4, C8        | C7, C10, C11, C12, C13, C14 |
| e2e-journey-testing  | C4, C5, C8, C12       | C3, C6, C11, C13, C14 |
| certification        | C5, C8, C12            | C4, C13, C14 |
| workflow-guide       | C8, C11, C13           | C1, C3, C4, C5, C6, C7, C9, C10, C12, C14 |

## Conversion checklist

When converting a skill to a new agent platform:

1. Look up the skill in the matrix above.
2. For each **primary** concept, verify the converted skill:
   - Defines or enforces the concept explicitly.
   - Includes relevant templates/schemas from the original skill.
3. For each **referenced** concept, verify the converted skill:
   - Does not contradict the concept.
   - Mentions it where relevant (e.g., traceability headers in output templates).
4. Cross-reference concept definitions in [concepts.md](concepts.md) if wording
   diverges — the catalog is authoritative.

## Impact analysis

When updating a concept definition in `concepts.md`:

1. Find the concept row in the matrix.
2. Update every skill marked **primary** — these define the concept operationally.
3. Review skills marked **referenced** — they may need wording adjustments.
4. Run `tools/diff-skills.sh` after syncing to verify no runtime copies diverge.
