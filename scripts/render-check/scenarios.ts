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
import type { ChoiceDue, GuideState, LogSnapshot, PantheonStatus, PassivesView, ProfileSnapshot } from '../../electron/channels.ts'
import { TreeData, passivesView, planFromSpecs, type TreeFile } from '../../electron/profile/tree.ts'
import { vendorSearch } from '../../electron/profile/search.ts'
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

// A Marauder tree for the passives scenario: the nodes nearest the start, in
// two specs (the first 12, then 26) plus two Berserker nodes, planned the way
// an import plans a real build.
const tree = new TreeData(JSON.parse(readFileSync(join(root, 'data', 'tree.json'), 'utf8')) as TreeFile)
function nearest(start: number, count: number): number[] {
  const order: number[] = [start]
  for (let i = 0; i < order.length && order.length < count + 1; i++) {
    for (const next of tree.node(order[i])?.links ?? []) {
      if (!order.includes(next) && order.length < count + 1) order.push(next)
    }
  }
  return order
}
const marauderTree = ((): PassivesView => {
  const berserker = nearest(29294, 2)
  const specs = [12, 26].map((n, i) => ({
    title: i === 0 ? 'Act 2' : 'Act 3',
    nodes: [...nearest(47175, n), ...berserker],
    masteries: {}
  }))
  // Level 9 with one Book of Skill: the ninth point is due.
  return passivesView(planFromSpecs(specs, tree, tree.treeVersion), tree, 9, 1, 0)
})()

function profileSnapshot(
  stageIndex: number,
  level: number,
  act: number,
  extra: {
    liveIndex?: number
    choiceDue?: ChoiceDue | null
    classMismatch?: string | null
    pantheon?: PantheonStatus[]
    passives?: PassivesView | null
    treeMissing?: boolean
  } = {}
): ProfileSnapshot {
  const ctx: AcquisitionContext = {
    startingGems: new Set((starting[profile.meta.class] ?? []).map(normalizeGemName)),
    playerLevel: level,
    actReached: act,
    liveIndex: extra.liveIndex ?? stageIndex,
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
    prevStage: stageIndex > 0 ? resolveStage(profile.stages[stageIndex - 1], stageIndex - 1, gems) : null,
    nextStage: profile.stages[stageIndex + 1] ? resolveStage(profile.stages[stageIndex + 1], stageIndex + 1, gems) : null,
    acquisitions: acquisitionsForStage(profile, stageIndex, gems, ctx),
    vendorSearch: vendorSearch(acquisitionsForStage(profile, stageIndex, gems, ctx).plan),
    stageCount: profile.stages.length,
    viewedIndex: stageIndex,
    liveIndex: extra.liveIndex ?? stageIndex,
    choiceDue: extra.choiceDue ?? null,
    library: [],
    activeId: null,
    muleChoice: { options, chosen: mule?.gem ?? null },
    pantheon: extra.pantheon ?? [],
    passives: extra.passives ?? null,
    treeMissing: extra.treeMissing ?? false
  }
}

function log(zone: string, areaId: string, areaLevel: number, level: number): LogSnapshot {
  return {
    status: { state: 'watching', path: 'Client.txt', sizeBytes: 1 },
    state: { area: { areaId, name: zone, areaLevel, ts: 1 }, character: 'Marauder1', charClass: 'Marauder', level },
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
  /** a tab — or, in Settings, a section heading — to click first */
  tab?: 'Guide' | 'Gems' | 'Trials' | 'Gems tab' | 'Search & copy'
  /** a button to press after the tab, by (part of) its text */
  click?: string
  /** short names from Settings (real name -> short) */
  gemNames?: Record<string, string>
  settings?: boolean
  /** move mode on: draggable header, Done, the resize grip */
  moveMode?: boolean
  opacity?: number
  /** a long regex, so the counter shows its warning */
  regex?: string
  /** regexes for some acts (Settings → Search & copy → Per act) */
  actRegexes?: Array<{ from: number; to: number; regex: string }>
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
    // Settings' sections fold: open "Gems tab", then its legend.
    tab: 'Gems tab',
    click: 'What the colours mean',
    gemNames: { 'Cast when Damage Taken Support': 'CwDT', 'Melee Physical Damage Support': 'MPD' },
    profile: profileSnapshot(3, 22, 2),
    log: crypt,
    trials,
    guide
  },
  // The opening stage: no mule row, the starting gem and the mule plain.
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
  // In The Oasis with Soul of Shakari wanted: the Pantheon hint, and the list.
  {
    name: 'trials-pantheon',
    tab: 'Trials',
    profile: profileSnapshot(3, 62, 9, {
      pantheon: [
        { soul: 'Soul of Lunaris', god: 'Lunaris, Eternal Moon', act: 8, where: 'The Harbour Bridge', unlocked: true, here: false },
        {
          soul: 'Soul of Shakari',
          god: 'Shakari, Queen of the Sands',
          act: 9,
          where: 'The Sand Pit, a side area of The Oasis',
          side: 'The Sand Pit',
          unlocked: false,
          here: true
        }
      ]
    }),
    log: log('The Oasis', '2_9_4', 61, 62),
    trials: { ...trials, currentZoneTrialId: null },
    guide
  },
  { name: 'trials-lab-done', tab: 'Trials', profile: profileSnapshot(3, 22, 2), log: crypt, trials: labDone, guide },
  { name: 'guide', tab: 'Guide', profile: profileSnapshot(3, 22, 2), log: crypt, trials, guide },
  {
    name: 'settings',
    settings: true,
    tab: 'Search & copy',
    opacity: 0.4,
    regex: '"' + 'a|'.repeat(130) + '"',
    actRegexes: [
      { from: 1, to: 3, regex: '"r-g-b|b-r-g|g-g-r"' },
      { from: 4, to: 10, regex: '"r-r-g-b|nne|rint"' }
    ],
    profile: profileSnapshot(3, 22, 2),
    log: crypt,
    trials,
    guide
  },
  // Settings in move mode: it shares the overlay's window, so it drags and
  // resizes it the same way — gold header, Done, the grip.
  {
    name: 'settings-move',
    settings: true,
    moveMode: true,
    profile: profileSnapshot(3, 22, 2),
    log: crypt,
    trials,
    guide
  },
  // The passive tree under the gems: the next point, the ones after, the lab.
  {
    name: 'gems-passives',
    tab: 'Gems',
    profile: profileSnapshot(3, 22, 2, { passives: marauderTree }),
    log: crypt,
    trials,
    guide
  },
  // A build imported before the overlay read trees: where the passives would
  // be, how to get them.
  {
    name: 'gems-tree-missing',
    tab: 'Gems',
    profile: profileSnapshot(3, 22, 2, { treeMissing: true }),
    log: crypt,
    trials,
    guide
  },
  // Your short names: "MPD" in the list and the links, the full name in the tooltip.
  {
    name: 'gems-short-names',
    tab: 'Gems',
    gemNames: { 'Melee Physical Damage Support': 'MPD', 'Chance to Bleed Support': 'CtB' },
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
