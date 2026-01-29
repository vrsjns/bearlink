# Notification Service

Email delivery service that consumes email notification requests.

**Port:** 7000 | **API Docs:** See [OpenAPI spec](../docs/openapi.yaml) (tag: `notification`)

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

const sendEmail = async ({ to, subject, text }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  });
  logger.info(`Email ${subject} sent to ${to}`);
};

// Setup (after RabbitMQ connection)
await consumeEmailNotifications(channel, sendEmail);
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
