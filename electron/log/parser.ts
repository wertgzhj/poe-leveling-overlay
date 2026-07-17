// Pure Client.txt line parser (no Electron imports — unit-tested directly).
// Patterns come from data/log-patterns/<lang>.json so a new client language is
// a data change, not a code change (plan §8).

export interface LogPatterns {
  /** Channel-sigil test that identifies chat/whisper/party/guild/trade lines. */
  chat?: string
  areaGenerated: string
  levelUp: string
  zoneEntered: string
}

export type ParsedLogEvent =
  | { kind: 'areaGenerated'; areaId: string; areaLevel: number }
  | { kind: 'levelUp'; name: string; charClass: string; level: number }
  | { kind: 'zoneEntered'; zoneName: string }

export class LogParser {
  private readonly chat: RegExp | null
  private readonly areaGenerated: RegExp
  private readonly levelUp: RegExp
  private readonly zoneEntered: RegExp

  constructor(patterns: LogPatterns) {
    this.chat = patterns.chat ? new RegExp(patterns.chat) : null
    this.areaGenerated = new RegExp(patterns.areaGenerated)
    this.levelUp = new RegExp(patterns.levelUp)
    this.zoneEntered = new RegExp(patterns.zoneEntered)
  }

  /**
   * Classify one log line. Chat/whisper lines are dropped before any other
   * matching — both for privacy (§11.1: chat is never parsed) and so pasted
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

    return null
  }
}
