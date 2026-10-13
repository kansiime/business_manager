'use client';
import { useState } from 'react';
import { useTenantContext } from '@/lib/useTenantContext';

export default function AnnouncementBanner() {
  const { announcement } = useTenantContext();
  const [dismissed, setDismissed] = useState(false);

  if (!announcement || dismissed) return null;

  return (
    <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">📢</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-blue-900">Platform Announcement</p>
        <p className="text-sm text-blue-800 mt-1 whitespace-pre-wrap">
          {announcement.message}
        </p>

        {announcement.ends_at && (
          <p className="text-xs text-blue-700 mt-2">
            ℹ️ This notice expires on{' '}
            {new Date(announcement.ends_at).toLocaleString()}
          </p>
        )}

        {(announcement.support_email || announcement.support_phone) && (
          <p className="text-xs text-blue-700 mt-1">
            Support:{' '}
            {announcement.support_email || announcement.support_phone}
          </p>
        )}
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="text-blue-600 hover:text-blue-900 text-lg leading-none flex-shrink-0"
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}