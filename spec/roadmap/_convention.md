# Roadmap Convention

Roadmaps are **epic-level planning artifacts**. They break a large initiative into
independently-implementable parts, each of which becomes a spec.

## Directory layout

```
spec/
  roadmap/
    _convention.md          ← this file
    <initiative>.md         ← active roadmap (all parts not yet done)
    done/
      <initiative>.md       ← archived roadmap (all derived specs are done)
```

## Lifecycle

| Stage | Where it lives | Trigger |
|---|---|---|
| Active | `spec/roadmap/` | Roadmap created; some parts still pending |
| Archived | `spec/roadmap/done/` | All derived specs moved to `spec/done/` |

## How a roadmap relates to specs

A roadmap row / part → one spec in `spec/`.
The spec drives the full implementation lifecycle (`draft` → `approved` → `in-progress` → `done`).
The roadmap is a coordination view, not an implementation guide.

## Naming

Kebab-case, descriptive: `url-service-roadmap.md`, `auth-hardening-roadmap.md`.

## When to write a roadmap

When a feature initiative has ≥ 3 distinct parts that can ship independently, or when
you need to communicate sequencing and dependencies across multiple specs.
Single-feature work goes straight to a spec — no roadmap needed.
