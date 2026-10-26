// Spoken announcements: watch what the overlay knows, and when one of the
// moments switched on in Settings → Voice happens, have the overlay window
// say it (announce-rules.ts decides what's news and words it). The window
// speaks through the system's own voices; nothing leaves the PC, and the game
// gets nothing (docs/ARCHITECTURE.md#tos-position).

import { Channels, type Spoken } from './channels.ts'
import { Announcer, phrase, sample, type AnnounceEvent, type Announcement, type Observed } from './announce-rules.ts'
import { getAnnounce } from './settings.ts'
import { vendorGems } from './profile/search.ts'
import type { LogService } from './log/service.ts'
import type { OverlayController } from './overlay.ts'
import type { ProfileService } from './profile/service.ts'
import type { TrialsService } from './trials/service.ts'

export class AnnounceService {
  private readonly announcer = new Announcer()

  constructor(
    private readonly log: LogService,
    private readonly profile: ProfileService,
    private readonly trials: TrialsService,
    private readonly overlay: OverlayController
  ) {
    // Registered after the services they read from, so those already reflect
    // the new zone, level or finished trial. Fed while every moment is off
    // too: switching one on mid-session doesn't announce the state you're in.
    log.addAreaListener(() => this.check())
    log.addLevelListener(() => this.check())
    log.addIzaroListener(() => this.check())
  }

  /** Say an example of a moment (Settings' test buttons), on or not. */
  test(event: AnnounceEvent): void {
    this.say(sample(event))
  }

  private check(): void {
    const said = this.announcer.observe(this.observe())
    const on = getAnnounce().events
    for (const a of said) if (on[a.event]) this.say(a)
  }

  private observe(): Observed {
    const log = this.log.getSnapshot()
    const shown = this.profile.shown()
    const trials = this.trials.snapshot()
    const here = trials.currentZoneTrialId
    const fit = log.zoneFit
    return {
      character: log.state.character,
      profile: shown.activeId,
      areaId: log.state.area?.areaId ?? null,
      trialHere: here != null && trials.trials.some((t) => t.id === here && !t.seen),
      zone: fit ? { verdict: fit.verdict, by: fit.by } : null,
      // the live stage's, not a stage paged to by hand
      gems: shown.viewedIndex === shown.liveIndex && shown.acquisitions ? vendorGems(shown.acquisitions.plan) : [],
      labs: trials.unlockedLabs,
      choice: shown.choiceDue ? { id: shown.choiceDue.id, wants: shown.choiceDue.wants } : null,
      passive: shown.passives?.next[0]?.name ?? null
    }
  }

  private say(a: Announcement): void {
    const s = getAnnounce()
    const spoken: Spoken = { text: phrase(a, s.lang), lang: s.lang, voice: s.voice, volume: s.volume }
    this.overlay.window?.webContents.send(Channels.announceSpeak, spoken)
  }
}
