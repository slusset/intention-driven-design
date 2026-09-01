set shell := ["bash", "-uc"]

default:
    @just --list

# Install deps and link `idd` globally
install:
    npm install
    npm link

# Remove the global `idd` symlink
unlink:
    npm unlink -g idd-toolkit

# Run the test suite
test:
    npm test

# Run all validators against the example specs/
validate:
    node bin/idd.js validate all

# Run a single validator (e.g. `just check traceability`)
check name:
    node bin/idd.js validate {{name}}

# Install skills into ~/.claude/skills (copy)
install-skills target="claude":
    node bin/idd.js install-skills {{target}}

# Symlink skills into ~/.claude/skills for live editing
link-skills target="claude":
    node bin/idd.js install-skills {{target}} --link

# Check whether installed skills are current
skills-status target="claude":
    node bin/idd.js install-skills {{target}} --check

# Generate the Mermaid traceability graph
graph:
    node tools/graph-generation/generate-spec-graph.js specs --format mermaid

# Lint OpenAPI contracts with Spectral
lint-openapi:
    npx spectral lint specs/contracts/openapi/*.yaml

# Lint Gherkin features
lint-gherkin:
    npx gherkin-lint specs/features/

# Validate the Claude Code and Codex/ChatGPT plugin/marketplace manifests
validate-plugin:
    node tools/validate-plugin-manifests.js
    claude plugin validate --strict .
    claude plugin validate --strict .claude-plugin/plugin.json

# Validate the core skillset with GitHub's Agent Skills publisher
validate-agent-skills:
    gh skill publish --dry-run

# Run everything CI runs
ci: test validate

# ── UAT release process ──────────────────────────────────────────────

# Build the self-contained CLI bundle (dist/bin/idd.js)
build:
    node tools/build-dist.js

# Fail if the committed bundle is stale relative to the source tree
build-check:
    node tools/build-dist.js --check

# Full UAT release readiness: tests, validators, bundle freshness, manifests, pack, doctor
release-check: ci build-check validate-plugin
    npm pack --dry-run > /dev/null 2>&1
    node -e "const {runDoctor}=require('./tools/lib/doctor');const r=runDoctor({repoRoot:process.cwd()});console.log('Doctor:',r.summary.status,'('+r.summary.errors+' errors,',r.summary.advisories+' advisories)');process.exit(r.summary.errors>0?1:0)"
    @echo "UAT release candidate ready."

# Prepare the UAT release PR via Release Please (review + merge it, then release-publish)
release-prepare:
    gh workflow run release-please.yml --ref main -f operation=prepare

# Publish the merged release PR: tag, GitHub release, attached tarball
release-publish:
    gh workflow run release-please.yml --ref main -f operation=publish

# Show recent Release Please runs
release-status:
    gh run list --workflow=release-please.yml --limit 5

# Install/upgrade the global idd CLI from this checkout (packed tarball)
install-cli:
    #!/usr/bin/env bash
    set -euo pipefail
    tmp="$(mktemp -d)"
    tarball="$(npm pack --pack-destination "$tmp" | tail -1)"
    npm install -g "$tmp/$tarball"
    idd version

# Install/upgrade the global idd CLI from a released ref (e.g. just upgrade-cli v0.1.0-uat.3)
upgrade-cli ref="main":
    npm install -g "github:slusset/intention-driven-design#{{ref}}"
    idd version

# Install the Claude Code plugin from the GitHub marketplace
install-plugins:
    claude plugin marketplace add slusset/intention-driven-design
    claude plugin install idd-skills@idd

# Upgrade the installed Claude Code plugin (restart or reload plugins to apply)
upgrade-plugins:
    claude plugin marketplace update idd
    claude plugin update idd-skills@idd

# Doctor a consumer repository (e.g. just doctor ~/Projects/AlloyIdentity)
doctor repo=".":
    node {{justfile_directory()}}/bin/idd.js doctor --repo {{repo}}

# Generate a deterministic migration plan for a consumer repository
doctor-plan repo out="migration-plan.json":
    node {{justfile_directory()}}/bin/idd.js doctor plan --repo {{repo}} --out {{out}}

# Apply an accepted migration plan (list the migration ids to accept)
doctor-apply repo plan +accept:
    #!/usr/bin/env bash
    set -euo pipefail
    flags=()
    for id in {{accept}}; do flags+=(--accept "$id"); done
    node "{{justfile_directory()}}/bin/idd.js" doctor apply --plan "{{plan}}" --repo "{{repo}}" "${flags[@]}"

# Run one methodology-evaluation trial (instrument, never a merge gate)
experiment scenario="evals/scenarios/baseline-empty" condition="local":
    node evals/run-experiment.js --scenario {{scenario}} --condition {{condition}} --out evals/records
