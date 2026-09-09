# Reusing formal verification evidence (#108)

A consumer may select a probe for re-verification or emit `observed: not-run`
with a `covered_by` citation. IDD validates reuse; it does not select changed
paths, execute checkers, download artifacts, or authenticate a CI provider.
Directory filters are candidate selectors, not evidence of coverage.

## Contract

Executed records remain compatible. Reusable executed records additionally
carry `probe.inputs`: a nonempty array of `{path, digest}` pairs identifying
all tracked repository inputs to that probe. The producer must enumerate
imports, configuration, fixtures, runner code and relevant mappings; IDD cannot
infer arbitrary tool dependencies. Include the module manifest, probe source, tool lock and all
matching verification maps and their transitive `depends_on` maps. Paths are
canonical repository-relative regular Git files; generated or external inputs
must first acquire a reproducible tracked identity. File order is immaterial.

A not-run record carries the same probe kind/name/source/scope/input set and
tool identity, the current run's full Git commit, `verdict: covered`, and:

```json
{"covered_by":{"run_id":"baseline-job-1","revision":"<full-commit-id>","source_digest":"sha256:<64-hex>"}}
```

`covered` is a producer's proposed verdict, not proof. The roll-up requires:

1. Baseline records supplied separately with `--baseline-results-dir`; they
   never count as observations in the current run. Both record sets validate.
2. Exactly one directly executed baseline record with matching run ID, revision,
   probe kind/name/source/scope, tool name/version/digest/lock and input set.
   Chained reuse, ambiguous records, null identity, and mismatched outcomes refuse.
3. Full commit IDs resolve locally; the baseline is an ancestor (or the same
   commit from another run) of the current checkout revision. Missing/shallow
   ancestry fails closed. A cited run is different from the current run.
4. Every declared input has the same digest in the baseline Git tree, current
   Git tree and current working tree; no symlink or path escape is accepted.
   The source digest matches the source input; the lock pins the cited tool.
5. The baseline's observed outcome still matches every current claim. CI reuse
   requires a CI baseline. A failing record in the supplied cited run refuses
   coverage. Consumers must obtain complete baseline artifacts from their
   trusted successful CI jobs; an arbitrary file or claimed run ID is not
   authenticated evidence of execution.

Missing or invalid coverage is an error even without `--strict`. A consumer
should run the probe instead of emitting a citation when any prerequisite is
unknown. Ordinary missing probes remain unobserved; they are not covered.

Within one roll-up, successful Git-tree digest lookups may be reused for the
same repository, full commit ID and path. Working-tree bytes, symlink checks,
HEAD, ancestry, citations and outcomes are still checked for every probe.
The cache does not survive the roll-up or store coverage verdicts; a later
validation observes current state again. This changes no report/schema meaning.

## Recording and reporting

Use `evidence record --inputs-file inputs.json` with a JSON array of paths to
hash the current input set. For skipped execution also provide `--observed
not-run --covered-by-file citation.json`. The producer supplies the pinned tool
lock, source, scope and current revision as for an executed observation. Record
creation validates shape; only roll-up validates the baseline and ancestry.

Use `evidence rollup --baseline-results-dir .idd/evidence/baseline`. Keep that
directory separate from `.idd/evidence/results`. Reports retain `observed:
not-run`, list each accepted baseline run/revision/outcome, and count fresh
matches separately from covered matches. Valid coverage can support the existing
verification classification without claiming fresh execution or semantic
ratification. A bounded baseline remains evidence only for its recorded scope.

## Acceptance and non-goals

Fixtures use disposable Git histories: unchanged input success, changed
source/import/configuration/tool/map, changed expectation, dirty input,
non-ancestor or unavailable commit, missing/ambiguous/invalid baseline, local-to-CI
promotion, chained reuse, schema-invalid citations, and CLI/bundled parity.

AlloyIdentity #257 owns scheduling, trusted artifact acquisition, freshness
policy and merge-base input selection. IDD cannot prove that a producer's input
manifest is complete or that a checker actually ran. No remote access,
attestation protocol, automatic skip, or consumer configuration migration is
introduced here. Existing records without input manifests still count as fresh
observations; they are not eligible baselines for reuse.
