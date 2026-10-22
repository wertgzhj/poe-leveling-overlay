// What an area id says about where you are. Pure, and import-light on purpose:
// the renderer reaches it through the trials engine.

/** Campaign area ids are '<part>_<act>_<zone>' ("1_1_2", "1_1_town",
 *  "2_8_7_1_"); hideouts and maps use word ids ("HideoutWorldTurtle"), and the
 *  Labyrinth '<n>_Labyrinth_…' — a leading digit alone would let the lab in.
 *  All verified against real captures (see data/areas/en.json). */
export function isCampaignAreaId(areaId: string): boolean {
  return /^\d+_\d+_/.test(areaId)
}
