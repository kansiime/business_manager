'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import DataTable from '../widgets/DataTable';

export default function LabDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/clinic/lab-orders/?status=ordered')
      .then((r) => setOrders(r.data))
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

  return (
    <DashboardShell
      title="🔬 Lab Dashboard"
      subtitle="Pending tests and imaging"
      actions={[
        { href: '/lab', label: 'Open Lab →', variant: 'primary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Pending orders"
          value={orders.length}
          hint={orders.length === 0 ? 'Queue is clear' : 'Awaiting processing'}
          accent={orders.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Queue">
        <KpiRow
          items={[
            { label: 'Pending Orders', value: orders.length, accent: orders.length > 0 ? 'amber' : 'green' },
          ]}
          columns={2}
        />
      </Section>

      <Section
        label="Pending orders"
        action={
          orders.length > 0 && (
            <Link href="/lab" className="text-xs font-medium text-blue-600 hover:underline">
              Process in Lab →
            </Link>
          )
        }
      >
        <DataTable
          columns={[
            { key: 'service_name', label: 'Test', className: 'font-medium' },
            { key: 'visit', label: 'Visit', className: 'text-xs font-mono' },
            {
              label: 'Status',
              render: (o) => <span className="badge badge-amber">{o.status_display}</span>,
            },
            {
              label: '',
              align: 'right',
              render: (o) => (
                <Link href="/lab" className="btn btn-secondary btn-sm">
                  Open
                </Link>
              ),
            },
          ]}
          rows={orders}
          emptyText="No pending orders ✅"
        />
      </Section>
    </DashboardShell>
  );
}