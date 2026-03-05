# Auth Service

User authentication service handling registration, login, and user management.

**Port:** 4000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `auth`)

## Project Structure

```
auth-service/
+-- index.js              # Entry point: DB/RabbitMQ init, server start, shutdown
+-- app.js                # Express app factory: middleware setup, route mounting
+-- routes/
|   +-- index.js          # Combine routers, export single router factory
|   +-- auth.routes.js    # POST /register, POST /login, POST /forgot-password, POST /reset-password/:token
|   \-- users.routes.js   # /users CRUD, /profile, /password
+-- controllers/
|   +-- auth.controller.js    # register, login, forgotPassword, resetPassword handlers
|   \-- users.controller.js   # user management handlers
+-- services/
|   +-- token.service.js           # generateToken, sanitizeUser helpers
|   +-- passwordReset.service.js   # generateResetToken, buildResetLink helpers
|   +-- csrf.service.js            # CSRF token generation and verification
|   \-- outboxPoller.js            # Background poller: forwards OutboxEvent rows to audit-service
\-- CLAUDE.md
```

## Dependency Injection Pattern

The service uses factory functions with dependency injection:

```javascript
// Entry point creates dependencies
const prisma = new PrismaClient();
const eventPublisher = createEventPublisher(channel);

// App factory receives dependencies
const app = createApp({ prisma, eventPublisher });

// Routes receive dependencies and pass to controllers
const createRoutes = ({ prisma, eventPublisher }) => {
  router.use(createAuthRoutes({ prisma, eventPublisher }));
  router.use(createUsersRoutes({ prisma }));
  return router;
};
```

## Event Publishing

This service **publishes** events to RabbitMQ. It does not consume events.

### Events Published

**On user registration (`POST /register`):**

1. `user_registered` - Domain event with sanitized user data (no password)
2. Email notification - Welcome email to the new user

**On password reset request (`POST /forgot-password`):**

1. `password_reset_requested` - Domain event with `{ userId }` (only when email is registered)
2. Email notification - Reset link email to the user

**On password reset completion (`POST /reset-password/:token`):**

1. `password_reset_completed` - Domain event with `{ userId }`

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
- `role` - User role (default: 'USER', can be 'ADMIN')
- `resetTokens` - Relation to PasswordResetToken

### PasswordResetToken Model

- `id` - Primary key
- `token` - Unique hex string (64 chars, 256 bits of entropy)
- `userId` - FK to User (cascade delete)
- `expiresAt` - Expiry timestamp (1 hour from creation)
- `usedAt` - Set when the token is consumed; null if unused
- `createdAt` - Creation timestamp

### OutboxEvent Model

- `id` - Primary key (autoincrement)
- `eventType` - Event name (e.g. `user_registered`, `user_login`)
- `payload` - JSON payload (event-specific fields; never includes passwords or tokens)
- `actorId` - ID of the user who triggered the event (nullable)
- `processed` - Whether the row has been forwarded to audit-service (default false)
- `processedAt` - Timestamp when forwarding was confirmed (nullable)
- `createdAt` - Creation timestamp

## Outbox Pattern

Every auditable action writes an `OutboxEvent` row atomically with its business record in a single `prisma.$transaction`. A background poller (`outboxPoller.js`) picks up unprocessed rows every 5 seconds and POSTs them to the audit-service internal endpoint (`AUDIT_SERVICE_URL/internal/audit-events`). Rows are marked `processed = true` only on a 2xx response; failures retry on the next cycle.

Events covered: `user_registered`, `user_login`, `user_login_failed`, `user_password_changed`, `user_profile_updated`, `user_deleted`, `password_reset_requested`, `password_reset_completed`.
