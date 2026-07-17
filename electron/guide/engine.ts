// Pure guide-progress engine (no Electron imports — unit-tested).
// Consumes area events from the P1 tracker and advances a cursor through the
// route's steps. Design rules (plan §8, validated in P1):
//  - "Next open step": completion is positional — advancing to step j marks
//    everything before j done, and the cursor is always the first open step.
//  - Towns never skip work: a town entry only advances when the matched town
//    step is the current step or the one right after it (portal trips to sell
//    must not jump the guide forward past uncompleted zones).
//  - Non-campaign instances (word ids: Hideout*, MapWorlds*, …) are ignored.
//  - Manual forward/back (hotkeys) and per-step toggling are the correction
//    mechanism — quest completion is not detectable from the log.

import type { Route, RouteStep } from './route.ts'

export interface GuideAreaEvent {
  areaId: string | null
  name: string
}

export interface GuideSnapshot {
  doneIds: string[]
  /** Index of the first open step; steps.length when everything is done. */
  cursorIndex: number
  cursorStepId: string | null
}

/** Campaign area ids are numeric-scoped ("1_1_2", "1_1_town"); hideouts and
 *  endgame maps use word ids ("HideoutWorldTurtle") — verified in act1-real.log. */
export function isCampaignAreaId(areaId: string): boolean {
  return /^\d/.test(areaId)
}

export class GuideEngine {
  private route: Route
  private done = new Set<string>()

  constructor(route: Route, doneIds: string[] = []) {
    this.route = route
    const valid = new Set(route.steps.map((s) => s.id))
    for (const id of doneIds) if (valid.has(id)) this.done.add(id)
  }

  /** Swap the route (hot reload) keeping progress for surviving step ids. */
  setRoute(route: Route): void {
    this.route = route
    const valid = new Set(route.steps.map((s) => s.id))
    this.done = new Set([...this.done].filter((id) => valid.has(id)))
  }

  snapshot(): GuideSnapshot {
    const cursor = this.cursorIndex()
    return {
      doneIds: [...this.done],
      cursorIndex: cursor,
      cursorStepId: this.route.steps[cursor]?.id ?? null
    }
  }

  /** Returns true when the event changed guide state. */
  applyArea(ev: GuideAreaEvent): boolean {
    if (ev.areaId && !isCampaignAreaId(ev.areaId)) return false

    const cursor = this.cursorIndex()
    const steps = this.route.steps
    let j = -1
    for (let i = cursor; i < steps.length; i++) {
      if (this.matches(steps[i], ev)) {
        j = i
        break
      }
    }
    if (j === -1) return false

    // Towns are visited constantly (portals, stash trips). Only advance when
    // the town step is where the route actually stands — current step, or the
    // immediate next one (the common "zone cleared → go to town" transition).
    if (steps[j].type === 'town' && j > cursor + 1) return false

    let changed = false
    for (let i = 0; i < j; i++) {
      if (!this.done.has(steps[i].id)) {
        this.done.add(steps[i].id)
        changed = true
      }
    }
    return changed
  }

  /** Hotkey: mark the current step done. */
  forward(): boolean {
    const cursor = this.cursorIndex()
    const step = this.route.steps[cursor]
    if (!step) return false
    this.done.add(step.id)
    return true
  }

  /** Hotkey: reopen the step before the cursor. */
  back(): boolean {
    const steps = this.route.steps
    for (let i = Math.min(this.cursorIndex(), steps.length) - 1; i >= 0; i--) {
      if (this.done.has(steps[i].id)) {
        this.done.delete(steps[i].id)
        return true
      }
    }
    return false
  }

  toggle(stepId: string): boolean {
    if (!this.route.steps.some((s) => s.id === stepId)) return false
    if (this.done.has(stepId)) this.done.delete(stepId)
    else this.done.add(stepId)
    return true
  }

  reset(): void {
    this.done.clear()
  }

  private cursorIndex(): number {
    const steps = this.route.steps
    for (let i = 0; i < steps.length; i++) {
      if (!this.done.has(steps[i].id)) return i
    }
    return steps.length
  }

  private matches(step: RouteStep, ev: GuideAreaEvent): boolean {
    if (step.areaId && ev.areaId) return step.areaId === ev.areaId
    if (step.zone && ev.name) return step.zone.toLowerCase() === ev.name.toLowerCase()
    return false
  }
}
