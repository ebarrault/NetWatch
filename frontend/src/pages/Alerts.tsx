import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, ALERT_FR, api, fmtTime, subscribe } from '../api';

export default function Alerts() {
  const [status, setStatus] = useState('open');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => api<Alert[]>(`/alerts?status=${status}`).then(setAlerts).catch((e) => setError(e.message)), [status]);
  useEffect(() => {
    load();
    return subscribe((e) => e.kind === 'alert' && load());
  }, [load]);

  const ack = async (id: number) => {
    await api(`/alerts/${id}/ack`, { method: 'POST' });
    load();
  };

  return (
    <>
      <header className="page-head">
        <h1>Alertes</h1>
        <div className="tabs">
          {[['open', 'En cours'], ['resolved', 'Résolues'], ['all', 'Toutes']].map(([k, v]) => (
            <button key={k} className={status === k ? '' : 'ghost'} onClick={() => setStatus(k)}>{v}</button>
          ))}
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead><tr><th>Gravité</th><th>Équipement</th><th>Type</th><th>Message</th><th>Début</th><th>Fin</th><th>Prise en charge</th></tr></thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td><span className={`sev sev-${a.severity}`}>{a.severity}</span></td>
              <td><Link to={`/devices/${a.device.id}`}>{a.device.name}</Link></td>
              <td>{ALERT_FR[a.type]}</td>
              <td>{a.message}</td>
              <td>{fmtTime(a.startedAt)}</td>
              <td>{a.resolvedAt ? fmtTime(a.resolvedAt) : <b>en cours</b>}</td>
              <td>{a.acknowledgedBy ? `${a.acknowledgedBy}, ${fmtTime(a.acknowledgedAt)}` : !a.resolvedAt && <button className="small" onClick={() => ack(a.id)}>Prendre en charge</button>}</td>
            </tr>
          ))}
          {alerts.length === 0 && <tr><td colSpan={7} className="muted">Aucune alerte</td></tr>}
        </tbody>
      </table>
    </>
  );
}
