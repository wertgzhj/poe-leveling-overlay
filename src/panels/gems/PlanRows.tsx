import { type MuleHow, muleInstruction, sourceName, sourceTone } from '../../lib/sources'
import { Pip, Tag } from '../shared'
import { LINE_TONE } from './LinkGroup'

// The rows of the Gems tab's plan box, on the tab's three columns: cost, gem, source.

// Vendor price tiers, shortened for the Gems tab's cost column — a display
// choice, keyed by the names COST_TIERS (electron/profile/gems.ts) uses. An
// unknown tier falls back to its own name, so adding one there can never render
// a blank cell here.
const COST_SHORT: Record<string, string> = {
  Wisdom: 'Wisdom',
  Transmutation: 'Trans',
  Alteration: 'Alt',
  Chance: 'Chance',
  Alchemy: 'Alch'
}

// One ramp, grey to white: the pricier the gem, the brighter the word. Not gold
// — gold means "now" in this tab, and a price isn't a call to act. The word
// carries the meaning anyway; every step clears AA contrast.
const COST_TONE: Record<string, string> = {
  Wisdom: 'text-overlay-muted',
  Transmutation: 'text-overlay-text/70',
  Alteration: 'text-overlay-text/80',
  Chance: 'text-overlay-text/90',
  Alchemy: 'text-overlay-text'
}

// The acquisition list's left column: what a gem costs you, and how many you
// need. Fixed width and right-aligned, so every gem name starts on one line and
// the price keeps a constant distance from the gem it belongs to.
function CostCell({
  cost,
  count,
  free,
  mule,
  muleHow,
  later
}: {
  cost?: string
  count?: number
  free?: boolean
  /** the classes whose level-1 alt hands this gem over — no price to put here */
  mule?: string[]
  muleHow?: MuleHow
  later?: boolean
}): React.JSX.Element {
  const n = count ?? 1
  // "Not now" is the readable grey, never transparency: faded grey fell to
  // 2.4:1, unreadable. The "lvl N" next to the gem says why it waits.
  const cls = 'text-right text-[10px] '
  const now = (tone: string): string => (later ? 'text-overlay-muted' : tone)

  if (mule?.length) {
    return (
      <span
        className={cls + now('text-mule')}
        title={muleInstruction(mule, muleHow)}
      >
        {n > 1 && `${n}× `}
        Mule
      </span>
    )
  }

  if (free) {
    // A quest hands out exactly ONE reward. Needing the gem twice means one is
    // free and the rest you buy or find — "2× free" would be a lie, and the old
    // ×2 chip next to the name read as if the quest gave you both.
    const extra = n - 1
    return (
      <span
        className={cls + now('text-ok')}
        title={
          extra > 0
            ? `The quest gives one — the other ${extra === 1 ? 'copy' : `${extra} copies`} you buy or find`
            : 'Free quest reward'
        }
      >
        Reward{extra > 0 && ` +${extra}`}
      </span>
    )
  }

  // No known price still says "buy" rather than leaving the cell blank — an
  // empty column would silently turn a purchase into an unlabelled row.
  const short = cost ? (COST_SHORT[cost] ?? cost) : 'buy'
  const tone = (cost && COST_TONE[cost]) || 'text-overlay-muted'
  const copies = n > 1 ? ` — and you need ${n} of them` : ''
  return (
    <span
      className={cls + now(tone)}
      title={cost ? `Costs ${cost}${copies}` : `Buy from a vendor${copies}`}
    >
      {n > 1 && `${n}× `}
      {short}
    </span>
  )
}

// The acquisition list's right column, and the same column on the link rows.
// LEFT-aligned on purpose: every entry opens with "A<N> ·", so those anchors
// line up down the list. Right-aligning would put them at a different x in
// every row — the raggedness this whole layout exists to remove. Truncated
// rather than wrapped, so a long quest name can't change a row's height.
function SourceCell({
  act,
  what,
  approx,
  tone,
  title,
  later
}: {
  act?: number
  what: string
  approx?: boolean
  /** overrides the muted default — muling is turquoise on both sides of the row
   *  so it stays obvious that this one isn't part of the shopping. */
  tone?: string
  title?: string
  later?: boolean
}): React.JSX.Element {
  const named = sourceName(what)
  const text = [act ? `A${act}` : null, named].filter(Boolean).join(' · ')
  return (
    <span
      title={
        title ??
        (named === what ? text : `${text} (${what})`) +
          (approx ? ' — general vendor, may show up earlier as a quest reward' : '')
      }
      className={
        'truncate text-[10px] ' + (later ? 'text-overlay-muted' : (tone ?? sourceTone(named)))
      }
    >
      {text}
      {approx && ' ≈'}
    </span>
  )
}

