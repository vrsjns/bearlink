import {
  Injectable,
  NotFoundException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class RedirectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async resolve(alias: string): Promise<{ redirectUrl: string }> {
    const link = await this.prisma.managedLink.findUnique({ where: { alias } });
    if (!link) throw new NotFoundException('Link not found');

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new GoneException('This link has expired');
    }

    if (link.password) {
      throw new UnauthorizedException({ protected: true });
    }

    await this.prisma.managedLink.update({
      where: { alias },
      data: { clicks: { increment: 1 } },
    });

    await this.events.publishLinkClicked({
      alias: link.alias,
      originalUrl: link.originalUrl,
      userId: link.userId,
    });

    return { redirectUrl: link.originalUrl };
  }

  async unlock(alias: string, password: string): Promise<{ redirectUrl: string }> {
    const link = await this.prisma.managedLink.findUnique({ where: { alias } });
    if (!link) throw new NotFoundException('Link not found');

    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new GoneException('This link has expired');
    }

    if (!link.password) {
      return { redirectUrl: link.originalUrl };
    }

    const valid = await bcrypt.compare(password, link.password);
    if (!valid) throw new UnauthorizedException('Incorrect password');

    await this.prisma.managedLink.update({
      where: { alias },
      data: { clicks: { increment: 1 } },
    });

    await this.events.publishLinkClicked({
      alias: link.alias,
      originalUrl: link.originalUrl,
      userId: link.userId,
    });

    return { redirectUrl: link.originalUrl };
  }
}
