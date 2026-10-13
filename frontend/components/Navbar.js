'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useUser, can } from '@/lib/useUser';
import { useTenantContext } from '@/lib/useTenantContext';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { enabled_features, is_super, tenant, ready, pages } = useTenantContext();

  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const userMenuRef = useRef(null);

  const isSuper = user?.role === 'super';
  const features = enabled_features || [];
  const myPages = pages || [];

  const brand = isSuper ? 'Business Manager' : (tenant?.name || 'Business Manager');
  const brandIcon = isSuper ? '⚡' : '🏪';

  // ------------------------------------------------------------------
  // Debts promise badge
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isSuper || !myPages.includes('debts') || !features.includes('debts')) {
      setDueCount(0);
      return;
    }
    const fetchPromises = () => {
      api.get('/debts/promises/')
        .then((r) => setDueCount(r.data?.total_due || 0))
        .catch(() => {});
    };
    fetchPromises();
    const t = setInterval(fetchPromises, 60000);
    return () => clearInterval(t);
  }, [pathname, features, myPages, isSuper]);

  // Close user menu on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ------------------------------------------------------------------
  // Link definitions
  // ------------------------------------------------------------------
  const superLinks = [
    { href: '/dashboard', label: 'Platform',   icon: '📊' },
    { href: '/tenants',   label: 'Businesses', icon: '🏢' },
    { href: '/settings',  label: 'Settings',   icon: '⚙️' },
  ];

  const allTenantLinks = [
    // Operations
    { href: '/dashboard',        key: 'dashboard',        label: 'Dashboard',   icon: '📊' },
    { href: '/inventory',        key: 'inventory',        label: 'Inventory',   icon: '📦', feature: 'inventory' },
    { href: '/sales',            key: 'sales',            label: 'Sales',       icon: '💰', feature: 'sales' },
    { href: '/purchases',        key: 'purchases',        label: 'Purchases',   icon: '🛒', feature: 'purchases' },
    { href: '/debts',            key: 'debts',            label: 'Debts',       icon: '🧾', feature: 'debts', badge: dueCount },
    { href: '/customers',        key: 'customers',        label: 'Customers',   icon: '👥', feature: 'customers' },

    // Clinic
    { href: '/reception',        key: 'reception',        label: 'Reception',   icon: '🩺', feature: 'appointments' },
    { href: '/patients',         key: 'patients',         label: 'Patients',    icon: '🧑‍⚕️', feature: 'prescriptions' },
    { href: '/appointments',     key: 'appointments',     label: 'Appointments',icon: '📅', feature: 'appointments' },
    { href: '/consultations',    key: 'consultations',    label: 'Visits',      icon: '🩺', feature: 'prescriptions' },
    { href: '/schedule',         key: 'schedule',         label: 'Schedule',    icon: '🗓️', feature: 'appointments' },
    { href: '/lab',              key: 'lab',              label: 'Lab',         icon: '🔬', feature: 'prescriptions' },
    { href: '/pharmacy',         key: 'pharmacy',         label: 'Pharmacy',    icon: '💊', feature: 'prescriptions' },
    { href: '/prescriptions',    key: 'prescriptions',    label: 'Rx',          icon: '💊', feature: 'prescriptions' },
    { href: '/doctors',          key: 'doctors',          label: 'Staff',       icon: '🩺', feature: 'appointments' },
    { href: '/services',         key: 'services',         label: 'Services',    icon: '🏥', feature: 'appointments' },
    { href: '/billing',          key: 'billing',          label: 'Billing',     icon: '💰', feature: 'sales' },

    // Analytics + Reports
    { href: '/reports',          key: 'reports',          label: 'Reports',     icon: '📈', feature: 'reports' },
    { href: '/ai-analytics',     key: 'ai-analytics',     label: 'AI Analytics',icon: '🤖', feature: 'inventory' },
    { href: '/product-movement', key: 'product-movement', label: 'Movement',    icon: '📊', feature: 'inventory' },

    // Back-office
    { href: '/expenses',         key: 'expenses',         label: 'Expenses',    icon: '💸', feature: 'expenses' },
    { href: '/returns',          key: 'returns',          label: 'Returns',     icon: '↩️', feature: 'returns' },
    { href: '/reconciliation',   key: 'reconciliation',   label: 'Recon',       icon: '⚖️', feature: 'reconciliation' },
    { href: '/suppliers',        key: 'suppliers',        label: 'Suppliers',   icon: '🏢', feature: 'inventory' },

    // Admin
    { href: '/users',            key: 'users',            label: 'Users',       icon: '🔐' },
    { href: '/settings',         key: 'settings',         label: 'Settings',    icon: '⚙️' },
  ];

  // ------------------------------------------------------------------
  // Build the visible link list
  // ------------------------------------------------------------------
  let links = [];
  if (isSuper) {
    links = superLinks;
  } else if (ready) {
    const canPage = (key) => myPages.includes(key) || key === 'settings';
    const canFeature = (feature) => !feature || features.includes(feature);
    links = allTenantLinks.filter(
      (l) => canPage(l.key) && canFeature(l.feature)
    );
  }

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const refreshApp = () => {
    setUserMenuOpen(false);
    window.location.reload();
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top row — brand + user */}
        <div className="flex items-center justify-between h-14">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
              {brandIcon}
            </div>
            <span className="text-base font-bold text-slate-900 truncate max-w-[200px]">
              {brand}
            </span>
          </Link>

          {/* User dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="leading-tight hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-900 max-w-[110px] truncate">
                  {user?.username || 'User'}
                </p>
                <p className="text-[10px] text-slate-500 capitalize">
                  {user?.role}
                </p>
              </div>
              <span className="text-slate-500 text-xs">▾</span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {user?.username}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">
                    {user?.role}
                  </p>
                </div>

                {isSuper ? (
                  <>
                    <Link
                      href="/tenants"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      🏢 All Businesses
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      ⚙️ Platform Settings
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      ⚙️ Settings
                    </Link>
                    <Link
                      href="/users"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      👤 My Account
                    </Link>
                  </>
                )}

                <button
                  onClick={refreshApp}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                >
                  🔄 Refresh
                </button>

                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100"
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Second row — all module links */}
        {!isSuper && (
          <div className="hidden md:flex items-center gap-0.5 flex-wrap pb-2 -mt-1">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + '/');
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative px-2.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="mr-1">{l.icon}</span>
                  {l.label}
                  {l.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                      {l.badge > 99 ? '99+' : l.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Super-admin links (single row) */}
        {isSuper && (
          <div className="flex items-center gap-0.5 flex-wrap pb-2 -mt-1">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + '/');
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="mr-1">{l.icon}</span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Mobile menu */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden btn btn-secondary btn-sm w-full mb-2"
        >
          ☰ Menu ({links.length})
        </button>

        {menuOpen && (
          <div className="md:hidden pb-3 space-y-1 border-t border-slate-100 pt-3">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + '/');
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>
                    <span className="mr-2">{l.icon}</span>
                    {l.label}
                  </span>
                  {l.badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                      {l.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}