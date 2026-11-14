'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import { saveSession, landingPath, apiErrorMessage } from '@/lib/session';
import { usePublicBusiness } from '@/lib/usePublicBusiness';
import AuthPanel, { AuthMobileBrand } from '@/components/AuthPanel';

// Copy per business type
const COPY = {
  garage: {
    headline: 'Run your garage with confidence.',
    subtitle:
      'Track stock, sales, purchases, and debts. Generate detailed reports in PDF and Excel — all from one dashboard.',
    featureLabels: ['Inventory', 'Sales & Profit', 'Reports', 'Debts'],
    featureIcons: ['📦', '💰', '📈', '🧾'],
  },
  grocery: {
    headline: 'Manage your shop, effortlessly.',
    subtitle:
      'Track stock, sales, debts, and expiry dates. Get daily reports and low-stock alerts without lifting a finger.',
    featureLabels: ['Inventory', 'Sales', 'Reports', 'Debts'],
    featureIcons: ['📦', '💰', '📈', '🧾'],
  },
  wholesale: {
    headline: 'Wholesale, handled.',
    subtitle:
      'Manage bulk stock, credit sales, and customer accounts. See what moves, what doesn’t, and who owes you.',
    featureLabels: ['Stock', 'Bulk Sales', 'Customers', 'Reports'],
    featureIcons: ['📦', '💰', '👥', '📈'],
  },
  drugshop: {
    headline: 'Keep your drug shop organised.',
    subtitle:
      'Track stock, expiry dates, and prescriptions. Never run out and never sell expired medicine again.',
    featureLabels: ['Stock', 'Expiry Alerts', 'Sales', 'Reports'],
    featureIcons: ['📦', '⏰', '💰', '📈'],
  },
  clinic: {
    headline: 'Focus on patients, we handle the rest.',
    subtitle:
      'Patient records, appointments, prescriptions, and billing — all in one place.',
    featureLabels: ['Patients', 'Appointments', 'Prescriptions', 'Reports'],
    featureIcons: ['👤', '📅', '💊', '📈'],
  },
  restaurant: {
    headline: 'Serve faster. Track smarter.',
    subtitle:
      'Manage your menu, tables, orders, and daily takings — all from one simple dashboard.',
    featureLabels: ['Menu', 'Tables', 'Orders', 'Reports'],
    featureIcons: ['🍽️', '🪑', '📋', '📈'],
  },
  // Default fallback
  general: {
    headline: 'Manage your business with confidence.',
    subtitle:
      'Track stock, sales, debts, and expenses. Generate detailed reports in PDF and Excel — all from one dashboard.',
    featureLabels: ['Inventory', 'Sales', 'Reports', 'Debts'],
    featureIcons: ['📦', '💰', '📈', '🧾'],
  },
};

// What a returning user finds in their inbox / dashboard each morning.
// `when` limits a card to business types with that feature.
const MORNING = [
  {
    icon: '📊', tone: 'bg-blue-50 text-blue-700',
    title: 'Daily summary', meta: '7:00 AM',
    text: 'Yesterday: 42 sales · UGX 1,240,000 · profit UGX 318,000',
  },
  {
    icon: '⏰', tone: 'bg-amber-50 text-amber-700', when: 'expiry',
    title: 'Expiring this week', meta: '3 items',
    text: 'Sell or return these first before they expire.',
  },
  {
    icon: '📉', tone: 'bg-red-50 text-red-700',
    title: 'Low on stock', meta: '5 items',
    text: 'Reorder now so you never turn a customer away.',
  },
  {
    icon: '💰', tone: 'bg-emerald-50 text-emerald-700',
    title: 'Owed to you', meta: '8 customers',
    text: 'UGX 460,000 in credit sales still to collect.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { info } = usePublicBusiness();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const copy = COPY[info.business_type] || COPY.general;
  // A business's own sign-in link shows its icon; the generic page shows the logo.
  const brandIcon = info.found ? info.business_type_icon || '⚡' : '⚡';
  const features = info.features || [];
  const cards = MORNING.filter(
    (c) => !c.when || features.length === 0 || features.includes(c.when),
  ).slice(0, 3);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(username, password);
      saveSession(res.data);
      router.push(landingPath(res.data));
    } catch (err) {
      setError(
        err?.response?.status === 401
          ? 'Invalid username or password. Please try again.'
          : apiErrorMessage(err)
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      <AuthPanel
        icon={brandIcon}
        name={info.name}
        eyebrow="Good to see you again"
        title={copy.headline}
        perks={copy.featureLabels.slice(0, 3).map((label, i) => [copy.featureIcons[i], label])}
      >
        <p className="text-blue-100 text-base leading-relaxed max-w-md -mt-4 mb-7">
          {copy.subtitle}
        </p>

        {/* Morning notifications preview */}
        <div className="relative max-w-md">
          <p className="text-xs uppercase tracking-[0.18em] text-blue-200/80 mb-3">
            Waiting for you this morning
          </p>
          <div className="space-y-2.5">
            {cards.map((c, i) => (
              <div
                key={c.title}
                className="flex items-start gap-3 rounded-2xl bg-white/95 text-slate-900 p-3.5 shadow-xl shadow-blue-950/40 ring-1 ring-white/30 animate-[rise_.5s_ease-out_both]"
                style={{ animationDelay: `${i * 120}ms`, marginLeft: `${i * 14}px` }}
              >
                <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-lg ${c.tone}`}>
                  {c.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold truncate">{c.title}</p>
                    <span className="text-[11px] text-slate-400 shrink-0">{c.meta}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AuthPanel>

      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <AuthMobileBrand icon={brandIcon} name={info.name} />

          <p className="text-sm font-semibold text-blue-700 mb-2">Sign in</p>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
          <p className="text-slate-500 mt-1.5 mb-8">
            Pick up where you left off: today&apos;s sales, stock and alerts are ready.
          </p>

          {error && (
            <div role="alert" className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="username">Username or email</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                autoComplete="username"
                required
                autoFocus
                disabled={loading}
                className="!py-3"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-blue-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="!py-3 !pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-block !py-3 !text-base"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in →'
              )}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            <div className="flex-1 text-sm">
              <p className="font-semibold text-slate-900">New to Business Manager?</p>
              <p className="text-slate-500 text-xs">Set up your business in two minutes. Free trial, no card.</p>
            </div>
            <Link href="/signup" className="btn btn-secondary btn-sm shrink-0">
              Start free
            </Link>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">
            Staff accounts are created by your business admin.
          </p>
        </div>
      </main>
    </div>
  );
}
