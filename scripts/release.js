// npm run release -- <file catatan rilis.md>
// build mac (arm64 + x64), buat almac-update.json (versi + SHA-512 tiap zip) dan tanda tangan Ed25519-nya,
// lalu buat GitHub Release. Kunci pribadi: $ALMAC_UPDATE_KEY atau ~/.almac/update-key.pem (JANGAN di-commit, simpan cadangannya:
// tanpa kunci ini app yang sudah terpasang tidak akan menerima update lagi).
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { verifyManifest } = require('../updater')

const root = path.join(__dirname, '..'), dist = path.join(root, 'dist')
const { version } = require('../package.json')
const notes = process.argv[2]
if (!notes || !fs.existsSync(notes)) { console.error('usage: npm run release -- <release-notes.md>'); process.exit(1) }
const key = crypto.createPrivateKey(fs.readFileSync(process.env.ALMAC_UPDATE_KEY || path.join(os.homedir(), '.almac', 'update-key.pem')))
if (execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString().trim()) { console.error('commit your changes first'); process.exit(1) }

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
fs.rmSync(dist, { recursive: true, force: true })
// tanda tangan dengan sertifikat Apple Development (kalau ada): identitas app tetap sama antar-versi, jadi izin Keychain
// ("Almac Browser Safe Storage") cukup diberi sekali. Tanpa sertifikat: ad-hoc, macOS bertanya lagi setelah tiap update.
const identity = /"Apple Development: ([^"]+)"/.exec(execFileSync('security', ['find-identity', '-v', '-p', 'codesigning']).toString())?.[1]
console.log(identity ? 'signing as Apple Development: ' + identity : 'no Apple Development certificate: ad-hoc signing')
run('npx', ['electron-builder', '--mac', '--publish', 'never', ...(identity ? ['-c.mac.identity=' + identity] : [])])

const files = {}
for (const arch of ['arm64', 'x64']) {
  const name = `Almac-Browser-${version}-${arch}.zip`
  const buf = fs.readFileSync(path.join(dist, name))
  files[arch] = { name, size: buf.length, sha512: crypto.createHash('sha512').update(buf).digest('base64') }
}
const json = JSON.stringify({ version, files }, null, 2)
const sig = crypto.sign(null, Buffer.from(json), key).toString('base64')
if (!verifyManifest(json, sig)) { console.error('signature does not match the public key in updater.js'); process.exit(1) }
fs.writeFileSync(path.join(dist, 'almac-update.json'), json)
fs.writeFileSync(path.join(dist, 'almac-update.json.sig'), sig)

const assets = fs.readdirSync(dist).filter(f => /\.(dmg|zip)$/.test(f) || f.startsWith('almac-update.json')).map(f => path.join(dist, f))
run('git', ['push', 'origin', 'HEAD'])
run('gh', ['release', 'create', 'v' + version, '-R', 'Alianama/almac-browser', '--target', 'main', '--title', 'Almac Browser v' + version, '--notes-file', notes, ...assets])
