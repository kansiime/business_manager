'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

export default function BusinessSettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    tin: '',
    currency_code: 'UGX',
    currency_symbol: 'UGX',
    receipt_footer: '',
    whatsapp_template_debt: '',
    whatsapp_template_promise_today: '',
    whatsapp_template_receipt: '',
    // UI-only fields (not sent to backend)
    _plan: null,
    _support_email: '',
    _support_phone: '',
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/settings/'),
      api.get('/tenants/context/'),
    ])
      .then(([settingsRes, contextRes]) => {
        const r = settingsRes.data;
        const ctx = contextRes.data;
        setForm({
          name: r.name || '',
          address: r.address || '',
          phone: r.phone || '',
          email: r.email || '',
          tin: r.tin || '',
          currency_code: r.currency_code || 'UGX',
          currency_symbol: r.currency_symbol || 'UGX',
          receipt_footer: r.receipt_footer || '',
          whatsapp_template_debt: r.whatsapp_template_debt || '',
          whatsapp_template_promise_today: r.whatsapp_template_promise_today || '',
          whatsapp_template_receipt: r.whatsapp_template_receipt || '',
          _plan: r.plan_info || null,
          _support_email: ctx?.announcement?.support_email || '',
          _support_phone: ctx?.announcement?.support_phone || '',
        });
        setLoaded(true);
      })
      .catch(() => {
        setError('Could not load settings.');
        setLoaded(true);
      });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    setError('');
    setSaving(true);
    try {
      // Strip UI-only fields before sending
      const { _plan, _support_email, _support_phone, ...payload } = form;
      await api.put('/auth/settings/', payload);
      setSaved(true);
      toast.success('Settings saved');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      const status = err.response?.status;
      const msg = status === 403
        ? 'Only admin or manager can edit settings.'
        : 'Could not save. Please try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, opts = {}) => (
    <div className={opts.full ? 'md:col-span-2' : ''}>
      <label>{label}</label>
      {opts.textarea ? (
        <textarea
          rows={opts.rows || 3}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      )}
    </div>
  );

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Business Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Business details shown on receipts, reports, and WhatsApp messages
        </p>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          ✓ Settings saved — reloading…
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {!loaded ? (
        <div className="card">
          <p className="text-slate-500 text-sm">Loading settings…</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          {/* Your Plan */}
          {form._plan && (
            <div className="card">
              <p className="card-title">Your Plan</p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</p>
                  <p className="text-sm text-slate-900 mt-1 capitalize">{form._plan.plan}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {form._plan.is_trial ? 'Trial Started' : 'Billing Started'}
                  </p>
                  <p className="text-sm text-slate-900 mt-1">
                    {form._plan.is_trial
                      ? fmtDate(form._plan.trial_started_at)
                      : fmtDate(form._plan.subscription_started_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {form._plan.is_trial ? 'Trial Ends' : 'Renews On'}
                  </p>
                  <p className="text-sm text-slate-900 mt-1">
                    {form._plan.is_trial
                      ? fmtDate(form._plan.trial_ends_at)
                      : fmtDate(form._plan.subscription_ends_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</p>
                  <p className="text-sm text-slate-900 mt-1 capitalize">{form._plan.status}</p>
                </div>
              </div>

              {/* Days remaining / expired banner */}
              {(() => {
                const days = form._plan.is_trial
                  ? form._plan.trial_days_remaining
                  : form._plan.subscription_days_remaining;

                if (days === null || days === undefined) return null;

                if (days < 0) {
                  return (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm font-semibold text-red-800">
                        ⏰ Your plan expired {Math.abs(days)} day{Math.abs(days) !== 1 && 's'} ago.
                        Contact support to renew.
                      </p>
                    </div>
                  );
                }
                if (days <= 7) {
                  return (
                    <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-sm font-semibold text-amber-800">
                        ⚠️ Only {days} day{days !== 1 && 's'} left on your {form._plan.is_trial ? 'trial' : 'plan'}.
                        Renew soon to avoid losing access.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-sm font-semibold text-green-800">
                      ✅ {days} day{days !== 1 && 's'} remaining on your {form._plan.is_trial ? 'trial' : 'plan'}.
                    </p>
                  </div>
                );
              })()}

              <p className="text-xs text-slate-400 mt-3">
                To change your plan or renew, contact support
                {form._support_email && ` at ${form._support_email}`}
                {form._support_phone && ` or ${form._support_phone}`}.
              </p>
            </div>
          )}

          {/* Business Details */}
          <div className="card">
            <p className="card-title">Business Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('name', 'Business Name', { full: true })}
              {field('address', 'Address', { textarea: true, full: true })}
              {field('phone', 'Phone')}
              {field('email', 'Email', { type: 'email' })}
              {field('tin', 'TIN')}
              {field('currency_code', 'Currency Code (e.g. UGX, KES, USD)')}
              {field('currency_symbol', 'Currency Symbol (shown on reports)')}
              {field('receipt_footer', 'Receipt Footer', { textarea: true, full: true })}
            </div>
          </div>

          {/* WhatsApp Templates */}
          <div className="card">
            <p className="card-title">WhatsApp Message Templates</p>
            <p className="text-sm text-slate-500 mb-4">
              Customize the messages sent via WhatsApp. Use placeholders in curly braces.
            </p>
            <div className="grid grid-cols-1 gap-4">
              {field('whatsapp_template_debt', 'Debt Reminder', { textarea: true, rows: 4, full: true })}
              {field('whatsapp_template_promise_today', 'Promise Due Today', { textarea: true, rows: 4, full: true })}
              {field('whatsapp_template_receipt', 'Sale Receipt', { textarea: true, rows: 6, full: true })}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary flex items-center gap-2" disabled={saving}>
              {saving ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      )}
    </ProtectedRoute>
  );
}