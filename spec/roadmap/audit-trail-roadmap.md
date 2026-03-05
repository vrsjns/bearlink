# Audit Trail Roadmap

Breaking the reliable audit trail initiative into 4 independently-shippable parts.
The outbox pattern replaces the dual-write gap in the current RabbitMQ-based audit path.

> **Status: approved**

---

## Background

The analytics-service currently serves two conflicting roles: domain-event metrics and
an audit log exposed via GET /events. These have incompatible requirements — metrics
data can be pruned after 90 days; audit records must not be deleted. Both read from the
same Event table, making retention policy a compliance risk.

Additionally, the current audit path has a structural reliability flaw: each source
service commits to its own DB and then publishes to RabbitMQ as two separate operations.
A crash between these steps silently drops the audit record. The outbox pattern closes
this gap by making the audit record atomic with the business operation.

The analytics-service keeps its RabbitMQ-based metrics consumption (eventual consistency
is acceptable for metrics). Only the audit path changes.

---

## Implementation Order

```
Part 1 (auth-service outbox)
Part 2 (url-service outbox)      <-- can overlap with Part 1
     |
     v
Part 3 (audit-service)           <-- needs Parts 1 and 2 to have data to receive
     |
     v
Part 4 (analytics-service split) <-- needs Part 3 live before removing /events
```

---

## Part 1 -- auth-service outbox

> Spec: `spec/auth-service-outbox.md`

Add an `OutboxEvent` table to the auth-service database. Wrap each auditable business
operation and its outbox write in a single Prisma transaction. A background poller reads
unprocessed rows and forwards them to the audit-service with retry logic. The existing
RabbitMQ publish for analytics is unchanged.

auth-service produces the following auditable events:

| Event                      | Trigger                                       | Priority  |
| -------------------------- | --------------------------------------------- | --------- |
| `user_registered`          | POST /register                                | must-have |
| `user_login`               | POST /login (success)                         | must-have |
| `user_login_failed`        | POST /login (wrong credentials)               | should    |
| `user_password_changed`    | POST /users/:id/password                      | must-have |
| `user_profile_updated`     | PUT /users/:id (name or email change)         | must-have |
| `user_deleted`             | DELETE /users/:id (admin only)                | must-have |
| `password_reset_requested` | POST /forgot-password (registered email only) | must-have |
| `password_reset_completed` | POST /reset-password/:token (success)         | must-have |

`user_login` and `user_login_failed` have no corresponding DB write to wrap in a
transaction, so the outbox row is inserted as a standalone write. `user_login_failed`
identifies the actor only by email (which may not resolve to a userId if the email is
unregistered).

**Schema change:** one new Prisma model (`OutboxEvent`) in auth-service.
**No new infrastructure.**

---

## Part 2 -- url-service outbox

> Spec: `spec/url-service-outbox.md`

Same outbox pattern applied to url-service for all auditable operations:

| Event               | Trigger                                                   | Priority  |
| ------------------- | --------------------------------------------------------- | --------- |
| `url_created`       | POST /urls (and each item in POST /urls/bulk)             | must-have |
| `url_updated`       | PUT /urls/:id                                             | must-have |
| `url_deleted`       | DELETE /urls/:id                                          | must-have |
| `url_clicked`       | GET /:shortId and POST /:shortId/unlock (unique, non-bot) | must-have |
| `url_signed`        | POST /urls/:id/sign                                       | should    |
| `url_unlock_failed` | POST /:shortId/unlock (wrong password)                    | could     |

`url_signed` and `url_unlock_failed` have no corresponding DB write; the outbox row is a
standalone insert. `url_signed` is security-relevant because it produces a shareable
time-limited link that bypasses normal access controls.

**Schema change:** one new Prisma model (`OutboxEvent`) in url-service.
**No new infrastructure.**

---

## Part 3 -- audit-service

> Spec: `spec/audit-service.md`

New dedicated Express service (port 8500) with its own PostgreSQL database. Receives
outbox events from source services via an internal HTTP endpoint secured with a shared
secret. Stores records in an append-only AuditEntry table — no DELETE endpoint, no
cleanup cron. Exposes a JWT-authenticated admin API for querying the audit log.

**New service, new database, new Docker/k8s manifests.**

---

## Part 4 -- analytics-service audit split

> Spec: `spec/analytics-audit-split.md`

Remove the audit responsibilities from analytics-service. The GET /events endpoint and
its controller and route file are deleted. RabbitMQ consumption is kept — analytics
still uses domain events for metrics aggregation. The data retention cron job is kept
for the metrics data. OpenAPI and AsyncAPI docs are updated to reflect the removed
endpoint.

**No schema changes. No new infrastructure.**

---

## What Does Not Change

- Analytics-service continues to consume RabbitMQ events for metrics (click counts,
  top URLs, platform summary). Eventual consistency is acceptable there.
- Source services continue publishing to RabbitMQ. The outbox is an additional,
  parallel write — not a replacement for the existing event flow.
- The dual-write concern for RabbitMQ analytics events is a known and accepted
  tradeoff for metrics use cases.
