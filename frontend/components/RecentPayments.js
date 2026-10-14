'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePagination } from '@/lib/usePagination';
import Pagination from '@/components/Pagination';

const PROVIDER_LABEL = { mtn_momo: 'MTN MoMo', flutterwave: 'Card / other', manual: 'Manual' };
const STATUS_BADGE = {
  successful: 'badge-green',
  pending: 'badge-amber',
  failed: 'badge-red',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
};

/** Platform admin: money received this month + every payment (latest first), paged. */
export default function RecentPayments({ pageSize = 10 }) {
  const [payments, setPayments] = useState(null);
  const pg = usePagination(payments || [], pageSize);

  useEffect(() => {
    api.get('/billing/payments/')
      .then((r) => setPayments(r.data))
      .catch(() => setPayments([]));
  }, []);

  if (payments === null) return null;

  const now = new Date();
  const thisMonth = payments.filter((p) => {
    if (p.status !== 'successful' || !p.paid_at) return false;
    const d = new Date(p.paid_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  // Sum per currency (sandbox test payments may be EUR)
  const totals = thisMonth.reduce((acc, p) => {
    acc[p.currency] = (acc[p.currency] || 0) + p.amount;
    return acc;
  }, {});

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <p className="card-title mb-0">Payments</p>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Received this month</p>
          <p className="text-lg font-bold text-green-700">
            {Object.keys(totals).length
              ? Object.entries(totals).map(([cur, amt]) => formatMoney(amt, cur)).join(' + ')
              : formatMoney(0, 'UGX')}
          </p>
          <p className="text-xs text-slate-500">{thisMonth.length} payment{thisMonth.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-slate-500">No payments yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Business</th>
                <th>Plan</th>
                <th className="text-right">Amount</th>
                <th>Via</th>
                <th>Status</th>
                <th>Covers until</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.paid_at || p.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link href={`/tenants/${p.tenant_id}`} className="hover:underline">{p.tenant_name}</Link>
                  </td>
                  <td>{p.plan} <span className="text-slate-400">({p.billing_cycle})</span></td>
                  <td className="text-right">{formatMoney(p.amount, p.currency)}</td>
                  <td>{PROVIDER_LABEL[p.provider] || p.provider}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[p.status] || 'badge-gray'}`}>
                      {p.status === 'pending' && p.provider === 'manual' ? 'awaiting confirmation' : p.status}
                    </span>
                  </td>
                  <td>{p.period_end ? new Date(p.period_end).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={pg.page} totalPages={pg.totalPages} goTo={pg.setPage}
        startIndex={pg.startIndex} endIndex={pg.endIndex}
        totalItems={payments.length} label="payments"
      />
    </div>
  );
}
