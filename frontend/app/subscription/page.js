'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import MomoPayPanel from '@/components/MomoPayPanel';
import ManualPaymentClaim from '@/components/ManualPaymentClaim';
import { useTenantContext } from '@/lib/useTenantContext';
import { billing } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { apiErrorMessage } from '@/lib/session';
import { useToast } from '@/components/Toast';

const STATUS_BADGE = {
  successful: 'badge-green',
  pending: 'badge-amber',
  failed: 'badge-red',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
};

const PROVIDER_LABEL = { mtn_momo: 'MTN MoMo', flutterwave: 'Card / other', manual: 'Mobile Money (manual)' };

function statusLabel(p) {
  if (p.status === 'pending') return p.provider === 'manual' ? 'Awaiting confirmation' : 'Pending';
  if (p.status === 'successful') return 'Paid';
  return p.status.charAt(0).toUpperCase() + p.status.slice(1);
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export default function SubscriptionPage() {
  const toast = useToast();
  const { refresh: refreshContext } = useTenantContext();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [cycle, setCycle] = useState('monthly');
  const [paying, setPaying] = useState(null);
  const [justExpired, setJustExpired] = useState(false);

  useEffect(() => {
    setJustExpired(new URLSearchParams(window.location.search).get('expired') === '1');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () =>
    billing.status()
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiErrorMessage(e, 'Could not load your subscription.')));

  const onMomoPaid = () => {
    toast.success('Payment received — thank you!');
    load();
    refreshContext();
  };

  const pay = async (plan) => {
    setPaying(plan.code);
    try {
      const res = await billing.checkout(plan.code, cycle);
      window.location.href = res.data.payment_link;
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not start payment.'));
      setPaying(null);
    }
  };

  if (!data) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  const hasMethod = (code) => data.payment_methods.some((m) => m.code === code);
  const canMomo = data.can_pay && hasMethod('mtn_momo');
  const canCard = data.can_pay && hasMethod('flutterwave');
  const priceOf = (p) => (cycle === 'yearly' ? p.yearly_price : p.monthly_price);

  const choose = (p) => {
    setSelected(p);
    // Let the payment section render, then bring it into view
    setTimeout(() => document.getElementById('pay-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const planName = data.is_trial ? 'Free trial' : (data.plans.find((p) => p.code === data.plan)?.name || data.plan);
  const statusLine = data.is_expired
    ? `${data.is_trial ? 'Your trial ended' : 'Your plan expired'} on ${fmtDate(data.access_ends_at)}. Your records are safe but read-only until you pay.`
    : data.access_ends_at
      ? `${data.days_remaining} day${data.days_remaining === 1 ? '' : 's'} left — ${data.is_trial ? 'trial ends' : 'renews by'} ${fmtDate(data.access_ends_at)}.`
      : 'No end date.';

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
        <p className="text-sm text-slate-500 mt-1">{data.business.name}</p>
      </div>

      {justExpired && data.is_expired && (
        <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          That change wasn't saved because your {data.is_trial ? 'trial' : 'plan'} has ended.
          Choose a plan below to continue.
        </div>
      )}

      <div className={`card mb-6 ${data.is_expired ? 'border-red-300' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Current plan</p>
            <p className="text-xl font-bold text-slate-900">{planName}</p>
          </div>
          <span className={`badge ${data.is_expired ? 'badge-red' : data.is_trial ? 'badge-blue' : 'badge-green'}`}>
            {data.is_expired ? 'Expired' : data.is_trial ? 'Trial' : 'Active'}
          </span>
        </div>
        <p className={`text-sm mt-2 ${data.is_expired ? 'text-red-700' : 'text-slate-600'}`}>{statusLine}</p>
        <p className="text-xs text-slate-500 mt-1">Up to {data.max_users} users.</p>
      </div>

      {data.payments.some((p) => p.provider === 'manual' && p.status === 'pending') && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900" role="status">
          ⏳ We&apos;ve received your payment details and are confirming them. Your plan will be
          activated as soon as we do — no need to pay again.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-slate-900">
          {data.is_trial ? 'Choose a plan' : 'Renew or change plan'}
        </h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Billing cycle">
          {['monthly', 'yearly'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              aria-pressed={cycle === c}
              className={`px-3 py-1.5 text-sm rounded-md capitalize ${cycle === c ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              {c}{c === 'yearly' && ' (2 months free)'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {data.plans.map((p) => {
          const price = cycle === 'yearly' ? p.yearly_price : p.monthly_price;
          const current = !data.is_trial && p.code === data.plan;
          const isSelected = selected?.code === p.code;
          return (
            <div
              key={p.code}
              className={`card flex flex-col ${isSelected ? 'ring-2 ring-blue-600' : current ? 'ring-1 ring-blue-300' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{p.name}</p>
                {current && <span className="badge badge-green">Current</span>}
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {formatMoney(price, p.currency)}
                <span className="text-sm font-normal text-slate-500"> / {cycle === 'yearly' ? 'year' : 'month'}</span>
              </p>
              <ul className="text-sm text-slate-600 mt-3 space-y-1 flex-1">
                <li>Up to {p.max_users} users</li>
                <li>{p.max_branches} branch{p.max_branches === 1 ? '' : 'es'}</li>
                <li>All features for your business type</li>
              </ul>
              {data.can_pay && (
                <button
                  type="button"
                  className={`btn mt-4 ${isSelected ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => choose(p)}
                  aria-pressed={isSelected}
                >
                  {isSelected ? 'Selected' : current ? `Renew ${p.name}` : `Choose ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!data.can_pay && (
        <div className="card mb-6 text-sm text-slate-600">
          Only the business admin can pay for a plan. Ask your admin to renew.
        </div>
      )}

      {data.can_pay && selected && (
        <section id="pay-section" className="mb-6 scroll-mt-6">
          <h2 className="font-semibold text-slate-900 mb-3">
            Pay for {selected.name} — {formatMoney(priceOf(selected), selected.currency)} / {cycle === 'yearly' ? 'year' : 'month'}
          </h2>

          {canMomo && (
            <MomoPayPanel
              key={`${selected.code}-${cycle}`}
              plan={selected}
              cycle={cycle}
              amount={priceOf(selected)}
              currency={data.momo_sandbox ? 'EUR' : selected.currency}
              defaultPhone={data.default_phone}
              sandbox={data.momo_sandbox}
              onPaid={onMomoPaid}
              onCancel={() => setSelected(null)}
            />
          )}

          {canCard && (
            <div className="card mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {canMomo ? 'Not on MTN? ' : ''}Pay by card, Airtel Money or bank.
              </p>
              <button
                className={`btn ${canMomo ? 'btn-secondary' : 'btn-primary'}`}
                disabled={paying !== null}
                onClick={() => pay(selected)}
              >
                {paying === selected.code ? 'Opening payment…' : 'Pay by card / other'}
              </button>
            </div>
          )}

          {(canMomo || canCard) && !showManual && (
            <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => setShowManual(true)}>
              Already sent money to our Mobile Money number? Tell us here
            </button>
          )}

          {(!(canMomo || canCard) || showManual) && (
            <ManualPaymentClaim
              key={`${selected.code}-${cycle}`}
              plan={selected}
              cycle={cycle}
              amount={priceOf(selected)}
              manual={data.manual_payment}
              businessName={data.business.name}
              defaultPhone={data.default_phone}
              onSubmitted={load}
            />
          )}
        </section>
      )}

      <h2 className="font-semibold text-slate-900 mb-3">Payment history</h2>
      {data.payments.length === 0 ? (
        <p className="text-sm text-slate-500">No payments yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th className="text-right">Amount</th>
                <th>Paid via</th>
                <th>Transaction ID</th>
                <th>Status</th>
                <th>Covers until</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paid_at || p.created_at)}</td>
                  <td>{p.plan} <span className="text-slate-400 capitalize">({p.billing_cycle})</span></td>
                  <td className="text-right">{formatMoney(p.amount, p.currency)}</td>
                  <td>{PROVIDER_LABEL[p.provider] || p.provider}</td>
                  <td className="text-xs text-slate-600">{p.reference || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[p.status] || 'badge-gray'}`}>{statusLabel(p)}</span>
                    {['rejected', 'failed'].includes(p.status) && p.note && (
                      <p className="text-xs text-red-600 mt-1">{p.note}</p>
                    )}
                  </td>
                  <td>{fmtDate(p.period_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedRoute>
  );
}
