# auth-service Outbox Integration

> **Status:** approved
> **Service(s):** auth-service
> **Priority:** high

## Goal

Guarantee that every auditable action in auth-service is captured without the dual-write
gap. Currently, auth-service commits a user registration to its database and then
publishes an event to RabbitMQ as two separate operations. If the process crashes between
these steps, the audit record is silently lost. This spec closes that gap by making the
outbox write atomic with the business operation.

## Background

The outbox pattern stores a pending audit record in the same database transaction as the
business operation. A background poller then forwards it to the audit-service over HTTP
with retry logic. The audit record is marked processed only after the audit-service
confirms receipt, so no event can be lost regardless of when a crash occurs.

auth-service produces the following auditable events. All are security-relevant and must
appear in the audit trail.

Must-have events (state changes or credential operations):

- `user_registered` -- new account created
- `user_login` -- successful authentication (access log requirement for SOC2/ISO 27001)
- `user_password_changed` -- authenticated in-session credential change via
  POST /users/:id/password
- `user_profile_updated` -- name or email change via PUT /users/:id; email changes are
  high-risk because they redirect future password resets to a new mailbox
- `user_deleted` -- admin-only account deletion; compliance-critical for GDPR data
  lifecycle and any deletion audit requirement
- `password_reset_requested` -- only emitted when the email matches a registered account,
  so it carries no enumeration risk; the reset token value is never included in the payload
- `password_reset_completed` -- reset token consumed and password changed

Should-have event:

- `user_login_failed` -- wrong credentials presented; persisting this enables
  retrospective brute-force analysis beyond what the in-memory loginAttemptStore provides

`user_login`, `user_login_failed`, `user_profile_updated`, and `user_deleted` currently
publish no event at all. The outbox row is an addition alongside the existing (or new)
business logic. For login and login_failed there is no corresponding DB write to wrap in
a transaction -- the outbox row is a standalone insert in those handlers.

The existing RabbitMQ publish path for analytics is left untouched.

## Requirements

### Functional

- **R1:** The auth-service database shall have a new `OutboxEvent` Prisma model with
  fields: `id` (Int, autoincrement), `eventType` (String), `payload` (Json),
  `actorId` (String?), `processed` (Boolean, default false), `processedAt`
  (DateTime?), `createdAt` (DateTime, default now).

- **R2:** The following handlers shall write their business record(s) and a new
  OutboxEvent row atomically. Where a DB write already exists, both writes are wrapped in
  a single `prisma.$transaction` so that a crash between them cannot produce a committed
  business record with no audit row:
  - Registration handler: User create + OutboxEvent
  - Forgot-password handler: PasswordResetToken create + OutboxEvent
  - Reset-password handler: User password update + PasswordResetToken usedAt update +
    OutboxEvent (all three in one transaction)
  - Password-change handler (`POST /users/:id/password`): User password update +
    OutboxEvent
  - Profile-update handler (`PUT /users/:id`): User update + OutboxEvent (only when at
    least one field actually changes; no OutboxEvent if the request is a no-op)
  - User-delete handler (`DELETE /users/:id`): User delete + OutboxEvent

- **R2a:** The following handlers produce an OutboxEvent as a standalone insert (no
  existing DB write to wrap):
  - Login handler: insert OutboxEvent on every successful authentication
  - Login handler: insert OutboxEvent on every failed authentication attempt
    (wrong credentials only — do not fire when the account is already rate-limited)

- **R3:** OutboxEvent payloads per event type:

  | eventType                  | Required payload fields              | Notes                                  |
  | -------------------------- | ------------------------------------ | -------------------------------------- |
  | `user_registered`          | `userId`, `email`, `createdAt`       |                                        |
  | `user_login`               | `userId`, `email`                    |                                        |
  | `user_login_failed`        | `email`                              | userId omitted -- may not exist        |
  | `user_password_changed`    | `userId`                             |                                        |
  | `user_profile_updated`     | `userId`, `changedFields` (string[]) | e.g. `["email"]`; new value not logged |
  | `user_deleted`             | `deletedUserId`, `byUserId`          | actorId = byUserId                     |
  | `password_reset_requested` | `userId`                             |                                        |
  | `password_reset_completed` | `userId`                             |                                        |

  The reset token value and all password values shall never appear in any outbox payload.

