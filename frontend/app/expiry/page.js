'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function ExpiryPage() {
  const { enabled_features } = useTenantContext();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('soon'); // 'expired' | 'soon' | 'all'

  useEffect(() => {
    if (!enabled_features.includes('expiry')) return;

    Promise.all([
      api.get('/inventory/products/'),
      api.get('/auth/settings/'),
    ])
      .then(([p, gs]) => {
        setProducts(p.data);
        setCurrency(gs.data.currency_symbol || 'UGX');
      })
      .catch(() => toast.error('Could not load expiry data.'))
      .finally(() => setLoading(false));
  }, [enabled_features, toast]);

  if (!enabled_features.includes('expiry')) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Feature not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Expiry tracking is not enabled for this business type.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  const money = (n) => formatMoney(n, currency);
  const today = new Date();

  const withExpiry = products.filter((p) => p.expiry_date);
  const expired = withExpiry.filter((p) => new Date(p.expiry_date) < today);
  const soon = withExpiry.filter((p) => {
    const d = new Date(p.expiry_date);
    const days = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  });

  const rows =
    filter === 'expired' ? expired
    : filter === 'soon' ? soon
    : withExpiry;

  const daysUntil = (dateStr) => {
    const d = new Date(dateStr);
    return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">⏰ Expiry Alerts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track products approaching or past their expiry date
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card red">
          <p className="stat-label">Expired</p>
          <p className="stat-value">{expired.length}</p>
        </div>
        <div className="stat-card amber">
          <p className="stat-label">Expiring in 30 days</p>
          <p className="stat-value">{soon.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Tracked Products</p>
          <p className="stat-value">{withExpiry.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Products</p>
          <p className="stat-value">{products.length}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1">
          <TabBtn active={filter === 'expired'} onClick={() => setFilter('expired')}>
            🔴 Expired ({expired.length})
          </TabBtn>
          <TabBtn active={filter === 'soon'} onClick={() => setFilter('soon')}>
            🟡 Expiring Soon ({soon.length})
          </TabBtn>
          <TabBtn active={filter === 'all'} onClick={() => setFilter('all')}>
            📋 All Tracked ({withExpiry.length})
          </TabBtn>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Batch #</th>
              <th>Expiry Date</th>
              <th className="text-right">Days Left</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  {withExpiry.length === 0
                    ? 'No products have expiry dates set. Add one via Inventory → Edit Product.'
                    : 'Nothing matches this filter.'}
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const days = daysUntil(p.expiry_date);
              return (
                <tr key={p.id} className={days < 0 ? 'bg-red-50/40' : days <= 30 ? 'bg-amber-50/40' : ''}>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="text-sm">{p.batch_number || '—'}</td>
                  <td className="whitespace-nowrap">{p.expiry_date}</td>
                  <td className="text-right font-semibold">
                    {days < 0 ? (
                      <span className="text-red-600">{Math.abs(days)}d ago</span>
                    ) : days <= 30 ? (
                      <span className="text-amber-600">{days}d</span>
                    ) : (
                      <span className="text-slate-500">{days}d</span>
                    )}
                  </td>
                  <td className="text-right">{p.quantity}</td>
                  <td className="text-right">{money(p.stock_value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}