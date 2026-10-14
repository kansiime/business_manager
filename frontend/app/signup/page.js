'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { auth, billing } from '@/lib/api';
import { saveSession, apiErrorMessage } from '@/lib/session';

export default function SignupPage() {
  const router = useRouter();
  const [types, setTypes] = useState([]);
  const [trialDays, setTrialDays] = useState(14);
  const [form, setForm] = useState({
    business_name: '',
    business_type_slug: '',
    full_name: '',
    email: '',
    phone: '',
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/tenants/business-types/').then((r) => setTypes(r.data)).catch(() => {});
    billing.plans().then((r) => setTrialDays(r.data.trial_days)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.business_type_slug) return setError('Choose what kind of business you run.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');

    setSaving(true);
    try {
      const res = await auth.signup(form);
      saveSession(res.data);
      router.push('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create your account.'));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Start your free trial</h1>
          <p className="text-slate-500 mt-2">
            {trialDays} days free with every feature for your business type.
            No payment details needed.
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <section>
            <h2 className="font-semibold text-slate-900 mb-3">Your business</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="business_name">Business name</label>
                <input
                  id="business_name"
                  value={form.business_name}
                  onChange={set('business_name')}
                  placeholder="e.g. Mukasa Agro Supplies"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label>Type of business</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {types.map((t) => {
                    const selected = form.business_type_slug === t.slug;
                    return (
                      <button
                        type="button"
                        key={t.slug}
                        onClick={() => setForm((f) => ({ ...f, business_type_slug: t.slug }))}
                        aria-pressed={selected}
                        className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span className="text-xl block mb-1">{t.icon}</span>
                        <span className="font-medium text-slate-900">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
                {types.length === 0 && (
                  <p className="text-sm text-slate-400 mt-1">Loading business types…</p>
                )}
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-3">About you</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="full_name">Full name</label>
                <input id="full_name" value={form.full_name} onChange={set('full_name')} required />
              </div>
              <div>
                <label htmlFor="phone">Phone</label>
                <input id="phone" value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} onChange={set('email')} required />
              </div>
              <div>
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={form.username}
                  onChange={set('username')}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                />
              </div>
            </div>
          </section>

          <button type="submit" disabled={saving} className="btn btn-primary btn-block">
            {saving ? 'Creating your business…' : `Start ${trialDays}-day free trial`}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
