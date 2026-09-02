---
name: idd-doctor
description: "Inspect a repository for IDD release, schema, module, and migration misalignment; generate deterministic migration plans; apply accepted plans with evolution evidence. Use for consumer checks and explicit evolution migrations."
license: MIT
argument-hint: "[consumer-repo]"
allowed-tools: Read Glob Grep Bash
---

# IDD Doctor

## Current capability

The doctor has three modes. Inspection is report-only: it inspects a
repository, runs the deterministic IDD validators, and reports possible
migration work without writing files, changing dependencies, moving
specifications, mutating journal history, or claiming continuity. Planning is
also report-only: it emits a deterministic, digest-pinned migration plan.
Apply executes an accepted plan — and only an accepted plan.

```bash
idd doctor --json                                    # inspect (report-only)
idd doctor --repo ../consumer --json
idd doctor plan --repo ../consumer --out plan.json   # plan (report-only)
idd doctor apply --plan plan.json \
  --accept <migration-id> --repo ../consumer         # apply (explicit writes)
```

Without `--json`, the output is a concise human report: findings grouped by
id with counts and the files each names, then every finding when there are
few enough to read (`--verbose` lists all of them; `--summary` prints only the
groups). `--severity error`, `--severity advisory,info` narrows what is shown
while the summary keeps the totals of the full inspection. JSON output is the
stable integration surface for CI and migration tooling; each validator
finding carries a discriminating `id` (`validator-<check>-<code>`, where the
code is derived from the message shape, not the file), plus `check`, `code`,
and `file`, so triage, deduplication, and per-check suppression work on the
id alone.

Apply refuses before any write when the plan digest no longer matches the
repository/toolkit/catalog state, when error findings block migration, or
when a review-required migration lacks `--accept <migration-id>`. Error
findings that the plan's own transformations declare they resolve (a fixture
`_meta.type` the `fixture-meta-kind` rewrite fixes, for instance) are listed
as `resolved_by_plan`, not as blockers; apply confirms they are gone
afterwards. Any other error can be accepted explicitly with
`--allow-blocker <finding-id>`, which the evolution record retains, so a
consumer gate's report-only exceptions have a toolkit-side equivalent. Transform
steps run only transformations registered in the toolkit; invariants are
re-validated afterwards; the evolution is journaled as an appended record
under `.idd/evolution/`. Run apply on a feature branch — version control is
the undo mechanism. A consumer with no recorded contract gets a synthetic
`adopt-consumer-contract` plan that records the initial pins; inspection
names that path (`migration.catalog.synthetic: true`) rather than reporting
an empty migration list.

## Running a standalone install (CI, gates, no plugin host)

The CLI does not need a plugin host, a repository-local `node_modules`, or a
global npm prefix. The release tarball attached to every GitHub release is
self-contained; `install/idd-install.sh` places one immutable version under
`~/.idd/toolkits/<version>/` and links `idd` into `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/slusset/intention-driven-design/main/install/idd-install.sh \
  | sh -s -- --version 0.1.0-uat.4
~/.idd/toolkits/0.1.0-uat.4/bin/idd doctor --repo . --json
```

Versions sit side by side, so a consumer gate can call the exact accepted
release by path instead of trusting whatever `idd` is first on PATH.
`npm i -g <release tarball url>` remains a valid alternative.

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
4. Generate the plan: `idd doctor plan --repo <consumer> --out plan.json`.
   Review every migration, step, and continuity disposition in it — the plan
   is the dry-run, and acceptance authorizes nothing outside it. Do not
   hand-edit a consumer based only on the report.
5. On a consumer feature branch, apply the reviewed plan:
   `idd doctor apply --plan plan.json --accept <migration-id> --repo
   <consumer>`. Apply re-validates invariants and refuses stale or tampered
   plans; then run the consumer's own checks.
6. Publish the `.idd/evolution/` record and generated evidence with the
   migration PR before accepting the UAT.

Inspection stays useful on its own: it makes drift visible while keeping
repository and journal state unchanged.
