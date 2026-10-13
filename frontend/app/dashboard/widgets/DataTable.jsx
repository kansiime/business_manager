'use client';

export default function DataTable({ columns, rows, emptyText = 'Nothing to show.', rowKey = 'id' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-sm text-slate-400 py-8"
                >
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((r, ri) => (
              <tr
                key={r[rowKey] ?? ri}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
              >
                {columns.map((c, ci) => (
                  <td
                    key={ci}
                    className={`px-4 py-3 text-sm text-slate-700 ${
                      c.align === 'right' ? 'text-right' : ''
                    } ${c.className || ''}`}
                  >
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}