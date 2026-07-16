// Generates build/icon.png (tray + app icon) with zero image dependencies —
// a dark rounded square with a gold diamond. Run via `npm run make-icon`.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const S = 256
const rgba = Buffer.alloc(S * S * 4)

const BG = [0x14, 0x18, 0x22]
const GOLD = [0xc8, 0xa2, 0x4a]
const inset = 8
const radius = 44
const cx = S / 2
const cy = S / 2

function insideRoundedSquare(x, y) {
  const min = inset
  const max = S - inset
  if (x < min || y < min || x >= max || y >= max) return false
  const rx = Math.min(x - min, max - 1 - x)
  const ry = Math.min(y - min, max - 1 - y)
  if (rx < radius && ry < radius) {
    const dx = radius - rx
    const dy = radius - ry
    if (dx * dx + dy * dy > radius * radius) return false
  }
  return true
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    if (!insideRoundedSquare(x, y)) {
      rgba[i + 3] = 0
      continue
    }
    const diamond = Math.abs(x - cx) + Math.abs(y - cy) < 78
    const [r, g, b] = diamond ? GOLD : BG
    rgba[i] = r
    rgba[i + 1] = g
    rgba[i + 2] = b
    rgba[i + 3] = 255
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA

// prepend the per-scanline filter byte (0 = none)
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, y * S * 4 + S * 4)
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png)
console.log(`wrote build/icon.png (${png.length} bytes, ${S}x${S})`)
