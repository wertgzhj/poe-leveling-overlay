import { muleInstruction } from '../../lib/sources'

// The per-character mule choice under the character line.

// The open list is drawn by the OS, not inside the select: it inherits the
// select's colour on a light system background unless each option says
// otherwise — which is how "No mule" turned grey on grey.
const OPTION = 'bg-overlay-panel text-overlay-text'

/** "Mule — what this alt is for": one gem per character, picked from what a
 *  fresh alt of another class gets on the Twilight Strand. On by default
 *  (Momentum, else the first gem the build needs); "No mule" turns it off for
 *  this character — in a party, an alt may not be worth it. Its own row under
 *  the character line: a choice for the whole run, so outside the stage pages. */
export function MulePicker({
  choice
}: {
  choice: { options: MuleOptionBridge[]; chosen: string | null }
}): React.JSX.Element {
  const chosen = choice.options.find((o) => o.gem === choice.chosen) ?? null
  const short = (gem: string): string => gem.replace(/ Support$/, '')
  return (
    <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px]">
      <span className={'shrink-0 ' + (chosen ? 'text-mule' : 'text-overlay-muted')}>Mule</span>
      <select
        value={choice.chosen ?? ''}
        onChange={(e) => window.overlay?.setMule(e.target.value || null)}
        title={
          chosen
            ? `${muleInstruction(chosen.classes, chosen.how)} Per character — pick another gem, or "No mule".`
            : 'Not muling on this character: every gem comes from a quest or a vendor.'
        }
        className={
          'min-w-0 flex-1 truncate rounded border border-overlay-border bg-black/30 px-1 py-0.5 text-[10px] outline-none [color-scheme:dark] focus:border-overlay-accent ' +
          (chosen ? 'text-mule' : 'text-overlay-muted')
        }
      >
        {choice.options.map((o) => (
          <option key={o.gem} value={o.gem} className={OPTION}>
            {short(o.gem)} — {o.classes[0]}
            {o.classes.length > 1 ? ` +${o.classes.length - 1}` : ''}
          </option>
        ))}
        <option value="" className={OPTION}>
          No mule
        </option>
      </select>
    </div>
  )
}
