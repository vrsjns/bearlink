# Audit Service

Append-only audit log service. Receives outbox events from source services and stores them
durably. Exposes an admin-only query API. Records are never deleted.

**Port:** 8500 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `audit`)

## Project Structure

```
audit-service/
+-- index.js              # Entry point: DB init, server start, graceful shutdown
+-- app.js                # Express app factory: middleware setup, route mounting
+-- routes/
|   +-- index.js          # Combine routers, export single router factory
|   \-- audit.routes.js   # POST /internal/audit-events, GET /audit
+-- controllers/
|   \-- audit.controller.js  # ingestAuditEvents, queryAuditLog handlers
+-- prisma/
|   +-- schema.prisma
|   \-- migrations/
+-- test/
|   +-- mocks/            # prisma mock factories
|   \-- audit.routes.test.ts
+-- vitest.config.ts
\-- CLAUDE.md
```

## Dependency Injection Pattern

```javascript
const prisma = new PrismaClient();
const app = createApp({ prisma });

const createRoutes = ({ prisma }) => {
  router.use(createAuditRoutes({ prisma }));
  return router;
};
```

## Endpoints

### Internal (service-to-service)

`POST /internal/audit-events` -- accepts an array of outbox event objects.
Authenticated by `X-Audit-Secret` header (timing-safe compare against `AUDIT_INTERNAL_SECRET` env).
Uses `createMany({ skipDuplicates: true })` for idempotent upsert.
Returns `{ received, inserted, skipped }`.

No JWT middleware on this route.

### Admin query

`GET /audit` -- paginated, filtered list of AuditEntry records.
Protected by `authenticateJWT` + `isAdmin` from `shared/middlewares/auth.js`.
Query params: `page`, `limit`, `type`, `actorId`, `service`, `from`, `to`.
Returns `{ data: AuditEntry[], pagination: { page, limit, total } }`.

## Database

Uses `audit_service` PostgreSQL database with Prisma ORM. No DELETE endpoint or
cleanup job exists -- records are append-only by design.

### AuditEntry Model

| Field           | Type     | Notes                                         |
| --------------- | -------- | --------------------------------------------- |
| `id`            | Int      | Primary key (autoincrement)                   |
| `eventId`       | String   | Unique -- source-service UUID for idempotency |
| `eventType`     | String   | e.g. `url_created`, `user_deleted`            |
| `actorId`       | String?  | userId of the actor; null for system events   |
| `sourceService` | String   | Name of the originating service               |
| `payload`       | Json     | Full event payload from the outbox            |
| `createdAt`     | DateTime | Auto-set                                      |

## Environment Variables

| Variable                | Required | Description                                     |
| ----------------------- | -------- | ----------------------------------------------- |
| `DATABASE_URL`          | Yes      | PostgreSQL connection string                    |
| `JWT_SECRET`            | Yes      | Shared JWT signing secret (for GET /audit auth) |
| `AUDIT_INTERNAL_SECRET` | Yes      | Shared secret for POST /internal/audit-events   |
| `PORT`                  | No       | Listen port (default: 8500)                     |
