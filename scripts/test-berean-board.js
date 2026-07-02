const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const game = require('../docs/berean-board.js');
const virtualBuzzers = require('../docs/virtual-buzzer-service.js');

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
        sourceAnchor: `User supplied content: Lesson section ${categoryIndex + 1}`,
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

function makeLessonFile(name, type, text) {
  return {
    name,
    type,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

function createFakeAudioRoot(log, options = {}) {
  let nodeId = 0;
  let pendingResume = null;

  class FakeAudioParam {
    constructor(name) {
      this.name = name;
      this.value = 0;
    }

    setValueAtTime(value, time) {
      this.value = value;
      log.push(['param.set', this.name, value, time]);
    }

    linearRampToValueAtTime(value, time) {
      this.value = value;
      log.push(['param.linear', this.name, value, time]);
    }

    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      log.push(['param.exponential', this.name, value, time]);
    }
  }

  class FakeAudioNode {
    constructor(kind) {
      this.kind = `${kind}-${++nodeId}`;
    }

    connect(destination) {
      log.push(['connect', this.kind, destination?.kind || 'destination']);
      return destination;
    }
  }

  class FakeGainNode extends FakeAudioNode {
    constructor() {
      super('gain');
      this.gain = new FakeAudioParam(`${this.kind}.gain`);
    }
  }

  class FakeOscillatorNode extends FakeAudioNode {
    constructor() {
      super('oscillator');
      this.frequency = new FakeAudioParam(`${this.kind}.frequency`);
      this.detune = new FakeAudioParam(`${this.kind}.detune`);
      this.type = 'sine';
    }

    start(time) {
      log.push(['oscillator.start', this.type, time]);
    }

    stop(time) {
      log.push(['oscillator.stop', this.type, time]);
    }
  }

  class FakeFilterNode extends FakeAudioNode {
    constructor() {
      super('filter');
      this.frequency = new FakeAudioParam(`${this.kind}.frequency`);
      this.Q = new FakeAudioParam(`${this.kind}.Q`);
      this.type = '';
    }
  }

  class FakeCompressorNode extends FakeAudioNode {
    constructor() {
      super('compressor');
      this.threshold = new FakeAudioParam(`${this.kind}.threshold`);
      this.knee = new FakeAudioParam(`${this.kind}.knee`);
      this.ratio = new FakeAudioParam(`${this.kind}.ratio`);
      this.attack = new FakeAudioParam(`${this.kind}.attack`);
      this.release = new FakeAudioParam(`${this.kind}.release`);
    }
  }

  class FakeAudioContext {
    constructor() {
      this.currentTime = 12;
      this.state = options.initialState || 'suspended';
      this.destination = { kind: 'destination' };
      log.push(['context.constructor']);
    }

    assertRunning() {
      if (options.requireRunningForNodes && this.state !== 'running') {
        throw new Error('audio context is not running');
      }
    }

    resume() {
      log.push(['context.resume']);
      if (options.deferResume) {
        return new Promise((resolve) => {
          pendingResume = () => {
            this.state = 'running';
            log.push(['context.resume.resolve']);
            resolve();
          };
        });
      }
      this.state = 'running';
      return Promise.resolve();
    }

    createGain() {
      this.assertRunning();
      return new FakeGainNode();
    }

    createOscillator() {
      this.assertRunning();
      return new FakeOscillatorNode();
    }

    createBiquadFilter() {
      this.assertRunning();
      return new FakeFilterNode();
    }

    createDynamicsCompressor() {
      this.assertRunning();
      return new FakeCompressorNode();
    }
  }

  return {
    AudioContext: FakeAudioContext,
    resolveResume() {
      if (pendingResume) {
        const resume = pendingResume;
        pendingResume = null;
        resume();
      }
    },
  };
}

test('supports common lesson upload file types used by small groups', () => {
  const supported = [
    ['lesson.pdf', 'application/pdf'],
    ['lesson.epub', 'application/epub+zip'],
    ['notes.txt', 'text/plain'],
    ['outline.md', 'text/markdown'],
    ['lesson.csv', 'text/csv'],
    ['study.xml', 'application/xml'],
    ['handout.yaml', 'application/x-yaml'],
    ['handout.yml', 'application/yaml'],
    ['source.tex', 'application/x-tex'],
    ['leader-guide.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['legacy-guide.doc', 'application/msword'],
    ['lesson-notes.odt', 'application/vnd.oasis.opendocument.text'],
    ['lesson.pages', 'application/vnd.apple.pages'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['legacy-slides.ppt', 'application/vnd.ms-powerpoint'],
    ['discussion.odp', 'application/vnd.oasis.opendocument.presentation'],
    ['lesson.key', 'application/vnd.apple.keynote'],
    ['scorecard.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['legacy-scorecard.xls', 'application/vnd.ms-excel'],
    ['attendance.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
  ];

  supported.forEach(([name, type]) => {
    assert.equal(game.isSupportedLessonFile({ name, type }), true, `${name} should be accepted`);
  });
  assert.equal(game.isSupportedLessonFile({ name: 'image.png', type: 'image/png' }), false);
});

test('adds subsequent lesson file selections instead of replacing previous files', () => {
  const firstSelection = [
    { name: 'lesson-one.pdf' },
    { name: 'leader-guide.docx' },
  ];
  const additionalSelection = [
    { name: 'slides.pptx' },
    { name: 'extra-notes.yaml' },
  ];

  const combined = game.addLessonFilesToSelection(firstSelection, additionalSelection);

  assert.deepEqual(
    combined.map((file) => file.name),
    ['lesson-one.pdf', 'leader-guide.docx', 'slides.pptx', 'extra-notes.yaml']
  );
  assert.deepEqual(firstSelection.map((file) => file.name), ['lesson-one.pdf', 'leader-guide.docx']);
  assert.deepEqual(
    game.addLessonFilesToSelection(firstSelection, null).map((file) => file.name),
    ['lesson-one.pdf', 'leader-guide.docx']
  );

  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  assert.match(js, /function addSelectedFiles\(files\)/);
  assert.match(js, /fileInput\?\.addEventListener\('change', \(\) => addSelectedFiles\(fileInput\.files\)\)/);
  assert.match(js, /addSelectedFiles\(event\.dataTransfer\?\.files \|\| \[\]\)/);
  assert.doesNotMatch(js, /setSelectedFiles\(event\.dataTransfer\?\.files \|\| \[\]\)/);
});

test('detects file drags so the browser does not open lesson files accidentally', () => {
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: ['text/plain', 'Files'] } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: { contains: (type) => type === 'Files' } } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: ['application/x-moz-file'], items: [{ kind: 'file' }], files: [] } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: ['public.file-url'], items: { length: 1, 0: { kind: 'file' } }, files: [] } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: ['files'], files: [] } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: [], files: [{ name: 'lesson.pdf' }] } }), true);
  assert.equal(game.fileDragEventHasFiles({ dataTransfer: { types: ['text/plain'], items: [{ kind: 'string' }], files: [] } }), false);
});

test('keeps lesson file drags associated with the drop zone when coordinates are still inside it', () => {
  const dropZone = {
    getBoundingClientRect: () => ({ left: 100, top: 200, right: 400, bottom: 320 }),
  };

  assert.equal(game.dragEventIsInsideElement({ clientX: 250, clientY: 260 }, dropZone), true);
  assert.equal(game.dragEventIsInsideElement({ clientX: 100, clientY: 200 }, dropZone), true);
  assert.equal(game.dragEventIsInsideElement({ clientX: 450, clientY: 260 }, dropZone), false);
  assert.equal(game.dragEventIsInsideElement({ clientX: 250, clientY: 0 }, dropZone), false);
  assert.equal(game.dragEventIsInsideElement({ clientX: undefined, clientY: 260 }, dropZone), false);
});

test('removes selected lesson files by index without mutating the original list', () => {
  const files = [
    { name: 'lesson-one.pdf' },
    { name: 'wrong-lesson.docx' },
    { name: 'lesson-slides.pptx' },
  ];

  assert.deepEqual(
    game.removeLessonFileAtIndex(files, 1).map((file) => file.name),
    ['lesson-one.pdf', 'lesson-slides.pptx']
  );
  assert.deepEqual(files.map((file) => file.name), ['lesson-one.pdf', 'wrong-lesson.docx', 'lesson-slides.pptx']);
  assert.deepEqual(game.removeLessonFileAtIndex(files, -1), files);
  assert.deepEqual(game.removeLessonFileAtIndex(files, 4), files);
});

test('renders removable lesson file controls and sticky drag-drop protection', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.match(html, /<ul id="lesson-file-list" class="lesson-file-list" aria-label="Selected lesson files" hidden><\/ul>/);
  assert.match(html, /Supported: \.txt, \.md, \.markdown, \.rtf, \.html, \.htm, \.json, \.xml, \.yaml, \.yml, \.tex, \.pdf, \.epub, \.doc, \.docx, \.odt, \.pages, \.ppt, \.pptx, \.odp, \.key, \.csv, \.xls, \.xlsx, \.ods/);
  ['.doc', '.docx', '.odt', '.pages', '.epub', '.ppt', '.pptx', '.odp', '.key', '.csv', '.xls', '.xlsx', '.ods', '.xml', '.yaml', '.yml', '.tex'].forEach((extension) => {
    assert.match(html, new RegExp(extension.replace('.', '\\.')));
  });
  assert.match(html, /accept="[^"]*\.txt[^"]*\.md[^"]*\.markdown[^"]*\.rtf[^"]*\.html[^"]*\.htm[^"]*\.json[^"]*\.xml[^"]*\.yaml[^"]*\.yml[^"]*\.tex[^"]*\.pdf[^"]*\.epub[^"]*\.doc[^"]*\.docx[^"]*\.odt[^"]*\.pages[^"]*\.ppt[^"]*\.pptx[^"]*\.odp[^"]*\.key[^"]*\.csv[^"]*\.xls[^"]*\.xlsx[^"]*\.ods/);
  assert.match(cssRule(css, '.lesson-drop-zone > *'), /pointer-events:\s*none/);
  assert.match(css, /\.lesson-file-list\s*{/);
  assert.match(js, /document\.addEventListener\('dragover', handleDocumentLessonFileDragover\)/);
  assert.match(js, /document\.addEventListener\('drop', handleDocumentLessonFileDrop\)/);
  assert.match(js, /dragEventIsInsideElement\(event, dropZone\)/);
  assert.match(js, /data-remove-lesson-file-index/);
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

  const needsPlayersPicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve', 'Faith'],
    chosenPlayerNames: [],
  });
  assert.equal(needsPlayersPicked.needsPlayerPick, true);
  assert.equal(needsPlayersPicked.canContinue, false);
  assert.deepEqual(needsPlayersPicked.playerNames, []);
  assert.match(needsPlayersPicked.message, /Pick two to four players/i);

  const onePicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve', 'Faith'],
    chosenPlayerNames: ['Ada'],
  });
  assert.equal(onePicked.canContinue, false);
  assert.deepEqual(onePicked.playerNames, []);

  const twoPicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve', 'Faith'],
    chosenPlayerNames: ['Eve', 'Boaz'],
  });
  assert.equal(twoPicked.needsPlayerPick, true);
  assert.equal(twoPicked.canContinue, true);
  assert.deepEqual(twoPicked.playerNames, ['Eve', 'Boaz']);
  assert.match(twoPicked.message, /2 players are selected/i);

  const threePicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve', 'Faith'],
    chosenPlayerNames: ['Eve', 'Boaz', 'Ada'],
  });
  assert.equal(threePicked.canContinue, true);
  assert.deepEqual(threePicked.playerNames, ['Eve', 'Boaz', 'Ada']);

  const fourPicked = game.resolvePlayerSelection({
    attendingNames: ['Ada', 'Boaz', 'Chloe', 'Daniel', 'Eve', 'Faith'],
    chosenPlayerNames: ['Eve', 'Boaz', 'Ada', 'Daniel'],
  });
  assert.equal(fourPicked.needsPlayerPick, true);
  assert.equal(fourPicked.canContinue, true);
  assert.deepEqual(fourPicked.playerNames, ['Eve', 'Boaz', 'Ada', 'Daniel']);
});

test('explains that larger present groups may choose two to four players', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');

  assert.match(html, /<h3 id="player-picker-title">Choose two to four players<\/h3>/);
  assert.match(html, /Pick two to four players, or let Berean Board randomly select four from the checked names\./);
  assert.doesNotMatch(html, /Pick exactly four players/);
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

test('requires resetting virtual buzzers when the confirmed player roster changes', () => {
  assert.equal(game.shouldResetVirtualBuzzersForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Daniel'],
    hasVirtualSession: true,
    selectedBuzzerMode: 'virtual',
    buzzerSetupComplete: true,
  }), true);

  assert.equal(game.shouldResetVirtualBuzzersForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Daniel'],
    hasVirtualSession: false,
    selectedBuzzerMode: 'virtual',
    buzzerSetupComplete: true,
  }), true);

  assert.equal(game.shouldResetVirtualBuzzersForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    hasVirtualSession: true,
    selectedBuzzerMode: 'virtual',
    buzzerSetupComplete: true,
  }), false);

  assert.equal(game.shouldResetVirtualBuzzersForPlayerSelectionChange({
    currentPlayerNames: ['Ada', 'Boaz', 'Chloe'],
    nextPlayerNames: ['Ada', 'Boaz', 'Daniel'],
    hasVirtualSession: false,
    selectedBuzzerMode: 'in-person',
    buzzerSetupComplete: true,
  }), false);
});

test('maps setup stages to the step that should be expanded', () => {
  assert.deepEqual(game.getSetupStepExpansionState('group'), {
    groupExpanded: true,
    buzzerExpanded: false,
    lessonExpanded: false,
    difficultyExpanded: false,
    apiExpanded: false,
    buzzerAvailable: false,
    lessonAvailable: false,
    difficultyAvailable: false,
    apiAvailable: false,
  });
  assert.deepEqual(game.getSetupStepExpansionState('buzzer'), {
    groupExpanded: false,
    buzzerExpanded: true,
    lessonExpanded: false,
    difficultyExpanded: false,
    apiExpanded: false,
    buzzerAvailable: true,
    lessonAvailable: false,
    difficultyAvailable: false,
    apiAvailable: false,
  });
  assert.deepEqual(game.getSetupStepExpansionState('lesson'), {
    groupExpanded: false,
    buzzerExpanded: false,
    lessonExpanded: true,
    difficultyExpanded: false,
    apiExpanded: false,
    buzzerAvailable: true,
    lessonAvailable: true,
    difficultyAvailable: false,
    apiAvailable: false,
  });
  assert.deepEqual(game.getSetupStepExpansionState('difficulty'), {
    groupExpanded: false,
    buzzerExpanded: false,
    lessonExpanded: false,
    difficultyExpanded: true,
    apiExpanded: false,
    buzzerAvailable: true,
    lessonAvailable: true,
    difficultyAvailable: true,
    apiAvailable: false,
  });
  assert.deepEqual(game.getSetupStepExpansionState('api'), {
    groupExpanded: false,
    buzzerExpanded: false,
    lessonExpanded: false,
    difficultyExpanded: false,
    apiExpanded: true,
    buzzerAvailable: true,
    lessonAvailable: true,
    difficultyAvailable: true,
    apiAvailable: true,
  });
  assert.deepEqual(game.getSetupStepExpansionState('game'), {
    groupExpanded: false,
    buzzerExpanded: false,
    lessonExpanded: false,
    difficultyExpanded: false,
    apiExpanded: false,
    buzzerAvailable: true,
    lessonAvailable: true,
    difficultyAvailable: true,
    apiAvailable: true,
  });
  assert.deepEqual(game.getSetupStepExpansionState('unknown'), game.getSetupStepExpansionState('group'));
});

test('detects whether lesson setup has a source before unlocking difficulty setup', () => {
  assert.equal(game.hasLessonSourceInput({ files: [], lessonTopicText: '   ' }), false);
  assert.equal(game.hasLessonSourceInput({ files: null, lessonTopicText: '' }), false);
  assert.equal(game.hasLessonSourceInput({ files: [{ name: 'lesson.pdf' }], lessonTopicText: '' }), true);
  assert.equal(game.hasLessonSourceInput({ files: [], lessonTopicText: 'Romans 8 adoption in Christ' }), true);
});

test('defines Berean Board difficulty levels and generation guidance', () => {
  assert.equal(game.DEFAULT_DIFFICULTY_LEVEL, 'adult');
  assert.deepEqual(
    game.DIFFICULTY_LEVELS.map(({ level, name, gradeRange }) => ({ level, name, gradeRange })),
    [
      { level: 'Child', name: 'Little Lamb', gradeRange: 'Grade 1-2' },
      { level: 'Pre-teen', name: 'Bible Explorer', gradeRange: 'Grade 4-5' },
      { level: 'Teen', name: 'Disciple', gradeRange: 'Grade 6-8' },
      { level: 'Adult', name: 'Berean', gradeRange: 'Grade 9-11' },
      { level: 'Theologian', name: 'Theologian', gradeRange: 'Grade 12-16+' },
    ]
  );
  assert.equal(game.getDifficultyLevelConfig('Little Lamb').value, 'child');
  assert.equal(game.getDifficultyLevelConfig('Bible Explorer').value, 'preteen');
  assert.equal(game.getDifficultyLevelSummary('teen'), 'Teen — Disciple (Grade 6-8)');
  assert.match(game.buildDifficultyGenerationInstructions('theologian'), /Grade 12-16\+/);
  assert.match(game.buildDifficultyGenerationInstructions('theologian'), /Theological complexity and readability guidance/);
  assert.throws(() => game.requireDifficultyLevel(''), /difficulty level/i);
});

test('defines in-person and virtual buzzer modes with deterministic player colors', () => {
  assert.deepEqual(
    game.BUZZER_MODES.map(({ value, label, name }) => ({ value, label, name })),
    [
      { value: 'in-person', label: 'In-person', name: 'Physical buzzers' },
      { value: 'virtual', label: 'Virtual', name: 'Virtual buzzers' },
    ]
  );
  assert.equal(game.DEFAULT_BUZZER_MODE, 'in-person');
  assert.equal(game.getBuzzerModeConfig('Virtual buzzers').value, 'virtual');
  assert.equal(game.requireBuzzerMode('in-person').label, 'In-person');
  assert.throws(() => game.requireBuzzerMode(''), /buzzer mode/i);

  assert.deepEqual(game.BUZZER_COLORS.map(({ number, name, value }) => ({ number, name, value })), [
    { number: 1, name: 'Blue', value: '#3b82f6' },
    { number: 2, name: 'Purple', value: '#a855f7' },
    { number: 3, name: 'Green', value: '#22c55e' },
    { number: 4, name: 'Orange', value: '#f97316' },
  ]);
  assert.equal(game.getBuzzerColorForPlayerIndex(2).name, 'Green');
  assert.equal(game.getBuzzerColorForContestantId('contestant-4').value, '#f97316');
});

test('host buzzer audio design is loud enough and long enough for a TV game-show buzz-in cue', () => {
  assert.equal(game.HOST_BUZZER_SOUND_DURATION_SECONDS, 0.72);
  assert.equal(game.HOST_BUZZER_SOUND_VOLUME, 0.38);
  assert.ok(
    game.HOST_BUZZER_SOUND_VOICES.reduce((total, { gain }) => total + gain, 0) >= 0.9,
    'audible voice mix should be materially louder than the original quiet buzz'
  );
  assert.ok(
    game.HOST_BUZZER_SOUND_VOICES.some(({ type, startFrequency }) => type === 'square' && startFrequency >= 520),
    'the cue should include a bright square-wave game-show buzzer voice'
  );
});

test('host buzzer audio controller safely no-ops when Web Audio is unavailable', () => {
  const controller = game.createHostBuzzerAudioController({ root: {} });

  assert.equal(controller.isSupported(), false);
  assert.equal(controller.prime(), false);
  assert.equal(controller.play(), false);
});

test('host buzzer audio controller primes silently and schedules a louder game-show synthesized buzz', () => {
  const log = [];
  const controller = game.createHostBuzzerAudioController({
    root: createFakeAudioRoot(log),
    nowMs: () => 1_000,
  });

  assert.equal(controller.isSupported(), true);
  assert.deepEqual(log, []);
  assert.equal(controller.prime(), true);
  assert.equal(log.filter(([event]) => event === 'context.constructor').length, 1);
  assert.equal(log.filter(([event]) => event === 'context.resume').length, 1);
  assert.deepEqual(
    log.filter(([event, type]) => event === 'oscillator.start' && type === 'sine').map(([, type]) => type),
    ['sine'],
    'priming should only play a silent unlock oscillator, not the audible buzzer'
  );

  log.length = 0;
  assert.equal(controller.play(), true);
  const oscillatorStarts = log.filter(([event]) => event === 'oscillator.start');
  assert.deepEqual(
    oscillatorStarts.map(([, type]) => type),
    game.HOST_BUZZER_SOUND_VOICES.map(({ type }) => type)
  );
  assert.equal(oscillatorStarts.some(([, type]) => type === 'sine'), false);
  assert.ok(log.some(([event, name, value]) => event === 'param.exponential' && /frequency$/.test(name) && value <= 220));
  assert.ok(
    log.some(([event, name, value, time]) => event === 'param.linear' && /gain$/.test(name) && value >= game.HOST_BUZZER_SOUND_VOLUME * 0.9 && time >= 12.26),
    'the audible cue should have a second louder pulse so it reads like a TV game-show buzz-in'
  );
  assert.ok(log.some(([event, source, destination]) => event === 'connect' && /^compressor-/.test(source) && destination === 'destination'));
  assert.ok(
    log
      .filter(([event]) => event === 'oscillator.stop')
      .every(([, , time]) => time <= 12 + game.HOST_BUZZER_SOUND_DURATION_SECONDS + 0.04)
  );
});

test('host buzzer audio controller rate-limits repeats so buzzes are not obnoxious', () => {
  const log = [];
  let nowMs = 2_000;
  const controller = game.createHostBuzzerAudioController({
    root: createFakeAudioRoot(log),
    minIntervalMs: 650,
    nowMs: () => nowMs,
  });

  assert.equal(controller.play(), true);
  log.length = 0;
  nowMs += 300;
  assert.equal(controller.play(), false);
  assert.equal(log.filter(([event]) => event === 'oscillator.start').length, 0);

  nowMs += 400;
  assert.equal(controller.play(), true);
  assert.deepEqual(
    log.filter(([event]) => event === 'oscillator.start').map(([, type]) => type),
    game.HOST_BUZZER_SOUND_VOICES.map(({ type }) => type)
  );
});

test('host buzzer audio controller waits for a suspended context to resume before scheduling sound', async () => {
  const log = [];
  const fakeRoot = createFakeAudioRoot(log, {
    deferResume: true,
    requireRunningForNodes: true,
  });
  const controller = game.createHostBuzzerAudioController({
    root: fakeRoot,
    nowMs: () => 4_000,
  });

  assert.equal(controller.play(), true);
  assert.deepEqual(log.filter(([event]) => event === 'oscillator.start'), []);
  assert.deepEqual(log.filter(([event]) => event === 'context.resume'), [['context.resume']]);

  fakeRoot.resolveResume();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(
    log.filter(([event]) => event === 'oscillator.start').map(([, type]) => type),
    ['sine', ...game.HOST_BUZZER_SOUND_VOICES.map(({ type }) => type)]
  );
});

