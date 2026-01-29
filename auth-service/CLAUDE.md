# Auth Service

User authentication service handling registration, login, and user management.

**Port:** 4000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `auth`)

## Event Publishing

This service **publishes** events to RabbitMQ. It does not consume events.

### Events Published

**On user registration (`POST /register`):**

1. `user_registered` - Domain event with sanitized user data (no password)
2. Email notification - Welcome email to the new user

### Code Pattern

```javascript
const { createEventPublisher, QUEUES } = require('shared/events');

// Setup (after RabbitMQ connection)
channel.assertQueue(QUEUES.EVENTS);
channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);
const eventPublisher = createEventPublisher(channel);

// On successful registration
eventPublisher.publishUserRegistered(sanitizeUser(user));
eventPublisher.publishEmailNotification({
  to: email,
  subject: 'Welcome to BearLink!',
  text: `Hello ${name},...`,
});
```

## Database

Uses `auth_service` PostgreSQL database with Prisma ORM.

### User Model

- `id` - Primary key
- `email` - Unique email address
- `password` - Bcrypt hashed password
- `name` - Display name
- `role` - User role (default: 'user', can be 'admin')
