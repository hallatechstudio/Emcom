import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/** Socket.IO adapter backed by Redis pub/sub so room broadcasts reach sockets on every API instance. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: IORedis[] = [];

  constructor(app: INestApplicationContext, private readonly redisUrl: string) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...options, pingInterval: 20_000, pingTimeout: 20_000 });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
