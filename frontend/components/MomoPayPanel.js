'use client';
import { useEffect, useRef, useState } from 'react';
import { billing } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { apiErrorMessage } from '@/lib/session';

const POLL_MS = 4000;
const POLL_FOR_MS = 3 * 60 * 1000;

/**
 * Pay for a plan with MTN Mobile Money: enter number → MTN sends a PIN
 * prompt → we poll until MTN reports the result.
 */
export default function MomoPayPanel({ plan, cycle, amount, currency, defaultPhone, sandbox, onPaid, onCancel }) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [phase, setPhase] = useState('enter');   // enter | sending | waiting | slow | paid | failed
  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState(null);
  const timer = useRef(null);
  const startedAt = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const check = async (txRef) => {
    try {
      const res = await billing.momoStatus(txRef);
      const p = res.data.payment;
      setPayment(p);
      if (p.status === 'successful') {
        setPhase('paid');
        onPaid?.(p);
        return;
      }
      if (p.status !== 'pending') {
        setPhase('failed');
        setMessage(p.note || 'The payment was not completed.');
        return;
      }
    } catch (err) {
      const p = err?.response?.data?.payment;
      if (p && p.status !== 'pending') {
        setPayment(p);
        setPhase('failed');
        setMessage(apiErrorMessage(err, 'The payment was not completed.'));
        return;
      }
      // Network / MTN hiccup: keep waiting
    }
    if (Date.now() - startedAt.current > POLL_FOR_MS) {
      setPhase('slow');
      return;
    }
    timer.current = setTimeout(() => check(txRef), POLL_MS);
  };

  const wait = (p) => {
    setPayment(p);
    setPhase('waiting');
    startedAt.current = Date.now();
    timer.current = setTimeout(() => check(p.tx_ref), POLL_MS);
  };

  const send = async (e) => {
    e.preventDefault();
    setPhase('sending');
    setMessage('');
    try {
      const res = await billing.momoPay(plan.code, cycle, phone);
      wait(res.data.payment);
    } catch (err) {
      const existing = err?.response?.status === 409 && err.response.data.payment;
      if (existing) {
        wait(existing);
        return;
      }
      setPhase('enter');
      setMessage(apiErrorMessage(err, 'Could not send the payment request.'));
    }
  };

  const checkAgain = () => {
    setPhase('waiting');
    startedAt.current = Date.now();
    check(payment.tx_ref);
  };

  return (
    <div className="card mb-6 border-amber-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-slate-900">Pay with MTN Mobile Money</p>
          <p className="text-sm text-slate-500">
            {plan.name} · {cycle} · <strong>{formatMoney(amount, currency)}</strong>
          </p>
          {sandbox && (
            <p className="text-xs text-amber-700 mt-1">
              Test mode (MTN sandbox): MTN&apos;s sandbox only uses EUR test money — nothing is
              charged. Live payments are in UGX.
            </p>
          )}
        </div>
        {(phase === 'enter' || phase === 'failed') && (
          <button type="button" className="text-sm text-slate-500" onClick={onCancel}>Cancel</button>
        )}
      </div>

      {(phase === 'enter' || phase === 'sending') && (
        <form onSubmit={send} className="space-y-3">
          <div>
            <label htmlFor="momo-phone">MTN number</label>
            <input
              id="momo-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0772 123 456"
              required
              autoFocus
            />
          </div>
          {message && <p className="text-sm text-red-600">{message}</p>}
          {sandbox && (
            <p className="text-xs text-slate-500">
              Sandbox: any number succeeds except 46733123450 (fails), 46733123451 (rejected),
              46733123452 (expires), 46733123453 (stays pending).
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={phase === 'sending'}>
            {phase === 'sending' ? 'Sending request…' : 'Send payment request'}
          </button>
        </form>
      )}

      {phase === 'waiting' && (
        <div className="flex items-start gap-3" role="status" aria-live="polite">
          <div className="w-6 h-6 mt-0.5 border-4 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div className="text-sm text-slate-700">
            <p className="font-medium">Check your phone ({payment?.payer_phone})</p>
            <p className="mt-1">
              Approve the payment by entering your Mobile Money PIN. If no prompt appears,
              dial <strong>*165#</strong> → My Approvals.
            </p>
          </div>
        </div>
      )}

      {phase === 'slow' && (
        <div className="text-sm text-slate-700 space-y-3">
          <p>We haven&apos;t heard back from MTN yet. If you approved it, it will be applied automatically.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={checkAgain}>Check again</button>
        </div>
      )}

      {phase === 'paid' && (
        <p className="text-sm font-medium text-green-700" role="status">
          ✅ Payment received — your {plan.name} plan is active.
        </p>
      )}

      {phase === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm text-red-700" role="alert">{message}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPhase('enter'); setMessage(''); }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
