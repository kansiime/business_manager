'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function LabPage() {
  const toast = useToast();
  const { pages } = useTenantContext();
  const canUse = pages.includes('consultations') || pages.includes('patients');

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [resultModal, setResultModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = filter === 'pending' ? '?status=ordered' : '';
      const r = await api.get(`/clinic/lab-orders/${qs}`);
      setOrders(r.data);
    } catch {
      toast.error('Could not load lab orders.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
        </div>
      </ProtectedRoute>
    );
  }

  const completeOrder = async (id, findings) => {
    try {
      await api.post(`/clinic/lab-orders/${id}/complete_order/`, { findings });
      toast.success('Result saved');
      setResultModal(null);
      load();
    } catch {
      toast.error('Could not save.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">🔬 Lab & Imaging</h1>
        <p className="text-sm text-slate-500 mt-1">
          Process pending tests and record results
        </p>
      </div>

      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1">
          <button onClick={() => setFilter('pending')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              filter === 'pending' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
            }`}>
            ⏳ Pending
          </button>
          <button onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              filter === 'all' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'
            }`}>
            📋 All Orders
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && orders.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-slate-500">No pending orders.</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th>Visit</th>
                <th>Status</th>
                <th>Findings</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="font-medium">{o.service_name}</td>
                  <td className="text-xs">#{o.visit}</td>
                  <td>
                    <span className={`badge ${
                      o.status === 'completed' ? 'badge-green'
                      : o.status === 'cancelled' ? 'badge-red'
                      : 'badge-amber'
                    }`}>{o.status_display}</span>
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

      {resultModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-1">Record Lab Result</h3>
            <p className="text-sm text-slate-500 mb-4">{resultModal.service_name}</p>
            <label>Findings / Result</label>
            <textarea id="findings" rows={6} defaultValue={resultModal.findings || ''} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setResultModal(null)}>Cancel</button>
              <button className="btn btn-primary"
                onClick={() => {
                  const f = document.getElementById('findings').value;
                  completeOrder(resultModal.id, f);
                }}>
                Save Result
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}