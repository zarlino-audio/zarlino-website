import { useEffect, useRef } from 'react';

/**
 * Lightweight 2D canvas particle background.
 *
 * Replaces the former Three.js WebGL cloud (which shipped ~518 KB of JS and a
 * full-screen 60 fps instanced-mesh + proximity-line render loop on every
 * page). This version:
 *   - draws ~70 soft-glowing dots with occasional connection lines,
 *   - caps the render loop at 30 fps and pauses when the tab is hidden,
 *   - honours prefers-reduced-motion (renders a single static frame),
 *   - costs a couple of KB and essentially zero CPU/GPU vs. the old loop.
 */

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

const COUNT = 70;
const LINK_DIST = 130;
const LINE_OPACITY = 0.06;
const FPS = 30;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ParticleCloud = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let raf = 0;
    let running = true;
    let last = performance.now();
    const frame = 1000 / FPS;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const particles: P[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: rand(-0.18, 0.18),
      vy: rand(-0.18, 0.18),
      r: rand(0.8, 2.2),
      a: rand(0.15, 0.55),
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Connections first (under the dots).
      ctx.lineWidth = 1;
      for (let i = 0; i < COUNT; i++) {
        const a = particles[i];
        for (let j = i + 1; j < COUNT; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const t = 1 - Math.sqrt(d2) / LINK_DIST;
            ctx.strokeStyle = `rgba(0,212,255,${(t * LINE_OPACITY).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Dots.
      for (const p of particles) {
        ctx.fillStyle = `rgba(0,212,255,${p.a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        // Soft wraparound with a margin so particles don't pop at the edges.
        if (p.x < -20) p.x = w + 20;
        else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        else if (p.y > h + 20) p.y = -20;
      }
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (now - last < frame) return;
      last = now;
      step();
      draw();
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    if (reduced) {
      draw(); // static frame — zero animation cost
    } else {
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(tick);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

export default ParticleCloud;
