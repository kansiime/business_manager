'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';
import { TenantContextObject } from '@/lib/useTenantContext';

export default function TenantProvider({ children }) {
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
  const [loading, setLoading] = useState(true);   // renamed from `ready`
  const [error, setError] = useState(null);
  const lastFetchedRef = useRef(0);

  const fetchContext = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      console.error('[TenantProvider] failed to load context', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  // Refetch on focus, throttled
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetchedRef.current > 30_000) fetchContext();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchContext]);

  const value = {
    ...data,
    pages,
    role,
    loading,
    // Backwards-compat with existing call sites that check `ready`
    ready: true,
    error,
    refresh: fetchContext,
  };

  return (
    <TenantContextObject.Provider value={value}>
      {children}
    </TenantContextObject.Provider>
  );
}