#!/usr/bin/env node
'use strict';

/*
 * Berean Board virtual-buzzer latency smoke harness.
 *
 * Requires a Chrome/Chromium instance with the DevTools Protocol exposed, e.g.:
 *   chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\bb-latency-smoke
 *
 * Then run from the repo root:
 *   BEREAN_BOARD_CDP_URL=http://127.0.0.1:9222 node scripts/smoke-berean-board-virtual-latency.cjs --live --rounds 3
 *
 * The script creates a short-lived Firebase virtual-buzzer session from the
 * browser, opens separate isolated player browser contexts, measures hot-path
 * timing, and closes/disposes everything before exiting.
 */

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:4173/berean-board.html';
const DEFAULT_LIVE_URL = 'https://www.navtheway.com/berean-board';

function parseArgs(argv) {
  const options = {
    cdpUrl: process.env.BEREAN_BOARD_CDP_URL || DEFAULT_CDP_URL,
    url: process.env.BEREAN_BOARD_URL || DEFAULT_LOCAL_URL,
    live: false,
    rounds: 3,
    players: ['Ada', 'Boaz', 'Chloe'],
    timeoutMs: 45_000,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--live') {
      options.live = true;
      options.url = DEFAULT_LIVE_URL;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--url') {
      options.url = argv[++index] || options.url;
    } else if (arg === '--cdp-url') {
      options.cdpUrl = argv[++index] || options.cdpUrl;
    } else if (arg === '--rounds') {
      options.rounds = Math.max(1, Math.min(20, Number(argv[++index]) || options.rounds));
    } else if (arg === '--players') {
      options.players = String(argv[++index] || '')
        .split(',')
        .map((name) => name.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 4);
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Math.max(5_000, Number(argv[++index]) || options.timeoutMs);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.players.length || options.players.length > 4) {
    throw new Error('--players must provide one to four comma-separated names.');
  }

  return options;
}

