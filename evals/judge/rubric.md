# Judged-Tier Rubric (rubric@1)

The judged tier is subordinate to the deterministic checkers: most quality
claims replay artifacts mechanically through `evals/checkers.js`, and only
the remainder below is judged. A judge that disagrees with a deterministic
checker is an **error to investigate, never an average** — record the
disagreement, do not blend the scores.

Every judged score recorded in an `experiment-record@1` must carry:

- `rubric_digest`: the sha256 of this file's bytes at judging time, so the
  rubric version is pinned in the record;
- `judge`: the exact judge identity (model ID and version, or the human's
  identifier) — never a bare "LLM";
- `human_spot_check_percent`: the declared percentage of judged scores a
  human re-reads for this experiment (minimum 10 for any comparison that
  will be cited).

## Metrics

### narrative-quality (0–4)

How well the produced solution narrative communicates intent to a reader who
has not seen the task.

- 0 — no narrative, or the narrative contradicts the produced artifacts.
- 1 — narrative exists but restates code mechanics; intent is not recoverable.
- 2 — intent recoverable with effort; personas/journeys referenced but not
  connected to outcomes.
- 3 — intent clear; the narrative traces persona → journey → story → outcome
  with minor gaps.
- 4 — a reviewer could reconstruct the change's purpose, scope boundary, and
  verification story from the narrative alone.

### model-fidelity (0–4)

How faithfully the domain model and contracts reflect the stated intent.

- 0 — model absent or unrelated to the task.
- 1 — model names overlap the domain but relationships are wrong.
- 2 — structure broadly right; at least one meaningful concept missing or
  duplicated.
- 3 — concepts and relationships right; naming or cardinality nits only.
- 4 — a domain expert would accept the model as a statement of the intent,
  including what was deliberately left out.

## Procedure

1. Judge each metric independently per trial; never in view of another
   condition's artifacts for the same scenario.
2. Record rationale strings alongside scores.
3. Where a deterministic checker already answers the question (for example,
   traceability closure), the judged tier must not re-score it.
