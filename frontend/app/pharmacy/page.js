'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function PharmacyPage() {
  const { enabled_features } = useTenantContext();
  const canUse =
    enabled_features.includes('batch_tracking') ||
    enabled_features.includes('expiry') ||
    enabled_features.includes('prescriptions');

  const [tab, setTab] = useState('queue');

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Pharmacy management is only for clinics and pharmacies.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">💉 Pharmacy</h1>
        <p className="text-sm text-slate-500 mt-1">
          Dispense prescriptions and manage drug stock
        </p>
      </div>

      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1">
          <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')}>
            🩺 Dispense Queue
          </TabBtn>
          <TabBtn active={tab === 'stock'} onClick={() => setTab('stock')}>
            📦 Stock & Expiry
          </TabBtn>
        </div>
      </div>

      {tab === 'queue' && <DispenseQueue />}
      {tab === 'stock' && <StockView />}
    </ProtectedRoute>
  );
}

/* ============================================================
   Dispense Queue — grouped by patient
   ============================================================ */
function DispenseQueue() {
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/clinic/prescriptions/queue/');
      setGroups(r.data);
    } catch {
      toast.error('Could not load queue.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const dispense = async (rx) => {
    if (!confirm(`Dispense ${rx.drug_name} (${rx.quantity})?`)) return;
    setBusy(true);
    try {
      await api.post(`/clinic/prescriptions/${rx.id}/dispense/`);
      toast.success(`${rx.drug_name} dispensed`);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(d?.detail || 'Could not dispense.');
    } finally {
      setBusy(false);
    }
  };

  const markNotAvailable = async (rx) => {
    const reason = prompt('Reason (out of stock, external pharmacy, etc.):', 'Out of stock');
    if (!reason) return;
    try {
      await api.post(`/clinic/prescriptions/${rx.id}/mark-not-available/`, { reason });
      toast.success('Marked not available');
      load();
    } catch {
      toast.error('Could not update.');
    }
  };

  const printSlip = async (rx) => {
    try {
      const r = await api.get(`/clinic/prescriptions/${rx.id}/print-data/`);
      const { printPrescriptionSlip } = await import('@/app/consultations/[id]/page');
      printPrescriptionSlip(r.data);
    } catch {
      toast.error('Could not print.');
    }
  };

  const total = groups.reduce((s, g) => s + g.prescriptions.length, 0);

  return (
    <div>
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3 flex-wrap">
        <span className="text-2xl">ℹ️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900">
            {total} prescription{total !== 1 && 's'} waiting across {groups.length} patient{groups.length !== 1 && 's'}
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            Each patient's prescriptions are grouped below — dispense them together
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={busy}>
          🔄 Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && groups.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-slate-500">Nothing in the queue — all prescriptions dispensed.</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.visit_id} className="card mb-4">
          <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <p className="text-base font-bold text-slate-900">
                {g.patient_name}{' '}
                <span className="text-slate-400 font-normal">({g.patient_number})</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Visit #{g.visit_number}
                {g.doctor && ` · Dr ${g.doctor}`}
                {` · ${new Date(g.prescribed_at).toLocaleTimeString()}`}
              </p>
            </div>
            <span className="badge badge-amber">
              {g.prescriptions.length} drug{g.prescriptions.length !== 1 && 's'}
            </span>
          </div>

          <div className="space-y-2">
            {g.prescriptions.map((rx) => {
              const available = rx.product_available;
              const hasProduct = !!rx.product;
              return (
                <div key={rx.id}
                  className={`p-3 rounded border-l-4 ${
                    !hasProduct ? 'border-l-slate-300 bg-slate-50'
                    : available ? 'border-l-green-500 bg-green-50/30'
                    : 'border-l-red-500 bg-red-50/30'
                  }`}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-bold text-slate-900">{rx.drug_name}</p>
                        {hasProduct && available && (
                          <span className="badge badge-green">In stock</span>
                        )}
                        {hasProduct && !available && (
                          <span className="badge badge-red">Insufficient</span>
                        )}
                        {!hasProduct && (
                          <span className="badge badge-gray">External</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 mt-1">
                        <span><b>Dose:</b> {rx.dosage || '—'}</span>
                        <span><b>Freq:</b> {rx.frequency || '—'}</span>
                        <span><b>Duration:</b> {rx.duration || '—'}</span>
                        <span><b>Qty:</b> {rx.quantity}</span>
                      </div>
                      {rx.instructions && (
                        <p className="text-xs text-slate-500 mt-1 italic">{rx.instructions}</p>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button className="btn btn-secondary btn-sm" onClick={() => printSlip(rx)}>
                        🖨 Slip
                      </button>
                      {hasProduct && available && (
                        <button className="btn btn-success btn-sm" onClick={() => dispense(rx)} disabled={busy}>
                          ✓ Dispense
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => markNotAvailable(rx)}>
                        ✗ Not Available
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Stock & Expiry
   ============================================================ */
function StockView() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, gs] = await Promise.all([
        api.get('/inventory/products/'),
        api.get('/auth/settings/'),
      ]);
      setProducts(p.data);
      setCurrency(gs.data.currency_symbol || 'UGX');
    } catch {
      toast.error('Could not load stock.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const money = (n) => formatMoney(n, currency);
  const today = new Date();

  const daysUntil = (p) => {
    if (!p.expiry_date) return null;
    return Math.ceil((new Date(p.expiry_date) - today) / 86400000);
  };

  const filtered = useMemo(() => {
    let list = products;
    if (filter === 'low')      list = list.filter((p) => p.quantity <= p.reorder_level);
    if (filter === 'expiring') list = list.filter((p) => { const d = daysUntil(p); return d !== null && d >= 0 && d <= 30; });
    if (filter === 'expired')  list = list.filter((p) => { const d = daysUntil(p); return d !== null && d < 0; });
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.batch_number || '').toLowerCase().includes(q)
    );
    return list;
    // eslint-disable-next-line
  }, [products, filter, search]);

  const totalStockValue = products.reduce((s, p) => s + parseFloat(p.stock_value || 0), 0);
  const expiring30 = products.filter((p) => { const d = daysUntil(p); return d !== null && d >= 0 && d <= 30; }).length;
  const expiredCount = products.filter((p) => { const d = daysUntil(p); return d !== null && d < 0; }).length;
  const lowCount = products.filter((p) => p.quantity <= p.reorder_level).length;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card green">
          <p className="stat-label">Stock Value</p>
          <p className="stat-value">{money(totalStockValue)}</p>
        </div>
        <div className="stat-card amber">
          <p className="stat-label">Expiring (30d)</p>
          <p className="stat-value">{expiring30}</p>
        </div>
        <div className="stat-card red">
          <p className="stat-label">Expired</p>
          <p className="stat-value">{expiredCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Low Stock</p>
          <p className="stat-value">{lowCount}</p>
        </div>
      </div>

      <div className="mb-4 border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          <TabBtn active={filter === 'all'} onClick={() => setFilter('all')}>All ({products.length})</TabBtn>
          <TabBtn active={filter === 'low'} onClick={() => setFilter('low')}>Low Stock ({lowCount})</TabBtn>
          <TabBtn active={filter === 'expiring'} onClick={() => setFilter('expiring')}>Expiring ({expiring30})</TabBtn>
          <TabBtn active={filter === 'expired'} onClick={() => setFilter('expired')}>Expired ({expiredCount})</TabBtn>
        </div>
      </div>

      <div className="card mb-4">
        <label>Search</label>
        <input
          placeholder="Drug name, SKU, or batch…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Drug</th>
              <th>SKU</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th className="text-right">Days</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Sell</th>
              <th className="text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-8">No drugs match this filter.</td></tr>
            )}
            {filtered.map((p) => {
              const days = daysUntil(p);
              const low = p.quantity <= p.reorder_level;
              return (
                <tr key={p.id}
                  className={
                    days !== null && days < 0 ? 'bg-red-50/50'
                    : days !== null && days <= 30 ? 'bg-amber-50/40'
                    : low ? 'bg-red-50/30'
                    : ''
                  }>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="text-xs">{p.batch_number || '—'}</td>
                  <td className="text-sm whitespace-nowrap">{p.expiry_date || '—'}</td>
                  <td className="text-right">
                    {days === null ? '—' :
                     days < 0 ? <span className="text-red-600 font-bold">Exp</span> :
                     days <= 30 ? <span className="text-amber-600 font-semibold">{days}d</span> :
                     <span className="text-slate-500">{days}d</span>}
                  </td>
                  <td className="text-right">
                    <span className={low ? 'text-red-600 font-bold' : ''}>{p.quantity}</span>
                    {low && <span className="ml-1 badge badge-red">Low</span>}
                  </td>
                  <td className="text-right text-slate-600">{money(p.cost_price)}</td>
                  <td className="text-right">{money(p.selling_price)}</td>
                  <td className="text-right font-semibold">{money(p.stock_value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}>
      {children}
    </button>
  );
}