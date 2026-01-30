import { vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_auth';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.PORT = '4001';

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  })),
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

// Mock event publisher
vi.mock('shared/events', () => ({
  createEventPublisher: vi.fn().mockReturnValue({
    publishUserRegistered: vi.fn(),
    publishUrlCreated: vi.fn(),
    publishUrlClicked: vi.fn(),
    publishEmailNotification: vi.fn(),
    publishEvent: vi.fn(),
  }),
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

// Mock rate limiters
vi.mock('shared/middlewares/rateLimit', () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  apiLimiter: (req: any, res: any, next: any) => next(),
  redirectLimiter: (req: any, res: any, next: any) => next(),
}));
