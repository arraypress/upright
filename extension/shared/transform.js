/**
 * Rotation maths. Pure: no DOM, no chrome.*, so it runs in the service worker,
 * the viewer and the unit tests alike.
 *
 * A state is { r, f }: rotate r degrees clockwise (0, 90, 180 or 270) after
 * mirroring left-right if f. Every action, in screen space, folds into that form,
 * so repeated clicks build on each other and flips stay correct after a turn.
 *
 * Matrices are CSS 2D affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f,
 * with y pointing down, so rotate(90deg) turns clockwise on screen.
 */

export const IDENTITY_STATE = Object.freeze({ r: 0, f: false });

export const ACTIONS = ['rotate-right', 'rotate-left', 'rotate-180', 'flip-horizontal', 'flip-vertical', 'reset'];

const mod360 = (deg) => ((deg % 360) + 360) % 360;

/** The state after `action`. Unknown actions leave it alone. */
export function step(state = IDENTITY_STATE, action) {
  const { r, f } = { ...IDENTITY_STATE, ...state };
  switch (action) {
    case 'rotate-right': return { r: mod360(r + 90), f };
    case 'rotate-left': return { r: mod360(r - 90), f };
    case 'rotate-180': return { r: mod360(r + 180), f };
    // Mirror·Rotate(r) = Rotate(−r)·Mirror.
    case 'flip-horizontal': return { r: mod360(-r), f: !f };
    // A vertical flip is a horizontal one turned 180°.
    case 'flip-vertical': return { r: mod360(180 - r), f: !f };
    case 'reset': return { ...IDENTITY_STATE };
    default: return { r, f };
  }
}

export const isIdentity = (state) => !state || (mod360(state.r ?? 0) === 0 && !state.f);

/** Whether the state turns the media on its side (width and height swap). */
export const isSideways = (state) => mod360(state?.r ?? 0) % 180 === 90;

// --- 2D affine matrices ---

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m1·m2: apply m2 first, then m1. */
export function multiply([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export const applyTo = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

export function rotation(deg) {
  // Exact values for quarter turns, so 90° doesn't leave 6e-17 behind.
  const quarter = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[mod360(deg)];
  const [cos, sin] = quarter ?? [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [cos, sin, -sin, cos, 0, 0];
}

export const scaling = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export const translation = (tx, ty) => [1, 0, 0, 1, tx, ty];

// --- Reading computed styles ---

const ANGLE_UNITS = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };

function parseAngle(text) {
  const match = /^(-?[\d.e+-]+)(deg|rad|grad|turn)$/.exec(text);
  return match ? Number(match[1]) * ANGLE_UNITS[match[2]] : null;
}

/** A computed `transform` as a 2D matrix; null for 3D (matrix3d), which isn't composed. */
export function parseMatrix(text) {
  if (!text || text === 'none') return [...IDENTITY];
  const match = /^matrix\(([^)]*)\)$/.exec(text.trim());
  if (!match) return null;
  const values = match[1].split(',').map(Number);
  return values.length === 6 && values.every(Number.isFinite) ? values : null;
}

/** A computed `translate` ("10px", "-50% -50%", "1px 2px 3px") in px; null if it moves along z. */
export function parseTranslate(text, width, height) {
  if (!text || text === 'none') return [0, 0];
  const parts = text.trim().split(/\s+/);
  const px = (part, size) => (part.endsWith('%') ? (parseFloat(part) / 100) * size : parseFloat(part));
  if (parts[2] && parseFloat(parts[2]) !== 0) return null;
  const xy = [px(parts[0], width), parts[1] ? px(parts[1], height) : 0];
  return xy.every(Number.isFinite) ? xy : null;
}

/** A computed `rotate` in degrees; null for a turn about any axis but z. */
export function parseRotate(text) {
  if (!text || text === 'none') return 0;
  const parts = text.trim().split(/\s+/);
  const angle = parseAngle(parts.at(-1));
  if (angle === null) return null;
  const axis = parts.slice(0, -1).join(' ');
  return axis === '' || axis === 'z' || axis === '0 0 1' ? angle : null;
}

/** A computed `scale` as [sx, sy]; null if it scales along z. */
export function parseScale(text) {
  if (!text || text === 'none') return [1, 1];
  const parts = text.trim().split(/\s+/).map((part) => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)));
  if (parts.length > 2 && parts[2] !== 1) return null;
  const xy = [parts[0], parts[1] ?? parts[0]];
  return xy.every(Number.isFinite) ? xy : null;
}

