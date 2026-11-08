/** The viewer's sums: zoom steps, fitting the window, and naming a saved copy. Pure. */
import { isSideways } from '../shared/transform.js';

/** Chrome's own page zoom levels. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** The next step in `direction` (+1 or −1) from any zoom, fitted ones included. */
export function nextZoom(current, direction) {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  // A small tolerance, so 0.6699 counts as 0.67 and doesn't "step" to itself.
  return steps.find((z) => (direction > 0 ? z > current + 0.005 : z < current - 0.005)) ?? steps.at(-1);
}

/** The size the media takes up once turned, at zoom 1. */
export const turnedSize = ([width, height], state) => (isSideways(state) ? [height, width] : [width, height]);

/** The zoom that fits the turned media in `available` [width, height]: never above actual size. */
export function fitZoom(natural, state, [availableWidth, availableHeight]) {
  const [width, height] = turnedSize(natural, state);
  if (!width || !height || availableWidth <= 0 || availableHeight <= 0) return 1;
  return Math.min(1, availableWidth / width, availableHeight / height);
}

const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** File name and type for a rotated copy of `src`: JPEG and WebP stay so, anything else becomes PNG. */
export function copyFile(src) {
  let base = 'image';
  let ext = '';
  try {
    const url = new URL(src);
    if (url.protocol === 'data:') {
      ext = /^image\/(\w+)/.exec(url.pathname)?.[1] ?? '';
    } else {
      const last = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const match = /^(.+?)(?:\.(\w+))?$/.exec(last);
      if (match) [, base, ext = ''] = match;
    }
  } catch {}
  ext = ext.toLowerCase();
  const type = TYPES[ext] ?? 'image/png';
  const out = type === 'image/png' ? 'png' : ext === 'jpeg' ? 'jpg' : ext;
  return { name: `${base}-rotated.${out}`, type };
}
