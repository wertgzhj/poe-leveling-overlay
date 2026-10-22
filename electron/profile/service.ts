// Glue between the pure profile engine and the Electron app: profile file load
// with hot reload, gem data, live active-stage tracking from the bound
// character's level, and IPC pushes. Profiles live in the library
// (userData/profiles, see library.ts); settings.profilePath names the active one,
// and null means the bundled example.
//
// gems.json is READ AT RUNTIME rather than imported. It's ~370 KB, and an import
// makes the bundler inline it as a JavaScript object literal that V8 has to
// parse on every launch — over half the main bundle. Shipped as a resource and
// JSON.parse'd, it's both smaller and faster to start. The cost is a file that
// can go missing, so a failure to load is reported loudly (`gemDataError`)
// instead of degrading into "every gem is unknown".

import { app, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { parseProfile, validateProfile, baseClassOf, BANDITS, type Profile } from './profile.ts'
import { GemData, normalizeGemName, LIBRARY_ZONE, type GemInfo } from './gems.ts'
import {
  activeStageIndex,
  actFromAreaId,
  stepStageView,
  resolveStage,
  acquisitionsForStage,
  mulingClass,
  muleOptions,
  defaultMule,
  type MuleOption,
  type Acquisitions
} from './engine.ts'
import {
  BUNDLED_ID,
  addProfile,
  adoptExternal,
  blankProfile,
  deleteProfile,
  dropReferences,
  duplicateProfile,
  importProfileFile,
  isInLibrary,
  listLibrary,
  readEntry,
  remapReferences,
  renameProfile,
  type LibraryEntry,
  type LibraryResult
} from './library.ts'
import { store } from '../settings.ts'
import { TWILIGHT_STRAND_ID } from '../log/tracker.ts'
import { Channels, type ChoiceDue, type EditorProfileLoad, type EditorSaveResult, type ProfileSnapshot } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { EditorWindow } from '../editor-window.ts'
import type { LogService } from '../log/service.ts'
import startingGemsJson from '../../data/starting-gems.json'

/** Act 2 asks you to deal with the bandits; the Pantheon opens up in Act 5. */
const BANDIT_ACT = 2
const PANTHEON_ACT = 5

export class ProfileService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private readonly gems: GemData
  /** Set when gems.json couldn't be loaded — surfaced in the Gems tab, because
   *  silently colourless gems with no sources look like a data gap, not a bug. */
  private readonly gemDataError: string | null
  private profile: Profile | null = null
  private errors: string[] = []
  private level: number | null = null
  /** Manually paged gem stage (◀/▶). null = follow the tracked level (auto). */
  private viewIndex: number | null = null
  private watchedPath: string | null = null
  /** Bumped on every (re)load so the acquisition cache can't outlive its profile. */
  private profileRevision = 0
  private acqCache: { key: string; value: Acquisitions } | null = null
  private muleCache: { revision: number; options: MuleOption[] } | null = null

  /** class -> normalized set of its starting gems (already in inventory). */
  private readonly startingByClass = new Map<string, Set<string>>()
  /** The character the loaded profile is currently associated with, so a switch
   *  can be noticed. */
  private character: string | null = null
  /** Every profile you have, bundled example first — re-read on each reload. */
  private library: LibraryEntry[] = []
  /** The editor window, when there is one: it lists the same library. */
  private editor: EditorWindow | null = null

  constructor(overlay: OverlayController, log: LogService) {
    this.overlay = overlay
    this.log = log
    const loaded = loadGemData()
    this.gems = loaded.gems
    this.gemDataError = loaded.error
    for (const [cls, names] of Object.entries(startingGemsJson.classes as Record<string, string[]>)) {
      this.startingByClass.set(cls, new Set(names.map(normalizeGemName)))
    }
    log.addLevelListener((level) => {
      this.level = level
      // A level-up is the only line that names a character, so it's also where a
      // character switch becomes visible.
      if (!this.syncCharacter()) this.push()
    })
    // The binding can also change without a level-up — the "⟳ character" button
    // and pinning a name in Settings both do it. Zone changes are the cheap,
    // frequent tick that notices those; syncCharacter is a no-op when nothing
    // moved. They're also where campaign progress shows up.
    log.addAreaListener((area) => {
      const reloaded = this.syncCharacter()
      const moved =
        area.areaId === TWILIGHT_STRAND_ID
          ? this.restartAct()
          : this.noteAct(actFromAreaId(area.areaId)) || this.noteLibrary(area.name)
      if (moved && !reloaded) this.push()
    })
  }

  start(): void {
    const state = this.log.getSnapshot().state
    this.level = state.level
    this.character = state.character
    // Seed from the resumed area: the backscan doesn't emit area events, so
    // without this the plan shows every act until the next zone load.
    this.noteAct(actFromAreaId(state.area?.areaId))
    this.adoptExternalProfiles()
    this.reload()
  }

  attachEditor(editor: EditorWindow): void {
    this.editor = editor
  }

  /**
   * Profiles used to be any file anywhere ("Browse…"). Copy the ones still in
   * use into the library and repoint the active profile and every character at
   * the copies, so each profile is one the library can rename, duplicate and
   * delete. Runs every launch and is a no-op once nothing points outside.
   */
  private adoptExternalProfiles(): void {
    const dir = libraryDir()
    const bundled = bundledProfilePath()
    const active = store.get('profilePath')
    const byCharacter = store.get('profileByCharacter')
    const outside = [active, ...Object.values(byCharacter)].filter(
      (p): p is string => typeof p === 'string' && p !== bundled && !isInLibrary(dir, p)
    )
    if (outside.length === 0) return
    const moved = adoptExternal(dir, outside)
    if (moved.size === 0) return
    if (active && moved.has(active)) store.set('profilePath', moved.get(active)!)
    store.set('profileByCharacter', remapReferences(byCharacter, moved))
  }

  /** Follow the tracked character: when it changes to one that has a remembered
   *  profile, load that profile instead of leaving the previous character's on
   *  screen. Returns true when it triggered a reload (which pushes by itself). */
  private syncCharacter(): boolean {
    const next = this.log.getSnapshot().state.character
    if (next === this.character) return false
    this.character = next
    if (!next) return false
    const remembered = store.get('profileByCharacter')[next]
    if (!remembered || remembered === store.get('profilePath')) return false
    this.setPath(remembered)
    return true
  }

  /** Remember which profile belongs to which character, so the next switch can
   *  restore it. A profile that names its own character (`meta.character`) wins:
   *  it is an explicit statement, whereas the tracked name is just who happened
   *  to be playing when it loaded. */
  private rememberProfile(): void {
    const path = store.get('profilePath')
    const owner = this.profile?.meta.character?.trim() || this.character
    if (!path || !owner) return
    const map = store.get('profileByCharacter')
    if (map[owner] === path) return
    store.set('profileByCharacter', { ...map, [owner]: path })
  }

  stop(): void {
    this.unwatch()
  }

  setPath(path: string | null): void {
    store.set('profilePath', path)
    this.reload()
  }

  /** Add an imported build to the library as a NEW profile and make it the
   *  active one. Never overwrites: a second import is a second profile. */
  applyImport(profile: Profile): LibraryResult {
    const result = addProfile(libraryDir(), profile)
    if (result.ok && result.entry) this.setPath(result.entry.path)
    return result
  }

  // --- The library ---------------------------------------------------------

  /** Switch to a profile by id. The switch is also what binds it to the
   *  tracked character (rememberProfile), exactly as picking a file did. */
  activate(id: string): boolean {
    if (id === BUNDLED_ID) {
      this.setPath(null)
      return true
    }
    const entry = this.entry(id)
    if (!entry || entry.errors.length > 0) return false
    this.setPath(entry.path)
    return true
  }

  /** A new profile for `charClass`, starting from that class's own gems. Not
   *  activated: you're about to edit it, not play it. */
  create(name: string, charClass: string): LibraryResult {
    const starting = (startingGemsJson.classes as Record<string, string[]>)[charClass] ?? []
    return this.changed(addProfile(libraryDir(), blankProfile(name, charClass, starting)))
  }

  duplicate(id: string): LibraryResult {
    const entry = this.entry(id)
    if (!entry) return { ok: false, errors: ['no such profile'] }
    return this.changed(duplicateProfile(libraryDir(), entry.path, entry.bundled === true))
  }

  rename(id: string, name: string): LibraryResult {
    const entry = this.entry(id)
    if (!entry || entry.bundled) return { ok: false, errors: ['the bundled example cannot be renamed'] }
    return this.changed(renameProfile(entry.path, name), entry.path)
  }

  /** To the recycle bin, not gone: a deleted build should be one click from
   *  coming back. Every character that used it forgets it, and if it was the
   *  active one the overlay falls back to the example rather than to nothing. */
  async remove(id: string): Promise<LibraryResult> {
    const entry = this.entry(id)
    if (!entry || entry.bundled) return { ok: false, errors: ['the bundled example cannot be deleted'] }
    const result = await deleteProfile(libraryDir(), entry.path, (p) => shell.trashItem(p))
    if (!result.ok) return result
    store.set('profileByCharacter', dropReferences(store.get('profileByCharacter'), entry.path))
    if (store.get('profilePath') === entry.path) this.setPath(null)
    else this.changed(result)
    return result
  }

  /** Copy an outside file into the library (the original is left alone). */
  importFile(path: string): LibraryResult {
    return this.changed(importProfileFile(libraryDir(), path))
  }

  /** One profile, parsed, for the editor. */
  forEditor(id: string): EditorProfileLoad | null {
    const entry = this.entry(id)
    if (!entry) return null
    let text: string
    try {
      text = readFileSync(entry.path, 'utf8')
    } catch (e) {
      return { id, path: entry.path, bundled: entry.bundled === true, profile: null, errors: [(e as Error).message] }
    }
    const { profile, errors } = parseProfile(text)
    return { id, path: entry.path, bundled: entry.bundled === true, profile, errors }
  }

  /**
   * Save an edit back to the file it came from. The editor used to write every
   * profile to `profile.json`, whichever one you had open — so editing a second
   * profile replaced the first. The bundled example can't be written, so
   * saving it makes a new profile of yours and switches to it.
   */
  saveFromEditor(id: string, json: unknown): EditorSaveResult & { id?: string } {
    const entry = this.entry(id)
    if (!entry) return { ok: false, errors: ['that profile no longer exists'] }
    if (entry.bundled) {
      const created = addProfile(libraryDir(), json)
      if (!created.ok || !created.entry) return { ok: false, errors: created.errors }
      this.setPath(created.entry.path)
      return { ok: true, errors: [], path: created.entry.path, id: created.entry.id }
    }
    const { profile, errors } = validateProfile(json)
    if (!profile) return { ok: false, errors }
    writeFileSync(entry.path, JSON.stringify(json, null, 2) + '\n')
    // The active file is watched and reloads by itself; this just doesn't wait
    // for the poll. Any other file only needs the list to catch up.
    if (entry.path === store.get('profilePath')) this.reload()
    else this.changed({ ok: true, errors: [] })
    return { ok: true, errors: [], path: entry.path, id }
  }

  private entry(id: string): LibraryEntry | undefined {
    return this.library.find((e) => e.id === id)
  }

  /** After a library change: re-read it and tell both windows. A change to the
   *  active file itself goes through reload() instead, which does both. */
  private changed(result: LibraryResult, touched?: string): LibraryResult {
    if (!result.ok) return result
    if (touched && touched === store.get('profilePath')) this.reload()
    else {
      this.refreshLibrary()
      this.push()
    }
    return result
  }

  private refreshLibrary(): void {
    this.library = [readEntry(bundledProfilePath(), true), ...listLibrary(libraryDir())]
  }

  private activeId(): string | null {
    const configured = store.get('profilePath')
    if (!configured) return BUNDLED_ID
    return this.library.find((e) => e.path === configured)?.id ?? null
  }

  snapshot(): ProfileSnapshot {
    const profile = this.profile
    const level = this.level
    const trackedClass = this.log.getSnapshot().state.charClass
    const liveIndex = profile ? activeStageIndex(profile, level) : -1
    // The shown stage is a pinned manual view (◀/▶) when set and in range,
    // otherwise the live stage the level maps to.
    const stageIndex =
      liveIndex < 0
        ? -1
        : this.viewIndex != null
          ? Math.min(profile!.stages.length - 1, Math.max(0, this.viewIndex))
          : liveIndex
    const stage = profile && stageIndex >= 0 ? profile.stages[stageIndex] : null

    // An ascended character logs its ascendancy, so "Elementalist" tracked
    // against a "Witch" profile is the same character, not the wrong one.
    // Compare base classes, and say nothing at all about a name we can't
    // place — a localized log would otherwise cry wolf on every profile.
    const trackedBase = trackedClass ? baseClassOf(trackedClass) : null
    const mismatch = profile && trackedClass && trackedBase && trackedBase !== profile.meta.class ? trackedClass : null
    // ...unless it's a mule: low level, and a class whose starting gems this
    // build uses. The Gems tab told you to roll exactly that; warning you
    // about it a moment later is the overlay arguing with itself.
    const options = profile ? this.muleOptionsFor(profile) : []
    const muling =
      mismatch && profile ? mulingClass(profile, trackedClass, level, [...new Set(options.flatMap((o) => o.classes))]) : null

    return {
      meta: profile?.meta ?? null,
      errors: this.errors,
      gemDataError: this.gemDataError,
      level,
      classMismatch: muling ? null : mismatch,
      muling,
      activeStage: stage ? resolveStage(stage, stageIndex, this.gems) : null,
      nextStage:
        profile && stageIndex >= 0 && stageIndex + 1 < profile.stages.length
          ? resolveStage(profile.stages[stageIndex + 1], stageIndex + 1, this.gems)
          : null,
      acquisitions: profile ? this.acquisitions(profile, stageIndex) : null,
      stageCount: profile ? profile.stages.length : 0,
      viewedIndex: stageIndex,
      liveIndex,
      choiceDue: this.choiceDue(),
      library: this.library,
      activeId: this.activeId(),
      // Per character, so only once we know who you are — and only when this
      // build has anything another class starts with.
      muleChoice:
        profile && this.character && options.length > 0
          ? { options, chosen: this.chosenMule(profile)?.gem ?? null }
          : null
    }
  }

  /** The acquisition views for a stage, recomputed only when an input actually
   *  changed. A snapshot goes out on every level-up and every reload, but the
   *  plan only depends on the stage, the level and the loaded profile — and most
   *  level-ups stay inside the same stage, so the sorting work was being redone
   *  for an identical result. */
  private acquisitions(profile: Profile, stageIndex: number): Acquisitions {
    const act = this.actReached()
    const library = this.character ? (store.get('libraryReached')[this.character] ?? false) : null
    const mule = this.chosenMule(profile)
    const key = `${this.profileRevision}|${stageIndex}|${this.level ?? ''}|${act ?? ''}|${library}|${mule?.gem ?? ''}`
    if (this.acqCache?.key === key) return this.acqCache.value
    const value = acquisitionsForStage(profile, stageIndex, this.gems, {
      startingGems: this.startingByClass.get(profile.meta.class),
      playerLevel: this.level,
      actReached: act,
      reachedLibrary: library,
      mule: mule ? { gem: mule.gem, classes: mule.classes, how: mule.how } : null
    })
    this.acqCache = { key, value }
    return value
  }

  /** The gems this build could mule, recomputed only when the profile changes. */
  private muleOptionsFor(profile: Profile): MuleOption[] {
    if (this.muleCache?.revision === this.profileRevision) return this.muleCache.options
    const options = muleOptions(profile, this.gems, startingGemsJson.classes as Record<string, string[]>)
    this.muleCache = { revision: this.profileRevision, options }
    return options
  }

  /**
   * The gem you mule on the tracked character. Unset means the default
   * (Momentum, else the first gem the build needs); null means you chose not
   * to mule. A stored gem the profile no longer has falls back to the default
   * rather than to nothing.
   */
  private chosenMule(profile: Profile): MuleOption | null {
    const options = this.muleOptionsFor(profile)
    const stored = this.character ? store.get('muleByCharacter')[this.character] : undefined
    if (stored === null) return null
    if (typeof stored === 'string') {
      const picked = options.find((o) => normalizeGemName(o.gem) === normalizeGemName(stored))
      if (picked) return picked
    }
    return defaultMule(options)
  }

  /** Choose the gem to mule on the tracked character, or null for none. */
  setMule(gem: string | null): void {
    if (!this.character) return
    store.set('muleByCharacter', { ...store.get('muleByCharacter'), [this.character]: gem })
    this.push()
  }

  /** The furthest act this character has reached, or null when we don't know
   *  yet. Read fresh rather than cached: it moves at most nine times in a run. */
  private actReached(): number | null {
    if (!this.character) return null
    return store.get('actReached')[this.character] ?? null
  }

  /**
   * Record reaching an act. Persisted per character and monotonic on purpose:
   * campaign progress doesn't go backwards, and portalling to Act 1's town must
   * not hide the Act 5 shopping list. Returns true when it moved.
   */
  private noteAct(act: number | null): boolean {
    if (act == null || !this.character) return false
    const map = store.get('actReached')
    if ((map[this.character] ?? 0) >= act) return false
    store.set('actReached', { ...map, [this.character]: act })
    return true
  }

  /**
   * Entering the Twilight Strand means a brand-new character — you cannot go
   * back to it. Names get reused every league, so without this a fresh Act 1
   * character would inherit the Act 10 mark of last league's namesake and see
   * the whole campaign's list again.
   */
  private restartAct(): boolean {
    if (!this.character) return false
    const changed = store.get('libraryReached')[this.character]
    if (changed) {
      const { [this.character]: _gone, ...rest } = store.get('libraryReached')
      store.set('libraryReached', rest)
    }
    const map = store.get('actReached')
    if (map[this.character] === 1 && !changed) return false
    store.set('actReached', { ...map, [this.character]: 1 })
    return true
  }

  /**
   * A build decision the profile named and you've now reached the point for.
   * Both are one-shot and permanent for the character, which is exactly why a
   * reminder is worth a bar: forgetting the bandits costs you the choice for
   * good. A profile that says nothing gets no notice — the app has no opinion
   * on which is right, that's the whole reason the field exists.
   */
  private choiceDue(): ChoiceDue | null {
    const meta = this.profile?.meta
    const act = this.actReached()
    if (!meta || act == null) return null
    const done = new Set(this.character ? (store.get('dismissedChoices')[this.character] ?? []) : [])

    // Bandits first: Act 2 comes first, and once you're past it the pantheon is
    // the only one left to nag about. Only one bar, so only one claim.
    if (meta.bandit && act >= BANDIT_ACT && !done.has('bandit')) {
      return {
        id: 'bandit',
        wants: meta.bandit === 'Kill all' ? 'kill all three' : `help ${meta.bandit}`,
        options: BANDITS.map((b) => (b === 'Kill all' ? 'kill all three' : `help ${b}`))
      }
    }
    const pantheon = meta.pantheon
    if (pantheon && act >= PANTHEON_ACT && !done.has('pantheon')) {
      return {
        id: 'pantheon',
        wants: [pantheon.major, pantheon.minor].filter(Boolean).join(' + '),
        options: []
      }
    }
    return null
  }

  /** Acknowledge a reminder. One-shot decisions, so it never comes back. */
  dismissChoice(id: string): void {
    if (!this.character || (id !== 'bandit' && id !== 'pantheon')) return
    const map = store.get('dismissedChoices')
    const done = map[this.character] ?? []
    if (done.includes(id)) return
    store.set('dismissedChoices', { ...map, [this.character]: [...done, id] })
    this.push()
  }

  /** Siosa sells more gems than anyone else, and you reach him by walking into
   *  the Library, not by entering Act 3. Matched on the display name, the way
   *  the trial zones are — English clients only, like every localized path. */
  private noteLibrary(zoneName: string): boolean {
    if (!this.character || zoneName !== LIBRARY_ZONE) return false
    const map = store.get('libraryReached')
    if (map[this.character]) return false
    store.set('libraryReached', { ...map, [this.character]: true })
    return true
  }

  /** Page the viewed gem stage (◀/▶). Pins a manual view until it lands back on
   *  the live stage; a level-up then no longer moves what you're reading. */
  stageStep(delta: number): void {
    if (!this.profile) return
    const liveIndex = activeStageIndex(this.profile, this.level)
    this.viewIndex = stepStageView(this.viewIndex, delta, liveIndex, this.profile.stages.length)
    this.push()
  }

  /** Drop the manual view and resume following the tracked level. */
  stageToLive(): void {
    if (this.viewIndex == null) return
    this.viewIndex = null
    this.push()
  }

  private reload(): void {
    // A new/edited profile can shift stage indices — drop any manual paging.
    this.viewIndex = null
    this.profileRevision++
    this.acqCache = null
    this.refreshLibrary()
    const path = this.resolvePath()
    this.watch(path)

    if (!existsSync(path)) {
      this.errors = [`profile file not found: ${path}`]
      this.profile = null
      this.push()
      return
    }
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (e) {
      this.errors = [`cannot read ${path}: ${(e as Error).message}`]
      this.push()
      return
    }
    const { profile, errors } = parseProfile(text)
    this.errors = errors
    if (profile) {
      this.profile = profile // keep last good on error
      this.rememberProfile()
    }
    this.push()
  }

  private resolvePath(): string {
    return store.get('profilePath') ?? bundledProfilePath()
  }

  // watchFile tolerates a missing file and fires when it appears, so pointing at
  // a not-yet-created profile picks it up on save (same pattern as the guide).
  private watch(path: string): void {
    if (this.watchedPath === path) return
    this.unwatch()
    this.watchedPath = path
    watchFile(path, { interval: 1000 }, () => this.reload())
  }

  private unwatch(): void {
    if (this.watchedPath) unwatchFile(this.watchedPath)
    this.watchedPath = null
  }

  private push(): void {
    const snap = this.snapshot()
    this.overlay.window?.webContents.send(Channels.profileState, snap)
    this.editor?.send(Channels.profileState, snap)
  }
}

/** Where your profiles live: one file each. */
function libraryDir(): string {
  return join(app.getPath('userData'), 'profiles')
}

/** The bundled example — read-only, and what an unset profilePath means. */
function bundledProfilePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'profiles', 'example.json')
    : join(app.getAppPath(), 'data', 'profiles', 'example.json')
}

/** Read gems.json from the app's resources (packaged) or the repo (dev). Never
 *  throws: an unreadable file yields empty gem data plus the reason, so the Gems
 *  tab can say what's wrong rather than quietly showing every gem as unknown. */
function loadGemData(): { gems: GemData; error: string | null } {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'gems.json')
    : join(app.getAppPath(), 'data', 'gems.json')
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { gems?: Record<string, GemInfo> }
    const gems = raw.gems
    if (!gems || typeof gems !== 'object') {
      return { gems: new GemData({}), error: `gem data at ${path} has no "gems" object` }
    }
    return { gems: new GemData(gems), error: null }
  } catch (e) {
    return { gems: new GemData({}), error: `could not read gem data (${path}): ${(e as Error).message}` }
  }
}
