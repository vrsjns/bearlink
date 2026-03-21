# Premium Plans Roadmap

> **Status:** active
> **Initiative:** Monetization via subscription plans (tiers)

## Goal

Introduce a tiered subscription system so BearLink can charge users for premium
features. Users on a free plan get basic URL shortening; paid plans unlock
advanced features. The system must be maintainable, enforceable at the API level,
and transparent to users via a clear pricing and billing UI.

## Tiers

| Plan       | Price     | Target user                         |
| ---------- | --------- | ----------------------------------- |
| Free       | $0        | Casual / trial users                |
| Pro        | ~$9/month | Power users, marketers, small teams |
| Enterprise | TBD       | Organisations (future scope)        |

### Feature gate matrix

| Feature                         | Free | Pro | Notes                       |
| ------------------------------- | ---- | --- | --------------------------- |
| Create short URL (single)       | yes  | yes |                             |
| List / update / delete own URLs | yes  | yes |                             |
| Click counter (per URL)         | yes  | yes |                             |
| Password reset / profile mgmt   | yes  | yes |                             |
| Custom alias                    | no   | yes |                             |
| Link expiry                     | no   | yes |                             |
| Password-protected links        | no   | yes |                             |
| Tags                            | no   | yes |                             |
| UTM parameters                  | no   | yes |                             |
| Redirect type (301/302 choice)  | no   | yes | Free always gets 302        |
| QR code generation              | no   | yes |                             |
| Bulk URL creation               | no   | yes |                             |
| Signed URLs                     | no   | yes |                             |
| Per-URL click analytics         | no   | yes |                             |
| Monthly URL creation quota      | 25   | 500 | Enforced by billing-service |

## Parts

| Part | Spec file                       | Summary                                                   | Depends on |
| ---- | ------------------------------- | --------------------------------------------------------- | ---------- |
| 1    | `spec/events-topic-exchange.md` | Topic exchange for domain events; per-service queues      | -          |
| 2    | `spec/plan-model.md`            | Plan/subscription data model; new billing-service         | Part 1     |
| 3    | `spec/plan-enforcement.md`      | Enforcement middleware; feature-gate all premium features | Part 2     |
| 4    | `spec/stripe-integration.md`    | Stripe Checkout + webhooks; subscription lifecycle        | Part 2     |
| 5    | `spec/billing-ui.md`            | Pricing page, upgrade flow, plan badge, portal link       | Parts 3, 4 |

## Architecture notes

- Part 1 migrates the single `events` queue to a **topic exchange** (`domain_events`)
  with per-service queues. This is a prerequisite for all other parts: without it,
  billing-service and analytics-service would compete for the same messages, and
  billing-service would receive its own published events.
- A new **billing-service** owns plan definitions and subscription state. Auth-service
  consumes `subscription_updated` events to denormalize the current plan onto the
  user record for fast enforcement. See ADR written alongside Part 2.
- Feature gating is enforced in **each backend service** via a shared middleware that
  reads `req.user.plan` (injected by the JWT or a fast lookup).
- Payment processor: **Stripe** (Checkout Sessions + Customer Portal + webhooks).
  No raw card handling — all card data stays with Stripe.
- Free tier is the default for all existing and new users.

## ADR required

Part 2 must be accompanied by an ADR covering: new billing-service vs. extending
auth-service, plan storage location, and enforcement strategy.

## Out of scope

- Team/org accounts
- Annual billing
- Coupons / promo codes
- Custom domains
- Usage-based pricing beyond the monthly URL quota
