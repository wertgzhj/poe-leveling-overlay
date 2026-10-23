// The render check's scenarios: what the overlay is shown, computed by the real
// engine from the real gem data, written as JSON for the Electron side
// (render.mjs) to feed through a stand-in bridge. Run by `npm run render-check`.
//
// Fixed on purpose: the same build, levels and acts every run, so two runs of
// the same UI produce the same pixels — which is what makes a byte comparison
// of the screenshots mean "nothing changed".

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GemData, normalizeGemName } from '../../electron/profile/gems.ts'
import { parseProfile, type Profile } from '../../electron/profile/profile.ts'
import {
  acquisitionsForStage,
  defaultMule,
  muleOptions,
  resolveStage,
  type AcquisitionContext
} from '../../electron/profile/engine.ts'
import type { ChoiceDue, GuideState, LogSnapshot, ProfileSnapshot } from '../../electron/channels.ts'
import type { TrialsSnapshot } from '../../electron/trials/engine.ts'

const root = new URL('../../', import.meta.url).pathname
const gems = new GemData(JSON.parse(readFileSync(join(root, 'data/gems.json'), 'utf8')).gems)
const starting = JSON.parse(readFileSync(join(root, 'data/starting-gems.json'), 'utf8')).classes as Record<
  string,
  string[]
>

// A Marauder levelling into Act 2, spelled the way Path of Building writes gems
// (no " Support"): picks, a two-reward quest, a mule, a starting gem, an Act 3
// gem not reached yet — most of what the Gems tab can show.
const STAGES: Array<[label: string, range: [number, number], links: string[][]]> = [
  ['After Hillock', [1, 4], [['Ground Slam', 'Ruthless', 'Momentum']]],
  ['After Brutus', [5, 12], [['Ground Slam', 'Ruthless', 'Chance to Bleed'], ['Leap Slam', 'Faster Attacks'], ['Intimidating Cry']]],
  ['After Pirate', [13, 21], [['Sunder', 'Ruthless', 'Chance to Bleed'], ['Leap Slam', 'Momentum', 'Faster Attacks'], ['Frostblink'], ['Intimidating Cry']]],
  [
    'After Fidelitas',
    [22, 28],
    [
      ['Sunder', 'Ruthless', 'Chance to Bleed', 'Melee Physical Damage'],
      ['Leap Slam', 'Momentum', 'Faster Attacks'],
      ['Cleave', 'Onslaught'],
      ['Herald of Ash', 'Cruelty'],
      ['Blood Rage'],
      ['Cyclone']
    ]
  ]
]
const profile: Profile = (() => {
  const r = parseProfile(
    JSON.stringify({
      meta: { name: 'Berserker', class: 'Marauder', ascendancy: 'Berserker', bandit: 'Alira' },
      stages: STAGES.map(([label, range, links]) => ({ label, range, socketGroups: links.map((g) => ({ gems: g })) })),
      gemPlan: [...new Set(STAGES.flatMap(([, , links]) => links.flat()))].map((gem) => ({ gem }))
    })
  )
  if (!r.profile) throw new Error(r.errors.join('; '))
  return r.profile
})()
const options = muleOptions(profile, gems, starting)
const mule = defaultMule(options)

function profileSnapshot(
  stageIndex: number,
  level: number,
  act: number,
  extra: { liveIndex?: number; choiceDue?: ChoiceDue | null; classMismatch?: string | null } = {}
): ProfileSnapshot {
  const ctx: AcquisitionContext = {
    startingGems: new Set((starting[profile.meta.class] ?? []).map(normalizeGemName)),
    playerLevel: level,
    actReached: act,
    reachedLibrary: false,
    mule: mule ? { gem: mule.gem, classes: mule.classes, how: mule.how } : null
  }
  return {
    meta: profile.meta,
    errors: [],
    gemDataError: null,
    level,
    classMismatch: extra.classMismatch ?? null,
    muling: null,
    activeStage: resolveStage(profile.stages[stageIndex], stageIndex, gems),
    nextStage: profile.stages[stageIndex + 1] ? resolveStage(profile.stages[stageIndex + 1], stageIndex + 1, gems) : null,
    acquisitions: acquisitionsForStage(profile, stageIndex, gems, ctx),
    stageCount: profile.stages.length,
    viewedIndex: stageIndex,
    liveIndex: extra.liveIndex ?? stageIndex,
    choiceDue: extra.choiceDue ?? null,
    library: [],
    activeId: null,
    muleChoice: { options, chosen: mule?.gem ?? null }
  }
}

function log(zone: string, areaId: string, areaLevel: number, level: number): LogSnapshot {
  return {
    status: { state: 'watching', path: 'Client.txt', sizeBytes: 1 },
    state: { area: { areaId, name: zone, areaLevel, ts: 1 }, character: 'manauda', charClass: 'Marauder', level },
    recent: [],
    languageMismatch: false,
    zoneFit: null
  }
}

