'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function ReceptionPage() {
  const toast = useToast();
  const router = useRouter();
  const [visits, setVisits] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      const [v, a] = await Promise.all([
        api.get(`/clinic/visits/?today=true`),
        api.get(`/clinic/appointments/?date=${today}`),
      ]);
      setVisits(v.data);
      setAppointments(a.data);
    } catch {
      toast.error('Could not load data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const statusBadge = (s) => ({
    waiting_triage: 'badge-amber',
    waiting_doctor: 'badge-amber',
    with_doctor: 'badge-blue',
    waiting_lab: 'badge-amber',
    waiting_pharmacy: 'badge-amber',
    ready_for_billing: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red',
  }[s] || 'badge-gray');

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🩺 Reception</h1>
          <p className="text-sm text-slate-500 mt-1">
            Check patients in and track today's flow
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/patients" className="btn btn-secondary">+ Register Patient</Link>
          <Link href="/consultations/new" className="btn btn-primary">+ Check-In Patient</Link>
        </div>
      </div>

      <div className="card mb-6">
        <p className="card-title">Today's Appointments ({appointments.length})</p>
        {appointments.length === 0 ? (
          <p className="text-sm text-slate-400">No appointments today.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{String(a.appointment_time).slice(0, 5)}</td>
                    <td className="font-medium">{a.patient_name}</td>
                    <td className="text-sm">{a.doctor_name || '—'}</td>
                    <td>
                      <span className={`badge ${a.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>
                        {a.status_display}
                      </span>
                    </td>
                    <td className="text-right">
                      {a.status === 'scheduled' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => router.push(`/consultations/new?patient=${a.patient}&appointment=${a.id}`)}
                        >
                          Check In →
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

      <div className="card">
        <p className="card-title">Active Visits Today ({visits.length})</p>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : visits.length === 0 ? (
          <p className="text-sm text-slate-400">No patients checked in yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <Link
                key={v.id}
                href={`/consultations/${v.id}`}
                className="flex items-center justify-between p-3 border border-slate-200 rounded hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium">{v.patient_name}</p>
                  <p className="text-xs text-slate-500">
                    {v.patient_number} · {v.doctor_name || 'No doctor yet'}
                  </p>
                </div>
                <span className={`badge ${statusBadge(v.status)}`}>{v.status_display}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}