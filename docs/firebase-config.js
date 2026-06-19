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
 * 4. Optional but recommended: set the App Check reCAPTCHA v3 site key.
 *
 * NEVER commit Firebase service account private keys to this static frontend.
 */
window.BEREAN_BOARD_FIREBASE_CONFIG = window.BEREAN_BOARD_FIREBASE_CONFIG || {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY = window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || '';
