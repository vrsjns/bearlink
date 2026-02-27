# Analytics Service

Event storage service that consumes and persists all domain events.

**Port:** 6000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `analytics`)

## Project Structure

```
analytics-service/
├── index.js              # Entry point: DB/RabbitMQ init, server start, shutdown
├── app.js                # Express app factory: middleware setup, route mounting
├── routes/
│   ├── index.js          # Combine routers, export single router factory
│   └── events.routes.js  # GET /events endpoint
├── controllers/
│   └── events.controller.js  # listEvents handler
├── services/
│   └── event.service.js  # createEventHandler for RabbitMQ consumption
└── CLAUDE.md
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
  return router;
};
```

## Event Consumption

This service **consumes** events from RabbitMQ. It does not publish events.

### Events Consumed

Consumes **all** domain events from the `events` queue and stores them as audit log entries:

| Event | Publisher | Payload highlights |
|-------|-----------|--------------------|
| `user_registered` | auth-service | id, email, name, role, createdAt |
| `url_created` | url-service | id, originalUrl, shortId, customAlias, tags, utmParams, requireSignature, userId |
| `url_updated` | url-service | Full updated URL record |
| `url_deleted` | url-service | id, originalUrl, shortId, userId |
| `url_clicked` | url-service | shortId, originalUrl, referer, userAgent, country |

### Code Pattern

```javascript
const { consumeEvents } = require('shared/events');
const { createEventHandler } = require('./services/event.service');

const handleEvent = createEventHandler({ prisma });

// Setup (after RabbitMQ connection)
await consumeEvents(channel, handleEvent, { serviceName: 'analytics-service' });
```

## Database

Uses `analytics_service` PostgreSQL database with Prisma ORM.

### Event Model

- `id` - Primary key
- `type` - Event type string (e.g., `url_clicked`)
- `payload` - Full JSON payload from the event
- `createdAt` - Timestamp when event was stored
