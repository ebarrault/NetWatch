import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Device, Prisma } from '@prisma/client';
import { EventsService } from '../events/events.module';
import { PrismaService } from '../prisma/prisma.service';
import { evaluate, Probe } from './engine';
import { NotifierService } from './notifier.service';
import { ping } from './ping';
import { snmpPoll, SnmpResult } from './snmp';

@Injectable()
export class PollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PollerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly intervalMs: number;
  private readonly failuresBeforeDown: number;
  private readonly retentionDays: number;

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private notifier: NotifierService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('POLL_INTERVAL_SECONDS', 30)) * 1000;
    this.failuresBeforeDown = Number(config.get('FAILURES_BEFORE_DOWN', 2));
    this.retentionDays = Number(config.get('RETENTION_DAYS', 7));
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    this.logger.log(`Contrôles toutes les ${this.intervalMs / 1000} s`);
    setTimeout(() => this.cycle(), 3000);
    this.timer = setInterval(() => this.cycle(), this.intervalMs);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Un cycle complet : tous les équipements actifs, 10 en parallèle */
  async cycle() {
    if (this.running) return; // un cycle lent ne doit pas se chevaucher avec le suivant
    this.running = true;
    const start = Date.now();
    try {
      const devices = await this.prisma.device.findMany({ where: { enabled: true } });
      for (let i = 0; i < devices.length; i += 10) {
        await Promise.all(devices.slice(i, i + 10).map((d) => this.checkDevice(d).catch((e) => this.logger.error(`${d.name} : ${e.message}`))));
      }
      this.events.emit({ kind: 'cycle', checked: devices.length, durationMs: Date.now() - start, at: new Date().toISOString() });
    } finally {
      this.running = false;
    }
  }

  async probe(device: Device): Promise<Probe & { snmpDetail?: SnmpResult }> {
    const p = await ping(device.host);
    let snmpDetail: SnmpResult | undefined;
    if (device.snmpEnabled && p.alive) {
      snmpDetail = await snmpPoll(device.host, device.snmpCommunity, device.snmpPort);
    }
    return { reachable: p.alive, latencyMs: p.latencyMs, snmp: snmpDetail, snmpDetail };
  }

  /** Contrôle un équipement, enregistre la mesure, met à jour l'état et les alertes */
  async checkDevice(device: Device) {
    const probe = await this.probe(device);
    const openAlerts = await this.prisma.alert.findMany({ where: { deviceId: device.id, resolvedAt: null } });
    const ev = evaluate(
      {
        state: device.state,
        consecutiveFailures: device.consecutiveFailures,
        uptimeSeconds: device.uptimeSeconds,
        latencyThresholdMs: device.latencyThresholdMs,
        snmpEnabled: device.snmpEnabled,
      },
      probe,
      openAlerts.map((a) => a.type),
      this.failuresBeforeDown,
    );

    const now = new Date();
    const snmp = probe.snmpDetail;
    const ifs = snmp?.interfaces;
    const deviceData: Prisma.DeviceUpdateInput = {
      state: ev.state,
      consecutiveFailures: ev.consecutiveFailures,
      lastCheckAt: now,
      lastLatencyMs: probe.latencyMs,
      ...(ev.state !== device.state ? { lastChangeAt: now } : {}),
      ...(snmp?.ok
        ? {
            sysName: snmp.sysName,
            sysDescr: snmp.sysDescr,
            uptimeSeconds: snmp.uptimeSeconds,
            interfaces: (ifs ?? []) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    };

    const toResolve = openAlerts.filter((a) => ev.resolve.includes(a.type));
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.checkResult.create({
        data: {
          deviceId: device.id,
          reachable: probe.reachable,
          latencyMs: probe.latencyMs,
          snmpOk: snmp ? snmp.ok : null,
          uptimeSeconds: snmp?.uptimeSeconds,
          ifUp: ifs?.filter((i) => i.status === 'up').length,
          ifDown: ifs?.filter((i) => i.adminUp && i.status === 'down').length,
        },
      });
      await tx.device.update({ where: { id: device.id }, data: deviceData });
      const opened = [];
      for (const a of ev.open) {
        opened.push(
          await tx.alert.create({
            data: { deviceId: device.id, type: a.type, severity: a.severity, message: a.message, resolvedAt: a.instant ? now : null },
          }),
        );
      }
      if (toResolve.length) {
        await tx.alert.updateMany({ where: { id: { in: toResolve.map((a) => a.id) } }, data: { resolvedAt: now } });
      }
      return opened;
    });

    // Notifications et diffusion temps réel
    if (ev.state !== device.state || probe.latencyMs !== device.lastLatencyMs) {
      this.events.emit({ kind: 'device', deviceId: device.id, state: ev.state, latencyMs: probe.latencyMs, at: now.toISOString() });
    }
    for (const a of created) {
      await this.notifier.notify(a.severity, device.name, a.message);
      this.events.emit({ kind: 'alert', alertId: a.id, deviceId: device.id, status: 'opened', type: a.type, message: a.message, at: now.toISOString() });
    }
    for (const a of toResolve) {
      await this.notifier.notify('RESOLVED', device.name, `${a.message} — résolu`);
      this.events.emit({ kind: 'alert', alertId: a.id, deviceId: device.id, status: 'resolved', type: a.type, message: a.message, at: now.toISOString() });
    }
    return { device: device.name, ...ev, latencyMs: probe.latencyMs };
  }

  /** Purge quotidienne de l'historique des mesures */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge() {
    const before = new Date(Date.now() - this.retentionDays * 24 * 3600_000);
    const { count } = await this.prisma.checkResult.deleteMany({ where: { createdAt: { lt: before } } });
    this.logger.log(`Purge : ${count} mesure(s) supprimée(s)`);
  }
}
