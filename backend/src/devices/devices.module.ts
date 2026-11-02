import {
  Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { DeviceType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PollerService } from '../monitoring/poller.service';
import { PrismaService } from '../prisma/prisma.service';

export class CreateDeviceDto {
  @ApiProperty({ example: 'R-SIEGE' }) @IsString() @MaxLength(60) name!: string;
  @ApiProperty({ example: '10.10.255.1' })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9.\-:]{0,253}$/, { message: 'Adresse IP ou nom DNS invalide' })
  host!: string;
  @ApiPropertyOptional({ enum: DeviceType }) @IsOptional() @IsEnum(DeviceType) type?: DeviceType;
  @ApiPropertyOptional() @IsOptional() @IsString() site?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() snmpEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) snmpCommunity?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) snmpPort?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) latencyThresholdMs?: number;
}
export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}

/** Ne jamais renvoyer la communauté SNMP au navigateur */
const publicSelect = {
  id: true, name: true, host: true, type: true, site: true, enabled: true, snmpEnabled: true, snmpPort: true,
  latencyThresholdMs: true, state: true, lastCheckAt: true, lastChangeAt: true, lastLatencyMs: true,
  sysName: true, sysDescr: true, uptimeSeconds: true, interfaces: true, createdAt: true,
} as const;

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService, private poller: PollerService) {}

  async findAll() {
    const devices = await this.prisma.device.findMany({ select: publicSelect, orderBy: [{ site: 'asc' }, { name: 'asc' }] });
    const open = await this.prisma.alert.groupBy({ by: ['deviceId'], where: { resolvedAt: null }, _count: { _all: true } });
    const counts = new Map(open.map((o) => [o.deviceId, o._count._all]));
    return devices.map((d) => ({ ...d, openAlerts: counts.get(d.id) ?? 0 }));
  }

  async findOne(id: number) {
    const d = await this.prisma.device.findUnique({ where: { id }, select: publicSelect });
    if (!d) throw new NotFoundException('Équipement introuvable');
    return d;
  }

  /** Historique des mesures + disponibilité sur la période */
  async history(id: number, hours: number) {
    await this.findOne(id);
    const since = new Date(Date.now() - hours * 3600_000);
    const checks = await this.prisma.checkResult.findMany({
      where: { deviceId: id, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, reachable: true, latencyMs: true, ifDown: true },
    });
    const up = checks.filter((c) => c.reachable).length;
    const latencies = checks.map((c) => c.latencyMs).filter((l): l is number => l !== null);
    return {
      hours,
      availability: checks.length ? Math.round((up / checks.length) * 10_000) / 100 : null,
      avgLatencyMs: latencies.length ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100 : null,
      checks,
    };
  }

  create(dto: CreateDeviceDto) {
    return this.prisma.device.create({ data: dto, select: publicSelect });
  }

  async update(id: number, dto: UpdateDeviceDto) {
    await this.findOne(id);
    return this.prisma.device.update({ where: { id }, data: dto, select: publicSelect });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.device.delete({ where: { id } });
  }

  /** Contrôle immédiat (bouton « Tester maintenant ») */
  async checkNow(id: number) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Équipement introuvable');
    return this.poller.checkDevice(device);
  }
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private devices: DevicesService) {}

  @Get() findAll() {
    return this.devices.findAll();
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.devices.findOne(id);
  }
  @Get(':id/history')
  @ApiQuery({ name: 'hours', required: false, example: 24 })
  history(@Param('id', ParseIntPipe) id: number, @Query('hours') hours?: string) {
    const h = Math.min(Math.max(Number(hours) || 24, 1), 24 * 7);
    return this.devices.history(id, h);
  }
  @Post() create(@Body() dto: CreateDeviceDto) {
    return this.devices.create(dto);
  }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }
  @Delete(':id') @HttpCode(204) remove(@Param('id', ParseIntPipe) id: number) {
    return this.devices.remove(id);
  }
  @Post(':id/check') @HttpCode(200) check(@Param('id', ParseIntPipe) id: number) {
    return this.devices.checkNow(id);
  }
}

@Module({ controllers: [DevicesController], providers: [DevicesService] })
export class DevicesModule {}
