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
  const PARTIAL_CREDIT_PER_RESPONSE_FRACTION = 0.2;
  const PARTIAL_CREDIT_MAX_TOTAL_FRACTION = 0.6;
  const SUPPORTED_TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.rtf'
  ]);
  const SUPPORTED_BINARY_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx']);
  const TEXT_MIME_PREFIXES = ['text/'];
  const TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'application/rtf',
    'application/x-rtf'
  ]);
  const DOCX_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);
  const PPTX_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);
  const PDF_MIME_TYPES = new Set(['application/pdf']);
  const GAME_RESPONSE_JSON_SCHEMA = {
    name: 'ntw_small_group_review_game',
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
      DOCX_MIME_TYPES.has(type) || extension === '.docx' ||
      PPTX_MIME_TYPES.has(type) || extension === '.pptx' ||
      SUPPORTED_BINARY_EXTENSIONS.has(extension);
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

  function buildAnswerVerdictPresentation({ result, contestantName }) {
    const name = coerceText(contestantName, 'The contestant') || 'The contestant';
    const awardedPoints = Number(result?.awardedPoints || 0);
    const points = formatScore(Math.abs(awardedPoints));
    const answerShown = Boolean(result?.answerShouldBeRevealed);
    const backToBoard = 'Use Back to Board when everyone has had time to read it.';

    if (result?.noBuzz) {
      return {
        label: 'No Buzz',
        className: 'clue-verdict clue-verdict--neutral',
        message: `No one buzzed in. No points changed. The correct answer is shown below. ${backToBoard}`,
      };
    }

    const verdict = normalizeAnswerJudgment(result?.judgment || { verdict: result?.isCorrect ? 'correct' : 'incorrect' }).verdict;
    if (verdict === 'correct') {
      return {
        label: 'Correct',
        className: 'clue-verdict clue-verdict--correct',
        message: `Correct — ${name}'s response was accepted. ${points} awarded. The correct answer is shown below. ${backToBoard}`,
      };
    }
    if (verdict === 'partial') {
      return {
        label: 'Partial Credit',
        className: 'clue-verdict clue-verdict--partial',
        message: answerShown
          ? `Partial credit — ${name} received ${points}. All contestants have attempted this clue, so the correct answer is shown below. ${backToBoard}`
          : `Partial credit — ${name} received ${points}. The clue remains open for another buzzer.`,
      };
    }
    return {
      label: 'Incorrect',
      className: 'clue-verdict clue-verdict--incorrect',
      message: answerShown
        ? `Incorrect — ${name}'s response was not accepted. ${points} subtracted. The correct answer is shown below. ${backToBoard}`
        : `Incorrect — ${name}'s response was not accepted. ${points} subtracted. Call on another buzzer.`,
    };
  }

  function createContestants(names) {
    if (!Array.isArray(names)) {
      throw new Error('Please supply two to four contestant names.');
    }
    const suppliedNames = names.map((name) => coerceText(name)).filter(Boolean);
    if (suppliedNames.length < 2 || suppliedNames.length > 4) {
      throw new Error('Please supply two to four contestant names.');
    }
    return suppliedNames.map((name, index) => ({
      id: `contestant-${index + 1}`,
      name: normalizeContestantName(name, index),
      score: 0,
    }));
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
            allContestantsMissed: Boolean(rawClue?.allContestantsMissed),
            noContestantsBuzzed: Boolean(rawClue?.noContestantsBuzzed),
            partialCreditAwarded: Math.max(0, Number(rawClue?.partialCreditAwarded || 0)),
            partialCreditContestantIds: Array.isArray(rawClue?.partialCreditContestantIds)
              ? [...new Set(rawClue.partialCreditContestantIds.map(String))]
              : [],
          };
        }),
      };
    });

    return {
      title: pickText(rawGame, ['title', 'name'], 'Small Group Lesson Review'),
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
      nextContestants[contestantIndex].score += Number(clue.value || 0);
      nextClue.completed = true;
      nextClue.winningContestantId = contestantId;
      return { contestants: nextContestants, clue: nextClue };
    }

    if (normalizedDecision === 'wrong') {
      nextContestants[contestantIndex].score -= Number(clue.value || 0);
      if (!nextClue.attemptedContestantIds.includes(contestantId)) {
        nextClue.attemptedContestantIds.push(contestantId);
      }
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
      return PARTIAL_CREDIT_PER_RESPONSE_FRACTION;
    }
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return PARTIAL_CREDIT_PER_RESPONSE_FRACTION;
    }
    const fraction = numeric > 1 ? numeric / 100 : numeric;
    return Math.min(PARTIAL_CREDIT_PER_RESPONSE_FRACTION, Math.max(0, fraction));
  }

  function normalizeAnswerJudgmentInput({ isCorrect, judgment } = {}) {
    if (judgment && typeof judgment === 'object') {
      return normalizeAnswerJudgment(judgment);
    }
    return normalizeAnswerJudgment({ isCorrect });
  }

  function getPartialCreditCap(clue) {
    return Math.max(0, Math.round(Number(clue?.value || 0) * PARTIAL_CREDIT_MAX_TOTAL_FRACTION));
  }

  function getPartialCreditAward({ clue, partialCreditFraction }) {
    const clueValue = Math.max(0, Number(clue?.value || 0));
    const alreadyAwarded = Math.max(0, Number(clue?.partialCreditAwarded || 0));
    const cap = getPartialCreditCap(clue);
    const requested = Math.max(0, Math.round(clueValue * Math.min(PARTIAL_CREDIT_PER_RESPONSE_FRACTION, partialCreditFraction || PARTIAL_CREDIT_PER_RESPONSE_FRACTION)));
    return Math.min(requested, Math.max(0, cap - alreadyAwarded));
  }

  function getFullCreditAward(clue) {
    const clueValue = Math.max(0, Number(clue?.value || 0));
    const alreadyAwarded = Math.max(0, Number(clue?.partialCreditAwarded || 0));
    return Math.max(0, clueValue - alreadyAwarded);
  }

  function applyAnswerJudgment({ contestants, clue, contestantId, isCorrect, judgment }) {
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
    };
    let awardedPoints = 0;

    if (normalizedJudgment.verdict === 'correct') {
      awardedPoints = getFullCreditAward(nextClue);
      nextContestants[contestantIndex].score += awardedPoints;
      nextClue.completed = true;
      nextClue.winningContestantId = contestantIdText;
    } else if (normalizedJudgment.verdict === 'partial') {
      awardedPoints = getPartialCreditAward({ clue: nextClue, partialCreditFraction: normalizedJudgment.partialCreditFraction });
      if (awardedPoints > 0) {
        nextContestants[contestantIndex].score += awardedPoints;
        nextClue.partialCreditAwarded += awardedPoints;
        nextClue.partialCreditContestantIds.push(contestantIdText);
      }
      nextClue.completed = false;
      if (!nextClue.attemptedContestantIds.includes(contestantIdText)) {
        nextClue.attemptedContestantIds.push(contestantIdText);
      }
    } else {
      awardedPoints = -Number(clue.value || 0);
      nextContestants[contestantIndex].score += awardedPoints;
      nextClue.completed = false;
      if (!nextClue.attemptedContestantIds.includes(contestantIdText)) {
        nextClue.attemptedContestantIds.push(contestantIdText);
      }
    }

    const allContestantsAttempted = normalizedJudgment.verdict !== 'correct' && contestants.length > 0 &&
      contestants.every((contestant) => nextClue.attemptedContestantIds.includes(contestant.id));
    nextClue.allContestantsMissed = allContestantsAttempted;
    nextClue.completed = nextClue.completed || allContestantsAttempted;

    return {
      contestants: nextContestants,
      clue: nextClue,
      judgment: normalizedJudgment,
      awardedPoints,
      allContestantsAttempted,
      answerShouldBeRevealed: normalizedJudgment.verdict === 'correct' || allContestantsAttempted,
    };
  }

  function applyNoBuzzForClue({ contestants, clue }) {
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
    const normalized = String(lessonContent || '').replace(/\r\n/g, '\n').trim();
    if (normalized.length <= maxChars) {
      return { content: normalized, truncated: false, originalLength: normalized.length };
    }
    return {
      content: normalized.slice(0, maxChars),
      truncated: true,
      originalLength: normalized.length,
    };
  }

  function buildOpenAiMessages({ contestantNames, lessonContent }) {
    const names = Array.isArray(contestantNames) ? contestantNames.map((name, index) => normalizeContestantName(name, index)) : [];
    const lesson = truncateLessonContent(lessonContent);
    const truncationNote = lesson.truncated
      ? `\n\nNOTE: The supplied lesson material was truncated from ${lesson.originalLength} characters to ${lesson.content.length} characters before generation. Build the game only from the visible lesson material below.`
      : '';

    return [
      {
        role: 'system',
        content: [
          'You are Navigate The Way ✝️ (NTW✝️), serving a small group leader by creating a Bible lesson review game.',
          'Create content that is conservative, historic, confessional, Reformed evangelical, Scripture-centered, charitable, and pastorally careful.',
          'Use ONLY the lesson material supplied by the user as the factual source for this game. The material may include uploaded files, a leader-provided lesson topic or summary, or both.',
          'If the leader supplied only a brief topic or summary, create broadly applicable review content for that stated lesson subject without claiming unpublished lesson details.',
          'Do not quote Scripture from memory. If exact Scripture text appears in the supplied lesson material, you may use that supplied text; otherwise cite references without fabricating verse wording.',
          'Do not invent doctrines, anecdotes, precise lesson details, or source claims that are not supported by the supplied material.',
          'Keep the tone warm, clear, and suitable for a fun small group review activity.',
          'Return only valid JSON that matches the enforced schema. Do not wrap the JSON in markdown unless the API requires it.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'Build a Jeopardy-style lesson review board for a Christian small group leader.',
          `Contestants: ${names.join(', ')}`,
          'Requirements:',
          '- Generate exactly 5 categories.',
          '- Each category must contain exactly 5 clues.',
          '- Clue values must be 100, 200, 300, 400, and 500 in that order for every category.',
          '- The displayed "clue" should ask or prompt recall/application from the lesson.',
          '- The "correctResponse" should be short enough for a leader to judge a spoken answer.',
          '- Include a brief explanation and a sourceAnchor pointing to the uploaded file, leader-provided topic/summary, lesson section, heading, or passage reference when available.',
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
          'Judge this contestant response for a Bible small group review game.',
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

  function xmlTextToPlainText(xmlText) {
    return String(xmlText || '')
      .replace(/<a:t[^>]*>/g, ' ')
      .replace(/<\/a:t>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
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

  async function extractLessonTextFromFile(file) {
    if (!isSupportedLessonFile(file)) {
      throw new Error(`${file?.name || 'This file'} is not a supported lesson file type.`);
    }
    const extension = getFileExtension(file?.name);
    if (isTextLikeFile(file)) {
      return await file.text();
    }
    if (extension === '.pdf' || PDF_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      return await extractPdfText(file);
    }
    if (extension === '.docx' || DOCX_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      return await extractDocxText(file);
    }
    if (extension === '.pptx' || PPTX_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      return await extractPptxText(file);
    }
    throw new Error(`${file?.name || 'This file'} could not be read. Convert it to TXT, PDF, DOCX, or PPTX.`);
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

  async function buildLessonSourceContent({ files, lessonTopicText, fileExtractor = extractLessonTextFromFiles } = {}) {
    const list = Array.from(files || []);
    const topic = normalizeLongFormText(lessonTopicText);
    const sections = [];

    if (topic) {
      sections.push(`LEADER-PROVIDED LESSON TOPIC OR SUMMARY:\n${topic}`);
    }

    if (list.length > 0) {
      const fileContent = normalizeLongFormText(await fileExtractor(list));
      if (fileContent) {
        sections.push(`UPLOADED LESSON FILES:\n${fileContent}`);
      }
    }

    if (sections.length === 0) {
      throw new Error('Add at least one lesson file or describe the lesson topic before generating a game.');
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
    const number = Number(score || 0);
    return number < 0 ? `-$${Math.abs(number)}` : `$${number}`;
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

  function initializeSmallGroupGame() {
    const app = document.querySelector('[data-small-group-review-game]');
    if (!app) return;

    const setupForm = app.querySelector('#game-setup-form');
    const fileInput = app.querySelector('#lesson-files');
    const dropZone = app.querySelector('#lesson-drop-zone');
    const fileStatus = app.querySelector('#lesson-file-status');
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
    const exportButton = app.querySelector('#export-game-json');
    const resetButton = app.querySelector('#reset-game-button');
    const cluePanel = app.querySelector('#active-clue-panel');
    const clueHeading = app.querySelector('#active-clue-heading');
    const clueText = app.querySelector('#active-clue-text');
    const clueVerdict = app.querySelector('#clue-verdict');
    const clueAnswer = app.querySelector('#active-clue-answer');
    const clueExplanation = app.querySelector('#active-clue-explanation');
    const clueSource = app.querySelector('#active-clue-source');
    const contestantChoices = app.querySelector('#contestant-choices');
    const responseSection = app.querySelector('#contestant-response-section');
    const responseLabel = app.querySelector('#contestant-response-label');
    const responseInput = app.querySelector('#contestant-response-input');
    const checkResponseButton = app.querySelector('#check-response-button');
    const clueFeedback = app.querySelector('#clue-feedback');
    const noBuzzButton = app.querySelector('#no-buzz-button');
    const closeClueButton = app.querySelector('#close-clue-button');
    const nameInputs = configureContestantNameInputs(app.querySelectorAll('.contestant-name-input'));

    let selectedFiles = [];
    let contestants = [];
    let gameData = null;
    let activeClue = null;
    let answerRevealed = false;
    let responseCheckInFlight = false;

    const savedEndpoint = window.localStorage?.getItem('ntwReviewGameEndpoint') || '';
    const savedModel = window.localStorage?.getItem('ntwReviewGameModel') || '';
    if (endpointInput) endpointInput.value = savedEndpoint ? normalizeChatCompletionsEndpoint(savedEndpoint) : DEFAULT_CHAT_COMPLETIONS_ENDPOINT;
    if (modelInput) modelInput.value = savedModel || DEFAULT_MODEL;

    function updateFileStatus() {
      if (!fileStatus) return;
      if (selectedFiles.length === 0) {
        fileStatus.textContent = 'No lesson files selected yet.';
        return;
      }
      const names = selectedFiles.map((file) => {
        const supported = isSupportedLessonFile(file);
        return `${supported ? '✅' : '⚠️'} ${file.name}`;
      });
      fileStatus.textContent = names.join(' · ');
    }

    function setSelectedFiles(files) {
      selectedFiles = Array.from(files || []);
      updateFileStatus();
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
        const isComplete = Boolean(clue.completed);
        return `
          <button type="button" class="game-board__clue${isComplete ? ' is-complete' : ''}" data-clue-id="${clue.id}" ${isComplete ? 'disabled' : ''}>
            ${isComplete ? '✓' : `$${value}`}
          </button>
        `;
      }).join('')).join('');
      board.innerHTML = headers + clueRows;
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
      if (checkResponseButton) checkResponseButton.disabled = false;
      if (noBuzzButton) noBuzzButton.disabled = false;
    }

    function selectedContestantId() {
      return contestantChoices?.querySelector('input[name="active-contestant"]:checked')?.value || '';
    }

    function selectedContestant() {
      const id = selectedContestantId();
      return contestants.find((contestant) => contestant.id === id) || null;
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
    }

    function renderContestantChoices() {
      if (!contestantChoices || !activeClue) return;
      const attemptedIds = Array.isArray(activeClue.attemptedContestantIds)
        ? activeClue.attemptedContestantIds
        : [];
      const selectedId = selectedContestantId();
      contestantChoices.innerHTML = contestants.map((contestant) => {
        const renderState = getContestantChoiceRenderState({
          contestantId: contestant.id,
          selectedContestantId: selectedId,
          attemptedIds,
          clueIsComplete: Boolean(activeClue.completed),
          responseCheckInFlight,
        });
        return `
          <label class="contestant-choice${renderState.attempted ? ' contestant-choice--attempted' : ''}${renderState.choicesDisabled ? ' contestant-choice--disabled' : ''}">
            <input type="radio" name="active-contestant" value="${contestant.id}" ${renderState.checked ? 'checked' : ''} ${renderState.disabled ? 'disabled' : ''} />
            <span>${escapeHtml(contestant.name)} <small>${formatScore(contestant.score)}${renderState.attempted ? ' · already tried' : ''}</small></span>
          </label>
        `;
      }).join('');
      updateResponseEntryState();
    }

    function clearClueVerdict() {
      if (!clueVerdict) return;
      clueVerdict.textContent = '';
      clueVerdict.className = 'clue-verdict';
      clueVerdict.hidden = true;
    }

    function showClueVerdict(presentation) {
      if (!clueVerdict || !presentation) return;
      clueVerdict.textContent = presentation.message || presentation.label || '';
      clueVerdict.className = presentation.className || 'clue-verdict';
      clueVerdict.hidden = false;
    }

    function showAnswer() {
      answerRevealed = true;
      if (clueAnswer) clueAnswer.hidden = false;
      if (clueExplanation) clueExplanation.hidden = false;
      if (clueSource) clueSource.hidden = false;
    }

    function openClue(clueId) {
      const found = findClue(clueId);
      if (!found || !cluePanel) return;
      responseCheckInFlight = false;
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
      if (checkResponseButton) checkResponseButton.disabled = false;
      if (noBuzzButton) noBuzzButton.disabled = Boolean(activeClue.completed);
      if (clueFeedback) clueFeedback.textContent = 'Call on the first person who buzzed in physically, then select that contestant here. If no one buzzes in, use “No one buzzed in” to reveal the answer and move on.';
      renderContestantChoices();
      cluePanel.hidden = false;
      document.body?.classList.add('has-active-clue-modal');
      window.requestAnimationFrame(() => {
        contestantChoices?.querySelector('input[name="active-contestant"]:not(:disabled)')?.focus();
      });
    }

    function replaceActiveClue(updatedClue) {
      activeClue = updatedClue;
      gameData = updateNestedClue(gameData, updatedClue);
      renderScoreboard();
      renderBoard();
      renderContestantChoices();
    }

    function handleNoBuzz() {
      if (!canHandleNoBuzz({ activeClue, responseCheckInFlight })) return;
      const result = applyNoBuzzForClue({ contestants, clue: activeClue });
      contestants = result.contestants;
      replaceActiveClue(result.clue);
      showClueVerdict(buildAnswerVerdictPresentation({ result }));
      showAnswer();
      if (responseSection) responseSection.hidden = true;
      if (responseInput) responseInput.disabled = true;
      if (checkResponseButton) checkResponseButton.disabled = true;
      if (noBuzzButton) noBuzzButton.disabled = true;
      if (clueFeedback) {
        clueFeedback.textContent = 'No points changed. Review the correct answer, then choose Back to Board when ready.';
      }
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
          if (responseSection) responseSection.hidden = true;
          if (clueFeedback) {
            clueFeedback.textContent = 'The correct answer is shown below. Choose Back to Board when everyone has had time to read it.';
          }
          return;
        }

        if (result.allContestantsAttempted) {
          showClueVerdict(buildAnswerVerdictPresentation({ result, contestantName: contestant.name }));
          showAnswer();
          if (responseSection) responseSection.hidden = true;
          if (clueFeedback) {
            clueFeedback.textContent = 'All contestants have attempted this clue. Review the correct answer, then choose Back to Board when ready.';
          }
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
              : `${contestant.name}'s response was biblically sound but not the expected lesson answer. The partial-credit cap has been reached; ${formatScore(remainingCredit)} remains for a full answer.`;
          } else {
            clueFeedback.textContent = `${contestant.name}'s response was not accepted, so ${formatScore(Math.abs(result.awardedPoints))} was subtracted. Call on another buzzer and select the next contestant.`;
          }
        }
        updateResponseEntryState();
      } catch (error) {
        if (!activeClue || activeClue.id !== clueIdAtRequestStart) {
          return;
        }
        if (clueFeedback) clueFeedback.textContent = error.message || 'Could not check that answer.';
      } finally {
        if (startedResponseCheck) {
          responseCheckInFlight = false;
          if (activeClue && activeClue.id === clueIdAtRequestStart && !activeClue.completed) {
            renderContestantChoices();
            updateResponseEntryState();
          }
        }
      }
    }

    function completeSetupUi() {
      if (gameArea) gameArea.hidden = false;
      if (gameTitle) gameTitle.textContent = gameData?.title || 'Small Group Lesson Review';
      renderScoreboard();
      renderBoard();
      gameArea?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    fileInput?.addEventListener('change', () => setSelectedFiles(fileInput.files));

    dropZone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('is-dragging');
    });
    dropZone?.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
      setSelectedFiles(event.dataTransfer?.files || []);
    });

    setupForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        contestants = createContestants(nameInputs.map((input) => input.value));
        renderStatus(setupStatus, 'Preparing lesson material in your browser…', 'info');
        if (generateButton) generateButton.disabled = true;
        const lessonContent = await buildLessonSourceContent({
          files: selectedFiles,
          lessonTopicText: lessonTopicInput?.value || '',
        });
        const messages = buildOpenAiMessages({
          contestantNames: contestants.map((contestant) => contestant.name),
          lessonContent,
        });
        const endpoint = normalizeChatCompletionsEndpoint(endpointInput?.value || DEFAULT_CHAT_COMPLETIONS_ENDPOINT);
        const model = modelInput?.value || DEFAULT_MODEL;
        if (endpointInput) endpointInput.value = endpoint;
        if (window.localStorage) {
          window.localStorage.setItem('ntwReviewGameEndpoint', endpoint);
          window.localStorage.setItem('ntwReviewGameModel', model.trim() || DEFAULT_MODEL);
        }
        renderStatus(setupStatus, 'Calling the NTW API to generate the review board…', 'info');
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
      openClue(button.dataset.clueId);
    });

    contestantChoices?.addEventListener('change', () => {
      if (responseInput) responseInput.value = '';
      updateResponseEntryState();
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
        closeActiveClue();
      }
    });
    closeClueButton?.addEventListener('click', () => {
      closeActiveClue();
    });
    resetButton?.addEventListener('click', () => {
      if (!window.confirm('Start over and clear the current game board?')) return;
      contestants = [];
      gameData = null;
      closeActiveClue();
      if (gameArea) gameArea.hidden = true;
      renderStatus(setupStatus, 'Ready to build a new game.', 'info');
    });
    exportButton?.addEventListener('click', () => {
      if (!gameData) return;
      const blob = new Blob([JSON.stringify({ contestants, game: gameData }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ntw-small-group-review-game.json';
      link.click();
      URL.revokeObjectURL(url);
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
    isSupportedLessonFile,
    configureContestantNameInputs,
    getResponseEntryControlState,
    canHandleNoBuzz,
    getContestantChoiceRenderState,
    buildAnswerVerdictPresentation,
    createContestants,
    normalizeGeneratedGame,
    applyScoreDecision,
    applyAnswerJudgment,
    applyNoBuzzForClue,
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
    buildLessonSourceContent,
    shouldSubmitResponseFromKeydown,
    initializeSmallGroupGame,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  ROOT.NTWSmallGroupReviewGame = publicApi;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeSmallGroupGame);
    } else {
      initializeSmallGroupGame();
    }
  }
})();
