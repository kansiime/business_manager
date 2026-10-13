'use client';

const ACCENTS = {
  blue:   { bar: 'bg-blue-500',   text: 'text-blue-700' },
  green:  { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  amber:  { bar: 'bg-amber-500',  text: 'text-amber-700' },
  red:    { bar: 'bg-red-500',    text: 'text-red-700' },
  purple: { bar: 'bg-violet-500', text: 'text-violet-700' },
  slate:  { bar: 'bg-slate-400',  text: 'text-slate-700' },
};

export default function HeroKpi({
  label,
  value,
  hint,
  trend,
  accent = 'blue',
  action,
}) {
  const a = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className={`h-1 ${a.bar}`} />
      <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">
            {label}
          </p>
          <p className="text-4xl font-bold text-slate-900 mt-2 leading-none">
            {value}
          </p>
          {hint && (
            <p className="text-sm text-slate-500 mt-2">{hint}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {trend != null && (
            <span
              className={`text-sm font-semibold ${
                trend >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
            </span>
          )}
          {action && action}
        </div>
      </div>
    </div>
  );
}