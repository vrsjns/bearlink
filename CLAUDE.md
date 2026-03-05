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

Preview service (Python):

```bash
cd preview-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
pytest                      # Run tests
```

### Kubernetes (k3s)

```bash
kubectl kustomize k8s/                    # Preview rendered manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -k k8s/                     # Apply all manifests via Kustomize
kubectl get pods -n bearlink
```

## Architecture

### Services

| Service              | Port | Database          | Purpose                                               |
| -------------------- | ---- | ----------------- | ----------------------------------------------------- |
| auth-service         | 4000 | auth_service      | User registration, login, JWT authentication          |
| url-service          | 5000 | url_service       | URL shortening, redirection, click tracking           |
| analytics-service    | 6000 | analytics_service | Authenticated event storage, aggregation, and query   |
| notification-service | 7000 | -                 | Email delivery via SMTP                               |
| preview-service      | 8000 | -                 | Link metadata scraping (Python/FastAPI/BeautifulSoup) |
| web-ui               | 3000 | -                 | Next.js frontend                                      |

Supporting infrastructure: PostgreSQL (5432), RabbitMQ (5672/15672), MailHog (1025/8025)

### Message Queues (RabbitMQ)

- `events` - Domain events (user_registered, url_created, url_updated, url_deleted, url_clicked)
- `email_notifications` - Email delivery payloads
- `preview_jobs` - url-service → preview-service (trigger async metadata scrape)
- `preview_results` - preview-service → url-service (scraped metadata result)

### Shared Code (`/shared`)

- `utils/logger.js` - Winston logger (console + file)
- `utils/rabbitmq.js` - RabbitMQ connection with retry logic
- `middlewares/auth.js` - JWT authentication (`authenticateJWT`, `isAdmin`, `isSelfOrAdmin`)
- `events/` - Event publishing and consuming helpers (see below)

### Event-Driven Communication

Services communicate via RabbitMQ using the shared events module (`shared/events/`).

| Service              | Role      | Events                                                                                            |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| auth-service         | Publisher | `user_registered`, email notifications                                                            |
| url-service          | Publisher | `url_created`, `url_updated`, `url_deleted`, `url_clicked`, `preview_jobs`                        |
| url-service          | Consumer  | `preview_results`                                                                                 |
| analytics-service    | Consumer  | All domain events (`user_registered`, `url_created`, `url_updated`, `url_deleted`, `url_clicked`) |
| notification-service | Consumer  | Email notifications                                                                               |
| preview-service      | Consumer  | `preview_jobs`                                                                                    |
| preview-service      | Publisher | `preview_results`                                                                                 |

See each service's `CLAUDE.md` for implementation details.

### API Documentation

- **REST API:** `docs/openapi.yaml` - OpenAPI 3.0 specification for all service endpoints
- **Async Events:** `docs/asyncapi.yaml` - AsyncAPI specification for RabbitMQ events

### Kubernetes Manifests (`k8s/`)

Production manifests for k3s deployment. All resources live in the `bearlink` namespace.

- `k8s/kustomization.yaml` — Kustomize overlay; maps short image names to `ghcr.io/vrsjns/*`
- `k8s/namespace.yaml` + `k8s/secrets.yaml` — applied before Kustomize (secrets use placeholder values replaced at deploy time via Ansible Vault)
- Apply: `kubectl apply -f k8s/namespace.yaml && kubectl apply -k k8s/`
- Cluster provisioning: see [bearlink-infra](https://github.com/vrsjns/bearlink-infra) (Terraform + Ansible)

## Spec-Driven Development

BearLink uses a spec-driven workflow. Feature specs live in `spec/` and are the source
of truth for planned and active work.

- `spec/_workflow.md` — how the workflow operates end-to-end
- `spec/_template.md` — copy this to create a new spec
- `spec/*.md` — one file per feature or epic

### Spec lifecycle

| Stage         | Where it lives                                                                             |
| ------------- | ------------------------------------------------------------------------------------------ |
| `draft`       | Branch + open PR — being written and discussed                                             |
| `approved`    | Merged to master — ready to implement                                                      |
| `in-progress` | Spec on master with status updated, implementation on a `feat/` branch                     |
| `done`        | Spec moved to `spec/done/` on the `feat/` branch, merged to master with the implementation |

**Rules:**

- Never merge a spec while it is still `draft` — only merge after status is updated to `approved`
- Never implement directly on master — always use a `feat/` branch
- When implementation is complete, update spec status to `done` and move it to `spec/done/` as part of the same PR

**Common prompts:**

- "Help me write a spec for [feature]"
- "Generate tasks for spec/my-feature.md"
- "Implement task N from spec/my-feature.md"
- "Update docs for spec/my-feature.md"

**Definition of done:** all acceptance criteria pass, `docs/openapi.yaml` and/or `docs/asyncapi.yaml` are updated to reflect new or changed endpoints and events, and the spec status is set to `done`.

## Architecture Decision Records

Significant architectural choices are documented as ADRs in `docs/adr/`.

- `docs/adr/README.md` — what ADRs are, when to write one, the format, the lifecycle
- `docs/adr/_template.md` — copy this to create a new ADR
- `docs/adr/NNN-title.md` — one file per decision, numbered sequentially

**When to write an ADR (before or alongside the spec):**

- A spec introduces a new service, splits an existing one, or adds new infrastructure
- A spec establishes a pattern other services will follow
- Two or more meaningfully different implementation approaches were evaluated
- The chosen approach has tradeoffs that would surprise a future engineer

**When not to write an ADR:** single-service features, implementation details,
configuration choices, anything easily reversible without cross-service impact.

**Rule:** check `docs/adr/` before recommending an architectural approach — the
decision may already be documented. If proposing something that contradicts an existing
ADR, flag it explicitly rather than silently overriding it.

**Common prompts:**

- "Help me write an ADR for [decision]"
- "Does this spec need an ADR?"
- "Review docs/adr/NNN-title.md for gaps"

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
- `REDIS_URL` - Redis connection string (url-service only, optional)
- `FRONTEND_URL` - Base URL of the web-ui, used to build password reset links (auth-service only, e.g. `http://localhost:3000`)
- `SAFE_BROWSING_API_KEY` - Google Safe Browsing API v4 key (url-service only, optional)
- `DOMAIN_BLOCKLIST` / `DOMAIN_ALLOWLIST` - Comma-separated domain filter lists (url-service only, optional)
- `URL_SIGNING_SECRET` - HMAC secret for signed short URLs (url-service only, optional)
- `EVENT_RETENTION_DAYS` - Days to retain analytics events before cleanup (analytics-service only, default 90, optional)
