// Path of Building import (pure — node builtins + fast-xml-parser only, no
// Electron). Export string -> XML -> our Profile (plan §6). Semi-automatic:
// stage level ranges are read from SkillSet/Spec titles when present and guessed
// (with a warning) otherwise, so the result is always a valid, editable profile.

import { deflateSync, inflateSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import {
  validateProfile,
  CLASSES,
  type Profile,
  type Stage,
  type SocketGroup,
  type GemPlanEntry,
  type CharClass
} from './profile.ts'

export interface PobImportResult {
  profile: Profile | null
  warnings: string[]
  errors: string[]
}

export interface PobImportOptions {
  name?: string
}

// Approximate campaign level at the START of each act — used to turn "Act N"
// labels into level ranges. Rough on purpose; the author can adjust.
const ACT_START_LEVEL: Record<number, number> = {
  1: 1, 2: 12, 3: 22, 4: 32, 5: 40, 6: 45, 7: 52, 8: 58, 9: 64, 10: 67
}
const CAMPAIGN_END = 70

/** base64url + zlib, matching PoB's export/import codec. */
export function encodePobCode(xml: string): string {
  return deflateSync(Buffer.from(xml, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function decodePobCode(code: string): string {
  const cleaned = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const buf = Buffer.from(cleaned, 'base64')
  return inflateSync(buf).toString('utf8')
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

  const stages = buildStages(sets, warnings)
  const gemPlan = buildGemPlan(stages)

  const profile: Profile = {
    meta: {
      name: opts.name?.trim() || `${ascend && ascend !== 'None' ? ascend : className} (imported)`,
      class: className as CharClass,
      ascendancy: ascend && ascend !== 'None' ? ascend : undefined,
      pobSource: 'pob-import'
    },
    stages,
    gemPlan
  }
  if (buildLevel) warnings.push(`PoB build level is ${buildLevel}; stage ranges are for levelling.`)

  // Round-trip through validation so a bad import surfaces as warnings, not a
  // broken file the panel silently rejects.
  const { errors: valErrors } = validateProfile(profile)
  for (const e of valErrors) warnings.push(`review: ${e}`)

  return { profile, warnings, errors }
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
    // range next to the original title reads like a bug (owner feedback).
    const ordered = parsed
      .map((p) => ({ ...p, range: [...(p.range as [number, number])] as [number, number] }))
      .sort((a, b) => a.range[0] - b.range[0])
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].range[0] <= ordered[i - 1].range[1]) {
        const prev = ordered[i - 1]
        const clampedEnd = Math.max(prev.range[0], ordered[i].range[0] - 1)
        warnings.push(
          `stage "${prev.set.title ?? '?'}" overlaps the next stage — using levels ` +
            `${prev.range[0]}–${clampedEnd} (the next stage starts at ${ordered[i].range[0]}).`
        )
        prev.range[1] = clampedEnd
      }
    }
    return ordered.map((p) => ({ range: p.range, label: p.set.title, socketGroups: p.set.groups }))
  }

  // Some/all titles unparseable: keep PoB's order, split the level span evenly,
  // and flag it loudly — the ranges are guesses to edit.
  warnings.push(
    'could not read stage level ranges from the PoB — split them evenly across 1–' +
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
    // source is left unset — populated from full gem data (P5) or by hand.
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

function intAttr(obj: Record<string, unknown> | undefined, name: string): number | undefined {
  const v = attr(obj, name)
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
