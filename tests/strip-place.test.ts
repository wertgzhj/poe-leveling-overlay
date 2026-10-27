import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchoredResize, defaultStripBounds, stripFontSize } from '../electron/strip-place.ts'

const qhd = { x: 0, y: 0, width: 2560, height: 1440 }
const fhd = { x: 0, y: 0, width: 1920, height: 1080 }

test("the text matches the game's: 20 px on 1440, 15 on 1080", () => {
  assert.equal(stripFontSize(1440, 2), 20)
  assert.equal(stripFontSize(1080, 2), 15)
  assert.equal(stripFontSize(1440, 0), 16)
  assert.equal(stripFontSize(1440, 4), 26)
  assert.equal(stripFontSize(1440, 99), 20, 'an unknown step is the game size')
})

test('it starts over the XP bar, in the band between flasks and skills', () => {
  const b = defaultStripBounds(qhd, 150)
  // measured on 1440p: the band runs from x 940 to 1843, the XP bar from y 1390
  assert.equal(b.width, 480)
  assert.ok(b.x >= 940 && b.x + b.width <= 1843, `x ${b.x}..${b.x + b.width}`)
  assert.equal(b.y + b.height, 1390)
  // the same place, scaled, on 1080p
  const f = defaultStripBounds(fhd, 112)
  assert.equal(f.width, 360)
  assert.ok(f.x >= 705 && f.x + f.width <= 1382, `x ${f.x}..${f.x + f.width}`)
})

test('on a second monitor it starts on that one', () => {
  const b = defaultStripBounds({ x: 2560, y: 0, width: 2560, height: 1440 }, 150)
  assert.ok(b.x > 2560)
})

test('a 4:3 screen has no band wide enough: the middle', () => {
  const b = defaultStripBounds({ x: 0, y: 0, width: 1440, height: 1080 }, 112)
  assert.equal(b.x + b.width / 2, 720)
})

test('in the lower half it grows upward, in the upper half downward', () => {
  const low = { x: 1000, y: 1240, width: 480, height: 150 }
  assert.deepEqual(anchoredResize(low, 200, qhd), { x: 1000, y: 1190, width: 480, height: 200 })
  assert.deepEqual(anchoredResize(low, 100, qhd), { x: 1000, y: 1290, width: 480, height: 100 })
  const high = { x: 1000, y: 40, width: 480, height: 150 }
  assert.deepEqual(anchoredResize(high, 200, qhd), { x: 1000, y: 40, width: 480, height: 200 })
})

test('it stays on the screen', () => {
  // growing down from the upper half past the bottom: pushed back up
  assert.equal(anchoredResize({ x: 1000, y: 500, width: 480, height: 100 }, 1000, qhd).y, 440)
  // growing up from the lower half past the top: pushed back down
  assert.equal(anchoredResize({ x: 1000, y: 700, width: 480, height: 100 }, 900, qhd).y, 0)
  // dragged half off the right edge
  assert.equal(anchoredResize({ x: 2400, y: 1240, width: 480, height: 150 }, 150, qhd).x, 2080)
  // taller than the screen: the screen
  assert.equal(anchoredResize({ x: 0, y: 0, width: 480, height: 150 }, 5000, qhd).height, 1440)
})
