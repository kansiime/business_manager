'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useTenantContext } from '@/lib/useTenantContext';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import QuickActions from '../widgets/QuickActions';

export default function CashierDashboard() {
  const { pages } = useTenantContext();
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
  const has = (k) => pages.includes(k);

  const actions = [];
  if (has('appointments')) actions.push({ href: '/billing', label: 'Billing →', variant: 'secondary' });
  if (has('sales'))        actions.push({ href: '/sales',   label: '+ New Sale', variant: 'primary' });

  const quickActions = [];
  if (has('sales'))     quickActions.push({ href: '/sales',     icon: '💰', label: 'New Sale' });
  if (has('debts'))     quickActions.push({ href: '/debts',     icon: '🧾', label: 'Record Payment' });
  if (has('customers')) quickActions.push({ href: '/customers', icon: '👥', label: 'Customers' });
  if (has('reports'))   quickActions.push({ href: '/reports',   icon: '📈', label: 'Reports' });

  return (
    <DashboardShell
      title="💰 Cashier Dashboard"
      subtitle="Daily sales, debts, and receipts"
      actions={actions}
    >
      <Section>
        <HeroKpi
          label="Sales today"
          value={money(data.today.total)}
          hint={`${data.today.count} transactions`}
          accent="blue"
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: "Today's sales", value: money(data.today.total),  accent: 'blue' },
            { label: 'Month sales',   value: money(data.month.total),  accent: 'green' },
            { label: 'Receivables',   value: money(data.receivables),  accent: 'amber' },
            { label: 'Low stock',     value: data.low_stock ?? 0, accent: (data.low_stock ?? 0) > 0 ? 'red' : 'green' },
          ]}
        />
      </Section>

      {quickActions.length > 0 && (
        <Section label="Quick actions">
          <QuickActions items={quickActions} />
        </Section>
      )}
    </DashboardShell>
  );
}