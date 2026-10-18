import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUNDLED_ID,
  addProfile,
  adoptExternal,
  blankProfile,
  deleteProfile,
  dropReferences,
  duplicateProfile,
  importProfileFile,
  isInLibrary,
  listLibrary,
  remapReferences,
  renameProfile,
  slugify,
  uniqueId
} from '../electron/profile/library.ts'

// Real files in a real temp dir: the bugs this module exists to fix were all
// about which file got written, so mocking the filesystem would test nothing.

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'poe-profiles-'))
}

function profile(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    meta: { name, class: 'Witch', ...extra },
    stages: [{ range: [1, 12], socketGroups: [{ gems: ['Freezing Pulse', 'Arcane Surge Support'] }] }],
    gemPlan: []
  }
}

test('a second build with the same name is a second file, not an overwrite', () => {
  // The bug: every PoB import wrote pob-import.json, so importing for a second
  // character replaced the first character's build.
  const dir = freshDir()
  const a = addProfile(dir, profile('Cyclone Slayer'))
  const b = addProfile(dir, profile('Cyclone Slayer'))
  assert.equal(a.entry?.id, 'cyclone-slayer')
  assert.equal(b.entry?.id, 'cyclone-slayer-2')
  assert.equal(listLibrary(dir).length, 2)
  assert.notEqual(a.entry?.path, b.entry?.path)
})

test('file names are plain and the bundled id is never taken', () => {
  assert.equal(slugify('Arc Elementalist — Lvl 1-90!'), 'arc-elementalist-lvl-1-90')
  assert.equal(slugify('Ätherische Klinge'), 'atherische-klinge')
  assert.equal(slugify('???'), 'profile')
  assert.equal(uniqueId('x', new Set(['x', 'x-2'])), 'x-3')

  // A profile of yours called "Example" must not answer to the bundled one's id.
  const dir = freshDir()
  assert.equal(addProfile(dir, profile('Example')).entry?.id, `${BUNDLED_ID}-2`)
})

test('only profiles that would load get in', () => {
  const dir = freshDir()
  const res = addProfile(dir, { meta: { name: 'No stages', class: 'Witch' }, stages: [] })
  assert.equal(res.ok, false)
  assert.match(res.errors.join(' '), /stages/)
  assert.deepEqual(readdirSync(dir), [])
})

test('a new profile is valid and starts with the class starting gems', () => {
  const dir = freshDir()
  const res = addProfile(dir, blankProfile('My Marauder', 'Marauder', ['Heavy Strike', 'Ruthless Support']))
  assert.equal(res.ok, true, res.errors.join('; '))
  assert.equal(res.entry?.charClass, 'Marauder')
  assert.equal(res.entry?.stages, 1)
  const written = JSON.parse(readFileSync(res.entry!.path, 'utf8'))
  assert.deepEqual(written.stages[0].socketGroups[0].gems, ['Heavy Strike', 'Ruthless Support'])
  assert.deepEqual(written.stages[0].range, [1, 100])
  // An empty name still produces something you can find in a list.
  assert.equal(addProfile(dir, blankProfile('  ', 'Witch', ['Fireball'])).entry?.name, 'New profile')
})

test('a duplicate is a new file that belongs to nobody', () => {
  const dir = freshDir()
  const original = addProfile(dir, profile('Arc Elementalist', { character: 'Sparky' })).entry!
  const copy = duplicateProfile(dir, original.path)
  assert.equal(copy.ok, true)
  assert.equal(copy.entry?.name, 'Arc Elementalist (copy)')
  // Two profiles both claiming Sparky would make switching to Sparky a coin toss.
  assert.equal(copy.entry?.character, undefined)
  // And the original is untouched.
  assert.equal(JSON.parse(readFileSync(original.path, 'utf8')).meta.character, 'Sparky')
})

test("a copy of the bundled example drops the example's instructions", () => {
  const dir = freshDir()
  const outside = freshDir()
  const source = join(outside, 'example.json')
  writeFileSync(source, JSON.stringify({ _note: 'Example build profile — replace me', ...profile('Example Cold Witch') }))
  const copy = duplicateProfile(dir, source, true)
  const written = JSON.parse(readFileSync(copy.entry!.path, 'utf8'))
  assert.equal(written._note, undefined)
  assert.equal(written.meta.name, 'Example Cold Witch (copy)')
})

