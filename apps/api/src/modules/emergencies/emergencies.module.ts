import { Module } from '@nestjs/common';
import { AcknowledgmentsService } from './acknowledgments.service';
import { CriticalAlertsService } from './critical-alerts.service';
import { EmergenciesController } from './emergencies.controller';
import { EmergenciesService } from './emergencies.service';

@Module({
  controllers: [EmergenciesController],
  providers: [EmergenciesService, CriticalAlertsService, AcknowledgmentsService],
})
export class EmergenciesModule {}
