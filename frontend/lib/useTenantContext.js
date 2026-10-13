'use client';
import { createContext, useContext } from 'react';

const TenantContext = createContext(null);

export const TenantContextObject = TenantContext;

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    return {
      is_super: false,
      tenant: null,
      enabled_features: [],
      announcement: null,
      plan_status: null,
      pages: [],
      role: null,
      ready: false,
      error: 'no-provider',
      refresh: () => {},
    };
  }
  return ctx;
}