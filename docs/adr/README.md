# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for BearLink. If you are
new to the project, read this document before reading the individual ADRs.

---

## What is an ADR?

An Architecture Decision Record is a short document that captures one significant
architectural choice. It answers four questions:

1. **Why did a decision need to be made at all?** (Context)
2. **What was decided?** (Decision)
3. **What else was considered, and why was it rejected?** (Alternatives)
4. **What does this commit us to?** (Consequences)

ADRs are written once and not edited after acceptance. If a decision is later reversed
or superseded, a new ADR is written that references the old one. The old ADR is updated
only to mark its status as `superseded by ADR-NNN`.

---

## Why this project uses ADRs

Code shows _what_ the system does. Specs (in `spec/`) show _what_ the system is being
built to do. Neither answers the question that matters most when you are new to a
codebase:

> "Why is it shaped this way?"

Without ADRs, the reasoning behind structural decisions lives in chat history, pull
request descriptions, or people's heads. All of those decay. An engineer joining the
project six months after a decision was made has no way to find out why RabbitMQ was
chosen over direct HTTP calls, or why each service has its own database. They either
accept the structure without understanding it, or unknowingly re-open decisions that
were already carefully made.

ADRs fix this by making the reasoning a first-class, versioned artefact alongside the
code.

---

## The format

Each ADR in this project follows this structure:

```
# ADR-NNN: Title

- Status: proposed | accepted | deprecated | superseded by ADR-NNN
- Date: YYYY-MM-DD (use "retrospective" for decisions documented after the fact)
- Depends on / Affects / Specs: cross-references where relevant

## Context
The situation that forced a decision. What problem existed? What constraints applied?

## Decision
What was decided. One clear statement of the chosen approach.

## Alternatives Considered
Each alternative that was seriously considered, with the specific reason it was
rejected. "We didn't like it" is not a rejection reason.

## Consequences
Accepted tradeoffs (what becomes harder or more constrained) and what becomes better.
Both sides must be present -- an ADR that lists only benefits is not honest.
```

---

## When to write an ADR

Write an ADR when a spec or a design discussion involves a structural choice where
multiple approaches were seriously considered. Concrete triggers:

- The spec introduces a new service or splits an existing one
- The spec adds new infrastructure (a database, a message broker, a cache)
- The spec establishes a pattern that other services will follow
- Two or more significantly different implementation approaches were evaluated
- The chosen approach has non-obvious tradeoffs that will surprise a future engineer

You do not need to write an ADR for:

- A feature with a single obvious implementation approach
- Implementation details inside a single service (controller structure, helper functions)
- Configuration choices (timeout values, page size defaults)
- Anything that can be easily changed without ripple effects across services

A useful heuristic: if a new engineer could look at the result in six months and
reasonably ask "why did they do it this way instead of the obvious alternative?",
write the ADR.

---

## How ADRs and specs work together

They are complementary, not competing. The distinction:

| Document | Answers                            | Subject                   |
| -------- | ---------------------------------- | ------------------------- |
| Spec     | What shall the system do?          | A feature or capability   |
| ADR      | Why is the system shaped this way? | An architectural approach |

A spec says: "The audit-service shall expose a POST /internal/audit-events endpoint
secured by a shared secret." The ADR says: "We chose the outbox pattern over RabbitMQ-
only delivery, database triggers, and CDC because..."

When a spec involves an architectural choice, write the ADR first (or alongside the
spec draft). The spec can then reference the ADR to avoid duplicating the rationale.
The ADR references back to the spec that implements the decision.

See `spec/_workflow.md` for the full guidance on when specs need ADR companions.

---

## ADR lifecycle

| Status                  | Meaning                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `proposed`              | Written, not yet reviewed or accepted                       |
| `accepted`              | Decision was made and is in effect                          |
| `deprecated`            | Decision is no longer recommended but has not been replaced |
| `superseded by ADR-NNN` | A later decision replaced this one; see ADR-NNN             |

Once an ADR is `accepted`, its content is frozen. Do not edit the Context, Decision,
Alternatives, or Consequences sections. If the decision changes, write a new ADR.
Update the old ADR's status line only.

---

## How to write a new ADR

1. Pick the next available number. Check the existing files in this directory.
2. Create `docs/adr/NNN-short-descriptive-title.md`. Use kebab-case for the filename.
3. Fill in all four sections. The Alternatives section is mandatory -- an ADR without
   rejected alternatives has not captured the real reasoning.
4. Set status to `proposed` until it has been reviewed.
5. Once accepted, set status to `accepted` and set the date.
6. If the ADR accompanies a spec, add a `Specs:` reference line at the top and add
   a reference to the ADR in the spec's Background section.

Prompts for working with Claude:

> "Help me write an ADR for the decision to use [approach] for [problem]"
> "Review docs/adr/NNN-title.md and check for gaps in the alternatives section"
