'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api, { auth } from '@/lib/api';
import { saveSession, apiErrorMessage } from '@/lib/session';
import { useToast } from '@/components/Toast';

function accessLabel(b) {
  if (b.is_locked) return { text: 'Suspended', cls: 'badge-red' };
  if (b.is_expired) return { text: b.plan === 'trial' ? 'Trial ended' : 'Plan expired', cls: 'badge-red' };
  if (b.plan === 'trial') return { text: 'Free trial', cls: 'badge-blue' };
  return { text: b.plan.charAt(0).toUpperCase() + b.plan.slice(1), cls: 'badge-green' };
}

function endsText(b) {
  if (!b.access_ends_at) return '';
  const d = new Date(b.access_ends_at).toLocaleDateString();
  return b.is_expired ? `Ended ${d}` : `Until ${d}`;
}

export default function BusinessesPage() {
  const toast = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);

  const [types, setTypes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ business_name: '', business_type_slug: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    auth.businesses()
      .then((r) => setBusinesses(r.data))
      .catch((e) => toast.error(apiErrorMessage(e, 'Could not load your businesses.')))
      .finally(() => setLoading(false));
    api.get('/tenants/business-types/').then((r) => setTypes(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full reload so every provider picks up the new business
  const enter = (data) => {
    saveSession(data);
    window.location.href = '/dashboard';
  };

  const select = async (b) => {
    setSwitching(b.id);
    try {
      const res = await auth.switchBusiness(b.id);
      enter(res.data);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not open that business.'));
      setSwitching(null);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.business_type_slug) return toast.error('Choose a business type.');
    setCreating(true);
    try {
      const res = await auth.createBusiness(form);
      toast.success('Business created — your free trial has started.');
      enter(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not create the business.'));
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My businesses</h1>
          <p className="text-sm text-slate-500 mt-1">
            Choose a business to work in, or start a new one.
          </p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New business
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="card mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">New business</h2>
            <button type="button" className="text-sm text-slate-500" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
          <div>
            <label htmlFor="nb-name">Business name</label>
            <input
              id="nb-name"
              value={form.business_name}
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="nb-type">Type of business</label>
            <select
              id="nb-type"
              value={form.business_type_slug}
              onChange={(e) => setForm((f) => ({ ...f, business_type_slug: e.target.value }))}
              required
            >
              <option value="">Select…</option>
              {types.map((t) => (
                <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Each new business starts with its own free trial and its own data.
          </p>
          <button type="submit" disabled={creating} className="btn btn-primary">
            {creating ? 'Creating…' : 'Create and open'}
          </button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        {businesses.map((b) => {
          const badge = accessLabel(b);
          return (
            <div key={b.id} className={`card flex flex-col gap-3 ${b.is_current ? 'ring-2 ring-blue-600' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-xl flex-shrink-0">
                  {b.business_type_icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{b.name}</p>
                  <p className="text-xs text-slate-500">
                    {b.business_type_name} · <span className="capitalize">{b.role}</span>
                    {b.is_owner && ' · Owner'}
                  </p>
                </div>
                <span className={`badge ${badge.cls}`}>{badge.text}</span>
              </div>
              <p className="text-xs text-slate-500">{endsText(b)}</p>
              <button
                className={`btn ${b.is_current ? 'btn-secondary' : 'btn-primary'} btn-sm self-start`}
                disabled={b.is_locked || switching === b.id}
                onClick={() => select(b)}
              >
                {switching === b.id ? 'Opening…' : b.is_current ? 'Continue' : 'Open'}
              </button>
            </div>
          );
        })}
      </div>
    </ProtectedRoute>
  );
}
