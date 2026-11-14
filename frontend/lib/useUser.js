'use client';
import { useEffect, useState } from 'react';
import { SESSION_EVENT } from './session';

export function useUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const read = () => {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      setUser(raw ? JSON.parse(raw) : null);
    };
    read();
    // Update when another tab changes the user, or this tab signs in / out
    const onStorage = (e) => {
      if (e.key === 'user') read();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SESSION_EVENT, read);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SESSION_EVENT, read);
    };
  }, []);

  return user;
}

export function hasRole(user, ...roles) {
  return user && roles.includes(user.role);
}

export const can = {
  manageUsers: (u) => hasRole(u, 'admin'),
  editDebts: (u) => hasRole(u, 'admin', 'manager'),
  createDebts: (u) => hasRole(u, 'admin', 'manager'),
  viewExpenses: (u) => hasRole(u, 'admin', 'manager'),
  viewSuppliers: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  viewInventoryCost: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  reconcile: (u) => hasRole(u, 'admin'),
  createReturns: (u) => hasRole(u, 'admin', 'manager', 'storekeeper'),
  recordPayment: (u) => hasRole(u, 'admin', 'manager', 'cashier'),
};