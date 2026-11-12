/**
 * Functions run in the page by chrome.scripting.executeScript. Chrome sends each one
 * as source text, so each must be self-contained: no imports, no outside helpers.
 *
 * They run in the extension's isolated world, which the page can't see; the elements
 * found by findMedia wait there (on globalThis) for applyPlacement. Each element's
 * rotation is kept in its data-rotate-image attribute, so later clicks build on it.
 *
 * @module shared/page
 */

/** @import { PageTransforms, Point, State, Styles } from './transform.js' */

/** @typedef {HTMLImageElement | HTMLVideoElement} Media */

/**
 * One element as findMedia measured it: what placement() needs, and its current turn.
 *
 * @typedef {object} Measurement
 * @property {string} kind Its tag name: "img" or "video".
 * @property {string} src What it shows (currentSrc, else src), or "".
 * @property {number} width The layout box's width (offsetWidth).
 * @property {number} height The layout box's height (offsetHeight).
 * @property {Point} origin The computed transform-origin, in px.
 * @property {string} transform The computed `transform`.
 * @property {PageTransforms} page The page's own translate, rotate and scale, from before the first turn.
 * @property {State | null} state How it's turned now; null if it isn't.
 */

/**
 * One element's new look, for applyPlacement.
 *
 * @typedef {object} Update
 * @property {Styles | null} styles Inline values; null puts back what the page had (Reset).
 * @property {State} state The new turn, kept on the element.
 * @property {PageTransforms} page The page's own values, kept for later turns.
 */

/**
 * What the data-rotate-image attribute holds.
 *
 * @typedef {object} Saved
 * @property {number} r The turn.
 * @property {boolean} f The mirror.
 * @property {PageTransforms} page The page's computed values from before the first turn.
 * @property {Record<string, [string, string]>} inline The page's own inline values and priorities, to put back.
 * @property {boolean} hadStyle Whether it had a style attribute before.
 */

/**
 * Where findMedia leaves what it found, for applyPlacement (in the isolated world, so the
 * page can't see it).
 *
 * @typedef {typeof globalThis & { __rotateImageFound?: Media[] | null }} FoundStore
 */

/**
 * Find the right-clicked (or hovered) <img> or <video> and measure it.
 *
 * With `srcUrl` (a menu click), it's the media showing that URL, in open shadow roots too,
 * matched in tiers, stopping at the first that finds any:
 *   1. what the element shows now (currentSrc);
 *   2. any URL it could show: src, srcset, <picture> sources, <video> <source>s, and
 *      lazy-loading attributes (data-src, data-srcset, data-lazy-src…);
 *   3. the same file in another size or format (CDN variants such as
 *      /ace/standard/240/…/id.jpg and /news/1536/…/id.jpg.webp).
 * Tier 1 first, so a <picture> showing photo-wide.png isn't caught by a click on a plain
 * <img src="photo.png"> whose URL is only its fallback.
 * If several match: the one under the pointer, else those on screen.
 *
 * With `srcUrl` null (a keyboard shortcut), it's the media under the pointer, from the
 * browser's own :hover state, since a shortcut has no coordinates: the innermost hovered
 * element if it's media, else (an overlay over a photo, as galleries do) the media that
 * best covers it, nearest in the hovered chain first.
 *
 * Resolves to one measurement per chosen element (see placement() in transform.js).
 *
 * @param {string | null} srcUrl - The menu's srcUrl, or null for what's under the pointer.
 * @returns {Measurement[]} One per chosen element; empty if none.
 */
