import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// The passive tree around your next points, drawn when you open it
// (Passives → Map). Main lays it out (electron/profile/tree-map.ts); this only
// draws, and lets you look around: drag to move, the wheel (or + and −) to
// zoom, Plan for your whole plan at once, ↺ back to your points. Gold is taken
// by plan — the overlay counts points, it can't see your tree — 1 is your
// point now, 2-6 the ones after, the dashed line the way they go, and the
// faint gold the rest of the plan. Only the numbered nodes are named (zoomed
// in, the notables too); everything else has its name on hover. Clicking a
// numbered node copies its name, like the list above. It takes the room
// there is: the panel's width, and as tall as the panel shows (useMapSize),
// at the same scale, so a bigger window shows more of the tree.

/** Width / height it's asked for, and the flattest it gets. */
const ASPECT = 1.7
/** Tree units per px it opens at, at least: a few groups across the old
 *  340 px block. A bigger window shows more of the tree, not bigger nodes. */
const OPEN_SCALE = 3000 / 340
/** As far as it zooms in, in tree units per px (a group or so across). */
const MIN_SCALE = 700 / 340
/** Room under the map in the panel's view, in px: the legend below it. */
const LEGEND_PX = 56
/** A drag shorter than this (px) is a click. */
const DRAG_PX = 4

const R: Record<string, number> = { small: 3.6, notable: 6.5, keystone: 8.5, jewel: 5.5, mastery: 5.5, start: 8 }

type Box = [number, number, number, number]
/** where you're looking: its centre on the tree, and tree units per px */
interface View {
  cx: number
  cy: number
  scale: number
}

export function PassiveMap({
  points,
  due,
  respec
}: {
  points: number
  due: number | undefined
  /** the respec shown, by key: marking it done takes its marks away */
  respec?: string
}): React.JSX.Element {
  const [map, setMap] = useState<PassiveMapBridge | null | 'loading'>('loading')
  // where you're looking; null: where it opens (around your next points)
  const [view, setView] = useState<View | null>(null)

  // Again whenever your next point moves.
  useEffect(() => {
    let stale = false
    void window.overlay?.passiveMap(ASPECT).then((m) => {
      if (!stale) setMap(m ?? null)
    })
    return () => {
      stale = true
    }
    // not read inside: they're what says the map needs asking for again
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [points, due, respec])

  if (map === 'loading') return <div className="mt-1.5 aspect-[1.7] rounded bg-black/30" />
  if (!map) return <p className="mt-1.5 text-[10px] text-overlay-muted">No map: the tree data has no positions.</p>

  return <MapView map={map} view={view} setView={setView} />
}

/** The size the map gets: the panel's width, and as tall as the panel's view
 *  has room for under it (never flatter than ASPECT). Follows the window. */
function useMapSize(ref: React.RefObject<HTMLDivElement | null>): [number, number, boolean] {
  const [size, setSize] = useState<[number, number, boolean]>([340, 200, false])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // the panel's scrolling body: as much of it as it shows
    const scroller = el.closest('.overflow-y-auto') ?? document.documentElement
    const measure = (): void => {
      const w = Math.max(1, Math.round(el.clientWidth))
      const h = Math.max(Math.round(w / ASPECT), Math.round(scroller.clientHeight - LEGEND_PX))
      setSize((s) => (s[0] === w && s[1] === h && s[2] ? s : [w, h, true]))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    watch.observe(scroller)
    return () => watch.disconnect()
  }, [ref])
  return size
}

