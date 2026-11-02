import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, ALERT_FR, api, Device, since, STATE_FR, subscribe, TYPE_ICON } from '../api';

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Device[]>('/devices').then(setDevices).catch((e) => setError(e.message));
    api<Alert[]>('/alerts?status=open').then(setAlerts).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return subscribe((e) => {
      if (e.kind === 'device') {
        setDevices((list) => list.map((d) => (d.id === e.deviceId ? { ...d, state: e.state, lastLatencyMs: e.latencyMs, lastCheckAt: e.at } : d)));
      }
      if (e.kind === 'alert') load();
    });
  }, [load]);

  const count = (s: string) => devices.filter((d) => d.enabled && d.state === s).length;
  const sites = [...new Set(devices.map((d) => d.site ?? 'Sans site'))];

  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="kpis">
        <div className="kpi UP"><strong>{count('UP')}</strong><span>disponibles</span></div>
        <div className="kpi DEGRADED"><strong>{count('DEGRADED')}</strong><span>dégradés</span></div>
        <div className="kpi DOWN"><strong>{count('DOWN')}</strong><span>hors ligne</span></div>
        <div className="kpi"><strong>{alerts.length}</strong><span>alertes ouvertes</span></div>
      </div>

      <div className="split">
        <section>
          {sites.map((site) => (
            <div key={site}>
              <h2>{site}</h2>
              <div className="tiles">
                {devices.filter((d) => (d.site ?? 'Sans site') === site).map((d) => (
                  <Link key={d.id} to={`/devices/${d.id}`} className={`tile ${d.enabled ? d.state : 'disabled'}`}>
                    <div className="tile-head">
                      <span className="icon">{TYPE_ICON[d.type]}</span>
                      <b>{d.name}</b>
                      {!!d.openAlerts && <span className="count">{d.openAlerts}</span>}
                    </div>
                    <small>{d.host}</small>
                    <div className="tile-foot">
                      <span>{d.enabled ? STATE_FR[d.state] : 'Désactivé'}</span>
                      <span>{d.lastLatencyMs !== null ? `${d.lastLatencyMs} ms` : '—'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="card">
          <h2>Alertes en cours</h2>
          {alerts.length === 0 && <p className="muted">Aucune alerte. Tout va bien.</p>}
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.id} className={`sev-${a.severity}`}>
                <div><b>{a.device.name}</b> <span className="tag">{ALERT_FR[a.type]}</span></div>
                <div>{a.message}</div>
                <small className="muted">depuis {since(a.startedAt)}{a.acknowledgedBy && ` · pris en charge par ${a.acknowledgedBy}`}</small>
              </li>
            ))}
          </ul>
          <Link to="/alerts">Toutes les alertes →</Link>
        </aside>
      </div>
    </>
  );
}
