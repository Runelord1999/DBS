import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Fetch-and-hold. On refetch the previous render is kept and marked stale
 * rather than being replaced by a skeleton, so filter changes do not flash.
 */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    if (data !== null) setStale(true); else setLoading(true);
    try {
      const result = await api.get(path);
      if (ticket === latest.current) { setData(result); setError(null); }
    } catch (err) {
      if (ticket === latest.current) setError(err);
    } finally {
      if (ticket === latest.current) { setLoading(false); setStale(false); }
    }
    // `data` is intentionally out of the dependency list: it is read only to
    // decide between a skeleton and a hold, and including it would re-create
    // the callback on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => { load(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, stale, reload: load };
}

/** Builds a query string, dropping empty values. */
export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
