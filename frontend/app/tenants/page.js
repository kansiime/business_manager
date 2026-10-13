'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { usePagination } from '@/lib/usePagination';
import { useUser } from '@/lib/useUser';
import { useToast } from '@/components/Toast';

export default function TenantsPage() {
  const user = useUser();
  const toast = useToast();

  const [tenants, setTenants] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selected, setSelected] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [t, b] = await Promise.all([
        api.get('/tenants/'),
        api.get('/tenants/business-types/'),
      ]);
      setTenants(t.data);
      setBusinessTypes(b.data);
    } catch {
      toast.error('Could not load tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'super') load();
    // eslint-disable-next-line
  }, [user]);

  if (user && user.role !== 'super') {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
          <p className="text-sm text-slate-500 mt-1">
            Only platform administrators can manage businesses.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filterType !== 'all' && t.business_type_slug !== filterType) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPlan !== 'all' && t.plan !== filterPlan) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.owner_email || '').toLowerCase().includes(q) ||
        (t.owner_phone || '').toLowerCase().includes(q) ||
        (t.owner_name || '').toLowerCase().includes(q)
      );
    });
  }, [tenants, search, filterType, filterStatus, filterPlan]);

  const pg = usePagination(filtered, pageSize);

  // ------------------------------------------------------------------
  // Selection helpers
  // ------------------------------------------------------------------
  const toggleSelect = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const allVisibleSelected =
    pg.pageItems.length > 0 && pg.pageItems.every((t) => selected.includes(t.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((s) => s.filter((id) => !pg.pageItems.find((t) => t.id === id)));
    } else {
      setSelected((s) => [...new Set([...s, ...pg.pageItems.map((t) => t.id)])]);
    }
  };

  // ------------------------------------------------------------------
  // Bulk actions
  // ------------------------------------------------------------------
  const bulk = async (action) => {
    if (selected.length === 0) return;
    const verbs = {
      activate: 'activate',
      suspend: 'suspend',
      block: 'block',
      unblock: 'unblock',
      delete: 'permanently DELETE',
    };
    if (!confirm(`Are you sure you want to ${verbs[action]} ${selected.length} business(es)?`)) return;

    try {
      await api.post('/tenants/bulk-action/', { ids: selected, action });
      toast.success(`${selected.length} business(es) updated`);
      setSelected([]);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(d?.detail || 'Bulk action failed.');
    }
  };

  const badgeClass = (status) => {
    if (status === 'active') return 'badge badge-green';
    if (status === 'trial') return 'badge badge-amber';
    if (status === 'blocked') return 'badge badge-red';
    if (status === 'suspended') return 'badge badge-red';
    return 'badge badge-gray';
  };

  const planBadge = (plan) => {
    const cls = {
      power: 'badge badge-blue',
      growth: 'badge badge-blue',
      starter: 'badge badge-green',
      trial: 'badge badge-amber',
    }[plan] || 'badge badge-gray';
    return <span className={cls}>{plan}</span>;
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Businesses</h1>
          <p className="text-sm text-slate-500 mt-1">
            {tenants.length} business{tenants.length !== 1 && 'es'} on the platform
            {filtered.length !== tenants.length && ` — ${filtered.length} match your filters`}
          </p>
        </div>
        <Link href="/tenants/new" className="btn btn-primary">+ Add Business</Link>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label>Search</label>
            <input
              placeholder="Name, slug, owner, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label>Business Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All types</option>
              {businessTypes.map((bt) => (
                <option key={bt.slug} value={bt.slug}>
                  {bt.icon} {bt.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
              <option value="blocked">Blocked</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label>Plan</label>
            <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}>
              <option value="all">All plans</option>
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="power">Power</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="mb-0">Show per page:</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              style={{ width: 'auto' }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          {(search || filterType !== 'all' || filterStatus !== 'all' || filterPlan !== 'all') && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearch('');
                setFilterType('all');
                setFilterStatus('all');
                setFilterPlan('all');
              }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-blue-900">
            {selected.length} selected
          </span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <button className="btn btn-primary btn-sm" onClick={() => bulk('activate')}>
              ✓ Activate
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulk('suspend')}>
              ⏸ Suspend
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => bulk('block')}>
              🚫 Block
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulk('unblock')}>
              ✅ Unblock
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => bulk('delete')}>
              🗑 Delete
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 mb-4">Loading businesses…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                  title="Select all on this page"
                />
              </th>
              <th>Business</th>
              <th>Type</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Users</th>
              <th>Products</th>
              <th>Owner</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="text-center text-slate-400 py-8">
                  {search || filterType !== 'all' || filterStatus !== 'all' || filterPlan !== 'all'
                    ? 'No businesses match your filters.'
                    : 'No businesses yet — click "Add Business" to create one.'}
                </td>
              </tr>
            )}
            {pg.pageItems.map((t) => (
              <tr key={t.id} className={selected.includes(t.id) ? 'bg-blue-50/40' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    className="w-4 h-4 cursor-pointer"
                  />
                </td>
                <td>
                  <Link
                    href={`/tenants/${t.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {t.business_type_icon} {t.name}
                  </Link>
                  <p className="text-xs text-slate-400 mt-0.5">{t.slug}</p>
                </td>
                <td className="text-sm text-slate-600 whitespace-nowrap">
                  {t.business_type_name || '—'}
                </td>
                <td>{planBadge(t.plan)}</td>
                <td>
                  <span className={badgeClass(t.status)}>{t.status}</span>
                </td>
                <td className="text-right">{t.user_count ?? 0}</td>
                <td className="text-right">{t.product_count ?? 0}</td>
                <td className="text-sm text-slate-600">
                  {t.owner_name || t.owner_email || t.owner_phone || '—'}
                </td>
                <td className="text-sm text-slate-500 whitespace-nowrap">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`/tenants/${t.id}`} className="btn btn-secondary btn-sm">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pg.page}
        totalPages={pg.totalPages}
        goTo={pg.setPage}
        startIndex={pg.startIndex}
        endIndex={pg.endIndex}
        totalItems={filtered.length}
        label="businesses"
      />
    </ProtectedRoute>
  );
}