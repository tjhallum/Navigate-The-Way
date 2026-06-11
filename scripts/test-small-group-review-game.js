const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const game = require('../docs/small-group-review-game.js');

function sampleGeneratedGame() {
  return {
    title: 'Lesson Review',
    categories: Array.from({ length: 5 }, (_, categoryIndex) => ({
      title: `Category ${categoryIndex + 1}`,
      clues: [100, 200, 300, 400, 500].map((value, clueIndex) => ({
        value,
        clue: `Clue ${categoryIndex + 1}-${clueIndex + 1}`,
        correctResponse: `Response ${categoryIndex + 1}-${clueIndex + 1}`,
        explanation: `Explanation ${categoryIndex + 1}-${clueIndex + 1}`,
        sourceAnchor: `Lesson section ${categoryIndex + 1}`,
      })),
    })),
  };
}

test('supports common lesson upload file types used by small groups', () => {
  assert.equal(game.isSupportedLessonFile({ name: 'lesson.pdf', type: 'application/pdf' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'notes.txt', type: 'text/plain' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'leader-guide.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'slides.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'image.png', type: 'image/png' }), false);
});

test('builds scorekeeping contestants from two to four supplied names', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', '', 'Daniel']);
  assert.deepEqual(contestants, [
    { id: 'contestant-1', name: 'Ada', score: 0 },
    { id: 'contestant-2', name: 'Boaz', score: 0 },
    { id: 'contestant-3', name: 'Daniel', score: 0 },
  ]);

  const twoContestants = game.createContestants(['Ada', 'Boaz']);
  assert.deepEqual(twoContestants, [
    { id: 'contestant-1', name: 'Ada', score: 0 },
    { id: 'contestant-2', name: 'Boaz', score: 0 },
  ]);
});

test('requires between two and four contestant names', () => {
  assert.throws(() => game.createContestants(['Ada']), /two to four/i);
  assert.throws(() => game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve']), /two to four/i);
  assert.throws(() => game.createContestants(['Ada', ' ', ' ', ' ']), /two to four/i);
});

test('keeps only the first two contestant fields required in the browser form', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const inputMatches = [...html.matchAll(/<input class="contestant-name-input"[^>]*>/g)].map((match) => match[0]);

  assert.equal(inputMatches.length, 4);
  assert.match(inputMatches[0], /\brequired\b/);
  assert.match(inputMatches[1], /\brequired\b/);
  assert.doesNotMatch(inputMatches[2], /\brequired\b/);
  assert.doesNotMatch(inputMatches[3], /\brequired\b/);
  assert.match(html, /<script src="small-group-review-game\.js\?v=[^"]+"><\/script>/);
});

test('defensively clears required validation from optional contestant inputs at startup', () => {
  const inputs = Array.from({ length: 4 }, () => ({
    required: true,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  }));

  game.configureContestantNameInputs(inputs);

  assert.deepEqual(inputs.map((input) => input.required), [true, true, false, false]);
  assert.deepEqual(inputs.map((input) => input.attributes['aria-required'] || ''), ['true', 'true', '', '']);
});

test('normalizes and validates a generated five-by-five review board', () => {
  const normalized = game.normalizeGeneratedGame(sampleGeneratedGame());
  assert.equal(normalized.categories.length, 5);
  assert.equal(normalized.categories[0].id, 'category-1');
  assert.equal(normalized.categories[0].clues.length, 5);
  assert.equal(normalized.categories[0].clues[0].id, 'category-1-clue-1');
  assert.equal(normalized.categories[0].clues[0].value, 100);
  assert.equal(normalized.categories[4].clues[4].value, 500);
});

test('rejects invalid generated boards instead of fabricating missing clues', () => {
  const invalid = sampleGeneratedGame();
  invalid.categories[0].clues.pop();
  assert.throws(() => game.normalizeGeneratedGame(invalid), /five clues/i);
});

test('applies leader scoring decisions without connected buzzers', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const afterWrong = game.applyScoreDecision({ contestants, clue, contestantId: 'contestant-1', decision: 'wrong' });
  assert.equal(afterWrong.contestants[0].score, -100);
  assert.equal(afterWrong.clue.completed, false);
  assert.deepEqual(afterWrong.clue.attemptedContestantIds, ['contestant-1']);

  const afterCorrect = game.applyScoreDecision({ contestants: afterWrong.contestants, clue: afterWrong.clue, contestantId: 'contestant-2', decision: 'correct' });
  assert.equal(afterCorrect.contestants[1].score, 100);
  assert.equal(afterCorrect.clue.completed, true);
  assert.equal(afterCorrect.clue.winningContestantId, 'contestant-2');
});

