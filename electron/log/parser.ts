// Pure Client.txt line parser (no Electron imports — unit-tested directly).
// Patterns come from data/log-patterns/<lang>.json so a new client language is
// a data change, not a code change.

export interface LogPatterns {
  /** Channel-sigil test that identifies chat/whisper/party/guild/trade lines. */
  chat?: string
  areaGenerated: string
  levelUp: string
  zoneEntered: string
  /** Izaro's voice line — he speaks when a Trial of Ascendancy is completed. */
  izaro?: string
  // The run timer's lines (see electron/timer/engine.ts):
  /** A connection to the login server: launch, logout, reconnect. */
  loginServer?: string
  /** The game's own measure of a loading screen, written as it ends. */
  loadingScreen?: string
  /** The game closing, or the server dropping you. */
  leftGame?: string
  afk?: string
  /** Sin's voice — his farewells mark Pantheon gods and Kitava falling. */
  sin?: string
  /** Kitava's resistance penalty, after each of his two fights. */
  kitava?: string
  /** A quest's passive skill point handed over. */
  passivePoint?: string
  slain?: string
  /** Another player coming into, or leaving, your instance. */
  areaPresence?: string
}

export type ParsedLogEvent =
  | { kind: 'areaGenerated'; areaId: string; areaLevel: number }
  | { kind: 'levelUp'; name: string; charClass: string; level: number }
  | { kind: 'zoneEntered'; zoneName: string }
  | { kind: 'izaro'; line: string }
  | { kind: 'loginServer' }
  | { kind: 'loadingScreen'; ms: number }
  | { kind: 'leftGame' }
  | { kind: 'afk'; on: boolean }
  | { kind: 'sin'; line: string }
  | { kind: 'kitava'; tier: 'cruel' | 'merciless' }
  | { kind: 'passivePoint' }
  | { kind: 'slain'; name: string }
  | { kind: 'areaPresence'; name: string; joined: boolean }

export class LogParser {
  private readonly chat: RegExp | null
  private readonly areaGenerated: RegExp
  private readonly levelUp: RegExp
  private readonly zoneEntered: RegExp
  private readonly izaro: RegExp | null
  private readonly loginServer: RegExp | null
  private readonly loadingScreen: RegExp | null
  private readonly leftGame: RegExp | null
  private readonly afk: RegExp | null
  private readonly sin: RegExp | null
  private readonly kitava: RegExp | null
  private readonly passivePoint: RegExp | null
  private readonly slain: RegExp | null
  private readonly areaPresence: RegExp | null

  constructor(patterns: LogPatterns) {
    this.chat = patterns.chat ? new RegExp(patterns.chat) : null
    this.areaGenerated = new RegExp(patterns.areaGenerated)
    this.levelUp = new RegExp(patterns.levelUp)
    this.zoneEntered = new RegExp(patterns.zoneEntered)
    this.izaro = patterns.izaro ? new RegExp(patterns.izaro) : null
    const optional = (source: string | undefined): RegExp | null => (source ? new RegExp(source) : null)
    this.loginServer = optional(patterns.loginServer)
    this.loadingScreen = optional(patterns.loadingScreen)
    this.leftGame = optional(patterns.leftGame)
    this.afk = optional(patterns.afk)
    this.sin = optional(patterns.sin)
    this.kitava = optional(patterns.kitava)
    this.passivePoint = optional(patterns.passivePoint)
    this.slain = optional(patterns.slain)
    this.areaPresence = optional(patterns.areaPresence)
  }

  /**
   * Classify one log line. Chat/whisper lines are dropped before any other
   * matching — both for privacy (chat is never parsed) and so pasted
   * text can't spoof a level-up or zone change. Unmatched lines return null
   * and are discarded immediately by the caller.
   */
  parseLine(line: string): ParsedLogEvent | null {
    if (line.length === 0) return null
    if (this.chat?.test(line)) return null

    const area = this.areaGenerated.exec(line)
    if (area?.groups) {
      return {
        kind: 'areaGenerated',
        areaId: area.groups['areaId'],
        areaLevel: Number(area.groups['areaLevel'])
      }
    }

    const lvl = this.levelUp.exec(line)
    if (lvl?.groups) {
      return {
        kind: 'levelUp',
        name: lvl.groups['name'].trim(),
        charClass: lvl.groups['class'],
        level: Number(lvl.groups['level'])
      }
    }

    const zone = this.zoneEntered.exec(line)
    if (zone?.groups) {
      return { kind: 'zoneEntered', zoneName: zone.groups['zoneName'] }
    }

    // Izaro narrates the Trials of Ascendancy — his plaque line identifies which
    // trial you just finished (the trials engine maps the line -> trial). Not
    // gated by the chat filter: his line has no channel sigil, so it survives.
    const izaro = this.izaro?.exec(line)
    if (izaro?.groups) return { kind: 'izaro', line: izaro.groups['line'].trim() }

    // The run timer's lines. None has a channel sigil either: system messages
    // and NPC voices, written by the game.
    if (this.loginServer?.test(line)) return { kind: 'loginServer' }
    const loading = this.loadingScreen?.exec(line)
    if (loading?.groups) return { kind: 'loadingScreen', ms: Math.round(Number(loading.groups['seconds']) * 1000) }
    if (this.leftGame?.test(line)) return { kind: 'leftGame' }
    const afk = this.afk?.exec(line)
    if (afk?.groups) return { kind: 'afk', on: afk.groups['state'] === 'ON' }
    const sin = this.sin?.exec(line)
    if (sin?.groups) return { kind: 'sin', line: sin.groups['line'].trim() }
    const kitava = this.kitava?.exec(line)
    if (kitava?.groups) return { kind: 'kitava', tier: kitava.groups['tier'] as 'cruel' | 'merciless' }
    if (this.passivePoint?.test(line)) return { kind: 'passivePoint' }
    const slain = this.slain?.exec(line)
    if (slain?.groups) return { kind: 'slain', name: slain.groups['name'].trim() }
    const presence = this.areaPresence?.exec(line)
    if (presence?.groups) {
      return { kind: 'areaPresence', name: presence.groups['name'], joined: presence.groups['how'] === 'joined' }
    }

    return null
  }
}
