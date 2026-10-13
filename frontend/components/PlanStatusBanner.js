'use client';
import Link from 'next/link';
import { useTenantContext } from '@/lib/useTenantContext';

export default function PlanStatusBanner() {
  const { plan_status, is_super } = useTenantContext();

  if (is_super || !plan_status) return null;

  const { days_remaining, expired, warning, plan, is_blocked, blocked_reason } = plan_status;

  // Blocked by super admin
  if (is_blocked) {
    return (
      <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300">
        <p className="font-semibold text-red-900">🚫 Account Blocked</p>
        <p className="text-sm text-red-800 mt-1">
          {blocked_reason || 'Your account has been blocked. Contact support.'}
        </p>
      </div>
    );
  }

  // Expired
  if (expired) {
    return (
      <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-300">
        <p className="font-semibold text-red-900">⏰ Your plan has expired</p>
        <p className="text-sm text-red-800 mt-1">
          Renew your {plan} plan to continue using the system. Contact support to renew.
        </p>
      </div>
    );
  }

  // Warning (<= 7 days left)
  if (warning) {
    return (
      <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
        <p className="font-semibold text-amber-900">
          ⚠️ Your {plan} plan expires in {days_remaining} day{days_remaining !== 1 && 's'}
        </p>
        <p className="text-sm text-amber-800 mt-1">
          Renew soon to avoid losing access.
        </p>
      </div>
    );
  }

  // Default: quiet notice
  if (days_remaining !== null && plan === 'trial') {
    return (
      <div className="mb-6 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        🎉 You're on a free trial — {days_remaining} day{days_remaining !== 1 && 's'} remaining.
      </div>
    );
  }

  return null;
}