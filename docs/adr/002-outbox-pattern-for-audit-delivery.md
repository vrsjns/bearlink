# ADR-002: Outbox pattern for reliable audit event delivery

- **Status:** accepted
- **Date:** 2026-03-03
- **Depends on:** ADR-001 (audit-service exists as a separate service)
- **Specs:** `spec/roadmap/audit-trail-roadmap.md`, `spec/auth-service-outbox.md`,
  `spec/url-service-outbox.md`, `spec/audit-service.md`

---

## Context

Once the decision to split analytics and audit into separate services was made
(ADR-001), the question became: how do source services (auth-service, url-service)
reliably deliver audit events to the new audit-service?

The existing event delivery mechanism in BearLink is RabbitMQ. Each source service
commits its business operation to its own database and then publishes a domain event to
RabbitMQ as two separate, non-atomic operations:

```
1. prisma.user.create(...)     -- DB write, commits
2. channel.publish(...)        -- RabbitMQ publish, separate operation
```

If the process crashes, is OOM-killed, or loses its RabbitMQ connection between steps 1
and 2, the business operation is recorded in the database but the event is never
published. For analytics metrics this is an acceptable loss -- a missing click count or
a missing user in the totals is a tolerable inaccuracy. For an audit log it is not: the
event happened, there is no record of it, and there is no way to detect or recover the
gap after the fact.

This is the **dual-write problem**: any architecture that requires a process to write to
two independent systems (a database and a message broker) and treats them as a unit
cannot guarantee atomicity without distributed transaction support, which RabbitMQ does
not provide.

The problem is structural, not operational. It cannot be fixed by making RabbitMQ more
durable, adding retries, or using persistent messages. The gap exists between the DB
commit and the first publish attempt, regardless of what happens after that.

---

## Decision

Use the **transactional outbox pattern** for the audit delivery path.

Each source service writes an `OutboxEvent` row to its own database **in the same
Prisma transaction** as the business operation. The two writes are atomic: either both
commit or both roll back. The outbox row is the guaranteed receipt that the event
occurred.

A background poller runs inside each source service process. Every 5 seconds it reads
unprocessed outbox rows and forwards them to audit-service via HTTP POST. The row is
marked processed only after audit-service returns a 2xx response. If the request fails,
the row remains unprocessed and is retried on the next poll cycle.

audit-service handles duplicate delivery by treating `eventId` as a unique key. If a
row is forwarded more than once (e.g. the service crashed after forwarding but before
marking the row processed), the second insert is silently skipped.

The existing RabbitMQ publish path for domain events is **unchanged**. analytics-service
continues to receive events from RabbitMQ for metrics purposes. The outbox is an
additional, parallel write that runs alongside the RabbitMQ publish -- not a replacement
for it. The two paths serve different reliability contracts:

```
Business operation (DB transaction)
  |
  +-- OutboxEvent row (same transaction)   --> poller --> audit-service  [guaranteed]
  |
  +-- RabbitMQ publish (after commit)      --> analytics-service         [best-effort]
```

---

## Alternatives Considered

**A: RabbitMQ with durable queues and persistent messages only.**
Make the RabbitMQ exchange and queues durable, publish messages as persistent. This is
already done in BearLink. It ensures that messages survive a RabbitMQ broker restart.

Rejected because: this does not close the dual-write gap. Message durability is a
broker-side guarantee. The gap is on the publisher side: between the DB commit and the
first call to `channel.publish()`. No RabbitMQ configuration can make those two
operations atomic.

**B: Database triggers.**
Add a Postgres trigger to each source table. On INSERT or UPDATE, the trigger writes a
row to an audit table within the same database transaction.

Rejected because:

- Triggers cannot capture application-level context. The audit record needs to know
  which user (JWT subject) triggered the action. That context lives in the HTTP request,
  not in the database row. Passing it via `SET LOCAL` session variables is fragile and
  non-standard.
- Each service has its own database. Triggers produce fragmented audit tables spread
  across three separate databases (auth_service, url_service), not a unified audit log
  in audit-service.
- Triggers are tightly coupled to the database schema. Every schema migration must
  account for trigger behaviour. This increases migration complexity and testing burden.
- Triggers capture row-level data changes, not semantic domain events. "Column
  `passwordHash` changed" is less useful than "user changed their password." Producing
  semantic records from triggers requires significant transformation logic inside the DB.

**C: Change Data Capture (Debezium reading the Postgres WAL).**
Run a Debezium connector that reads the Postgres Write-Ahead Log from each source
service database. Every committed write is captured and streamed to a Kafka topic, from
which audit-service consumes.

Rejected because: the dual-write gap is genuinely closed by CDC -- the WAL is the
source of truth and Debezium tracks its offset, so no committed write is ever missed.
However the infrastructure cost is prohibitive at the current scale of BearLink:

- Kafka (or Amazon MSK) must be deployed and operated.
- A Debezium connector must be configured per source database.
- A schema registry is required to handle schema evolution.
- WAL events are at the column-diff level; a transformation layer is needed to produce
  semantic audit records.
- Debezium requires Postgres logical replication to be enabled on each source database.

CDC is the right answer when outbox polling demonstrably cannot keep up with write
volume (roughly above 10,000 events per minute sustained). At that point CDC becomes
the migration path. Until then, the outbox poller is simpler, requires no new
infrastructure, and provides the same delivery guarantee. See
`spec/roadmap/compliance-roadmap.md` Stage 6 for the planned migration path.

**D: Synchronous HTTP call from source service to audit-service at write time.**
After the DB commit, the source service immediately POSTs to audit-service before
returning the HTTP response to the caller.

Rejected because:

- audit-service becomes a synchronous dependency of every write in auth-service and
  url-service. If audit-service is slow or down, every URL creation and user
  registration either fails or times out.
- The dual-write gap still exists: the DB commits, then the HTTP call is made. A crash
  between these steps loses the event.
- The approach adds latency to every write operation on the hot path.

---

## Consequences

**Accepted tradeoffs:**

- Each source service requires a new `OutboxEvent` Prisma model and a database
  migration. This is a schema change in auth-service and url-service.
- A background poller runs inside each source service process. It is non-blocking and
  does not affect request handling, but it is an additional concern to test and monitor.
- Audit event delivery is **asynchronous**: the audit record appears in audit-service
  within one poll cycle (up to 5 seconds) of the business operation committing. The
  audit log is not real-time.
- Delivery is **at-least-once**: audit-service must treat `eventId` as a unique
  constraint and silently skip duplicates. This idempotency requirement must be
  maintained in audit-service for the lifetime of the system.
- Processed outbox rows accumulate in source service databases. A future retention spec
  will address cleanup of old processed rows (unprocessed rows must never be deleted).

**What becomes better:**

- The audit trail has no silent loss window. Every business operation that commits
  produces an outbox row, and every outbox row is eventually delivered.
- Source services are not coupled to audit-service availability. If audit-service is
  down, rows accumulate in the outbox and are delivered when it recovers. No writes
  fail because of audit-service.
- The pattern is uniform across services: any future service that needs to produce
  audit events follows the same outbox model without requiring new infrastructure.
- The RabbitMQ analytics path is unaffected. The two delivery paths are independent
  and have independent failure modes.
