# BearLink Event Documentation

This document describes the event-driven communication patterns between BearLink microservices.

## Overview

BearLink uses RabbitMQ for asynchronous messaging between services. Events enable loose coupling between services while maintaining data consistency across the system.

## Queues

| Queue | Purpose | Publishers | Consumers |
|-------|---------|------------|-----------|
| `events` | Domain events for analytics tracking | auth-service, url-service | analytics-service |
| `email_notifications` | Email delivery requests | auth-service | notification-service |

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
    "role": "user",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### url_created

Published when a user creates a new shortened URL.

**Publisher:** url-service
**Consumer:** analytics-service

**Payload:**
```json
{
  "type": "url_created",
  "payload": {
    "id": 42,
    "originalUrl": "https://example.com/very/long/path",
    "shortId": "abc123XYZ0",
    "clicks": 0,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "userId": 1
  }
}
```

### url_clicked

Published when a shortened URL is accessed/clicked.

**Publisher:** url-service
**Consumer:** analytics-service

**Payload:**
```json
{
  "type": "url_clicked",
  "payload": {
    "shortId": "abc123XYZ0",
    "originalUrl": "https://example.com/very/long/path"
  }
}
```

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

## Usage

### Publishing Events

```javascript
const { createEventPublisher, QUEUES } = require('shared/events');

// After connecting to RabbitMQ
const eventPublisher = createEventPublisher(channel);

// Assert queues
await channel.assertQueue(QUEUES.EVENTS);
await channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS);

// Publish typed events
eventPublisher.publishUserRegistered({
  id: 1,
  email: 'user@example.com',
  name: 'John',
  role: 'user',
  createdAt: new Date().toISOString()
});

eventPublisher.publishUrlCreated({
  id: 42,
  originalUrl: 'https://example.com',
  shortId: 'abc123',
  clicks: 0,
  createdAt: new Date().toISOString(),
  userId: 1
});

eventPublisher.publishUrlClicked({
  shortId: 'abc123',
  originalUrl: 'https://example.com'
});

eventPublisher.publishEmailNotification({
  to: 'user@example.com',
  subject: 'Welcome!',
  text: 'Hello...'
});
```

### Consuming Events

```javascript
const { consumeEvents, consumeEmailNotifications } = require('shared/events');

// Consume domain events
await consumeEvents(channel, async (type, payload) => {
  console.log(`Received event: ${type}`, payload);
  // Handle event based on type
});

// Consume email notifications
await consumeEmailNotifications(channel, async ({ to, subject, text }) => {
  console.log(`Sending email to ${to}`);
  // Send email
});
```

## Constants

Import queue names and event types to avoid hardcoding strings:

```javascript
const { QUEUES, EVENT_TYPES } = require('shared/events');

// QUEUES.EVENTS = 'events'
// QUEUES.EMAIL_NOTIFICATIONS = 'email_notifications'

// EVENT_TYPES.USER_REGISTERED = 'user_registered'
// EVENT_TYPES.URL_CREATED = 'url_created'
// EVENT_TYPES.URL_CLICKED = 'url_clicked'
```

## Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  auth-service   │     │   url-service   │     │    web-ui       │
│                 │     │                 │     │   (Next.js)     │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │ user_registered       │ url_created
         │ email_notification    │ url_clicked
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                         RabbitMQ                                │
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
