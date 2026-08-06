import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { api, IS_DEMO, setToken } from './api.js';
import { getPersonas, setPersona, startDemoServer } from '@demo';

const AuthContext = createContext(null);

/**
 * Access roles, and what each one is for (Build Brief Section 2). Screens are
 * built differently per role rather than being one view behind a filter.
 */
export const ROLE_LABELS = {
  admin: 'Admin',
  pm: 'Project Manager',
  biz_lead: 'Biz Lead / Analyst',
  resource: 'Resourced team member',
  psc: 'PSC / Senior management',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [person, setPerson] = useState(null);
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState([]);

  const load = useCallback(async () => {
    try {
      // The demo has no password flow — it boots the in-browser API and adopts
      // a seeded persona, so the role switcher replaces the sign-in screen.
      if (IS_DEMO) {
        await startDemoServer();
        setPersonas(getPersonas());
      }
      const [me, ref] = await Promise.all([api.get('/auth/me'), api.get('/reference')]);
      setUser(me.user);
      setPerson(me.person);
      setReference(ref);
    } catch (err) {
      if (IS_DEMO) console.error('Demo failed to start', err);
      setUser(null);
      setPerson(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onUnauthorized = () => { setUser(null); setPerson(null); };
    window.addEventListener('gfm-unauthorized', onUnauthorized);
    return () => window.removeEventListener('gfm-unauthorized', onUnauthorized);
  }, [load]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setLoading(true);
    await load();
    return res.user;
  }, [load]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* the token is going anyway */ }
    setToken(null);
    setUser(null);
    setPerson(null);
  }, []);

  /** Demo only: adopt another seeded persona and re-read everything as them. */
  const switchPersona = useCallback(async (userId) => {
    setPersona(userId);
    setLoading(true);
    await load();
  }, [load]);

  const value = useMemo(() => ({
    user,
    person,
    reference,
    loading,
    login,
    logout,
    isDemo: IS_DEMO,
    personas,
    switchPersona,
    reloadReference: async () => setReference(await api.get('/reference')),
    isAdmin: user?.accessRole === 'admin',
    canEdit: ['admin', 'pm', 'biz_lead'].includes(user?.accessRole),
    isReadOnly: ['resource', 'psc'].includes(user?.accessRole),
  }), [user, person, reference, loading, login, logout, personas, switchPersona]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