test('renaming changes the name inside and nothing else', () => {
  const dir = freshDir()
  const entry = addProfile(dir, { ...profile('Old name'), _custom: { keep: true } }).entry!
  const res = renameProfile(entry.path, '  New name  ')
  assert.equal(res.ok, true)
  assert.equal(res.entry?.name, 'New name')
  // The file keeps its name: the per-character map remembers profiles by path.
  assert.equal(res.entry?.path, entry.path)
  // A field this version doesn't know survives the round trip.
  assert.deepEqual(JSON.parse(readFileSync(entry.path, 'utf8'))._custom, { keep: true })
  assert.equal(renameProfile(entry.path, '   ').ok, false)
})

test('delete removes only files that are in the library', async () => {
  const dir = freshDir()
  const entry = addProfile(dir, profile('Doomed')).entry!
  const removed: string[] = []
  const res = await deleteProfile(dir, entry.path, (p) => {
    removed.push(p)
  })
  assert.equal(res.ok, true)
  assert.deepEqual(removed, [entry.path])

  // Never a file elsewhere, whatever path the renderer sends.
  const outside = join(freshDir(), 'mine.json')
  writeFileSync(outside, JSON.stringify(profile('Mine')))
  const refused = await deleteProfile(dir, outside)
  assert.equal(refused.ok, false)
  assert.ok(existsSync(outside))

  // A path that only looks like it's inside doesn't count either.
  assert.equal(isInLibrary(dir, join(dir, '..', 'x.json')), false)
  assert.equal(isInLibrary(dir, join(dir, 'sub', 'x.json')), false)
})

test('a failed delete says so instead of pretending', async () => {
  const dir = freshDir()
  const entry = addProfile(dir, profile('Stubborn')).entry!
  const res = await deleteProfile(dir, entry.path, () => {
    throw new Error('recycle bin unavailable')
  })
  assert.equal(res.ok, false)
  assert.match(res.errors[0] ?? '', /recycle bin unavailable/)
})

test('importing a file copies it and leaves the original alone', () => {
  const dir = freshDir()
  const outside = join(freshDir(), 'my-build.json')
  writeFileSync(outside, JSON.stringify(profile('Summoner')))
  const res = importProfileFile(dir, outside)
  assert.equal(res.ok, true)
  assert.ok(isInLibrary(dir, res.entry!.path))
  assert.ok(existsSync(outside), 'a copy, not a move')

  const broken = join(freshDir(), 'broken.json')
  writeFileSync(broken, '{ not json')
  assert.equal(importProfileFile(dir, broken).ok, false)
})

test('outside profiles still referenced are adopted once, and the gone ones left alone', () => {
  const dir = freshDir()
  const outside = freshDir()
  const kept = join(outside, 'kept.json')
  writeFileSync(kept, JSON.stringify(profile('Kept')))
  const gone = join(outside, 'gone.json')
  const inside = addProfile(dir, profile('Already in')).entry!.path

  // The same outside path referenced twice (active + a character) is copied once.
  const moved = adoptExternal(dir, [kept, kept, gone, inside])
  assert.equal(moved.size, 1)
  assert.ok(isInLibrary(dir, moved.get(kept)!))
  assert.equal(listLibrary(dir).length, 2)

  const map = { Brutus: kept, Sparky: gone, Other: inside }
  assert.deepEqual(remapReferences(map, moved), { Brutus: moved.get(kept), Sparky: gone, Other: inside })
})

test('a deleted profile is forgotten by every character that used it', () => {
  const map = { Brutus: '/p/a.json', Sparky: '/p/b.json', Third: '/p/a.json' }
  assert.deepEqual(dropReferences(map, '/p/a.json'), { Sparky: '/p/b.json' })
})

test('a broken file is listed with its problem, not hidden', () => {
  const dir = freshDir()
  writeFileSync(join(dir, 'half.json'), JSON.stringify({ meta: { name: 'Half done', class: 'Witch' }, stages: [] }))
  writeFileSync(join(dir, 'junk.json'), '{')
  addProfile(dir, profile('Fine'))
  const list = listLibrary(dir)
  assert.equal(list.length, 3)
  const half = list.find((e) => e.id === 'half')
  assert.equal(half?.name, 'Half done', 'its own name, even though it does not validate')
  assert.ok((half?.errors.length ?? 0) > 0)
  assert.equal(list.find((e) => e.id === 'junk')?.name, 'junk')
  // Sorted by name, case-insensitively.
  assert.deepEqual(list.map((e) => e.name), ['Fine', 'Half done', 'junk'])
})
