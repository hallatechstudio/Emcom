import { Module } from '@nestjs/common';
import { DevicesController, DevicesService } from '../devices/devices.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, DevicesController],
  providers: [NotificationsService, DevicesService],
})
export class NotificationsModule {}
