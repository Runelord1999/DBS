import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { api, setToken } from './api.js';

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

  const load = useCallback(async () => {
    try {
      const [me, ref] = await Promise.all([api.get('/auth/me'), api.get('/reference')]);
      setUser(me.user);
      setPerson(me.person);
      setReference(ref);
    } catch {
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

  const value = useMemo(() => ({
    user,
    person,
    reference,
    loading,
    login,
    logout,
    reloadReference: async () => setReference(await api.get('/reference')),
    isAdmin: user?.accessRole === 'admin',
    canEdit: ['admin', 'pm', 'biz_lead'].includes(user?.accessRole),
    isReadOnly: ['resource', 'psc'].includes(user?.accessRole),
  }), [user, person, reference, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
