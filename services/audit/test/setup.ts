import { vi } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_audit';
process.env.PORT = '8501';
process.env.AUDIT_INTERNAL_SECRET = 'test-audit-secret';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    auditEntry: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  })),
}));

vi.mock('shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('shared/middlewares/correlationId', () => ({
  createCorrelationIdMiddleware: vi.fn().mockReturnValue((req: any, res: any, next: any) => next()),
}));

vi.mock('shared/middlewares/requestLogger', () => ({
  createRequestLogger: vi.fn().mockReturnValue((req: any, res: any, next: any) => next()),
}));

vi.mock('shared/middlewares/cors', () => ({
  corsMiddleware: (req: any, res: any, next: any) => next(),
}));