- **R4:** A background poller shall start on service boot, run every 5 seconds, and
  fetch up to 100 unprocessed OutboxEvent rows ordered by `createdAt` ascending.

- **R5:** For each unprocessed row, the poller shall POST the event to the audit-service
  internal endpoint. If the request fails or times out (10 s), the row remains
  unprocessed and is retried on the next poll cycle.

- **R6:** The poller shall mark a row `processed = true` and set `processedAt` only
  after receiving a 2xx response from the audit-service.

- **R7:** The audit-service base URL shall be read from the `AUDIT_SERVICE_URL`
  environment variable. If the variable is not set, the poller shall log a warning on
  boot and skip forwarding (rows accumulate in the outbox until the variable is set).

- **R8:** The poller shall stop cleanly on SIGTERM/SIGINT without leaving an in-flight
  request orphaned.

### Non-Functional

- **R9:** The poller shall not block the Express request-handling event loop. It shall
  run as a non-blocking async interval.

- **R10:** The solution shall not introduce new npm packages beyond what is already in
  auth-service (node-fetch or axios is already present; use whichever is there).

- **R11:** Processed outbox rows are not deleted — they serve as a local record.
  A future retention spec may address cleanup.

## Acceptance Criteria

- [ ] Given a successful user registration, an OutboxEvent row with eventType
      `user_registered` and `processed = false` exists after the transaction commits.

- [ ] Given a successful login, an OutboxEvent row with eventType `user_login` exists.

- [ ] Given a login attempt with wrong credentials (account not rate-limited), an
      OutboxEvent row with eventType `user_login_failed` exists. No row is created when
      the account is already locked (rate-limit exceeded).

- [ ] Given a successful password change via POST /users/:id/password, an OutboxEvent
      row with eventType `user_password_changed` exists after the transaction commits.

- [ ] Given a successful profile update that changes at least one field, an OutboxEvent
      row with eventType `user_profile_updated` and a `changedFields` array exists. No
      row is created for no-op profile update requests.

- [ ] Given an admin successfully deletes a user, an OutboxEvent row with eventType
      `user_deleted` containing both `deletedUserId` and `byUserId` exists.

- [ ] Given a successful forgot-password request for a registered email, an OutboxEvent
      row with eventType `password_reset_requested` exists. No row is created when the
      email is not registered.

- [ ] Given a successful password reset, an OutboxEvent row with eventType
      `password_reset_completed` exists.

- [ ] Given the audit-service is reachable, all unprocessed OutboxEvent rows are
      forwarded and marked `processed = true` within one poll cycle.

- [ ] Given the audit-service is unreachable, rows remain `processed = false` and no
      error is thrown that crashes the process.

- [ ] Given a process crash between a transaction commit and the next poll cycle, the
      unprocessed row is picked up and forwarded on the next cycle after restart.

- [ ] Given `AUDIT_SERVICE_URL` is not set, the service boots without error and logs one
      warning.

- [ ] All existing API responses, status codes, and RabbitMQ publish behaviour are
      unchanged.

## Out of Scope

- Cleanup / deletion of processed outbox rows (separate retention spec).
- `user_logout` -- no security consequence; not audit-trail material.
- Encryption or signing of the outbox payload.
- Dead-letter handling for permanently failing audit-service endpoints.
- Forwarding login and login_failed events to RabbitMQ for analytics (analytics-service
  does not currently consume auth events beyond user_registered).

## Docs to Update

- [ ] `docs/openapi.yaml` — no endpoint changes; no update needed.
- [ ] `docs/asyncapi.yaml` — no new events; no update needed.

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->
