# Password Reset (Forgot Password)

> **Status:** done
> **Service(s):** auth-service, analytics-service, web-ui
> **Priority:** high

## Goal

Users who forget their password have no way to recover access to their account. The
web-ui already has a forgot-password form and a reset-password form, but the auth-service
exposes no endpoints to support them. This spec adds the missing backend and wires the
two forms to it so that account recovery works end-to-end.

## Background

Current state:

- `web-ui/src/app/forgot-password/page.tsx` — form that POSTs the user's email to
  `POST /forgot-password` on the auth-service.
- `web-ui/src/app/reset-password/[token]/page.tsx` — form that POSTs a new password
  to `POST /reset-password/:token` on the auth-service.
- `web-ui/src/services/api/auth.ts` exports `forgotPassword(email)` and
  `resetPassword(token, password)` which call the above endpoints.
- The auth-service has no `/forgot-password` or `/reset-password` routes; both calls
  return 404 today.
- The auth-service Prisma schema has no model for storing reset tokens.
- Password emails are already delivered by the notification-service via the
  `email_notifications` RabbitMQ queue.
- The analytics-service consumes all domain events from the `events` queue via a
  `SCHEMAS` whitelist in `analytics-service/services/event.service.js`. Events with
  unknown types are silently discarded.

## Requirements

### Functional

- **R1:** The auth-service shall expose `POST /forgot-password` that accepts `{ email }`.
  If the email matches a registered account, the service shall generate a cryptographically
  random, URL-safe token, persist it with an expiry of 1 hour, publish an
  `email_notifications` message containing the reset link, and publish a
  `password_reset_requested` domain event to the `events` queue. The endpoint shall
  always return 200 with a generic success message regardless of whether the email exists.

- **R2:** The auth-service shall expose `POST /reset-password/:token` that accepts
  `{ password }`. The service shall look up the token, verify it has not expired and
  has not been used, update the user's password (bcrypt-hashed), mark the token as
  used, publish a `password_reset_completed` domain event to the `events` queue, and
  return 200. If the token is invalid, expired, or already used, the service shall
  return 400.

- **R3:** The new password supplied to `POST /reset-password/:token` shall pass the
  same strength validation used during registration (`isValidPassword`): at least 8
  characters, containing uppercase, lowercase, and a number.

- **R4:** The auth-service database schema shall gain a `PasswordResetToken` model with
  fields: `id`, `token` (unique), `userId` (FK to `User`), `expiresAt`, `usedAt`
  (nullable). A Prisma migration shall be created.

- **R5:** Both new endpoints shall be exempt from CSRF validation (the requesting user
  is unauthenticated and has no session cookie).

- **R6:** The reset email shall contain a link to the web-ui reset-password page in the
  form `<FRONTEND_URL>/reset-password/<token>`. The base URL shall be read from the
  `FRONTEND_URL` environment variable.

- **R7:** The web-ui reset-password page shall display a user-visible error message when
  the token is invalid or expired instead of silently swallowing the error.

- **R8:** The web-ui reset-password page shall use shadcn/ui components consistently
  with the rest of the UI (Card, Input, Button, Label), replacing the raw HTML elements
  currently in the form.

- **R9:** The analytics-service `SCHEMAS` whitelist shall be extended to recognise
  `password_reset_requested` (required field: `userId`) and `password_reset_completed`
  (required field: `userId`) so that both events are persisted rather than discarded.

### Non-Functional

- **R10:** Tokens shall be generated with Node.js `crypto.randomBytes(32)` encoded as
  hex, giving 256 bits of entropy.
- **R11:** The `POST /forgot-password` endpoint shall be covered by the existing
  `authLimiter` rate limiter to prevent email flooding.
- **R12:** No new external dependencies shall be introduced in the auth-service (token
  generation uses the built-in `crypto` module; email delivery reuses the existing
  `email_notifications` queue; domain events reuse the existing `publishEvent` helper).

## Acceptance Criteria

- [x] Given a registered email, `POST /forgot-password` returns 200 with a generic
      message, publishes one `email_notifications` message containing a reset link, and
      publishes one `password_reset_requested` event to the `events` queue.
- [x] Given an unregistered email, `POST /forgot-password` returns 200 with the same
      generic message and publishes no email and no domain event.
- [x] Given a valid, unexpired, unused token, `POST /reset-password/:token` with a
      valid new password returns 200, the user can log in with the new password, and a
      `password_reset_completed` event is published to the `events` queue.
- [x] Given a valid token, `POST /reset-password/:token` with a password that fails
      strength validation returns 400.
- [x] Given an expired token, `POST /reset-password/:token` returns 400.
- [x] Given an already-used token, `POST /reset-password/:token` returns 400.
- [x] Given an unknown token, `POST /reset-password/:token` returns 400.
- [x] After a successful password reset the token's `usedAt` field is set in the
      database.
- [x] `POST /forgot-password` without a body or with a malformed email returns 400.
- [x] The reset-password page in the web-ui shows an error message when the backend
      returns 400.
- [x] The reset-password page in the web-ui shows an error message when the two
      password fields do not match, and does not submit the request to the backend.
- [x] The analytics-service stores `password_reset_requested` and
      `password_reset_completed` events; it does not log a "Unknown event type" warning
      for either.
- [x] Existing login, register, and logout behaviour is unchanged.

## Out of Scope

- OAuth / SSO password recovery
- Magic-link (passwordless) login
- Admin-initiated password resets
- Cleanup / expiry job for stale `PasswordResetToken` rows
- Two-factor authentication
- Rate limiting per-IP (only per-endpoint via `authLimiter`)

