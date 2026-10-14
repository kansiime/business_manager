'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';
import { saveSession, landingPath, apiErrorMessage } from '@/lib/session';
import { usePublicBusiness } from '@/lib/usePublicBusiness';

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

export default function LoginPage() {
  const router = useRouter();
  const { info, loading: bizLoading } = usePublicBusiness();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const copy = COPY[info.business_type] || COPY.general;

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
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">
            {info.business_type_icon || '🏪'}
          </div>
          <span className="text-xl font-bold tracking-tight">{info.name}</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            {copy.headline}
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed max-w-md">
            {copy.subtitle}
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 max-w-md">
            {copy.featureLabels.map((label, i) => (
              <div
                key={label}
                className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-3"
              >
                <span className="text-2xl">{copy.featureIcons[i]}</span>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-blue-200 text-sm">
          © {new Date().getFullYear()} {info.name}
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl">
              {info.business_type_icon || '🏪'}
            </div>
            <span className="text-xl font-bold">{info.name}</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">
            Sign in to access your dashboard
          </p>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="username">Username or email</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username or email"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-block mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-8">
            New here?{' '}
            <Link href="/signup" className="text-blue-600 font-medium hover:underline">
              Create your business — start a free trial
            </Link>
          </p>
          <p className="text-center text-xs text-slate-400 mt-2">
            Staff accounts are created by your business admin.
          </p>
        </div>
      </div>
    </div>
  );
}