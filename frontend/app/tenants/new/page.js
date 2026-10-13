'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';
import { useToast } from '@/components/Toast';

export default function NewTenantPage() {
  const router = useRouter();
  const user = useUser();
  const toast = useToast();

  const [businessTypes, setBusinessTypes] = useState([]);
  const [form, setForm] = useState({
    business_name: '',
    business_type_slug: '',
    plan: 'trial',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    username: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSuper = user?.role === 'super';

  useEffect(() => {
    if (!isSuper) return;
    api.get('/tenants/business-types/').then((r) => setBusinessTypes(r.data)).catch(() => {});
  }, [isSuper]);

  if (!isSuper) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
          <p className="text-sm text-slate-500 mt-1">Only platform administrators can create businesses.</p>
        </div>
      </ProtectedRoute>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!form.business_name.trim()) return setError('Business name is required.');
    if (!form.business_type_slug) return setError('Choose a business type.');
    if (!form.username.trim()) return setError('Admin username is required.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');

    setSaving(true);
    try {
      const res = await api.post('/tenants/create-tenant/', form);
      toast.success(`Business "${res.data.name}" created`);
      router.push(`/tenants/${res.data.id}`);
    } catch (err) {
      const d = err.response?.data;
      const msg =
        typeof d === 'object' && d !== null
          ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' • ')
          : 'Could not create business.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const selectedType = businessTypes.find((b) => b.slug === form.business_type_slug);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <button
          onClick={() => router.push('/tenants')}
          className="text-sm text-slate-500 hover:text-slate-800 mb-1"
        >
          ← Back to Businesses
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Add Business</h1>
        <p className="text-sm text-slate-500 mt-1">
          Creates the business, its admin user, and default settings — all in one step.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card">
        {/* Business */}
        <p className="card-title">Business</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <label>Business Name</label>
            <input
              placeholder="e.g. Mama Jane Grocery"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label>Business Type</label>
            <select
              value={form.business_type_slug}
              onChange={(e) => setForm({ ...form, business_type_slug: e.target.value })}
              required
            >
              <option value="">— Choose a business type —</option>
              {businessTypes.map((bt) => (
                <option key={bt.slug} value={bt.slug}>
                  {bt.icon} {bt.name}
                </option>
              ))}
            </select>
            {selectedType && (
              <p className="text-xs text-slate-500 mt-2">
                This business type will enable:&nbsp;
                {(selectedType.features || []).map((f) => f.replace('_', ' ')).join(', ')}
              </p>
            )}
          </div>

          <div>
            <label>Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            >
              <option value="trial">Free Trial (14 days)</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="power">Power</option>
            </select>
          </div>
        </div>

        {/* Owner */}
        <p className="card-title">Owner / Contact</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label>Owner Name</label>
            <input
              placeholder="e.g. Jane Nakato"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            />
          </div>
          <div>
            <label>Owner Phone</label>
            <input
              placeholder="e.g. 0701234567"
              value={form.owner_phone}
              onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label>Owner Email</label>
            <input
              type="email"
              placeholder="optional@example.com"
              value={form.owner_email}
              onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
            />
          </div>
        </div>

        {/* Admin user */}
        <p className="card-title">Admin Login</p>
        <p className="text-xs text-slate-500 mb-4">
          These credentials belong to the business owner. Share them after you create the business.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label>Admin Username</label>
            <input
              placeholder="e.g. mama-jane"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label>Admin Password</label>
            <input
              type="text"
              placeholder="at least 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/tenants')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : '+ Create Business'}
          </button>
        </div>
      </form>
    </ProtectedRoute>
  );
}