test('virtual first-buzz host flow primes and plays the synthesized buzzer sound only for remote buzzes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.match(html, /host screen will play a clear buzzer sound when a remote player buzzes in first/);
  assert.match(js, /const hostBuzzerAudio = createHostBuzzerAudioController\(\)/);

  const firstBuzzStart = js.indexOf('function handleVirtualFirstBuzz(firstBuzz)');
  const firstBuzzEnd = js.indexOf('function handleVirtualBuzzerBuzzUpdate', firstBuzzStart);
  const firstBuzzHandler = js.slice(firstBuzzStart, firstBuzzEnd);
  assert.match(firstBuzzHandler, /if \(virtualBuzzerFirstHandledKey === key\) return;/);
  assert.ok(
    firstBuzzHandler.indexOf('if (Number(firstBuzz.round) !== activeRound) return;') < firstBuzzHandler.indexOf('virtualBuzzerFirstHandledKey = key;'),
    'stale first-buzz rounds should be ignored before deduping or playing audio'
  );
  assert.ok(
    firstBuzzHandler.indexOf('activeCluePayload.categoryTitle !== buzzCluePayload.categoryTitle') < firstBuzzHandler.indexOf('virtualBuzzerFirstHandledKey = key;'),
    'stale first-buzz clue metadata should be ignored before deduping or playing audio'
  );
  assert.ok(
    firstBuzzHandler.indexOf('virtualBuzzerFirstHandledKey = key;') < firstBuzzHandler.indexOf('hostBuzzerAudio.play();'),
    'the sound should play only after the first-buzz event is accepted as new'
  );
  assert.ok(
    firstBuzzHandler.indexOf('hostBuzzerAudio.play();') < firstBuzzHandler.indexOf('disableVirtualBuzzersForHost(firstBuzz.round);'),
    'the host should hear the buzz before the round-guarded Firebase best-effort lock runs'
  );

  const modeChangedStart = js.indexOf('async function handleBuzzerModeChanged()');
  const modeChangedEnd = js.indexOf('async function completeBuzzerSetup()', modeChangedStart);
  assert.match(js.slice(modeChangedStart, modeChangedEnd), /void hostBuzzerAudio\.prime\(\);/);
  const completeStart = modeChangedEnd;
  const completeEnd = js.indexOf('function getAttemptedPlayerIndexesForActiveClue()', completeStart);
  assert.match(js.slice(completeStart, completeEnd), /void hostBuzzerAudio\.prime\(\);/);

  const manualChoiceStart = js.indexOf("contestantChoices?.addEventListener('change'");
  const manualChoiceEnd = js.indexOf("checkResponseButton?.addEventListener('click'", manualChoiceStart);
  assert.doesNotMatch(js.slice(manualChoiceStart, manualChoiceEnd), /hostBuzzerAudio\.play/);
});

test('player phone buzz button pre-arms a loudspeaker media element and plays the buzzer sound on a valid tap', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.match(js, /const playerBuzzerAudio = createPlayerBuzzerMediaAudioController\(\)/);
  assert.doesNotMatch(js, /const playerBuzzerAudio = createHostBuzzerAudioController\(\)/);
  assert.match(js, /const playerBuzzerAudioFeedback = createVirtualBuzzerPlayerAudioFeedback\(/);
  assert.match(js, /function canCurrentPlayerSubmitVirtualBuzz\(\)/);

  const claimStart = js.indexOf("virtualBuzzerClaimButton?.addEventListener('click'");
  const claimEnd = js.indexOf('function handlePlayerBuzzerPressStart()', claimStart);
  const claimHandler = js.slice(claimStart, claimEnd);
  assert.match(claimHandler, /void playerBuzzerAudio\.prime\(\);/);

  const pressStart = claimEnd;
  const clickStart = js.indexOf("virtualBuzzerButton?.addEventListener('click'", pressStart);
  const pressHandler = js.slice(pressStart, clickStart);
  assert.match(pressHandler, /function handlePlayerBuzzerPressStart\(\)/);
  assert.match(pressHandler, /playerBuzzerAudioFeedback\.play\(\);/);
  assert.match(pressHandler, /virtualBuzzerButton\.addEventListener\('pointerdown', handlePlayerBuzzerPressStart\)/);
  assert.match(pressHandler, /virtualBuzzerButton\.addEventListener\('touchstart', handlePlayerBuzzerPressStart, \{ passive: true \}\)/);

  const buzzEnd = js.indexOf("document.addEventListener('visibilitychange'", clickStart);
  const buzzHandler = js.slice(clickStart, buzzEnd);
  assert.ok(
    buzzHandler.indexOf('if (!canCurrentPlayerSubmitVirtualBuzz()) return;') < buzzHandler.indexOf('playerBuzzerAudioFeedback.play();'),
    'the phone sound should play only after the local buzz is still valid'
  );
  assert.ok(
    buzzHandler.indexOf('playerBuzzerAudioFeedback.play();') < buzzHandler.indexOf('virtualBuzzerService.submitFirstBuzz'),
    'the phone should give audible feedback immediately from the BUZZ tap before waiting on Firebase'
  );
  assert.doesNotMatch(buzzHandler, /hostBuzzerAudio\.play\(\)/);
});

test('player buzzer media audio controller uses an HTML audio element for phone loudspeaker playback', () => {
  const created = [];
  class FakeAudioElement {
    constructor(src) {
      this.src = src;
      this.currentTime = 9;
      this.volume = 0;
      this.preload = '';
      this.playsInline = false;
      this.attributes = {};
      this.events = [];
      created.push(this);
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
      this.events.push(['setAttribute', name, value]);
    }

    load() {
      this.events.push(['load']);
    }

    play() {
      this.events.push(['play', this.currentTime, this.volume]);
      return Promise.resolve();
    }
  }

  const controller = game.createPlayerBuzzerMediaAudioController({
    root: { Audio: FakeAudioElement },
    nowMs: () => 5_000,
  });

  assert.equal(controller.isSupported(), true);
  assert.equal(controller.prime(), true);
  assert.equal(created.length, 1);
  assert.match(created[0].src, /^data:audio\/wav;base64,/);
  assert.equal(created[0].preload, 'auto');
  assert.equal(created[0].playsInline, true);
  assert.equal(created[0].attributes.playsinline, '');
  assert.deepEqual(created[0].events.filter(([event]) => event === 'load'), [['load']]);

  assert.equal(controller.play(), true);
  assert.equal(created[0].currentTime, 0);
  assert.ok(created[0].events.some(([event, currentTime, volume]) => event === 'play' && currentTime === 0 && volume >= 0.8));
});

test('player buzzer audio feedback only plays when the current phone can submit', () => {
  let canSubmit = false;
  const calls = [];
  const feedback = game.createVirtualBuzzerPlayerAudioFeedback({
    audioController: {
      prime: () => calls.push('prime'),
      play: () => calls.push('play'),
    },
    canSubmitVirtualBuzz: () => canSubmit,
  });

  assert.equal(feedback.prime(), false);
  assert.equal(feedback.play(), false);
  assert.deepEqual(calls, []);

  canSubmit = true;
  assert.equal(feedback.prime(), true);
  assert.equal(feedback.play(), true);
  assert.deepEqual(calls, ['prime', 'play']);
});

test('provides a repeatable virtual buzzer latency smoke harness', () => {
  const scriptPath = path.join(__dirname, 'smoke-berean-board-virtual-latency.cjs');
  assert.ok(fs.existsSync(scriptPath), 'expected a maintained latency smoke script');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /BEREAN_BOARD_CDP_URL/);
  assert.match(script, /Target\.createBrowserContext/);
  assert.match(script, /closeVirtualBuzzerSession/);
  assert.match(script, /disposeBrowserContext/);
  assert.match(script, /clickToHostMs/);
  assert.match(script, /phoneEnableLagMs/);
  assert.match(script, /audioPlayResult/);
  assert.match(script, /--rounds/);
  assert.match(script, /--live/);
});

test('virtual buzzer latency smoke harness retries transient CDP context-destroyed evaluations', () => {
  const smoke = require('./smoke-berean-board-virtual-latency.cjs');
  assert.equal(smoke.isTransientCdpEvaluationError(new Error('Runtime.evaluate: Execution context was destroyed.')), true);
  assert.equal(smoke.isTransientCdpEvaluationError(new Error('Runtime.evaluate: Cannot find context with specified id')), true);
  assert.equal(smoke.isTransientCdpEvaluationError(new Error('Permission denied')), false);
});

test('player buzzer screen requests a screen wake lock and reacquires it after visibility changes', async () => {
  const calls = [];
  let releaseHandler = null;
  const sentinel = {
    addEventListener(eventName, handler) {
      if (eventName === 'release') releaseHandler = handler;
    },
    async release() {
      calls.push(['release']);
      if (releaseHandler) releaseHandler();
    },
  };
  const documentRef = {
    visibilityState: 'visible',
    hidden: false,
    listeners: {},
    addEventListener(eventName, handler) {
      this.listeners[eventName] = handler;
    },
    removeEventListener(eventName) {
      delete this.listeners[eventName];
    },
  };
  const root = {
    navigator: {
      wakeLock: {
        async request(lockType) {
          calls.push(['request', lockType]);
          return sentinel;
        },
      },
    },
  };

  const controller = game.createPlayerScreenWakeLockController({ root, documentRef });

  assert.equal(await controller.request(), true);
  assert.deepEqual(calls, [['request', 'screen']]);
  documentRef.hidden = true;
  documentRef.visibilityState = 'hidden';
  await controller.handleVisibilityChange();
  assert.deepEqual(calls, [['request', 'screen'], ['release']]);
  documentRef.hidden = false;
  documentRef.visibilityState = 'visible';
  await controller.handleVisibilityChange();
  assert.deepEqual(calls, [['request', 'screen'], ['release'], ['request', 'screen']]);
  await controller.release();
  assert.deepEqual(calls, [['request', 'screen'], ['release'], ['request', 'screen'], ['release']]);
});

test('player wake lock releases a pending request if the phone route stops needing it', async () => {
  const calls = [];
  let resolveRequest;
  const sentinel = {
    addEventListener() {},
    async release() {
      calls.push(['release']);
    },
  };
  const root = {
    navigator: {
      wakeLock: {
        request(lockType) {
          calls.push(['request', lockType]);
          return new Promise((resolve) => {
            resolveRequest = resolve;
          });
        },
      },
    },
  };

  const controller = game.createPlayerScreenWakeLockController({ root, documentRef: { hidden: false, visibilityState: 'visible' } });
  const requestPromise = controller.request();
  const releasePromise = controller.release();
  resolveRequest(sentinel);

  assert.equal(await requestPromise, false);
  assert.equal(await releasePromise, true);
  assert.deepEqual(calls, [['request', 'screen'], ['release']]);
});

test('builds virtual buzzer session records, join URLs, claims, and first-buzz payloads', () => {
  const session = virtualBuzzers.buildVirtualBuzzerSessionRecord({
    hostUid: 'host-123',
    playerNames: ['Ada', 'Boaz', 'Chloe'],
    nowMs: Date.UTC(2026, 0, 2, 3, 4, 5),
  });

  assert.equal(session.hostUid, 'host-123');
  assert.equal(session.status, 'setup');
  assert.equal(session.buzzRound, 0);
  assert.equal(session.expiresAt, Date.UTC(2026, 0, 2, 7, 4, 5));
  assert.deepEqual(session.playerNames, { 0: 'Ada', 1: 'Boaz', 2: 'Chloe' });
  assert.deepEqual(session.playerClaims, {});
  assert.deepEqual(session.buzz, { round: 0, open: false, first: null, lockedOutPlayerIndexes: {} });

  assert.equal(
    virtualBuzzers.buildVirtualBuzzerJoinUrl({
      origin: 'https://www.navtheway.com',
      pathname: '/berean-board',
      sessionId: 'session_abc123',
    }),
    'https://www.navtheway.com/berean-board?mode=buzz&session=session_abc123'
  );

  assert.deepEqual(virtualBuzzers.buildPlayerClaimValue({
    uid: 'player-uid',
    playerIndex: 1,
    playerNames: ['Ada', 'Boaz'],
    nowMs: 12345,
  }), {
    uid: 'player-uid',
    playerName: 'Boaz',
    buzzerNumber: 2,
    claimedAt: 12345,
  });

  assert.deepEqual(virtualBuzzers.buildFirstBuzzValue({
    uid: 'player-uid',
    playerIndex: 1,
    playerNames: ['Ada', 'Boaz'],
    round: 3,
    nowMs: 67890,
  }), {
    uid: 'player-uid',
    playerIndex: 1,
    playerName: 'Boaz',
    buzzerNumber: 2,
    round: 3,
    buzzedAt: 67890,
  });

  assert.deepEqual(virtualBuzzers.buildHostSelectedBuzzValue({
    claim: { uid: 'boaz-phone', playerName: 'Boaz', buzzerNumber: 2 },
    playerIndex: 1,
    playerNames: ['Ada', 'Boaz'],
    round: 4,
    nowMs: 98765,
  }), {
    uid: 'boaz-phone',
    playerIndex: 1,
    playerName: 'Boaz',
    buzzerNumber: 2,
    round: 4,
    buzzedAt: 98765,
    source: 'host',
  });
});

test('recovers a same-phone virtual buzzer claim after a duplicate claim transaction aborts', async () => {
  const existingClaim = {
    uid: 'boaz-phone',
    playerName: 'Boaz',
    buzzerNumber: 2,
    claimedAt: 12345,
  };
  const context = {
    uid: 'boaz-phone',
    database: {},
    sdk: {
      database: {
        ref(_database, refPath) {
          return { refPath };
        },
        async runTransaction(ref, updater) {
          assert.equal(ref.refPath, 'sessions/session_abc123/playerClaims/1');
          assert.equal(updater(existingClaim), undefined);
          return {
            committed: false,
            snapshot: { val: () => existingClaim },
          };
        },
      },
    },
  };

  const result = await virtualBuzzers.claimPlayerSlot({
    context,
    sessionId: 'session_abc123',
    playerIndex: 1,
    playerNames: ['Ada', 'Boaz'],
  });

  assert.equal(result.committed, false);
  assert.equal(result.recovered, true);
  assert.deepEqual(result.claim, {
    ...existingClaim,
    playerIndex: 1,
  });
});

test('normalizes virtual buzzer state and only enables eligible claimed players', () => {
  const session = {
    status: 'open',
    buzzRound: 2,
    playerNames: { 0: 'Ada', 1: 'Boaz', 2: 'Chloe' },
    playerClaims: {
      0: { uid: 'ada-uid', playerName: 'Ada', buzzerNumber: 1 },
      2: { uid: 'chloe-uid', playerName: 'Chloe', buzzerNumber: 3 },
    },
    buzz: { open: true, first: null, lockedOutPlayerIndexes: [2] },
  };

  const normalized = virtualBuzzers.normalizeVirtualBuzzerSession(session);
  assert.deepEqual(normalized.playerNames, ['Ada', 'Boaz', 'Chloe']);
  assert.deepEqual(normalized.claims.map((claim) => claim?.uid || ''), ['ada-uid', '', 'chloe-uid']);
  assert.deepEqual(virtualBuzzers.getPlayerClaimOptions(normalized), [
    { playerIndex: 0, playerName: 'Ada', buzzerNumber: 1, claimed: true, claimedByCurrentUser: false, disabled: true, unavailableReason: 'claimed', selected: false },
    { playerIndex: 1, playerName: 'Boaz', buzzerNumber: 2, claimed: false, claimedByCurrentUser: false, disabled: false, unavailableReason: '', selected: false },
    { playerIndex: 2, playerName: 'Chloe', buzzerNumber: 3, claimed: true, claimedByCurrentUser: false, disabled: true, unavailableReason: 'claimed', selected: false },
  ]);

  assert.equal(virtualBuzzers.canSubmitVirtualBuzz({ session: normalized, claim: normalized.claims[0], uid: 'ada-uid' }), true);
  assert.equal(virtualBuzzers.canSubmitVirtualBuzz({ session: normalized, claim: normalized.claims[2], uid: 'chloe-uid' }), false);
  assert.equal(virtualBuzzers.canSubmitVirtualBuzz({ session: { ...normalized, buzz: { ...normalized.buzz, first: { uid: 'ada-uid' } } }, claim: normalized.claims[0], uid: 'ada-uid' }), false);

  const firebaseArrayLockedOutSession = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'open',
    buzzRound: 3,
    playerNames: { 0: 'Ada', 1: 'Boaz' },
    playerClaims: {
      0: { uid: 'ada-uid', playerName: 'Ada', buzzerNumber: 1 },
      1: { uid: 'boaz-uid', playerName: 'Boaz', buzzerNumber: 2 },
    },
    buzz: { round: 3, open: true, first: null, lockedOutPlayerIndexes: [true] },
  });

  assert.deepEqual(firebaseArrayLockedOutSession.buzz.lockedOutPlayerIndexes, [0]);
  assert.equal(virtualBuzzers.canSubmitVirtualBuzz({ session: firebaseArrayLockedOutSession, claim: firebaseArrayLockedOutSession.claims[0], uid: 'ada-uid' }), false);
  assert.equal(virtualBuzzers.canSubmitVirtualBuzz({ session: firebaseArrayLockedOutSession, claim: firebaseArrayLockedOutSession.claims[1], uid: 'boaz-uid' }), true);
});

test('virtual buzzers stay disabled during mixed buzzRound and buzz.round snapshots', () => {
  const mixedRoundSession = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'open',
    buzzRound: 8,
    playerNames: { 0: 'Ada' },
    playerClaims: { 0: { uid: 'ada-uid', playerName: 'Ada', buzzerNumber: 1 } },
    buzz: { round: 7, open: true, first: null, lockedOutPlayerIndexes: {} },
  });

  assert.equal(
    virtualBuzzers.canSubmitVirtualBuzz({ session: mixedRoundSession, claim: mixedRoundSession.claims[0], uid: 'ada-uid' }),
    false
  );
});

test('player buzz submissions use the opened buzz round instead of a mixed top-level round', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  assert.match(js, /round:\s*virtualBuzzerPlayerSession\.buzz\?\.round\s*\?\?\s*virtualBuzzerPlayerSession\.buzzRound/);
});

test('builds helpful player-phone buzzer messages from clue and lockout state', () => {
  const session = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'open',
    buzzRound: 5,
    playerNames: { 0: 'Madison', 1: 'Ted' },
    playerClaims: {
      0: { uid: 'madison-phone', playerName: 'Madison', buzzerNumber: 1 },
      1: { uid: 'ted-phone', playerName: 'Ted', buzzerNumber: 2 },
    },
    buzz: {
      round: 5,
      open: true,
      first: null,
      lockedOutPlayerIndexes: { 0: true },
      currentClue: { categoryTitle: 'People and Sin', value: 100 },
    },
  });

  assert.equal(
    game.buildVirtualBuzzerPhoneStatusMessage({ session, claim: session.claims[0], uid: 'madison-phone' }),
    'You already answered People and Sin for $100. Wait while another player tries.'
  );
  assert.equal(
    game.buildVirtualBuzzerPhoneStatusMessage({ session, claim: session.claims[1], uid: 'ted-phone' }),
    'Buzzers are open for People and Sin for $100!'
  );
  assert.equal(
    game.buildVirtualBuzzerPlayerHeaderMessage({ session, claim: session.claims[0] }),
    'Current question: People and Sin for $100.'
  );

  const hostSelected = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'locked',
    buzzRound: 5,
    playerNames: { 0: 'Madison', 1: 'Ted' },
    playerClaims: {
      0: { uid: 'madison-phone', playerName: 'Madison', buzzerNumber: 1 },
      1: { uid: 'ted-phone', playerName: 'Ted', buzzerNumber: 2 },
    },
    buzz: {
      round: 5,
      open: false,
      lockedOutPlayerIndexes: { 0: true },
      currentClue: { categoryTitle: 'People and Sin', value: 100 },
      first: {
        uid: 'madison-phone',
        playerIndex: 0,
        playerName: 'Madison',
        buzzerNumber: 1,
        round: 5,
        buzzedAt: 123,
        source: 'host',
      },
    },
  });
  assert.equal(
    game.buildVirtualBuzzerPhoneStatusMessage({ session: hostSelected, claim: hostSelected.claims[0], uid: 'madison-phone' }),
    'The host selected you for People and Sin for $100. Give your answer now.'
  );
  assert.equal(
    game.buildVirtualBuzzerPhoneStatusMessage({ session: hostSelected, claim: hostSelected.claims[1], uid: 'ted-phone' }),
    'Madison is answering People and Sin for $100. Wait for the host.'
  );
});

test('player phone name list does not auto-select a player before the phone user chooses one', () => {
  const session = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'setup',
    expiresAt: Date.now() + 60_000,
    playerNames: { 0: 'Ada', 1: 'Boaz' },
    playerClaims: {},
    buzz: { open: false, first: null, lockedOutPlayerIndexes: {} },
  });

  assert.deepEqual(virtualBuzzers.getPlayerClaimOptions(session, 'new-phone').map((option) => option.selected), [false, false]);
});

test('player phone name list preserves a newly selected unclaimed player through re-render', () => {
  const session = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'setup',
    expiresAt: Date.now() + 60_000,
    playerNames: { 0: 'Ada', 1: 'Boaz', 2: 'Chloe' },
    playerClaims: { 0: { uid: 'ada-uid', playerName: 'Ada', buzzerNumber: 1, claimedAt: 1 } },
    buzz: { open: false, first: null, lockedOutPlayerIndexes: {} },
  });

  assert.deepEqual(virtualBuzzers.getPlayerClaimOptions(session, 'boaz-phone', 1), [
    { playerIndex: 0, playerName: 'Ada', buzzerNumber: 1, claimed: true, claimedByCurrentUser: false, disabled: true, unavailableReason: 'claimed', selected: false },
    { playerIndex: 1, playerName: 'Boaz', buzzerNumber: 2, claimed: false, claimedByCurrentUser: false, disabled: false, unavailableReason: '', selected: true },
    { playerIndex: 2, playerName: 'Chloe', buzzerNumber: 3, claimed: false, claimedByCurrentUser: false, disabled: false, unavailableReason: '', selected: false },
  ]);
});

test('closed virtual buzzer sessions disable player name claiming before the TTL expires', () => {
  const closed = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'closed',
    expiresAt: Date.now() + 60_000,
    playerNames: { 0: 'Ada', 1: 'Boaz' },
    playerClaims: {},
    buzz: { open: false, first: null, lockedOutPlayerIndexes: {} },
  });

  assert.equal(virtualBuzzers.isVirtualBuzzerSessionClosed(closed), true);
  assert.deepEqual(virtualBuzzers.getPlayerClaimOptions(closed, 'new-phone'), [
    { playerIndex: 0, playerName: 'Ada', buzzerNumber: 1, claimed: false, claimedByCurrentUser: false, disabled: true, unavailableReason: 'closed', selected: false },
    { playerIndex: 1, playerName: 'Boaz', buzzerNumber: 2, claimed: false, claimedByCurrentUser: false, disabled: true, unavailableReason: 'closed', selected: false },
  ]);
});

test('closed virtual buzzer sessions do not keep claimed names selected', () => {
  const closed = virtualBuzzers.normalizeVirtualBuzzerSession({
    status: 'closed',
    expiresAt: Date.now() + 60_000,
    playerNames: { 0: 'Ada', 1: 'Boaz' },
    playerClaims: { 1: { uid: 'boaz-phone', playerName: 'Boaz', buzzerNumber: 2, claimedAt: 1 } },
    buzz: { open: false, first: null, lockedOutPlayerIndexes: {} },
  });

  assert.deepEqual(virtualBuzzers.getPlayerClaimOptions(closed, 'boaz-phone', 1).map((option) => option.selected), [false, false]);
});

test('retries transient virtual buzzer operations before surfacing a mobile connection error', async () => {
  const attempts = [];
  const retryNotices = [];
  const result = await virtualBuzzers.withVirtualBuzzerRetry(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 3) throw new Error('Firebase network-request-failed while joining buzzer.');
    return 'connected';
  }, {
    delaysMs: [11, 22],
    sleep: async (delayMs) => retryNotices.push(['sleep', delayMs]),
    onRetry: (event) => retryNotices.push(['retry', event.attempt, event.nextDelayMs, event.error.message]),
  });

  assert.equal(result, 'connected');
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(retryNotices, [
    ['retry', 1, 11, 'Firebase network-request-failed while joining buzzer.'],
    ['sleep', 11],
    ['retry', 2, 22, 'Firebase network-request-failed while joining buzzer.'],
    ['sleep', 22],
  ]);
});

