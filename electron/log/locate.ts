// Finding Client.txt on first launch, so a new user doesn't have to dig for it.
// Pure: the file system and the environment come in as arguments, so the tests
// run anywhere. Windows paths (path.win32) for Windows; Linux, where the game
// runs through Proton or Wine, has its own list at the bottom (path.posix).
//
// Where Path of Exile 1 keeps its log, per launcher:
//  - Steam: <library>\steamapps\common\Path of Exile\logs\Client.txt, in the
//    Steam folder itself or any library listed in libraryfolders.vdf (a second
//    drive, typically)
//  - the standalone client: …\Grinding Gear Games\Path of Exile\logs\Client.txt
//  - Epic: wherever its install manifest says
// "Path of Exile 2" lives in a folder of its own and is never matched.

import { posix, win32 } from 'node:path'

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
  return newest(clientTxtCandidates(env, fs), fs)
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

// ---- Linux ----
// The game itself runs through Proton (Steam) or Wine (Lutris, Heroic, Bottles,
// a plain prefix), but its log is an ordinary file on the Linux side:
//  - Steam: <library>/steamapps/common/Path of Exile/logs/Client.txt, in Steam's
//    folder (~/.local/share/Steam, ~/.steam/steam, the Flatpak's under ~/.var)
//    or any library listed in its libraryfolders.vdf
//  - a Wine prefix: <prefix>/drive_c/Program Files (x86)/Grinding Gear Games/…
//    in the usual prefixes (~/.wine, Lutris's ~/Games/path-of-exile, …)

export interface LinuxLocateEnv {
  /** $HOME */
  home?: string
  /** $WINEPREFIX, when one is set */
  winePrefix?: string
}

/** Where Steam keeps itself on Linux, native install and Flatpak. */
const LINUX_STEAM = [
  '.local/share/Steam',
  '.steam/steam',
  '.steam/root',
  '.var/app/com.valvesoftware.Steam/.local/share/Steam',
  '.var/app/com.valvesoftware.Steam/data/Steam'
]

/** Wine prefixes the usual launchers make for the standalone client. */
const LINUX_PREFIXES = [
  '.wine',
  'Games/path-of-exile',
  'Games/path-of-exile/prefix',
  'Games/Heroic/Prefixes/default/Path of Exile',
  '.var/app/com.usebottles.bottles/data/bottles/bottles/Path-of-Exile',
  '.local/share/bottles/bottles/Path-of-Exile'
]

/** Every place a Client.txt could be on Linux, most likely first. */
export function linuxClientTxtCandidates(env: LinuxLocateEnv, fs: LocateFs): string[] {
  const out: string[] = []
  const add = (p: string): void => {
    if (!out.includes(p)) out.push(p)
  }
  const home = env.home
  const log = posix.join('logs', 'Client.txt')

  if (home) {
    for (const rel of LINUX_STEAM) {
      const steam = posix.join(home, rel)
      const vdf = fs.read(posix.join(steam, 'steamapps', 'libraryfolders.vdf'))
      for (const lib of [steam, ...linuxSteamLibraries(vdf)]) {
        add(posix.join(lib, 'steamapps', 'common', POE_FOLDER, log))
      }
    }
  }

  const prefixes = [env.winePrefix, ...(home ? LINUX_PREFIXES.map((rel) => posix.join(home, rel)) : [])]
  for (const prefix of prefixes) {
    if (!prefix) continue
    for (const pf of ['Program Files (x86)', 'Program Files']) {
      add(posix.join(prefix, 'drive_c', pf, 'Grinding Gear Games', POE_FOLDER, log))
    }
  }
  return out
}

/** linuxClientTxtCandidates' most recently written Client.txt, or null. */
export function locateClientTxtLinux(env: LinuxLocateEnv, fs: LocateFs): string | null {
  return newest(linuxClientTxtCandidates(env, fs), fs)
}

/** The library folders in a Linux Steam's libraryfolders.vdf. */
export function linuxSteamLibraries(vdf: string | null): string[] {
  if (!vdf) return []
  return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => posix.normalize(m[1]))
}

function newest(paths: string[], fs: LocateFs): string | null {
  let best: string | null = null
  let bestTime = -Infinity
  for (const path of paths) {
    const time = fs.mtime(path)
    if (time != null && time > bestTime) {
      best = path
      bestTime = time
    }
  }
  return best
}

/** Steam's folder from `reg query HKCU\Software\Valve\Steam /v SteamPath`
 *  output ("SteamPath    REG_SZ    c:/program files (x86)/steam"). */
export function steamPathFromReg(output: string): string | null {
  const m = /SteamPath\s+REG_SZ\s+(.+?)\s*$/m.exec(output)
  return m ? win32.normalize(m[1]) : null
}
