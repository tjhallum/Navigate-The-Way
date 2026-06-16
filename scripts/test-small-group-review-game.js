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

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1];
}

test('supports common lesson upload file types used by small groups', () => {
  assert.equal(game.isSupportedLessonFile({ name: 'lesson.pdf', type: 'application/pdf' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'notes.txt', type: 'text/plain' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'leader-guide.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'slides.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), true);
  assert.equal(game.isSupportedLessonFile({ name: 'image.png', type: 'image/png' }), false);
});

test('builds scorekeeping contestants from one to four selected player names', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', '', 'Daniel']);
  assert.deepEqual(contestants, [
    { id: 'contestant-1', name: 'Ada', score: 0 },
    { id: 'contestant-2', name: 'Boaz', score: 0 },
    { id: 'contestant-3', name: 'Daniel', score: 0 },
  ]);

  const oneContestant = game.createContestants(['Ada']);
  assert.deepEqual(oneContestant, [
    { id: 'contestant-1', name: 'Ada', score: 0 },
  ]);
});

test('requires between one and four selected player names', () => {
  assert.throws(() => game.createContestants([]), /one to four/i);
  assert.throws(() => game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve']), /one to four/i);
  assert.throws(() => game.createContestants([' ', ' ', ' ', ' ']), /one to four/i);
});

test('parses and stores saved group member names in a cookie-safe value', () => {
  const parsed = game.parseGroupMemberNames(' Ada, Boaz , Chloe, Ada, Daniel ');
  assert.deepEqual(parsed, ['Ada', 'Boaz', 'Chloe', 'Daniel']);

  const cookie = game.buildSavedGroupMembersCookie(parsed);
  assert.match(cookie, /^ntwBereanBoardGroupMembers=/);
  assert.match(cookie, /Max-Age=31536000/);
  assert.match(cookie, /SameSite=Lax/);
  assert.deepEqual(game.readSavedGroupMembersCookie(`theme=dark; ${cookie}; other=yes`), parsed);

  const clearCookie = game.buildClearGroupMembersCookie();
  assert.match(clearCookie, /^ntwBereanBoardGroupMembers=/);
  assert.match(clearCookie, /Max-Age=0/);
});

test('defaults checked group members to players until more than four are present', () => {
  const attendance = game.createGroupAttendance(['Ada', 'Boaz', 'Chloe']);
  assert.deepEqual(attendance, [
    { name: 'Ada', checked: true },
    { name: 'Boaz', checked: true },
    { name: 'Chloe', checked: true },
  ]);
  assert.deepEqual(game.getCheckedGroupMemberNames(attendance), ['Ada', 'Boaz', 'Chloe']);

  const defaultSelection = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe'],
    chosenPlayerNames: [],
  });
  assert.deepEqual(defaultSelection.playerNames, ['Ada', 'Boaz', 'Chloe']);
  assert.equal(defaultSelection.needsPlayerPick, false);
  assert.equal(defaultSelection.canContinue, true);

  const needsFourPicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve'],
    chosenPlayerNames: [],
  });
  assert.equal(needsFourPicked.needsPlayerPick, true);
  assert.equal(needsFourPicked.canContinue, false);
  assert.deepEqual(needsFourPicked.playerNames, []);

  const manuallyPicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve'],
    chosenPlayerNames: ['Eve', 'Boaz', 'Ada', 'Daniel'],
  });
  assert.equal(manuallyPicked.needsPlayerPick, true);
  assert.equal(manuallyPicked.canContinue, true);
  assert.deepEqual(manuallyPicked.playerNames, ['Eve', 'Boaz', 'Ada', 'Daniel']);
});

test('randomly selects four players from checked group members', () => {
  const randomValues = [0.42, 0.05, 0.9, 0.2, 0.7];
  const random = () => randomValues.shift();
  assert.deepEqual(
    game.selectRandomPlayers(['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve'], random),
    ['Boaz', 'Daniel', 'Ada', 'Eve']
  );
});

test('requires clearing a generated game board when the confirmed players change', () => {
  assert.equal(game.shouldResetGeneratedGameForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Daniel'],
    hasGeneratedGame: true,
  }), true);

  assert.equal(game.shouldResetGeneratedGameForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: [],
    hasGeneratedGame: true,
  }), true);

  assert.equal(game.shouldResetGeneratedGameForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    hasGeneratedGame: true,
  }), false);

  assert.equal(game.shouldResetGeneratedGameForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Daniel'],
    hasGeneratedGame: false,
  }), false);
});

