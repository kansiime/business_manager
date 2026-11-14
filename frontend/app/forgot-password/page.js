'use client';
import { useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { apiErrorMessage } from '@/lib/session';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await auth.requestPasswordReset(identifier.trim());
      setSent(data.detail);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Forgot your password?</h2>
        <p className="text-slate-500 text-sm mb-6">
          Enter your username or email and we&apos;ll email you a link to choose a new one.
        </p>

        {sent ? (
          <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg">
            {sent}
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="identifier">Username or email</label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your username or email"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary btn-block">
                {loading ? 'Sending…' : 'Email me a reset link'}
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-4">
              No email on your account? Ask your business admin to set a new password for you.
            </p>
          </>
        )}

        <p className="text-center text-sm text-slate-500 mt-8">
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
