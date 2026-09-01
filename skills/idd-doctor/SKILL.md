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

## Running from a plugin install (code sessions)

A Claude Code or Codex plugin install puts `idd` on the session PATH and is
self-contained: the plugin's `bin/idd` wrapper falls back to the committed
`dist/bin/idd.js` bundle, so `idd version`, `idd doctor --repo <consumer>
--json`, and `idd validate all --json` work without a repository-local
`node_modules`, an `npm install`, or a legacy `npm link`.

To upgrade the toolkit from a code session:

1. Update the plugin (Claude Code): `/plugin marketplace update idd`, then
   `/plugin update idd-skills@idd` (or uninstall/reinstall the plugin).
2. Confirm the running candidate: `idd version` and
   `idd doctor --repo <consumer> --json` — the report's
   `repository.doctor_toolkit_version` is the toolkit actually executing.
3. Compare the consumer's `idd_consumer` pins against the new candidate and
   treat every drift finding as migration input, not as an auto-update.

## What it inspects

- toolkit, schema registry, package-lock, plugin, and Release Please versions;
- consumer toolkit dependency pinning and module adoption;
- the consumer's `idd_consumer` contract in repo-overlay front matter;
- accepted toolkit release, schema-registry version/digest, and distribution provenance;
- the toolkit's report-only migration catalog and applicable schema path;
- committed generated certification evidence and other deprecated structures;
- all read-only IDD validators, excluding run-specific evidence validation;
- continuity impact for each finding.

Treat validator errors as migration blockers, advisories as explicit
dispositions to record, and infos as observations. A passing doctor report is
alignment evidence only; its continuity dimensions remain `not-assessed`.

The consumer contract is the adoption record for the toolkit itself. It is
separate from the consumer's own `specs/modules.yaml`, capabilities, and
verification maps. A stale toolkit or schema pin is migration input, not proof
that the consumer's domain meaning changed.

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
3. Review any cataloged migration IDs and steps; a missing path is an explicit
   design task, not permission to guess a transformation.
4. Use the next doctor mode to produce a migration plan; do not hand-edit a
   consumer based only on the report.
5. Apply transformations in a consumer feature branch, then run
   `idd validate all` and the consumer's own checks.
6. Publish generated evidence with the migration PR before accepting the UAT.

The report-only phase is intentionally useful before migration code exists:
it makes drift visible while keeping repository and journal state unchanged.
