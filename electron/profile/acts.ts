// The level you reach each act at — where the campaign's acts sit on the level
// line the overlay tracks. Pure. Used twice: to turn a PoB skill set called
// "Act 3" into a level range, and to tell which acts a stage covers, so its
// shopping list holds that stage's acts and no later ones.
//
// Acts 1-6 are the table this always had and match a real capture's runs
// (the level on first entering each act's town, median of ten full runs);
// Acts 7-10 are lowered to that capture, which reached them 3-6 levels earlier
// than the old table said. Erring early is the safe side: a stage that thinks
// it's still in Act 7 when you're in Act 8 would hold back an Act 8 reward.

export const ACT_START_LEVEL: Readonly<Record<number, number>> = {
  1: 1, 2: 12, 3: 22, 4: 32, 5: 40, 6: 45, 7: 49, 8: 53, 9: 59, 10: 61
}

/** Where the campaign ends, for "Act 10" and open-ended ranges. */
export const CAMPAIGN_END = 70

/** The act you'd be in at a level: the last one that starts at or below it. */
export function actAtLevel(level: number): number {
  let act = 1
  for (let a = 2; a <= 10; a++) if (ACT_START_LEVEL[a] <= level) act = a
  return act
}

/** The first and last act a level range touches. */
export function actsOfLevels([min, max]: readonly [number, number]): [first: number, last: number] {
  return [actAtLevel(min), actAtLevel(Math.max(min, max))]
}
