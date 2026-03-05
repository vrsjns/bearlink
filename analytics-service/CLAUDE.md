# Analytics Service

Authenticated event storage, aggregation, and query service.

**Port:** 6000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `analytics`)

## Project Structure

```
analytics-service/
+-- index.js                    # Entry point: DB/RabbitMQ init, cron job, server start, shutdown
+-- app.js                      # Express app factory: middleware setup, route mounting
+-- routes/
|   +-- index.js                # Combine routers, export single router factory
|   +-- events.routes.js        # GET /events (authenticated, paginated, filtered)
|   \-- analytics.routes.js     # GET /analytics/* endpoints
+-- controllers/
|   +-- events.controller.js    # listEvents handler
|   \-- analytics.controller.js # getUrlClicks, getSummary, getTopUrls handlers
+-- services/
|   +-- event.service.js        # createEventHandler for RabbitMQ consumption + payload validation
|   \-- cleanup.service.js      # runCleanup(prisma, retentionDays) — daily data retention helper
\-- CLAUDE.md
```

## Dependency Injection Pattern

The service uses factory functions with dependency injection:

```javascript
// Entry point creates dependencies
const prisma = new PrismaClient();
const handleEvent = createEventHandler({ prisma });

// App factory receives dependencies
const app = createApp({ prisma });

// Routes receive dependencies and pass to controllers
const createRoutes = ({ prisma }) => {
  router.use(createEventsRoutes({ prisma }));
  router.use(createAnalyticsRoutes({ prisma }));
  return router;
};
```

## Event Consumption

This service **consumes** events from RabbitMQ. It does not publish events.

### Events Consumed

Consumes **all** domain events from the `events` queue and stores them as audit log entries.
Payloads are validated against per-type schemas before being persisted — unknown types and
payloads missing required fields are discarded with a warning log.

| Event                      | Publisher    | Required fields validated |
| -------------------------- | ------------ | ------------------------- |
| `user_registered`          | auth-service | `id`, `email`             |
| `url_created`              | url-service  | `shortId`, `userId`       |
| `url_updated`              | url-service  | `shortId`, `userId`       |
| `url_deleted`              | url-service  | `shortId`, `userId`       |
| `url_clicked`              | url-service  | `shortId`                 |
| `password_reset_requested` | auth-service | `userId`                  |
| `password_reset_completed` | auth-service | `userId`                  |

### Code Pattern

```javascript
const { consumeEvents } = require('shared/events');
const { createEventHandler } = require('./services/event.service');

const handleEvent = createEventHandler({ prisma });

// Setup (after RabbitMQ connection)
await consumeEvents(channel, handleEvent, { serviceName: 'analytics-service' });
```

## API Endpoints

All endpoints require JWT authentication (Bearer token or httpOnly cookie).

| Method | Path                            | Auth       | Description                                     |
| ------ | ------------------------------- | ---------- | ----------------------------------------------- |
| GET    | /events                         | Any user   | Paginated event list; users see own events only |
| GET    | /analytics/urls/:shortId/clicks | Any user   | Total and today's click count for a URL         |
| GET    | /analytics/summary              | Admin only | Platform totals: users, URLs, clicks            |
| GET    | /analytics/top-urls             | Admin only | Top N URLs by click count for a time period     |

### GET /events query parameters

| Param    | Default | Notes                                   |
| -------- | ------- | --------------------------------------- |
| `page`   | 1       | Min 1                                   |
| `limit`  | 50      | Max 100                                 |
| `type`   | -       | Filter by event type                    |
| `from`   | -       | ISO date lower bound on `createdAt`     |
| `to`     | -       | ISO date upper bound on `createdAt`     |
| `userId` | -       | Admin only — filter by `payload.userId` |

Response shape: `{ data: Event[], pagination: { page, limit, total } }`

### GET /analytics/top-urls query parameters

| Param    | Default | Notes            |
| -------- | ------- | ---------------- |
| `period` | all     | e.g. `7d`, `30d` |
| `limit`  | 10      | Max 100          |

Uses `prisma.$queryRaw` with `GROUP BY payload->>'shortId'` — no row hydration.

## Database

Uses `analytics_service` PostgreSQL database with Prisma ORM.

### Event Model

| Field       | Type     | Notes                           |
| ----------- | -------- | ------------------------------- |
| `id`        | Int      | Primary key                     |
| `type`      | String   | Event type (e.g. `url_clicked`) |
| `payload`   | Json     | Full event payload              |
| `createdAt` | DateTime | Timestamp when stored           |

Indexes: `type`, `createdAt`, `(type, createdAt)` composite.

## Data Retention

A `node-cron` job runs at 02:00 every day and deletes events older than
`EVENT_RETENTION_DAYS` (default 90). The cleanup logic lives in
`services/cleanup.service.js` as `runCleanup(prisma, retentionDays)` for
testability.

## Environment Variables

| Variable               | Required | Description                                        |
| ---------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string                       |
| `JWT_SECRET`           | Yes      | Shared JWT signing secret                          |
| `RABBITMQ_URL`         | Yes      | RabbitMQ connection URL                            |
| `EVENT_RETENTION_DAYS` | No       | Days to retain events before cleanup (default: 90) |
