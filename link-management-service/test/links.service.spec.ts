import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LinksService } from '../src/links/links.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';

const mockPrisma = {
  managedLink: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockEvents = {
  publishLinkCreated: jest.fn(),
  publishLinkClicked: jest.fn(),
};

describe('LinksService', () => {
  let service: LinksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<LinksService>(LinksService);
  });

  describe('create', () => {
    it('creates a link successfully', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue(null);
      mockPrisma.managedLink.create.mockResolvedValue({
        id: 1,
        alias: 'test',
        originalUrl: 'https://example.com',
        userId: 1,
        clicks: 0,
        expiresAt: null,
        password: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(
        { alias: 'test', originalUrl: 'https://example.com' },
        1,
      );

      expect(result.alias).toBe('test');
      expect(result.passwordProtected).toBe(false);
      expect(mockEvents.publishLinkCreated).toHaveBeenCalledWith(
        expect.objectContaining({ alias: 'test' }),
      );
    });

    it('throws ConflictException if alias taken', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({ id: 1 });
      await expect(
        service.create({ alias: 'taken', originalUrl: 'https://example.com' }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes password when provided', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue(null);
      mockPrisma.managedLink.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 1, clicks: 0, createdAt: new Date(), updatedAt: new Date() }),
      );

      const result = await service.create(
        { alias: 'pw-link', originalUrl: 'https://example.com', password: 'secret' },
        1,
      );

      expect(result.passwordProtected).toBe(true);
      const createCall = mockPrisma.managedLink.create.mock.calls[0][0];
      expect(createCall.data.password).not.toBe('secret');
      expect(createCall.data.password).toMatch(/^\$2b\$/);
    });
  });

  describe('bulkCreate', () => {
    it('returns results for each dto', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue(null);
      mockPrisma.managedLink.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 1, clicks: 0, password: null, createdAt: new Date(), updatedAt: new Date() }),
      );

      const results = await service.bulkCreate(
        [
          { alias: 'a1', originalUrl: 'https://example.com/1' },
          { alias: 'a2', originalUrl: 'https://example.com/2' },
        ],
        1,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('records failures for conflicting aliases', async () => {
      mockPrisma.managedLink.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 99 });
      mockPrisma.managedLink.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: 1, clicks: 0, password: null, createdAt: new Date(), updatedAt: new Date() }),
      );

      const results = await service.bulkCreate(
        [
          { alias: 'ok', originalUrl: 'https://example.com' },
          { alias: 'dup', originalUrl: 'https://example.com' },
        ],
        1,
      );

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('"dup"');
    });
  });

  describe('findAll', () => {
    it('returns all links for user', async () => {
      mockPrisma.managedLink.findMany.mockResolvedValue([
        { id: 1, alias: 'a', originalUrl: 'https://example.com', userId: 1, clicks: 0, expiresAt: null, password: null, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const result = await service.findAll(1);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns link for owner', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({
        id: 1, alias: 'x', originalUrl: 'https://x.com', userId: 5,
        clicks: 0, expiresAt: null, password: null, createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findOne(1, 5);
      expect(result.alias).toBe('x');
    });

    it('throws NotFoundException for missing link', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong user', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({ id: 1, userId: 2 });
      await expect(service.findOne(1, 99)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates a link', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({
        id: 1, userId: 1, alias: 'x', originalUrl: 'https://old.com',
        clicks: 0, expiresAt: null, password: null, createdAt: new Date(), updatedAt: new Date(),
      });
      mockPrisma.managedLink.update.mockResolvedValue({
        id: 1, alias: 'x', originalUrl: 'https://new.com', userId: 1,
        clicks: 0, expiresAt: null, password: null, createdAt: new Date(), updatedAt: new Date(),
      });

      const result = await service.update(1, { originalUrl: 'https://new.com' }, 1);
      expect(result.originalUrl).toBe('https://new.com');
    });

    it('throws NotFoundException if link does not exist', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue(null);
      await expect(service.update(1, {}, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the link', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.managedLink.delete.mockResolvedValue({});
      await expect(service.remove(1, 1)).resolves.toBeUndefined();
      expect(mockPrisma.managedLink.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws ForbiddenException for wrong owner', async () => {
      mockPrisma.managedLink.findUnique.mockResolvedValue({ id: 1, userId: 2 });
      await expect(service.remove(1, 99)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('export', () => {
    it('returns all user links', async () => {
      mockPrisma.managedLink.findMany.mockResolvedValue([
        { id: 1, alias: 'e', originalUrl: 'https://export.com', userId: 1,
          clicks: 0, expiresAt: null, password: null, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const result = await service.export(1);
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('password');
    });
  });
});
