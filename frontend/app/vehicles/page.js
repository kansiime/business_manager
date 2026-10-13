'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useTenantContext } from '@/lib/useTenantContext';

export default function VehiclesPage() {
  const { enabled_features } = useTenantContext();
  const FEATURE = 'vehicles';
  const TITLE = 'Vehicles';
  const SUBTITLE = 'Customer vehicles and service history';
  const ICON = '🚗';

  if (!enabled_features.includes(FEATURE)) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Feature not available</p>
          <p className="text-sm text-slate-500 mt-1">
            {TITLE} are not enabled for this business type.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {ICON} {TITLE}
        </h1>
        <p className="text-sm text-slate-500 mt-1">{SUBTITLE}</p>
      </div>

      <div className="card">
        <p className="text-slate-500">
          🚧 This module is being built. The database and permissions are ready.
        </p>
        <p className="text-sm text-slate-400 mt-3">
          When built, this page will let you:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-500 mt-2 space-y-1">
          <li>Register vehicles by plate number, model, and owner</li>
          <li>See full service history per vehicle</li>
          <li>Track mileage, next service date, and insurance</li>
          <li>Send service reminders to the owner</li>
        </ul>
      </div>
    </ProtectedRoute>
  );
}