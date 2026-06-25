import React, { useState } from 'react'
import { ChevronRight, ChevronDown, Clock } from 'lucide-react'

// =============================================================================
//  ComingSoonBanner — collapses tiles that have no data source yet behind a
//  single expandable banner. On expand the tiles render INTACT (real labels +
//  blocked-state tooltips), not stubs. Shared by the Investor and Executive
//  (Odyssey) weekly views so the two stay identical.
//
//  Caller passes the tile grid as children; the banner only toggles visibility.
// =============================================================================
export default function ComingSoonBanner({ count, note, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="fade-up rounded-2xl border border-dashed border-stone-300 bg-stone-50/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="text-[11px] uppercase tracking-[0.16em] font-semibold text-stone-500">
            Coming Soon{count ? ` · ${count}` : ''}
          </span>
          <span className="text-[12px] text-stone-400 truncate hidden sm:inline">
            — metrics awaiting a data source
          </span>
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5">
          {note && <p className="text-[12px] text-stone-400 mb-3 leading-snug">{note}</p>}
          {children}
        </div>
      )}
    </section>
  )
}
