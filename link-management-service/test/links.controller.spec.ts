import { Test, TestingModule } from '@nestjs/testing';
import { LinksController } from '../src/links/links.controller';
import { LinksService } from '../src/links/links.service';
import { JwtAuthGuard } from '../src/auth/jwt.guard';

const mockLinksService = {
  create: jest.fn(),
  bulkCreate: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  export: jest.fn(),
};

const mockUser = { id: 1, email: 'test@example.com', role: 'user' };

describe('LinksController', () => {
  let controller: LinksController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksService, useValue: mockLinksService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LinksController>(LinksController);
  });

  describe('create', () => {
    it('delegates to linksService.create with userId', async () => {
      const dto = { alias: 'test', originalUrl: 'https://example.com' };
      const expected = { id: 1, ...dto, passwordProtected: false };
      mockLinksService.create.mockResolvedValue(expected);

      const result = await controller.create(dto, mockUser);
      expect(result).toEqual(expected);
      expect(mockLinksService.create).toHaveBeenCalledWith(dto, mockUser.id);
    });
  });

  describe('bulkCreate', () => {
    it('delegates to linksService.bulkCreate', async () => {
      const dtos = [
        { alias: 'a', originalUrl: 'https://example.com/a' },
        { alias: 'b', originalUrl: 'https://example.com/b' },
      ];
      const expected = [{ success: true, link: {} }, { success: true, link: {} }];
      mockLinksService.bulkCreate.mockResolvedValue(expected);

      const result = await controller.bulkCreate(dtos, mockUser);
      expect(result).toEqual(expected);
      expect(mockLinksService.bulkCreate).toHaveBeenCalledWith(dtos, mockUser.id);
    });
  });

  describe('findAll', () => {
    it('returns all links for the user', async () => {
      const links = [{ id: 1, alias: 'x' }];
      mockLinksService.findAll.mockResolvedValue(links);

      const result = await controller.findAll(mockUser);
      expect(result).toEqual(links);
      expect(mockLinksService.findAll).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('findOne', () => {
    it('returns a single link', async () => {
      const link = { id: 1, alias: 'x' };
      mockLinksService.findOne.mockResolvedValue(link);

      const result = await controller.findOne(1, mockUser);
      expect(result).toEqual(link);
      expect(mockLinksService.findOne).toHaveBeenCalledWith(1, mockUser.id);
    });
  });

  describe('update', () => {
    it('updates a link', async () => {
      const dto = { originalUrl: 'https://new.com' };
      const updated = { id: 1, originalUrl: 'https://new.com' };
      mockLinksService.update.mockResolvedValue(updated);

      const result = await controller.update(1, dto, mockUser);
      expect(result).toEqual(updated);
      expect(mockLinksService.update).toHaveBeenCalledWith(1, dto, mockUser.id);
    });
  });

  describe('remove', () => {
    it('removes a link', async () => {
      mockLinksService.remove.mockResolvedValue(undefined);

      await controller.remove(1, mockUser);
      expect(mockLinksService.remove).toHaveBeenCalledWith(1, mockUser.id);
    });
  });
});
