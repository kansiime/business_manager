'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { auth, billing } from '@/lib/api';
import { saveSession, apiErrorMessage } from '@/lib/session';
import AuthPanel, { AuthMobileBrand } from '@/components/AuthPanel';

// How each feature key reads to a business owner.
const FEATURES = {
  inventory: ['📦', 'Inventory'],
  sales: ['💰', 'Point of sale'],
  purchases: ['🚚', 'Purchases'],
  debts: ['🧾', 'Debts & credit'],
  expenses: ['💸', 'Expenses'],
  returns: ['↩️', 'Returns'],
  reports: ['📈', 'Reports'],
  reconciliation: ['⚖️', 'Stock counts'],
  customers: ['👥', 'Customers'],
  repairs: ['🔧', 'Job cards'],
  vehicles: ['🚗', 'Vehicles'],
  prescriptions: ['💊', 'Prescriptions'],
  appointments: ['📅', 'Appointments'],
  menu: ['🍽️', 'Menu'],
  tables: ['🪑', 'Tables'],
  expiry: ['⏰', 'Expiry alerts'],
  barcode: ['🏷️', 'Barcode scanning'],
  variants: ['👕', 'Sizes & colours'],
  batch_tracking: ['🧪', 'Batch tracking'],
};

// Fields the API can reject, and the step they live on.
const STEP_OF_FIELD = { business_name: 1, business_type_slug: 1 };

function suggestUsername(fullName) {
  return fullName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.');
}

function passwordStrength(pw) {
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) return { score: 1, label: 'Too short' };
  if (score <= 2) return { score: 2, label: 'Weak' };
  if (score === 3) return { score: 3, label: 'Good' };
  return { score: 4, label: 'Strong' };
}

