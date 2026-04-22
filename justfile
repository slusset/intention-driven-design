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

# Run everything CI runs
ci: test validate
