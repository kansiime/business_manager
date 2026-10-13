'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [statementOpen, setStatementOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/clinic/patients/${id}/`),
      api.get(`/clinic/visits/?patient=${id}`),
      api.get('/auth/settings/'),
    ])
      .then(([p, v, gs]) => {
        setPatient(p.data);
        setVisits(v.data);
        setCurrency(gs.data.currency_symbol || 'UGX');
      })
      .catch(() => toast.error('Could not load patient.'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  if (!patient) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Patient not found.</p>
          <button className="btn btn-secondary mt-3" onClick={() => router.push('/patients')}>
            ← Back to Patients
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => router.push('/patients')}
            className="text-sm text-slate-500 hover:text-slate-800 mb-1">
            ← Back to Patients
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{patient.full_name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            <code className="bg-slate-100 px-1 rounded text-xs">{patient.patient_number}</code>
            {patient.age !== null && ` • ${patient.age} years`}
            {patient.gender && ` • ${patient.gender}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {patient.phone && (
            <a href={`tel:${patient.phone}`} className="btn btn-secondary">📞 Call</a>
          )}
          {patient.phone && (
            <a href={`https://wa.me/${patient.phone.replace(/[^0-9]/g, '')}`}
              target="_blank" rel="noreferrer" className="btn btn-success">
              💬 WhatsApp
            </a>
          )}
          <button className="btn btn-secondary" onClick={() => setStatementOpen(true)}>
            📄 Statement
          </button>
          <Link href={`/consultations/new?patient=${patient.id}`} className="btn btn-primary">
            + New Visit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <p className="card-title">Demographics</p>
          <Row label="Phone" value={patient.phone || '—'} />
          <Row label="Email" value={patient.email || '—'} />
          <Row label="National ID" value={patient.national_id || '—'} />
          <Row label="Address" value={patient.address || '—'} />
          <Row label="Blood Group" value={patient.blood_group || '—'} />
        </div>
        <div className="card">
          <p className="card-title">Medical Notes</p>
          <Row label="Allergies" value={patient.allergies || '—'} />
          <Row label="Chronic Conditions" value={patient.chronic_conditions || '—'} />
          <Row label="Emergency Contact" value={
            patient.emergency_contact_name
              ? `${patient.emergency_contact_name} (${patient.emergency_contact_phone})`
              : '—'
          } />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="card-title mb-0">Visit History ({visits.length})</p>
          <Link href={`/consultations/new?patient=${patient.id}`}
            className="text-sm text-blue-600 hover:underline">
            + New Visit
          </Link>
        </div>
        {visits.length === 0 ? (
          <p className="text-sm text-slate-400">No visits yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Visit #</th><th>Doctor</th>
                  <th>Status</th><th>Complaint</th><th></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap text-sm">{v.visit_date}</td>
                    <td className="font-mono text-xs">{v.visit_number}</td>
                    <td className="text-sm">{v.doctor_name || '—'}</td>
                    <td>
                      <span className={`badge ${
                        v.status === 'completed' ? 'badge-green'
                        : v.status === 'cancelled' ? 'badge-red'
                        : 'badge-amber'
                      }`}>
                        {v.status_display}
                      </span>
                    </td>
                    <td className="text-sm text-slate-600 truncate max-w-xs">
                      {v.chief_complaint || '—'}
                    </td>
                    <td className="text-right">
                      <Link href={`/consultations/${v.visit_number}`}
                        className="btn btn-secondary btn-sm">Open →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statementOpen && (
        <StatementModal
          patientId={id}
          currency={currency}
          onClose={() => setStatementOpen(false)}
        />
      )}
    </ProtectedRoute>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900 font-medium text-right ml-4">{value}</span>
    </div>
  );
}

/* ============================================================
   Statement modal
   ============================================================ */