// One quest's reward gems. When several of your build's gems come from the same
// quest you can only pick ONE — the rest must be bought — so that's flagged
// loudly. Act + quest are shown once per group.
//
// A row renders as three bare cells (no wrapper element) so they land directly
// in the list's grid: the columns then line up across every row, not just
// within one. A "pick one" group is a box instead and spans all three.
export function RewardGroupRow({
  group,
  comingUpAt,
  later
}: {
  group: RewardGroupBridge
  comingUpAt?: number
  later?: boolean
}): React.JSX.Element {
  const context = (e: AcquisitionEntryBridge): string =>
    e.fromLevel ? ` — for later (lvl ${e.fromLevel}+)` : ''

  if (!group.pickOne) {
    const e = group.gems[0]
    return (
      <>
        <CostCell free count={e.count} later={later} />
        <GemCell entry={e} comingUpAt={comingUpAt} later={later}>
          {context(e) && <span className="text-overlay-muted">{context(e)}</span>}
        </GemCell>
        <SourceCell act={group.act} what={group.quest ?? 'quest'} later={later} />
      </>
    )
  }
  // A choice, so it keeps its own box — but on the tab's columns, not its own:
  // `subgrid` borrows the parent's tracks, so the box's border and padding shift
  // its outer edges without moving the shared column lines. That's what keeps
  // the gems and the quest name lined up with the plain rows around it.
  const rest = group.buyRest
  return (
    <div
      className={
        // A pick for later keeps its box, in grey: the choice is real, just not
        // yet — and grey stays readable where transparency did not.
        'col-span-3 grid grid-cols-subgrid items-baseline gap-x-1.5 rounded border p-1.5 ' +
        (later ? 'border-overlay-border' : 'border-overlay-accent/40 bg-overlay-accent/5')
      }
    >
      <Tag tone={later ? 'muted' : 'gold'} className="col-span-2 mb-0.5 justify-self-start">
        Pick one, buy rest
      </Tag>
      <SourceCell act={group.act} what={group.quest ?? 'quest'} later={later} />
      {/* One price for the whole group, centred against the gems it covers: the
          quest gives one, so the rest is what you actually pay. */}
      {rest && (
        <span
          style={{ gridRow: `span ${group.gems.length}` }}
          title={`The quest gives one — the other ${rest.count === 1 ? 'copy costs' : `${rest.count} copies cost`}${rest.cost ? ` ${rest.cost} each` : ' vendor money'}`}
          className={
            'self-center text-right text-[10px] ' +
            ((!later && rest.cost && COST_TONE[rest.cost]) || 'text-overlay-muted')
          }
        >
          {rest.count}× {rest.cost ? (COST_SHORT[rest.cost] ?? rest.cost) : 'buy'}
        </span>
      )}
      {group.gems.map((e) => (
        <div
          key={e.gem}
          title={e.gem + context(e)}
          className={
            'col-span-2 col-start-2 flex items-baseline gap-1.5 text-xs ' +
            (e.fromLevel || later ? 'text-overlay-muted' : 'text-overlay-text')
          }
        >
          <Pip gem={e.colored} dim={later} />
          <span className="min-w-0 truncate">
            {e.gem}
            {context(e) && <span className="text-overlay-muted">{context(e)}</span>}
          </span>
        </div>
      ))}
      {/* Where "buy rest" actually happens. Every gem in here is filed as a
          quest reward — a quest is its earliest source — so none of them ever
          reached the shopping list, and the instruction had no address. */}
      {rest && (rest.npc || rest.partial) && (
        <div className="col-span-2 col-start-2 text-[10px] text-overlay-muted">
          ↳ the rest:{' '}
          {rest.npc ? (
            <span className={sourceTone(sourceName(rest.npc))}>
              {[rest.act ? `A${rest.act}` : null, sourceName(rest.npc)].filter(Boolean).join(' · ')}
            </span>
          ) : (
            <span title="No vendor we know of stocks them — a drop or a trade">nobody sells them</span>
          )}
          {rest.npc && rest.partial && (
            <span title="At least one of these isn't sold by any vendor in the gem data">
              {' '}
              · not all of them
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// The acquisition list's middle column: the pip, the gem, and whatever else
// belongs to the gem itself (when it becomes relevant, how to mule it). The pip
// is fixed-width, so the names line up under each other too.
function GemCell({
  entry: e,
  comingUpAt,
  later,
  children
}: {
  entry: AcquisitionEntryBridge
  comingUpAt?: number
  later?: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  // One row for a whole quest pick: the gems stacked, one per line — "A or B"
  // on one line truncates to "A or…" in a narrow panel — and a line under
  // them that says which to buy.
  if (e.anyOf) {
    const n = e.count ?? 1
    return (
      <div
        title={`Only the ${n > 1 ? `${n} you didn't pick` : "one you didn't pick"} — the quest gave you one of these, and the overlay can't see your inventory.`}
        className={'flex min-w-0 flex-col text-xs ' + (later ? 'text-overlay-muted' : 'text-overlay-text')}
      >
        {e.anyOf.map((g) => (
          <span key={g.gem} className="flex min-w-0 items-baseline gap-1.5">
            <Pip gem={g.colored} dim={later} />
            <span className="min-w-0 truncate">{g.gem}</span>
          </span>
        ))}
        <span className="text-[10px] text-overlay-muted">
          ↳ {n > 1 ? `the ${n} you didn't pick` : "whichever you didn't pick"}
          {children}
        </span>
      </div>
    )
  }
  return (
    <div
      title={later ? 'Coming up — you’re a bit underlevelled for this yet' : undefined}
      className={
        'flex min-w-0 items-baseline gap-1.5 text-xs ' +
        (e.fromLevel || later ? 'text-overlay-muted' : 'text-overlay-text')
      }
    >
      <Pip gem={e.colored} dim={later} />
      {/* Truncated, never wrapped: "for later (lvl 62+)" is worth knowing but
          not worth a second line, least of all in a narrow panel. The full
          text is in the tooltip. */}
      <span className="min-w-0 truncate">
        {e.gem}
        {/* You may already own this one — it lost a quest choice, and nothing
            in the log says which of them you took. Marked rather than hidden:
            a gem you still need must not vanish, and one you have shouldn't
            read as an order to go and buy it. */}
        {e.fromPickOne && (
          <span
            className="ml-1 text-[10px] text-overlay-muted"
            title="Only if you didn't pick it — it was one of the choices at that quest, and the overlay can't see your inventory."
          >
            (if not picked)
          </span>
        )}
        {children}
        {comingUpAt != null && !e.fromLevel && (
          <span className="text-overlay-muted"> · lvl {comingUpAt}</span>
        )}
      </span>
    </div>
  )
}

// A single vendor purchase in the merged acquisition box — same three cells as a
// reward row, so buys and takes read as one list. The cost column carries the
// take-it-free vs. pay-for-it distinction that the old take/buy badges did,
// without spending a second column on it (owner: cost matters a lot).
//
// A gem another class starts with is the same row with both ends swapped out:
// "Mule" where the price would be, because there isn't one, and the class you
// roll where the vendor would be, because that is where you get it. Both in
// turquoise, so muling never reads as shopping.
export function BuyRow({
  entry: e,
  comingUpAt,
  later
}: {
  entry: AcquisitionEntryBridge
  comingUpAt?: number
  later?: boolean
}): React.JSX.Element {
  const mule = e.mule?.length ? e.mule : undefined
  const cells = (
    <>
      <CostCell cost={e.cost} count={e.count} mule={mule} muleHow={e.muleHow} later={later} />
      <GemCell entry={e} comingUpAt={comingUpAt} later={later} />
      {mule ? (
        <SourceCell
          what={mule.join('/')}
          tone="text-mule"
          title={`Roll a level-1 ${mule.join(' or ')}, stash its starting gems, delete it. Otherwise ${e.npc ?? 'a vendor'}${e.act ? ` in Act ${e.act}` : ''} sells it${e.cost ? ` for ${e.cost}` : ''}.`}
          later={later}
        />
      ) : (
        <SourceCell act={e.act} what={e.npc ?? 'vendor'} approx={e.fallback} later={later} />
      )}
    </>
  )
  // The mule's line is tinted turquoise as a whole, like its line in the links
  // below (LINE_TONE). A subgrid, so the cells still sit on the plan's columns.
  return mule ? (
    <div className={'col-span-3 grid grid-cols-subgrid items-baseline gap-x-1.5 rounded-sm py-px ' + LINE_TONE.mule}>
      {cells}
    </div>
  ) : (
    cells
  )
}
