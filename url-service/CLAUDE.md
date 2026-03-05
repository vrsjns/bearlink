# URL Service

URL shortening service handling link creation, management, and redirection.

**Port:** 5000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tags: `urls`, `redirect`)

## Project Structure

```
url-service/
├── index.js              # Entry point: DB/RabbitMQ/Redis init, server start, shutdown
├── app.js                # Express app factory: middleware setup, route mounting
├── routes/
│   ├── index.js          # Combine routers, export single router factory
│   ├── urls.routes.js    # Authenticated CRUD + bulk + sign endpoints
│   └── redirect.routes.js # Public redirect, QR, and unlock endpoints
├── controllers/
│   ├── urls.controller.js    # list, create, createBulk, update, delete, signUrl handlers
│   └── redirect.controller.js # redirect, qr, unlock handlers + findUrl/invalidateUrlCache helpers
├── services/
│   ├── url.service.js          # generateShortId helper (nanoid)
│   ├── preview.client.js       # Publish preview_jobs / consume preview_results
│   ├── rateLimiters.js         # createRedisRateLimiters(redisClient) factory
│   ├── safeBrowsing.service.js # checkUrlSafety(url, apiKey, httpClient?)
│   ├── domainFilter.service.js # checkDomain(url) — reads DOMAIN_BLOCKLIST/ALLOWLIST env
│   ├── signedUrl.service.js    # signUrl / verifyUrl (HMAC-SHA256)
│   └── outboxPoller.js         # createOutboxPoller(prisma, auditServiceUrl, logger) factory
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── test/
│   ├── mocks/                  # prisma, rabbitmq, redis mock factories
│   ├── url.service.test.ts
│   ├── urls.routes.test.ts
│   ├── redirect.routes.test.ts
│   ├── redis.routes.test.ts
│   ├── security.test.ts
│   └── outboxPoller.test.ts
└── CLAUDE.md
```

## Dependency Injection Pattern

```javascript
// Entry point creates dependencies
const prisma = new PrismaClient();
const eventPublisher = createEventPublisher(channel);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });

// App factory receives dependencies
const app = createApp({ prisma, eventPublisher, baseUrl, redis });

// Routes receive dependencies and pass to controllers
const createRoutes = ({ prisma, eventPublisher, baseUrl, redis, publishPreviewJob }) => {
  router.use(createUrlsRoutes({ prisma, eventPublisher, baseUrl, publishPreviewJob, redis }));
  router.use(createRedirectRoutes({ prisma, eventPublisher, baseUrl, redis }));
  return router;
};
```

Redis is **optional** — the service starts and operates normally without it. All Redis calls are fail-open (errors are logged and execution continues).

## Event Publishing

This service **publishes** events to RabbitMQ and **consumes** `preview_results`.

### Events Published (queue: `events`)

| Trigger                         | Event         | Notes                                                      |
| ------------------------------- | ------------- | ---------------------------------------------------------- |
| `POST /urls`                    | `url_created` | Full URL record (passwordHash stripped)                    |
| `PUT /urls/:id`                 | `url_updated` | Full updated URL record (passwordHash stripped)            |
| `DELETE /urls/:id`              | `url_deleted` | Deleted URL record (passwordHash stripped)                 |
| `GET /:shortId` (human, unique) | `url_clicked` | Includes shortId, originalUrl, referer, userAgent, country |
| `POST /:shortId/unlock`         | `url_clicked` | Same fields as above                                       |

Bot requests (matched by User-Agent) and duplicate clicks from the same IP within the same hour do **not** emit `url_clicked`.

### Preview Pipeline (queues: `preview_jobs` / `preview_results`)

On URL creation, `publishPreviewJob({ urlId, originalUrl })` sends a message to `preview_jobs`.
The preview-service scrapes metadata and replies to `preview_results`.
url-service consumes `preview_results` and updates the URL record's preview fields.

### Code Pattern

```javascript
const { createEventPublisher, QUEUES } = require('shared/events');

const eventPublisher = createEventPublisher(channel);

eventPublisher.publishUrlCreated(sanitizeForEvent(newUrl));
eventPublisher.publishUrlUpdated(sanitizeForEvent(updatedUrl));
eventPublisher.publishUrlDeleted(sanitizeForEvent(deletedUrl));
eventPublisher.publishUrlClicked({
  shortId: url.shortId,
  originalUrl: url.originalUrl,
  referer,
  userAgent,
  country,
});
```

## Redis Usage

Redis is used in **controllers only** (not in rate-limit middleware) to avoid test complexity.

| Feature     | Key pattern                   | TTL   | Notes                                           |
| ----------- | ----------------------------- | ----- | ----------------------------------------------- |
| URL cache   | `url:{slug}`                  | 60s   | Set on cache miss; deleted on update/delete     |
| Click dedup | `dedup:{shortId}:{ip}:{hour}` | 3600s | SET NX — only count first click per IP per hour |

`createRedisRateLimiters` in `services/rateLimiters.js` is available but currently not wired into routes (routes use the shared in-memory limiters). It can be activated by passing the Redis client to route factories.

## Database

Uses `url_service` PostgreSQL database with Prisma ORM.

### URL Model

