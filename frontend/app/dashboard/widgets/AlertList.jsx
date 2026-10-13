'use client';
import Link from 'next/link';

const STYLES = {
  amber: {
    wrap: 'bg-amber-50 border-amber-200',
    title: 'text-amber-900',
    badge: 'bg-amber-100 text-amber-800',
  },
  red: {
    wrap: 'bg-red-50 border-red-200',
    title: 'text-red-900',
    badge: 'bg-red-100 text-red-800',
  },
  blue: {
    wrap: 'bg-blue-50 border-blue-200',
    title: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-800',
  },
};

export default function AlertList({
  title,
  icon = '⚠️',
  color = 'amber',
  items,
  emptyText = 'Nothing to review.',
  actionHref,
  actionLabel,
}) {
  const s = STYLES[color] || STYLES.amber;

  return (
    <div className={`border rounded-xl p-5 ${s.wrap}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-bold ${s.title} flex items-center gap-2`}>
          <span>{icon}</span>
          {title}
        </h3>
        {actionHref && (
          <Link
            href={actionHref}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            {actionLabel || 'View all'} →
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <p className={`text-sm ${s.title} opacity-70`}>{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="truncate text-slate-800">{it.label}</span>
              {it.badge && (
                <span
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 ${s.badge} whitespace-nowrap`}
                >
                  {it.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}