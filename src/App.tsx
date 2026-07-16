import { useEffect } from 'react'
import { useOverlayStore } from './stores/overlayStore'
import { DummyPanel } from './panels/DummyPanel'

export function App(): React.JSX.Element {
  const patch = useOverlayStore((s) => s.patch)

  useEffect(() => {
    const api = window.overlay
    if (!api) return

    void api.getState().then(patch)
    void api.getAppInfo().then((info) => patch({ appVersion: info.version }))
    void api.getSettings().then((s) => patch({ opacity: s.opacity }))

    const unsubscribe = api.onState(patch)
    return unsubscribe
  }, [patch])

  return <DummyPanel />
}
