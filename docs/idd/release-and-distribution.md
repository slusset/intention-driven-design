# Release and Distribution

IDD has one active release ledger and several host-specific delivery adapters.
During internal UAT, a release is identified by an immutable
`v0.1.0-uat.N` Git tag. The npm package, Claude plugin manifest, Codex plugin
manifest, and Release Please manifest must all name the same version.

UAT releases are non-production candidates. They are publicly visible when the
repository is public; "internal" describes their intended audience and maturity,
not access control. The retired prototype sequence is preserved under
`legacy/v1.*` tags and is not part of the active SemVer line.

The adapters do not imply a shared installation state. Each host keeps its own
plugin or skill cache, so operators update that host explicitly and verify what
it loaded.

## Release lifecycle

1. Merge feature and fix commits to `main` using Conventional Commit prefixes.
   No release automation runs on push.
2. Manually dispatch Release Please with `operation=prepare`. It opens or
   updates a draft release PR that owns changes to
   `CHANGELOG.md`, `package.json`, `package-lock.json`, both plugin manifests,
   and `.release-please-manifest.json`.
3. Review the release PR, run the normal repository checks, and mark it ready.
4. Merge the release PR. No tag or release is created automatically.
5. Manually dispatch Release Please with `operation=publish`. It creates the
   immutable `v0.1.0-uat.N` tag and GitHub prerelease, re-runs source checks,
   and attaches the npm tarball. It does not create a floating major Action tag
   for prerelease or `0.x` releases.

Run either operation from the GitHub Actions UI on `main`, or with GitHub CLI:

```bash
gh workflow run release-please.yml --ref main -f operation=prepare
# review and merge the generated release PR
gh workflow run release-please.yml --ref main -f operation=publish
```

Before accepting a new UAT candidate in a consumer repository, run
`idd doctor --repo <consumer> --json` and retain its report with the migration
review. The current doctor is informational only: it detects release/schema,
module, and deprecated-structure misalignment but does not apply changes or
mutate identity history.

Set a repository secret named `RELEASE_PLEASE_TOKEN` to a fine-grained token
that can write contents, issues, and pull requests if checks must run
automatically on prepared Release Please PRs. The workflow falls back to
`GITHUB_TOKEN`, but GitHub does not emit new workflow events for changes made
with that token.

The repository is bootstrapped at `0.1.0-uat.0`; its immutable tag is a ledger
and changelog-comparison baseline, not a GitHub Release or installable
candidate. The first generated release PR should propose `0.1.0-uat.1`. Do not
edit versions manually. If the release PR proposes the wrong version, stop and
correct the release configuration or commit boundary before publishing
anything.

## Distribution matrix

| Surface | Released unit | Install | Update | Verify |
| --- | --- | --- | --- | --- |
| Claude desktop and Claude Code CLI | Claude plugin: core IDD skills, CLI, validators, schemas | Add `slusset/intention-driven-design`, then install `idd-skills@idd` in the plugin browser or with `claude plugin install idd-skills@idd` | `claude plugin update idd-skills@idd`, then restart or reload plugins | `claude plugin list` and `idd version` |
| Codex desktop and CLI | Codex plugin: core skills plus repository tooling | Add the Git marketplace with `codex plugin marketplace add slusset/intention-driven-design --ref main`, then `codex plugin add idd-skills@idd` | `codex plugin marketplace upgrade idd`, then `codex plugin add idd-skills@idd`; start a new task/session | `codex plugin list` and `idd version` when the host exposes the bundled CLI |
| GitHub Copilot App, CLI, VS Code, cloud agent, and code review | Agent Skills from the tagged repository; validators remain the npm/GitHub Action artifact | `gh skill install slusset/intention-driven-design --all --agent github-copilot --scope user` | `gh skill update --all` | `gh skill list --agent github-copilot --json skillName,sourceURL,version,pinned,path` |
| CI and repositories | npm tarball or reusable GitHub Action | Install `github:slusset/intention-driven-design#v0.1.0-uat.N`, or use `slusset/intention-driven-design/.github/actions/idd-check@v0.1.0-uat.N` | Update to the next explicitly accepted immutable UAT tag | `npx idd version` and `npx idd validate all --json` |

## One-time reset from the retired prototype line

Plugin hosts may correctly reject `1.2.0 → 0.1.0-uat.1` as a downgrade. Do not
rely on their ordinary update commands for this one transition.

For Claude:

```bash
claude plugin uninstall idd-skills@idd
claude plugin marketplace update idd
claude plugin install idd-skills@idd
```

For Codex:

```bash
codex plugin remove idd-skills@idd
codex plugin marketplace upgrade idd
codex plugin add idd-skills@idd
```

Restart Claude or start a new Codex task/session after reinstalling. Once an
installation is on the active UAT line, use the normal host update flow below.

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

For an accepted UAT candidate, add `--pin v0.1.0-uat.N` to `gh skill install`.
Pinned skills intentionally do not move under `gh skill update`; reinstall with
the next accepted pin when advancing a controlled environment.

Stack-specific implementation skills are not IDD release artifacts. Install
them independently for the active host and bind their exact identifiers and
providers in the consuming repository's `specs/skills/repo-overlay.md`.

The same `gh skill` mechanism can install core IDD skills for Claude Code or
Codex, but their native plugins are preferred because those bundles also carry
the IDD CLI, validators, schemas, and other repository-level resources.

## Release checks

Before merging feature work that changes distribution:

```bash
just ci
just validate-plugin
just validate-agent-skills
npm pack --dry-run --json
```

`just validate-agent-skills` uses GitHub CLI's preview validator. The committed
test suite independently enforces the portable front-matter invariants so CI
does not depend on a preview command or network access.

## Promotion

Promotion from UAT is explicit. First remove prerelease mode and cut an accepted
`0.x` release. Continue pre-1.0 SemVer until the methodology and compatibility
contract justify `1.0.0`; only then enable a floating `v1` Action tag. Historical
`legacy/v1.*` prototype tags do not count as evidence of that maturity.

## Field synchronization boundary

This release lane distributes the pack; it does not prove that a consumer still
conforms to the pack. Consumer pinning, drift detection, migrations, and the
structured route for downstream inventions belong to the managed-pack work in
issue #57. Module/DAG semantics are now shipped through the module,
verification, evidence-binding, and digest-pin contracts. The remaining
bounded-context scaffold in #56 and the experiment instrument remain separate
methodology changes in issues #56 and #58.