export default function SignupPage() {
  const router = useRouter();
  const [types, setTypes] = useState([]);
  const [trialDays, setTrialDays] = useState(14);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: '',
    business_type_slug: '',
    full_name: '',
    email: '',
    phone: '',
    username: '',
    password: '',
  });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/tenants/business-types/').then((r) => setTypes(r.data)).catch(() => {});
    billing.plans().then((r) => r.data?.trial_days && setTrialDays(r.data.trial_days)).catch(() => {});
  }, []);

  const type = useMemo(
    () => types.find((t) => t.slug === form.business_type_slug),
    [types, form.business_type_slug],
  );
  const strength = passwordStrength(form.password);
  const firstName = form.full_name.trim().split(/\s+/)[0];

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: value };
      if (k === 'full_name' && !usernameTouched) next.username = suggestUsername(value);
      return next;
    });
  };

  const next = (e) => {
    e.preventDefault();
    setError('');
    if (!form.business_name.trim()) return setError('Give your business a name.');
    if (!form.business_type_slug) return setError('Choose what kind of business you run.');
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');

    setSaving(true);
    try {
      const res = await auth.signup(form);
      saveSession(res.data);
      router.push('/dashboard');
    } catch (err) {
      const data = err?.response?.data || {};
      const badField = Object.keys(data).find((k) => STEP_OF_FIELD[k]);
      if (badField) setStep(STEP_OF_FIELD[badField]);
      setError(apiErrorMessage(err, 'Could not create your account.'));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* ------------------------------------------------------------ */}
      {/* Live preview                                                  */}
      {/* ------------------------------------------------------------ */}
      <AuthPanel
        eyebrow="Your business, live"
        title={<>Watch it take shape<br />as you type.</>}
        perks={[['🎁', `${trialDays} days free`], ['💳', 'No card needed'], ['📱', 'Pay with MoMo']]}
      >
        {/* Mock dashboard */}
        <div className="rounded-2xl bg-white text-slate-900 shadow-2xl shadow-blue-950/50 overflow-hidden ring-1 ring-white/20 transition-all duration-500">
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-[11px] text-slate-400 truncate">
              business-manager · dashboard
            </span>
          </div>

          <div className="flex min-h-[250px]">
            <div className="w-40 shrink-0 border-r border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center gap-2 mb-4">
                <span
                  key={type?.slug || 'none'}
                  className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-base animate-[pop_.35s_ease-out]"
                >
                  {type?.icon || '🏪'}
                </span>
                <span className="text-xs font-bold leading-tight line-clamp-2">
                  {form.business_name.trim() || 'Your business'}
                </span>
              </div>
              <ul className="space-y-1">
                {(type?.features || ['inventory', 'sales', 'reports']).slice(0, 7).map((f, i) => (
                  <li
                    key={f}
                    className={`flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-md ${
                      i === 0 ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600'
                    } ${type ? '' : 'opacity-40'}`}
                  >
                    <span>{FEATURES[f]?.[0] || '•'}</span>
                    <span className="truncate">{FEATURES[f]?.[1] || f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 p-4">
              <p className="text-[11px] text-slate-400">Good morning{firstName ? ',' : ''}</p>
              <p className="text-sm font-bold mb-3">{firstName || 'there'} 👋</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  ['Sales today', 'UGX 0', 'bg-blue-50 text-blue-700'],
                  ['Profit', 'UGX 0', 'bg-emerald-50 text-emerald-700'],
                ].map(([label, value, tone]) => (
                  <div key={label} className={`rounded-lg p-2.5 ${tone}`}>
                    <p className="text-[10px] uppercase tracking-wide opacity-75">{label}</p>
                    <p className="text-sm font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-1.5 h-16">
                {[35, 55, 40, 70, 50, 85, 62].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-blue-500 to-sky-400 transition-all duration-700"
                    style={{ height: `${type ? h : 18}%` }}
                  />
                ))}
              </div>
              {type?.features?.includes('expiry') && (
                <p className="mt-3 text-[10px] bg-amber-50 text-amber-700 rounded px-2 py-1">
                  ⏰ Expiry alerts arrive in your inbox every morning
                </p>
              )}
            </div>
          </div>
        </div>
      </AuthPanel>

      {/* ------------------------------------------------------------ */}
      {/* Form                                                          */}
      {/* ------------------------------------------------------------ */}
      <main className="flex-1 flex items-start lg:items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
        <div className="w-full max-w-xl">
          <AuthMobileBrand />

          {/* progress */}
          <div className="flex items-center gap-3 mb-6">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n >= step}
                className="flex-1 text-left disabled:cursor-default"
              >
                <div className={`h-1.5 rounded-full transition-colors ${n <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />
                <p className={`mt-2 text-xs font-semibold ${n <= step ? 'text-blue-700' : 'text-slate-400'}`}>
                  Step {n} · {n === 1 ? 'Your business' : 'Your account'}
                </p>
              </button>
            ))}
          </div>

          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            {step === 1 ? 'Tell us about your business' : 'Create your account'}
          </h2>
          <p className="text-slate-500 mt-1.5 mb-7">
            {step === 1
              ? `Start a free ${trialDays}-day trial with every feature for your type of business.`
              : `You'll be the admin of ${form.business_name.trim() || 'your business'}. Add staff later.`}
          </p>

          {error && (
            <div role="alert" className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={next} className="space-y-6">
              <div>
                <label htmlFor="business_name">Business name</label>
                <input
                  id="business_name"
                  value={form.business_name}
                  onChange={set('business_name')}
                  placeholder="e.g. Mukasa Agro Supplies"
                  required
                  autoFocus
                  className="!py-3 !text-base"
                />
              </div>

              <div>
                <label>What kind of business is it?</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-1">
                  {types.map((t) => {
                    const selected = form.business_type_slug === t.slug;
                    return (
                      <button
                        type="button"
                        key={t.slug}
                        onClick={() => setForm((f) => ({ ...f, business_type_slug: t.slug }))}
                        aria-pressed={selected}
                        className={`group relative text-left p-3 rounded-xl border-2 transition-all ${
                          selected
                            ? 'border-blue-600 bg-blue-50 shadow-sm shadow-blue-200'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:-translate-y-0.5'
                        }`}
                      >
                        {selected && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center">
                            ✓
                          </span>
                        )}
                        <span className="text-2xl block mb-1.5 transition-transform group-hover:scale-110">
                          {t.icon}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 leading-snug block">
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                  {types.length === 0 &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-[86px] rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                </div>
              </div>

              {type && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                    Included for {type.name}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {type.features.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 text-slate-700 rounded-full px-2.5 py-1"
                      >
                        <span>{FEATURES[f]?.[0]}</span>
                        {FEATURES[f]?.[1] || f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-block !py-3 !text-base">
                Continue →
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="full_name">Your full name</label>
                  <input
                    id="full_name"
                    value={form.full_name}
                    onChange={set('full_name')}
                    placeholder="e.g. Jane Mukasa"
                    autoComplete="name"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="07XX XXX XXX"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    value={form.username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      set('username')(e);
                    }}
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={set('password')}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="!pr-16"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {form.password && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              n <= strength.score
                                ? ['bg-red-500', 'bg-orange-400', 'bg-amber-400', 'bg-emerald-500'][strength.score - 1]
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{strength.label}</p>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400">
                We&apos;ll email your daily sales summary and account notices to this address.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setError(''); setStep(1); }}
                  className="btn btn-secondary !py-3"
                  disabled={saving}
                >
                  ← Back
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1 !py-3 !text-base">
                  {saving ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating {form.business_name.trim() || 'your business'}…
                    </>
                  ) : (
                    `Start my ${trialDays}-day free trial`
                  )}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-slate-500 mt-8">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