export function findMedia(srcUrl) {
  const ATTRIBUTE = 'data-rotate-image';
  /**
   * @param {Element} el - Any element.
   * @returns {el is Media} Whether it's an <img> or <video>.
   */
  const isMedia = (el) => el.localName === 'img' || el.localName === 'video';
  /**
   * @param {string | null} url - A URL, or nothing.
   * @returns {url is string} Whether it's a non-empty string.
   */
  const present = (url) => Boolean(url);
  /**
   * @param {string} url - As written in the page.
   * @returns {string | null} Absolute, or null if it doesn't parse.
   */
  const absolute = (url) => {
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return null;
    }
  };
  /**
   * srcset URLs may contain commas (image CDNs), so split as the HTML spec does.
   *
   * @param {string} [srcset] - A srcset attribute.
   * @returns {string[]} Its URLs.
   */
  const srcsetUrls = (srcset = '') => {
    /** @type {string[]} */
    const urls = [];
    let i = 0;
    while (i < srcset.length) {
      while (i < srcset.length && /[\s,]/.test(srcset[i])) i++;
      let j = i;
      while (j < srcset.length && !/\s/.test(srcset[j])) j++;
      let url = srcset.slice(i, j);
      i = j;
      if (url.endsWith(',')) url = url.replace(/,+$/, '');
      else while (i < srcset.length && srcset[i] !== ',') i++;
      if (url) urls.push(url);
    }
    return urls;
  };
  /**
   * Every URL the element could show, besides currentSrc.
   *
   * @param {Media} el - The element.
   * @returns {string[]} Absolute URLs.
   */
  const candidates = (el) => {
    /** @type {(string | null)[]} */
    const urls = [el.getAttribute('src')];
    /** @param {Element} node - The element or one of its <source>s. */
    const lazy = (node) => {
      for (const { name, value } of node.attributes) {
        if (/^data-.*src(set)?$/i.test(name)) urls.push(...srcsetUrls(value));
      }
    };
    lazy(el);
    if (el.localName === 'img') {
      urls.push(...srcsetUrls(el.getAttribute('srcset') ?? ''));
      if (el.parentElement?.localName === 'picture') {
        for (const source of el.parentElement.querySelectorAll(':scope > source')) {
          urls.push(...srcsetUrls(source.getAttribute('srcset') ?? ''));
          lazy(source);
        }
      }
    } else {
      for (const source of el.querySelectorAll(':scope > source')) {
        urls.push(source.getAttribute('src'));
        lazy(source);
      }
    }
    return urls.filter(present).map(absolute).filter(present);
  };
  /**
   * The same file in any size or format: host + file name without image extensions.
   * Short, generic names ("image.jpg") don't count, as they'd match unrelated media.
   *
   * @param {string} url - Absolute.
   * @returns {string | null} "host|name", or null if the name is too generic.
   */
  const variantKey = (url) => {
    try {
      const { host, pathname } = new URL(url);
      const name = (pathname.split('/').pop() ?? '').replace(/(\.(jpe?g|png|webp|avif|gif|jxl|heic|mp4|webm))+$/i, '');
      return name.length >= 8 ? `${host}|${name.toLowerCase()}` : null;
    } catch {
      return null;
    }
  };

  /** @type {Media[] | null} */
  let found = null;
  /**
   * Every image and video in the page, open shadow roots included. Looked for only when it's
   * needed (the whole page is walked): a key pressed over nothing, or over the media itself,
   * never gets this far.
   *
   * @returns {Media[]} The media.
   */
  const allMedia = () => {
    if (found) return found;
    const media = /** @type {Media[]} */ ([]);
    /** @param {Document | ShadowRoot} root - Where to look. */
    const collect = (root) => {
      media.push(...[...root.querySelectorAll('img, video')].filter(isMedia));
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot);
    };
    collect(document);
    found = media;
    return media;
  };

  /** @param {Element} el @returns {boolean} Whether any of it is in the viewport. */
  const onScreen = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth;
  };

  /**
   * The hovered media, or [] (see above).
   *
   * @returns {Media[]} At most one element, except a hovered <picture>'s images.
   */
  const underPointer = () => {
    // :hover inside a shadow root only shows on its host here; follow it in.
    let chain = [...document.querySelectorAll(':hover')];
    let last = chain.at(-1);
    while (last?.shadowRoot) {
      const inner = [...last.shadowRoot.querySelectorAll(':hover')];
      if (!inner.length) break;
      chain = chain.concat(inner);
      last = chain.at(-1);
    }
    const innermost = chain.at(-1);
    if (!innermost) return [];
    if (isMedia(innermost)) return [innermost];
    if (innermost.localName === 'picture') return [...innermost.querySelectorAll(':scope > img')].filter(isMedia);

    /** @param {{ width: number, height: number }} r @returns {number} Its area; 0 if empty. */
    const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
    const target = innermost.getBoundingClientRect();
    /** @param {Element} el @returns {number} How much of the hovered element it covers, in px². */
    const overlap = (el) => {
      const r = el.getBoundingClientRect();
      return area({
        width: Math.min(r.right, target.right) - Math.max(r.left, target.left),
        height: Math.min(r.bottom, target.bottom) - Math.max(r.top, target.top),
      });
    };
    // Tiny media (icons, avatars) never; and the media must cover a good part of what's
    // hovered, so resting on the page background doesn't pick some image on the page.
    const covering = allMedia().filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 32 && r.height >= 32 && overlap(el) >= 0.3 * area(target);
    });
    for (const ancestor of [...chain].reverse()) {
      const inside = covering.filter((el) => ancestor.contains(el) || ancestor.shadowRoot?.contains(el));
      if (inside.length) return [inside.reduce((a, b) => (overlap(b) > overlap(a) ? b : a))];
    }
    return [];
  };

  /** @type {Media[]} */
  let chosen;
  if (srcUrl === null) {
    chosen = underPointer();
  } else {
    const key = variantKey(srcUrl);
    /** @type {((el: Media) => boolean)[]} */
    const tiers = [
      (el) => el.currentSrc === srcUrl,
      (el) => candidates(el).includes(srcUrl),
      (el) => key !== null && [el.currentSrc, ...candidates(el)].some((url) => variantKey(url) === key),
    ];
    /** @type {Media[]} */
    let matches = [];
    for (const tier of tiers) {
      matches = allMedia().filter(tier);
      if (matches.length) break;
    }
    const hovered = matches.filter((el) => el.matches(':hover'));
    const visible = matches.filter(onScreen);
    chosen = hovered.length ? hovered : visible.length ? visible : matches;
  }

  const store = /** @type {FoundStore} */ (globalThis);
  store.__rotateImageFound = chosen;
  return chosen.map((el) => {
    /** @type {Saved | null} */
    let saved = null;
    try {
      saved = JSON.parse(el.getAttribute(ATTRIBUTE) ?? 'null');
    } catch {
      // Not valid JSON (a page wrote it?): treat the element as never turned.
    }
    const style = getComputedStyle(el);
    return {
      kind: el.localName,
      src: el.currentSrc || el.src || '',
      width: el.offsetWidth,
      height: el.offsetHeight,
      origin: /** @type {Point} */ (style.transformOrigin.split(' ').slice(0, 2).map(parseFloat)),
      transform: style.transform,
      // Ours replace these, so remember the page's from before the first turn.
      page: saved?.page ?? { translate: style.translate, rotate: style.rotate, scale: style.scale },
      state: saved ? { r: saved.r, f: saved.f } : null,
    };
  });
}

