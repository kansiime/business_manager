'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';
import { formatMoney } from '@/lib/format';

const ROLES = [
  ['doctor', 'Doctor'],
  ['nurse', 'Nurse'],
  ['midwife', 'Midwife'],
  ['pharmacist', 'Pharmacist'],
  ['lab_tech', 'Lab Technician'],
  ['radiologist', 'Radiologist'],
  ['receptionist', 'Receptionist'],
  ['accountant', 'Accountant'],
];

export default function DoctorsPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse = enabled_features.includes('prescriptions') ||
                 enabled_features.includes('appointments');

  const [staff, setStaff] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, u, gs] = await Promise.all([
        api.get('/clinic/staff/'),
        api.get('/auth/users/available-for-clinic/').catch(() => ({ data: [] })),
        api.get('/auth/settings/'),
      ]);
      setStaff(s.data);
      setAvailableUsers(u.data);
      setCurrency(gs.data.currency_symbol || 'UGX');
    } catch {
      toast.error('Could not load staff.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Staff management is only enabled for clinics and health facilities.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  const openCreate = () => {
    setModal({
      user: '', role: 'doctor', specialization: '', license_number: '',
      consultation_fee: 0, bio: '', is_available: true,
    });
  };

  const openEdit = (s) => {
    setModal({
      mode: 'edit', id: s.id, user: s.user, role: s.role,
      specialization: s.specialization || '', license_number: s.license_number || '',
      consultation_fee: s.consultation_fee, bio: s.bio || '', is_available: s.is_available,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        user: modal.user,
        role: modal.role,
        specialization: modal.specialization,
        license_number: modal.license_number,
        consultation_fee: parseFloat(modal.consultation_fee || 0),
        bio: modal.bio,
        is_available: modal.is_available,
      };
      if (modal.mode === 'edit') {
        await api.put(`/clinic/staff/${modal.id}/`, payload);
        toast.success('Staff updated');
      } else {
        await api.post('/clinic/staff/', payload);
        toast.success('Staff added');
      }
      setModal(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(typeof d === 'object' ? JSON.stringify(d) : 'Could not save.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clinical Staff</h1>
          <p className="text-sm text-slate-500 mt-1">
            {staff.length} staff member{staff.length !== 1 && 's'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Staff</button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Specialization</th>
              <th className="text-right">Consultation Fee</th>
              <th>Available</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  No staff yet. Click "+ Add Staff" to link an existing user.
                </td>
              </tr>
            )}
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.user_name || '—'}</td>
                <td className="text-sm text-slate-500">{s.username}</td>
                <td><span className="badge badge-blue">{s.role_display}</span></td>
                <td className="text-sm">{s.specialization || '—'}</td>
                <td className="text-right">{formatMoney(s.consultation_fee, currency)}</td>
                <td>{s.is_available ? '✅' : '—'}</td>
                <td className="text-right">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold mb-4">
              {modal.mode === 'edit' ? 'Edit Staff' : 'Add Staff Member'}
            </h3>
            <form onSubmit={save}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label>User Account *</label>
                  <select
                    value={modal.user}
                    onChange={(e) => setModal({ ...modal, user: e.target.value })}
                    required
                    disabled={modal.mode === 'edit'}
                  >
                    <option value="">— Select an existing user —</option>
                    {modal.mode === 'edit' ? (
                      <option value={modal.user}>{modal.user}</option>
                    ) : (
                      availableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} ({u.username}) — {u.role}
                        </option>
                      ))
                    )}
                  </select>
                  {modal.mode !== 'edit' && availableUsers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No available users. Create a user first (in /users) then come back.
                    </p>
                  )}
                </div>
                <div>
                  <label>Role *</label>
                  <select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value })} required>
                    {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label>Specialization</label>
                  <input value={modal.specialization}
                    onChange={(e) => setModal({ ...modal, specialization: e.target.value })}
                    placeholder="e.g. Pediatrician" />
                </div>
                <div>
                  <label>License Number</label>
                  <input value={modal.license_number}
                    onChange={(e) => setModal({ ...modal, license_number: e.target.value })} />
                </div>
                <div>
                  <label>Consultation Fee</label>
                  <input type="number" step="0.01" value={modal.consultation_fee}
                    onChange={(e) => setModal({ ...modal, consultation_fee: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label>Bio / Notes</label>
                  <textarea rows={2} value={modal.bio}
                    onChange={(e) => setModal({ ...modal, bio: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={modal.is_available}
                      onChange={(e) => setModal({ ...modal, is_available: e.target.checked })}
                      className="w-4 h-4" />
                    <span className="text-sm">Available for appointments</span>
                  </label>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {modal.mode === 'edit' ? 'Save Changes' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}