test('does not retry permanent virtual buzzer setup errors', async () => {
  const attempts = [];
  await assert.rejects(
    virtualBuzzers.withVirtualBuzzerRetry(async (attempt) => {
      attempts.push(attempt);
      throw new Error('Choose one of the available player names.');
    }, {
      delaysMs: [1, 1, 1],
      sleep: async () => { throw new Error('sleep should not run'); },
    }),
    /Choose one of the available player names/
  );
  assert.deepEqual(attempts, [1]);
});

test('reveals clue text one word at a time at 145 words per minute', () => {
  assert.equal(game.CLUE_REVEAL_WORDS_PER_MINUTE, 145);
  assert.equal(game.getClueRevealWordIntervalMs(), 60_000 / 145);
  assert.deepEqual(
    game.buildClueRevealFrames('  Who   did Jesus call first?  '),
    ['Who', 'Who did', 'Who did Jesus', 'Who did Jesus call', 'Who did Jesus call first?']
  );
});

test('locks response controls while a clue question is still revealing', () => {
  const controlState = game.getResponseEntryControlState({
    hasSelectedContestant: true,
    clueIsComplete: false,
    responseCheckInFlight: false,
    clueRevealComplete: false,
  });

  assert.deepEqual(controlState, {
    responseSectionHidden: false,
    responseInputDisabled: true,
    checkResponseButtonDisabled: true,
    noBuzzButtonDisabled: true,
    contestantChoicesDisabled: true,
  });
  assert.equal(game.canHandleNoBuzz({
    activeClue: { completed: false },
    responseCheckInFlight: false,
    clueRevealComplete: false,
  }), false);
  assert.deepEqual(game.getContestantChoiceRenderState({
    contestantId: 'contestant-1',
    selectedContestantId: '',
    attemptedIds: [],
    clueIsComplete: false,
    responseCheckInFlight: false,
    clueRevealComplete: false,
  }), {
    attempted: false,
    checked: false,
    disabled: true,
    choicesDisabled: true,
  });
});

test('question panel appears first and virtual buzzers open only after timed clue reveal completes', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  const openClueStart = js.indexOf('async function openClue(clueId,');
  const openClueEnd = js.indexOf('function replaceActiveClue', openClueStart);
  assert.notEqual(openClueStart, -1, 'openClue should be present');
  assert.notEqual(openClueEnd, -1, 'openClue section should be bounded');
  const openClueBody = js.slice(openClueStart, openClueEnd);
  const panelRevealIndex = openClueBody.indexOf('cluePanel.hidden = false;');
  const timedRevealIndex = openClueBody.indexOf('await runActiveClueQuestionReveal();');
  const virtualOpenIndex = openClueBody.indexOf('await openVirtualBuzzersForActiveClue();');
  assert.ok(panelRevealIndex !== -1, 'question panel should appear immediately');
  assert.ok(timedRevealIndex !== -1, 'question text should use the timed reveal path');
  assert.ok(virtualOpenIndex !== -1, 'virtual buzzers should still open for active clues');
  assert.ok(panelRevealIndex < timedRevealIndex, 'the host should see the panel before the timed question reveal starts');
  assert.ok(timedRevealIndex < virtualOpenIndex, 'virtual buzzers must stay disabled until the full question is visible');
});

test('host verdict overrides reopen already exposed incomplete clues without re-running timed reveal', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  const openClueStart = js.indexOf('async function openClue(clueId,');
  const openClueEnd = js.indexOf('function replaceActiveClue', openClueStart);
  const overrideStart = js.indexOf('async function handleHostVerdictOverride');
  const overrideEnd = js.indexOf('function clearClueVerdict', overrideStart);
  assert.notEqual(openClueStart, -1, 'openClue should be present');
  assert.notEqual(openClueEnd, -1, 'openClue section should be bounded');
  assert.notEqual(overrideStart, -1, 'host verdict override handler should be present');
  assert.notEqual(overrideEnd, -1, 'host verdict override section should be bounded');
  const openClueBody = js.slice(openClueStart, openClueEnd);
  const overrideBody = js.slice(overrideStart, overrideEnd);

  assert.match(openClueBody, /skipQuestionReveal = false/);
  assert.match(openClueBody, /const shouldRunQuestionReveal = !skipQuestionReveal;/);
  assert.match(openClueBody, /activeClue\.completed \|\| !shouldRunQuestionReveal \? activeClue\.clue : ''/);
  assert.match(openClueBody, /if \(shouldRunQuestionReveal\) \{\s+const revealCompleted = await runActiveClueQuestionReveal\(\);/);
  assert.match(openClueBody, /isVirtualBuzzerMode\(\) && openVirtualBuzzersAfterReveal/);
  assert.match(overrideBody, /await openClue\(result\.clue\.id, \{\s+skipQuestionReveal: !result\.clue\.completed,\s+openVirtualBuzzersAfterReveal: false,\s+\}\);/);
});

test('player virtual buzzer route self-heals transient connection and claim failures', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  assert.match(js, /function runVirtualBuzzerRetry/);
  assert.match(js, /virtualBuzzerService\.withVirtualBuzzerRetry/);
  assert.match(js, /runVirtualBuzzerRetry\(\(\) => virtualBuzzerService\.initializeFirebaseContext/);
  assert.match(js, /runVirtualBuzzerRetry\(\(\) => virtualBuzzerService\.claimPlayerSlot/);
  assert.match(js, /Retrying automatically/);
});

test('waits for Firebase Auth state before deciding to sign in anonymously', async () => {
  const authWithReady = {
    currentUser: null,
    async authStateReady() {
      this.currentUser = { uid: 'restored-user' };
    },
  };
  assert.deepEqual(await virtualBuzzers.waitForInitialAuthUser(authWithReady, {}), { uid: 'restored-user' });

  let unsubscribeCalled = false;
  const observedUser = await virtualBuzzers.waitForInitialAuthUser({ currentUser: null }, {
    onAuthStateChanged(_auth, next) {
      next({ uid: 'observer-user' });
      return () => { unsubscribeCalled = true; };
    },
  });
  assert.deepEqual(observedUser, { uid: 'observer-user' });
  assert.equal(unsubscribeCalled, true);
});


test('normalizes App Check config for enterprise and legacy v3 site keys', () => {
  assert.deepEqual(virtualBuzzers.getAppCheckConfig({
    BEREAN_BOARD_FIREBASE_APP_CHECK: { provider: 'enterprise', siteKey: 'enterprise-site-key' },
  }), { provider: 'recaptcha-enterprise', siteKey: 'enterprise-site-key' });

  assert.deepEqual(virtualBuzzers.getAppCheckConfig({
    BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY: 'legacy-v3-site-key',
  }), { provider: 'recaptcha-v3', siteKey: 'legacy-v3-site-key' });

  assert.deepEqual(virtualBuzzers.getAppCheckConfig({
    BEREAN_BOARD_FIREBASE_APP_CHECK: { provider: 'enterprise', siteKey: 'checked-in-site-key' },
    BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY: 'legacy-override-site-key',
  }), { provider: 'recaptcha-enterprise', siteKey: 'checked-in-site-key' });
});

test('Firebase config keeps legacy App Check site-key overrides on reCAPTCHA v3', () => {
  const firebaseConfigScript = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firebase-config.js'), 'utf8');
  const sandbox = {
    window: {
      BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY: 'legacy-override-site-key',
    },
  };

  vm.runInNewContext(firebaseConfigScript, sandbox);

  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.provider, 'recaptcha-v3');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey, 'legacy-override-site-key');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY, 'legacy-override-site-key');
});

test('Firebase config treats an old in-file legacy App Check site key assignment as reCAPTCHA v3', () => {
  const firebaseConfigScript = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firebase-config.js'), 'utf8')
    .split(String.fromCharCode(13)).join('');
  const legacySeedBlock = `window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY =
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ||
  (window.BEREAN_BOARD_FIREBASE_APP_CHECK && window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey) ||
  '';`;
  const configuredLegacyBlock = `window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY =
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ||
  (window.BEREAN_BOARD_FIREBASE_APP_CHECK && window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey) ||
  'legacy-configured-site-key';`;
  const configuredScript = firebaseConfigScript.replace(legacySeedBlock, configuredLegacyBlock);
  const sandbox = { window: {} };

  assert.notEqual(configuredScript, firebaseConfigScript);
  vm.runInNewContext(configuredScript, sandbox);

  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.provider, 'recaptcha-v3');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey, 'legacy-configured-site-key');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY, 'legacy-configured-site-key');
});

test('Firebase config keeps explicit App Check objects ahead of legacy aliases', () => {
  const firebaseConfigScript = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firebase-config.js'), 'utf8');
  const sandbox = {
    window: {
      BEREAN_BOARD_FIREBASE_APP_CHECK: {
        provider: 'recaptcha-enterprise',
        siteKey: '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr',
      },
      BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY: 'legacy-leftover-site-key',
    },
  };

  vm.runInNewContext(firebaseConfigScript, sandbox);

  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.provider, 'recaptcha-enterprise');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey, '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr');
});

test('Firebase config preserves in-file explicit App Check objects over stale legacy aliases', () => {
  const firebaseConfigScript = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firebase-config.js'), 'utf8')
    .split(String.fromCharCode(13)).join('');
  const defaultObject = `window.BEREAN_BOARD_FIREBASE_APP_CHECK = window.BEREAN_BOARD_FIREBASE_APP_CHECK || {
  provider: window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ? 'recaptcha-v3' : 'recaptcha-enterprise',
  siteKey: window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY || '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr',
};`;
  const explicitObject = `window.BEREAN_BOARD_FIREBASE_APP_CHECK = window.BEREAN_BOARD_FIREBASE_APP_CHECK || {
  provider: 'recaptcha-enterprise',
  siteKey: '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr',
};`;
  const legacySeedBlock = `window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY =
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ||
  (window.BEREAN_BOARD_FIREBASE_APP_CHECK && window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey) ||
  '';`;
  const staleLegacyBlock = `window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY =
  window.BEREAN_BOARD_FIREBASE_APP_CHECK_SITE_KEY ||
  (window.BEREAN_BOARD_FIREBASE_APP_CHECK && window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey) ||
  'legacy-leftover-site-key';`;
  const configuredScript = firebaseConfigScript
    .replace(defaultObject, explicitObject)
    .replace(legacySeedBlock, staleLegacyBlock);
  const sandbox = { window: {} };

  assert.notEqual(configuredScript, firebaseConfigScript);
  assert.ok(configuredScript.includes(explicitObject));
  assert.ok(configuredScript.includes(staleLegacyBlock));
  vm.runInNewContext(configuredScript, sandbox);

  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.provider, 'recaptcha-enterprise');
  assert.equal(sandbox.window.BEREAN_BOARD_FIREBASE_APP_CHECK.siteKey, '6LcEjCctAAAAANI5ECfNQV1ZPe5AipYep-YGhGcr');
});

test('initializes Firebase App Check with reCAPTCHA Enterprise before Firebase services', async () => {
  const calls = [];
  const appInstance = { name: 'berean-board-virtual-buzzers' };
  const appModule = {
    getApps() {
      return [];
    },
    initializeApp(config, appName) {
      calls.push(['initializeApp', appName, config.projectId]);
      return appInstance;
    },
  };
  const authObject = {
    currentUser: null,
    async authStateReady() {
      calls.push(['authStateReady']);
    },
  };
  const authModule = {
    getAuth(app) {
      calls.push(['getAuth', app.name]);
      return authObject;
    },
    async signInAnonymously(auth) {
      calls.push(['signInAnonymously', auth === authObject]);
      return { user: { uid: 'host-uid' } };
    },
  };
  const databaseModule = {
    getDatabase(app) {
      calls.push(['getDatabase', app.name]);
      return { appName: app.name };
    },
  };
  class ReCaptchaEnterpriseProvider {
    constructor(siteKey) {
      this.providerKind = 'enterprise';
      this.siteKey = siteKey;
    }
  }
  class ReCaptchaV3Provider {
    constructor(siteKey) {
      this.providerKind = 'v3';
      this.siteKey = siteKey;
    }
  }
  const appCheckModule = {
    ReCaptchaEnterpriseProvider,
    ReCaptchaV3Provider,
    initializeAppCheck(app, options) {
      calls.push([
        'initializeAppCheck',
        app.name,
        options.provider.providerKind,
        options.provider.siteKey,
        options.isTokenAutoRefreshEnabled,
      ]);
      return { app, options };
    },
  };
  async function importer(specifier) {
    if (specifier.includes('firebase-app-check.js')) return appCheckModule;
    if (specifier.includes('firebase-auth.js')) return authModule;
    if (specifier.includes('firebase-database.js')) return databaseModule;
    if (specifier.includes('firebase-app.js')) return appModule;
    throw new Error(`unexpected import ${specifier}`);
  }

  const context = await virtualBuzzers.initializeFirebaseContext({
    config: {
      apiKey: 'AIzaSyExampleKey',
      authDomain: 'example.firebaseapp.com',
      databaseURL: 'https://example-default-rtdb.firebaseio.com',
      projectId: 'example-project',
      appId: '1:example:web:example',
    },
    appCheckSiteKey: 'enterprise-site-key',
    appCheckProvider: 'recaptcha-enterprise',
    importer,
  });

  assert.equal(context.uid, 'host-uid');
  assert.equal(context.appCheck.options.provider.providerKind, 'enterprise');
  assert.deepEqual(calls.slice(0, 5), [
    ['initializeApp', 'berean-board-virtual-buzzers', 'example-project'],
    ['initializeAppCheck', 'berean-board-virtual-buzzers', 'enterprise', 'enterprise-site-key', true],
    ['getAuth', 'berean-board-virtual-buzzers'],
    ['authStateReady'],
    ['signInAnonymously', true],
  ]);
  assert.deepEqual(calls[5], ['getDatabase', 'berean-board-virtual-buzzers']);

  calls.length = 0;
  const legacyContext = await virtualBuzzers.initializeFirebaseContext({
    config: {
      apiKey: 'AIzaSyExampleKey',
      authDomain: 'example.firebaseapp.com',
      databaseURL: 'https://example-default-rtdb.firebaseio.com',
      projectId: 'example-project',
      appId: '1:example:web:example',
    },
    appCheckSiteKey: 'legacy-v3-site-key',
    appCheckProvider: 'recaptcha-v3',
    importer,
  });

  assert.equal(legacyContext.appCheck.options.provider.providerKind, 'v3');
  assert.deepEqual(calls.slice(0, 2), [
    ['initializeApp', 'berean-board-virtual-buzzers', 'example-project'],
    ['initializeAppCheck', 'berean-board-virtual-buzzers', 'v3', 'legacy-v3-site-key', true],
  ]);
});

test('virtual buzzer current clue metadata is normalized to the RTDB rule contract before writes', () => {
  assert.deepEqual(
    virtualBuzzers.normalizeCurrentClue({ categoryTitle: 'People and Sin', value: 100 }),
    { categoryTitle: 'People and Sin', value: 100 }
  );
  assert.equal(virtualBuzzers.normalizeCurrentClue({ categoryTitle: '', value: 100 }), null);
  assert.equal(virtualBuzzers.normalizeCurrentClue({ categoryTitle: 'People and Sin', value: 2000 }), null);
  assert.equal(virtualBuzzers.normalizeCurrentClue({ categoryTitle: 'People and Sin', value: 0 }), null);
  const longTitle = 'A'.repeat(90);
  assert.deepEqual(
    virtualBuzzers.normalizeCurrentClue({ categoryTitle: longTitle, value: 100 }),
    { categoryTitle: 'A'.repeat(80), value: 100 }
  );
});

test('host buzzer reset omits invalid current clue metadata instead of writing rule-rejected values', async () => {
  const writes = [];
  const context = {
    database: {},
    sdk: {
      database: {
        ref(_database, pathName) {
          return { pathName };
        },
        async runTransaction(reference, updater) {
          const nextValue = updater(2);
          return { committed: true, snapshot: { val: () => nextValue } };
        },
        async update(reference, value) {
          writes.push(['update', reference.pathName, value]);
        },
      },
    },
  };

  await virtualBuzzers.resetBuzzersForHost({
    context,
    sessionId: 'session123456',
    open: true,
    lockedOutPlayerIndexes: [1],
    currentClue: { categoryTitle: '', value: 100 },
  });

  assert.equal(Object.hasOwn(writes[0][2].buzz, 'currentClue'), false);
});

test('host buzzer resets use scoped writes so existing player claims are not revalidated as host data', async () => {
  const writes = [];
  const context = {
    database: {},
    sdk: {
      database: {
        ref(_database, pathName) {
          return { pathName };
        },
        async runTransaction(reference, updater) {
          writes.push(['transaction', reference.pathName]);
          const nextValue = updater(2);
          return { committed: true, snapshot: { val: () => nextValue } };
        },
        async update(reference, value) {
          writes.push(['update', reference.pathName, value]);
        },
      },
    },
  };

  const result = await virtualBuzzers.resetBuzzersForHost({
    context,
    sessionId: 'session123456',
    open: true,
    lockedOutPlayerIndexes: [1],
    currentClue: { categoryTitle: 'People and Sin', value: 100 },
  });

  assert.deepEqual(writes[0], ['transaction', 'sessions/session123456/buzzRound']);
  assert.equal(writes[1][0], 'update');
  assert.equal(writes[1][1], 'sessions/session123456');
  assert.deepEqual(writes[1][2], {
    status: 'open',
    buzz: {
      round: 3,
      open: true,
      first: null,
      lockedOutPlayerIndexes: { 1: true },
      currentClue: { categoryTitle: 'People and Sin', value: 100 },
    },
  });

  assert.equal(result.committed, true);
  assert.equal(result.snapshot.val().buzzRound, 3);
  assert.equal(result.snapshot.val().buzz.round, 3);
  assert.deepEqual(result.snapshot.val().buzz.currentClue, { categoryTitle: 'People and Sin', value: 100 });
});

test('host manual virtual selections write a host-sourced first buzz without touching player claims', async () => {
  const writes = [];
  const context = {
    uid: 'host-uid',
    database: {},
    sdk: {
      database: {
        ref(_database, pathName) {
          return { pathName };
        },
        async update(reference, value) {
          writes.push(['update', reference.pathName, value]);
        },
      },
    },
  };

  const result = await virtualBuzzers.selectFirstBuzzForHost({
    context,
    sessionId: 'session123456',
    playerIndex: 1,
    playerNames: ['Madison', 'Ted'],
    claim: { uid: 'ted-phone', playerName: 'Ted', buzzerNumber: 2 },
    round: 7,
    currentClue: { categoryTitle: 'About Jesus', value: 300 },
    nowMs: 24680,
  });

  assert.deepEqual(writes, [[
    'update',
    'sessions/session123456',
    {
      status: 'locked',
      'buzz/open': false,
      'buzz/lockRound': 7,
      'buzz/first': {
        uid: 'ted-phone',
        playerIndex: 1,
        playerName: 'Ted',
        buzzerNumber: 2,
        round: 7,
        buzzedAt: 24680,
        source: 'host',
      },
      'buzz/currentClue': { categoryTitle: 'About Jesus', value: 300 },
    },
  ]]);
  assert.equal(result.committed, true);
  assert.equal(result.snapshot.val().status, 'locked');
  assert.equal(result.snapshot.val().buzz.first.source, 'host');
  assert.equal(result.snapshot.val().buzz.lockRound, 7);
});

test('host buzzer disables are round-guarded so stale locks cannot close a reopened attempt', async () => {
  const writes = [];
  const context = {
    database: {},
    sdk: {
      database: {
        ref(_database, pathName) {
          return { pathName };
        },
        async get(reference) {
          writes.push(['get', reference.pathName]);
          return { val: () => ({
            round: 3,
            open: true,
            first: null,
            lockedOutPlayerIndexes: { 0: true },
          }) };
        },
        async update(reference, value) {
          writes.push(['update', reference.pathName, value]);
        },
      },
    },
  };

  const result = await virtualBuzzers.disableBuzzersForHost({
    context,
    sessionId: 'session123456',
    expectedRound: 2,
  });

  assert.equal(result.committed, false);
  assert.deepEqual(writes, [
    ['get', 'sessions/session123456/buzz'],
  ]);
});

test('host buzzer disables write a scoped lock when the expected round is current', async () => {
  const writes = [];
  const context = {
    database: {},
    sdk: {
      database: {
        ref(_database, pathName) {
          return { pathName };
        },
        async get(reference) {
          writes.push(['get', reference.pathName]);
          return { val: () => ({
            round: 2,
            open: true,
            first: { uid: 'ada-uid', playerIndex: 0, round: 2 },
            lockedOutPlayerIndexes: {},
          }) };
        },
        async update(reference, value) {
          writes.push(['update', reference.pathName, value]);
        },
      },
    },
  };

  const result = await virtualBuzzers.disableBuzzersForHost({
    context,
    sessionId: 'session123456',
    expectedRound: 2,
  });

  assert.equal(result.committed, true);
  assert.deepEqual(writes, [
    ['get', 'sessions/session123456/buzz'],
    ['update', 'sessions/session123456/buzz', { open: false, lockRound: 2 }],
  ]);
  assert.equal(result.snapshot.val().open, false);
  assert.equal(result.snapshot.val().round, 2);
  assert.equal(result.snapshot.val().lockRound, 2);
});

test('start over returns leaders to group setup before rebuilding a game', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  const resetHandlerMatch = js.match(/resetButton\?\.addEventListener\('click', \(\) => \{[\s\S]*?renderStatus\(setupStatus, 'Ready to build a new game\.', 'info'\);[\s\S]*?\n    \}\);/);

  assert.ok(resetHandlerMatch, 'expected Start Over click handler to be present');
  assert.match(resetHandlerMatch[0], /applySetupStepStage\('group'\)/);
  assert.match(resetHandlerMatch[0], /difficultySetupComplete = false/);
  assert.match(resetHandlerMatch[0], /selectedDifficultyLevel = ''/);
  assert.match(resetHandlerMatch[0], /updateDifficultySetupControls\(\)/);
  assert.doesNotMatch(resetHandlerMatch[0], /applySetupStepStage\('lesson'\)/);
});

test('keeps setup usable when browser local storage is unavailable', () => {
  const blockedWindow = {};
  Object.defineProperty(blockedWindow, 'localStorage', {
    get() {
      throw new Error('localStorage is blocked');
    },
  });

  assert.equal(game.safeGetBrowserStorageItem(blockedWindow, 'ntwReviewGameEndpoint'), '');
  assert.doesNotThrow(() => game.safeSetBrowserStorageItem(blockedWindow, 'ntwReviewGameEndpoint', 'https://example.test'));
  assert.equal(game.safeSetBrowserStorageItem(blockedWindow, 'ntwReviewGameEndpoint', 'https://example.test'), false);

  const values = new Map();
  const storageWindow = {
    localStorage: {
      getItem: (key) => values.get(key) || '',
      setItem: (key, value) => values.set(key, String(value)),
    },
  };
  assert.equal(game.safeSetBrowserStorageItem(storageWindow, 'ntwReviewGameEndpoint', 'https://example.test'), true);
  assert.equal(game.safeGetBrowserStorageItem(storageWindow, 'ntwReviewGameEndpoint'), 'https://example.test');
});

