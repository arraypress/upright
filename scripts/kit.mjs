/**
 * The options page's look comes from a shared design kit kept outside this repo
 * (../_chrome-ui), copied here as extension/shared/chrome-ui.css. When the kit is next door, stop if
 * the copy is out of date; in a standalone clone there's nothing to compare against, so say so
 * and carry on.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const kitCheck = new URL('../../_chrome-ui/check.mjs', import.meta.url);

export async function checkKitCopy(copyPath) {
  if (!existsSync(fileURLToPath(kitCheck))) {
    console.log('Design kit not found next to this repo: skipping the chrome-ui.css freshness check.');
    return;
  }
  const { assertKitCopy } = await import(kitCheck.href);
  await assertKitCopy(copyPath);
}
