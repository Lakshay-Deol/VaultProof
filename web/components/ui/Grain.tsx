/**
 * Page-wide film grain.
 *
 * Fixed rather than absolute so it does not scroll with the content — grain
 * that moves reads as a texture on the page, grain that stays reads as a
 * property of the screen, which is the effect the large accent washes need to
 * stop banding. Non-interactive and hidden from assistive tech.
 */
export function Grain() {
  return (
    <div
      className="grain pointer-events-none fixed inset-0 z-[60] hidden sm:block"
      aria-hidden="true"
    />
  );
}
