/** Turning what people type in settings into origins and match patterns. Pure. */

/** "example.com", "http://example.com/x" → "https://example.com" / "http://example.com"; null if not a site. */
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

/** The host permission pattern for an origin. Match patterns cover every port. */
export const originPattern = (origin) => `${origin}/*`;

/** "https://www.YouTube.com/watch" → "youtube.com"; null if not a site. */
export function neverHost(input) {
  const origin = siteOrigin(input);
  return origin ? new URL(origin).hostname.replace(/^www\./, '') : null;
}

/** Patterns excluding a never-on host and its subdomains. */
export const neverPatterns = (host) => [`*://${host}/*`, `*://*.${host}/*`];
