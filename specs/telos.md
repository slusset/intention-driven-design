---
id: telos
type: telos
purpose: |
  Make the intent behind software explicit, executable, and continuously
  verified, so a system — and the agents changing it — can be held to the
  meaning its authors declared.
non_goals:
  - Planning or project management
  - Prescribing a technology stack, framework, or test runner
  - Generating implementation from specifications
  - Scoring teams or benchmarking their output
---

# Telos: Intention-Driven Design

Requirements decay into conversations nobody can reconstruct, and tests prove
that code does what it does, not that it still serves what someone needed.
Agents make both failures faster: an agent can implement the wrong thing
perfectly, at scale, without anyone noticing until the system no longer means
what it was built to mean.

IDD exists so that intent survives that pressure. A declared intent, a rule
with an identifier, and evidence bound to that rule are enough to answer the
only question that matters over a long life: does this system still do what we
said it should, and can we show it?

## What follows from this

- The methodology stays stack-neutral. A purpose that depends on a framework
  expires with the framework.
- Claims never exceed evidence. An honest gap is worth more than a confident
  summary.
- Human judgment stays with humans. Agents carry the bookkeeping that makes
  the judgment possible.

The qualities this project must preserve are enforced as rules with evidence,
not by this document. The telos says why they matter.
