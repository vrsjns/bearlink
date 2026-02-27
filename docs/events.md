# BearLink Event Documentation

This document describes the event-driven communication patterns between BearLink microservices.

## Overview

BearLink uses RabbitMQ for asynchronous messaging between services. Events enable loose coupling while maintaining data consistency across the system.

## Queues

| Queue | Purpose | Publishers | Consumers |
|-------|---------|------------|-----------|
| `events` | Domain events for analytics tracking | auth-service, url-service | analytics-service |
| `email_notifications` | Email delivery requests | auth-service | notification-service |
| `preview_jobs` | Trigger async metadata scraping | url-service | preview-service |
| `preview_results` | Return scraped metadata | preview-service | url-service |

## Event Types

### user_registered

Published when a new user completes registration.

**Publisher:** auth-service
**Consumer:** analytics-service

**Payload:**
```json
{
  "type": "user_registered",
  "payload": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "role": "USER",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### url_created

Published when a user creates a new shortened URL.

**Publisher:** url-service
**Consumer:** analytics-service

Note: `passwordHash` is stripped before publishing.

**Payload:**
```json
{
  "type": "url_created",
  "payload": {
    "id": 42,
    "originalUrl": "https://example.com/very/long/path",
    "shortId": "abc123XYZ0",
    "customAlias": null,
    "redirectType": 302,
    "expiresAt": null,
    "tags": ["marketing"],
    "utmParams": { "utm_source": "newsletter", "utm_medium": "email" },
    "requireSignature": false,
    "clicks": 0,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "userId": 1
  }
}
```

---

### url_updated

Published when a user updates an existing shortened URL.

**Publisher:** url-service
**Consumer:** analytics-service

Note: `passwordHash` is stripped before publishing. The payload contains the full updated URL record.

**Payload:**
```json
{
  "type": "url_updated",
  "payload": {
    "id": 42,
    "originalUrl": "https://example.com/new/path",
    "shortId": "abc123XYZ0",
    "customAlias": "my-campaign",
    "redirectType": 301,
    "expiresAt": null,
    "tags": ["marketing", "updated"],
    "utmParams": null,
    "requireSignature": false,
    "clicks": 17,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "userId": 1
  }
}
```

---

### url_deleted

Published when a user deletes a shortened URL.

**Publisher:** url-service
**Consumer:** analytics-service

**Payload:**
```json
{
  "type": "url_deleted",
  "payload": {
    "id": 42,
    "originalUrl": "https://example.com/very/long/path",
    "shortId": "abc123XYZ0",
    "customAlias": null,
    "userId": 1
  }
}
```

---

### url_clicked

Published when a shortened URL is accessed by a human visitor. Bot requests (detected by User-Agent) and duplicate clicks from the same IP within the same hour do **not** trigger this event.

**Publisher:** url-service
**Consumer:** analytics-service

**Payload:**
```json
{
  "type": "url_clicked",
  "payload": {
    "shortId": "abc123XYZ0",
    "originalUrl": "https://example.com/very/long/path",
    "referer": "https://twitter.com",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "country": "US"
  }
}
```

`referer`, `userAgent`, and `country` may be `null` if not available. Country is resolved via GeoIP lookup on the client IP.

---

## Preview Metadata Pipeline

URL metadata (title, description, OG image) is scraped asynchronously after URL creation.

### preview_requested (queue: `preview_jobs`)

Sent by url-service to preview-service immediately after creating a URL.

**Publisher:** url-service
**Consumer:** preview-service

```json
{
  "urlId": 42,
  "originalUrl": "https://example.com/very/long/path"
}
```

### preview_ready (queue: `preview_results`)

Sent by preview-service back to url-service with the scraped metadata.

**Publisher:** preview-service
**Consumer:** url-service (updates the URL record in the database)

```json
{
  "urlId": 42,
  "title": "Example Domain",
  "description": "This domain is for use in illustrative examples.",
  "imageUrl": "https://example.com/og-image.png"
}
```

Fields `title`, `description`, and `imageUrl` may be `null` if the page did not provide them.

---

## Email Notifications

Email notifications are sent directly to the `email_notifications` queue without a `type` wrapper.

**Publisher:** auth-service
**Consumer:** notification-service

**Payload:**
```json
{
  "to": "user@example.com",
  "subject": "Welcome to BearLink!",
  "text": "Hello John,\n\nThank you for registering at BearLink.\n\nBest Regards,\nBearLink Team"
}
```

---

## Usage

### Publishing Events

```javascript
const { createEventPublisher, QUEUES } = require('shared/events');