function usage() {
  return `Berean Board virtual-buzzer latency smoke harness

Usage:
  BEREAN_BOARD_CDP_URL=http://127.0.0.1:9222 node scripts/smoke-berean-board-virtual-latency.cjs [options]

Options:
  --live                 Use https://www.navtheway.com/berean-board
  --url <url>            Host page URL to load (default: ${DEFAULT_LOCAL_URL})
  --cdp-url <url>        Chrome DevTools endpoint (default/env BEREAN_BOARD_CDP_URL: ${DEFAULT_CDP_URL})
  --rounds <n>           Rounds to open and buzz (default: 3)
  --players <csv>        Player names, one to four (default: Ada,Boaz,Chloe)
  --timeout-ms <n>       Per-step timeout in milliseconds (default: 45000)
  --json                 Print machine-readable JSON only
  --help                 Show this help

Measured fields include:
  hostOpenWriteMs, hostOpenListenerLagMs, phoneEnableLagMs, clickToHostMs,
  clickToPhoneResultMs, and audioPlayResult.
`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientCdpEvaluationError(error) {
  const message = String(error?.message || error || '');
  return /Execution context was destroyed|Cannot find context with specified id|Inspected target navigated|Cannot find object with id/i.test(message);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

class CdpClient {
  constructor(cdpUrl) {
    this.cdpUrl = cdpUrl.replace(/\/+$/, '');
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    const version = await fetchJson(`${this.cdpUrl}/json/version`);
    const wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error(`No browser websocket URL exposed by ${this.cdpUrl}`);
    this.ws = new WebSocket(wsUrl);
    this.ws.addEventListener('message', (event) => this.handleMessage(event));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out connecting to ${wsUrl}`)), 10_000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`Could not connect to ${wsUrl}`));
      }, { once: true });
    });
  }

  handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (_error) {
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(`${pending.method}: ${message.error.message || JSON.stringify(message.error)}`));
      return;
    }
    pending.resolve(message.result || {});
  }

  async send(method, params = {}, { sessionId = null, timeoutMs = 30_000 } = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP websocket is not open.');
    }
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
    });
    this.ws.send(JSON.stringify(payload));
    return result;
  }

  async attach(targetId) {
    const attached = await this.send('Target.attachToTarget', { targetId, flatten: true });
    return attached.sessionId;
  }

  async eval(targetId, expression, { timeoutMs = 45_000 } = {}) {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const sessionId = await this.attach(targetId);
      try {
        await this.send('Runtime.enable', {}, { sessionId, timeoutMs });
        const result = await this.send('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        }, { sessionId, timeoutMs });
        if (result.exceptionDetails) {
          const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime exception';
          throw new Error(description);
        }
        return result.result?.value;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && isTransientCdpEvaluationError(error)) {
          await sleep(250 * attempt);
          continue;
        }
        throw error;
      } finally {
        await this.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
    }
    throw lastError || new Error('Runtime.evaluate failed.');
  }

  async close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function jsJson(value) {
  return JSON.stringify(value);
}

function hostSessionScript(playerNames) {
  return `(async () => {
    const waitFor = async (predicate, timeoutMs = 45000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Timed out waiting for Berean Board virtual buzzer service.');
    };
    const service = await waitFor(() => window.NTWVirtualBuzzerService);
    await waitFor(() => window.NTWBereanBoard);
    const context = await service.initializeFirebaseContext();
    const created = await service.createVirtualBuzzerSession({ context, playerNames: ${jsJson(playerNames)}, ttlMs: 30 * 60 * 1000 });
    await service.setHostStatus(context, created.sessionId, 'ready');
    const joinUrl = service.buildVirtualBuzzerJoinUrl({ origin: location.origin, pathname: location.pathname, sessionId: created.sessionId });
    window.__bbLatencySmoke = { service, context, sessionId: created.sessionId, joinUrl, buzzEvents: [], statusEvents: [], claimEvents: [], rounds: [], audioPlayResult: null };
    window.__bbLatencySmoke.unsubscribe = service.subscribeToSessionPaths(context, created.sessionId, {
      onClaims: (claims) => window.__bbLatencySmoke.claimEvents.push({ date: Date.now(), claims: claims || {} }),
      onBuzz: (buzz) => window.__bbLatencySmoke.buzzEvents.push({ date: Date.now(), buzz: buzz || {} }),
      onStatus: (status) => window.__bbLatencySmoke.statusEvents.push({ date: Date.now(), status })
    });
    const fakeLog = [];
    let nodeId = 0;
    class FakeParam { setValueAtTime(value, time) { fakeLog.push(['param.set', value, time]); } linearRampToValueAtTime(value, time) { fakeLog.push(['param.linear', value, time]); } exponentialRampToValueAtTime(value, time) { fakeLog.push(['param.exp', value, time]); } }
    class FakeNode { constructor(kind) { this.kind = kind + '-' + (++nodeId); } connect(destination) { fakeLog.push(['connect', this.kind, destination && destination.kind || 'destination']); return destination; } }
    class FakeGain extends FakeNode { constructor() { super('gain'); this.gain = new FakeParam(); } }
    class FakeOsc extends FakeNode { constructor() { super('osc'); this.frequency = new FakeParam(); this.detune = new FakeParam(); this.type = 'sine'; } start(time) { fakeLog.push(['osc.start', this.type, time]); } stop(time) { fakeLog.push(['osc.stop', this.type, time]); } }
    class FakeFilter extends FakeNode { constructor() { super('filter'); this.frequency = new FakeParam(); this.Q = new FakeParam(); } }
    class FakeComp extends FakeNode { constructor() { super('compressor'); this.threshold = new FakeParam(); this.knee = new FakeParam(); this.ratio = new FakeParam(); this.attack = new FakeParam(); this.release = new FakeParam(); } }
    class FakeAudioContext { constructor() { this.currentTime = 1; this.state = 'running'; this.destination = { kind: 'destination' }; fakeLog.push(['context.constructor']); } resume() { fakeLog.push(['context.resume']); return Promise.resolve(); } createGain() { return new FakeGain(); } createOscillator() { return new FakeOsc(); } createBiquadFilter() { return new FakeFilter(); } createDynamicsCompressor() { return new FakeComp(); } }
    const audioController = window.NTWBereanBoard.createHostBuzzerAudioController({ root: { AudioContext: FakeAudioContext }, nowMs: () => 1000 });
    const audioSupported = audioController.isSupported();
    const audioPrimed = audioController.prime();
    const audioPlayed = audioController.play();
    window.__bbLatencySmoke.audioPlayResult = { audioSupported, audioPrimed, audioPlayed, oscillatorStarts: fakeLog.filter(([event]) => event === 'osc.start').length, fakeLog };
    return { sessionId: created.sessionId, joinUrl, hostUid: context.uid, audioPlayResult: window.__bbLatencySmoke.audioPlayResult };
  })()`;
}

function playerClaimScript(playerIndex) {
  return `(async () => {
    const waitFor = async (predicate, timeoutMs = 45000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Timed out waiting for player claim UI.');
    };
    await waitFor(() => window.NTWVirtualBuzzerService && !document.querySelector('#virtual-buzzer-player-screen')?.hidden);
    await waitFor(() => document.querySelectorAll('input[name="virtual-buzzer-player-name"]').length > ${Number(playerIndex)});
    const input = document.querySelector('input[name="virtual-buzzer-player-name"][value="${Number(playerIndex)}"]');
    if (!input) throw new Error('Player input ${Number(playerIndex)} missing.');
    input.click();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !document.querySelector('#virtual-buzzer-claim-button')?.disabled);
    const claimClickAt = Date.now();
    document.querySelector('#virtual-buzzer-claim-button').click();
    await waitFor(() => !document.querySelector('#virtual-buzzer-claimed-panel')?.hidden || /Could not|claimed by another|unavailable|error/i.test(document.querySelector('#virtual-buzzer-player-status')?.textContent || ''));
    return {
      playerIndex: ${Number(playerIndex)},
      claimClickAt,
      claimDoneAt: Date.now(),
      claimed: !document.querySelector('#virtual-buzzer-claimed-panel')?.hidden,
      header: document.querySelector('#virtual-buzzer-player-status')?.textContent || '',
      phoneStatus: document.querySelector('#virtual-buzzer-phone-status')?.textContent || ''
    };
  })()`;
}

function armPhoneProbeScript(roundLabel) {
  return `(() => {
    window.__bbLatencyProbe = { label: ${jsString(roundLabel)}, armedAt: Date.now(), enableAt: null, statusAtEnable: '', ticks: 0 };
    if (window.__bbLatencyProbeTimer) clearInterval(window.__bbLatencyProbeTimer);
    window.__bbLatencyProbeTimer = setInterval(() => {
      const button = document.querySelector('#virtual-buzzer-button');
      const status = document.querySelector('#virtual-buzzer-phone-status')?.textContent || '';
      window.__bbLatencyProbe.ticks += 1;
      if (!window.__bbLatencyProbe.enableAt && button && !button.disabled) {
        window.__bbLatencyProbe.enableAt = Date.now();
        window.__bbLatencyProbe.statusAtEnable = status;
        clearInterval(window.__bbLatencyProbeTimer);
      }
    }, 5);
    return window.__bbLatencyProbe;
  })()`;
}

function openRoundScript(roundLabel, value) {
  return `(async () => {
    const smoke = window.__bbLatencySmoke;
    if (!smoke) throw new Error('Host smoke state missing.');
    const start = Date.now();
    const result = await smoke.service.resetBuzzersForHost({
      context: smoke.context,
      sessionId: smoke.sessionId,
      open: true,
      currentClue: { categoryTitle: ${jsString(roundLabel)}, value: ${Number(value)} }
    });
    const end = Date.now();
    const snapshot = result.snapshot?.val?.() || {};
    const opened = { label: ${jsString(roundLabel)}, start, end, hostOpenWriteMs: end - start, round: snapshot.buzz?.round || snapshot.buzzRound || 0, snapshot };
    smoke.rounds.push(opened);
    return opened;
  })()`;
}

function clickBuzzScript() {
  return `(async () => {
    const waitFor = async (predicate, timeoutMs = 45000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const value = predicate();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error('Timed out waiting for buzzer click result.');
    };
    await waitFor(() => !document.querySelector('#virtual-buzzer-button')?.disabled);
    const clickAt = Date.now();
    document.querySelector('#virtual-buzzer-button').click();
    await waitFor(() => /buzzed first|Another player/i.test(document.querySelector('#virtual-buzzer-phone-status')?.textContent || ''));
    return { clickAt, resultAt: Date.now(), status: document.querySelector('#virtual-buzzer-phone-status')?.textContent || '' };
  })()`;
}

function hostSnapshotScript() {
  return `(() => {
    const smoke = window.__bbLatencySmoke;
    if (!smoke) return null;
    return {
      sessionId: smoke.sessionId,
      joinUrl: smoke.joinUrl,
      buzzEvents: smoke.buzzEvents,
      statusEvents: smoke.statusEvents,
      claimEvents: smoke.claimEvents,
      rounds: smoke.rounds,
      audioPlayResult: smoke.audioPlayResult
    };
  })()`;
}

function closeHostSessionScript() {
  return `(async () => {
    const smoke = window.__bbLatencySmoke;
    if (!smoke) return { closed: false, reason: 'missing smoke state' };
    try { smoke.unsubscribe?.(); } catch (_error) {}
    try { await smoke.service.closeVirtualBuzzerSession({ context: smoke.context, sessionId: smoke.sessionId }); } catch (error) { return { closed: false, error: error.message, sessionId: smoke.sessionId }; }
    try { await smoke.service.disposeFirebaseContext(smoke.context); } catch (_error) {}
    return { closed: true, sessionId: smoke.sessionId };
  })()`;
}

function summarizeRound({ roundOpen, probes, clickResult, hostSnapshot }) {
  const openEvent = hostSnapshot.buzzEvents.find((event) => Number(event.buzz?.round) === Number(roundOpen.round) && event.buzz?.open === true && !event.buzz?.first);
  const firstEvent = hostSnapshot.buzzEvents.find((event) => Number(event.buzz?.first?.round) === Number(roundOpen.round));
  const phoneEnableLagMs = probes.map((probe) => probe?.enableAt ? probe.enableAt - roundOpen.end : null);
  return {
    label: roundOpen.label,
    round: roundOpen.round,
    hostOpenWriteMs: roundOpen.hostOpenWriteMs,
    hostOpenListenerLagMs: openEvent ? openEvent.date - roundOpen.start : null,
    phoneEnableLagMs,
    clickToPhoneResultMs: clickResult ? clickResult.resultAt - clickResult.clickAt : null,
    clickToHostMs: firstEvent && clickResult ? firstEvent.date - clickResult.clickAt : null,
    winner: firstEvent?.buzz?.first?.playerName || null,
    clickStatus: clickResult?.status || '',
  };
}

async function runSmoke(options) {
  const client = new CdpClient(options.cdpUrl);
  const contexts = [];
  const targets = [];
  let hostTargetId = '';

  try {
    await client.connect();

    const hostContext = await client.send('Target.createBrowserContext', {});
    contexts.push(hostContext.browserContextId);
    const target = await client.send('Target.createTarget', {
      browserContextId: hostContext.browserContextId,
      url: `${options.url}${options.url.includes('?') ? '&' : '?'}latencySmoke=${Date.now()}`,
    });
    hostTargetId = target.targetId;
    targets.push(hostTargetId);

    const host = await client.eval(hostTargetId, hostSessionScript(options.players), { timeoutMs: options.timeoutMs });
    const players = [];
    for (let index = 0; index < options.players.length; index += 1) {
      const playerContext = await client.send('Target.createBrowserContext', {});
      contexts.push(playerContext.browserContextId);
      const playerTarget = await client.send('Target.createTarget', {
        browserContextId: playerContext.browserContextId,
        url: host.joinUrl,
      });
      targets.push(playerTarget.targetId);
      players.push({ playerIndex: index, name: options.players[index], targetId: playerTarget.targetId, contextId: playerContext.browserContextId });
    }

    const claimResults = [];
    for (const player of players) {
      claimResults.push(await client.eval(player.targetId, playerClaimScript(player.playerIndex), { timeoutMs: options.timeoutMs }));
    }

    await sleep(750);
    const rounds = [];
    for (let roundIndex = 0; roundIndex < options.rounds; roundIndex += 1) {
      const label = `Latency Smoke ${roundIndex + 1}`;
      await Promise.all(players.map((player) => client.eval(player.targetId, armPhoneProbeScript(label), { timeoutMs: options.timeoutMs })));
      const roundOpen = await client.eval(hostTargetId, openRoundScript(label, 100 + roundIndex * 100), { timeoutMs: options.timeoutMs });
      await sleep(500);
      const probes = await Promise.all(players.map((player) => client.eval(player.targetId, 'window.__bbLatencyProbe', { timeoutMs: options.timeoutMs })));
      const clicker = players[roundIndex % players.length];
      const clickResult = await client.eval(clicker.targetId, clickBuzzScript(), { timeoutMs: options.timeoutMs });
      await sleep(500);
      const hostSnapshot = await client.eval(hostTargetId, hostSnapshotScript(), { timeoutMs: options.timeoutMs });
      rounds.push(summarizeRound({ roundOpen, probes, clickResult, hostSnapshot }));
    }

    const hostSnapshot = await client.eval(hostTargetId, hostSnapshotScript(), { timeoutMs: options.timeoutMs });
    return {
      url: options.url,
      live: options.live,
      players: options.players,
      sessionId: host.sessionId,
      joinUrl: host.joinUrl,
      claimResults,
      audioPlayResult: host.audioPlayResult,
      rounds,
      rawEventCounts: {
        claims: hostSnapshot.claimEvents.length,
        statuses: hostSnapshot.statusEvents.length,
        buzzes: hostSnapshot.buzzEvents.length,
      },
    };
  } finally {
    if (hostTargetId) {
      await client.eval(hostTargetId, closeHostSessionScript(), { timeoutMs: options.timeoutMs }).catch(() => null);
    }
    for (const targetId of targets.reverse()) {
      await client.send('Target.closeTarget', { targetId }).catch(() => null);
    }
    for (const browserContextId of contexts.reverse()) {
      await client.send('Target.disposeBrowserContext', { browserContextId }).catch(() => null);
    }
    await client.close();
  }
}

function formatSummary(summary) {
  const lines = [];
  lines.push(`Berean Board virtual-buzzer latency smoke`);
  lines.push(`URL: ${summary.url}`);
  lines.push(`Session: ${summary.sessionId}`);
  lines.push(`Players: ${summary.players.join(', ')}`);
  lines.push(`Claims: ${summary.claimResults.map((claim) => `${claim.playerIndex}:${claim.claimed ? 'claimed' : 'failed'}`).join(' ')}`);
  lines.push(`Audio: ${JSON.stringify({
    audioSupported: summary.audioPlayResult?.audioSupported,
    audioPrimed: summary.audioPlayResult?.audioPrimed,
    audioPlayed: summary.audioPlayResult?.audioPlayed,
    oscillatorStarts: summary.audioPlayResult?.oscillatorStarts,
  })}`);
  lines.push('');
  lines.push('Round metrics:');
  summary.rounds.forEach((round) => {
    lines.push(`- ${round.label} round=${round.round} winner=${round.winner || 'n/a'} hostOpenWriteMs=${round.hostOpenWriteMs} hostOpenListenerLagMs=${round.hostOpenListenerLagMs} phoneEnableLagMs=[${round.phoneEnableLagMs.join(', ')}] clickToHostMs=${round.clickToHostMs} clickToPhoneResultMs=${round.clickToPhoneResultMs}`);
  });
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const summary = await runSmoke(options);
  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatSummary(summary));
    console.log('\nJSON summary:');
    console.log(JSON.stringify(summary, null, 2));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  summarizeRound,
  formatSummary,
  isTransientCdpEvaluationError,
};