## Docs to Update

- [x] `docs/openapi.yaml` — add `POST /forgot-password` and `POST /reset-password/{token}`
      under the `auth` tag
- [x] `docs/asyncapi.yaml` — add `PasswordResetRequested` and `PasswordResetCompleted`
      messages to the `events` channel; add their schemas and payloads to `components`
- [x] `auth-service/CLAUDE.md` — document the two new endpoints and the new
      `PasswordResetToken` model
- [x] `analytics-service/CLAUDE.md` — add `password_reset_requested` and
      `password_reset_completed` to the Events Consumed table

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->

### T1 -- Add PasswordResetToken model and migration (R4)

In `auth-service/prisma/schema.prisma`, add:

```
model PasswordResetToken {
  id        Int       @id @default(autoincrement())
  token     String    @unique
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

Add `resetTokens PasswordResetToken[]` to the `User` model. Run
`npx prisma migrate dev --name add_password_reset_token` to generate and apply the
migration. Regenerate the Prisma client.

### T2 -- Add FRONTEND_URL env var (R6)

Add `FRONTEND_URL` to `auth-service` in `docker-compose.yml` (value:
`http://localhost:3000` for local dev). Document the variable in the root `CLAUDE.md`
environment variables table.

### T3 -- Add password_reset event types to shared constants (R1, R2)

In `shared/events/constants.js`, add to `EVENT_TYPES`:

```javascript
PASSWORD_RESET_REQUESTED: 'password_reset_requested',
PASSWORD_RESET_COMPLETED: 'password_reset_completed',
```

### T4 -- Implement POST /forgot-password (R1, R5, R10, R11, R12)

Create `auth-service/services/passwordReset.service.js` exporting:

- `generateResetToken()` -- returns `crypto.randomBytes(32).toString('hex')`
- `buildResetLink(token)` -- returns `${process.env.FRONTEND_URL}/reset-password/${token}`

In `auth-service/controllers/auth.controller.js`, add a `forgotPassword` handler:

1. Validate that `email` is present; return 400 if missing.
2. Look up the user by email with `prisma.user.findUnique`.
3. If the user exists: generate a token, store a `PasswordResetToken` row
   (`expiresAt = now + 1h`), publish an `email_notifications` message with the reset
   link, and publish a `password_reset_requested` event (`{ userId: user.id }`).
4. Always return `200 { message: 'If that email is registered you will receive a
reset link shortly.' }`.

Register `router.post('/forgot-password', authLimiter, controller.forgotPassword)` in
`auth-service/routes/auth.routes.js`. Exempt the route from CSRF middleware (it must
be added before the CSRF middleware is applied, or whitelisted within it).

### T5 -- Implement POST /reset-password/:token (R2, R3, R5)

In `auth-service/controllers/auth.controller.js`, add a `resetPassword` handler:

1. Validate that `password` is present and passes `isValidPassword`; return 400 if not.
2. Look up the `PasswordResetToken` by `token` (include the related `user`).
3. If not found, expired (`expiresAt < now`), or already used (`usedAt != null`),
   return `400 { error: 'Invalid or expired reset token.' }`.
4. Hash the new password with bcrypt and update `prisma.user.update`.
5. Set `usedAt = now` on the token with `prisma.passwordResetToken.update`.
6. Publish a `password_reset_completed` event (`{ userId: token.userId }`).
7. Return `200 { message: 'Password reset successful.' }`.

Register `router.post('/reset-password/:token', controller.resetPassword)` in
`auth-service/routes/auth.routes.js` before the CSRF middleware.

### T6 -- Register new event types in analytics-service (R9)

In `analytics-service/services/event.service.js`, extend `SCHEMAS`:

```javascript
password_reset_requested: ['userId'],
password_reset_completed: ['userId'],
```

### T7 -- Write tests for new endpoints (R1, R2, R3, R9)

In `auth-service/test/auth.routes.test.ts`, add test cases covering all acceptance
criteria: valid flow (verifying both email and domain event are published), unregistered
email (verifying neither is published), expired token, used token, unknown token,
password validation failure. Use the existing mock patterns for Prisma and RabbitMQ.

### T8 -- Fix error handling in reset-password web-ui page (R7, R8)

In `web-ui/src/app/reset-password/[token]/page.tsx`:

1. Replace raw `<form>`, `<input>`, `<label>`, and `<button>` elements with shadcn/ui
   `Card`, `CardHeader`, `CardContent`, `Input`, `Label`, and `Button`.
2. Add an `error` state variable; populate it in the `catch` block of `handleSubmit`
   with a user-readable message.
3. Render the error using a shadcn/ui `Alert` (destructive variant) below the form,
   similar to the pattern used on the login page.
4. Remove the unused `axios` import (the page already uses `resetPassword` from
   `@/services/api/auth`).

### T9 -- Update AsyncAPI and OpenAPI docs (Docs to Update)

In `docs/asyncapi.yaml`:

- Add `PasswordResetRequested` and `PasswordResetCompleted` to the `oneOf` lists in the
  `events` channel `publish` and `subscribe` operations.
- Add both as message definitions under `components/messages`, each referencing a new
  schema.
- Add `PasswordResetRequestedEvent` and `PasswordResetCompletedEvent` schemas under
  `components/schemas`. Each wraps a payload with a single required field `userId`
  (integer).

In `docs/openapi.yaml`, under the `auth` tag add:

- `POST /forgot-password` with request body `{ email: string }` and response
  `200 { message: string }`.
- `POST /reset-password/{token}` with path parameter `token`, request body
  `{ password: string }`, responses `200 { message: string }` and `400 { error: string }`.
