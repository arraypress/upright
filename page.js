/**
 * Functions run in the page by chrome.scripting.executeScript. Chrome sends each one
 * as source text, so each must be self-contained: no imports, no outside helpers.
 *
 * They run in the extension's isolated world, which the page can't see; the elements
 * found by findMedia wait there (on globalThis) for applyPlacement. Each element's
 * rotation is kept in its data-rotate-image attribute, so later clicks build on it.
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
 */
export function findMedia(srcUrl) {
  const ATTRIBUTE = 'data-rotate-image';
  const absolute = (url) => {
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return null;
    }
  };
  // srcset URLs may contain commas (image CDNs), so split as the HTML spec does.
  const srcsetUrls = (srcset = '') => {
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
  /** Every URL the element could show, besides currentSrc. */
  const candidates = (el) => {
    const urls = [el.getAttribute('src')];
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
    return urls.filter(Boolean).map(absolute).filter(Boolean);
  };
  /**
   * The same file in any size or format: host + file name without image extensions.
   * Short, generic names ("image.jpg") don't count, as they'd match unrelated media.
   */
  const variantKey = (url) => {
    try {
      const { host, pathname } = new URL(url);
      const name = pathname.split('/').pop().replace(/(\.(jpe?g|png|webp|avif|gif|jxl|heic|mp4|webm))+$/i, '');
      return name.length >= 8 ? `${host}|${name.toLowerCase()}` : null;
    } catch {
      return null;
    }
  };

  const media = [];
  const collect = (root) => {
    media.push(...root.querySelectorAll('img, video'));
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot);
  };
  collect(document);

  const onScreen = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth;
  };

  /** The hovered media, or [] (see above). */
  const underPointer = () => {
    // :hover inside a shadow root only shows on its host here; follow it in.
    let chain = [...document.querySelectorAll(':hover')];
    while (chain.at(-1)?.shadowRoot) {
      const inner = [...chain.at(-1).shadowRoot.querySelectorAll(':hover')];
      if (!inner.length) break;
      chain = chain.concat(inner);
    }
    const innermost = chain.at(-1);
    if (!innermost) return [];
    if (['img', 'video'].includes(innermost.localName)) return [innermost];
    if (innermost.localName === 'picture') return [...innermost.querySelectorAll(':scope > img')];

    const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
    const target = innermost.getBoundingClientRect();
    const overlap = (el) => {
      const r = el.getBoundingClientRect();
      return area({
        width: Math.min(r.right, target.right) - Math.max(r.left, target.left),
        height: Math.min(r.bottom, target.bottom) - Math.max(r.top, target.top),
      });
    };
    // Tiny media (icons, avatars) never; and the media must cover a good part of what's
    // hovered, so resting on the page background doesn't pick some image on the page.
    const covering = media.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 32 && r.height >= 32 && overlap(el) >= 0.3 * area(target);
    });
    for (const ancestor of [...chain].reverse()) {
      const inside = covering.filter((el) => ancestor.contains(el) || ancestor.shadowRoot?.contains(el));
      if (inside.length) return [inside.reduce((a, b) => (overlap(b) > overlap(a) ? b : a))];
    }
    return [];
  };

  let chosen;
  if (srcUrl === null) {
    chosen = underPointer();
  } else {
    const key = variantKey(srcUrl);
    const tiers = [
      (el) => el.currentSrc === srcUrl,
      (el) => candidates(el).includes(srcUrl),
      (el) => key !== null && [el.currentSrc, ...candidates(el)].some((url) => variantKey(url) === key),
    ];
    let matches = [];
    for (const tier of tiers) {
      matches = media.filter(tier);
      if (matches.length) break;
    }
    const hovered = matches.filter((el) => el.matches(':hover'));
    const visible = matches.filter(onScreen);
    chosen = hovered.length ? hovered : visible.length ? visible : matches;
  }

  globalThis.__rotateImageFound = chosen;
  return chosen.map((el) => {
    let saved = null;
    try {
      saved = JSON.parse(el.getAttribute(ATTRIBUTE));
    } catch {}
    const style = getComputedStyle(el);
    return {
      kind: el.localName,
      src: el.currentSrc || el.src || '',
      width: el.offsetWidth,
      height: el.offsetHeight,
      origin: style.transformOrigin.split(' ').slice(0, 2).map(parseFloat),
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
 */
export function applyPlacement(updates) {
  const ATTRIBUTE = 'data-rotate-image';
  const PROPERTIES = ['translate', 'rotate', 'scale'];
  const found = globalThis.__rotateImageFound ?? [];
  updates.forEach(({ styles, state, page }, index) => {
    const el = found[index];
    if (!el?.isConnected) return;
    let saved = null;
    try {
      saved = JSON.parse(el.getAttribute(ATTRIBUTE));
    } catch {}

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
  globalThis.__rotateImageFound = null;
}
