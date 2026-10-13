'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';

export default function AccountantDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/dashboard/')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="pb-10">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-3" />
        <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }
  if (!data) return null;

  const currency = data.currency || 'UGX';
  const money = (n) => formatMoney(n, currency);

  return (
    <DashboardShell
      title="📊 Accountant Dashboard"
      subtitle="Money in, money out, and outstanding"
      actions={[
        { href: '/reports', label: 'View Reports →', variant: 'primary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Net profit this month"
          value={money(data.net_profit_month || 0)}
          hint={`Sales ${money(data.month.total)} · Expenses ${money(data.expenses_month || 0)}`}
          accent={(data.net_profit_month || 0) >= 0 ? 'green' : 'red'}
        />
      </Section>

      <Section label="This month">
        <KpiRow
          items={[
            { label: 'Sales',        value: money(data.month.total),          accent: 'blue' },
            { label: 'Gross profit', value: money(data.month.profit),         accent: 'green' },
            { label: 'Expenses',     value: money(data.expenses_month || 0),  accent: 'amber' },
            { label: 'Net profit',   value: money(data.net_profit_month || 0), accent: (data.net_profit_month || 0) >= 0 ? 'green' : 'red' },
          ]}
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: "Today's sales",  value: money(data.today.total),  accent: 'blue',  hint: `${data.today.count} transactions` },
            { label: 'Gross profit',   value: money(data.today.profit), accent: 'green' },
            { label: 'Stock value',    value: money(data.stock_value),  accent: 'slate' },
            { label: 'Low stock items', value: data.low_stock ?? 0, accent: (data.low_stock ?? 0) > 0 ? 'red' : 'green' },
          ]}
        />
      </Section>

      <Section label="Balances">
        <KpiRow
          items={[
            { label: 'Receivables', value: money(data.receivables), accent: 'amber', hint: 'Owed to you' },
            { label: 'Payables',    value: money(data.payables),    accent: 'red',   hint: 'You owe suppliers' },
            { label: 'Stock value', value: money(data.stock_value), accent: 'slate', hint: 'Inventory value' },
          ]}
          columns={3}
        />
      </Section>
    </DashboardShell>
  );
}