function MapView({
  map,
  view: chosen,
  setView
}: {
  map: PassiveMapBridge
  view: View | null
  setView: React.Dispatch<React.SetStateAction<View | null>>
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [W, H, measured] = useMapSize(wrapRef)

  // Opened: brought into view with its legend, once it has its size.
  const shown = useRef(false)
  useEffect(() => {
    if (shown.current || !measured) return
    shown.current = true
    wrapRef.current?.parentElement?.scrollIntoView({ block: 'end' })
  }, [measured])

  /** a box in view, centred, at the scale it fits at (not below `least`) */
  const fitting = useCallback(
    ([x, y, w, h]: Box, least = 0): View => ({ cx: x + w / 2, cy: y + h / 2, scale: Math.max(w / W, h / H, least) }),
    [W, H]
  )
  /** the view, kept on the tree and between the zoom limits */
  const clamp = useCallback(
    ({ cx, cy, scale }: View): View => {
      const [ex, ey, ew, eh] = map.extent
      return {
        cx: Math.min(Math.max(cx, ex), ex + ew),
        cy: Math.min(Math.max(cy, ey), ey + eh),
        scale: Math.min(Math.max(scale, MIN_SCALE), Math.max(ew / W, eh / H) * 1.1)
      }
    },
    [map.extent, W, H]
  )
  const opening = useMemo(() => clamp(fitting(map.box, OPEN_SCALE)), [clamp, fitting, map.box])
  const view = chosen ? clamp(chosen) : opening

  /** zoom by `f` (above 1: out) around a point of the drawing, 0-1 across and down */
  const zoom = useCallback(
    (f: number, fx = 0.5, fy = 0.5): void =>
      setView((v) => {
        const { cx, cy, scale } = v ? clamp(v) : opening
        const to = clamp({ cx, cy, scale: scale * f }).scale
        // the point under the pointer stays under it
        const px = cx + (fx - 0.5) * W * scale
        const py = cy + (fy - 0.5) * H * scale
        return clamp({ cx: px - (fx - 0.5) * W * to, cy: py - (fy - 0.5) * H * to, scale: to })
      }),
    [clamp, setView, opening, W, H]
  )

  // The wheel zooms where the pointer is. Its own listener: React's is
  // passive, and the panel mustn't scroll at the same time.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      zoom(Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoom])

  // Dragging moves the view; a short one is still a click on a node.
  const drag = useRef<{ x: number; y: number; from: View; moved: boolean; id: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, from: view, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_PX) return
      d.moved = true
      e.currentTarget.setPointerCapture(d.id)
    }
    const { cx, cy, scale } = d.from
    setView(clamp({ cx: cx - dx * scale, cy: cy - dy * scale, scale }))
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (drag.current?.moved) e.currentTarget.releasePointerCapture(drag.current.id)
    drag.current = null
  }

  // Sizes go with the zoom, but slower: zoomed out, the tree stays readable
  // as a shape; zoomed in, the nodes don't fill the view. In steps, so the
  // whole tree isn't drawn again on every turn of the wheel.
  const k0 = opening.scale // tree units per px where it opens
  const kNow = 2 ** (Math.round(Math.log2(view.scale) * 4) / 4)
  const s = k0 * Math.sqrt(kNow / k0) // node sizes
  const named = kNow < k0 * 0.7 // zoomed in: the notables get names too
  const viewBox = [view.cx - (W * view.scale) / 2, view.cy - (H * view.scale) / 2, W * view.scale, H * view.scale]

  const links = useMemo(
    () =>
      map.links.map((l, i) => {
        const style = LINK[l.state]
        return l.arc ? (
          <path
            key={i}
            d={`M${l.from[0]},${l.from[1]} A${l.arc.r},${l.arc.r} 0 0 ${l.arc.sweep} ${l.to[0]},${l.to[1]}`}
            fill="none"
            vectorEffect="non-scaling-stroke"
            {...style}
          />
        ) : (
          <line
            key={i}
            x1={l.from[0]}
            y1={l.from[1]}
            x2={l.to[0]}
            y2={l.to[1]}
            vectorEffect="non-scaling-stroke"
            {...style}
          />
        )
      }),
    [map.links]
  )
  const nodes = useMemo(() => map.nodes.map((n) => <MapNodeMark key={n.id} node={n} k={s} />), [map.nodes, s])
  const names = useMemo(
    () =>
      map.nodes
        .filter(
          (n) =>
            n.kind !== 'small' &&
            n.kind !== 'mastery' &&
            (n.num != null || (named && (n.kind === 'notable' || n.kind === 'keystone')))
        )
        .map((n) => {
          const numbered = n.num != null
          return (
            <text
              key={`name-${n.id}`}
              x={n.x}
              y={n.y + Math.max(R[n.kind] ?? 4, 6.5) * s + 10 * kNow}
              textAnchor="middle"
              fontSize={(numbered ? 9 : 8) * kNow}
              fontWeight={numbered ? 600 : 400}
              fill={numbered ? 'var(--color-overlay-text)' : 'var(--color-overlay-muted)'}
              stroke="#0b0e14"
              strokeWidth={3 * kNow}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {n.name}
            </text>
          )
        }),
    [map.nodes, named, s, kNow]
  )

  const moved = chosen != null
  const tool =
    'flex h-5 min-w-5 items-center justify-center rounded bg-black/60 px-1 text-[10px] text-overlay-muted hover:bg-white/15 hover:text-overlay-text'
  return (
    <div className="mt-1.5">
      <div ref={wrapRef} className="relative">
        <svg
          ref={svgRef}
          viewBox={viewBox.map((v) => Math.round(v)).join(' ')}
          style={{ height: H }}
          className="block w-full cursor-grab touch-none select-none rounded border border-overlay-border bg-[#0b0e14] active:cursor-grabbing"
          role="img"
          aria-label="The passive tree around your next points: drag to move, the wheel to zoom"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            zoom(0.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
          }}
        >
          {/* drawn once it has its size: the whole tree, not twice */}
          {measured && (
            <>
              {links}
              {nodes}
              {/* names last, over every node and line */}
              {names}
            </>
          )}
        </svg>
        <div className="absolute right-1 top-1 flex gap-0.5">
          <button
            className={tool}
            onClick={() => zoom(1 / 1.5)}
            title="Zoom in (or the wheel, or a double click)"
            aria-label="Zoom in"
          >
            +
          </button>
          <button className={tool} onClick={() => zoom(1.5)} title="Zoom out (or the wheel)" aria-label="Zoom out">
            −
          </button>
          <button className={tool} onClick={() => setView(clamp(fitting(map.plan)))} title="Your whole plan at once">
            Plan
          </button>
          {moved && (
            <button
              className={tool}
              onClick={() => setView(null)}
              title="Back to your next points"
              aria-label="Back to your next points"
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-[10px] text-overlay-muted">
        <span className="text-overlay-accent">●</span> taken by plan,{' '}
        {map.nodes.some((n) => n.state === 'earlier') && (
          <>
            <span className="text-overlay-accent">◌</span> the points before (maybe not placed yet),{' '}
          </>
        )}
        <b className="text-overlay-text">1</b> your point now, 2 to 6 after, dashed: the way
        {map.nodes.some((n) => n.state === 'later') && (
          <>
            , <span className="text-overlay-accent/60">○</span> later in the plan
          </>
        )}
        {map.nodes.some((n) => n.state === 'refund') && (
          <>
            , <span className="text-danger">✕</span> the respec takes it out
          </>
        )}
        . Drag to move, wheel to zoom.
      </p>
    </div>
  )
}

