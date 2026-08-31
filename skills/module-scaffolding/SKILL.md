---
name: module-scaffolding
description: "Create and connect an IDD bounded-context module without moving existing specifications. Use when starting a new capability chain or declaring an explicit module dependency."
license: MIT
argument-hint: "[module-name]"
allowed-tools: Read Write Glob Grep
---

# Module Scaffolding

## Purpose

Turn a bounded-context decision into a deterministic IDD module skeleton. The
module manifest is the semantic source of truth; the CLI creates the files and
directories. This skill never infers a dependency from directory placement and
never moves an existing specification as part of creation.

## When to use

- A new capability chain needs a bounded-context boundary.
- A capability should be colocated under a declared non-default spec root.
- One module must consume another module's contract.
- An agent needs to inspect declared module roots and map locations.

Use `/solution-narrative`, `/domain-modeling`, and `/behavior-contract` first
when the capability's intent, model, or contract is not yet defined. Use this
skill for the module boundary and its mechanical skeleton.

## Semantic decisions before writing

Confirm:

1. the module ID (`^[a-z][a-z0-9-]*$`);
2. the capability chain owned by the module;
3. the module root, defaulting to `specs`;
4. direct module dependencies; and
5. any upstream JSON Schema contracts consumed by this chain.

Keep these relationships distinct:

- `depends_on` is the module dependency DAG;
- `contract_pins` is digest-pinned consumption of a dependency contract; and
- verification-map rules and contract `x-rules` are evidence traceability.

## CLI workflow

Preview creation first:

```bash
idd module create billing --root specs --dry-run
```

Create the skeleton:

```bash
idd module create billing --root specs
```

This creates a capability stub, module-owned `models/`, `features/`,
protocol-specific `contracts/`, `fixtures/`, and a verification-map template,
then adds one entry to `specs/modules.yaml`. Empty rule inventories are
explicitly marked planned and produce a warning until rules are authored.

Add a dependency only after confirming the direction:

```bash
idd module link billing --depends-on identity-kernel --dry-run
idd module link billing --depends-on identity-kernel
```

Pin a contract for a consumer capability:

```bash
idd module link billing \
  --capability billing \
  --contract specs/contracts/identity.schema.json
```

The command computes `jcs-sha256@1`, requires the contract to be listed in a
dependency capability's scope, and refuses same-module or cyclic links. It
does not edit the contract's `x-rules`; add those through the behavior-contract
workflow and validate both directions.

Inspect the result:

```bash
idd module status
idd validate modules verification
```

## Safety and idempotence

- Creation is safe to repeat when the same module/root/capability already
  exists; it reports no changes.
- Existing files are never overwritten by `module create`.
- `module link` requires `--update` to replace a conflicting digest pin.
- `--dry-run` performs all structural checks but writes nothing.
- A failed preflight writes nothing.
- Physical relocation of a live chain is a separate migration with its own
  reviewable diff.

## Handoff

After scaffolding, hand back to `/solution-narrative` for intent,
`/domain-modeling` for models, `/behavior-contract` for features/contracts,
and `/certification` once executable evidence exists. The scaffold itself is
not certification evidence and does not imply production readiness.
