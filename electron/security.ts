// Defence in depth for every window the app opens. The windows already run
// sandboxed, isolated and without Node, under a CSP; this covers what those
// don't: a page navigating away, opening windows, embedding a webview, or
// asking for the camera, microphone or notifications. The app needs none of
// that, so all of it is refused.

import { app, session } from 'electron'
import { navigationAllowed } from './navigation.ts'

export function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (!navigationAllowed(url, contents.getURL())) {
        event.preventDefault()
        console.warn('[security] blocked navigation to', url)
      }
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}

/** Call once the app is ready (sessions don't exist before). */
export function denyPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}