test('accepts leader-provided lesson text as an alternative to uploaded files', async () => {
  const topicOnly = await game.buildLessonSourceContent({
    lessonTopicText: 'This week focuses on Romans 8, adoption in Christ, and assurance for suffering believers.',
  });

  assert.match(topicOnly, /leader-provided lesson topic/i);
  assert.match(topicOnly, /Romans 8/);

  const combined = await game.buildLessonSourceContent({
    lessonTopicText: 'The leader wants application questions about prayer and dependence on Christ.',
    files: [{ name: 'leader-guide.md' }],
    fileExtractor: async () => 'SOURCE FILE: leader-guide.md\nLesson notes about abiding in Christ.',
  });

  assert.match(combined, /leader-provided lesson topic/i);
  assert.match(combined, /uploaded lesson files/i);
  assert.match(combined, /abiding in Christ/i);
});

test('still requires either a lesson file or a leader-provided lesson description', async () => {
  await assert.rejects(
    () => game.buildLessonSourceContent({ lessonTopicText: '   ', files: [] }),
    /lesson file or describe the lesson topic/i
  );
});

test('applies API-judged answer results and reveals only after a correct answer or all contestants miss', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const firstMiss = game.applyAnswerJudgment({ contestants, clue, contestantId: 'contestant-1', isCorrect: false });
  assert.equal(firstMiss.contestants[0].score, -100);
  assert.equal(firstMiss.clue.completed, false);
  assert.equal(firstMiss.answerShouldBeRevealed, false);
  assert.deepEqual(firstMiss.clue.attemptedContestantIds, ['contestant-1']);

  const correctAnswer = game.applyAnswerJudgment({
    contestants: firstMiss.contestants,
    clue: firstMiss.clue,
    contestantId: 'contestant-2',
    isCorrect: true,
  });
  assert.equal(correctAnswer.contestants[1].score, 100);
  assert.equal(correctAnswer.clue.completed, true);
  assert.equal(correctAnswer.clue.winningContestantId, 'contestant-2');
  assert.equal(correctAnswer.answerShouldBeRevealed, true);

  let allMissed = { contestants, clue };
  for (const contestant of contestants) {
    allMissed = game.applyAnswerJudgment({
      contestants: allMissed.contestants,
      clue: allMissed.clue,
      contestantId: contestant.id,
      isCorrect: false,
    });
  }

  assert.deepEqual(allMissed.clue.attemptedContestantIds, contestants.map((contestant) => contestant.id));
  assert.equal(allMissed.clue.completed, true);
  assert.equal(allMissed.clue.allContestantsMissed, true);
  assert.equal(allMissed.answerShouldBeRevealed, true);
});

test('awards equal partial credit repeatedly while preserving final-answer value', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const firstPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial', feedback: 'Biblically sound, but not the lesson answer.' },
  });

  assert.equal(firstPartial.contestants[0].score, 20);
  assert.equal(firstPartial.awardedPoints, 20);
  assert.equal(firstPartial.clue.partialCreditAwarded, 20);
  assert.deepEqual(firstPartial.clue.partialCreditContestantIds, ['contestant-1']);
  assert.deepEqual(firstPartial.clue.attemptedContestantIds, ['contestant-1']);
  assert.equal(firstPartial.clue.completed, false);
  assert.equal(firstPartial.answerShouldBeRevealed, false);

  const secondPartial = game.applyAnswerJudgment({
    contestants: firstPartial.contestants,
    clue: firstPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });

  assert.equal(secondPartial.contestants[1].score, 20);
  assert.equal(secondPartial.awardedPoints, 20);
  assert.equal(secondPartial.clue.partialCreditAwarded, 40);
  assert.deepEqual(secondPartial.clue.partialCreditContestantIds, ['contestant-1', 'contestant-2']);

  const thirdPartial = game.applyAnswerJudgment({
    contestants: secondPartial.contestants,
    clue: secondPartial.clue,
    contestantId: 'contestant-3',
    judgment: { verdict: 'partial' },
  });

  assert.equal(thirdPartial.contestants[2].score, 20);
  assert.equal(thirdPartial.awardedPoints, 20);
  assert.equal(thirdPartial.clue.partialCreditAwarded, 60);
  assert.deepEqual(thirdPartial.clue.partialCreditContestantIds, ['contestant-1', 'contestant-2', 'contestant-3']);

  const correct = game.applyAnswerJudgment({
    contestants: thirdPartial.contestants,
    clue: thirdPartial.clue,
    contestantId: 'contestant-4',
    judgment: { verdict: 'correct' },
  });

  assert.equal(correct.contestants[3].score, 40);
  assert.equal(correct.awardedPoints, 40);
  assert.equal(correct.clue.completed, true);
  assert.equal(correct.answerShouldBeRevealed, true);
});

