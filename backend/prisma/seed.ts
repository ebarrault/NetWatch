import { DeviceType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Équipements du labo Docker (voir docker-compose.yml) + un équipement injoignable
 * pour voir une alerte dès le démarrage.
 */
async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@supervision.local' },
    update: {},
    create: { email: 'admin@supervision.local', name: 'Admin NOC', passwordHash: await bcrypt.hash('Admin123!', 10) },
  });
  if ((await prisma.device.count()) > 0) return;

  await prisma.device.createMany({
    data: [
      { name: 'R-SIEGE', host: 'sim-routeur-siege', type: DeviceType.ROUTER, site: 'Siège', snmpEnabled: true },
      { name: 'SW-CORE-SIEGE', host: 'sim-switch-core', type: DeviceType.SWITCH, site: 'Siège', snmpEnabled: true },
      { name: 'SRV-WEB', host: 'sim-serveur-web', type: DeviceType.SERVER, site: 'Siège', snmpEnabled: true, latencyThresholdMs: 50 },
      { name: 'R-AGENCE', host: 'sim-routeur-agence', type: DeviceType.ROUTER, site: 'Agence', snmpEnabled: true },
      { name: 'IMPRIMANTE-RDC', host: 'sim-imprimante', type: DeviceType.PRINTER, site: 'Siège' },
      { name: 'BORNE-WIFI-HALL', host: '192.0.2.123', type: DeviceType.ACCESS_POINT, site: 'Siège' },
    ],
  });
  console.log('Seed OK — admin@supervision.local / Admin123!');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
