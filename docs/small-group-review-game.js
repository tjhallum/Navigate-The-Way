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

  function createContestants(names) {
    if (!Array.isArray(names) || names.length !== 4) {
      throw new Error('Please supply exactly four contestant names.');
    }
    return names.map((name, index) => ({
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
      ? `\n\nNOTE: The supplied lesson content was truncated from ${lesson.originalLength} characters to ${lesson.content.length} characters before generation. Build the game only from the visible lesson content below.`
      : '';

    return [
      {
        role: 'system',
        content: [
          'You are Navigate The Way ✝️ (NTW✝️), serving a small group leader by creating a Bible lesson review game.',
          'Create content that is conservative, historic, confessional, Reformed evangelical, Scripture-centered, charitable, and pastorally careful.',
          'Use ONLY the uploaded lesson content supplied by the user as the factual source for this game.',
          'Do not quote Scripture from memory. If exact Scripture text appears in the uploaded lesson, you may use that supplied text; otherwise cite references without fabricating verse wording.',
          'Do not invent doctrines, anecdotes, or lesson details that are not supported by the uploaded content.',
          'Keep the tone warm, clear, and suitable for a fun small group review activity.',
          'Return only valid JSON. Do not wrap the JSON in markdown unless the API requires it.',
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
          '- Include a brief explanation and a sourceAnchor pointing to the lesson section, heading, or passage reference when available.',
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
          'Uploaded lesson content:',
          '<<<LESSON_CONTENT_START>>>',
          lesson.content,
          '<<<LESSON_CONTENT_END>>>',
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

  function buildChatCompletionsBody({ model, messages }) {
    return {
      model: String(model || '').trim() || DEFAULT_MODEL,
      stream: false,
      messages,
      temperature: 0.25,
      top_p: 0.9,
      max_completion_tokens: 6000,
      response_format: { type: 'json' },
      metadata: {
        anonymous: true,
        language: DEFAULT_LANGUAGE,
        bible: DEFAULT_BIBLE,
      },
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

    const response = await fetch(cleanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
      body: JSON.stringify(buildChatCompletionsBody({ model: cleanModel, messages })),
    });

    const payloadText = await response.text();
    let payload = null;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch (error) {
      throw new Error(`The NTW API returned non-JSON content with HTTP ${response.status}.`);
    }

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`The NTW API request failed: ${message}`);
    }

    return parseOpenAiGameResponse(payload);
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
      const cleanText = String(text || '').replace(/\r\n/g, '\n').trim();
      if (cleanText) {
        sections.push(`SOURCE FILE: ${file.name}\n${cleanText}`);
      }
    }
    if (sections.length === 0) {
      throw new Error('The selected lesson files did not contain readable text.');
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
    const setupStatus = app.querySelector('#game-setup-status');
    const generateButton = app.querySelector('#generate-game-button');
    const endpointInput = app.querySelector('#ntw-api-endpoint');
    const modelInput = app.querySelector('#ntw-api-model');
    const gameArea = app.querySelector('#game-play-area');
    const scoreboard = app.querySelector('#scoreboard');
    const board = app.querySelector('#game-board');
    const gameTitle = app.querySelector('#generated-game-title');
    const exportButton = app.querySelector('#export-game-json');
    const resetButton = app.querySelector('#reset-game-button');
    const cluePanel = app.querySelector('#active-clue-panel');
    const clueHeading = app.querySelector('#active-clue-heading');
    const clueText = app.querySelector('#active-clue-text');
    const clueAnswer = app.querySelector('#active-clue-answer');
    const clueExplanation = app.querySelector('#active-clue-explanation');
    const clueSource = app.querySelector('#active-clue-source');
    const contestantChoices = app.querySelector('#contestant-choices');
    const clueFeedback = app.querySelector('#clue-feedback');
    const correctButton = app.querySelector('#mark-correct-button');
    const wrongButton = app.querySelector('#mark-wrong-button');
    const revealButton = app.querySelector('#reveal-answer-button');
    const closeClueButton = app.querySelector('#close-clue-button');

    let selectedFiles = [];
    let contestants = [];
    let gameData = null;
    let activeClue = null;
    let answerRevealed = false;

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

    function renderContestantChoices() {
      if (!contestantChoices || !activeClue) return;
      contestantChoices.innerHTML = contestants.map((contestant) => {
        const attempted = activeClue.attemptedContestantIds.includes(contestant.id);
        return `
          <label class="contestant-choice${attempted ? ' contestant-choice--attempted' : ''}">
            <input type="radio" name="active-contestant" value="${contestant.id}" ${attempted ? 'disabled' : ''} />
            <span>${escapeHtml(contestant.name)} <small>${formatScore(contestant.score)}${attempted ? ' · already missed' : ''}</small></span>
          </label>
        `;
      }).join('');
    }

    function showAnswer() {
      answerRevealed = true;
      if (clueAnswer) clueAnswer.hidden = false;
      if (clueExplanation) clueExplanation.hidden = false;
      if (clueSource) clueSource.hidden = false;
      if (revealButton) revealButton.textContent = 'Answer Shown';
    }

    function openClue(clueId) {
      const found = findClue(clueId);
      if (!found || !cluePanel) return;
      activeClue = found.clue;
      answerRevealed = false;
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
      if (clueFeedback) clueFeedback.textContent = 'Call on the first person who buzzed in physically, then select that contestant here.';
      if (revealButton) revealButton.textContent = 'Reveal Answer / No One Got It';
      renderContestantChoices();
      cluePanel.hidden = false;
      cluePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function selectedContestantId() {
      return contestantChoices?.querySelector('input[name="active-contestant"]:checked')?.value || '';
    }

    function replaceActiveClue(updatedClue) {
      activeClue = updatedClue;
      gameData = updateNestedClue(gameData, updatedClue);
      renderScoreboard();
      renderBoard();
      renderContestantChoices();
    }

    function handleScoreDecision(decision) {
      if (!activeClue) return;
      try {
        const result = applyScoreDecision({
          contestants,
          clue: activeClue,
          contestantId: selectedContestantId(),
          decision,
        });
        contestants = result.contestants;
        replaceActiveClue(result.clue);
        if (decision === 'wrong') {
          if (clueFeedback) clueFeedback.textContent = 'Wrong answer recorded and points subtracted. Call on another physical buzzer, or reveal the answer.';
          return;
        }
        showAnswer();
        if (clueFeedback) {
          clueFeedback.textContent = decision === 'correct'
            ? 'Correct answer recorded. The clue is complete.'
            : 'The answer is revealed and the clue is complete.';
        }
      } catch (error) {
        if (clueFeedback) clueFeedback.textContent = error.message;
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
      const nameInputs = Array.from(app.querySelectorAll('.contestant-name-input'));
      const apiKeyInput = app.querySelector('#ntw-api-key');
      try {
        contestants = createContestants(nameInputs.map((input) => input.value));
        renderStatus(setupStatus, 'Reading lesson files locally in your browser…', 'info');
        if (generateButton) generateButton.disabled = true;
        const lessonContent = await extractLessonTextFromFiles(selectedFiles);
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

    correctButton?.addEventListener('click', () => handleScoreDecision('correct'));
    wrongButton?.addEventListener('click', () => handleScoreDecision('wrong'));
    revealButton?.addEventListener('click', () => {
      if (!activeClue) return;
      if (!answerRevealed) {
        showAnswer();
      }
      handleScoreDecision('reveal');
    });
    closeClueButton?.addEventListener('click', () => {
      if (cluePanel) cluePanel.hidden = true;
      activeClue = null;
    });
    resetButton?.addEventListener('click', () => {
      if (!window.confirm('Start over and clear the current game board?')) return;
      contestants = [];
      gameData = null;
      activeClue = null;
      if (gameArea) gameArea.hidden = true;
      if (cluePanel) cluePanel.hidden = true;
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
    createContestants,
    normalizeGeneratedGame,
    applyScoreDecision,
    truncateLessonContent,
    buildOpenAiMessages,
    stripJsonMarkdownFence,
    extractJsonObject,
    normalizeChatCompletionsEndpoint,
    parseOpenAiGameResponse,
    buildChatCompletionsBody,
    extractLessonTextFromFiles,
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
