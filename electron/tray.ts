import { join } from 'node:path'
import { app, Menu, Tray, nativeImage } from 'electron'
import type { OverlayController } from './overlay'

// A frameless overlay has no window chrome, so the tray is the only always-on
// affordance to toggle it and to quit. Icon load is best-effort: if the asset
// is missing the app still runs, just without a tray.
export function createTray(overlay: OverlayController): Tray | null {
  // Dev: build/icon.png in the project root. Packaged: copied to resources/
  // via electron-builder extraResources (see electron-builder.yml).
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return null

  const tray = new Tray(image)
  tray.setToolTip('PoE Leveling Overlay')

  const menu = Menu.buildFromTemplate([
    { label: 'Show / hide overlay', click: () => overlay.toggleVisibility() },
    { label: 'Move / resize mode', click: () => overlay.toggleMoveMode() },
    { label: 'Click-through', click: () => overlay.toggleClickThrough() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => overlay.toggleVisibility())

  return tray
}
