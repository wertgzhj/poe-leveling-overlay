// Copies the overlay's searches on its own, as Settings → Search regex says:
// on walking into a town the vendor's search or your own regex, on a level-up
// the passive tree's.
// Never over something you copied (clipboard.ts), and the overlay says what it
// copied. Writing the clipboard is all it does — the paste stays yours
// (docs/ARCHITECTURE.md#tos-position).

import { Channels, type SearchKind } from './channels.ts'
import { copyIfFree } from './clipboard.ts'
import { AutoCopyTrigger } from './profile/search.ts'
import { store } from './settings.ts'
import type { LogService } from './log/service.ts'
import type { OverlayController } from './overlay.ts'
import type { ProfileService } from './profile/service.ts'

export class AutoCopyService {
  // Fed whether on or off, so switching it on mid-session doesn't take the
  // current level or zone for news.
  private readonly trigger = new AutoCopyTrigger()

  constructor(log: LogService, profile: ProfileService, overlay: OverlayController) {
    // Registered after the profile service's own listeners, so the searches
    // already reflect the new level or zone.
    log.addLevelListener((level) => {
      const character = log.getSnapshot().state.character
      if (this.trigger.onLevel(character, level) && store.get('autoCopyLevelUp')) {
        this.copy('tree', profile.treeSearch(), overlay)
      }
    })
    log.addAreaListener((area) => {
      if (!this.trigger.onArea(area.areaId)) return
      const town = store.get('autoCopyTown')
      if (town === 'vendor') this.copy('vendor', profile.vendorSearch(), overlay)
      else if (town === 'regex') this.copy('regex', store.get('searchRegex') || null, overlay)
    })
  }

  private copy(kind: SearchKind, text: string | null, overlay: OverlayController): void {
    if (!text) return
    // A clipboard another program holds open can refuse; the next level or
    // town tries again, and the buttons are always there.
    copyIfFree(text)
      .then((copied) => {
        if (copied) overlay.window?.webContents.send(Channels.searchAutoCopied, kind)
      })
      .catch(() => {})
  }
}
