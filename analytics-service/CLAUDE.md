# Analytics Service

Event storage service that consumes and persists all domain events.

**Port:** 6000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `analytics`)

## Event Consumption

This service **consumes** events from RabbitMQ. It does not publish events.

### Events Consumed

Consumes **all** domain events from the `events` queue:
- `user_registered` - From auth-service
- `url_created` - From url-service
- `url_clicked` - From url-service

All events are stored in the database as audit log entries.

### Code Pattern

```javascript
const { consumeEvents } = require('shared/events');

const handleEvent = async (type, payload) => {
  await prisma.event.create({
    data: { type, payload },
  });
  logger.info(`Event of type ${type} stored successfully`);
};

// Setup (after RabbitMQ connection)
await consumeEvents(channel, handleEvent);
```

## Database

Uses `analytics_service` PostgreSQL database with Prisma ORM.

### Event Model

- `id` - Primary key
- `type` - Event type string (e.g., `user_registered`)
- `payload` - JSON payload from the event
- `createdAt` - Timestamp when event was stored
