/**
 * Turning what people type in settings into origins and match patterns. Pure.
 *
 * @module shared/sites
 */

/**
 * The origin of a site someone typed, https unless they said otherwise.
 *
 * @param {unknown} input - What was typed (or stored).
 * @returns {string | null} The origin, or null if it isn't a web site.
 * @example
 * siteOrigin('example.com'); // 'https://example.com'
 * siteOrigin('http://example.com/x'); // 'http://example.com'
 */
export function siteOrigin(input) {
  const text = String(input).trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

/**
 * The host permission pattern for an origin. Match patterns cover every port.
 *
 * @param {string} origin - e.g. "https://example.com".
 * @returns {string} e.g. "https://example.com/*".
 */
export const originPattern = (origin) => `${origin}/*`;

/**
 * The host for the "Never on" list: no scheme, path or leading "www.".
 *
 * @param {unknown} input - What was typed (or stored).
 * @returns {string | null} The host, or null if it isn't a web site.
 * @example
 * neverHost('https://www.YouTube.com/watch'); // 'youtube.com'
 */
export function neverHost(input) {
  const origin = siteOrigin(input);
  return origin ? new URL(origin).hostname.replace(/^www\./, '') : null;
}

/**
 * Patterns excluding a never-on host and its subdomains.
 *
 * @param {string} host - From neverHost.
 * @returns {string[]} Two match patterns.
 */
export const neverPatterns = (host) => [`*://${host}/*`, `*://*.${host}/*`];
