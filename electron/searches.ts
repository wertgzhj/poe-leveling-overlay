// The overlay's searches for the game's search boxes, in one place: what each
// says (searchFor), and copying it on a click or a hotkey, never on its own.
// The overlay says what it copied. Writing the clipboard is all it does: it
// never reads it, and the paste stays yours (docs/ARCHITECTURE.md#tos-position).

import { Channels } from './channels.ts'
import { copyText } from './clipboard.ts'
import type { SearchKind } from './copy-rules.ts'
import { regexForAct } from './search-regex.ts'
import { store } from './settings.ts'
import type { OverlayController } from './overlay.ts'
import type { ProfileService } from './profile/service.ts'

export class SearchService {
  private readonly profile: ProfileService
  private readonly overlay: OverlayController

  constructor(profile: ProfileService, overlay: OverlayController) {
    this.profile = profile
    this.overlay = overlay
  }

  /** What a search says right now; null when there's nothing to search for. */
  searchFor(kind: SearchKind): string | null {
    if (kind === 'vendor') return this.profile.vendorSearch()
    if (kind === 'tree') return this.profile.treeSearch()
    // your own: the one for the act you've reached, if you keep one for it
    return regexForAct(store.get('searchRegex'), store.get('actRegexes'), this.profile.act())
  }

  /** A click or a hotkey: copy. The only way a search reaches the clipboard. */
  async copy(kind: SearchKind): Promise<boolean> {
    const text = this.searchFor(kind)
    if (!text) return false
    await copyText(text)
    this.said(kind)
    return true
  }

  /** The header says what the clipboard now holds, for a moment. */
  private said(kind: SearchKind): void {
    this.overlay.window?.webContents.send(Channels.searchCopied, kind)
  }
}
