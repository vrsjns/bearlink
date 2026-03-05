# url-service Outbox Integration

> **Status:** approved
> **Service(s):** url-service
> **Priority:** high

## Goal

Guarantee that every auditable URL operation in url-service is captured without the
dual-write gap. url-service commits to its database and then publishes to RabbitMQ as
two separate operations. A crash between them silently drops the audit record. This spec
applies the outbox pattern to all four auditable URL events so the audit write is atomic
with the business operation.

## Background

url-service is the highest-volume source of auditable events. The outbox pattern is the
same as in auth-service-outbox.md but applied to a service with more concurrent traffic.

Must-have events (state changes):

- `url_created` -- new short URL created (POST /urls; also fires per-item in bulk)
- `url_updated` -- short URL record modified (PUT /urls/:id)
- `url_deleted` -- short URL removed (DELETE /urls/:id)
- `url_clicked` -- unique human redirect (GET /:shortId and POST /:shortId/unlock)

Should-have event:

- `url_signed` -- a time-limited signed link generated (POST /urls/:id/sign); security
  relevant because the resulting URL bypasses the normal requireSignature gate for
  the duration of the TTL, making it a privileged operation worth auditing

Could-have event:

- `url_unlock_failed` -- wrong password submitted to POST /:shortId/unlock; enables
  retrospective brute-force detection on password-protected links

`url_signed` and `url_unlock_failed` have no corresponding DB write; the outbox row is a
standalone insert in those handlers.

The existing RabbitMQ publish path (used by analytics-service for metrics) is left
untouched. The outbox is a parallel, guaranteed-delivery audit path.

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

- **R10a:** The `signUrlEndpoint` handler shall insert a standalone OutboxEvent row with
  eventType `url_signed` after successfully generating a signed URL. The payload shall
  include: `urlId`, `shortId`, `userId`, `ttl` (seconds, null if no expiry set).

- **R10b:** The `unlock` handler shall insert a standalone OutboxEvent row with eventType
  `url_unlock_failed` when a bcrypt comparison returns false (wrong password). The payload
  shall include: `shortId`. No OutboxEvent is written for 404 (URL not found) or 410
  (expired) responses, as those are not access attempts against a live protected resource.

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

- [ ] Given a successful POST /urls/:id/sign, an OutboxEvent row with eventType
      `url_signed` exists containing urlId, shortId, userId, and ttl.

- [ ] Given a POST /:shortId/unlock with an incorrect password, an OutboxEvent row with
      eventType `url_unlock_failed` exists containing the shortId. No row is written when
      the URL does not exist (404) or has expired (410).

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
- `url_clicked` events for expired-link, signature-failure, or missing-password
  responses -- these are not counted as clicks today and carry no actor identity.
- Safe Browsing or domain-filter rejections -- these are input validation errors at
  create/update time, not state changes; they belong in security logs, not the audit
  trail.

## Docs to Update

- [ ] `docs/openapi.yaml` — no endpoint changes; no update needed.
- [ ] `docs/asyncapi.yaml` — no new events; no update needed.

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->
