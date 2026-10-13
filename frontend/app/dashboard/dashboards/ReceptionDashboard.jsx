'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { DashboardShell, Section } from '../widgets/Shell';
import HeroKpi from '../widgets/HeroKpi';
import KpiRow from '../widgets/KpiRow';
import AlertList from '../widgets/AlertList';
import DataTable from '../widgets/DataTable';

export default function ReceptionDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try {
      const [a, v] = await Promise.all([
        api.get(`/clinic/appointments/?date=${today}`),
        api.get(`/clinic/visits/?today=true`),
      ]);
      setAppointments(a.data);
      setVisits(v.data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [today]);

  const scheduled = appointments.filter((a) => a.status === 'scheduled');

  const statusBadgeClass = (s) =>
    ({
      waiting_triage: 'badge-amber', waiting_doctor: 'badge-amber', with_doctor: 'badge-blue',
      waiting_lab: 'badge-amber', waiting_pharmacy: 'badge-amber', ready_for_billing: 'badge-blue',
      completed: 'badge-green', cancelled: 'badge-red',
    }[s] || 'badge-gray');

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
      title="🩺 Reception Dashboard"
      subtitle="Check in patients and manage today's bookings"
      actions={[
        { href: '/patients',           label: '+ Register Patient', variant: 'secondary' },
        { href: '/consultations/new',  label: '+ Check-In Patient', variant: 'primary' },
      ]}
    >
      <Section>
        <HeroKpi
          label="Awaiting check-in"
          value={scheduled.length}
          hint={`${appointments.length} scheduled · ${visits.length} checked in`}
          accent={scheduled.length > 0 ? 'amber' : 'green'}
        />
      </Section>

      <Section label="Today">
        <KpiRow
          items={[
            { label: "Today's appointments", value: appointments.length, accent: 'blue' },
            { label: 'Awaiting check-in',    value: scheduled.length,    accent: scheduled.length > 0 ? 'amber' : 'green' },
            { label: 'Visits today',         value: visits.length,       accent: 'green' },
          ]}
          columns={3}
        />
      </Section>

      <Section
        label="Today's appointments"
        action={
          <Link href="/appointments" className="text-xs font-medium text-blue-600 hover:underline">
            Manage appointments →
          </Link>
        }
      >
        <DataTable
          columns={[
            { key: 'appointment_time', label: 'Time', className: 'font-mono text-xs', render: (a) => String(a.appointment_time).slice(0, 5) },
            { key: 'patient_name', label: 'Patient', className: 'font-medium' },
            { key: 'doctor_name', label: 'Doctor', render: (a) => a.doctor_name || '—' },
            {
              label: 'Status',
              render: (a) => (
                <span className={`badge ${a.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>
                  {a.status_display}
                </span>
              ),
            },
            {
              label: '',
              align: 'right',
              render: (a) =>
                a.status === 'scheduled' ? (
                  <Link
                    href={`/consultations/new?patient=${a.patient}&appointment=${a.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    Check In →
                  </Link>
                ) : null,
            },
          ]}
          rows={appointments}
          emptyText="No appointments today."
        />
      </Section>

      <Section
        label={`Active visits today (${visits.length})`}
        action={
          <Link href="/reception" className="text-xs font-medium text-blue-600 hover:underline">
            Open reception →
          </Link>
        }
      >
        <AlertList
          icon="🩺"
          color="blue"
          title="In the clinic right now"
          items={visits.slice(0, 8).map((v) => ({
            label: `${v.patient_name} · ${v.patient_number} — ${v.doctor_name || 'no doctor'}`,
            badge: v.status_display,
          }))}
          emptyText="No patients checked in yet."
        />
      </Section>
    </DashboardShell>
  );
}