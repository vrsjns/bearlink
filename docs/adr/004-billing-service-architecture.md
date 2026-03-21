# ADR-004: Billing-service architecture and plan enforcement strategy

- **Status:** accepted
- **Date:** 2026-03-19
- **Affects:** billing-service (new), auth-service, url-service, analytics-service, shared
- **Specs:** `spec/plan-model.md`, `spec/plan-enforcement.md`, `spec/stripe-integration.md`,
  `spec/billing-ui.md`

---

## Context

BearLink is introducing paid subscription plans. Every authenticated request to every
backend service will need to know whether the requesting user is on the free or pro
plan, so the correct feature gates and quotas can be enforced.

This creates three design questions that interact with each other and with existing
architectural decisions:

**Question 1 -- service boundary:** Should a new billing-service own subscription
state and payment integration, or should auth-service be extended to cover this?

**Question 2 -- enforcement strategy:** When a backend service needs to check a
user's plan at request time, where does that information come from? A real-time
lookup to billing-service, a value already in the JWT, or something else?

**Question 3 -- sync mechanism:** Whichever service issues JWTs (auth-service) needs
to know the current plan so it can include it in the token. How does that information
flow from the authority (the billing system) to the JWT issuer?

These three questions are addressed together because the answer to each constrains the
answers to the others.

---

## Decision

**1. A new billing-service owns subscription state and Stripe integration.**

billing-service is a standalone Express/Prisma service with its own PostgreSQL
database (`billing_service`). It is the single authoritative source for a user's
current plan and subscription status. It handles all Stripe Checkout, Customer Portal,
and webhook interactions.

**2. The user's plan is denormalized onto the auth-service User record and included in
the JWT.**

auth-service keeps a `plan` field on each User row. When it signs a JWT it includes
`plan` in the payload. Every downstream service reads `req.user.plan` after JWT
verification -- no network call to billing-service is made during request handling.

**3. billing-service publishes a `subscription_updated` event to RabbitMQ when
subscription state changes. auth-service consumes it and updates the User record.**

The sync path is asynchronous and event-driven, consistent with the existing
inter-service communication pattern in BearLink (see CLAUDE.md and ADR-002). The
JWT issued after the event is consumed carries the updated plan.

---

## Alternatives Considered

### Question 1: Service boundary

**A: Extend auth-service to own billing.**

Add Stripe integration, subscription models, and webhook handling directly to
auth-service. The User model gains `plan`, `stripeCustomerId`,
`stripeSubscriptionId`, `subscriptionStatus`, and `currentPeriodEnd` fields.

Rejected because:

