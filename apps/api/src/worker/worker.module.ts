import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { coreImports } from '../app.module';
import { loggerParams } from '../common/logging';
import { FanoutService } from '../modules/notifications/fanout.service';
import { PushProviderRegistry } from '../modules/notifications/providers/provider-registry';
import { PushSenderService } from '../modules/notifications/push-sender.service';
import { RetentionService } from '../modules/notifications/retention.service';
import { OutboxDispatcher } from '../modules/outbox/outbox-dispatcher.service';
import { QueueModule } from '../modules/queue/queue.module';
import { WorkerRunner } from './worker.runner';

/** Everything the background process needs; no HTTP controllers. */
@Module({
  imports: [LoggerModule.forRoot(loggerParams()), ...coreImports, QueueModule],
  providers: [OutboxDispatcher, FanoutService, PushSenderService, PushProviderRegistry, RetentionService, WorkerRunner],
  exports: [OutboxDispatcher, FanoutService, PushSenderService, PushProviderRegistry, RetentionService, WorkerRunner],
})
export class WorkerModule {}
