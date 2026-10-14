'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { billing } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { apiErrorMessage } from '@/lib/session';
import { useToast } from '@/components/Toast';

/**
 * Platform admin: payments businesses reported as sent ("I've paid").
 * Check each against the Mobile Money statement, then confirm or reject.
 */
export default function PendingPaymentClaims() {
  const toast = useToast();
  const [claims, setClaims] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);   // claim id with the reason box open
  const [reason, setReason] = useState('');

  const load = () =>
    billing.pendingClaims()
      .then((r) => setClaims(r.data))
      .catch(() => setClaims([]));

  useEffect(() => { load(); }, []);

  const review = async (claim, decision) => {
    setBusy(claim.id);
    try {
      await billing.reviewClaim(claim.id, decision, decision === 'reject' ? reason : undefined);
      toast.success(
        decision === 'confirm'
          ? `Confirmed — ${claim.tenant_name} is now on ${claim.plan}.`
          : `Rejected — ${claim.tenant_name} has been told why.`
      );
      setRejecting(null);
      setReason('');
      setClaims((cs) => cs.filter((c) => c.id !== claim.id));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update the payment.'));
      load();
    } finally {
      setBusy(null);
    }
  };

  if (claims === null) return null;

  return (
    <div className={`card mb-6 ${claims.length ? 'border-amber-300' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="card-title mb-0">Payments to confirm</p>
        {claims.length > 0 && <span className="badge badge-amber">{claims.length} waiting</span>}
      </div>

      {claims.length === 0 ? (
        <p className="text-sm text-slate-500">No payments waiting. Reported payments appear here.</p>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <div key={c.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <Link href={`/tenants/${c.tenant_id}`} className="font-semibold text-slate-900 hover:underline">
                    {c.tenant_name}
                  </Link>
                  {c.tenant_status === 'expired' && <span className="badge badge-red ml-2">expired</span>}
                  <p className="text-slate-600 mt-1">
                    {c.plan} ({c.billing_cycle}) · <strong>{formatMoney(c.amount, c.currency)}</strong>
                  </p>
                  <p className="text-slate-600">
                    From <strong>{c.payer_phone}</strong> · Transaction ID <strong>{c.reference}</strong>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Reported {new Date(c.created_at).toLocaleString()}{c.submitted_by && ` by ${c.submitted_by}`}
                  </p>
                </div>
                {rejecting !== c.id && (
                  <div className="flex gap-2">
                    <button className="btn btn-success btn-sm" disabled={busy === c.id} onClick={() => review(c, 'confirm')}>
                      {busy === c.id ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={() => { setRejecting(c.id); setReason(''); }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {rejecting === c.id && (
                <form
                  className="mt-3 flex flex-wrap gap-2 items-end"
                  onSubmit={(e) => { e.preventDefault(); review(c, 'reject'); }}
                >
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor={`reason-${c.id}`}>Reason (the business will see this)</label>
                    <input
                      id={`reason-${c.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. No payment with this transaction ID"
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="btn btn-danger btn-sm" disabled={busy === c.id}>
                    Reject payment
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