/** a node the respec takes out */
const REFUND = '#e5534b'

const LINK = {
  off: { stroke: '#2a3346', strokeWidth: 1.4 },
  taken: { stroke: 'rgba(200, 162, 74, 0.6)', strokeWidth: 2.2 },
  path: {
    stroke: 'rgba(230, 233, 240, 0.75)',
    strokeWidth: 2,
    strokeDasharray: '4 3'
  },
  later: { stroke: 'rgba(200, 162, 74, 0.35)', strokeWidth: 1.6 }
} as const

/** a node later in the plan: gold, faint */
const LATER = 'rgba(233, 207, 138, 0.5)'

function MapNodeMark({ node: n, k }: { node: PassiveMapBridge['nodes'][number]; k: number }): React.JSX.Element {
  // a numbered node is big enough for its number, small or not; an earlier
  // one big enough to see its dashes
  const r = Math.max(R[n.kind] ?? 4, n.num != null ? 6.5 : n.state === 'earlier' || n.state === 'refund' ? 5.5 : 0) * k
  const earlier = n.state === 'earlier'
  const refund = n.state === 'refund'
  const mine = n.state === 'due' || n.state === 'next'
  // an earlier one: a gold ring, dashed, hollow: yours, maybe not placed yet
  const fill = refund
    ? '#3a1416'
    : n.state === 'due' || n.state === 'taken'
      ? 'var(--color-overlay-accent)'
      : mine || earlier
        ? '#0e1118'
        : '#1f2533'
  const stroke = refund
    ? REFUND
    : n.state === 'due'
      ? '#ffffff'
      : mine
        ? 'var(--color-overlay-text)'
        : n.state === 'taken' || earlier
          ? '#e9cf8a'
          : n.state === 'later'
            ? LATER
            : '#3a4458'
  const width = mine || earlier || refund ? 1.8 : 1
  const copy = (): void => void window.overlay?.copyPassive(n.id)
  const clickable = n.num != null || earlier
  const ring = n.kind === 'mastery' || n.kind === 'start'
  return (
    <g onClick={clickable ? copy : undefined} className={clickable ? 'cursor-pointer' : undefined}>
      <title>
        {n.name +
          (refund
            ? ', the respec takes it out'
            : earlier
              ? ', a point before (click to copy)'
              : n.num != null
                ? ' (click to copy)'
                : n.state === 'later'
                  ? ', later in the plan'
                  : '')}
      </title>
      {n.state === 'due' && (
        <circle cx={n.x} cy={n.y} r={r + 5 * k} fill="none" stroke="var(--color-overlay-accent)" strokeWidth={2 * k} opacity={0.6} />
      )}
      {n.kind === 'jewel' ? (
        <rect
          x={n.x - r}
          y={n.y - r}
          width={2 * r}
          height={2 * r}
          transform={`rotate(45 ${n.x} ${n.y})`}
          fill={fill}
          stroke={stroke}
          strokeWidth={width * k}
        />
      ) : (
        <circle
          cx={n.x}
          cy={n.y}
          r={r}
          fill={ring && !mine && !earlier && n.state !== 'taken' ? 'none' : fill}
          stroke={stroke}
          strokeWidth={width * k}
          strokeDasharray={(n.kind === 'mastery' && mine) || earlier ? `${2 * k} ${2 * k}` : undefined}
        />
      )}
      {n.state === 'refund' && (
        <path
          d={`M${n.x - r},${n.y - r}L${n.x + r},${n.y + r}M${n.x + r},${n.y - r}L${n.x - r},${n.y + r}`}
          stroke={REFUND}
          strokeWidth={1.8 * k}
          pointerEvents="none"
        />
      )}
      {n.num != null && (
        <text
          x={n.x}
          y={n.y + 3 * k}
          textAnchor="middle"
          fontSize={8 * k}
          fontWeight={700}
          fill={n.state === 'due' ? '#0e1118' : 'var(--color-overlay-text)'}
          pointerEvents="none"
        >
          {n.num}
        </text>
      )}
    </g>
  )
}
