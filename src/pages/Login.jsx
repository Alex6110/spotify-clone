import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { APP_NAME } from '../lib/config';
import './Login.css';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Accesso non riuscito'));
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <h2>Accedi a {APP_NAME}</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="password-container">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="login-btn" disabled={busy}>{busy ? 'Accesso in corso...' : 'Entra'}</button>
        <p className="auth-footer">Non hai un account?<Link to="/register">Iscriviti</Link></p>
      </form>
    </div>
  );
};

export default Login;
