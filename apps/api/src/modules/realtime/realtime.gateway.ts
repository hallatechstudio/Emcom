import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { isAdminRole, JoinAck, RealtimeEvent } from '@emcom/shared-types';
import { verifyAccessToken } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { adminRoom, communityRoom, RealtimeService, userRoom } from './realtime.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketData {
  userId: string;
  expiryTimer?: NodeJS.Timeout;
}

/**
 * Authenticated Socket.IO gateway.
 *  - handshake must carry a valid access token (auth.token)
 *  - community rooms are joined only after an APPROVED membership check against the database
 *  - sockets are disconnected when their access token expires (client reconnects with a fresh one)
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: false } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Namespace): void {
    // With a namespace, Nest passes the namespace; `.server` is the root server (needed for adapters).
    this.realtime.attach(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: string })?.token;
    try {
      if (!token) throw new Error('missing token');
      const payload = await verifyAccessToken(this.jwt, token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
      if (!user || user.status !== 'ACTIVE') throw new Error('inactive');
      const data = socket.data as SocketData;
      data.userId = payload.sub;
      await socket.join(userRoom(payload.sub));
      const exp = (this.jwt.decode(token) as { exp?: number } | null)?.exp;
      if (exp) {
        const ms = Math.max(exp * 1000 - Date.now(), 0);
        data.expiryTimer = setTimeout(() => socket.disconnect(true), ms);
        socket.on('disconnect', () => clearTimeout(data.expiryTimer));
      }
    } catch {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }

  @SubscribeMessage(RealtimeEvent.JOIN_COMMUNITY)
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { communityId?: string }): Promise<JoinAck> {
    const userId = (socket.data as SocketData).userId;
    const communityId = body?.communityId;
    if (!userId) return { ok: false, error: 'UNAUTHORIZED' };
    if (!communityId || !UUID.test(communityId)) return { ok: false, error: 'NOT_FOUND' };

    const membership = await this.prisma.communityMembership.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { status: true, role: true },
    });
    if (!membership) return { ok: false, error: 'NOT_FOUND' };
    if (membership.status !== 'APPROVED') return { ok: false, error: 'MEMBERSHIP_NOT_ACTIVE' };

    await socket.join(communityRoom(communityId));
    if (isAdminRole(membership.role)) await socket.join(adminRoom(communityId));
    else await socket.leave(adminRoom(communityId));
    return { ok: true };
  }

  @SubscribeMessage(RealtimeEvent.LEAVE_COMMUNITY)
  async leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { communityId?: string }): Promise<JoinAck> {
    if (body?.communityId) {
      await socket.leave(communityRoom(body.communityId));
      await socket.leave(adminRoom(body.communityId));
    }
    return { ok: true };
  }
}
