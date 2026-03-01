# Web UI — Full URL Management

> **Status:** draft
> **Service(s):** web-ui, url-service
> **Priority:** high

## Goal

The backend url-service now supports custom aliases, link expiration, password
protection, tags, redirect types, UTM parameters, QR codes, pagination, and
filtering (Parts 1–6 of the URL Service Roadmap). The web-ui only exposes a
single `originalUrl` field at creation and a read-only view of some of these
fields in the manage table. This spec brings the UI up to feature parity with
the backend.

## Background

Current web-ui state:

- **Create form (`/`)** — one field: `originalUrl`. No access to alias, expiry,
  tags, password, redirect type, UTM params.
- **Manage page (`/manage`)** — shows alias, expiry, and tags as read-only badges
  in the table. Inline edit only supports `originalUrl`. No pagination, search,
  or filtering. No QR code action.
- **`src/services/api/url.ts`** — `createURL(originalUrl)` and
  `updateURL(id, originalUrl)` only pass `originalUrl`. All other fields are
  ignored.

Backend endpoints already implemented and ready to consume:
- `POST /urls` — accepts `originalUrl`, `customAlias`, `expiresAt`,
  `password`, `tags`, `redirectType`, `utmParams`
- `PUT /urls/:id` — same fields
- `GET /urls?page=&limit=&search=&tag=&expired=` — paginated, filterable
- `GET /:shortId/qr` — returns QR code PNG

## Requirements

### Functional

#### Create form

- **R1:** The create form shall expose an optional **custom alias** text input.
  Validation: alphanumeric and hyphens only, 3–50 characters. If the alias is
  already taken the server returns 409 — the form shall surface this as an inline
  error.
- **R2:** The create form shall expose an optional **expiration date** date-time
  picker. The field shall accept a future date only; past dates shall be rejected
  client-side before submission.
- **R3:** The create form shall expose an optional **password protection** toggle.
  When enabled, a password input shall appear. The password is sent as `password`
  in the request body.
- **R4:** The create form shall expose an optional **tags** input (comma-separated
  or tag-chip UI). Tags are sent as a `tags` string array.
- **R5:** The create form shall expose a **redirect type** selector (302 Temporary /
  301 Permanent), defaulting to 302.
- **R6:** The create form shall expose an optional collapsible **UTM parameter
  builder** with fields for `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_term`, `utm_content`. Filled values are sent as `utmParams` JSON.
- **R7:** On successful creation the form shall display the resulting short URL
  with a **copy-to-clipboard** button.

#### Manage page

- **R8:** The manage table shall be **paginated**. The page size shall be 10.
  Previous / Next controls shall be shown; the current page and total count shall
  be visible.
- **R9:** The manage page shall have a **search bar** that filters by original URL
  or alias (`?search=`). Search is debounced (300 ms) and resets to page 1.
- **R10:** The manage page shall have a **tag filter** dropdown populated from the
  tags present in the current result set. Selecting a tag filters the list
  (`?tag=`).
- **R11:** The manage page shall have an **"Expired only" toggle** that filters
  the list to expired links (`?expired=true`).
- **R12:** Each row shall have a **"Download QR" button** that fetches
  `GET /:shortId/qr` and triggers a PNG download named `{shortId}.png`.
- **R13:** The inline edit action shall be replaced with a **modal edit form**
  exposing all editable fields: `originalUrl`, `customAlias`, `expiresAt`,
  `password`, `tags`, `redirectType`, `utmParams`.

#### API service layer

- **R14:** `createURL` in `src/services/api/url.ts` shall accept an options object
  (`{ originalUrl, customAlias?, expiresAt?, password?, tags?, redirectType?,
  utmParams? }`) and pass it to `POST /urls`.
- **R15:** `updateURL` in `src/services/api/url.ts` shall accept the same options
  object and pass it to `PUT /urls/:id`.
- **R16:** `getURLs` shall accept pagination and filter params
  (`{ page?, limit?, search?, tag?, expired? }`) and pass them as query
  parameters.

### Non-Functional

- **R17:** Advanced fields (UTM, redirect type) shall be hidden behind a
  collapsible "Advanced options" section on the create form to keep the default
  experience simple.
- **R18:** All new form fields shall have accessible labels and keyboard navigation.
- **R19:** Loading and error states shall be handled for all async operations
  (pagination fetch, QR download, form submit).

## Acceptance Criteria

- [ ] A URL created with a custom alias resolves to that alias in the short URL
  displayed after creation.
- [ ] Creating a URL with a past expiry date is rejected before the API call is
  made, with a visible error message.
- [ ] Creating a URL with a duplicate alias shows a 409 error inline on the alias
  field.
- [ ] The manage table shows page 1 of 10 by default; Next/Previous navigates
  correctly.
- [ ] Typing in the search bar filters the table without a full page reload, after
  a 300 ms debounce.
- [ ] Selecting a tag from the tag filter shows only URLs with that tag.
- [ ] Clicking "Download QR" on a row downloads a PNG file named `{shortId}.png`.
- [ ] Opening the edit modal for a URL pre-populates all fields with current
  values.
- [ ] Saving the edit modal with a new expiry date updates the badge in the table.
- [ ] UTM params filled in the builder are appended to the destination URL when
  the short link is followed.

## Out of Scope

- Password-unlock flow for visiting a password-protected short URL (redirect
  experience, not management UI — separate spec)
- Bulk URL import UI (`POST /urls/bulk`) — separate spec
- Signed URL management (`requireSignature`, `POST /urls/:id/sign`) — separate
  spec
- Analytics drill-down per link — separate spec
- Dark mode / theming

## Docs to Update

- [ ] `docs/openapi.yaml` — no new endpoints; existing url-service endpoints are
  already documented

## Tasks

<!--
Generated by Claude from the requirements above. Do not write these manually.
Ask Claude: "Generate tasks for this spec."
-->
