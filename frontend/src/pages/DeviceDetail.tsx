import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, ALERT_FR, api, Device, fmtDuration, fmtTime, since, STATE_FR, subscribe } from '../api';

interface History {
  hours: number;
  availability: number | null;
  avgLatencyMs: number | null;
  checks: { createdAt: string; reachable: boolean; latencyMs: number | null }[];
}

export default function DeviceDetail() {
  const { id } = useParams();
  const [d, setD] = useState<Device | null>(null);
  const [h, setH] = useState<History | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Device>(`/devices/${id}`).then(setD).catch((e) => setError(e.message));
    api<History>(`/devices/${id}/history?hours=${hours}`).then(setH);
    api<Alert[]>(`/alerts?status=all&deviceId=${id}`).then(setAlerts);
  }, [id, hours]);

  useEffect(() => {
    load();
    return subscribe((e) => {
      if ((e.kind === 'device' || e.kind === 'alert') && String(e.deviceId) === id) load();
    });
  }, [load, id]);

  const checkNow = async () => {
    setBusy(true);
    try {
      await api(`/devices/${id}/check`, { method: 'POST' });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <p>{error || 'Chargement…'}</p>;
  const data = (h?.checks ?? []).map((c) => ({
    t: new Date(c.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    latence: c.reachable ? c.latencyMs : null,
  }));

  return (
    <>
      <p><Link to="/">← Vue d'ensemble</Link></p>
      <header className="page-head">
        <h1><span className={`dot ${d.state}`} /> {d.name}</h1>
        <button onClick={checkNow} disabled={busy}>{busy ? 'Contrôle…' : 'Tester maintenant'}</button>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="kpis">
        <div className={`kpi ${d.state}`}><strong>{STATE_FR[d.state]}</strong><span>depuis {since(d.lastChangeAt)}</span></div>
        <div className="kpi"><strong>{h && h.availability !== null ? `${h.availability} %` : '—'}</strong><span>disponibilité {hours} h</span></div>
        <div className="kpi"><strong>{h && h.avgLatencyMs !== null ? `${h.avgLatencyMs} ms` : '—'}</strong><span>latence moyenne</span></div>
        <div className="kpi"><strong>{fmtDuration(d.uptimeSeconds)}</strong><span>uptime (SNMP)</span></div>
      </div>

      <div className="card">
        <div className="page-head">
          <h2>Latence (ms)</h2>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>1 heure</option>
            <option value={24}>24 heures</option>
            <option value={168}>7 jours</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="t" fontSize={11} stroke="#94a3b8" minTickGap={40} />
            <YAxis fontSize={11} stroke="#94a3b8" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            <ReferenceLine y={d.latencyThresholdMs} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'seuil', fill: '#f59e0b', fontSize: 11 }} />
            <Line type="monotone" dataKey="latence" stroke="#38bdf8" dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="muted small">Les trous dans la courbe correspondent aux contrôles sans réponse.</p>
      </div>

      <div className="split">
        <div className="card">
          <h2>Informations</h2>
          <dl>
            <dt>Adresse</dt><dd>{d.host}</dd>
            <dt>Type / site</dt><dd>{d.type} · {d.site ?? '—'}</dd>
            <dt>Dernier contrôle</dt><dd>{fmtTime(d.lastCheckAt)}</dd>
            <dt>SNMP</dt><dd>{d.snmpEnabled ? `v2c, port ${d.snmpPort}` : 'désactivé'}</dd>
            <dt>sysName</dt><dd>{d.sysName ?? '—'}</dd>
            <dt>sysDescr</dt><dd className="small">{d.sysDescr ?? '—'}</dd>
          </dl>
          {d.interfaces && d.interfaces.length > 0 && (
            <>
              <h3>Interfaces</h3>
              <table className="table">
                <thead><tr><th>Interface</th><th>Admin</th><th>État</th></tr></thead>
                <tbody>
                  {d.interfaces.map((i) => (
                    <tr key={i.index}>
                      <td>{i.name}</td>
                      <td>{i.adminUp ? 'activée' : 'désactivée'}</td>
                      <td><span className={`dot ${i.status === 'up' ? 'UP' : i.adminUp ? 'DOWN' : 'UNKNOWN'}`} /> {i.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="card">
          <h2>Historique des alertes</h2>
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.id} className={`sev-${a.severity} ${a.resolvedAt ? 'resolved' : ''}`}>
                <div><span className="tag">{ALERT_FR[a.type]}</span> {a.message}</div>
                <small className="muted">{fmtTime(a.startedAt)} → {a.resolvedAt ? fmtTime(a.resolvedAt) : 'en cours'}</small>
              </li>
            ))}
            {alerts.length === 0 && <li className="muted">Aucune alerte</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
