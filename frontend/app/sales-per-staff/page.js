'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';

export default function SalesPerStaffPage() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/ai/sales-per-staff/?days=${days}`),
      api.get('/auth/settings/'),
    ])
      .then(([r, gs]) => {
        setData(r.data);
        setCurrency(gs.data.currency_symbol || 'UGX');
      })
      .catch(() => toast.error('Could not load staff analytics.'))
      .finally(() => setLoading(false));
  }, [days, toast]);

  const money = (n) => formatMoney(n, currency);
  const top3 = data?.rows.slice(0, 3) || [];

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">👥 Sales Per Staff</h1>
          <p className="text-sm text-slate-500 mt-1">
            Who's selling the most over the last {days} days
          </p>
        </div>
        <div>
          <label className="text-xs">Period</label>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Staff" value={data.summary.total_staff} />
            <Kpi label="Total Sales" value={money(data.summary.total_sales)} accent="green" />
            <Kpi label="Total Profit" value={money(data.summary.total_profit)} accent="green" />
            <Kpi label="Top Seller" value={data.summary.top_seller || '—'} accent="amber" />
          </div>

          {/* Podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {top3.map((s, i) => (
                <div key={s.user_id} className={`card ${
                  i === 0 ? 'border-2 border-amber-400' :
                  i === 1 ? 'border-2 border-slate-300' :
                  'border-2 border-amber-700'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${
                      i === 0 ? 'bg-amber-500' :
                      i === 1 ? 'bg-slate-400' :
                      'bg-amber-700'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{s.full_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{s.role}</p>
                    </div>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{money(s.total_sales)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.transaction_count} sales · {s.share_pct}% of total
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Avg Sale</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-slate-400 py-8">
                    No sales in this period.
                  </td></tr>
                )}
                {data.rows.map((s) => (
                  <tr key={s.user_id}>
                    <td className="text-slate-400">{s.rank}</td>
                    <td>
                      <p className="font-medium">{s.full_name}</p>
                      <p className="text-xs text-slate-400">@{s.username}</p>
                    </td>
                    <td className="capitalize text-sm">{s.role}</td>
                    <td className="text-right">{s.transaction_count}</td>
                    <td className="text-right font-semibold">{money(s.total_sales)}</td>
                    <td className="text-right text-green-700">{money(s.profit)}</td>
                    <td className="text-right">{money(s.avg_transaction)}</td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 bg-slate-200 rounded h-1.5">
                          <div className="bg-blue-600 h-1.5 rounded" style={{ width: `${s.share_pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 w-10 text-right">{s.share_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ProtectedRoute>
  );
}

function Kpi({ label, value, accent = '' }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}