// Lightweight confetti: spawns a burst of colored particles from a screen point
// and animates them with gravity. No dependencies — uses a transient canvas overlay.

export function fireConfetti({ x, y, count = 80, colors } = {}) {
  if (typeof window === 'undefined') return
  const palette = colors || ['#F59E0B', '#0F766E', '#7C3AED', '#C2410C', '#0369A1', '#BE185D']
  const cx = x ?? window.innerWidth / 2
  const cy = y ?? window.innerHeight / 3

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const particles = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 6
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 4 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
      rotation: Math.random() * Math.PI,
      vrotation: (Math.random() - 0.5) * 0.3,
      life: 0,
      maxLife: 90 + Math.random() * 30,
    })
  }

  let frame = 0
  const animate = () => {
    frame++
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const p of particles) {
      if (p.life >= p.maxLife) continue
      alive = true
      p.life++
      p.vy += 0.18 // gravity
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.vrotation
      const alpha = 1 - p.life / p.maxLife
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (alive) {
      requestAnimationFrame(animate)
    } else {
      canvas.remove()
    }
  }
  requestAnimationFrame(animate)
}
