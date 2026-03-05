---
tracker:
  kind: github
  active_states:
    - Todo
    - In Progress
    - Rework
  terminal_states:
    - Closed
    - Done
github:
  owner: "slusset"
  repo: "intention-driven-design"
  api_key: "$GITHUB_TOKEN"
polling:
  interval_ms: 30000
workspace:
  root: ~/code/symphony-workspaces
hooks:
  after_create: |
    git clone --depth 1 https://github.com/slusset/intention-driven-design .
agent:
  max_concurrent_agents: 3
  max_turns: 15
codex:
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
---

You are working on an issue in the **Intention-Driven Design** methodology repository.

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the issue is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed work unless needed for new changes.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## About this repository

This is a **methodology repo**, not an application. It contains:

- `docs/idd/` — Markdown documentation defining IDD concepts, manifesto, certification guide, front-matter spec, project template, and agent operating contract
- `skills/` — SKILL.md files that guide agents through IDD phases (solution-narrative, domain-modeling, behavior-contract, e2e-journey-testing, certification, pr-review, idd-workflow)
- `tools/` — Node.js scripts for CI checks (check-traceability.js, check-front-matter.js, check-capability-scope.js) and a shared library (lib/parse-front-matter.js)
- `.github/workflows/idd-check.yml` — GitHub Actions CI workflow
- `README.md` — Project overview with skill table and layered architecture diagram

There is **no application code** to build or run. All work is documentation edits, YAML/Markdown updates, Node.js script modifications, or CI workflow changes.

## Instructions

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions). If blocked, record it in the workpad and move the issue per the workflow below.
3. Final message must report completed actions and blockers only. Do not include "next steps for user".

Work only in the provided repository copy. Do not touch any other path.

## Status map

- `Todo` → queued; immediately transition to `In Progress` before active work.
- `In Progress` → implementation actively underway.
- `Human Review` → PR is attached and validated; waiting on human approval.
- `Rework` → reviewer requested changes; re-read feedback and address.
- `Done` → terminal state; no further action.

## Step 0: Route by current state

1. Read the current issue state.
2. Route:
   - `Todo` → move to `In Progress`, create workpad comment, start execution.
   - `In Progress` → resume from workpad state.
   - `Human Review` → poll for review updates; if changes requested, start rework.
   - `Rework` → re-read all review feedback, address each item, push updates, return to `Human Review`.
   - `Done` → shut down.

## Step 1: Understand the issue and plan

1. Find or create a single persistent comment with header `## Symphony Workpad`.
2. Read the full issue description and acceptance criteria carefully.
3. Identify which files need to change by examining the issue body.
4. Write a hierarchical plan in the workpad comment:
   - List each file to modify and what changes are needed
   - List acceptance criteria as checkboxes
   - Include a validation section

### IDD-specific analysis

Before editing any file, understand how it fits in the IDD artifact web:

- **Docs** (`docs/idd/*.md`): These define the conceptual foundation. Changes here often need corresponding updates in skills that reference the same concepts. Cross-check `docs/idd/concepts.md` (C1–C15 definitions) and `docs/idd/concept-skill-map.md` to find downstream references.
- **Skills** (`skills/*/SKILL.md`): These are agent-facing workflow instructions. Changes must be consistent with `docs/idd/` principles and with each other. Pay attention to handoff sections — when one skill says "next, invoke X", skill X must accept that handoff.
- **Tools** (`tools/*.js`): These implement CI checks. Changes must match the validation logic described in `skills/pr-review/SKILL.md` and `.github/workflows/idd-check.yml`.
- **CI** (`.github/workflows/idd-check.yml`): This wires tools into automated PR checks. Steps here must match what `skills/pr-review/SKILL.md` describes as Layer 1 checks.
- **Front-matter spec** (`docs/idd/front-matter-spec.md`): The canonical schema for YAML front-matter. Any tool or skill that references front-matter must be consistent with this spec.

### Consistency checks

After planning changes, verify:

1. **Cross-reference integrity**: If you change a concept definition in `docs/idd/concepts.md`, grep for that concept ID (e.g., `C13`) across all skills and docs to find places that may need updating.
2. **Skill handoff consistency**: If you modify a skill's output or handoff section, check the receiving skill's input expectations.
3. **CI-to-docs alignment**: If you change what CI checks for, update both the tool script and the pr-review skill description.
4. **README accuracy**: If you add or rename skills, docs, or tools, verify the README tables and directory listing.

