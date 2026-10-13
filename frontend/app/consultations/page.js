'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function ConsultationsPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse = enabled_features.includes('prescriptions');

  const [visits, setVisits] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = filter === 'active'
        ? '?today=true'
        : filter === 'completed'
          ? '?status=completed'
          : '';
      const r = await api.get(`/clinic/visits/${qs}`);
      setVisits(r.data);
    } catch {
      toast.error('Could not load visits.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">Consultations are only for clinics.</p>
        </div>
      </ProtectedRoute>
    );
  }

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
          <h1 className="text-2xl font-bold text-slate-900">Consultations</h1>
          <p className="text-sm text-slate-500 mt-1">
            {visits.length} visit{visits.length !== 1 && 's'}
          </p>
        </div>
        <Link href="/consultations/new" className="btn btn-primary">+ New Visit</Link>
      </div>

      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1">
          <button onClick={() => setFilter('active')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              filter === 'active' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
            }`}>
            Today
          </button>
          <button onClick={() => setFilter('completed')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              filter === 'completed' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
            }`}>
            Completed
          </button>
          <button onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              filter === 'all' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
            }`}>
            All
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Visit #</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Complaint</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visits.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No visits for this filter.
                </td>
              </tr>
            )}
            {visits.map((v) => (
              <tr key={v.id}>
                <td className="font-mono text-xs">{v.visit_number}</td>
                <td className="font-medium">{v.patient_name}</td>
                <td className="text-sm">{v.doctor_name || '—'}</td>
                <td className="text-sm text-slate-600 max-w-xs truncate">{v.chief_complaint || '—'}</td>
                <td><span className={`badge ${statusBadge(v.status)}`}>{v.status_display}</span></td>
                <td className="text-sm text-slate-500 whitespace-nowrap">{v.visit_date}</td>
                <td className="text-right">
                  <Link href={`/consultations/${v.visit_number}`} className="btn btn-primary btn-sm">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}