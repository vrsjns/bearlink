# ADR-001: Split analytics-service audit role into a dedicated audit-service

- **Status:** accepted
- **Date:** 2026-03-03
- **Specs:** `spec/roadmap/audit-trail-roadmap.md`, `spec/audit-service.md`,
  `spec/analytics-audit-split.md`

---

## Context

analytics-service was built with a single `Event` table that serves two distinct roles:

**Role 1 — Metrics.** The service consumes domain events from RabbitMQ and stores them
so they can be queried for business metrics: total clicks, top URLs, platform summary.
For this role, eventual consistency is acceptable and data can reasonably be pruned once
it is no longer analytically useful.

**Role 2 — Audit log.** The `GET /events` endpoint exposes the raw event trail to users
(own events only) and admins (all events). This is a traceability and compliance
concern: a record of who did what and when.

These two roles have directly conflicting requirements:

- The metrics role is served by a 90-day retention cron job (`cleanup.service.js`,
  `EVENT_RETENTION_DAYS`). Pruning old data is desirable to keep the table performant.
- The audit role requires that records are never deleted. An audit log that silently
  drops entries after 90 days is not an audit log.

Both roles read from the same table with no way to distinguish which rows are metrics
data and which are audit entries -- because they are the same rows. Any retention policy
applied to the table applies to both roles equally.

A secondary concern is that the two roles have different access semantics. Metrics data
is aggregated and anonymised. Audit data is attributed (it records which user performed
which action) and subject to different access control requirements. Mixing them in one
service makes it harder to apply independent access control policies in the future,
particularly if compliance requirements demand separation of duties.

---

## Decision

Split the two roles into two services, each with its own database:

- **analytics-service** retains the metrics role. It continues to consume domain events
  from RabbitMQ and expose aggregated query endpoints. The 90-day retention cron is
  kept. The `GET /events` audit endpoint is removed.

- **audit-service** (new) takes the audit role. It receives events via the outbox
  pattern (see ADR-002) and stores them in an append-only table with no deletion path
  at the application layer.

The analytics and audit paths are independent. A failure in audit-service does not
affect metrics. A schema change in analytics-service does not affect the audit log.

---

## Alternatives Considered

**A: Two tables in the same service, separate retention policies.**
Keep analytics-service but add a second table (e.g. `AuditEntry`) alongside `Event`.
Apply the 90-day cron only to `Event`; leave `AuditEntry` untouched.

Rejected because: the service still has two responsibilities with different reliability
and access control requirements. The deployment unit, the database credentials, the
codebase, and the runtime process remain shared. Separating the tables does not separate
the concerns -- it only delays the conflict.

**B: Mark some events as non-purgeable with a flag.**
Add a `purgeable` boolean to the `Event` model. The cron only deletes rows where
`purgeable = true`.

Rejected because: this conflates the two roles even more deeply. It requires every
event publisher to decide at publish time whether the record is an audit entry or a
metrics entry -- a distinction that should not leak into the publishing layer. It also
leaves both roles sharing the same table, indexes, access credentials, and service
process, with no path toward independent scaling or access control.

**C: Separate database, same service.**
Keep one analytics-service process but give it two database connections: one to the
existing metrics DB and one to a new audit DB.

Rejected because: the service process, deployment unit, and codebase remain shared.
Operationally this gives most of the cost of two services (two databases, two sets of
credentials, two migration paths) with none of the benefits of separation (independent
scaling, independent access control, independent failure domains). It is the worst of
both options.

---

## Consequences

**Accepted tradeoffs:**

- A new service must be built, tested, deployed, and operated. This increases the
  service count from 6 to 7.
- A new database (`audit_service`) must be provisioned and backed up independently.
- New Docker Compose and Kubernetes manifests are required.
- The `GET /events` endpoint is removed from analytics-service. Any client relying on
  it must switch to `GET /audit` on the new audit-service.
- Historical event data in analytics-service is not migrated. The audit-service starts
  fresh from its go-live date. This is an accepted gap for a non-regulated system.

**What becomes better:**

- analytics-service has a single, clear responsibility: metrics aggregation.
- Retention policy applies only to metrics data. Audit records are never deleted by the
  application.
- audit-service can evolve independently toward compliance requirements (append-only
  enforcement, cryptographic chaining, tiered retention) without touching the metrics
  service. See `spec/roadmap/compliance-roadmap.md`.
- Access control for the audit log can be tightened independently of metrics access.
