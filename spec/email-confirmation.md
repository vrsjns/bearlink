# Email Confirmation

> **Status:** approved
> **Service(s):** auth-service, web-ui
> **Priority:** medium

## Goal

New user accounts are currently active immediately after registration with no
verification that the provided email address is valid or belongs to the
registrant. Adding email confirmation blocks login until the address is
verified, prevents account enumeration via throwaway addresses, and ensures
notification emails reach a real inbox.

## Background

The auth-service already has a time-limited, single-use token pattern for
password reset (`PasswordResetToken` model, `passwordReset.service.js`). Email
confirmation reuses the same pattern: generate a token on registration, store
it in the database, email a link, consume the token on click.

Email delivery uses the existing `email_notifications` RabbitMQ queue consumed
by notification-service. No new infrastructure is required.

The web-ui needs a confirmation page to call the verify endpoint and show the
result, plus messaging after registration that prompts the user to check their
inbox.

## Requirements

### Functional

- **R1:** The `User` model shall gain a boolean field `emailVerified`
  (default `false`). Existing users (created before migration) shall have
  `emailVerified` set to `true` via a migration default so they are not
  locked out.
- **R2:** On successful `POST /register`, the auth-service shall create an
  `EmailVerificationToken` record (64-char hex, 24-hour expiry) and publish
  an email notification containing a verification link
  (`{FRONTEND_URL}/verify-email?token={token}`).
- **R3:** `POST /login` shall reject users whose `emailVerified` is `false`
  with HTTP 403 and a message directing them to check their inbox. The
  response body shall include `{ "error": "email_not_verified" }` so the
  frontend can show a resend option.
- **R4:** A new endpoint `POST /verify-email` shall accept `{ token }` in the
  request body, mark the user's `emailVerified = true`, and invalidate the
  token by setting its `usedAt`. It shall return 200 on success, 400 for an
  invalid or already-used token, and 410 for an expired token.
- **R5:** A new endpoint `POST /resend-verification` shall accept `{ email }`
  in the request body. If the email belongs to an unverified account, it shall
  invalidate any existing unused tokens for that user, create a new token, and
  send a new verification email. It shall always return 200 (no user
  enumeration). Rate limiting shall apply: no more than 3 resend requests per
  email address per hour, tracked in Redis (`resend_verification:{email}` with
  a 1-hour TTL using `INCR` / `EXPIRE`). When `REDIS_URL` is unset, fall back
  to an in-memory counter with the same interface (consistent with the
  redis-login-attempt-store pattern).
- **R6:** `EmailVerificationToken` shall follow the same schema as
  `PasswordResetToken`: `id`, `token` (unique), `userId` (FK, cascade delete),
  `expiresAt`, `usedAt`, `createdAt`.
- **R7:** The auth-service shall write `OutboxEvent` rows for
  `email_verification_sent` (on registration and resend) and
  `email_verified` (on successful verification), following the existing outbox
  pattern.

### Non-Functional

- **R8:** `POST /resend-verification` shall not reveal whether the email
  exists in the system (always 200).
- **R9:** Token generation shall use `crypto.randomBytes(32).toString('hex')`
  (same as password reset).
- **R10:** The verification endpoint shall be callable without authentication.
- **R11:** When `REDIS_URL` is set, the resend rate limiter shall use the
  Redis client (ioredis) already introduced by the redis-login-attempt-store
  spec. No new npm packages are required.
- **R12:** Redis keys for the resend limiter shall use the prefix
  `resend_verification:` to avoid collisions with other keys.

## Acceptance Criteria

- [ ] Given a new registration, when the user checks their inbox, then they
      receive an email containing a `/verify-email?token=...` link.
- [ ] Given an unverified user, when they attempt `POST /login`, then the
      response is HTTP 403 with `{ "error": "email_not_verified" }`.
- [ ] Given a valid, unused, unexpired token, when `POST /verify-email` is
      called, then the user's `emailVerified` becomes `true` and subsequent
      login succeeds.
- [ ] Given an expired token, when `POST /verify-email` is called, then the
      response is HTTP 410.
- [ ] Given an already-used token, when `POST /verify-email` is called, then
      the response is HTTP 400.
- [ ] Given `POST /resend-verification` with a valid unverified email, then a
      new email is sent and the old token is invalidated.
- [ ] Given `POST /resend-verification` with an unknown email, then the
      response is still HTTP 200 and no email is sent.
- [ ] Given more than 3 resend requests for the same email within an hour,
      then subsequent requests return HTTP 429.
