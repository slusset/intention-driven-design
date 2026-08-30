# Release and Distribution

IDD has one release ledger and several host-specific delivery adapters. A
release is identified by an immutable `vX.Y.Z` Git tag. The npm package, Claude
plugin manifest, Codex plugin manifest, and Release Please manifest must all
name the same version.

The adapters do not imply a shared installation state. Each host keeps its own
plugin or skill cache, so operators update that host explicitly and verify what
it loaded.

## Release lifecycle

1. Merge feature and fix commits to `main` using Conventional Commit prefixes.
   `feat:` requests a minor release, `fix:` requests a patch, and `!` or a
   `BREAKING CHANGE` footer requests a major release.
2. Release Please opens or updates a draft release PR. That PR owns changes to
   `CHANGELOG.md`, `package.json`, `package-lock.json`, both plugin manifests,
   and `.release-please-manifest.json`.
3. Review the release PR, run the normal repository checks, and mark it ready.
4. Merging the release PR creates the immutable `vX.Y.Z` tag and GitHub
   Release. The release workflow re-runs the source checks, attaches the npm
   tarball, and moves the supported `vX` tag used by the reusable GitHub Action.

Set a repository secret named `RELEASE_PLEASE_TOKEN` to a fine-grained token
that can write contents, issues, and pull requests if checks must run
automatically on Release Please PRs. The workflow falls back to `GITHUB_TOKEN`,
but GitHub does not emit new workflow events for changes made with that token.

Do not edit versions manually. If the release PR proposes the wrong version,
fix the commit history or use Release Please's documented release override on
the source PR, then let it regenerate the release PR.

## Distribution matrix

| Surface | Released unit | Install | Update | Verify |
| --- | --- | --- | --- | --- |
| Claude desktop and Claude Code CLI | Claude plugin: core skills, technical skills, CLI, validators, schemas | Add `slusset/intention-driven-design`, then install `idd-skills@idd` in the plugin browser or with `claude plugin install idd-skills@idd` | `claude plugin update idd-skills@idd`, then restart or reload plugins | `claude plugin list` and `idd version` |
| Codex desktop and CLI | Codex plugin: core skills plus repository tooling | Add the Git marketplace with `codex plugin marketplace add slusset/intention-driven-design --ref main`, then `codex plugin add idd-skills@idd` | `codex plugin marketplace upgrade idd`, then `codex plugin add idd-skills@idd`; start a new task/session | `codex plugin list` and `idd version` when the host exposes the bundled CLI |
| GitHub Copilot App, CLI, VS Code, cloud agent, and code review | Agent Skills from the tagged repository; validators remain the npm/GitHub Action artifact | `gh skill install slusset/intention-driven-design --all --agent github-copilot --scope user` | `gh skill update --all` | `gh skill list --agent github-copilot --json skillName,sourceURL,version,pinned,path` |
| CI and repositories | npm tarball or reusable GitHub Action | Install `github:slusset/intention-driven-design#vX.Y.Z`, or use `slusset/intention-driven-design/.github/actions/idd-check@vX` | Dependabot/Renovate for immutable tags; `@vX` follows the supported major Action tag | `npx idd version` and `npx idd validate all --json` |

Claude third-party marketplaces do not auto-update by default. Operators may
enable marketplace auto-update in Claude's plugin UI; a running session keeps
the version it loaded until plugins are reloaded or Claude restarts.

Codex refreshes a configured Git marketplace separately from installing its
plugin snapshot. Re-run the install after the marketplace upgrade and use a
new task/session so skills and tools are loaded from the refreshed bundle.

`gh skill` writes source repository, ref, and tree metadata into installed
skills. Its updater uses that provenance instead of comparing a local version
marker. Project-scope installation is preferable when Copilot cloud agent and
code review must see the skills; commit the generated `.agents/skills/` changes
through a normal consumer-repository PR. User scope is local to one machine.

Technical skills remain outside the core `skills/` discovery set. Install one
for Copilot by its exact path when needed, for example:

```bash
gh skill install slusset/intention-driven-design \
  technical-skills/angular-architecture/SKILL.md \
  --agent github-copilot --scope user
```

The same `gh skill` path can install core skills for Claude Code or Codex, but
their native plugins are preferred because those bundles also carry the IDD
CLI, validators, schemas, and other repository-level resources.

## Release checks

Before merging feature work that changes distribution:

```bash
just ci
just validate-plugin
just validate-agent-skills
npm pack --dry-run --json
```

`just validate-agent-skills` uses GitHub CLI's preview validator. The committed
test suite independently enforces the stable front-matter invariants so CI does
not depend on a preview command or network access.

## Field synchronization boundary

This release lane distributes the pack; it does not prove that a consumer still
conforms to the pack. Consumer pinning, drift detection, migrations, and the
structured route for downstream inventions belong to the managed-pack work in
issue #57. Module/DAG semantics and the experiment instrument remain separate
methodology changes in issues #56 and #58.