const trials: TrialsSnapshot = {
  trials: [
    { id: 't1', act: 1, lab: 'normal', zone: 'The Lower Prison', seen: true },
    { id: 't2', act: 2, lab: 'normal', zone: 'The Crypt Level 1', seen: true },
    { id: 't3', act: 2, lab: 'normal', zone: 'The Chamber of Sins Level 2', seen: false },
    { id: 't4', act: 3, lab: 'normal', zone: 'The Crematorium', seen: false },
    { id: 't5', act: 3, lab: 'normal', zone: 'The Catacombs', seen: false },
    { id: 't6', act: 3, lab: 'normal', zone: 'The Imperial Gardens', seen: false }
  ],
  seenCount: 2,
  total: 6,
  currentZoneTrialId: 't3',
  unlockedLabs: [],
  completedLabs: []
}

// The Normal Labyrinth beaten: its six trials ticked, its heading says so.
const labDone: TrialsSnapshot = {
  ...trials,
  trials: trials.trials.map((t) => ({ ...t, seen: true })),
  seenCount: 6,
  currentZoneTrialId: null,
  completedLabs: ['normal']
}

const guide: GuideState = {
  route: {
    act: 2,
    name: 'Act 2',
    steps: [
      { id: 's1', type: 'enter', zone: 'The Southern Forest', text: 'Through the Southern Forest to the Forest Encampment' },
      { id: 's2', type: 'quest', zone: 'The Old Fields', text: 'Kill the Beast in the Den' },
      {
        id: 's3',
        type: 'quest',
        zone: 'The Chamber of Sins Level 2',
        text: 'Kill Fidelitas, take the Baleful Gem',
        hints: ['Trial of Ascendancy on this level'],
        rewardHint: true
      },
      { id: 's4', type: 'enter', zone: 'The Broken Bridge', text: 'Kraityn at the Broken Bridge' }
    ]
  },
  acts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  skeletonActs: [],
  errors: [],
  doneIds: ['s1', 's2'],
  cursorIndex: 2,
  cursorStepId: 's3'
}

const bandit: ChoiceDue = { id: 'bandit', wants: 'help Alira', options: ['help Alira', 'help Kraityn', 'help Oak', 'kill all three'] }
const crypt = log('The Chamber of Sins Level 2', '1_2_9_2', 15, 22)

/** One screenshot each. `tab` is clicked after load; `settings` opens Settings. */
export interface Scenario {
  name: string
  tab?: 'Guide' | 'Gems' | 'Trials'
  /** a button to press after the tab, by (part of) its text */
  click?: string
  settings?: boolean
  opacity?: number
  /** a long regex, so the counter shows its warning */
  regex?: string
  profile: ProfileSnapshot
  log: LogSnapshot
  trials: TrialsSnapshot
  guide: GuideState
}

const scenarios: Scenario[] = [
  // Act 2, the live stage: line colours, NEW, a pick, the bandit reminder.
  { name: 'gems-act2', tab: 'Gems', profile: profileSnapshot(3, 22, 2, { choiceDue: bandit }), log: crypt, trials, guide },
  // The Gems tab's colour legend, unfolded in Settings.
  {
    name: 'settings-legend',
    settings: true,
    click: 'What the colours mean',
    profile: profileSnapshot(3, 22, 2),
    log: crypt,
    trials,
    guide
  },
  // The opening stage: the mule trip in the plan, the starting gem's line.
  {
    name: 'gems-mule',
    tab: 'Gems',
    profile: profileSnapshot(0, 2, 1),
    log: log('The Coast', '1_1_2', 2, 2),
    trials: { ...trials, currentZoneTrialId: null },
    guide
  },
  // Paged back a stage, with a wrong-class warning: the notices.
  {
    name: 'gems-paged',
    tab: 'Gems',
    profile: profileSnapshot(2, 22, 2, { liveIndex: 3, classMismatch: 'Ranger' }),
    log: crypt,
    trials,
    guide
  },
  { name: 'trials', tab: 'Trials', profile: profileSnapshot(3, 22, 2), log: crypt, trials, guide },
  { name: 'trials-lab-done', tab: 'Trials', profile: profileSnapshot(3, 22, 2), log: crypt, trials: labDone, guide },
  { name: 'guide', tab: 'Guide', profile: profileSnapshot(3, 22, 2), log: crypt, trials, guide },
  {
    name: 'settings',
    settings: true,
    opacity: 0.4,
    regex: '"' + 'a|'.repeat(130) + '"',
    profile: profileSnapshot(3, 22, 2),
    log: crypt,
    trials,
    guide
  },
  // The panel at 40 % opacity over the dark stand-in for the game.
  { name: 'gems-opacity40', tab: 'Gems', opacity: 0.4, profile: profileSnapshot(3, 22, 2), log: crypt, trials, guide }
]

const outDir = process.argv[2] ?? join(root, 'out/render-check')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'scenarios.json'), JSON.stringify(scenarios))
console.log(`${scenarios.length} scenarios → ${join(outDir, 'scenarios.json')}`)
