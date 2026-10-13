'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useTenantContext } from '@/lib/useTenantContext';
import { DashboardShell, Section, Card, CardHeader } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';
import DataTable from '../widgets/DataTable';
import QuickActions from '../widgets/QuickActions';

export default function AdminDashboard() {
  const { pages } = useTenantContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const has = (k) => pages.includes(k);

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

  // Actions reflect the tenant's features, not the user's role.
  const actions = [];
  if (has('sales'))        actions.push({ href: '/sales',            label: '+ New Sale',  variant: 'primary' });
  if (has('appointments')) actions.push({ href: '/consultations/new',label: '+ New Visit', variant: 'secondary' });
  if (has('repairs'))      actions.push({ href: '/repairs/new',      label: '+ New Job',   variant: 'secondary' });
  if (has('purchases'))    actions.push({ href: '/purchases',        label: '+ Purchase',  variant: 'secondary' });

  // Pick the hero metric based on what matters most for this tenant.
  let heroLabel = 'Sales today';
  let heroValue = money(data.today.total);
  let heroHint  = `${data.today.count} transactions`;
  let heroAccent = 'blue';

  if (has('repairs') && !has('sales')) {
    heroLabel = 'Open job cards';
    heroValue = data.open_jobs ?? 0;
    heroHint  = `${data.completed_jobs ?? 0} completed today`;
    heroAccent = 'purple';
  } else if (has('prescriptions') && !has('sales')) {
    heroLabel = 'Prescriptions dispensed';
    heroValue = data.rx_dispensed_today ?? 0;
    heroHint  = `${data.rx_pending ?? 0} pending`;
    heroAccent = 'green';
  }

  const quickActions = [];
  if (has('sales'))        quickActions.push({ href: '/sales',        icon: '💰', label: 'Record a Sale' });
  if (has('inventory'))    quickActions.push({ href: '/ai-analytics', icon: '🤖', label: 'AI Insights' });
  if (has('expenses'))     quickActions.push({ href: '/expenses',     icon: '💸', label: 'Add Expense' });
  if (has('purchases'))    quickActions.push({ href: '/purchases',    icon: '🛒', label: 'Add Purchase' });
  if (has('repairs'))      quickActions.push({ href: '/repairs',      icon: '🔧', label: 'Job Cards' });
  if (has('customers'))    quickActions.push({ href: '/customers',    icon: '👥', label: 'Customers' });
  if (has('suppliers'))    quickActions.push({ href: '/suppliers',    icon: '🏢', label: 'Suppliers' });
  if (has('reports'))      quickActions.push({ href: '/reports',      icon: '📈', label: 'Reports' });

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={data.business_name}
      actions={actions}
    >
      {/* 1. Hero KPI */}
      <Section>
        <HeroKpi
          label={heroLabel}
          value={heroValue}
          hint={heroHint}
          accent={heroAccent}
        />
      </Section>

      {/* 2. KPI row */}
      <Section label="Performance">
        <KpiRow
          items={[
            { label: 'Sales (today)',    value: money(data.today.total),         accent: 'blue',   hint: `${data.today.count} transactions` },
            { label: 'Gross profit',     value: money(data.today.profit),        accent: 'green' },
            { label: 'Expenses',         value: money(data.expenses_today || 0), accent: 'amber' },
            { label: 'Net profit',       value: money(data.net_profit_today || 0), accent: (data.net_profit_today || 0) >= 0 ? 'green' : 'red' },
          ]}
        />
      </Section>

      {/* 3. Alerts — shown only when relevant */}
      {(has('expiry') || has('inventory')) && (
        <Section label="Needs attention">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {has('expiry') && (
              <AlertList
                icon="⏰"
                color="amber"
                title="Expiring soon (30 days)"
                items={(data.expiring_soon || []).map((p) => ({
                  label: p.name,
                  badge: `${p.days_left}d · ${p.quantity} ${p.unit || ''}`,
                }))}
                emptyText="Nothing expiring in the next 30 days."
                actionHref="/inventory"
              />
            )}
            {has('inventory') && (
              <AlertList
                icon="📦"
                color="red"
                title="Low stock"
                items={(data.low_stock_items || []).slice(0, 6).map((p) => ({
                  label: p.name,
                  badge: `${p.quantity} left · reorder ${p.reorder_level}`,
                }))}
                emptyText="All stock levels healthy."
                actionHref="/inventory"
              />
            )}
          </div>
        </Section>
      )}

      {/* 4. This month + balances */}
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

      <Section label="Balances">
        <KpiRow
          items={[
            { label: 'Receivables', value: money(data.receivables), accent: 'amber', hint: 'Owed to you' },
            { label: 'Payables',    value: money(data.payables),    accent: 'red',   hint: 'You owe suppliers' },
            { label: 'Stock value', value: money(data.stock_value), accent: 'slate', hint: 'Current inventory' },
            { label: 'Low stock items', value: data.low_stock ?? 0, accent: (data.low_stock ?? 0) > 0 ? 'red' : 'green', hint: (data.low_stock ?? 0) > 0 ? 'Needs restocking' : 'All good' },
          ]}
        />
      </Section>

      {/* 5. Quick actions */}
      {quickActions.length > 0 && (
        <Section label="Quick actions">
          <QuickActions items={quickActions} />
        </Section>
      )}

      {/* 6. Low stock table */}
      {has('inventory') && data.low_stock_items?.length > 0 && (
        <Section
          label="Restock recommendations"
          action={
            <Link href="/inventory" className="text-xs font-medium text-blue-600 hover:underline">
              Open inventory →
            </Link>
          }
        >
          <DataTable
            columns={[
              { key: 'sku', label: 'SKU', className: 'font-mono text-xs' },
              { key: 'name', label: 'Product', className: 'font-medium' },
              { key: 'quantity', label: 'In stock', align: 'right', className: 'text-red-600 font-semibold' },
              { key: 'reorder_level', label: 'Reorder at', align: 'right', className: 'text-slate-500' },
              {
                label: '',
                align: 'right',
                render: () => (
                  <Link href="/inventory" className="btn btn-secondary btn-sm">
                    Restock
                  </Link>
                ),
              },
            ]}
            rows={data.low_stock_items}
          />
        </Section>
      )}
    </DashboardShell>
  );
}