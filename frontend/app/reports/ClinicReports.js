'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const TABS = [
  { key: 'clinical',    label: '🩺 Clinical' },
  { key: 'lab',         label: '🧪 Lab' },
  { key: 'pharmacy',    label: '💊 Pharmacy' },
  { key: 'financial',   label: '💰 Financial' },
  { key: 'patients',    label: '👥 Patients' },
  { key: 'compliance',  label: '📋 Registers' },
  { key: 'waiting',     label: '⏱ Waiting Times' },
];

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});

export default function ClinicReports() {
  const toast = useToast();
  const [tab, setTab] = useState('clinical');
  const [period, setPeriod] = useState('month');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const qs = () => {
    const p = new URLSearchParams({ period });
    if (period === 'custom' && start && end) {
      p.set('start', start);
      p.set('end', end);
    }
    return p.toString();
  };

  useEffect(() => {
    api.get('/auth/settings/')
      .then((r) => setCurrency(r.data.currency_symbol || 'UGX'))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (period === 'custom' && (!start || !end)) return;
    setLoading(true);
    setData(null);
    const endpoint = {
      clinical: '/reports/clinic/clinical/',
      lab: '/reports/clinic/lab/',
      pharmacy: '/reports/pharmacy/',
      financial: '/reports/clinic/financial/',
      patients: '/reports/clinic/patients/',
      compliance: '/reports/clinic/compliance/',
      waiting: '/reports/clinic/waiting-times/',
    }[tab];

    api.get(`${endpoint}?${qs()}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Could not load report.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [tab, period, start, end]);

  const money = (n) => formatMoney(n, currency);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">🏥 Clinic Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          Clinical, operational, and financial insights
        </p>
      </div>

      {/* Period picker */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label>Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
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

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
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

      {/* ==================== CLINICAL ==================== */}
      {!loading && data && tab === 'clinical' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Visits" value={obj(data.summary).total_visits || 0} />
            <Kpi label="Completed" value={obj(data.summary).completed || 0} accent="green" />
            <Kpi label="New Patients" value={obj(data.summary).new_patients || 0} accent="blue" />
            <Kpi label="Returning" value={obj(data.summary).returning_patients || 0} />
            <Kpi label="Cancelled" value={obj(data.summary).cancelled || 0} accent="red" />
            <Kpi label="Avg Visit (min)" value={obj(data.summary).avg_visit_minutes ?? '—'} />
          </div>

          {arr(data.visits_by_day).length > 0 && (
            <div className="card mb-6">
              <p className="card-title">Visits by Day</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={data.visits_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <p className="card-title">Doctor Workload</p>
              {arr(data.doctors).length === 0 ? (
                <p className="text-sm text-slate-400">No doctor data.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Doctor</th><th className="text-right">Visits</th></tr></thead>
                    <tbody>
                      {data.doctors.map((d) => (
                        <tr key={d.username}>
                          <td className="font-medium">{d.name}</td>
                          <td className="text-right">{d.visits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <p className="card-title">Top Diagnoses</p>
              {arr(data.top_diagnoses).length === 0 ? (
                <p className="text-sm text-slate-400">No diagnoses recorded yet.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Diagnosis</th><th className="text-right">Cases</th></tr></thead>
                    <tbody>
                      {data.top_diagnoses.map((d) => (
                        <tr key={d.diagnosis}>
                          <td className="truncate max-w-md">{d.diagnosis}</td>
                          <td className="text-right font-semibold">{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================== LAB ==================== */}
      {!loading && data && tab === 'lab' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Orders" value={obj(data.summary).total_orders || 0} />
            <Kpi label="Completed" value={obj(data.summary).completed || 0} accent="green" />
            <Kpi label="Pending" value={obj(data.summary).pending || 0} accent="amber" />
            <Kpi label="Avg Turnaround (h)" value={obj(data.summary).avg_turnaround_hours ?? '—'} />
          </div>

          <div className="card mb-6">
            <p className="card-title">Most Requested Tests</p>
            {arr(data.top_tests).length === 0 ? (
              <p className="text-sm text-slate-400">No tests ordered yet.</p>
            ) : (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={data.top_tests} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="test" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {arr(data.by_doctor).length > 0 && (
            <div className="card">
              <p className="card-title">Orders by Doctor</p>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Doctor</th><th className="text-right">Orders</th></tr></thead>
                  <tbody>
                    {data.by_doctor.map((d) => (
                      <tr key={d.doctor}>
                        <td className="font-medium">{d.doctor}</td>
                        <td className="text-right">{d.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== PHARMACY ==================== */}
      {!loading && data && tab === 'pharmacy' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Products" value={obj(data.kpis).total_products || 0} />
            <Kpi label="Total Stock Value" value={money(obj(data.kpis).total_stock_value || 0)} accent="green" />
            <Kpi
              label="Expiring in 30 Days"
              value={money(obj(data.kpis).expiring_30d_value || 0)}
              accent="amber"
              hint={`${obj(obj(data.expiry_forecast).days_0_30).count || 0} products`}
            />
            <Kpi
              label="Already Expired"
              value={money(obj(data.kpis).expired_value || 0)}
              accent="red"
              hint={`${obj(obj(data.expiry_forecast).expired).count || 0} products`}
            />
          </div>

          <div className="card mb-6">
            <p className="card-title">Expiry Forecast</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MiniBox label="Already Expired"
                       count={obj(obj(data.expiry_forecast).expired).count || 0}
                       value={money(obj(obj(data.expiry_forecast).expired).value || 0)} color="red" />
              <MiniBox label="Expires in 0–30 days"
                       count={obj(obj(data.expiry_forecast).days_0_30).count || 0}
                       value={money(obj(obj(data.expiry_forecast).days_0_30).value || 0)} color="amber" />
              <MiniBox label="Expires in 31–60 days"
                       count={obj(obj(data.expiry_forecast).days_31_60).count || 0}
                       value={money(obj(obj(data.expiry_forecast).days_31_60).value || 0)} color="yellow" />
              <MiniBox label="Expires in 61–90 days"
                       count={obj(obj(data.expiry_forecast).days_61_90).count || 0}
                       value={money(obj(obj(data.expiry_forecast).days_61_90).value || 0)} color="green" />
            </div>
          </div>

          {arr(data.expiring_soon).length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Days Left</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expiring_soon.map((p) => (
                    <tr key={p.id} className={p.days_left < 0 ? 'bg-red-50/40' : 'bg-amber-50/40'}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-xs">{p.batch_number || '—'}</td>
                      <td className="whitespace-nowrap">{p.expiry_date}</td>
                      <td className="text-right font-semibold">
                        {p.days_left < 0 ? (
                          <span className="text-red-600">Expired {Math.abs(p.days_left)}d ago</span>
                        ) : (
                          <span className="text-amber-600">{p.days_left}d</span>
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
        </>
      )}

      {/* ==================== FINANCIAL ==================== */}
      {!loading && data && tab === 'financial' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Billed" value={money(obj(data.summary).total_billed || 0)} />
            <Kpi label="Total Collected" value={money(obj(data.summary).total_collected || 0)} accent="green" />
            <Kpi label="Outstanding" value={money(obj(data.summary).outstanding || 0)} accent="red" />
            <Kpi label="Expenses" value={money(obj(data.summary).total_expenses || 0)} accent="amber" />
            <Kpi label="Net" value={money(obj(data.summary).net || 0)} accent={(obj(data.summary).net || 0) >= 0 ? 'green' : 'red'} />
            <Kpi label="Invoices" value={obj(data.summary).invoice_count || 0} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {arr(data.payment_mix).length > 0 && (
              <div className="card">
                <p className="card-title">Revenue by Payment Method</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data.payment_mix} dataKey="total" nameKey="method"
                           outerRadius={90} label>
                        {data.payment_mix.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {arr(data.revenue_by_category).length > 0 && (
              <div className="card">
                <p className="card-title">Revenue by Category</p>
                <div style={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.revenue_by_category} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {arr(data.service_revenue).length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Service</th><th className="text-right">Times Billed</th><th className="text-right">Revenue</th></tr>
                </thead>
                <tbody>
                  {data.service_revenue.map((s) => (
                    <tr key={s.description}>
                      <td className="font-medium">{s.description}</td>
                      <td className="text-right">{s.count}</td>
                      <td className="text-right font-semibold">{money(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ==================== PATIENTS ==================== */}
      {!loading && data && tab === 'patients' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total Patients" value={obj(data.demographics).total || 0} />
            <Kpi label="Male" value={obj(data.demographics).male || 0} accent="blue" />
            <Kpi label="Female" value={obj(data.demographics).female || 0} accent="purple" />
            <Kpi label="Show Rate" value={`${obj(data.appointments).show_rate_pct || 0}%`} accent="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <p className="card-title">Age Distribution</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={arr(obj(data.demographics).age_distribution)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <p className="card-title">Appointments</p>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Booked" value={obj(data.appointments).booked || 0} />
                <MiniStat label="Attended" value={obj(data.appointments).attended || 0} accent="green" />
                <MiniStat label="No-Show" value={obj(data.appointments).no_show || 0} accent="red" />
                <MiniStat label="Cancelled" value={obj(data.appointments).cancelled || 0} accent="amber" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <p className="card-title">Peak Hours</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={arr(data.peak_hours)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="visits" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <p className="card-title">Visits by Day of Week</p>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={arr(data.peak_days)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="visits" fill="#06b6d4" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== REGISTERS ==================== */}
      {!loading && data && tab === 'compliance' && (
        <>
          <div className="card mb-6">
            <p className="card-title">📋 Visit Register</p>
            {arr(data.visit_register).length === 0 ? (
              <p className="text-sm text-slate-400">No visits in this period.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Visit #</th><th>Date</th><th>Patient</th><th>Age</th>
                      <th>Gender</th><th>Doctor</th><th>Diagnosis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.visit_register.map((v) => (
                      <tr key={v.visit_number}>
                        <td className="font-mono text-xs">{v.visit_number}</td>
                        <td className="whitespace-nowrap text-sm">{v.date}</td>
                        <td>
                          <p className="font-medium">{v.patient_name}</p>
                          <p className="text-xs text-slate-400">{v.patient_number}</p>
                        </td>
                        <td className="text-sm">{v.age ?? '—'}</td>
                        <td className="text-sm capitalize">{v.gender || '—'}</td>
                        <td className="text-sm">{v.doctor || '—'}</td>
                        <td className="text-sm text-slate-600 truncate max-w-xs">{v.diagnosis || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mb-6">
            <p className="card-title">💊 Prescription Register</p>
            {arr(data.prescription_register).length === 0 ? (
              <p className="text-sm text-slate-400">No prescriptions in this period.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Patient</th><th>Drug</th><th className="text-right">Qty</th>
                        <th>Prescribed By</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.prescription_register.map((p, i) => (
                      <tr key={i}>
                        <td className="text-sm whitespace-nowrap">{p.date}</td>
                        <td className="font-medium">{p.patient}</td>
                        <td>{p.drug}</td>
                        <td className="text-right">{p.quantity}</td>
                        <td className="text-sm">{p.prescribed_by}</td>
                        <td><span className="badge badge-blue">{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <p className="card-title">⚠️ Notifiable Diseases</p>
            {arr(data.notifiable_diseases).length === 0 ? (
              <p className="text-sm text-slate-400">No notifiable cases detected.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.notifiable_diseases.map((d) => (
                  <div key={d.disease} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="font-semibold text-red-900">{d.disease}</p>
                    <p className="text-2xl font-bold text-red-700">{d.cases}</p>
                    <p className="text-xs text-red-600">reported</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Detected by scanning free-text diagnoses for reportable disease keywords.
              Confirm with the doctor before filing a formal notification.
            </p>
          </div>
        </>
      )}

      {/* ==================== WAITING TIMES ==================== */}
      {!loading && data && tab === 'waiting' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Kpi label="Visits Measured" value={data.samples || 0} />
            <Kpi
              label="Avg Check-In → Triage"
              value={data.avg_checkin_to_triage_min !== null && data.avg_checkin_to_triage_min !== undefined ? `${data.avg_checkin_to_triage_min} min` : '—'}
            />
            <Kpi
              label="Avg Total Journey"
              value={data.avg_total_journey_min !== null && data.avg_total_journey_min !== undefined ? `${data.avg_total_journey_min} min` : '—'}
              accent="green"
              hint="Check-in to completed"
            />
          </div>

          <div className="card">
            <p className="text-sm text-slate-500">
              These metrics depend on staff completing each stage (triage, doctor, billing).
              If you see "—", there isn't enough completed data yet.
            </p>
          </div>
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

function MiniStat({ label, value, accent = '' }) {
  const bg = {
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
  }[accent] || 'bg-slate-50 border-slate-200';
  return (
    <div className={`p-3 rounded-lg border ${bg}`}>
      <p className="text-xs text-slate-600 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function MiniBox({ label, count, value, color }) {
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