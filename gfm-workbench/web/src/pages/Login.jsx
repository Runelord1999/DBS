import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBanner } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-5">
          <h1 className="text-xl font-bold">GFM Delivery Workbench</h1>
          <p className="text-[0.8125rem] secondary mt-1">
            Portfolio, capacity and demand for the GFM PM and Biz Lead teams.
          </p>
        </div>

        <form className="card card-pad space-y-3" onSubmit={submit}>
          <label className="block">
            <span className="label">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

          <button className="btn btn-primary w-full justify-center" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-[0.6875rem] muted mt-4 leading-relaxed">
          Email and password sign-in is the MVP mechanism. Directory / SSO
          integration is a Phase 2 infrastructure conversation, not a built-in
          feature of this version.
        </p>
      </div>
    </div>
  );
}
