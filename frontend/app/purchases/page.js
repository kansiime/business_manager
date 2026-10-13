'use client';
import { Suspense } from 'react';
import PurchasesInner from './PurchasesInner';

export default function PurchasesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading purchases…</div>}>
      <PurchasesInner />
    </Suspense>
  );
}