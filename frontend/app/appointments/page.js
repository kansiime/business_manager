'use client';
import { useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function AppointmentsPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse = enabled_features.includes('appointments');

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, p, d] = await Promise.all([
        api.get(`/clinic/appointments/?date=${selectedDate}`),
        api.get('/clinic/patients/'),
        api.get('/clinic/staff/?role=doctor'),
      ]);
      setAppointments(a.data);
      setPatients(p.data);
      setDoctors(d.data);
    } catch {
      toast.error('Could not load appointments.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedDate]);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Appointments are only enabled for clinics and health facilities.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  const openCreate = () => {
    setModal({
      patient: '', doctor: '', appointment_date: selectedDate,
      appointment_time: '09:00', duration_minutes: 30, reason: '',
    });
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post('/clinic/appointments/', {
        ...modal,
        patient: modal.patient,
        doctor: modal.doctor || null,
      });
      toast.success('Appointment booked');
      setModal(null);
      load();
    } catch (err) {
      toast.error('Could not book appointment.');
    }
  };

  const checkIn = async (a) => {
    if (!confirm(`Check in ${a.patient_name}? This will create a new visit.`)) return;
    try {
      // Create visit from appointment
      const v = await api.post('/clinic/visits/create-with-triage/', {
        patient: a.patient,
        appointment: a.id,
        attending_doctor: a.doctor || null,
      });
      await api.post(`/clinic/appointments/${a.id}/check_in/`);
      toast.success('Checked in — opening consultation');
      window.location.href = `/consultations/${v.data.id}`;
    } catch {
      toast.error('Could not check in.');
    }
  };

  const statusBadge = (s) => {
    const map = {
      scheduled: 'badge-blue',
      checked_in: 'badge-amber',
      in_consultation: 'badge-amber',
      completed: 'badge-green',
      cancelled: 'badge-red',
      no_show: 'badge-gray',
    };
    return map[s] || 'badge-gray';
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-sm text-slate-500 mt-1">
            {appointments.length} appointment{appointments.length !== 1 && 's'} on {selectedDate}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button className="btn btn-secondary" onClick={() => setSelectedDate(today)}>Today</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Book Appointment</button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>Phone</th>
              <th>Doctor</th>
              <th>Reason</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No appointments for this day.
                </td>
              </tr>
            )}
            {appointments.map((a) => (
              <tr key={a.id}>
                <td className="font-mono text-xs">
                  {String(a.appointment_time).slice(0, 5)}
                </td>
                <td className="font-medium">{a.patient_name}</td>
                <td className="text-sm">{a.patient_phone || '—'}</td>
                <td className="text-sm">{a.doctor_name || '—'}</td>
                <td className="text-sm text-slate-600 max-w-xs truncate">{a.reason || '—'}</td>
                <td><span className={`badge ${statusBadge(a.status)}`}>{a.status_display}</span></td>
                <td className="text-right whitespace-nowrap">
                  {a.status === 'scheduled' && (
                    <button className="btn btn-primary btn-sm" onClick={() => checkIn(a)}>
                      Check In →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">Book Appointment</h3>
            <form onSubmit={save}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label>Patient *</label>
                  <select value={modal.patient} onChange={(e) => setModal({ ...modal, patient: e.target.value })} required>
                    <option value="">— Select patient —</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.patient_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Doctor</label>
                  <select value={modal.doctor} onChange={(e) => setModal({ ...modal, doctor: e.target.value })}>
                    <option value="">— Unassigned —</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.user_name || d.username} {d.specialization ? `(${d.specialization})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Duration (min)</label>
                  <input type="number" value={modal.duration_minutes}
                    onChange={(e) => setModal({ ...modal, duration_minutes: parseInt(e.target.value) })} />
                </div>
                <div>
                  <label>Date *</label>
                  <input type="date" value={modal.appointment_date}
                    onChange={(e) => setModal({ ...modal, appointment_date: e.target.value })} required />
                </div>
                <div>
                  <label>Time *</label>
                  <input type="time" value={modal.appointment_time}
                    onChange={(e) => setModal({ ...modal, appointment_time: e.target.value })} required />
                </div>
                <div className="md:col-span-2">
                  <label>Reason for Visit</label>
                  <input value={modal.reason} onChange={(e) => setModal({ ...modal, reason: e.target.value })} />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Book</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}