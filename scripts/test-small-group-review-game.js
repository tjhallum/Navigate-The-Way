const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const game = require('../docs/small-group-review-game.js');
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

function makeLessonFile(name, type, text) {
  return {
    name,
    type,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

function createFakeAudioRoot(log) {
  let nodeId = 0;

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
      this.state = 'suspended';
      this.destination = { kind: 'destination' };
      log.push(['context.constructor']);
    }

    resume() {
      this.state = 'running';
      log.push(['context.resume']);
      return Promise.resolve();
    }

    createGain() {
      return new FakeGainNode();
    }

    createOscillator() {
      return new FakeOscillatorNode();
    }

    createBiquadFilter() {
      return new FakeFilterNode();
    }

    createDynamicsCompressor() {
      return new FakeCompressorNode();
    }
  }

  return { AudioContext: FakeAudioContext };
}

test('supports common lesson upload file types used by small groups', () => {
  const supported = [
    ['lesson.pdf', 'application/pdf'],
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

  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');

  assert.match(html, /<ul id="lesson-file-list" class="lesson-file-list" aria-label="Selected lesson files" hidden><\/ul>/);
  assert.match(html, /Supported: \.txt, \.md, \.markdown, \.rtf, \.html, \.htm, \.json, \.xml, \.yaml, \.yml, \.tex, \.pdf, \.doc, \.docx, \.odt, \.pages, \.ppt, \.pptx, \.odp, \.key, \.csv, \.xls, \.xlsx, \.ods/);
  ['.doc', '.docx', '.odt', '.pages', '.ppt', '.pptx', '.odp', '.key', '.csv', '.xls', '.xlsx', '.ods', '.xml', '.yaml', '.yml', '.tex'].forEach((extension) => {
    assert.match(html, new RegExp(extension.replace('.', '\\.')));
  });
  assert.match(html, /accept="[^"]*\.txt[^"]*\.md[^"]*\.markdown[^"]*\.rtf[^"]*\.html[^"]*\.htm[^"]*\.json[^"]*\.xml[^"]*\.yaml[^"]*\.yml[^"]*\.tex[^"]*\.pdf[^"]*\.doc[^"]*\.docx[^"]*\.odt[^"]*\.pages[^"]*\.ppt[^"]*\.pptx[^"]*\.odp[^"]*\.key[^"]*\.csv[^"]*\.xls[^"]*\.xlsx[^"]*\.ods/);
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

test('virtual first-buzz host flow primes and plays the synthesized buzzer sound only for remote buzzes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');

  assert.match(html, /host screen will play a clear buzzer sound when a remote player buzzes in first/);
  assert.match(js, /const hostBuzzerAudio = createHostBuzzerAudioController\(\)/);

  const firstBuzzStart = js.indexOf('function handleVirtualFirstBuzz(firstBuzz)');
  const firstBuzzEnd = js.indexOf('function handleVirtualBuzzerBuzzUpdate', firstBuzzStart);
  const firstBuzzHandler = js.slice(firstBuzzStart, firstBuzzEnd);
  assert.match(firstBuzzHandler, /if \(virtualBuzzerFirstHandledKey === key\) return;/);
  assert.ok(
    firstBuzzHandler.indexOf('virtualBuzzerFirstHandledKey = key;') < firstBuzzHandler.indexOf('hostBuzzerAudio.play();'),
    'the sound should play only after the first-buzz event is accepted as new'
  );
  assert.ok(
    firstBuzzHandler.indexOf('hostBuzzerAudio.play();') < firstBuzzHandler.indexOf('disableVirtualBuzzersForHost();'),
    'the host should hear the buzz before the Firebase best-effort lock runs'
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
  assert.deepEqual(session.buzz, { open: false, first: null, lockedOutPlayerIndexes: {} });

  assert.equal(
    virtualBuzzers.buildVirtualBuzzerJoinUrl({
      origin: 'https://www.navtheway.com',
      pathname: '/small-group-review-game',
      sessionId: 'session_abc123',
    }),
    'https://www.navtheway.com/small-group-review-game?mode=buzz&session=session_abc123'
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
  });

  assert.deepEqual(writes[0], ['transaction', 'sessions/session123456/buzzRound']);
  assert.equal(writes[1][0], 'update');
  assert.equal(writes[1][1], 'sessions/session123456');
  assert.deepEqual(writes[1][2], {
    status: 'open',
    buzz: {
      open: true,
      first: null,
      lockedOutPlayerIndexes: { 1: true },
    },
  });

  assert.equal(result.committed, true);
  assert.equal(result.snapshot.val().buzzRound, 3);
});

test('start over returns leaders to group setup before rebuilding a game', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');

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
  assert.match(html, /<button id="generate-game-button" type="submit" class="primary-action">Generate Game Board<\/button>/);
  assert.doesNotMatch(html, /Generate Review Game/);
  assert.match(html, /<p id="clue-verdict" class="clue-verdict"[^>]*hidden><\/p>/);
  assert.match(html, /<div id="active-clue-review" class="answer-box clue-review" hidden><\/div>/);
  assert.match(html, /<button id="no-buzz-button" type="button">No one buzzed in<\/button>/);
  assert.match(html, /<button id="close-clue-button" type="button">Back to Board<\/button>/);
  assert.doesNotMatch(html, /<button id="close-clue-button" type="button">Close<\/button>/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css\?v=20260619-completed-review" \/>/);
  assert.match(html, /<script src="firebase-config\.js\?v=20260619-app-check"><\/script>/);
  assert.match(html, /<script src="virtual-buzzer-service\.js\?v=20260619-app-check"><\/script>/);
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js"/);
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/1\.4\.4\/qrcode\.min\.js"/);
  assert.match(html, /<script src="small-group-review-game\.js\?v=20260620-file-drag-detection"><\/script>/);
  assert.doesNotMatch(html, /small-group-review-game\.js\?v=20260619-lesson-files/);
  assert.doesNotMatch(html, /small-group-review-game\.js\?v=20260619-partial-awards/);
  assert.doesNotMatch(html, /small-group-review-game\.js\?v=20260619-host-buzzer-audio/);
  assert.doesNotMatch(html, /small-group-review-game\.js\?v=20260619-player-name-selection/);
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
  assert.match(rules, /newData\.child\('round'\)\.val\(\) === data\.parent\(\)\.parent\(\)\.child\('buzzRound'\)\.val\(\)/);
  const parsedRules = JSON.parse(rules).rules.sessions.$sessionId;
  assert.equal(Object.hasOwn(parsedRules.playerNames, '$playerIndex'), false);
  assert.equal(Object.hasOwn(parsedRules.playerClaims, '$playerIndex'), false);
  assert.equal(Object.hasOwn(parsedRules.buzz.lockedOutPlayerIndexes, '$playerIndex'), false);
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'small-group-review-game.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '..', 'docs', 'virtual-buzzer-service.js'), 'utf8');

  assert.match(html, /<section id="virtual-buzzer-player-screen" class="virtual-buzzer-player-screen" hidden>/);
  assert.match(html, /<button id="virtual-buzzer-button" type="button" class="virtual-buzzer-button" disabled>BUZZ<\/button>/);
  assert.match(html, /<section id="virtual-buzzer-game-panel" class="virtual-buzzer-game-panel" hidden>/);
  assert.match(html, /<p id="virtual-buzzer-first" class="virtual-buzzer-first" aria-live="polite" hidden><\/p>/);
  assert.match(js, /const virtualBuzzerService = ROOT\.NTWVirtualBuzzerService/);
  assert.match(js, /function initializeVirtualBuzzerPlayerScreen/);
  assert.match(js, /function createVirtualBuzzerHostSession/);
  assert.match(js, /function openVirtualBuzzersForActiveClue/);
  assert.match(js, /function handleVirtualFirstBuzz/);
  assert.match(js, /function resetVirtualBuzzersForNextAttempt/);
  assert.match(js, /function closeVirtualSession/);
  assert.match(js, /if \(isVirtualBuzzerPlayerRoute\(window\.location\)\)/);
  assert.match(js, /virtualBuzzerPlayerClaim = session\.claims\?\.find\(\(claim\) => claim\?\.uid === virtualBuzzerPlayerContext\?\.uid\) \|\| null/);
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

  assert.match(cssRule(css, '.setup-step'), /border:\s*1px solid rgba\(122, 168, 255, 0\.24\)/);
  assert.match(cssRule(css, '.setup-step-toggle'), /justify-content:\s*space-between/);
  assert.match(cssRule(css, '.setup-step--collapsed'), /opacity:\s*0\.82/);
  assert.match(cssRule(css, '.setup-step--locked'), /opacity:\s*0\.58/);
  assert.match(cssRule(css, '.setup-step-toggle:disabled'), /cursor:\s*not-allowed/);
  assert.match(cssRule(css, '.setup-step-status'), /text-transform:\s*uppercase/);
  assert.match(cssRule(css, '.buzzer-mode-options'), /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 260px\), 1fr\)\)/);
  assert.match(cssRule(css, '.virtual-buzzer-first strong'), /color:\s*var\(--virtual-buzzer-player-color, #ffce48\)/);
  assert.match(cssRule(css, '.virtual-buzzer-button'), /min-height:\s*12rem/);
  assert.match(cssRule(css, '.difficulty-options'), /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\)/);
  assert.match(cssRule(css, '.difficulty-option'), /grid-template-columns:\s*auto max-content minmax\(0, 1fr\)/);
  assert.match(cssRule(css, '.difficulty-option'), /padding:\s*0\.72rem 0\.52rem 0\.72rem 0\.78rem/);
  assert.match(cssRule(css, '.difficulty-option'), /text-align:\s*left/);
  assert.match(cssRule(css, '.difficulty-option__art'), /grid-column:\s*3/);
  assert.match(cssRule(css, '.difficulty-option__art'), /justify-self:\s*center/);
  assert.match(cssRule(css, '.difficulty-option__art'), /width:\s*min\(5\.65rem, 100%\)/);
  assert.match(cssRule(css, '.difficulty-option__art'), /aspect-ratio:\s*1/);
  assert.match(cssRule(css, '.difficulty-option__art--portrait'), /aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(cssRule(css, '.difficulty-option__svg'), /width:\s*100%/);
  assert.match(cssRule(css, '.difficulty-option__svg--storybook'), /overflow:\s*visible/);
  assert.match(cssRule(css, '.difficulty-option__grade'), /font-weight:\s*650/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*grid-template-columns:\s*auto max-content minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.difficulty-option__name,\s*\.difficulty-option__grade\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;/);
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
  assert.match(partialOnlyReview.creditSummary, /Ada received \$20 partial credit\./);
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

test('reviews uneven partial-credit awards with each contestant’s actual points', () => {
  const contestants = game.createContestants(['Ada', 'Boaz', 'Chloe']);
  const clue = game.normalizeGeneratedGame(sampleGeneratedGame()).categories[0].clues[0];
  const smallPartial = game.applyAnswerJudgment({
    contestants,
    clue,
    contestantId: 'contestant-1',
    judgment: { verdict: 'partial', partialCreditFraction: 0.1 },
  });
  const defaultPartial = game.applyAnswerJudgment({
    contestants: smallPartial.contestants,
    clue: smallPartial.clue,
    contestantId: 'contestant-2',
    judgment: { verdict: 'partial' },
  });
  const completed = game.applyAnswerJudgment({
    contestants: defaultPartial.contestants,
    clue: defaultPartial.clue,
    contestantId: 'contestant-3',
    judgment: { verdict: 'incorrect' },
  });

  assert.equal(completed.clue.partialCreditAwarded, 30);
  const review = game.buildCompletedClueReviewPresentation({
    clue: completed.clue,
    contestants: completed.contestants,
  });

  assert.match(review.creditSummary, /Ada received \$10 partial credit\./);
  assert.match(review.creditSummary, /Boaz received \$20 partial credit\./);
  assert.doesNotMatch(review.creditSummary, /Ada received \$15 partial credit\./);
  assert.doesNotMatch(review.creditSummary, /Boaz received \$15 partial credit\./);
  assert.match(review.creditSummary, /Chloe attempted without receiving credit\./);
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
  assert.doesNotMatch(copy, new RegExp(`\\b${['jeop', 'ardy'].join('')}\\b`, 'i'));
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

test('builds OpenAI-compatible prompts that constrain NTW to the supplied lesson material and selected difficulty', () => {
  const messages = game.buildOpenAiMessages({
    contestantNames: ['Ada', 'Boaz', 'Chloe', 'Daniel'],
    lessonContent: 'Lesson material about Romans 8 and adoption in Christ.',
    difficultyLevel: 'child',
  });

  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Navigate The Way/i);
  assert.match(messages[0].content, /Do not quote Scripture from memory/i);
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
