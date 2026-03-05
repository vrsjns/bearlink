# ADR-003: Each service uses a dedicated database in the shared PostgreSQL instance

- **Status:** accepted
- **Date:** 2026-03-05
- **Affects:** all backend services
- **Supersedes:** R10 of `spec/done/audit-service.md` (the `audit_db` dedicated Postgres
  container requirement in docker-compose is invalid and replaced by this ADR)

---

## Context

BearLink runs multiple backend services, each requiring its own persistent storage.
The question is how to provide that storage: one PostgreSQL instance with one database
per service, or a separate PostgreSQL instance per service.

All existing services (auth-service, url-service, analytics-service) were built using
a single shared `db` Postgres container in docker-compose, with isolation at the
database level (`auth_service`, `url_service`, `analytics_service`). The Postgres
`init-db.sql` script creates all databases at container startup. Kubernetes uses the
shared `postgres` StatefulSet with the same database-per-service pattern.

When `audit-service` was specced, R10 of `spec/done/audit-service.md` called for
a dedicated `audit_db` Postgres container in docker-compose, deviating from the
established pattern without a stated reason. This was carried into the implementation.
The Kubernetes manifests for audit-service correctly use the shared Postgres (R11 of
the same spec was consistent with the pattern), making docker-compose and k8s
inconsistent with each other.

---

## Decision

All services share a single PostgreSQL instance. Each service has its own database
within that instance. This applies uniformly to docker-compose and Kubernetes.

For docker-compose: the existing `db` container is the single Postgres instance.
New services add their database to `infra/db/init-db.sql` and point `DATABASE_URL`
at `db`.

For Kubernetes: the existing `postgres` StatefulSet is the single Postgres instance.
New services point `DATABASE_URL` at `postgres`.

---

## Alternatives Considered

**A: Dedicated Postgres container per service (what R10 of audit-service.md specified).**

Each service gets its own Postgres container in docker-compose, providing complete
process-level isolation.

Rejected because: the services run in the same Docker network on the same host during
development. Process isolation between Postgres instances provides no meaningful security
or data boundary beyond what separate databases already provide. The cost is significant:
each additional container consumes ~50-100 MB of RAM at idle, requires its own port
mapping, its own volume, and its own startup ordering in docker-compose. For development
and CI this overhead is not justified.

**B: Per-service Postgres in production (Kubernetes), shared in development.**

Use separate Postgres StatefulSets per service in k8s but a shared instance in
docker-compose.

Rejected because: the inconsistency between environments creates a category of bugs
that only appear in production (e.g. connection pool sizing, cross-database query
attempts, credential scope). The environments should be as similar as feasible.

---

## Consequences

**Accepted tradeoffs:**

- A failure in the shared Postgres instance affects all services simultaneously.
  With per-service instances, a Postgres failure is isolated to one service.
  This tradeoff is accepted for a development/small-production context where operating
  multiple Postgres instances adds more operational risk than it mitigates.
- A misconfigured migration in one service's database could in theory affect shared
  Postgres resources (connection limits, disk). Accepted -- each service uses its own
  database and credentials, limiting the blast radius.

**What becomes better:**

- docker-compose and Kubernetes use the same topology. Behaviour is consistent across
  environments.
- Resource usage in development is lower: one Postgres process instead of N.
- Adding a new service requires one line in `init-db.sql` and a `DATABASE_URL` env var,
  not a new container definition.
- All databases are visible in a single `psql` session for debugging.