test('renders group setup wizard controls before lesson setup in the browser form', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');

  assert.match(html, /<section id="group-setup-step" class="group-setup-step setup-step setup-step--expanded" data-setup-step="group" aria-labelledby="group-setup-title">/);
  assert.match(html, /<button id="group-setup-toggle" class="setup-step-toggle" type="button" aria-expanded="true" aria-controls="group-setup-content">/);
  assert.match(html, /<div id="group-setup-content" class="setup-step-content">/);
  assert.match(html, /<textarea id="group-member-names"/);
  assert.match(html, /<button id="save-group-members-button" type="button"/);
  assert.match(html, /<div id="group-member-checklist"/);
  assert.match(html, /<button id="edit-group-members-button" type="button"/);
  assert.match(html, /<button id="clear-group-cookie-button" type="button"/);
  assert.match(html, /<section id="player-picker-panel"[^>]*hidden>/);
  assert.match(html, /<button id="randomize-players-button" type="button"/);
  assert.match(html, /<button id="confirm-players-button" type="button" class="primary-action"[^>]*>Continue to In-person or Remote<\/button>/);
  assert.match(html, /<section id="buzzer-setup-section" class="buzzer-setup-section setup-step setup-step--collapsed setup-step--locked" data-setup-step="buzzer" aria-labelledby="buzzer-setup-title">/);
  assert.match(html, /<button id="buzzer-setup-toggle" class="setup-step-toggle" type="button" aria-expanded="false" aria-controls="buzzer-setup-content" aria-disabled="true" disabled>/);
  assert.match(html, /<span id="buzzer-setup-title" class="setup-step-title">2\. In-person or Remote<\/span>/);
  assert.match(html, /<input type="radio" name="buzzer-mode" value="in-person" checked \/>[\s\S]*In-person[\s\S]*Physical buzzers[\s\S]*id="buzzer-modern-in-person-diverse-group"[\s\S]*id="buzzer-modern-in-person-brown-haired-boy"[\s\S]*id="buzzer-modern-in-person-center-blonde-girl-hair"[\s\S]*id="buzzer-modern-in-person-center-clear-face-hairline"[\s\S]*id="buzzer-modern-in-person-brown-haired-girl"[\s\S]*id="buzzer-modern-in-person-right-smooth-girl-hair"[\s\S]*id="buzzer-modern-in-person-physical-buzzer"/);
  assert.match(html, /buzzer-modern-in-person-skin-(?:deep|light|medium)/);
  assert.doesNotMatch(html, /M96 45c9 3 13 10 8 18/);
  assert.match(html, /<input type="radio" name="buzzer-mode" value="virtual" \/>[\s\S]*Virtual[\s\S]*Virtual buzzers[\s\S]*id="buzzer-modern-virtual-call"[\s\S]*id="buzzer-modern-virtual-display"[\s\S]*id="buzzer-modern-virtual-people-on-screen"[\s\S]*id="buzzer-modern-virtual-on-screen-buzzer"/);
  assert.doesNotMatch(html, /buzzer-storybook-|buzzer-modern-in-person-shared-buzzer|buzzer-modern-virtual-phone-buzzer|buzzer-modern-virtual-connection|buzzer-modern-virtual-link/);
  assert.match(html, /buzzer-modern-virtual-(?:top|bottom)-(?:left|right)-hair/);
  assert.match(html, /<div id="virtual-buzzer-host-panel" class="virtual-buzzer-host-panel" hidden>/);
  assert.match(html, /<div id="virtual-buzzer-qr" class="virtual-buzzer-qr" aria-label="Virtual buzzer QR code"><\/div>/);
  assert.match(html, /<button id="continue-to-lesson-setup-button" type="button" class="primary-action">Continue to Lesson Setup<\/button>/);
  assert.match(html, /<p id="buzzer-setup-status" class="game-status" aria-live="polite"><\/p>/);
  assert.match(html, /<section id="lesson-setup-section" class="lesson-setup-section setup-step setup-step--collapsed setup-step--locked" data-setup-step="lesson" aria-labelledby="lesson-setup-title">/);
  assert.match(html, /<button id="lesson-setup-toggle" class="setup-step-toggle" type="button" aria-expanded="false" aria-controls="lesson-setup-content" aria-disabled="true" disabled>/);
  assert.match(html, /<span id="lesson-setup-title" class="setup-step-title">3\. Add lesson files, topic, or instructions<\/span>/);
  assert.match(html, /<div id="lesson-setup-content" class="setup-step-content" hidden>/);
  assert.match(html, /Or type the lesson topic, summary, or focus instructions/);
  assert.match(html, /focus more attention on/);
  assert.match(html, /Use this field with uploaded files to steer emphasis or focus/);
  assert.doesNotMatch(html, /Use this field with uploaded files to steer emphasis, focus, or level of difficulty/);
  assert.match(html, /<button id="continue-to-difficulty-setup-button" type="button" class="primary-action" disabled>Continue to Difficulty Setup<\/button>/);
  assert.match(html, /<p id="lesson-setup-status" class="game-status" aria-live="polite"><\/p>/);
  assert.match(html, /<section id="difficulty-setup-section" class="difficulty-setup-section setup-step setup-step--collapsed setup-step--locked" data-setup-step="difficulty" aria-labelledby="difficulty-setup-title">/);
  assert.match(html, /<button id="difficulty-setup-toggle" class="setup-step-toggle" type="button" aria-expanded="false" aria-controls="difficulty-setup-content" aria-disabled="true" disabled>/);
  assert.match(html, /<span id="difficulty-setup-title" class="setup-step-title">4\. Choose the game difficulty<\/span>/);
  assert.match(html, /theological complexity of the questions and the readability of the wording/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="child" \/>[\s\S]*Little Lamb[\s\S]*<span class="difficulty-option__grade">Grade 1-2<\/span>[\s\S]*<span class="difficulty-option__art difficulty-option__art--portrait" aria-hidden="true">[\s\S]*viewBox="0 0 96 132"[\s\S]*id="difficulty-storybook-lamb-face"/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="preteen" \/>[\s\S]*Bible Explorer[\s\S]*<span class="difficulty-option__grade">Grade 4-5<\/span>[\s\S]*id="difficulty-storybook-explorer-compass"/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="teen" \/>[\s\S]*Disciple[\s\S]*<span class="difficulty-option__grade">Grade 6-8<\/span>[\s\S]*id="difficulty-storybook-disciple-growth-leaf"/);
  assert.doesNotMatch(html, /difficulty-storybook-disciple-(?:path|backpack|sky|hill)/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="adult" \/>[\s\S]*Berean[\s\S]*<span class="difficulty-option__grade">Grade 9-11<\/span>[\s\S]*id="difficulty-storybook-berean-lens"[\s\S]*id="difficulty-storybook-berean-lens-cross" d="M80 68v18M73 75h14"/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="theologian" \/>[\s\S]*Theologian[\s\S]*<span class="difficulty-option__grade">Grade 12-16\+<\/span>[\s\S]*id="difficulty-storybook-theologian-bible-cover"[\s\S]*M24 80c9-5 17-5 26 1v23[\s\S]*M50 81c8-5 17-5 25 1v23[\s\S]*id="difficulty-storybook-theologian-hand" d="M74 80c4-4 11-2 13 3/);
  assert.match(html, /<input type="radio" name="game-difficulty" value="theologian" \/>[\s\S]*M88 40v23[\s\S]*circle cx="88" cy="68"/);
  assert.doesNotMatch(html, /difficulty-storybook-theologian-scroll|M23 76h43c5 0 9 4 9 9v18|M94 42v35|circle cx="94" cy="83"|M34 100c7 6 20 7 31 2/);
  assert.doesNotMatch(html, /M33 30h9M37\.5 25\.5v9|M31 31h9M35\.5 26\.5v9|M74 76h12M80 70v12/);
  assert.equal((html.match(/class="difficulty-option__svg difficulty-option__svg--storybook"/g) || []).length, 5);
  assert.doesNotMatch(html, /difficulty-[a-z-]+-premium-|difficulty-child-panel|difficulty-explorer-panel|difficulty-disciple-panel|difficulty-berean-panel|difficulty-theologian-panel/);
  assert.doesNotMatch(html, /difficulty-storybook-(?:explorer|disciple|berean|theologian)-(?:face|wool)/);
  assert.doesNotMatch(html, /🐑|🧭|🕊️|📖|🎓/);
  assert.doesNotMatch(html, /Catechumen/);
  assert.doesNotMatch(html, /Target Flesch-Kincaid:/);
  assert.match(html, /<button id="continue-to-api-setup-button" type="button" class="primary-action" disabled>Continue to API Setup<\/button>/);
  assert.match(html, /<p id="difficulty-setup-status" class="game-status" aria-live="polite"><\/p>/);
  assert.doesNotMatch(html, /<div id="lesson-setup-content" class="setup-step-content" hidden>[\s\S]*<h2>5\. Connect to NTW’s API<\/h2>[\s\S]*<\/div>\s*<\/section>\s*<\/form>/);
  assert.match(html, /<section id="api-setup-section" class="api-setup-section setup-step setup-step--collapsed setup-step--locked" data-setup-step="api" aria-labelledby="api-setup-title">/);
  assert.match(html, /<button id="api-setup-toggle" class="setup-step-toggle" type="button" aria-expanded="false" aria-controls="api-setup-content" aria-disabled="true" disabled>/);
  assert.match(html, /<span id="api-setup-title" class="setup-step-title">5\. Connect to NTW’s API<\/span>/);
  assert.doesNotMatch(html, /<span id="api-setup-title" class="setup-step-title">4\. Connect to NTW’s API<\/span>/);
  assert.match(html, /<div id="api-setup-content" class="setup-step-content" hidden>/);
  assert.match(html, /<div class="api-grid">/);
  assert.match(html, /The API key is not saved by this page\. Lesson files and typed lesson descriptions\/instructions are processed locally first, then sent to the endpoint only when you press Generate Game Board\. NTW first checks whether the supplied material meaningfully connects with Scripture, theology, Christian life, worldview, ministry, or biblical studies; if it does not, no game board is generated\./);
  assert.match(html, /<button id="generate-game-button" type="submit" class="primary-action">Generate Game Board<\/button>/);
  assert.doesNotMatch(html, /Generate Review Game/);
  assert.match(html, /<p id="clue-verdict" class="clue-verdict"[^>]*hidden><\/p>/);
  assert.match(html, /<div id="active-clue-review" class="answer-box clue-review" hidden><\/div>/);
  assert.match(html, /<p class="eyebrow">Powered by Navigate The Way ✝️<\/p>/);
  assert.match(html, /<h1 class="berean-board-title"><img class="berean-board-title__icon" src="images\/berean-board\/berean_board_icon_v4\.svg" alt="" width="64" height="64" aria-hidden="true" \/><span>Berean Board<\/span><\/h1>/);
  assert.match(html, /<div class="virtual-buzzer-player-brand" aria-label="Berean Board">\s*<img class="virtual-buzzer-player-brand__icon" src="images\/berean-board\/berean_board_icon_v4\.svg" alt="" width="64" height="64" aria-hidden="true" \/>\s*<p class="virtual-buzzer-player-brand__name">Berean Board<\/p>\s*<\/div>/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'images', 'berean-board', 'berean_board_icon_v4.svg')));
  assert.match(html, /<p id="next-picker-note" class="next-picker-note" aria-live="polite">Host may choose the first question\.<\/p>/);
  assert.doesNotMatch(html, /Generated Game/);
  assert.doesNotMatch(html, /Export Game JSON|id="export-game-json"/);
  assert.doesNotMatch(html, /id="virtual-buzzer-game-panel"|id="virtual-buzzer-game-status"|id="virtual-buzzer-first"/);
  assert.match(html, /<button id="no-buzz-button" type="button">No one buzzed in<\/button>/);
  assert.match(html, /<button id="close-clue-button" type="button">Back to Board<\/button>/);
  assert.match(html, /<section id="winner-celebration-modal" class="winner-celebration-modal" role="dialog" aria-modal="true" aria-labelledby="winner-celebration-heading" tabindex="-1" hidden>/);
  assert.match(html, /<div class="winner-celebration-burst" aria-hidden="true">🎉<\/div>/);
  assert.doesNotMatch(html, /<div class="winner-celebration-burst" aria-hidden="true">✦<\/div>/);
  assert.match(html, /<p class="eyebrow">Game complete<\/p>/);
  assert.match(html, /<h2 id="winner-celebration-heading" class="winner-celebration-heading">Congratulations!<\/h2>/);
  assert.match(html, /<p id="winner-celebration-message" class="winner-celebration-message" aria-live="polite"><\/p>/);
  assert.match(html, /<p id="winner-celebration-score" class="winner-celebration-score"><\/p>/);
  assert.match(html, /<div class="winner-celebration-actions">\s*<button id="winner-celebration-back-button" type="button" class="primary-action winner-celebration-back-button">Back to Board<\/button>\s*<\/div>/);
  assert.doesNotMatch(html, /<button id="close-clue-button" type="button">Close<\/button>/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css\?v=20260701-difficulty-tile-scaling" \/>/);
  assert.doesNotMatch(html, /styles\.css\?v=20260626-next-picker-readability/);
  assert.match(html, /<script src="firebase-config\.js\?v=20260619-app-check"><\/script>/);
  assert.match(html, /<script src="virtual-buzzer-service\.js\?v=20260701-buzzer-round-guard"><\/script>/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260625-virtual-claim-guard/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260621-current-clue-contract/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260621-host-selected-buzz/);
  assert.doesNotMatch(html, /<script src="virtual-buzzer-service\.js\?v=20260620-virtual-buzzer-player-route"><\/script>/);
  assert.doesNotMatch(html, /<script src="virtual-buzzer-service\.js\?v=20260620-virtual-buzzer-rules-fix"><\/script>/);
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js"/);
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/1\.4\.4\/qrcode\.min\.js"/);
  assert.match(html, /<script src="berean-board\.js\?v=20260702-selective-grounding-repair"><\/script>/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-grounding-repair-flow/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-source-file-grounding-scope/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-nonnegotiable-grounding/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-grounded-answers/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-scope-accepted-status/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-scope-gate/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260702-player-phone-loudspeaker-audio/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260701-timed-clue-rereveal-fix/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260701-timed-clue-reveal/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260701-player-phone-buzzer-sound/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260701-back-to-board-after-buzz/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260701-buzzer-latency-audio/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260626-next-picker-readability/);
  assert.doesNotMatch(html, /styles\.css\?v=20260626-buzzer-icon-centering/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260625-two-to-four-picker/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260625-claim-error-status/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260625-virtual-claim-guard/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260625-host-override-tooltips/);
  assert.doesNotMatch(html, /styles\.css\?v=20260626-layout-refinement/);
  assert.doesNotMatch(html, /styles\.css\?v=20260625-readable-game-text/);
  assert.doesNotMatch(html, /styles\.css\?v=20260625-host-override-tooltips/);
  assert.doesNotMatch(html, /styles\.css\?v=20260625-fluid-clue-fit/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260625-fluid-clue-fit/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-berean-board-icon/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-winner-celebration-scale/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-winner-celebration-scale/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-followup-polish/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-winner-celebration-emoji/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-winner-celebration"/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-winner-celebration"/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-repeat-downgrade-state/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-full-credit-overrides/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-followup-polish/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-virtual-host-polish/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-override-tile-readability/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260620-remote-buzzer-lockout-array/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-bottom-override-icons/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-bottom-override-icons/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-override-label-space/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-override-label-space/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-icon-host-overrides/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-icon-host-overrides/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-verdict-overrides/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-buzz-in-copy/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-verdict-overrides/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-host-override-feedback/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-no-credit-cents/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-adaptive-scoring/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-host-override-feedback/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-host-overrides-fit/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-host-overrides-fit/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-host-overrides"/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-host-overrides"/);
  assert.doesNotMatch(html, /styles\.css\?v=20260620-virtual-buzzer-phone-fit/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-virtual-buzzer-phone-fit/);
  assert.doesNotMatch(html, /styles\.css\?v=20260619-completed-review/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-remote-buzzer-reopen/);
  assert.doesNotMatch(html, /styles\.css\?v=20260621-virtual-host-polish/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-epub-lessons/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-question-flow-ui/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260621-virtual-close-race/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260621-host-selected-lock-round/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260619-lesson-files/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260619-partial-awards/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260619-host-buzzer-audio/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260619-player-name-selection/);
  assert.doesNotMatch(html, /berean-board\.js\?v=20260620-file-drag-detection/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260619-app-check/);
  assert.doesNotMatch(html, /virtual-buzzer-service\.js\?v=20260620-remote-buzzer-reopen/);
});



test('documents developer-only Firebase setup and database rules for virtual buzzers', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'developer-docs', 'virtual-buzzers-firebase.md'), 'utf8');
  const rules = fs.readFileSync(path.join(__dirname, '..', 'docs', 'developer-docs', 'virtual-buzzers-rtdb-rules.json'), 'utf8');

  assert.match(guide, /Virtual Buzzers with Firebase/);
  assert.match(guide, /small group leaders do not create rooms/i);
  assert.match(guide, /Anonymous Authentication/);
  assert.match(guide, /Realtime Database/);
  assert.match(guide, /App Check/);
  assert.match(guide, /reCAPTCHA Enterprise/);
  assert.match(guide, /Do not commit reCAPTCHA Enterprise secret keys/);
  assert.match(guide, /Firebase config is public project identification/i);
  assert.match(rules, /"\.read": false/);
  assert.match(rules, /auth\.uid === data\.parent\(\)\.child\('hostUid'\)\.val\(\)/);
  assert.match(rules, /newData\.child\('uid'\)\.val\(\) === auth\.uid/);
  assert.match(rules, /newData\.child\('round'\)\.val\(\) === data\.parent\(\)\.child\('round'\)\.val\(\)/);
  assert.doesNotMatch(rules, /newData\.child\('round'\)\.val\(\) === data\.parent\(\)\.parent\(\)\.child\('buzzRound'\)\.val\(\)/);
  const parsedRules = JSON.parse(rules).rules.sessions.$sessionId;
  assert.equal(Object.hasOwn(parsedRules.playerNames, '$playerIndex'), false);
  assert.equal(Object.hasOwn(parsedRules.playerClaims, '$playerIndex'), false);
  assert.equal(Object.hasOwn(parsedRules.buzz.lockedOutPlayerIndexes, '$playerIndex'), false);
  assert.equal(typeof parsedRules.buzz.currentClue.categoryTitle['.validate'], 'string');
  assert.equal(typeof parsedRules.buzz.currentClue.value['.validate'], 'string');
  assert.match(parsedRules.buzz.first['.write'], /source'\)\.val\(\) === 'host'/);
  assert.equal(typeof parsedRules.buzz.first.source['.validate'], 'string');
  assert.match(parsedRules.buzz.first.source['.validate'], /host|player/);
  assert.match(parsedRules.buzz.round['.validate'], /newData\.parent\(\)\.parent\(\)\.child\('buzzRound'\)\.val\(\)/);
  assert.match(parsedRules.buzz.open['.validate'], /child\('lockRound'\)\.isNumber\(\)/);
  assert.match(parsedRules.buzz.open['.validate'], /child\('status'\)\.val\(\) === 'closed'/);
  assert.match(parsedRules.buzz.lockRound['.validate'], /newData\.parent\(\)\.child\('round'\)\.val\(\)/);
  ['0', '1', '2', '3'].forEach((playerIndex) => {
    assert.equal(typeof parsedRules.playerNames[playerIndex]['.validate'], 'string');
    assert.match(parsedRules.playerClaims[playerIndex]['.write'], /child\('status'\)\.val\(\) !== 'closed'/);
    assert.equal(parsedRules.playerClaims[playerIndex].$other['.validate'], false);
    assert.equal(typeof parsedRules.buzz.lockedOutPlayerIndexes[playerIndex]['.validate'], 'string');
  });
  assert.equal(parsedRules.playerClaims.$other['.validate'], false);
  assert.match(parsedRules.buzz.first['.write'], /child\('status'\)\.val\(\) !== 'closed'/);
  assert.equal(parsedRules.buzz.first.$other['.validate'], false);
});

