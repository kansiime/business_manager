'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useUser } from '@/lib/useUser';

export default function ConsultationPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const user = useUser();
  const role = user?.role;
  const isDoctor     = role === 'doctor';
  const isNurse      = role === 'nurse' || role === 'midwife';
  const isPharmacist = role === 'pharmacist';
  const isLabTech    = role === 'lab_tech' || role === 'radiologist';
  const isReception  = role === 'receptionist';
  const isCashier    = role === 'cashier';
  const isAdmin      = role === 'admin' || role === 'manager' || role === 'super';
  const isAccountant = role === 'accountant';

  const [visit, setVisit] = useState(null);
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(role === 'accountant' ? 'billing' : 'triage');
  const [assignDoctorId, setAssignDoctorId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Essential — the visit itself. If this fails, show "not found".
      const v = await api.get(`/clinic/visits/${id}/`);
      setVisit(v.data);
    } catch (err) {
      console.error('Could not load visit:', err.response?.status, err.response?.data);
      setVisit(null);
      toast.error('Could not load visit.');
    } finally {
      setLoading(false);
    }

    // 2. Optional supporting data — failures here should not break the page.
    const [s, p, gs, dr] = await Promise.allSettled([
      api.get('/clinic/services/?active=true'),
      api.get('/inventory/products/'),
      api.get('/auth/settings/'),
      api.get('/clinic/staff/?role=doctor'),
    ]);
    if (s.status === 'fulfilled')  setServices(s.value.data);
    if (p.status === 'fulfilled')  setProducts(p.value.data);
    if (gs.status === 'fulfilled') setCurrency(gs.value.data.currency_symbol || 'UGX');
    if (dr.status === 'fulfilled') setDoctors(dr.value.data);
  };

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line
  }, [id]);

  const money = (n) => formatMoney(n, currency);

  const assignDoctor = async () => {
    if (!assignDoctorId || !visit) return;
    setAssigning(true);
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/assign-doctor/`, {
        doctor: assignDoctorId,
      });
      toast.success('Doctor assigned');
      setAssignDoctorId('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not assign doctor.');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading visit…</p>
      </ProtectedRoute>
    );
  }

  if (!visit) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Visit not found.</p>
          <button className="btn btn-secondary mt-3" onClick={() => router.push('/patients')}>
            ← Back
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  const statusInfo = {
    waiting_triage:     { label: 'Waiting for Triage',     cls: 'badge-amber' },
    waiting_doctor:     { label: 'Waiting for Doctor',     cls: 'badge-amber' },
    with_doctor:        { label: 'With Doctor',            cls: 'badge-blue' },
    waiting_lab:        { label: 'Waiting for Lab',        cls: 'badge-amber' },
    waiting_pharmacy:   { label: 'Waiting for Pharmacy',   cls: 'badge-amber' },
    ready_for_billing:  { label: 'Ready for Billing',      cls: 'badge-blue' },
    completed:          { label: 'Completed',              cls: 'badge-green' },
    cancelled:          { label: 'Cancelled',              cls: 'badge-red' },
  }[visit.status] || { label: visit.status, cls: 'badge-gray' };

  return (
    <ProtectedRoute>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => router.push(`/patients/${visit.patient}`)}
            className="text-sm text-slate-500 hover:text-slate-800 mb-1">
            ← Back to Patient
          </button>
          <h1 className="text-2xl font-bold text-slate-900">
            {visit.patient_name}
            {visit.patient_age !== null && (
              <span className="text-slate-400 font-normal">
                {' '}— {visit.patient_age}y {visit.patient_gender}
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <code className="bg-slate-100 px-1 rounded text-xs">{visit.visit_number}</code>
            {' · '}{visit.patient_number}
            {visit.patient_phone && ` · 📞 ${visit.patient_phone}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span>
          {visit.priority !== 'normal' && (
            <span className={`badge ${visit.priority === 'emergency' ? 'badge-red' : 'badge-amber'}`}>
              {visit.priority.toUpperCase()}
            </span>
          )}
          <PrintVisitButton visit={visit} currency={currency} />
        </div>
      </div>

      {/* Assign Doctor — visible to reception, admin, and doctor */}
      {(isReception || isAdmin || isDoctor || isAccountant) && (
        <div className="card mb-4">
          <p className="card-title">
            {visit.attending_doctor
              ? `Attending: ${visit.doctor_name || 'Doctor'}`
              : 'Assign Doctor'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label>Doctor</label>
              <select
                value={assignDoctorId}
                onChange={(e) => setAssignDoctorId(e.target.value)}
              >
                <option value="">— Select doctor —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.user_name}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              disabled={!assignDoctorId || assigning}
              onClick={assignDoctor}
            >
              {assigning
                ? 'Assigning…'
                : visit.attending_doctor ? 'Reassign →' : 'Assign →'}
            </button>
          </div>
          {doctors.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">
              No doctors found. Create a ClinicalStaff record with role "doctor".
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
{/* Tabs — accountants only see Billing */}
<div className="mb-4 border-b border-slate-200 overflow-x-auto">
  <div className="flex gap-1 min-w-max">
    {!isAccountant && (
      <>
        <Tab active={tab === 'triage'} onClick={() => setTab('triage')}>
          1️⃣ Triage
        </Tab>
        <Tab active={tab === 'consultation'} onClick={() => setTab('consultation')}>
          2️⃣ Consultation
        </Tab>
        <Tab active={tab === 'lab'} onClick={() => setTab('lab')}>
          3️⃣ Lab & Imaging
        </Tab>
        <Tab active={tab === 'pharmacy'} onClick={() => setTab('pharmacy')}>
          4️⃣ Pharmacy
        </Tab>
      </>
    )}
    <Tab active={tab === 'billing'} onClick={() => setTab('billing')}>
      5️⃣ Billing
    </Tab>
  </div>
</div>

      {tab === 'triage'       && <TriageTab visit={visit} onReload={load} canEdit={isNurse || isAdmin} />}
      {tab === 'consultation' && <ConsultationTab visit={visit} onReload={load} canEdit={isDoctor || isAdmin} />}
      {tab === 'lab'          && <LabTab visit={visit} services={services} onReload={load} canEdit={isDoctor || isLabTech || isReception || isAdmin} />}
      {tab === 'pharmacy'     && <PharmacyTab visit={visit} products={products} onReload={load} canEdit={isDoctor || isPharmacist || isAdmin} />}
      {tab === 'billing'      && <BillingTab visit={visit} services={services} currency={currency} onReload={load} canEdit={isCashier || isReception || isAdmin} />}
    </ProtectedRoute>
  );
}

/* ============================================================
   TAB: Triage
   ============================================================ */
function TriageTab({ visit, onReload, canEdit }) {
  const toast = useToast();
  const [form, setForm] = useState({
    temperature_c: visit.triage?.temperature_c ?? '',
    blood_pressure_systolic: visit.triage?.blood_pressure_systolic ?? '',
    blood_pressure_diastolic: visit.triage?.blood_pressure_diastolic ?? '',
    pulse_bpm: visit.triage?.pulse_bpm ?? '',
    respiratory_rate: visit.triage?.respiratory_rate ?? '',
    oxygen_saturation: visit.triage?.oxygen_saturation ?? '',
    weight_kg: visit.triage?.weight_kg ?? '',
    height_cm: visit.triage?.height_cm ?? '',
    symptoms: visit.triage?.symptoms ?? '',
    pain_scale: visit.triage?.pain_scale ?? '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/save_triage/`, form);
      toast.success('Triage saved');
      onReload();
    } catch {
      toast.error('Could not save triage.');
    } finally {
      setSaving(false);
    }
  };

  const moveToDoctor = async () => {
    try {
      await api.patch(`/clinic/visits/${visit.visit_number}/`, { status: 'waiting_doctor' });
      toast.success('Sent to doctor');
      onReload();
    } catch {
      toast.error('Could not update status.');
    }
  };

  return (
    <div className="card">
      <p className="card-title">Triage Vitals</p>
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label>Temp (°C)</label>
            <input type="number" step="0.1" value={form.temperature_c}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, temperature_c: e.target.value })} /></div>
          <div><label>BP Systolic</label>
            <input type="number" value={form.blood_pressure_systolic}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, blood_pressure_systolic: e.target.value })} /></div>
          <div><label>BP Diastolic</label>
            <input type="number" value={form.blood_pressure_diastolic}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, blood_pressure_diastolic: e.target.value })} /></div>
          <div><label>Pulse (bpm)</label>
            <input type="number" value={form.pulse_bpm}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, pulse_bpm: e.target.value })} /></div>
          <div><label>Resp. Rate</label>
            <input type="number" value={form.respiratory_rate}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, respiratory_rate: e.target.value })} /></div>
          <div><label>SpO₂ (%)</label>
            <input type="number" value={form.oxygen_saturation}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, oxygen_saturation: e.target.value })} /></div>
          <div><label>Weight (kg)</label>
            <input type="number" step="0.1" value={form.weight_kg}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></div>
          <div><label>Height (cm)</label>
            <input type="number" step="0.1" value={form.height_cm}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></div>
          <div className="col-span-2 md:col-span-4">
            <label>Symptoms / Notes</label>
            <textarea rows={2} value={form.symptoms}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, symptoms: e.target.value })} /></div>
          <div><label>Pain Scale (0–10)</label>
            <input type="number" min="0" max="10" value={form.pain_scale}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, pain_scale: e.target.value })} /></div>
        </div>

        {canEdit && (
          <div className="mt-5 flex justify-end gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '💾 Save Triage'}
            </button>
            <button type="button" className="btn btn-success" onClick={moveToDoctor}>
              Send to Doctor →
            </button>
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-slate-400 mt-4">
            Only nurses and administrators can edit triage data.
          </p>
        )}
      </form>
    </div>
  );
}

