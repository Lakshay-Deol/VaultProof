"use client";

import { useEffect, useRef } from "react";

import { cx } from "@/lib/utils/format";

/**
 * Nudges its child a few pixels toward the cursor while the cursor is over it.
 *
 * Applied to the two hero calls-to-action only. The pull is capped at `strength`
 * px so the control never leaves its own hit box — a button that runs away from
 * the pointer is a worse button, however good the demo looks.
 *
 * Skipped entirely on coarse pointers (no hover to track) and under reduced
 * motion, in which case this renders as a plain wrapper.
 */
export function Magnetic({
  children,
  strength = 6,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    let target = { x: 0, y: 0 };

    const apply = () => {
      frame = 0;
      node.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      // -1..1 from the centre of the control, then scaled to the cap.
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      target = {
        x: Math.max(-1, Math.min(1, dx)) * strength,
        y: Math.max(-1, Math.min(1, dy)) * strength,
      };
      schedule();
    };

    const onLeave = () => {
      target = { x: 0, y: 0 };
      schedule();
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength]);

  return (
    <span
      ref={ref}
      className={cx("inline-flex transition-transform duration-300 ease-out", className)}
    >
      {children}
    </span>
  );
}
