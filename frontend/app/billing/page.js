'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { useTenantContext } from '@/lib/useTenantContext';

export default function BillingPage() {
  const toast = useToast();
  const { pages } = useTenantContext();
  const canUse = pages.includes('sales') || pages.includes('debts');

  const [invoices, setInvoices] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [i, gs] = await Promise.all([
        api.get('/clinic/invoices/?status=open'),
        api.get('/auth/settings/'),
      ]);
      setInvoices(i.data);
      setCurrency(gs.data.currency_symbol || 'UGX');
    } catch {
      toast.error('Could not load invoices.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!canUse) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Access denied</p>
        </div>
      </ProtectedRoute>
    );
  }

  const money = (n) => formatMoney(n, currency);

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">💰 Billing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Open invoices waiting for payment
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && invoices.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-slate-500">No open invoices.</p>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient</th>
                <th>Visit</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-mono text-xs">{inv.invoice_number}</td>
                  <td className="font-medium">{inv.patient_name}</td>
                  <td className="text-xs">#{inv.visit_number}</td>
                  <td className="text-right">{money(inv.total)}</td>
                  <td className="text-right">{money(inv.amount_paid)}</td>
                  <td className="text-right font-semibold text-red-600">
                    {money(inv.balance)}
                  </td>
                  <td className="text-right">
                    <Link href={`/consultations/${inv.visit_number}`}
                      className="btn btn-primary btn-sm">
                      Collect Payment →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ProtectedRoute>
  );
}