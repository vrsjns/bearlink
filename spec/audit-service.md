# audit-service

> **Status:** approved
> **Service(s):** audit-service (new)
> **Priority:** high

## Goal

Introduce a dedicated audit-service that receives forwarded outbox events from source
services and stores them in an append-only audit log. The service is the single source
of truth for the audit trail and must never delete records. It exposes an admin-only
REST API for querying the audit log. This replaces the audit role currently held by
analytics-service.

## Background

The outbox pattern (auth-service-outbox.md, url-service-outbox.md) guarantees that audit
events leave the source service reliably. This spec defines the receiving end: a
dedicated service that accepts those events, stores them durably, and makes them
queryable for compliance and operational review.

Key design decisions:

- The write endpoint is internal (service-to-service) and secured with a shared secret
  rather than a JWT, because source service pollers do not hold user tokens.
- Records are never deleted at the application layer. Retention is a future concern
  addressed by the compliance roadmap.
- Idempotency is required because the outbox poller uses at-least-once delivery.

## Requirements

### Functional

- **R1:** A new Express service named `audit-service` shall run on port 8500.

- **R2:** The service shall use its own PostgreSQL database named `audit_service`.

- **R3:** The `AuditEntry` Prisma model shall have the following fields:
  - `id` (Int, autoincrement, primary key)
  - `eventId` (String, unique) -- source-service-generated UUID for idempotency
  - `eventType` (String) -- e.g. `user_registered`, `url_created`
  - `actorId` (String?) -- userId of the actor, null for system events
  - `sourceService` (String) -- name of the originating service
  - `payload` (Json) -- full event payload from the outbox
  - `createdAt` (DateTime, default now)

- **R4:** `POST /internal/audit-events` shall accept an array of outbox event objects.
  The request shall be authenticated by a shared secret passed in the
  `X-Audit-Secret` header. If the header is missing or does not match the
  `AUDIT_INTERNAL_SECRET` environment variable, the endpoint returns 401.

- **R5:** For each event in the request body, the handler shall insert an AuditEntry
  if no row with the same `eventId` exists. Duplicate `eventId` values shall be
  silently skipped (idempotent upsert). The endpoint returns 200 with a summary:
  `{ received: N, inserted: N, skipped: N }`.

- **R6:** There shall be no DELETE endpoint for AuditEntry records. No cron job or
  scheduled cleanup shall be present in this service.

- **R7:** `GET /audit` shall return a paginated, filtered list of AuditEntry records.
  This endpoint requires JWT authentication and admin role.
  Query parameters:
  - `page` (default 1, min 1)
  - `limit` (default 50, max 100)
  - `type` -- filter by eventType
  - `actorId` -- filter by actorId
  - `service` -- filter by sourceService
  - `from` -- ISO date lower bound on createdAt
  - `to` -- ISO date upper bound on createdAt
    Response shape: `{ data: AuditEntry[], pagination: { page, limit, total } }`

- **R8:** `GET /health` and `GET /ready` shall follow the same pattern as other services
  (health: always 200; ready: checks DB connectivity).

- **R9:** The service shall implement graceful shutdown on SIGTERM/SIGINT (close HTTP
  server, disconnect Prisma).

- **R10:** A `docker-compose.yml` entry shall be added for `audit-service` and its
  database (`audit_db` Postgres container).

- **R11:** Kubernetes manifests shall be added under `k8s/audit-service/`:
  `deployment.yaml`, `service.yaml`. The `audit_db` database shall use the existing
  shared Postgres instance with a new database name (consistent with other services).

### Non-Functional

- **R12:** The service shall follow the same dependency injection factory pattern used
  by other BearLink services (`createApp({ prisma })`, `createRoutes({ prisma })`).

- **R13:** The shared `authenticateJWT` and `isAdmin` middlewares shall be used for
  the query endpoint (R7). The shared `createLogger` shall be used for logging.

- **R14:** The internal endpoint (R4) shall not use JWT middleware — only the shared
  secret header check.

- **R15:** Tests shall cover: successful insert, duplicate skip, missing/wrong secret
  (401), query endpoint with filters and pagination, missing JWT (401), non-admin JWT
  (403).

## Acceptance Criteria

- [ ] Given a valid POST to /internal/audit-events with correct secret and a new eventId,
      a new AuditEntry row is created and the response includes `inserted: 1`.

- [ ] Given a POST with an eventId that already exists, no duplicate row is created and
      the response includes `skipped: 1`.

- [ ] Given a POST with a missing or wrong X-Audit-Secret header, the response is 401.

- [ ] Given an admin JWT and GET /audit, the response contains paginated AuditEntry rows.

- [ ] Given a non-admin JWT and GET /audit, the response is 403.

- [ ] Given no DELETE route exists, attempting DELETE /audit/:id returns 404.

- [ ] The service starts, accepts connections, and shuts down gracefully in the Docker
      Compose environment alongside all other services.

- [ ] GET /ready returns 200 when the database is reachable and 503 otherwise.

## Out of Scope

- A UI for browsing the audit log (web-ui integration is a separate concern).
- Cryptographic chaining or tamper-evidence (see compliance roadmap).
- Tiered retention / archival (see compliance roadmap).
- Audit events for services other than auth-service and url-service (notification-service,
  preview-service do not produce user-attributable actions today).
- Rate limiting on the internal endpoint (it is not exposed publicly).

## Docs to Update

- [ ] `docs/openapi.yaml` -- add audit-service tag and endpoints: POST /internal/audit-events,
      GET /audit.
- [ ] `docs/asyncapi.yaml` -- no new events; no update needed.

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->
