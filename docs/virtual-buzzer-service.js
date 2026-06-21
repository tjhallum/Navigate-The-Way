(() => {
  'use strict';

  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
  const FIREBASE_SDK_VERSION = '10.14.1';
  const FIREBASE_SDK_ORIGIN = ['https:', '', 'www.gstatic.com'].join('/');
  const SDK_BASE = `${FIREBASE_SDK_ORIGIN}/firebasejs/${FIREBASE_SDK_VERSION}`;
  const FIREBASE_APP_URL = [SDK_BASE, 'firebase-app.js'].join('/');
  const FIREBASE_SIGNIN_SCRIPT = [SDK_BASE, 'firebase-auth.js'].join('/');
  const FIREBASE_DATABASE_URL = [SDK_BASE, 'firebase-database.js'].join('/');
  const FIREBASE_APP_CHECK_URL = [SDK_BASE, 'firebase-app-check.js'].join('/');
  const APP_CHECK_PROVIDER_ENTERPRISE = 'recaptcha-enterprise';
  const APP_CHECK_PROVIDER_V3 = 'recaptcha-v3';

  let sdkPromise = null;

  function coerceText(value, fallback = '') {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    if (value == null) return fallback;
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function normalizePlayerNames(playerNames) {
    const names = Array.isArray(playerNames) ? playerNames : [];
    const normalized = [];
    names.forEach((name) => {
      const text = coerceText(name);
      if (text && !normalized.some((existing) => existing.toLowerCase() === text.toLowerCase())) {
        normalized.push(text.slice(0, 40));
      }
    });
    if (normalized.length < 1 || normalized.length > 4) {
      throw new Error('Virtual buzzers need one to four player names.');
    }
    return normalized;
  }

  function objectFromPlayerNames(playerNames) {
    return normalizePlayerNames(playerNames).reduce((accumulator, name, index) => {
      accumulator[index] = name;
      return accumulator;
    }, {});
  }

  function normalizeIndexedList(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => coerceText(entry)).filter(Boolean).slice(0, 4);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .map((key) => Number(key))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < 4)
        .sort((a, b) => a - b)
        .map((index) => coerceText(value[index]))
        .filter(Boolean)
        .slice(0, 4);
    }
    return [];
  }

  function normalizeSessionId(value) {
    const text = coerceText(value);
    return /^[A-Za-z0-9_-]{12,96}$/.test(text) ? text : '';
  }

  function getBuzzerNumberForPlayerIndex(playerIndex) {
    const index = Number(playerIndex);
    return Number.isInteger(index) && index >= 0 && index < 4 ? index + 1 : 0;
  }

  function normalizeLockedOutPlayerIndexes(value) {
    if (Array.isArray(value)) {
      const looksLikeFirebaseBooleanList = value.some((entry) => typeof entry === 'boolean' || entry === null);
      if (looksLikeFirebaseBooleanList) {
        return value
          .map((entry, index) => (entry === true ? index : null))
          .filter((index) => Number.isInteger(index) && index >= 0 && index < 4);
      }
      return value.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < 4);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .map((key) => Number(key))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < 4 && value[index]);
    }
    return [];
  }

  function objectFromLockedOutPlayerIndexes(indexes) {
    return normalizeLockedOutPlayerIndexes(indexes).reduce((accumulator, index) => {
      accumulator[index] = true;
      return accumulator;
    }, {});
  }

  function normalizeCurrentClue(value) {
    if (!value || typeof value !== 'object') return null;
    const categoryTitle = coerceText(value.categoryTitle || value.category || value.categoryName).slice(0, 80);
    const rawClueValue = Number(value.value || value.clueValue || 0);
    const clueValue = Number.isFinite(rawClueValue) ? Math.floor(rawClueValue) : 0;
    if (!categoryTitle || clueValue <= 0 || clueValue > 1000) return null;
    return {
      categoryTitle,
      value: clueValue,
    };
  }

  function mergeOptionalCurrentClue(target, currentClue) {
    const normalized = normalizeCurrentClue(currentClue);
    if (normalized) {
      target.currentClue = normalized;
    }
    return target;
  }

  function buildVirtualBuzzerSessionRecord({ hostUid, playerNames, nowMs = Date.now(), ttlMs = DEFAULT_SESSION_TTL_MS }) {
    const uid = coerceText(hostUid);
    if (!uid) throw new Error('A host Firebase auth uid is required before creating a virtual buzzer session.');
    const expiresAt = Math.floor(Number(nowMs) + Number(ttlMs || DEFAULT_SESSION_TTL_MS));
    return {
      hostUid: uid,
      createdAt: { '.sv': 'timestamp' },
      expiresAt,
      status: 'setup',
      buzzRound: 0,
      playerNames: objectFromPlayerNames(playerNames),
      playerClaims: {},
      buzz: { round: 0, open: false, first: null, lockedOutPlayerIndexes: {} },
    };
  }

  function buildVirtualBuzzerJoinUrl({ origin, pathname, sessionId }) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw new Error('A valid virtual buzzer session id is required for the join link.');
    const baseOrigin = coerceText(origin) || (ROOT.location?.origin || '');
    const basePath = coerceText(pathname) || (ROOT.location?.pathname || '/berean-board');
    const url = new URL(basePath, baseOrigin || 'https://www.navtheway.com');
    url.search = '';
    url.hash = '';
    url.searchParams.set('mode', 'buzz');
    url.searchParams.set('session', id);
    return url.toString();
  }

  function buildPlayerClaimValue({ uid, playerIndex, playerNames, nowMs = Date.now() }) {
    const authUid = coerceText(uid);
    const names = normalizeIndexedList(playerNames);
    const index = Number(playerIndex);
    if (!authUid) throw new Error('Sign in before claiming a player name.');
    if (!Number.isInteger(index) || index < 0 || index >= names.length) {
      throw new Error('Choose one of the available player names.');
    }
    return {
      uid: authUid,
      playerName: names[index],
      buzzerNumber: getBuzzerNumberForPlayerIndex(index),
      claimedAt: Math.floor(Number(nowMs) || Date.now()),
    };
  }

  function buildFirstBuzzValue({ uid, playerIndex, playerNames, round, nowMs = Date.now() }) {
    const claim = buildPlayerClaimValue({ uid, playerIndex, playerNames, nowMs });
    return {
      uid: claim.uid,
      playerIndex: Number(playerIndex),
      playerName: claim.playerName,
      buzzerNumber: claim.buzzerNumber,
      round: Math.max(0, Math.floor(Number(round) || 0)),
      buzzedAt: Math.floor(Number(nowMs) || Date.now()),
    };
  }

  function buildHostSelectedBuzzValue({ claim, playerIndex, playerNames, round, nowMs = Date.now() }) {
    const playerClaim = claim && typeof claim === 'object' ? claim : {};
    const uid = coerceText(playerClaim.uid);
    if (!uid) throw new Error('That virtual player has not claimed a phone buzzer yet.');
    return {
      ...buildFirstBuzzValue({ uid, playerIndex, playerNames, round, nowMs }),
      source: 'host',
    };
  }

  function normalizeVirtualBuzzerSession(session) {
    const source = session && typeof session === 'object' ? session : {};
    const playerNames = normalizeIndexedList(source.playerNames);
    const rawClaims = source.playerClaims && typeof source.playerClaims === 'object' ? source.playerClaims : {};
    const claims = playerNames.map((playerName, playerIndex) => {
      const claim = rawClaims[playerIndex];
      if (!claim || typeof claim !== 'object') return null;
      const uid = coerceText(claim.uid);
      if (!uid) return null;
      return {
        uid,
        playerIndex,
        playerName: coerceText(claim.playerName, playerName) || playerName,
        buzzerNumber: Number(claim.buzzerNumber) || getBuzzerNumberForPlayerIndex(playerIndex),
        claimedAt: Number(claim.claimedAt) || 0,
      };
    });
    const rawBuzz = source.buzz && typeof source.buzz === 'object' ? source.buzz : {};
    const lockedOutPlayerIndexes = normalizeLockedOutPlayerIndexes(rawBuzz.lockedOutPlayerIndexes);
    const first = rawBuzz.first && typeof rawBuzz.first === 'object'
      ? {
        uid: coerceText(rawBuzz.first.uid),
        playerIndex: Number(rawBuzz.first.playerIndex),
        playerName: coerceText(rawBuzz.first.playerName),
        buzzerNumber: Number(rawBuzz.first.buzzerNumber) || getBuzzerNumberForPlayerIndex(rawBuzz.first.playerIndex),
        round: Number(rawBuzz.first.round) || Number(source.buzzRound) || 0,
        buzzedAt: Number(rawBuzz.first.buzzedAt) || 0,
        source: coerceText(rawBuzz.first.source, 'player') === 'host' ? 'host' : 'player',
      }
      : null;
    return {
      hostUid: coerceText(source.hostUid),
      createdAt: Number(source.createdAt) || 0,
      expiresAt: Number(source.expiresAt) || 0,
      status: coerceText(source.status, 'setup') || 'setup',
      buzzRound: Math.max(0, Math.floor(Number(source.buzzRound) || 0)),
      playerNames,
      claims,
      buzz: {
        round: Math.max(0, Math.floor(Number(rawBuzz.round ?? first?.round ?? source.buzzRound) || 0)),
        open: Boolean(rawBuzz.open),
        first,
        lockedOutPlayerIndexes,
        currentClue: normalizeCurrentClue(rawBuzz.currentClue),
      },
    };
  }

  function isVirtualBuzzerSessionClosed(session, nowMs = Date.now()) {
    const normalized = session?.playerNames ? session : normalizeVirtualBuzzerSession(session);
    return normalized.status === 'closed' || Boolean(normalized.expiresAt && normalized.expiresAt <= Number(nowMs));
  }

  function getPlayerClaimOptions(session, uid = '', selectedPlayerIndex = null) {
    const normalized = session?.playerNames ? session : normalizeVirtualBuzzerSession(session);
    const currentUid = coerceText(uid);
    const selectedIndex = Number(selectedPlayerIndex);
    const hasSelectedIndex = selectedPlayerIndex !== null &&
      selectedPlayerIndex !== undefined &&
      selectedPlayerIndex !== '' &&
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 &&
      selectedIndex < 4;
    const sessionClosed = isVirtualBuzzerSessionClosed(normalized);

    return normalized.playerNames.map((playerName, playerIndex) => {
      const claim = normalized.claims[playerIndex] || null;
      const claimedByCurrentUser = Boolean(claim && currentUid && claim.uid === currentUid);
      const claimedByAnotherPlayer = Boolean(claim && !claimedByCurrentUser);
      const disabled = sessionClosed || claimedByAnotherPlayer;
      return {
        playerIndex,
        playerName,
        buzzerNumber: getBuzzerNumberForPlayerIndex(playerIndex),
        claimed: Boolean(claim),
        claimedByCurrentUser,
        disabled,
        unavailableReason: sessionClosed ? 'closed' : (claimedByAnotherPlayer ? 'claimed' : ''),
        selected: !disabled && (claimedByCurrentUser || (hasSelectedIndex && selectedIndex === playerIndex)),
      };
    });
  }

  function canSubmitVirtualBuzz({ session, claim, uid }) {
    const normalized = session?.playerNames ? session : normalizeVirtualBuzzerSession(session);
    const authUid = coerceText(uid);
    const playerClaim = claim || null;
    if (!normalized || isVirtualBuzzerSessionClosed(normalized) || normalized.status !== 'open') return false;
    if (!normalized.buzz?.open || normalized.buzz?.first) return false;
    if (!playerClaim || !authUid || playerClaim.uid !== authUid) return false;
    if (normalized.buzz.lockedOutPlayerIndexes.includes(Number(playerClaim.playerIndex))) return false;
    return true;
  }

  function hasUsableFirebaseConfig(config) {
    return Boolean(config && typeof config === 'object' &&
      coerceText(config.apiKey) &&
      coerceText(config.authDomain) &&
      coerceText(config.databaseURL) &&
      coerceText(config.projectId) &&
      coerceText(config.appId));
  }

  function getFirebaseConfig(root = ROOT) {
    const config = root.BEREAN_BOARD_FIREBASE_CONFIG || root.NTWBereanBoardFirebaseConfig || null;
    return hasUsableFirebaseConfig(config) ? config : null;
  }

  function normalizeAppCheckProvider(value, fallback = APP_CHECK_PROVIDER_V3) {
    const text = coerceText(value).toLowerCase();
    if (text === APP_CHECK_PROVIDER_ENTERPRISE || text === 'enterprise' || text === 'recaptchaenterprise') {
      return APP_CHECK_PROVIDER_ENTERPRISE;
    }
    if (text === APP_CHECK_PROVIDER_V3 || text === 'recaptcha-v3-provider' || text === 'recaptchav3' || text === 'v3') {
      return APP_CHECK_PROVIDER_V3;
    }
    return fallback;
  }

  function getAppCheckConfig(root = ROOT) {
    const config = root.BEREAN_BOARD_FIREBASE_APP_CHECK || root.NTWBereanBoardFirebaseAppCheck || null;
    const legacySiteKey = coerceText(root.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || root.NTWBereanBoardFirebaseAppCheckSiteKey || '');
    if (config && typeof config === 'object') {
      return {
        provider: normalizeAppCheckProvider(config.provider, APP_CHECK_PROVIDER_ENTERPRISE),
        siteKey: coerceText(config.siteKey || config.recaptchaSiteKey || legacySiteKey),
      };
    }
    return { provider: APP_CHECK_PROVIDER_V3, siteKey: legacySiteKey };
  }

  function getAppCheckSiteKey(root = ROOT) {
    return getAppCheckConfig(root).siteKey;
  }

  function getAppCheckProvider(root = ROOT) {
    return getAppCheckConfig(root).provider;
  }

  function createSessionId(cryptoRef = ROOT.crypto) {
    const bytes = new Uint8Array(18);
    if (cryptoRef?.getRandomValues) {
      cryptoRef.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const encoded = typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function loadFirebaseSdk(importer = (specifier) => import(specifier)) {
    if (!sdkPromise) {
      sdkPromise = Promise.all([
        importer(FIREBASE_APP_URL),
        importer(FIREBASE_SIGNIN_SCRIPT),
        importer(FIREBASE_DATABASE_URL),
        importer(FIREBASE_APP_CHECK_URL).catch(() => null),
      ]).then(([app, auth, database, appCheck]) => ({ app, auth, database, appCheck }));
    }
    return sdkPromise;
  }

  async function waitForInitialAuthUser(auth, authSdk) {
    if (auth?.authStateReady) {
      await auth.authStateReady();
      return auth.currentUser || null;
    }
    if (auth?.currentUser) return auth.currentUser;
    if (!authSdk?.onAuthStateChanged) return null;
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = null;
      const finish = (user) => {
        if (settled) return;
        settled = true;
        if (typeof unsubscribe === 'function') unsubscribe();
        resolve(user || null);
      };
      unsubscribe = authSdk.onAuthStateChanged(auth, finish, () => finish(null));
      if (settled && typeof unsubscribe === 'function') unsubscribe();
    });
  }

  async function initializeFirebaseContext({ config = getFirebaseConfig(), appCheckSiteKey = getAppCheckSiteKey(), appCheckProvider = getAppCheckProvider(), importer } = {}) {
    if (!hasUsableFirebaseConfig(config)) {
      throw new Error('Virtual buzzers need the Berean Board Firebase config to be set by the developer.');
    }
    const sdk = await loadFirebaseSdk(importer);
    const appName = 'berean-board-virtual-buzzers';
    const existingApp = sdk.app.getApps().find((candidate) => candidate.name === appName);
    const app = existingApp || sdk.app.initializeApp(config, appName);
    let appCheck = null;
    if (appCheckSiteKey) {
      const normalizedAppCheckProvider = normalizeAppCheckProvider(appCheckProvider);
      const Provider = normalizedAppCheckProvider === APP_CHECK_PROVIDER_ENTERPRISE
        ? sdk.appCheck?.ReCaptchaEnterpriseProvider
        : sdk.appCheck?.ReCaptchaV3Provider;
      if (!sdk.appCheck?.initializeAppCheck || !Provider) {
        throw new Error(`Firebase App Check ${normalizedAppCheckProvider} provider is unavailable.`);
      }
      try {
        appCheck = sdk.appCheck.initializeAppCheck(app, {
          provider: new Provider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (error) {
        const duplicateMessage = `${error?.code || ''} ${error?.message || ''}`;
        if (!/already|duplicate/i.test(duplicateMessage)) {
          throw error;
        }
        // App Check may already be initialized for this app instance.
      }
    }
    const auth = sdk.auth.getAuth(app);
    const existingUser = await waitForInitialAuthUser(auth, sdk.auth);
    const credential = existingUser || (await sdk.auth.signInAnonymously(auth)).user;
    const database = sdk.database.getDatabase(app);
    return { sdk, app, appCheck, auth, database, uid: credential.uid };
  }

  function sessionRefPath(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw new Error('A valid virtual buzzer session id is required.');
    return `sessions/${id}`;
  }

  function sessionPlayerClaimsRefPath(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw new Error('A valid virtual buzzer session id is required.');
    sessionId = id;
    return `sessions/${sessionId}/playerClaims`;
  }

  function sessionBuzzRefPath(sessionId) {
    const id = normalizeSessionId(sessionId);
    if (!id) throw new Error('A valid virtual buzzer session id is required.');
    sessionId = id;
    return `sessions/${sessionId}/buzz`;
  }

  function subscribeToSessionValue(context, sessionId, callback) {
    const sessionRef = context.sdk.database.ref(context.database, sessionRefPath(sessionId));
    return context.sdk.database.onValue(sessionRef, (snapshot) => {
      callback(normalizeVirtualBuzzerSession(snapshot.val()));
    });
  }

  function subscribeToSessionPaths(context, sessionId, callbacks = {}) {
    const { database, sdk } = context;
    const base = sessionRefPath(sessionId);
    const unsubscribers = [];
    if (callbacks.onClaims) {
      unsubscribers.push(sdk.database.onValue(sdk.database.ref(database, sessionPlayerClaimsRefPath(sessionId)), (snapshot) => callbacks.onClaims(snapshot.val() || {})));
    }
    if (callbacks.onBuzz) {
      unsubscribers.push(sdk.database.onValue(sdk.database.ref(database, sessionBuzzRefPath(sessionId)), (snapshot) => callbacks.onBuzz(snapshot.val() || {})));
    }
    if (callbacks.onStatus) {
      unsubscribers.push(sdk.database.onValue(sdk.database.ref(database, `${base}/status`), (snapshot) => callbacks.onStatus(snapshot.val() || 'setup')));
    }
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  }

  async function createVirtualBuzzerSession({ context, sessionId = createSessionId(), playerNames, nowMs = Date.now(), ttlMs = DEFAULT_SESSION_TTL_MS }) {
    const id = normalizeSessionId(sessionId) || createSessionId();
    const sessionRef = context.sdk.database.ref(context.database, sessionRefPath(id));
    const record = buildVirtualBuzzerSessionRecord({ hostUid: context.uid, playerNames, nowMs, ttlMs });
    await context.sdk.database.set(sessionRef, record);
    return { sessionId: id, record };
  }

  async function claimPlayerSlot({ context, sessionId, playerIndex, playerNames }) {
    const index = Number(playerIndex);
    const claimRef = context.sdk.database.ref(context.database, `${sessionPlayerClaimsRefPath(sessionId)}/${index}`);
    const claimValue = buildPlayerClaimValue({ uid: context.uid, playerIndex: index, playerNames });
    const result = await context.sdk.database.runTransaction(claimRef, (currentClaim) => {
      if (currentClaim) return;
      return claimValue;
    });
    return { committed: Boolean(result.committed), snapshot: result.snapshot, claim: result.committed ? claimValue : null };
  }

  async function submitFirstBuzz({ context, sessionId, playerIndex, playerNames, round }) {
    const firstBuzzRef = context.sdk.database.ref(context.database, `${sessionBuzzRefPath(sessionId)}/first`);
    const firstBuzzValue = buildFirstBuzzValue({ uid: context.uid, playerIndex, playerNames, round });
    const result = await context.sdk.database.runTransaction(firstBuzzRef, (currentFirstBuzz) => {
      if (currentFirstBuzz) return;
      return firstBuzzValue;
    });
    return { committed: Boolean(result.committed), snapshot: result.snapshot, firstBuzz: result.committed ? firstBuzzValue : null };
  }

  async function setHostStatus(context, sessionId, status) {
    await context.sdk.database.update(context.sdk.database.ref(context.database, sessionRefPath(sessionId)), {
      status,
    });
  }

  async function resetBuzzersForHost({ context, sessionId, open = true, lockedOutPlayerIndexes = [], currentClue = null }) {
    const sessionRef = context.sdk.database.ref(context.database, sessionRefPath(sessionId));
    const buzzRoundRef = context.sdk.database.ref(context.database, `${sessionRefPath(sessionId)}/buzzRound`);
    const roundResult = await context.sdk.database.runTransaction(buzzRoundRef, (currentRound) => {
      const currentValue = Number(currentRound) || 0;
      return Math.max(0, currentValue) + 1;
    });
    if (!roundResult.committed) {
      return { committed: false, snapshot: roundResult.snapshot };
    }
    const nextRound = Number(roundResult.snapshot?.val?.()) || 0;
    const buzz = mergeOptionalCurrentClue({
      round: nextRound,
      open: Boolean(open),
      first: null,
      lockedOutPlayerIndexes: objectFromLockedOutPlayerIndexes(lockedOutPlayerIndexes),
    }, currentClue);
    const status = open ? 'open' : 'locked';
    await context.sdk.database.update(sessionRef, {
      status,
      buzz,
    });
    return {
      committed: true,
      snapshot: {
        val: () => ({ status, buzzRound: nextRound, buzz }),
      },
    };
  }

  async function selectFirstBuzzForHost({ context, sessionId, playerIndex, playerNames, claim, round, currentClue = null, nowMs = Date.now() }) {
    const lockRound = Math.max(0, Math.floor(Number(round) || 0));
    const first = buildHostSelectedBuzzValue({ claim, playerIndex, playerNames, round: lockRound, nowMs });
    const updateValue = {
      status: 'locked',
      'buzz/open': false,
      'buzz/lockRound': lockRound,
      'buzz/first': first,
    };
    const normalizedCurrentClue = normalizeCurrentClue(currentClue);
    if (normalizedCurrentClue) {
      updateValue['buzz/currentClue'] = normalizedCurrentClue;
    }
    const sessionRef = context.sdk.database.ref(context.database, sessionRefPath(sessionId));
    await context.sdk.database.update(sessionRef, updateValue);
    return {
      committed: true,
      snapshot: {
        val: () => ({
          status: 'locked',
          buzz: {
            round: lockRound,
            open: false,
            lockRound,
            first,
            lockedOutPlayerIndexes: {},
            ...(normalizedCurrentClue ? { currentClue: normalizedCurrentClue } : {}),
          },
        }),
      },
    };
  }

  async function disableBuzzersForHost({ context, sessionId, expectedRound = null } = {}) {
    const buzzRef = context.sdk.database.ref(context.database, sessionBuzzRefPath(sessionId));
    const hasExpectedRound = expectedRound !== null && expectedRound !== undefined && expectedRound !== '';
    const guardedRound = Math.max(0, Math.floor(Number(expectedRound) || 0));
    let currentBuzz = null;
    let lockRound = hasExpectedRound ? guardedRound : null;
    if (typeof context.sdk.database.get === 'function') {
      currentBuzz = (await context.sdk.database.get(buzzRef))?.val?.() || null;
      const currentRound = Math.max(0, Math.floor(Number(currentBuzz?.round ?? currentBuzz?.first?.round ?? 0) || 0));
      if (hasExpectedRound && currentRound !== guardedRound) {
        return { committed: false, snapshot: { val: () => currentBuzz } };
      }
      lockRound = currentRound;
    }
    const hasLockRound = Number.isInteger(lockRound) && lockRound >= 0;
    const updateValue = hasLockRound
      ? { open: false, lockRound }
      : { open: false };
    await context.sdk.database.update(buzzRef, updateValue);
    return {
      committed: true,
      snapshot: {
        val: () => ({
          ...(currentBuzz || {}),
          round: hasLockRound ? lockRound : Number(currentBuzz?.round || 0),
          open: false,
          ...(hasLockRound ? { lockRound } : {}),
        }),
      },
    };
  }

  async function closeVirtualBuzzerSession({ context, sessionId }) {
    await context.sdk.database.update(context.sdk.database.ref(context.database, sessionRefPath(sessionId)), {
      status: 'closed',
      'buzz/open': false,
    });
  }

  async function disposeFirebaseContext(context) {
    if (!context) return;
    try {
      await context.sdk.auth.signOut(context.auth);
    } catch (_error) {
      // Anonymous sessions are low-friction; cleanup should never block in-person play.
    }
    try {
      if (context.sdk.app?.deleteApp && context.app) {
        await context.sdk.app.deleteApp(context.app);
      }
    } catch (_error) {
      // The app may already have been deleted by another cleanup path.
    }
  }

  const publicApi = {
    DEFAULT_SESSION_TTL_MS,
    FIREBASE_SDK_VERSION,
    hasUsableFirebaseConfig,
    getFirebaseConfig,
    getAppCheckConfig,
    getAppCheckSiteKey,
    getAppCheckProvider,
    createSessionId,
    normalizeSessionId,
    normalizePlayerNames,
    normalizeVirtualBuzzerSession,
    isVirtualBuzzerSessionClosed,
    normalizeLockedOutPlayerIndexes,
    objectFromLockedOutPlayerIndexes,
    normalizeCurrentClue,
    getPlayerClaimOptions,
    canSubmitVirtualBuzz,
    buildVirtualBuzzerSessionRecord,
    buildVirtualBuzzerJoinUrl,
    buildPlayerClaimValue,
    buildFirstBuzzValue,
    buildHostSelectedBuzzValue,
    loadFirebaseSdk,
    waitForInitialAuthUser,
    initializeFirebaseContext,
    subscribeToSessionValue,
    subscribeToSessionPaths,
    createVirtualBuzzerSession,
    claimPlayerSlot,
    submitFirstBuzz,
    resetBuzzersForHost,
    selectFirstBuzzForHost,
    setHostStatus,
    disableBuzzersForHost,
    closeVirtualBuzzerSession,
    disposeFirebaseContext,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  ROOT.NTWVirtualBuzzerService = publicApi;
})();
