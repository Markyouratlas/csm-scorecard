import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'

// =============================================================================
//  RocketScene — cinematic 3D rocket (three.js) for the investor awaiting screen.
//
//  Self-contained: owns its WebGL context, renders on a transparent canvas over
//  the parent's CSS space backdrop. Upward-pointing rocket, downward particle
//  exhaust (white → amber → red), pulsing engine glow + warm light, drifting
//  parallax stars, and subtle liftoff vibration. Full lifecycle cleanup on
//  unmount. Honors prefers-reduced-motion (static frame) and falls back to a
//  static SVG rocket when WebGL is unavailable.
// =============================================================================

const BRAND = 0x6639a6

// Soft round particle/glow sprite (radial alpha falloff) as a canvas texture.
function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export default function RocketScene({ height = 260 }) {
  const mountRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    const getSize = () => ({ w: mount.clientWidth || 600, h: height })
    let { w, h } = getSize()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 0)
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100)
    camera.position.set(0, 0.3, 7)
    camera.lookAt(0, 0, 0)

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0x6a5a99, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8b5cd0, 0.7)
    rim.position.set(-4, 2, -3)
    scene.add(rim)
    const engineLight = new THREE.PointLight(0xff8a3c, 2.2, 9)
    engineLight.position.set(0, -1.6, 0.4)
    scene.add(engineLight)

    // ---- Rocket ----
    const rocket = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3f0fb, metalness: 0.55, roughness: 0.32 })
    const purpleMat = new THREE.MeshStandardMaterial({ color: BRAND, metalness: 0.5, roughness: 0.4 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3147, metalness: 0.7, roughness: 0.5 })

    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 2.0, 36), bodyMat)
    rocket.add(fuselage)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.95, 36), purpleMat)
    nose.position.y = 1.475
    rocket.add(nose)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.16, 36), purpleMat)
    band.position.y = 0.55
    rocket.add(band)
    const portMat = new THREE.MeshStandardMaterial({ color: 0x9be7ff, emissive: 0x4fd2ff, emissiveIntensity: 1.5, metalness: 0.3, roughness: 0.2 })
    const port = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 24), portMat)
    port.position.set(0, 0.18, 0.55)
    port.scale.z = 0.45
    rocket.add(port)
    const finGeo = new THREE.BoxGeometry(0.08, 0.72, 0.5)
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeo, purpleMat)
      const a = (i / 3) * Math.PI * 2
      fin.position.set(Math.cos(a) * 0.56, -0.78, Math.sin(a) * 0.56)
      fin.rotation.y = -a
      rocket.add(fin)
    }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.56, 0.36, 28), darkMat)
    nozzle.position.y = -1.16
    rocket.add(nozzle)
    scene.add(rocket)

    const sprite = makeGlowTexture()

    // ---- Exhaust particles ----
    const COUNT = 420
    const ENGINE_Y = -1.42
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const vel = new Float32Array(COUNT * 3)
    const life = new Float32Array(COUNT)
    const maxLife = new Float32Array(COUNT)
    const spawn = (i) => {
      positions[i * 3] = (Math.random() - 0.5) * 0.16
      positions[i * 3 + 1] = ENGINE_Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.16
      vel[i * 3] = (Math.random() - 0.5) * 0.012
      vel[i * 3 + 1] = -(0.05 + Math.random() * 0.07)
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.012
      maxLife[i] = 0.55 + Math.random() * 0.5
      life[i] = maxLife[i]
    }
    for (let i = 0; i < COUNT; i++) { spawn(i); life[i] = Math.random() * maxLife[i] }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const pMat = new THREE.PointsMaterial({ size: 0.55, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
    scene.add(new THREE.Points(pGeo, pMat))

    const cWhite = new THREE.Color(0xfff6e8)
    const cAmber = new THREE.Color(0xf59e0b)
    const cRed = new THREE.Color(0xdc2626)
    const scratch = new THREE.Color()

    // ---- Engine glow sprite ----
    const glowMat = new THREE.SpriteMaterial({ map: sprite, color: 0xff9a3c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.set(2.4, 2.4, 1)
    glow.position.set(0, -1.7, 0.2)
    scene.add(glow)

    // ---- Parallax stars ----
    const SCOUNT = 600
    const sPos = new Float32Array(SCOUNT * 3)
    for (let i = 0; i < SCOUNT; i++) {
      sPos[i * 3] = (Math.random() - 0.5) * 24
      sPos[i * 3 + 1] = (Math.random() - 0.5) * 22
      sPos[i * 3 + 2] = -2 - Math.random() * 16
    }
    const sGeo = new THREE.BufferGeometry()
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
    const sMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false })
    scene.add(new THREE.Points(sGeo, sMat))

    let t = 0
    const simulate = (dt) => {
      t += dt
      // rocket vibration + bob + tiny roll
      rocket.position.x = Math.sin(t * 40) * 0.012
      rocket.position.y = 0.05 + Math.sin(t * 1.4) * 0.06
      rocket.rotation.z = Math.sin(t * 0.8) * 0.02
      // exhaust
      for (let i = 0; i < COUNT; i++) {
        life[i] -= dt
        if (life[i] <= 0) spawn(i)
        positions[i * 3] += vel[i * 3]
        positions[i * 3 + 1] += vel[i * 3 + 1]
        positions[i * 3 + 2] += vel[i * 3 + 2]
        const f = 1 - life[i] / maxLife[i] // 0 fresh → 1 old
        if (f < 0.5) scratch.copy(cWhite).lerp(cAmber, f / 0.5)
        else scratch.copy(cAmber).lerp(cRed, (f - 0.5) / 0.5)
        const fade = 1 - f
        colors[i * 3] = scratch.r * fade
        colors[i * 3 + 1] = scratch.g * fade
        colors[i * 3 + 2] = scratch.b * fade
      }
      pGeo.attributes.position.needsUpdate = true
      pGeo.attributes.color.needsUpdate = true
      // glow + light flicker
      const pulse = 2.3 + Math.sin(t * 18) * 0.22 + Math.random() * 0.12
      glow.scale.set(pulse, pulse, 1)
      glowMat.opacity = 0.72 + Math.sin(t * 16) * 0.16
      engineLight.intensity = 2.0 + Math.sin(t * 22) * 0.5 + Math.random() * 0.3
      // stars drift down → sense of climbing
      const sp = sGeo.attributes.position.array
      for (let i = 0; i < SCOUNT; i++) {
        sp[i * 3 + 1] -= 0.045
        if (sp[i * 3 + 1] < -11) sp[i * 3 + 1] = 11
      }
      sGeo.attributes.position.needsUpdate = true
      // camera sway
      camera.position.x = Math.sin(t * 0.4) * 0.15
      camera.lookAt(0, 0, 0)
    }

    let raf
    const loop = () => { simulate(0.016); renderer.render(scene, camera); raf = requestAnimationFrame(loop) }

    if (reduceMotion) {
      for (let i = 0; i < 40; i++) simulate(0.016) // warm up a steady plume
      renderer.render(scene, camera)
    } else {
      raf = requestAnimationFrame(loop)
    }

    const onResize = () => {
      const s = getSize(); w = s.w; h = s.h
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      if (reduceMotion) renderer.render(scene, camera)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
        mats.forEach((m) => { if (m.map) m.map.dispose?.(); m.dispose?.() })
      })
      sprite.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }, [height])

  if (failed) return <RocketFallback height={height} />
  return <div ref={mountRef} style={{ width: '100%', height }} aria-hidden="true" />
}

