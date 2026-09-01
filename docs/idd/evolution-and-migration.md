# Evolution and Migration

Evolution is the process of changing an IDD repository or consumer while
preserving declared meaning, intent, and continuity. Backward compatibility is
one strategy for evolution; it is not the goal by itself.

## Current doctor boundary

`idd doctor` has three modes:

```bash
idd doctor --repo ../consumer --json                 # inspect (report-only)
idd doctor plan --repo ../consumer --out plan.json   # plan (report-only)
idd doctor apply --plan plan.json \
  --accept <migration-id> --repo ../consumer         # apply (explicit writes)
```

Inspection reads release and schema versions, module adoption, deprecated
generated structures, and the current IDD validator suite, reporting findings
with a severity, recommendation, paths, and continuity impact. It does not
write files, apply migrations, or mutate identity/journal history.

The report deliberately distinguishes:

- `mode: report-only` from a migration plan or apply operation;
- `migration.status: not-applied` from a successful transformation; and
- `continuity.status: not-assessed` from a continuity claim.

`idd doctor plan` produces a deterministic `idd-migration-plan` artifact: a
pure function of the repository tree, the running toolkit, and the shipped
migration catalog, with no timestamps. Its JCS digest pins the exact state the
plan was built from and doubles as replay protection. A plan writes nothing.

`idd doctor apply` is the explicit-compatibility boundary. It refuses before
any write when the plan digest no longer matches current repository, toolkit,
or catalog state; when error-severity findings block the migration; or when a
migration with review-required continuity has not been accepted with
`--accept <migration-id>`. Accepted plans execute their steps in order:
`review` steps are acknowledged, `transform` steps run registered
deterministic transformations, and `validate` steps run the deterministic
validator suite. Invariants are re-validated unconditionally after the last
migration, and the evolution is journaled as an appended
`idd-evolution-record` under `.idd/evolution/` — generated evidence, never a
mutation of repository history or a consumer journal. Run apply on a feature
branch; version control remains the undo mechanism.

## Migration catalog

The toolkit ships [`migrations/catalog.json`](../../migrations/catalog.json), a
small ordered catalog of schema transitions. Its shape is checked by
[`migrations/catalog.schema.json`](../../migrations/catalog.schema.json). Each
entry names an exact source and target schema version, a short sequence of
inspect/review/transform/validate steps, and continuity dispositions.

This borrows the useful part of Angular upgrade schematics: migrations are
versioned, discoverable package metadata selected by the source and target
versions. `idd doctor` reports the shortest cataloged path, and `idd doctor
apply` executes it from an accepted plan. A `transform` step must name a
transformation registered in `tools/lib/transformations.js`; each
transformation is deterministic — the same repository and toolkit inputs
produce the same bytes — and none of them touch journal history. The first
registered transformation, `record-consumer-contract`, records or updates the
`idd_consumer` front-matter pins in `specs/skills/repo-overlay.md`.

A consumer with no recorded contract has no cataloged transition to select,
so the plan proposes a synthetic `adopt-consumer-contract` migration: the
first evolution is adoption, recording the contract for the running toolkit
under the same acceptance, validation, and evidence rules.

## Declarative evolution policy

The proposed policy is:

```yaml
evolution:
  compatibility: explicit
  migration: required-when-state-exists
  legacy-preservation: only-with-known-consumer
  removal:
    requires:
      - no-known-consumers
      - migration-or-disposition
```

When migration planning is implemented, each plan should identify its source
and target methodology/schema versions and declare continuity dispositions:

```yaml
continuity:
  identity: preserved
  intent: preserved
  semantics: preserved
  data: transformed
  operations: verified
  removed:
    - field: legacy_selector
      disposition: replaced-by-evidence-binding
```

These are claims requiring evidence, not defaults inferred from a passing
validator. A removed or renamed field needs an explicit migration or
disposition, especially when the repository has known state.

## Migration sequence

The implemented sequence is:

```text
inspect → plan → apply (accept → transform → validate) → evolution record
```

A generated plan reviewed before `apply` serves as the dry-run: it lists every
migration, step, transformation, and continuity disposition that acceptance
authorizes, and nothing outside the plan is executed.

The first migration target is repository/spec state: modules, verification
maps, evidence bindings, contract pins, role contracts, and other declarative
artifacts. The doctor itself is a narrow module with its own capability and
verification map; it does not receive implicit authority over the Identity
Kernel.

## Identity Kernel relationship

The module DAG describes static semantic dependencies. The journal DAG records
dynamic causal history. A repository migration may be traceable and
certification-backed without becoming a journal event.

An eventual AlloyIdentity `EvolutionEvent` requires a separate contract for
authority, causality, replay, and continuity. Until those semantics are
specified, doctor migrations remain repository-level changes with generated
evidence and an explicit continuity disposition.

Issue: [#69](https://github.com/slusset/intention-driven-design/issues/69)
