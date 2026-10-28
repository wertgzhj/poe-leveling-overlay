// Path of Building import (pure: node builtins + fast-xml-parser only, no
// Electron). Export string -> XML -> our Profile. Where each gem set starts is
// worked out by pob-stages.ts: from a range its title states, else from the
// tree it shares a loadout with. The import's review step shows the result and
// asks for what the build doesn't say; without one (tests, old callers) the
// open ones are split evenly, with a warning.

import { deflateSync, inflateSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
// "Act N" titles become level ranges through the act table — rough on purpose;
// the author can adjust.
import { ACT_START_LEVEL, CAMPAIGN_END } from './acts.ts'
import {
  validateProfile,
  CLASSES,
  type Profile,
  type Stage,
  type SocketGroup,
  type GemPlanEntry,
  type CharClass,
  type Bandit
} from './profile.ts'
import { planFromSpecs, type PassivePlan, type TreeData, type TreeSpec } from './tree.ts'
import { rangesFromStarts, stageDrafts, type StageDraft } from './pob-stages.ts'

export interface PobImportResult {
  profile: Profile | null
  warnings: string[]
  errors: string[]
  /** each gem set's start level as the build tells it, in PoB's order (for
   *  the review step); absent when the build couldn't be read */
  drafts?: StageDraft[]
}

export interface PobImportOptions {
  name?: string
  /** The passive tree: with it, the build's tree specs become the profile's
   *  `passives`, in the order to take them. */
  tree?: TreeData | null
  /** each gem set's start level, in PoB's order, as the player confirmed them
   *  in the review step; overrides what the build says */
  starts?: readonly number[]
}


/** base64url + zlib, matching PoB's export/import codec. */
export function encodePobCode(xml: string): string {
  return deflateSync(Buffer.from(xml, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/** A build's XML is tens of KB, a huge one a few MB. A code that inflates past
 *  this isn't a build — a few KB of zeros compress a thousandfold, so without a
 *  cap a pasted code could ask for gigabytes. */
export const MAX_POB_XML_BYTES = 16 * 1024 * 1024

export function decodePobCode(code: string): string {
  const cleaned = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const buf = Buffer.from(cleaned, 'base64')
  try {
    return inflateSync(buf, { maxOutputLength: MAX_POB_XML_BYTES }).toString('utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new Error('it unpacks to far more than any build, so it is not a Path of Building code', { cause: e })
    }
    throw e
  }
}

export function importPobCode(code: string, opts: PobImportOptions = {}): PobImportResult {
  let xml: string
  try {
    xml = decodePobCode(code)
  } catch (e) {
    return { profile: null, warnings: [], errors: [`could not decode PoB code: ${(e as Error).message}`] }
  }
  return importPobXml(xml, opts)
}

export function importPobXml(xml: string, opts: PobImportOptions = {}): PobImportResult {
  const warnings: string[] = []
  const errors: string[] = []
  if (xml.length > MAX_POB_XML_BYTES) {
    return { profile: null, warnings, errors: ['far too large to be a Path of Building build'] }
  }

  let doc: Record<string, unknown>
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['SkillSet', 'Skill', 'Gem', 'Spec'].includes(name)
    })
    doc = parser.parse(xml) as Record<string, unknown>
  } catch (e) {
    return { profile: null, warnings, errors: [`could not parse PoB XML: ${(e as Error).message}`] }
  }

  const pob = doc['PathOfBuilding'] as Record<string, unknown> | undefined
  if (!pob) return { profile: null, warnings, errors: ['not a Path of Building export (no <PathOfBuilding> root)'] }

  const build = (pob['Build'] as Record<string, unknown>) ?? {}
  const className = attr(build, 'className')
  if (!className || !CLASSES.includes(className as CharClass)) {
    return {
      profile: null,
      warnings,
      errors: [`unsupported or missing class "${className ?? ''}" (expected one of ${CLASSES.join(', ')})`]
    }
  }
  const ascend = attr(build, 'ascendClassName')
  const buildLevel = intAttr(build, 'level')

  const sets = readSkillSets(pob['Skills'], warnings)
  if (sets.length === 0) {
    return { profile: null, warnings, errors: ['no skill gems found in the PoB export'] }
  }

  const specs = readSpecs(pob['Tree'])
  const tree = opts.tree ?? null
  const drafts = stageDrafts(
    sets.map((s) => ({ title: s.title, gems: s.groups.reduce((n, g) => n + g.gems.length, 0) })),
    specs.map((s) => ({ title: s.title, points: spentPoints(s, tree) })),
    parseStageTitle
  )
  // Ranges every gem set states in its title keep their own ends ("1-11",
  // "12-24"): the title-only path below. Otherwise start levels, each stage
  // running to the next: as confirmed in the review step, or as read. Starts
  // confirmed as read are no change, so stated ends stay.
  const given = opts.starts?.length === sets.length ? opts.starts : null
  const confirmed = given && given.some((n, i) => n !== drafts[i].start) ? [...given] : null
  const starts = confirmed ?? drafts.map((d) => d.start)
  const allTitled = drafts.every((d) => d.from === 'set-title')
  const stages =
    !confirmed && allTitled
      ? buildStages(sets, warnings)
      : starts.every((n): n is number => n != null)
        ? stagesFromStarts(sets, starts, drafts, warnings)
        : buildStages(sets, warnings)
  const gemPlan = buildGemPlan(stages)

  const passives = readTree(specs, tree, warnings)

  const profile: Profile = {
    meta: {
      name: opts.name?.trim() || `${ascend && ascend !== 'None' ? ascend : className} (imported)`,
      class: className as CharClass,
      ascendancy: ascend && ascend !== 'None' ? ascend : undefined,
      bandit: banditFromPob(attr(build, 'bandit')),
      pobSource: 'pob-import'
    },
    stages,
    gemPlan
  }
  if (passives) profile.passives = passives
  if (buildLevel) warnings.push(`PoB build level is ${buildLevel}; stage ranges are for levelling.`)

  // Round-trip through validation so a bad import surfaces as warnings, not a
  // broken file the panel silently rejects.
  const { errors: valErrors } = validateProfile(profile)
  for (const e of valErrors) warnings.push(`review: ${e}`)

  return { profile, warnings, errors, drafts }
}

/** Stages at the given start levels, each running to the next one's. */
function stagesFromStarts(sets: RawSet[], starts: number[], drafts: StageDraft[], warnings: string[]): Stage[] {
  const labels = drafts.map((d) => d.label)
  return rangesFromStarts(starts, CAMPAIGN_END, warnings, labels).map(({ index, range }) => ({
    range,
    label: labels[index],
    socketGroups: sets[index].groups
  }))
}

/** A tree spec as PoB lists it, with the tree version it was made for. */
type PobSpec = TreeSpec & { version?: string }

/** The build's tree specs as PoB lists them. */
function readSpecs(treeRaw: unknown): PobSpec[] {
  const specsRaw = (treeRaw as Record<string, unknown> | undefined)?.['Spec']
  if (!Array.isArray(specsRaw)) return []
  const specs: PobSpec[] = []
  for (const s of specsRaw as Record<string, unknown>[]) {
    const nodes = (attr(s, 'nodes') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
    if (nodes.length === 0) continue
    const masteries: Record<string, number> = {}
    for (const m of (attr(s, 'masteryEffects') ?? '').matchAll(/\{(\d+),(\d+)\}/g)) masteries[m[1]] = Number(m[2])
    specs.push({ title: attr(s, 'title'), nodes, masteries, version: attr(s, 'treeVersion') })
  }
  return specs
}

/** The passive points a tree spends: its nodes but the class start and the
 *  ascendancy's. Without tree data, all but the class start. */
function spentPoints(spec: PobSpec, tree: TreeData | null): number {
  if (!tree) return Math.max(0, spec.nodes.length - 1)
  return spec.nodes.filter((id) => {
    const n = tree.node(id)
    return !!n && !n.ascendancy && n.kind !== 'start' && n.kind !== 'ascendancyStart'
  }).length
}

/** The build's tree specs, in PoB's order, as a plan. PoB lists them the way
 *  levelling guides do — one per milestone — and that order is kept. */
function readTree(specs: PobSpec[], tree: TreeData | null, warnings: string[]): PassivePlan | undefined {
  const version = specs.find((s) => s.version)?.version
  if (specs.length === 0) return undefined
  if (!tree) {
    warnings.push('the passive tree data is missing, so the build\'s tree was not imported.')
    return undefined
  }
  if (version && version !== tree.treeVersion) {
    warnings.push(
      `the build's tree is ${version.replace('_', '.')}, the overlay's is ${tree.version}: ` +
        'nodes that moved since may come in a strange order.'
    )
  }
  return planFromSpecs(specs, tree, version ?? tree.treeVersion)
}

interface RawSet {
  title: string | undefined
  groups: SocketGroup[]
}

function readSkillSets(skillsRaw: unknown, warnings: string[]): RawSet[] {
  const skills = skillsRaw as Record<string, unknown> | undefined
  if (!skills) return []

  // Modern PoB: <Skills><SkillSet><Skill>. Older: <Skills><Skill> directly.
  const rawSets = Array.isArray(skills['SkillSet'])
    ? (skills['SkillSet'] as Record<string, unknown>[])
    : [{ '@_title': undefined, Skill: skills['Skill'] }]

  const sets: RawSet[] = []
  for (const set of rawSets) {
    const skillList = Array.isArray(set['Skill']) ? (set['Skill'] as Record<string, unknown>[]) : []
    const groups: SocketGroup[] = []
    for (const skill of skillList) {
      if (attr(skill, 'enabled') === 'false') continue
      const gemsRaw = Array.isArray(skill['Gem']) ? (skill['Gem'] as Record<string, unknown>[]) : []
      const gems = gemsRaw
        .filter((g) => attr(g, 'enabled') !== 'false')
        .map((g) => attr(g, 'nameSpec') ?? attr(g, 'skillId') ?? '')
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
      if (gems.length > 0) groups.push({ gems })
    }
    if (groups.length > 0) sets.push({ title: attr(set, 'title'), groups })
  }
  if (sets.length === 0) warnings.push('no enabled skill groups with gems were found.')
  return sets
}

function buildStages(sets: RawSet[], warnings: string[]): Stage[] {
  const parsed = sets.map((s) => ({ set: s, range: parseStageTitle(s.title) }))
  const allLabeled = parsed.every((p) => p.range !== null)

  if (parsed.length === 1) {
    return [{ range: parsed[0].range ?? [1, CAMPAIGN_END], label: parsed[0].set.title, socketGroups: parsed[0].set.groups }]
  }

  if (allLabeled) {
    // Sort by start level, clamp overlaps so the schema stays valid — and SAY
    // so: PoB sets often overlap ("1-11" then "9-24"), and a silently clamped
    // range next to the original title reads like a bug.
    const ordered = parsed
      .map((p) => ({ ...p, range: [...(p.range as [number, number])] as [number, number] }))
      .sort((a, b) => a.range[0] - b.range[0])
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].range[0] <= ordered[i - 1].range[1]) {
        const prev = ordered[i - 1]
        const clampedEnd = Math.max(prev.range[0], ordered[i].range[0] - 1)
        warnings.push(
          `stage "${prev.set.title ?? '?'}" overlaps the next stage, using levels ` +
            `${prev.range[0]}-${clampedEnd} (the next stage starts at ${ordered[i].range[0]}).`
        )
        prev.range[1] = clampedEnd
      }
    }
    return ordered.map((p) => ({ range: p.range, label: p.set.title, socketGroups: p.set.groups }))
  }

  // Some/all titles unparseable: keep PoB's order, split the level span evenly,
  // and flag it loudly — the ranges are guesses to edit.
  warnings.push(
    'could not read stage level ranges from the PoB, so they are split evenly across 1-' +
      `${CAMPAIGN_END}; edit "range" on each stage.`
  )
  const n = sets.length
  const span = CAMPAIGN_END - 1
  return sets.map((s, i) => {
    const min = 1 + Math.round((span * i) / n)
    const max = i === n - 1 ? CAMPAIGN_END : Math.round((span * (i + 1)) / n)
    return { range: [min, max] as [number, number], label: s.title ?? `Stage ${i + 1}`, socketGroups: s.groups }
  })
}

