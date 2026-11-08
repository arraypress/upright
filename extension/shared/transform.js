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
 *
 * @module shared/transform
 */

/**
 * What the menu, shortcuts, single keys and viewer can do to media.
 *
 * @typedef {'rotate-right' | 'rotate-left' | 'rotate-180' | 'flip-horizontal' | 'flip-vertical' | 'reset'} Action
 */

/**
 * How media is turned: mirrored left-right if `f`, then rotated `r` degrees clockwise.
 *
 * @typedef {object} State
 * @property {number} r Degrees clockwise: 0, 90, 180 or 270.
 * @property {boolean} f Mirrored left-right (before the turn).
 */

/**
 * A CSS 2D affine matrix [a, b, c, d, e, f].
 *
 * @typedef {[number, number, number, number, number, number]} Matrix
 */

/** @typedef {[number, number]} Point An [x, y] pair, in px. */

/**
 * The page's own computed individual transforms, as `getComputedStyle` reports them.
 *
 * @typedef {object} PageTransforms
 * @property {string} [translate] e.g. "-50% -50%" or "none".
 * @property {string} [rotate] e.g. "10deg" or "none".
 * @property {string} [scale] e.g. "1.05" or "none".
 */

/**
 * What the page measured about one element (see `placement`).
 *
 * @typedef {object} Box
 * @property {number} [width] The layout box's width (offsetWidth).
 * @property {number} [height] The layout box's height (offsetHeight).
 * @property {Point} [origin] The computed transform-origin, in px. Default the centre.
 * @property {string} [transform] The computed `transform`. Default "none".
 * @property {PageTransforms} [page] The page's own translate, rotate and scale.
 */

/**
 * Inline values for CSS's individual transform properties.
 *
 * @typedef {object} Styles
 * @property {string} translate e.g. "125px 0px".
 * @property {string} rotate e.g. "90deg".
 * @property {string} scale e.g. "0.5 0.5".
 */

/** Upright and unmirrored: what Reset goes back to. */
export const IDENTITY_STATE = /** @type {Readonly<State>} */ (Object.freeze({ r: 0, f: false }));

/** Every action, in the full menu's order. */
export const ACTIONS = /** @type {readonly Action[]} */ (['rotate-right', 'rotate-left', 'rotate-180', 'flip-horizontal', 'flip-vertical', 'reset']);

/**
 * @param {number} deg - Any angle in degrees.
 * @returns {number} The same angle in [0, 360).
 */
const mod360 = (deg) => ((deg % 360) + 360) % 360;

/**
 * The state after `action`, done in screen space on top of `state`.
 * Unknown actions leave it alone.
 *
 * @param {Partial<State> | undefined} state - The current state; missing parts (or all of it) are upright.
 * @param {string} action - An {@link Action}, or anything else to change nothing.
 * @returns {State} A new state.
 * @example
 * step({ r: 90, f: false }, 'flip-horizontal'); // { r: 270, f: true }
 */
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

/**
 * Whether `state` leaves the media as the page shows it.
 *
 * @param {Partial<State> | null | undefined} state - A state, or nothing (upright).
 * @returns {boolean} True for no turn and no mirror.
 */
export const isIdentity = (state) => !state || (mod360(state.r ?? 0) === 0 && !state.f);

/**
 * Whether the state turns the media on its side (width and height swap).
 *
 * @param {Partial<State> | null | undefined} state - A state, or nothing (upright).
 * @returns {boolean} True for 90° and 270°.
 */
export const isSideways = (state) => mod360(state?.r ?? 0) % 180 === 90;

// --- 2D affine matrices ---

/** The matrix that changes nothing. */
const IDENTITY = /** @type {Readonly<Matrix>} */ (Object.freeze([1, 0, 0, 1, 0, 0]));

/**
 * m1·m2: apply m2 first, then m1.
 *
 * @param {Readonly<Matrix>} m1 - Applied second.
 * @param {Readonly<Matrix>} m2 - Applied first.
 * @returns {Matrix} The product.
 */
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

/**
 * Map a point through a matrix.
 *
 * @param {Readonly<Matrix>} matrix - The transform.
 * @param {Readonly<Point>} point - [x, y].
 * @returns {Point} Where it lands.
 */
export const applyTo = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

/**
 * A clockwise rotation (on screen, with y down).
 *
 * @param {number} deg - Degrees clockwise.
 * @returns {Matrix} The rotation matrix; exact for quarter turns.
 */
export function rotation(deg) {
  // Exact values for quarter turns, so 90° doesn't leave 6e-17 behind.
  /** @type {Record<number, Point | undefined>} */
  const QUARTERS = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
  const quarter = QUARTERS[mod360(deg)];
  const [cos, sin] = quarter ?? [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  return [cos, sin, -sin, cos, 0, 0];
}

/**
 * A scale about the origin.
 *
 * @param {number} sx - Horizontal factor.
 * @param {number} [sy] - Vertical factor. Default `sx`.
 * @returns {Matrix} The scaling matrix.
 */
export const scaling = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];