test('wires virtual buzzers into host/player UI and scoped session actions', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'docs', 'virtual-buzzer-service.js'), 'utf8');

  assert.match(html, /<section id="virtual-buzzer-player-screen" class="virtual-buzzer-player-screen" hidden>/);
  assert.match(html, /<button id="virtual-buzzer-button" type="button" class="virtual-buzzer-button" disabled>BUZZ<\/button>/);
  assert.doesNotMatch(html, /<section id="virtual-buzzer-game-panel"/);
  assert.doesNotMatch(html, /<p id="virtual-buzzer-first"/);
  assert.match(js, /const virtualBuzzerService = ROOT\.NTWVirtualBuzzerService/);
  assert.match(js, /function initializeVirtualBuzzerPlayerScreen/);
  assert.match(js, /function createVirtualBuzzerHostSession/);
  assert.match(js, /function openVirtualBuzzersForActiveClue/);
  assert.match(js, /function handleVirtualFirstBuzz/);
  assert.match(js, /function handleHostSelectedVirtualContestant/);
  assert.match(js, /selectFirstBuzzForHost/);
  assert.match(js, /function resetVirtualBuzzersForNextAttempt/);
  assert.match(js, /function closeVirtualSession/);
  assert.match(js, /let virtualBuzzerOpenRequestId = 0;/);
  assert.match(js, /function isCurrentVirtualBuzzerOpenRequest/);
  assert.match(js, /const requestId = \+\+virtualBuzzerOpenRequestId;[\s\S]*await resetVirtualBuzzersForNextAttempt\(\{ clue, requestId \}\);/);
  assert.match(js, /const currentCluePayload = getCurrentClueVirtualBuzzerPayload\(clue\);/);
  assert.match(js, /currentClue:\s*currentCluePayload/);
  assert.match(js, /catch \(primaryError\) \{[\s\S]*if \(currentCluePayload\) \{[\s\S]*currentClue:\s*null/);
  assert.match(js, /await disableVirtualBuzzersForHost\(staleRound, sessionId, context\);/);
  assert.match(js, /function closeActiveClue\(\) \{[\s\S]*virtualBuzzerOpenRequestId \+= 1;[\s\S]*void disableVirtualBuzzersForHost\(\);/);
  assert.match(js, /cluePanel\.hidden = false;[\s\S]*await runActiveClueQuestionReveal\(\);[\s\S]*if \(isVirtualBuzzerMode\(\) && openVirtualBuzzersAfterReveal\) \{[\s\S]*await openVirtualBuzzersForActiveClue\(\);/);
  assert.match(js, /renderPlayerPhoneSession\(\);/);
  assert.match(js, /if \(isVirtualBuzzerPlayerRoute\(window\.location\)\)/);
  assert.match(js, /document\.body\?\.classList\.add\('virtual-buzzer-player-route'\)/);
  assert.match(js, /document\.body\?\.classList\.toggle\('virtual-buzzer-player-route--claimed', hasClaim\)/);
  assert.match(js, /virtualBuzzerNameOptions\) virtualBuzzerNameOptions\.hidden = hasClaim/);
  assert.match(js, /virtualBuzzerClaimButton\) virtualBuzzerClaimButton\.hidden = hasClaim/);
  assert.match(js, /virtualBuzzerClaimButton\.disabled = sessionClosed \|\| hasClaim \|\| virtualBuzzerClaimInFlight/);
  assert.match(js, /virtualBuzzerClaimedPanel\) virtualBuzzerClaimedPanel\.hidden = !hasClaim/);
  assert.match(js, /virtualBuzzerPlayerClaim = session\.claims\?\.find\(\(claim\) => claim\?\.uid === virtualBuzzerPlayerContext\?\.uid\) \|\| null/);
  assert.match(js, /let virtualBuzzerClaimInFlight = false;/);
  const claimHandlerStart = js.indexOf("virtualBuzzerClaimButton?.addEventListener('click'");
  const claimHandlerEnd = js.indexOf("virtualBuzzerButton?.addEventListener('click'", claimHandlerStart);
  const claimHandler = js.slice(claimHandlerStart, claimHandlerEnd);
  assert.match(claimHandler, /if \(virtualBuzzerClaimInFlight\) return;/);
  assert.match(claimHandler, /virtualBuzzerClaimInFlight = true;[\s\S]*Connecting your buzzer/);
  assert.match(claimHandler, /virtualBuzzerClaimButton\.disabled = true/);
  assert.match(claimHandler, /let claimStatusMessage = '';/);
  assert.match(claimHandler, /let claimStatusType = 'info';/);
  assert.ok(
    claimHandler.indexOf('if (result.claim)') < claimHandler.indexOf('if (!result.committed)'),
    'recovered same-phone claims should be accepted before reporting a failed claim transaction'
  );
  const failedClaimMessageIndex = claimHandler.indexOf("claimStatusMessage = 'That name was just claimed by another device. Choose another available name.'");
  assert.ok(failedClaimMessageIndex > 0, 'failed claim transactions should store the specific error message');
  assert.ok(
    failedClaimMessageIndex < claimHandler.indexOf('return;', failedClaimMessageIndex),
    'failed claim transactions should store the specific error message before returning'
  );
  assert.ok(
    claimHandler.indexOf('renderPlayerPhoneSession();') < claimHandler.indexOf('if (claimStatusMessage) renderStatus(virtualBuzzerPlayerStatus, claimStatusMessage, claimStatusType);'),
    'failed claim errors should be restored after renderPlayerPhoneSession rewrites the header status'
  );
  assert.match(claimHandler, /finally \{[\s\S]*virtualBuzzerClaimInFlight = false;[\s\S]*renderPlayerPhoneSession\(\);[\s\S]*if \(claimStatusMessage\) renderStatus\(virtualBuzzerPlayerStatus, claimStatusMessage, claimStatusType\);[\s\S]*\}/);
  assert.match(js, /function shouldResetVirtualBuzzersForPlayerSelectionChange/);
  assert.match(js, /void closeVirtualSession\(\);/);
  assert.match(js, /Players changed, so virtual buzzers were reset/);
  assert.match(service, /const FIREBASE_SDK_ORIGIN = \['https:', '', 'www\.gstatic\.com'\]\.join\('\/'\);/);
  assert.match(service, /const FIREBASE_SIGNIN_SCRIPT = \[SDK_BASE, 'firebase-auth\.js'\]\.join\('\/'\);/);
  assert.match(service, /function waitForInitialAuthUser/);
  assert.match(service, /auth\?\.authStateReady/);
  const playerInitializerStart = js.indexOf('async function initializeVirtualBuzzerPlayerScreen');
  const playerInitializerEnd = js.indexOf('try {', playerInitializerStart);
  const playerInitializerSetup = js.slice(playerInitializerStart, playerInitializerEnd);
  assert.ok(
    playerInitializerSetup.indexOf('if (setupForm) setupForm.hidden = true;') < playerInitializerSetup.indexOf('if (!virtualBuzzerService)'),
    'player-route setup form must be hidden before reporting a missing virtual buzzer service'
  );
  assert.ok(
    playerInitializerSetup.indexOf('if (virtualBuzzerPlayerScreen) virtualBuzzerPlayerScreen.hidden = false;') < playerInitializerSetup.indexOf('if (!virtualBuzzerService)'),
    'player-route error status must be visible even when the buzzer service fails to load'
  );
  assert.match(playerInitializerSetup, /if \(!virtualBuzzerService\) \{\s+void playerWakeLock\.release\(\);/);
  assert.match(js, /catch \(error\) \{\s+void playerWakeLock\.release\(\);\s+renderStatus\(virtualBuzzerPlayerStatus/);
  assert.ok(
    js.indexOf("virtualBuzzerClaimButton?.addEventListener('click'") < js.indexOf('if (isVirtualBuzzerPlayerRoute(window.location))'),
    'player claim listener must be wired before the player-route early return'
  );
  assert.ok(
    js.indexOf("virtualBuzzerButton?.addEventListener('click'") < js.indexOf('if (isVirtualBuzzerPlayerRoute(window.location))'),
    'player buzz listener must be wired before the player-route early return'
  );
  assert.match(service, /runTransaction\(firstBuzzRef/);
  assert.match(service, /runTransaction\(claimRef/);
  assert.match(service, /runTransaction\(buzzRoundRef/);
  assert.doesNotMatch(service, /runTransaction\(sessionRef/);

  assert.match(service, /sessions\/\$\{sessionId\}\/playerClaims/);
  assert.match(service, /sessions\/\$\{sessionId\}\/buzz/);
});

test('styles setup steps as expandable/collapsible panels', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.match(cssRule(css, '.setup-step'), /border:\s*1px solid rgba\(122, 168, 255, 0\.24\)/);
  assert.match(cssRule(css, '.setup-step-toggle'), /justify-content:\s*space-between/);
  assert.match(cssRule(css, '.setup-step--collapsed'), /opacity:\s*0\.82/);
  assert.match(cssRule(css, '.setup-step--locked'), /opacity:\s*0\.58/);
  assert.match(cssRule(css, '.setup-step-toggle:disabled'), /cursor:\s*not-allowed/);
  assert.match(cssRule(css, '.setup-step-status'), /text-transform:\s*uppercase/);
  assert.match(cssRule(css, '.setup-step-status'), /font-size:\s*var\(--berean-board-readable-small\)/);
  assert.match(cssRule(css, '.buzzer-mode-options'), /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 360px\), 1fr\)\)/);
  assert.match(cssRule(css, '.game-play-header'), /flex-wrap:\s*nowrap/i);
  assert.match(cssRule(css, '.game-actions'), /align-items:\s*center/i);
  assert.match(cssRule(css, '.game-actions'), /justify-content:\s*flex-end/i);
  assert.match(cssRule(css, '.game-actions'), /gap:\s*0\.8rem/i);
  assert.match(cssRule(css, '.game-actions'), /flex-wrap:\s*nowrap/i);
  assert.match(cssRule(css, '.game-actions'), /min-width:\s*0/i);
  assert.match(cssRule(css, '.next-picker-note'), /max-width:\s*min\(48vw, 42rem\)/);
  assert.match(cssRule(css, '.next-picker-note'), /text-align:\s*right/);
  assert.match(cssRule(css, '.next-picker-note'), /font-weight:\s*800/);
  assert.match(cssRule(css, '.next-picker-note'), /align-self:\s*center/i);
  assert.match(cssRule(css, '.next-picker-note'), /margin-inline-end:\s*0\.1rem/i);
  assert.match(cssRule(css, '.next-picker-note'), /white-space:\s*nowrap/i);
  assert.match(cssRule(css, '.next-picker-note'), /font-size:\s*calc\(clamp\(1\.1rem, 0\.45rem \+ 0\.78vw, 1\.28rem\) \* var\(--next-picker-note-scale, 1\)\)/i);
  assert.match(cssRule(css, '.next-picker-note'), /line-height:\s*1\.2/);
  assert.match(cssRule(css, '.review-game-play .next-picker-note'), /max-inline-size:\s*min\(48vw, 42rem\)/);
  assert.match(cssRule(css, '.review-game-play .next-picker-note'), /line-height:\s*1\.2/);
  assert.match(cssRule(css, '.winner-celebration-modal'), /position:\s*fixed/i);
  assert.match(cssRule(css, '.winner-celebration-modal'), /z-index:\s*1100/i);
  assert.match(cssRule(css, '.winner-celebration-modal'), /overflow:\s*hidden/i);
  assert.doesNotMatch(cssRule(css, '.winner-celebration-modal'), /overflow-y:\s*(auto|scroll)/i);
  assert.match(cssRule(css, '.winner-celebration-card'), /width:\s*min\(760px, 100%\)/i);
  assert.match(cssRule(css, '.winner-celebration-card'), /text-align:\s*center/i);
  assert.match(cssRule(css, '.winner-celebration-card'), /border:\s*1px solid rgba\(255, 206, 72, 0\.62\)/i);
  assert.match(cssRule(css, '.winner-celebration-card'), /transform:\s*scale\(var\(--winner-celebration-scale,\s*1\)\)/i);
  assert.match(cssRule(css, '.winner-celebration-card'), /transform-origin:\s*center/i);
  assert.doesNotMatch(cssRule(css, '.winner-celebration-card'), /overflow-y:\s*(auto|scroll)/i);
  assert.match(cssRule(css, '.winner-celebration-burst'), /width:\s*clamp\(4rem, 12vw, 6rem\)/i);
  assert.match(cssRule(css, '.winner-celebration-burst'), /height:\s*clamp\(4rem, 12vw, 6rem\)/i);
  assert.match(cssRule(css, '.winner-celebration-burst'), /font-size:\s*clamp\(4rem, 12vw, 6rem\)/i);
  assert.match(cssRule(css, '.winner-celebration-burst'), /line-height:\s*1/i);
  assert.doesNotMatch(cssRule(css, '.winner-celebration-burst'), /radial-gradient\(circle, #fff6d2/i);
  assert.match(cssRule(css, '.winner-celebration-heading'), /font-size:\s*clamp\(2rem, 6vw, 4rem\)/i);
  assert.match(cssRule(css, '.winner-celebration-actions'), /justify-content:\s*center/i);
  assert.match(cssRule(css, '.winner-celebration-back-button'), /min-width:\s*min\(18rem, 100%\)/i);
  assert.match(js, /function gameHasAllCluesCompleted\(game\)/);
  assert.match(js, /function buildWinnerCelebrationPresentation\(\{ game, contestants \} = \{\}\)/);
  assert.match(js, /function calculateWinnerCelebrationScale\(\{ availableWidth, availableHeight, cardWidth, cardHeight \} = \{\}\)/);
  assert.match(js, /function resetWinnerCelebrationFit\(\)/);
  assert.match(js, /function fitWinnerCelebrationCard\(\)/);
  assert.match(js, /function scheduleWinnerCelebrationFit\(\)/);
  assert.match(js, /function maybeShowWinnerCelebrationWhenGameComplete\(\)/);
  assert.match(js, /winnerCelebrationBackButton\?\.addEventListener\('click', \(\) => \{[\s\S]*closeWinnerCelebrationModal\(\);[\s\S]*closeActiveClue\(\);/);
  assert.match(js, /replaceActiveClue\(updatedClue\)[\s\S]*maybeShowWinnerCelebrationWhenGameComplete\(\);/);
  assert.match(js, /window\.addEventListener\('resize', \(\) => \{[\s\S]*scheduleActiveClueFit\(\);[\s\S]*scheduleWinnerCelebrationFit\(\);[\s\S]*\}\);/);
  assert.match(js, /winnerCelebrationShownForGame = false;/);
  assert.match(js, /function getNextPickerNoteScale\(note\)/);
  assert.match(js, /function applyNextPickerNote\(note\)/);
  assert.match(js, /nextPickerNote\.style\.setProperty\('--next-picker-note-scale'/);
  assert.doesNotMatch(css, /\.virtual-buzzer-game-panel\b/);
  assert.doesNotMatch(css, /\.virtual-buzzer-first\b/);
  assert.match(cssRule(css, '.virtual-buzzer-button'), /min-height:\s*12rem/);
  assert.match(css, /html:has\(body\.virtual-buzzer-player-route\)\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\.virtual-buzzer-player-route header,[\s\S]*body\.virtual-buzzer-player-route footer,[\s\S]*body\.virtual-buzzer-player-route \.page-header,[\s\S]*body\.virtual-buzzer-player-route \.review-game-intro,[\s\S]*display:\s*none !important;/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route'), /height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route main'), /height:\s*100vh;\s*height:\s*100dvh/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route main'), /height:\s*100dvh/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .berean-board-page'), /overflow:\s*hidden/);
  assert.match(cssRule(css, '.berean-board-title'), /display:\s*flex/);
  assert.match(cssRule(css, '.berean-board-title__icon'), /width:\s*clamp\(2\.65rem, 6vw, 4\.35rem\)/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-screen'), /grid-template-rows:\s*auto auto auto minmax\(0, 1fr\) auto auto/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-screen'), /gap:\s*clamp\(0\.34rem, 1dvh, 0\.62rem\)/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-brand'), /display:\s*grid/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-brand__icon'), /width:\s*clamp\(2\.65rem, 14vw, 4\.4rem\)/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-brand__name'), /font-size:\s*clamp\(1\.45rem, 7vw, 2\.55rem\)/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-player-screen h2'), /font-size:\s*clamp\(1\.18rem, 5\.35vw, 2\.05rem\)/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-name-options span'), /overflow-wrap:\s*anywhere/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-button'), /height:\s*100%/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-button'), /min-height:\s*0/);
  assert.match(cssRule(css, 'body.virtual-buzzer-player-route .virtual-buzzer-button'), /font-size:\s*clamp\(2\.85rem, 16vw, 6\.25rem\)/);
  assert.match(css, /--berean-board-tile-kicker:\s*clamp\(1rem, 0\.82rem \+ 0\.62vw, 1\.17rem\)/);
  assert.match(css, /--berean-board-tile-name:\s*clamp\(1\.14rem, 0\.9rem \+ 0\.9vw, 1\.46rem\)/);
  assert.match(cssRule(css, '.difficulty-options'), /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 250px\), 1fr\)\)/);
  assert.match(cssRule(css, '.buzzer-mode-option.difficulty-option'), /grid-template-columns:\s*auto fit-content\(17rem\) minmax\(6rem, 1fr\)/);
  assert.match(cssRule(css, '.buzzer-mode-option .difficulty-option__art'), /transform:\s*translateX\(-0\.3rem\)/);
  assert.match(cssRule(css, '.difficulty-option'), /container-type:\s*inline-size/);
  assert.match(cssRule(css, '.difficulty-option'), /--difficulty-option-tile-kicker:\s*var\(--berean-board-tile-kicker\)/);
  assert.match(cssRule(css, '.difficulty-option'), /grid-template-columns:\s*auto fit-content\(11rem\) minmax\(4\.05rem, 1fr\)/);
  assert.match(cssRule(css, '.difficulty-option'), /padding:\s*0\.9rem 0\.75rem 0\.9rem 0\.9rem/);
  assert.match(cssRule(css, '.difficulty-option'), /text-align:\s*left/);
  assert.match(css, /@supports \(width: 1cqi\)[\s\S]*--difficulty-option-tile-kicker:\s*clamp\(1rem, 5\.2cqi, var\(--berean-board-tile-kicker\)\)/);
  assert.match(css, /@supports \(width: 1cqi\)[\s\S]*--difficulty-option-tile-name:\s*clamp\(1\.14rem, 6\.4cqi, var\(--berean-board-tile-name\)\)/);
  assert.match(css, /@supports \(width: 1cqi\)[\s\S]*--difficulty-option-art-size:\s*clamp\(4\.05rem, 24cqi, 5\.4rem\)/);
  assert.match(cssRule(css, '.difficulty-option__art'), /grid-column:\s*3/);
  assert.match(cssRule(css, '.difficulty-option__art'), /justify-self:\s*center/);
  assert.match(cssRule(css, '.difficulty-option__art'), /width:\s*min\(var\(--difficulty-option-art-size\), 100%\)/);
  assert.match(cssRule(css, '.difficulty-option__art'), /aspect-ratio:\s*1/);
  assert.match(cssRule(css, '.difficulty-option__art--portrait'), /width:\s*min\(var\(--difficulty-option-art-portrait-size\), 100%\)/);
  assert.match(cssRule(css, '.difficulty-option__art--portrait'), /aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(cssRule(css, '.difficulty-option__svg'), /width:\s*100%/);
  assert.match(cssRule(css, '.difficulty-option__svg--storybook'), /overflow:\s*visible/);
  assert.match(css, /\.difficulty-option__level\s*\{[\s\S]*font-size:\s*var\(--difficulty-option-tile-kicker\)/);
  assert.match(css, /\.difficulty-option__level\s*\{[\s\S]*?overflow-wrap:\s*break-word/);
  assert.match(css, /\.difficulty-option__name\s*\{[\s\S]*font-size:\s*var\(--difficulty-option-tile-name\)/);
  assert.match(css, /\.difficulty-option__name\s*\{[\s\S]*?overflow-wrap:\s*break-word/);
  assert.match(cssRule(css, '.difficulty-option__grade'), /font-weight:\s*650/);
  assert.match(cssRule(css, '.difficulty-option__grade'), /font-size:\s*var\(--difficulty-option-tile-meta\)/);
  assert.match(cssRule(css, '.difficulty-option__grade'), /white-space:\s*normal/);
  assert.match(cssRule(css, '.difficulty-option__grade'), /overflow-wrap:\s*break-word/);
  assert.match(cssRule(css, '.game-board__category'), /font-size:\s*var\(--berean-board-category-title\)/);
  assert.match(cssRule(css, '.game-board__category'), /min-height:\s*clamp\(3\.45rem, 8\.5vh, 5\.15rem\)/);
  assert.match(cssRule(css, '.eyebrow'), /font-size:\s*var\(--berean-board-readable-small\)/);
  assert.match(cssRule(css, '.winner-celebration-score span'), /font-size:\s*var\(--berean-board-readable-small\)/);
  assert.doesNotMatch(css, /font-size:\s*(?:0\.7|0\.72|0\.74|0\.75|0\.76|0\.78|0\.82)rem/);
  assert.doesNotMatch(css, /font-size:\s*clamp\((?:0\.68|0\.72)rem,/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*grid-template-columns:\s*auto fit-content\(10\.25rem\) minmax\(3\.75rem, 1fr\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.difficulty-option__name,\s*\.difficulty-option__grade\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*break-word;/);
  assert.match(css, /@media \(max-width: 300px\)[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) minmax\(3\.45rem, 0\.34fr\)/);
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

test('keeps Back to Board enabled after a buzz until an answer has been submitted', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  assert.equal(game.canCloseActiveClue({ activeClue: clue, responseCheckInFlight: false }), true);
  assert.deepEqual(game.getActiveClueNavigationControlState({
    activeClue: clue,
    responseCheckInFlight: false,
    hasSelectedContestant: false,
  }), { closeClueButtonDisabled: false });
  assert.equal(game.canCloseActiveClue({
    activeClue: clue,
    responseCheckInFlight: false,
    hasSelectedContestant: true,
  }), true);
  assert.deepEqual(game.getActiveClueNavigationControlState({
    activeClue: clue,
    responseCheckInFlight: false,
    hasSelectedContestant: true,
  }), { closeClueButtonDisabled: false });

  const firstPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  assert.equal(firstPartial.clue.completed, false);
  assert.equal(game.canCloseActiveClue({
    activeClue: firstPartial.clue,
    responseCheckInFlight: false,
  }), false);
  assert.deepEqual(game.getActiveClueNavigationControlState({
    activeClue: firstPartial.clue,
    responseCheckInFlight: false,
  }), { closeClueButtonDisabled: true });

  const firstMiss = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });

  assert.equal(firstMiss.clue.completed, false);
  assert.equal(game.canCloseActiveClue({ activeClue: firstMiss.clue, responseCheckInFlight: false }), false);
  assert.deepEqual(game.getActiveClueNavigationControlState({
    activeClue: firstMiss.clue,
    responseCheckInFlight: false,
  }), { closeClueButtonDisabled: true });

  const allMissed = game.applyAnswerJudgment({
    contestants: firstMiss.contestants,
    clue: firstMiss.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });
  assert.equal(allMissed.clue.completed, true);
  assert.equal(game.canCloseActiveClue({ activeClue: allMissed.clue, responseCheckInFlight: false }), true);
  assert.deepEqual(game.getActiveClueNavigationControlState({
    activeClue: allMissed.clue,
    responseCheckInFlight: false,
  }), { closeClueButtonDisabled: false });

  const correct = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });
  assert.equal(game.canCloseActiveClue({ activeClue: correct.clue, responseCheckInFlight: false }), true);

  const noBuzz = game.applyNoBuzzForClue({ contestants, clue });
  assert.equal(game.canCloseActiveClue({ activeClue: noBuzz.clue, responseCheckInFlight: false }), true);
  assert.equal(game.canCloseActiveClue({ activeClue: noBuzz.clue, responseCheckInFlight: true }), false);
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

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
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  game.clearContestantChoiceSelection(inputs);

  assert.deepEqual(inputs.map((input) => input.checked), [false, false, false]);
  assert.match(js, /function closeActiveClue\(\) \{[\s\S]*clearContestantChoiceSelection/);
  assert.match(js, /function openClue\(clueId, \{ skipQuestionReveal = false, openVirtualBuzzersAfterReveal = true \} = \{\}\) \{[\s\S]*clearContestantChoiceSelection[\s\S]*renderContestantChoices\(\)/);
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

test('classifies completed board clue markers by answer outcome', () => {
  const openClue = { value: 100, completed: false };
  assert.deepEqual(game.getClueBoardDisplayState({ clue: openClue, value: 100 }), {
    text: '$100',
    className: 'game-board__clue',
    disabled: false,
    ariaLabel: '$100 clue',
  });

  assert.deepEqual(game.getClueBoardDisplayState({
    clue: { ...openClue, completed: true, winningContestantId: 'contestant-2' },
    value: 100,
  }), {
    text: '✓',
    className: 'game-board__clue is-complete is-correct',
    disabled: false,
    ariaLabel: '$100 clue answered correctly. Review result',
  });

  assert.deepEqual(game.getClueBoardDisplayState({
    clue: {
      ...openClue,
      completed: true,
      allContestantsMissed: true,
      attemptedContestantIds: ['contestant-1', 'contestant-2'],
      partialCreditAwarded: 20,
      partialCreditContestantIds: ['contestant-1'],
    },
    value: 100,
  }), {
    text: '⚠',
    className: 'game-board__clue is-complete is-partial',
    disabled: false,
    ariaLabel: '$100 clue partially answered. Review result',
  });

  assert.deepEqual(game.getClueBoardDisplayState({
    clue: {
      ...openClue,
      completed: true,
      allContestantsMissed: true,
      attemptedContestantIds: ['contestant-1', 'contestant-2'],
    },
    value: 100,
  }), {
    text: '✕',
    className: 'game-board__clue is-complete is-incorrect',
    disabled: false,
    ariaLabel: '$100 clue missed or unanswered. Review result',
  });

  assert.deepEqual(game.getClueBoardDisplayState({
    clue: {
      ...openClue,
      completed: true,
      allContestantsMissed: true,
      noContestantsBuzzed: true,
    },
    value: 100,
  }), {
    text: '✕',
    className: 'game-board__clue is-complete is-incorrect',
    disabled: false,
    ariaLabel: '$100 clue missed or unanswered. Review result',
  });
});

test('builds completed clue review summaries for credit and no-credit outcomes', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const firstPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const correct = game.applyAnswerJudgment({
    contestants: firstPartial.contestants,
    clue: firstPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'correct' },
  });

  const correctReview = game.buildCompletedClueReviewPresentation({
    clue: correct.clue,
    contestants: correct.contestants,
  });
  assert.equal(correctReview.label, 'Correct');
  assert.equal(correctReview.className, 'clue-verdict clue-verdict--correct');
  assert.match(correctReview.message, /Correct answer accepted/i);
  assert.match(correctReview.creditSummary, /Boaz received \$80 for the accepted answer\./);
  assert.match(correctReview.creditSummary, /Ada received \$20 partial credit\./);
  assert.doesNotMatch(correctReview.creditSummary, /No credit was awarded/);

  const partialOnlyContestants = game.createContestants(['Ada', 'Boaz']);
  const partialOnlyClue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const partialOnlyFirst = game.applyAnswerJudgment({
    contestants: partialOnlyContestants,
    clue: partialOnlyClue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const partialOnlyComplete = game.applyAnswerJudgment({
    contestants: partialOnlyFirst.contestants,
    clue: partialOnlyFirst.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });
  const partialOnlyReview = game.buildCompletedClueReviewPresentation({
    clue: partialOnlyComplete.clue,
    contestants: partialOnlyComplete.contestants,
  });
  assert.equal(partialOnlyReview.label, 'Partial Credit');
  assert.equal(partialOnlyReview.className, 'clue-verdict clue-verdict--partial');
  assert.match(partialOnlyReview.message, /Partial credit only/i);
  assert.match(partialOnlyReview.creditSummary, /Ada received \$33\.33 partial credit\./);
  assert.match(partialOnlyReview.creditSummary, /No contestant supplied the full expected answer\./);
  assert.match(partialOnlyReview.creditSummary, /Boaz attempted without receiving credit\./);

  const noBuzz = game.applyNoBuzzForClue({ contestants, clue });
  const noBuzzReview = game.buildCompletedClueReviewPresentation({
    clue: noBuzz.clue,
    contestants: noBuzz.contestants,
  });
  assert.equal(noBuzzReview.label, 'No Credit');
  assert.equal(noBuzzReview.className, 'clue-verdict clue-verdict--incorrect');
  assert.match(noBuzzReview.message, /No credit awarded/i);
  assert.match(noBuzzReview.creditSummary, /No one buzzed in\. No credit was awarded\./);
});

test('builds end-game winner celebration presentation after every clue is complete', () => {
  const normalizedGame = game.normalizeGeneratedGame(sampleGeneratedGame());
  normalizedGame.categories.forEach((category) => {
    category.clues.forEach((clue) => {
      clue.completed = true;
    });
  });
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  contestants[0].score = 900;
  contestants[1].score = 500;
  contestants[2].score = -100;

  assert.equal(game.gameHasAllCluesCompleted(normalizedGame), true);
  assert.equal(game.gameHasAllCluesCompleted({
    ...normalizedGame,
    categories: normalizedGame.categories.map((category, categoryIndex) => ({
      ...category,
      clues: category.clues.map((clue, clueIndex) => (
        categoryIndex === 0 && clueIndex === 0 ? { ...clue, completed: false } : clue
      )),
    })),
  }), false);

  assert.deepEqual(game.buildWinnerCelebrationPresentation({
    game: normalizedGame,
    contestants,
  }), {
    isComplete: true,
    isTie: false,
    heading: 'Congratulations, Ada!',
    message: 'Ada wins Berean Board with $900.',
    scoreLabel: 'Winning score',
    scoreText: '$900',
    winnerNames: ['Ada'],
    winnerScore: 900,
  });

  contestants[1].score = 900;
  assert.deepEqual(game.buildWinnerCelebrationPresentation({
    game: normalizedGame,
    contestants,
  }), {
    isComplete: true,
    isTie: true,
    heading: 'Congratulations, Ada and Boaz!',
    message: 'Ada and Boaz tied for the Berean Board win with $900.',
    scoreLabel: 'Tied score',
    scoreText: '$900',
    winnerNames: ['Ada', 'Boaz'],
    winnerScore: 900,
  });

  assert.deepEqual(game.buildWinnerCelebrationPresentation({
    game: { ...normalizedGame, categories: [] },
    contestants,
  }), { isComplete: false });
});

test('calculates dynamic winner celebration scaling without scrollbars', () => {
  assert.equal(game.calculateWinnerCelebrationScale({
    availableWidth: 760,
    availableHeight: 560,
    cardWidth: 760,
    cardHeight: 540,
  }), 1);

  assert.equal(game.calculateWinnerCelebrationScale({
    availableWidth: 760,
    availableHeight: 320,
    cardWidth: 760,
    cardHeight: 640,
  }), 0.5);

  assert.equal(game.calculateWinnerCelebrationScale({
    availableWidth: 360,
    availableHeight: 500,
    cardWidth: 720,
    cardHeight: 500,
  }), 0.5);

  assert.equal(game.calculateWinnerCelebrationScale({
    availableWidth: 360,
    availableHeight: 260,
    cardWidth: 720,
    cardHeight: 650,
  }), 0.4);
});

test('renders answer-history score lines from each contestant’s points on that clue', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  contestants[0].score = 900;
  contestants[1].score = -900;
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const firstMiss = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });
  const correct = game.applyAnswerJudgment({
    contestants: firstMiss.contestants,
    clue: firstMiss.clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });

  assert.equal(correct.contestants[0].score, 1000);
  assert.equal(correct.contestants[1].score, -1000);
  assert.equal(correct.clue.winningAwardPoints, 100);
  assert.equal(game.getContestantClueAward({ clue: correct.clue, contestantId: 'contestant-1' }), 100);
  assert.equal(game.getContestantClueAward({ clue: correct.clue, contestantId: 'contestant-2' }), -100);
  assert.equal(game.buildContestantChoiceScoreLine({ clue: correct.clue, contestant: correct.contestants[0] }), '$100 · Full credit');
  assert.equal(game.buildContestantChoiceScoreLine({ clue: correct.clue, contestant: correct.contestants[1] }), '-$100 · Incorrect');
  assert.notEqual(game.buildContestantChoiceScoreLine({ clue: correct.clue, contestant: correct.contestants[0] }), '$1000 · Full credit');
});

test('reviews cents-based adaptive partial and correct awards with each contestant’s actual points', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const partial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const correct = game.applyAnswerJudgment({
    contestants: partial.contestants,
    clue: partial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'correct' },
  });

  assert.equal(partial.awardedPoints, 33.33);
  assert.equal(partial.clue.partialCreditAwarded, 33.33);
  assert.equal(partial.contestants[0].score, 33.33);
  assert.equal(correct.awardedPoints, 66.67);
  assert.equal(correct.contestants[1].score, 66.67);
  const review = game.buildCompletedClueReviewPresentation({
    clue: correct.clue,
    contestants: correct.contestants,
  });

  assert.match(review.creditSummary, /Ada received \$33\.33 partial credit\./);
  assert.match(review.creditSummary, /Boaz received \$66\.67 for the accepted answer\./);
});

test('includes distinct board tile styles for correct partial and missed outcomes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');

  assert.match(css, /\.game-board__clue\.is-correct\s*{/);
  assert.match(css, /\.game-board__clue\.is-partial\s*{/);
  assert.match(css, /\.game-board__clue\.is-incorrect\s*{/);
  assert.match(css, /\.review-game-play \.game-board__clue\.is-complete:disabled\s*{/);
  assert.match(cssRule(css, '.game-board__clue.is-correct'), /#9df0b1/i);
  assert.match(cssRule(css, '.game-board__clue.is-partial'), /#ffdf72/i);
  assert.match(cssRule(css, '.game-board__clue.is-incorrect'), /#ff9d9d/i);
  assert.match(cssRule(css, '.game-board__clue.is-complete'), /cursor:\s*pointer/i);
  assert.match(cssRule(css, '.review-game-play .game-board__clue.is-complete:disabled'), /opacity:\s*1/i);
  assert.match(cssRule(css, '.clue-review'), /rgba\(255, 206, 72, 0\.07\)/i);
});

test('hides host override controls until a contestant has an answer verdict', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.doesNotMatch(html, /id="host-override-panel"/);
  assert.doesNotMatch(html, /id="host-override-points"/);
  assert.doesNotMatch(html, /Complete and reveal after override/);
  assert.doesNotMatch(html, /score-adjustment|Adjust selected contestant/i);
  assert.match(css, /\.contestant-choice__host-overrides\s*{/);
  assert.match(css, /\.contestant-choice\s*\{[^}]*position:\s*relative/i);
  assert.match(css, /\.contestant-choice\s*\{[^}]*position:\s*relative[^}]*container-type:\s*inline-size/i);
  assert.match(css, /\.contestant-choice--has-host-overrides\s*\{[^}]*grid-template-columns:\s*1fr/i);
  assert.doesNotMatch(css, /\.contestant-choice--has-host-overrides\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides'), /align-content:\s*center/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides'), /gap:\s*0\.2rem/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides'), /padding-block:\s*0\.44rem/i);
  assert.doesNotMatch(cssRule(css, '.contestant-choice--has-host-overrides'), /padding-block-end:\s*1\.95rem/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__label'), /min-width:\s*0/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__label'), /gap:\s*0\.38rem/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__label'), /align-items:\s*start/i);
  assert.match(cssRule(css, '.contestant-choice__host-overrides'), /position:\s*static/i);
  assert.match(cssRule(css, '.contestant-choice__host-overrides'), /justify-self:\s*center/i);
  assert.match(cssRule(css, '.contestant-choice__host-overrides'), /justify-content:\s*center/i);
  assert.match(cssRule(css, '.contestant-choice__host-overrides'), /flex-wrap:\s*nowrap/i);
  assert.doesNotMatch(cssRule(css, '.contestant-choice__host-overrides'), /position:\s*absolute/i);
  assert.doesNotMatch(cssRule(css, '.contestant-choice__host-overrides'), /inset-block-end/i);
  assert.doesNotMatch(cssRule(css, '.contestant-choice__host-overrides'), /transform:\s*translateX/i);
  assert.doesNotMatch(cssRule(css, '.contestant-choice__host-overrides'), /justify-self:\s*end/i);
  assert.match(css, /\.contestant-choice__host-override-button\s*{/);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /width:\s*1\.68rem/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /height:\s*1\.68rem/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /border-radius:\s*0\.48rem/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /font-size:\s*0\.94rem/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /line-height:\s*1/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /padding:\s*0/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /width:\s*1\.68rem/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /height:\s*1\.68rem/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /min-width:\s*1\.68rem/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /min-height:\s*1\.68rem/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /padding:\s*0/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /border:\s*1px solid rgba\(190, 207, 255, 0\.32\)/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /color:\s*#eaf0ff/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /background:\s*rgba\(8, 15, 32, 0\.78\)/i);
  assert.match(cssRule(css, '.review-game-play .contestant-choice__host-override-button'), /flex:\s*0 0 auto/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-icon'), /width:\s*1em/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-icon'), /height:\s*1em/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-icon'), /line-height:\s*1/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-icon'), /transform:\s*translateY\(-0\.02em\)/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /color:\s*#eaf0ff/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button'), /background:\s*rgba\(8, 15, 32, 0\.78\)/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="correct"]'), /--host-override-hover-color:\s*#9df0b1/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="correct"]'), /--host-override-hover-background:\s*rgba\(9, 30, 20, 0\.8\)/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="partial"]'), /--host-override-hover-color:\s*#ffdf72/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="partial"]'), /--host-override-hover-background:\s*rgba\(126, 92, 13, 0\.32\)/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="incorrect"]'), /--host-override-hover-color:\s*#ff9d9d/i);
  assert.match(cssRule(css, '.contestant-choice__host-override-button[data-host-verdict-override="incorrect"]'), /--host-override-hover-background:\s*rgba\(132, 22, 32, 0\.34\)/i);
  assert.match(css, /\.contestant-choice__host-override-button:hover,\s*\.contestant-choice__host-override-button:focus-visible\s*\{(?=[^}]*color:\s*var\(--host-override-hover-color\))(?=[^}]*background:\s*var\(--host-override-hover-background\))(?=[^}]*border-color:\s*var\(--host-override-hover-border\))/is);
  assert.match(css, /data-host-verdict-override="correct"/);
  assert.doesNotMatch(css, /padding-inline-end:\s*3\.85rem/i);
  assert.match(cssRule(css, '.contestant-choice__body'), /min-width:\s*0/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__body'), /gap:\s*0\.06rem/i);
  assert.match(cssRule(css, '.contestant-choice__name'), /overflow:\s*hidden/i);
  assert.match(cssRule(css, '.contestant-choice__name'), /text-overflow:\s*ellipsis/i);
  assert.match(cssRule(css, '.contestant-choice__name'), /white-space:\s*nowrap/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__name'), /font-size:\s*clamp\(1\.06rem,\s*9\.6cqi,\s*1\.18rem\)/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides .contestant-choice__name'), /line-height:\s*1\.08/i);
  assert.match(cssRule(css, '.contestant-choice small'), /overflow:\s*hidden/i);
  assert.match(cssRule(css, '.contestant-choice small'), /text-overflow:\s*ellipsis/i);
  assert.match(cssRule(css, '.contestant-choice small'), /white-space:\s*nowrap/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides small'), /font-size:\s*clamp\(0\.98rem,\s*7\.4cqi,\s*1\.06rem\)/i);
  assert.match(cssRule(css, '.contestant-choice--has-host-overrides small'), /line-height:\s*1\.08/i);
  assert.match(js, /contestant-choice--has-host-overrides/);
  assert.match(js, /data-host-verdict-override/);
  assert.match(js, /title="\$\{escapeHtml\(tooltip\)\}"/);
  assert.match(js, /data-host-override-tooltip="\$\{escapeHtml\(tooltip\)\}"/);
  assert.match(js, /contestant-choice__host-override-icon/);
  assert.doesNotMatch(js, /<span>\$\{escapeHtml\(option\.label\)\}<\/span>/);
  assert.match(js, /function handleHostVerdictOverride\(/);
  assert.match(js, /function updateContestantPromptForCompletedClue\(/);
  assert.match(js, /showAnswer\(\);\s+updateContestantPromptForCompletedClue\(\);\s+if \(clueFeedback\) \{\s+clueFeedback\.textContent = 'The correct answer is shown below\.'/);
  assert.match(js, /contestantChoices\?\.addEventListener\('click'/);
  assert.doesNotMatch(js, /hostOverridePoints|hostOverrideComplete|applyHostScoreAdjustment/);
});

test('offers host override options on every attempted player tile including revealed full-credit answers', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue, contestantId: 'contestant-1' }), []);

  const partial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  assert.deepEqual(game.getContestantAnswerOutcome({ clue: partial.clue, contestantId: 'contestant-1' }), {
    verdict: 'partial',
    label: 'Partial credit',
  });
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: partial.clue, contestantId: 'contestant-1' }).map((option) => option.decision), ['incorrect', 'correct']);
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: partial.clue, contestantId: 'contestant-1' }).map((option) => option.icon), ['✕', '✓']);

  const incorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: incorrect.clue, contestantId: 'contestant-1' }).map((option) => option.decision), ['partial', 'correct']);
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: incorrect.clue, contestantId: 'contestant-1' }).map((option) => option.icon), ['⚠', '✓']);

  const correct = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: correct.clue, contestantId: 'contestant-1' }).map((option) => option.decision), ['partial', 'incorrect']);
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: correct.clue, contestantId: 'contestant-1' }).map((option) => option.icon), ['⚠', '✕']);

  const boazPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const adaCorrectAfterPartial = game.applyAnswerJudgment({
    contestants: boazPartial.contestants,
    clue: boazPartial.clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: adaCorrectAfterPartial.clue, contestantId: 'contestant-1' }).map((option) => option.decision), ['partial', 'incorrect']);
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: adaCorrectAfterPartial.clue, contestantId: 'contestant-2' }).map((option) => option.decision), ['incorrect', 'correct']);
  assert.deepEqual(game.getHostOverrideOptionsForContestant({ clue: adaCorrectAfterPartial.clue, contestantId: 'contestant-3' }), []);
});

