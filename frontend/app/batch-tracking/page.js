'use client';
import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useTenantContext } from '@/lib/useTenantContext';

export default function BatchTrackingPage() {
  const { enabled_features } = useTenantContext();
  const FEATURE = 'batch_tracking';

  if (!enabled_features.includes(FEATURE)) {
    return (
      <ProtectedRoute>
        <div className="card">
          <p className="text-red-600 font-semibold">Feature not available</p>
          <p className="text-sm text-slate-500 mt-1">
            Batch tracking is not enabled for this business type.
          </p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">🧪 Batch Tracking</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track medicines and products by batch number
        </p>
      </div>

      <div className="card">
        <p className="text-slate-500">
          🚧 Batch management is being built. The database is ready — each
          product can carry a `batch_number` field.
        </p>
        <p className="text-sm text-slate-400 mt-3">
          Once built, this page will let you:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-500 mt-2 space-y-1">
          <li>See all batches per product</li>
          <li>Track quantity per batch</li>
          <li>Dispense stock by oldest batch first (FIFO)</li>
          <li>Trace which sale came from which batch</li>
          <li>Recall a batch instantly</li>
        </ul>
      </div>
    </ProtectedRoute>
  );
}