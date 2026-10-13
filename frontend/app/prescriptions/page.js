'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function PrescriptionsPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse = enabled_features.includes('prescriptions');

  const [rx, setRx] = useState([]);
  const [filter, setFilter] = useState('prescribed');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // -------- ALL HOOKS FIRST --------
  useEffect(() => {
    if (!canUse) return;
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    api.get(`/clinic/prescriptions/${qs}`)
      .then((r) => setRx(r.data))
      .catch(() => toast.error('Could not load prescriptions.'))
      .finally(() => setLoading(false));
  }, [filter, canUse, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rx;
    return rx.filter((r) => (r.drug_name || '').toLowerCase().includes(q));
  }, [rx, search]);

  // -------- EARLY RETURN (safe now — all hooks already ran) --------
  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Prescriptions are only for clinics and health facilities.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  // -------- HELPERS --------
  const printSlip = async (id) => {
    try {
      const r = await api.get(`/clinic/prescriptions/${id}/print-data/`);
      printPrescriptionSlip(r.data);
    } catch {
      toast.error('Could not load prescription data.');
    }
  };

  const statusBadge = (s) => ({
    prescribed: 'badge-blue',
    dispensed: 'badge-green',
    partially_dispensed: 'badge-amber',
    not_available: 'badge-red',
    cancelled: 'badge-gray',
  }[s] || 'badge-gray');

  // -------- RENDER --------
  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">💊 Prescriptions</h1>
        <p className="text-sm text-slate-500 mt-1">
          {filtered.length} prescription{filtered.length !== 1 && 's'}
        </p>
      </div>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label>Search drug</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Drug name…"
            />
          </div>
          <div>
            <label>Status</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="prescribed">Prescribed (pending)</option>
              <option value="dispensed">Dispensed</option>
              <option value="partially_dispensed">Partially Dispensed</option>
              <option value="not_available">Not Available</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Drug</th>
              <th>Visit</th>
              <th>Dosage</th>
              <th>Frequency</th>
              <th className="text-right">Qty</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No prescriptions for this filter.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.drug_name}</td>
                <td className="text-sm text-slate-600">#{r.visit}</td>
                <td className="text-sm">{r.dosage || '—'}</td>
                <td className="text-sm">{r.frequency || '—'}</td>
                <td className="text-right">{r.quantity}</td>
                <td>
                  <span className={`badge ${statusBadge(r.status)}`}>
                    {r.status_display}
                  </span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => printSlip(r.id)}
                  >
                    🖨 Print
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}

/* ============================================================
   Prescription Slip Printer
   ============================================================ */
export function printPrescriptionSlip(data) {
  const w = window.open('', '_blank', 'width=780,height=900');
  if (!w) return;

  const { clinic, patient, visit, doctor, prescription } = data;

  const html = `
    <html>
      <head>
        <title>Prescription — ${patient.name}</title>
        <style>
          body { font-family: Georgia, 'Times New Roman', serif; padding: 40px; color: #111; line-height: 1.5; }
          .header { border-bottom: 3px double #1e40af; padding-bottom: 16px; margin-bottom: 20px; text-align: center; }
          .clinic-name { font-size: 24px; font-weight: bold; color: #1e40af; margin: 0 0 4px 0; }
          .clinic-meta { font-size: 12px; color: #444; }
          .row { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 8px; font-size: 14px; }
          .label { color: #666; }
          .rx-symbol { font-size: 36px; font-weight: bold; color: #1e40af; margin: 16px 0; }
          .drug { font-size: 20px; font-weight: bold; margin: 8px 0; }
          .dose-box { background: #f0f9ff; border-left: 4px solid #1e40af; padding: 14px; margin: 16px 0; }
          .dose-row { display: flex; gap: 24px; font-size: 15px; margin: 4px 0; }
          .dose-label { color: #666; min-width: 100px; }
          .allergies { background: #fee2e2; border-left: 4px solid #dc2626; padding: 10px 14px; margin: 12px 0; font-size: 13px; color: #991b1b; }
          .notes { font-size: 13px; color: #333; margin-top: 8px; font-style: italic; }
          .footer { margin-top: 60px; font-size: 12px; color: #666; }
          .signature { margin-top: 50px; display: flex; justify-content: space-between; }
          .sig-line { border-top: 1px solid #333; padding-top: 6px; min-width: 220px; font-size: 11px; color: #666; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="clinic-name">${clinic.name || 'Clinic'}</h1>
          <div class="clinic-meta">
            ${clinic.address ? `${clinic.address}<br/>` : ''}
            ${clinic.phone ? `Tel: ${clinic.phone}` : ''}
            ${clinic.email ? ` · ${clinic.email}` : ''}
            ${clinic.tin ? `<br/>TIN: ${clinic.tin}` : ''}
          </div>
        </div>

        <div class="row">
          <div><span class="label">Patient:</span> <b>${patient.name}</b> (${patient.number})</div>
          <div><span class="label">Date:</span> <b>${visit.visit_date_display}</b></div>
        </div>
        <div class="row">
          <div><span class="label">Age / Sex:</span> ${patient.age ?? '—'} yrs · ${patient.gender || '—'}</div>
          <div><span class="label">Visit:</span> ${visit.visit_number}</div>
        </div>

        ${patient.allergies ? `<div class="allergies">⚠️ <b>Allergies:</b> ${patient.allergies}</div>` : ''}
        ${visit.diagnosis ? `<div style="margin-top:16px;font-size:14px;"><span class="label">Diagnosis:</span> ${visit.diagnosis}</div>` : ''}

        <div class="rx-symbol">℞</div>
        <div class="drug">${prescription.drug_name}</div>
        <div class="dose-box">
          ${prescription.dosage ? `<div class="dose-row"><span class="dose-label">Dosage:</span><b>${prescription.dosage}</b></div>` : ''}
          ${prescription.frequency ? `<div class="dose-row"><span class="dose-label">Frequency:</span><b>${prescription.frequency}</b></div>` : ''}
          ${prescription.duration ? `<div class="dose-row"><span class="dose-label">Duration:</span><b>${prescription.duration}</b></div>` : ''}
          <div class="dose-row"><span class="dose-label">Quantity:</span><b>${prescription.quantity}</b></div>
        </div>
        ${prescription.instructions ? `<div class="notes"><b>Instructions:</b> ${prescription.instructions}</div>` : ''}

        <div class="signature">
          <div class="sig-line">
            Prescriber
            ${doctor.name ? `<br/><b>${doctor.name}</b>` : ''}
            ${doctor.specialization ? `<br/>${doctor.specialization}` : ''}
            ${doctor.license ? `<br/>Lic. ${doctor.license}` : ''}
          </div>
          <div class="sig-line" style="text-align:right;">Date: ${visit.visit_date_display}</div>
        </div>

        <div class="footer">
          This prescription is valid for 30 days from the date above.<br/>
          Keep out of reach of children. Do not share medication.
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;
  w.document.write(html);
  w.document.close();
}