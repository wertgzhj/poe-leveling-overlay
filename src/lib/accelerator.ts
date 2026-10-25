// Build/format Electron accelerators (globalShortcut combos) in the renderer.
// Uses KeyboardEvent.code so capture is keyboard-layout independent.

const CODE_TO_KEY: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
}

export interface CapturedAccelerator {
  /** The accelerator string, or null when only modifiers are held so far. */
  accelerator: string | null
  hasModifier: boolean
}

export function acceleratorFromEvent(e: KeyboardEvent): CapturedAccelerator {
  const modifiers: string[] = []
  if (e.ctrlKey) modifiers.push('CommandOrControl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')
  if (e.metaKey) modifiers.push('Super')

  const key = mainKeyFromCode(e.code)
  const hasModifier = modifiers.length > 0
  if (!key) return { accelerator: null, hasModifier }
  return { accelerator: [...modifiers, key].join('+'), hasModifier }
}

function mainKeyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  const fn = /^F(\d{1,2})$/.exec(code)
  if (fn) return `F${fn[1]}`
  const numpad = /^Numpad(\d)$/.exec(code)
  if (numpad) return `num${numpad[1]}`
  return CODE_TO_KEY[code] ?? null
}

/** Human-friendly rendering, e.g. "CommandOrControl+Shift+O" -> "Ctrl + Shift + O". */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return 'Ctrl'
      if (part === 'Super' || part === 'Meta') return 'Win'
      return part
    })
    .join(' + ')
}
