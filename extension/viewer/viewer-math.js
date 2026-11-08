/**
 * The viewer's sums: zoom steps, fitting the window, and naming a saved copy. Pure.
 *
 * @module viewer/viewer-math
 */
import { isSideways } from '../shared/transform.js';

/** @import { Point, State } from '../shared/transform.js' */

/** Chrome's own page zoom levels. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/**
 * The next of Chrome's zoom levels in `direction` from any zoom, fitted ones included.
 *
 * @param {number} current - The zoom now (1 is actual size).
 * @param {number} direction - +1 to zoom in, −1 to zoom out.
 * @returns {number} The next level; the last one at either end.
 * @example
 * nextZoom(0.4137, 1); // 0.5
 */
export function nextZoom(current, direction) {
  const steps = direction > 0 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  // A small tolerance, so 0.6699 counts as 0.67 and doesn't "step" to itself.
  return steps.find((z) => (direction > 0 ? z > current + 0.005 : z < current - 0.005)) ?? steps[steps.length - 1];
}

/**
 * The size the media takes up once turned, at zoom 1.
 *
 * @param {Readonly<Point>} size - Its own [width, height].
 * @param {Partial<State>} state - The turn.
 * @returns {Point} [width, height], swapped when sideways.
 */
export const turnedSize = ([width, height], state) => (isSideways(state) ? [height, width] : [width, height]);

/**
 * The zoom that fits the turned media in the space available: never above actual size.
 *
 * @param {Readonly<Point>} natural - The media's own [width, height].
 * @param {Partial<State>} state - The turn.
 * @param {Readonly<Point>} available - The room, [width, height].
 * @returns {number} The zoom; 1 if anything is empty.
 */
export function fitZoom(natural, state, [availableWidth, availableHeight]) {
  const [width, height] = turnedSize(natural, state);
  if (!width || !height || availableWidth <= 0 || availableHeight <= 0) return 1;
  return Math.min(1, availableWidth / width, availableHeight / height);
}

/**
 * The media's file name, for the viewer's title and bar.
 *
 * @param {string} src - The media's URL.
 * @returns {string} The last path segment, decoded; '' for data: URLs and anything that isn't a URL.
 * @example
 * mediaName('https://x.com/photos/a%20b.jpg?w=800'); // 'a b.jpg'
 */
export function mediaName(src) {
  try {
    const url = new URL(src);
    return url.protocol === 'data:' ? '' : decodeURIComponent(url.pathname.split('/').pop() ?? '');
  } catch {
    return '';
  }
}

/** @type {Readonly<Record<string, string>>} */
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * File name and type for a rotated copy of `src`: JPEG and WebP stay so, anything else
 * becomes PNG (canvas can't write most other formats).
 *
 * @param {string} src - The media's URL.
 * @returns {{ name: string, type: string }} e.g. { name: 'cat-rotated.webp', type: 'image/webp' }.
 * @example
 * copyFile('https://x.com/photos/IMG_0001.JPEG?w=800'); // { name: 'IMG_0001-rotated.jpg', type: 'image/jpeg' }
 */
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
  } catch {
    // Not a URL: the default name.
  }
  ext = ext.toLowerCase();
  const type = TYPES[ext] ?? 'image/png';
  const out = type === 'image/png' ? 'png' : ext === 'jpeg' ? 'jpg' : ext;
  return { name: `${base}-rotated.${out}`, type };
}
