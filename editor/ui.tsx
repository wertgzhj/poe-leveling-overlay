// Small shared form controls for the editor (dark theme).

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
          {o}
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
  const v = props.variant ?? 'ghost'
  const cls =
    v === 'primary'
      ? 'bg-overlay-accent/25 text-overlay-accent hover:bg-overlay-accent/35'
      : v === 'danger'
        ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
        : 'bg-white/10 text-overlay-text hover:bg-white/15'
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={'rounded px-2 py-1 text-xs disabled:opacity-40 ' + cls}
    >
      {props.children}
    </button>
  )
}

export function SaveResult({ result }: { result: EditorSaveResultBridge | null }): React.JSX.Element | null {
  if (!result) return null
  if (result.ok) {
    return <span className="text-xs text-emerald-400">Saved — the overlay reloaded.</span>
  }
  return (
    <span className="text-xs text-red-300">
      {result.errors.length ? result.errors.join('; ') : 'Save failed.'}
    </span>
  )
}
