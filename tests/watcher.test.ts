import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LogFileWatcher, type WatcherStatus } from '../electron/log/watcher.ts'
import { until } from './helpers.ts'

interface Harness {
  lines: string[]
  backscans: string[][]
  statuses: WatcherStatus[]
  watcher: LogFileWatcher
}

function makeWatcher(): Harness {
  const h: Omit<Harness, 'watcher'> = { lines: [], backscans: [], statuses: [] }
  const watcher = new LogFileWatcher(
    {
      onLines: (ls) => h.lines.push(...ls),
      onBackscan: (ls) => h.backscans.push(ls),
      onStatus: (s) => h.statuses.push(s)
    },
    { pollMs: 25, backscanBytes: 4096 }
  )
  return { ...h, watcher }
}

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'poe-watcher-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('backscans the existing tail on start, then only new appends flow', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    await writeFile(file, 'old line 1\nold line 2\n')

    const h = makeWatcher()
    h.watcher.start(file)
    try {
    await until(() => h.backscans.length === 1)
    assert.deepEqual(h.backscans[0], ['old line 1', 'old line 2'])
    assert.equal(h.lines.length, 0)

    await appendFile(file, 'new line\n')
    await until(() => h.lines.length === 1)
    assert.deepEqual(h.lines, ['new line'])
    } finally {
      h.watcher.stop()
    }
  })
})

test('carries partial lines across polls (no torn lines)', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    await writeFile(file, '')

    const h = makeWatcher()
    h.watcher.start(file)
    try {
    await until(() => h.backscans.length === 1)

    await appendFile(file, 'first half… ')
    await new Promise((r) => setTimeout(r, 80)) // let a poll see the partial write
    assert.equal(h.lines.length, 0)
    await appendFile(file, 'second half\ncomplete\n')
    await until(() => h.lines.length === 2)
    assert.deepEqual(h.lines, ['first half… second half', 'complete'])
    } finally {
      h.watcher.stop()
    }
  })
})

test('multibyte characters split across polls survive (byte carry)', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    await writeFile(file, '')

    const h = makeWatcher()
    h.watcher.start(file)
    try {
    await until(() => h.backscans.length === 1)

    const line = Buffer.from('Zopfhöhle Überprüfung\n', 'utf8')
    const cut = line.indexOf(Buffer.from('ö', 'utf8')) + 1 // split inside the ö
    await appendFile(file, line.subarray(0, cut))
    await new Promise((r) => setTimeout(r, 80))
    await appendFile(file, line.subarray(cut))
    await until(() => h.lines.length === 1)
    assert.deepEqual(h.lines, ['Zopfhöhle Überprüfung'])
    } finally {
      h.watcher.stop()
    }
  })
})

test('tolerates a missing file and attaches when it appears', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    const h = makeWatcher()
    h.watcher.start(file)
    try {

    await until(() => h.statuses.some((s) => s.state === 'missing'))
    await writeFile(file, 'appeared\n')
    await until(() => h.backscans.length === 1)
    assert.deepEqual(h.backscans[0], ['appeared'])
    assert.equal(h.watcher.status().state, 'watching')
    } finally {
      h.watcher.stop()
    }
  })
})

test('truncation (file replaced) triggers a fresh backscan, not a giant read', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    await writeFile(file, 'session one line 1\nsession one line 2\n')

    const h = makeWatcher()
    h.watcher.start(file)
    try {
    await until(() => h.backscans.length === 1)

    await writeFile(file, 'fresh\n') // shorter file = truncated/recreated
    await until(() => h.backscans.length === 2)
    assert.deepEqual(h.backscans[1], ['fresh'])

    await appendFile(file, 'after truncate\n')
    await until(() => h.lines.includes('after truncate'))
    } finally {
      h.watcher.stop()
    }
  })
})

test('backscan window starting mid-line drops the torn first line', async () => {
  await withTmp(async (dir) => {
    const file = join(dir, 'Client.txt')
    // File larger than the backscan window (4096): window starts mid-line.
    const filler = `${'x'.repeat(99)}\n`.repeat(60) // 6000 bytes
    await writeFile(file, filler + 'tail line A\ntail line B\n')

    const h = makeWatcher()
    h.watcher.start(file)
    try {
    await until(() => h.backscans.length === 1)
    // Every surviving line must be complete: a full filler line or a tail line.
    for (const l of h.backscans[0]) {
      assert.ok(l === 'x'.repeat(99) || l.startsWith('tail line'), `torn fragment kept: "${l}"`)
    }
    assert.ok(h.backscans[0].includes('tail line A'))
    assert.ok(h.backscans[0].includes('tail line B'))
    } finally {
      h.watcher.stop()
    }
  })
})
