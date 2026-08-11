"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/lib/utils/format";

/**
 * The swarm-of-spheres motif from flare.network, rebuilt on a canvas.
 *
 * Points sit on a thin spherical shell, the shell turns slowly, and the
 * projection is perspective — so the near face is larger, brighter and
 * faster-moving than the far one, which is what makes a flat scatter of dots
 * read as a solid volume.
 *
 * It is decorative and expensive relative to everything else on the page, so it
 * gives up quickly: one static frame under reduced motion, no frames at all
 * while it is scrolled out of view or the tab is hidden, and a device-pixel
 * ratio capped at 2 (beyond that nobody can see the difference and a 3x phone
 * pays 2.25x the fill cost).
 */

/* Colours are literal because a canvas cannot read Tailwind tokens; they are
   the same three values as `flare.DEFAULT`, `flare.ember` and `ink.DEFAULT`. */
const PALETTE: Array<[number, number, number]> = [
  [230, 32, 88],
  [255, 122, 69],
  [242, 242, 244],
];

/* Weighted so the swarm is mostly pink with white highlights, matching the
   brand's ratio rather than an even three-way split. */
const WEIGHTS = [0.62, 0.14, 0.24];

const COUNT = 440;
/** Camera distance in unit-sphere radii. Lower is a wider, more dramatic lens. */
const FOV = 2.6;

interface Point {
  x: number;
  y: number;
  z: number;
  /** Shell jitter, so the surface has thickness instead of being a wireframe. */
  r: number;
  color: [number, number, number];
  size: number;
}

function buildPoints(): Point[] {
  const points: Point[] = [];
  // Fibonacci sphere: even coverage without the pole crowding you get from
  // sampling latitude and longitude independently.
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < COUNT; i += 1) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    // Deterministic pseudo-random from the index: same swarm every render, so
    // a hot reload or a re-mount does not reshuffle the composition.
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const pick = Math.abs(noise);

    let color = PALETTE[0]!;
    if (pick > WEIGHTS[0]! + WEIGHTS[1]!) color = PALETTE[2]!;
    else if (pick > WEIGHTS[0]!) color = PALETTE[1]!;

    points.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      r: 0.78 + Math.abs((noise * 7) % 1) * 0.28,
      color,
      size: 0.9 + Math.abs((noise * 13) % 1) * 1.9,
    });
  }

  return points;
}

export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const points = buildPoints();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    /* Pointer parallax, eased toward the target so the swarm drifts after the
       cursor rather than snapping to it. */
    let px = 0;
    let py = 0;
    let targetX = 0;
    let targetY = 0;
    let angle = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) return;

      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.42;

      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      // Tilt is fixed plus a little pointer lean; a full free-look reads as a
      // toy, a slight lean reads as depth.
      const tilt = -0.28 + py * 0.18;
      const sinT = Math.sin(tilt);
      const cosT = Math.cos(tilt);

      for (const p of points) {
        const x0 = p.x * p.r;
        const y0 = p.y * p.r;
        const z0 = p.z * p.r;

        // Yaw, then pitch.
        const x1 = x0 * cosA - z0 * sinA;
        const z1 = x0 * sinA + z0 * cosA;
        const y2 = y0 * cosT - z1 * sinT;
        const z2 = y0 * sinT + z1 * cosT;

        const depth = FOV / (FOV + z2);
        const sx = cx + (x1 + px * 0.12) * scale * depth;
        const sy = cy + y2 * scale * depth;

        // depth runs ~0.72 (far) to ~1.6 (near); remap to a usable alpha ramp.
        const t = Math.max(0, Math.min(1, (depth - 0.7) / 0.9));
        const alpha = 0.06 + t * t * 0.72;
        const radius = Math.max(0.3, p.size * depth * 0.85);

        const [r, g, b] = p.color;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      /* Not depth-sorted on purpose: at this dot size the overdraw error is
         invisible, and a 440-item sort every frame is not. */
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;

      if (!visible || document.hidden) return;

      angle += dt * 0.00009;
      px += (targetX - px) * 0.05;
      py += (targetY - py) * 0.05;
      draw();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };

    resize();

    if (reduced) {
      draw();
      return;
    }

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              visible = entries.some((entry) => entry.isIntersecting);
            },
            { rootMargin: "120px" },
          );
    observer?.observe(canvas);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            resize();
            draw();
          });
    resizeObserver?.observe(parent);

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cx("pointer-events-none h-full w-full", className)}
      aria-hidden="true"
    />
  );
}
