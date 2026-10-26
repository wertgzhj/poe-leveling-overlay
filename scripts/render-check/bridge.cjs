// The render check's stand-in for electron/preload.ts: window.overlay answers
// from one scenario (scenarios.ts) instead of the main process. Subscriptions
// never fire and actions do nothing — a still picture, not a running app.
const { readFileSync } = require('node:fs')

const arg = process.argv.find((a) => a.startsWith('--render-scenario='))
const [file, index] = arg.slice('--render-scenario='.length).split('#')
const s = JSON.parse(readFileSync(file, 'utf8'))[Number(index)]

const ok = (v) => Promise.resolve(v)
const answers = {
  getState: () => ok({ visible: true, clickThrough: false, moveMode: !!s.moveMode, settingsOpen: !!s.settings }),
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
        events: { trial: false, gems: false, zone: false, lab: false, choice: false, passive: false }
      }
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
