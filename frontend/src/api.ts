const BASE = import.meta.env.VITE_API_URL ?? '/api';
export const getToken = () => localStorage.getItem('token');

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    window.location.href = '/';
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((Array.isArray(body.message) ? body.message.join(', ') : body.message) || res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Abonnement au flux temps réel ; renvoie la fonction de désabonnement */
export function subscribe(onEvent: (e: LiveEvent) => void): () => void {
  const es = new EventSource(`${BASE}/events?token=${encodeURIComponent(getToken() ?? '')}`);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}

export type State = 'UNKNOWN' | 'UP' | 'DEGRADED' | 'DOWN';
export type LiveEvent =
  | { kind: 'device'; deviceId: number; state: State; latencyMs: number | null; at: string }
  | { kind: 'alert'; alertId: number; deviceId: number; status: string; type: string; message: string; at: string }
  | { kind: 'cycle'; checked: number; durationMs: number; at: string };

export interface Iface {
  index: number;
  name: string;
  adminUp: boolean;
  status: 'up' | 'down' | 'other';
}

export interface Device {
  id: number;
  name: string;
  host: string;
  type: string;
  site: string | null;
  enabled: boolean;
  snmpEnabled: boolean;
  snmpPort: number;
  latencyThresholdMs: number;
  state: State;
  lastCheckAt: string | null;
  lastChangeAt: string | null;
  lastLatencyMs: number | null;
  sysName: string | null;
  sysDescr: string | null;
  uptimeSeconds: number | null;
  interfaces: Iface[] | null;
  openAlerts?: number;
}

export interface Alert {
  id: number;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  device: { id: number; name: string; site: string | null };
}

export const STATE_FR: Record<State, string> = { UNKNOWN: 'Inconnu', UP: 'Disponible', DEGRADED: 'Dégradé', DOWN: 'Hors ligne' };
export const TYPE_ICON: Record<string, string> = { ROUTER: '⇄', SWITCH: '⇶', FIREWALL: '⛨', SERVER: '▤', ACCESS_POINT: '◉', PRINTER: '⎙', OTHER: '◇' };
export const ALERT_FR: Record<string, string> = {
  DEVICE_DOWN: 'Hors ligne',
  HIGH_LATENCY: 'Latence',
  SNMP_UNREACHABLE: 'SNMP',
  INTERFACE_DOWN: 'Interface',
  REBOOT: 'Redémarrage',
};

export const fmtTime = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }) : '—');
export function fmtDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
export function since(d: string | null): string {
  if (!d) return '—';
  return fmtDuration(Math.floor((Date.now() - new Date(d).getTime()) / 1000));
}
