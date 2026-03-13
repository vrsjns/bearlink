import { vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_url';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.PORT = '5001';
process.env.BASE_URL = 'http://localhost:5001';

// Mock logger
vi.mock('shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock correlation ID middleware
vi.mock('shared/middlewares/correlationId', () => ({
  createCorrelationIdMiddleware: vi.fn().mockReturnValue((req: any, res: any, next: any) => {
    req.correlationId = 'test-correlation-id';
    next();
  }),
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

// Mock nanoid with controllable return value
let mockShortId = 'abc1234567';
export const setMockShortId = (id: string) => {
  mockShortId = id;
};

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => mockShortId),
}));
