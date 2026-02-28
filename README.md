# BearLink

A URL shortening platform built as a Node.js/TypeScript microservices monorepo. Create short links, track clicks in real time, and receive email notifications — all backed by an event-driven architecture.

## Architecture

```
                        ┌─────────────┐
                        │   web-ui    │  :3000  (Next.js)
                        └──────┬──────┘
                               │ REST
           ┌───────────────────┼───────────────────┬──────────────────┐
           ▼                   ▼                   ▼                  ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  ┌─────────────────┐
   │ auth-service │   │  url-service │   │analytics-service │  │ preview-service │
   │    :4000     │   │    :5000     │   │      :6000       │  │     :8000       │
   └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘  └────────┬────────┘
          │                  │                    │                     │
          │        RabbitMQ (events / email_notifications / preview)    │
          └──────────────────┼────────────────────┴─────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
             ┌──────┴──────┐  ┌───────┴──────────┐
             │  analytics  │  │notification-svc  │
             │  -service   │  │      :7000       │
             │  (consumer) │  │    (consumer)    │
             └─────────────┘  └──────────────────┘
```

| Service              | Port | Database          | Role                                      |
|----------------------|------|-------------------|-------------------------------------------|
| auth-service         | 4000 | auth_service      | Registration, login, JWT, user management |
| url-service          | 5000 | url_service       | URL shortening, redirection, click counts |
| analytics-service    | 6000 | analytics_service | Event log storage and retrieval           |
| notification-service | 7000 | —                 | Email delivery via SMTP                   |
| preview-service      | 8000 | —                 | Link metadata scraping (Python/FastAPI)   |
| web-ui               | 3000 | —                 | Next.js frontend                          |

Supporting infrastructure: PostgreSQL, RabbitMQ, MailHog (dev email), Loki + Promtail + Grafana (observability).

## Quick Start

The easiest way to run everything is with Docker Compose:

```bash
docker compose up --build
```

Once running:

| URL                        | What                          |
|----------------------------|-------------------------------|
| http://localhost:3000      | Web UI                        |
| http://localhost:15672     | RabbitMQ management (guest/guest) |
| http://localhost:8025      | MailHog — captured emails     |
| http://localhost:3001      | Grafana dashboards (admin/admin) |

To stop:

```bash
docker compose down
```

## Services

### auth-service (port 4000)

Handles user accounts and authentication.

- `POST /register` — create account
- `POST /login` — returns JWT
- `GET /profile` — current user
- `GET /users` — list all users (admin)
- `PUT /users/:id` — update profile
- `DELETE /users/:id` — delete user (admin)
- `POST /users/:id/password` — change password

### url-service (port 5000)

Creates and resolves short links.

**URL management (authenticated):**
- `POST /urls` — shorten a URL; supports custom alias, expiry, password, tags, UTM params, signed URLs
- `GET /urls` — list your links (paginated; filter by tag, search, expired)
- `POST /urls/bulk` — create up to 50 links in one request (partial-success)
- `PUT /urls/:id` — update a link
- `DELETE /urls/:id` — delete a link
- `POST /urls/:id/sign` — generate a time-limited HMAC-signed URL

**Public redirect:**
- `GET /:shortId` — redirect to original URL (301/302); supports `?preview=1` for bounce page
- `GET /:shortId/qr` — return a PNG QR code for the short link
- `POST /:shortId/unlock` — submit password for a password-protected link

Clicks are deduplicated per IP per hour via Redis. Bots (detected by User-Agent) are redirected but not counted.

### analytics-service (port 6000)

Stores every domain event consumed from RabbitMQ.

- `GET /events` — list all events

Events stored: `user_registered`, `url_created`, `url_updated`, `url_deleted`, `url_clicked`.

### notification-service (port 7000)

No public REST API. Consumes the `email_notifications` queue and sends emails via SMTP. In development, MailHog captures all outgoing mail at http://localhost:8025.

### preview-service (port 8000)

Python/FastAPI service that scrapes link metadata asynchronously via RabbitMQ.

- `GET /health` — health check
- `GET /preview?url=<url>` — fetch cached metadata for a URL

When url-service creates a short link it publishes a `preview_requested` event. preview-service scrapes the target URL (title, description, OG image) using BeautifulSoup and publishes a `preview_ready` event with the result.

### web-ui (port 3000)

Next.js 14 frontend. Pages: login, register, dashboard (URL management), profile, password reset.

## Event-Driven Communication

Services communicate asynchronously via RabbitMQ:

| Queue                 | Publisher(s)              | Consumer(s)          | Purpose                        |
|-----------------------|---------------------------|----------------------|--------------------------------|
| `events`              | auth-service, url-service | analytics-service    | Domain events for audit log    |
| `email_notifications` | auth-service              | notification-service | Email delivery payloads        |
| `preview_jobs`        | url-service               | preview-service      | Async metadata scrape trigger  |
| `preview_results`     | preview-service           | url-service          | Scraped metadata result        |

RabbitMQ connections retry up to 30 times (2 s intervals) before giving up. See `docs/asyncapi.yaml` for full event schemas.

## Tech Stack

**Backend services**
- Node.js + Express
- Prisma ORM (PostgreSQL)
- RabbitMQ via `amqplib`
- JSON Web Tokens (`jsonwebtoken`)
- Winston structured logging
- Vitest + Supertest for testing

