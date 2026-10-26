import { sourceMark } from '../../lib/sources'
import { GemName, Pip, Tag } from '../shared'

// The build's links at the bottom of the Gems tab, each line marked by act and kind.

// The build's links, on the tab's shared columns. The pip and the gem take the
// first two together — a link row has no price, and giving up the whole cost
// column to whitespace would cost the names a third of the panel — while the
// source sits in the same column as everywhere else, which is the point.
type LinkMark = 'thisAct' | 'notYet'

// How a link row reads against the act you've reached (see LinkMark in the
// engine). The state belongs to the whole line, never to one word in it:
// this act's gems get a gold-tinted line with a gold bar on its left edge (the
// Guide's current step reads the same way); "not yet" turns the line grey.
// NEW is separate and stacks with any of them: it says what changed since the
// previous stage, whatever the gem's act. Text colours stay with what they mean — the gem name
// white, the source in its category colour — so a Library gem in the act
// you're in is gold-lined AND violet, not one or the other. Never colour
// alone: the bar is a shape, and the tooltip says it in words.
//
// The mule and a starting gem colour their whole line in their own colour —
// turquoise for "another class's alt hands it over", green for "you start with
// it" — but only on a stage where they're NEW (owner's call): the line is the
// "look here", and a gem you've had since level 1 isn't news. So never on the
// first stage, where nothing is. Neither gets an act mark, so a line is only
// ever one of the three. The words in the source column ("Mule · Ranger",
// "✓ start") say what they are on every stage, coloured or not.
export const LINE_TONE = {
  thisAct: 'bg-overlay-accent/10 shadow-[inset_2px_0_0_var(--color-overlay-accent)]',
  mule: 'bg-mule/10 shadow-[inset_2px_0_0_var(--color-mule)]',
  start: 'bg-ok/10 shadow-[inset_2px_0_0_var(--color-ok)]'
} as const

function lineTone(entry: AcquisitionEntryBridge | undefined, link: LinkMark | undefined, isNew: boolean): string {
  if (entry?.mule?.length) return isNew ? LINE_TONE.mule : ''
  if (entry?.starting) return isNew ? LINE_TONE.start : ''
  return link === 'thisAct' ? LINE_TONE.thisAct : ''
}

function linkMarkTitle(mark: LinkMark | undefined, act: number | undefined): string | undefined {
  if (mark === 'thisAct') return `From Act ${act}, the act you're in.`
  if (mark === 'notYet') return `Not yet: from Act ${act}.`
  return undefined
}

export function SocketGroup({
  group,
  acq,
  marks,
  fresh,
  relinked
}: {
  group: ColoredSocketGroupBridge
  acq: Map<string, AcquisitionEntryBridge>
  marks: Record<string, LinkMark>
  /** per gem: a copy the previous stage's links don't have — it wears NEW */
  fresh: readonly boolean[]
  /** the link was rearranged since the previous stage (see links.ts) */
  relinked: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        'relative col-span-3 mb-1.5 grid grid-cols-subgrid items-center gap-x-1.5 gap-y-px rounded-md border border-overlay-border/70 bg-black/20 px-0.5 py-1 ' +
        (relinked ? 'mt-2.5' : '')
      }
    >
      {/* On the box's top edge, like NEW on a gem: the link itself changed —
          a gem moved in from another link, or one left it. Text, so it reads
          without colour; NEW alone said nothing about either. */}
      {relinked && (
        <Tag
          tone="neutral"
          className="absolute -top-2 right-2"
          title="Rearranged since the previous stage: a gem moved into this link from another, or left it"
        >
          relinked
        </Tag>
      )}
      {group.gems.map((gem, i) => {
        const entry = acq.get(gem.name.toLowerCase())
        const mark = sourceMark(entry)
        const link = marks[gem.name.toLowerCase()]
        const notYet = link === 'notYet'
        return (
          // One line, one subgrid: the tint and the bar span all of it, and the
          // columns still line up with every other row. Every line gets the
          // same padding, highlighted or not, so the names stay aligned.
          <div
            key={i}
            title={linkMarkTitle(link, entry?.act)}
            className={
              'col-span-3 grid grid-cols-subgrid items-center gap-x-1.5 rounded-sm px-1 py-px ' +
              lineTone(entry, link, fresh[i] ?? false)
            }
          >
            <div className="col-span-2 flex min-w-0 items-center gap-1.5">
              <Pip gem={gem} dim={notYet} />
              <span className={'min-w-0 truncate text-xs ' + (notYet ? 'text-overlay-muted' : 'text-overlay-text')}>
                <GemName name={gem.name} />
                {fresh[i] && (
                  <Tag tone="neutral" className="ml-1" title="A copy the previous stage's links don't have, new with this stage">
                    new
                  </Tag>
                )}
                {/* Only a genuinely unrecognised gem is flagged. A gem with no
                    attribute requirement is fully known — marking it "?" made
                    the overlay look broken on Portal, Convocation and friends. */}
                {gem.unknown && (
                  <span className="ml-1 text-[10px] text-warn" title="not in the gem data, colour guessed">
                    ?
                  </span>
                )}
              </span>
            </div>
            {/* Always rendered, even when empty: a missing cell would pull the
                next row's gem into the source column. */}
            <span title={mark?.title} className={'truncate text-[10px] ' + (notYet ? 'text-overlay-muted' : (mark?.tone ?? ''))}>
              {mark?.label}
            </span>
          </div>
        )
      })}
      {group.note && <div className="col-span-3 mt-0.5 pl-4 text-[10px] text-overlay-muted">{group.note}</div>}
    </div>
  )
}
