# Notification Service

Email delivery service that consumes email notification requests.

**Port:** 7000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `notification`)

## Project Structure

```
notification-service/
├── index.js              # Entry point: RabbitMQ init, server start, shutdown
├── app.js                # Express app factory: middleware setup (no routes)
├── services/
│   └── email.service.js  # createTransporter, createEmailSender
└── CLAUDE.md
```

Note: This service has no API routes (only health/ready endpoints), so no controllers or routes directories.

## Dependency Injection Pattern

The service uses factory functions with dependency injection:

```javascript
// Entry point creates dependencies
const transporter = createTransporter();
const sendEmail = createEmailSender(transporter);

// App factory (no dependencies needed, just middleware)
const app = createApp();

// Email sender is passed to RabbitMQ consumer
await consumeEmailNotifications(channel, sendEmail, { serviceName: 'notification-service' });
```

## Event Consumption

This service **consumes** email notifications from RabbitMQ. It does not publish events or consume domain events.

### Queue

Consumes from `email_notifications` queue (separate from domain events).

### Message Format

```javascript
{
  to: 'user@example.com',
  subject: 'Email subject',
  text: 'Email body text'
}
```

### Code Pattern

```javascript
const { consumeEmailNotifications } = require('shared/events');
const { createTransporter, createEmailSender } = require('./services/email.service');

const transporter = createTransporter();
const sendEmail = createEmailSender(transporter);

// Setup (after RabbitMQ connection)
await consumeEmailNotifications(channel, sendEmail, { serviceName: 'notification-service' });
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `EMAIL_USER` | SMTP authentication username |
| `EMAIL_PASS` | SMTP authentication password |

### Development

Uses MailHog in development (accessible at `http://localhost:8025`).
