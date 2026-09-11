# Boundary Kinds

A contract is required wherever behavior crosses a boundary. Which document
expresses it depends on the boundary, not on habit: a capability with no HTTP
surface needs no OpenAPI document.

## Choosing the contract

| Boundary the journey crosses | Contract document | Lives in |
|---|---|---|
| HTTP request/response | OpenAPI | `specs/contracts/openapi/` |
| Published or consumed events | AsyncAPI | `specs/contracts/asyncapi/` |
| Remote procedure calls | JSON-RPC service description | `specs/contracts/json-rpc/` |
| A command-line surface | Command contract (below) | `specs/contracts/` |
| A data structure exchanged between modules or replicas | JSON Schema document | `specs/contracts/` |
| An internal call inside one module | No contract — it is not a boundary | — |

A capability may cross several at once. Each gets its own document, and every
one of them is listed in the capability's `scope.contracts`.

## Command-line surfaces

Treat the command line as a real boundary: the arguments, the exit status, and
the output shape are the contract, and a consumer's script depends on all
three.

Declare, per command:

- **Invocation**: the command, its subcommands, and their arguments and flags.
- **Exit status**: what each status means. Reserve one for "refused by a
  declared rule" so a rejection is distinguishable from a crash.
- **Output**: the shape of machine-readable output, as a JSON Schema document
  when the command emits JSON. Human-readable output is not a contract unless
  the journey depends on specific content.
- **Refusals**: which rule each refusal enforces, named by rule ID.

```yaml
# specs/contracts/cli/{command}.yaml
command: {executable} {subcommand}
x-rules: [ACCT-1-refuse-unknown-account]
arguments:
  - name: --input
    required: true
    description: Path to the record to admit
exit_status:
  0: Admitted
  1: Refused by a declared rule
  2: Usage error
output:
  format: json
  schema: specs/contracts/{command}-output.schema.json
```

The scenario that proves a refusal cites the same rule ID, and the journey map
drives the command with the `installed-cli` action vocabulary.

## Schema documents between modules

When one module consumes a structure another module owns, the consumer records
a pin in its verification map:

```yaml
contract_pins:
  - contract: specs/contracts/upstream.schema.json
    canonicalization: jcs-sha256@1
    digest: sha256:{64 lowercase hex characters}
```

The validator recomputes the digest on every run, so an upstream edit surfaces
as a failed gate instead of silent interface drift. The pinned document must
belong to a module the consumer already declares as a dependency.

## Events

An event contract names the channel, the payload schema, the producer, and the
ordering or delivery guarantees the consumer may rely on. State explicitly what
is *not* guaranteed — at-least-once delivery, no global order — because a
consumer that assumes otherwise is the defect this contract prevents.

## Rules apply to every kind

Whatever the document, the reciprocity is the same: the contract's root
`x-rules` names the verification-map rules it implements, and each of those
rules names the contract back. A contract with no rule reference is not
verifiable; a rule that no contract implements is not enforced at a boundary.
