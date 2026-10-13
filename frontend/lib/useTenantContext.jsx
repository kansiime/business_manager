'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const user = useUser();
  const [data, setData] = useState({
    is_super: false,
    tenant: null,
    enabled_features: [],
    announcement: null,
    plan_status: null,
  });
  const [pages, setPages] = useState([]);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const lastFetchedRef = useRef(0);

  const fetchContext = useCallback(async () => {
    if (!user) { setReady(false); return; }
    try {
      const [ctx, myPages] = await Promise.all([
        api.get('/tenants/context/'),
        api.get('/auth/my-pages/'),
      ]);
      setData(ctx.data);
      setPages(myPages.data.pages || []);
      setRole(myPages.data.role || null);
      setError(null);
      lastFetchedRef.current = Date.now();
    } catch (e) {
      setError(e?.response?.status || 'network');
      console.error('[useTenantContext] failed', e);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFetchedRef.current > 30_000) fetchContext();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchContext]);

  return (
    <TenantContext.Provider value={{ ...data, pages, role, ready, error, refresh: fetchContext }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    return {
      is_super: false, tenant: null, enabled_features: [],
      announcement: null, plan_status: null,
      pages: [], role: null, ready: false, error: 'no-provider',
      refresh: () => {},
    };
  }
  return ctx;
}