test('host verdict overrides downgrade revealed full-credit answers without reopening exposed clues', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];

  const firstAttemptCorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });

  const downgradedToPartial = game.applyHostVerdictOverride({
    contestants: firstAttemptCorrect.contestants,
    clue: firstAttemptCorrect.clue,
    contestantId: 'contestant-1',
    decision: 'partial',
  });

  assert.equal(downgradedToPartial.contestants[0].score, 25);
  assert.equal(downgradedToPartial.clue.completed, true);
  assert.equal(downgradedToPartial.clue.winningContestantId, '');
  assert.deepEqual(downgradedToPartial.clue.partialCreditAwards, [{ contestantId: 'contestant-1', points: 25 }]);
  assert.equal(downgradedToPartial.answerShouldBeRevealed, true);
  assert.equal(downgradedToPartial.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: downgradedToPartial.clue, value: 100 }).text, '⚠');
  assert.match(game.buildHostVerdictOverrideSuccessMessage({
    result: downgradedToPartial,
    decision: 'partial',
    contestantName: 'Ada',
  }), /answer was already revealed/i);

  const downgradedToIncorrect = game.applyHostVerdictOverride({
    contestants: firstAttemptCorrect.contestants,
    clue: firstAttemptCorrect.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });
  assert.equal(downgradedToIncorrect.contestants[0].score, -100);
  assert.equal(downgradedToIncorrect.clue.completed, true);
  assert.equal(downgradedToIncorrect.answerShouldBeRevealed, true);
  assert.equal(downgradedToIncorrect.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: downgradedToIncorrect.clue, value: 100 }).text, '✕');

  const repeatedDowngradeToIncorrect = game.applyHostVerdictOverride({
    contestants: downgradedToPartial.contestants,
    clue: downgradedToPartial.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });
  assert.equal(repeatedDowngradeToIncorrect.contestants[0].score, -100);
  assert.equal(repeatedDowngradeToIncorrect.clue.completed, true);
  assert.equal(repeatedDowngradeToIncorrect.clue.hostOverrideAnswerWasAlreadyRevealed, true);
  assert.equal(repeatedDowngradeToIncorrect.answerShouldBeRevealed, true);
  assert.equal(repeatedDowngradeToIncorrect.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: repeatedDowngradeToIncorrect.clue, value: 100 }).text, '✕');
  assert.match(game.buildHostVerdictOverrideSuccessMessage({
    result: repeatedDowngradeToIncorrect,
    decision: 'incorrect',
    contestantName: 'Ada',
  }), /answer was already revealed/i);

  const boazPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const adaCorrectAfterPartial = game.applyAnswerJudgment({
    contestants: boazPartial.contestants,
    clue: boazPartial.clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
  });

  const adaDowngradedToIncorrect = game.applyHostVerdictOverride({
    contestants: adaCorrectAfterPartial.contestants,
    clue: adaCorrectAfterPartial.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });
  assert.equal(adaDowngradedToIncorrect.contestants[0].score, -100);
  assert.equal(adaDowngradedToIncorrect.contestants[1].score, 25);
  assert.equal(adaDowngradedToIncorrect.clue.completed, true);
  assert.deepEqual(adaDowngradedToIncorrect.clue.partialCreditAwards, [{ contestantId: 'contestant-2', points: 25 }]);
  assert.equal(adaDowngradedToIncorrect.clue.winningContestantId, '');
  assert.equal(adaDowngradedToIncorrect.answerShouldBeRevealed, true);
  assert.equal(adaDowngradedToIncorrect.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: adaDowngradedToIncorrect.clue, value: 100 }).text, '⚠');

  const adaDowngradedToPartial = game.applyHostVerdictOverride({
    contestants: adaCorrectAfterPartial.contestants,
    clue: adaCorrectAfterPartial.clue,
    contestantId: 'contestant-1',
    decision: 'partial',
  });
  assert.equal(adaDowngradedToPartial.contestants[0].score, 25);
  assert.equal(adaDowngradedToPartial.contestants[1].score, 25);
  assert.equal(adaDowngradedToPartial.clue.completed, true);
  assert.deepEqual(adaDowngradedToPartial.clue.partialCreditAwards, [
    { contestantId: 'contestant-2', points: 25 },
    { contestantId: 'contestant-1', points: 25 },
  ]);
  assert.equal(adaDowngradedToPartial.clue.winningContestantId, '');
  assert.equal(adaDowngradedToPartial.answerShouldBeRevealed, true);
  assert.equal(adaDowngradedToPartial.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: adaDowngradedToPartial.clue, value: 100 }).text, '⚠');
});

test('host verdict overrides use normal scoring and derive reveal and buzzer state from the corrected outcome', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const automatedPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });

  assert.equal(automatedPartial.contestants[0].score, 33.33);
  const upgraded = game.applyHostVerdictOverride({
    contestants: automatedPartial.contestants,
    clue: automatedPartial.clue,
    contestantId: 'contestant-1',
    decision: 'correct',
  });

  assert.equal(upgraded.contestants[0].score, 100);
  assert.equal(upgraded.clue.completed, true);
  assert.equal(upgraded.clue.winningContestantId, 'contestant-1');
  assert.equal(upgraded.clue.partialCreditAwarded, 0);
  assert.equal(upgraded.answerShouldBeRevealed, true);
  assert.equal(upgraded.buzzersShouldBeOpen, false);
  assert.equal(upgraded.clue.hostOverrideApplied, true);
  assert.deepEqual(game.getClueBoardDisplayState({ clue: upgraded.clue, value: 100 }), {
    text: '✓',
    className: 'game-board__clue is-complete is-correct',
    disabled: false,
    ariaLabel: '$100 clue answered correctly. Review result',
  });

  const automatedIncorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });
  assert.equal(automatedIncorrect.contestants[0].score, -100);
  const upgradedToPartial = game.applyHostVerdictOverride({
    contestants: automatedIncorrect.contestants,
    clue: automatedIncorrect.clue,
    contestantId: 'contestant-1',
    decision: 'partial',
  });

  assert.equal(upgradedToPartial.contestants[0].score, 33.33);
  assert.equal(upgradedToPartial.clue.completed, false);
  assert.equal(upgradedToPartial.clue.partialCreditAwarded, 33.33);
  assert.equal(upgradedToPartial.answerShouldBeRevealed, false);
  assert.equal(upgradedToPartial.buzzersShouldBeOpen, true);
  assert.deepEqual(upgradedToPartial.clue.noCreditAwards, []);

  const downgradedToIncorrect = game.applyHostVerdictOverride({
    contestants: automatedPartial.contestants,
    clue: automatedPartial.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });
  assert.equal(downgradedToIncorrect.contestants[0].score, -100);
  assert.equal(downgradedToIncorrect.clue.completed, false);
  assert.equal(downgradedToIncorrect.answerShouldBeRevealed, false);
  assert.equal(downgradedToIncorrect.buzzersShouldBeOpen, true);
  assert.deepEqual(downgradedToIncorrect.clue.noCreditAwards, [{ contestantId: 'contestant-1', points: -100 }]);
});

test('host verdict overrides complete and reveal only when the corrected state exhausts available credit', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const partial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const allAttempted = game.applyAnswerJudgment({
    contestants: partial.contestants,
    clue: partial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });

  assert.equal(allAttempted.clue.completed, true);
  assert.equal(game.getClueBoardDisplayState({ clue: allAttempted.clue, value: 100 }).text, '⚠');

  const downgradedPartial = game.applyHostVerdictOverride({
    contestants: allAttempted.contestants,
    clue: allAttempted.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });
  assert.equal(downgradedPartial.contestants[0].score, -100);
  assert.equal(downgradedPartial.contestants[1].score, -100);
  assert.equal(downgradedPartial.clue.completed, true);
  assert.equal(downgradedPartial.answerShouldBeRevealed, true);
  assert.equal(downgradedPartial.buzzersShouldBeOpen, false);
  assert.equal(game.getClueBoardDisplayState({ clue: downgradedPartial.clue, value: 100 }).text, '✕');

  assert.throws(() => game.applyHostVerdictOverride({
    contestants: allAttempted.contestants,
    clue: allAttempted.clue,
    contestantId: 'contestant-2',
    decision: 'incorrect',
  }), /already marked incorrect/i);
  assert.throws(() => game.applyHostVerdictOverride({
    contestants: allAttempted.contestants,
    clue: allAttempted.clue,
    contestantId: 'contestant-1',
    decision: 'reopen',
  }), /valid host verdict/i);
});

