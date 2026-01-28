# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BearLink is a URL shortening service built as a Node.js/TypeScript monorepo with microservices architecture.

## Development Commands

### Full Stack (Docker)
```bash
docker compose up --build    # Start all services
docker compose down          # Stop all services
```

### Monorepo (Lerna)
```bash
npm run bootstrap            # Install dependencies across workspaces
npm run start               # Start all services
npm run test                # Run tests in all workspaces
```

### Individual Services
Backend services (auth-service, url-service, analytics-service, notification-service):
```bash
cd <service-name>
npm run start               # Start with nodemon (auto-reload)
npm run test                # Run tests
npx prisma migrate dev      # Run database migrations
```

Frontend (web-ui):
```bash
cd web-ui
npm run dev                 # Next.js dev server
npm run build               # Production build
npm run lint                # ESLint
```

## Architecture

### Services

| Service | Port | Database | Purpose |
|---------|------|----------|---------|
| auth-service | 4000 | auth_service | User registration, login, JWT authentication |
| url-service | 5000 | url_service | URL shortening, redirection, click tracking |
| analytics-service | 6000 | analytics_service | Event storage and retrieval |
| notification-service | 7000 | - | Email delivery via SMTP |
| web-ui | 3000 | - | Next.js frontend |

Supporting infrastructure: PostgreSQL (5432), RabbitMQ (5672/15672), MailHog (1025/8025)

### Message Queues (RabbitMQ)
- `events` - Domain events (user_registered, url_created, url_clicked)
- `email_notifications` - Email delivery payloads

### Shared Code (`/shared`)
- `utils/logger.js` - Winston logger (console + file)
- `utils/rabbitmq.js` - RabbitMQ connection with retry logic
- `middlewares/auth.js` - JWT authentication (`authenticateJWT`, `isAdmin`, `isSelfOrAdmin`)
- `events/` - Event publishing and consuming helpers (see below)

### Event-Driven Communication

Services communicate via RabbitMQ using the shared events module (`shared/events/`).

| Service | Role | Events |
|---------|------|--------|
| auth-service | Publisher | `user_registered`, email notifications |
| url-service | Publisher | `url_created`, `url_clicked` |
| analytics-service | Consumer | All domain events |
| notification-service | Consumer | Email notifications |

See each service's `CLAUDE.md` for implementation details, or `docs/asyncapi.yaml` for the full specification.

## Key Patterns

- All backend services use Express + Prisma ORM
- Services implement graceful shutdown on SIGTERM/SIGINT
- RabbitMQ connections retry up to 30 times (2s intervals)
- Frontend uses Axios interceptor for automatic JWT injection from localStorage
- 401 responses trigger automatic logout and redirect to /login

## Environment Variables

Key variables (set via docker-compose or .env files):
- `DATABASE_URL` - PostgreSQL connection string (per-service database)
- `JWT_SECRET` - Shared JWT signing secret
- `RABBITMQ_URL` - RabbitMQ connection URL
- `SMTP_HOST`, `SMTP_PORT` - Mail server configuration
