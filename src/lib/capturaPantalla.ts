/**
 * Whether the periodic screenshot can skip this element: it lies completely outside
 * the visible area. html2canvas clones and copies the styles of every node it keeps,
 * so skipping off-screen subtrees (e.g. table rows below the fold) is what makes a
 * capture take well under a second instead of several seconds on large pages.
 * Elements without size are kept: they can hold visible, positioned children.
 */
export function fueraDeLaVista(el: Element, ancho: number, alto: number): boolean {
  if (el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT') return true;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return r.bottom < 0 || r.top > alto || r.right < 0 || r.left > ancho;
}
