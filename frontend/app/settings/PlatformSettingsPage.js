'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { formatMoney } from '@/lib/format';

export default function PlatformSettingsPage() {
  const toast = useToast();

  const [settings, setSettings] = useState(null);
  const [plans, setPlans] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [editPlan, setEditPlan] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, b] = await Promise.all([
        api.get('/tenants/platform-settings/'),
        api.get('/tenants/platform-plans/'),
        api.get('/tenants/business-types/'),
      ]);
      setSettings(s.data);
      setPlans(p.data);
      setBusinessTypes(b.data);
    } catch {
      toast.error('Could not load platform settings.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/tenants/platform-settings/', settings);
      toast.success('Platform settings saved');
    } catch {
      toast.error('Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const savePlan = async () => {
    try {
      await api.patch(`/tenants/platform-plans/${editPlan.id}/`, editPlan);
      toast.success(`Plan "${editPlan.name}" updated`);
      setEditPlan(null);
      load();
    } catch {
      toast.error('Could not save plan.');
    }
  };

  if (loading || !settings) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading platform settings…</p>
      </ProtectedRoute>
    );
  }

  // Compute announcement status text + color
  const announcementState = (() => {
    if (!settings.announcement_active || !settings.announcement) {
      return { label: '🔇 Inactive', cls: 'bg-slate-50 border-slate-200 text-slate-700' };
    }
    const now = new Date();
    if (
      settings.announcement_starts_at &&
      new Date(settings.announcement_starts_at) > now
    ) {
      return {
        label: '⏰ Scheduled (not yet visible)',
        cls: 'bg-amber-50 border-amber-200 text-amber-800',
      };
    }
    if (
      settings.announcement_ends_at &&
      new Date(settings.announcement_ends_at) < now
    ) {
      return {
        label: '⌛ Expired',
        cls: 'bg-red-50 border-red-200 text-red-800',
      };
    }
    return {
      label: '✅ Active — visible to all tenants',
      cls: 'bg-green-50 border-green-200 text-green-800',
    };
  })();

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure the whole platform. These settings apply to every business.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-200">
        <div className="flex gap-1 flex-wrap">
          <TabBtn active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
            ⚙️ General
          </TabBtn>
          <TabBtn active={activeTab === 'plans'} onClick={() => setActiveTab('plans')}>
            💳 Plans & Pricing
          </TabBtn>
          <TabBtn active={activeTab === 'business-types'} onClick={() => setActiveTab('business-types')}>
            🏢 Business Types
          </TabBtn>
          <TabBtn active={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
            📢 Announcements
          </TabBtn>
        </div>
      </div>

      {/* -------- General -------- */}
      {activeTab === 'general' && (
        <form onSubmit={save} className="card">
          <p className="card-title">General Platform Settings</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label>Default Trial Length (days)</label>
              <input
                type="number"
                min="0"
                value={settings.default_trial_days}
                onChange={(e) =>
                  setSettings({ ...settings, default_trial_days: parseInt(e.target.value) })
                }
              />
            </div>
            <div>
              <label>Default Currency</label>
              <input
                value={settings.default_currency}
                onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
              />
            </div>
            <div>
              <label>Default Country</label>
              <input
                value={settings.default_country}
                onChange={(e) => setSettings({ ...settings, default_country: e.target.value })}
              />
            </div>
            <div>
              <label>Support Email</label>
              <input
                type="email"
                value={settings.support_email}
                onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
              />
            </div>
            <div>
              <label>Support Phone</label>
              <input
                value={settings.support_phone}
                onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
              />
            </div>
          </div>

          {/* Global feature switches */}
          <p className="card-title mt-8">Global Feature Switches</p>
          <p className="text-sm text-slate-500 mb-3">
            Turn features on or off for the entire platform.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {['whatsapp', 'sms', 'email_receipts', 'barcode_scanning'].map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={settings.platform_features?.[key] || false}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      platform_features: {
                        ...(settings.platform_features || {}),
                        [key]: e.target.checked,
                      },
                    })
                  }
                  className="w-5 h-5"
                />
                <span className="text-sm font-medium capitalize">
                  {key.replace('_', ' ')}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}

      {/* -------- Plans & Pricing -------- */}
      {activeTab === 'plans' && (
        <div className="card mb-6">
          <p className="card-title">Plans & Pricing</p>
          <p className="text-sm text-slate-500 mb-4">
            What you charge per business. Click a plan to edit pricing.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-lg font-bold">{p.name}</p>
                    <p className="text-xs text-slate-500 uppercase">{p.code}</p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditPlan({ ...p })}
                  >
                    Edit
                  </button>
                </div>
                <p className="text-2xl font-bold text-blue-700 mt-3">
                  {formatMoney(p.monthly_price, p.currency)}
                  <span className="text-sm text-slate-500 font-normal"> / mo</span>
                </p>
                <p className="text-sm text-slate-500">
                  or {formatMoney(p.yearly_price, p.currency)} / year
                </p>
                <ul className="mt-3 text-xs text-slate-600 space-y-1">
                  <li>👥 {p.max_users} users</li>
                  <li>🏢 {p.max_branches} branch{p.max_branches !== 1 && 'es'}</li>
                  <li>
                    ✨ {(p.features || []).length || 'all'} feature
                    {(p.features || []).length !== 1 && 's'}
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -------- Business Types -------- */}
      {activeTab === 'business-types' && (
        <div className="card">
          <p className="card-title">Business Types</p>
          <p className="text-sm text-slate-500 mb-4">
            Templates used when creating a new business. Each type enables a different set of features.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Icon</th>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Features</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {businessTypes.map((bt) => (
                  <tr key={bt.slug}>
                    <td className="text-2xl">{bt.icon}</td>
                    <td className="font-medium">{bt.name}</td>
                    <td>
                      <code className="text-xs bg-slate-100 px-1 rounded">{bt.slug}</code>
                    </td>
                    <td className="text-xs text-slate-600 max-w-md">
                      {(bt.features || []).join(', ') || '—'}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/tenants/businesstype/${bt.id}/change/`}
                        target="_blank"
                        className="btn btn-secondary btn-sm"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Business types are edited in the Django admin. The link opens a new tab.
          </p>
        </div>
      )}

      {/* -------- Announcements -------- */}
      {activeTab === 'announcements' && (
        <form onSubmit={save} className="card">
          <p className="card-title">Platform Announcement</p>
          <p className="text-sm text-slate-500 mb-4">
            Shows as a banner on every tenant's dashboard. You can schedule it to start
            later or expire on a specific date.
          </p>

          {/* Current status */}
          <div className={`mb-4 p-3 rounded-lg border flex items-center justify-between flex-wrap gap-2 ${announcementState.cls}`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                Current Status
              </p>
              <p className="text-sm font-medium mt-0.5">{announcementState.label}</p>
            </div>
            {settings.announcement_ends_at && (
              <div className="text-right">
                <p className="text-xs opacity-70">Ends on</p>
                <p className="text-sm font-medium">
                  {new Date(settings.announcement_ends_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={settings.announcement_active}
              onChange={(e) =>
                setSettings({ ...settings, announcement_active: e.target.checked })
              }
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">Show this announcement</span>
          </label>

          {/* Message */}
          <div className="mb-4">
            <label>Message</label>
            <textarea
              rows={3}
              value={settings.announcement}
              onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
              placeholder="e.g. Scheduled maintenance Sunday 3am–5am"
            />
          </div>

          {/* Schedule */}
          <p className="card-title mt-6">Schedule (optional)</p>
          <p className="text-sm text-slate-500 mb-3">
            Leave blank to show indefinitely. Set dates to schedule or auto-expire.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label>Starts At</label>
              <input
                type="datetime-local"
                value={
                  settings.announcement_starts_at
                    ? toLocalInput(settings.announcement_starts_at)
                    : ''
                }
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    announcement_starts_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setSettings({ ...settings, announcement_starts_at: new Date().toISOString() })
                  }
                >
                  Now
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSettings({ ...settings, announcement_starts_at: null })}
                >
                  Clear
                </button>
              </div>
            </div>

            <div>
              <label>Ends At</label>
              <input
                type="datetime-local"
                value={
                  settings.announcement_ends_at
                    ? toLocalInput(settings.announcement_ends_at)
                    : ''
                }
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    announcement_ends_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    setSettings({ ...settings, announcement_ends_at: d.toISOString() });
                  }}
                >
                  +1 day
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    setSettings({ ...settings, announcement_ends_at: d.toISOString() });
                  }}
                >
                  +1 week
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    setSettings({ ...settings, announcement_ends_at: d.toISOString() });
                  }}
                >
                  +30 days
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSettings({ ...settings, announcement_ends_at: null })}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Announcement'}
            </button>
          </div>
        </form>
      )}

      {/* -------- Plan edit modal -------- */}
      {editPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Edit Plan — {editPlan.name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label>Name</label>
                <input
                  value={editPlan.name}
                  onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })}
                />
              </div>
              <div>
                <label>Currency</label>
                <input
                  value={editPlan.currency}
                  onChange={(e) => setEditPlan({ ...editPlan, currency: e.target.value })}
                />
              </div>
              <div>
                <label>Monthly Price</label>
                <input
                  type="number"
                  value={editPlan.monthly_price}
                  onChange={(e) =>
                    setEditPlan({ ...editPlan, monthly_price: parseFloat(e.target.value) })
                  }
                />
              </div>
              <div>
                <label>Yearly Price</label>
                <input
                  type="number"
                  value={editPlan.yearly_price}
                  onChange={(e) =>
                    setEditPlan({ ...editPlan, yearly_price: parseFloat(e.target.value) })
                  }
                />
              </div>
              <div>
                <label>Max Users</label>
                <input
                  type="number"
                  value={editPlan.max_users}
                  onChange={(e) =>
                    setEditPlan({ ...editPlan, max_users: parseInt(e.target.value) })
                  }
                />
              </div>
              <div>
                <label>Max Branches</label>
                <input
                  type="number"
                  value={editPlan.max_branches}
                  onChange={(e) =>
                    setEditPlan({ ...editPlan, max_branches: parseInt(e.target.value) })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={editPlan.is_active}
                    onChange={(e) => setEditPlan({ ...editPlan, is_active: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span>Active (visible to new signups)</span>
                </label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setEditPlan(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={savePlan}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Convert an ISO UTC date string to the value format expected by
 * `<input type="datetime-local">` — i.e. "YYYY-MM-DDTHH:mm" in local time.
 */
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}