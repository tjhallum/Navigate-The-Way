(() => {
  'use strict';

  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const BOARD_VALUES = [100, 200, 300, 400, 500];
  const MAX_LESSON_CHARS = 90000;
  const DEFAULT_API_BASE = 'https://navtheway.apologist.ai/';
  const CHAT_COMPLETIONS_PATH = '/api/v1/chat/completions';
  const DEFAULT_CHAT_COMPLETIONS_ENDPOINT = 'https://navtheway.apologist.ai/api/v1/chat/completions';
  const DEFAULT_MODEL = 'openai/gpt/5.4';
  const DEFAULT_LANGUAGE = 'en';
  const DEFAULT_BIBLE = 'bsb';
  const FOCUS_INSTRUCTIONS_HEADING = 'LEADER-PROVIDED FOCUS INSTRUCTIONS FOR THIS GAME:';
  const DEFAULT_DIFFICULTY_LEVEL = 'adult';
  const DIFFICULTY_LEVELS = Object.freeze([
    {
      value: 'child',
      level: 'Child',
      name: 'Little Lamb',
      gradeRange: 'Grade 1-2',
      guidance: 'Use very short sentences, concrete Bible truths, familiar words, and simple recall prompts. Avoid abstract theological terms unless they are explained in plain child-level wording.',
    },
    {
      value: 'preteen',
      level: 'Pre-teen',
      name: 'Bible Explorer',
      gradeRange: 'Grade 4-5',
      guidance: 'Use clear upper-elementary wording, basic Bible-study vocabulary, and simple doctrine explained with context. Keep questions concrete with light application.',
    },
    {
      value: 'teen',
      level: 'Teen',
      name: 'Disciple',
      gradeRange: 'Grade 6-8',
      guidance: 'Use middle-school to junior-high readability, introduce core doctrine and application, and keep wording direct enough for teens to answer aloud.',
    },
    {
      value: 'adult',
      level: 'Adult',
      name: 'Berean',
      gradeRange: 'Grade 9-11',
      guidance: 'Use adult small-group wording with moderate theological vocabulary, careful biblical reasoning, and application that rewards close attention to the lesson.',
    },
    {
      value: 'theologian',
      level: 'Theologian',
      name: 'Theologian',
      gradeRange: 'Grade 12-16+',
      guidance: 'Use advanced theological vocabulary, confessional and doctrinal distinctions where supported by the lesson, and seminary-level reasoning while remaining playable.',
    },
  ]);
  const DEFAULT_BUZZER_MODE = 'in-person';
  const BUZZER_MODES = Object.freeze([
    {
      value: 'in-person',
      label: 'In-person',
      name: 'Physical buzzers',
      guidance: 'Players are together and buzz in with physical buzzers. Firebase is not initialized.',
    },
    {
      value: 'virtual',
      label: 'Virtual',
      name: 'Virtual buzzers',
      guidance: 'Remote players buzz in from phones using a short-lived Firebase session.',
    },
  ]);
  const BUZZER_COLORS = Object.freeze([
    { number: 1, name: 'Blue', value: '#3b82f6' },
    { number: 2, name: 'Purple', value: '#a855f7' },
    { number: 3, name: 'Green', value: '#22c55e' },
    { number: 4, name: 'Orange', value: '#f97316' },
  ]);
  const HOST_BUZZER_SOUND_DURATION_SECONDS = 0.72;
  const HOST_BUZZER_SOUND_MIN_INTERVAL_MS = 650;
  const HOST_BUZZER_SOUND_VOLUME = 0.38;
  const HOST_BUZZER_SOUND_VOICES = Object.freeze([
    { type: 'sawtooth', gain: 0.45, startFrequency: 880, midFrequency: 523, endFrequency: 220, detune: -4 },
    { type: 'square', gain: 0.30, startFrequency: 554, midFrequency: 392, endFrequency: 196, detune: 0 },
    { type: 'triangle', gain: 0.18, startFrequency: 1320, midFrequency: 880, endFrequency: 440, detune: 8 },
  ]);
  const LEGACY_PARTIAL_CREDIT_FRACTION = 0.2;
  const CLUE_MODAL_FIT_TOLERANCE_PX = 10;
  const GROUP_MEMBERS_COOKIE_NAME = 'ntwBereanBoardGroupMembers';
  const GROUP_MEMBERS_COOKIE_MAX_AGE_SECONDS = 31536000;
  const SUPPORTED_TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.rtf', '.xml', '.yaml', '.yml', '.tex'
  ]);
  const SUPPORTED_BINARY_EXTENSIONS = new Set([
    '.pdf', '.epub', '.doc', '.docx', '.odt', '.pages', '.ppt', '.pptx', '.odp', '.key', '.xlsx', '.xls', '.ods'
  ]);
  const TEXT_MIME_PREFIXES = ['text/'];
  const TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'application/rtf',
    'application/x-rtf',
    'application/yaml',
    'application/x-yaml',
    'application/x-tex',
    'text/x-tex'
  ]);
  const DOCX_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);
  const LEGACY_WORD_MIME_TYPES = new Set([
    'application/msword',
    'application/vnd.ms-word',
    'application/x-msword'
  ]);
  const OPEN_DOCUMENT_TEXT_MIME_TYPES = new Set([
    'application/vnd.oasis.opendocument.text'
  ]);
  const IWORK_PAGES_MIME_TYPES = new Set([
    'application/vnd.apple.pages',
    'application/x-iwork-pages-sffpages'
  ]);
  const PPTX_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);
  const LEGACY_POWERPOINT_MIME_TYPES = new Set([
    'application/vnd.ms-powerpoint',
    'application/mspowerpoint',
    'application/powerpoint',
    'application/x-mspowerpoint'
  ]);
  const OPEN_DOCUMENT_PRESENTATION_MIME_TYPES = new Set([
    'application/vnd.oasis.opendocument.presentation'
  ]);
  const IWORK_KEYNOTE_MIME_TYPES = new Set([
    'application/vnd.apple.keynote',
    'application/x-iwork-keynote-sffkey'
  ]);
  const SPREADSHEET_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]);
  const PDF_MIME_TYPES = new Set(['application/pdf']);
  const EPUB_MIME_TYPES = new Set(['application/epub+zip']);
  const GAME_RESPONSE_JSON_SCHEMA = {
    name: 'ntw_berean_board',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'categories'],
      properties: {
        title: { type: 'string' },
        categories: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'clues'],
            properties: {
              title: { type: 'string' },
              clues: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['value', 'clue', 'correctResponse', 'explanation', 'sourceAnchor'],
                  properties: {
                    value: { type: 'integer', enum: BOARD_VALUES },
                    clue: { type: 'string' },
                    correctResponse: { type: 'string' },
                    explanation: { type: 'string' },
                    sourceAnchor: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const ANSWER_JUDGMENT_JSON_SCHEMA = {
    name: 'ntw_answer_judgment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'feedback'],
      properties: {
        verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
        feedback: { type: 'string' },
      },
    },
  };

  function getHostBuzzerAudioContextConstructor(root = ROOT) {
    if (!root) return null;
    if (typeof root.AudioContext === 'function') return root.AudioContext;
    if (typeof root.webkitAudioContext === 'function') return root.webkitAudioContext;
    return null;
  }

  function setAudioParamValue(param, value, time) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, time);
    } else if ('value' in param) {
      param.value = value;
    }
  }

  function linearRampAudioParam(param, value, time) {
    if (!param) return;
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(value, time);
    } else {
      setAudioParamValue(param, value, time);
    }
  }

  function exponentialRampAudioParam(param, value, time) {
    if (!param) return;
    const safeValue = Math.max(0.0001, Number(value) || 0.0001);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(safeValue, time);
    } else {
      setAudioParamValue(param, safeValue, time);
    }
  }

  function connectAudioNode(source, destination) {
    if (!source || !destination || typeof source.connect !== 'function') return false;
    try {
      source.connect(destination);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function configureHostBuzzerCompressor(compressor, startTime) {
    if (!compressor) return;
    setAudioParamValue(compressor.threshold, -18, startTime);
    setAudioParamValue(compressor.knee, 12, startTime);
    setAudioParamValue(compressor.ratio, 8, startTime);
    setAudioParamValue(compressor.attack, 0.003, startTime);
    setAudioParamValue(compressor.release, 0.18, startTime);
  }

  function playSilentHostBuzzerUnlock(audioContext) {
    if (!audioContext || typeof audioContext.createOscillator !== 'function' || typeof audioContext.createGain !== 'function' || !audioContext.destination) {
      return false;
    }
    try {
      const startTime = Number(audioContext.currentTime) || 0;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      setAudioParamValue(oscillator.frequency, 440, startTime);
      setAudioParamValue(gain.gain, 0.0001, startTime);
      connectAudioNode(oscillator, gain);
      connectAudioNode(gain, audioContext.destination);
      oscillator.start?.(startTime);
      oscillator.stop?.(startTime + 0.025);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function scheduleHostBuzzerSound(audioContext, { startTime, volume = HOST_BUZZER_SOUND_VOLUME } = {}) {
    if (!audioContext || typeof audioContext.createOscillator !== 'function' || typeof audioContext.createGain !== 'function' || !audioContext.destination) {
      return false;
    }
    try {
      const requestedStartTime = Number(startTime);
      const baseStartTime = Number.isFinite(requestedStartTime)
        ? requestedStartTime
        : (Number(audioContext.currentTime) || 0);
      const duration = HOST_BUZZER_SOUND_DURATION_SECONDS;
      const safeVolume = Math.max(0.04, Math.min(0.5, Number(volume) || HOST_BUZZER_SOUND_VOLUME));
      const masterGain = audioContext.createGain();
      const compressor = typeof audioContext.createDynamicsCompressor === 'function'
        ? audioContext.createDynamicsCompressor()
        : null;
      const filter = typeof audioContext.createBiquadFilter === 'function'
        ? audioContext.createBiquadFilter()
        : null;

      setAudioParamValue(masterGain.gain, 0.0001, baseStartTime);
      linearRampAudioParam(masterGain.gain, safeVolume, baseStartTime + 0.018);
      exponentialRampAudioParam(masterGain.gain, safeVolume * 0.26, baseStartTime + 0.16);
      linearRampAudioParam(masterGain.gain, safeVolume * 0.94, baseStartTime + 0.29);
      exponentialRampAudioParam(masterGain.gain, safeVolume * 0.32, baseStartTime + 0.48);
      linearRampAudioParam(masterGain.gain, safeVolume * 0.52, baseStartTime + 0.56);
      exponentialRampAudioParam(masterGain.gain, 0.0001, baseStartTime + duration);

      if (filter) {
        filter.type = 'lowpass';
        setAudioParamValue(filter.frequency, 3400, baseStartTime);
        exponentialRampAudioParam(filter.frequency, 1700, baseStartTime + duration);
        setAudioParamValue(filter.Q, 0.82, baseStartTime);
        connectAudioNode(filter, masterGain);
      }

      if (compressor) {
        configureHostBuzzerCompressor(compressor, baseStartTime);
        connectAudioNode(masterGain, compressor);
        connectAudioNode(compressor, audioContext.destination);
      } else {
        connectAudioNode(masterGain, audioContext.destination);
      }

      HOST_BUZZER_SOUND_VOICES.forEach((voice) => {
        const oscillator = audioContext.createOscillator();
        const voiceGain = audioContext.createGain();
        oscillator.type = voice.type;
        setAudioParamValue(oscillator.frequency, voice.startFrequency, baseStartTime);
        exponentialRampAudioParam(oscillator.frequency, voice.midFrequency, baseStartTime + 0.24);
        exponentialRampAudioParam(oscillator.frequency, voice.endFrequency, baseStartTime + duration - 0.04);
        setAudioParamValue(oscillator.detune, voice.detune, baseStartTime);
        setAudioParamValue(voiceGain.gain, Math.max(0.0001, voice.gain), baseStartTime);
        exponentialRampAudioParam(voiceGain.gain, 0.0001, baseStartTime + duration);
        connectAudioNode(oscillator, voiceGain);
        connectAudioNode(voiceGain, filter || masterGain);
        oscillator.start?.(baseStartTime);
        oscillator.stop?.(baseStartTime + duration + 0.035);
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  function createHostBuzzerAudioController({
    root = ROOT,
    volume = HOST_BUZZER_SOUND_VOLUME,
    minIntervalMs = HOST_BUZZER_SOUND_MIN_INTERVAL_MS,
    nowMs = () => Date.now(),
  } = {}) {
    const safeMinIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    let audioContext = null;
    let audioPrimed = false;
    let lastPlayedAtMs = Number.NEGATIVE_INFINITY;

    function getAudioContext() {
      if (audioContext) return audioContext;
      const AudioContextConstructor = getHostBuzzerAudioContextConstructor(root);
      if (!AudioContextConstructor) return null;
      try {
        audioContext = new AudioContextConstructor();
      } catch (_error) {
        audioContext = null;
      }
      return audioContext;
    }

    function resumeAudioContext(context) {
      if (!context || typeof context.resume !== 'function') return;
      if (context.state && context.state !== 'running' && context.state !== 'closed') {
        try {
          const resumeResult = context.resume();
          if (resumeResult && typeof resumeResult.catch === 'function') {
            resumeResult.catch(() => {});
          }
        } catch (_error) {
          // A later user gesture may be able to resume the context.
        }
      }
    }

    function prime() {
      try {
        const context = getAudioContext();
        if (!context) return false;
        resumeAudioContext(context);
        if (!audioPrimed) {
          playSilentHostBuzzerUnlock(context);
          audioPrimed = true;
        }
        return true;
      } catch (_error) {
        return false;
      }
    }

    function play() {
      try {
        const currentMs = Number(nowMs());
        const playStartedAtMs = Number.isFinite(currentMs) ? currentMs : Date.now();
        if (playStartedAtMs - lastPlayedAtMs < safeMinIntervalMs) return false;
        const context = getAudioContext();
        if (!context) return false;
        prime();
        const scheduled = scheduleHostBuzzerSound(context, { volume });
        if (scheduled) lastPlayedAtMs = playStartedAtMs;
        return scheduled;
      } catch (_error) {
        return false;
      }
    }

    return {
      isSupported() {
        return Boolean(getHostBuzzerAudioContextConstructor(root));
      },
      prime,
      play,
    };
  }

  function createPlayerScreenWakeLockController({ root = ROOT, documentRef = root?.document } = {}) {
    let wakeLockSentinel = null;
    let wakeLockRequestPromise = null;
    let shouldHoldWakeLock = false;

    function isSupported() {
      return typeof root?.navigator?.wakeLock?.request === 'function';
    }

    function pageIsVisible() {
      return !documentRef || (!documentRef.hidden && documentRef.visibilityState !== 'hidden');
    }

    async function releaseSentinel() {
      const sentinel = wakeLockSentinel;
      wakeLockSentinel = null;
      if (sentinel && typeof sentinel.release === 'function') {
        try {
          await sentinel.release();
        } catch (_error) {
          // A wake lock may already have been released by the browser.
        }
      }
    }

    async function request() {
      shouldHoldWakeLock = true;
      if (!isSupported() || !pageIsVisible()) return false;
      if (wakeLockSentinel) return true;
      if (wakeLockRequestPromise) return wakeLockRequestPromise;
      wakeLockRequestPromise = root.navigator.wakeLock.request('screen')
        .then(async (sentinel) => {
          if (!shouldHoldWakeLock || !pageIsVisible()) {
            if (typeof sentinel?.release === 'function') {
              try {
                await sentinel.release();
              } catch (_error) {
                // A wake lock may already have been released by the browser.
              }
            }
            return false;
          }
          wakeLockSentinel = sentinel;
          if (typeof sentinel?.addEventListener === 'function') {
            sentinel.addEventListener('release', () => {
              if (wakeLockSentinel === sentinel) wakeLockSentinel = null;
            });
          }
          return true;
        })
        .catch(() => false)
        .finally(() => {
          wakeLockRequestPromise = null;
        });
      return wakeLockRequestPromise;
    }

    async function handleVisibilityChange() {
      if (!shouldHoldWakeLock) return false;
      if (!pageIsVisible()) {
        await releaseSentinel();
        return false;
      }
      return request();
    }

    async function release() {
      shouldHoldWakeLock = false;
      if (wakeLockRequestPromise) {
        await wakeLockRequestPromise;
      }
      await releaseSentinel();
      return true;
    }

    return {
      isSupported,
      request,
      release,
      handleVisibilityChange,
    };
  }

  function getFileExtension(name) {
    const cleanName = String(name || '').toLowerCase();
    const dotIndex = cleanName.lastIndexOf('.');
    return dotIndex >= 0 ? cleanName.slice(dotIndex) : '';
  }

  function isTextLikeFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const extension = getFileExtension(file?.name);
    return TEXT_MIME_PREFIXES.some((prefix) => type.startsWith(prefix)) ||
      TEXT_MIME_TYPES.has(type) ||
      SUPPORTED_TEXT_EXTENSIONS.has(extension);
  }

  function isSupportedLessonFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const extension = getFileExtension(file?.name);
    return isTextLikeFile(file) ||
      PDF_MIME_TYPES.has(type) || extension === '.pdf' ||
      EPUB_MIME_TYPES.has(type) || extension === '.epub' ||
      DOCX_MIME_TYPES.has(type) || extension === '.docx' ||
      LEGACY_WORD_MIME_TYPES.has(type) || extension === '.doc' ||
      OPEN_DOCUMENT_TEXT_MIME_TYPES.has(type) || extension === '.odt' ||
      IWORK_PAGES_MIME_TYPES.has(type) || extension === '.pages' ||
      PPTX_MIME_TYPES.has(type) || extension === '.pptx' ||
      LEGACY_POWERPOINT_MIME_TYPES.has(type) || extension === '.ppt' ||
      OPEN_DOCUMENT_PRESENTATION_MIME_TYPES.has(type) || extension === '.odp' ||
      IWORK_KEYNOTE_MIME_TYPES.has(type) || extension === '.key' ||
      SPREADSHEET_MIME_TYPES.has(type) || ['.xlsx', '.xls', '.ods'].includes(extension) ||
      SUPPORTED_BINARY_EXTENSIONS.has(extension);
  }

  function addLessonFilesToSelection(currentFiles, additionalFiles) {
    return [
      ...Array.from(currentFiles || []),
      ...Array.from(additionalFiles || []),
    ];
  }

  function dataTransferListToArray(list) {
    if (!list) return [];
    try {
      const values = Array.from(list);
      if (values.length > 0) return values;
    } catch (_error) {
      // Some browser-provided drag lists are only array-like.
    }
    const length = Number(list.length) || 0;
    const values = [];
    for (let index = 0; index < length; index += 1) {
      const item = typeof list.item === 'function' ? list.item(index) : list[index];
      if (item !== undefined && item !== null) values.push(item);
    }
    return values;
  }

  function dataTransferTypesIncludeFileMarker(types) {
    if (!types) return false;
    if (typeof types.includes === 'function' && (types.includes('Files') || types.includes('files'))) return true;
    if (typeof types.contains === 'function' && (types.contains('Files') || types.contains('files'))) return true;
    const fileTypeMarkers = new Set(['files', 'application/x-moz-file', 'application/x-moz-file-promise', 'public.file-url']);
    return dataTransferListToArray(types)
      .some((type) => fileTypeMarkers.has(String(type || '').toLowerCase()));
  }

  function dataTransferItemsIncludeFile(items) {
    return dataTransferListToArray(items)
      .some((item) => String(item?.kind || '').toLowerCase() === 'file');
  }

  function fileDragEventHasFiles(event) {
    const dataTransfer = event?.dataTransfer;
    if (!dataTransfer) return false;
    const { types, files, items } = dataTransfer;
    if (dataTransferTypesIncludeFileMarker(types)) return true;
    if (dataTransferItemsIncludeFile(items)) return true;
    return Boolean(files && files.length > 0);
  }

  function dragEventIsInsideElement(event, element) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    const rect = element?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function removeLessonFileAtIndex(files, index) {
    const list = Array.from(files || []);
    const normalizedIndex = Number(index);
    if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= list.length) {
      return list;
    }
    return list.filter((_, fileIndex) => fileIndex !== normalizedIndex);
  }

  function normalizeContestantName(name, index) {
    const normalized = String(name || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      throw new Error(`Contestant ${index + 1} needs a name.`);
    }
    if (normalized.length > 40) {
      throw new Error(`Contestant ${index + 1}'s name must be 40 characters or fewer.`);
    }
    return normalized;
  }

  function configureContestantNameInputs(inputs) {
    const list = Array.from(inputs || []);
    list.forEach((input, index) => {
      const isRequired = index < 2;
      input.required = isRequired;
      if (isRequired) {
        input.setAttribute?.('aria-required', 'true');
      } else {
        input.removeAttribute?.('aria-required');
      }
    });
    return list;
  }

  function getResponseEntryControlState({ hasSelectedContestant, clueIsComplete, responseCheckInFlight }) {
    const selected = Boolean(hasSelectedContestant);
    const complete = Boolean(clueIsComplete);
    const pending = Boolean(responseCheckInFlight);
    const responseDisabled = !selected || complete || pending;
    return {
      responseSectionHidden: !selected || complete,
      responseInputDisabled: responseDisabled,
      checkResponseButtonDisabled: responseDisabled,
      noBuzzButtonDisabled: complete || pending,
      contestantChoicesDisabled: complete || pending,
    };
  }

  function canHandleNoBuzz({ activeClue, responseCheckInFlight }) {
    return Boolean(activeClue && !activeClue.completed && !responseCheckInFlight);
  }

  function activeClueHasAttempts(activeClue) {
    return Array.isArray(activeClue?.attemptedContestantIds) && activeClue.attemptedContestantIds.length > 0;
  }

  function canCloseActiveClue({ activeClue, responseCheckInFlight, hasSelectedContestant = false } = {}) {
    if (!activeClue || responseCheckInFlight) return false;
    if (activeClue.completed) return true;
    return !hasSelectedContestant && !activeClueHasAttempts(activeClue);
  }

  function getActiveClueNavigationControlState({ activeClue, responseCheckInFlight, hasSelectedContestant = false } = {}) {
    return {
      closeClueButtonDisabled: !canCloseActiveClue({ activeClue, responseCheckInFlight, hasSelectedContestant }),
    };
  }

  function calculateClueModalScale({ availableWidth, availableHeight, contentWidth, contentHeight }) {
    const safeAvailableWidth = Number(availableWidth);
    const safeAvailableHeight = Number(availableHeight);
    const safeContentWidth = Number(contentWidth);
    const safeContentHeight = Number(contentHeight);
    if (![safeAvailableWidth, safeAvailableHeight, safeContentWidth, safeContentHeight].every(Number.isFinite)) {
      return 1;
    }
    if (safeAvailableWidth <= 0 || safeAvailableHeight <= 0 || safeContentWidth <= 0 || safeContentHeight <= 0) {
      return 1;
    }
    const rawScale = Math.min(1, safeAvailableWidth / safeContentWidth, safeAvailableHeight / safeContentHeight);
    if (rawScale >= 0.001) {
      return Math.max(0.001, Math.min(1, Math.floor(rawScale * 1000) / 1000));
    }
    return rawScale;
  }

  function formatClueModalScaleForCss(scale) {
    const safeScale = Number(scale);
    if (!Number.isFinite(safeScale) || safeScale <= 0) {
      return '1';
    }
    const boundedScale = Math.min(1, safeScale);
    const formatted = boundedScale >= 0.001
      ? String(Math.floor(boundedScale * 1000) / 1000)
      : boundedScale.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
    return formatted && formatted !== '0' ? formatted : '0.000000000001';
  }

  function getContestantChoiceRenderState({ contestantId, selectedContestantId, attemptedIds, clueIsComplete, responseCheckInFlight }) {
    const contestantIdText = String(contestantId || '');
    const attempted = Array.isArray(attemptedIds) && attemptedIds.map(String).includes(contestantIdText);
    const controlState = getResponseEntryControlState({
      hasSelectedContestant: true,
      clueIsComplete,
      responseCheckInFlight,
    });
    return {
      attempted,
      checked: contestantIdText !== '' && String(selectedContestantId || '') === contestantIdText && !attempted,
      disabled: attempted || controlState.contestantChoicesDisabled,
      choicesDisabled: controlState.contestantChoicesDisabled,
    };
  }

  function clearContestantChoiceSelection(inputs) {
    const list = Array.from(inputs || []);
    list.forEach((input) => {
      if (input) input.checked = false;
    });
    return list;
  }

  function buildAnswerVerdictPresentation({ result, contestantName }) {
    const name = coerceText(contestantName, 'The contestant') || 'The contestant';
    const awardedPoints = Number(result?.awardedPoints || 0);
    const points = formatScore(Math.abs(awardedPoints));
    const answerShown = Boolean(result?.answerShouldBeRevealed);

    if (result?.noBuzz) {
      return {
        label: 'No Buzz',
        className: 'clue-verdict clue-verdict--neutral',
        message: 'No one buzzed in. No points changed. The correct answer is shown below.',
      };
    }

    const verdict = normalizeAnswerJudgment(result?.judgment || { verdict: result?.isCorrect ? 'correct' : 'incorrect' }).verdict;
    if (verdict === 'correct') {
      return {
        label: 'Correct',
        className: 'clue-verdict clue-verdict--correct',
        message: `Correct — ${name}'s response was accepted. ${points} awarded. The correct answer is shown below.`,
      };
    }
    if (verdict === 'partial') {
      return {
        label: 'Partial Credit',
        className: 'clue-verdict clue-verdict--partial',
        message: answerShown
          ? `Partial credit — ${name} received ${points}. All contestants have attempted this clue, so the correct answer is shown below.`
          : `Partial credit — ${name} received ${points}. The clue remains open for another buzzer.`,
      };
    }
    return {
      label: 'Incorrect',
      className: 'clue-verdict clue-verdict--incorrect',
      message: answerShown
        ? `Incorrect — ${name}'s response was not accepted. ${points} subtracted. The correct answer is shown below.`
        : `Incorrect — ${name}'s response was not accepted. ${points} subtracted. Call on another buzzer.`,
    };
  }

  function formatContestantNames(names) {
    const cleanNames = Array.from(names || []).map((name) => coerceText(name)).filter(Boolean);
    if (cleanNames.length === 0) return '';
    if (cleanNames.length === 1) return cleanNames[0];
    if (cleanNames.length === 2) return `${cleanNames[0]} and ${cleanNames[1]}`;
    return `${cleanNames.slice(0, -1).join(', ')}, and ${cleanNames[cleanNames.length - 1]}`;
  }

  function buildContestantNameLookup(contestants) {
    const lookup = new Map();
    (Array.isArray(contestants) ? contestants : []).forEach((contestant) => {
      const id = String(contestant?.id || '');
      if (!id) return;
      lookup.set(id, coerceText(contestant?.name, id) || id);
    });
    return lookup;
  }

  function normalizePartialCreditAwards(clue) {
    const explicitAwards = Array.isArray(clue?.partialCreditAwards)
      ? clue.partialCreditAwards
      : [];
    if (explicitAwards.length > 0) {
      const awardsByContestantId = new Map();
      explicitAwards.forEach((award) => {
        const contestantId = coerceText(award?.contestantId ?? award?.contestant_id ?? award?.id);
        const points = Math.max(0, Number(award?.points ?? award?.awardedPoints ?? award?.awarded_points ?? 0));
        if (!contestantId || points <= 0) return;
        awardsByContestantId.set(contestantId, (awardsByContestantId.get(contestantId) || 0) + points);
      });
      return Array.from(awardsByContestantId, ([contestantId, points]) => ({ contestantId, points }));
    }

    const partialCreditIds = Array.isArray(clue?.partialCreditContestantIds)
      ? [...new Set(clue.partialCreditContestantIds.map(String).filter(Boolean))]
      : [];
    const partialCreditAwarded = Math.max(0, Number(clue?.partialCreditAwarded || 0));
    if (partialCreditIds.length === 0 || partialCreditAwarded <= 0) return [];
    const fallbackPoints = partialCreditAwarded / partialCreditIds.length;
    return partialCreditIds.map((contestantId) => ({ contestantId, points: fallbackPoints }));
  }

  function normalizeNoCreditAwards(clue) {
    const explicitAwards = Array.isArray(clue?.noCreditAwards)
      ? clue.noCreditAwards
      : [];
    const awardsByContestantId = new Map();
    explicitAwards.forEach((award) => {
      const contestantId = coerceText(award?.contestantId ?? award?.contestant_id ?? award?.id);
      const rawPoints = award?.points ?? award?.awardedPoints ?? award?.awarded_points ?? award?.pointsDelta ?? award?.points_delta ?? award?.delta;
      const points = Number(rawPoints ?? 0);
      if (!contestantId || !Number.isFinite(points) || points > 0) return;
      awardsByContestantId.set(contestantId, addScoreValues(awardsByContestantId.get(contestantId) || 0, points));
    });
    return Array.from(awardsByContestantId, ([contestantId, points]) => ({ contestantId, points }));
  }

  function buildCompletedClueReviewPresentation({ clue, contestants } = {}) {
    const outcome = getClueBoardCompletionOutcome(clue);
    const nameLookup = buildContestantNameLookup(contestants);
    const nameForId = (id) => nameLookup.get(String(id || '')) || 'Unknown contestant';
    const winningContestantId = String(clue?.winningContestantId || '').trim();
    const attemptedIds = Array.isArray(clue?.attemptedContestantIds)
      ? [...new Set(clue.attemptedContestantIds.map(String).filter(Boolean))]
      : [];
    const partialCreditAwards = normalizePartialCreditAwards(clue);
    const partialCreditIds = partialCreditAwards.map((award) => award.contestantId);
    const creditLines = [];

    if (winningContestantId) {
      creditLines.push(`${nameForId(winningContestantId)} received ${formatScore(getWinningCreditAward(clue))} for the accepted answer.`);
    }

    partialCreditAwards.forEach((award) => {
      creditLines.push(`${nameForId(award.contestantId)} received ${formatScore(award.points)} partial credit.`);
    });

    const noCreditAttemptIds = attemptedIds.filter((contestantId) => contestantId !== winningContestantId && !partialCreditIds.includes(contestantId));
    if (noCreditAttemptIds.length > 0) {
      creditLines.push(`${formatContestantNames(noCreditAttemptIds.map(nameForId))} attempted without receiving credit.`);
    }

    if (outcome === 'partial') {
      creditLines.push('No contestant supplied the full expected answer.');
    }

    if (creditLines.length === 0) {
      creditLines.push(clue?.noContestantsBuzzed
        ? 'No one buzzed in. No credit was awarded.'
        : 'No credit was awarded.');
    }

    if (clue?.hostOverrideApplied) {
      creditLines.push('The human host overrode the automated NTW decision for this clue.');
    }

    if (outcome === 'correct') {
      return {
        label: 'Correct',
        className: 'clue-verdict clue-verdict--correct',
        message: 'Correct answer accepted. Review the right answer, source, and credit below.',
        creditSummary: creditLines.join(' '),
      };
    }

    if (outcome === 'partial') {
      return {
        label: 'Partial Credit',
        className: 'clue-verdict clue-verdict--partial',
        message: 'Partial credit only. Review the right answer, source, and credit below.',
        creditSummary: creditLines.join(' '),
      };
    }

    return {
      label: 'No Credit',
      className: 'clue-verdict clue-verdict--incorrect',
      message: 'No credit awarded. Review the right answer, source, and credit below.',
      creditSummary: creditLines.join(' '),
    };
  }

  function createContestants(names) {
    if (!Array.isArray(names)) {
      throw new Error('Please supply one to four selected player names.');
    }
    const suppliedNames = normalizeGroupMemberList(names, { allowEmpty: true });
    if (suppliedNames.length < 1 || suppliedNames.length > 4) {
      throw new Error('Please supply one to four selected player names.');
    }
    return suppliedNames.map((name, index) => ({
      id: `contestant-${index + 1}`,
      name: normalizeContestantName(name, index),
      score: 0,
    }));
  }

  function normalizeGroupMemberName(name, index) {
    const normalized = coerceText(name);
    if (!normalized) {
      throw new Error(`Group member ${index + 1} needs a name.`);
    }
    if (normalized.length > 40) {
      throw new Error(`Group member ${index + 1}'s name must be 40 characters or fewer.`);
    }
    return normalized;
  }

  function normalizeGroupMemberList(names, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const source = Array.isArray(names) ? names : [];
    const normalizedNames = [];
    const seen = new Set();
    source.forEach((name, index) => {
      const raw = coerceText(name);
      if (!raw) return;
      const normalized = normalizeGroupMemberName(raw, index);
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalizedNames.push(normalized);
    });
    if (!allowEmpty && normalizedNames.length === 0) {
      throw new Error('Enter at least one group member name.');
    }
    return normalizedNames;
  }

  function parseGroupMemberNames(text) {
    const parts = String(text || '').split(',');
    return normalizeGroupMemberList(parts);
  }

  function createGroupAttendance(names) {
    return normalizeGroupMemberList(names).map((name) => ({ name, checked: true }));
  }

  function getCheckedGroupMemberNames(attendanceEntries) {
    const entries = Array.isArray(attendanceEntries) ? attendanceEntries : [];
    return normalizeGroupMemberList(
      entries
        .filter((entry) => Boolean(entry?.checked))
        .map((entry) => entry.name),
      { allowEmpty: true }
    );
  }

  function resolvePlayerSelection({ attendingNames, chosenPlayerNames }) {
    const attending = normalizeGroupMemberList(attendingNames || [], { allowEmpty: true });
    if (attending.length === 0) {
      return {
        attendingNames: attending,
        playerNames: [],
        needsPlayerPick: false,
        canContinue: false,
        message: 'Check at least one attending group member before continuing.',
      };
    }
    if (attending.length <= 4) {
      return {
        attendingNames: attending,
        playerNames: attending,
        needsPlayerPick: false,
        canContinue: true,
        message: `${attending.length} ${attending.length === 1 ? 'player is' : 'players are'} selected for this game.`,
      };
    }

    const attendingKeys = new Set(attending.map((name) => name.toLowerCase()));
    const chosen = normalizeGroupMemberList(chosenPlayerNames || [], { allowEmpty: true })
      .filter((name) => attendingKeys.has(name.toLowerCase()));
    const canContinue = chosen.length === 4;
    return {
      attendingNames: attending,
      playerNames: canContinue ? chosen : [],
      needsPlayerPick: true,
      canContinue,
      message: canContinue
        ? `Four players are selected: ${chosen.join(', ')}.`
        : 'More than four group members are present. Pick exactly four players, or let Berean Board choose four randomly.',
    };
  }

  function selectRandomPlayers(names, random = Math.random) {
    const pool = normalizeGroupMemberList(names || [], { allowEmpty: true });
    if (pool.length <= 4) {
      return pool;
    }
    return pool
      .map((name, index) => {
        const rank = Number(random());
        return {
          name,
          index,
          rank: Number.isFinite(rank) ? rank : 1,
        };
      })
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, 4)
      .map((entry) => entry.name);
  }

  function normalizePlayerNameListForComparison(names) {
    return normalizeGroupMemberList(names || [], { allowEmpty: true });
  }

  function playerNameListsMatch(firstNames, secondNames) {
    const first = normalizePlayerNameListForComparison(firstNames);
    const second = normalizePlayerNameListForComparison(secondNames);
    return first.length === second.length && first.every((name, index) => name === second[index]);
  }

  function shouldResetGeneratedGameForPlayerSelectionChange({ currentPlayerNames, nextPlayerNames, hasGeneratedGame }) {
    if (!hasGeneratedGame) {
      return false;
    }
    return !playerNameListsMatch(currentPlayerNames || [], nextPlayerNames || []);
  }

  function shouldResetVirtualBuzzersForPlayerSelectionChange({ currentPlayerNames, nextPlayerNames, hasVirtualSession, selectedBuzzerMode, buzzerSetupComplete }) {
    const hasVirtualBuzzerState = Boolean(hasVirtualSession || (buzzerSetupComplete && selectedBuzzerMode === 'virtual'));
    if (!hasVirtualBuzzerState) {
      return false;
    }
    return !playerNameListsMatch(currentPlayerNames || [], nextPlayerNames || []);
  }

  function normalizeDifficultyKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  }

  function getDifficultyLevelConfig(value) {
    const key = normalizeDifficultyKey(value);
    if (!key) return null;
    return DIFFICULTY_LEVELS.find((difficulty) => (
      difficulty.value === key ||
      normalizeDifficultyKey(difficulty.level) === key ||
      normalizeDifficultyKey(difficulty.name) === key
    )) || null;
  }

  function requireDifficultyLevel(value) {
    const difficulty = getDifficultyLevelConfig(value);
    if (!difficulty) {
      throw new Error('Select a Berean Board difficulty level before continuing.');
    }
    return difficulty;
  }

  function getDifficultyLevelSummary(value) {
    const difficulty = getDifficultyLevelConfig(value) || getDifficultyLevelConfig(DEFAULT_DIFFICULTY_LEVEL);
    return `${difficulty.level} — ${difficulty.name} (${difficulty.gradeRange})`;
  }

  function normalizeBuzzerModeKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  }

  function getBuzzerModeConfig(value) {
    const key = normalizeBuzzerModeKey(value);
    if (!key) return null;
    return BUZZER_MODES.find((mode) => (
      mode.value === key ||
      normalizeBuzzerModeKey(mode.label) === key ||
      normalizeBuzzerModeKey(mode.name) === key
    )) || null;
  }

  function requireBuzzerMode(value) {
    const mode = getBuzzerModeConfig(value);
    if (!mode) {
      throw new Error('Choose an in-person or virtual buzzer mode before continuing.');
    }
    return mode;
  }

  function getBuzzerColorForPlayerIndex(playerIndex) {
    const index = Number(playerIndex);
    if (!Number.isInteger(index)) return BUZZER_COLORS[0];
    return BUZZER_COLORS[Math.max(0, Math.min(BUZZER_COLORS.length - 1, index))];
  }

  function getBuzzerColorForContestantId(contestantId) {
    const match = String(contestantId || '').match(/contestant-(\d+)/);
    const index = match ? Number(match[1]) - 1 : 0;
    return getBuzzerColorForPlayerIndex(index);
  }

  function getContestantIdForPlayerIndex(playerIndex) {
    const index = Number(playerIndex);
    return Number.isInteger(index) && index >= 0 ? `contestant-${index + 1}` : '';
  }

  function getPlayerIndexForContestantId(contestantId) {
    const match = String(contestantId || '').match(/contestant-(\d+)/);
    if (!match) return -1;
    const index = Number(match[1]) - 1;
    return Number.isInteger(index) && index >= 0 && index < 4 ? index : -1;
  }

  function isVirtualBuzzerPlayerRoute(locationRef) {
    const search = String(locationRef?.search || '');
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.get('mode') === 'buzz' && Boolean(params.get('session'));
  }

  function getVirtualBuzzerSessionIdFromLocation(locationRef) {
    const search = String(locationRef?.search || '');
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return String(params.get('session') || '').trim();
  }

  function buildDifficultyGenerationInstructions(value) {
    const difficulty = getDifficultyLevelConfig(value) || getDifficultyLevelConfig(DEFAULT_DIFFICULTY_LEVEL);
    return [
      `Difficulty level: ${difficulty.level}`,
      `Difficulty name: ${difficulty.name}`,
      `Target Flesch-Kincaid grade level: ${difficulty.gradeRange}`,
      `Theological complexity and readability guidance: ${difficulty.guidance}`,
    ].join('\n');
  }

  function getSetupStepExpansionState(stage) {
    switch (stage) {
      case 'buzzer':
        return {
          groupExpanded: false,
          buzzerExpanded: true,
          lessonExpanded: false,
          difficultyExpanded: false,
          apiExpanded: false,
          buzzerAvailable: true,
          lessonAvailable: false,
          difficultyAvailable: false,
          apiAvailable: false,
        };
      case 'lesson':
        return {
          groupExpanded: false,
          buzzerExpanded: false,
          lessonExpanded: true,
          difficultyExpanded: false,
          apiExpanded: false,
          buzzerAvailable: true,
          lessonAvailable: true,
          difficultyAvailable: false,
          apiAvailable: false,
        };
      case 'difficulty':
        return {
          groupExpanded: false,
          buzzerExpanded: false,
          lessonExpanded: false,
          difficultyExpanded: true,
          apiExpanded: false,
          buzzerAvailable: true,
          lessonAvailable: true,
          difficultyAvailable: true,
          apiAvailable: false,
        };
      case 'api':
        return {
          groupExpanded: false,
          buzzerExpanded: false,
          lessonExpanded: false,
          difficultyExpanded: false,
          apiExpanded: true,
          buzzerAvailable: true,
          lessonAvailable: true,
          difficultyAvailable: true,
          apiAvailable: true,
        };
      case 'game':
        return {
          groupExpanded: false,
          buzzerExpanded: false,
          lessonExpanded: false,
          difficultyExpanded: false,
          apiExpanded: false,
          buzzerAvailable: true,
          lessonAvailable: true,
          difficultyAvailable: true,
          apiAvailable: true,
        };
      case 'group':
      default:
        return {
          groupExpanded: true,
          buzzerExpanded: false,
          lessonExpanded: false,
          difficultyExpanded: false,
          apiExpanded: false,
          buzzerAvailable: false,
          lessonAvailable: false,
          difficultyAvailable: false,
          apiAvailable: false,
        };
    }
  }

  function serializeGroupMembersCookieValue(names) {
    const normalizedNames = normalizeGroupMemberList(names || [], { allowEmpty: true });
    return encodeURIComponent(JSON.stringify(normalizedNames));
  }

  function buildSavedGroupMembersCookie(names, options = {}) {
    const maxAge = Number.isFinite(Number(options.maxAgeSeconds))
      ? Math.max(0, Math.floor(Number(options.maxAgeSeconds)))
      : GROUP_MEMBERS_COOKIE_MAX_AGE_SECONDS;
    return `${GROUP_MEMBERS_COOKIE_NAME}=${serializeGroupMembersCookieValue(names)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  }

  function buildClearGroupMembersCookie() {
    return `${GROUP_MEMBERS_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  }

  function readSavedGroupMembersCookie(cookieString) {
    const source = String(cookieString || '');
    const pairs = source.split(';').map((part) => part.trim()).filter(Boolean);
    const prefix = `${GROUP_MEMBERS_COOKIE_NAME}=`;
    const pair = pairs.find((item) => item.startsWith(prefix));
    if (!pair) {
      return [];
    }
    try {
      const rawValue = pair.slice(prefix.length);
      if (!rawValue) return [];
      const parsed = JSON.parse(decodeURIComponent(rawValue));
      return Array.isArray(parsed)
        ? normalizeGroupMemberList(parsed, { allowEmpty: true })
        : [];
    } catch (_error) {
      return [];
    }
  }

  function writeSavedGroupMembersCookie(names, documentRef = typeof document !== 'undefined' ? document : null) {
    if (!documentRef) return '';
    const cookie = buildSavedGroupMembersCookie(names);
    documentRef.cookie = cookie;
    return cookie;
  }

  function clearSavedGroupMembersCookie(documentRef = typeof document !== 'undefined' ? document : null) {
    if (!documentRef) return '';
    const cookie = buildClearGroupMembersCookie();
    documentRef.cookie = cookie;
    return cookie;
  }

  function safeGetBrowserStorageItem(windowRef, key, fallback = '') {
    try {
      const storage = windowRef?.localStorage;
      if (!storage || typeof storage.getItem !== 'function') {
        return fallback;
      }
      return storage.getItem(key) || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function safeSetBrowserStorageItem(windowRef, key, value) {
    try {
      const storage = windowRef?.localStorage;
      if (!storage || typeof storage.setItem !== 'function') {
        return false;
      }
      storage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function coerceText(value, fallback = '') {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    if (value == null) {
      return fallback;
    }
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeLongFormText(value) {
    return String(value || '')
      .replaceAll(String.fromCharCode(13), '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function pickText(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source?.[key];
      const text = coerceText(value);
      if (text) {
        return text;
      }
    }
    return fallback;
  }

  function normalizeGeneratedGame(rawGame) {
    if (!rawGame || typeof rawGame !== 'object') {
      throw new Error('The NTW API response did not contain a game object.');
    }

    const rawCategories = Array.isArray(rawGame.categories) ? rawGame.categories : [];
    if (rawCategories.length !== 5) {
      throw new Error('The generated game must contain exactly five categories.');
    }

    const categories = rawCategories.map((category, categoryIndex) => {
      const title = pickText(category, ['title', 'name', 'category'], `Category ${categoryIndex + 1}`);
      const rawClues = Array.isArray(category?.clues) ? category.clues : [];
      if (rawClues.length !== 5) {
        throw new Error(`Category "${title}" must contain exactly five clues.`);
      }

      return {
        id: `category-${categoryIndex + 1}`,
        title,
        clues: rawClues.map((rawClue, clueIndex) => {
          const value = Number(rawClue?.value || BOARD_VALUES[clueIndex]);
          const expectedValue = BOARD_VALUES[clueIndex];
          if (!Number.isFinite(value) || value !== expectedValue) {
            throw new Error(`Clue ${clueIndex + 1} in "${title}" must have value ${expectedValue}.`);
          }

          const clue = pickText(rawClue, ['clue', 'prompt', 'question']);
          const correctResponse = pickText(rawClue, ['correctResponse', 'correct_response', 'answer', 'response']);
          const explanation = pickText(rawClue, ['explanation', 'rationale', 'teachingNote'], 'No explanation supplied.');
          const sourceAnchor = pickText(rawClue, ['sourceAnchor', 'source_anchor', 'source', 'reference'], 'Uploaded lesson content');

          if (!clue) {
            throw new Error(`Clue ${clueIndex + 1} in "${title}" is missing clue text.`);
          }
          if (!correctResponse) {
            throw new Error(`Clue ${clueIndex + 1} in "${title}" is missing a correct response.`);
          }

          return {
            id: `category-${categoryIndex + 1}-clue-${clueIndex + 1}`,
            categoryId: `category-${categoryIndex + 1}`,
            value,
            clue,
            correctResponse,
            explanation,
            sourceAnchor,
            completed: Boolean(rawClue?.completed),
            attemptedContestantIds: Array.isArray(rawClue?.attemptedContestantIds)
              ? [...new Set(rawClue.attemptedContestantIds.map(String))]
              : [],
            winningContestantId: rawClue?.winningContestantId ? String(rawClue.winningContestantId) : '',
            winningAwardPoints: rawClue?.winningAwardPoints == null || rawClue?.winningAwardPoints === ''
              ? null
              : Number(rawClue.winningAwardPoints),
            allContestantsMissed: Boolean(rawClue?.allContestantsMissed),
            noContestantsBuzzed: Boolean(rawClue?.noContestantsBuzzed),
            hostOverrideApplied: Boolean(rawClue?.hostOverrideApplied),
            hostOverrideDecision: coerceText(rawClue?.hostOverrideDecision),
            hostOverrideUpdatedAt: coerceText(rawClue?.hostOverrideUpdatedAt),
            completedAt: coerceText(rawClue?.completedAt),
            partialCreditAwarded: Math.max(0, Number(rawClue?.partialCreditAwarded || 0)),
            partialCreditContestantIds: Array.isArray(rawClue?.partialCreditContestantIds)
              ? [...new Set(rawClue.partialCreditContestantIds.map(String))]
              : [],
            partialCreditAwards: normalizePartialCreditAwards(rawClue),
            noCreditAwards: normalizeNoCreditAwards(rawClue),
          };
        }),
      };
    });

    return {
      title: pickText(rawGame, ['title', 'name'], 'Berean Board Lesson Review'),
      categories,
      generatedAt: rawGame.generatedAt || new Date().toISOString(),
    };
  }

  function cloneContestants(contestants) {
    return contestants.map((contestant) => ({ ...contestant }));
  }

  function applyScoreDecision({ contestants, clue, contestantId, decision }) {
    if (!Array.isArray(contestants)) {
      throw new Error('Contestants are required for scorekeeping.');
    }
    if (!clue || typeof clue !== 'object') {
      throw new Error('A clue is required for scorekeeping.');
    }
    const normalizedDecision = String(decision || '').toLowerCase();
    const nextContestants = cloneContestants(contestants);
    const nextClue = {
      ...clue,
      attemptedContestantIds: Array.isArray(clue.attemptedContestantIds)
        ? [...clue.attemptedContestantIds]
        : [],
      noCreditAwards: normalizeNoCreditAwards(clue),
    };

    if (normalizedDecision === 'reveal' || normalizedDecision === 'pass') {
      nextClue.completed = true;
      return { contestants: nextContestants, clue: nextClue };
    }

    const contestantIndex = nextContestants.findIndex((contestant) => contestant.id === contestantId);
    if (contestantIndex < 0) {
      throw new Error('Select the contestant who answered before marking right or wrong.');
    }

    if (normalizedDecision === 'correct') {
      applyContestantScoreDelta(nextContestants[contestantIndex], Number(clue.value || 0));
      nextClue.completed = true;
      nextClue.winningContestantId = contestantId;
      return { contestants: nextContestants, clue: nextClue };
    }

    if (normalizedDecision === 'wrong') {
      const awardedPoints = -Number(clue.value || 0);
      applyContestantScoreDelta(nextContestants[contestantIndex], awardedPoints);
      if (!nextClue.attemptedContestantIds.includes(contestantId)) {
        nextClue.attemptedContestantIds.push(contestantId);
      }
      nextClue.noCreditAwards.push({ contestantId, points: awardedPoints });
      nextClue.completed = false;
      return { contestants: nextContestants, clue: nextClue };
    }

    throw new Error(`Unknown scorekeeping decision: ${decision}`);
  }

  function normalizeJudgmentVerdict(value) {
    if (typeof value === 'boolean') {
      return value ? 'correct' : 'incorrect';
    }
    if (typeof value === 'number') {
      return value > 0 ? 'correct' : 'incorrect';
    }
    const normalized = coerceText(value).toLowerCase().replace(/[\s_-]+/g, ' ');
    if (!normalized) return '';
    if (/^(true|yes|right|correct|full|full credit|acceptable|accepted|reasonable|reasonably correct|conceptually correct)\b/.test(normalized)) {
      return 'correct';
    }
    if (/^(partial|partly|partially correct|partial credit|biblically sound|sound but not expected|sound not expected)\b/.test(normalized)) {
      return 'partial';
    }
    if (/^(false|no|wrong|incorrect|none|no credit|not correct|not enough|not acceptable)\b/.test(normalized)) {
      return 'incorrect';
    }
    return '';
  }

  function coerceJudgmentBoolean(value) {
    const verdict = normalizeJudgmentVerdict(value);
    if (verdict === 'correct') return true;
    if (verdict === 'incorrect') return false;
    if (verdict === 'partial') return false;
    const normalized = coerceText(value).toLowerCase();
    if (!normalized) {
      throw new Error('The NTW answer check did not say whether the response was correct.');
    }
    throw new Error('The NTW answer check returned an unclear correctness value.');
  }

  function normalizePartialCreditFraction(rawJudgment, verdict) {
    if (verdict !== 'partial') return 0;
    const rawValue = rawJudgment.partialCreditFraction ??
      rawJudgment.partial_credit_fraction ??
      rawJudgment.partialCreditPercent ??
      rawJudgment.partial_credit_percent ??
      rawJudgment.partialCredit ??
      rawJudgment.creditPercent;
    if (rawValue === true || rawValue == null || rawValue === '') {
      return LEGACY_PARTIAL_CREDIT_FRACTION;
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return LEGACY_PARTIAL_CREDIT_FRACTION;
    }
    const fraction = numeric > 1 ? numeric / 100 : numeric;
    return Math.min(LEGACY_PARTIAL_CREDIT_FRACTION, Math.max(0, fraction));
  }

  function normalizeAnswerJudgmentInput({ isCorrect, judgment } = {}) {
    if (judgment && typeof judgment === 'object') {
      return normalizeAnswerJudgment(judgment);
    }
    return normalizeAnswerJudgment({ isCorrect });
  }

  function scoreToCents(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100);
  }

  function centsToScore(cents) {
    const numeric = Number(cents || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric) / 100;
  }

  function addScoreValues(left, right) {
    return centsToScore(scoreToCents(left) + scoreToCents(right));
  }

  function applyContestantScoreDelta(contestant, points) {
    if (!contestant || typeof contestant !== 'object') return;
    contestant.score = addScoreValues(contestant.score, points);
  }

  function getAdaptivePartialCreditAward({ clue, contestantCount }) {
    const clueCents = Math.max(0, scoreToCents(clue?.value));
    const activeContestants = Math.max(1, Number(contestantCount) || 1);
    return centsToScore(Math.floor(clueCents / (activeContestants + 1)));
  }

  function getPartialCreditAward({ clue, contestantCount }) {
    return getAdaptivePartialCreditAward({ clue, contestantCount });
  }

  function getFullCreditAward(clue) {
    const clueCents = Math.max(0, scoreToCents(clue?.value));
    const alreadyAwardedCents = Math.max(0, scoreToCents(clue?.partialCreditAwarded));
    return centsToScore(Math.max(0, clueCents - alreadyAwardedCents));
  }

  function getWinningCreditAward(clue) {
    const explicitAward = clue?.winningAwardPoints;
    if (explicitAward !== null && explicitAward !== undefined && explicitAward !== '') {
      const numericAward = Number(explicitAward);
      if (Number.isFinite(numericAward)) return numericAward;
    }
    return getFullCreditAward(clue);
  }

  function addContestantDelta(deltas, contestantId, points) {
    const id = String(contestantId || '').trim();
    const value = Number(points || 0);
    if (!id || !Number.isFinite(value) || value === 0) return;
    deltas.set(id, addScoreValues(deltas.get(id) || 0, value));
  }

  function getClueScoreDeltas(clue) {
    const deltas = new Map();
    const clueValue = Number(clue?.value || 0);
    const winningContestantId = String(clue?.winningContestantId || '').trim();
    const partialCreditAwards = normalizePartialCreditAwards(clue);
    const partialCreditIds = new Set(partialCreditAwards.map((award) => String(award.contestantId || '')));
    const noCreditAwards = normalizeNoCreditAwards(clue);
    const noCreditAwardIds = new Set(noCreditAwards.map((award) => String(award.contestantId || '')));
    partialCreditAwards.forEach((award) => {
      addContestantDelta(deltas, award.contestantId, award.points);
    });
    noCreditAwards.forEach((award) => {
      addContestantDelta(deltas, award.contestantId, award.points);
    });
    if (winningContestantId) {
      addContestantDelta(deltas, winningContestantId, getWinningCreditAward(clue));
    }
    const attemptedIds = Array.isArray(clue?.attemptedContestantIds)
      ? [...new Set(clue.attemptedContestantIds.map(String).filter(Boolean))]
      : [];
    attemptedIds.forEach((contestantId) => {
      if (contestantId === winningContestantId || partialCreditIds.has(contestantId) || noCreditAwardIds.has(contestantId)) return;
      addContestantDelta(deltas, contestantId, -clueValue);
    });
    return deltas;
  }

  function getContestantClueAward({ clue, contestantId } = {}) {
    const id = String(contestantId || '').trim();
    if (!id || !clue) return 0;
    return getClueScoreDeltas(clue).get(id) || 0;
  }

  function buildContestantChoiceScoreLine({ clue, contestant } = {}) {
    const contestantId = String(contestant?.id || '').trim();
    const outcome = getContestantAnswerOutcome({ clue, contestantId });
    if (outcome) {
      return `${formatScore(getContestantClueAward({ clue, contestantId }))} · ${outcome.label}`;
    }
    return formatScore(contestant?.score || 0);
  }

  function removeClueScoreDeltas(contestants, clue) {
    const nextContestants = cloneContestants(contestants);
    const deltas = getClueScoreDeltas(clue);
    nextContestants.forEach((contestant) => {
      const delta = deltas.get(contestant.id) || 0;
      if (delta) applyContestantScoreDelta(contestant, -delta);
    });
    return nextContestants;
  }

  function normalizeHostVerdictOverrideDecision(value) {
    const normalized = coerceText(value).toLowerCase().replace(/[\s_]+/g, '-');
    if (['correct', 'partial', 'incorrect'].includes(normalized)) return normalized;
    if (normalized === 'full' || normalized === 'full-credit') return 'correct';
    if (normalized === 'wrong' || normalized === 'no-credit') return 'incorrect';
    throw new Error('Choose a valid host verdict override.');
  }

  function baseHostOverrideClue(clue, decision, now = new Date().toISOString()) {
    return {
      ...clue,
      completed: false,
      attemptedContestantIds: [],
      winningContestantId: '',
      winningAwardPoints: null,
      allContestantsMissed: false,
      noContestantsBuzzed: false,
      partialCreditAwarded: 0,
      partialCreditContestantIds: [],
      partialCreditAwards: [],
      noCreditAwards: [],
      hostOverrideApplied: true,
      hostOverrideDecision: decision,
      hostOverrideUpdatedAt: now,
    };
  }

  function getContestantAnswerOutcome({ clue, contestantId } = {}) {
    const contestantIdText = String(contestantId || '').trim();
    if (!clue || !contestantIdText) return null;
    if (String(clue.winningContestantId || '') === contestantIdText) {
      return { verdict: 'correct', label: 'Full credit' };
    }
    const partialCreditAwards = normalizePartialCreditAwards(clue);
    const partialCreditIds = Array.isArray(clue.partialCreditContestantIds)
      ? clue.partialCreditContestantIds.map(String)
      : [];
    if (partialCreditIds.includes(contestantIdText) || partialCreditAwards.some((award) => String(award.contestantId || '') === contestantIdText)) {
      return { verdict: 'partial', label: 'Partial credit' };
    }
    const noCreditAwards = normalizeNoCreditAwards(clue);
    const attemptedIds = Array.isArray(clue.attemptedContestantIds)
      ? clue.attemptedContestantIds.map(String)
      : [];
    if (attemptedIds.includes(contestantIdText) || noCreditAwards.some((award) => String(award.contestantId || '') === contestantIdText)) {
      return { verdict: 'incorrect', label: 'Incorrect' };
    }
    return null;
  }

  function getHostOverrideOptionsForContestant({ clue, contestantId } = {}) {
    const outcome = getContestantAnswerOutcome({ clue, contestantId });
    if (!outcome || outcome.verdict === 'correct') return [];
    if (outcome.verdict === 'partial') {
      return [
        { decision: 'incorrect', label: 'Downgrade to incorrect', icon: '✕' },
        { decision: 'correct', label: 'Upgrade to full credit', icon: '✓' },
      ];
    }
    if (outcome.verdict === 'incorrect') {
      return [
        { decision: 'partial', label: 'Upgrade to partial credit', icon: '⚠' },
        { decision: 'correct', label: 'Upgrade to full credit', icon: '✓' },
      ];
    }
    return [];
  }

  function clueHasHostVerdictOverrideOptions(clue, contestants) {
    return (Array.isArray(contestants) ? contestants : []).some((contestant) => getHostOverrideOptionsForContestant({
      clue,
      contestantId: contestant?.id,
    }).length > 0);
  }

  function buildContestantVerdictSequence(clue) {
    const ids = [];
    const addId = (id) => {
      const contestantId = String(id || '').trim();
      if (contestantId && !ids.includes(contestantId)) ids.push(contestantId);
    };
    (Array.isArray(clue?.attemptedContestantIds) ? clue.attemptedContestantIds : []).forEach(addId);
    normalizePartialCreditAwards(clue).forEach((award) => addId(award.contestantId));
    normalizeNoCreditAwards(clue).forEach((award) => addId(award.contestantId));
    addId(clue?.winningContestantId);
    return ids.map((contestantId) => {
      const outcome = getContestantAnswerOutcome({ clue, contestantId });
      return outcome ? { contestantId, verdict: outcome.verdict } : null;
    }).filter(Boolean);
  }

  function requireHostVerdictOverrideContestant(nextContestants, contestantId) {
    const contestantIdText = String(contestantId || '').trim();
    const contestantIndex = nextContestants.findIndex((contestant) => contestant.id === contestantIdText);
    if (contestantIndex < 0) {
      throw new Error('Choose a contestant with an answer verdict before applying a host override.');
    }
    return { contestantIdText, contestantIndex };
  }

  function applyHostVerdictOverride({ contestants, clue, decision, contestantId, now } = {}) {
    if (!Array.isArray(contestants)) {
      throw new Error('Contestants are required before applying a host override.');
    }
    if (!clue || typeof clue !== 'object') {
      throw new Error('A clue is required before applying a host override.');
    }
    const normalizedDecision = normalizeHostVerdictOverrideDecision(decision);
    const nextContestants = removeClueScoreDeltas(contestants, clue);
    const { contestantIdText } = requireHostVerdictOverrideContestant(nextContestants, contestantId);
    const currentOutcome = getContestantAnswerOutcome({ clue, contestantId: contestantIdText });
    if (!currentOutcome) {
      throw new Error('That contestant has not answered this clue yet.');
    }
    if (currentOutcome.verdict === 'correct') {
      throw new Error('Full-credit answers cannot be downgraded after the correct response is revealed.');
    }
    if (currentOutcome.verdict === normalizedDecision) {
      throw new Error(`That contestant is already marked ${currentOutcome.label.toLowerCase()}.`);
    }
    const allowed = getHostOverrideOptionsForContestant({ clue, contestantId: contestantIdText })
      .some((option) => option.decision === normalizedDecision);
    if (!allowed) {
      throw new Error('Choose a valid host verdict override for that contestant.');
    }

    const appliedAt = now || new Date().toISOString();
    const nextClue = baseHostOverrideClue(clue, normalizedDecision, appliedAt);
    const clueValue = Number(clue.value || 0);
    const sequence = buildContestantVerdictSequence(clue).map((entry) => (
      entry.contestantId === contestantIdText ? { ...entry, verdict: normalizedDecision } : entry
    ));
    let awardedPoints = 0;

    sequence.some((entry) => {
      const contestantIndex = nextContestants.findIndex((contestant) => contestant.id === entry.contestantId);
      if (contestantIndex < 0) return false;
      if (entry.verdict === 'correct') {
        const award = getFullCreditAward(nextClue);
        applyContestantScoreDelta(nextContestants[contestantIndex], award);
        nextClue.completed = true;
        nextClue.winningContestantId = entry.contestantId;
        nextClue.winningAwardPoints = award;
        if (entry.contestantId === contestantIdText) awardedPoints = award;
        return true;
      }
      if (!nextClue.attemptedContestantIds.includes(entry.contestantId)) {
        nextClue.attemptedContestantIds.push(entry.contestantId);
      }
      if (entry.verdict === 'partial') {
        const award = getPartialCreditAward({ clue: nextClue, contestantCount: nextContestants.length });
        if (award > 0) {
          applyContestantScoreDelta(nextContestants[contestantIndex], award);
          nextClue.partialCreditAwarded = addScoreValues(nextClue.partialCreditAwarded, award);
          nextClue.partialCreditContestantIds.push(entry.contestantId);
          nextClue.partialCreditAwards.push({ contestantId: entry.contestantId, points: award });
        }
        if (entry.contestantId === contestantIdText) awardedPoints = award;
        return false;
      }
      if (entry.verdict === 'incorrect') {
        const award = -clueValue;
        applyContestantScoreDelta(nextContestants[contestantIndex], award);
        nextClue.noCreditAwards.push({ contestantId: entry.contestantId, points: award });
        if (entry.contestantId === contestantIdText) awardedPoints = award;
      }
      return false;
    });

    if (!nextClue.winningContestantId) {
      const preserveNoBuzzTerminalState = Boolean(clue.completed && clue.noContestantsBuzzed);
      const allContestantsAttempted = nextContestants.length > 0 &&
        nextContestants.every((contestant) => nextClue.attemptedContestantIds.includes(contestant.id));
      nextClue.noContestantsBuzzed = preserveNoBuzzTerminalState;
      nextClue.allContestantsMissed = preserveNoBuzzTerminalState || allContestantsAttempted;
      nextClue.completed = preserveNoBuzzTerminalState || allContestantsAttempted;
    }

    const correctedOutcome = getContestantAnswerOutcome({ clue: nextClue, contestantId: contestantIdText }) || { verdict: normalizedDecision };
    if (nextClue.completed) {
      nextClue.completedAt = appliedAt;
    }
    return {
      contestants: nextContestants,
      clue: nextClue,
      judgment: { verdict: correctedOutcome.verdict },
      awardedPoints,
      allContestantsAttempted: Boolean(nextClue.allContestantsMissed),
      answerShouldBeRevealed: Boolean(nextClue.completed),
      buzzersShouldBeOpen: !nextClue.completed,
      hostOverride: true,
    };
  }

  function applyHostOverride(options) {
    return applyHostVerdictOverride(options);
  }

  function buildHostVerdictOverrideSuccessMessage({ result, decision, contestantName = '' } = {}) {
    const name = contestantName || 'the selected contestant';
    const clue = result?.clue || {};
    const completedReason = clue.noContestantsBuzzed
      ? 'The clue had already been revealed because no one else buzzed in.'
      : 'All players have attempted, so the answer is revealed.';
    if (decision === 'correct') {
      return `Host override applied. ${name} now receives full credit, so the answer is revealed and buzzers are closed.`;
    }
    if (decision === 'partial') {
      return clue.completed
        ? `Host override applied. ${name} now receives partial credit. ${completedReason}`
        : `Host override applied. ${name} now receives partial credit. Buzzers are open for another player.`;
    }
    return clue.completed
      ? `Host override applied. ${name} is now marked incorrect. ${completedReason}`
      : `Host override applied. ${name} is now marked incorrect. Buzzers are open for another player.`;
  }

  function applyAnswerJudgment({ contestants, clue, contestantId, isCorrect, judgment, now } = {}) {
    if (!Array.isArray(contestants)) {
      throw new Error('Contestants are required for scorekeeping.');
    }
    if (!clue || typeof clue !== 'object') {
      throw new Error('A clue is required for scorekeeping.');
    }
    if (clue.completed) {
      throw new Error('This clue is already complete.');
    }
    const contestantIdText = String(contestantId || '');
    const attemptedContestantIds = Array.isArray(clue.attemptedContestantIds)
      ? clue.attemptedContestantIds.map(String)
      : [];
    if (attemptedContestantIds.includes(contestantIdText)) {
      throw new Error('That contestant has already attempted this clue. Choose another contestant.');
    }

    const contestantIndex = contestants.findIndex((contestant) => contestant.id === contestantIdText);
    if (contestantIndex < 0) {
      throw new Error('Select the contestant who answered before checking an answer.');
    }

    const normalizedJudgment = normalizeAnswerJudgmentInput({ isCorrect, judgment });
    const nextContestants = cloneContestants(contestants);
    const nextClue = {
      ...clue,
      attemptedContestantIds: [...attemptedContestantIds],
      partialCreditAwarded: Math.max(0, Number(clue.partialCreditAwarded || 0)),
      partialCreditContestantIds: Array.isArray(clue.partialCreditContestantIds)
        ? [...clue.partialCreditContestantIds.map(String)]
        : [],
      partialCreditAwards: normalizePartialCreditAwards(clue),
      noCreditAwards: normalizeNoCreditAwards(clue),
    };
    let awardedPoints = 0;

    if (normalizedJudgment.verdict === 'correct') {
      awardedPoints = getFullCreditAward(nextClue);
      applyContestantScoreDelta(nextContestants[contestantIndex], awardedPoints);
      nextClue.completed = true;
      nextClue.winningContestantId = contestantIdText;
      nextClue.winningAwardPoints = awardedPoints;
    } else if (normalizedJudgment.verdict === 'partial') {
      awardedPoints = getPartialCreditAward({ clue: nextClue, contestantCount: contestants.length });
      if (awardedPoints > 0) {
        applyContestantScoreDelta(nextContestants[contestantIndex], awardedPoints);
        nextClue.partialCreditAwarded = addScoreValues(nextClue.partialCreditAwarded, awardedPoints);
        nextClue.partialCreditContestantIds.push(contestantIdText);
        nextClue.partialCreditAwards.push({ contestantId: contestantIdText, points: awardedPoints });
      }
      nextClue.completed = false;
      if (!nextClue.attemptedContestantIds.includes(contestantIdText)) {
        nextClue.attemptedContestantIds.push(contestantIdText);
      }
    } else {
      awardedPoints = -Number(clue.value || 0);
      applyContestantScoreDelta(nextContestants[contestantIndex], awardedPoints);
      nextClue.noCreditAwards.push({ contestantId: contestantIdText, points: awardedPoints });
      nextClue.completed = false;
      if (!nextClue.attemptedContestantIds.includes(contestantIdText)) {
        nextClue.attemptedContestantIds.push(contestantIdText);
      }
    }

    const allContestantsAttempted = normalizedJudgment.verdict !== 'correct' && contestants.length > 0 &&
      contestants.every((contestant) => nextClue.attemptedContestantIds.includes(contestant.id));
    nextClue.allContestantsMissed = allContestantsAttempted;
    nextClue.completed = nextClue.completed || allContestantsAttempted;
    if (nextClue.completed) {
      nextClue.completedAt = coerceText(now) || new Date().toISOString();
    }

    return {
      contestants: nextContestants,
      clue: nextClue,
      judgment: normalizedJudgment,
      awardedPoints,
      allContestantsAttempted,
      answerShouldBeRevealed: normalizedJudgment.verdict === 'correct' || allContestantsAttempted,
    };
  }

  function applyNoBuzzForClue({ contestants, clue, now } = {}) {
    if (!Array.isArray(contestants)) {
      throw new Error('Contestants are required for scorekeeping.');
    }
    if (!clue || typeof clue !== 'object') {
      throw new Error('A clue is required before marking that no one buzzed in.');
    }
    if (clue.completed) {
      throw new Error('This clue is already complete.');
    }
    const nextClue = {
      ...clue,
      completed: true,
      completedAt: coerceText(now) || new Date().toISOString(),
      allContestantsMissed: true,
      noContestantsBuzzed: true,
      winningContestantId: '',
      attemptedContestantIds: Array.isArray(clue.attemptedContestantIds)
        ? [...clue.attemptedContestantIds.map(String)]
        : [],
      partialCreditAwarded: Math.max(0, Number(clue.partialCreditAwarded || 0)),
      partialCreditContestantIds: Array.isArray(clue.partialCreditContestantIds)
        ? [...clue.partialCreditContestantIds.map(String)]
        : [],
      partialCreditAwards: normalizePartialCreditAwards(clue),
      noCreditAwards: normalizeNoCreditAwards(clue),
    };
    return {
      contestants: cloneContestants(contestants),
      clue: nextClue,
      awardedPoints: 0,
      noBuzz: true,
      answerShouldBeRevealed: true,
    };
  }

  function shouldAutoCloseAfterAnswerResult() {
    return false;
  }

  function truncateLessonContent(lessonContent, maxChars = MAX_LESSON_CHARS) {
    const normalized = String(lessonContent || '').replaceAll(String.fromCharCode(13, 10), '\n').trim();
    if (normalized.length <= maxChars) {
      return { content: normalized, truncated: false, originalLength: normalized.length };
    }
    return {
      content: preserveFocusInstructionsDuringTruncation(normalized, maxChars),
      truncated: true,
      originalLength: normalized.length,
    };
  }

  function preserveFocusInstructionsDuringTruncation(normalized, maxChars) {
    const focusStart = normalized.lastIndexOf(FOCUS_INSTRUCTIONS_HEADING);
    if (focusStart === -1) {
      return normalized.slice(0, maxChars);
    }

    const separator = '\n\n---\n\n';
    const separatorStart = normalized.lastIndexOf(separator, focusStart);
    const focusSectionStart = separatorStart === -1 ? focusStart : separatorStart;
    const focusSection = normalized.slice(focusSectionStart);
    if (focusSection.length >= maxChars) {
      return normalized.slice(focusStart, focusStart + maxChars);
    }

    const prefixBudget = maxChars - focusSection.length;
    return `${normalized.slice(0, prefixBudget).trimEnd()}${focusSection}`;
  }

  function buildOpenAiMessages({ contestantNames, lessonContent, difficultyLevel = DEFAULT_DIFFICULTY_LEVEL }) {
    const names = Array.isArray(contestantNames) ? contestantNames.map((name, index) => normalizeContestantName(name, index)) : [];
    const lesson = truncateLessonContent(lessonContent);
    const difficulty = getDifficultyLevelConfig(difficultyLevel) || getDifficultyLevelConfig(DEFAULT_DIFFICULTY_LEVEL);
    const truncationNote = lesson.truncated
      ? `\n\nNOTE: The supplied lesson material was truncated from ${lesson.originalLength} characters to ${lesson.content.length} characters before generation. Build the game only from the visible lesson material below.`
      : '';

    return [
      {
        role: 'system',
        content: [
          'You are Navigate The Way ✝️ (NTW✝️), serving a small group leader by creating a Bible lesson review game.',
          'Create content that is conservative, historic, confessional, Reformed evangelical, Scripture-centered, charitable, and pastorally careful.',
          'Use ONLY the lesson material supplied by the user as the factual source for this game. The material may include uploaded files, a leader-provided lesson topic or summary, leader-provided focus instructions, or a combination of those.',
          'If the leader supplied only a brief topic or summary, create broadly applicable review content for that stated lesson subject without claiming unpublished lesson details.',
          'If the leader supplied uploaded files plus leader-provided focus instructions, use the files as the factual lesson source and let the instructions shape the game board emphasis, but do not treat focus instructions as new lesson facts.',
          'Do not quote Scripture from memory. If exact Scripture text appears in the supplied lesson material, you may use that supplied text; otherwise cite references without fabricating verse wording.',
          'Do not invent doctrines, anecdotes, precise lesson details, or source claims that are not supported by the supplied material.',
          'Adjust both theological complexity and wording readability to the selected difficulty level, aiming for the selected Flesch-Kincaid grade range without weakening biblical or theological accuracy.',
          'Keep the tone warm, clear, and suitable for a fun Berean Board review activity.',
          'Return only valid JSON that matches the enforced schema. Do not wrap the JSON in markdown unless the API requires it.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'Build a Berean Board lesson game board for a Christian small group leader.',
          `Contestants: ${names.join(', ')}`,
          buildDifficultyGenerationInstructions(difficulty.value),
          'Requirements:',
          '- Generate exactly 5 categories.',
          '- Each category must contain exactly 5 clues.',
          '- Clue values must be 100, 200, 300, 400, and 500 in that order for every category.',
          '- Adjust the theological complexity and readability of every clue, correctResponse, and explanation to the selected difficulty level.',
          '- Aim the wording at the selected Flesch-Kincaid grade range while keeping prompts biblically accurate, age-appropriate in substance, and playable aloud.',
          '- The displayed "clue" should ask or prompt recall/application from the lesson.',
          '- The "correctResponse" should be short enough for a leader to judge a spoken answer.',
          '- Include a brief explanation and a sourceAnchor pointing to the uploaded file, leader-provided topic/summary, lesson section, heading, or passage reference when available. Use any leader focus instructions to guide emphasis rather than as a sourceAnchor.',
          '- Avoid trick questions and avoid mocking wrong answers.',
          '- Prefer questions that reinforce faithful understanding, careful application, and Christ-centered theological clarity.',
          '',
          'Return this exact JSON shape:',
          '{',
          '  "title": "string",',
          '  "categories": [',
          '    {',
          '      "title": "string",',
          '      "clues": [',
          '        { "value": 100, "clue": "string", "correctResponse": "string", "explanation": "string", "sourceAnchor": "string" }',
          '      ]',
          '    }',
          '  ]',
          '}',
          truncationNote,
          '',
          'Lesson source material:',
          '<<<LESSON_CONTENT_START>>>',
          lesson.content,
          '<<<LESSON_CONTENT_END>>>',
        ].join('\n'),
      },
    ];
  }

  function buildAnswerJudgmentMessages({ clue, contestantName, contestantResponse }) {
    if (!clue || typeof clue !== 'object') {
      throw new Error('A clue is required before checking an answer.');
    }
    const response = normalizeLongFormText(contestantResponse);
    if (!response) {
      throw new Error('Enter the contestant response before asking NTW to check it.');
    }

    return [
      {
        role: 'system',
        content: [
          'You are Navigate The Way ✝️ (NTW✝️), helping a small group leader judge a spoken review-game answer.',
          'Decide whether the contestant response is correct, partially creditable, or incorrect. It should be judged for whether it is reasonably and conceptually correct, and it does not need to be verbatim right.',
          'Mark the response correct only when it captures the expected lesson answer or its core idea faithfully, even if wording differs.',
          'Mark the response partial when it is biblically sound, relevant to the clue, and shows real understanding, but is not the expected lesson answer.',
          'Do not give partial credit for generic, vague, evasive, unrelated, or merely plausible church words such as answering "Jesus" to every clue.',
          'Mark the response incorrect when it contradicts Scripture or the lesson, misses the core idea, is too vague to show understanding, or gives an unrelated answer.',
          'Be charitable but do not award points for a response that is materially wrong.',
          'For partial or incorrect responses, do not reveal the correct answer, missing answer details, or giveaway hints because other contestants may still answer.',
          'Be very concise. Return only the verdict and feedback of eight words or fewer.',
          'Return only valid JSON that matches the enforced schema. Do not wrap the JSON in markdown unless the API requires it.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'Judge this contestant response for a Berean Board.',
          `Contestant: ${coerceText(contestantName, 'Selected contestant')}`,
          `Clue value: $${Number(clue.value || 0)}`,
          `Clue: ${coerceText(clue.clue)}`,
          `Expected correct response: ${coerceText(clue.correctResponse)}`,
          `Teaching explanation: ${coerceText(clue.explanation, 'No explanation supplied.')}`,
          `Lesson/source anchor: ${coerceText(clue.sourceAnchor, 'Lesson material')}`,
          '',
          'Contestant response:',
          '<<<CONTESTANT_RESPONSE_START>>>',
          response,
          '<<<CONTESTANT_RESPONSE_END>>>',
          '',
          'Return this exact JSON shape:',
          '{ "verdict": "correct", "feedback": "short leader-facing explanation" }',
          'Use verdict "correct", "partial", or "incorrect".',
        ].join('\n'),
      },
    ];
  }

  function stripJsonMarkdownFence(text) {
    const trimmed = String(text || '').trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
  }

  function extractJsonObject(text) {
    const unfenced = stripJsonMarkdownFence(text);
    try {
      return JSON.parse(unfenced);
    } catch (directError) {
      const firstBrace = unfenced.indexOf('{');
      const lastBrace = unfenced.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
      }
      throw directError;
    }
  }

  function normalizeChatCompletionsEndpoint(endpoint) {
    const rawEndpoint = String(endpoint || '').trim() || DEFAULT_CHAT_COMPLETIONS_ENDPOINT;
    try {
      const url = new URL(rawEndpoint);
      const defaultOrigin = new URL(DEFAULT_API_BASE).origin;
      const trimmedPath = url.pathname.replace(/\/+$/g, '');

      if (url.origin === defaultOrigin && (!trimmedPath || trimmedPath === '/')) {
        url.pathname = CHAT_COMPLETIONS_PATH;
      } else if (trimmedPath === '/api' || trimmedPath === '/api/v1') {
        url.pathname = CHAT_COMPLETIONS_PATH;
      } else if (trimmedPath.toLowerCase() === CHAT_COMPLETIONS_PATH) {
        url.pathname = CHAT_COMPLETIONS_PATH;
      } else {
        url.pathname = trimmedPath || CHAT_COMPLETIONS_PATH;
      }

      return url.href;
    } catch (error) {
      return rawEndpoint.replace(/\/+$/g, '');
    }
  }

  function findCompletionContent(payload) {
    const candidates = [
      payload?.choices?.[0]?.message?.content,
      payload?.choices?.[0]?.text,
      payload?.message?.content,
      payload?.response,
      payload?.completion,
      payload?.content,
      payload?.output_text,
      payload?.data?.choices?.[0]?.message?.content,
      payload?.data?.choices?.[0]?.text,
      payload?.data?.message?.content,
      payload?.data?.response,
      payload?.data?.completion,
      payload?.data?.content,
      payload?.data?.output_text,
    ];

    return candidates.find((candidate) => {
      if (typeof candidate === 'string') {
        return candidate.trim();
      }
      return candidate && typeof candidate === 'object';
    });
  }

  function parseOpenAiGameResponse(payload) {
    if (payload?.categories) {
      return normalizeGeneratedGame(payload);
    }
    if (payload?.game) {
      return normalizeGeneratedGame(payload.game);
    }
    if (payload?.data?.categories) {
      return normalizeGeneratedGame(payload.data);
    }
    if (payload?.data?.game) {
      return normalizeGeneratedGame(payload.data.game);
    }

    const completionContent = findCompletionContent(payload);
    if (!completionContent) {
      throw new Error('The NTW API response did not include a recognizable completion payload.');
    }
    if (typeof completionContent === 'object') {
      return normalizeGeneratedGame(completionContent);
    }
    return normalizeGeneratedGame(extractJsonObject(completionContent));
  }

  function normalizeAnswerJudgment(rawJudgment) {
    if (!rawJudgment || typeof rawJudgment !== 'object') {
      throw new Error('The NTW answer check did not return a judgment object.');
    }
    const explicitVerdict = normalizeJudgmentVerdict(
      rawJudgment.verdict ??
      rawJudgment.judgment ??
      rawJudgment.result ??
      rawJudgment.credit
    );
    const partialFlag = rawJudgment.partial === true ||
      rawJudgment.partiallyCorrect === true ||
      rawJudgment.partialCredit === true ||
      rawJudgment.biblicallySoundButNotExpected === true;
    const correctnessValue = rawJudgment.isCorrect ??
      rawJudgment.correct ??
      rawJudgment.reasonablyCorrect ??
      rawJudgment.conceptuallyCorrect ??
      rawJudgment.accepted;
    const verdict = explicitVerdict || (partialFlag ? 'partial' : (coerceJudgmentBoolean(correctnessValue) ? 'correct' : 'incorrect'));
    const isCorrect = verdict === 'correct';
    return {
      isCorrect,
      verdict,
      partialCreditFraction: normalizePartialCreditFraction(rawJudgment, verdict),
      feedback: pickText(
        rawJudgment,
        ['feedback', 'explanation', 'rationale', 'reason', 'message'],
        verdict === 'correct' ? 'Conceptually correct.' : (verdict === 'partial' ? 'Biblically sound, but not the expected lesson answer.' : 'Not close enough yet.')
      ),
    };
  }

  function parseAnswerJudgmentResponse(payload) {
    if (payload && typeof payload === 'object') {
      const hasDirectJudgment = ['isCorrect', 'correct', 'reasonablyCorrect', 'conceptuallyCorrect', 'accepted', 'verdict', 'judgment', 'result', 'credit', 'partial', 'partiallyCorrect', 'partialCredit']
        .some((key) => Object.prototype.hasOwnProperty.call(payload, key));
      if (hasDirectJudgment) {
        return normalizeAnswerJudgment(payload);
      }
      const data = payload.data;
      const hasDataJudgment = data && typeof data === 'object' &&
        ['isCorrect', 'correct', 'reasonablyCorrect', 'conceptuallyCorrect', 'accepted', 'verdict', 'judgment', 'result', 'credit', 'partial', 'partiallyCorrect', 'partialCredit']
          .some((key) => Object.prototype.hasOwnProperty.call(data, key));
      if (hasDataJudgment) {
        return normalizeAnswerJudgment(data);
      }
    }

    const completionContent = findCompletionContent(payload);
    if (!completionContent) {
      throw new Error('The NTW answer check response did not include a recognizable completion payload.');
    }
    if (typeof completionContent === 'object') {
      return normalizeAnswerJudgment(completionContent);
    }
    return normalizeAnswerJudgment(extractJsonObject(completionContent));
  }

  function buildStructuredResponseFormat(jsonSchema = GAME_RESPONSE_JSON_SCHEMA) {
    if (!jsonSchema) {
      return { type: 'json' };
    }
    return {
      type: 'json_schema',
      json_schema: jsonSchema,
    };
  }

  function buildChatCompletionsBody({
    model,
    messages,
    responseSchema = GAME_RESPONSE_JSON_SCHEMA,
    temperature = 0.25,
    topP = 0.9,
    maxCompletionTokens = 6000,
  }) {
    return {
      model: String(model || '').trim() || DEFAULT_MODEL,
      stream: false,
      messages,
      temperature,
      top_p: topP,
      max_completion_tokens: maxCompletionTokens,
      response_format: buildStructuredResponseFormat(responseSchema),
      metadata: {
        anonymous: true,
        language: DEFAULT_LANGUAGE,
        bible: DEFAULT_BIBLE,
      },
    };
  }

  function buildAnswerJudgmentChatCompletionsBody({ model, clue, contestantName, contestantResponse }) {
    return buildChatCompletionsBody({
      model,
      messages: buildAnswerJudgmentMessages({ clue, contestantName, contestantResponse }),
      responseSchema: ANSWER_JUDGMENT_JSON_SCHEMA,
      temperature: 0,
      topP: 1,
      maxCompletionTokens: 120,
    });
  }

  function buildJsonModeFallbackBody(body) {
    return {
      ...body,
      response_format: buildStructuredResponseFormat(null),
    };
  }

  function collectApiErrorParts(value, parts = []) {
    if (!value) return parts;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text) parts.push(text);
      return parts;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectApiErrorParts(item, parts));
      return parts;
    }
    if (typeof value === 'object') {
      collectApiErrorParts(value.message, parts);
      collectApiErrorParts(value.detail, parts);
      collectApiErrorParts(value.title, parts);
      collectApiErrorParts(value.msg, parts);
      collectApiErrorParts(value.error, parts);
      return parts;
    }
    return parts;
  }

  function extractApiErrorMessage(payload, fallbackStatus) {
    const parts = [];
    collectApiErrorParts(payload?.error, parts);
    collectApiErrorParts(payload?.errors, parts);
    collectApiErrorParts(payload?.message, parts);
    collectApiErrorParts(payload?.detail, parts);
    collectApiErrorParts(payload?.validation, parts);
    const unique = [...new Set(parts)];
    return unique.join(' ') || `HTTP ${fallbackStatus}`;
  }

  function shouldRetryWithJsonMode({ status, payload }) {
    if (status !== 422) return false;
    const message = extractApiErrorMessage(payload, status).toLowerCase();
    return message.includes('response_format/type') && message.includes('allowed values');
  }

  async function postChatCompletionsRequest({ endpoint, apiKey, body, nonJsonMessage }) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const payloadText = await response.text();
    let payload = null;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch (error) {
      throw new Error(`${nonJsonMessage} HTTP ${response.status}.`);
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  }

  async function callOpenAiCompatibleApi({ endpoint, apiKey, model, messages }) {
    const cleanEndpoint = normalizeChatCompletionsEndpoint(endpoint);
    const cleanKey = String(apiKey || '').trim();
    const cleanModel = String(model || '').trim() || DEFAULT_MODEL;
    if (!cleanEndpoint) {
      throw new Error('Enter the NTW OpenAI-compatible chat completions endpoint.');
    }
    if (!cleanKey) {
      throw new Error('Enter the NTW API key. The key is used only in this browser session and is not committed to the website.');
    }
    if (!cleanModel) {
      throw new Error('Enter the NTW model name.');
    }

    const body = buildChatCompletionsBody({ model: cleanModel, messages });
    let result = await postChatCompletionsRequest({
      endpoint: cleanEndpoint,
      apiKey: cleanKey,
      body,
      nonJsonMessage: 'The NTW API returned non-JSON content with',
    });

    if (!result.ok && shouldRetryWithJsonMode(result)) {
      result = await postChatCompletionsRequest({
        endpoint: cleanEndpoint,
        apiKey: cleanKey,
        body: buildJsonModeFallbackBody(body),
        nonJsonMessage: 'The NTW API returned non-JSON content with',
      });
    }

    if (!result.ok) {
      throw new Error(`The NTW API request failed: ${extractApiErrorMessage(result.payload, result.status)}`);
    }

    return parseOpenAiGameResponse(result.payload);
  }

  async function callAnswerJudgmentApi({ endpoint, apiKey, model, clue, contestantName, contestantResponse }) {
    const cleanEndpoint = normalizeChatCompletionsEndpoint(endpoint);
    const cleanKey = String(apiKey || '').trim();
    const cleanModel = String(model || '').trim() || DEFAULT_MODEL;
    if (!cleanEndpoint) {
      throw new Error('Enter the NTW OpenAI-compatible chat completions endpoint.');
    }
    if (!cleanKey) {
      throw new Error('Enter the NTW API key before checking contestant answers.');
    }
    if (!cleanModel) {
      throw new Error('Enter the NTW model name.');
    }

    const body = buildAnswerJudgmentChatCompletionsBody({
      model: cleanModel,
      clue,
      contestantName,
      contestantResponse,
    });
    let result = await postChatCompletionsRequest({
      endpoint: cleanEndpoint,
      apiKey: cleanKey,
      body,
      nonJsonMessage: 'The NTW answer check returned non-JSON content with',
    });

    if (!result.ok && shouldRetryWithJsonMode(result)) {
      result = await postChatCompletionsRequest({
        endpoint: cleanEndpoint,
        apiKey: cleanKey,
        body: buildJsonModeFallbackBody(body),
        nonJsonMessage: 'The NTW answer check returned non-JSON content with',
      });
    }

    if (!result.ok) {
      throw new Error(`The NTW answer check failed: ${extractApiErrorMessage(result.payload, result.status)}`);
    }

    return parseAnswerJudgmentResponse(result.payload);
  }

  async function extractPdfText(file) {
    if (!ROOT.pdfjsLib) {
      throw new Error('PDF support did not load. Check the pdf.js CDN connection or convert the PDF to TXT/DOCX.');
    }
    const buffer = await file.arrayBuffer();
    const pdf = await ROOT.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(textContent.items.map((item) => item.str).join(' '));
    }
    return pages.join('\n\n');
  }

  async function extractDocxText(file) {
    if (!ROOT.mammoth) {
      throw new Error('DOCX support did not load. Check the Mammoth CDN connection or convert the DOCX to TXT.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await ROOT.mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  }

  function decodeBasicXmlEntities(text) {
    return String(text || '')
      .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
      .replace(/&nbsp;/g, ' ')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function xmlTextToPlainText(xmlText) {
    return decodeBasicXmlEntities(
      String(xmlText || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, ' $1 ')
        .replace(/<text:s\b[^>]*text:c="(\d+)"[^>]*\/>/gi, (_match, count) => ' '.repeat(Math.max(1, Number(count) || 1)))
        .replace(/<text:tab\b[^>]*\/>/gi, ' ')
        .replace(/<text:line-break\b[^>]*\/>/gi, '\n')
        .replace(/<\/?(?:text:p|text:h|a:p|w:p|sf:p)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function extractZipXmlText(file, { label, preferredPathPattern, fallbackPathPattern = /\.(xml|plist|txt|rtf)$/i } = {}) {
    if (!ROOT.JSZip) {
      throw new Error(`${label || 'Package'} support did not load. Check the JSZip CDN connection or export the file to TXT, PDF, DOCX, or PPTX.`);
    }
    const zip = await ROOT.JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.keys(zip.files || {})
      .filter((path) => {
        const entry = zip.files[path];
        if (!entry || entry.dir || /(^|\/)__MACOSX\//i.test(path)) return false;
        if (preferredPathPattern?.test(path)) return true;
        return fallbackPathPattern.test(path);
      })
      .sort((a, b) => {
        const aPreferred = preferredPathPattern?.test(a) ? 0 : 1;
        const bPreferred = preferredPathPattern?.test(b) ? 0 : 1;
        return aPreferred - bPreferred || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

    const sections = [];
    for (const path of entries) {
      const raw = await zip.files[path].async('string');
      const text = /\.(xml|plist|xhtml|html|htm)$/i.test(path) ? xmlTextToPlainText(raw) : normalizeLongFormText(raw);
      if (text) {
        sections.push(text);
      }
    }
    const uniqueSections = [...new Set(sections)];
    if (uniqueSections.length === 0) {
      throw new Error(`${file?.name || 'This package'} did not contain readable text. Export it to TXT, PDF, DOCX, or PPTX and try again.`);
    }
    return uniqueSections.join('\n\n');
  }

  async function extractOpenDocumentText(file) {
    return await extractZipXmlText(file, {
      label: 'OpenDocument',
      preferredPathPattern: /(^|\/)content\.xml$/i,
      fallbackPathPattern: /\.(xml|txt|rtf)$/i,
    });
  }

  function normalizeZipPath(path) {
    const segments = [];
    String(path || '')
      .replace(/\\/g, '/')
      .split('/')
      .forEach((segment) => {
        if (!segment || segment === '.') return;
        if (segment === '..') {
          segments.pop();
          return;
        }
        segments.push(segment);
      });
    return segments.join('/');
  }

  function findZipFilePath(zip, path) {
    const normalized = normalizeZipPath(path);
    if (zip.files?.[normalized]) return normalized;
    const normalizedLower = normalized.toLowerCase();
    return Object.keys(zip.files || {}).find((candidate) => normalizeZipPath(candidate).toLowerCase() === normalizedLower) || '';
  }

  function decodeZipHrefPath(href) {
    const cleanHref = decodeBasicXmlEntities(String(href || '').split('#')[0]);
    return cleanHref.split('/').map((segment) => {
      const slashSafeSegment = segment.replace(/%(2f|5c)/gi, (_match, hex) => `%25${hex}`);
      try {
        return decodeURIComponent(slashSafeSegment);
      } catch (_error) {
        return segment;
      }
    }).join('/');
  }

  function resolveZipRelativePath(basePath, href) {
    const cleanHref = decodeZipHrefPath(href);
    if (!cleanHref) return '';
    const baseDirectory = String(basePath || '').replace(/[^/]*$/, '');
    return normalizeZipPath(`${baseDirectory}${cleanHref}`);
  }

  function parseXmlTagAttributes(tagText) {
    const attributes = {};
    String(tagText || '').replace(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_match, rawName, _quoted, doubleQuoted, singleQuoted) => {
      attributes[rawName.toLowerCase()] = decodeBasicXmlEntities(doubleQuoted ?? singleQuoted ?? '');
      return _match;
    });
    return attributes;
  }

  async function findEpubPackagePath(zip) {
    const containerPath = findZipFilePath(zip, 'META-INF/container.xml');
    if (containerPath) {
      const containerXml = await zip.files[containerPath].async('string');
      const rootfileTags = containerXml.match(/<[^>]*rootfile\b[^>]*>/gi) || [];
      for (const tag of rootfileTags) {
        const fullPath = parseXmlTagAttributes(tag)['full-path'];
        const packagePath = findZipFilePath(zip, fullPath);
        if (packagePath) return packagePath;
      }
    }
    return Object.keys(zip.files || {})
      .filter((path) => zip.files[path] && !zip.files[path].dir && /\.opf$/i.test(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))[0] || '';
  }

  async function getEpubSpinePaths(zip) {
    const packagePath = await findEpubPackagePath(zip);
    if (!packagePath) return [];
    const packageXml = await zip.files[packagePath].async('string');
    const manifestItems = new Map();
    (packageXml.match(/<item\b[^>]*>/gi) || []).forEach((tag) => {
      const attributes = parseXmlTagAttributes(tag);
      const href = attributes.href;
      if (!attributes.id || !href) return;
      const mediaType = String(attributes['media-type'] || '').toLowerCase();
      const properties = String(attributes.properties || '').toLowerCase().split(/\s+/);
      if (properties.includes('nav')) return;
      if (mediaType && mediaType !== 'application/xhtml+xml' && !mediaType.startsWith('text/html')) return;
      if (!/\.(xhtml|html|htm)(?:#.*)?$/i.test(href)) return;
      const resolvedPath = findZipFilePath(zip, resolveZipRelativePath(packagePath, href));
      if (resolvedPath) manifestItems.set(attributes.id, resolvedPath);
    });

    const spinePaths = [];
    let unresolvedLinearItem = false;
    (packageXml.match(/<itemref\b[^>]*>/gi) || []).forEach((tag) => {
      const attributes = parseXmlTagAttributes(tag);
      if (String(attributes.linear || '').toLowerCase() === 'no') return;
      const path = manifestItems.get(attributes.idref);
      if (path) {
        if (!spinePaths.includes(path)) spinePaths.push(path);
      } else {
        unresolvedLinearItem = true;
      }
    });
    return unresolvedLinearItem ? [] : spinePaths;
  }

  function getFallbackEpubContentPaths(zip) {
    return Object.keys(zip.files || {})
      .filter((path) => {
        const entry = zip.files[path];
        if (!entry || entry.dir || /(^|\/)__MACOSX\//i.test(path)) return false;
        if (!/\.(xhtml|html|htm)$/i.test(path)) return false;
        return !/(^|\/)(nav|toc|cover|titlepage)\.(xhtml|html|htm)$/i.test(path);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  async function extractEpubText(file) {
    if (!ROOT.JSZip) {
      throw new Error('EPUB support did not load. Check the JSZip CDN connection or export the ebook to TXT or PDF.');
    }
    const zip = await ROOT.JSZip.loadAsync(await file.arrayBuffer());
    const paths = await getEpubSpinePaths(zip);
    const contentPaths = paths.length > 0 ? paths : getFallbackEpubContentPaths(zip);

    const sections = [];
    for (const path of contentPaths) {
      const text = xmlTextToPlainText(await zip.files[path].async('string'));
      if (text) sections.push(text);
    }
    const uniqueSections = [...new Set(sections.map((section) => normalizeLongFormText(section)).filter(Boolean))];
    if (uniqueSections.length === 0) {
      throw new Error(`${file?.name || 'This EPUB file'} did not contain browser-readable lesson text. Export it to TXT, PDF, DOCX, or HTML and try again.`);
    }
    return uniqueSections.join('\n\n');
  }

  async function extractReadableBinaryEntryText(entry) {
    const buffer = await entry.async('arraybuffer');
    const fragments = [];
    [
      decodeArrayBuffer(buffer, 'utf-8'),
      decodeArrayBuffer(buffer, 'windows-1252'),
      decodeArrayBuffer(buffer, 'utf-16le'),
    ].forEach((candidate) => {
      extractReadableBinaryStrings(candidate).forEach((fragment) => fragments.push(fragment));
    });
    return [...new Set(fragments)].join('\n').trim();
  }

  function iWorkEntryLooksLikeLessonText(path) {
    return !/(^|\/)__MACOSX\//i.test(path) &&
      !/(^|\/)(metadata|properties|buildVersionHistory)\.(xml|plist)$/i.test(path) &&
      !/\.plist$/i.test(path);
  }

  async function collectIWorkPackageSections(zip) {
    const paths = Object.keys(zip.files || {})
      .filter((path) => {
        const entry = zip.files[path];
        return entry && !entry.dir && iWorkEntryLooksLikeLessonText(path);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const sections = [];

    const xmlPaths = paths.filter((path) => /(^|\/)(index|document)\.xml$/i.test(path) || /(^|\/)(index|document|presentation|slide)[^/]*\/.*\.xml$/i.test(path));
    for (const path of xmlPaths) {
      const text = xmlTextToPlainText(await zip.files[path].async('string'));
      if (text) sections.push(text);
    }

    const previewPdfPath = paths.find((path) => /(^|\/)QuickLook\/Preview\.pdf$/i.test(path) || /(^|\/)preview\.pdf$/i.test(path));
    if (previewPdfPath) {
      const previewFile = {
        name: previewPdfPath,
        type: 'application/pdf',
        arrayBuffer: async () => await zip.files[previewPdfPath].async('arraybuffer'),
      };
      const text = normalizeLongFormText(await extractPdfText(previewFile));
      if (text) sections.push(text);
    }

    for (const path of paths.filter((entryPath) => /(^|\/)Index.*\.zip$/i.test(entryPath))) {
      const nestedZip = await ROOT.JSZip.loadAsync(await zip.files[path].async('arraybuffer'));
      const nestedSections = await collectIWorkPackageSections(nestedZip);
      nestedSections.forEach((section) => sections.push(section));
    }

    for (const path of paths.filter((entryPath) => /\.iwa$/i.test(entryPath))) {
      const text = await extractReadableBinaryEntryText(zip.files[path]);
      if (text) sections.push(text);
    }

    return [...new Set(sections.map((section) => normalizeLongFormText(section)).filter(Boolean))];
  }

  async function extractIWorkPackageText(file) {
    if (!ROOT.JSZip) {
      throw new Error('iWork support did not load. Check the JSZip CDN connection or export the file to TXT, PDF, DOCX, or PPTX.');
    }
    const zip = await ROOT.JSZip.loadAsync(await file.arrayBuffer());
    const sections = await collectIWorkPackageSections(zip);
    if (sections.length === 0) {
      throw new Error(`${file?.name || 'This iWork file'} did not contain browser-readable lesson text. Current Pages/Keynote files often store the document body in compressed iWork data; export it to PDF, DOCX, PPTX, TXT, or CSV and try again.`);
    }
    return sections.join('\n\n');
  }

  async function extractPptxText(file) {
    if (!ROOT.JSZip) {
      throw new Error('PPTX support did not load. Check the JSZip CDN connection or export slides to TXT/PDF.');
    }
    const zip = await ROOT.JSZip.loadAsync(await file.arrayBuffer());
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
    const slides = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('string');
      const text = xmlTextToPlainText(xml);
      if (text) {
        slides.push(text);
      }
    }
    return slides.join('\n\n');
  }

  async function extractSpreadsheetText(file) {
    if (!ROOT.XLSX) {
      if (getFileExtension(file?.name) === '.ods') {
        return await extractOpenDocumentText(file);
      }
      throw new Error('Spreadsheet support did not load. Check the SheetJS CDN connection or export the spreadsheet to CSV.');
    }
    const workbook = ROOT.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    const sections = sheetNames.map((sheetName) => {
      const sheet = workbook.Sheets?.[sheetName];
      if (!sheet) return '';
      const csv = ROOT.XLSX.utils?.sheet_to_csv?.(sheet, { blankrows: false }) || '';
      const text = normalizeLongFormText(csv);
      return text ? `SHEET: ${sheetName}\n${text}` : '';
    }).filter(Boolean);
    if (sections.length === 0) {
      throw new Error(`${file?.name || 'This spreadsheet'} did not contain readable cells.`);
    }
    return sections.join('\n\n---\n\n');
  }

  function decodeArrayBuffer(buffer, encoding) {
    try {
      if (typeof TextDecoder === 'function') {
        return new TextDecoder(encoding, { fatal: false }).decode(buffer);
      }
    } catch (_error) {
      // Fall through to the byte-wise fallback below.
    }
    return Array.from(new Uint8Array(buffer || []), (byte) => String.fromCharCode(byte)).join('');
  }

  function extractReadableBinaryStrings(text) {
    const normalized = String(text || '')
      .replace(/\u0000/g, ' ')
      .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '\n');
    const fragments = normalized
      .split(/\n+/)
      .map((line) => normalizeLongFormText(line))
      .filter((line) => line.length >= 4 && /[A-Za-z0-9]/.test(line));
    return fragments;
  }

  async function extractLegacyOfficeBinaryText(file, { allowEmpty = false } = {}) {
    const buffer = await file.arrayBuffer();
    const candidates = [
      decodeArrayBuffer(buffer, 'utf-8'),
      decodeArrayBuffer(buffer, 'windows-1252'),
      decodeArrayBuffer(buffer, 'utf-16le'),
    ];
    const fragments = [];
    candidates.forEach((candidate) => {
      extractReadableBinaryStrings(candidate).forEach((fragment) => fragments.push(fragment));
    });
    const uniqueFragments = [...new Set(fragments)];
    const text = uniqueFragments.join('\n').trim();
    if (!text && !allowEmpty) {
      throw new Error(`${file?.name || 'This legacy Office file'} did not contain readable text. Export it to DOCX, PDF, TXT, or CSV and try again.`);
    }
    return text;
  }

  async function extractLessonTextFromFile(file) {
    if (!isSupportedLessonFile(file)) {
      throw new Error(`${file?.name || 'This file'} is not a supported lesson file type.`);
    }
    const extension = getFileExtension(file?.name);
    const type = String(file?.type || '').toLowerCase();
    if (isTextLikeFile(file)) {
      return await file.text();
    }
    if (extension === '.pdf' || PDF_MIME_TYPES.has(type)) {
      return await extractPdfText(file);
    }
    if (extension === '.epub' || EPUB_MIME_TYPES.has(type)) {
      return await extractEpubText(file);
    }
    if (extension === '.docx' || DOCX_MIME_TYPES.has(type)) {
      return await extractDocxText(file);
    }
    if (extension === '.doc' || LEGACY_WORD_MIME_TYPES.has(type)) {
      return await extractLegacyOfficeBinaryText(file);
    }
    if (extension === '.odt' || OPEN_DOCUMENT_TEXT_MIME_TYPES.has(type)) {
      return await extractOpenDocumentText(file);
    }
    if (extension === '.pages' || IWORK_PAGES_MIME_TYPES.has(type)) {
      return await extractIWorkPackageText(file);
    }
    if (extension === '.pptx' || PPTX_MIME_TYPES.has(type)) {
      return await extractPptxText(file);
    }
    if (extension === '.ppt' || LEGACY_POWERPOINT_MIME_TYPES.has(type)) {
      return await extractLegacyOfficeBinaryText(file);
    }
    if (extension === '.odp' || OPEN_DOCUMENT_PRESENTATION_MIME_TYPES.has(type)) {
      return await extractOpenDocumentText(file);
    }
    if (extension === '.key' || IWORK_KEYNOTE_MIME_TYPES.has(type)) {
      return await extractIWorkPackageText(file);
    }
    if (['.xlsx', '.xls', '.ods'].includes(extension) || SPREADSHEET_MIME_TYPES.has(type)) {
      return await extractSpreadsheetText(file);
    }
    throw new Error(`${file?.name || 'This file'} could not be read. Convert it to TXT, PDF, EPUB, DOCX, PPTX, CSV, or another supported browser-readable format.`);
  }

  async function extractLessonTextFromFiles(files) {
    const list = Array.from(files || []);
    if (list.length === 0) {
      throw new Error('Add at least one lesson file before generating a game.');
    }
    const unsupported = list.filter((file) => !isSupportedLessonFile(file));
    if (unsupported.length > 0) {
      throw new Error(`Unsupported file type: ${unsupported.map((file) => file.name).join(', ')}`);
    }

    const sections = [];
    for (const file of list) {
      const text = await extractLessonTextFromFile(file);
      const cleanText = normalizeLongFormText(text);
      if (cleanText) {
        sections.push(`SOURCE FILE: ${file.name}\n${cleanText}`);
      }
    }
    if (sections.length === 0) {
      throw new Error('The selected lesson files did not contain readable text.');
    }
    return sections.join('\n\n---\n\n');
  }

  function hasLessonSourceInput({ files, lessonTopicText } = {}) {
    return Array.from(files || []).length > 0 || Boolean(normalizeLongFormText(lessonTopicText));
  }

  async function buildLessonSourceContent({ files, lessonTopicText, fileExtractor = extractLessonTextFromFiles } = {}) {
    const list = Array.from(files || []);
    const topic = normalizeLongFormText(lessonTopicText);
    const sections = [];
    let hasReadableFileContent = false;

    if (list.length > 0) {
      const fileContent = normalizeLongFormText(await fileExtractor(list));
      if (fileContent) {
        hasReadableFileContent = true;
        sections.push(`UPLOADED LESSON FILES:\n${fileContent}`);
      }
    }

    if (topic) {
      const heading = hasReadableFileContent
        ? FOCUS_INSTRUCTIONS_HEADING.slice(0, -1)
        : 'LEADER-PROVIDED LESSON TOPIC OR SUMMARY';
      sections.push(`${heading}:\n${topic}`);
    }

    if (sections.length === 0) {
      throw new Error('Add at least one lesson file or type a lesson topic, summary, or focus instructions before generating a game.');
    }

    return sections.join('\n\n---\n\n');
  }

  function updateNestedClue(gameData, updatedClue) {
    return {
      ...gameData,
      categories: gameData.categories.map((category) => ({
        ...category,
        clues: category.clues.map((clue) => clue.id === updatedClue.id ? updatedClue : clue),
      })),
    };
  }

  function formatScore(score) {
    const cents = scoreToCents(score);
    const absoluteCents = Math.abs(cents);
    const amount = absoluteCents % 100 === 0
      ? String(absoluteCents / 100)
      : (absoluteCents / 100).toFixed(2);
    return cents < 0 ? `-$${amount}` : `$${amount}`;
  }

  function formatClueBoardValue(value) {
    return `$${Number(value || 0)}`;
  }

  function formatCurrentClueDescription(currentClue) {
    if (!currentClue || typeof currentClue !== 'object') return '';
    const categoryTitle = coerceText(currentClue.categoryTitle || currentClue.category || currentClue.categoryName);
    const value = Number(currentClue.value || currentClue.clueValue || 0);
    if (categoryTitle && Number.isFinite(value) && value > 0) {
      return `${categoryTitle} for ${formatClueBoardValue(value)}`;
    }
    if (categoryTitle) return categoryTitle;
    if (Number.isFinite(value) && value > 0) return formatClueBoardValue(value);
    return '';
  }

  function buildVirtualBuzzerPlayerHeaderMessage({ session, claim } = {}) {
    const clueDescription = formatCurrentClueDescription(session?.buzz?.currentClue);
    if (clueDescription) return `Current question: ${clueDescription}.`;
    return claim
      ? 'Name claimed. Keep this screen open for the next question.'
      : 'Choose your player name.';
  }

  function buildVirtualBuzzerPhoneStatusMessage({ session, claim, uid, nowMs = Date.now() } = {}) {
    if (!session) return 'Waiting for the host…';
    const clueDescription = formatCurrentClueDescription(session?.buzz?.currentClue);
    const cluePhrase = clueDescription ? ` ${clueDescription}` : '';
    const clueForPhrase = clueDescription ? ` for ${clueDescription}` : '';
    const first = session?.buzz?.first || null;
    const playerUid = coerceText(uid);
    const playerIndex = Number(claim?.playerIndex);
    const lockedOut = Number.isInteger(playerIndex) && Array.isArray(session?.buzz?.lockedOutPlayerIndexes) &&
      session.buzz.lockedOutPlayerIndexes.includes(playerIndex);

    if (session.status === 'closed' || (session.expiresAt && Number(session.expiresAt) < Number(nowMs))) {
      return 'This virtual buzzer session is closed.';
    }
    if (!claim) {
      return 'Choose your player name.';
    }
    if (first?.uid === playerUid) {
      return first.source === 'host'
        ? `The host selected you${clueForPhrase}. Give your answer now.`
        : `You buzzed first${clueForPhrase}! Give your answer now.`;
    }
    if (first) {
      return `${first.playerName || 'Another player'} is answering${cluePhrase}. Wait for the host.`;
    }
    if (lockedOut) {
      return `You already answered${cluePhrase}. Wait while another player tries.`;
    }
    if (session.status === 'open' && session.buzz?.open) {
      return `Buzzers are open${clueForPhrase}!`;
    }
    return clueDescription ? `Waiting for the host on ${clueDescription}.` : 'Waiting for the host…';
  }

  function clueHasPartialCredit(clue) {
    return Math.max(0, Number(clue?.partialCreditAwarded || 0)) > 0 ||
      (Array.isArray(clue?.partialCreditContestantIds) && clue.partialCreditContestantIds.length > 0);
  }

  function getClueBoardCompletionOutcome(clue) {
    if (!clue?.completed) return 'open';
    if (String(clue.winningContestantId || '').trim()) return 'correct';
    if (clueHasPartialCredit(clue)) return 'partial';
    return 'incorrect';
  }

  function getClueBoardDisplayState({ clue, value }) {
    const clueValue = formatClueBoardValue(value ?? clue?.value);
    const outcome = getClueBoardCompletionOutcome(clue);

    if (outcome === 'open') {
      return {
        text: clueValue,
        className: 'game-board__clue',
        disabled: false,
        ariaLabel: `${clueValue} clue`,
      };
    }

    if (outcome === 'correct') {
      return {
        text: '✓',
        className: 'game-board__clue is-complete is-correct',
        disabled: false,
        ariaLabel: `${clueValue} clue answered correctly. Review result`,
      };
    }

    if (outcome === 'partial') {
      return {
        text: '⚠',
        className: 'game-board__clue is-complete is-partial',
        disabled: false,
        ariaLabel: `${clueValue} clue partially answered. Review result`,
      };
    }

    return {
      text: '✕',
      className: 'game-board__clue is-complete is-incorrect',
      disabled: false,
      ariaLabel: `${clueValue} clue missed or unanswered. Review result`,
    };
  }

  function getMostRecentCompletedClue(game) {
    let latest = null;
    let fallbackOrder = 0;
    (game?.categories || []).forEach((category) => {
      (category?.clues || []).forEach((clue) => {
        fallbackOrder += 1;
        if (!clue?.completed) return;
        const parsedTime = Date.parse(clue.completedAt || clue.hostOverrideUpdatedAt || '');
        const sortValue = Number.isFinite(parsedTime) ? parsedTime : fallbackOrder;
        if (!latest || sortValue >= latest.sortValue) {
          latest = { clue, category, sortValue };
        }
      });
    });
    return latest;
  }

  function getNextPickerNote({ game, contestants } = {}) {
    const latest = getMostRecentCompletedClue(game);
    if (!latest) return 'Host may choose the first question.';
    const winningContestantId = coerceText(latest.clue?.winningContestantId);
    if (winningContestantId) {
      const winner = (Array.isArray(contestants) ? contestants : []).find((contestant) => contestant?.id === winningContestantId);
      return `${winner?.name || 'The full-credit player'} should pick the next question.`;
    }
    return 'No full-credit answer last time; host may choose the next question.';
  }

  function shouldSubmitResponseFromKeydown(event) {
    return event?.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing;
  }

  function renderStatus(element, message, type = 'info') {
    if (!element) return;
    element.className = `game-status game-status--${type}`;
    element.textContent = message;
  }

  function initializeBereanBoard() {
    const app = document.querySelector('[data-berean-board]');
    if (!app) return;
    const virtualBuzzerService = ROOT.NTWVirtualBuzzerService;

    const setupForm = app.querySelector('#game-setup-form');
    const fileInput = app.querySelector('#lesson-files');
    const dropZone = app.querySelector('#lesson-drop-zone');
    const fileStatus = app.querySelector('#lesson-file-status');
    const fileList = app.querySelector('#lesson-file-list');
    const lessonTopicInput = app.querySelector('#lesson-topic-text');
    const setupStatus = app.querySelector('#game-setup-status');
    const generateButton = app.querySelector('#generate-game-button');
    const endpointInput = app.querySelector('#ntw-api-endpoint');
    const modelInput = app.querySelector('#ntw-api-model');
    const apiKeyInput = app.querySelector('#ntw-api-key');
    const gameArea = app.querySelector('#game-play-area');
    const scoreboard = app.querySelector('#scoreboard');
    const board = app.querySelector('#game-board');
    const gameTitle = app.querySelector('#generated-game-title');
    const nextPickerNote = app.querySelector('#next-picker-note');
    const resetButton = app.querySelector('#reset-game-button');
    const cluePanel = app.querySelector('#active-clue-panel');
    const clueCard = app.querySelector('.active-clue-card');
    const clueCardContent = app.querySelector('.active-clue-card__content');
    const clueHeading = app.querySelector('#active-clue-heading');
    const clueText = app.querySelector('#active-clue-text');
    const clueVerdict = app.querySelector('#clue-verdict');
    const clueAnswer = app.querySelector('#active-clue-answer');
    const clueExplanation = app.querySelector('#active-clue-explanation');
    const clueSource = app.querySelector('#active-clue-source');
    const activeClueReview = app.querySelector('#active-clue-review');
    const contestantChoices = app.querySelector('#contestant-choices');
    const responseSection = app.querySelector('#contestant-response-section');
    const contestantPromptSection = app.querySelector('#contestant-prompt-section');
    const responseLabel = app.querySelector('#contestant-response-label');
    const responseInput = app.querySelector('#contestant-response-input');
    const checkResponseButton = app.querySelector('#check-response-button');
    const clueFeedback = app.querySelector('#clue-feedback');
    const noBuzzButton = app.querySelector('#no-buzz-button');
    const closeClueButton = app.querySelector('#close-clue-button');
    const groupEditor = app.querySelector('#group-member-editor');
    const groupMemberTextarea = app.querySelector('#group-member-names');
    const saveGroupMembersButton = app.querySelector('#save-group-members-button');
    const groupReview = app.querySelector('#group-member-review');
    const groupChecklist = app.querySelector('#group-member-checklist');
    const editGroupMembersButton = app.querySelector('#edit-group-members-button');
    const clearGroupCookieButton = app.querySelector('#clear-group-cookie-button');
    const groupSetupStatus = app.querySelector('#group-setup-status');
    const playerPickerPanel = app.querySelector('#player-picker-panel');
    const playerPickerOptions = app.querySelector('#player-picker-options');
    const randomizePlayersButton = app.querySelector('#randomize-players-button');
    const confirmPlayersButton = app.querySelector('#confirm-players-button');
    const groupSetupStep = app.querySelector('#group-setup-step');
    const groupSetupToggle = app.querySelector('#group-setup-toggle');
    const groupSetupContent = app.querySelector('#group-setup-content');
    const lessonSetupSection = app.querySelector('#lesson-setup-section');
    const lessonSetupToggle = app.querySelector('#lesson-setup-toggle');
    const lessonSetupContent = app.querySelector('#lesson-setup-content');
    const continueToDifficultySetupButton = app.querySelector('#continue-to-difficulty-setup-button');
    const lessonSetupStatus = app.querySelector('#lesson-setup-status');
    const difficultySetupSection = app.querySelector('#difficulty-setup-section');
    const difficultySetupToggle = app.querySelector('#difficulty-setup-toggle');
    const difficultySetupContent = app.querySelector('#difficulty-setup-content');
    const difficultySetupStatus = app.querySelector('#difficulty-setup-status');
    const difficultyInputs = Array.from(app.querySelectorAll('input[name="game-difficulty"]'));
    const continueToApiSetupButton = app.querySelector('#continue-to-api-setup-button');
    const apiSetupSection = app.querySelector('#api-setup-section');
    const apiSetupToggle = app.querySelector('#api-setup-toggle');
    const apiSetupContent = app.querySelector('#api-setup-content');
    const selectedPlayersSummary = app.querySelector('#selected-players-summary');

    const buzzerSetupSection = app.querySelector('#buzzer-setup-section');
    const buzzerSetupToggle = app.querySelector('#buzzer-setup-toggle');
    const buzzerSetupContent = app.querySelector('#buzzer-setup-content');
    const buzzerSetupStatus = app.querySelector('#buzzer-setup-status');
    const buzzerModeInputs = Array.from(app.querySelectorAll('input[name="buzzer-mode"]'));
    const continueToLessonSetupButton = app.querySelector('#continue-to-lesson-setup-button');
    const virtualBuzzerHostPanel = app.querySelector('#virtual-buzzer-host-panel');
    const virtualBuzzerQr = app.querySelector('#virtual-buzzer-qr');
    const virtualBuzzerJoinCopy = app.querySelector('#virtual-buzzer-join-copy');
    const virtualBuzzerJoinLink = app.querySelector('#virtual-buzzer-join-link');
    const virtualBuzzerPlayerList = app.querySelector('#virtual-buzzer-player-list');
    const virtualBuzzerPlayerScreen = app.querySelector('#virtual-buzzer-player-screen');
    const virtualBuzzerPlayerStatus = app.querySelector('#virtual-buzzer-player-status');
    const virtualBuzzerNameOptions = app.querySelector('#virtual-buzzer-name-options');
    const virtualBuzzerClaimButton = app.querySelector('#virtual-buzzer-claim-button');
    const virtualBuzzerClaimedPanel = app.querySelector('#virtual-buzzer-claimed-panel');
    const virtualBuzzerClaimedName = app.querySelector('#virtual-buzzer-claimed-name');
    const virtualBuzzerButton = app.querySelector('#virtual-buzzer-button');
    const virtualBuzzerPhoneStatus = app.querySelector('#virtual-buzzer-phone-status');
    const hostBuzzerAudio = createHostBuzzerAudioController();
    const playerWakeLock = createPlayerScreenWakeLockController();

    let selectedFiles = [];
    let groupMemberNames = readSavedGroupMembersCookie(document.cookie);
    let chosenPlayerNames = [];
    let selectedPlayerNames = [];
    let lessonSetupComplete = false;
    let difficultySetupComplete = false;
    let selectedDifficultyLevel = '';
    let selectedBuzzerMode = DEFAULT_BUZZER_MODE;
    let buzzerSetupComplete = false;
    let virtualBuzzerContext = null;
    let virtualBuzzerSessionId = '';
    let virtualBuzzerJoinUrl = '';
    let virtualBuzzerSession = null;
    let virtualBuzzerUnsubscribe = null;
    let virtualBuzzerFirstHandledKey = '';
    let virtualBuzzerOpenRequestId = 0;
    let virtualBuzzerPlayerClaim = null;
    let virtualBuzzerPlayerSessionId = '';
    let virtualBuzzerPlayerContext = null;
    let virtualBuzzerPlayerSession = null;
    let virtualBuzzerPlayerUnsubscribe = null;
    let contestants = [];
    let gameData = null;
    let activeClue = null;
    let answerRevealed = false;
    let responseCheckInFlight = false;
    let clueFitFrame = 0;

    const savedEndpoint = safeGetBrowserStorageItem(window, 'ntwReviewGameEndpoint');
    const savedModel = safeGetBrowserStorageItem(window, 'ntwReviewGameModel');
    if (endpointInput) endpointInput.value = savedEndpoint ? normalizeChatCompletionsEndpoint(savedEndpoint) : DEFAULT_CHAT_COMPLETIONS_ENDPOINT;
    if (modelInput) modelInput.value = savedModel || DEFAULT_MODEL;

    function setSetupStepExpanded({ stepElement, toggleButton, contentElement, expanded, statusText, available = true }) {
      if (!stepElement || !toggleButton || !contentElement) return;
      const isAvailable = available !== false;
      const shouldExpand = isAvailable && expanded;
      contentElement.hidden = !shouldExpand;
      toggleButton.disabled = !isAvailable;
      toggleButton.setAttribute('aria-disabled', isAvailable ? 'false' : 'true');
      toggleButton.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');
      stepElement.classList.toggle('setup-step--expanded', shouldExpand);
      stepElement.classList.toggle('setup-step--collapsed', !shouldExpand);
      stepElement.classList.toggle('setup-step--locked', !isAvailable);
      const statusElement = stepElement.querySelector('[data-setup-step-status]');
      if (statusElement && statusText) {
        statusElement.textContent = statusText;
      }
    }

    function applySetupStepStage(stage) {
      const state = getSetupStepExpansionState(stage);
      const groupStatus = state.groupExpanded ? 'Current' : 'Done';
      const buzzerStatus = state.buzzerAvailable
        ? (state.buzzerExpanded ? 'Current' : ((stage === 'lesson' || stage === 'difficulty' || stage === 'api' || stage === 'game') ? 'Done' : 'Ready'))
        : 'Locked';
      const lessonStatus = state.lessonAvailable
        ? (state.lessonExpanded ? 'Current' : ((stage === 'difficulty' || stage === 'api' || stage === 'game') ? 'Done' : 'Ready'))
        : 'Locked';
      const difficultyStatus = state.difficultyAvailable
        ? (state.difficultyExpanded ? 'Current' : ((stage === 'api' || stage === 'game') ? 'Done' : 'Ready'))
        : 'Locked';
      const apiStatus = state.apiAvailable
        ? (state.apiExpanded ? 'Current' : (stage === 'game' ? 'Done' : 'Ready'))
        : 'Locked';
      setSetupStepExpanded({
        stepElement: groupSetupStep,
        toggleButton: groupSetupToggle,
        contentElement: groupSetupContent,
        expanded: state.groupExpanded,
        statusText: groupStatus,
        available: true,
      });
      setSetupStepExpanded({
        stepElement: buzzerSetupSection,
        toggleButton: buzzerSetupToggle,
        contentElement: buzzerSetupContent,
        expanded: state.buzzerExpanded,
        statusText: buzzerStatus,
        available: state.buzzerAvailable,
      });
      setSetupStepExpanded({
        stepElement: lessonSetupSection,
        toggleButton: lessonSetupToggle,
        contentElement: lessonSetupContent,
        expanded: state.lessonExpanded,
        statusText: lessonStatus,
        available: state.lessonAvailable,
      });
      setSetupStepExpanded({
        stepElement: difficultySetupSection,
        toggleButton: difficultySetupToggle,
        contentElement: difficultySetupContent,
        expanded: state.difficultyExpanded,
        statusText: difficultyStatus,
        available: state.difficultyAvailable,
      });
      setSetupStepExpanded({
        stepElement: apiSetupSection,
        toggleButton: apiSetupToggle,
        contentElement: apiSetupContent,
        expanded: state.apiExpanded,
        statusText: apiStatus,
        available: state.apiAvailable,
      });
    }

    function toggleSetupStep(stepName) {
      const setupSteps = {
        buzzer: {
          stepElement: buzzerSetupSection,
          toggleButton: buzzerSetupToggle,
          contentElement: buzzerSetupContent,
        },
        lesson: {
          stepElement: lessonSetupSection,
          toggleButton: lessonSetupToggle,
          contentElement: lessonSetupContent,
        },
        difficulty: {
          stepElement: difficultySetupSection,
          toggleButton: difficultySetupToggle,
          contentElement: difficultySetupContent,
        },
        api: {
          stepElement: apiSetupSection,
          toggleButton: apiSetupToggle,
          contentElement: apiSetupContent,
        },
      };

      if (stepName === 'group') {
        const shouldExpandGroup = Boolean(groupSetupContent?.hidden);
        setSetupStepExpanded({
          stepElement: groupSetupStep,
          toggleButton: groupSetupToggle,
          contentElement: groupSetupContent,
          expanded: shouldExpandGroup,
          statusText: shouldExpandGroup ? 'Current' : (buzzerSetupToggle?.disabled ? 'Current' : 'Done'),
          available: true,
        });
        if (shouldExpandGroup) {
          Object.values(setupSteps).forEach((step) => {
            if (step.toggleButton?.disabled) return;
            setSetupStepExpanded({
              ...step,
              expanded: false,
              statusText: 'Ready',
              available: true,
            });
          });
        }
        return;
      }

      const target = setupSteps[stepName];
      if (!target || target.toggleButton?.disabled) return;

      const shouldExpandTarget = Boolean(target.contentElement?.hidden);
      setSetupStepExpanded({
        ...target,
        expanded: shouldExpandTarget,
        statusText: shouldExpandTarget ? 'Current' : 'Ready',
        available: true,
      });
      if (shouldExpandTarget) {
        setSetupStepExpanded({
          stepElement: groupSetupStep,
          toggleButton: groupSetupToggle,
          contentElement: groupSetupContent,
          expanded: false,
          statusText: 'Done',
          available: true,
        });
        Object.entries(setupSteps).forEach(([name, step]) => {
          if (name === stepName || step.toggleButton?.disabled) return;
          setSetupStepExpanded({
            ...step,
            expanded: false,
            statusText: 'Ready',
            available: true,
          });
        });
      }
    }

    function resetCurrentGameAfterPlayerChange() {
      contestants = [];
      gameData = null;
      closeActiveClue();
      if (gameArea) gameArea.hidden = true;
    }

    function hideLessonSetup() {
      closeVirtualSession();
      selectedPlayerNames = [];
      buzzerSetupComplete = false;
      selectedBuzzerMode = DEFAULT_BUZZER_MODE;
      buzzerModeInputs.forEach((input) => { input.checked = input.value === DEFAULT_BUZZER_MODE; });
      lessonSetupComplete = false;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      if (selectedPlayersSummary) selectedPlayersSummary.textContent = '';
      if (buzzerSetupStatus) buzzerSetupStatus.textContent = '';
      if (lessonSetupStatus) lessonSetupStatus.textContent = '';
      if (difficultySetupStatus) difficultySetupStatus.textContent = '';
      if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = true;
      updateDifficultySetupControls();
      applySetupStepStage('group');
    }

    function renderSelectedPlayersSummary() {
      if (!selectedPlayersSummary) return;
      if (!selectedPlayerNames.length) {
        selectedPlayersSummary.textContent = '';
        return;
      }
      selectedPlayersSummary.textContent = `Players for this game: ${selectedPlayerNames.join(', ')}.`;
    }

    function currentLessonSourceIsPresent() {
      return hasLessonSourceInput({ files: selectedFiles, lessonTopicText: lessonTopicInput?.value || '' });
    }

    function updateLessonSetupControls() {
      const lessonSourcePresent = currentLessonSourceIsPresent();
      if (continueToDifficultySetupButton) {
        continueToDifficultySetupButton.disabled = !lessonSourcePresent;
      }
      return lessonSourcePresent;
    }

    function currentDifficultyLevel() {
      const checkedInput = difficultyInputs.find((input) => input.checked);
      return checkedInput?.value || '';
    }

    function updateDifficultySetupControls() {
      const difficultySelected = Boolean(getDifficultyLevelConfig(currentDifficultyLevel()));
      if (continueToApiSetupButton) {
        continueToApiSetupButton.disabled = !difficultySelected;
      }
      return difficultySelected;
    }

    function currentBuzzerMode() {
      const checkedInput = buzzerModeInputs.find((input) => input.checked);
      return checkedInput?.value || DEFAULT_BUZZER_MODE;
    }

    function isVirtualBuzzerMode() {
      return selectedBuzzerMode === 'virtual';
    }

    function renderVirtualBuzzerStatus(message, type = 'info') {
      renderStatus(buzzerSetupStatus, message, type);
    }

    function renderVirtualBuzzerQr(joinUrl) {
      if (!virtualBuzzerQr) return;
      virtualBuzzerQr.innerHTML = '';
      try {
        if (typeof ROOT.qrcode === 'function') {
          const qr = ROOT.qrcode(0, 'M');
          qr.addData(joinUrl);
          qr.make();
          virtualBuzzerQr.innerHTML = qr.createSvgTag(6, 2);
          return;
        }
      } catch (_error) {
        virtualBuzzerQr.innerHTML = '';
      }
      const fallback = document.createElement('p');
      fallback.className = 'privacy-note';
      fallback.textContent = 'QR code library unavailable. Use the fallback link.';
      virtualBuzzerQr.append(fallback);
    }

    function updateVirtualBuzzerPlayerList() {
      if (!virtualBuzzerPlayerList) return;
      const session = virtualBuzzerSession || { playerNames: selectedPlayerNames, claims: [] };
      const names = session.playerNames?.length ? session.playerNames : selectedPlayerNames;
      virtualBuzzerPlayerList.innerHTML = names.map((name, index) => {
        const claim = session.claims?.[index] || null;
        const color = getBuzzerColorForPlayerIndex(index);
        return `<li class="${claim ? 'is-claimed' : ''}" style="--virtual-buzzer-player-color: ${color.value}"><span aria-hidden="true">●</span><span>${escapeHtml(name)}</span><small>${claim ? `Buzzer #${index + 1} connected` : 'Waiting to connect'}</small></li>`;
      }).join('');
      const connectedCount = (session.claims || []).filter(Boolean).length;
      if (virtualBuzzerJoinCopy && names.length > 0) {
        virtualBuzzerJoinCopy.textContent = `${connectedCount} of ${names.length} players connected. Ask players to scan the QR code and choose their own name.`;
      }
      if (connectedCount === names.length && names.length > 0 && isVirtualBuzzerMode()) {
        renderVirtualBuzzerStatus('All virtual buzzers are connected. Continue with lesson setup when ready.', 'success');
      }
    }

    function getVirtualBuzzerConnectedCount() {
      return (virtualBuzzerSession?.claims || []).filter(Boolean).length;
    }

    function allVirtualPlayersConnected() {
      const expectedCount = virtualBuzzerSession?.playerNames?.length || selectedPlayerNames.length;
      return expectedCount > 0 && getVirtualBuzzerConnectedCount() >= expectedCount;
    }

    function updateVirtualBuzzerGamePanel() {
      if (nextPickerNote) {
        nextPickerNote.textContent = getNextPickerNote({ game: gameData, contestants });
      }
    }

    function mergeVirtualBuzzerSession(partial) {
      const existingNames = virtualBuzzerSession?.playerNames?.length ? virtualBuzzerSession.playerNames : selectedPlayerNames;
      const rawNames = existingNames.reduce((accumulator, name, index) => {
        accumulator[index] = name;
        return accumulator;
      }, {});
      const rawClaims = (virtualBuzzerSession?.claims || []).reduce((accumulator, claim, index) => {
        if (claim) accumulator[index] = claim;
        return accumulator;
      }, {});
      const rawSession = {
        hostUid: virtualBuzzerSession?.hostUid || virtualBuzzerContext?.uid || '',
        expiresAt: virtualBuzzerSession?.expiresAt || 0,
        status: virtualBuzzerSession?.status || 'setup',
        buzzRound: virtualBuzzerSession?.buzzRound || 0,
        playerNames: rawNames,
        playerClaims: rawClaims,
        buzz: virtualBuzzerSession?.buzz || { open: false, first: null, lockedOutPlayerIndexes: [] },
        ...partial,
      };
      virtualBuzzerSession = virtualBuzzerService?.normalizeVirtualBuzzerSession
        ? virtualBuzzerService.normalizeVirtualBuzzerSession(rawSession)
        : rawSession;
      updateVirtualBuzzerPlayerList();
      updateVirtualBuzzerGamePanel();
    }

    function handleVirtualFirstBuzz(firstBuzz) {
      if (!firstBuzz || !activeClue) return;
      const key = `${activeClue.id}:${firstBuzz.round}:${firstBuzz.uid}`;
      if (virtualBuzzerFirstHandledKey === key) return;
      virtualBuzzerFirstHandledKey = key;
      if (firstBuzz.source !== 'host') {
        hostBuzzerAudio.play();
      }
      const contestantId = getContestantIdForPlayerIndex(Number(firstBuzz.playerIndex));
      if (contestantChoices && contestantId) {
        const input = contestantChoices.querySelector(`input[name="active-contestant"][value="${contestantId}"]`);
        if (input && !input.disabled) {
          input.checked = true;
          updateResponseEntryState();
        }
      }
      const color = getBuzzerColorForPlayerIndex(Number(firstBuzz.playerIndex));
      if (clueFeedback) {
        clueFeedback.innerHTML = `<strong style="color: ${color.value}">${escapeHtml(firstBuzz.playerName)}</strong> buzzed first. Type that player's response below.`;
      }
      updateVirtualBuzzerGamePanel();
      disableVirtualBuzzersForHost(firstBuzz.round);
    }

    async function handleHostSelectedVirtualContestant() {
      if (!isVirtualBuzzerMode() || !virtualBuzzerContext || !virtualBuzzerSessionId || !activeClue || activeClue.completed || responseCheckInFlight) return;
      if (!virtualBuzzerService?.selectFirstBuzzForHost) return;
      const contestant = selectedContestant();
      if (!contestant) return;
      const playerIndex = getPlayerIndexForContestantId(contestant.id);
      if (playerIndex < 0) return;
      const claim = virtualBuzzerSession?.claims?.[playerIndex] || null;
      if (!claim?.uid) {
        if (clueFeedback) {
          clueFeedback.textContent = `${contestant.name} has not connected a phone buzzer yet. You can still type the answer here, but their phone cannot be disabled remotely.`;
        }
        return;
      }
      const currentFirst = virtualBuzzerSession?.buzz?.first || null;
      if (currentFirst?.uid === claim.uid) return;
      try {
        const result = await virtualBuzzerService.selectFirstBuzzForHost({
          context: virtualBuzzerContext,
          sessionId: virtualBuzzerSessionId,
          playerIndex,
          playerNames: virtualBuzzerSession?.playerNames?.length ? virtualBuzzerSession.playerNames : selectedPlayerNames,
          claim,
          round: virtualBuzzerSession?.buzz?.round ?? virtualBuzzerSession?.buzzRound ?? 0,
          currentClue: getCurrentClueVirtualBuzzerPayload(),
        });
        const snapshotValue = result?.snapshot?.val?.();
        if (snapshotValue) mergeVirtualBuzzerSession(snapshotValue);
        if (clueFeedback) {
          clueFeedback.textContent = `${contestant.name} was selected by the host. Type that player's response below.`;
        }
      } catch (error) {
        if (clueFeedback) {
          clueFeedback.textContent = error.message || 'Could not update that player’s phone buzzer.';
        }
      }
    }

    function handleVirtualBuzzerBuzzUpdate(rawBuzz) {
      mergeVirtualBuzzerSession({ buzz: rawBuzz || { open: false, first: null, lockedOutPlayerIndexes: [] } });
      if (rawBuzz?.first) {
        handleVirtualFirstBuzz(rawBuzz.first);
      }
    }

    function setVirtualBuzzerJoinLink(joinUrl) {
      virtualBuzzerJoinUrl = joinUrl || '';
      if (virtualBuzzerJoinLink) {
        virtualBuzzerJoinLink.href = virtualBuzzerJoinUrl || '#';
        virtualBuzzerJoinLink.hidden = !virtualBuzzerJoinUrl;
        virtualBuzzerJoinLink.textContent = virtualBuzzerJoinUrl ? 'Open player buzzer link' : '';
      }
      if (virtualBuzzerJoinCopy && virtualBuzzerJoinUrl) {
        virtualBuzzerJoinCopy.textContent = `Fallback link: ${virtualBuzzerJoinUrl}`;
      }
      if (virtualBuzzerJoinUrl) renderVirtualBuzzerQr(virtualBuzzerJoinUrl);
    }

    async function closeVirtualSession() {
      const context = virtualBuzzerContext;
      const sessionId = virtualBuzzerSessionId;
      virtualBuzzerOpenRequestId += 1;
      virtualBuzzerUnsubscribe?.();
      virtualBuzzerUnsubscribe = null;
      virtualBuzzerSessionId = '';
      virtualBuzzerJoinUrl = '';
      virtualBuzzerSession = null;
      virtualBuzzerFirstHandledKey = '';
      if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = true;
      if (virtualBuzzerQr) virtualBuzzerQr.innerHTML = '';
      if (virtualBuzzerPlayerList) virtualBuzzerPlayerList.innerHTML = '';
      updateVirtualBuzzerGamePanel();
      if (context && sessionId && virtualBuzzerService?.closeVirtualBuzzerSession) {
        try {
          await virtualBuzzerService.closeVirtualBuzzerSession({ context, sessionId });
        } catch (_error) {
          // Best-effort cleanup. Expiration still closes abandoned sessions.
        }
      }
      if (context && virtualBuzzerService?.disposeFirebaseContext) {
        await virtualBuzzerService.disposeFirebaseContext(context);
      }
      if (context === virtualBuzzerContext) {
        virtualBuzzerContext = null;
      }
    }

    async function createVirtualBuzzerHostSession() {
      if (!virtualBuzzerService) {
        throw new Error('Virtual buzzers are not available because the buzzer service did not load.');
      }
      const names = selectedPlayerNames.length ? selectedPlayerNames : currentPlayerSelection().playerNames;
      if (!names.length) {
        throw new Error('Confirm one to four players before creating virtual buzzers.');
      }
      if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = false;
      renderVirtualBuzzerStatus('Creating virtual buzzer session…', 'info');
      if (!virtualBuzzerContext) {
        virtualBuzzerContext = await virtualBuzzerService.initializeFirebaseContext();
      }
      if (!virtualBuzzerSessionId) {
        const created = await virtualBuzzerService.createVirtualBuzzerSession({
          context: virtualBuzzerContext,
          playerNames: names,
        });
        virtualBuzzerSessionId = created.sessionId;
        mergeVirtualBuzzerSession(created.record);
        await virtualBuzzerService.setHostStatus?.(virtualBuzzerContext, virtualBuzzerSessionId, 'ready');
        mergeVirtualBuzzerSession({ status: 'ready' });
      }
      const joinUrl = virtualBuzzerService.buildVirtualBuzzerJoinUrl({
        origin: window.location.origin,
        pathname: window.location.pathname,
        sessionId: virtualBuzzerSessionId,
      });
      setVirtualBuzzerJoinLink(joinUrl);
      if (!virtualBuzzerUnsubscribe && virtualBuzzerService.subscribeToSessionPaths) {
        virtualBuzzerUnsubscribe = virtualBuzzerService.subscribeToSessionPaths(virtualBuzzerContext, virtualBuzzerSessionId, {
          onClaims: (claims) => mergeVirtualBuzzerSession({ playerClaims: claims || {} }),
          onBuzz: (buzz) => handleVirtualBuzzerBuzzUpdate(buzz || {}),
          onStatus: (status) => mergeVirtualBuzzerSession({ status }),
        });
      }
      renderVirtualBuzzerStatus('Virtual buzzers ready. Ask players to scan the QR code.', 'success');
      updateVirtualBuzzerPlayerList();
      updateVirtualBuzzerGamePanel();
    }

    async function handleBuzzerModeChanged() {
      selectedBuzzerMode = requireBuzzerMode(currentBuzzerMode()).value;
      buzzerSetupComplete = false;
      if (selectedBuzzerMode === 'in-person') {
        await closeVirtualSession();
        renderVirtualBuzzerStatus('In-person play selected. Physical buzzers or hand-raising will work as before.', 'success');
        return;
      }
      void hostBuzzerAudio.prime();
      try {
        await createVirtualBuzzerHostSession();
      } catch (error) {
        if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = true;
        renderVirtualBuzzerStatus(error.message || 'Could not create virtual buzzers.', 'error');
      }
    }

    async function completeBuzzerSetup() {
      try {
        selectedBuzzerMode = requireBuzzerMode(currentBuzzerMode()).value;
        if (selectedBuzzerMode === 'virtual') {
          void hostBuzzerAudio.prime();
          await createVirtualBuzzerHostSession();
        } else {
          await closeVirtualSession();
          renderVirtualBuzzerStatus('In-person play selected. Continue to lesson setup.', 'success');
        }
        buzzerSetupComplete = true;
        applySetupStepStage('lesson');
        lessonSetupSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = true;
        renderVirtualBuzzerStatus(error.message || 'Choose a buzzer mode before continuing.', 'error');
      }
    }

    function getAttemptedPlayerIndexesForClue(clue = activeClue) {
      const attempted = Array.isArray(clue?.attemptedContestantIds) ? clue.attemptedContestantIds : [];
      return attempted.map(getPlayerIndexForContestantId).filter((index) => index >= 0);
    }

    function getCurrentClueVirtualBuzzerPayload(clue = activeClue) {
      if (!clue) return null;
      const found = clue.id ? findClue(clue.id) : null;
      return {
        categoryTitle: found?.category?.title || '',
        value: Number(clue.value || 0),
      };
    }

    function isCurrentVirtualBuzzerOpenRequest({ requestId, clueId, sessionId, context }) {
      return requestId === virtualBuzzerOpenRequestId
        && context === virtualBuzzerContext
        && sessionId === virtualBuzzerSessionId
        && Boolean(activeClue)
        && activeClue.id === clueId
        && !activeClue.completed
        && !cluePanel?.hidden;
    }

    async function resetVirtualBuzzersForNextAttempt({ clue = activeClue, requestId = virtualBuzzerOpenRequestId } = {}) {
      const context = virtualBuzzerContext;
      const sessionId = virtualBuzzerSessionId;
      const clueId = clue?.id || '';
      if (!isVirtualBuzzerMode() || !context || !sessionId || !clue || clue.completed) return;
      try {
        const result = await virtualBuzzerService.resetBuzzersForHost({
          context,
          sessionId,
          open: true,
          lockedOutPlayerIndexes: getAttemptedPlayerIndexesForClue(clue),
          currentClue: getCurrentClueVirtualBuzzerPayload(clue),
        });
        const snapshotValue = result?.snapshot?.val?.();
        if (isCurrentVirtualBuzzerOpenRequest({ requestId, clueId, sessionId, context })) {
          if (snapshotValue) mergeVirtualBuzzerSession(snapshotValue);
        } else {
          const staleRound = snapshotValue?.buzz?.round ?? snapshotValue?.buzzRound ?? null;
          await disableVirtualBuzzersForHost(staleRound, sessionId, context);
        }
      } catch (_error) {
        // Keep the leader-facing in-person controls usable even if Firebase fails mid-round.
      }
    }

    async function openVirtualBuzzersForActiveClue() {
      if (!isVirtualBuzzerMode() || !virtualBuzzerContext || !virtualBuzzerSessionId || !activeClue || activeClue.completed) return;
      const clue = activeClue;
      const requestId = ++virtualBuzzerOpenRequestId;
      virtualBuzzerFirstHandledKey = '';
      await resetVirtualBuzzersForNextAttempt({ clue, requestId });
    }

    async function disableVirtualBuzzersForHost(expectedRound = virtualBuzzerSession?.buzz?.round ?? virtualBuzzerSession?.buzzRound, sessionId = virtualBuzzerSessionId, context = virtualBuzzerContext) {
      if (!context || !sessionId) return;
      if (!isVirtualBuzzerMode() && sessionId === virtualBuzzerSessionId) return;
      try {
        const result = await virtualBuzzerService.disableBuzzersForHost({
          context,
          sessionId,
          expectedRound,
        });
        const snapshotValue = result?.snapshot?.val?.() || {};
        if (result?.committed && context === virtualBuzzerContext && sessionId === virtualBuzzerSessionId) {
          mergeVirtualBuzzerSession({
            buzz: {
              ...(virtualBuzzerSession?.buzz || {}),
              ...snapshotValue,
              open: false,
            },
          });
        }
      } catch (_error) {
        // Best-effort only; the next reset/open transaction will recover.
      }
    }

    function maybeCloseVirtualSessionWhenGameComplete() {
      if (!gameData) return;
      const allComplete = gameData.categories.every((category) => category.clues.every((clue) => clue.completed));
      if (allComplete) closeVirtualSession();
    }

    function renderPlayerPhoneSession() {
      if (!virtualBuzzerPlayerScreen || !virtualBuzzerService) return;
      const session = virtualBuzzerPlayerSession;
      const uid = virtualBuzzerPlayerContext?.uid || '';
      const sessionClosed = virtualBuzzerService.isVirtualBuzzerSessionClosed?.(session || {}) || false;
      const hasClaim = Boolean(virtualBuzzerPlayerClaim);
      document.body?.classList.toggle('virtual-buzzer-player-route--claimed', hasClaim);
      if (virtualBuzzerNameOptions) virtualBuzzerNameOptions.hidden = hasClaim;
      if (virtualBuzzerClaimButton) virtualBuzzerClaimButton.hidden = hasClaim;
      if (virtualBuzzerClaimedPanel) virtualBuzzerClaimedPanel.hidden = !hasClaim;
      const selectedPlayerIndex = virtualBuzzerNameOptions?.querySelector('input[name="virtual-buzzer-player-name"]:checked')?.value ?? null;
      const claimOptions = virtualBuzzerService.getPlayerClaimOptions(session || {}, uid, selectedPlayerIndex);
      if (virtualBuzzerNameOptions && !hasClaim) {
        virtualBuzzerNameOptions.innerHTML = claimOptions.map((option) => {
          const inputId = `virtual-player-name-${option.playerIndex}`;
          const disabled = Boolean(option.disabled);
          const note = option.unavailableReason === 'closed'
            ? 'session closed'
            : (option.unavailableReason === 'claimed' ? 'claimed' : `Buzzer #${option.buzzerNumber}`);
          return `<label for="${inputId}" class="${disabled ? 'is-claimed' : ''}"><input id="${inputId}" type="radio" name="virtual-buzzer-player-name" value="${option.playerIndex}" ${disabled ? 'disabled' : ''} ${option.selected ? 'checked' : ''} /><span>${escapeHtml(option.playerName)}</span><small>${note}</small></label>`;
        }).join('');
      }
      if (virtualBuzzerClaimButton) {
        virtualBuzzerClaimButton.disabled = sessionClosed || hasClaim || !virtualBuzzerNameOptions?.querySelector('input[name="virtual-buzzer-player-name"]:checked');
      }
      if (virtualBuzzerPlayerClaim) {
        const color = getBuzzerColorForPlayerIndex(virtualBuzzerPlayerClaim.playerIndex);
        if (virtualBuzzerClaimedName) {
          virtualBuzzerClaimedName.textContent = `${virtualBuzzerPlayerClaim.playerName} — Buzzer #${virtualBuzzerPlayerClaim.buzzerNumber}`;
          virtualBuzzerClaimedName.style.setProperty('--virtual-buzzer-player-color', color.value);
        }
        if (virtualBuzzerButton) {
          virtualBuzzerButton.style.setProperty('--virtual-buzzer-player-color', color.value);
          virtualBuzzerButton.disabled = !virtualBuzzerService.canSubmitVirtualBuzz({ session, claim: virtualBuzzerPlayerClaim, uid });
        }
      }
      if (virtualBuzzerPhoneStatus && session) {
        virtualBuzzerPhoneStatus.textContent = buildVirtualBuzzerPhoneStatusMessage({
          session,
          claim: virtualBuzzerPlayerClaim,
          uid,
        });
        if (sessionClosed && virtualBuzzerButton) {
          virtualBuzzerButton.disabled = true;
          void playerWakeLock.release();
        }
      }
      if (virtualBuzzerPlayerStatus && session) {
        const statusType = virtualBuzzerPlayerClaim ? 'success' : 'info';
        renderStatus(virtualBuzzerPlayerStatus, buildVirtualBuzzerPlayerHeaderMessage({
          session,
          claim: virtualBuzzerPlayerClaim,
        }), statusType);
      }
    }

    async function initializeVirtualBuzzerPlayerScreen() {
      if (!isVirtualBuzzerPlayerRoute(window.location)) return false;
      virtualBuzzerPlayerSessionId = getVirtualBuzzerSessionIdFromLocation(window.location);
      document.body?.classList.add('virtual-buzzer-player-route');
      document.body?.classList.remove('virtual-buzzer-player-route--claimed');
      if (setupForm) setupForm.hidden = true;
      if (virtualBuzzerPlayerScreen) virtualBuzzerPlayerScreen.hidden = false;
      if (virtualBuzzerHostPanel) virtualBuzzerHostPanel.hidden = true;
      void playerWakeLock.request();
      if (!virtualBuzzerService) {
        void playerWakeLock.release();
        if (virtualBuzzerClaimButton) virtualBuzzerClaimButton.disabled = true;
        if (virtualBuzzerButton) virtualBuzzerButton.disabled = true;
        renderStatus(virtualBuzzerPlayerStatus, 'Virtual buzzers are unavailable on this page load.', 'error');
        return true;
      }
      try {
        virtualBuzzerPlayerContext = await virtualBuzzerService.initializeFirebaseContext();
        renderStatus(virtualBuzzerPlayerStatus, 'Choose your player name.', 'info');
        virtualBuzzerPlayerUnsubscribe = virtualBuzzerService.subscribeToSessionValue(virtualBuzzerPlayerContext, virtualBuzzerPlayerSessionId, (session) => {
          virtualBuzzerPlayerSession = session;
          if (virtualBuzzerPlayerClaim) {
            virtualBuzzerPlayerClaim = session.claims?.[virtualBuzzerPlayerClaim.playerIndex] || virtualBuzzerPlayerClaim;
          } else {
            virtualBuzzerPlayerClaim = session.claims?.find((claim) => claim?.uid === virtualBuzzerPlayerContext?.uid) || null;
          }
          renderPlayerPhoneSession();
        });
      } catch (error) {
        void playerWakeLock.release();
        renderStatus(virtualBuzzerPlayerStatus, error.message || 'Could not join the virtual buzzer session.', 'error');
      }
      return true;
    }

    function markDifficultySetupChanged() {
      const wasComplete = difficultySetupComplete;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      updateDifficultySetupControls();
      if (wasComplete && selectedPlayerNames.length > 0) {
        gameData = null;
        closeActiveClue();
        if (gameArea) gameArea.hidden = true;
        applySetupStepStage('difficulty');
        renderStatus(difficultySetupStatus, 'Difficulty changed. Continue to API Setup again when the difficulty is ready.', 'info');
      }
    }

    function markLessonSetupChanged() {
      const wasComplete = lessonSetupComplete || difficultySetupComplete;
      lessonSetupComplete = false;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      updateLessonSetupControls();
      updateDifficultySetupControls();
      if (wasComplete && selectedPlayerNames.length > 0) {
        gameData = null;
        closeActiveClue();
        if (gameArea) gameArea.hidden = true;
        if (difficultySetupStatus) difficultySetupStatus.textContent = '';
        applySetupStepStage('lesson');
        renderStatus(lessonSetupStatus, 'Lesson setup changed. Continue to Difficulty Setup again when the lesson source is ready.', 'info');
      }
    }

    function completeLessonSetup() {
      if (!updateLessonSetupControls()) {
        renderStatus(lessonSetupStatus, 'Add at least one lesson file or type a lesson topic, summary, or focus instructions before continuing.', 'error');
        return;
      }
      lessonSetupComplete = true;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      updateDifficultySetupControls();
      renderStatus(lessonSetupStatus, 'Lesson source ready. Choose a difficulty level for this game board.', 'success');
      applySetupStepStage('difficulty');
      difficultySetupSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function completeDifficultySetup() {
      if (!lessonSetupComplete) {
        applySetupStepStage('lesson');
        renderStatus(lessonSetupStatus, 'Complete lesson setup before choosing a difficulty level.', 'error');
        return;
      }
      if (!updateDifficultySetupControls()) {
        renderStatus(difficultySetupStatus, 'Select a difficulty level before continuing to NTW’s API setup.', 'error');
        return;
      }
      const difficulty = requireDifficultyLevel(currentDifficultyLevel());
      selectedDifficultyLevel = difficulty.value;
      difficultySetupComplete = true;
      renderStatus(difficultySetupStatus, `Difficulty set to ${getDifficultyLevelSummary(difficulty.value)}. Connect to NTW’s API to generate the game board.`, 'success');
      applySetupStepStage('api');
      apiSetupSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getAttendanceEntriesFromChecklist() {
      if (!groupChecklist) return [];
      return Array.from(groupChecklist.querySelectorAll('input[name="group-member-present"]')).map((input) => ({
        name: input.value,
        checked: input.checked,
      }));
    }

    function getAttendingNamesFromChecklist() {
      return getCheckedGroupMemberNames(getAttendanceEntriesFromChecklist());
    }

    function getChosenPlayerNamesFromPicker() {
      if (!playerPickerOptions) return [];
      return normalizeGroupMemberList(
        Array.from(playerPickerOptions.querySelectorAll('input[name="selected-player"]:checked')).map((input) => input.value),
        { allowEmpty: true }
      );
    }

    function renderPlayerPickerOptions(attendingNames) {
      if (!playerPickerOptions) return;
      const chosenKeys = new Set(chosenPlayerNames.map((name) => name.toLowerCase()));
      playerPickerOptions.innerHTML = attendingNames.map((name, index) => {
        const inputId = `selected-player-${index}`;
        return `
          <label class="group-member-option player-picker-option" for="${inputId}">
            <input id="${inputId}" type="checkbox" name="selected-player" value="${escapeHtml(name)}" ${chosenKeys.has(name.toLowerCase()) ? 'checked' : ''} />
            <span>${escapeHtml(name)}</span>
          </label>
        `;
      }).join('');
    }

    function currentPlayerSelection() {
      const attendingNames = getAttendingNamesFromChecklist();
      if (attendingNames.length > 4) {
        const attendingKeys = new Set(attendingNames.map((name) => name.toLowerCase()));
        chosenPlayerNames = chosenPlayerNames.filter((name) => attendingKeys.has(name.toLowerCase()));
      }
      return resolvePlayerSelection({ attendingNames, chosenPlayerNames });
    }

    function refreshPlayerSelectionUi({ keepLessonOpen = false } = {}) {
      const attendingNames = getAttendingNamesFromChecklist();
      if (attendingNames.length <= 4) {
        chosenPlayerNames = [];
      }
      const selection = resolvePlayerSelection({ attendingNames, chosenPlayerNames });
      const nextPlayerNames = selection.canContinue ? selection.playerNames : [];
      const shouldClearGeneratedGame = shouldResetGeneratedGameForPlayerSelectionChange({
        currentPlayerNames: selectedPlayerNames,
        nextPlayerNames,
        hasGeneratedGame: Boolean(gameData),
      });
      const shouldClearVirtualBuzzers = shouldResetVirtualBuzzersForPlayerSelectionChange({
        currentPlayerNames: selectedPlayerNames,
        nextPlayerNames,
        hasVirtualSession: Boolean(virtualBuzzerSessionId || virtualBuzzerContext),
        selectedBuzzerMode,
        buzzerSetupComplete,
      });

      if (playerPickerPanel) {
        playerPickerPanel.hidden = !selection.needsPlayerPick;
      }
      if (selection.needsPlayerPick) {
        renderPlayerPickerOptions(attendingNames);
      } else if (playerPickerOptions) {
        playerPickerOptions.innerHTML = '';
      }

      if (confirmPlayersButton) {
        confirmPlayersButton.hidden = groupMemberNames.length === 0;
        confirmPlayersButton.disabled = !selection.canContinue;
      }

      const statusType = selection.canContinue ? 'success' : (attendingNames.length === 0 ? 'error' : 'info');
      renderStatus(groupSetupStatus, selection.message, statusType);

      if (!selection.canContinue) {
        if (shouldClearGeneratedGame) {
          resetCurrentGameAfterPlayerChange();
        }
        hideLessonSetup();
        return selection;
      }

      if (keepLessonOpen && !lessonSetupToggle?.disabled) {
        if (shouldClearGeneratedGame) {
          resetCurrentGameAfterPlayerChange();
          renderStatus(groupSetupStatus, 'Players changed, so the current game board was cleared. Generate a new board after confirming the players.', 'info');
        }
        if (shouldClearVirtualBuzzers) {
          void closeVirtualSession();
          buzzerSetupComplete = false;
          selectedBuzzerMode = DEFAULT_BUZZER_MODE;
          buzzerModeInputs.forEach((input) => { input.checked = input.value === DEFAULT_BUZZER_MODE; });
          lessonSetupComplete = false;
          difficultySetupComplete = false;
          selectedDifficultyLevel = '';
          if (lessonSetupStatus) lessonSetupStatus.textContent = '';
          if (difficultySetupStatus) difficultySetupStatus.textContent = '';
          updateDifficultySetupControls();
          applySetupStepStage('buzzer');
          renderStatus(groupSetupStatus, 'Players changed, so virtual buzzers were reset. Choose In-person or Virtual again before continuing.', 'info');
          renderStatus(buzzerSetupStatus, 'Players changed. Choose in-person or virtual again to create the correct buzzer setup.', 'info');
        }
        selectedPlayerNames = selection.playerNames;
        contestants = createContestants(selectedPlayerNames);
        renderSelectedPlayersSummary();
      }
      return selection;
    }

    function renderGroupMemberChecklist() {
      if (!groupChecklist) return;
      groupChecklist.innerHTML = groupMemberNames.map((name, index) => {
        const inputId = `group-member-present-${index}`;
        return `
          <label class="group-member-option" for="${inputId}">
            <input id="${inputId}" type="checkbox" name="group-member-present" value="${escapeHtml(name)}" checked />
            <span>${escapeHtml(name)}</span>
          </label>
        `;
      }).join('');
      refreshPlayerSelectionUi();
    }

    function showGroupEditor(names = groupMemberNames) {
      if (groupMemberTextarea) groupMemberTextarea.value = normalizeGroupMemberList(names || [], { allowEmpty: true }).join(', ');
      if (groupEditor) groupEditor.hidden = false;
      if (groupReview) groupReview.hidden = true;
      if (playerPickerPanel) playerPickerPanel.hidden = true;
      if (confirmPlayersButton) confirmPlayersButton.hidden = true;
      chosenPlayerNames = [];
      hideLessonSetup();
      resetCurrentGameAfterPlayerChange();
      renderStatus(groupSetupStatus, 'Enter your group member names separated by commas.', 'info');
    }

    function showGroupReview(names, message = 'Group saved. Uncheck anyone who is absent, then continue.') {
      groupMemberNames = normalizeGroupMemberList(names || [], { allowEmpty: true });
      if (groupMemberTextarea) groupMemberTextarea.value = groupMemberNames.join(', ');
      if (groupEditor) groupEditor.hidden = true;
      if (groupReview) groupReview.hidden = false;
      chosenPlayerNames = [];
      hideLessonSetup();
      resetCurrentGameAfterPlayerChange();
      renderGroupMemberChecklist();
      const selection = currentPlayerSelection();
      renderStatus(groupSetupStatus, selection.needsPlayerPick ? selection.message : message, selection.needsPlayerPick ? 'info' : 'success');
    }

    function saveGroupMembersFromEditor() {
      try {
        const names = parseGroupMemberNames(groupMemberTextarea?.value || '');
        writeSavedGroupMembersCookie(names);
        showGroupReview(names, 'Group saved in this browser. Uncheck absent members, then continue.');
      } catch (error) {
        renderStatus(groupSetupStatus, error.message || 'Could not save those group members.', 'error');
      }
    }

    function confirmPlayerSelection() {
      const selection = currentPlayerSelection();
      if (!selection.canContinue) {
        renderStatus(groupSetupStatus, selection.message, 'error');
        hideLessonSetup();
        return;
      }
      if (virtualBuzzerSessionId) closeVirtualSession();
      selectedPlayerNames = selection.playerNames;
      contestants = createContestants(selectedPlayerNames);
      buzzerSetupComplete = false;
      selectedBuzzerMode = requireBuzzerMode(currentBuzzerMode()).value;
      lessonSetupComplete = false;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      renderStatus(groupSetupStatus, selection.message, 'success');
      renderStatus(buzzerSetupStatus, 'Choose whether this game is in-person or remote.', 'info');
      if (lessonSetupStatus) lessonSetupStatus.textContent = '';
      if (difficultySetupStatus) difficultySetupStatus.textContent = '';
      updateDifficultySetupControls();
      applySetupStepStage('buzzer');
      updateLessonSetupControls();
      renderSelectedPlayersSummary();
      updateVirtualBuzzerPlayerList();
      buzzerSetupSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    virtualBuzzerNameOptions?.addEventListener('change', () => {
      void playerWakeLock.request();
      renderPlayerPhoneSession();
    });
    virtualBuzzerClaimButton?.addEventListener('click', async () => {
      void playerWakeLock.request();
      if (!virtualBuzzerPlayerContext || !virtualBuzzerPlayerSession) return;
      if (virtualBuzzerService.isVirtualBuzzerSessionClosed?.(virtualBuzzerPlayerSession)) {
        renderStatus(virtualBuzzerPlayerStatus, 'This virtual buzzer session is closed.', 'error');
        renderPlayerPhoneSession();
        return;
      }
      const selected = virtualBuzzerNameOptions?.querySelector('input[name="virtual-buzzer-player-name"]:checked');
      if (!selected) return;
      try {
        const playerIndex = Number(selected.value);
        const result = await virtualBuzzerService.claimPlayerSlot({
          context: virtualBuzzerPlayerContext,
          sessionId: virtualBuzzerPlayerSessionId,
          playerIndex,
          playerNames: virtualBuzzerPlayerSession.playerNames,
        });
        if (!result.committed) {
          renderStatus(virtualBuzzerPlayerStatus, 'That name was just claimed by another device. Choose another available name.', 'error');
          return;
        }
        virtualBuzzerPlayerClaim = { ...result.claim, playerIndex };
        renderStatus(virtualBuzzerPlayerStatus, 'Name claimed. Keep this screen open for the next question.', 'success');
        renderPlayerPhoneSession();
        virtualBuzzerClaimedPanel?.focus({ preventScroll: true });
      } catch (error) {
        renderStatus(virtualBuzzerPlayerStatus, error.message || 'Could not claim that player name.', 'error');
      }
    });
    virtualBuzzerButton?.addEventListener('click', async () => {
      void playerWakeLock.request();
      if (!virtualBuzzerPlayerContext || !virtualBuzzerPlayerSession || !virtualBuzzerPlayerClaim) return;
      if (!virtualBuzzerService.canSubmitVirtualBuzz({ session: virtualBuzzerPlayerSession, claim: virtualBuzzerPlayerClaim, uid: virtualBuzzerPlayerContext.uid })) return;
      try {
        if (virtualBuzzerButton) virtualBuzzerButton.disabled = true;
        const result = await virtualBuzzerService.submitFirstBuzz({
          context: virtualBuzzerPlayerContext,
          sessionId: virtualBuzzerPlayerSessionId,
          playerIndex: virtualBuzzerPlayerClaim.playerIndex,
          playerNames: virtualBuzzerPlayerSession.playerNames,
          round: virtualBuzzerPlayerSession.buzzRound,
        });
        if (virtualBuzzerPhoneStatus) {
          virtualBuzzerPhoneStatus.textContent = result.committed ? 'You buzzed first!' : 'Another player buzzed first.';
        }
      } catch (error) {
        if (virtualBuzzerPhoneStatus) virtualBuzzerPhoneStatus.textContent = error.message || 'Could not send your buzz.';
        renderPlayerPhoneSession();
      }
    });
    document.addEventListener('visibilitychange', () => {
      void playerWakeLock.handleVisibilityChange();
    });
    window.addEventListener('pagehide', () => {
      void playerWakeLock.release();
    });

    if (isVirtualBuzzerPlayerRoute(window.location)) {
      initializeVirtualBuzzerPlayerScreen();
      return;
    }

    if (groupMemberNames.length > 0) {
      showGroupReview(groupMemberNames, 'Saved group loaded. Uncheck absent members, then continue.');
    } else {
      showGroupEditor([]);
    }

    function renderSelectedLessonFileList() {
      if (!fileList) return;
      fileList.hidden = selectedFiles.length === 0;
      if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
      }
      fileList.innerHTML = selectedFiles.map((file, index) => {
        const supported = isSupportedLessonFile(file);
        const badge = supported ? 'Ready' : 'Unsupported';
        return `
          <li class="lesson-file-list__item">
            <span class="lesson-file-list__name">${escapeHtml(file.name || `Lesson file ${index + 1}`)}</span>
            <span class="lesson-file-list__badge">${badge}</span>
            <button type="button" class="lesson-file-list__remove" data-remove-lesson-file-index="${index}" aria-label="Remove ${escapeHtml(file.name || `lesson file ${index + 1}`)}">Remove</button>
          </li>
        `;
      }).join('');
    }

    function updateFileStatus() {
      if (fileStatus) {
        if (selectedFiles.length === 0) {
          fileStatus.textContent = 'No lesson files selected yet.';
        } else {
          const unsupported = selectedFiles.filter((file) => !isSupportedLessonFile(file));
          const fileCount = `${selectedFiles.length} ${selectedFiles.length === 1 ? 'lesson file' : 'lesson files'} selected.`;
          fileStatus.textContent = unsupported.length > 0
            ? `${fileCount} Unsupported: ${unsupported.map((file) => file.name).join(', ')}.`
            : `${fileCount} Remove any file you added by accident before continuing.`;
        }
      }
      renderSelectedLessonFileList();
    }

    function resetActiveClueFit() {
      if (clueFitFrame) {
        window.cancelAnimationFrame?.(clueFitFrame);
        window.clearTimeout?.(clueFitFrame);
        clueFitFrame = 0;
      }
      clueCard?.style.removeProperty('--active-clue-scale');
      clueCard?.style.removeProperty('--active-clue-card-height');
      clueCard?.style.removeProperty('--active-clue-content-width');
      clueCard?.classList.remove('is-scaled');
    }

    function getPanelAvailableRect() {
      if (!cluePanel) return { availableWidth: 0, availableHeight: 0 };
      const styles = window.getComputedStyle(cluePanel);
      const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      return {
        availableWidth: Math.max(1, cluePanel.clientWidth - paddingX),
        availableHeight: Math.max(1, cluePanel.clientHeight - paddingY),
      };
    }

    function applyActiveClueScale(scale) {
      if (!clueCard || !clueCardContent) return;
      const scaleValue = formatClueModalScaleForCss(scale);
      const normalizedScale = Number(scaleValue);
      clueCard.style.setProperty('--active-clue-scale', scaleValue);
      clueCard.style.setProperty('--active-clue-content-width', `${100 / normalizedScale}%`);
      const scaledHeight = Math.ceil(clueCardContent.scrollHeight * normalizedScale) + CLUE_MODAL_FIT_TOLERANCE_PX;
      clueCard.style.setProperty('--active-clue-card-height', `${scaledHeight}px`);
      clueCard.classList.toggle('is-scaled', normalizedScale < 0.999);
    }

    function fitActiveClueCard() {
      clueFitFrame = 0;
      if (!cluePanel || cluePanel.hidden || !clueCard || !clueCardContent) return;
      resetActiveClueFit();
      const available = getPanelAvailableRect();
      const firstScale = calculateClueModalScale({
        ...available,
        contentWidth: clueCardContent.scrollWidth,
        contentHeight: clueCardContent.scrollHeight,
      });
      applyActiveClueScale(firstScale);
      const adjustedScale = calculateClueModalScale({
        ...available,
        contentWidth: clueCardContent.scrollWidth,
        contentHeight: clueCardContent.scrollHeight,
      });
      if (Math.abs(adjustedScale - firstScale) > 0.001) {
        applyActiveClueScale(adjustedScale);
      }
    }

    function scheduleActiveClueFit() {
      if (!cluePanel || cluePanel.hidden || !clueCard || !clueCardContent) return;
      if (clueFitFrame) {
        window.cancelAnimationFrame?.(clueFitFrame);
        window.clearTimeout?.(clueFitFrame);
      }
      clueFitFrame = window.setTimeout(() => {
        fitActiveClueCard();
        clueFitFrame = window.requestAnimationFrame?.(fitActiveClueCard) || window.setTimeout(fitActiveClueCard, 16);
      }, 0);
    }

    function addSelectedFiles(files) {
      selectedFiles = addLessonFilesToSelection(selectedFiles, files);
      if (fileInput) fileInput.value = '';
      updateFileStatus();
      markLessonSetupChanged();
    }

    function removeSelectedLessonFile(index) {
      selectedFiles = removeLessonFileAtIndex(selectedFiles, index);
      if (fileInput) fileInput.value = '';
      updateFileStatus();
      markLessonSetupChanged();
    }

    function preventBrowserFileOpenDuringLessonDrag(event) {
      if (!fileDragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }

    function setDropZoneDragging(isDragging) {
      dropZone?.classList.toggle('is-dragging', Boolean(isDragging));
    }

    function dropEventBelongsToLessonDropZone(event) {
      return Boolean(dropZone && (
        event?.target === dropZone ||
        dropZone.contains?.(event?.target) ||
        dragEventIsInsideElement(event, dropZone)
      ));
    }

    function handleDocumentLessonFileDragover(event) {
      if (!fileDragEventHasFiles(event)) return;
      preventBrowserFileOpenDuringLessonDrag(event);
      setDropZoneDragging(dropZone && dragEventIsInsideElement(event, dropZone));
    }

    function handleDocumentLessonFileDrop(event) {
      if (!fileDragEventHasFiles(event)) return;
      preventBrowserFileOpenDuringLessonDrag(event);
      if (dropEventBelongsToLessonDropZone(event)) {
        addSelectedFiles(event.dataTransfer?.files || []);
      }
      setDropZoneDragging(false);
    }

    function handleLessonDropZoneDrop(event) {
      if (!fileDragEventHasFiles(event)) return;
      preventBrowserFileOpenDuringLessonDrag(event);
      event.stopPropagation?.();
      setDropZoneDragging(false);
      addSelectedFiles(event.dataTransfer?.files || []);
    }

    function shouldIgnoreDropZoneDragleave(event) {
      return Boolean(event.currentTarget?.contains(event.relatedTarget)) || dragEventIsInsideElement(event, dropZone);
    }

    function renderScoreboard() {
      if (!scoreboard) return;
      scoreboard.innerHTML = contestants.map((contestant) => `
        <article class="score-card" data-contestant-id="${contestant.id}">
          <h3>${escapeHtml(contestant.name)}</h3>
          <p>${formatScore(contestant.score)}</p>
        </article>
      `).join('');
    }

    function renderBoard() {
      if (!board || !gameData) return;
      const headers = gameData.categories.map((category) => `
        <div class="game-board__category" role="columnheader">${escapeHtml(category.title)}</div>
      `).join('');
      const clueRows = BOARD_VALUES.map((value, clueIndex) => gameData.categories.map((category) => {
        const clue = category.clues[clueIndex];
        const displayState = getClueBoardDisplayState({ clue, value });
        return `
          <button type="button" class="${escapeHtml(displayState.className)}" data-clue-id="${clue.id}" aria-label="${escapeHtml(displayState.ariaLabel)}" ${displayState.disabled ? 'disabled' : ''}>
            ${escapeHtml(displayState.text)}
          </button>
        `;
      }).join('')).join('');
      board.innerHTML = headers + clueRows;
      updateVirtualBuzzerGamePanel();
    }

    function findClue(clueId) {
      for (const category of gameData?.categories || []) {
        const clue = category.clues.find((candidate) => candidate.id === clueId);
        if (clue) {
          return { category, clue };
        }
      }
      return null;
    }

    function closeActiveClue() {
      responseCheckInFlight = false;
      virtualBuzzerOpenRequestId += 1;
      void disableVirtualBuzzersForHost();
      resetActiveClueFit();
      if (cluePanel) cluePanel.hidden = true;
      document.body?.classList.remove('has-active-clue-modal');
      activeClue = null;
      answerRevealed = false;
      clearClueVerdict();
      if (responseInput) {
        responseInput.value = '';
        responseInput.disabled = false;
      }
      if (responseSection) responseSection.hidden = true;
      if (activeClueReview) {
        activeClueReview.textContent = '';
        activeClueReview.hidden = true;
      }
      clearContestantChoiceSelection(contestantChoices?.querySelectorAll('input[name="active-contestant"]'));
      if (contestantChoices) contestantChoices.innerHTML = '';
      if (checkResponseButton) checkResponseButton.disabled = false;
      if (noBuzzButton) noBuzzButton.disabled = false;
      updateActiveClueNavigationState();
    }

    function selectedContestantId() {
      return contestantChoices?.querySelector('input[name="active-contestant"]:checked')?.value || '';
    }

    function selectedContestant() {
      const id = selectedContestantId();
      return contestants.find((contestant) => contestant.id === id) || null;
    }

    function updateActiveClueNavigationState() {
      const navigationState = getActiveClueNavigationControlState({
        activeClue,
        responseCheckInFlight,
        hasSelectedContestant: Boolean(selectedContestant()),
      });
      if (closeClueButton) {
        closeClueButton.disabled = navigationState.closeClueButtonDisabled;
      }
    }

    function handleCloseActiveClueRequest() {
      if (!canCloseActiveClue({
        activeClue,
        responseCheckInFlight,
        hasSelectedContestant: Boolean(selectedContestant()),
      })) {
        updateActiveClueNavigationState();
        if (clueFeedback && activeClue && !activeClue.completed) {
          clueFeedback.textContent = 'Finish the clue first: accept a correct answer, let every player attempt, or use “No one buzzed in.”';
          scheduleActiveClueFit();
        }
        return;
      }
      closeActiveClue();
    }

    function updateResponseEntryState() {
      const contestant = selectedContestant();
      const clueIsComplete = Boolean(activeClue?.completed);
      const controlState = getResponseEntryControlState({
        hasSelectedContestant: Boolean(contestant),
        clueIsComplete,
        responseCheckInFlight,
      });
      if (responseSection) responseSection.hidden = controlState.responseSectionHidden;
      if (responseInput) {
        responseInput.disabled = controlState.responseInputDisabled;
        if (contestant && !controlState.responseInputDisabled) {
          responseInput.focus();
        }
      }
      if (responseLabel?.firstChild && contestant) {
        responseLabel.firstChild.textContent = `Enter ${contestant.name}'s response `;
      }
      if (checkResponseButton) {
        checkResponseButton.disabled = controlState.checkResponseButtonDisabled;
      }
      if (noBuzzButton) {
        noBuzzButton.disabled = controlState.noBuzzButtonDisabled;
      }
      updateActiveClueNavigationState();
      scheduleActiveClueFit();
    }

    function renderHostVerdictOverrideButtons(contestant) {
      const options = getHostOverrideOptionsForContestant({ clue: activeClue, contestantId: contestant.id });
      if (options.length === 0) return '';
      return `
        <div class="contestant-choice__host-overrides" aria-label="Host override options for ${escapeHtml(contestant.name)}">
          ${options.map((option) => {
            const tooltip = `${option.label} for ${contestant.name}`;
            return `
              <button type="button" class="contestant-choice__host-override-button" data-host-verdict-override="${escapeHtml(option.decision)}" data-host-override-contestant-id="${escapeHtml(contestant.id)}" aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">
                <span class="contestant-choice__host-override-icon" aria-hidden="true">${escapeHtml(option.icon)}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    }

    function renderContestantChoices() {
      if (!contestantChoices || !activeClue) return;
      const attemptedIds = Array.isArray(activeClue.attemptedContestantIds)
        ? activeClue.attemptedContestantIds
        : [];
      const selectedId = selectedContestantId();
      contestantChoices.innerHTML = contestants.map((contestant) => {
        const outcome = getContestantAnswerOutcome({ clue: activeClue, contestantId: contestant.id });
        const renderState = getContestantChoiceRenderState({
          contestantId: contestant.id,
          selectedContestantId: selectedId,
          attemptedIds,
          clueIsComplete: Boolean(activeClue.completed),
          responseCheckInFlight,
        });
        const hostOverrideButtons = renderHostVerdictOverrideButtons(contestant);
        return `
          <article class="contestant-choice${renderState.attempted || outcome ? ' contestant-choice--attempted' : ''}${renderState.choicesDisabled ? ' contestant-choice--disabled' : ''}${hostOverrideButtons ? ' contestant-choice--has-host-overrides' : ''}">
            <label class="contestant-choice__label">
              <input type="radio" name="active-contestant" value="${contestant.id}" ${renderState.checked ? 'checked' : ''} ${renderState.disabled ? 'disabled' : ''} />
              <span class="contestant-choice__body">
                <span class="contestant-choice__name">${escapeHtml(contestant.name)}</span>
                <small>${escapeHtml(buildContestantChoiceScoreLine({ clue: activeClue, contestant }))}</small>
              </span>
            </label>
            ${hostOverrideButtons}
          </article>
        `;
      }).join('');
      updateResponseEntryState();
    }

    async function handleHostVerdictOverride({ contestantId, decision }) {
      if (!activeClue || responseCheckInFlight) return;
      const contestantName = contestants.find((contestant) => contestant.id === contestantId)?.name || '';
      try {
        const result = applyHostVerdictOverride({
          contestants,
          clue: activeClue,
          decision,
          contestantId,
        });
        contestants = result.contestants;
        activeClue = result.clue;
        gameData = updateNestedClue(gameData, result.clue);
        renderScoreboard();
        renderBoard();
        maybeCloseVirtualSessionWhenGameComplete();
        if (result.buzzersShouldBeOpen) {
          await resetVirtualBuzzersForNextAttempt();
        } else {
          await disableVirtualBuzzersForHost();
        }
        openClue(result.clue.id);
        if (!result.clue.completed) {
          showClueVerdict(buildAnswerVerdictPresentation({ result, contestantName }));
        }
        if (clueFeedback) {
          clueFeedback.textContent = buildHostVerdictOverrideSuccessMessage({ result, decision, contestantName });
        }
      } catch (error) {
        if (clueFeedback) clueFeedback.textContent = error.message || 'Could not apply that host override.';
        scheduleActiveClueFit();
      }
    }

    function clearClueVerdict() {
      if (!clueVerdict) return;
      clueVerdict.textContent = '';
      clueVerdict.className = 'clue-verdict';
      clueVerdict.hidden = true;
      scheduleActiveClueFit();
    }

    function showClueVerdict(presentation) {
      if (!clueVerdict || !presentation) return;
      clueVerdict.textContent = presentation.message || presentation.label || '';
      clueVerdict.className = presentation.className || 'clue-verdict';
      clueVerdict.hidden = false;
      scheduleActiveClueFit();
    }

    function showAnswer() {
      answerRevealed = true;
      if (clueAnswer) clueAnswer.hidden = false;
      if (clueExplanation) clueExplanation.hidden = false;
      if (clueSource) clueSource.hidden = false;
      scheduleActiveClueFit();
    }

    function showCompletedClueReview() {
      if (!activeClue) return;
      const presentation = buildCompletedClueReviewPresentation({ clue: activeClue, contestants });
      showClueVerdict(presentation);
      showAnswer();
      if (activeClueReview) {
        activeClueReview.innerHTML = `<strong>Credit:</strong> ${escapeHtml(presentation.creditSummary)}`;
        activeClueReview.hidden = false;
      }
      if (clueFeedback) {
        clueFeedback.textContent = 'This clue is already complete. Review what happened, then use Back to Board when ready.';
      }
      scheduleActiveClueFit();
    }

    function updateContestantPromptForCompletedClue() {
      if (!activeClue) return;
      const hasVerdictOverrideOptions = clueHasHostVerdictOverrideOptions(activeClue, contestants);
      const promptHeading = contestantPromptSection?.querySelector('h3');
      if (promptHeading) promptHeading.textContent = hasVerdictOverrideOptions ? 'Answer history' : 'Who buzzed in?';
      if (contestantPromptSection) contestantPromptSection.hidden = !hasVerdictOverrideOptions;
      if (hasVerdictOverrideOptions) {
        renderContestantChoices();
      } else if (contestantChoices) {
        contestantChoices.innerHTML = '';
      }
      if (responseSection) responseSection.hidden = true;
      if (responseInput) responseInput.disabled = true;
      if (checkResponseButton) checkResponseButton.disabled = true;
      if (noBuzzButton) noBuzzButton.disabled = true;
      updateActiveClueNavigationState();
      scheduleActiveClueFit();
    }

    function openClue(clueId) {
      const found = findClue(clueId);
      if (!found || !cluePanel) return;
      responseCheckInFlight = false;
      resetActiveClueFit();
      activeClue = found.clue;
      answerRevealed = false;
      clearClueVerdict();
      if (clueHeading) clueHeading.textContent = `${found.category.title} for $${activeClue.value}`;
      if (clueText) clueText.textContent = activeClue.clue;
      if (clueAnswer) {
        clueAnswer.innerHTML = `<strong>Correct response:</strong> ${escapeHtml(activeClue.correctResponse)}`;
        clueAnswer.hidden = true;
      }
      if (clueExplanation) {
        clueExplanation.innerHTML = `<strong>Why:</strong> ${escapeHtml(activeClue.explanation)}`;
        clueExplanation.hidden = true;
      }
      if (clueSource) {
        clueSource.innerHTML = `<strong>Source:</strong> ${escapeHtml(activeClue.sourceAnchor)}`;
        clueSource.hidden = true;
      }
      if (responseInput) {
        responseInput.value = '';
        responseInput.disabled = false;
      }
      if (responseSection) responseSection.hidden = true;
      if (activeClueReview) {
        activeClueReview.textContent = '';
        activeClueReview.hidden = true;
      }
      clearContestantChoiceSelection(contestantChoices?.querySelectorAll('input[name="active-contestant"]'));
      updateActiveClueNavigationState();

      if (activeClue.completed) {
        const hasVerdictOverrideOptions = clueHasHostVerdictOverrideOptions(activeClue, contestants);
        const promptHeading = contestantPromptSection?.querySelector('h3');
        if (promptHeading) promptHeading.textContent = hasVerdictOverrideOptions ? 'Answer history' : 'Who buzzed in?';
        if (contestantPromptSection) contestantPromptSection.hidden = !hasVerdictOverrideOptions;
        if (hasVerdictOverrideOptions) {
          renderContestantChoices();
        } else if (contestantChoices) {
          contestantChoices.innerHTML = '';
        }
        if (responseInput) responseInput.disabled = true;
        if (checkResponseButton) checkResponseButton.disabled = true;
        if (noBuzzButton) noBuzzButton.disabled = true;
        showCompletedClueReview();
        cluePanel.hidden = false;
        document.body?.classList.add('has-active-clue-modal');
        scheduleActiveClueFit();
        window.requestAnimationFrame(() => {
          cluePanel?.focus();
        });
        return;
      }

      const promptHeading = contestantPromptSection?.querySelector('h3');
      if (promptHeading) promptHeading.textContent = 'Who buzzed in?';
      if (contestantPromptSection) contestantPromptSection.hidden = false;
      if (checkResponseButton) checkResponseButton.disabled = false;
      if (noBuzzButton) noBuzzButton.disabled = false;
      if (clueFeedback) {
        clueFeedback.textContent = isVirtualBuzzerMode()
          ? 'Virtual buzzers are opening. The first player to buzz will be selected automatically. If no one buzzes in, use “No one buzzed in” to reveal the answer and move on.'
          : 'Call on the first person who buzzed in, then select that contestant here. If no one buzzes in, use “No one buzzed in” to reveal the answer and move on.';
      }
      renderContestantChoices();
      cluePanel.hidden = false;
      document.body?.classList.add('has-active-clue-modal');
      scheduleActiveClueFit();
      window.requestAnimationFrame(() => {
        cluePanel?.focus();
      });
      void openVirtualBuzzersForActiveClue();
    }

    function replaceActiveClue(updatedClue) {
      activeClue = updatedClue;
      gameData = updateNestedClue(gameData, updatedClue);
      renderScoreboard();
      renderBoard();
      renderContestantChoices();
      maybeCloseVirtualSessionWhenGameComplete();
    }

    function handleNoBuzz() {
      if (!canHandleNoBuzz({ activeClue, responseCheckInFlight })) return;
      const result = applyNoBuzzForClue({ contestants, clue: activeClue });
      contestants = result.contestants;
      replaceActiveClue(result.clue);
      showClueVerdict(buildAnswerVerdictPresentation({ result }));
      showAnswer();
      if (responseSection) responseSection.hidden = true;
      if (contestantPromptSection) contestantPromptSection.hidden = true;
      if (responseInput) responseInput.disabled = true;
      if (checkResponseButton) checkResponseButton.disabled = true;
      if (noBuzzButton) noBuzzButton.disabled = true;
      if (clueFeedback) {
        clueFeedback.textContent = 'No points changed. The correct answer is shown below.';
      }
      disableVirtualBuzzersForHost();
    }

    async function handleResponseCheck() {
      if (!activeClue) return;
      const clueAtRequestStart = activeClue;
      const clueIdAtRequestStart = clueAtRequestStart.id;
      const contestant = selectedContestant();
      if (!contestant) {
        if (clueFeedback) clueFeedback.textContent = 'Select the contestant who buzzed in before checking an answer.';
        return;
      }
      const contestantResponse = responseInput?.value || '';
      let startedResponseCheck = false;
      try {
        buildAnswerJudgmentMessages({
          clue: clueAtRequestStart,
          contestantName: contestant.name,
          contestantResponse,
        });
        clearClueVerdict();
        responseCheckInFlight = true;
        startedResponseCheck = true;
        renderContestantChoices();
        updateResponseEntryState();
        if (checkResponseButton) checkResponseButton.disabled = true;
        if (responseInput) responseInput.disabled = true;
        if (noBuzzButton) noBuzzButton.disabled = true;
        if (clueFeedback) clueFeedback.textContent = `Checking ${contestant.name}'s response with NTW…`;
        const endpoint = normalizeChatCompletionsEndpoint(endpointInput?.value || DEFAULT_CHAT_COMPLETIONS_ENDPOINT);
        const model = modelInput?.value || DEFAULT_MODEL;
        if (endpointInput) endpointInput.value = endpoint;
        const judgment = await callAnswerJudgmentApi({
          endpoint,
          apiKey: apiKeyInput?.value || '',
          model,
          clue: clueAtRequestStart,
          contestantName: contestant.name,
          contestantResponse,
        });
        const clueForScoring = activeClue;
        if (!clueForScoring || clueForScoring.id !== clueIdAtRequestStart || clueForScoring.completed) {
          return;
        }
        const activeAttemptedIds = Array.isArray(clueForScoring.attemptedContestantIds)
          ? clueForScoring.attemptedContestantIds.map(String)
          : [];
        if (activeAttemptedIds.includes(contestant.id)) {
          return;
        }
        const result = applyAnswerJudgment({
          contestants,
          clue: clueForScoring,
          contestantId: contestant.id,
          judgment,
        });
        contestants = result.contestants;
        const appliedClue = result.clue;
        replaceActiveClue(appliedClue);

        if (result.judgment.verdict === 'correct') {
          showClueVerdict(buildAnswerVerdictPresentation({ result, contestantName: contestant.name }));
          showAnswer();
          updateContestantPromptForCompletedClue();
          if (clueFeedback) {
            clueFeedback.textContent = 'The correct answer is shown below.';
          }
          disableVirtualBuzzersForHost();
          return;
        }

        if (result.allContestantsAttempted) {
          showClueVerdict(buildAnswerVerdictPresentation({ result, contestantName: contestant.name }));
          showAnswer();
          updateContestantPromptForCompletedClue();
          if (clueFeedback) {
            clueFeedback.textContent = 'All contestants have attempted this clue. The correct answer is shown below.';
          }
          disableVirtualBuzzersForHost();
          return;
        }

        if (responseInput) {
          responseInput.value = '';
          responseInput.disabled = false;
        }
        if (checkResponseButton) checkResponseButton.disabled = false;
        if (noBuzzButton) noBuzzButton.disabled = false;
        showClueVerdict(buildAnswerVerdictPresentation({ result, contestantName: contestant.name }));
        if (clueFeedback) {
          if (result.judgment.verdict === 'partial') {
            const remainingCredit = getFullCreditAward(appliedClue);
            clueFeedback.textContent = result.awardedPoints > 0
              ? `${contestant.name}'s response was biblically sound but not the expected lesson answer. ${formatScore(result.awardedPoints)} partial credit awarded; ${formatScore(remainingCredit)} remains for a full answer.`
              : `${contestant.name}'s response was biblically sound but not the expected lesson answer. No partial-credit points were available; ${formatScore(remainingCredit)} remains for a full answer.`;
          } else {
            clueFeedback.textContent = `${contestant.name}'s response was not accepted, so ${formatScore(Math.abs(result.awardedPoints))} was subtracted. Call on another buzzer and select the next contestant.`;
          }
        }
        await resetVirtualBuzzersForNextAttempt();
        updateResponseEntryState();
      } catch (error) {
        if (!activeClue || activeClue.id !== clueIdAtRequestStart) {
          return;
        }
        if (clueFeedback) clueFeedback.textContent = error.message || 'Could not check that answer.';
      } finally {
        if (startedResponseCheck) {
          responseCheckInFlight = false;
          if (activeClue && activeClue.id === clueIdAtRequestStart) {
            if (!activeClue.completed) {
              renderContestantChoices();
              updateResponseEntryState();
            } else {
              renderContestantChoices();
            }
          }
        }
      }
    }

    function completeSetupUi() {
      applySetupStepStage('game');
      if (gameArea) gameArea.hidden = false;
      if (gameTitle) gameTitle.textContent = gameData?.title || 'Berean Board Lesson Review';
      renderScoreboard();
      renderBoard();
      updateVirtualBuzzerGamePanel();
      gameArea?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    groupSetupToggle?.addEventListener('click', () => {
      toggleSetupStep('group');
    });
    buzzerSetupToggle?.addEventListener('click', () => {
      toggleSetupStep('buzzer');
    });
    lessonSetupToggle?.addEventListener('click', () => {
      toggleSetupStep('lesson');
    });
    difficultySetupToggle?.addEventListener('click', () => {
      toggleSetupStep('difficulty');
    });
    apiSetupToggle?.addEventListener('click', () => {
      toggleSetupStep('api');
    });
    continueToLessonSetupButton?.addEventListener('click', () => {
      completeBuzzerSetup();
    });
    buzzerModeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        handleBuzzerModeChanged();
      });
    });
    continueToDifficultySetupButton?.addEventListener('click', () => {
      completeLessonSetup();
    });
    continueToApiSetupButton?.addEventListener('click', () => {
      completeDifficultySetup();
    });
    saveGroupMembersButton?.addEventListener('click', () => {
      saveGroupMembersFromEditor();
    });
    groupMemberTextarea?.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveGroupMembersFromEditor();
      }
    });
    editGroupMembersButton?.addEventListener('click', () => {
      showGroupEditor(groupMemberNames);
    });
    clearGroupCookieButton?.addEventListener('click', () => {
      clearSavedGroupMembersCookie();
      groupMemberNames = [];
      chosenPlayerNames = [];
      closeVirtualSession();
      hideLessonSetup();
      showGroupEditor([]);
      renderStatus(groupSetupStatus, 'Saved group cleared from this browser.', 'info');
    });
    groupChecklist?.addEventListener('change', () => {
      refreshPlayerSelectionUi({ keepLessonOpen: true });
    });
    playerPickerOptions?.addEventListener('change', () => {
      chosenPlayerNames = getChosenPlayerNamesFromPicker();
      refreshPlayerSelectionUi({ keepLessonOpen: true });
    });
    randomizePlayersButton?.addEventListener('click', () => {
      const attendingNames = getAttendingNamesFromChecklist();
      chosenPlayerNames = selectRandomPlayers(attendingNames);
      refreshPlayerSelectionUi({ keepLessonOpen: true });
    });
    confirmPlayersButton?.addEventListener('click', () => {
      confirmPlayerSelection();
    });

    fileInput?.addEventListener('change', () => addSelectedFiles(fileInput.files));
    fileList?.addEventListener('click', (event) => {
      const removeButton = event.target?.closest?.('[data-remove-lesson-file-index]');
      if (!removeButton) return;
      event.preventDefault();
      removeSelectedLessonFile(removeButton.dataset.removeLessonFileIndex);
    });
    lessonTopicInput?.addEventListener('input', () => {
      markLessonSetupChanged();
    });
    difficultyInputs.forEach((input) => {
      input.addEventListener('change', () => {
        markDifficultySetupChanged();
      });
    });

    document.addEventListener('dragover', handleDocumentLessonFileDragover);
    document.addEventListener('drop', handleDocumentLessonFileDrop);

    dropZone?.addEventListener('dragenter', (event) => {
      if (!fileDragEventHasFiles(event)) return;
      preventBrowserFileOpenDuringLessonDrag(event);
      setDropZoneDragging(true);
    });
    dropZone?.addEventListener('dragover', (event) => {
      if (!fileDragEventHasFiles(event)) return;
      preventBrowserFileOpenDuringLessonDrag(event);
      setDropZoneDragging(true);
    });
    dropZone?.addEventListener('dragleave', (event) => {
      if (shouldIgnoreDropZoneDragleave(event)) return;
      setDropZoneDragging(false);
    });
    dropZone?.addEventListener('drop', handleLessonDropZoneDrop);

    setupForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const selection = currentPlayerSelection();
        if (!selection.canContinue) {
          throw new Error(selection.message || 'Select one to four players before generating the game board.');
        }
        selectedPlayerNames = selection.playerNames;
        contestants = createContestants(selectedPlayerNames);
        renderSelectedPlayersSummary();
        if (!buzzerSetupComplete) {
          applySetupStepStage('buzzer');
          renderStatus(buzzerSetupStatus, 'Choose In-person or Virtual before lesson setup.', 'error');
          throw new Error('Choose In-person or Virtual before lesson setup.');
        }
        if (!lessonSetupComplete) {
          applySetupStepStage('lesson');
          renderStatus(lessonSetupStatus, 'Complete lesson setup before choosing a difficulty level.', 'error');
          throw new Error('Complete lesson setup before choosing a difficulty level.');
        }
        if (!difficultySetupComplete) {
          applySetupStepStage('difficulty');
          renderStatus(difficultySetupStatus, 'Choose a game difficulty before connecting to NTW’s API.', 'error');
          throw new Error('Choose a game difficulty before connecting to NTW’s API.');
        }
        const difficulty = requireDifficultyLevel(selectedDifficultyLevel || currentDifficultyLevel());
        selectedDifficultyLevel = difficulty.value;
        renderStatus(setupStatus, 'Preparing lesson material in your browser…', 'info');
        if (generateButton) generateButton.disabled = true;
        const lessonContent = await buildLessonSourceContent({
          files: selectedFiles,
          lessonTopicText: lessonTopicInput?.value || '',
        });
        const messages = buildOpenAiMessages({
          contestantNames: contestants.map((contestant) => contestant.name),
          lessonContent,
          difficultyLevel: difficulty.value,
        });
        const endpoint = normalizeChatCompletionsEndpoint(endpointInput?.value || DEFAULT_CHAT_COMPLETIONS_ENDPOINT);
        const model = modelInput?.value || DEFAULT_MODEL;
        if (endpointInput) endpointInput.value = endpoint;
        safeSetBrowserStorageItem(window, 'ntwReviewGameEndpoint', endpoint);
        safeSetBrowserStorageItem(window, 'ntwReviewGameModel', model.trim() || DEFAULT_MODEL);
        renderStatus(setupStatus, 'Calling the NTW API to generate the game board…', 'info');
        gameData = await callOpenAiCompatibleApi({
          endpoint,
          apiKey: apiKeyInput?.value || '',
          model,
          messages,
        });
        renderStatus(setupStatus, 'Game generated. API key was not saved by this page.', 'success');
        completeSetupUi();
      } catch (error) {
        renderStatus(setupStatus, error.message || 'Could not generate the game.', 'error');
      } finally {
        if (generateButton) generateButton.disabled = false;
      }
    });

    board?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-clue-id]');
      if (!button || button.disabled) return;
      const clueId = button.dataset.clueId;
      const found = findClue(clueId);
      if (!found) return;
      if (!found.clue.completed && isVirtualBuzzerMode() && !allVirtualPlayersConnected()) {
        const expectedCount = virtualBuzzerSession?.playerNames?.length || selectedPlayerNames.length;
        renderStatus(setupStatus, `Wait for every player to connect before opening a clue (${getVirtualBuzzerConnectedCount()} of ${expectedCount} connected).`, 'error');
        return;
      }
      openClue(clueId);
    });

    contestantChoices?.addEventListener('click', (event) => {
      const overrideButton = event.target?.closest?.('[data-host-verdict-override]');
      if (!overrideButton) return;
      event.preventDefault();
      event.stopPropagation();
      void handleHostVerdictOverride({
        contestantId: overrideButton.dataset.hostOverrideContestantId || '',
        decision: overrideButton.dataset.hostVerdictOverride || '',
      });
    });
    contestantChoices?.addEventListener('change', () => {
      if (responseInput) responseInput.value = '';
      updateResponseEntryState();
      void handleHostSelectedVirtualContestant();
    });
    checkResponseButton?.addEventListener('click', () => {
      handleResponseCheck();
    });
    noBuzzButton?.addEventListener('click', () => {
      handleNoBuzz();
    });
    responseInput?.addEventListener('keydown', (event) => {
      if (shouldSubmitResponseFromKeydown(event)) {
        event.preventDefault();
        handleResponseCheck();
      }
    });
    cluePanel?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        handleCloseActiveClueRequest();
      }
    });
    window.addEventListener('resize', () => {
      scheduleActiveClueFit();
    });
    closeClueButton?.addEventListener('click', () => {
      handleCloseActiveClueRequest();
    });
    resetButton?.addEventListener('click', () => {
      if (!window.confirm('Start over and clear the current game board?')) return;
      contestants = [];
      gameData = null;
      buzzerSetupComplete = false;
      selectedBuzzerMode = DEFAULT_BUZZER_MODE;
      buzzerModeInputs.forEach((input) => { input.checked = input.value === DEFAULT_BUZZER_MODE; });
      closeVirtualSession();
      lessonSetupComplete = false;
      difficultySetupComplete = false;
      selectedDifficultyLevel = '';
      closeActiveClue();
      if (gameArea) gameArea.hidden = true;
      if (difficultySetupStatus) difficultySetupStatus.textContent = '';
      applySetupStepStage('group');
      updateLessonSetupControls();
      updateDifficultySetupControls();
      renderStatus(setupStatus, 'Ready to build a new game.', 'info');
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const publicApi = {
    BOARD_VALUES,
    MAX_LESSON_CHARS,
    DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
    DEFAULT_MODEL,
    DEFAULT_LANGUAGE,
    DEFAULT_BIBLE,
    DEFAULT_DIFFICULTY_LEVEL,
    DIFFICULTY_LEVELS,
    DEFAULT_BUZZER_MODE,
    BUZZER_MODES,
    BUZZER_COLORS,
    HOST_BUZZER_SOUND_DURATION_SECONDS,
    HOST_BUZZER_SOUND_MIN_INTERVAL_MS,
    HOST_BUZZER_SOUND_VOLUME,
    HOST_BUZZER_SOUND_VOICES,
    scheduleHostBuzzerSound,
    createHostBuzzerAudioController,
    createPlayerScreenWakeLockController,
    isSupportedLessonFile,
    addLessonFilesToSelection,
    fileDragEventHasFiles,
    dragEventIsInsideElement,
    removeLessonFileAtIndex,
    configureContestantNameInputs,
    getResponseEntryControlState,
    canHandleNoBuzz,
    canCloseActiveClue,
    getActiveClueNavigationControlState,
    calculateClueModalScale,
    formatClueModalScaleForCss,
    getContestantChoiceRenderState,
    clearContestantChoiceSelection,
    buildAnswerVerdictPresentation,
    createContestants,
    parseGroupMemberNames,
    createGroupAttendance,
    getCheckedGroupMemberNames,
    resolvePlayerSelection,
    selectRandomPlayers,
    shouldResetGeneratedGameForPlayerSelectionChange,
    shouldResetVirtualBuzzersForPlayerSelectionChange,
    getDifficultyLevelConfig,
    requireDifficultyLevel,
    getDifficultyLevelSummary,
    buildDifficultyGenerationInstructions,
    getBuzzerModeConfig,
    requireBuzzerMode,
    getBuzzerColorForPlayerIndex,
    getBuzzerColorForContestantId,
    isVirtualBuzzerPlayerRoute,
    getSetupStepExpansionState,
    buildSavedGroupMembersCookie,
    buildClearGroupMembersCookie,
    readSavedGroupMembersCookie,
    writeSavedGroupMembersCookie,
    clearSavedGroupMembersCookie,
    safeGetBrowserStorageItem,
    safeSetBrowserStorageItem,
    normalizeGeneratedGame,
    applyScoreDecision,
    applyAnswerJudgment,
    applyNoBuzzForClue,
    getContestantAnswerOutcome,
    getContestantClueAward,
    buildContestantChoiceScoreLine,
    getHostOverrideOptionsForContestant,
    applyHostVerdictOverride,
    applyHostOverride,
    getClueBoardDisplayState,
    buildVirtualBuzzerPhoneStatusMessage,
    buildVirtualBuzzerPlayerHeaderMessage,
    getNextPickerNote,
    buildCompletedClueReviewPresentation,
    buildHostVerdictOverrideSuccessMessage,
    shouldAutoCloseAfterAnswerResult,
    truncateLessonContent,
    buildOpenAiMessages,
    buildAnswerJudgmentMessages,
    stripJsonMarkdownFence,
    extractJsonObject,
    normalizeChatCompletionsEndpoint,
    parseOpenAiGameResponse,
    parseAnswerJudgmentResponse,
    buildChatCompletionsBody,
    buildAnswerJudgmentChatCompletionsBody,
    callOpenAiCompatibleApi,
    callAnswerJudgmentApi,
    extractLessonTextFromFiles,
    hasLessonSourceInput,
    buildLessonSourceContent,
    shouldSubmitResponseFromKeydown,
    initializeBereanBoard,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  ROOT.NTWBereanBoard = publicApi;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeBereanBoard);
    } else {
      initializeBereanBoard();
    }
  }
})();
