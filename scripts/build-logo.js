// Logo pixel Almac (16x16) -> ui/logo.svg (header) + build/icon.png & build/icon.icns (ikon aplikasi macOS).
// Pemakaian: node scripts/build-logo.js   (butuh `iconutil` bawaan macOS untuk .icns)
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')

// K garis, Y kuning, D bayangan kuning, W kilau, M permata mint, . kosong. Bayangan offset (S) dihitung otomatis.
const ART = [
  '..KKKKKKKKKKK...',
  '.KWWYYYYYYMYYK..',
  'KWYYYYYYYMWMYDK.',
  'KWYYYYYYYYMYYDK.',
  'KYYYYYKKKYYYYDK.',
  'KYYYYKKYKKYYYDK.',
  'KYYYYKKYKKYYYDK.',
  'KYYYKKYYYKKYYDK.',
  'KYYYKKKKKKKYYDK.',
  'KYYYKKYYYKKYYDK.',
  'KYYKKYYYYYKKYDK.',
  'KYYKKYYYYYKKYDK.',
  'KYYYYYYYYYYYYDK.',
  '.KDDDDDDDDDDDK..',
  '..KKKKKKKKKKK...',
  '................',
]
const COLORS = { K: '#111111', Y: '#ffc93c', D: '#e0951f', W: '#fff4cf', M: '#7eebd3', S: '#111111' }

// bayangan offset (1,1) seperti tombol di UI
const grid = ART.map(r => r.split(''))
for (let y = 15; y >= 1; y--) for (let x = 15; x >= 1; x--) {
  if (grid[y][x] === '.' && ART[y - 1][x - 1] !== '.') grid[y][x] = 'S'
}

const root = path.join(__dirname, '..')
fs.mkdirSync(path.join(root, 'build'), { recursive: true })

// ---- SVG (rect per piksel, crispEdges) ----
const rects = []
grid.forEach((row, y) => row.forEach((c, x) => { if (c !== '.') rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${COLORS[c]}"/>`) }))
fs.writeFileSync(path.join(root, 'ui', 'logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>\n`)

// ---- PNG tanpa dependensi (RGBA, zlib) ----
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255]
function png(size) {
  // skala bulat supaya piksel tetap tajam; ukuran besar diberi margin seperti ikon macOS
  const scale = size <= 32 ? size / 16 : Math.floor(size * 0.875 / 16)
  const off = Math.floor((size - 16 * scale) / 2)
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0 // filter: none
    for (let px = 0; px < size; px++) {
      const gx = Math.floor((px - off) / scale), gy = Math.floor((py - off) / scale)
      const c = grid[gy]?.[gx]
      if (c && c !== '.') hex(COLORS[c]).forEach((v, i) => { raw[py * (size * 4 + 1) + 1 + px * 4 + i] = v })
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

fs.writeFileSync(path.join(root, 'build', 'icon.png'), png(1024))
const iconset = path.join(root, 'build', 'icon.iconset')
fs.mkdirSync(iconset, { recursive: true })
for (const s of [16, 32, 128, 256, 512]) {
  fs.writeFileSync(path.join(iconset, `icon_${s}x${s}.png`), png(s))
  fs.writeFileSync(path.join(iconset, `icon_${s}x${s}@2x.png`), png(s * 2))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build', 'icon.icns')])
fs.rmSync(iconset, { recursive: true })
console.log('logo: ui/logo.svg, build/icon.png, build/icon.icns')
