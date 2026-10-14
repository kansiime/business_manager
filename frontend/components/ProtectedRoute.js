'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import AnnouncementBanner from './AnnouncementBanner';
import PlanStatusBanner from './PlanStatusBanner';
import { useTenantContext } from '@/lib/useTenantContext';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { pages, ready, is_super } = useTenantContext();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) router.push('/login');
    else setAuthed(true);
  }, [router]);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const segments = pathname.split('/').filter(Boolean);
  const currentKey = segments[0] || 'dashboard';
  const universal = ['settings', 'dashboard', 'consultations', 'businesses', 'subscription'];
  const allowed =
    !ready || is_super || pages.includes(currentKey) || universal.includes(currentKey);

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />

      {/* Content — pushes right on desktop, has top padding on mobile for the fixed top bar */}
      <div className="flex-1 min-w-0 pt-14 lg:pt-0 lg:ml-64">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <AnnouncementBanner />
          <PlanStatusBanner />

          {!allowed && ready ? (
            <div className="card">
              <p className="text-red-600 font-semibold">Access denied</p>
              <p className="text-sm text-slate-500 mt-1">
                Your role doesn't have access to this page.
              </p>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}