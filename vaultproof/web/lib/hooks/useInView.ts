"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fires once, the first time the element crosses into the viewport.
 *
 * Everything that animates on scroll shares this so the whole page uses one
 * threshold and one rootMargin — otherwise a heading and the card beside it
 * trigger at slightly different scroll positions and the stagger looks like a
 * bug. Environments without IntersectionObserver (and SSR-hydrated pages that
 * mount already scrolled past) resolve to `true` immediately rather than
 * leaving content invisible.
 */
export function useInView<T extends HTMLElement = HTMLElement>(options?: {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  rootMargin?: string;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const { threshold = 0.05, rootMargin = "0px 0px -12% 0px" } = options ?? {};

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, inView };
}

/** True when the visitor has asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
