'use client';

const ACCENTS = {
  blue:   'text-blue-700',
  green:  'text-emerald-700',
  amber:  'text-amber-700',
  red:    'text-red-700',
  purple: 'text-violet-700',
  slate:  'text-slate-700',
};

export default function KpiRow({ items, columns = 4 }) {
  const grid =
    columns === 2 ? 'grid-cols-2'
    : columns === 3 ? 'grid-cols-2 md:grid-cols-3'
    : 'grid-cols-2 md:grid-cols-4';

  return (
    <div className={`grid ${grid} gap-4`}>
      {items.map((it, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-xl shadow-sm p-4"
        >
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {it.label}
          </p>
          <p
            className={`text-2xl font-bold mt-2 leading-none ${
              ACCENTS[it.accent] || 'text-slate-900'
            }`}
          >
            {it.value}
          </p>
          {it.hint && (
            <p className="text-xs text-slate-500 mt-2">{it.hint}</p>
          )}
        </div>
      ))}
    </div>
  );
}