// --- Placement ---

/**
 * How much to shrink a sideways turn so it fits inside the box the page shows.
 * `linear` is the page's own transform; the box it draws is width×height mapped by it.
 */
export function fitScale(state, width, height, linear = IDENTITY) {
  if (!isSideways(state) || !width || !height) return 1;
  const [a, b, c, d] = linear;
  const shownWidth = Math.abs(a) * width + Math.abs(c) * height;
  const shownHeight = Math.abs(b) * width + Math.abs(d) * height;
  if (!shownWidth || !shownHeight) return 1;
  return Math.min(shownWidth / shownHeight, shownHeight / shownWidth);
}

const round = (n, places) => {
  const value = Number(n.toFixed(places));
  return Object.is(value, -0) ? 0 : value;
};

/**
 * The inline `translate`, `rotate` and `scale` that show `state` on top of whatever
 * the page already does, or null to clear them (identity).
 *
 * `box` is what the page measured:
 *   width, height  the layout box (offsetWidth/offsetHeight)
 *   origin         [x, y] the computed transform-origin, in px
 *   transform      the computed `transform` (left alone: CSS applies these
 *                  individual properties on top of it)
 *   page           the page's own computed { translate, rotate, scale }, which ours replace,
 *                  so they're folded in here
 *
 * The turn happens in screen space, about the centre of the box as the page draws it,
 * so the box stays where the page put it and "clockwise" is clockwise even if the page
 * mirrored the image. If the page uses 3D transforms, they aren't composed: the turn is
 * applied about the transform origin on its own.
 */
export function placement(state, box) {
  if (isIdentity(state)) return null;
  const { width = 0, height = 0, origin = [width / 2, height / 2], transform = 'none', page = {} } = box;

  const pageTranslate = parseTranslate(page.translate, width, height);
  const pageRotate = parseRotate(page.rotate);
  const pageScale = parseScale(page.scale);
  const pageMatrix = parseMatrix(transform);
  const composable = pageTranslate && pageRotate !== null && pageScale && pageMatrix;

  const [tx, ty] = composable ? pageTranslate : [0, 0];
  const rp = composable ? pageRotate : 0;
  const [spx, spy] = composable ? pageScale : [1, 1];

  // Everything the page does, about the transform origin: translate · rotate · scale · transform.
  const pageAll = composable
    ? [translation(tx, ty), rotation(rp), scaling(spx, spy), pageMatrix].reduce(multiply)
    : [...IDENTITY];

  const s = fitScale(state, width, height, pageAll);
  const mirror = state.f ? -1 : 1;
  const ours = multiply(rotation(state.r), scaling(mirror * s, s));

  // Where the page draws the box's centre (relative to the origin); keep it there.
  const centre = applyTo(pageAll, [width / 2 - origin[0], height / 2 - origin[1]]);
  const [cx, cy] = applyTo(ours, centre);
  const [ptx, pty] = applyTo(ours, [tx, ty]);

  // CSS draws translate · rotate · scale · transform. Ours·(page translate·rotate·scale)
  // rearranges into that form because a mirror turns a rotation the other way:
  // Mirror·Rotate(θ) = Rotate(−θ)·Mirror.
  return {
    translate: `${round(centre[0] - cx + ptx, 3)}px ${round(centre[1] - cy + pty, 3)}px`,
    rotate: `${round(state.r + mirror * rp, 4)}deg`,
    scale: `${round(mirror * s * spx, 6)} ${round(s * spy, 6)}`,
  };
}