/* ============================================================
   TAB: Consultation
   ============================================================ */
function ConsultationTab({ visit, onReload }) {
  const toast = useToast();
  const [form, setForm] = useState({
    diagnosis: visit.diagnosis || '',
    treatment_plan: visit.treatment_plan || '',
    notes: visit.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/clinic/visits/${visit.visit_number}/`, form);
      toast.success('Consultation notes saved');
      onReload();
    } catch {
      toast.error('Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const sendToPharmacy = async () => {
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/send-to-pharmacy/`);
      toast.success('Sent to pharmacy');
      onReload();
    } catch {
      toast.error('Could not send to pharmacy.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="card-title">Doctor's Notes</p>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3">
            <div><label>Diagnosis *</label>
              <textarea rows={3} value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} /></div>
            <div><label>Treatment Plan</label>
              <textarea rows={3} value={form.treatment_plan}
                onChange={(e) => setForm({ ...form, treatment_plan: e.target.value })} /></div>
            <div><label>Additional Notes</label>
              <textarea rows={2} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex justify-end gap-2 flex-wrap">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '💾 Save Notes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={sendToPharmacy}>
              💊 Send to Pharmacy
            </button>
            <button type="button" className="btn btn-success" onClick={() => setCompleteModal(true)}>
              ✓ Complete Visit
            </button>
          </div>
        </form>
      </div>

      {completeModal && (
        <CompleteVisitModal
          visit={visit}
          onClose={() => setCompleteModal(false)}
          onDone={() => { setCompleteModal(false); onReload(); }}
        />
      )}
    </div>
  );
}

