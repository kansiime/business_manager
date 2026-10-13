'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});

/* ============================================================
   GENERIC reports — for garage, retail, restaurant, salon, etc.
   ============================================================ */
export default function GenericReports() {
  const [period, setPeriod] = useState('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloadError, setDownloadError] = useState('');

  const buildQuery = (fmt) => {
    const p = new URLSearchParams({ period, output: fmt });
    if (period === 'custom') { p.set('start', start); p.set('end', end); }
    return p.toString();
  };

  const load = () => {
    if (period === 'custom' && (!start || !end)) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = new URLSearchParams({ period });
    if (period === 'custom') { q.set('start', start); q.set('end', end); }
    api.get(`/reports/overview/?${q.toString()}`)
      .then((r) => setData(r.data))
      .catch(() => setDownloadError('Could not load report data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, start, end]);

  const download = async (key, fmt) => {
    setDownloadError('');
    try {
      const url = `/reports/${key}/?${buildQuery(fmt)}`;
      await downloadFile(url, `${key}_report.${fmt === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      const status = err?.response?.status;
      setDownloadError(
        status
          ? `Download failed (HTTP ${status}). Check backend logs.`
          : 'Download failed. Please try again.'
      );
    }
  };

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);
  const k = obj(data?.kpis);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data ? `${data.business_name} — ${data.period?.start} to ${data.period?.end}` : 'Performance overview'}
        </p>
      </div>

      {downloadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {downloadError}
        </div>
      )}

      {/* Period picker */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label>Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div><label>Start</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><label>End</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </>
          )}
        </div>
      </div>

      {period === 'custom' && (!start || !end) && (
        <div className="card mb-6">
          <p className="text-sm text-slate-500">Pick a start and end date to see the report.</p>
        </div>
      )}

      {loading && <p className="text-slate-500 text-sm mb-4">Loading report…</p>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Sales" value={money(k.total_sales || 0)} />
            <Kpi label="Gross Profit" value={money(k.gross_profit ?? k.total_profit ?? 0)}
                 accent="green" hint={`${k.gross_margin || 0}% margin`} />
            <Kpi label="Total Expenses" value={money(k.total_expenses || 0)} accent="red" />
            <Kpi label="Total Returns" value={money(k.total_returns || 0)} accent="amber" />
            <Kpi label="Net Profit" value={money(k.net_profit || 0)}
                 accent={(k.net_profit || 0) >= 0 ? 'green' : 'red'}
                 hint={`${k.net_margin || 0}% net margin`} />
            <Kpi label="Purchases" value={money(k.total_purchases || 0)} accent="amber" />
            <Kpi label="Transactions" value={k.transaction_count || 0} accent="purple"
                 hint={`Avg ${money(k.average_sale || 0)}`} />
            <Kpi label="Receivables" value={money(k.receivables || 0)} accent="amber" />
            <Kpi label="Payables" value={money(k.payables || 0)} accent="red" />
            <Kpi label="Stock Value" value={money(k.stock_value || 0)} />
            <Kpi label="Gross Margin" value={`${k.gross_margin || 0}%`} accent="green" />
            <Kpi label="Net Margin" value={`${k.net_margin || 0}%`}
                 accent={(k.net_margin || 0) >= 0 ? 'green' : 'red'} />
          </div>

          {/* Cash vs Credit */}
          {data.cash_vs_credit && (
            <div className="card mb-6">
              <p className="card-title">Cash vs Credit</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniStat label="Cash" value={money(obj(data.cash_vs_credit.cash).total || 0)} accent="green"
                          hint={`${obj(data.cash_vs_credit.cash).count || 0} sales`} />
                <MiniStat label="Credit" value={money(obj(data.cash_vs_credit.credit).total || 0)} accent="amber"
                          hint={`${obj(data.cash_vs_credit.credit).count || 0} sales`} />
                <MiniStat label="Partial" value={money(obj(data.cash_vs_credit.partial).total || 0)} accent="blue"
                          hint={`${obj(data.cash_vs_credit.partial).count || 0} sales`} />
              </div>
            </div>
          )}

          {/* Sales trend */}
          {arr(data.sales_trend).length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Sales Trend</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={data.sales_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {arr(data.top_products).length > 0 && (
              <div className="card">
                <p className="card-title">Top Products by Revenue</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.top_products} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {arr(data.payment_mix).length > 0 && (
              <div className="card">
                <p className="card-title">Payment Mix</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data.payment_mix} dataKey="total" nameKey="type" outerRadius={90} label>
                        {data.payment_mix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Top customers */}
          {arr(data.top_customers).length > 0 && (
            <div className="table-scroll mb-6">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th><th>Phone</th>
                    <th className="text-right">Sales</th>
                    <th className="text-right">Total Spent</th>
                    <th className="text-right">Outstanding</th>
                    <th>Last Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_customers.map((c) => (
                    <tr key={c.name}>
                      <td className="font-medium">{c.name}</td>
                      <td className="text-sm text-slate-600">{c.phone || '—'}</td>
                      <td className="text-right">{c.count}</td>
                      <td className="text-right font-semibold">{money(c.total)}</td>
                      <td className={`text-right ${c.balance > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {c.balance > 0 ? money(c.balance) : '—'}
                      </td>
                      <td className="text-sm text-slate-500">{c.last_visit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Returns section */}
          {arr(data.returns_by_type).some((r) => (r.total || 0) > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="card">
                <p className="card-title">Returns by Type</p>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.returns_by_type}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="total" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {arr(data.returns_by_product).length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Qty Returned</th>
                        <th className="text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns_by_product.map((p) => (
                        <tr key={p.name}>
                          <td className="font-medium">{p.name}</td>
                          <td className="text-right">{p.qty}</td>
                          <td className="text-right font-semibold">{money(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Expenses by category */}
          {arr(data.expenses_by_category).length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Expenses by Category</p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.expenses_by_category} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="total" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Stock by category */}
          {arr(data.stock_by_category).length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Stock Value by Category</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.stock_by_category}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Bar dataKey="value" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top products table */}
          {arr(data.top_products).length > 0 && (
            <div className="table-scroll mb-6">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Qty Sold</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((p) => (
                    <tr key={p.name}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">{p.qty}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                      <td className="text-right text-slate-500">{money(p.cost)}</td>
                      <td className="text-right text-green-600 font-semibold">{money(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Downloads */}
      <div className="card">
        <p className="card-title">Download Reports</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { key: 'sales', label: 'Sales Report' },
            { key: 'purchases', label: 'Purchases Report' },
            { key: 'stock', label: 'Stock Report' },
            { key: 'debts', label: 'Debts Report' },
            { key: 'profit', label: 'Profit Report' },
            { key: 'expenses', label: 'Expenses Report' },
            { key: 'returns', label: 'Returns Report' },
          ].map((r) => (
            <div key={r.key} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-sm font-medium">{r.label}</span>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => download(r.key, 'pdf')}>PDF</button>
                <button className="btn btn-secondary btn-sm" onClick={() => download(r.key, 'excel')}>Excel</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ProtectedRoute>
  );
}

/* ============================================================
   PHARMACY reports — for drug shops, pharmacies, groceries
   ============================================================ */
export function PharmacyReports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('expiry');

  const load = () => {
    setLoading(true);
    api.get('/reports/pharmacy/')
      .then((r) => setData(r.data))
      .catch(() => setError('Could not load pharmacy reports.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const currency = data?.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);
  const k = obj(data?.kpis);
  const ef = obj(data?.expiry_forecast);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">💊 Pharmacy Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          {data ? `${data.business_name} — ${data.today}` : 'Expiry, stock aging, and movement'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500 mb-4">Loading…</p>}

      {data && (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Products" value={k.total_products || 0} />
            <Kpi label="Total Stock Value" value={money(k.total_stock_value || 0)} accent="green" />
            <Kpi
              label="Expiring in 30 Days"
              value={money(k.expiring_30d_value || 0)}
              accent="amber"
              hint={`${obj(ef.days_0_30).count || 0} products`}
            />
            <Kpi
              label="Already Expired"
              value={money(k.expired_value || 0)}
              accent="red"
              hint={`${obj(ef.expired).count || 0} products`}
            />
            <Kpi
              label="Capital at Risk (≤30 days)"
              value={money(k.total_at_risk || 0)}
              accent="red"
            />
            <Kpi
              label="Dead Stock"
              value={money(k.dead_stock_value || 0)}
              hint="No sales in last 90 days"
            />
            <Kpi label="Total Units" value={k.total_units || 0} />
            <Kpi label="Top Sellers" value={arr(data.top_selling).length} hint="Last 30 days" />
          </div>

          {/* Expiry forecast cards */}
          <div className="card mb-6">
            <p className="card-title">Expiry Forecast</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ExpiryBox
                label="Already Expired"
                count={obj(ef.expired).count || 0}
                value={money(obj(ef.expired).value || 0)}
                color="red"
              />
              <ExpiryBox
                label="Expires in 0–30 days"
                count={obj(ef.days_0_30).count || 0}
                value={money(obj(ef.days_0_30).value || 0)}
                color="amber"
              />
              <ExpiryBox
                label="Expires in 31–60 days"
                count={obj(ef.days_31_60).count || 0}
                value={money(obj(ef.days_31_60).value || 0)}
                color="yellow"
              />
              <ExpiryBox
                label="Expires in 61–90 days"
                count={obj(ef.days_61_90).count || 0}
                value={money(obj(ef.days_61_90).value || 0)}
                color="green"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 border-b border-slate-200">
            <div className="flex gap-1 flex-wrap">
              <Tab active={activeTab === 'expiry'} onClick={() => setActiveTab('expiry')}>
                ⏰ Expiring Soon ({arr(data.expiring_soon).length})
              </Tab>
              <Tab active={activeTab === 'top'} onClick={() => setActiveTab('top')}>
                🚀 Top Sellers ({arr(data.top_selling).length})
              </Tab>
              <Tab active={activeTab === 'dead'} onClick={() => setActiveTab('dead')}>
                💀 Dead Stock ({arr(data.dead_stock).length})
              </Tab>
              <Tab active={activeTab === 'aging'} onClick={() => setActiveTab('aging')}>
                📊 Stock Aging
              </Tab>
              <Tab active={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')}>
                🏢 Suppliers
              </Tab>
            </div>
          </div>

          {/* Expiring soon */}
          {activeTab === 'expiry' && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry Date</th>
                    <th className="text-right">Days Left</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {arr(data.expiring_soon).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-400 py-8">
                        No products expiring in the next 90 days. 🎉
                      </td>
                    </tr>
                  )}
                  {arr(data.expiring_soon).map((p) => (
                    <tr key={p.id}
                      className={p.days_left < 0 ? 'bg-red-50/40' : p.days_left <= 30 ? 'bg-amber-50/40' : ''}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-xs text-slate-600">{p.batch_number || '—'}</td>
                      <td className="whitespace-nowrap">{p.expiry_date}</td>
                      <td className="text-right font-semibold">
                        {p.days_left < 0 ? (
                          <span className="text-red-600">Expired {Math.abs(p.days_left)}d ago</span>
                        ) : p.days_left <= 30 ? (
                          <span className="text-amber-600">{p.days_left}d</span>
                        ) : (
                          <span className="text-slate-500">{p.days_left}d</span>
                        )}
                      </td>
                      <td className="text-right">{p.quantity}</td>
                      <td className="text-right">{money(p.stock_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top sellers */}
          {activeTab === 'top' && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="text-right">Qty Sold (30d)</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {arr(data.top_selling).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-8">
                        No sales in the last 30 days.
                      </td>
                    </tr>
                  )}
                  {arr(data.top_selling).map((p, i) => (
                    <tr key={p.id}>
                      <td className="text-slate-400">{i + 1}</td>
                      <td className="font-medium">{p.name}</td>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td className="text-right font-semibold">{p.qty_sold}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dead stock */}
          {activeTab === 'dead' && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Stock Value</th>
                    <th>Expiry</th>
                    <th className="text-right">In Stock (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {arr(data.dead_stock).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-8">
                        No dead stock — every product is moving. 🎉
                      </td>
                    </tr>
                  )}
                  {arr(data.dead_stock).map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">{p.quantity}</td>
                      <td className="text-right font-semibold">{money(p.stock_value)}</td>
                      <td className="text-sm text-slate-500">{p.expiry_date || '—'}</td>
                      <td className="text-right text-slate-500">
                        {p.days_since_created !== null ? `${p.days_since_created}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stock aging */}
          {activeTab === 'aging' && (
            <div className="card">
              <p className="card-title">Stock Aging</p>
              <p className="text-sm text-slate-500 mb-4">
                How long products have been sitting in your inventory.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <AgingBox label="0–30 days" value={obj(data.stock_aging)['0_30'] || 0} color="green" />
                <AgingBox label="31–90 days" value={obj(data.stock_aging)['31_90'] || 0} color="blue" />
                <AgingBox label="91–180 days" value={obj(data.stock_aging)['91_180'] || 0} color="amber" />
                <AgingBox label="Over 180 days" value={obj(data.stock_aging).over_180 || 0} color="red" />
              </div>
            </div>
          )}

          {/* Supplier concentration */}
          {activeTab === 'suppliers' && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th className="text-right">Products Supplied</th>
                    <th className="text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {arr(data.supplier_concentration).length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center text-slate-400 py-8">
                        No supplier data.
                      </td>
                    </tr>
                  )}
                  {arr(data.supplier_concentration).map((s, i) => (
                    <tr key={i}>
                      <td className="font-medium">{s.name}</td>
                      <td className="text-right">{s.product_count}</td>
                      <td className="text-right font-semibold">{money(s.stock_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Downloads */}
          <div className="card mt-6">
            <p className="card-title">Download Pharmacy Reports</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { key: 'sales', label: 'Sales Report' },
                { key: 'stock', label: 'Stock Report' },
                { key: 'expenses', label: 'Expenses Report' },
              ].map((r) => (
                <div key={r.key} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
                  <span className="text-sm font-medium">{r.label}</span>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        try {
                          await downloadFile(
                            `/reports/${r.key}/?period=month&output=pdf`,
                            `${r.key}_report.pdf`
                          );
                        } catch { /* ignore */ }
                      }}
                    >
                      PDF
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          await downloadFile(
                            `/reports/${r.key}/?period=month&output=excel`,
                            `${r.key}_report.xlsx`
                          );
                        } catch { /* ignore */ }
                      }}
                    >
                      Excel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </ProtectedRoute>
  );
}

/* ============================================================
   Shared components
   ============================================================ */
function Kpi({ label, value, accent = '', hint }) {
  return (
    <div className={`stat-card ${accent}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value, accent = '', hint }) {
  const cls = {
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-100',
    blue: 'bg-blue-50 border-blue-100',
    red: 'bg-red-50 border-red-100',
  }[accent] || 'bg-slate-50 border-slate-100';
  const textCls = {
    green: 'text-green-900',
    amber: 'text-amber-900',
    blue: 'text-blue-900',
    red: 'text-red-900',
  }[accent] || 'text-slate-900';
  const smallCls = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    red: 'text-red-700',
  }[accent] || 'text-slate-600';

  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${smallCls}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textCls}`}>{value}</p>
      {hint && <p className={`text-xs mt-1 ${smallCls}`}>{hint}</p>}
    </div>
  );
}

function ExpiryBox({ label, count, value, color }) {
  const cls = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    green: 'bg-green-50 border-green-200 text-green-900',
  }[color];
  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{count}</p>
      <p className="text-xs opacity-70 mt-0.5">{value}</p>
    </div>
  );
}

function AgingBox({ label, value, color }) {
  const cls = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
  }[color];
  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">products</p>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}