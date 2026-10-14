'use client';
import { useState } from 'react';
import { billing } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { apiErrorMessage } from '@/lib/session';

/**
 * Pay manually to the platform's Mobile Money number, then report it with
 * the transaction ID from the payment SMS. The platform admin confirms it.
 */
export default function ManualPaymentClaim({ plan, cycle, amount, manual, businessName, defaultPhone, onSubmitted }) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await billing.manualClaim({
        plan: plan.code, billing_cycle: cycle, phone, reference,
      });
      setDone(true);
      onSubmitted?.(res.data.payment);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit your payment details.'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="card" role="status">
        <p className="font-semibold text-slate-900">✅ Thanks — we&apos;ve received your payment details</p>
        <p className="text-sm text-slate-600 mt-1">
          We&apos;ll check it against our Mobile Money statement and activate your {plan.name} plan.
          You&apos;ll see it under Payment history, and we&apos;ll email you once it&apos;s confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-semibold text-slate-900 mb-2">1. Send the payment</h3>
      <p className="text-sm text-slate-600">{manual.instructions}</p>
      <ul className="text-sm text-slate-700 mt-2 space-y-1">
        <li>Amount: <strong>{formatMoney(amount, plan.currency)}</strong> ({plan.name}, {cycle})</li>
        {manual.support_phone && <li>Mobile Money number: <strong>{manual.support_phone}</strong></li>}
        <li>Reference: <strong>{businessName}</strong></li>
      </ul>

      <h3 className="font-semibold text-slate-900 mt-5 mb-2">2. Tell us you&apos;ve paid</h3>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="mc-phone">Number you paid from</label>
          <input
            id="mc-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0772 123 456"
            required
          />
        </div>
        <div>
          <label htmlFor="mc-ref">Transaction ID (from the SMS)</label>
          <input
            id="mc-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. 12345678901"
            required
          />
        </div>
        {error && <p className="sm:col-span-2 text-sm text-red-600" role="alert">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Sending…' : "I've paid — confirm my plan"}
          </button>
          {manual.support_email && (
            <p className="text-xs text-slate-500 mt-2">Questions? {manual.support_email}</p>
          )}
        </div>
      </form>
    </div>
  );
}
