import { useState } from 'react'
import { button } from '../../lib/ui'

/**
 * Copies one of the overlay's searches; the main process builds the text, the
 * renderer only says which. Gold, the action its block is for; fixed width so
 * the "✓ copied" flash doesn't shift the heading it sits in.
 */
export function SearchButton({
  label,
  kind,
  regex,
  what
}: {
  label: string
  kind: 'vendor' | 'tree' | 'regex'
  regex: string
  /** "the vendor's" — where to paste it, for the tooltip */
  what: string
}): React.JSX.Element {
  const [flash, setFlash] = useState(false)
  const onClick = (): void => {
    void window.overlay?.copySearch(kind).then((ok) => {
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
