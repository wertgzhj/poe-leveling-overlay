// Route exchange (pure, no Electron imports — unit-tested).
//
// The project ships an engine and empty skeletons on purpose: route content is
// written by whoever uses the overlay, never imported from other projects. That
// rule is about what *this repository* distributes, and it says nothing about
// two players swapping a route they wrote. This module is that channel.
//
// The format is the route JSON itself, not a compressed code. Routes are small,
// and a route you accept from a stranger is something you should be able to read
// before you run it — plain JSON is reviewable, diffable and greppable.

import { validateRoute, type Route } from './route.ts'

/** Written into exports so a future format change can be recognised. */
export const ROUTE_BUNDLE_FORMAT = 'poe-leveling-overlay/routes@1'

export interface RouteBundleResult {
  routes: Route[]
  errors: string[]
}

/** Serialize routes for sharing. `skeleton` is deliberately dropped: an exported
 *  route is content someone chose to pass on, and the recipient should not be
 *  told their imported file is a placeholder. */
export function exportRoutes(routes: Route[]): string {
  const bundle = {
    format: ROUTE_BUNDLE_FORMAT,
    routes: [...routes]
      .sort((a, b) => a.act - b.act)
      .map(({ skeleton: _skeleton, ...route }) => route)
  }
  return JSON.stringify(bundle, null, 2) + '\n'
}

/**
 * Read shared routes. Deliberately tolerant about the shape, because people
 * paste whatever they have: a bundle from `exportRoutes`, a bare array, or a
 * single `actN.json` straight out of the repo.
 *
 * Every route goes through the same validator the app loads files with, so an
 * import can never write something the overlay would then reject. Invalid acts
 * are reported and skipped rather than failing the whole paste — one broken act
 * out of ten shouldn't cost you the other nine.
 */
export function parseRoutes(text: string): RouteBundleResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { routes: [], errors: [`not valid JSON: ${(e as Error).message}`] }
  }

  const list = toRouteList(raw)
  if (!list) {
    return {
      routes: [],
      errors: ['expected a route file, a list of routes, or an exported bundle']
    }
  }
  if (list.length === 0) return { routes: [], errors: ['no routes in there'] }

  const routes: Route[] = []
  const errors: string[] = []
  const seen = new Set<number>()
  for (const entry of list) {
    const { route, errors: routeErrors } = validateRoute(entry)
    if (!route) {
      const act = (entry as { act?: unknown })?.act
      const where = typeof act === 'number' ? `act ${act}` : 'one route'
      for (const err of routeErrors) errors.push(`${where}: ${err}`)
      continue
    }
    if (seen.has(route.act)) {
      errors.push(`act ${route.act}: listed twice — keeping the first`)
      continue
    }
    seen.add(route.act)
    routes.push(route)
  }
  return { routes, errors }
}

function toRouteList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj['routes'])) return obj['routes']
  // A single act file — the shape that lives in data/campaign/.
  if ('steps' in obj || 'act' in obj) return [obj]
  return null
}
