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

# Validate the Claude Code plugin/marketplace manifests (matches the CI job)
validate-plugin:
    claude plugin validate --strict .
    claude plugin validate --strict .claude-plugin/plugin.json

# Bump package.json and .claude-plugin/plugin.json in lockstep (e.g. `just release 1.2.0`)
release version:
    node -e "for (const f of ['package.json', '.claude-plugin/plugin.json']) { const fs = require('fs'); const data = JSON.parse(fs.readFileSync(f, 'utf8')); data.version = '{{version}}'; fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n'); console.log(f + ' -> {{version}}'); }"
    @echo ""
    @echo "Next steps:"
    @echo "  1. Move the [Unreleased] CHANGELOG entries under [{{version}}]"
    @echo "  2. just ci && just validate-plugin"
    @echo "  3. Commit, tag v{{version}}, push with tags"
    @echo "  4. npm publish"
    @echo "  5. Move the v1 major tag for idd-check action consumers"

# Run everything CI runs
ci: test validate
