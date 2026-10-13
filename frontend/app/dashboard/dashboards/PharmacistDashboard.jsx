'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';

export default function PharmacistDashboard() {
  const [queue, setQueue] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/clinic/prescriptions/?pending=true'),
      api.get('/inventory/products/'),
    ])
      .then(([q, p]) => {
        setQueue(q.data);
        setProducts(p.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const expiring30 = products.filter((p) => {
    if (!p.expiry_date) return false;
    const d = Math.ceil((new Date(p.expiry_date) - today) / 86400000);
    return d >= 0 && d <= 30;
  });
  const expired = products.filter((p) => {
    if (!p.expiry_date) return false;
    return new Date(p.expiry_date) < today;
  });
  const lowStock = products.filter((p) => p.quantity <= p.reorder_level);

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
      title="💊 Pharmacy Dashboard"
      subtitle="Prescriptions to dispense and drug stock alerts"
      actions={[
        { href: '/pharmacy', label: 'Open Pharmacy →', variant: 'primary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="In dispense queue"
          value={queue.length}
          hint={`${lowStock.length} low-stock items · ${expiring30.length} expiring soon`}
          accent={queue.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: 'In Queue',       value: queue.length,      accent: queue.length > 0 ? 'amber' : 'green' },
            { label: 'Expiring (30d)', value: expiring30.length, accent: expiring30.length > 0 ? 'amber' : 'slate' },
            { label: 'Expired',        value: expired.length,    accent: expired.length > 0 ? 'red' : 'green' },
            { label: 'Low Stock',      value: lowStock.length,   accent: lowStock.length > 0 ? 'red' : 'green' },
          ]}
        />
      </Section>

      <Section
        label="Alerts"
        action={
          <Link href="/pharmacy" className="text-xs font-medium text-blue-600 hover:underline">
            Open pharmacy →
          </Link>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AlertList
            icon="⏰"
            color="amber"
            title="Expiring soon (30 days)"
            items={expiring30.slice(0, 6).map((p) => ({
              label: p.name,
              badge: `${p.expiry_date} · ${p.quantity} units`,
            }))}
            emptyText="Nothing expiring in 30 days ✅"
            actionHref="/inventory"
          />
          <AlertList
            icon="📉"
            color="red"
            title="Low stock"
            items={lowStock.slice(0, 6).map((p) => ({
              label: p.name,
              badge: `${p.quantity} / reorder ${p.reorder_level}`,
            }))}
            emptyText="All stock levels healthy ✅"
            actionHref="/inventory"
          />
        </div>
      </Section>

      <Section label="Dispense queue">
        <AlertList
          icon="💊"
          color={queue.length > 0 ? 'amber' : 'green'}
          title="Prescriptions awaiting dispense"
          items={queue.slice(0, 8).map((rx) => ({
            label: `${rx.drug_name} · ${rx.dosage || '—'} · ${rx.quantity} units`,
            badge: rx.product_available ? 'In stock' : 'Insufficient',
          }))}
          emptyText="Nothing waiting — queue is clear ✅"
          actionHref="/pharmacy"
          actionLabel="Dispense"
        />
      </Section>
    </DashboardShell>
  );
}