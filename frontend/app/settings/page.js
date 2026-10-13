'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useUser } from '@/lib/useUser';
import BusinessSettingsPage from './BusinessSettingsPage';
import PlatformSettingsPage from './PlatformSettingsPage';

export default function SettingsRouter() {
  const user = useUser();

  if (!user) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-slate-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  return user.role === 'super' ? <PlatformSettingsPage /> : <BusinessSettingsPage />;
}