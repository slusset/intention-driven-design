# CLI and Protocol Journeys

Load this reference when the journey's surface is an executable, a service, or
an agent harness rather than a browser. The vocabulary below is part of the
journey-map grammar; the harness that executes it comes from the repository.

## Shape of the check

A CLI journey runs the real artifact as a subprocess and asserts on what the
process did: exit status, output, files, and any state the command claims to
have changed.

- **Isolate the environment.** Every path the run touches — install prefix,
  home or configuration directory, cache, keys, data directories — lives under
  one disposable directory created by the test. A journey that writes outside
  it is a defect worth asserting against.
- **Drive the built artifact.** Package or build first, then run what the
  package produced, so the journey proves the thing a consumer receives.
- **Assert on observable output.** Exit status, stdout and stderr content,
  files created or removed, and the command's own read-back commands.
- **Keep steps ordered but independent of the harness.** A step may capture a
  value the next step consumes, the way a browser journey captures an id.

## Action vocabulary

| Named action | Kind | Use for |
|---|---|---|
| `installed-cli` | `cli` | Running a subcommand of the installed executable |
| `installed-executable` | `install` | Verifying the executables a package placed on PATH |
| `npm-global-install` / `npm-global-uninstall` | `install` | Installing or removing the packaged artifact in an isolated prefix |
| `installed-mcp` | `mcp` | Calling a tool the artifact exposes to an agent host |
| `harness-integration` | `harness` | Wiring the artifact into a host and proving the binding |

The expanded form is always available when no named action fits:

```yaml
actions:
  - kind: cli
    verb: build
    command: {build command}
  - kind: cli
    verb: run
    command: {command under test}
```

## Assertion vocabulary

| Named assertion | Kind | Proves |
|---|---|---|
| `required-content` | `content` | Output or a file contains what the journey promised |
| `forbidden-content` | `content` | Nothing outside the declared boundary was written |
| `package-installed` / `package-removal` | `package` | Install and uninstall leave the expected entries |
| `principal-continuity` | `authority` | Identity or authority survived the step |

```yaml
assertions:
  - kind: package
    property: owned-entries
    target: global-prefix
    description: Only the package module and its executable links appear.
  - kind: content
    property: forbidden
    target: user-data-directories
    description: No user-owned directory is created or changed.
```

`description` carries the human claim; the property and target carry the
machine-checkable part. Keep the description specific enough that a reader can
tell whether the assertion passed for the right reason.

## Worked skeleton

```yaml
id: install-and-recover
type: journey-map
journey: install-and-recover
sources:
  journey: specs/journeys/install-and-recover.md
  stories:
    - specs/stories/{area}/{story}.md

preconditions:
  auth: none
  state: |
    One source revision, and every path the run touches created beneath one
    disposable test directory.

steps:
  obtain-and-verify:
    journey_step: 1
    title: Obtain and verify the artifact
    actions:
      - kind: cli
        verb: build
        command: {build command}
      - kind: cli
        verb: pack
        command: {package command}
    assertions:
      - kind: package
        property: metadata
        target: packed-artifact
        description: The artifact records name, version, source revision, and checksum in evidence.

  install-without-side-effects:
    journey_step: 2
    title: Install the artifact
    actions:
      - type: npm-global-install
        scope: isolated-temporary-prefix
      - type: installed-executable
        commands: [{executable}]
    assertions:
      - kind: package
        property: executables-report-version
        target: installed-executables
        description: Each executable reports the packaged version.
```

## Service and protocol journeys

For a journey that crosses a service boundary rather than a terminal, keep the
`api` assertion kind and name the boundary contract in the capability scope. A
protocol journey asserts the same way a contract test does — status, payload
shape, error code — but follows the journey's sequence and preserves captured
state between steps.

For an agent-facing surface, `installed-mcp` and `harness-integration` describe
calling the tool and proving the host binding. Assert on the response the host
receives, not on internal call plumbing.

## Evidence

Name each test after the rule it exercises, and bind that literal name in the
capability's verification map:

```yaml
current_evidence:
  bindings:
    - files: [{test file}]
      selectors: [install-creates-no-user-owned-directories]
      match: literal
```

A journey test that no rule cites still runs, but it proves nothing the
certification report can count.
