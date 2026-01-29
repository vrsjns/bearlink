# URL Service

URL shortening service handling link creation, management, and redirection.

**Port:** 5000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `urls`)

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
