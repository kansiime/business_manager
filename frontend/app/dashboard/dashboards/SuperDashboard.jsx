'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import DataTable from '../widgets/DataTable';
import QuickActions from '../widgets/QuickActions';

export default function SuperDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tenants/platform-stats/')
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

  const money = (n) => formatMoney(n, 'UGX');

  return (
    <DashboardShell
      title="Platform Overview"
      subtitle="Manage every business on the platform"
      actions={[
        { href: '/tenants',  label: 'Manage Businesses', variant: 'primary' },
        { href: '/settings', label: 'Platform Settings', variant: 'secondary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Total businesses"
          value={data.tenants.total}
          hint={`${data.tenants.active} active · ${data.tenants.trial} on trial`}
          accent="blue"
        />
      </Section>

      <Section label="Businesses">
        <KpiRow
          items={[
            { label: 'Total Businesses', value: data.tenants.total,        accent: 'blue' },
            { label: 'Active',           value: data.tenants.active,       accent: 'green' },
            { label: 'On Trial',         value: data.tenants.trial,        accent: 'amber' },
            { label: 'New This Week',    value: data.tenants.new_this_week, accent: 'purple' },
          ]}
        />
      </Section>

      <Section label="Platform">
        <KpiRow
          items={[
            { label: 'Total Users',       value: data.users.total },
            { label: 'Total Products',    value: data.business.total_products },
            { label: 'Sales (this month)', value: money(data.business.sales_this_month), accent: 'green' },
            { label: 'Outstanding debts', value: money(data.business.outstanding_debts), accent: 'red' },
          ]}
        />
      </Section>

      <Section label="Quick actions">
        <QuickActions
          items={[
            { href: '/tenants/new',   icon: '🏢', label: 'Add Business' },
            { href: '/tenants',       icon: '📋', label: 'View All' },
            { href: '/settings',      icon: '⚙️', label: 'Settings' },
          ]}
        />
      </Section>

      {data.recent_tenants?.length > 0 && (
        <Section
          label="Recently created"
          action={
            <Link href="/tenants" className="text-xs font-medium text-blue-600 hover:underline">
              View all →
            </Link>
          }
        >
          <DataTable
            columns={[
              {
                label: 'Business',
                render: (t) => (
                  <span className="font-medium">
                    {t.business_type_icon} {t.name}
                  </span>
                ),
              },
              { key: 'business_type_name', label: 'Type', className: 'text-slate-500' },
              {
                label: 'Plan',
                render: (t) => (
                  <span className={`badge badge-${t.plan === 'trial' ? 'amber' : 'blue'}`}>
                    {t.plan}
                  </span>
                ),
              },
              { key: 'created_at', label: 'Created', className: 'text-xs text-slate-500' },
              {
                label: '',
                align: 'right',
                render: (t) => (
                  <Link href={`/tenants/${t.id}`} className="btn btn-secondary btn-sm">
                    View
                  </Link>
                ),
              },
            ]}
            rows={data.recent_tenants}
          />
        </Section>
      )}
    </DashboardShell>
  );
}