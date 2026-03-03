# url-service Outbox Integration

> **Status:** draft
> **Service(s):** url-service
> **Priority:** high

## Goal

Guarantee that every auditable URL operation in url-service is captured without the
dual-write gap. url-service commits to its database and then publishes to RabbitMQ as
two separate operations. A crash between them silently drops the audit record. This spec
applies the outbox pattern to all four auditable URL events so the audit write is atomic
with the business operation.

## Background

url-service is the highest-volume source of auditable events: url_created, url_updated,
url_deleted, and url_clicked. url_clicked in particular fires on every redirect and may
be high-frequency. The outbox pattern is the same as in auth-service-outbox.md but
applied to four event types and a service with more concurrent traffic.

The existing RabbitMQ publish path (used by analytics-service for metrics) is left
untouched. The outbox is a parallel, guaranteed-delivery audit path — not a replacement
for the existing event flow.

## Requirements

### Functional

- **R1:** The url-service database shall have a new `OutboxEvent` Prisma model with
  fields: `id` (Int, autoincrement), `eventType` (String), `payload` (Json),
  `actorId` (String?), `processed` (Boolean, default false), `processedAt`
  (DateTime?), `createdAt` (DateTime, default now).

- **R2:** The `createUrl` controller shall write the new URL record and an OutboxEvent
  row in a single `prisma.$transaction`. The OutboxEvent payload shall include:
  `shortId`, `userId`, `originalUrl`, `customAlias` (if set), `createdAt`.

- **R3:** The `updateUrl` controller shall write the URL update and an OutboxEvent row
  in a single `prisma.$transaction`. The payload shall include: `shortId`, `userId`,
  the fields that changed (diff is not required — full updated record is acceptable).

- **R4:** The `deleteUrl` controller shall write the URL deletion and an OutboxEvent row
  in a single `prisma.$transaction`. The payload shall include: `shortId`, `userId`.

- **R5:** The redirect controller shall write the click increment (or Redis dedup check)
  and an OutboxEvent row together. If Redis is used for click dedup, the OutboxEvent is
  written only when the click is counted (i.e. not deduplicated), maintaining consistency
  with what analytics receives. The payload shall include: `shortId`, `ip` (hashed),
  `userAgent`, `country`, `referer`.

- **R6:** A background poller shall start on service boot, run every 5 seconds, and
  fetch up to 100 unprocessed OutboxEvent rows ordered by `createdAt` ascending.

- **R7:** For each unprocessed row, the poller shall POST the event to the audit-service
  internal endpoint. If the request fails or times out (10 s), the row remains
  unprocessed and is retried on the next poll cycle.

- **R8:** The poller shall mark a row `processed = true` and set `processedAt` only
  after receiving a 2xx response from the audit-service.

- **R9:** The audit-service base URL shall be read from the `AUDIT_SERVICE_URL`
  environment variable. If not set, the poller logs a warning on boot and skips
  forwarding.

- **R10:** The poller shall stop cleanly on SIGTERM/SIGINT.

### Non-Functional

- **R11:** The poller shall not add measurable latency to the redirect path. The outbox
  write in the redirect transaction is the only addition to the hot path; the poller
  itself is decoupled and asynchronous.

- **R12:** The solution shall not introduce new npm packages.

- **R13:** Processed outbox rows are not deleted. A future retention spec may address
  cleanup.

## Acceptance Criteria

- [ ] Given a successful URL creation, an OutboxEvent row with type `url_created` and
      `processed = false` exists in the url-service database after the request completes.

- [ ] Given a successful URL deletion, an OutboxEvent row with type `url_deleted` exists.

- [ ] Given a redirect that counts a click, an OutboxEvent row with type `url_clicked`
      exists.

- [ ] Given a redirect that is deduplicated (Redis SET NX returns false), no OutboxEvent
      row is written.

- [ ] Given the audit-service is reachable, all unprocessed rows are forwarded and marked
      processed within one poll cycle (5 seconds).

- [ ] Given the audit-service is unreachable, unprocessed rows accumulate and the service
      continues handling requests without errors.

- [ ] Given a process crash between transaction commit and next poll, restarting the
      service causes the pending rows to be forwarded on the next poll cycle.

- [ ] The existing redirect latency (p99) increases by no more than 5 ms compared to
      baseline (measured in a local benchmark, not CI).

- [ ] All existing url-service tests continue to pass.

## Out of Scope

- Outbox for the bulk create endpoint (each individual URL write follows R2; the bulk
  wrapper does not need separate treatment).
- Cleanup of processed outbox rows.
- Encryption or signing of the outbox payload.
- url_clicked events for password-protected or signed-URL verification failures
  (these are not counted as clicks today).

## Docs to Update

- [ ] `docs/openapi.yaml` — no endpoint changes; no update needed.
- [ ] `docs/asyncapi.yaml` — no new events; no update needed.

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->
