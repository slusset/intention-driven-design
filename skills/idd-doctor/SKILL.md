---
name: idd-doctor
description: "Inspect a repository for IDD release, schema, module, and migration misalignment. Use for report-only consumer checks before planning or applying an evolution migration."
license: MIT
argument-hint: "[consumer-repo]"
allowed-tools: Read Glob Grep
---

# IDD Doctor

## Current capability

The current doctor is report-only. It inspects a repository, runs the
deterministic IDD validators, and reports possible migration work. It does not
write files, change dependencies, move specifications, mutate journal history,
or claim that continuity has been preserved.

Run it from the toolkit checkout or against a consumer repository:

```bash
idd doctor --json
idd doctor --repo ../consumer --json
```

Without `--json`, the output is a concise human report. JSON output is the
stable integration surface for CI, migration planning, and later doctor modes.

## What it inspects

- toolkit, schema registry, package-lock, plugin, and Release Please versions;
- consumer toolkit dependency pinning and module adoption;
- committed generated certification evidence and other deprecated structures;
- all read-only IDD validators, excluding run-specific evidence validation;
- continuity impact for each finding.

Treat validator errors as migration blockers, advisories as explicit
dispositions to record, and infos as observations. A passing doctor report is
alignment evidence only; its continuity dimensions remain `not-assessed`.

## Continuity boundary

Continuity is a declarative quality claim, not a synonym for compatibility.
When a future migration plan exists, it should state which dimensions are
preserved, transformed, retired, or unproven:

- identity;
- intent;
- semantics;
- data; and
- operations.

Do not infer those claims from a clean validator run. A migration must produce
its own before/after evidence and disposition for removed or renamed state.

## UAT workflow

For an accepted UAT candidate:

1. Run `idd doctor --repo <consumer> --json` and retain the report.
2. Review findings and decide whether each requires migration, disposition, or
   no action.
3. Use the next doctor mode to produce a migration plan; do not hand-edit a
   consumer based only on the report.
4. Apply transformations in a consumer feature branch, then run
   `idd validate all` and the consumer's own checks.
5. Publish generated evidence with the migration PR before accepting the UAT.

The report-only phase is intentionally useful before migration code exists:
it makes drift visible while keeping repository and journal state unchanged.
