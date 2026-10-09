import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** RealtimeService is global so domain services can publish; the gateway is only mounted in the API process. */
@Global()
@Module({ providers: [RealtimeService], exports: [RealtimeService] })
export class RealtimeCoreModule {}
