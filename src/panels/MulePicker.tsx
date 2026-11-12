import { muleTripInstruction } from '../lib/sources'

// The per-character mule choice, in Settings → Build profile: a decision for
// the whole run, made where the other per-character choice (the profile) is
// made — not in the Gems tab, which is for reading while you play (owner).

// The open list is drawn by the OS, not inside the select: it inherits the
// select's colour on a light system background unless each option says
// otherwise — which is how "No mule" turned grey on grey.
const OPTION = 'bg-overlay-panel text-overlay-text'

/** One alt per character: a class, and every gem of the build its fresh
 *  character gets on the Twilight Strand. On by default (the class with
 *  Momentum, else the first option); "No mule" turns it off for this
 *  character. Solo or in a party makes no difference — a party of Marauders
 *  mules all the same. */
export function MulePicker({
  choice
}: {
  choice: { options: MuleOptionBridge[]; chosen: string | null }
}): React.JSX.Element {
  const chosen = choice.options.find((o) => o.cls === choice.chosen) ?? null
  const short = (gem: string): string => gem.replace(/ Support$/, '')
  return (
    <select
      value={choice.chosen ?? ''}
      onChange={(e) => window.overlay?.setMule(e.target.value || null)}
      aria-label="Mule"
      title={
        chosen
          ? `${muleTripInstruction(chosen.cls, chosen.gems)} Per character: pick another class, or "No mule".`
          : 'Not muling on this character: every gem comes from a quest or a vendor.'
      }
      className={
        'mt-1 w-full truncate rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] outline-none [color-scheme:dark] focus:border-overlay-accent ' +
        (chosen ? 'text-mule' : 'text-overlay-text')
      }
    >
      {choice.options.map((o) => (
        <option key={o.cls} value={o.cls} className={OPTION}>
          {o.cls}: {o.gems.map((g) => short(g.gem)).join(', ')}
        </option>
      ))}
      <option value="" className={OPTION}>
        No mule
      </option>
    </select>
  )
}
