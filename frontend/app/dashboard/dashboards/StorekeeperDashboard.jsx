'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';
import DataTable from '../widgets/DataTable';
import QuickActions from '../widgets/QuickActions';

export default function StorekeeperDashboard() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory/products/')
      .then((r) => setProducts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const low = products.filter((p) => p.quantity <= p.reorder_level);
  const out = products.filter((p) => p.quantity === 0);
  const today = new Date();
  const expiring = products.filter((p) => {
    if (!p.expiry_date) return false;
    const d = Math.ceil((new Date(p.expiry_date) - today) / 86400000);
    return d >= 0 && d <= 30;
  });

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
      title="📦 Storekeeper Dashboard"
      subtitle="Stock levels, reorders, expiry"
      actions={[
        { href: '/inventory',  label: 'Inventory',  variant: 'primary' },
        { href: '/purchases',  label: '+ Purchase', variant: 'secondary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Low stock items"
          value={low.length}
          hint={`${out.length} out of stock · ${expiring.length} expiring in 30 days`}
          accent={out.length > 0 ? 'red' : low.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Stock health">
        <KpiRow
          items={[
            { label: 'Products',         value: products.length, accent: 'blue' },
            { label: 'Out of Stock',     value: out.length,      accent: out.length > 0 ? 'red' : 'green' },
            { label: 'Low Stock',        value: low.length,      accent: low.length > 0 ? 'amber' : 'green' },
            { label: 'Expiring (30d)',   value: expiring.length, accent: expiring.length > 0 ? 'amber' : 'green' },
          ]}
        />
      </Section>

      {(out.length > 0 || low.length > 0) && (
        <Section label="Needs attention">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {out.length > 0 && (
              <AlertList
                icon="🚨"
                color="red"
                title="Out of stock"
                items={out.slice(0, 6).map((p) => ({
                  label: p.name,
                  badge: `reorder at ${p.reorder_level}`,
                }))}
                emptyText="Nothing out of stock."
                actionHref="/purchases"
                actionLabel="Order"
              />
            )}
            {low.length > 0 && (
              <AlertList
                icon="⚠️"
                color="amber"
                title="Low stock"
                items={low.filter((p) => p.quantity > 0).slice(0, 6).map((p) => ({
                  label: p.name,
                  badge: `${p.quantity} / reorder ${p.reorder_level}`,
                }))}
                emptyText="All stock levels healthy."
                actionHref="/purchases"
                actionLabel="Order"
              />
            )}
          </div>
        </Section>
      )}

      <Section label="Quick actions">
        <QuickActions
          items={[
            { href: '/purchases',        icon: '🛒', label: 'New Purchase' },
            { href: '/inventory',        icon: '📦', label: 'Stock Count' },
            { href: '/returns',          icon: '↩️', label: 'Returns' },
            { href: '/ai-analytics',     icon: '🤖', label: 'AI Insights' },
          ]}
        />
      </Section>

      {out.length > 0 && (
        <Section
          label="Out of stock"
          action={
            <Link href="/purchases" className="text-xs font-medium text-blue-600 hover:underline">
              Create purchase order →
            </Link>
          }
        >
          <DataTable
            columns={[
              { key: 'sku', label: 'SKU', className: 'font-mono text-xs' },
              { key: 'name', label: 'Product', className: 'font-medium' },
              { key: 'reorder_level', label: 'Reorder at', align: 'right', className: 'text-slate-500' },
              {
                label: '',
                align: 'right',
                render: () => (
                  <Link href="/purchases" className="btn btn-secondary btn-sm">
                    Order
                  </Link>
                ),
              },
            ]}
            rows={out}
          />
        </Section>
      )}
    </DashboardShell>
  );
}