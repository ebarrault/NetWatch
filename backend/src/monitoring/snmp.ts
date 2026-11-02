import * as snmp from 'net-snmp';

export const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
};

export interface InterfaceStatus {
  index: number;
  name: string;
  adminUp: boolean;
  status: 'up' | 'down' | 'other';
}

export interface SnmpResult {
  ok: boolean;
  error?: string;
  sysName?: string;
  sysDescr?: string;
  uptimeSeconds?: number;
  interfaces?: InterfaceStatus[];
}

/** ifOperStatus : 1 up, 2 down, 3 testing, 5 dormant, 7 lowerLayerDown… */
export function operStatus(v: number): InterfaceStatus['status'] {
  if (v === 1) return 'up';
  if (v === 2 || v === 7) return 'down';
  return 'other';
}

/** Combine les trois colonnes de ifTable en une liste d'interfaces */
export function buildInterfaces(
  descr: Map<number, string>,
  admin: Map<number, number>,
  oper: Map<number, number>,
): InterfaceStatus[] {
  return [...descr.entries()]
    .map(([index, name]) => ({
      index,
      name,
      adminUp: admin.get(index) === 1,
      status: operStatus(oper.get(index) ?? 0),
    }))
    .filter((i) => !/^(lo|Null|Loopback)/i.test(i.name)) // ignore les interfaces virtuelles
    .sort((a, b) => a.index - b.index);
}

const toText = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('utf8') : String(v ?? ''));

function getAsync(session: snmp.Session, oids: string[]) {
  return new Promise<snmp.Varbind[]>((resolve, reject) =>
    session.get(oids, (err, vbs) => (err ? reject(err) : resolve(vbs))),
  );
}

function walkColumn(session: snmp.Session, oid: string) {
  return new Promise<Map<number, unknown>>((resolve, reject) => {
    const out = new Map<number, unknown>();
    session.subtree(
      oid,
      20,
      (vbs) => {
        for (const vb of vbs) {
          if (snmp.isVarbindError(vb)) continue;
          out.set(Number(vb.oid.split('.').pop()), vb.value);
        }
      },
      (err) => (err ? reject(err) : resolve(out)),
    );
  });
}

/** Interroge un équipement en SNMP v2c (lecture seule) */
export async function snmpPoll(host: string, community: string, port = 161, timeoutMs = 2000): Promise<SnmpResult> {
  const session = snmp.createSession(host, community, { port, version: snmp.Version2c, timeout: timeoutMs, retries: 1 });
  session.on('error', () => undefined);
  try {
    const vbs = await getAsync(session, [OID.sysDescr, OID.sysUpTime, OID.sysName]);
    const [descr, uptime, name] = vbs.map((vb) => (snmp.isVarbindError(vb) ? undefined : vb.value));

    const [ifDescr, ifAdmin, ifOper] = await Promise.all([
      walkColumn(session, OID.ifDescr),
      walkColumn(session, OID.ifAdminStatus),
      walkColumn(session, OID.ifOperStatus),
    ]);

    return {
      ok: true,
      sysDescr: descr !== undefined ? toText(descr).slice(0, 255) : undefined,
      sysName: name !== undefined ? toText(name) : undefined,
      uptimeSeconds: typeof uptime === 'number' ? Math.floor(uptime / 100) : undefined, // TimeTicks = 1/100 s
      interfaces: buildInterfaces(
        new Map([...ifDescr].map(([k, v]) => [k, toText(v)])),
        new Map([...ifAdmin].map(([k, v]) => [k, Number(v)])),
        new Map([...ifOper].map(([k, v]) => [k, Number(v)])),
      ),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    session.close();
  }
}