test('renders group setup wizard controls before lesson setup in the browser form', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');

  assert.match(html, /<textarea id="group-member-names"/);
  assert.match(html, /<button id="save-group-members-button" type="button"/);
  assert.match(html, /<div id="group-member-checklist"/);
  assert.match(html, /<button id="edit-group-members-button" type="button"/);
  assert.match(html, /<button id="clear-group-cookie-button" type="button"/);
  assert.match(html, /<section id="player-picker-panel"[^>]*hidden>/);
  assert.match(html, /<button id="randomize-players-button" type="button"/);
  assert.match(html, /<button id="confirm-players-button" type="button" class="primary-action"/);
  assert.match(html, /<section id="lesson-setup-section"[^>]*hidden>/);
  assert.match(html, /<button id="generate-game-button" type="submit" class="primary-action">Generate Game Board<\/button>/);
  assert.doesNotMatch(html, /Generate Review Game/);
  assert.match(html, /<p id="clue-verdict" class="clue-verdict"[^>]*hidden><\/p>/);
  assert.match(html, /<button id="no-buzz-button" type="button">No one buzzed in<\/button>/);
  assert.match(html, /<button id="close-clue-button" type="button">Back to Board<\/button>/);
  assert.doesNotMatch(html, /<button id="close-clue-button" type="button">Close<\/button>/);
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

test('keeps no-buzz, contestant choices, and response controls disabled while answer check is pending', () => {
  const pendingState = game.getResponseEntryControlState({
    hasSelectedContestant: true,
    clueIsComplete: false,
    responseCheckInFlight: true,
  });

  assert.equal(pendingState.responseSectionHidden, false);
  assert.equal(pendingState.responseInputDisabled, true);
  assert.equal(pendingState.checkResponseButtonDisabled, true);
  assert.equal(pendingState.noBuzzButtonDisabled, true);
  assert.equal(pendingState.contestantChoicesDisabled, true);
  assert.equal(game.canHandleNoBuzz({ activeClue: { completed: false }, responseCheckInFlight: true }), false);

  const readyState = game.getResponseEntryControlState({
    hasSelectedContestant: true,
    clueIsComplete: false,
    responseCheckInFlight: false,
  });

  assert.equal(readyState.responseInputDisabled, false);
  assert.equal(readyState.checkResponseButtonDisabled, false);
  assert.equal(readyState.noBuzzButtonDisabled, false);
  assert.equal(readyState.contestantChoicesDisabled, false);
  assert.equal(game.canHandleNoBuzz({ activeClue: { completed: false }, responseCheckInFlight: false }), true);
});

test('preserves selected contestant while pending checks disable the radio group', () => {
  const pending = game.getContestantChoiceRenderState({
    contestantId: 'contestant-1',
    selectedContestantId: 'contestant-1',
    attemptedIds: [],
    clueIsComplete: false,
    responseCheckInFlight: true,
  });

  assert.equal(pending.checked, true);
  assert.equal(pending.disabled, true);

  const alreadyAttempted = game.getContestantChoiceRenderState({
    contestantId: 'contestant-1',
    selectedContestantId: 'contestant-1',
    attemptedIds: ['contestant-1'],
    clueIsComplete: false,
    responseCheckInFlight: true,
  });

  assert.equal(alreadyAttempted.checked, false);
  assert.equal(alreadyAttempted.disabled, true);
});

test('does not focus a contestant choice before the leader selects who buzzed in', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');

  assert.match(html, /<section id="active-clue-panel"[^>]*tabindex="-1"/);
  assert.doesNotMatch(js, /querySelector\('input\[name="active-contestant"\]:not\(:disabled\)'\)\?\.focus\(\)/);
  assert.match(js, /cluePanel\?\.focus\(\)/);
});

test('clears stale contestant radio selections between clue modal sessions', () => {
  const inputs = [
    { checked: false },
    { checked: true },
    { checked: false },
  ];
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');

  game.clearContestantChoiceSelection(inputs);

  assert.deepEqual(inputs.map((input) => input.checked), [false, false, false]);
  assert.match(js, /function closeActiveClue\(\) \{[\s\S]*clearContestantChoiceSelection/);
  assert.match(js, /function openClue\(clueId\) \{[\s\S]*clearContestantChoiceSelection[\s\S]*renderContestantChoices\(\)/);
});

test('builds clear verdict announcements without auto-closing revealed answers', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const correct = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });
  const correctPresentation = game.buildAnswerVerdictPresentation({
    result: correct,
    contestantName: 'Ada',
  });

  assert.equal(correctPresentation.label, 'Correct');
  assert.equal(correctPresentation.className, 'clue-verdict clue-verdict--correct');
  assert.match(correctPresentation.message, /Correct/i);
  assert.match(correctPresentation.message, /Ada/);
  assert.match(correctPresentation.message, /\$100/);
  assert.doesNotMatch(correctPresentation.message, /Use Back to Board when everyone has had time to read it\./);
  assert.doesNotMatch(correctPresentation.message, /Back to Board/);
  assert.equal(game.shouldAutoCloseAfterAnswerResult(correct), false);

  const incorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });
  const incorrectPresentation = game.buildAnswerVerdictPresentation({
    result: incorrect,
    contestantName: 'Ada',
  });

  assert.equal(incorrectPresentation.label, 'Incorrect');
  assert.equal(incorrectPresentation.className, 'clue-verdict clue-verdict--incorrect');
  assert.match(incorrectPresentation.message, /Incorrect/i);
  assert.match(incorrectPresentation.message, /Ada/);
  assert.match(incorrectPresentation.message, /\$100/);
});

