import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { CommunityAccessGuard } from './common/auth/community-access.guard';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { loggerParams } from './common/logging';
import { PrismaModule } from './common/prisma/prisma.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RedisModule } from './common/redis/redis.module';
import { AppConfigModule } from './config/config.module';
import { env } from './config/env';
import { AdminController } from './modules/admin/admin.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { DevController } from './modules/dev/dev.controller';
import { EmergenciesModule } from './modules/emergencies/emergencies.module';
import { HealthController } from './modules/health/health.controller';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { MetricsService } from './modules/metrics/metrics.service';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import { RealtimeCoreModule } from './modules/realtime/realtime.module';

export const jwtModule = JwtModule.registerAsync({
  global: true,
  useFactory: () => ({ secret: env().JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256' } }),
});

/** Shared infrastructure used by both the API and the worker process. */
export const coreImports = [
  AppConfigModule,
  PrismaModule,
  RedisModule,
  RateLimitModule,
  MetricsModule,
  AuditModule,
  OutboxModule,
  MailModule,
  RealtimeCoreModule,
  jwtModule,
];

@Module({
  imports: [
    LoggerModule.forRoot(loggerParams()),
    ...coreImports,
    MediaModule,
    AuthModule,
    CommunitiesModule,
    MembershipsModule,
    EmergenciesModule,
    NotificationsModule,
  ],
  controllers: [HealthController, AdminController, ...(env().NODE_ENV === 'production' ? [] : [DevController])],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CommunityAccessGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    RealtimeGateway,
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly metrics: MetricsService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply((req: Request, res: Response, next: NextFunction) => {
        const end = this.metrics.httpDuration.startTimer();
        res.on('finish', () => {
          const route = (req.route?.path as string | undefined) ?? 'unmatched';
          end({ method: req.method, route, status: String(res.statusCode) });
        });
        next();
      })
      .forRoutes('*path');
  }
}