function CompleteVisitModal({ visit, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    diagnosis: visit.diagnosis || '',
    treatment_plan: visit.treatment_plan || '',
    diagnosis_summary: visit.diagnosis || '',
    treatment_summary: visit.treatment_plan || '',
    follow_up_date: '',
    follow_up_notes: '',
    referred_to: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/complete/`, form);
      toast.success('Visit completed');
      onDone();
    } catch {
      toast.error('Could not complete visit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
        <h3 className="text-lg font-bold mb-4">Complete Visit</h3>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3">
            <div><label>Final Diagnosis *</label>
              <textarea rows={2} value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} required /></div>
            <div><label>Treatment Summary</label>
              <textarea rows={2} value={form.treatment_summary}
                onChange={(e) => setForm({ ...form, treatment_summary: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label>Follow-up Date</label>
                <input type="date" value={form.follow_up_date}
                  onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} /></div>
              <div><label>Referred To</label>
                <input value={form.referred_to}
                  onChange={(e) => setForm({ ...form, referred_to: e.target.value })}
                  placeholder="External facility (optional)" /></div>
            </div>
            <div><label>Follow-up Notes</label>
              <textarea rows={2} value={form.follow_up_notes}
                onChange={(e) => setForm({ ...form, follow_up_notes: e.target.value })} /></div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? 'Completing…' : '✓ Complete Visit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   TAB: Lab & Imaging
   ============================================================ */
function LabTab({ visit, services, onReload }) {
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resultModal, setResultModal] = useState(null);

  const labServices = services.filter((s) => {
    const n = (s.category_name || '').toLowerCase();
    return n.includes('lab') || n.includes('radiolog') || n.includes('imaging');
  });

  const toggle = (id) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };

  const sendToLab = async () => {
    if (selected.length === 0) {
      toast.warning('Select at least one test.');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/send-to-lab/`, { service_ids: selected });
      toast.success(`${selected.length} test(s) ordered`);
      setSelected([]);
      onReload();
    } catch {
      toast.error('Could not send to lab.');
    } finally {
      setLoading(false);
    }
  };

  const completeOrder = async (orderId, findings) => {
    try {
      await api.post(`/clinic/lab-orders/${orderId}/complete_order/`, { findings });
      toast.success('Result recorded');
      setResultModal(null);
      onReload();
    } catch {
      toast.error('Could not save result.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="card-title">Order Tests & Imaging</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto mb-4">
          {labServices.length === 0 && (
            <p className="text-sm text-slate-400 col-span-3">
              No lab or imaging services configured. Add some in Services.
            </p>
          )}
          {labServices.map((s) => (
            <label key={s.id}
              className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${
                selected.includes(s.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
              }`}>
              <input type="checkbox" checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)} className="w-4 h-4" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-slate-500">{s.category_name}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={sendToLab} disabled={loading}>
            {loading ? 'Ordering…' : `Order ${selected.length || ''} Test(s) →`}
          </button>
        </div>
      </div>

      <div className="card">
        <p className="card-title">Ordered Tests ({visit.lab_orders?.length || 0})</p>
        {(!visit.lab_orders || visit.lab_orders.length === 0) ? (
          <p className="text-sm text-slate-400">No tests ordered yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visit.lab_orders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">{o.service_name}</td>
                    <td>
                      <span className={`badge ${
                        o.status === 'completed' ? 'badge-green'
                        : o.status === 'cancelled' ? 'badge-red'
                        : 'badge-amber'
                      }`}>
                        {o.status_display}
                      </span>
                    </td>
                    <td className="text-sm text-slate-600 max-w-md truncate">
                      {o.findings || '—'}
                    </td>
                    <td className="text-right">
                      {o.status !== 'completed' && (
                        <button className="btn btn-primary btn-sm"
                          onClick={() => setResultModal(o)}>
                          Record Result
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resultModal && (
        <LabResultModal
          order={resultModal}
          onClose={() => setResultModal(null)}
          onSave={completeOrder}
        />
      )}
    </div>
  );
}

function LabResultModal({ order, onClose, onSave }) {
  const [findings, setFindings] = useState(order.findings || '');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold mb-1">Lab Result</h3>
        <p className="text-sm text-slate-500 mb-4">{order.service_name}</p>
        <label>Findings / Result</label>
        <textarea rows={6} value={findings} onChange={(e) => setFindings(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(order.id, findings)}>
            Save Result
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TAB: Pharmacy
   ============================================================ */
function PharmacyTab({ visit, products, onReload }) {
  const toast = useToast();
  const [modal, setModal] = useState(null);

  const openCreate = () => {
    setModal({
      mode: 'create', drug_name: '', product: '',
      dosage: '', frequency: '', duration: '', instructions: '',
      quantity: 1, unit_price: 0,
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...modal, visit: visit.visit_number };
    if (payload.product === '') delete payload.product;
    delete payload.mode; delete payload.id;
    payload.unit_price = parseFloat(payload.unit_price || 0);
    payload.quantity = parseInt(payload.quantity || 1);
    try {
      if (modal.mode === 'edit') {
        await api.put(`/clinic/prescriptions/${modal.id}/`, payload);
        toast.success('Prescription updated');
      } else {
        await api.post('/clinic/prescriptions/', payload);
        toast.success('Drug prescribed');
      }
      setModal(null);
      onReload();
    } catch {
      toast.error('Could not save prescription.');
    }
  };

  const dispense = async (rx) => {
    if (!confirm(`Dispense ${rx.drug_name}?`)) return;
    try {
      await api.post(`/clinic/prescriptions/${rx.id}/dispense/`);
      toast.success('Dispensed');
      onReload();
    } catch (err) {
      const d = err.response?.data;
      toast.error(d?.detail || 'Could not dispense.');
    }
  };

  const markNotAvailable = async (rx) => {
    const reason = prompt('Reason for non-availability:', 'Out of stock');
    if (!reason) return;
    try {
      await api.post(`/clinic/prescriptions/${rx.id}/mark-not-available/`, { reason });
      toast.success('Marked as not available');
      onReload();
    } catch {
      toast.error('Could not update.');
    }
  };

  const sendToPharmacy = async () => {
    try {
      await api.post(`/clinic/visits/${visit.visit_number}/send-to-pharmacy/`);
      toast.success('Sent to pharmacy queue');
      onReload();
    } catch {
      toast.error('Could not send.');
    }
  };

  const hasPrescriptions = visit.prescriptions && visit.prescriptions.length > 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="card-title mb-0">Prescriptions ({visit.prescriptions?.length || 0})</p>
          <div className="flex gap-2 flex-wrap">
            {hasPrescriptions && (
              <>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => printVisitPrescriptions(visit)}>
                  🖨 Print All
                </button>
                <button className="btn btn-primary btn-sm" onClick={sendToPharmacy}>
                  📤 Send to Pharmacy
                </button>
              </>
            )}
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Prescribe Drug</button>
          </div>
        </div>
        {!hasPrescriptions ? (
          <p className="text-sm text-slate-400">No drugs prescribed yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dosage</th>
                  <th>Freq</th>
                  <th>Duration</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visit.prescriptions.map((rx) => (
                  <tr key={rx.id}>
                    <td className="font-medium">
                      {rx.drug_name}
                      {rx.product_name && (
                        <span className="block text-xs text-slate-500">
                          In stock: {rx.product_name}
                        </span>
                      )}
                    </td>
                    <td className="text-sm">{rx.dosage || '—'}</td>
                    <td className="text-sm">{rx.frequency || '—'}</td>
                    <td className="text-sm">{rx.duration || '—'}</td>
                    <td className="text-right">{rx.quantity}</td>
                    <td className="text-right font-semibold">{rx.total}</td>
                    <td>
                      <span className={`badge ${
                        rx.status === 'dispensed' ? 'badge-green'
                        : rx.status === 'not_available' ? 'badge-red'
                        : rx.status === 'partially_dispensed' ? 'badge-amber'
                        : 'badge-blue'
                      }`}>{rx.status_display}</span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-secondary btn-sm mr-1"
                        onClick={() => {
                          api.get(`/clinic/prescriptions/${rx.id}/print-data/`)
                            .then((r) => printPrescriptionSlip(r.data))
                            .catch(() => toast.error('Could not print.'));
                        }}
                        title="Print this prescription">
                        🖨
                      </button>
                      {rx.status === 'prescribed' && rx.product_available && (
                        <button className="btn btn-success btn-sm mr-1"
                          onClick={() => dispense(rx)}>
                          ✓
                        </button>
                      )}
                      {rx.status !== 'dispensed' && rx.status !== 'not_available' && (
                        <button className="btn btn-danger btn-sm"
                          onClick={() => markNotAvailable(rx)}>
                          ✗
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <PrescriptionModal
          modal={modal}
          setModal={setModal}
          submit={submit}
          products={products}
        />
      )}
    </div>
  );
}

function PrescriptionModal({ modal, setModal, submit, products }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
        <h3 className="text-lg font-bold mb-4">
          {modal.mode === 'edit' ? 'Edit Prescription' : 'Prescribe Drug'}
        </h3>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label>Drug Name *</label>
              <input value={modal.drug_name}
                onChange={(e) => setModal({ ...modal, drug_name: e.target.value })}
                placeholder="e.g. Paracetamol 500mg" required />
            </div>
            <div className="md:col-span-2">
              <label>Link to Inventory (optional)</label>
              <select value={modal.product}
                onChange={(e) => {
                  const pid = e.target.value;
                  const prod = products.find((p) => String(p.id) === pid);
                  setModal({
                    ...modal,
                    product: pid,
                    unit_price: prod ? prod.selling_price : modal.unit_price,
                    drug_name: modal.drug_name || (prod ? prod.name : ''),
                  });
                }}>
                <option value="">— Not in inventory —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.quantity}) — {p.selling_price}
                  </option>
                ))}
              </select>
            </div>
            <div><label>Dosage</label>
              <input value={modal.dosage}
                onChange={(e) => setModal({ ...modal, dosage: e.target.value })}
                placeholder="e.g. 500mg" /></div>
            <div><label>Frequency</label>
              <input value={modal.frequency}
                onChange={(e) => setModal({ ...modal, frequency: e.target.value })}
                placeholder="e.g. 3x daily" /></div>
            <div><label>Duration</label>
              <input value={modal.duration}
                onChange={(e) => setModal({ ...modal, duration: e.target.value })}
                placeholder="e.g. 5 days" /></div>
            <div><label>Quantity</label>
              <input type="number" min="1" value={modal.quantity}
                onChange={(e) => setModal({ ...modal, quantity: e.target.value })} /></div>
            <div><label>Unit Price</label>
              <input type="number" step="0.01" value={modal.unit_price}
                onChange={(e) => setModal({ ...modal, unit_price: e.target.value })} /></div>
            <div className="md:col-span-2"><label>Instructions</label>
              <textarea rows={2} value={modal.instructions}
                onChange={(e) => setModal({ ...modal, instructions: e.target.value })} /></div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   TAB: Billing
   ============================================================ */
function BillingTab({ visit, services, currency, onReload }) {
  const toast = useToast();
  const [addModal, setAddModal] = useState(false);
  const [payModal, setPayModal] = useState(false);

  const money = (n) => formatMoney(n, currency);
  const invoice = visit.invoice;

  const recalc = async () => {
    try {
      await api.post(`/clinic/invoices/${invoice.id}/recalculate/`);
      onReload();
    } catch {
      toast.error('Could not recalculate.');
    }
  };

  useEffect(() => { if (invoice) recalc(); /* eslint-disable-next-line */ }, []);

  if (!invoice) return <p className="text-sm text-slate-500">No invoice for this visit yet.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="stat-label">Invoice #</p>
          <p className="text-sm font-bold mt-2">{invoice.invoice_number}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Subtotal</p>
          <p className="stat-value">{money(invoice.subtotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total</p>
          <p className="stat-value">{money(invoice.total)}</p>
        </div>
        <div className="stat-card green">
          <p className="stat-label">Balance</p>
          <p className="stat-value">{money(invoice.balance)}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="card-title mb-0">Invoice Lines</p>
          <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>
            + Add Service
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit Price</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.description}</td>
                  <td className="text-right">{it.quantity}</td>
                  <td className="text-right">{money(it.unit_price)}</td>
                  <td className="text-right font-semibold">{money(it.subtotal)}</td>
                </tr>
              ))}
              {visit.prescriptions?.filter((r) => r.status !== 'cancelled').map((rx) => (
                <tr key={`rx-${rx.id}`} className="bg-blue-50/30">
                  <td>💊 {rx.drug_name}</td>
                  <td className="text-right">{rx.quantity}</td>
                  <td className="text-right">{money(rx.unit_price)}</td>
                  <td className="text-right font-semibold">{money(rx.total)}</td>
                </tr>
              ))}
              {invoice.items.length === 0 && (!visit.prescriptions || visit.prescriptions.length === 0) && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400 py-6">No items yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold">Amount Paid</p>
            <p className="text-2xl font-bold text-slate-900">{money(invoice.amount_paid)}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={recalc}>🔄 Recalculate</button>
            <button className="btn btn-primary" onClick={() => setPayModal(true)}>
              💰 Record Payment
            </button>
          </div>
        </div>
      </div>

      {addModal && (
        <AddServiceModal
          invoice={invoice}
          services={services}
          currency={currency}
          onClose={() => setAddModal(false)}
          onDone={() => { setAddModal(false); onReload(); }}
        />
      )}

      {payModal && (
        <PaymentModal
          invoice={invoice}
          currency={currency}
          onClose={() => setPayModal(false)}
          onDone={() => { setPayModal(false); onReload(); }}
        />
      )}
    </div>
  );
}

function AddServiceModal({ invoice, services, currency, onClose, onDone }) {
  const toast = useToast();
  const [selected, setSelected] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const money = (n) => formatMoney(n, currency);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const service = services.find((s) => String(s.id) === selected);
    try {
      await api.post('/clinic/invoice-items/', {
        invoice: invoice.id,
        service: selected,
        description: service.name,
        quantity: parseInt(qty),
        unit_price: parseFloat(price),
      });
      toast.success('Service added');
      onDone();
    } catch {
      toast.error('Could not add service.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold mb-4">Add Service</h3>
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label>Service *</label>
              <select value={selected} onChange={(e) => {
                setSelected(e.target.value);
                const s = services.find((x) => String(x.id) === e.target.value);
                if (s) setPrice(s.price);
              }} required>
                <option value="">— Select —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {money(s.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label>Qty</label>
                <input type="number" min="1" value={qty}
                  onChange={(e) => setQty(e.target.value)} /></div>
              <div><label>Unit Price</label>
                <input type="number" step="0.01" value={price}
                  onChange={(e) => setPrice(e.target.value)} /></div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ invoice, currency, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(invoice.balance);
  const [method, setMethod] = useState('cash');
  const money = (n) => formatMoney(n, currency);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/clinic/invoices/${invoice.id}/record-payment/`, {
        amount: parseFloat(amount),
        payment_method: method,
      });
      toast.success('Payment recorded');
      onDone();
    } catch {
      toast.error('Could not record payment.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold mb-1">Record Payment</h3>
        <p className="text-sm text-slate-500 mb-4">
          Balance: <b>{money(invoice.balance)}</b>
        </p>
        <form onSubmit={submit}>
          <div className="mb-3">
            <label>Amount</label>
            <input type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   PRINT: Visit Summary
   ============================================================ */
function PrintVisitButton({ visit, currency }) {
  const handlePrint = () => printVisitSummary(visit, currency);
  return (
    <button className="btn btn-secondary" onClick={handlePrint}>
      🖨 Print Summary
    </button>
  );
}

function printVisitSummary(visit, currency) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;

  const money = (n) => formatMoney(n, currency);
  const rx = visit.prescriptions || [];
  const labs = visit.lab_orders || [];
  const inv = visit.invoice;

  const html = `
    <html>
      <head>
        <title>Visit Summary — ${visit.visit_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #111; }
          h1 { font-size: 20px; margin: 0 0 4px 0; }
          h2 { font-size: 14px; margin: 20px 0 8px 0; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          .right { text-align: right; }
          .total { font-weight: bold; font-size: 14px; }
          .footer { margin-top: 30px; font-size: 11px; color: #666; text-align: center; }
          .stamp { margin-top: 40px; }
        </style>
      </head>
      <body>
        <h1>Visit Summary</h1>
        <p class="meta">
          Visit #: <b>${visit.visit_number}</b> · ${visit.visit_date}<br/>
          Patient: <b>${visit.patient_name}</b> (${visit.patient_number})<br/>
          ${visit.patient_phone ? `Phone: ${visit.patient_phone}<br/>` : ''}
          Doctor: ${visit.doctor_name || '—'}
        </p>

        ${visit.triage ? `
          <h2>Triage / Vitals</h2>
          <table>
            <tr><th>Temp</th><td>${visit.triage.temperature_c ?? '—'} °C</td>
                <th>BP</th><td>${visit.triage.blood_pressure_systolic ?? '—'}/${visit.triage.blood_pressure_diastolic ?? '—'}</td></tr>
            <tr><th>Pulse</th><td>${visit.triage.pulse_bpm ?? '—'} bpm</td>
                <th>SpO₂</th><td>${visit.triage.oxygen_saturation ?? '—'} %</td></tr>
            <tr><th>Weight</th><td>${visit.triage.weight_kg ?? '—'} kg</td>
                <th>Height</th><td>${visit.triage.height_cm ?? '—'} cm</td></tr>
            <tr><th>BMI</th><td>${visit.triage.bmi ?? '—'}</td>
                <th>Pain</th><td>${visit.triage.pain_scale ?? '—'} / 10</td></tr>
            ${visit.triage.symptoms ? `<tr><th>Symptoms</th><td colspan="3">${visit.triage.symptoms}</td></tr>` : ''}
          </table>
        ` : ''}

        ${visit.diagnosis ? `<h2>Diagnosis</h2><p>${visit.diagnosis}</p>` : ''}
        ${visit.treatment_plan ? `<h2>Treatment Plan</h2><p>${visit.treatment_plan}</p>` : ''}

        ${labs.length ? `
          <h2>Lab & Imaging Results</h2>
          <table>
            <tr><th>Test</th><th>Status</th><th>Findings</th></tr>
            ${labs.map((o) => `
              <tr>
                <td>${o.service_name}</td>
                <td>${o.status_display}</td>
                <td>${(o.findings || '—').replace(/\n/g, '<br/>')}</td>
              </tr>
            `).join('')}
          </table>
        ` : ''}

        ${rx.length ? `
          <h2>Prescriptions</h2>
          <table>
            <tr><th>Drug</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th class="right">Qty</th></tr>
            ${rx.map((r) => `
              <tr>
                <td>${r.drug_name}</td>
                <td>${r.dosage || '—'}</td>
                <td>${r.frequency || '—'}</td>
                <td>${r.duration || '—'}</td>
                <td class="right">${r.quantity}</td>
              </tr>
            `).join('')}
          </table>
        ` : ''}

        ${inv ? `
          <h2>Invoice ${inv.invoice_number}</h2>
          <table>
            <tr><th>Description</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Subtotal</th></tr>
            ${inv.items.map((it) => `
              <tr>
                <td>${it.description}</td>
                <td class="right">${it.quantity}</td>
                <td class="right">${money(it.unit_price)}</td>
                <td class="right">${money(it.subtotal)}</td>
              </tr>
            `).join('')}
            ${rx.filter((r) => r.status !== 'cancelled').map((r) => `
              <tr>
                <td>💊 ${r.drug_name}</td>
                <td class="right">${r.quantity}</td>
                <td class="right">${money(r.unit_price)}</td>
                <td class="right">${money(r.total)}</td>
              </tr>
            `).join('')}
            <tr><td colspan="3" class="right total">Subtotal</td><td class="right total">${money(inv.subtotal)}</td></tr>
            <tr><td colspan="3" class="right total">Total</td><td class="right total">${money(inv.total)}</td></tr>
            <tr><td colspan="3" class="right">Paid</td><td class="right">${money(inv.amount_paid)}</td></tr>
            <tr><td colspan="3" class="right total">Balance</td><td class="right total">${money(inv.balance)}</td></tr>
          </table>
        ` : ''}

        ${visit.summary ? `
          <div class="stamp">
            <h2>Follow-up</h2>
            ${visit.summary.follow_up_date ? `<p>Next visit: <b>${visit.summary.follow_up_date}</b></p>` : ''}
            ${visit.summary.follow_up_notes ? `<p>${visit.summary.follow_up_notes}</p>` : ''}
            ${visit.summary.referred_to ? `<p>Referred to: <b>${visit.summary.referred_to}</b></p>` : ''}
          </div>
        ` : ''}

        <div class="footer">
          Generated on ${new Date().toLocaleString()} · Business Manager
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;
  w.document.write(html);
  w.document.close();
}

/* ============================================================
   PRINT: All Prescriptions for a Visit
   ============================================================ */
export function printVisitPrescriptions(visit) {
  const w = window.open('', '_blank', 'width=780,height=900');
  if (!w) return;
  const rx = visit.prescriptions || [];

  const html = `
    <html>
      <head>
        <title>Prescriptions — ${visit.patient_name}</title>
        <style>
          body { font-family: Georgia, serif; padding: 40px; color: #111; line-height: 1.5; }
          .header { border-bottom: 3px double #1e40af; padding-bottom: 16px; margin-bottom: 20px; text-align: center; }
          h1 { font-size: 22px; color: #1e40af; margin: 0 0 4px 0; }
          .meta { font-size: 12px; color: #555; }
          .info { font-size: 14px; margin: 8px 0; }
          .rx-symbol { font-size: 32px; color: #1e40af; margin: 20px 0 10px 0; font-weight: bold; }
          .drug { border-bottom: 1px dashed #ccc; padding: 14px 0; }
          .drug:last-child { border-bottom: none; }
          .drug-name { font-size: 17px; font-weight: bold; margin: 0 0 6px 0; }
          .drug-detail { font-size: 14px; color: #333; margin: 2px 0; }
          .drug-detail span { color: #666; }
          .footer { margin-top: 60px; font-size: 12px; color: #666; }
          .signature { margin-top: 50px; display: flex; justify-content: space-between; }
          .sig-line { border-top: 1px solid #333; padding-top: 6px; min-width: 220px; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Prescriptions</h1>
          <div class="meta">Visit #${visit.visit_number} · ${visit.visit_date}</div>
        </div>

        <div class="info"><b>Patient:</b> ${visit.patient_name} (${visit.patient_number})</div>
        ${visit.diagnosis ? `<div class="info"><b>Diagnosis:</b> ${visit.diagnosis}</div>` : ''}

        <div class="rx-symbol">℞</div>

        ${rx.map((r) => `
          <div class="drug">
            <p class="drug-name">${r.drug_name}</p>
            ${r.dosage ? `<p class="drug-detail"><span>Dosage:</span> ${r.dosage}</p>` : ''}
            ${r.frequency ? `<p class="drug-detail"><span>Frequency:</span> ${r.frequency}</p>` : ''}
            ${r.duration ? `<p class="drug-detail"><span>Duration:</span> ${r.duration}</p>` : ''}
            <p class="drug-detail"><span>Quantity:</span> ${r.quantity}</p>
            ${r.instructions ? `<p class="drug-detail"><span>Instructions:</span> ${r.instructions}</p>` : ''}
          </div>
        `).join('')}

        <div class="signature">
          <div class="sig-line">Prescriber: ${visit.doctor_name || '—'}</div>
          <div class="sig-line">Date: ${visit.visit_date}</div>
        </div>

        <div class="footer">
          Generated on ${new Date().toLocaleString()} · ${rx.length} medication(s)
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;
  w.document.write(html);
  w.document.close();
}

/* ============================================================
   PRINT: Single Prescription Slip
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
          body { font-family: Georgia, serif; padding: 40px; color: #111; line-height: 1.5; }
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

/* ============================================================
   Utility
   ============================================================ */
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}>
      {children}
    </button>
  );
}