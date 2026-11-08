/**
 * A throwaway HTTP server on 127.0.0.1, for the e2e test and the store screenshots: both
 * serve made-up pages to the e2e build, which has host access to 127.0.0.1 only.
 *
 * @module scripts/local-server
 */
import { createServer } from 'node:http';

/** @import { ServerResponse, Server } from 'node:http' */

/**
 * Serve `respond` on 127.0.0.1 at a free port.
 *
 * @param {(pathname: string, res: ServerResponse) => unknown} respond - Answers each request,
 *   given its path (without the query).
 * @returns {Promise<{ server: Server, origin: string }>} The listening server and its origin
 *   ("http://127.0.0.1:<port>"). Close the server when done.
 * @throws {Error} If the server didn't get a TCP port.
 * @example
 * const { server, origin } = await listenLocally((pathname, res) => res.end(pathname));
 * // … fetch(`${origin}/`) …
 * server.close();
 */
export async function listenLocally(respond) {
  const server = createServer((req, res) => respond(new URL(req.url ?? '/', 'http://x').pathname, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The local server has no TCP port');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}
