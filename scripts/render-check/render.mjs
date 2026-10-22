// The render check's Electron side: loads the built overlay (out/renderer) once
// per scenario, with a stand-in bridge instead of the main process, and saves a
// screenshot of each. Run through `npm run render-check`, which builds first
// and writes the scenarios (scenarios.ts).
//
//   npm run render-check                         screenshots into out/render-check/
//   npm run render-check -- --compare <folder>   …and compare them, byte for byte,
//                                                with an earlier run's
//
// A refactor that means to change nothing should compare identical: that is
// the check. Copy out/render-check/ somewhere before the change, run again
// after, and compare.

import { app, BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const args = process.argv.slice(process.argv.indexOf(fileURLToPath(import.meta.url)) + 1)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const outDir = flag('--out') ?? join(root, 'out/render-check')
const compareDir = flag('--compare')
const scenariosFile = join(outDir, 'scenarios.json')

// A dark stand-in for the game behind the panel, and no GPU: the same pixels
// on every machine that runs this.
app.disableHardwareAcceleration()
// --no-sandbox comes from the npm script: these windows load only the built
// overlay from disk, and Chromium's sandbox needs a setuid helper that CI
// runners (and root) don't have. The app itself keeps its sandbox.
// One window per scenario, closed before the next opens: without this, the
// moment between them has no window and Electron quits.
app.on('window-all-closed', () => {})

// Never hang: a check that waits forever is worse than one that fails. One
// scenario gets SCENARIO_MS, the whole run RUN_MS; either way it says where.
const SCENARIO_MS = 30_000
const RUN_MS = 180_000
setTimeout(() => {
  console.error(`render check: gave up after ${RUN_MS / 1000}s`)
  app.exit(3)
}, RUN_MS).unref()

function within(ms, what, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: no result after ${ms / 1000}s`)), ms))
  ])
}
app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function shoot(index, scenario) {
  const win = new BrowserWindow({
    show: false,
    width: 380,
    height: 1100,
    backgroundColor: '#1c1a17',
    useContentSize: true,
    webPreferences: {
      preload: join(here, 'bridge.cjs'),
      // The stand-in bridge is a plain object on window — a test harness, not
      // the app, which keeps context isolation and the sandbox on.
      contextIsolation: false,
      sandbox: false,
      additionalArguments: [`--render-scenario=${scenariosFile}#${index}`]
    }
  })
  await win.loadFile(join(root, 'out/renderer/index.html'))
  // Wait for the panel, open the tab, let React and the fonts settle.
  await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const tab = ${JSON.stringify(scenario.tab ?? null)}
      const start = Date.now()
      const tick = () => {
        if (Date.now() - start > 20000) return reject(new Error('the overlay never rendered: ' + document.body.innerText.slice(0, 200)))
        const panel = document.querySelector('[data-interactive]')
        const button = tab && [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(tab))
        if (panel && (!tab || button || Date.now() - start > 3000)) {
          if (button) button.click()
          document.fonts.ready.then(() => setTimeout(resolve, 300))
        } else setTimeout(tick, 50)
      }
      tick()
    })
  `)
  const image = await win.webContents.capturePage()
  win.destroy()
  return image.toPNG()
}

app.whenReady().then(async () => {
  if (!existsSync(join(root, 'out/renderer/index.html'))) throw new Error('build first: npm run build')
  const scenarios = JSON.parse(readFileSync(scenariosFile, 'utf8'))
  mkdirSync(outDir, { recursive: true })
  for (let i = 0; i < scenarios.length; i++) {
    const { name } = scenarios[i]
    writeFileSync(join(outDir, `${name}.png`), await within(SCENARIO_MS, name, shoot(i, scenarios[i])))
    console.log(`  ${name}`)
  }
  console.log(`${scenarios.length} screenshots → ${outDir}`)

  let failed = false
  if (compareDir) {
    for (const file of readdirSync(outDir).filter((f) => f.endsWith('.png'))) {
      const before = join(compareDir, file)
      const same = existsSync(before) && readFileSync(before).equals(readFileSync(join(outDir, file)))
      console.log(`${same ? 'identical' : 'DIFFERENT'}  ${file}`)
      if (!same) failed = true
    }
  }
  app.exit(failed ? 1 : 0)
}).catch((e) => {
  console.error(e)
  app.exit(2)
})
