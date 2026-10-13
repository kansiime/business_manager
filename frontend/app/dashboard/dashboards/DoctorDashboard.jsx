'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';

export default function DoctorDashboard() {
  const [visits, setVisits] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([
      api.get('/clinic/visits/?today=true'),
      api.get(`/clinic/appointments/?date=${today}`),
    ])
      .then(([v, a]) => {
        setVisits(v.data);
        setAppointments(a.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [today]);

  const waiting = visits.filter((v) =>
    ['waiting_doctor', 'with_doctor'].includes(v.status)
  );
  const active = visits.filter((v) =>
    ['waiting_lab', 'waiting_pharmacy', 'ready_for_billing'].includes(v.status)
  );
  const done = visits.filter((v) => v.status === 'completed');

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
      title="🩺 Doctor Dashboard"
      subtitle="Your patients today"
      actions={[
        { href: '/consultations', label: 'All Visits →', variant: 'secondary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Waiting for you"
          value={waiting.length}
          hint={`${done.length} completed · ${active.length} in progress`}
          accent={waiting.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: 'Waiting for You', value: waiting.length,  accent: waiting.length > 0 ? 'amber' : 'green' },
            { label: 'Active Visits',   value: active.length },
            { label: 'Completed',       value: done.length,     accent: 'green' },
            { label: 'Appointments',    value: appointments.length, accent: 'blue' },
          ]}
        />
      </Section>

      <Section
        label="Queue"
        action={
          <Link href="/consultations" className="text-xs font-medium text-blue-600 hover:underline">
            Open full queue →
          </Link>
        }
      >
        <AlertList
          icon="🧑‍⚕️"
          color={waiting.length > 0 ? 'amber' : 'blue'}
          title="Patients waiting for you"
          items={waiting.map((v) => ({
            label: `${v.patient_name} — ${v.chief_complaint || 'no complaint noted'}`,
            badge: v.status_display,
          }))}
          emptyText="No patients waiting — queue is clear ✅"
          actionHref="/consultations"
          actionLabel="Open"
        />
      </Section>

      {appointments.length > 0 && (
        <Section label="Today's appointments">
          <AlertList
            icon="📅"
            color="blue"
            title="Scheduled for today"
            items={appointments.slice(0, 8).map((a) => ({
              label: `${String(a.appointment_time).slice(0, 5)} — ${a.patient_name}`,
              badge: a.status_display,
            }))}
            emptyText="No appointments today."
          />
        </Section>
      )}
    </DashboardShell>
  );
}