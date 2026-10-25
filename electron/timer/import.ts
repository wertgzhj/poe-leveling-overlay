// Old runs, read back from a whole Client.txt. Pure (no Electron imports —
// tested directly): the caller hands it the lines, however it reads them.
// It's the run timer itself, fed the whole log from the top instead of from
// the moment the overlay started, on a timer of its own — the live one isn't
// touched until the result is merged (RunTimer.mergeRuns).
//
// Only finished campaigns come out: a log holds every character ever rolled,
// and the abandoned ones — test characters, rerolls — would bury the runs
// worth comparing.

import type { LogParser } from '../log/parser.ts'
import { RunTimer, type RunSummary } from './engine.ts'
import { parseStamp } from './stamp.ts'

export class LogImporter {
  private readonly timer: RunTimer
  private readonly parser: LogParser

  constructor(parser: LogParser, areaNames: Record<string, string>) {
    this.parser = parser
    this.timer = new RunTimer({ areaNames })
  }

  feed(line: string): void {
    const stamp = parseStamp(line)
    if (stamp) this.timer.feed(stamp, this.parser.parseLine(line))
  }

  /** The finished campaigns found so far, oldest first. */
  finished(): RunSummary[] {
    return this.timer
      .snapshot()
      .history.filter((r) => r.status === 'finished')
      .reverse()
  }
}
