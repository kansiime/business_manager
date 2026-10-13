'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function SchedulePage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse = enabled_features.includes('appointments');

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/clinic/appointments/week_schedule/?week_start=${weekStart}`);
      setData(r.data);
    } catch {
      toast.error('Could not load schedule.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStart]);

  const shiftWeek = (delta) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            The doctor schedule is only available for clinics.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📅 Weekly Schedule</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data ? data.week_label : 'Loading…'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => shiftWeek(-1)}>← Previous</button>
          <button className="btn btn-secondary" onClick={() => setWeekStart(new Date().toISOString().slice(0, 10))}>
            Today
          </button>
          <button className="btn btn-secondary" onClick={() => shiftWeek(1)}>Next →</button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {data && data.grid.length === 0 && (
        <div className="card">
          <p className="text-sm text-slate-500">
            No doctors configured yet. Add doctors in the Staff page.
          </p>
        </div>
      )}

      {data && data.grid.length > 0 && (
        <div className="table-scroll">
          <table style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Doctor</th>
                {data.days.map((d) => (
                  <th key={d.date} className={d.is_today ? 'bg-blue-100' : ''}>
                    {d.date_display}
                  </th>
                ))}
                <th>Week Total</th>
              </tr>
            </thead>
            <tbody>
              {data.grid.map((row) => (
                <tr key={row.doctor_id}>
                  <td className="font-medium">
                    {row.doctor_name}
                    {row.specialization && (
                      <span className="block text-xs text-slate-500">{row.specialization}</span>
                    )}
                  </td>
                  {row.days.map((day) => (
                    <td key={day.date} className={day.is_today ? 'bg-blue-50' : ''}>
                      {day.count === 0 ? (
                        <span className="text-xs text-slate-300">—</span>
                      ) : (
                        <div className="space-y-1">
                          {day.appointments.slice(0, 4).map((a) => (
                            <Link
                              key={a.id}
                              href={`/patients/${a.patient_id}`}
                              className={`block text-xs px-1.5 py-1 rounded truncate ${
                                a.status === 'completed' ? 'bg-green-100 text-green-900'
                                : a.status === 'cancelled' ? 'bg-red-100 text-red-900'
                                : 'bg-amber-100 text-amber-900'
                              }`}
                              title={`${a.time} — ${a.patient_name}`}
                            >
                              <b>{a.time}</b> {a.patient_name}
                            </Link>
                          ))}
                          {day.appointments.length > 4 && (
                            <span className="text-xs text-slate-400">
                              +{day.appointments.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="text-right font-semibold">{row.week_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedRoute>
  );
}