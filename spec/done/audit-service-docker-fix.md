# audit-service Docker Compose fix

> **Status:** done
> **Service(s):** audit-service
> **Priority:** low

## Goal

Correct the docker-compose configuration for audit-service so it follows the
established pattern: a dedicated database in the shared PostgreSQL instance rather
than a dedicated Postgres container.

## Background

R10 of `spec/done/audit-service.md` specified a dedicated `audit_db` Postgres container
in docker-compose. This conflicts with the pattern used by every other service
(auth-service, url-service, analytics-service), which all use the shared `db` container
with a per-service database. The Kubernetes manifests for audit-service already use the
shared Postgres correctly (R11 of the same spec), making the two environments
inconsistent.

ADR-003 (`docs/adr/003-shared-postgres-per-service-database.md`) formalises the
shared-Postgres pattern and explicitly supersedes R10. This spec implements the
correction.

## Requirements

- **R1:** Remove the `audit_db` Postgres service from `docker-compose.yml`.
- **R2:** The `audit-service` entry in `docker-compose.yml` shall depend on `db`
  (not `audit_db`) and set `DATABASE_URL` pointing at `db:5432/audit_service`.
- **R3:** Add `CREATE DATABASE audit_service;` to `infra/db/init-db.sql`, consistent
  with the other service databases.
- **R4:** No changes to Kubernetes manifests -- they already follow the correct pattern.
- **R5:** No changes to `audit-service` application code or Prisma schema.

## Acceptance Criteria

- [ ] `docker-compose.yml` contains no `audit_db` service.
- [ ] `audit-service` in `docker-compose.yml` depends on `db` and its `DATABASE_URL`
      points to `db:5432/audit_service`.
- [ ] `infra/db/init-db.sql` creates the `audit_service` database.
- [ ] `docker compose up --build` starts successfully with audit-service connecting to
      the shared `db` container.

## Out of Scope

- Changes to Kubernetes manifests.
- Changes to audit-service application code or Prisma schema.
- Data migration (audit-service has no production data yet).

## Docs to Update

- [ ] `docs/openapi.yaml` -- no endpoint changes; no update needed.
- [ ] `docs/asyncapi.yaml` -- no event changes; no update needed.

## Tasks

### Task 1 -- Fix docker-compose + init-db.sql (R1-R3) [x]

Files: `docker-compose.yml`, `infra/db/init-db.sql`

- Remove the `audit_db` service block from `docker-compose.yml`.
- Update the `audit-service` entry: change `depends_on` from `audit_db` to `db`;
  change `DATABASE_URL` from `audit_db:5432` to `db:5432`.
- Add `CREATE DATABASE audit_service;` to `infra/db/init-db.sql` alongside the other
  `CREATE DATABASE` statements.
