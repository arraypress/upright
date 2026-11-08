// Test build only (scripts/build-e2e.mjs): the service worker entry, so the e2e test can
// call exactly what a menu click or a shortcut calls.
import { handleCommand, handleMenuClick } from './background/background.js';

globalThis.rotateImageTest = { click: handleMenuClick, command: handleCommand };
