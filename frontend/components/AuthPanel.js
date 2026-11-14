/**
 * The dark branded half of the sign-in and sign-up pages (desktop only).
 *
 *   <AuthPanel icon="⚡" name="Business Manager" eyebrow="…" title={<>…</>}
 *              perks={[['🎁', '14 days free'], …]}>
 *     …preview…
 *   </AuthPanel>
 */
export default function AuthPanel({ icon = '⚡', name = 'Business Manager', eyebrow, title, perks = [], children }) {
  return (
    <aside
      className="hidden lg:flex lg:w-[46%] relative overflow-hidden text-white flex-col justify-between p-10 xl:p-14"
      style={{
        background:
          'radial-gradient(1200px 600px at -10% -10%, #3b82f6 0%, transparent 55%),' +
          'radial-gradient(900px 500px at 110% 110%, #0ea5e9 0%, transparent 50%),' +
          '#0b1f4d',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center text-xl">
          {icon}
        </div>
        <span className="text-lg font-bold tracking-tight">{name}</span>
      </div>

      <div className="relative">
        {eyebrow && <p className="text-sm uppercase tracking-[0.2em] text-blue-200 mb-3">{eyebrow}</p>}
        <h1 className="text-4xl xl:text-[2.6rem] font-bold leading-tight mb-8">{title}</h1>
        {children}
      </div>

      <ul className="relative grid grid-cols-3 gap-3 text-xs text-blue-100">
        {perks.map(([emoji, label]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="text-base">{emoji}</span>
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Small logo row shown above the form on phones, where the panel is hidden. */
export function AuthMobileBrand({ icon = '⚡', name = 'Business Manager' }) {
  return (
    <div className="lg:hidden flex items-center gap-2 mb-6">
      <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">{icon}</div>
      <span className="font-bold">{name}</span>
    </div>
  );
}
