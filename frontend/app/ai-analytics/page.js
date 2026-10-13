'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

const TABS = [
  { key: 'fast',      label: '🚀 Fast Movers' },
  { key: 'slow',      label: '🐢 Slow Movers' },
  { key: 'suggest',   label: '📦 Stock Suggestions' },
  { key: 'forecast',  label: '📈 Demand Forecast' },
  { key: 'seasonal',  label: '📅 Seasonality' },
  { key: 'anomaly',   label: '⚡ Anomalies' },
  { key: 'bundles',   label: '🔗 Product Bundles' },
];

export default function AiAnalyticsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('fast');
  const [windowDays, setWindowDays] = useState(30);
  const [currency, setCurrency] = useState('UGX');

  // Data
  const [fastData, setFastData] = useState(null);
  const [slowData, setSlowData] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [seasonality, setSeasonality] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [bundles, setBundles] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [products, setProducts] = useState([]);
  const [forecastProduct, setForecastProduct] = useState('');

  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [gs, prods] = await Promise.all([
        api.get('/auth/settings/'),
        api.get('/inventory/products/'),
      ]);
      setCurrency(gs.data.currency_symbol || 'UGX');
      setProducts(prods.data);

      // Load the tab-specific data
      if (tab === 'fast') {
        const r = await api.get(`/reports/ai/fast-moving/?days=${windowDays}&limit=20&direction=fast`);
        setFastData(r.data);
      }
      if (tab === 'slow') {
        const r = await api.get(`/reports/ai/fast-moving/?days=${windowDays}&limit=20&direction=slow`);
        setSlowData(r.data);
      }
      if (tab === 'suggest') {
        const r = await api.get(`/reports/ai/stock-suggestions/?days=${windowDays}`);
        setSuggestions(r.data);
      }
      if (tab === 'seasonal') {
        const r = await api.get('/reports/ai/seasonality/?years=2');
        setSeasonality(r.data);
      }
      if (tab === 'anomaly') {
        const r = await api.get(`/reports/ai/anomalies/?days=90&threshold=2.0`);
        setAnomalies(r.data);
      }
      if (tab === 'bundles') {
        const r = await api.get(`/reports/ai/bundles/?days=180&min_orders=3`);
        setBundles(r.data);
      }
    } catch {
      toast.error('Could not load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, windowDays]);

  // Forecast loads separately (needs product selection)
  useEffect(() => {
    if (tab !== 'forecast' || !forecastProduct) {
      setForecast(null);
      return;
    }
    api.get(`/reports/ai/forecast/?product_id=${forecastProduct}`)
      .then((r) => setForecast(r.data))
      .catch(() => toast.error('Could not load forecast.'));
  }, [tab, forecastProduct, toast]);

  const money = (n) => formatMoney(n, currency);

  const priorityClass = (p) => ({
    urgent: 'bg-red-100 text-red-800 border-red-300',
    high:   'bg-amber-100 text-amber-800 border-amber-300',
    medium: 'bg-blue-100 text-blue-800 border-blue-300',
    ok:     'bg-green-100 text-green-800 border-green-300',
  }[p] || 'bg-slate-100 text-slate-700 border-slate-300');

  const priorityLabel = (p) => ({
    urgent: '🚨 Urgent',
    high:   '⚠️ High',
    medium: '🔔 Medium',
    ok:     '✅ OK',
  }[p] || p);

  const trendIcon = (t) => {
    if (t === null || t === undefined) return '—';
    if (t > 10) return <span className="text-green-600 font-semibold">▲ {t}%</span>;
    if (t < -10) return <span className="text-red-600 font-semibold">▼ {Math.abs(t)}%</span>;
    return <span className="text-slate-500">● {t}%</span>;
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🤖 AI Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Insights from your real sales data — fast movers, forecasts, seasonality, anomalies, and bundles
          </p>
        </div>
        <div className="flex gap-2 items-end">
          {(tab === 'fast' || tab === 'slow' || tab === 'suggest') && (
            <div>
              <label className="text-xs">Window</label>
              <select value={windowDays} onChange={(e) => setWindowDays(parseInt(e.target.value))}>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          )}
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {/* ==================== FAST MOVERS ==================== */}
      {!loading && tab === 'fast' && fastData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Active Products" value={fastData.summary.active_products} accent="green" />
            <Kpi label="Units Moved" value={fastData.summary.total_units_moved} />
            <Kpi label="Revenue" value={money(fastData.summary.total_revenue)} accent="green" />
            <Kpi label="Dead Products" value={fastData.summary.dead_products} accent="red" />
          </div>

          <InfoCard>
            <b>💡 What this means:</b> These are your top-selling products over the last {windowDays} days.
            Keep them in stock — a stockout here costs real money.
          </InfoCard>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="text-right">Units Sold</th>
                  <th className="text-right">Per Day</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Trend</th>
                  <th className="text-right">In Stock</th>
                  <th className="text-right">Last Sale</th>
                </tr>
              </thead>
              <tbody>
                {fastData.items.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-slate-400 py-8">
                    No sales in this window yet.
                  </td></tr>
                )}
                {fastData.items.map((p, i) => {
                  const low = p.current_quantity <= p.reorder_level;
                  return (
                    <tr key={p.product_id}>
                      <td className="text-slate-400">{i + 1}</td>
                      <td>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                      </td>
                      <td className="text-right font-semibold">{p.units_sold}</td>
                      <td className="text-right font-semibold text-blue-700">{p.velocity_per_day}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                      <td className="text-right text-sm">{trendIcon(p.trend_pct)}</td>
                      <td className={`text-right ${low ? 'text-red-600 font-bold' : ''}`}>
                        {p.current_quantity}
                        {low && <span className="ml-1 badge badge-red">Low</span>}
                      </td>
                      <td className="text-right text-xs text-slate-500">
                        {p.days_since_last_sale !== null ? `${p.days_since_last_sale}d ago` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ==================== SLOW MOVERS ==================== */}
      {!loading && tab === 'slow' && slowData && (
        <>
          <InfoCard accent="amber">
            <b>💡 What this means:</b> Products barely moving. Consider discounting,
            bundling, or reducing reorder levels for these.
          </InfoCard>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="text-right">Units Sold</th>
                  <th className="text-right">Per Day</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Trend</th>
                  <th className="text-right">In Stock</th>
                </tr>
              </thead>
              <tbody>
                {slowData.items.map((p, i) => (
                  <tr key={p.product_id}>
                    <td className="text-slate-400">{i + 1}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-right">{p.units_sold}</td>
                    <td className="text-right text-amber-700">{p.velocity_per_day}</td>
                    <td className="text-right">{money(p.revenue)}</td>
                    <td className="text-right text-sm">{trendIcon(p.trend_pct)}</td>
                    <td className="text-right">{p.current_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ==================== STOCK SUGGESTIONS ==================== */}
      {!loading && tab === 'suggest' && suggestions && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Suggestions" value={suggestions.summary.total_suggestions} />
            <Kpi label="Urgent" value={suggestions.summary.urgent} accent="red" />
            <Kpi label="High Priority" value={suggestions.summary.high} accent="amber" />
            <Kpi label="Medium" value={suggestions.summary.medium} />
          </div>

          <InfoCard>
            <b>💡 How suggestions are calculated:</b> We look at how fast each product
            has been selling over the last {suggestions.window_days} days, how much you
            have in stock, and how long it usually takes to receive a supplier order
            ({suggestions.lead_time_days} days). Suggested quantities cover ~30 days of
            sales plus a safety margin.
          </InfoCard>

          <div className="space-y-3">
            {suggestions.suggestions.length === 0 && (
              <div className="card text-center py-12">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-slate-500">All stock levels look healthy.</p>
              </div>
            )}
            {suggestions.suggestions.map((s) => (
              <div key={s.product_id} className="card border-l-4 border-l-blue-500">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-lg font-bold text-slate-900">{s.name}</p>
                      <span className={`badge border ${priorityClass(s.priority)}`}>
                        {priorityLabel(s.priority)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mb-3">
                      {s.sku}
                      {s.category && ` · ${s.category}`}
                      {s.supplier_name && ` · Supplier: ${s.supplier_name}`}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500 uppercase">In Stock</p>
                        <p className={`font-bold ${s.current_quantity <= s.reorder_level ? 'text-red-600' : ''}`}>
                          {s.current_quantity}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Sold ({suggestions.window_days}d)</p>
                        <p className="font-bold">{s.units_sold_30d}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Sells / Day</p>
                        <p className="font-bold text-blue-700">{s.avg_daily_sales}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Days Left</p>
                        <p className={`font-bold ${
                          s.stock_days_remaining === null ? 'text-slate-400' :
                          s.stock_days_remaining < suggestions.lead_time_days ? 'text-red-600' :
                          s.stock_days_remaining < suggestions.lead_time_days * 2 ? 'text-amber-600' :
                          ''
                        }`}>
                          {s.stock_days_remaining !== null ? `${s.stock_days_remaining}d` : '∞'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3 italic">{s.reason}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500 uppercase mb-1">Suggested Order</p>
                    <p className="text-3xl font-black text-blue-700">{s.suggested_quantity}</p>
                    <Link
                      href={`/purchases?product=${s.product_id}&quantity=${s.suggested_quantity}&supplier=${s.supplier_id || ''}`}
                      className="btn btn-primary btn-sm mt-2"
                    >
                      📦 Create PO
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ==================== FORECAST ==================== */}
      {tab === 'forecast' && (
        <>
          <InfoCard>
            <b>💡 Demand Forecast:</b> Uses a weighted average of the last 7, 14, and 30
            days of sales to project the next 7 and 30 days. Confidence range is ±20%.
          </InfoCard>

          <div className="card mb-4">
            <label>Select Product</label>
            <select
              value={forecastProduct}
              onChange={(e) => setForecastProduct(e.target.value)}
            >
              <option value="">— Choose a product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          {forecast && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Kpi label="Current Stock" value={forecast.product.current_quantity} />
                <Kpi label="Weighted Velocity" value={`${forecast.velocity.weighted}/day`} />
                <Kpi
                  label={`Forecast Next ${7} Days`}
                  value={forecast.forecast.next_7_days}
                  accent="blue"
                />
                <Kpi
                  label={`Forecast Next 30 Days`}
                  value={forecast.forecast.next_30_days}
                  accent="green"
                  hint={`Range: ${forecast.forecast.confidence_low}–${forecast.forecast.confidence_high}`}
                />
              </div>

              <div className="card mb-4">
                <p className="card-title">Velocity Breakdown</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-slate-50 rounded">
                    <p className="text-xs text-slate-500 uppercase">Last 7d</p>
                    <p className="text-2xl font-bold">{forecast.velocity.last_7d}</p>
                    <p className="text-xs text-slate-500">units/day</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded">
                    <p className="text-xs text-slate-500 uppercase">Last 14d</p>
                    <p className="text-2xl font-bold">{forecast.velocity.last_14d}</p>
                    <p className="text-xs text-slate-500">units/day</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded">
                    <p className="text-xs text-slate-500 uppercase">Last 30d</p>
                    <p className="text-2xl font-bold">{forecast.velocity.last_30d}</p>
                    <p className="text-xs text-slate-500">units/day</p>
                  </div>
                </div>
              </div>

              <div className="card mb-4">
                <p className="card-title">Trend</p>
                <p className={`text-lg font-bold ${
                  forecast.trend.direction === 'up' ? 'text-green-600' :
                  forecast.trend.direction === 'down' ? 'text-red-600' :
                  'text-slate-600'
                }`}>
                  {forecast.trend.direction === 'up' && `📈 Rising — ${forecast.trend.percent}% faster than monthly avg`}
                  {forecast.trend.direction === 'down' && `📉 Falling — ${Math.abs(forecast.trend.percent)}% slower than monthly avg`}
                  {forecast.trend.direction === 'stable' && `➡️ Stable`}
                </p>
              </div>

              <div className="card border-l-4 border-l-blue-500">
                <p className="card-title">Suggested Action</p>
                <p className="text-sm text-slate-600 mb-2">
                  To cover the next 30 days ({forecast.forecast.next_30_days} units) you should
                  have roughly <b>{forecast.forecast.next_30_days}</b> units in stock.
                </p>
                <p className="text-lg font-bold text-blue-700">
                  Order at least {forecast.suggested_reorder} more units
                </p>
                <Link
                  href={`/purchases?product=${forecast.product.id}&quantity=${forecast.suggested_reorder}`}
                  className="btn btn-primary btn-sm mt-2"
                >
                  📦 Create Purchase Order
                </Link>
              </div>
            </>
          )}
        </>
      )}

      {/* ==================== SEASONALITY ==================== */}
      {!loading && tab === 'seasonal' && seasonality && (
        <>
          <InfoCard>
            <b>💡 Seasonality:</b> Week-of-year revenue patterns across the last
            {' '}{seasonality.years} years. Look for peaks — these often align with
            Ramadan, Christmas, school terms, or harvest seasons.
          </InfoCard>

          {seasonality.peaks.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">🔝 Peak Weeks</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {seasonality.peaks.map((p) => (
                  <div key={p.week} className="text-center p-3 bg-amber-50 border border-amber-200 rounded">
                    <p className="text-xs text-amber-700 uppercase">Week {p.week}</p>
                    <p className="text-lg font-bold text-amber-900">{money(p.avg_revenue)}</p>
                    <p className="text-xs text-amber-600">{p.samples} year(s) of data</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {seasonality.weekly.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Weekly Revenue Trend</p>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={seasonality.weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }}
                      label={{ value: 'Week of year', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <ReferenceLine y={seasonality.stats.avg_weekly_revenue} stroke="#ef4444" strokeDasharray="3 3" />
                    <Bar dataKey="revenue" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Red line = average weekly revenue ({money(seasonality.stats.avg_weekly_revenue)})
              </p>
            </div>
          )}

          {seasonality.monthly.length > 0 && (
            <div className="card">
              <p className="card-title">Monthly Revenue (Last {seasonality.years} Years)</p>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={seasonality.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== ANOMALIES ==================== */}
      {!loading && tab === 'anomaly' && anomalies && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Days Analysed" value={anomalies.stats.days_with_data} />
            <Kpi label="Avg Daily Revenue" value={money(anomalies.stats.avg)} />
            <Kpi label="Std Deviation" value={money(anomalies.stats.std)} />
            <Kpi label="Anomalies Detected" value={anomalies.stats.anomaly_count} accent={anomalies.stats.anomaly_count > 0 ? 'amber' : ''} />
          </div>

          <InfoCard accent="amber">
            <b>💡 Anomalies:</b> Days where revenue deviated by more than
            {' '}{anomalies.threshold} standard deviations from the mean.
            <b> Spikes</b> may be big sales worth understanding. <b>Drops</b> may
            indicate downtime, stockouts, or missed sales.
          </InfoCard>

          {anomalies.daily.length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Daily Revenue</p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={anomalies.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <ReferenceLine y={anomalies.stats.avg} stroke="#3b82f6" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={1.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Blue line = average daily revenue
              </p>
            </div>
          )}

          <div className="space-y-2">
            {anomalies.anomalies.length === 0 && (
              <div className="card text-center py-8">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-slate-500">No anomalies detected.</p>
              </div>
            )}
            {anomalies.anomalies.map((a) => (
              <div
                key={a.date}
                className={`card border-l-4 ${
                  a.type === 'spike' ? 'border-l-green-500' : 'border-l-red-500'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {a.type === 'spike' ? '📈 Spike' : '📉 Drop'} — {a.date}
                    </p>
                    <p className="text-sm text-slate-500">
                      {a.orders} orders · Z-score {a.z_score}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{money(a.revenue)}</p>
                    <p className={`text-sm font-semibold ${
                      a.pct_change > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {a.pct_change > 0 ? '+' : ''}{a.pct_change}% vs rolling avg
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ==================== BUNDLES ==================== */}
      {!loading && tab === 'bundles' && bundles && (
        <>
          <InfoCard>
            <b>💡 Product Bundles:</b> Products frequently bought together.
            <b> Lift</b> above 1.0 means the pair sells together more often than chance.
            Higher lift + more co-occurrences = stronger bundle opportunity.
          </InfoCard>

          {bundles.bundles.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-4xl mb-2">📊</p>
              <p className="text-slate-500">
                Not enough data yet. Need at least {bundles.min_support} orders containing both products.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bundles.bundles.map((b, i) => (
                <div key={i} className="card">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-400 mb-1">
                        Pair #{i + 1}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full font-medium text-sm">
                          {b.a_name}
                        </span>
                        <span className="text-slate-400 font-bold">+</span>
                        <span className="px-3 py-1 bg-purple-100 text-purple-900 rounded-full font-medium text-sm">
                          {b.b_name}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600 mt-2">
                        <div>
                          <span className="text-slate-400">Co-occurrences:</span>{' '}
                          <b>{b.co_occurrences}</b>
                        </div>
                        <div>
                          <span className="text-slate-400">Confidence A→B:</span>{' '}
                          <b>{Math.round(b.confidence_a_to_b * 100)}%</b>
                        </div>
                        <div>
                          <span className="text-slate-400">Confidence B→A:</span>{' '}
                          <b>{Math.round(b.confidence_b_to_a * 100)}%</b>
                        </div>
                        <div>
                          <span className="text-slate-400">Support:</span>{' '}
                          <b>{Math.round(b.support * 10000) / 100}%</b>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-slate-500 uppercase">Lift</p>
                      <p className={`text-3xl font-black ${
                        b.lift >= 2 ? 'text-green-600' :
                        b.lift >= 1.5 ? 'text-blue-600' :
                        'text-slate-600'
                      }`}>
                        {b.lift}
                      </p>
                      <p className="text-xs text-slate-400">
                        {b.lift >= 2 ? 'Strong' : b.lift >= 1.5 ? 'Good' : 'Weak'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ProtectedRoute>
  );
}

function Kpi({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function InfoCard({ children, accent = 'blue' }) {
  const cls = {
    blue:   'bg-blue-50 border-blue-200 text-blue-900',
    amber:  'bg-amber-50 border-amber-200 text-amber-900',
    red:    'bg-red-50 border-red-200 text-red-900',
    green:  'bg-green-50 border-green-200 text-green-900',
  }[accent];
  return (
    <div className={`mb-4 p-4 rounded-lg border ${cls}`}>
      <p className="text-sm">{children}</p>
    </div>
  );
}