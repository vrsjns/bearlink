# audit-service

> **Status:** done
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

- [x] `docs/openapi.yaml` -- add audit-service tag and endpoints: POST /internal/audit-events,
      GET /audit.
- [x] `docs/asyncapi.yaml` -- no new events; no update needed.

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->

### Task 1 -- Service scaffold + Prisma model (R1-R3, R8-R9, R12) [x]

Create the `audit-service/` directory and all bootstrap files.

- `audit-service/package.json`: name `audit-service`, port 8500, scripts `start`/`test`
  matching the auth-service pattern. Dependencies: `@prisma/client`, `dotenv`, `express`,
  `jsonwebtoken`, `cookie-parser`, `winston`, `prisma`. Dev: `nodemon`, `supertest`,
  `vitest`.
- `audit-service/Dockerfile`: copy the auth-service Dockerfile pattern (Node 20,
  wait-for-postgres, prisma generate, EXPOSE 8500).
- `audit-service/prisma/schema.prisma`: `audit_service` datasource, one model `AuditEntry`
  with fields: `id` (Int autoincrement PK), `eventId` (String @unique), `eventType`
  (String), `actorId` (String?), `sourceService` (String), `payload` (Json), `createdAt`
  (DateTime @default(now)).
- `audit-service/prisma/migrations/TIMESTAMP_init/migration.sql`: SQL for the AuditEntry
  table.
- `audit-service/index.js`: load dotenv, create PrismaClient, call `createApp({ prisma })`,
  mount `/health` and `/ready` (DB connectivity check only — no RabbitMQ), start server on
  `process.env.PORT || 8500`, register SIGTERM/SIGINT graceful shutdown (server.close +
  prisma.$disconnect).
- `audit-service/app.js`: factory `createApp({ prisma })` — express, json middleware,
  CORS, correlationId, requestLogger, mount routes from `createRoutes({ prisma })`.
- `audit-service/routes/index.js`: export `createRoutes({ prisma })` that mounts the
  audit router.
- `audit-service/CLAUDE.md`: brief service description.

### Task 2 -- Internal write endpoint (R4-R6, R14) [x]

Files: `audit-service/controllers/audit.controller.js`,
`audit-service/routes/audit.routes.js`

- In the route file, implement a middleware `requireAuditSecret(req, res, next)` that reads
  `process.env.AUDIT_INTERNAL_SECRET` and compares it to the `x-audit-secret` request
  header using a timing-safe comparison (`crypto.timingSafeEqual`). Return 401 if the
  header is absent or does not match; do not apply JWT middleware to this route.
- `POST /internal/audit-events`: accept an array of event objects. Each object has:
  `eventId` (String), `eventType` (String), `actorId` (String?), `sourceService` (String),
  `payload` (Object), `createdAt` (String).
  Use `prisma.auditEntry.createMany({ data: [...], skipDuplicates: true })` to insert all
  events in one query. Derive `skipped = received - result.count`. Return 200 with
  `{ received, inserted, skipped }`.
- Return 400 if the body is not an array or is empty. Return 500 on unexpected DB errors.
- There is no DELETE route. Do not implement one.

### Task 3 -- Admin query endpoint (R7, R13) [x]

Files: `audit-service/controllers/audit.controller.js`,
`audit-service/routes/audit.routes.js`

- `GET /audit`: protected by `authenticateJWT` then `isAdmin` from
  `shared/middlewares/auth.js`.
- Parse query params: `page` (default 1), `limit` (default 50, max 100), `type`
  (filter on `eventType`), `actorId`, `service` (filter on `sourceService`), `from`
  and `to` (ISO date bounds on `createdAt`).
- Build a `where` object from whichever params are present. Run
  `prisma.auditEntry.findMany` and `prisma.auditEntry.count` in `Promise.all`.
  Order by `createdAt` descending.
- Return `{ data: AuditEntry[], pagination: { page, limit, total } }`.

### Task 4 -- Infrastructure: Docker Compose + Kubernetes (R10-R11) [x]

Files: `docker-compose.yml`,
`k8s/audit-service/deployment.yaml`,
`k8s/audit-service/service.yaml`,
`k8s/kustomization.yaml`

- `docker-compose.yml`: add `audit_db` Postgres container (same pattern as the existing
  `db` service, with `POSTGRES_DB=audit_service`). Add `audit-service` container that
  depends on `audit_db` and `rabbitmq` (not strictly needed but consistent), sets
  `DATABASE_URL` pointing to `audit_db`, and `AUDIT_INTERNAL_SECRET` from `.env.secrets`.
- `k8s/audit-service/deployment.yaml`: follow the auth-service deployment pattern (Node 20
  image, wait-for-postgres initContainer, env from secrets, readiness/liveness probes on
  port 8500). `DATABASE_URL` points to the shared Postgres instance with database name
  `audit_service`. Include `AUDIT_INTERNAL_SECRET` from bearlink-secrets.
- `k8s/audit-service/service.yaml`: ClusterIP service on port 8500 (consistent with
  other internal services).
- `k8s/kustomization.yaml`: add `audit-service/deployment.yaml` and
  `audit-service/service.yaml` to the `resources` list; add `audit-service` image entry
  pointing to `ghcr.io/vrsjns/audit-service`.

### Task 5 -- Tests + OpenAPI docs (R15) [x]

Files: `audit-service/test/mocks/prisma.ts`,
`audit-service/test/audit.routes.test.ts`,
`audit-service/vitest.config.ts`,
`docs/openapi.yaml`

- `audit-service/vitest.config.ts`: copy pattern from auth-service.
- `audit-service/test/mocks/prisma.ts`: export `mockPrismaAuditEntry` (`create`,
  `createMany`, `findMany`, `count`), `createMockPrismaClient`, `resetPrismaMocks`.
- `audit-service/test/audit.routes.test.ts` covering:
  - POST /internal/audit-events with correct secret + new eventIds → 200, `inserted: N`
  - POST /internal/audit-events where all eventIds are duplicates → 200, `skipped: N`
  - POST /internal/audit-events with missing X-Audit-Secret → 401
  - POST /internal/audit-events with wrong X-Audit-Secret → 401
  - POST /internal/audit-events with non-array body → 400
  - GET /audit with admin JWT + filters + pagination → 200 with `data` and `pagination`
  - GET /audit with non-admin JWT → 403
  - GET /audit with no JWT → 401
- `docs/openapi.yaml`: add `audit` tag; document `POST /internal/audit-events` (request
  body array schema, 200/400/401 responses) and `GET /audit` (query params, paginated
  response schema, 200/401/403 responses).