/**
 * A move.
 *
 * @param {number} tx - Across, in px.
 * @param {number} ty - Down, in px.
 * @returns {Matrix} The translation matrix.
 */
export const translation = (tx, ty) => [1, 0, 0, 1, tx, ty];

// --- Reading computed styles ---

/** Degrees per unit, for each CSS angle unit. */
const ANGLE_UNITS = { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 };

/**
 * @param {string} text - A CSS angle, e.g. "0.25turn".
 * @returns {number | null} Degrees, or null if it isn't one.
 */
function parseAngle(text) {
  const match = /^(-?[\d.e+-]+)(deg|rad|grad|turn)$/.exec(text);
  return match ? Number(match[1]) * ANGLE_UNITS[/** @type {keyof typeof ANGLE_UNITS} */ (match[2])] : null;
}

/**
 * A computed `transform` as a 2D matrix; null for 3D (matrix3d), which isn't composed.
 *
 * @param {string | undefined} text - e.g. "matrix(1, 0, 0, 1, 30, 10)" or "none".
 * @returns {Matrix | null} The matrix (identity for none), or null.
 */
export function parseMatrix(text) {
  if (!text || text === 'none') return [...IDENTITY];
  const match = /^matrix\(([^)]*)\)$/.exec(text.trim());
  if (!match) return null;
  const values = match[1].split(',').map(Number);
  return values.length === 6 && values.every(Number.isFinite) ? /** @type {Matrix} */ (values) : null;
}

/**
 * A computed `translate` ("10px", "-50% -50%", "1px 2px 3px") in px; null if it moves along z.
 *
 * @param {string | undefined} text - The computed value.
 * @param {number} width - The box's width, for percentages across.
 * @param {number} height - The box's height, for percentages down.
 * @returns {Point | null} [x, y] in px, or null.
 */
export function parseTranslate(text, width, height) {
  if (!text || text === 'none') return [0, 0];
  const parts = text.trim().split(/\s+/);
  /** @type {(part: string, size: number) => number} */
  const px = (part, size) => (part.endsWith('%') ? (parseFloat(part) / 100) * size : parseFloat(part));
  if (parts[2] && parseFloat(parts[2]) !== 0) return null;
  /** @type {Point} */
  const xy = [px(parts[0], width), parts[1] ? px(parts[1], height) : 0];
  return xy.every(Number.isFinite) ? xy : null;
}

/**
 * A computed `rotate` in degrees; null for a turn about any axis but z.
 *
 * @param {string | undefined} text - e.g. "10deg", "z 45deg" or "none".
 * @returns {number | null} Degrees clockwise, or null.
 */
export function parseRotate(text) {
  if (!text || text === 'none') return 0;
  const parts = text.trim().split(/\s+/);
  const angle = parseAngle(parts.at(-1) ?? '');
  if (angle === null) return null;
  const axis = parts.slice(0, -1).join(' ');
  return axis === '' || axis === 'z' || axis === '0 0 1' ? angle : null;
}

/**
 * A computed `scale` as [sx, sy]; null if it scales along z.
 *
 * @param {string | undefined} text - e.g. "1.05", "2 3", "105%" or "none".
 * @returns {Point | null} The factors, or null.
 */
export function parseScale(text) {
  if (!text || text === 'none') return [1, 1];
  const parts = text.trim().split(/\s+/).map((part) => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)));
  if (parts.length > 2 && parts[2] !== 1) return null;
  /** @type {Point} */
  const xy = [parts[0], parts[1] ?? parts[0]];
  return xy.every(Number.isFinite) ? xy : null;
}

// --- Placement ---

/**
 * How much to shrink a sideways turn so it fits inside the box the page shows.
 * `linear` is the page's own transform; the box it draws is width×height mapped by it.
 *
 * @param {Partial<State>} state - The turn.
 * @param {number} width - The layout box's width.
 * @param {number} height - The layout box's height.
 * @param {Readonly<Matrix>} [linear] - The page's own transform. Default identity.
 * @returns {number} The scale: 1 unless sideways, else min(w/h, h/w) of the drawn box.
 * @example
 * fitScale({ r: 90 }, 200, 100); // 0.5
 */
export function fitScale(state, width, height, linear = IDENTITY) {
  if (!isSideways(state) || !width || !height) return 1;
  const [a, b, c, d] = linear;
  const shownWidth = Math.abs(a) * width + Math.abs(c) * height;
  const shownHeight = Math.abs(b) * width + Math.abs(d) * height;
  if (!shownWidth || !shownHeight) return 1;
  return Math.min(shownWidth / shownHeight, shownHeight / shownWidth);
}

/**
 * @param {number} n - Any number.
 * @param {number} places - Decimal places to keep.
 * @returns {number} `n` rounded, with -0 as 0 (so CSS never sees "-0px").
 */
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
 *
 * @param {State} state - The turn to show.
 * @param {Box} box - What the page measured.
 * @returns {Styles | null} Inline values, or null for upright.
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
  /** @type {Matrix} */
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

