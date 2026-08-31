# Evolution and Migration

Evolution is the process of changing an IDD repository or consumer while
preserving declared meaning, intent, and continuity. Backward compatibility is
one strategy for evolution; it is not the goal by itself.

## Current doctor boundary

`idd doctor` currently provides a read-only alignment report:

```bash
idd doctor --repo ../consumer --json
```

It inspects release and schema versions, module adoption, deprecated generated
structures, and the current IDD validator suite. It reports findings with a
severity, recommendation, paths, and continuity impact. It does not write
files, apply migrations, or mutate identity/journal history.

The current report deliberately distinguishes:

- `mode: report-only` from a migration plan or apply operation;
- `migration.status: not-applied` from a successful transformation; and
- `continuity.status: not-assessed` from a continuity claim.

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

The intended sequence is:

```text
inspect → plan → dry-run → apply → validate → report
```

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
