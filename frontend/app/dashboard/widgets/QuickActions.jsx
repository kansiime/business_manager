'use client';
import Link from 'next/link';

export default function QuickActions({ items }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it, i) => (
        <Link
          key={i}
          href={it.href}
          className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <span className="text-xl">{it.icon}</span>
          <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">
            {it.label}
          </span>
        </Link>
      ))}
    </div>
  );
}