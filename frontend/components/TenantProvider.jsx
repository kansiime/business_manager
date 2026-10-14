'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';
import { cachedContext } from '@/lib/session';
import { TenantContextObject } from '@/lib/useTenantContext';

const EMPTY = {
  is_super: false,
  tenant: null,
  enabled_features: [],
  announcement: null,
  plan_status: null,
  pages: [],
  role: null,
};

export default function TenantProvider({ children }) {
  const user = useUser();
  const [data, setData] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const lastFetchedRef = useRef(0);

  const apply = (ctx) => {
    setData({ ...EMPTY, ...ctx });
    localStorage.setItem('tenant_context', JSON.stringify(ctx));
  };

  const fetchContext = useCallback(async () => {
    if (!user) {
      setReady(false);
      return;
    }
    try {
      // One request: business, features, pages, announcement, plan status
      const ctx = await api.get('/tenants/context/');
      apply(ctx.data);
      setError(null);
      lastFetchedRef.current = Date.now();
    } catch (e) {
      setError(e?.response?.status || 'network');
      console.error('[TenantProvider] failed to load context', e);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Render immediately from the context saved at login / last visit,
    // then refresh it in the background.
    const cached = cachedContext();
    if (cached) {
      setData({ ...EMPTY, ...cached });
      setReady(true);
    }
    fetchContext();
  }, [user, fetchContext]);

  // Refetch when the tab regains focus (throttled)
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFetchedRef.current > 30_000) {
        fetchContext();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchContext]);

  const value = {
    ...data,
    pages: data.pages || [],
    role: data.role || null,
    ready,
    error,
    refresh: fetchContext,
  };

  return (
    <TenantContextObject.Provider value={value}>
      {children}
    </TenantContextObject.Provider>
  );
}
