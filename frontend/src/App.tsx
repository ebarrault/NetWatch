import { FormEvent, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, getToken, subscribe } from './api';
import Alerts from './pages/Alerts';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import Devices from './pages/Devices';

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('admin@supervision.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ accessToken: string; user: { name: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('token', r.accessToken);
      localStorage.setItem('name', r.user.name);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="login">
      <form className="card form" onSubmit={submit}>
        <h1>◉ Supervision</h1>
        <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        {error && <p className="error">{error}</p>}
        <button>Connexion</button>
        <p className="muted small">Démo : admin@supervision.local / Admin123!</p>
      </form>
    </div>
  );
}

export default function App() {
  const [logged, setLogged] = useState(!!getToken());
  const [lastCycle, setLastCycle] = useState<string | null>(null);

  useEffect(() => {
    if (!logged) return;
    return subscribe((e) => {
      if (e.kind === 'cycle') setLastCycle(new Date(e.at).toLocaleTimeString('fr-FR'));
    });
  }, [logged]);

  if (!logged) return <Login onLogin={() => setLogged(true)} />;
  return (
    <div className="layout">
      <header className="topbar">
        <strong>◉ Supervision réseau</strong>
        <nav>
          <NavLink to="/" end>Vue d'ensemble</NavLink>
          <NavLink to="/alerts">Alertes</NavLink>
          <NavLink to="/devices">Équipements</NavLink>
        </nav>
        <span className="live">{lastCycle ? <>● en direct · dernier cycle {lastCycle}</> : '○ connexion…'}</span>
        <button className="link" onClick={() => { localStorage.clear(); setLogged(false); }}>{localStorage.getItem('name')} · quitter</button>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
