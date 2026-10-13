'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

export function Kpi({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function QuickLink({ href, icon, label }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
        {label}
      </span>
    </Link>
  );
}

export function AiSummaryWidget() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/reports/ai/summary/')
      .then((r) => setData(r.data))
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="card-title mb-0">🚀 Top Movers (30 days)</p>
          <Link href="/ai-analytics" className="text-sm text-blue-600 hover:underline">
            View all →
          </Link>
        </div>
        {data.fast_movers.length === 0 ? (
          <p className="text-sm text-slate-400">No sales yet.</p>
        ) : (
          <div className="space-y-2">
            {data.fast_movers.map((p) => (
              <div key={p.product_id} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{p.name}</span>
                <span className="text-slate-500 whitespace-nowrap">
                  <b className="text-slate-900">{p.units_sold}</b> sold
                  <span className="text-slate-400"> · {p.velocity_per_day}/day</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="card-title mb-0">⚠️ Needs Restocking</p>
          <Link href="/ai-analytics" className="text-sm text-blue-600 hover:underline">
            See suggestions →
          </Link>
        </div>
        {data.urgent_restock.length === 0 ? (
          <p className="text-sm text-green-600">All stock levels healthy ✅</p>
        ) : (
          <div className="space-y-2">
            {data.urgent_restock.map((s) => (
              <div key={s.product_id} className="flex items-center justify-between text-sm">
                <span className="truncate mr-2">{s.name}</span>
                <span className="badge badge-red whitespace-nowrap">
                  Order {s.suggested_quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}