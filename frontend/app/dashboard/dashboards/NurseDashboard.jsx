'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';

export default function NurseDashboard() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/clinic/visits/?today=true')
      .then((r) => setVisits(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const forTriage = visits.filter((v) => v.status === 'waiting_triage');
  const inProgress = visits.filter((v) =>
    ['waiting_doctor', 'with_doctor', 'waiting_lab', 'waiting_pharmacy', 'ready_for_billing'].includes(v.status)
  );

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
      title="🩺 Nurse Dashboard"
      subtitle="Record vitals and prepare patients"
      actions={[
        { href: '/reception', label: 'Reception →', variant: 'secondary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Waiting for triage"
          value={forTriage.length}
          hint={`${visits.length} total visits today`}
          accent={forTriage.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: 'Waiting for Triage', value: forTriage.length, accent: forTriage.length > 0 ? 'amber' : 'green' },
            { label: 'In Progress',        value: inProgress.length, accent: 'blue' },
            { label: 'Total Visits Today', value: visits.length },
          ]}
          columns={3}
        />
      </Section>

      <Section
        label="Triage queue"
        action={
          <Link href="/reception" className="text-xs font-medium text-blue-600 hover:underline">
            Open reception →
          </Link>
        }
      >
        <AlertList
          icon="🌡️"
          color={forTriage.length > 0 ? 'amber' : 'green'}
          title="Patients awaiting vitals"
          items={forTriage.map((v) => ({
            label: v.patient_name,
            badge: v.chief_complaint || 'no complaint',
          }))}
          emptyText="No patients waiting for triage ✅"
        />
      </Section>
    </DashboardShell>
  );
}