- [ ] With `REDIS_URL` set, the resend counter is visible in Redis as
      `resend_verification:{email}` with a TTL close to 3600 seconds.
- [ ] With `REDIS_URL` unset, the service starts normally and the in-memory
      fallback enforces the same limit.
- [ ] Given a user registered before the migration, then `emailVerified` is
      `true` and login is unaffected.
- [ ] `email_verification_sent` and `email_verified` OutboxEvent rows are
      created for auditable actions.

## Out of Scope

- Email address change / re-verification after profile update
- Admin bypass or manual verification via API
- OAuth / social login email verification
- SMS or alternative verification channels
- Verification status visible on the user profile endpoint

## Docs to Update

- [ ] `docs/openapi.yaml` — add `POST /verify-email` and
      `POST /resend-verification` endpoints; document 403 on `POST /login` for
      unverified users
- [ ] `docs/asyncapi.yaml` — add `email_verification_sent` and
      `email_verified` events
- [ ] `auth-service/CLAUDE.md` — document new endpoints, new model, new
      OutboxEvent types

## Tasks

<!-- Generated by Claude from the requirements above. Do not write these manually. -->

### Task 1 -- Prisma schema + migration (R1, R6) [ ]

Files: `auth-service/prisma/schema.prisma`,
`auth-service/prisma/migrations/`

- Add field `emailVerified Boolean @default(false)` to the `User` model.
- Add `verificationTokens EmailVerificationToken[]` relation to `User`.
- Add new model `EmailVerificationToken` with fields: `id` (Int autoincrement
  PK), `token` (String @unique), `userId` (Int, FK to User onDelete: Cascade),
  `expiresAt` (DateTime), `usedAt` (DateTime?), `createdAt` (DateTime
  @default(now)).
- Create a migration file under `auth-service/prisma/migrations/`. The
  migration SQL must set `emailVerified = true` for all pre-existing rows
  (e.g. `UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" =
false;`) after the column is added so existing users are not locked out.

### Task 2 -- emailVerification service + resend rate limiter (R5, R9, R11, R12) [ ]

Files: `auth-service/services/emailVerification.service.js` (new),
`auth-service/services/resendRateLimiter.js` (new)

- `emailVerification.service.js`:
  - Export `generateVerificationToken()`: returns
    `crypto.randomBytes(32).toString('hex')`.
  - Export `createVerificationToken(prisma, userId)`: sets `usedAt` on all
    existing unused tokens for that user (`updateMany` where `userId` matches
    and `usedAt` is null), then creates a new `EmailVerificationToken` with a
    24-hour `expiresAt`. Returns the token string.
  - Export `buildVerificationLink(token, frontendUrl)`: returns
    `${frontendUrl}/verify-email?token=${token}`.
- `resendRateLimiter.js`:
  - Export `createResendRateLimiter(redisClient)` factory. `redisClient` may
    be null/undefined (in-memory fallback).
  - Redis branch: on `checkAndIncrement(email)`, call `INCR
resend_verification:{email}`; if the result is 1 (first hit), call
    `EXPIRE resend_verification:{email} 3600`. Return the current count.
  - In-memory fallback: maintain a `Map` keyed by email holding
    `{ count, expiresAt }`. On each call reset the entry if `expiresAt` is
    past, increment `count`, and return it.
  - Both branches expose the same interface:
    `{ checkAndIncrement(email): Promise<number> }`.

### Task 3 -- Auth controller + routes (R2, R3, R4, R5, R7, R8, R10) [ ]

Files: `auth-service/controllers/auth.controller.js`,
`auth-service/routes/auth.routes.js`,
`auth-service/app.js`,
`auth-service/index.js`

- `register` handler: after the existing `prisma.$transaction` that creates
  the user and OutboxEvent, call `createVerificationToken(prisma, user.id)`,
  then `buildVerificationLink(token, process.env.FRONTEND_URL)`, then
  `eventPublisher.publishEmailNotification({ to: email, subject: 'Confirm
your BearLink email', text: ... })`. Add a second OutboxEvent insert
  (standalone, outside the transaction) with `eventType:
'email_verification_sent'` and `payload: { userId: user.id }`.
- `login` handler: after the user is fetched and password is verified, check
  `user.emailVerified`. If false, return 403 with
  `{ error: 'email_not_verified' }` before issuing the JWT. No OutboxEvent
  for this rejection.