## Step 2: Execute changes

1. Implement against the plan, checking off items as completed.
2. For **documentation changes**:
   - Use clear, precise language consistent with existing IDD voice
   - Preserve existing formatting conventions (YAML front-matter delimiters, heading levels, etc.)
   - When adding new sections, follow the structural patterns of neighboring content
3. For **Node.js tool changes**:
   - Follow the existing patterns in `tools/` (use `parse-front-matter.js` for YAML parsing)
   - Add `--json` output support if the tool will be called from CI
   - Test the script runs without errors: `node tools/<script>.js`
4. For **CI workflow changes**:
   - Ensure step IDs are consistent with the PR comment assembly step
   - Use `continue-on-error: true` for check steps so all checks run even if one fails
   - Wire results into the PR comment template
5. For **skill changes**:
   - Validate that templates in the skill match `docs/idd/front-matter-spec.md`
   - Check that any referenced file paths exist or are documented as "created by this skill"

## Step 3: Validate and submit

1. Run consistency validation:
   - If the issue modifies Node.js tools (`tools/*.js`), verify the script runs without syntax errors: `node -c tools/<script>.js`
   - If the issue modifies CI (`.github/workflows/idd-check.yml`), validate YAML syntax: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/idd-check.yml','utf8'))"`
   - Grep for any broken cross-references you may have introduced (e.g., concept IDs, skill names, file paths mentioned in docs that no longer exist)
   - Verify markdown renders correctly (no unclosed fences, broken tables)
   - Note: `tools/check-traceability.js` validates specs in target projects that adopt IDD — it does not apply to this methodology repo itself
2. Update the workpad comment with completed checklist and validation results.
3. Commit with a clear message referencing the issue number:
   - Format: `<type>: <description> (#<issue-number>)`
   - Types: `docs`, `fix`, `feat`, `refactor`, `ci`, `tool`
   - Example: `docs: add graduated adoption guide (#6)`
4. Push and create a PR:
   - Title matches commit message
   - Body references the issue: `Closes #<number>`
   - Add label `symphony` to the PR
5. Link the PR to the issue.
6. Verify PR checks pass (if CI runs on this repo).
7. Move issue to `Human Review`.

## Step 4: Rework handling

1. Re-read the full issue body and all review comments.
2. Address each piece of feedback:
   - Code/docs changes → implement the fix
   - Disagreements → post a justified reply on the specific comment
3. Update the workpad with what changed.
4. Push updates and return issue to `Human Review`.

## Completion bar before Human Review

- All acceptance criteria from the issue body are addressed
- Workpad checklist is fully checked off
- Consistency checks pass (cross-references, handoff alignment, CI-to-docs)
- PR is created, linked, and has `symphony` label
- Commit message follows the format convention

## Guardrails

- This is a methodology repo. There is no application to build, run, or deploy.
- Do not create `specs/` directories or IDD artifacts (personas, journeys, etc.) — those belong in target projects that adopt IDD, not in the IDD repo itself.
- Do not modify files outside the scope of the current issue.
- If you discover out-of-scope improvements, create a separate GitHub issue rather than expanding current scope.
- Keep changes minimal and focused. The goal is to resolve the specific issue, not to refactor the entire repo.
- When editing documentation, preserve the existing authorial voice. IDD docs are precise but not academic — they use imperative language and concrete examples.
- When editing skills, remember these are **agent instructions**. They must be unambiguous, actionable, and testable. Avoid vague guidance.

## Workpad template

Use this structure for the persistent workpad comment:

````md
## Symphony Workpad

### Plan

- [ ] 1. File/change description
  - [ ] 1.1 Sub-task
- [ ] 2. File/change description

### Acceptance Criteria

- [ ] (copied from issue body)

### Validation

- [ ] Cross-reference check: grep for changed concept IDs, skill names, file paths
- [ ] Consistency check: skill handoffs align, CI matches pr-review docs
- [ ] Syntax check: modified scripts parse, modified YAML is valid
- [ ] Markdown renders correctly (fences closed, tables aligned)

### Notes

- Progress notes with timestamps
````
