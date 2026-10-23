// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.
//
// The engine lives in ./engine/, one file per concern; this file is its public
// face, so importers keep one path.

export { type ColoredSocketGroup, type ResolvedStage, type AcquisitionEntry, type Acquisitions, type LinkMark, type RewardGroup, type ShoppingStop, type AcquisitionItem, type AcquisitionContext } from './engine/types.ts'
export { actFromAreaId, activeStageIndex, stepStageView, resolveStage } from './engine/stages.ts'
export { MULE_MAX_LEVEL, MULE_TRIP_LAST_START, STRAND_QUEST, muleOptions, defaultMule, mulingClass, type MuleChoice, type MuleHow, type MuleOption } from './engine/mule.ts'
export { acquisitionsForStage, planWindow } from './engine/acquisitions.ts'
