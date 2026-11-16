/** True when the player asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Scrolls an element into view: smoothly, or immediately when reduced motion
 * is preferred. Used to bring a revealed answer back on screen.
 */
export function scrollToElement(
  element: Element | null,
  block: ScrollLogicalPosition = 'start',
): void {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return;
  }

  element.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block,
  });
}
