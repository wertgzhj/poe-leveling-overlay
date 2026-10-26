import { useState } from 'react'
import { button } from '../../lib/ui'

/**
 * Copies a search regex the main process builds (vendor, passive tree) — the
 * renderer only says which. Gold, the action its block is for; fixed width so
 * the "✓ copied" flash doesn't shift the heading it sits in.
 */
export function SearchButton({
  label,
  regex,
  what,
  copy
}: {
  label: string
  regex: string
  /** "the vendor's" — where to paste it, for the tooltip */
  what: string
  copy: () => Promise<boolean> | undefined
}): React.JSX.Element {
  const [flash, setFlash] = useState(false)
  const onClick = (): void => {
    void copy()?.then((ok) => {
      if (!ok) return
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1200)
    })
  }
  return (
    <button
      onClick={onClick}
      title={`Copy, then paste into ${what} search:\n${regex}`}
      className={'min-w-[4.5rem] text-center ' + button('primary', 'md') + (flash ? '!text-ok' : '')}
    >
      {flash ? '✓ copied' : label}
    </button>
  )
}
