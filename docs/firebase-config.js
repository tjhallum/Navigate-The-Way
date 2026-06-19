/*
 * Berean Board virtual buzzers Firebase config.
 *
 * Firebase web config identifies the Firebase project; it is not a service
 * account secret. Authorization is enforced by Anonymous Auth, Realtime
 * Database Security Rules, App Check, and narrow client writes.
 *
 * Developer setup:
 * 1. Create/choose the Berean Board Firebase project.
 * 2. Enable Anonymous Authentication and Realtime Database.
 * 3. Paste the web app config below before deploying Virtual buzzers.
 * 4. Optional but recommended: set the App Check provider and site key.
 *
 * NEVER commit Firebase service account private keys to this static frontend.
 */
window.BEREAN_BOARD_FIREBASE_CONFIG = window.BEREAN_BOARD_FIREBASE_CONFIG || {
  apiKey: 'AIzaSyBob5nnI14BalTKGORZjWDCkvL5H2y6vKQ',
  authDomain: 'berean-board-virtual-buzzers.firebaseapp.com',
  databaseURL: 'https://berean-board-virtual-buzzers-default-rtdb.firebaseio.com',
  projectId: 'berean-board-virtual-buzzers',
  storageBucket: 'berean-board-virtual-buzzers.firebasestorage.app',
  messagingSenderId: '1014856114347',
  appId: '1:1014856114347:web:8b5d38918b3195eae217ee',
};

var BEREAN_BOARD_FIREBASE_APP_CHECK_WAS_PRESET = Boolean(window.BEREAN_BOARD_FIREBASE_APP_CHECK);

// Backward-compatible site-key-only override for older local/staging setups.
// Keep this before the object below so in-file legacy v3 keys are honored.
window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY = window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || '';

window.BEREAN_BOARD_FIREBASE_APP_CHECK = window.BEREAN_BOARD_FIREBASE_APP_CHECK || {
  provider: window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ? 'recaptcha-v3' : 'recaptcha-enterprise',
  siteKey: window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr',
};

// Backward-compatible alias for older local overrides. If an override already
// supplied this value, preserve it instead of replacing it with the default key.
window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY = window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey || '';

// If an older edited config file sets the legacy v3 key on the alias line above,
// keep that site-key-only setup on reCAPTCHA v3 rather than the default
// Enterprise provider.
if (
  !BEREAN_BOARD_FIREBASE_APP_CHECK_WAS_PRESET &&
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY &&
  window.BEREAN_BOARD_FIREBASE_APP_CHECK &&
  window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey === '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr' &&
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY !== window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey
) {
  window.BEREAN_BOARD_FIREBASE_APP_CHECK = {
    provider: 'recaptcha-v3',
    siteKey: window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY,
  };
}
