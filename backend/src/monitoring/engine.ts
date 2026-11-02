import { AlertType, DeviceState, Severity } from '@prisma/client';
import { InterfaceStatus } from './snmp';

/** Résultat brut d'un contrôle */
export interface Probe {
  reachable: boolean;
  latencyMs: number | null;
  snmp?: { ok: boolean; uptimeSeconds?: number; interfaces?: InterfaceStatus[] };
}

/** Ce que l'on sait de l'équipement avant ce contrôle */
export interface DeviceContext {
  state: DeviceState;
  consecutiveFailures: number;
  uptimeSeconds: number | null;
  latencyThresholdMs: number;
  snmpEnabled: boolean;
}

export interface AlertToOpen {
  type: AlertType;
  severity: Severity;
  message: string;
  /** Événement ponctuel : ouvert et résolu immédiatement (ex. redémarrage) */
  instant?: boolean;
}

export interface Evaluation {
  state: DeviceState;
  consecutiveFailures: number;
  open: AlertToOpen[];
  resolve: AlertType[];
}

/**
 * Moteur de décision, sans effet de bord (donc testable) :
 * calcule le nouvel état de l'équipement, les alertes à ouvrir et celles à clôturer.
 *
 * Anti-faux positifs : un équipement n'est déclaré DOWN qu'après `failuresBeforeDown`
 * échecs consécutifs ; entre-temps, rien ne change.
 */
export function evaluate(ctx: DeviceContext, probe: Probe, openAlerts: AlertType[], failuresBeforeDown = 2): Evaluation {
  const consecutiveFailures = probe.reachable ? 0 : ctx.consecutiveFailures + 1;

  if (!probe.reachable && consecutiveFailures < failuresBeforeDown) {
    return { state: ctx.state, consecutiveFailures, open: [], resolve: [] };
  }

  const wanted: AlertToOpen[] = [];

  if (!probe.reachable) {
    wanted.push({
      type: AlertType.DEVICE_DOWN,
      severity: Severity.CRITICAL,
      message: `Équipement injoignable (${consecutiveFailures} échecs consécutifs)`,
    });
  } else {
    if (probe.latencyMs !== null && probe.latencyMs > ctx.latencyThresholdMs) {
      wanted.push({
        type: AlertType.HIGH_LATENCY,
        severity: Severity.WARNING,
        message: `Latence élevée : ${probe.latencyMs} ms (seuil ${ctx.latencyThresholdMs} ms)`,
      });
    }
    if (ctx.snmpEnabled && probe.snmp && !probe.snmp.ok) {
      wanted.push({ type: AlertType.SNMP_UNREACHABLE, severity: Severity.WARNING, message: 'Le ping répond mais pas l’agent SNMP' });
    }
    if (probe.snmp?.ok) {
      // Seules les interfaces activées par l'administrateur mais tombées sont anormales
      const down = (probe.snmp.interfaces ?? []).filter((i) => i.adminUp && i.status === 'down');
      if (down.length) {
        wanted.push({
          type: AlertType.INTERFACE_DOWN,
          severity: Severity.WARNING,
          message: `Interface(s) tombée(s) : ${down.map((i) => i.name).join(', ')}`,
        });
      }
      const up = probe.snmp.uptimeSeconds;
      if (up !== undefined && ctx.uptimeSeconds !== null && up < ctx.uptimeSeconds) {
        wanted.push({ type: AlertType.REBOOT, severity: Severity.INFO, message: `Redémarrage détecté (uptime ${up} s)`, instant: true });
      }
    }
  }

  const wantedTypes = new Set(wanted.filter((w) => !w.instant).map((w) => w.type));
  const open = wanted.filter((w) => w.instant || !openAlerts.includes(w.type));
  const resolve = openAlerts.filter((t) => !wantedTypes.has(t));

  let state: DeviceState = DeviceState.UP;
  if (!probe.reachable) state = DeviceState.DOWN;
  else if (wanted.some((w) => w.severity === Severity.WARNING)) state = DeviceState.DEGRADED;

  return { state, consecutiveFailures, open, resolve };
}
