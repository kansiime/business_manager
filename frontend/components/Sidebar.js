'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';
import { useTenantContext } from '@/lib/useTenantContext';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { enabled_features, is_super, tenant, ready, pages } = useTenantContext();

  const [open, setOpen] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  const isSuper = user?.role === 'super';
  const features = enabled_features || [];
  const myPages = pages || [];

  const brand = isSuper ? 'Business Manager' : (tenant?.name || 'Business Manager');
  const brandIcon = isSuper ? '⚡' : '🏪';

  // Debt promise badge
  useEffect(() => {
    if (isSuper || !myPages.includes('debts') || !features.includes('debts')) {
      setDueCount(0);
      return;
    }
    const fetch_ = () => {
      api.get('/debts/promises/')
        .then((r) => setDueCount(r.data?.total_due || 0))
        .catch(() => {});
    };
    fetch_();
    const t = setInterval(fetch_, 60000);
    return () => clearInterval(t);
  }, [pathname, features, myPages, isSuper]);

  // Close mobile drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  const superLinks = [
    {
      section: 'Platform',
      links: [
        { href: '/dashboard', label: 'Platform',   icon: '📊' },
        { href: '/tenants',   label: 'Businesses', icon: '🏢' },
        { href: '/settings',  label: 'Settings',   icon: '⚙️' },
      ],
    },
  ];

  const tenantSections = [
    {
      section: 'Overview',
      links: [
        { href: '/dashboard',    key: 'dashboard',    label: 'Dashboard',    icon: '📊' },
        { href: '/ai-analytics', key: 'ai-analytics', label: 'AI Analytics', icon: '🤖', feature: 'inventory' },
        { href: '/reports',      key: 'reports',      label: 'Reports',      icon: '📈', feature: 'reports' },
      ],
    },
    {
      section: 'Sales',
      links: [
        { href: '/sales',     key: 'sales',     label: 'Sales',     icon: '💰', feature: 'sales' },
        { href: '/customers', key: 'customers', label: 'Customers', icon: '👥', feature: 'customers' },
        { href: '/debts',     key: 'debts',     label: 'Debts',     icon: '🧾', feature: 'debts', badge: dueCount },
      ],
    },
    {
      section: 'Stock',
      links: [
        { href: '/inventory',        key: 'inventory',        label: 'Inventory',       icon: '📦', feature: 'inventory' },
        { href: '/purchases',        key: 'purchases',        label: 'Purchases',       icon: '🛒', feature: 'purchases' },
        { href: '/suppliers',        key: 'suppliers',        label: 'Suppliers',       icon: '🏢', feature: 'inventory' },
        { href: '/returns',          key: 'returns',          label: 'Returns',         icon: '↩️', feature: 'returns' },
        { href: '/reconciliation',   key: 'reconciliation',   label: 'Reconciliation',  icon: '⚖️', feature: 'reconciliation' },
        { href: '/product-movement', key: 'product-movement', label: 'Movement',        icon: '📊', feature: 'inventory' },
      ],
    },
    {
      // Clinic section: every item now requires 'appointments'.
      // This makes it disappear completely for non-clinic tenants (Agro, Garage, ...).
      section: 'Clinic',
      links: [
        { href: '/reception',     key: 'reception',     label: 'Reception',    icon: '🩺', feature: 'appointments' },
        { href: '/patients',      key: 'patients',      label: 'Patients',     icon: '🧑‍⚕️', feature: 'appointments' },
        { href: '/appointments',  key: 'appointments',  label: 'Appointments', icon: '📅', feature: 'appointments' },
        { href: '/consultations', key: 'consultations', label: 'Visits',       icon: '🩺', feature: 'appointments' },
        { href: '/schedule',      key: 'schedule',      label: 'Schedule',     icon: '🗓️', feature: 'appointments' },
        { href: '/lab',           key: 'lab',           label: 'Lab',          icon: '🔬', feature: 'appointments' },
        { href: '/pharmacy',      key: 'pharmacy',      label: 'Pharmacy',     icon: '💊', feature: 'appointments' },
        { href: '/prescriptions', key: 'prescriptions', label: 'Rx',           icon: '💊', feature: 'appointments' },
        { href: '/billing',       key: 'billing',       label: 'Billing',      icon: '💰', feature: 'appointments' },
        { href: '/doctors',       key: 'doctors',       label: 'Staff',        icon: '🩺', feature: 'appointments' },
        { href: '/services',      key: 'services',      label: 'Services',     icon: '🏥', feature: 'appointments' },
      ],
    },
    {
      section: 'Finance',
      links: [
        { href: '/expenses',        key: 'expenses',        label: 'Expenses',        icon: '💸', feature: 'expenses' },
        { href: '/sales-per-staff', key: 'sales-per-staff', label: 'Sales Per Staff', icon: '👥', feature: 'sales' },
      ],
    },
    {
      section: 'Admin',
      links: [
        { href: '/users',    key: 'users',    label: 'Users',    icon: '🔐' },
        { href: '/settings', key: 'settings', label: 'Settings', icon: '⚙️' },
      ],
    },
  ];

  const canPage = (key) => myPages.includes(key) || key === 'settings';
  const canFeature = (feature) => !feature || features.includes(feature);

  const sections = isSuper
    ? superLinks
    : tenantSections
        .map((s) => ({
          section: s.section,
          links: s.links.filter(
            (l) => ready && canPage(l.key) && canFeature(l.feature)
          ),
        }))
        .filter((s) => s.links.length > 0);

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 flex items-center justify-between px-4 h-14">
        <button
          onClick={() => setOpen(true)}
          className="text-slate-700 text-2xl p-1"
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0">
            {brandIcon}
          </div>
          <span className="font-bold text-slate-900 truncate text-sm">{brand}</span>
        </div>
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
          {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-72 lg:w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Brand header */}
        <div className="px-4 h-16 flex items-center justify-between border-b border-slate-200 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
              {brandIcon}
            </div>
            <span className="font-bold text-slate-900 truncate text-sm">{brand}</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 overscroll-contain">
          {!ready && (
            <p className="px-4 py-2 text-xs text-slate-400">Loading menu…</p>
          )}
          {sections.map((s) => (
            <div key={s.section} className="mb-2">
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {s.section}
              </p>
              {s.links.map((l) => {
                const active =
                  pathname === l.href || pathname.startsWith(l.href + '/');
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`mx-2 my-0.5 px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{l.icon}</span>
                    <span className="truncate flex-1">{l.label}</span>
                    {l.badge > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center flex-shrink-0">
                        {l.badge > 99 ? '99+' : l.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {user?.username || 'User'}
              </p>
              <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium"
          >
            🚪 Logout
          </button>
        </div>
      </aside>
    </>
  );
}