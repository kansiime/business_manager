'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { apiErrorMessage } from '@/lib/session';
import { useToast } from '@/components/Toast';

/**
 * Super-admin panel on a business page: payment history plus a form to
 * record a payment received outside Flutterwave (e.g. mobile money sent
 * to the company number), which activates/extends the plan.
 */
export default function TenantPayments({ tenantId, plans, onRecorded }) {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ plan: '', billing_cycle: 'monthly', amount: '', reference: '' });
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get(`/billing/payments/?tenant=${tenantId}`)
      .then((r) => setPayments(r.data))
      .catch(() => {});

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantId]);

  const paidPlans = (plans || []).filter((p) => p.code !== 'trial');
  const selected = paidPlans.find((p) => p.code === form.plan);
  const defaultAmount = selected
    ? (form.billing_cycle === 'yearly' ? selected.yearly_price : selected.monthly_price)
    : '';

  const submit = async (e) => {
    e.preventDefault();
    if (!form.plan) return toast.error('Choose a plan.');
    setSaving(true);
    try {
      await api.post('/billing/manual-payment/', {
        tenant_id: tenantId,
        plan: form.plan,
        billing_cycle: form.billing_cycle,
        amount: form.amount || defaultAmount,
        reference: form.reference,
      });
      toast.success('Payment recorded and plan activated.');
      setForm({ plan: '', billing_cycle: 'monthly', amount: '', reference: '' });
      load();
      onRecorded?.();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not record payment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-6">
      <p className="card-title">Payments</p>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4">
        <div>
          <label htmlFor="mp-plan">Plan</label>
          <select id="mp-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="">Select…</option>
            {paidPlans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mp-cycle">Cycle</label>
          <select id="mp-cycle" value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label htmlFor="mp-amount">Amount</label>
          <input
            id="mp-amount"
            type="number"
            min="0"
            value={form.amount}
            placeholder={defaultAmount ? String(defaultAmount) : ''}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="mp-ref">Reference</label>
          <input
            id="mp-ref"
            value={form.reference}
            placeholder="e.g. MoMo txn ID"
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Record payment'}
        </button>
      </form>

      {payments.length === 0 ? (
        <p className="text-sm text-slate-500">No payments yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th className="text-right">Amount</th>
                <th>Via</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.paid_at || p.created_at).toLocaleDateString()}</td>
                  <td>{p.plan} <span className="text-slate-400">({p.billing_cycle})</span></td>
                  <td className="text-right">{formatMoney(p.amount, p.currency)}</td>
                  <td className="capitalize">{p.provider}</td>
                  <td className="capitalize">{p.status}</td>
                  <td className="text-xs text-slate-500">{p.note || p.tx_ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