test('builds OpenAI-compatible prompts that constrain NTW to the supplied lesson material', () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Navigate The Way/i);
  assert.match(messages[0].content, /Do not quote Scripture from memory/i);
  assert.match(messages[1].content, /exactly 5 categories/i);
  assert.match(messages[1].content, /Ada, Boaz, Chloe, Daniel/);
  assert.match(messages[1].content, /Lesson material about Romans 8/);
});

test('builds answer judgment prompts without requiring verbatim wording', () => {
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const messages = game.buildAnswerJudgmentMessages({
    clue,
    contestantName: 'Ada',
    contestantResponse: 'It means believers are adopted as God’s children in Christ.',
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /conceptually correct/i);
  assert.match(messages[0].content, /not need to be verbatim/i);
  assert.match(messages[0].content, /partial credit/i);
  assert.match(messages[0].content, /biblically sound/i);
  assert.match(messages[0].content, /not the expected lesson answer/i);
  assert.match(messages[0].content, /very concise/i);
  assert.match(messages[1].content, /Contestant: Ada/);
  assert.match(messages[1].content, /Expected correct response/);
  assert.match(messages[1].content, /believers are adopted/);
  assert.throws(
    () => game.buildAnswerJudgmentMessages({ clue, contestantName: 'Ada', contestantResponse: '  ' }),
    /enter the contestant/i
  );
});

test('uses Apologist Fusion defaults for the NTW English premium model', () => {
  assert.equal(game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT, 'https://navtheway.apologist.ai/api/v1/chat/completions');
  assert.equal(game.DEFAULT_MODEL, 'openai/gpt/5.4');
  assert.equal(game.DEFAULT_LANGUAGE, 'en');
  assert.equal(
    game.normalizeChatCompletionsEndpoint('https://navtheway.apologist.ai/'),
    'https://navtheway.apologist.ai/api/v1/chat/completions'
  );
});

test('builds Apologist Fusion chat completion request bodies', () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
  });
  const body = game.buildChatCompletionsBody({ model: game.DEFAULT_MODEL, messages });

  assert.equal(body.model, 'openai/gpt/5.4');
  assert.equal(body.stream, false);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'ntw_small_group_review_game');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['title', 'categories']);
  assert.equal(body.response_format.json_schema.schema.properties.categories.type, 'array');
  assert.deepEqual(
    body.response_format.json_schema.schema.properties.categories.items.properties.clues.items.required,
    ['value', 'clue', 'correctResponse', 'explanation', 'sourceAnchor']
  );
  assert.deepEqual(body.metadata, {
    anonymous: true,
    language: 'en',
    bible: 'bsb',
  });
});

test('builds concise schema-enforced answer judgment request bodies', () => {
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const body = game.buildAnswerJudgmentChatCompletionsBody({
    model: game.DEFAULT_MODEL,
    clue,
    contestantName: 'Ada',
    contestantResponse: 'It means believers are adopted as God’s children in Christ.',
  });

  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
  assert.equal(body.max_completion_tokens <= 150, true);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'ntw_answer_judgment');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['verdict', 'feedback']);
  assert.deepEqual(body.response_format.json_schema.schema.properties.verdict.enum, ['correct', 'partial', 'incorrect']);
  assert.match(body.messages[1].content, /Expected correct response/);
  assert.match(body.messages[1].content, /believers are adopted/);
});