test('host verdict override full-credit upgrades after another player partial only award remaining value', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const adaIncorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });
  const bothIncorrect = game.applyAnswerJudgment({
    contestants: adaIncorrect.contestants,
    clue: adaIncorrect.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'incorrect' },
  });
  const adaPartial = game.applyHostVerdictOverride({
    contestants: bothIncorrect.contestants,
    clue: bothIncorrect.clue,
    contestantId: 'contestant-1',
    decision: 'partial',
  });
  const boazOptions = game.getHostOverrideOptionsForContestant({
    clue: adaPartial.clue,
    contestantId: 'contestant-2',
  });
  const correctOption = boazOptions.find((option) => option.decision === 'correct');

  assert.equal(adaPartial.contestants[0].score, 33.33);
  assert.equal(adaPartial.contestants[1].score, -100);
  assert.equal(correctOption.awardPoints, 66.67);
  assert.match(correctOption.label, /remaining credit/i);

  const boazCorrect = game.applyHostVerdictOverride({
    contestants: adaPartial.contestants,
    clue: adaPartial.clue,
    contestantId: 'contestant-2',
    decision: 'correct',
  });

  assert.equal(boazCorrect.contestants[0].score, 33.33);
  assert.equal(boazCorrect.contestants[1].score, 66.67);
  assert.equal(boazCorrect.clue.partialCreditAwarded, 33.33);
  assert.equal(boazCorrect.clue.winningAwardPoints, 66.67);
  assert.equal(boazCorrect.clue.completed, true);
  assert.equal(boazCorrect.awardedPoints, 66.67);
});

test('host verdict override full-credit upgrades for earlier wrong answers still preserve later partial credit', () => {
  const contestants = game.createContestants(['Ada', 'Boaz']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const adaIncorrect = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'incorrect' },
  });
  const boazPartial = game.applyAnswerJudgment({
    contestants: adaIncorrect.contestants,
    clue: adaIncorrect.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const adaOptions = game.getHostOverrideOptionsForContestant({
    clue: boazPartial.clue,
    contestantId: 'contestant-1',
  });
  const correctOption = adaOptions.find((option) => option.decision === 'correct');

  assert.equal(boazPartial.contestants[0].score, -100);
  assert.equal(boazPartial.contestants[1].score, 33.33);
  assert.equal(correctOption.awardPoints, 66.67);
  assert.match(correctOption.label, /remaining credit/i);

  const adaCorrect = game.applyHostVerdictOverride({
    contestants: boazPartial.contestants,
    clue: boazPartial.clue,
    contestantId: 'contestant-1',
    decision: 'correct',
  });

  assert.equal(adaCorrect.contestants[0].score, 66.67);
  assert.equal(adaCorrect.contestants[1].score, 33.33);
  assert.equal(adaCorrect.clue.partialCreditAwarded, 33.33);
  assert.deepEqual(adaCorrect.clue.partialCreditAwards, [{ contestantId: 'contestant-2', points: 33.33 }]);
  assert.equal(adaCorrect.clue.winningContestantId, 'contestant-1');
  assert.equal(adaCorrect.clue.winningAwardPoints, 66.67);
  assert.equal(adaCorrect.awardedPoints, 66.67);
});

test('host verdict overrides preserve a prior no-buzz terminal state unless upgraded to full credit', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const partial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const noBuzzAfterPartial = game.applyNoBuzzForClue({
    contestants: partial.contestants,
    clue: partial.clue,
  });

  assert.equal(noBuzzAfterPartial.clue.completed, true);
  assert.equal(noBuzzAfterPartial.clue.noContestantsBuzzed, true);
  assert.equal(noBuzzAfterPartial.clue.attemptedContestantIds.length, 1);

  const downgradedAfterReveal = game.applyHostVerdictOverride({
    contestants: noBuzzAfterPartial.contestants,
    clue: noBuzzAfterPartial.clue,
    contestantId: 'contestant-1',
    decision: 'incorrect',
  });

  assert.equal(downgradedAfterReveal.clue.completed, true);
  assert.equal(downgradedAfterReveal.clue.allContestantsMissed, true);
  assert.equal(downgradedAfterReveal.clue.noContestantsBuzzed, true);
  assert.equal(downgradedAfterReveal.answerShouldBeRevealed, true);
  assert.equal(downgradedAfterReveal.buzzersShouldBeOpen, false);
  assert.equal(downgradedAfterReveal.contestants[0].score, -100);
  assert.equal(downgradedAfterReveal.contestants[1].score, 0);
  assert.equal(downgradedAfterReveal.contestants[2].score, 0);
  assert.equal(game.getClueBoardDisplayState({ clue: downgradedAfterReveal.clue, value: 100 }).text, '✕');
  const noBuzzOverrideMessage = game.buildHostVerdictOverrideSuccessMessage({
    result: downgradedAfterReveal,
    decision: 'incorrect',
    contestantName: 'Ada',
  });
  assert.match(noBuzzOverrideMessage, /already been revealed because no one else buzzed in/i);
  assert.doesNotMatch(noBuzzOverrideMessage, /All players have attempted/i);

  const upgradedAfterReveal = game.applyHostVerdictOverride({
    contestants: noBuzzAfterPartial.contestants,
    clue: noBuzzAfterPartial.clue,
    contestantId: 'contestant-1',
    decision: 'correct',
  });
  assert.equal(upgradedAfterReveal.clue.completed, true);
  assert.equal(upgradedAfterReveal.clue.noContestantsBuzzed, false);
  assert.equal(upgradedAfterReveal.clue.winningContestantId, 'contestant-1');
  assert.equal(upgradedAfterReveal.answerShouldBeRevealed, true);
  assert.equal(upgradedAfterReveal.buzzersShouldBeOpen, false);
  assert.equal(upgradedAfterReveal.contestants[0].score, 100);
  assert.equal(game.getClueBoardDisplayState({ clue: upgradedAfterReveal.clue, value: 100 }).text, '✓');
});

test('keeps the clue modal fitted without an internal gameplay scrollbar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');
  const panelRule = cssRule(css, '.active-clue-panel');
  const cardRule = cssRule(css, '.active-clue-card');
  const bodyRule = cssRule(css, '.active-clue-card__body');
  const contentRule = cssRule(css, '.active-clue-card__fit-content');
  const footerRule = cssRule(css, '.active-clue-card__footer');

  assert.match(html, /class="active-clue-card__body"/);
  assert.match(html, /class="active-clue-card__fit-content"/);
  assert.match(html, /class="active-clue-card__footer clue-actions"/);
  assert.doesNotMatch(panelRule, /overflow-y:\s*auto/i);
  assert.doesNotMatch(cardRule, /overflow-y:\s*auto/i);
  assert.doesNotMatch(bodyRule, /overflow-y:\s*(auto|scroll)/i);
  assert.match(cardRule, /display:\s*grid/i);
  assert.match(cardRule, /grid-template-rows:\s*minmax\(0,\s*1fr\) auto/i);
  assert.match(cardRule, /height:\s*var\(--active-clue-card-height,\s*auto\)/i);
  assert.match(cardRule, /max-height:\s*calc\(100dvh - clamp\(1rem, 4vw, 3rem\)\)/i);
  assert.match(bodyRule, /overflow:\s*hidden/i);
  assert.match(contentRule, /transform:\s*scale\(var\(--active-clue-scale,\s*1\)\)/i);
  assert.match(contentRule, /transform-origin:\s*top left/i);
  assert.match(contentRule, /width:\s*var\(--active-clue-content-width,\s*100%\)/i);
  assert.match(footerRule, /flex-wrap:\s*wrap/i);
  assert.match(js, /const CLUE_MODAL_FIT_TOLERANCE_PX = 10;/);
  assert.match(js, /const CLUE_MODAL_FIT_MAX_ITERATIONS = 14;/);
});

test('protects active clue footer controls outside the fitted body content', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8');
  const bodyStart = html.indexOf('class="active-clue-card__body"');
  const fitContentStart = html.indexOf('class="active-clue-card__fit-content"');
  const footerStart = html.indexOf('class="active-clue-card__footer clue-actions"');
  const backButton = html.indexOf('id="close-clue-button"');

  assert.ok(bodyStart > 0, 'expected a protected clue-panel body viewport');
  assert.ok(fitContentStart > bodyStart, 'expected fitted content inside the body viewport');
  assert.ok(footerStart > fitContentStart, 'expected the footer after the fitted content');
  assert.ok(backButton > footerStart, 'expected Back to Board inside the protected footer');
});

test('uses observer-backed iterative fitting for active clue panel changes', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8');

  assert.match(js, /function createCluePanelFitController\(/);
  assert.match(js, /function verifyActiveClueFit\(/);
  assert.match(js, /for \(let iteration = 0; iteration < CLUE_MODAL_FIT_MAX_ITERATIONS; iteration \+= 1\)/);
  assert.match(js, /new ResizeObserver\(/);
  assert.match(js, /new MutationObserver\(/);
  assert.match(js, /visualViewport\?\.addEventListener\('resize', requestFit\)/);
  assert.match(js, /document\.fonts\.ready/);
  assert.match(js, /responseInput\?\.addEventListener\('input', scheduleActiveClueFit\)/);
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

test('uses game board and Berean Board wording consistently in copy and filenames', () => {
  const copy = [
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.html'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'berean-board.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'llms.txt'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'llms-full.txt'), 'utf8'),
  ].join('\n');
  const staleSlug = ['small', 'group', 'review', 'game'].join('-');
  const staleNomenclature = new RegExp(['small', 'group', 'review', 'game'].join('[-_ ]'), 'i');
  const renamedFiles = [
    path.join(__dirname, '..', 'docs', 'berean-board.html'),
    path.join(__dirname, '..', 'docs', 'berean-board.js'),
    path.join(__dirname, '..', 'scripts', 'test-berean-board.js'),
  ];

  assert.doesNotMatch(copy, /\breview[- ]board\b/i);
  assert.doesNotMatch(copy, new RegExp(`\\b${['jeop', 'ardy'].join('')}\\b`, 'i'));
  assert.doesNotMatch(copy, staleNomenclature);
  assert.match(copy, /\bgame board\b/i);
  assert.match(copy, /Call on the first person who buzzed in, then select that contestant here\./);
  assert.doesNotMatch(copy, /Call on the first person who buzzed in physically/i);
  assert.match(copy, /https:\/\/www\.navtheway\.com\/berean-board/);
  assert.deepEqual(renamedFiles.filter((filePath) => path.basename(filePath).includes(staleSlug)), []);
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

test('rejects generated clues whose answer source is not grounded in supplied content or Bible content', () => {
  const invalid = sampleGeneratedGame();
  invalid.categories[0].clues[0].sourceAnchor = 'General theology idea';
  assert.throws(
    () => game.normalizeGeneratedGame(invalid),
    /sourceAnchor beginning with User supplied content: \/ Bible content: \/ User supplied content \+ Bible content:/i
  );

  const emptyDetail = sampleGeneratedGame();
  emptyDetail.categories[0].clues[0].sourceAnchor = 'Bible content:';
  assert.throws(() => game.normalizeGeneratedGame(emptyDetail), /specific source detail/i);

  assert.equal(game.hasApprovedClueGroundingSourceAnchor('User supplied content: Romans 8 lesson notes'), true);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('Bible content: Romans 8:15'), true);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('Bible content: Psalm 23'), true);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('User supplied content + Bible content: lesson summary and Romans 8:15'), true);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('General theology idea'), false);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('User supplied content:   '), false);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('Bible content: adoption theme'), false);
  assert.equal(game.hasApprovedClueGroundingSourceAnchor('User supplied content + Bible content: focus instructions and Romans 8:15'), false);
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
});

test('combines uploaded lesson files with leader focus instructions', async () => {
  const combined = await game.buildLessonSourceContent({
    lessonTopicText: 'From my attached lesson I want to focus more attention on prayer and less on historical background.',
    files: [{ name: 'leader-guide.md' }],
    fileExtractor: async () => 'SOURCE FILE: leader-guide.md\nLesson notes about abiding in Christ.',
  });

  assert.match(combined, /UPLOADED LESSON FILES:/);
  assert.match(combined, /LEADER-PROVIDED FOCUS INSTRUCTIONS FOR THIS GAME:/);
  assert.match(combined, /abiding in Christ/);
  assert.match(combined, /focus more attention on prayer/);
  assert.ok(
    combined.indexOf('UPLOADED LESSON FILES:') < combined.indexOf('LEADER-PROVIDED FOCUS INSTRUCTIONS FOR THIS GAME:'),
    'file content should appear before focus instructions so the instructions clearly steer the supplied lesson material'
  );
  assert.doesNotMatch(combined, /LEADER-PROVIDED LESSON TOPIC OR SUMMARY:[\s\S]*focus more attention/);
});

test('still requires either a lesson file or a leader-provided lesson description', async () => {
  await assert.rejects(
    () => game.buildLessonSourceContent({ lessonTopicText: '   ', files: [] }),
    /lesson file or type a lesson topic, summary, or focus instructions/i
  );
});

test('extracts readable text from newly supported lesson file formats', async () => {
  const previousJSZip = globalThis.JSZip;
  const previousXLSX = globalThis.XLSX;
  globalThis.JSZip = {
    loadAsync: async () => ({
      files: {
        'content.xml': {
          async: async () => '<office:document-content><office:body><office:text><text:p>OpenDocument lesson about prayer and fellowship.</text:p></office:text></office:body></office:document-content>',
        },
        'index.xml': {
          async: async () => '<sf:document><sf:text-body><sf:p>iWork package lesson about grace.</sf:p></sf:text-body></sf:document>',
        },
      },
    }),
  };
  globalThis.XLSX = {
    read: () => ({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    }),
    utils: {
      sheet_to_csv: () => 'Question,Answer\nCreation,God made all things',
    },
  };

  try {
    const extracted = await game.extractLessonTextFromFiles([
      makeLessonFile('lesson.yaml', 'application/x-yaml', 'theme: assurance in Christ'),
      makeLessonFile('study.tex', 'application/x-tex', '\\section{Perseverance of the saints}'),
      makeLessonFile('lesson.odt', 'application/vnd.oasis.opendocument.text', 'odt package placeholder'),
      makeLessonFile('lesson.pages', 'application/vnd.apple.pages', 'pages package placeholder'),
      makeLessonFile('scorecard.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet placeholder'),
      makeLessonFile('legacy-guide.doc', 'application/msword', 'Legacy Office lesson about covenant grace.'),
    ]);

    assert.match(extracted, /theme: assurance in Christ/);
    assert.match(extracted, /Perseverance of the saints/);
    assert.match(extracted, /OpenDocument lesson about prayer and fellowship/);
    assert.match(extracted, /iWork package lesson about grace/);
    assert.match(extracted, /Creation,God made all things/);
    assert.match(extracted, /Legacy Office lesson about covenant grace/);
  } finally {
    globalThis.JSZip = previousJSZip;
    globalThis.XLSX = previousXLSX;
  }
});

test('extracts readable lesson text from EPUB packages in OPF spine order', async () => {
  const previousJSZip = globalThis.JSZip;
  globalThis.JSZip = {
    loadAsync: async () => ({
      files: {
        mimetype: {
          async: async () => 'application/epub+zip',
        },
        'META-INF/container.xml': {
          async: async () => '<container><rootfiles><rootfile full-path="OEBPS/content.opf" /></rootfiles></container>',
        },
        'OEBPS/content.opf': {
          async: async () => `
            <package>
              <manifest>
                <item id="later" href="zzz-later.xhtml" media-type="application/xhtml+xml" />
                <item id="first" href="chapters/002-first.xhtml" media-type="application/xhtml+xml" />
                <item id="second" href="chapters/001-second.xhtml" media-type="application/xhtml+xml" />
                <item id="escaped" href="chapter%202.xhtml" media-type="application/xhtml+xml" />
                <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
              </manifest>
              <spine>
                <itemref idref="first" />
                <itemref idref="second" />
                <itemref idref="escaped" />
                <itemref idref="later" />
              </spine>
            </package>
          `,
        },
        'OEBPS/chapters/001-second.xhtml': {
          async: async () => '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Second lesson section</h1><p>Believers are adopted in Christ and cry Abba, Father.</p></body></html>',
        },
        'OEBPS/chapters/002-first.xhtml': {
          async: async () => '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>First lesson section</h1><p>Assurance from Romans 8.</p></body></html>',
        },
        'OEBPS/chapter 2.xhtml': {
          async: async () => '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Escaped lesson section</h1><p>Percent-escaped EPUB manifest hrefs should resolve to ZIP entries with spaces.</p></body></html>',
        },
        'OEBPS/zzz-later.xhtml': {
          async: async () => '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Later lesson section</h1><p>Nothing can separate believers from the love of God in Christ.</p></body></html>',
        },
        'OEBPS/nav.xhtml': {
          async: async () => '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav>Auxiliary table of contents should not become lesson text.</nav></body></html>',
        },
      },
    }),
  };

  try {
    const extracted = await game.extractLessonTextFromFiles([
      makeLessonFile('lesson.epub', 'application/epub+zip', 'epub package placeholder'),
    ]);

    assert.match(extracted, /First lesson section/);
    assert.match(extracted, /Second lesson section/);
    assert.match(extracted, /Escaped lesson section/);
    assert.match(extracted, /Later lesson section/);
    assert.ok(
      extracted.indexOf('First lesson section') < extracted.indexOf('Second lesson section'),
      'EPUB text should follow the OPF spine order instead of filename order'
    );
    assert.ok(
      extracted.indexOf('Second lesson section') < extracted.indexOf('Escaped lesson section'),
      'EPUB text should preserve the whole declared spine order'
    );
    assert.ok(
      extracted.indexOf('Escaped lesson section') < extracted.indexOf('Later lesson section'),
      'EPUB text should include percent-escaped manifest hrefs before later spine items'
    );
    assert.doesNotMatch(extracted, /Auxiliary table of contents/);
    assert.doesNotMatch(extracted, /<h1>/);
  } finally {
    globalThis.JSZip = previousJSZip;
  }
});

test('extracts current iWork package lesson text from nested Index data without using plist metadata', async () => {
  const previousJSZip = globalThis.JSZip;
  const encoder = new TextEncoder();
  globalThis.JSZip = {
    loadAsync: async (payload) => {
      if (payload?.nestedIWorkZip) {
        return {
          files: {
            'Document.iwa': {
              async: async () => encoder.encode('Nested iWork lesson about sanctification and perseverance.').buffer,
            },
          },
        };
      }
      return {
        files: {
          'Metadata/Properties.plist': {
            async: async () => '<plist><string>Package metadata should not become lesson material.</string></plist>',
          },
          'Index.zip': {
            async: async () => ({ nestedIWorkZip: true }),
          },
        },
      };
    },
  };

  try {
    const extracted = await game.extractLessonTextFromFiles([
      makeLessonFile('lesson.pages', 'application/vnd.apple.pages', 'current pages package'),
    ]);

    assert.match(extracted, /Nested iWork lesson about sanctification and perseverance/);
    assert.doesNotMatch(extracted, /Package metadata should not become lesson material/);
  } finally {
    globalThis.JSZip = previousJSZip;
  }
});

