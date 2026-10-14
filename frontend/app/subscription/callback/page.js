'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { billing } from '@/lib/api';
import { apiErrorMessage } from '@/lib/session';
import { useTenantContext } from '@/lib/useTenantContext';

/**
 * Flutterwave redirects here after checkout with
 * ?status=successful|cancelled&tx_ref=...&transaction_id=...
 */
export default function PaymentCallbackPage() {
  const { refresh } = useTenantContext();
  const [state, setState] = useState({ phase: 'checking', message: '' });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const txRef = q.get('tx_ref');
    if (!txRef) {
      setState({ phase: 'error', message: 'Missing payment reference.' });
      return;
    }
    billing.verify({
      tx_ref: txRef,
      transaction_id: q.get('transaction_id'),
      status: q.get('status'),
    })
      .then((r) => {
        if (r.data.ok) {
          setState({ phase: 'success', message: '' });
          refresh();
        } else {
          setState({ phase: 'error', message: r.data.detail || 'Payment was not completed.' });
        }
      })
      .catch((e) => setState({ phase: 'error', message: apiErrorMessage(e, 'Could not confirm the payment.') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ProtectedRoute>
      <div className="card max-w-lg mx-auto text-center py-10">
        {state.phase === 'checking' && (
          <>
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-700">Confirming your payment…</p>
          </>
        )}
        {state.phase === 'success' && (
          <>
            <p className="text-4xl mb-2">✅</p>
            <p className="text-lg font-semibold text-slate-900">Payment received</p>
            <p className="text-sm text-slate-500 mt-1">Your plan is active. Thank you!</p>
            <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">Go to dashboard</Link>
          </>
        )}
        {state.phase === 'error' && (
          <>
            <p className="text-4xl mb-2">⚠️</p>
            <p className="text-lg font-semibold text-slate-900">Payment not confirmed</p>
            <p className="text-sm text-slate-500 mt-1">{state.message}</p>
            <p className="text-xs text-slate-400 mt-2">
              If money left your account, it will be applied automatically within a few minutes.
            </p>
            <Link href="/subscription" className="btn btn-secondary mt-6 inline-flex">Back to subscription</Link>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
