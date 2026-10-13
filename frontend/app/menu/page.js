'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useTenantContext } from '@/lib/useTenantContext';

export default function MenuPage() {
  const { enabled_features } = useTenantContext();
  const FEATURE = 'menu';
  const TITLE = 'Menu';
  const SUBTITLE = 'Dishes, drinks, and pricing';
  const ICON = '🍽️';

  if (!enabled_features.includes(FEATURE)) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Feature not available</p>
          <p className="text-sm text-slate-500 mt-1">
            {TITLE} is not enabled for this business type.
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
          <li>Create menu categories (starters, mains, drinks)</li>
          <li>Add items with prices and photos</li>
          <li>Mark items as available / sold out</li>
          <li>Build combo meals and specials</li>
        </ul>
      </div>
    </ProtectedRoute>
  );
}