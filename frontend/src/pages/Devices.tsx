import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Device, fmtTime, STATE_FR } from '../api';

const TYPES = ['ROUTER', 'SWITCH', 'FIREWALL', 'SERVER', 'ACCESS_POINT', 'PRINTER', 'OTHER'];
const empty = { name: '', host: '', type: 'ROUTER', site: '', snmpEnabled: true, snmpCommunity: 'public', latencyThresholdMs: 200 };

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => api<Device[]>('/devices').then(setDevices).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form, site: form.site || undefined, snmpCommunity: form.snmpCommunity || undefined, latencyThresholdMs: Number(form.latencyThresholdMs) };
      if (editing) await api(`/devices/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/devices', { method: 'POST', body: JSON.stringify(body) });
      setForm(empty);
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const edit = (d: Device) => {
    setEditing(d.id);
    setForm({ name: d.name, host: d.host, type: d.type, site: d.site ?? '', snmpEnabled: d.snmpEnabled, snmpCommunity: '', latencyThresholdMs: d.latencyThresholdMs });
  };

  const toggle = async (d: Device) => {
    await api(`/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !d.enabled }) });
    load();
  };

  const remove = async (d: Device) => {
    if (!confirm(`Supprimer ${d.name} et tout son historique ?`)) return;
    await api(`/devices/${d.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <>
      <h1>Équipements</h1>
      {error && <p className="error">{error}</p>}
      <form className="card form-grid" onSubmit={submit}>
        <label>Nom<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>IP ou nom DNS<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required /></label>
        <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Site<input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
        <label>Seuil de latence (ms)<input type="number" min={1} value={form.latencyThresholdMs} onChange={(e) => setForm({ ...form, latencyThresholdMs: Number(e.target.value) })} /></label>
        <label className="check"><input type="checkbox" checked={form.snmpEnabled} onChange={(e) => setForm({ ...form, snmpEnabled: e.target.checked })} /> SNMP v2c</label>
        {form.snmpEnabled && (
          <label>Communauté<input value={form.snmpCommunity} placeholder={editing ? '(inchangée)' : ''} onChange={(e) => setForm({ ...form, snmpCommunity: e.target.value })} /></label>
        )}
        <div className="row">
          <button>{editing ? 'Enregistrer' : 'Ajouter'}</button>
          {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(empty); }}>Annuler</button>}
        </div>
      </form>

      <table className="table">
        <thead><tr><th>Nom</th><th>Adresse</th><th>Type</th><th>Site</th><th>État</th><th>SNMP</th><th>Dernier contrôle</th><th></th></tr></thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id} className={d.enabled ? '' : 'disabled'}>
              <td><Link to={`/devices/${d.id}`}>{d.name}</Link></td>
              <td>{d.host}</td>
              <td>{d.type}</td>
              <td>{d.site ?? '—'}</td>
              <td><span className={`dot ${d.state}`} /> {STATE_FR[d.state]}</td>
              <td>{d.snmpEnabled ? 'oui' : 'non'}</td>
              <td>{fmtTime(d.lastCheckAt)}</td>
              <td className="row">
                <button className="small ghost" onClick={() => edit(d)}>Modifier</button>
                <button className="small ghost" onClick={() => toggle(d)}>{d.enabled ? 'Désactiver' : 'Activer'}</button>
                <button className="small danger" onClick={() => remove(d)}>Supprimer</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