test('retries board generation with Apologist JSON mode when json_schema is not accepted', async () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
  });
  const originalFetch = global.fetch;
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    if (requestBodies.length === 1) {
      return {
        ok: false,
        status: 422,
        text: async () => JSON.stringify({
          success: false,
          errors: ["The 'response_format/type' parameter must be equal to one of the allowed values."],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: JSON.stringify(sampleGeneratedGame()) }),
    };
  };

  try {
    const parsed = await game.callOpenAiCompatibleApi({
      endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
      apiKey: 'test-key',
      model: game.DEFAULT_MODEL,
      messages,
    });

    assert.equal(parsed.categories.length, 5);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].response_format.type, 'json_schema');
    assert.equal(requestBodies[1].response_format.type, 'json');
    assert.equal(Object.hasOwn(requestBodies[1].response_format, 'json_schema'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('retries answer judgment with Apologist JSON mode when json_schema is not accepted', async () => {
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const originalFetch = global.fetch;
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    if (requestBodies.length === 1) {
      return {
        ok: false,
        status: 422,
        text: async () => JSON.stringify({
          success: false,
          errors: ["The 'response_format/type' parameter must be equal to one of the allowed values."],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: '{"isCorrect":true,"feedback":"Correct."}' }),
    };
  };

  try {
    const judgment = await game.callAnswerJudgmentApi({
      endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
      apiKey: 'test-key',
      model: game.DEFAULT_MODEL,
      clue,
      contestantName: 'Ada',
      contestantResponse: 'Response 1-1 in my own words.',
    });

    assert.equal(judgment.isCorrect, true);
    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].response_format.type, 'json_schema');
    assert.equal(requestBodies[1].response_format.type, 'json');
    assert.equal(requestBodies[1].max_completion_tokens, 120);
  } finally {
    global.fetch = originalFetch;
  }
});

test('surfaces Apologist validation details for unrecoverable API failures', async () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
  });
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ success: false, errors: ['The model field is invalid.'] }),
  });

  try {
    await assert.rejects(
      () => game.callOpenAiCompatibleApi({
        endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
        apiKey: 'test-key',
        model: game.DEFAULT_MODEL,
        messages,
      }),
      /model field is invalid/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('extracts JSON objects from OpenAI-compatible and Apologist Fusion chat responses', () => {
  const openAiParsed = game.parseOpenAiGameResponse({
    choices: [{
      message: {
        content: '```json\n' + JSON.stringify(sampleGeneratedGame()) + '\n```',
      },
    }],
  });
  const apologistParsed = game.parseOpenAiGameResponse({
    response: JSON.stringify(sampleGeneratedGame()),
  });
  const apologistDataParsed = game.parseOpenAiGameResponse({
    data: {
      response: '```json\n' + JSON.stringify(sampleGeneratedGame()) + '\n```',
    },
  });

  assert.equal(openAiParsed.categories.length, 5);
  assert.equal(apologistParsed.categories[2].clues[3].correctResponse, 'Response 3-4');
  assert.equal(apologistDataParsed.categories[4].clues[4].correctResponse, 'Response 5-5');
});

test('extracts answer judgments from OpenAI-compatible and Apologist Fusion chat responses', () => {
  const openAiJudgment = game.parseAnswerJudgmentResponse({
    choices: [{
      message: {
        content: '{"isCorrect":true,"feedback":"Conceptually correct."}',
      },
    }],
  });
  const apologistJudgment = game.parseAnswerJudgmentResponse({
    data: {
      response: '```json\n{"correct":false,"feedback":"Not close enough yet."}\n```',
    },
  });
  const partialJudgment = game.parseAnswerJudgmentResponse({
    response: '{"verdict":"partial","feedback":"Biblically sound, but not expected."}',
  });

  assert.equal(openAiJudgment.isCorrect, true);
  assert.equal(openAiJudgment.verdict, 'correct');
  assert.equal(openAiJudgment.feedback, 'Conceptually correct.');
  assert.equal(apologistJudgment.isCorrect, false);
  assert.equal(apologistJudgment.verdict, 'incorrect');
  assert.equal(apologistJudgment.feedback, 'Not close enough yet.');
  assert.equal(partialJudgment.isCorrect, false);
  assert.equal(partialJudgment.verdict, 'partial');
  assert.equal(partialJudgment.partialCreditFraction, 0.2);
});

test('submits contestant responses on Enter while preserving Shift+Enter for notes', () => {
  assert.equal(game.shouldSubmitResponseFromKeydown({ key: 'Enter' }), true);
  assert.equal(game.shouldSubmitResponseFromKeydown({ key: 'Enter', shiftKey: true }), false);
  assert.equal(game.shouldSubmitResponseFromKeydown({ key: 'Enter', ctrlKey: true }), false);
  assert.equal(game.shouldSubmitResponseFromKeydown({ key: 'a' }), false);
});