test('includes visible verdict styles for correct and incorrect answer judgments', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');

  assert.match(css, /\.clue-verdict\s*{/);
  assert.match(css, /\.clue-verdict--correct\s*{/);
  assert.match(css, /\.clue-verdict--incorrect\s*{/);
  assert.match(css, /font-weight:\s*(?:800|900|bold)/);
});

test('keeps the clue modal fitted without an internal gameplay scrollbar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const panelRule = cssRule(css, '.active-clue-panel');
  const cardRule = cssRule(css, '.active-clue-card');
  const contentRule = cssRule(css, '.active-clue-card__content');

  assert.match(html, /class="active-clue-card__content"/);
  assert.doesNotMatch(panelRule, /overflow-y:\s*auto/i);
  assert.doesNotMatch(cardRule, /overflow-y:\s*auto/i);
  assert.match(cardRule, /overflow:\s*hidden/i);
  assert.match(cardRule, /height:\s*var\(--active-clue-card-height,\s*auto\)/i);
  assert.match(cardRule, /max-height:\s*calc\(100dvh - clamp\(1rem, 4vw, 3rem\)\)/i);
  assert.match(contentRule, /transform:\s*scale\(var\(--active-clue-scale,\s*1\)\)/i);
  assert.match(contentRule, /transform-origin:\s*top left/i);
  assert.match(contentRule, /width:\s*var\(--active-clue-content-width,\s*100%\)/i);
});

test('calculates dynamic clue modal scaling to fit oversized content', () => {
  assert.equal(game.calculateClueModalScale({
    availableWidth: 820,
    availableHeight: 600,
    contentWidth: 820,
    contentHeight: 560,
  }), 1);

  assert.equal(game.calculateClueModalScale({
    availableWidth: 820,
    availableHeight: 500,
    contentWidth: 820,
    contentHeight: 1000,
  }), 0.5);

  assert.equal(game.calculateClueModalScale({
    availableWidth: 500,
    availableHeight: 600,
    contentWidth: 1000,
    contentHeight: 600,
  }), 0.5);

  assert.equal(game.calculateClueModalScale({
    availableWidth: 820,
    availableHeight: 500,
    contentWidth: 820,
    contentHeight: 2000,
  }), 0.25);

  assert.equal(game.calculateClueModalScale({
    availableWidth: 820,
    availableHeight: 500,
    contentWidth: 820,
    contentHeight: 4000,
  }), 0.125);

  assert.equal(game.calculateClueModalScale({
    availableWidth: 820,
    availableHeight: 0.4,
    contentWidth: 820,
    contentHeight: 1000,
  }), 0.0004);
});

test('formats sub-thousandth clue modal scales without collapsing to zero', () => {
  const formattedScale = game.formatClueModalScaleForCss(0.0004);

  assert.equal(formattedScale, '0.0004');
  assert.equal(Number(formattedScale) > 0, true);
  assert.notEqual(formattedScale, '0');
});

test('uses game board wording consistently in small group game copy', () => {
  const copy = [
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8'),
  ].join('\n');

  assert.doesNotMatch(copy, /\breview[- ]board\b/i);
  assert.match(copy, /\bgame board\b/i);
});

test('normalizes and validates a generated five-by-five game board', () => {
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

test('marks clues complete without score changes when no one buzzes in', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const result = game.applyNoBuzzForClue({ contestants, clue });

  assert.deepEqual(result.contestants, contestants);
  assert.equal(result.clue.completed, true);
  assert.equal(result.clue.allContestantsMissed, true);
  assert.equal(result.clue.noContestantsBuzzed, true);
  assert.deepEqual(result.clue.attemptedContestantIds, []);
  assert.equal(result.answerShouldBeRevealed, true);
  assert.equal(game.shouldAutoCloseAfterAnswerResult(result), false);
});

test('completes a two-player clue once both players have attempted without the expected answer', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const firstPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  assert.equal(firstPartial.clue.completed, false);
  assert.equal(game.shouldAutoCloseAfterAnswerResult(firstPartial), false);

  const secondMiss = game.applyAnswerJudgment({
    contestants: firstPartial.contestants,
    clue: firstPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });

  assert.deepEqual(secondMiss.clue.attemptedContestantIds, ['contestant-1', 'contestant-2']);
  assert.equal(secondMiss.clue.completed, true);
  assert.equal(secondMiss.clue.allContestantsMissed, true);
  assert.equal(secondMiss.answerShouldBeRevealed, true);
  assert.equal(game.shouldAutoCloseAfterAnswerResult(secondMiss), false);
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