// Static upright SVG rocket — shown when WebGL is unavailable.
function RocketFallback({ height }) {
  return (
    <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }} aria-hidden="true">
      <div style={{ position: 'absolute', bottom: '18%', width: 160, height: 160, borderRadius: '999px', background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(102,57,166,0.18) 45%, transparent 70%)' }} />
      <svg width="96" height="150" viewBox="0 0 96 150" style={{ position: 'relative', filter: 'drop-shadow(0 0 14px rgba(139,92,208,0.7))' }}>
        <path d="M48 4 C66 26 70 52 70 80 H26 C26 52 30 26 48 4 Z" fill="#f3f0fb" />
        <path d="M48 4 C58 18 64 36 67 58 H29 C32 36 38 18 48 4 Z" fill="#6639A6" opacity="0.92" />
        <circle cx="48" cy="58" r="10" fill="#9be7ff" stroke="#4fd2ff" strokeWidth="2" />
        <path d="M26 80 L10 104 L26 100 Z" fill="#6639A6" />
        <path d="M70 80 L86 104 L70 100 Z" fill="#6639A6" />
        <rect x="36" y="80" width="24" height="14" rx="3" fill="#3a3147" />
        <path d="M40 94 C40 116 48 132 48 132 C48 132 56 116 56 94 Z" fill="url(#flame)" />
        <defs>
          <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6e8" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
