import React, { createContext, useContext } from 'react'

// =============================================================================
//  Investor Access — visibility gating shared by the live Investor view and the
//  exec "Access" view. ONE component tree, two modes:
//    • live   → render a tile/section only if it's checked visible (else hide,
//               or show "Coming soon" where a section's content would be).
//    • access → render everything with a checkbox to toggle each key's visibility.
//  Headings always render in both modes (per spec); only their CONTENT is gated.
// =============================================================================

const Ctx = createContext({ mode: 'live', isVisible: () => false, toggle: () => {} })
export function VisibilityProvider({ mode = 'live', isVisible, toggle, children }) {
  return <Ctx.Provider value={{ mode, isVisible, toggle }}>{children}</Ctx.Provider>
}
export const useVis = () => useContext(Ctx)

const BRAND = '#6639A6'

// The toggle shown in access mode.
function AccessCheck({ id, label }) {
  const { isVisible, toggle } = useVis()
  const on = isVisible(id)
  return (
    <label
      className="inline-flex items-center gap-1.5 cursor-pointer select-none"
      title={label ? `${label} — ${id}` : id}
      onClick={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={on} onChange={() => toggle(id)} style={{ accentColor: BRAND, width: 15, height: 15 }} />
      <span className="text-[9.5px] uppercase tracking-[0.12em] font-bold" style={{ color: on ? '#15803D' : '#9CA3AF' }}>
        {on ? 'Visible' : 'Hidden'}
      </span>
    </label>
  )
}

// Gate a single tile. Live: show iff checked. Access: checkbox strip above the tile.
export function GateTile({ id, label, children }) {
  const { mode, isVisible } = useVis()
  if (mode !== 'access') return isVisible(id) ? <>{children}</> : null
  const on = isVisible(id)
  return (
    <div className={`rounded-xl border p-1.5 ${on ? 'border-emerald-300 bg-emerald-50/20' : 'border-stone-200'}`}>
      <div className="px-1 pb-1.5"><AccessCheck id={id} label={label} /></div>
      <div style={{ opacity: on ? 1 : 0.45 }}>{children}</div>
    </div>
  )
}

// Inline placeholder shown where a section's content would be when it's all hidden.
export function ComingSoonInline({ label = 'Coming soon' }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/40 px-5 py-10 text-center">
      <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-stone-400">{label}</div>
    </div>
  )
}

// Gate a whole section. `header` (the SectionHeader/subheading) ALWAYS renders.
//   single → one checkbox controls the whole section's content.
//   per-tile (default) → pass `keys` (the GateTile ids inside); content shows if
//     any are visible, and each GateTile self-hides the unchecked ones.
// Live: content if any key visible, else <ComingSoonInline/>.
// Access: header (+ a section checkbox when single) then content (always shown).
export function GateSection({ id, keys, single = false, header, children, comingSoonLabel }) {
  const { mode, isVisible } = useVis()
  const gateKeys = single ? [id] : (keys && keys.length ? keys : [id])
  const anyVisible = gateKeys.some(isVisible)

  if (mode === 'access') {
    return (
      <section className="fade-up">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">{header}</div>
          {single && (
            <div className="shrink-0 pt-1 rounded-lg border border-stone-200 px-2 py-1 bg-white">
              <AccessCheck id={id} label="section" />
            </div>
          )}
        </div>
        {children}
      </section>
    )
  }

  return (
    <section className="fade-up">
      {header}
      {anyVisible ? children : <ComingSoonInline label={comingSoonLabel} />}
    </section>
  )
}