function buildGemPlan(stages: Stage[]): GemPlanEntry[] {
  const maxPerStage = new Map<string, number>()
  const display = new Map<string, string>()
  for (const stage of stages) {
    const counts = new Map<string, number>()
    for (const group of stage.socketGroups) {
      for (const gem of group.gems) {
        const key = gem.toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (!display.has(key)) display.set(key, gem)
      }
    }
    for (const [key, c] of counts) maxPerStage.set(key, Math.max(maxPerStage.get(key) ?? 0, c))
  }
  return [...maxPerStage].map(([key, count]) => ({
    gem: display.get(key) as string,
    count: count > 1 ? count : undefined
    // source is left unset — populated from full gem data or by hand.
  }))
}

/** "Level 1-12", "Lvl 1-12", "1–12", "Act 2", "Act 1-3", "Leveling 12-24 fire"
 *  -> [min, max]; null if unreadable. */
export function parseStageTitle(title: string | undefined): [number, number] | null {
  if (!title) return null
  const t = title.trim()

  // "Level"/"Lvl"/"Lv" + range, anywhere in the title.
  const lvl = /(?:levels?|lvl|lv)\.?\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/i.exec(t)
  if (lvl) return [Number(lvl[1]), Number(lvl[2])]

  const singleLvl = /(?:levels?|lvl|lv)\.?\s*(\d+)\s*\+?$/i.exec(t)
  if (singleLvl) return [Number(singleLvl[1]), CAMPAIGN_END]

  // Acts before the loose range, so "Act 1-3" is act-based, not levels 1–3.
  const act = /act\s*(\d+)(?:\s*[-–—]\s*(\d+))?/i.exec(t)
  if (act) {
    const a1 = Number(act[1])
    const a2 = act[2] ? Number(act[2]) : a1
    const min = ACT_START_LEVEL[a1] ?? 1
    const max = a2 >= 10 ? CAMPAIGN_END : (ACT_START_LEVEL[a2 + 1] ?? CAMPAIGN_END) - 1
    return [min, Math.max(min, max)]
  }

  // A bare/loose range anywhere ("1-11", "12-24 fire"), sanity-bounded so
  // random numbers ("4-link setup") don't become level ranges.
  const loose = /(?<!\d)(\d{1,2})\s*[-–—]\s*(\d{1,2})(?!\d)/.exec(t)
  if (loose) {
    const min = Number(loose[1])
    const max = Number(loose[2])
    if (min >= 1 && max > min && max <= 100) return [min, max]
  }
  return null
}

function attr(obj: Record<string, unknown> | undefined, name: string): string | undefined {
  const v = obj?.[`@_${name}`]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined
}

/** PoB records the bandit choice on the Build element. "None" there means you
 *  killed all three for the two passive points, which is a decision, not an
 *  absent one — anything else unrecognised is left unset rather than guessed. */
function banditFromPob(raw: string | undefined): Bandit | undefined {
  if (!raw) return undefined
  if (raw === 'None') return 'Kill all'
  return raw === 'Alira' || raw === 'Kraityn' || raw === 'Oak' ? raw : undefined
}

function intAttr(obj: Record<string, unknown> | undefined, name: string): number | undefined {
  const v = attr(obj, name)
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
