'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Pagination from '@/components/Pagination';
import api from '@/lib/api';
import { usePagination } from '@/lib/usePagination';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function PatientsPage() {
  const toast = useToast();
  const { enabled_features } = useTenantContext();
  const canUse =
    enabled_features.includes('prescriptions') ||
    enabled_features.includes('appointments');

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const r = await api.get(`/clinic/patients/${q}`);
      setPatients(r.data);
    } catch {
      toast.error('Could not load patients.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const pg = usePagination(patients, pageSize);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Not a clinic</p>
          <p className="text-sm text-slate-500 mt-1">
            Patient management is only for clinics and health facilities.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  const openCreate = () => {
    setModal({
      mode: 'create',
      first_name: '', last_name: '', phone: '', gender: '', date_of_birth: '',
      blood_group: '', allergies: '', chronic_conditions: '',
      emergency_contact_name: '', emergency_contact_phone: '',
      address: '', national_id: '', email: '', notes: '',
    });
  };

  const openEdit = (p) => {
    setModal({ mode: 'edit', id: p.id, ...p });
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        first_name: modal.first_name,
        last_name: modal.last_name,
        phone: modal.phone || '',
        email: modal.email || '',
        gender: modal.gender || '',
        date_of_birth: modal.date_of_birth || null,
        blood_group: modal.blood_group || '',
        allergies: modal.allergies || '',
        chronic_conditions: modal.chronic_conditions || '',
        emergency_contact_name: modal.emergency_contact_name || '',
        emergency_contact_phone: modal.emergency_contact_phone || '',
        address: modal.address || '',
        national_id: modal.national_id || '',
        notes: modal.notes || '',
      };
      console.log('[save patient] payload:', payload); 
      if (modal.mode === 'edit') {
        await api.put(`/clinic/patients/${modal.id}/`, payload);
        toast.success('Patient updated');
      } else {
        await api.post('/clinic/patients/', payload);
        toast.success('Patient registered');
      }
      setModal(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(typeof d === 'object' ? JSON.stringify(d) : 'Could not save patient.');
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500 mt-1">
            {patients.length} patient{patients.length !== 1 && 's'} registered
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Register Patient</button>
      </div>

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label>Search</label>
            <input
              placeholder="Name, patient #, phone, or national ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label>Show per page</label>
            <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500 mb-4">Loading…</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Patient #</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Gender</th>
              <th>Age</th>
              <th>Blood Group</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageItems.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-8">
                  {search ? 'No patients match your search.' : 'No patients yet — click "Register Patient".'}
                </td>
              </tr>
            )}
            {pg.pageItems.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.patient_number}</td>
                <td>
                  <Link href={`/patients/${p.id}`} className="font-medium text-blue-700 hover:underline">
                    {p.full_name}
                  </Link>
                </td>
                <td className="text-sm text-slate-600">{p.phone || '—'}</td>
                <td className="capitalize">{p.gender || '—'}</td>
                <td>{p.age ?? '—'}</td>
                <td>{p.blood_group || '—'}</td>
                <td className="text-right whitespace-nowrap">
                  <Link href={`/patients/${p.id}`} className="btn btn-secondary btn-sm mr-1">View</Link>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pg.page}
        totalPages={pg.totalPages}
        goTo={pg.setPage}
        startIndex={pg.startIndex}
        endIndex={pg.endIndex}
        totalItems={patients.length}
        label="patients"
      />

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 my-8">
            <h3 className="text-lg font-bold mb-4">
              {modal.mode === 'edit' ? 'Edit Patient' : 'Register New Patient'}
            </h3>
            <form onSubmit={save}>
              {/* Personal */}
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                Personal Information
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div>
                  <label>First Name *</label>
                  <input
                    value={modal.first_name}
                    onChange={(e) => setModal({ ...modal, first_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Last Name *</label>
                  <input
                    value={modal.last_name}
                    onChange={(e) => setModal({ ...modal, last_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Phone</label>
                  <input
                    value={modal.phone || ''}
                    onChange={(e) => setModal({ ...modal, phone: e.target.value })}
                    placeholder="e.g. 0701234567"
                  />
                </div>
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={modal.email || ''}
                    onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  />
                </div>
                <div>
                  <label>Gender</label>
                  <select
                    value={modal.gender || ''}
                    onChange={(e) => setModal({ ...modal, gender: e.target.value })}
                  >
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label>Date of Birth</label>
                  <DateOfBirthPicker
                    value={modal.date_of_birth || ''}
                    onChange={(v) => setModal({ ...modal, date_of_birth: v })}
                  />
                </div>
                <div>
                  <label>Blood Group</label>
                  <select
                    value={modal.blood_group || ''}
                    onChange={(e) => setModal({ ...modal, blood_group: e.target.value })}
                  >
                    <option value="">—</option>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>National ID</label>
                  <input
                    value={modal.national_id || ''}
                    onChange={(e) => setModal({ ...modal, national_id: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label>Address</label>
                  <input
                    value={modal.address || ''}
                    onChange={(e) => setModal({ ...modal, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Medical */}
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                Medical History
              </p>
              <div className="grid grid-cols-1 gap-3 mb-5">
                <div>
                  <label>Allergies</label>
                  <textarea
                    rows={2}
                    value={modal.allergies || ''}
                    onChange={(e) => setModal({ ...modal, allergies: e.target.value })}
                    placeholder="e.g. Penicillin, peanuts"
                  />
                </div>
                <div>
                  <label>Chronic Conditions</label>
                  <textarea
                    rows={2}
                    value={modal.chronic_conditions || ''}
                    onChange={(e) => setModal({ ...modal, chronic_conditions: e.target.value })}
                    placeholder="e.g. Diabetes, Hypertension"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                Emergency Contact
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div>
                  <label>Name</label>
                  <input
                    value={modal.emergency_contact_name || ''}
                    onChange={(e) => setModal({ ...modal, emergency_contact_name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Phone</label>
                  <input
                    value={modal.emergency_contact_phone || ''}
                    onChange={(e) => setModal({ ...modal, emergency_contact_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {modal.mode === 'edit' ? 'Save Changes' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

/* ============================================================
   Date of Birth — three dropdowns (Day / Month / Year)
   ============================================================ */
function DateOfBirthPicker({ value, onChange }) {
  // Track D/M/Y independently so partial selections persist in the UI
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Sync from external value when it changes (e.g. editing an existing patient)
  useEffect(() => {
    if (!value) {
      setDay(''); setMonth(''); setYear('');
      return;
    }
    const [y, m, d] = value.split('-');
    setYear(y || '');
    setMonth(m || '');
    setDay(d || '');
  }, [value]);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  // Years: from current year back 120
  const years = [];
  for (let y = currentYear; y >= currentYear - 120; y--) years.push(y);

  const daysInMonth = (m, y) => {
    if (!m || !y) return 31;
    return new Date(parseInt(y), parseInt(m), 0).getDate();
  };

  // Whenever d/m/y change, emit the ISO value (only when all 3 set)
  useEffect(() => {
    if (day && month && year) {
      onChange(`${year}-${month}-${day}`);
    } else {
      onChange(''); // partial → emit empty so backend stores null
    }
    // eslint-disable-next-line
  }, [day, month, year]);

  // Auto-correct day if it exceeds days in the selected month
  useEffect(() => {
    if (month && year && day) {
      const max = daysInMonth(month, year);
      if (parseInt(day) > max) {
        setDay(String(max).padStart(2, '0'));
      }
    }
    // eslint-disable-next-line
  }, [month, year]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <select value={day} onChange={(e) => setDay(e.target.value)}>
        <option value="">Day</option>
        {Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1).map((d) => {
          const isFuture =
            parseInt(year) === currentYear &&
            parseInt(month) === currentMonth &&
            d > currentDay;
          return (
            <option key={d} value={String(d).padStart(2, '0')} disabled={isFuture}>
              {d}
            </option>
          );
        })}
      </select>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>
        <option value="">Month</option>
        {MONTHS.map((m, i) => {
          const monthNum = i + 1;
          const isFuture =
            parseInt(year) === currentYear && monthNum > currentMonth;
          return (
            <option key={m} value={String(monthNum).padStart(2, '0')} disabled={isFuture}>
              {m}
            </option>
          );
        })}
      </select>
      <select value={year} onChange={(e) => setYear(e.target.value)}>
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}