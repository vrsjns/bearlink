import { vi } from 'vitest';

// Mock environment variables
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.PORT = '7001';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    verify: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock RabbitMQ
vi.mock('shared/utils/rabbitmq', () => ({
  connectRabbitMQ: vi.fn().mockResolvedValue({
    assertQueue: vi.fn(),
    sendToQueue: vi.fn(),
    consume: vi.fn(),
    ack: vi.fn(),
    nack: vi.fn(),
  }),
  getChannel: vi.fn(),
}));

// Mock logger
vi.mock('shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock email notifications consumer
vi.mock('shared/events', () => ({
  consumeEmailNotifications: vi.fn(),
  QUEUES: {
    EVENTS: 'events',
    EMAIL_NOTIFICATIONS: 'email_notifications',
  },
}));

// Mock correlation ID middleware
vi.mock('shared/middlewares/correlationId', () => ({
  createCorrelationIdMiddleware: vi.fn().mockReturnValue((req: any, res: any, next: any) => next()),
}));

// Mock request logger
vi.mock('shared/middlewares/requestLogger', () => ({
  createRequestLogger: vi.fn().mockReturnValue((req: any, res: any, next: any) => next()),
}));

// Mock CORS
vi.mock('shared/middlewares/cors', () => ({
  corsMiddleware: (req: any, res: any, next: any) => next(),
}));
