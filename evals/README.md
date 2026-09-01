# Methodology Evaluation Instrument

This directory is an **instrument, not a feature** (issue #58, following the
architecture proven in slusset/AlloyIdentity decision 44). It measures whether
the IDD pack's workflow reduces drift and produces traceable, verified
outcomes on real tasks — and which pack version or skill variant does it best.

## Ground rules

- **No benchmark number ever gates a merge.** CI may test the instrument's
  mechanics (schema validity, runner determinism, layering), but never a
  score.
- **Outside the release unit.** `evals/` is excluded from the npm package and
  plugin surface. The layer check is enforced by tests: product code under
  `bin/` and `tools/` must never reach into `evals/`; the instrument may use
  the product, because trials are recorded *through the system under test*.
- **Deterministic checkers first, judge subordinate.** The deterministic tier
  is the existing `tools/validate-*.js` suite, run as pure functions over the
  artifacts a trial produced: traceability closure, contract conformance,
  fixture integrity. The judged tier is small and pinned: a committed rubric
  (`judge/rubric.md`), the judge identity recorded in every score, and a
  declared human spot-check percentage. A judge that disagrees with a
  deterministic checker is an **error to investigate, never an average**.
- **Conditions are arms behind one seam.** Same scenario, same budget:
  with-pack vs without-pack, pack `0.1.0-uat.N` vs a later candidate, or
  skill variants. Condition overhead is charged to the condition. Comparisons
  across unlike tiers are refused.
- **Every trial is reconstructable from its record alone.** Records conform
  to the closed, bounded `experiment-record@1` contract
  (`contracts/experiment-record.schema.json`); the scenario seed and every
  measured artifact are content-addressed by digest.

## Running a trial

```bash
node evals/run-experiment.js \
  --scenario evals/scenarios/baseline-empty \
  --condition with-pack-0.1.0-uat.2 \
  --out evals/records
```

The runner digests the scenario tree, executes the deterministic checkers
over it, and writes a schema-validated `experiment-record@1` JSON file. Run
it once against the untouched seed for a baseline, then again after an agent
(under some condition) has performed `task.md` in a copy of the scenario —
the two records are the comparison.

Records under `evals/records/` are trial evidence; commit them only alongside
the analysis that cites them.

## Layout

```
evals/
  README.md                          this charter
  contracts/experiment-record.schema.json   experiment-record@1 (closed world)
  checkers.js                        deterministic tier over the validators
  run-experiment.js                  trial runner
  judge/rubric.md                    pinned rubric for the judged tier
  scenarios/<id>/scenario.json       scenario metadata
  scenarios/<id>/task.md             the task given to the agent under test
  scenarios/<id>/...                 seed repository tree
  records/                           produced experiment records
```

## Next scenarios

`baseline-empty` exercises the mechanics. The scenario suite grows toward the
arms named in #58: add a capability end-to-end, absorb a breaking contract
change, onboard a new bounded context (#56). Pack releases can then carry
their own records — "this candidate improved traceability-closure rate on the
scenario suite from X to Y" — instead of testimony.