- auth-service would carry two unrelated responsibilities: authenticating users and
  managing their payment relationship with Stripe. These have different rates of
  change, different operational concerns, and different secret requirements
  (`JWT_SECRET` vs. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- Stripe webhook handling requires a public-facing endpoint that must verify Stripe
  signatures, process subscription lifecycle events, and update subscription state.
  This logic is unrelated to login, registration, or JWT issuance. Adding it to
  auth-service would make that service harder to reason about and test in isolation.
- The `auth_service` database migration surface would grow every time a billing
  feature changes -- expiring a promo, adding a new price tier, tracking invoice
  state. Billing schema evolution should not require auth-service migrations.
- Stripe credentials would need to be present in auth-service even in environments
  where billing is disabled (development, testing). A dedicated service can be
  omitted from a local stack that does not need payment flows.

**B: Serverless functions for Stripe webhooks only.**

Keep all subscription state in auth-service but handle Stripe webhooks in a
short-lived serverless function (e.g. AWS Lambda / Cloudflare Worker) that writes
directly to the auth-service database.

Rejected because:

- Introduces a new deployment target and runtime outside the established Docker
  Compose / k3s stack. BearLink's infrastructure is intentionally uniform across
  services (see `k8s/`, `docs/adr/003`). A serverless sidecar breaks that uniformity
  and adds operational surface the project is not currently set up to manage.
- A function writing directly to auth-service's database bypasses auth-service's own
  application logic, validation, and event publishing. This is the same cross-service
  database coupling that ADR-003 specifically rejected.
- Does not solve the question of where subscription queries are served from. Client
  code still needs an endpoint; that endpoint still lives somewhere.

---

### Question 2: Enforcement strategy

**A: Real-time lookup from each service to billing-service at request time.**

When a request arrives, the handling service calls `GET /internal/subscriptions/:userId`
on billing-service before evaluating the plan gate.

Rejected because:

- Every authenticated request to url-service or analytics-service that involves a
  plan-gated feature incurs a synchronous network call to billing-service. This adds
  latency on the hot path (URL creation, redirect, analytics query).
- billing-service becomes a hard runtime dependency of every other service. A
  billing-service deployment, restart, or outage would degrade or block plan
  enforcement across the entire application. Given that plan changes are infrequent
  (a user subscribes or cancels at most a handful of times per year), paying a
  per-request availability and latency cost for that infrequent update is not
  justified.
- Rate limiting and caching logic would need to be added to every service that
  calls billing-service, to avoid hammering it under load.

**B: Plan stored only in billing-service; services read it via a sidecar or shared
cache (e.g. Redis).**

billing-service writes the current plan for each user to a shared Redis key on
every change. Services read from Redis at request time.

Rejected because:

- Introduces Redis as a required dependency for plan enforcement. Redis is currently
  optional in BearLink (url-service and auth-service use it for performance, with
  graceful degradation). Making plan enforcement depend on Redis would make Redis
  required infrastructure for every service, changing its operational status project-
  wide.
- Creates a shared data store that multiple services write to and read from. This is
  the kind of shared-mutable-state coupling that the per-service database pattern
  (ADR-003) was designed to avoid.
- Cache coherence must be explicitly managed: what happens if a service reads a stale
  key after billing-service writes fail? The failure mode is non-obvious and
  potentially security-relevant (a canceled user retaining pro features).

---

### Question 3: Sync mechanism

**A: auth-service calls billing-service synchronously when signing a JWT.**

At login time, auth-service calls `GET /internal/subscriptions/:userId` on
billing-service to fetch the current plan, includes it in the JWT payload, and
then returns the token.

Rejected because:

- billing-service becomes a synchronous dependency of every login. If billing-service
  is slow or unavailable, login fails or degrades. Authentication and billing are
  independent concerns; coupling them at the login hot path increases fragility for
  no benefit beyond simplicity.
- The plan does not change between login attempts. Fetching it on every login is
  wasteful when the denormalized value on the User row is equally authoritative and
  costs zero network I/O.

**B: auth-service reads directly from the billing_service database.**

auth-service is given a connection string for billing-service's database and queries
the Subscription table directly.

Rejected because: this is cross-service database coupling, explicitly prohibited by
ADR-003. It tightly binds the internal schema of billing-service to auth-service and
eliminates billing-service's ability to evolve its schema independently.

**C: billing-service calls auth-service's internal API to update the User plan field
directly.**

On subscription change, billing-service POSTs to `PUT /internal/users/:userId/plan`
on auth-service.

Rejected because:

- Introduces a synchronous service-to-service dependency in the opposite direction
  (billing calls auth). billing-service must know auth-service's internal API and
  retry/failure characteristics. If auth-service is unavailable during a Stripe
  webhook delivery, billing-service must queue, retry, or lose the update.
- The event-driven approach (Decision 3) achieves the same outcome without direct
  coupling. If auth-service is temporarily down, the `subscription_updated` event
  remains on the queue and is processed when auth-service recovers. No retry logic
  is needed in billing-service.
- Webhook delivery windows in Stripe are measured in seconds to minutes. The
  asynchronous sync lag from RabbitMQ consumption is negligible by comparison.

---

## Consequences

**Accepted tradeoffs:**

- A new service (billing-service) must be built, tested, deployed, and operated. This
  increases the service count from 7 to 8. A new database (`billing_service`) must be
  provisioned and backed up.
- The JWT carries a plan value that can be stale by up to one RabbitMQ message
  processing cycle. A user who subscribes will continue to see the free plan until
  they re-authenticate (new JWT) after auth-service has consumed the
  `subscription_updated` event and updated their User row. The frontend should prompt
  a token refresh or re-login after a successful checkout. This window is typically
  seconds to a few minutes.
- auth-service gains a `plan` field on the User model and a RabbitMQ consumer for
  `subscription_updated`. These are permanent additions that must be kept in sync
  with billing-service's published events.
- Feature enforcement in url-service and analytics-service reads from `req.user.plan`
  (the JWT claim) rather than a real-time source. A canceled subscription revokes
  pro features only after the user's current JWT expires or they re-authenticate.
  For the monthly billing cycle model, this window (JWT TTL) is an accepted
  tradeoff.

**What becomes better:**

- Plan enforcement adds zero latency and zero I/O to every authenticated request.
  `requirePlan("pro")` is a pure synchronous check on a value already in memory.
- billing-service and auth-service can be deployed, restarted, and scaled
  independently. A billing-service outage does not affect login, URL creation, or
  redirects. It only affects subscription management (checkout, portal) -- a
  non-critical path.
- Stripe credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_ID_PRO`) are isolated to billing-service. No other service has
  visibility into payment details.
- The sync pattern (event on queue, consumer updates denormalized field) is the same
  pattern used for audit events (ADR-002) and preview scraping. A new engineer
  following this codebase will encounter no novel patterns.
- billing-service can evolve its internal schema (add coupon support, usage metering,
  invoice storage) without touching auth-service, url-service, or any other service.
  The `subscription_updated` event is the only shared contract.
