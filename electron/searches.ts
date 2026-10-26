// The overlay's searches for the game's search boxes, in one place: what each
// says (searchFor), and copying it — on a click or a hotkey, always; without a
// click, on a level-up or walking into a town, as Settings → Search & copy maps
// them, and by default never over something you copied (clipboard.ts). The
// overlay says what it copied. Writing the clipboard is all it does — the paste
// stays yours (docs/ARCHITECTURE.md#tos-position).

import { Channels } from './channels.ts'
import { copyIfFree, copyText } from './clipboard.ts'
import { AutoCopyTrigger, type CopyTrigger, type SearchKind } from './copy-rules.ts'
import { store } from './settings.ts'
import type { LogService } from './log/service.ts'
import type { OverlayController } from './overlay.ts'
import type { ProfileService } from './profile/service.ts'

export class SearchService {
  private readonly profile: ProfileService
  private readonly overlay: OverlayController
  // Fed whether copying without a click is on or off, so switching it on
  // mid-session doesn't take the current level or zone for news.
  private readonly trigger = new AutoCopyTrigger()

  constructor(log: LogService, profile: ProfileService, overlay: OverlayController) {
    this.profile = profile
    this.overlay = overlay
    // Registered after the profile service's own listeners, so the searches
    // already reflect the new level or zone.
    log.addLevelListener((level) => {
      if (this.trigger.onLevel(log.getSnapshot().state.character, level)) this.onTrigger('levelUp')
    })
    log.addAreaListener((area) => {
      if (this.trigger.onArea(area.areaId)) this.onTrigger('town')
    })
  }

  /** What a search says right now; null when there's nothing to search for. */
  searchFor(kind: SearchKind): string | null {
    if (kind === 'vendor') return this.profile.vendorSearch()
    if (kind === 'tree') return this.profile.treeSearch()
    return store.get('searchRegex') || null
  }

  /** A click or a hotkey: copy, whatever's on the clipboard — it's your doing. */
  async copy(kind: SearchKind): Promise<boolean> {
    const text = this.searchFor(kind)
    if (!text) return false
    await copyText(text)
    this.said(kind)
    return true
  }

  private onTrigger(trigger: CopyTrigger): void {
    const kind = store.get(trigger === 'town' ? 'autoCopyTown' : 'autoCopyLevelUp')
    if (kind === 'off') return
    const text = this.searchFor(kind)
    if (!text) return
    const copied = store.get('autoCopyProtect') ? copyIfFree(text) : copyText(text).then(() => true)
    // A clipboard another program holds open can refuse; the next level or
    // town tries again, and the buttons are always there.
    copied.then((ok) => ok && this.said(kind)).catch(() => {})
  }

  /** The header says what the clipboard now holds, for a moment. */
  private said(kind: SearchKind): void {
    this.overlay.window?.webContents.send(Channels.searchCopied, kind)
  }
}
