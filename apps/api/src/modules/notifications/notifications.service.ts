import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { NotificationDto, Paginated } from '@emcom/shared-types';
import { Errors } from '../../common/errors/app-error';
import { keysetWhere, page } from '../../common/http/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

/** In-app inbox — the persistent record of everything a user was told. */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, opts: { cursor?: string; limit?: number; communityId?: string; unreadOnly?: boolean }): Promise<Paginated<NotificationDto>> {
    const limit = opts.limit ?? 20;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        communityId: opts.communityId,
        readAt: opts.unreadOnly ? null : undefined,
        AND: [keysetWhere(opts.cursor)],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const p = page(rows, limit);
    return { items: p.items.map(toDto), nextCursor: p.nextCursor };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw Errors.notFound('Notification');
    const updated = n.readAt ? n : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return toDto(updated);
  }

  async markAllRead(userId: string, communityId?: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, communityId },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}

function toDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    priority: n.priority,
    title: n.title,
    body: n.body,
    communityId: n.communityId,
    emergencyId: n.emergencyId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
