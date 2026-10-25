// Finding Client.txt on first launch, so a new user doesn't have to dig for it.
// Pure: the file system and the environment come in as arguments, so the tests
// run anywhere. Windows paths throughout (path.win32), because that's where
// the game is.
//
// Where Path of Exile 1 keeps its log, per launcher:
//  - Steam: <library>\steamapps\common\Path of Exile\logs\Client.txt, in the
//    Steam folder itself or any library listed in libraryfolders.vdf (a second
//    drive, typically)
//  - the standalone client: …\Grinding Gear Games\Path of Exile\logs\Client.txt
//  - Epic: wherever its install manifest says
// "Path of Exile 2" lives in a folder of its own and is never matched.

import { win32 } from 'node:path'

export interface LocateEnv {
  /** %ProgramFiles(x86)% */
  programFilesX86?: string
  /** %ProgramFiles% */
  programFiles?: string
  /** %ProgramData%, where Epic keeps its install manifests */
  programData?: string
  /** Steam's folder from the registry, when it isn't in Program Files */
  steamPath?: string | null
}

export interface LocateFs {
  /** A text file's contents, or null when it can't be read. */
  read(path: string): string | null
  /** File names in a folder; empty when it doesn't exist. */
  list(dir: string): string[]
  /** Last-modified time of a file, or null when there's no such file. */
  mtime(path: string): number | null
}

const LOG = win32.join('logs', 'Client.txt')
const POE_FOLDER = 'Path of Exile'

/** Every place a Client.txt could be, most likely first, without duplicates. */
export function clientTxtCandidates(env: LocateEnv, fs: LocateFs): string[] {
  const out: string[] = []
  const add = (p: string): void => {
    if (!out.some((q) => q.toLowerCase() === p.toLowerCase())) out.push(p)
  }

  // Steam, and every library it knows about.
  const steamRoots = [
    env.steamPath,
    env.programFilesX86 && win32.join(env.programFilesX86, 'Steam'),
    env.programFiles && win32.join(env.programFiles, 'Steam')
  ]
  for (const root of steamRoots) {
    if (!root) continue
    const steam = win32.normalize(root)
    for (const lib of [steam, ...steamLibraries(fs.read(win32.join(steam, 'steamapps', 'libraryfolders.vdf')))]) {
      add(win32.join(lib, 'steamapps', 'common', POE_FOLDER, LOG))
    }
  }

  // The standalone client.
  for (const pf of [env.programFilesX86, env.programFiles]) {
    if (pf) add(win32.join(pf, 'Grinding Gear Games', POE_FOLDER, LOG))
  }

  // Epic: its manifests name the install folder.
  if (env.programData) {
    const manifests = win32.join(env.programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
    for (const file of fs.list(manifests)) {
      if (!file.toLowerCase().endsWith('.item')) continue
      const where = epicInstall(fs.read(win32.join(manifests, file)))
      if (where) add(win32.join(where, LOG))
    }
  }
  return out
}

/**
 * The Client.txt to use: of the candidates that exist, the one written last —
 * someone with both a Steam and a standalone install plays the one whose log
 * moved. null when there's none.
 */
export function locateClientTxt(env: LocateEnv, fs: LocateFs): string | null {
  let best: string | null = null
  let bestTime = -Infinity
  for (const path of clientTxtCandidates(env, fs)) {
    const time = fs.mtime(path)
    if (time != null && time > bestTime) {
      best = path
      bestTime = time
    }
  }
  return best
}

/** The library folders in Steam's libraryfolders.vdf ("path" entries; the
 *  file escapes backslashes). */
export function steamLibraries(vdf: string | null): string[] {
  if (!vdf) return []
  return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => win32.normalize(m[1].replace(/\\\\/g, '\\')))
}

/** The install folder from an Epic manifest, when it's Path of Exile 1. */
function epicInstall(json: string | null): string | null {
  if (!json) return null
  try {
    const m = JSON.parse(json) as { DisplayName?: unknown; InstallLocation?: unknown }
    if (m.DisplayName !== POE_FOLDER || typeof m.InstallLocation !== 'string') return null
    return win32.normalize(m.InstallLocation)
  } catch {
    return null
  }
}

/** Steam's folder from `reg query HKCU\Software\Valve\Steam /v SteamPath`
 *  output ("SteamPath    REG_SZ    c:/program files (x86)/steam"). */
export function steamPathFromReg(output: string): string | null {
  const m = /SteamPath\s+REG_SZ\s+(.+?)\s*$/m.exec(output)
  return m ? win32.normalize(m[1]) : null
}
