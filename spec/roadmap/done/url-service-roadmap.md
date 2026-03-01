# URL Service Improvement Roadmap

Breaking down 22 improvement ideas into 6 independently-implementable parts.
Each part has a clear scope, no partial-feature sprawl, and can be reviewed as a single PR.

> **Status: All 6 parts implemented ✅**

---

## Part 1 — Code Cleanup ✅
> No schema changes. No new infrastructure. Pure code fixes.

| # | What | Why |
|---|------|-----|
| 1 | Fix `originalURL` vs `originalUrl` inconsistency in `updateUrl` controller | API consumers get confused by the capitalization mismatch |
| 2 | Retry on `shortId` collision in `createUrl` | Currently throws a 500 if nanoid happens to collide; add a simple retry loop (max 3 attempts) |
| 3 | Publish `url_updated` and `url_deleted` events | Analytics service is blind to updates and deletions right now |
| 4 | Add `redirectType` field (`301` or `302`) to the URL model | 302 is the current default (good); expose it as a per-link option so users can opt into 301 for SEO |

**Files touched:** `controllers/urls.controller.js`, `controllers/redirect.controller.js`, `shared/events/publisher.js`, `prisma/schema.prisma` (one new field + migration)

---

## Part 2 — Link Feature Extensions ✅
> Schema migration required. Builds on Part 1 (uses the new event types).

| # | What | Why |
|---|------|-----|
| 5 | Custom aliases (`customAlias String? @unique`) | Vanity URLs: `bear.lnk/my-promo` instead of random nanoid |
| 6 | Link expiration (`expiresAt DateTime?`) | Auto-expire links; redirect returns `410 Gone` after expiry |
| 7 | Password protection (`passwordHash String?`) | Private links; redirect returns `401`, client POSTs password to `POST /:shortId/unlock` |
| 8 | Tags / labels (`tags String[]`) | Organize links; filterable in the UI via `?tag=campaign-2026` |

**Migration:** single `ALTER TABLE` adding 4 nullable columns.
**Files touched:** `prisma/schema.prisma`, `controllers/urls.controller.js`, `controllers/redirect.controller.js`

---

## Part 3 — Analytics Enrichment ✅
> Richer event payloads and smarter click tracking. No new infra.

| # | What | Why |
|---|------|-----|
| 9  | Add `referer`, `userAgent`, `country` to `url_clicked` event payload | Analytics service gets the context it needs for meaningful dashboards |
| 10 | Bot / crawler filtering in redirect | Don't count Googlebot, Slackbot (link unfurling), etc. as real clicks; simple UA denylist |
| 11 | Pagination on `GET /urls` (`?page=&limit=`) | Currently returns all rows; breaks down at hundreds of links |
| 12 | Filtering on `GET /urls` (`?tag=`, `?search=`, `?expired=true`) | Follows naturally from tags (Part 2) and expiration (Part 2) |

**Note:** Country lookup uses `geoip-lite` (~30MB DB bundled).
**Files touched:** `controllers/redirect.controller.js`, `controllers/urls.controller.js`, `shared/events/publisher.js`

---

## Part 4 — New Endpoints ✅
> Self-contained new features. Each can be shipped independently.

### 4a — QR Code endpoint ✅
`GET /:shortId/qr` — returns a PNG QR code for the short URL on the fly.
Package: `qrcode` (npm). Zero infra needed, stateless.

### 4b — Bulk creation ✅
`POST /urls/bulk` — accepts `{ urls: [...] }`, returns array of results (partial-success).
Useful for importers, scripts, admin tooling. Max 50 items per request.

### 4c — UTM injection ✅
Users attach default UTM params at creation time. On redirect, appended to the destination URL automatically. Stored as `utmParams Json?` on the URL model.

### 4d — Safe bounce page ✅
`GET /:shortId?preview=1` — instead of redirecting, renders a branded intermediate page showing the destination and OG preview metadata. No click is counted in preview mode.

**Files touched:** new routes, controllers; `prisma/schema.prisma` for 4c.

---

## Part 5 — Performance Layer (Redis) ✅
> Requires adding Redis to docker-compose and k8s manifests.

| # | What | Why |
|---|------|-----|
| 13 | Redis cache for redirect lookups | Every `GET /:shortId` currently hits Postgres; cache with 60s TTL, invalidate on update/delete |
| 14 | Redis-backed rate limiters | `createRedisRateLimiters` factory available in `services/rateLimiters.js` |
| 15 | Click deduplication via Redis | `dedup:{shortId}:{ip}:{hour}` key with SET NX prevents one IP from inflating click counts |

**Infrastructure:** `redis` service added to `docker-compose.yml`; `redis/deployment.yaml` + `redis/service.yaml` added to `k8s/`.
**Packages:** `ioredis`, `rate-limit-redis`
**Files touched:** `index.js` (Redis init), `controllers/redirect.controller.js`, `services/rateLimiters.js`

---

## Part 6 — Security Hardening ✅
> External API integrations and access control.

| # | What | Why |
|---|------|-----|
| 16 | Google Safe Browsing API check at creation time | Reject known phishing/malware URLs at the source; fail-open if key missing or API times out |
| 17 | Domain allowlist / blocklist via env config | Prevents the service becoming a redirect proxy for bad actors; `DOMAIN_BLOCKLIST` / `DOMAIN_ALLOWLIST` env vars |
| 18 | Signed short URLs with expiry (HMAC-SHA256) | `requireSignature Boolean` field; `POST /urls/:id/sign`; redirect verifies `?sig=&exp=` with constant-time compare |

**Files touched:** `controllers/urls.controller.js`, `controllers/redirect.controller.js`, `routes/urls.routes.js`, `services/safeBrowsing.service.js`, `services/domainFilter.service.js`, `services/signedUrl.service.js`, `prisma/schema.prisma` + migration

---

## Suggested Implementation Order (retrospective)

```
Part 1  →  Part 2  →  Part 3
                 ↓
            Part 4 (any sub-feature independently)
                 ↓
            Part 5 (Redis — one PR)
                 ↓
            Part 6 (any item independently)
```

Parts 1–3 build on each other naturally (events from Part 1 are enriched in Part 3; tags from Part 2 enable filtering in Part 3).
Parts 4–6 are mostly independent and can be interleaved with anything after Part 2.

---

## What's Already Tracked

Items that overlap with `IMPROVEMENTS.md`:
- Redis rate limiting → also covered in *Security Hardening > Add Rate Limit Persistence with Redis*
- Pagination → also covered in *Analytics Service Improvements > Add Pagination*
- Dead letter queue → in *Architecture Improvements* (not url-service specific)
