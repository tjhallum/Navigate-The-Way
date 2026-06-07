const assert = require('node:assert/strict');
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

test('builds four scorekeeping contestants from supplied names', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  assert.deepEqual(contestants, [
    { id: 'contestant-1', name: 'Ada', score: 0 },
    { id: 'contestant-2', name: 'Boaz', score: 0 },
    { id: 'contestant-3', name: 'Chloe', score: 0 },
    { id: 'contestant-4', name: 'Daniel', score: 0 },
  ]);
});

test('requires exactly four non-empty contestant names', () => {
  assert.throws(() => game.createContestants(['Ada', 'Boaz', 'Chloe']), /exactly four/i);
  assert.throws(() => game.createContestants(['Ada', ' ', 'Chloe', 'Daniel']), /contestant 2/i);
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

test('builds OpenAI-compatible prompts that constrain NTW to the uploaded lesson content', () => {
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
  assert.deepEqual(body.response_format, { type: 'json' });
  assert.deepEqual(body.metadata, {
    anonymous: true,
    language: 'en',
    bible: 'bsb',
  });
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