- New `verifyEmail` handler (no auth middleware):
  - Accept `{ token }` from request body.
  - Look up `EmailVerificationToken` where `token` matches. If not found or
    `usedAt` is not null, return 400.
  - If `expiresAt` is in the past, return 410.
  - Wrap in `prisma.$transaction`: set `user.emailVerified = true` and set
    `emailVerificationToken.usedAt = new Date()` atomically.
  - Insert standalone OutboxEvent `{ eventType: 'email_verified', payload: {
userId } }`.
  - Return 200 `{ message: 'Email verified' }`.
- New `resendVerification` handler (no auth middleware):
  - Accept `{ email }` from request body.
  - Call `resendRateLimiter.checkAndIncrement(email)`. If count exceeds 3,
    return 429 `{ error: 'too_many_requests' }`.
  - Look up user by email. If user exists and `emailVerified` is false:
    call `createVerificationToken(prisma, user.id)`, build link, publish email
    notification, insert standalone OutboxEvent `{ eventType:
'email_verification_sent', payload: { userId: user.id } }`.
  - Always return 200 `{ message: 'If that address is registered and
unverified, a new email has been sent.' }`.
- `auth.routes.js`: add `POST /verify-email` (no auth) and `POST
/resend-verification` (no auth) routes.
- `app.js`: accept `resendRateLimiter` in the `createApp` deps object and
  thread it through `createRoutes`.
- `index.js`: construct `resendRateLimiter` by calling
  `createResendRateLimiter(redisClient)` (pass the ioredis client if
  `REDIS_URL` is set, otherwise pass null) and pass it to `createApp`.

### Task 4 -- Web-UI pages (Background, AC: login 403 handling) [ ]

Files: `web-ui/app/verify-email/page.tsx` (new),
`web-ui/app/register/page.tsx` (or equivalent registration page),
`web-ui/app/login/page.tsx` (or equivalent login page)

- `verify-email/page.tsx`: on mount, read `token` from the URL query string
  and POST to `/api/auth/verify-email` (or direct to auth-service). Display
  a loading state, then on 200 show a success message with a link to `/login`,
  on 410 show "Link expired" with a prompt to request a new one, on 400 show
  "Invalid or already-used link".
- Registration page: after a successful `POST /register` response, instead of
  immediately redirecting to `/login`, show an interstitial message: "Account
  created. Check your inbox to confirm your email address."
- Login page: when the login API returns 403 with
  `{ error: 'email_not_verified' }`, display a message ("Your email address
  has not been confirmed yet.") and a "Resend confirmation email" button that
  calls `POST /resend-verification` with the submitted email address.

### Task 5 -- Tests + docs (R7, R8, R10, all ACs) [ ]

Files: `auth-service/test/auth.routes.test.ts`,
`auth-service/test/mocks/prisma.ts`,
`docs/openapi.yaml`,
`docs/asyncapi.yaml`,
`auth-service/CLAUDE.md`

- `auth-service/test/mocks/prisma.ts`: add `emailVerificationToken` mock
  (`create`, `findUnique`, `updateMany`) to the mock Prisma client.
- `auth-service/test/auth.routes.test.ts`:
  - POST /register: assert an email notification is published and an
    `email_verification_sent` OutboxEvent is created.
  - POST /login with `emailVerified: false`: assert 403 with
    `{ error: 'email_not_verified' }`.
  - POST /login with `emailVerified: true`: assert existing 200 behaviour is
    unchanged.
  - POST /verify-email with a valid, unused, unexpired token: assert 200,
    `user.emailVerified` set to true, token `usedAt` set, OutboxEvent
    `email_verified` created.
  - POST /verify-email with an expired token: assert 410.
  - POST /verify-email with an already-used token: assert 400.
  - POST /verify-email with an unknown token: assert 400.
  - POST /resend-verification with a valid unverified email: assert 200 and
    email notification published.
  - POST /resend-verification with an unknown email: assert 200 and no email
    published.
  - POST /resend-verification on the 4th call for the same email within the
    window: assert 429.
- `docs/openapi.yaml`: add `POST /verify-email` (body: `{ token }`, responses
  200/400/410) and `POST /resend-verification` (body: `{ email }`, responses
  200/429); add 403 response with `{ error: 'email_not_verified' }` to the
  `POST /login` entry.
- `docs/asyncapi.yaml`: add `email_verification_sent` (payload: `{ userId }`)
  and `email_verified` (payload: `{ userId }`) to the auth-service publisher
  section.
- `auth-service/CLAUDE.md`: document `POST /verify-email` and `POST
/resend-verification` endpoints, `EmailVerificationToken` model, and the two
  new OutboxEvent types.
