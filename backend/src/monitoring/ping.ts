import { execFile } from 'child_process';

export interface PingResult {
  alive: boolean;
  latencyMs: number | null;
}

const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-:]{0,253}$/;

export function isValidHost(host: string): boolean {
  return HOST_RE.test(host);
}

/** Analyse la sortie de ping (Linux, BusyBox, Windows FR/EN) */
export function parsePingOutput(stdout: string): PingResult {
  // Windows affiche « Impossible de joindre l'hôte » avec un code retour 0 : on exige le TTL
  const alive = /ttl[=:]\s*\d+/i.test(stdout);
  if (!alive) return { alive: false, latencyMs: null };
  const m = /(?:time|temps)\s*[=<]\s*([\d.,]+)\s*ms/i.exec(stdout);
  return { alive: true, latencyMs: m ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) / 100 : null };
}

/** Ping ICMP via la commande système (execFile : aucune interprétation par un shell) */
export function ping(host: string, timeoutMs = 2000): Promise<PingResult> {
  if (!isValidHost(host)) return Promise.resolve({ alive: false, latencyMs: null });
  const args =
    process.platform === 'win32'
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];

  return new Promise((resolve) => {
    execFile('ping', args, { timeout: timeoutMs + 1500, windowsHide: true }, (_err, stdout) => {
      resolve(parsePingOutput(String(stdout ?? '')));
    });
  });
}
