import { useEffect } from 'react'
import { useOverlayStore } from './stores/overlayStore'
import { DummyPanel } from './panels/DummyPanel'
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
        characterName: s.characterName
      })
    )
    void api.getLogSnapshot().then(applyLogSnapshot)

    const store = useOverlayStore.getState
    const subs = [
      api.onState(patch),
      api.onLogSnapshot(applyLogSnapshot),
      api.onLogStatus((logStatus) => patch({ logStatus })),
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

  if (settingsOpen) return <SettingsPanel />
  if (debugOpen) return <DebugPanel />
  return <DummyPanel />
}

const emptyTracked: TrackerStateBridge = {
  area: null,
  character: null,
  charClass: null,
  level: null
}
