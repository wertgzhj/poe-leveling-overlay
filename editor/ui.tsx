// Small shared form controls for the editor (dark theme).

import { button } from '../src/lib/ui'

export function TextInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <input
      type="text"
      spellCheck={false}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      className={
        'rounded border border-overlay-border bg-black/30 px-2 py-1 text-sm text-overlay-text outline-none focus:border-overlay-accent ' +
        (props.mono ? 'font-mono text-xs ' : '') +
        (props.className ?? '')
      }
    />
  )
}

export function Select<T extends string>(props: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  className?: string
  /** display text per option — an empty value needs a visible label ("none")
   *  or the entry is an invisible blank row in the list. */
  labelFor?: (v: T) => string
}): React.JSX.Element {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as T)}
      className={
        'rounded border border-overlay-border bg-black/30 px-2 py-1 text-sm text-overlay-text outline-none focus:border-overlay-accent ' +
        (props.className ?? '')
      }
    >
      {props.options.map((o) => (
        <option key={o} value={o}>
          {props.labelFor ? props.labelFor(o) : o}
        </option>
      ))}
    </select>
  )
}

export function Btn(props: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  title?: string
}): React.JSX.Element {
  // The same buttons as the overlay's (src/lib/ui.ts), at the editor's size.
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={button(props.variant ?? 'ghost', 'lg')}
    >
      {props.children}
    </button>
  )
}

export function SaveResult({
  result,
  okText = 'Saved. The overlay reloaded.'
}: {
  result: EditorSaveResultBridge | null
  /** What a successful save means here — not every save reloads the overlay. */
  okText?: string
}): React.JSX.Element | null {
  if (!result) return null
  if (result.ok) {
    return <span className="text-xs text-ok">{okText}</span>
  }
  return (
    <span className="text-xs text-danger">
      {result.errors.length ? result.errors.join('; ') : 'Save failed.'}
    </span>
  )
}
