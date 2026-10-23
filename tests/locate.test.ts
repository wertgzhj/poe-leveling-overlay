import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clientTxtCandidates,
  locateClientTxt,
  steamLibraries,
  steamPathFromReg,
  type LocateEnv,
  type LocateFs
} from '../electron/log/locate.ts'

// A pretend Windows machine: files with contents and a modified time.
function machine(files: Record<string, { text?: string; mtime?: number }>): LocateFs {
  const key = (p: string): string => p.toLowerCase()
  const byKey = new Map(Object.entries(files).map(([p, f]) => [key(p), f]))
  return {
    read: (p) => byKey.get(key(p))?.text ?? null,
    list: (dir) =>
      Object.keys(files)
        .filter((p) => key(p).startsWith(key(dir) + '\\') && !p.slice(dir.length + 1).includes('\\'))
        .map((p) => p.slice(dir.length + 1)),
    mtime: (p) => byKey.get(key(p))?.mtime ?? null
  }
}

const ENV: LocateEnv = {
  programFilesX86: 'C:\\Program Files (x86)',
  programFiles: 'C:\\Program Files',
  programData: 'C:\\ProgramData'
}
const STEAM_LOG = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt'

test('the default Steam install is found', () => {
  const fs = machine({ [STEAM_LOG]: { mtime: 1 } })
  assert.equal(locateClientTxt(ENV, fs), STEAM_LOG)
})

test('nothing installed: nothing found, no guess', () => {
  assert.equal(locateClientTxt(ENV, machine({})), null)
  assert.equal(locateClientTxt({}, machine({})), null)
})

test('a Steam library on another drive, from libraryfolders.vdf', () => {
  const vdf = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t\t"apps" { "238960" "123" }
\t}
}`
  assert.deepEqual(steamLibraries(vdf), ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])
  const onD = 'D:\\SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt'
  const fs = machine({
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': { text: vdf },
    [onD]: { mtime: 5 }
  })
  assert.equal(locateClientTxt(ENV, fs), onD)
})

test('Steam outside Program Files, from the registry', () => {
  const reg = '\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    d:/games/steam\r\n\r\n'
  assert.equal(steamPathFromReg(reg), 'd:\\games\\steam')
  assert.equal(steamPathFromReg('ERROR: The system was unable to find the specified registry key'), null)
  const log = 'd:\\games\\steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt'
  const fs = machine({ [log]: { mtime: 2 } })
  assert.equal(locateClientTxt({ ...ENV, steamPath: steamPathFromReg(reg) }, fs), log)
})

test('the standalone client and Epic are found too', () => {
  const standalone = 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
  assert.equal(locateClientTxt(ENV, machine({ [standalone]: { mtime: 1 } })), standalone)

  const manifests = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  const epicLog = 'E:\\Epic\\PathOfExile\\logs\\Client.txt'
  const fs = machine({
    [`${manifests}\\A1B2.item`]: { text: JSON.stringify({ DisplayName: 'Path of Exile', InstallLocation: 'E:\\Epic\\PathOfExile' }) },
    [`${manifests}\\C3D4.item`]: { text: JSON.stringify({ DisplayName: 'Fortnite', InstallLocation: 'E:\\Epic\\Fortnite' }) },
    [`${manifests}\\broken.item`]: { text: '{ not json' },
    [epicLog]: { mtime: 1 }
  })
  assert.equal(locateClientTxt(ENV, fs), epicLog)
  assert.ok(!clientTxtCandidates(ENV, fs).some((p) => p.includes('Fortnite')))
})

test('Path of Exile 2 is never picked', () => {
  const poe2 = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
  assert.equal(locateClientTxt(ENV, machine({ [poe2]: { mtime: 9 } })), null)
  const manifests = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  const fs = machine({
    [`${manifests}\\X.item`]: { text: JSON.stringify({ DisplayName: 'Path of Exile 2', InstallLocation: 'E:\\PoE2' }) },
    'E:\\PoE2\\logs\\Client.txt': { mtime: 9 }
  })
  assert.equal(locateClientTxt(ENV, fs), null)
})

test('with two installs, the log written last wins', () => {
  const standalone = 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
  const fs = machine({ [STEAM_LOG]: { mtime: 100 }, [standalone]: { mtime: 200 } })
  assert.equal(locateClientTxt(ENV, fs), standalone)
  const fs2 = machine({ [STEAM_LOG]: { mtime: 300 }, [standalone]: { mtime: 200 } })
  assert.equal(locateClientTxt(ENV, fs2), STEAM_LOG)
})

test('the same folder reached two ways is one candidate', () => {
  // The registry and Program Files both name the default Steam folder, in
  // different case and slashes; libraryfolders.vdf lists it a third time.
  const vdf = '"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"'
  const fs = machine({ 'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': { text: vdf } })
  const steam = clientTxtCandidates({ ...ENV, steamPath: 'c:/program files (x86)/steam' }, fs).filter((p) =>
    p.toLowerCase().startsWith('c:\\program files (x86)\\steam\\')
  )
  assert.equal(steam.length, 1)
})