/**
 * Apply one update per element found by the last findMedia: { styles, state, page }.
 * `styles` null puts back exactly what the page had (Reset).
 *
 * @param {Update[]} updates - In the order findMedia returned the elements.
 * @returns {void}
 */
export function applyPlacement(updates) {
  const ATTRIBUTE = 'data-rotate-image';
  const PROPERTIES = /** @type {const} */ (['translate', 'rotate', 'scale']);
  const store = /** @type {FoundStore} */ (globalThis);
  const found = store.__rotateImageFound ?? [];
  updates.forEach(({ styles, state, page }, index) => {
    const el = found[index];
    if (!el?.isConnected) return;
    /** @type {Saved | null} */
    let saved = null;
    try {
      saved = JSON.parse(el.getAttribute(ATTRIBUTE) ?? 'null');
    } catch {
      // Not valid JSON: as if never turned.
    }

    if (!styles) {
      if (!saved) return;
      for (const name of PROPERTIES) {
        const [value, priority] = saved.inline?.[name] ?? ['', ''];
        if (value) el.style.setProperty(name, value, priority);
        else el.style.removeProperty(name);
      }
      if (!saved.hadStyle && !el.getAttribute('style')) el.removeAttribute('style');
      el.removeAttribute(ATTRIBUTE);
      return;
    }

    // Before the first turn, note the page's own inline values, to put back on Reset.
    const inline = saved?.inline ?? Object.fromEntries(
      PROPERTIES.map((name) => [name, [el.style.getPropertyValue(name), el.style.getPropertyPriority(name)]]),
    );
    const hadStyle = saved ? saved.hadStyle : el.hasAttribute('style');
    // Important, so a stylesheet rule (e.g. a hover effect) can't undo the turn.
    for (const name of PROPERTIES) el.style.setProperty(name, styles[name], 'important');
    el.setAttribute(ATTRIBUTE, JSON.stringify({ r: state.r, f: state.f, page, inline, hadStyle }));
  });
  store.__rotateImageFound = null;
}
