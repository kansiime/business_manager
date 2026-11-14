'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/api';
import { apiErrorMessage } from '@/lib/session';

function ResetPasswordForm() {
  const params = useSearchParams();
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await auth.confirmPasswordReset(uid, token, password);
      setDone(data.detail);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!uid || !token) {
    return (
      <p className="text-sm text-slate-600">
        This reset link is incomplete. Open the link from your email again, or{' '}
        <Link href="/forgot-password" className="text-blue-600 hover:underline">ask for a new one</Link>.
      </p>
    );
  }

  if (done) {
    return (
      <>
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg">
          {done}
        </div>
        <Link href="/login" className="btn btn-primary btn-block mt-6 text-center">
          Sign in
        </Link>
      </>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
          {error.includes('expired') && (
            <>
              {' '}
              <Link href="/forgot-password" className="underline">Get a new link</Link>
            </>
          )}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
            autoFocus
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="confirm">Repeat new password</label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-block">
          {loading ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Choose a new password</h2>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="text-center text-sm text-slate-500 mt-8">
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
