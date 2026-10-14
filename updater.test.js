// node updater.test.js -- perbandingan versi & verifikasi tanda tangan manifest
const assert = require('assert'), crypto = require('crypto')
const { newer, verifyManifest, fileKey } = require('./updater')
assert(newer('1.10.0', '1.9.9') && newer('1.2.1', '1.2.0') && newer('2.0', '1.99.99'))
assert(!newer('1.2.0', '1.2.0') && !newer('1.1.9', '1.2.0'))
const json = JSON.stringify({ version: '9.9.9', files: {} })
const { privateKey } = crypto.generateKeyPairSync('ed25519') // kunci asing: harus ditolak
assert(!verifyManifest(json, crypto.sign(null, Buffer.from(json), privateKey).toString('base64')), 'foreign key accepted')
assert(!verifyManifest(json, Buffer.alloc(64).toString('base64')))
const fs = require('fs'), os = require('os'), path = require('path')
const own = path.join(os.homedir(), '.almac', 'update-key.pem')
if (fs.existsSync(own)) { // kunci pemilik: harus diterima, dan manifest yang diubah harus ditolak
  const k = crypto.createPrivateKey(fs.readFileSync(own)), sig = crypto.sign(null, Buffer.from(json), k).toString('base64')
  assert(verifyManifest(json, sig))
  assert(!verifyManifest(json.replace('9.9.9', '9.9.8'), sig), 'tampered manifest accepted')
}
// kunci manifest: mac tetap 'arm64'/'x64' (dibaca versi lama), Windows 'win32-x64'
assert(fileKey('darwin', 'arm64') === 'arm64' && fileKey('win32', 'x64') === 'win32-x64')
console.log('updater: ok')
