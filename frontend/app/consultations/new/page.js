'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function NewVisitPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const preselect = params.get('patient');

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({
    patient: preselect || '',
    attending_doctor: '',
    chief_complaint: '',
    priority: 'normal',
    // triage
    temperature_c: '', bp_systolic: '', bp_diastolic: '',
    pulse_bpm: '', respiratory_rate: '', oxygen_saturation: '',
    weight_kg: '', height_cm: '', symptoms: '', pain_scale: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/clinic/patients/'),
      api.get('/clinic/staff/?role=doctor'),
    ]).then(([p, d]) => {
      setPatients(p.data);
      setDoctors(d.data);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.patient) {
      toast.error('Please select a patient.');
      return;
    }
    setSaving(true);
    try {
      // Clean empty numbers
      const payload = { ...form };
      ['temperature_c', 'bp_systolic', 'bp_diastolic', 'pulse_bpm',
       'respiratory_rate', 'oxygen_saturation', 'weight_kg', 'height_cm',
       'pain_scale'].forEach((k) => {
        if (payload[k] === '' || payload[k] === null) delete payload[k];
      });
      if (!payload.attending_doctor) delete payload.attending_doctor;

      const r = await api.post('/clinic/visits/create-with-triage/', payload);
      toast.success('Visit created');
      router.push(`/consultations/${r.data.visit_number}`);
    } catch (err) {
      const d = err.response?.data;
      toast.error(typeof d === 'object' ? JSON.stringify(d) : 'Could not create visit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <button onClick={() => router.push('/patients')}
          className="text-sm text-slate-500 hover:text-slate-800 mb-1">
          ← Back to Patients
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Visit</h1>
        <p className="text-sm text-slate-500 mt-1">
          Check in a patient and record initial vitals
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <div className="card">
          <p className="card-title">Patient & Doctor</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label>Patient *</label>
              <select value={form.patient}
                onChange={(e) => setForm({ ...form, patient: e.target.value })} required>
                <option value="">— Select patient —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.patient_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Attending Doctor</label>
              <select value={form.attending_doctor}
                onChange={(e) => setForm({ ...form, attending_doctor: e.target.value })}>
                <option value="">— Assign later —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.user_name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label>Chief Complaint</label>
              <input value={form.chief_complaint}
                onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
                placeholder="e.g. Fever for 3 days, headache" />
            </div>
            <div>
              <label>Priority</label>
              <select value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <p className="card-title">Triage — Vitals (optional)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label>Temp (°C)</label>
              <input type="number" step="0.1" value={form.temperature_c}
                onChange={(e) => setForm({ ...form, temperature_c: e.target.value })} /></div>
            <div><label>BP Systolic</label>
              <input type="number" value={form.bp_systolic}
                onChange={(e) => setForm({ ...form, bp_systolic: e.target.value })} /></div>
            <div><label>BP Diastolic</label>
              <input type="number" value={form.bp_diastolic}
                onChange={(e) => setForm({ ...form, bp_diastolic: e.target.value })} /></div>
            <div><label>Pulse (bpm)</label>
              <input type="number" value={form.pulse_bpm}
                onChange={(e) => setForm({ ...form, pulse_bpm: e.target.value })} /></div>
            <div><label>Resp. Rate</label>
              <input type="number" value={form.respiratory_rate}
                onChange={(e) => setForm({ ...form, respiratory_rate: e.target.value })} /></div>
            <div><label>SpO₂ (%)</label>
              <input type="number" value={form.oxygen_saturation}
                onChange={(e) => setForm({ ...form, oxygen_saturation: e.target.value })} /></div>
            <div><label>Weight (kg)</label>
              <input type="number" step="0.1" value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></div>
            <div><label>Height (cm)</label>
              <input type="number" step="0.1" value={form.height_cm}
                onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></div>
            <div className="col-span-2 md:col-span-4">
              <label>Symptoms / Notes</label>
              <textarea rows={2} value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })} /></div>
            <div><label>Pain Scale (0–10)</label>
              <input type="number" min="0" max="10" value={form.pain_scale}
                onChange={(e) => setForm({ ...form, pain_scale: e.target.value })} /></div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Visit →'}
          </button>
        </div>
      </form>
    </ProtectedRoute>
  );
}