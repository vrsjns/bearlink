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
|   \-- csrf.service.js            # CSRF token generation and verification
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