test('rejects iWork packages that only expose plist metadata', async () => {
  const previousJSZip = globalThis.JSZip;
  globalThis.JSZip = {
    loadAsync: async () => ({
      files: {
        'Metadata/Properties.plist': {
          async: async () => '<plist><string>Package title but no lesson body.</string></plist>',
        },
      },
    }),
  };

  try {
    await assert.rejects(
      () => game.extractLessonTextFromFiles([
        makeLessonFile('lesson.key', 'application/vnd.apple.keynote', 'keynote package'),
      ]),
      /did not contain browser-readable lesson text/i
    );
  } finally {
    globalThis.JSZip = previousJSZip;
  }
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

  const allPartialContestants = game.createContestants(['Ada', 'Boaz', 'Chloe', 'Daniel']);
  const allPartialClue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const allPartialFirst = game.applyAnswerJudgment({
    contestants: allPartialContestants,
    clue: allPartialClue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const allPartialSecond = game.applyAnswerJudgment({
    contestants: allPartialFirst.contestants,
    clue: allPartialFirst.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const allPartialThird = game.applyAnswerJudgment({
    contestants: allPartialSecond.contestants,
    clue: allPartialSecond.clue,
    contestantId: 'contestant-3',
    judgment: { verdict: 'partial' },
  });
  const allPartialFourth = game.applyAnswerJudgment({
    contestants: allPartialThird.contestants,
    clue: allPartialThird.clue,
    contestantId: 'contestant-4',
    judgment: { verdict: 'partial' },
  });

  assert.equal(allPartialFourth.contestants[3].score, 20);
  assert.equal(allPartialFourth.awardedPoints, 20);
  assert.equal(allPartialFourth.clue.partialCreditAwarded, 80);
  assert.deepEqual(allPartialFourth.clue.partialCreditContestantIds, ['contestant-1', 'contestant-2', 'contestant-3', 'contestant-4']);
  assert.equal(allPartialFourth.clue.completed, true);
  assert.equal(allPartialFourth.answerShouldBeRevealed, true);
});

test('adapts partial and final-correct awards to the active player count', () => {
  const twoPlayers = game.createContestants(['Ada', 'Boaz']);
  const twoPlayerClue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const twoPlayerPartial = game.applyAnswerJudgment({
    contestants: twoPlayers,
    clue: twoPlayerClue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const twoPlayerCorrect = game.applyAnswerJudgment({
    contestants: twoPlayerPartial.contestants,
    clue: twoPlayerPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'correct' },
  });

  assert.equal(twoPlayerPartial.awardedPoints, 33.33);
  assert.equal(twoPlayerCorrect.awardedPoints, 66.67);
  assert.equal(twoPlayerCorrect.clue.completed, true);

  const threePlayers = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  const threePlayerClue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const threePlayerFirstPartial = game.applyAnswerJudgment({
    contestants: threePlayers,
    clue: threePlayerClue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial' },
  });
  const threePlayerSecondPartial = game.applyAnswerJudgment({
    contestants: threePlayerFirstPartial.contestants,
    clue: threePlayerFirstPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const threePlayerCorrect = game.applyAnswerJudgment({
    contestants: threePlayerSecondPartial.contestants,
    clue: threePlayerSecondPartial.clue,
    contestantId: 'contestant-3',
    judgment: { verdict: 'correct' },
  });

  assert.equal(threePlayerFirstPartial.awardedPoints, 25);
  assert.equal(threePlayerSecondPartial.awardedPoints, 25);
  assert.equal(threePlayerCorrect.awardedPoints, 50);
  assert.equal(threePlayerCorrect.clue.completed, true);
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

test('explains who should pick the next question from the most recent completed outcome', () => {
  const contestants = game.createContestants(['Madison', 'Ted']);
  const generated = game.normalizeGeneratedGame(sampleGeneratedGame());
  const firstClue = generated.categories[0].clues[0];
  const secondClue = generated.categories[1].clues[0];

  assert.equal(game.getNextPickerNote({ game: generated, contestants }), 'Host may choose the first question.');

  const correct = game.applyAnswerJudgment({
    contestants,
    clue: firstClue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'correct' },
    now: '2026-06-21T01:00:00.000Z',
  });
  generated.categories[0].clues[0] = correct.clue;
  assert.equal(game.getNextPickerNote({ game: generated, contestants: correct.contestants }), 'Madison should pick the next question.');

  const missed = game.applyNoBuzzForClue({
    contestants: correct.contestants,
    clue: secondClue,
    now: '2026-06-21T01:01:00.000Z',
  });
  generated.categories[1].clues[0] = missed.clue;
  const longNote = game.getNextPickerNote({ game: generated, contestants: missed.contestants });
  assert.equal(longNote, 'No full-credit answer last time; host may choose the next question.');
  assert.equal(game.getNextPickerNoteScale('Host may choose the first question.'), 1);
  assert.equal(game.getNextPickerNoteScale('The full-credit player should pick the next question.'), 0.96);
  assert.equal(game.getNextPickerNoteScale(longNote), 0.94);
});

test('builds OpenAI-compatible prompts that constrain NTW to the supplied lesson material and selected difficulty', () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
    difficultyLevel: 'child',
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Navigate The Way/i);
  assert.match(messages[0].content, /Do not quote Scripture from memory/i);
  assert.match(messages[0].content, /user supplied content/i);
  assert.match(messages[0].content, /Bible content that NTW has access to/i);
  assert.match(messages[0].content, /\*\*WHEN NO SOURCE CONTENT FILES ARE PROVIDED, YOU MUST SPECIFICALLY ENGINEER EACH CLUE SO ITS EXPECTED CORRECTRESPONSE IS GROUNDED IN NTW-ACCESSIBLE SCRIPTURE\/BIBLE CONTENT THAT FITS THE LEADER-PROVIDED TOPIC OR SUMMARY; DO NOT GENERATE GENERIC CHRISTIAN-LIFE ANSWERS THAT THE CITED PASSAGE DOES NOT DIRECTLY SUPPORT\.\*\*/);
  assert.match(messages[0].content, /\*\*WHEN SOURCE CONTENT FILES ARE PROVIDED, YOU MUST SPECIFICALLY ENGINEER EACH CLUE SO ITS EXPECTED CORRECTRESPONSE IS GROUNDED IN USER-SUPPLIED SOURCE FILE CONTENT, NTW-ACCESSIBLE BIBLE CONTENT, OR BOTH; DO NOT REQUIRE EVERY CLUE TO BE FILE-GROUNDED, BUT ANY BIBLE-BASED QUESTION ANSWER MUST BE GROUNDED IN A SPECIFIC SCRIPTURE PASSAGE CITED IN THE SOURCEANCHOR\.\*\*/);
  assert.match(messages[0].content, /Every clue\/answer pair is valid only/i);
  assert.match(messages[0].content, /merely abstract/i);
  assert.match(messages[0].content, /expected answers that are not supported/i);
  assert.match(messages[0].content, /leader-provided focus instructions/i);
  assert.match(messages[0].content, /shape the game board emphasis/i);
  assert.match(messages[0].content, /do not treat focus instructions as new lesson facts/i);
  assert.match(messages[0].content, /theological complexity and wording readability/i);
  assert.match(messages[0].content, /Flesch-Kincaid grade range/i);
  assert.match(messages[1].content, /Berean Board lesson game board/i);
  assert.match(messages[1].content, /exactly 5 categories/i);
  assert.match(messages[1].content, /Ada, Boaz, Chloe, Daniel/);
  assert.match(messages[1].content, /Difficulty level: Child/);
  assert.match(messages[1].content, /Difficulty name: Little Lamb/);
  assert.match(messages[1].content, /Target Flesch-Kincaid grade level: Grade 1-2/);
  assert.match(messages[1].content, /theological complexity and readability/i);
  assert.match(messages[1].content, /age-appropriate in substance/i);
  assert.match(messages[1].content, /directly grounded in user supplied content, NTW-accessible Bible content, or both/i);
  assert.match(messages[1].content, /- \*\*WHEN NO SOURCE CONTENT FILES ARE PROVIDED, YOU MUST SPECIFICALLY ENGINEER EACH CLUE SO ITS EXPECTED CORRECTRESPONSE IS GROUNDED IN NTW-ACCESSIBLE SCRIPTURE\/BIBLE CONTENT THAT FITS THE LEADER-PROVIDED TOPIC OR SUMMARY; DO NOT GENERATE GENERIC CHRISTIAN-LIFE ANSWERS THAT THE CITED PASSAGE DOES NOT DIRECTLY SUPPORT\.\*\*/);
  assert.match(messages[1].content, /- \*\*WHEN SOURCE CONTENT FILES ARE PROVIDED, YOU MUST SPECIFICALLY ENGINEER EACH CLUE SO ITS EXPECTED CORRECTRESPONSE IS GROUNDED IN USER-SUPPLIED SOURCE FILE CONTENT, NTW-ACCESSIBLE BIBLE CONTENT, OR BOTH; DO NOT REQUIRE EVERY CLUE TO BE FILE-GROUNDED, BUT ANY BIBLE-BASED QUESTION ANSWER MUST BE GROUNDED IN A SPECIFIC SCRIPTURE PASSAGE CITED IN THE SOURCEANCHOR\.\*\*/);
  assert.match(messages[1].content, /if its expected answer cannot be defended/i);
  assert.match(messages[1].content, /User supplied content: \/ Bible content: \/ User supplied content \+ Bible content:/);
  assert.match(messages[1].content, /sourceAnchor must begin/i);
  assert.match(messages[1].content, /specific passage reference such as Romans 8:15 or Psalm 23/i);
  assert.match(messages[1].content, /Do not name leader focus instructions as the grounding source/i);
  assert.match(messages[1].content, /Lesson material about Romans 8/);
});

test('preserves leader focus instructions when long uploaded lessons are truncated', () => {
  const focusInstructions = 'Focus especially on prayer, dependence on Christ, and group application.';
  const lessonContent = [
    'UPLOADED LESSON FILES:',
    'A'.repeat(game.MAX_LESSON_CHARS + 1000),
    '',
    '---',
    '',
    'LEADER-PROVIDED FOCUS INSTRUCTIONS FOR THIS GAME:',
    focusInstructions,
  ].join('\n');

  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz'],
    lessonContent,
  });
  const lessonBlock = messages[1].content.match(/<<<LESSON_CONTENT_START>>>([\s\S]*)<<<LESSON_CONTENT_END>>>/)[1];

  assert.match(messages[1].content, /NOTE: The supplied lesson material was truncated/);
  assert.match(lessonBlock, /UPLOADED LESSON FILES:/);
  assert.match(lessonBlock, /LEADER-PROVIDED FOCUS INSTRUCTIONS FOR THIS GAME:/);
  assert.match(lessonBlock, new RegExp(focusInstructions));
  assert.ok(lessonBlock.trim().length <= game.MAX_LESSON_CHARS);
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
  assert.equal(body.response_format.json_schema.name, 'ntw_berean_board');
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

test('builds NTW scope-check prompts for Berean Board lesson material', () => {
  const messages = game.buildBereanBoardScopeCheckMessages({
    lessonContent: 'Baseball standings, ballpark trivia, and World Series facts with no Christian teaching connection.',
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Navigate The Way/i);
  assert.match(messages[0].content, /Berean Board/i);
  assert.match(messages[0].content, /not a generic trivia game/i);
  assert.match(messages[0].content, /Scripture, Theology, Christian Life, Worldview, Ministry, or Biblical Studies/i);
  assert.match(messages[0].content, /meaningfully connects/i);
  assert.match(messages[1].content, /<<<LESSON_CONTENT_START>>>/);
  assert.match(messages[1].content, /Baseball standings/);
});

test('builds schema-enforced scope-check request bodies', () => {
  const body = game.buildBereanBoardScopeCheckChatCompletionsBody({
    model: game.DEFAULT_MODEL,
    lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
  });

  assert.equal(body.model, 'openai/gpt/5.4');
  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
  assert.equal(body.max_completion_tokens <= 250, true);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'ntw_berean_board_scope_check');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['isInScope', 'matchedAreas', 'reason']);
  assert.deepEqual(
    body.response_format.json_schema.schema.properties.matchedAreas.items.enum,
    ['Scripture', 'Theology', 'Christian Life', 'Worldview', 'Ministry', 'Biblical Studies']
  );
});

test('parses NTW Berean Board scope-check responses', () => {
  assert.deepEqual(
    game.parseBereanBoardScopeCheckResponse({ response: '{"isInScope":true,"matchedAreas":["Scripture","Theology"],"reason":"Romans 8 and adoption in Christ."}' }),
    { isInScope: true, matchedAreas: ['Scripture', 'Theology'], reason: 'Romans 8 and adoption in Christ.' }
  );
  assert.deepEqual(
    game.parseBereanBoardScopeCheckResponse({ data: { response: '```json\n{"isInScope":false,"matchedAreas":[],"reason":"Generic sports trivia."}\n```' } }),
    { isInScope: false, matchedAreas: [], reason: 'Generic sports trivia.' }
  );
});

test('builds schema-enforced grounding-check request bodies', () => {
  const generatedGame = game.normalizeGeneratedGame(sampleGeneratedGame());
  const body = game.buildBereanBoardGroundingCheckChatCompletionsBody({
    model: game.DEFAULT_MODEL,
    lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
    generatedGame,
  });

  assert.equal(body.model, 'openai/gpt/5.4');
  assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'ntw_berean_board_grounding_check');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['isGrounded', 'invalidClues', 'reason']);
  assert.deepEqual(
    body.response_format.json_schema.schema.properties.invalidClues.items.required,
    ['categoryTitle', 'clueValue', 'clue', 'reason']
  );
  assert.match(body.messages[0].content, /Treat sourceAnchor labels as claims/i);
  assert.match(body.messages[0].content, /expected correctResponse is grounded/i);
  assert.match(body.messages[0].content, /user supplied content, Bible content NTW can access through the configured Bible source, or both/i);
  assert.match(body.messages[0].content, /Reject Bible-grounded clues when the sourceAnchor does not identify a Bible passage reference/i);
  assert.match(body.messages[1].content, /<<<GENERATED_BOARD_START>>>/);
  assert.match(body.messages[1].content, /Response 1-1/);
});

test('builds repair prompts that replace only ungrounded Berean Board clues', () => {
  const generatedGame = game.normalizeGeneratedGame(sampleGeneratedGame());
  const groundingCheck = {
    isGrounded: false,
    invalidClues: [
      {
        categoryTitle: generatedGame.categories[0].title,
        clueValue: 100,
        clue: generatedGame.categories[0].clues[0].clue,
        reason: 'The expected answer is too abstract for the cited passage.',
      },
    ],
    reason: 'One answer is unsupported.',
  };
  const body = game.buildBereanBoardGroundingRepairChatCompletionsBody({
    model: game.DEFAULT_MODEL,
    contestantNames: ['Ada', 'Boaz'],
    lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
    difficultyLevel: 'adult',
    generatedGame,
    groundingCheck,
    repairAttempt: 1,
    maxRepairAttempts: 2,
  });

  assert.equal(body.response_format.json_schema.name, 'ntw_berean_board_grounding_repair');
  assert.equal(body.max_completion_tokens, 2400);
  assert.match(body.messages[0].content, /self-healing/i);
  assert.match(body.messages[0].content, /Return ONLY a JSON object containing replacement clue\/answer pairs/i);
  assert.match(body.messages[0].content, /Do not regenerate or return the entire board/i);
  assert.match(body.messages[0].content, /Do not change clues that were not flagged/i);
  assert.match(body.messages[0].content, /Every repaired clue\/answer pair is valid only/i);
  assert.match(body.messages[1].content, /Repair attempt: 1 of 2/);
  assert.match(body.messages[1].content, /<<<REPAIR_TARGETS_START>>>/);
  assert.match(body.messages[1].content, /too abstract for the cited passage/);
  assert.doesNotMatch(body.messages[1].content, /<<<GENERATED_BOARD_START>>>/);
  assert.match(body.messages[1].content, /Romans 8/);
});

test('builds repair-only grounding-check prompts that omit already-validated clues', () => {
  const generatedGame = game.normalizeGeneratedGame(sampleGeneratedGame());
  const repairedClue = {
    categoryTitle: generatedGame.categories[0].title,
    clueValue: 100,
    clue: 'According to Romans 8:15, what family relationship have believers received?',
    correctResponse: 'Adoption as God’s children',
    explanation: 'Romans 8:15 says believers receive the Spirit of adoption.',
    sourceAnchor: 'Bible content: Romans 8:15',
  };
  const repairedGame = game.applyBereanBoardGroundingRepairReplacements(generatedGame, [repairedClue], [{
    categoryTitle: generatedGame.categories[0].title,
    clueValue: 100,
    clue: generatedGame.categories[0].clues[0].clue,
    reason: 'Unsupported answer.',
  }]);
  const reviewSubset = game.buildBereanBoardGroundingReviewSubset(repairedGame, [repairedClue]);
  const body = game.buildBereanBoardGroundingCheckChatCompletionsBody({
    model: game.DEFAULT_MODEL,
    lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
    generatedGame: reviewSubset,
    reviewScope: 'repaired-clues',
  });

  assert.match(body.messages[0].content, /Review ONLY the newly repaired replacement clues/i);
  assert.match(body.messages[0].content, /Do not re-audit omitted clues/i);
  assert.match(body.messages[1].content, /Newly repaired Berean Board clue JSON/);
  assert.match(body.messages[1].content, /Adoption as God’s children/);
  assert.doesNotMatch(body.messages[1].content, /Response 1-2/);
});

test('parses NTW Berean Board grounding-check responses', () => {
  assert.deepEqual(
    game.parseBereanBoardGroundingCheckResponse({ response: '{"isGrounded":true,"invalidClues":[],"reason":"Every clue is supported."}' }),
    { isGrounded: true, invalidClues: [], reason: 'Every clue is supported.' }
  );
  assert.deepEqual(
    game.parseBereanBoardGroundingCheckResponse({ data: { response: '```json\n{"isGrounded":false,"invalidClues":[{"categoryTitle":"Adoption","clueValue":100,"clue":"What abstract idea?","reason":"Not supported by supplied content."}],"reason":"One answer is unsupported."}\n```' } }),
    {
      isGrounded: false,
      invalidClues: [{ categoryTitle: 'Adoption', clueValue: 100, clue: 'What abstract idea?', reason: 'Not supported by supplied content.' }],
      reason: 'One answer is unsupported.',
    }
  );
});

test('parses NTW Berean Board grounding-repair responses', () => {
  assert.deepEqual(
    game.parseBereanBoardGroundingRepairResponse({
      response: '{"replacements":[{"categoryTitle":"Category 1","clueValue":100,"clue":"According to Romans 8:15, what family relationship have believers received?","correctResponse":"Adoption as God’s children","explanation":"Romans 8:15 says believers received the Spirit of adoption.","sourceAnchor":"Bible content: Romans 8:15"}],"reason":"Replaced one unsupported answer."}',
    }),
    {
      replacements: [{
        categoryTitle: 'Category 1',
        clueValue: 100,
        clue: 'According to Romans 8:15, what family relationship have believers received?',
        correctResponse: 'Adoption as God’s children',
        explanation: 'Romans 8:15 says believers received the Spirit of adoption.',
        sourceAnchor: 'Bible content: Romans 8:15',
      }],
      reason: 'Replaced one unsupported answer.',
    }
  );
});

test('runs NTW scope check before board generation and blocks out-of-scope material', async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        response: '{"isInScope":false,"matchedAreas":[],"reason":"Generic sports trivia."}',
      }),
    };
  };

  try {
    await assert.rejects(
      () => game.callScopedBereanBoardGenerationApi({
        endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
        apiKey: 'test-key',
        model: game.DEFAULT_MODEL,
        contestantNames: ['Ada', 'Boaz'],
        lessonContent: 'Baseball standings, ballpark trivia, and World Series facts.',
        difficultyLevel: 'adult',
      }),
      /outside Berean Board’s scope and purpose/i
    );

    assert.equal(requestBodies.length, 1, 'out-of-scope material must not trigger game-board generation');
    assert.equal(requestBodies[0].response_format.json_schema.name, 'ntw_berean_board_scope_check');
    assert.notEqual(requestBodies[0].response_format.json_schema.name, 'ntw_berean_board');
  } finally {
    global.fetch = originalFetch;
  }
});

test('generates the board only after NTW approves in-scope lesson material', async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];
  const generationEvents = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const schemaName = body.response_format.json_schema.name;
    requestBodies.push(body);
    generationEvents.push(`request:${schemaName}`);
    if (schemaName === 'ntw_berean_board_scope_check') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"isInScope":true,"matchedAreas":["Scripture","Theology"],"reason":"Romans 8 and adoption in Christ."}',
        }),
      };
    }
    if (schemaName === 'ntw_berean_board_grounding_check') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"isGrounded":true,"invalidClues":[],"reason":"Every clue answer is grounded."}',
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
    const parsed = await game.callScopedBereanBoardGenerationApi({
      endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
      apiKey: 'test-key',
      model: game.DEFAULT_MODEL,
      contestantNames: ['Ada', 'Boaz'],
      lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
      difficultyLevel: 'adult',
      onScopeAccepted: (scopeCheck) => {
        generationEvents.push(`accepted:${scopeCheck.matchedAreas.join(',')}`);
      },
      onGroundingCheckStarted: (_generatedGame, checkInfo) => {
        generationEvents.push(`grounding-started:${checkInfo.repairAttempt}`);
      },
    });

    assert.equal(parsed.categories.length, 5);
    assert.equal(requestBodies.length, 3);
    assert.equal(requestBodies[0].response_format.json_schema.name, 'ntw_berean_board_scope_check');
    assert.equal(requestBodies[1].response_format.json_schema.name, 'ntw_berean_board');
    assert.equal(requestBodies[2].response_format.json_schema.name, 'ntw_berean_board_grounding_check');
    assert.deepEqual(generationEvents, [
      'request:ntw_berean_board_scope_check',
      'accepted:Scripture,Theology',
      'request:ntw_berean_board',
      'grounding-started:0',
      'request:ntw_berean_board_grounding_check',
    ]);
    assert.match(requestBodies[1].messages[1].content, /Romans 8/);
    assert.match(requestBodies[2].messages[1].content, /Generated Berean Board JSON/);
    assert.match(requestBodies[2].messages[1].content, /Response 1-1/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('repairs only flagged answers and validates only the replacements', async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];
  const generationEvents = [];
  let boardRequestCount = 0;
  let groundingRequestCount = 0;
  const initialGame = sampleGeneratedGame();
  initialGame.categories[0].clues[0].clue = 'What abstract virtue should believers admire?';
  initialGame.categories[0].clues[0].correctResponse = 'Abstract admiration';
  initialGame.categories[0].clues[0].sourceAnchor = 'Bible content: Romans 8:15';
  const replacement = {
    categoryTitle: initialGame.categories[0].title,
    clueValue: 100,
    clue: 'According to Romans 8:15, what family relationship have believers received? ',
    correctResponse: 'Adoption as God’s children',
    explanation: 'Romans 8:15 says believers received the Spirit of adoption.',
    sourceAnchor: 'Bible content: Romans 8:15',
  };

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const schemaName = body.response_format.json_schema.name;
    requestBodies.push(body);
    generationEvents.push(`request:${schemaName}`);
    if (schemaName === 'ntw_berean_board_scope_check') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: '{"isInScope":true,"matchedAreas":["Scripture"],"reason":"Romans 8 lesson."}' }),
      };
    }
    if (schemaName === 'ntw_berean_board_grounding_check') {
      groundingRequestCount += 1;
      const response = groundingRequestCount === 1
        ? '{"isGrounded":false,"invalidClues":[{"categoryTitle":"Category 1","clueValue":100,"clue":"What abstract virtue should believers admire?","reason":"The expected answer is not grounded in supplied content or a cited Bible passage."}],"reason":"One answer was unsupported."}'
        : '{"isGrounded":true,"invalidClues":[],"reason":"The repaired answer is grounded."}';
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response }),
      };
    }
    if (schemaName === 'ntw_berean_board_grounding_repair') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: JSON.stringify({ replacements: [replacement], reason: 'Replaced the unsupported answer.' }) }),
      };
    }
    boardRequestCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: JSON.stringify(initialGame) }),
    };
  };

  try {
    const parsed = await game.callScopedBereanBoardGenerationApi({
      endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
      apiKey: 'test-key',
      model: game.DEFAULT_MODEL,
      contestantNames: ['Ada', 'Boaz'],
      lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
      difficultyLevel: 'adult',
      onScopeAccepted: (scopeCheck) => {
        generationEvents.push(`accepted:${scopeCheck.matchedAreas.join(',')}`);
      },
      onGroundingCheckStarted: (_generatedGame, checkInfo) => {
        generationEvents.push(`grounding-started:${checkInfo.repairAttempt}:${checkInfo.reviewScope}`);
      },
      onGroundingRepairStarted: (groundingCheck, repairInfo) => {
        generationEvents.push(`repair-started:${repairInfo.repairAttempt}:${groundingCheck.invalidClues.length}`);
      },
    });

    assert.equal(parsed.categories[0].clues[0].correctResponse, 'Adoption as God’s children');
    assert.equal(parsed.categories[0].clues[1].correctResponse, 'Response 1-2');
    assert.equal(boardRequestCount, 1, 'repair must not requery for a full replacement board');
    assert.deepEqual(
      requestBodies.map((body) => body.response_format.json_schema.name),
      [
        'ntw_berean_board_scope_check',
        'ntw_berean_board',
        'ntw_berean_board_grounding_check',
        'ntw_berean_board_grounding_repair',
        'ntw_berean_board_grounding_check',
      ]
    );
    assert.deepEqual(generationEvents, [
      'request:ntw_berean_board_scope_check',
      'accepted:Scripture',
      'request:ntw_berean_board',
      'grounding-started:0:full-board',
      'request:ntw_berean_board_grounding_check',
      'repair-started:1:1',
      'request:ntw_berean_board_grounding_repair',
      'grounding-started:1:repaired-clues',
      'request:ntw_berean_board_grounding_check',
    ]);
    assert.match(requestBodies[3].messages[0].content, /Do not regenerate or return the entire board/i);
    assert.match(requestBodies[3].messages[1].content, /What abstract virtue should believers admire/);
    assert.doesNotMatch(requestBodies[3].messages[1].content, /Response 1-2/);
    assert.match(requestBodies[4].messages[0].content, /Review ONLY the newly repaired replacement clues/i);
    assert.match(requestBodies[4].messages[1].content, /Adoption as God’s children/);
    assert.doesNotMatch(requestBodies[4].messages[1].content, /Response 1-2/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('blocks generated boards only after selective grounding repair attempts are exhausted', async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];
  const replacement = {
    categoryTitle: 'Category 1',
    clueValue: 100,
    clue: 'What still unsupported answer?',
    correctResponse: 'Still unsupported',
    explanation: 'Still not grounded.',
    sourceAnchor: 'Bible content: Romans 8:15',
  };
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const schemaName = body.response_format.json_schema.name;
    requestBodies.push(body);
    if (schemaName === 'ntw_berean_board_scope_check') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: '{"isInScope":true,"matchedAreas":["Scripture"],"reason":"Romans 8 lesson."}' }),
      };
    }
    if (schemaName === 'ntw_berean_board_grounding_check') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: '{"isGrounded":false,"invalidClues":[{"categoryTitle":"Category 1","clueValue":100,"clue":"What abstract virtue should believers admire?","reason":"The expected answer is not grounded in supplied content or a cited Bible passage."}],"reason":"One answer was unsupported."}',
        }),
      };
    }
    if (schemaName === 'ntw_berean_board_grounding_repair') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: JSON.stringify({ replacements: [replacement], reason: 'Tried replacing it.' }) }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: JSON.stringify(sampleGeneratedGame()) }),
    };
  };

  try {
    await assert.rejects(
      () => game.callScopedBereanBoardGenerationApi({
        endpoint: game.DEFAULT_CHAT_COMPLETIONS_ENDPOINT,
        apiKey: 'test-key',
        model: game.DEFAULT_MODEL,
        contestantNames: ['Ada', 'Boaz'],
        lessonContent: 'Romans 8, adoption in Christ, assurance, and prayer.',
        difficultyLevel: 'adult',
        maxGroundingRepairAttempts: 1,
      }),
      /tried 1 repair attempt/i
    );

    assert.deepEqual(
      requestBodies.map((body) => body.response_format.json_schema.name),
      [
        'ntw_berean_board_scope_check',
        'ntw_berean_board',
        'ntw_berean_board_grounding_check',
        'ntw_berean_board_grounding_repair',
        'ntw_berean_board_grounding_check',
      ]
    );
    assert.match(requestBodies[4].messages[0].content, /Review ONLY the newly repaired replacement clues/i);
    assert.doesNotMatch(requestBodies[4].messages[1].content, /Response 1-2/);
  } finally {
    global.fetch = originalFetch;
  }
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
