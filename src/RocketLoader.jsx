import React from 'react'
import { Rocket } from 'lucide-react'

const BRAND = '#6639A6'

// =============================================================================
//  RocketLoader — branded Atlas cold-load loader
//
//  Shown only on a TRUE cold load (no cached data yet). React Query keeps
//  background refetches silent, so once a view has cached data this never
//  re-appears on revisit — only on first paint / hard refresh.
//
//  Props:
//    label     — caption under the rocket (default 'Preparing your data…')
//    className — wrapper sizing; defaults to a tall content area. Pass
//                'min-h-screen' for a full-page cold load.
//  Honors prefers-reduced-motion (falls back to a gentle static fade).
// =============================================================================
export default function RocketLoader({ label = 'Preparing your data…', className = 'min-h-[60vh]' }) {
  return (
    <div className={`w-full flex flex-col items-center justify-center ${className}`}>
      <RocketLoaderStyles />
      <div className="rocket-loader-stage" aria-hidden="true">
        <div className="rocket-loader-orbit" />
        <div className="rocket-loader-glow" />
        <div className="rocket-loader-craft">
          <Rocket className="rocket-loader-icon" strokeWidth={1.6} />
          <span className="rocket-loader-trail" />
        </div>
      </div>
      <div className="rocket-loader-label">{label}</div>
      <div className="rocket-loader-dots" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  )
}

function RocketLoaderStyles() {
  return (
    <style>{`
      .rocket-loader-stage {
        position: relative;
        width: 96px;
        height: 96px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .rocket-loader-orbit {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        border: 1.5px dashed ${BRAND}33;
        animation: rocketOrbitSpin 5.5s linear infinite;
      }
      .rocket-loader-glow {
        position: absolute;
        width: 70px;
        height: 70px;
        border-radius: 999px;
        background: radial-gradient(circle, ${BRAND}33 0%, ${BRAND}00 70%);
        animation: rocketGlowPulse 2.2s ease-in-out infinite;
      }
      .rocket-loader-craft {
        position: relative;
        animation: rocketBob 2.2s ease-in-out infinite;
        will-change: transform;
      }
      .rocket-loader-icon {
        width: 34px;
        height: 34px;
        color: ${BRAND};
        display: block;
      }
      .rocket-loader-trail {
        position: absolute;
        left: 4px;
        bottom: 0px;
        width: 6px;
        height: 14px;
        border-radius: 0 0 6px 6px;
        background: linear-gradient(to bottom, ${BRAND} 0%, #F59E0B 55%, transparent 100%);
        transform-origin: top center;
        animation: rocketFlame 0.5s ease-in-out infinite;
        filter: blur(0.4px);
      }
      .rocket-loader-label {
        font-family: 'Manrope', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #57534e;
        margin-top: 22px;
        letter-spacing: 0.01em;
      }
      .rocket-loader-dots {
        display: flex;
        gap: 5px;
        margin-top: 10px;
      }
      .rocket-loader-dots span {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: ${BRAND};
        opacity: 0.3;
        animation: rocketDot 1.2s ease-in-out infinite;
      }
      .rocket-loader-dots span:nth-child(2) { animation-delay: 0.18s; }
      .rocket-loader-dots span:nth-child(3) { animation-delay: 0.36s; }

      @keyframes rocketBob {
        0%, 100% { transform: translateY(3px) rotate(0deg); }
        50%      { transform: translateY(-5px) rotate(-3deg); }
      }
      @keyframes rocketFlame {
        0%, 100% { transform: scaleY(0.7); opacity: 0.75; }
        50%      { transform: scaleY(1.15); opacity: 1; }
      }
      @keyframes rocketGlowPulse {
        0%, 100% { transform: scale(0.85); opacity: 0.55; }
        50%      { transform: scale(1.1); opacity: 0.9; }
      }
      @keyframes rocketOrbitSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes rocketDot {
        0%, 100% { opacity: 0.25; transform: translateY(0); }
        50%      { opacity: 1; transform: translateY(-2px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .rocket-loader-orbit,
        .rocket-loader-glow,
        .rocket-loader-craft,
        .rocket-loader-trail,
        .rocket-loader-dots span {
          animation: rocketReducedFade 1.8s ease-in-out infinite;
        }
        .rocket-loader-craft { transform: none; }
        @keyframes rocketReducedFade {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      }
    `}</style>
  )
}
