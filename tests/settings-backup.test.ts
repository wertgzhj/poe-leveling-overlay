import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKUP_KEYS,
  SETTINGS_BACKUP_FORMAT,
  backupChanges,
  exportSettings,
  parseSettingsBackup
} from '../electron/settings-backup.ts'
import { DEFAULT_ANNOUNCE } from '../electron/announce-rules.ts'
import { SHOW_ALL, SHOW_STRIP_DEFAULT } from '../electron/show-rules.ts'
import type { AppSettings } from '../electron/settings.ts'

const settings: AppSettings = {
  bounds: { x: 10, y: 20, width: 340, height: 480 },
  opacity: 0.9,
  clickThrough: true,
  hotkeys: {
    toggleVisibility: 'CommandOrControl+Shift+O',
    toggleTimer: 'CommandOrControl+Shift+T',
    toggleClickThrough: 'CommandOrControl+Shift+C',
    toggleMoveMode: 'CommandOrControl+Shift+M',
    toggleFullPanel: 'CommandOrControl+Shift+D',
    stepForward: 'CommandOrControl+Shift+N',
    stepBack: 'CommandOrControl+Shift+P',
    copyVendor: '',
    copyTree: '',
    copyRegex: ''
  },
  clientTxtPath: 'C:/Users/someone/Path of Exile/logs/Client.txt',
  profilePath: 'C:/Users/someone/AppData/profiles/mine.json',
  characterName: 'MyOwnCharacter',
  logLanguage: 'en',
  visibleTabs: { guide: false, gems: true, trials: true },
  searchRegex: '"r-g-b"',
  actRegexes: [],
  gemNames: { 'Cast when Damage Taken Support': 'CwDT' },
  runTimer: false,
  autoCopyTown: 'vendor',
  autoCopyLevelUp: 'off',
  autoCopyProtect: true,
  announce: DEFAULT_ANNOUNCE,
  showFull: { ...SHOW_ALL, pantheon: false },
  stripEnabled: true,
  showStrip: SHOW_STRIP_DEFAULT,
  stripText: 2,
  panelText: 1.15,
  laterRewards: 10
}

test("a backup carries how you set the overlay up, and nothing that's this PC's or yours", () => {
  const text = exportSettings(settings)
  const file = JSON.parse(text) as { format: string; settings: Record<string, unknown> }
  assert.equal(file.format, SETTINGS_BACKUP_FORMAT)
  assert.deepEqual(Object.keys(file.settings).sort(), Object.keys(BACKUP_KEYS).sort())
  for (const kept of ['clientTxtPath', 'profilePath', 'characterName', 'bounds', 'logLanguage']) {
    assert.equal(kept in file.settings, false, kept)
  }
  assert.doesNotMatch(text, /MyOwnCharacter|someone/)
})

test('a backup reads back as the same settings, and changes nothing', () => {
  const { patch, errors } = parseSettingsBackup(exportSettings(settings))
  assert.deepEqual(errors, [])
  assert.ok(patch)
  assert.equal(patch.gemNames?.['Cast when Damage Taken Support'], 'CwDT')
  assert.deepEqual(backupChanges(settings, patch), [])
})

test('loading says what it would change, by name', () => {
  const other = { ...settings, opacity: 0.6, hotkeys: { ...settings.hotkeys, copyTree: 'F7' } }
  const { patch } = parseSettingsBackup(exportSettings(other))
  assert.ok(patch)
  assert.deepEqual(backupChanges(settings, patch), ['Opacity', 'Hotkeys'])
})

test('only what a backup carries is read; a hand-edited path is ignored', () => {
  const text = JSON.stringify({
    format: SETTINGS_BACKUP_FORMAT,
    settings: { opacity: 0.7, clientTxtPath: 'D:/elsewhere/Client.txt', characterName: 'Someone' }
  })
  assert.deepEqual(parseSettingsBackup(text).patch, { opacity: 0.7 })
})

test("what isn't a backup says why", () => {
  assert.match(parseSettingsBackup('nope').errors[0], /not valid JSON/)
  assert.match(parseSettingsBackup('{"opacity": 1}').errors[0], /not a settings backup/)
  assert.match(parseSettingsBackup(JSON.stringify({ format: SETTINGS_BACKUP_FORMAT, settings: {} })).errors[0], /no settings/)
})