// After connecting to RabbitMQ
const eventPublisher = createEventPublisher(channel);

// Assert queues
await channel.assertQueue(QUEUES.EVENTS);
await channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);
await channel.assertQueue(QUEUES.PREVIEW_JOBS);
await channel.assertQueue(QUEUES.PREVIEW_RESULTS);

// URL lifecycle events
eventPublisher.publishUrlCreated(sanitizedUrlRecord);
eventPublisher.publishUrlUpdated(sanitizedUrlRecord);
eventPublisher.publishUrlDeleted(sanitizedUrlRecord);

// Click event (includes analytics metadata)
eventPublisher.publishUrlClicked({
  shortId: 'abc123',
  originalUrl: 'https://example.com',
  referer: 'https://twitter.com',
  userAgent: 'Mozilla/5.0 ...',
  country: 'US',
});

// Email notification
eventPublisher.publishEmailNotification({
  to: 'user@example.com',
  subject: 'Welcome!',
  text: 'Hello...',
});
```

### Consuming Events

```javascript
const { consumeEvents, consumeEmailNotifications } = require('shared/events');

// Consume domain events
await consumeEvents(channel, async (type, payload) => {
  switch (type) {
    case 'url_created': /* ... */ break;
    case 'url_updated': /* ... */ break;
    case 'url_deleted': /* ... */ break;
    case 'url_clicked': /* ... */ break;
    case 'user_registered': /* ... */ break;
  }
});

// Consume email notifications
await consumeEmailNotifications(channel, async ({ to, subject, text }) => {
  await sendEmail({ to, subject, text });
});
```

## Constants

Import queue names and event types to avoid hardcoding strings:

```javascript
const { QUEUES, EVENT_TYPES } = require('shared/events');

// QUEUES.EVENTS              = 'events'
// QUEUES.EMAIL_NOTIFICATIONS = 'email_notifications'
// QUEUES.PREVIEW_JOBS        = 'preview_jobs'
// QUEUES.PREVIEW_RESULTS     = 'preview_results'

// EVENT_TYPES.USER_REGISTERED = 'user_registered'
// EVENT_TYPES.URL_CREATED     = 'url_created'
// EVENT_TYPES.URL_UPDATED     = 'url_updated'
// EVENT_TYPES.URL_DELETED     = 'url_deleted'
// EVENT_TYPES.URL_CLICKED     = 'url_clicked'
```

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────────────────────┐
│  auth-service   │     │          url-service              │
│                 │     │                                  │
│ user_registered │     │ url_created / url_updated        │
│ email_notif.    │     │ url_deleted / url_clicked        │
└────────┬────────┘     └───────────┬──────────────────────┘
         │                          │           │
         │                          │           │ preview_jobs
         │                          │           ▼
         │                          │   ┌────────────────────┐
         │                          │   │  preview-service   │
         │                          │   │  (Python/FastAPI)  │
         │                          │   └────────┬───────────┘
         │                          │            │ preview_results
         │                          │◄───────────┘
         │                          │
         ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                           RabbitMQ                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  events             │    │  email_notifications        │    │
│  └──────────┬──────────┘    └──────────────┬──────────────┘    │
└─────────────┼──────────────────────────────┼────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────┐
│   analytics-service     │    │   notification-service      │
│   (stores events)       │    │   (sends emails via SMTP)   │
└─────────────────────────┘    └─────────────────────────────┘
```

## AsyncAPI Specification

For a machine-readable specification of these events, see [asyncapi.yaml](./asyncapi.yaml).
