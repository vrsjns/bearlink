# Auth Service

User authentication service handling registration, login, and user management.

**Port:** 4000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `auth`)

## Project Structure

```
auth-service/
├── index.js              # Entry point: DB/RabbitMQ init, server start, shutdown
├── app.js                # Express app factory: middleware setup, route mounting
├── routes/
│   ├── index.js          # Combine routers, export single router factory
│   ├── auth.routes.js    # POST /register, POST /login
│   └── users.routes.js   # /users CRUD, /profile, /password
├── controllers/
│   ├── auth.controller.js    # register, login handlers
│   └── users.controller.js   # user management handlers
├── services/
│   └── token.service.js  # generateToken, sanitizeUser helpers
└── CLAUDE.md
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
