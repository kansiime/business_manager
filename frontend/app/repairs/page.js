'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useTenantContext } from '@/lib/useTenantContext';

export default function RepairsPage() {
  const { enabled_features } = useTenantContext();
  const FEATURE = 'repairs';
  const TITLE = 'Repairs';
  const SUBTITLE = 'Job cards and workshop repairs';
  const ICON = '🔧';

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
          <li>Open a job card for a vehicle</li>
          <li>Track parts used and labour hours</li>
          <li>Attach photos and notes</li>
          <li>Generate an invoice when the job is done</li>
        </ul>
      </div>
    </ProtectedRoute>
  );
}