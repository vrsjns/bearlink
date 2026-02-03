# URL Service

URL shortening service handling link creation, management, and redirection.

**Port:** 5000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `urls`)

## Project Structure

```
url-service/
├── index.js              # Entry point: DB/RabbitMQ init, server start, shutdown
├── app.js                # Express app factory: middleware setup, route mounting
├── routes/
│   ├── index.js          # Combine routers, export single router factory
│   ├── urls.routes.js    # /urls CRUD endpoints
│   └── redirect.routes.js # /:shortId redirect endpoint
├── controllers/
│   ├── urls.controller.js    # list, create, update, delete handlers
│   └── redirect.controller.js # redirect handler
├── services/
│   └── url.service.js    # generateShortId helper
└── CLAUDE.md
```

## Dependency Injection Pattern

The service uses factory functions with dependency injection:

```javascript
// Entry point creates dependencies
const prisma = new PrismaClient();
const eventPublisher = createEventPublisher(channel);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

// App factory receives dependencies
const app = createApp({ prisma, eventPublisher, baseUrl });

// Routes receive dependencies and pass to controllers
const createRoutes = ({ prisma, eventPublisher, baseUrl }) => {
  router.use(createUrlsRoutes({ prisma, eventPublisher, baseUrl }));
  router.use(createRedirectRoutes({ prisma, eventPublisher }));
  return router;
};
```

## Event Publishing

This service **publishes** events to RabbitMQ. It does not consume events.

### Events Published

**On URL creation (`POST /urls`):**
- `url_created` - Contains the full URL record

**On URL redirect (`GET /:shortId`):**
- `url_clicked` - Contains `shortId` and `originalUrl`

### Code Pattern

```javascript
const { createEventPublisher, QUEUES } = require('shared/events');

// Setup (after RabbitMQ connection)
channel.assertQueue(QUEUES.EVENTS);
const eventPublisher = createEventPublisher(channel);

// On URL creation
eventPublisher.publishUrlCreated(newUrl);

// On redirect (after incrementing click counter)
eventPublisher.publishUrlClicked({ shortId, originalUrl: url.originalUrl });
```

## Database

Uses `url_service` PostgreSQL database with Prisma ORM.

### URL Model

- `id` - Primary key
- `originalUrl` - The full destination URL
- `shortId` - Generated short identifier (nanoid, 10 chars)
- `userId` - Owner's user ID
- `clicks` - Click counter (incremented on each redirect)
