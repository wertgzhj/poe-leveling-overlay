// The render check's stand-in for electron/preload.ts: window.overlay answers
// from one scenario (scenarios.ts) instead of the main process. Subscriptions
// never fire and actions do nothing — a still picture, not a running app.
const { readFileSync } = require('node:fs')

const arg = process.argv.find((a) => a.startsWith('--render-scenario='))
const [file, index] = arg.slice('--render-scenario='.length).split('#')
const s = JSON.parse(readFileSync(file, 'utf8'))[Number(index)]

const ok = (v) => Promise.resolve(v)
// The strip's text follows the screen's height: draw it for 1440p, whatever
// screen this runs on.
if (s.strip) Object.defineProperty(window.screen, 'height', { get: () => 1440 })
// electron/show-rules.ts SHOW_ALL; a scenario's showFull switches some off
const ALL_SHOWN = Object.fromEntries(
  ['zoneLine', 'zoneFit', 'copyButtons', 'trialHere', 'lab', 'bandit', 'pantheon', 'gemsToGet', 'links', 'passive', 'passiveMap'].map((k) => [k, true])
)
const answers = {
  getState: () =>
    ok({ visible: true, clickThrough: false, moveMode: !!s.moveMode, settingsOpen: !!s.settings, view: s.strip ? 'strip' : 'panel' }),
  getSettings: () =>
    ok({
      bounds: { width: 380, height: 1100 },
      opacity: s.opacity ?? 0.95,
      clickThrough: false,
      hotkeys: {
        toggleVisibility: 'CommandOrControl+Shift+O',
        toggleTimer: 'CommandOrControl+Shift+T',
        toggleClickThrough: 'CommandOrControl+Shift+C',
        toggleMoveMode: 'CommandOrControl+Shift+M',
        toggleFullPanel: 'CommandOrControl+Shift+D',
        stepForward: 'F3',
        stepBack: 'CommandOrControl+Shift+P',
        copyVendor: '',
        copyTree: 'CommandOrControl+Alt+T',
        copyRegex: ''
      },
      clientTxtPath: 'C:/PoE/logs/Client.txt',
      profilePath: null,
      characterName: null,
      logLanguage: 'en',
      visibleTabs: { guide: true, gems: true, trials: true },
      searchRegex: s.regex ?? '',
      actRegexes: s.actRegexes ?? [],
      gemNames: s.gemNames ?? {},
      runTimer: false,
      autoCopyTown: 'off',
      autoCopyLevelUp: 'off',
      autoCopyProtect: true,
      announce: s.announce ?? {
        lang: 'en',
        voice: '',
        volume: 0.8,
        events: { trial: false, gems: false, zone: false, lab: false, bandit: false, pantheon: false, passive: false }
      },
      showFull: { ...ALL_SHOWN, ...s.showFull },
      stripEnabled: !!s.strip,
      showStrip: { ...ALL_SHOWN, pantheon: false, ...s.showStrip },
      stripText: 2,
      panelText: s.panelText ?? 1
    }),
  gemNameList: () => ok(['Cast when Damage Taken Support', 'Melee Physical Damage Support', 'Sunder']),
  getAppInfo: () => ok({ version: '0.0.0', electron: process.versions.electron, isDev: false }),
  getLogSnapshot: () => ok(s.log),
  getProfile: () => ok(s.profile),
  passiveMap: () => ok(s.passiveMap ?? null),
  // a search "just copied" (scenario.copied): its header button lit
  onSearchCopied: (cb) => {
    if (s.copied) setTimeout(() => cb(s.copied), 0)
    return () => {}
  },
  // the editor window (scenario.editor)
  editorLoad: () => ok({ routes: [] }),
  editorLoadProfile: (id) =>
    ok(s.editor && { id, path: 'C:/…/profiles/' + id + '.json', bundled: false, profile: s.editor.profile, errors: [] }),
  editorPassivesCheck: () => ok(s.editor?.passivesCheck ?? null),
  readPob: () => ok(s.pobRead),
  getGuide: () => ok(s.guide),
  getTrials: () => ok(s.trials),
  getUpdateStatus: () => ok({ state: 'current', version: '0.0.0' })
}

window.overlay = new Proxy(answers, {
  get: (target, key) =>
    key in target
      ? target[key]
      : typeof key === 'string' && key.startsWith('on')
        ? () => () => {}
        : () => ok(null)
})
