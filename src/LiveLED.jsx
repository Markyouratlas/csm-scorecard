import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// =============================================================================
//  LiveLED — small glass status light for the corner of a metric tile.
//
//  status: 'green'  → metric is wired to live data
//          'yellow' → we have partial data / a manual figure (not fully live)
//          'red'    → no data source yet
//  reason: hover-tooltip text explaining what's needed to make it go green.
//
//  The tooltip is portaled to <body> so it never clips inside a card with
//  overflow:hidden. Honors prefers-reduced-motion (no pulse).
// =============================================================================

const COLORS = {
  green:  { dot: '#16A34A', glow: 'rgba(22,163,74,0.55)', label: 'Live' },
  yellow: { dot: '#D97706', glow: 'rgba(217,119,6,0.55)', label: 'Partial' },
  red:    { dot: '#DC2626', glow: 'rgba(220,38,38,0.50)', label: 'Not live' },
}

export default function LiveLED({ status = 'red', reason, style }) {
  const c = COLORS[status] || COLORS.red
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  const measure = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setCoords({ top: r.bottom + window.scrollY + 8, left: r.left + r.width / 2 + window.scrollX })
  }
  useEffect(() => {
    if (!open) return
    measure()
    const h = () => measure()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
  }, [open])

  return (
    <span
      ref={ref}
      className="live-led-wrap"
      style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <LiveLEDStyles />
      <span
        className={`live-led live-led-${status}`}
        style={{ '--led': c.dot, '--glow': c.glow }}
        aria-label={`${c.label}${reason ? ': ' + reason : ''}`}
      />
      {open && reason && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          className="live-led-tip"
          style={{ position: 'absolute', top: coords.top, left: coords.left }}
        >
          <span className="live-led-tip-head" style={{ color: c.dot }}>
            <span className="live-led-tip-dot" style={{ background: c.dot }} /> {c.label}
          </span>
          <span className="live-led-tip-body">{reason}</span>
        </span>,
        document.body,
      )}
    </span>
  )
}

function LiveLEDStyles() {
  return (
    <style>{`
      .live-led {
        display: block;
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: var(--led);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.7), 0 0 7px 1px var(--glow);
        cursor: help;
      }
      .live-led-green { animation: liveLedPulse 2s ease-in-out infinite; }
      @keyframes liveLedPulse {
        0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.7), 0 0 6px 1px var(--glow); }
        50%      { box-shadow: 0 0 0 2px rgba(255,255,255,0.7), 0 0 11px 3px var(--glow); }
      }
      .live-led-tip {
        transform: translateX(-50%);
        width: 240px;
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.86));
        backdrop-filter: blur(30px) saturate(160%);
        -webkit-backdrop-filter: blur(30px) saturate(160%);
        border: 0.5px solid rgba(255,255,255,0.85);
        border-radius: 12px;
        box-shadow: 0 18px 44px -14px rgba(26,15,46,0.40), 0 4px 12px rgba(26,15,46,0.10);
        padding: 11px 13px;
        z-index: 9999;
        font-family: 'Manrope', sans-serif;
        pointer-events: none;
      }
      .live-led-tip-head {
        display: flex; align-items: center; gap: 6px;
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.12em; margin-bottom: 5px;
      }
      .live-led-tip-dot { width: 7px; height: 7px; border-radius: 999px; display: inline-block; }
      .live-led-tip-body { display: block; font-size: 12.5px; line-height: 1.45; color: #1A0F2E; }
      @media (prefers-reduced-motion: reduce) {
        .live-led-green { animation: none; }
      }
    `}</style>
  )
}
