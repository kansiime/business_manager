'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import TenantPayments from '@/components/TenantPayments';
import api from '@/lib/api';
import { useUser } from '@/lib/useUser';
import { useToast } from '@/components/Toast';
import { formatMoney } from '@/lib/format';

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = useUser();
  const toast = useToast();
  const id = params?.id;

  const [tenant, setTenant] = useState(null);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({
    name: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    plan: 'trial',
    status: 'trial',
    max_users: 2,
    max_branches: 1,
    business_type: '',
  });

  // New subscription extension state
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [duration, setDuration] = useState(1);

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSuper = user?.role === 'super';

  const load = async () => {
    setLoading(true);
    try {
      const [t, b, p] = await Promise.all([
        api.get(`/tenants/${id}/`),
        api.get('/tenants/business-types/'),
        api.get('/tenants/plans/'),
      ]);
      setTenant(t.data);
      setBusinessTypes(b.data);
      setPlans(p.data);
      setForm({
        name: t.data.name,
        owner_name: t.data.owner_name || '',
        owner_email: t.data.owner_email || '',
        owner_phone: t.data.owner_phone || '',
        plan: t.data.plan,
        status: t.data.status,
        max_users: t.data.max_users,
        max_branches: t.data.max_branches,
        business_type: t.data.business_type || '',
      });
    } catch {
      setError('Could not load this business.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuper && id) load();
    // eslint-disable-next-line
  }, [isSuper, id]);

  // When the plan dropdown changes, auto-fill limits + suggested price
  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === form.plan),
    [plans, form.plan]
  );

  useEffect(() => {
    if (!selectedPlan) return;
    // Auto-fill limits only when the plan actually changed
    if (
      form.max_users !== selectedPlan.max_users ||
      form.max_branches !== selectedPlan.max_branches
    ) {
      setForm((f) => ({
        ...f,
        max_users: selectedPlan.max_users,
        max_branches: selectedPlan.max_branches,
      }));
    }
    // eslint-disable-next-line
  }, [selectedPlan]);

  if (!isSuper) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
          <p className="text-sm text-slate-500 mt-1">
            Only platform administrators can view this page.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading business…</p>
      </ProtectedRoute>
    );
  }

  if (error || !tenant) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">{error || 'Not found.'}</p>
          <button className="btn btn-secondary mt-4" onClick={() => router.push('/tenants')}>
            ← Back to Businesses
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  // Total days from cycle × duration
  const totalDays = billingCycle === 'yearly' ? duration * 365 : duration * 30;

  // Estimated cost
  const estimatedCost = selectedPlan
    ? billingCycle === 'yearly'
      ? selectedPlan.yearly_price * duration
      : selectedPlan.monthly_price * duration
    : 0;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Save the base fields (name, owner, limits, business_type, plan)
      await api.patch(`/tenants/${id}/`, {
        name: form.name,
        owner_name: form.owner_name,
        owner_email: form.owner_email,
        owner_phone: form.owner_phone,
        plan: form.plan,
        status: form.status,
        max_users: parseInt(form.max_users),
        max_branches: parseInt(form.max_branches),
        business_type: form.business_type || null,
      });

      // 2. If duration is > 0 and this isn't a trial, extend the subscription
      if (form.plan !== 'trial' && duration > 0) {
        await api.post(`/tenants/${id}/extend/`, { days: totalDays });
      }

      toast.success('Business updated');
      setEditing(false);
      load();
    } catch (err) {
      const d = err.response?.data;
      toast.error(typeof d === 'object' ? JSON.stringify(d) : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const next = tenant.status === 'suspended' ? 'active' : 'suspended';
    if (!confirm(`Set this business to "${next}"?`)) return;
    try {
      await api.patch(`/tenants/${id}/`, { status: next });
      toast.success(`Business ${next === 'suspended' ? 'suspended' : 'activated'}`);
      load();
    } catch {
      toast.error('Could not update status.');
    }
  };

  const extend = async () => {
    const days = prompt('Extend by how many days?', '30');
    if (!days) return;
    const n = parseInt(days);
    if (isNaN(n) || n <= 0) {
      toast.error('Enter a valid number of days.');
      return;
    }
    try {
      const r = await api.post(`/tenants/${id}/extend/`, { days: n });
      setTenant(r.data);
      toast.success(`Extended by ${n} days`);
      load();
    } catch {
      toast.error('Could not extend.');
    }
  };

  const destroy = async () => {
    if (!confirm(
      `Delete "${tenant.name}" permanently?\n\nThis removes ALL their products, sales, debts and user accounts. This cannot be undone.`
    )) return;
    try {
      await api.delete(`/tenants/${id}/`);
      toast.success('Business deleted');
      router.push('/tenants');
    } catch {
      toast.error('Could not delete.');
    }
  };

  const statusBadge = (s) => {
    if (s === 'active') return 'badge badge-green';
    if (s === 'trial') return 'badge badge-amber';
    if (s === 'blocked') return 'badge badge-red';
    if (s === 'suspended') return 'badge badge-red';
    return 'badge badge-gray';
  };

  const planBadge = (p) => {
    const cls = {
      power: 'badge badge-blue',
      growth: 'badge badge-blue',
      starter: 'badge badge-green',
      trial: 'badge badge-amber',
    }[p] || 'badge badge-gray';
    return <span className={cls}>{p}</span>;
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

  const now = new Date();
  const computeDays = (dateStr) => {
    if (!dateStr) return null;
    const end = new Date(dateStr);
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  };

  const trialDays = computeDays(tenant.trial_ends_at);
  const subDays = computeDays(tenant.subscription_ends_at);
  const activeDays = tenant.plan === 'trial' ? trialDays : subDays;
  const isExpired = activeDays !== null && activeDays < 0;

  return (
    <ProtectedRoute>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => router.push('/tenants')}
            className="text-sm text-slate-500 hover:text-slate-800 mb-1"
          >
            ← Back to Businesses
          </button>
          <h1 className="text-2xl font-bold text-slate-900">
            {tenant.business_type_icon} {tenant.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {tenant.business_type_name} •{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">{tenant.slug}</code>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!editing && (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>
              ✏️ Edit
            </button>
          )}
          <button className="btn btn-secondary" onClick={extend}>
            📅 Extend
          </button>
          <button
            className={tenant.status === 'suspended' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={toggleStatus}
          >
            {tenant.status === 'suspended' ? '▶ Activate' : '⏸ Suspend'}
          </button>
          <button className="btn btn-danger" onClick={destroy}>
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Status</p>
          <p className="text-lg font-bold mt-1">
            <span className={statusBadge(tenant.status)}>{tenant.status}</span>
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Plan</p>
          <p className="text-lg font-bold mt-1">{planBadge(tenant.plan)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Users</p>
          <p className="stat-value">
            {tenant.user_count ?? 0}
            <span className="text-sm text-slate-400 font-normal"> / {tenant.max_users}</span>
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Products</p>
          <p className="stat-value">{tenant.product_count ?? 0}</p>
        </div>
      </div>

      {/* Subscription info */}
      <div className="card mb-6">
        <p className="card-title">Subscription</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</p>
            <p className="text-sm text-slate-900 mt-1 capitalize">{tenant.plan}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Trial Ends</p>
            <p className="text-sm text-slate-900 mt-1">{fmtDate(tenant.trial_ends_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subscription Ends</p>
            <p className="text-sm text-slate-900 mt-1">{fmtDate(tenant.subscription_ends_at)}</p>
          </div>
        </div>

        {activeDays !== null && (
          <div className={`mt-4 p-3 rounded-lg ${
            isExpired
              ? 'bg-red-50 border border-red-200'
              : activeDays <= 7
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-green-50 border border-green-200'
          }`}>
            {isExpired ? (
              <p className="text-sm font-semibold text-red-800">
                ⏰ This plan expired {Math.abs(activeDays)} day{Math.abs(activeDays) !== 1 && 's'} ago.
                Use <b>Extend</b> or <b>Edit</b> to reactivate.
              </p>
            ) : activeDays <= 7 ? (
              <p className="text-sm font-semibold text-amber-800">
                ⚠️ Expires in {activeDays} day{activeDays !== 1 && 's'} ({fmtDate(
                  tenant.plan === 'trial' ? tenant.trial_ends_at : tenant.subscription_ends_at
                )}).
              </p>
            ) : (
              <p className="text-sm font-semibold text-green-800">
                ✅ {activeDays} day{activeDays !== 1 && 's'} remaining.
              </p>
            )}
          </div>
        )}
      </div>

      <TenantPayments tenantId={id} plans={plans} onRecorded={load} />

      {/* Edit form */}
      <div className="card mb-6">
        <p className="card-title">{editing ? 'Edit Business' : 'Business Information'}</p>

        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business Name" value={tenant.name} />
            <Field label="Business Type" value={tenant.business_type_name} />
            <Field label="Plan" value={tenant.plan} />
            <Field label="Status" value={tenant.status} />
            <Field label="Owner Name" value={tenant.owner_name || '—'} />
            <Field label="Owner Email" value={tenant.owner_email || '—'} />
            <Field label="Owner Phone" value={tenant.owner_phone || '—'} />
            <Field label="Created" value={new Date(tenant.created_at).toLocaleString()} />
            <Field label="Max Users" value={tenant.max_users} />
            <Field label="Max Branches" value={tenant.max_branches} />
          </div>
        ) : (
          <form onSubmit={save}>
            <p className="card-title">Basic Info</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label>Business Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label>Business Type</label>
                <select value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })}>
                  <option value="">— None —</option>
                  {businessTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>{bt.icon} {bt.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Owner Name</label>
                <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
              </div>
              <div>
                <label>Owner Email</label>
                <input type="email" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
              </div>
              <div>
                <label>Owner Phone</label>
                <input value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
              </div>
              <div>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                  <option value="blocked">Blocked</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Plan & Billing */}
            <p className="card-title">Plan & Billing</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label>Plan</label>
                <select
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                >
                  <option value="trial">Trial</option>
                  {plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} — {formatMoney(p.monthly_price, p.currency)}/mo
                    </option>
                  ))}
                </select>
              </div>

              {form.plan !== 'trial' && (
                <>
                  <div>
                    <label>Billing Cycle</label>
                    <select
                      value={billingCycle}
                      onChange={(e) => setBillingCycle(e.target.value)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label>Duration ({billingCycle === 'yearly' ? 'years' : 'months'})</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label>Effective Days</label>
                    <input value={`${totalDays} days`} disabled />
                  </div>
                </>
              )}
            </div>

            {/* Live summary */}
            {selectedPlan && form.plan !== 'trial' && (
              <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">
                  Subscription Summary
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-blue-700 uppercase">Plan</p>
                    <p className="font-medium text-blue-900">{selectedPlan.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 uppercase">Users</p>
                    <p className="font-medium text-blue-900">{selectedPlan.max_users}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 uppercase">Branches</p>
                    <p className="font-medium text-blue-900">{selectedPlan.max_branches}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700 uppercase">Total Cost</p>
                    <p className="font-medium text-blue-900">
                      {formatMoney(estimatedCost, selectedPlan.currency)}
                    </p>
                  </div>
                </div>
                {tenant.subscription_ends_at && new Date(tenant.subscription_ends_at) > new Date() && (
                  <p className="text-xs text-blue-700 mt-2">
                    ℹ️ Current subscription ends {fmtDate(tenant.subscription_ends_at)}.
                    New days will be <b>added on top</b> — the customer keeps unused days.
                  </p>
                )}
              </div>
            )}

            {/* Auto-filled limits (editable) */}
            <p className="card-title">Limits</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label>Max Users</label>
                <input
                  type="number"
                  value={form.max_users}
                  onChange={(e) => setForm({ ...form, max_users: e.target.value })}
                />
              </div>
              <div>
                <label>Max Branches</label>
                <input
                  type="number"
                  value={form.max_branches}
                  onChange={(e) => setForm({ ...form, max_branches: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Enabled features */}
      <div className="card mb-6">
        <p className="card-title">Enabled Features</p>
        <div className="flex flex-wrap gap-2">
          {(tenant.enabled_features || []).map((f) => (
            <span key={f} className="badge badge-blue capitalize">
              {f.replace('_', ' ')}
            </span>
          ))}
          {(tenant.enabled_features || []).length === 0 && (
            <p className="text-sm text-slate-400">No features enabled.</p>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Features come from the business type. Adjust the business type above to change them.
        </p>
      </div>

      {/* Quick links */}
      <div className="card">
        <p className="card-title">Quick Actions</p>
        <div className="flex gap-2 flex-wrap">
          <Link href="/tenants" className="btn btn-secondary">← All Businesses</Link>
          <Link href={`/login?tenant=${tenant.slug}`} target="_blank" className="btn btn-secondary">
            🔎 View login page
          </Link>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-900 mt-1">{value}</p>
    </div>
  );
}