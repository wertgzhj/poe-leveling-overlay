import { useEffect, useState } from 'react'

// A small piece of the passive tree around your next points, drawn when you
// open it (Passives → Map). Main lays it out (electron/profile/tree-map.ts);
// this only draws. Gold is taken by plan — the overlay counts points, it can't
// see your tree — 1 is your point now, 2-6 the ones after, and the dashed
// line the way they go. Only the numbered nodes are named; everything else
// has its name on hover. Clicking a numbered node copies its name, like the
// list above.

/** Width / height of the drawing. */
const ASPECT = 1.7
/** The width it's laid out for, in px: sizes below are in these. */
const WIDTH_PX = 340

const R: Record<string, number> = { small: 3.6, notable: 6.5, keystone: 8.5, jewel: 5.5, mastery: 5.5, start: 8 }

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

  const [bx, by, bw, bh] = map.box
  const k = bw / WIDTH_PX // tree units per px
  return (
    <div className="mt-1.5">
      <svg
        viewBox={`${bx} ${by} ${bw} ${bh}`}
        className="block aspect-[1.7] w-full rounded border border-overlay-border bg-[#0b0e14]"
        role="img"
        aria-label="The passive tree around your next points"
      >
        {map.links.map((l, i) => {
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
        })}
        {map.nodes.map((n) => (
          <MapNodeMark key={n.id} node={n} k={k} />
        ))}
        {/* names last, over every node and line */}
        {map.nodes
          .filter((n) => n.num != null && n.kind !== 'small' && n.kind !== 'mastery')
          .map((n) => (
            <text
              key={`name-${n.id}`}
              x={n.x}
              y={n.y + Math.max(R[n.kind] ?? 4, 6.5) * k + 10 * k}
              textAnchor="middle"
              fontSize={9 * k}
              fontWeight={600}
              fill="var(--color-overlay-text)"
              stroke="#0b0e14"
              strokeWidth={3 * k}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {n.name}
            </text>
          ))}
      </svg>
      <p className="mt-0.5 text-[10px] text-overlay-muted">
        <span className="text-overlay-accent">●</span> taken by plan,{' '}
        {map.nodes.some((n) => n.state === 'earlier') && (
          <>
            <span className="text-overlay-accent">◌</span> the points before (maybe not placed yet),{' '}
          </>
        )}
        <b className="text-overlay-text">1</b> your point now, 2 to 6 after, dashed: the way
        {map.nodes.some((n) => n.state === 'refund') && (
          <>
            , <span className="text-danger">✕</span> the respec takes it out
          </>
        )}
      </p>
    </div>
  )
}

/** a node the respec takes out */
const REFUND = '#e5534b'

const LINK = {
  off: { stroke: '#2a3346', strokeWidth: 1.4 },
  taken: { stroke: 'rgba(200, 162, 74, 0.6)', strokeWidth: 2.2 },
  path: { stroke: 'rgba(230, 233, 240, 0.75)', strokeWidth: 2, strokeDasharray: '4 3' }
} as const

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
          : '#3a4458'
  const width = mine || earlier || refund ? 1.8 : 1
  const copy = (): void => void window.overlay?.copyPassive(n.id)
  const clickable = n.num != null || earlier
  const ring = n.kind === 'mastery' || n.kind === 'start'
  return (
    <g onClick={clickable ? copy : undefined} className={clickable ? 'cursor-pointer' : undefined}>
      <title>
        {n.name +
          (refund ? ', the respec takes it out' : earlier ? ', a point before (click to copy)' : n.num != null ? ' (click to copy)' : '')}
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
