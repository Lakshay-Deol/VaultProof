"use client";

import { useEffect } from "react";

/**
 * One document-level listener that writes the cursor position into whichever
 * `.card-hover` is under it, as --mx/--my. The gradient itself lives in
 * globals.css.
 *
 * Delegated rather than per-card so adding a card anywhere costs nothing, and
 * rAF-throttled so a fast drag across a grid still only writes once a frame.
 */
export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Coarse pointers have no hover, so the glow would only ever flash on tap.
    if (!window.matchMedia("(hover: hover)").matches) return;

    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      pending = null;
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
    };

    const onMove = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const card = target?.closest?.(".card-hover") as HTMLElement | null;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      pending = { card, x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
