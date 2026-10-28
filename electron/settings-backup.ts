// Settings to a file and back (pure, no Electron imports; unit-tested in
// tests/settings-backup.test.ts): a backup, or the way to a second PC.
//
// What goes in is how you set the overlay up. What stays out is what belongs
// to this PC or to you: the Client.txt path, the character name, the build
// profile's path, the window positions (another screen, another place), and
// everything the overlay tracks per character. A loaded file goes through the
// same checks as a change made in Settings (ipc.ts settings:set), so a file
// can't set anything Settings couldn't.

import type { AppSettings, SettingsPatch } from './settings.ts'

/** Written into backups so a future format change can be recognised. */
export const SETTINGS_BACKUP_FORMAT = 'poe-leveling-overlay/settings@1'

/** The settings a backup carries, with how Settings names them. */
export const BACKUP_KEYS = {
  opacity: 'Opacity',
  clickThrough: 'Click-through',
  panelText: 'Panel text size',
  stripEnabled: 'Compact strip',
  stripText: 'Strip text size',
  showFull: 'What the overlay shows: panel',
  showStrip: 'What the overlay shows: strip',
  visibleTabs: 'Tabs',
  announce: 'Voice',
  searchRegex: 'Your regex',
  actRegexes: 'Regexes per act',
  autoCopyTown: 'Copy on entering a town',
  autoCopyLevelUp: 'Copy on a level-up',
  autoCopyProtect: 'Keep what you copied yourself',
  gemNames: 'Gem short names',
  laterRewards: 'Rewards for later stages',
  runTimer: 'Run timer',
  hotkeys: 'Hotkeys'
} as const satisfies Partial<Record<keyof AppSettings, string>>

export type BackupKey = keyof typeof BACKUP_KEYS
export type BackupPatch = Pick<SettingsPatch, BackupKey>

export interface BackupResult {
  /** what the file sets, unchecked: settings:set checks every field */
  patch: BackupPatch | null
  errors: string[]
}

/** The settings as a file's text. */
export function exportSettings(settings: AppSettings): string {
  const picked: Record<string, unknown> = {}
  for (const key of Object.keys(BACKUP_KEYS) as BackupKey[]) picked[key] = settings[key]
  return JSON.stringify({ format: SETTINGS_BACKUP_FORMAT, settings: picked }, null, 2) + '\n'
}

/** A backup file's text: only the keys a backup carries are read, whatever
 *  else the file holds. */
export function parseSettingsBackup(text: string): BackupResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { patch: null, errors: [`not valid JSON: ${(e as Error).message}`] }
  }
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  if (!obj || obj['format'] !== SETTINGS_BACKUP_FORMAT) {
    return { patch: null, errors: ['not a settings backup from this overlay'] }
  }
  const settings = obj['settings']
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { patch: null, errors: ['the backup holds no settings'] }
  }
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(BACKUP_KEYS)) {
    if (key in settings) patch[key] = (settings as Record<string, unknown>)[key]
  }
  if (Object.keys(patch).length === 0) return { patch: null, errors: ['the backup holds no settings'] }
  return { patch, errors: [] }
}

/** What loading a backup would change, by name, in Settings' order. */
export function backupChanges(current: AppSettings, patch: BackupPatch): string[] {
  const out: string[] = []
  for (const key of Object.keys(BACKUP_KEYS) as BackupKey[]) {
    if (!(key in patch)) continue
    if (JSON.stringify(sorted(patch[key])) !== JSON.stringify(sorted(current[key]))) out.push(BACKUP_KEYS[key])
  }
  return out
}

/** Objects with their keys in order, so a different key order isn't a change. */
function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sorted(x)])
    )
  }
  return v
}
