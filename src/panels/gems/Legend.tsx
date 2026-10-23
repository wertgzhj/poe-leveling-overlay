import { useOverlayStore } from '../../stores/overlayStore'
import { Pip, Tag } from '../shared'
import { LINE_TONE } from './LinkGroup'

// What the Gems tab's colours mean, behind a toggle in Settings — reference you
// read once, so it doesn't take room under the links while you play.
// Every sample is drawn with the classes the real rows use (LINE_TONE, Tag,
// Pip, the token colours), so the legend can't drift from what it explains.
// Each meaning is said in words too — the legend is the long form of the
// tooltips, for the player who never hovers.

/** A sample gem line, tinted the way a link row is. */
function Line({ tone, muted, children }: { tone?: string; muted?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      className={
        'w-full truncate rounded-sm px-1 py-px text-[10px] ' + (muted ? 'text-overlay-muted ' : 'text-overlay-text ') + (tone ?? '')
      }
    >
      {children}
    </span>
  )
}

function Row({ sample, children }: { sample: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      {/* A flex cell: as a plain block, the sample would sit on a 16px line
          and drop below its 10px explanation. */}
      <dt className="flex min-w-0 items-center text-[10px] leading-tight">{sample}</dt>
      <dd className="text-[10px] leading-snug text-overlay-muted">{children}</dd>
    </>
  )
}

const HEAD = 'col-span-2 mt-1 text-[10px] font-semibold text-overlay-text first:mt-0'

export function Legend(): React.JSX.Element {
  const open = useOverlayStore((s) => s.legendOpen)
  const patch = useOverlayStore((s) => s.patch)
  return (
    <div>
      <button
        aria-expanded={open}
        aria-controls="gems-legend"
        onClick={() => patch({ legendOpen: !open })}
        className="text-[10px] text-overlay-muted hover:text-overlay-text"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span> What the colours mean
      </button>
      {open && (
        <dl
          id="gems-legend"
          className="mt-1 grid grid-cols-[5.5rem_1fr] items-center gap-x-2 gap-y-1 rounded-md border border-overlay-border/70 bg-black/20 p-1.5"
        >
          <div className={HEAD}>Your links</div>
          <Row sample={<Line tone={LINE_TONE.thisAct}>Cleave</Line>}>From the act you&apos;re in</Row>
          <Row sample={<Line muted>Cyclone</Line>}>From a later act — not yet</Row>
          <Row sample={<Line tone={LINE_TONE.mule}>Momentum</Line>}>
            New with this stage, from your mule (another class&apos;s alt)
          </Row>
          <Row sample={<Line tone={LINE_TONE.start}>Ruthless</Line>}>New with this stage, and you start with it</Row>
          <Row sample={<Tag tone="neutral">new</Tag>}>Not in the previous stage&apos;s links</Row>

          <div className={HEAD}>Where it comes from</div>
          <Row sample={<span className="text-[10px] text-ok">Reward</span>}>A free quest reward — take it</Row>
          <Row sample={<span className="text-[10px] text-library">A3 · Library</span>}>
            Siosa: walk into the Library in Act 3 first
          </Row>
          <Row sample={<span className="text-[10px] text-fight">A3 · Gravicius</span>}>
            A quest reward you only get by killing Gravicius
          </Row>
          <Row sample={<span className="text-[10px] text-overlay-muted">Leap Slam · lvl 6+</span>}>
            Can&apos;t use it yet — grey until you can
          </Row>

          <div className={HEAD}>Sockets</div>
          <Row
            sample={
              <span className="flex gap-0.5">
                <Pip gem={{ name: 'R', color: 'R', unknown: false }} />
                <Pip gem={{ name: 'G', color: 'G', unknown: false }} />
                <Pip gem={{ name: 'B', color: 'B', unknown: false }} />
              </span>
            }
          >
            The socket colour the gem needs
          </Row>
          <Row sample={<Pip gem={{ name: 'W', color: 'W', unknown: false, anyColor: true }} />}>
            Fits a socket of any colour
          </Row>
        </dl>
      )}
    </div>
  )
}
