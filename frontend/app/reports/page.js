'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useTenantContext } from '@/lib/useTenantContext';
import GenericReports from './GenericReports';
import ClinicReports from './ClinicReports';

export default function ReportsRouter() {
  const { enabled_features, ready } = useTenantContext();

  if (!ready) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  const isClinic =
    enabled_features.includes('prescriptions') ||
    enabled_features.includes('appointments');

  return isClinic ? <ClinicReports /> : <GenericReports />;
}