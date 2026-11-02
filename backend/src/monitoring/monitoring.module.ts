import { Global, Module } from '@nestjs/common';
import { NotifierService } from './notifier.service';
import { PollerService } from './poller.service';

@Global()
@Module({ providers: [PollerService, NotifierService], exports: [PollerService] })
export class MonitoringModule {}
