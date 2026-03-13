# shared

Shared utilities and middlewares used across all BearLink backend services.

## Package structure

```
shared/
+-- index.js                   # Main entry point — re-exports everything below
+-- events/
|   +-- index.js               # createEventPublisher, QUEUES
|   +-- publisher.js           # publishUserRegistered, publishUrlCreated, etc.
|   +-- consumer.js            # createEventConsumer
|   +-- constants.js           # Queue name constants
|   \-- types.js               # Event type constants
+-- middlewares/
|   +-- auth.js                # authenticateJWT, isAdmin, isSelfOrAdmin
|   +-- cors.js                # createCors(options)
|   +-- correlationId.js       # correlationId middleware
|   +-- rateLimit.js           # createRateLimiter(options)
|   \-- requestLogger.js       # HTTP request logging middleware
\-- utils/
    +-- logger.js              # createLogger(serviceName) -- Winston logger
    +-- rabbitmq.js            # connectRabbitMQ() -- connection with retry
    +-- healthCheck.js         # healthHandler, createReadinessHandler
    +-- outboxPoller.js        # createOutboxPoller(options) -- audit outbox
    +-- validation.js          # shared validation helpers
    \-- context.js             # AsyncLocalStorage request context
```

## Importing

Services import via the package name (configured in each service's package.json
`dependencies` as `"shared": "file:../shared"`):

```js
// Full package import
const { createOutboxPoller, createLogger } = require('shared');

// Direct path import (preferred for tree-shaking clarity)
const { createOutboxPoller } = require('shared/utils/outboxPoller');
const { createLogger } = require('shared/utils/logger');
const { authenticateJWT } = require('shared/middlewares/auth');
```

## Utilities

### createOutboxPoller({ prisma, auditServiceUrl, logger, sourceService })

Background poller that forwards unprocessed `OutboxEvent` rows to the
audit-service internal endpoint.

```js
const { createOutboxPoller } = require('shared/utils/outboxPoller');

const outboxPoller = createOutboxPoller({
  prisma, // PrismaClient instance
  auditServiceUrl: process.env.AUDIT_SERVICE_URL,
  logger,
  sourceService: 'auth-service', // name sent in each audit event
});

outboxPoller.start(); // call after DB/RabbitMQ are ready
outboxPoller.stop(); // call in gracefulShutdown (returns a Promise)
```

Behaviour:

- Polls every 5 s; fetches up to 100 unprocessed rows ordered by `createdAt` asc.
- POSTs a batch to `{auditServiceUrl}/internal/audit-events` with the
  `X-Audit-Secret` header from `process.env.AUDIT_INTERNAL_SECRET`.
- Marks rows `processed = true` and sets `processedAt` only on a 2xx response.
- Retries on non-2xx or network failure (rows stay unprocessed).
- If `auditServiceUrl` is falsy, logs a warning on `start()` and skips polling.
- `stop()` clears the interval and awaits any in-flight request before resolving.

### createLogger(serviceName)

Returns a Winston logger instance with console and file transports.

### connectRabbitMQ()

Returns a Promise resolving to an AMQP channel. Retries up to 30 times (2 s intervals).

### healthHandler / createReadinessHandler

Express route handlers for `GET /health` and `GET /ready`.

## Middlewares

- `authenticateJWT` -- validates JWT from Authorization header or `token` cookie.
- `isAdmin` -- requires `role === 'ADMIN'`; use after `authenticateJWT`.
- `isSelfOrAdmin` -- allows the requesting user or any admin.
- `createCors(options)` -- configures CORS for the service.
- `correlationId` -- attaches / forwards `X-Correlation-Id` header.
- `createRateLimiter(options)` -- in-memory rate limiter (express-rate-limit).
- `requestLogger` -- logs method, path, status, and duration via Winston.
