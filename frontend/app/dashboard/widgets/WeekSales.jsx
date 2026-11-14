'use client';

/** Last 7 days of sales as bars, today highlighted, with the week's total. */
export function SalesTrend({ days = [], money }) {
  const max = Math.max(...days.map((d) => d.total), 0);
  const total = days.reduce((s, d) => s + d.total, 0);
  const label = (iso, i) =>
    i === days.length - 1
      ? 'Today'
      : new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-full">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-sm font-semibold text-slate-900">Sales, last 7 days</p>
        <p className="text-sm text-slate-500">
          Total <span className="font-bold text-slate-900">{money(total)}</span>
        </p>
      </div>
      <div className="flex items-end gap-2 h-40" role="img" aria-label="Daily sales for the last 7 days">
        {days.map((d, i) => {
          const pct = max > 0 ? Math.max((d.total / max) * 100, d.total > 0 ? 4 : 0) : 0;
          const isToday = i === days.length - 1;
          return (
            <div key={d.date} className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 group">
              <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {money(d.total)}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${isToday ? 'bg-blue-600' : 'bg-blue-200 group-hover:bg-blue-300'}`}
                style={{ height: `${pct}%`, minHeight: d.total > 0 ? 3 : 1 }}
                title={`${label(d.date, i)}: ${money(d.total)}`}
              />
              <span className={`text-[11px] ${isToday ? 'font-semibold text-blue-700' : 'text-slate-500'}`}>
                {label(d.date, i)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Top sellers by revenue over the last 7 days. */
export function BestSellers({ items = [], money }) {
  const max = Math.max(...items.map((i) => i.revenue), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 h-full">
      <p className="text-sm font-semibold text-slate-900 mb-4">Best sellers, last 7 days</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No sales in the last 7 days.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800 truncate">
                  {it.name}
                  {it.is_service && <span className="ml-1.5 text-[10px] text-blue-600 font-semibold">SERVICE</span>}
                </span>
                <span className="text-slate-500 shrink-0 tabular-nums">{money(it.revenue)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${max ? (it.revenue / max) * 100 : 0}%` }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{it.qty} sold</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BOOKING_STATUS = {
  booked:    'bg-blue-50 text-blue-700',
  arrived:   'bg-amber-50 text-amber-800',
  completed: 'bg-emerald-50 text-emerald-700',
  no_show:   'bg-red-50 text-red-700',
};

/** Today's bookings, in time order. */
export function TodayBookings({ items = [], money }) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 text-sm text-slate-500">
        No bookings today. <a href="/bookings" className="text-blue-600 hover:underline">Add one →</a>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
      {items.map((b) => (
        <div key={b.id} className="flex items-center gap-4 px-5 py-3">
          <span className="w-12 font-bold tabular-nums text-slate-900">{b.time}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900 truncate">{b.customer_name}</p>
            <p className="text-xs text-slate-500 truncate">
              {b.service || 'No service chosen'}{b.staff ? ` · with ${b.staff}` : ''}
            </p>
          </div>
          <span className="text-sm text-slate-500 tabular-nums">{money(b.price)}</span>
          <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 capitalize ${BOOKING_STATUS[b.status] || 'bg-slate-100 text-slate-600'}`}>
            {b.status.replace('_', '-')}
          </span>
        </div>
      ))}
    </div>
  );
}
