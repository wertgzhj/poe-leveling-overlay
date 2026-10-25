import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BUTTON, button, BUTTON_SIZE, panelSurface, TAG, TAG_TONE } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'
import { GuideBody } from './GuideTab'
import { TrialHint } from './NoticeBar'
import { TrialsBody } from './TrialsTab'
import { UpdateBanner } from './UpdateBanner'
import { VersionBadge } from './VersionBadge'
import { GemBody } from './gems/GemsTab'

// Main overlay panel (guide + gems) with a shared chrome and a tab switch.
// Steps/stage auto-advance from the log; interacting needs interactive mode
// (Ctrl+Shift+C) while forward/back hotkeys work regardless.

/** Move mode's bottom-right handle; Settings shows it too (same window). */
export function ResizeGrip(): React.JSX.Element {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => window.overlay?.resizeBy(ev.movementX, ev.movementY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className="resize-grip" onPointerDown={onPointerDown} title="Drag to resize" />
}

// Manual "who am I logged in as?" — re-detects the character from your most
// recent level-up (the only character signal Client.txt carries) and locks
// tracking onto it. Flashes the result for a few seconds; the tracker strip
// itself also updates via the pushed snapshot. Needs interactive mode to click
// (like the ⚙ and step buttons).
function DetectCharButton(): React.JSX.Element {
  const [flash, setFlash] = useState<{ text: string; title?: string } | null>(null)
  const onClick = (): void => {
    void window.overlay?.detectCharacter().then((found) => {
      // A name pinned in Settings outranks detection, so the tick would be a
      // lie: it found the character and tracking still didn't move. Say which
      // setting is holding it instead of pretending something happened.
      setFlash(
        !found
          ? { text: 'no level-up yet' }
          : found.tracking
            ? { text: `✓ ${found.name}` }
            : {
                text: `pinned: ${found.pinnedTo}`,
                title: `You're on ${found.name}, but Settings → Game log pins tracking to ${found.pinnedTo}. Clear that field to follow whoever you're playing.`
              }
      )
      window.setTimeout(() => setFlash(null), 4000)
    })
  }
  return (
    <button
      onClick={onClick}
      title={flash?.title ?? "Detect the character you're logged in as (from your most recent level-up)"}
      className={
        // A quiet button whose text colour flashes, so the colour is set here
        // rather than by the variant — two text colours would fight.
        'no-drag max-w-[45%] shrink-0 truncate bg-white/10 enabled:hover:text-overlay-text ' + BUTTON + BUTTON_SIZE.sm + ' ' +
        (flash?.title ? 'text-warn' : 'text-overlay-muted')
      }
    >
      {flash?.text ?? '⟳ character'}
    </button>
  )
}

// One click puts the search regex from Settings on the clipboard; paste it into
// a stash or vendor search box yourself. Copying is all the overlay does — it
// never types into the game (docs/ARCHITECTURE.md#tos-position). Absent until a
// regex is set, rather than a button that explains it has nothing to do.
function RegexButton(): React.JSX.Element | null {
  const regex = useOverlayStore((s) => s.searchRegex)
  const [flash, setFlash] = useState<'copied' | 'failed' | null>(null)
  if (!regex) return null
  const onClick = (): void => {
    void window.overlay?.copySearchRegex().then((ok) => {
      setFlash(ok ? 'copied' : 'failed')
      window.setTimeout(() => setFlash(null), 1500)
    })
  }
  return (
    <button
      onClick={onClick}
      title={`Copy to clipboard, then paste into a stash or vendor search:\n${regex}`}
      className={
        // Fixed width: "✓ copied" is wider than "Regex", and the flash must not
        // shove the ⚙ next to it sideways.
        'no-drag min-w-[3.75rem] text-center bg-white/10 enabled:hover:text-overlay-text ' + BUTTON + BUTTON_SIZE.sm + ' ' +
        (flash === 'copied'
          ? 'text-ok'
          : flash === 'failed'
            ? 'text-warn'
            : 'text-overlay-muted')
      }
    >
      {flash === 'copied' ? '✓ copied' : flash === 'failed' ? 'not set' : 'Regex'}
    </button>
  )
}

/** The tab bar's order, and the order Settings lists them in. */
export const TAB_ORDER = ['gems', 'trials', 'guide'] as const

function trackerLine(
  logStatus: WatcherStatusBridge | null,
  tracked: TrackerStateBridge | null,
  languageMismatch: boolean
): string {
  if (logStatus?.state !== 'watching') {
    if (logStatus?.state === 'missing') return 'Client.txt not found — check Settings'
    if (logStatus?.state === 'error') return 'Log read error — see Settings'
    return 'Client.txt not found — set its path in Settings to enable tracking'
  }
  // Zone lines parse (they're locale-independent) but the localized ones don't:
  // levels never arrive, so the Gems tab would sit on stage 1 forever. Say why.
  if (languageMismatch) return 'Log is not in English — set the game to English for level tracking'
  const zone = tracked?.area?.name ?? 'zone unknown'
  const char =
    tracked?.character != null
      ? `${tracked.character}${tracked.level != null ? ` · lvl ${tracked.level}` : ''}`
      : 'waiting for a level-up'
  return `${zone} — ${char}`
}

// Path of Exile cuts experience once your level and the zone's monster level
// differ by more than the safe range — in both directions. Under means the zone
// is dangerous AND stingy; over means you're farming for nothing. Towns and
// non-campaign instances are excluded upstream, so this only appears where it
// means something.
function ZoneFitTag({ fit }: { fit: ZoneFitBridge }): React.JSX.Element {
  const under = fit.verdict === 'under'
  return (
    <span
      title={
        under
          ? `The zone is level ${fit.areaLevel}, ${fit.by} past your safe range — tougher, and reduced experience.`
          : `The zone is level ${fit.areaLevel}, ${fit.by} below your safe range — reduced experience, move on.`
      }
      className={'shrink-0 ' + TAG + TAG_TONE[under ? 'danger' : 'muted']}
    >
      {under ? `zone ${fit.areaLevel} ▲` : `zone ${fit.areaLevel} ▼`}
    </span>
  )
}

export function MainPanel(): React.JSX.Element {
  const {
    visible,
    moveMode,
    opacity,
    isDev,
    logStatus,
    tracked,
    guide,
    profile,
    trials,
    tab,
    visibleTabs,
    languageMismatch,
    zoneFit,
    patch
  } = useOverlayStore(
    useShallow((s) => ({
      visible: s.visible,
      moveMode: s.moveMode,
      opacity: s.opacity,
      isDev: s.isDev,
      logStatus: s.logStatus,
      tracked: s.tracked,
      guide: s.guide,
      profile: s.profile,
      trials: s.trials,
      tab: s.tab,
      visibleTabs: s.visibleTabs,
      languageMismatch: s.languageMismatch,
      zoneFit: s.zoneFit,
      patch: s.patch
    }))
  )

  // Hiding the active tab falls back to the first one still shown (settings
  // guarantees at least one is on). Gems leads, as the overlay opens on it: it
  // works out of the box, while the Guide shows placeholder routes until you
  // write your own.
  const shownTabs = TAB_ORDER.filter((t) => visibleTabs[t])
  const activeTab = shownTabs.includes(tab) ? tab : (shownTabs[0] ?? 'gems')

  if (!visible) return <div />

  const currentAct = guide?.route?.steps[guide.cursorIndex]?.act
  const guideTitle = guide?.route
    ? currentAct
      ? `Act ${currentAct}`
      : 'Campaign'
    : 'PoE Leveling Overlay'
  const title =
    activeTab === 'gems'
      ? (profile?.meta?.name ?? 'Build')
      : activeTab === 'trials'
        ? 'Trials of Ascendancy'
        : guideTitle
  const guideHasErrors = (guide?.errors?.length ?? 0) > 0
  const profileHasErrors = (profile?.errors?.length ?? 0) > 0
  const trialsBadge = trials ? `${trials.seenCount}/${trials.total}` : undefined

  const surface = panelSurface(opacity)
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        data-interactive
        className={
          'relative flex max-h-full w-full flex-col overflow-hidden ' +
          surface.className +
          (moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={surface.style}
      >
        <header
          className={
            'flex items-center justify-between px-3 py-2 ' +
            (moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-overlay-accent">◆</span>
            <span className="truncate text-sm font-semibold tracking-wide">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {moveMode && (
              <button
                className={'no-drag ' + button('primary', 'sm')}
                onClick={() => window.overlay?.exitMoveMode()}
              >
                Done
              </button>
            )}
            {isDev && (
              <button
                className={'no-drag ' + button('quiet', 'sm')}
                title="Log events (dev)"
                onClick={() => patch({ debugOpen: true })}
              >
                🐞
              </button>
            )}
            <RegexButton />
            <button
              className={'no-drag ' + button('quiet', 'sm')}
              title="Settings"
              aria-label="Settings"
              onClick={() => window.overlay?.setSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
        </header>

        <UpdateBanner />

        {/* Tab switch — only the tabs enabled in Settings; hidden when just one. */}
        {shownTabs.length > 1 && (
          <div className="flex gap-1 px-2">
            {visibleTabs.gems && (
              <Tab label="Gems" active={activeTab === 'gems'} flag={profileHasErrors} onClick={() => patch({ tab: 'gems' })} />
            )}
            {visibleTabs.trials && (
              <Tab label="Trials" badge={trialsBadge} active={activeTab === 'trials'} onClick={() => patch({ tab: 'trials' })} />
            )}
            {visibleTabs.guide && (
              <Tab label="Guide" active={activeTab === 'guide'} flag={guideHasErrors} onClick={() => patch({ tab: 'guide' })} />
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1.5 border-y border-overlay-border/60 bg-black/20 px-3 py-1 text-[11px] text-overlay-muted">
          <span
            className={
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
              (logStatus?.state !== 'watching'
                ? 'bg-white/25'
                : languageMismatch
                  ? 'bg-warn'
                  : 'bg-ok')
            }
          />
          <span className={'min-w-0 flex-1 truncate' + (languageMismatch ? ' text-warn' : '')}>
            {trackerLine(logStatus, tracked, languageMismatch)}
          </span>
          {zoneFit && !languageMismatch && <ZoneFitTag fit={zoneFit} />}
          <DetectCharButton />
        </div>

        <TrialHint />

        {/* pb-6: the version badge sits on top of the panel's bottom-right
            corner, so the content stops short of it — the Guide's "reset" ran
            underneath it. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-2">
          {activeTab === 'guide' && <GuideBody />}
          {activeTab === 'gems' && <GemBody />}
          {activeTab === 'trials' && <TrialsBody />}
        </div>

        <VersionBadge />
        {moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

function Tab({
  label,
  active,
  flag,
  badge,
  onClick
}: {
  label: string
  active: boolean
  flag?: boolean
  badge?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        // flex-1 with a zero basis: equal shares of the row whatever the labels
        // say, so the tabs are thirds at every window width instead of three
        // label-sized buttons with dead space after them.
        'no-drag min-w-0 flex-1 rounded-t px-2.5 py-1 text-[11px] font-medium ' +
        (active ? 'bg-overlay-accent/15 text-overlay-accent' : 'text-overlay-muted hover:text-overlay-text')
      }
    >
      {label}
      {badge && <span className="ml-1 text-[10px] text-overlay-muted">{badge}</span>}
      {flag && <span className="ml-1 text-danger">•</span>}
    </button>
  )
}
