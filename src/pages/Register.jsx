import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage } from '../lib/api';
import './Login.css';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [needsInvite, setNeedsInvite] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/auth/config').then(({ data }) => setNeedsInvite(data.registration === 'invite')).catch(() => {});
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({ ...form, inviteCode: form.inviteCode || undefined });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Registrazione non riuscita'));
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <h2>Crea il tuo account</h2>
      <form onSubmit={handleSubmit}>
        <input type="text" placeholder="Nome" autoComplete="name" value={form.name} onChange={set('name')} required />
        <input type="email" placeholder="Email" autoComplete="email" value={form.email} onChange={set('email')} required />
        <div className="password-container">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password (almeno 8 caratteri)"
            autoComplete="new-password"
            minLength={8}
            value={form.password}
            onChange={set('password')}
            required
          />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {needsInvite && <input type="text" placeholder="Codice invito" value={form.inviteCode} onChange={set('inviteCode')} />}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Creazione in corso...' : 'Registrati'}</button>
        <p className="auth-footer">Hai già un account?<Link to="/login">Accedi</Link></p>
      </form>
    </div>
  );
};

export default Register;
