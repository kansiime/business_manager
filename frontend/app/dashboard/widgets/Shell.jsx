'use client';
import Link from 'next/link';

export function DashboardShell({ title, subtitle, actions, children }) {
  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>
          )}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {actions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={`btn ${a.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

export function Section({ label, action, children, className = '' }) {
  return (
    <div className={`mb-8 ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">
            {label}
          </p>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Card({ children, className = '', pad = true }) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-sm ${
        pad ? 'p-5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {action}
    </div>
  );
}