**preview-service**
- Python 3.11 + FastAPI
- BeautifulSoup4 for HTML scraping
- aio-pika for async RabbitMQ integration
- pytest for testing

**Frontend**
- Next.js 14 (App Router) + React 18
- TypeScript + Tailwind CSS
- Axios with JWT interceptor

**Infrastructure**
- PostgreSQL (single instance, 3 databases)
- RabbitMQ 3 with management UI
- Redis 7 (URL caching, click deduplication)
- MailHog for development email
- Loki + Promtail + Grafana for log aggregation and dashboards

**Deployment**
- Kubernetes manifests in `k8s/` — 27 YAML files for k3s
- Kustomize overlay for image registry configuration
- See [bearlink-infra](https://github.com/vrsjns/bearlink-infra) for Terraform + Ansible cluster provisioning

## Local Development (without Docker)

Prerequisites: Node.js 18+, a running PostgreSQL instance, a running RabbitMQ instance.

```bash
# Install all workspace dependencies
npm run bootstrap

# Run database migrations for each service
cd auth-service && npx prisma migrate dev
cd ../url-service && npx prisma migrate dev
cd ../analytics-service && npx prisma migrate dev

# Start all services
npm run start
```

### Frontend only

```bash
cd web-ui
npm run dev    # http://localhost:3000
```

### Individual service

```bash
cd auth-service        # or url-service, analytics-service, notification-service
npm run start          # nodemon with auto-reload
npm run test           # run tests
```

## Environment Variables

Each service reads its own set of variables. The Docker Compose file injects all of them automatically; for local development, create a `.env` file in each service directory.

| Variable                          | Services                   | Example value                                           |
|-----------------------------------|----------------------------|---------------------------------------------------------|
| `DATABASE_URL`                    | auth, url, analytics       | `postgresql://postgres:password@localhost:5432/auth_service` |
| `JWT_SECRET`                      | auth, url, analytics       | `change_me_in_production`                               |
| `RABBITMQ_URL`                    | all backend services       | `amqp://localhost`                                      |
| `SMTP_HOST`                       | notification-service       | `localhost`                                             |
| `SMTP_PORT`                       | notification-service       | `1025`                                                  |
| `EMAIL_USER`                      | notification-service       | `notification@bear.link`                                |
| `EMAIL_PASS`                      | notification-service       | `secret`                                                |
| `REDIS_URL`                       | url-service                | `redis://localhost:6379`                                |
| `SAFE_BROWSING_API_KEY`           | url-service (optional)     | Google Safe Browsing API v4 key                         |
| `DOMAIN_BLOCKLIST`                | url-service (optional)     | `evil.com,bad.org` (comma-separated)                    |
| `DOMAIN_ALLOWLIST`                | url-service (optional)     | `example.com,trusted.org` (comma-separated)             |
| `URL_SIGNING_SECRET`              | url-service (optional)     | `openssl rand -hex 32`                                  |
| `NEXT_PUBLIC_AUTH_SERVICE_URL`    | web-ui                     | `http://localhost:4000`                                 |
| `NEXT_PUBLIC_URL_SERVICE_URL`     | web-ui                     | `http://localhost:5000`                                 |
| `NEXT_PUBLIC_ANALYTICS_SERVICE_URL` | web-ui                   | `http://localhost:6000`                                 |
| `LOG_FORMAT`                      | all backend services       | `text` (dev) / `json` (prod)                            |
| `LOG_LEVEL`                       | all backend services       | `info`                                                  |

## Testing

```bash
# All workspaces
npm run test

# With coverage
npm run test:coverage

# Single service
cd url-service && npm run test
```

Tests use Vitest, Supertest (routes), and Testing Library + MSW (web-ui).

## API Documentation

- **REST:** [`docs/openapi.yaml`](docs/openapi.yaml) — OpenAPI 3.0 specification for all service endpoints
- **Async:** [`docs/asyncapi.yaml`](docs/asyncapi.yaml) — AsyncAPI 2.6 specification for RabbitMQ events

## Planned Work

Feature specs live in [`spec/`](spec/). Each file describes what shall be built and why,
and is used to generate implementation tasks. See [`spec/_workflow.md`](spec/_workflow.md)
for how the spec-driven development process works.

## Observability

The Docker Compose stack includes a pre-configured observability pipeline:

- **Promtail** collects container logs and ships them to Loki
- **Loki** stores and indexes log lines
- **Grafana** at http://localhost:3001 (admin/admin) has Loki pre-wired as a datasource

All backend services emit structured JSON logs with `correlationId`, `serviceName`, and `userId` fields for easy filtering.

## Project Structure

```
bearlink/
├── auth-service/          # Authentication & user management
├── url-service/           # URL shortening & redirection
├── analytics-service/     # Event log
├── notification-service/  # Email delivery
├── preview-service/       # Link metadata scraping (Python/FastAPI)
├── web-ui/                # Next.js frontend
├── shared/                # Shared utilities, middleware, event helpers
├── infra/                 # Docker infrastructure configs (Loki, Grafana, DB init)
├── k8s/                   # Kubernetes manifests for k3s deployment
├── docs/                  # OpenAPI and AsyncAPI specs
├── spec/                  # Feature specs (source of truth for planned work)
├── docker-compose.yml
└── lerna.json
```