function StatementModal({ patientId, currency, onClose }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/clinic/patients/${patientId}/statement/?from=${from}&to=${to}`);
      setData(r.data);
    } catch {
      toast.error('Could not load statement.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const money = (n) => formatMoney(n, currency);

  const handlePrint = () => {
    if (!data) return;
    printStatement(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 my-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold">Patient Statement</h3>
            <p className="text-sm text-slate-500">
              All visits and invoices for the selected period
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn btn-secondary btn-sm"
              onClick={() => {
                const d = new Date();
                const y = d.getFullYear();
                setFrom(`${y}-01-01`);
                setTo(today);
              }}>This year</button>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setFrom(monthStart)}>This month</button>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading…</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="stat-card">
                <p className="stat-label">Visits</p>
                <p className="stat-value">{data.totals.visit_count}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Total Charged</p>
                <p className="stat-value">{money(data.totals.charged)}</p>
              </div>
              <div className="stat-card green">
                <p className="stat-label">Total Paid</p>
                <p className="stat-value">{money(data.totals.paid)}</p>
              </div>
              <div className={`stat-card ${data.totals.balance > 0 ? 'red' : ''}`}>
                <p className="stat-label">Balance</p>
                <p className="stat-value">{money(data.totals.balance)}</p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Visit #</th>
                    <th>Invoice #</th>
                    <th>Doctor</th>
                    <th className="text-right">Charged</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-slate-400 py-8">
                        No visits in this period.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="text-sm whitespace-nowrap">{r.date}</td>
                      <td className="font-mono text-xs">{r.visit_number}</td>
                      <td className="font-mono text-xs">{r.invoice_number || '—'}</td>
                      <td className="text-sm">{r.doctor || '—'}</td>
                      <td className="text-right">{money(r.charged)}</td>
                      <td className="text-right">{money(r.paid)}</td>
                      <td className={`text-right font-semibold ${r.balance > 0 ? 'text-red-600' : ''}`}>
                        {money(r.balance)}
                      </td>
                      <td>
                        <span className={`badge ${
                          r.status === 'paid' ? 'badge-green'
                          : r.status === 'partial' ? 'badge-amber'
                          : r.status === 'cancelled' ? 'badge-gray'
                          : 'badge-red'
                        }`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.rows.length > 0 && (
                  <tfoot>
                    <tr className="font-bold bg-slate-50">
                      <td colSpan={4} className="text-right">TOTAL</td>
                      <td className="text-right">{money(data.totals.charged)}</td>
                      <td className="text-right">{money(data.totals.paid)}</td>
                      <td className="text-right text-red-600">{money(data.totals.balance)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Statement printer
   ============================================================ */
function printStatement(data) {
  const w = window.open('', '_blank', 'width=1000,height=900');
  if (!w) return;

  const money = (n) => {
    const formatted = new Intl.NumberFormat('en-UG', {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(Number(n) || 0);
    return `${data.clinic.currency} ${formatted}`;
  };

  const html = `
    <html>
      <head>
        <title>Statement — ${data.patient.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
          .header { border-bottom: 2px solid #1e40af; padding-bottom: 14px; margin-bottom: 20px; }
          h1 { font-size: 22px; color: #1e40af; margin: 0 0 4px 0; }
          .clinic-meta { font-size: 12px; color: #666; }
          .patient-block { background: #f0f9ff; padding: 14px; border-left: 4px solid #1e40af; margin-bottom: 20px; }
          .patient-block h2 { margin: 0 0 8px 0; font-size: 16px; }
          .patient-row { font-size: 13px; color: #333; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1e40af; color: white; padding: 8px 10px; text-align: left; }
          td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
          .right { text-align: right; }
          tfoot td { font-weight: bold; background: #f3f4f6; border-top: 2px solid #1e40af; }
          .red { color: #dc2626; }
          .footer { margin-top: 40px; font-size: 11px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${data.clinic.name || 'Clinic'}</h1>
          <div class="clinic-meta">
            ${data.clinic.address || ''}
            ${data.clinic.phone ? ` · Tel: ${data.clinic.phone}` : ''}
            ${data.clinic.email ? ` · ${data.clinic.email}` : ''}
          </div>
        </div>

        <h2 style="font-size:16px;margin:0 0 12px 0;">Patient Statement</h2>

        <div class="patient-block">
          <h2>${data.patient.name}</h2>
          <div class="patient-row"><b>Patient #:</b> ${data.patient.number}</div>
          ${data.patient.phone ? `<div class="patient-row"><b>Phone:</b> ${data.patient.phone}</div>` : ''}
          ${data.patient.address ? `<div class="patient-row"><b>Address:</b> ${data.patient.address}</div>` : ''}
          <div class="patient-row" style="margin-top:8px;">
            <b>Period:</b> ${data.period.from_display} – ${data.period.to_display}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Visit #</th>
              <th>Invoice #</th>
              <th>Doctor</th>
              <th class="right">Charged</th>
              <th class="right">Paid</th>
              <th class="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((r) => `
              <tr>
                <td>${r.date}</td>
                <td>${r.visit_number}</td>
                <td>${r.invoice_number || '—'}</td>
                <td>${r.doctor || '—'}</td>
                <td class="right">${money(r.charged)}</td>
                <td class="right">${money(r.paid)}</td>
                <td class="right ${r.balance > 0 ? 'red' : ''}">${money(r.balance)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="right">TOTAL</td>
              <td class="right">${money(data.totals.charged)}</td>
              <td class="right">${money(data.totals.paid)}</td>
              <td class="right red">${money(data.totals.balance)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          Generated on ${new Date(data.generated_at).toLocaleString()} · Business Manager
        </div>

        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;
  w.document.write(html);
  w.document.close();
}