import { muleInstruction } from '../lib/sources'

// The per-character mule choice, in Settings → Build profile: a decision for
// the whole run, made where the other per-character choice (the profile) is
// made — not in the Gems tab, which is for reading while you play (owner).

// The open list is drawn by the OS, not inside the select: it inherits the
// select's colour on a light system background unless each option says
// otherwise — which is how "No mule" turned grey on grey.
const OPTION = 'bg-overlay-panel text-overlay-text'

/** One gem per character, picked from what a fresh alt of another class gets
 *  on the Twilight Strand. On by default (Momentum, else the first gem the
 *  build needs); "No mule" turns it off for this character. Solo or in a
 *  party makes no difference — a party of Marauders mules all the same. */
export function MulePicker({
  choice
}: {
  choice: { options: MuleOptionBridge[]; chosen: string | null }
}): React.JSX.Element {
  const chosen = choice.options.find((o) => o.gem === choice.chosen) ?? null
  const short = (gem: string): string => gem.replace(/ Support$/, '')
  return (
    <select
      value={choice.chosen ?? ''}
      onChange={(e) => window.overlay?.setMule(e.target.value || null)}
      aria-label="Mule"
      title={
        chosen
          ? `${muleInstruction(chosen.classes, chosen.how)} Per character — pick another gem, or "No mule".`
          : 'Not muling on this character: every gem comes from a quest or a vendor.'
      }
      className={
        'mt-1 w-full truncate rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] outline-none [color-scheme:dark] focus:border-overlay-accent ' +
        (chosen ? 'text-mule' : 'text-overlay-text')
      }
    >
      {choice.options.map((o) => (
        <option key={o.gem} value={o.gem} className={OPTION}>
          {short(o.gem)} — from a {o.classes[0]}
          {o.classes.length > 1 ? ` (or ${o.classes.slice(1).join(', ')})` : ''}
        </option>
      ))}
      <option value="" className={OPTION}>
        No mule
      </option>
    </select>
  )
}