| Field                | Type             | Notes                                         |
| -------------------- | ---------------- | --------------------------------------------- |
| `id`                 | Int              | Primary key                                   |
| `originalUrl`        | String           | Destination URL                               |
| `shortId`            | String (unique)  | Auto-generated 10-char nanoid                 |
| `customAlias`        | String? (unique) | 3-50 chars, `[a-zA-Z0-9_-]`                   |
| `redirectType`       | Int              | 301 or 302 (default 302)                      |
| `expiresAt`          | DateTime?        | Returns 410 after this time                   |
| `passwordHash`       | String?          | bcrypt hash; unlock via POST /:shortId/unlock |
| `tags`               | String[]         | Filterable labels                             |
| `utmParams`          | Json?            | Appended to destination URL on redirect       |
| `requireSignature`   | Boolean          | Default false; enforces HMAC sig on redirect  |
| `clicks`             | Int              | Incremented on each unique human click        |
| `createdAt`          | DateTime         | Auto-set                                      |
| `userId`             | Int              | Owner's user ID                               |
| `previewTitle`       | String?          | Scraped by preview-service (async)            |
| `previewDescription` | String?          | Scraped by preview-service (async)            |
| `previewImageUrl`    | String?          | Scraped by preview-service (async)            |
| `previewFetchedAt`   | DateTime?        | When preview metadata was last updated        |

## Audit Outbox

url-service writes an `OutboxEvent` row atomically with every state-changing DB operation.
A background poller (`outboxPoller.js`) forwards unprocessed rows to audit-service every 5 s.

### OutboxEvent model

| Field         | Type      | Notes                                  |
| ------------- | --------- | -------------------------------------- |
| `id`          | Int       | Primary key (autoincrement)            |
| `eventType`   | String    | e.g. `url_created`, `url_clicked`      |
| `payload`     | Json      | Event-specific fields (see below)      |
| `actorId`     | String?   | String form of userId where available  |
| `processed`   | Boolean   | Default false; set true after delivery |
| `processedAt` | DateTime? | Timestamp of successful delivery       |
| `createdAt`   | DateTime  | Auto-set                               |

### Events written

| Event               | Trigger                                   | Transaction type  | Key payload fields                                     |
| ------------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------ |
| `url_created`       | POST /urls (single and bulk)              | callback-form     | shortId, userId, originalUrl, customAlias, createdAt   |
| `url_updated`       | PUT /urls/:id                             | callback-form     | shortId, userId, full updated record (no passwordHash) |
| `url_deleted`       | DELETE /urls/:id                          | callback-form     | shortId, userId                                        |
| `url_clicked`       | unique human GET /:shortId or POST unlock | array-form        | shortId, ip (sha256), userAgent, country, referer      |
| `url_signed`        | POST /urls/:id/sign                       | standalone insert | urlId, shortId, userId, ttl                            |
| `url_unlock_failed` | POST /:shortId/unlock wrong password      | standalone insert | shortId                                                |

IP addresses are hashed with `crypto.createHash('sha256')` before storage.
No OutboxEvent is written for bot requests, deduplicated clicks, or 404/410 unlock attempts.

### Poller

`createOutboxPoller({ prisma, auditServiceUrl, logger })` returns `{ start(), stop() }`.

- Polls every 5 s; fetches up to 100 unprocessed rows ordered by `createdAt`.
- POSTs a batch to `AUDIT_SERVICE_URL/internal/audit-events`.
- Marks rows `processed = true` only on 2xx response; retries on failure.
- If `AUDIT_SERVICE_URL` is not set, logs a warning and skips the interval entirely.
- Stops cleanly on `stop()` call (called in `gracefulShutdown`).

## Security Features

- **Domain filter:** `DOMAIN_BLOCKLIST` / `DOMAIN_ALLOWLIST` env vars (comma-separated). Checked at URL creation and update. Returns 422 when blocked.
- **Safe Browsing:** `SAFE_BROWSING_API_KEY` env var. Calls Google Safe Browsing API v4 at creation/update. Fail-open (no API key or timeout → allowed). Returns 422 when flagged.
- **Signed URLs:** `URL_SIGNING_SECRET` env var. `POST /urls/:id/sign` generates a `?sig=&exp=` HMAC-SHA256 signed URL. `requireSignature=true` on a URL enforces verification at redirect time (403 if missing/invalid/expired).

## Environment Variables

| Variable                | Required | Description                                                                                           |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Yes      | PostgreSQL connection string                                                                          |
| `JWT_SECRET`            | Yes      | Shared JWT signing secret                                                                             |
| `RABBITMQ_URL`          | Yes      | RabbitMQ connection URL                                                                               |
| `BASE_URL`              | Yes      | Public base URL (e.g. `https://brl.ink`)                                                              |
| `REDIS_URL`             | No       | Redis connection string (default: `redis://localhost:6379`)                                           |
| `SAFE_BROWSING_API_KEY` | No       | Google Safe Browsing API v4 key                                                                       |
| `DOMAIN_BLOCKLIST`      | No       | Comma-separated blocked domains (e.g. `evil.com,bad.org`)                                             |
| `DOMAIN_ALLOWLIST`      | No       | Comma-separated allowed domains (takes precedence over blocklist)                                     |
| `URL_SIGNING_SECRET`    | No       | HMAC secret for signed URLs                                                                           |
| `AUDIT_SERVICE_URL`     | No       | Base URL of audit-service (e.g. `http://audit-service:9000`); outbox poller skips forwarding if unset |
