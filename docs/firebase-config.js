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
  apiKey: 'AIzaSyBob5nnI14BalTKGORZjWDCkvL5H2y6vKQ',
  authDomain: 'berean-board-virtual-buzzers.firebaseapp.com',
  databaseURL: 'https://berean-board-virtual-buzzers-default-rtdb.firebaseio.com',
  projectId: 'berean-board-virtual-buzzers',
  storageBucket: 'berean-board-virtual-buzzers.firebasestorage.app',
  messagingSenderId: '1014856114347',
  appId: '1:1014856114347:web:8b5d38918b3195eae217ee',
};

window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY = window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || '';
