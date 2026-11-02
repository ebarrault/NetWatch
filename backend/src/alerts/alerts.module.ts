import { Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { EventsService } from '../events/events.module';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService, private events: EventsService) {}

  list(status: 'open' | 'resolved' | 'all', deviceId?: number) {
    const where: Prisma.AlertWhereInput = {};
    if (status === 'open') where.resolvedAt = null;
    if (status === 'resolved') where.resolvedAt = { not: null };
    if (deviceId) where.deviceId = deviceId;
    return this.prisma.alert.findMany({
      where,
      include: { device: { select: { id: true, name: true, site: true } } },
      orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'first' } }, { startedAt: 'desc' }],
      take: 200,
    });
  }

  /** Prise en compte : l'alerte reste ouverte mais un technicien s'en occupe */
  async acknowledge(id: number, by: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerte introuvable');
    const updated = await this.prisma.alert.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy: by } });
    this.events.emit({
      kind: 'alert', alertId: id, deviceId: alert.deviceId, status: 'acknowledged', type: alert.type, message: alert.message, at: new Date().toISOString(),
    });
    return updated;
  }

  async summary() {
    const [bySeverity, byState] = await Promise.all([
      this.prisma.alert.groupBy({ by: ['severity'], where: { resolvedAt: null }, _count: { _all: true } }),
      this.prisma.device.groupBy({ by: ['state'], where: { enabled: true }, _count: { _all: true } }),
    ]);
    return {
      openAlerts: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count._all])),
      devices: Object.fromEntries(byState.map((s) => [s.state, s._count._all])),
    };
  }
}

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'resolved', 'all'] })
  @ApiQuery({ name: 'deviceId', required: false })
  list(@Query('status') status = 'open', @Query('deviceId') deviceId?: string) {
    const s = ['open', 'resolved', 'all'].includes(status) ? (status as 'open' | 'resolved' | 'all') : 'open';
    return this.alerts.list(s, deviceId ? Number(deviceId) : undefined);
  }

  @Get('summary') summary() {
    return this.alerts.summary();
  }

  @Post(':id/ack')
  ack(@Param('id', ParseIntPipe) id: number, @Req() req: { user: { name: string } }) {
    return this.alerts.acknowledge(id, req.user.name);
  }
}

@Module({ controllers: [AlertsController], providers: [AlertsService] })
export class AlertsModule {}
