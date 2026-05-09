import { useEffect, useRef } from 'react'

// =============================================================================
//  useGlassInteraction
//
//  Wires up the Liquid Glass interactive illumination layer (doctrine §2.5):
//    - On pointermove: track the cursor and update CSS vars `--glass-pointer-mx`
//      and `--glass-pointer-my` so the radial gradient in the glass background
//      tracks the pointer (the "specular catch" effect).
//    - On pointerdown/up: animate `--glass-press` from 0 → 1 → 0 to brighten
//      the inner glow on press (the doctrine's "illumination from within").
//
//  Doctrine compliance:
//    - Disables itself on prefers-reduced-motion (illumination spread is one
//      of the things explicitly disabled in §9).
//    - Uses passive listeners + RAF throttling to keep cost low. The doctrine
//      says GPU effects need to be cheap; reading pointer events at 60fps is
//      fine, but writing CSS vars at 60fps is not. We coalesce.
//    - Cleans up listeners on unmount.
//
//  Usage:
//    const ref = useGlassInteraction()
//    return <header ref={ref} className="glass-nav">...</header>
// =============================================================================

export function useGlassInteraction({ enabled = true } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    // Respect prefers-reduced-motion — doctrine §9 requires illumination
    // spread animation to be disabled.
    const reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    let pendingMove = null
    let pressRaf = null
    let pressStart = 0
    let pressing = false

    const handleMove = (e) => {
      // Coalesce pointermove updates to one per animation frame.
      if (pendingMove != null) return
      pendingMove = requestAnimationFrame(() => {
        pendingMove = null
        const rect = el.getBoundingClientRect()
        const mx = ((e.clientX - rect.left) / rect.width) * 100
        const my = ((e.clientY - rect.top) / rect.height) * 100
        el.style.setProperty('--glass-pointer-mx', `${mx}%`)
        el.style.setProperty('--glass-pointer-my', `${my}%`)
      })
    }

    const handleLeave = () => {
      // Reset the illumination origin to center when the cursor leaves.
      el.style.setProperty('--glass-pointer-mx', '50%')
      el.style.setProperty('--glass-pointer-my', '50%')
    }

    // Press illumination — animate --glass-press from 0 to 1 with a critically
    // damped spring. The doctrine prefers spring physics to linear interpolation.
    const animatePress = (target) => {
      if (pressRaf != null) cancelAnimationFrame(pressRaf)
      const start = parseFloat(getComputedStyle(el).getPropertyValue('--glass-press')) || 0
      const startTime = performance.now()
      const duration = 180  // ms — gel-like, not bouncy
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / duration)
        // Critically damped: ease-out cubic gives the feel without overshoot
        const eased = 1 - Math.pow(1 - t, 3)
        const value = start + (target - start) * eased
        el.style.setProperty('--glass-press', value.toFixed(3))
        if (t < 1) pressRaf = requestAnimationFrame(tick)
        else pressRaf = null
      }
      pressRaf = requestAnimationFrame(tick)
    }

    const handleDown = () => {
      pressing = true
      pressStart = performance.now()
      animatePress(1)
    }
    const handleUp = () => {
      if (!pressing) return
      pressing = false
      // If the press was very brief (a tap), let the highlight peak before fading.
      const elapsed = performance.now() - pressStart
      const wait = elapsed < 80 ? 80 - elapsed : 0
      setTimeout(() => animatePress(0), wait)
    }

    el.addEventListener('pointermove', handleMove, { passive: true })
    el.addEventListener('pointerleave', handleLeave, { passive: true })
    el.addEventListener('pointerdown', handleDown, { passive: true })
    el.addEventListener('pointerup', handleUp, { passive: true })
    el.addEventListener('pointercancel', handleUp, { passive: true })

    return () => {
      if (pendingMove != null) cancelAnimationFrame(pendingMove)
      if (pressRaf != null) cancelAnimationFrame(pressRaf)
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerleave', handleLeave)
      el.removeEventListener('pointerdown', handleDown)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
    }
  }, [enabled])

  return ref
}
