import { useEffect } from 'react'
import { useOverlayStore } from './stores/overlayStore'
import { MainPanel } from './panels/MainPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { DebugPanel } from './panels/DebugPanel'

export function App(): React.JSX.Element {
  const patch = useOverlayStore((s) => s.patch)
  const applyLogSnapshot = useOverlayStore((s) => s.applyLogSnapshot)
  const pushEvent = useOverlayStore((s) => s.pushEvent)
  const settingsOpen = useOverlayStore((s) => s.settingsOpen)
  const debugOpen = useOverlayStore((s) => s.debugOpen)

  useEffect(() => {
    const api = window.overlay
    if (!api) return

    void api.getState().then(patch)
    void api.getAppInfo().then((info) => patch({ appVersion: info.version, isDev: info.isDev }))
    void api.getSettings().then((s) =>
      patch({
        opacity: s.opacity,
        clickThrough: s.clickThrough,
        hotkeys: s.hotkeys,
        clientTxtPath: s.clientTxtPath,
        profilePath: s.profilePath,
        characterName: s.characterName
      })
    )
    void api.getLogSnapshot().then(applyLogSnapshot)
    void api.getGuide().then((guide) => patch({ guide }))
    void api.getProfile().then((profile) => patch({ profile }))
    void api.getTrials().then((trials) => patch({ trials }))
    void api.getUpdateStatus().then((update) => patch({ update }))

    const store = useOverlayStore.getState
    const subs = [
      api.onState(patch),
      api.onLogSnapshot(applyLogSnapshot),
      api.onLogStatus((logStatus) => patch({ logStatus })),
      api.onGuideState((guide) => patch({ guide })),
      api.onProfileState((profile) => patch({ profile })),
      api.onTrialsState((trials) => patch({ trials })),
      api.onUpdateStatus((update) => patch({ update })),
      api.onAreaEntered((area) => {
        const tracked = store().tracked
        patch({ tracked: { ...(tracked ?? emptyTracked), area } })
        pushEvent({
          kind: 'area',
          ts: area.ts,
          text: `→ ${area.name}${area.areaLevel != null ? ` (lvl ${area.areaLevel})` : ''}`
        })
      }),
      api.onLevelUp((ev) => {
        if (ev.isBound) {
          const tracked = store().tracked
          patch({
            tracked: {
              ...(tracked ?? emptyTracked),
              character: ev.name,
              charClass: ev.charClass,
              level: ev.level
            }
          })
        }
        pushEvent({
          kind: 'levelup',
          ts: ev.ts,
          text: `${ev.name} (${ev.charClass}) → level ${ev.level}${ev.isBound ? '' : ' — other player'}`
        })
      })
    ]
    return () => subs.forEach((unsub) => unsub())
  }, [patch, applyLogSnapshot, pushEvent])

  // Tell the main process whether the cursor is over visible UI, so in
  // interactive mode the transparent rest of the window forwards clicks to the
  // game instead of swallowing them (elements opt in via data-interactive).
  useEffect(() => {
    const api = window.overlay
    if (!api) return
    let over = false
    let dragging = false
    const send = (v: boolean): void => {
      if (v !== over) {
        over = v
        api.setHoverUi(v)
      }
    }
    const overUi = (e: Event): boolean =>
      !!(e.target as Element | null)?.closest?.('[data-interactive]')
    const onOver = (e: Event): void => {
      // Never drop interactivity mid-drag (slider/resize would cut itself off).
      if (dragging && !overUi(e)) return
      send(overUi(e))
    }
    const onDown = (e: Event): void => {
      dragging = true
      if (overUi(e)) send(true)
    }
    const onUp = (e: Event): void => {
      dragging = false
      send(overUi(e))
    }
    window.addEventListener('pointerover', onOver, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    return () => {
      window.removeEventListener('pointerover', onOver, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [])

  if (settingsOpen) return <SettingsPanel />
  if (debugOpen) return <DebugPanel />
  return <MainPanel />
}

const emptyTracked: TrackerStateBridge = {
  area: null,
  character: null,
  charClass: null,
  level: null
}
