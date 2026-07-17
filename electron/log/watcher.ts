// Polling tail for Client.txt (no Electron imports — integration-tested with
// plain Node). Polling is the primary mechanism, not a fallback: fs.watch is
// unreliable on Windows for files appended by another process (plan §3).
// The file reaches hundreds of MB per league, so we never read it whole —
// seek to end, then read only appended bytes (§3), plus a bounded tail
// backscan on start for restart/resume (§8).

import { open, stat } from 'node:fs/promises'

export type WatcherState = 'off' | 'missing' | 'watching' | 'error'

export interface WatcherStatus {
  state: WatcherState
  path: string | null
  sizeBytes: number | null
}

export interface WatcherCallbacks {
  /** Complete lines appended since the last poll. */
  onLines: (lines: string[]) => void
  /** Tail window read on (re)start — replay silently for resume, never emit. */
  onBackscan?: (lines: string[]) => void
  onStatus?: (status: WatcherStatus) => void
}

export interface WatcherOptions {
  pollMs?: number
  backscanBytes?: number
}

const NL = 0x0a

export class LogFileWatcher {
  private readonly pollMs: number
  private readonly backscanBytes: number
  private readonly callbacks: WatcherCallbacks

  private path: string | null = null
  private timer: NodeJS.Timeout | null = null
  private running = false
  private ticking = false
  private offset = 0
  private carry: Buffer = Buffer.alloc(0)
  private state: WatcherState = 'off'
  private lastSize: number | null = null

  constructor(callbacks: WatcherCallbacks, opts: WatcherOptions = {}) {
    this.callbacks = callbacks
    this.pollMs = opts.pollMs ?? 300
    this.backscanBytes = opts.backscanBytes ?? 64 * 1024
  }

  status(): WatcherStatus {
    return { state: this.state, path: this.path, sizeBytes: this.lastSize }
  }

  /** Start (or restart with a new path). Missing files are tolerated: the
   *  watcher keeps polling and attaches when the file appears. */
  start(path: string): void {
    this.stop()
    this.path = path
    this.running = true
    this.setState('missing') // until the first successful stat
    void this.tick(true)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.offset = 0
    this.carry = Buffer.alloc(0)
    this.lastSize = null
    this.setState('off')
  }

  private schedule(): void {
    if (!this.running) return
    this.timer = setTimeout(() => void this.tick(false), this.pollMs)
  }

  private async tick(fresh: boolean): Promise<void> {
    if (!this.running || this.ticking || !this.path) return
    this.ticking = true
    try {
      let size: number
      try {
        size = (await stat(this.path)).size
      } catch {
        // File missing/unreadable — drop attachment; reattach (with a fresh
        // backscan) when it reappears.
        this.offset = 0
        this.carry = Buffer.alloc(0)
        this.lastSize = null
        this.setState('missing')
        return
      }

      this.lastSize = size
      const attaching = fresh || this.state !== 'watching'
      const truncated = !attaching && size < this.offset

      if (attaching || truncated) {
        // (Re)attach: read a bounded tail window for resume, then follow from
        // EOF. Always emits — an empty window means "attached, no history".
        const from = Math.max(0, size - this.backscanBytes)
        const buf = await this.read(from, size)
        this.offset = size
        this.carry = Buffer.alloc(0)
        this.setState('watching')
        let lines = buf ? splitLines(buf) : []
        // Drop the first line when the window starts mid-line.
        if (buf && from > 0) lines = lines.slice(1)
        this.callbacks.onBackscan?.(lines)
        return
      }

      if (size === this.offset) return

      const buf = await this.read(this.offset, size)
      if (!buf) return
      this.offset = size

      const joined = this.carry.length ? Buffer.concat([this.carry, buf]) : buf
      const lastNl = joined.lastIndexOf(NL)
      if (lastNl === -1) {
        this.carry = joined // still mid-line; keep bytes, not text (multibyte-safe)
        return
      }
      this.carry = Buffer.from(joined.subarray(lastNl + 1))
      const lines = splitLines(joined.subarray(0, lastNl + 1))
      if (lines.length) this.callbacks.onLines(lines)
    } catch {
      this.setState('error')
    } finally {
      this.ticking = false
      this.schedule()
    }
  }

  private async read(from: number, to: number): Promise<Buffer | null> {
    if (to <= from) return null
    const fh = await open(this.path as string, 'r')
    try {
      const buf = Buffer.alloc(to - from)
      const { bytesRead } = await fh.read(buf, 0, buf.length, from)
      return bytesRead === buf.length ? buf : buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  }

  private setState(state: WatcherState): void {
    if (this.state === state) return
    this.state = state
    this.callbacks.onStatus?.(this.status())
  }
}

/** Split a byte buffer into decoded lines; strips \r and a leading BOM. */
function splitLines(buf: Buffer): string[] {
  const lines: string[] = []
  let start = 0
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === NL) {
      if (i > start || i < buf.length) {
        let end = i
        if (end > start && buf[end - 1] === 0x0d) end--
        let line = buf.subarray(start, end).toString('utf8')
        if (line.charCodeAt(0) === 0xfeff) line = line.slice(1)
        if (line.length) lines.push(line)
      }
      start = i + 1
    }
  }
  return lines
}
