import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateLinkDto, userId: number) {
    const existing = await this.prisma.managedLink.findUnique({
      where: { alias: dto.alias },
    });
    if (existing) {
      throw new ConflictException(`Alias "${dto.alias}" is already taken`);
    }

    const data: any = {
      alias: dto.alias,
      originalUrl: dto.originalUrl,
      userId,
    };
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10);

    const link = await this.prisma.managedLink.create({ data });

    await this.events.publishLinkCreated({
      id: link.id,
      alias: link.alias,
      originalUrl: link.originalUrl,
      userId: link.userId,
    });

    return this.sanitize(link);
  }

  async bulkCreate(dtos: CreateLinkDto[], userId: number) {
    const results = [];
    for (const dto of dtos) {
      try {
        const link = await this.create(dto, userId);
        results.push({ success: true, link });
      } catch (err) {
        results.push({ success: false, alias: dto.alias, error: err.message });
      }
    }
    return results;
  }

  async findAll(userId: number) {
    const links = await this.prisma.managedLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return links.map(this.sanitize);
  }

  async findOne(id: number, userId: number) {
    const link = await this.prisma.managedLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.userId !== userId) throw new ForbiddenException();
    return this.sanitize(link);
  }

  async update(id: number, dto: UpdateLinkDto, userId: number) {
    const link = await this.prisma.managedLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.userId !== userId) throw new ForbiddenException();

    const data: any = {};
    if (dto.originalUrl !== undefined) data.originalUrl = dto.originalUrl;
    if (dto.expiresAt !== undefined) data.expiresAt = new Date(dto.expiresAt);
    if (dto.password !== undefined) {
      data.password = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    }

    const updated = await this.prisma.managedLink.update({ where: { id }, data });
    return this.sanitize(updated);
  }

  async remove(id: number, userId: number) {
    const link = await this.prisma.managedLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.userId !== userId) throw new ForbiddenException();
    await this.prisma.managedLink.delete({ where: { id } });
  }

  async export(userId: number) {
    const links = await this.prisma.managedLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return links.map(this.sanitize);
  }

  private sanitize(link: any) {
    const { password, ...rest } = link;
    return { ...rest, passwordProtected: !!password };
  }
}
