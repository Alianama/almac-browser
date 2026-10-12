// Brankas password Almac: skema sama seperti Almac Remote (MRNGCrypto) --
// AES-256-GCM, blob base64 [salt 16B][nonce 16B][ciphertext][tag 16B], AAD = salt, kunci dari master password via PBKDF2.
// Bedanya: PBKDF2-HMAC-SHA256 600k iterasi (rekomendasi OWASP), bukan SHA1, karena tidak perlu kompatibel dengan mRemoteNG.
// Seluruh isi brankas ({entries, never}) dienkripsi sebagai satu blob; tanpa master password tidak ada yang bisa dibaca,
// termasuk daftar situsnya.
const crypto = require('crypto')
const fs = require('fs')

const ITER = 600000
const derive = (password, salt, iter = ITER) => crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256')

function seal(key, salt, text) {
  const nonce = crypto.randomBytes(16)
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce)
  c.setAAD(salt)
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([salt, nonce, ct, c.getAuthTag()]).toString('base64')
}
// null kalau kunci salah (tag GCM tidak cocok) atau blob rusak
function open(key, blob) {
  const b = Buffer.from(blob, 'base64')
  if (b.length < 16 + 16 + 16) return null
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(16, 32))
  d.setAAD(b.subarray(0, 16))
  d.setAuthTag(b.subarray(b.length - 16))
  try { return Buffer.concat([d.update(b.subarray(32, b.length - 16)), d.final()]).toString('utf8') } catch { return null }
}

function createVault(file) {
  let key = null, salt = null, data = null
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'))
  const saltOf = blob => Buffer.from(Buffer.from(blob, 'base64').subarray(0, 16))
  // tulis ke file sementara lalu rename: brankas tidak pernah setengah tertulis kalau app mati di tengah jalan
  function write() {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, kdf: 'pbkdf2-sha256', iter: ITER, data: seal(key, salt, JSON.stringify(data)) }), { mode: 0o600 })
    fs.renameSync(tmp, file)
  }
  function useKey(k, blob) {
    const plain = open(k, blob)
    if (plain === null) return false
    key = k; salt = saltOf(blob); data = JSON.parse(plain)
    data.entries ||= []; data.never ||= []
    return true
  }
  return {
    exists: () => fs.existsSync(file),
    unlocked: () => !!key,
    get data() { return data },
    setup(password) {
      if (fs.existsSync(file)) throw new Error('Vault already exists')
      salt = crypto.randomBytes(16); key = derive(password, salt); data = { entries: [], never: [] }
      write()
    },
    unlock(password) {
      const f = read()
      return useKey(derive(password, saltOf(f.data), f.iter), f.data)
    },
    unlockWithKey: k => useKey(k, read().data), // Touch ID: kunci turunan disimpan terenkripsi oleh safeStorage
    key: () => key && Buffer.from(key),
    save: write,
    lock() { key?.fill(0); key = null; salt = null; data = null },
    changePassword(oldPassword, newPassword) {
      const f = read()
      const k = derive(oldPassword, saltOf(f.data), f.iter)
      if (open(k, f.data) === null) return false
      salt = crypto.randomBytes(16); key = derive(newPassword, salt)
      write()
      return true
    },
  }
}

// password acak dari CSPRNG; selalu berisi huruf kecil, besar, angka, simbol
function generate(length = 20) {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+?']
  const all = sets.join('')
  for (;;) {
    const pw = Array.from({ length }, () => all[crypto.randomInt(all.length)]).join('')
    if (sets.every(s => [...pw].some(c => s.includes(c)))) return pw
  }
}

// CSV: format Apple Passwords/Keychain (Title,URL,Username,Password,Notes,OTPAuth) dan Chrome/Brave/Edge (name,url,username,password,note)
function parseCsv(text) {
  const rows = [[]]
  let field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') q = false; else field += c; continue }
    if (c === '"') q = true
    else if (c === ',') { rows.at(-1).push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; rows.at(-1).push(field); field = ''; rows.push([]) }
    else field += c
  }
  rows.at(-1).push(field)
  const [head, ...body] = rows.filter(r => r.some(Boolean))
  if (!head) return []
  const col = name => head.findIndex(h => h.trim().toLowerCase() === name)
  const iu = col('url') >= 0 ? col('url') : col('website'), in_ = col('username'), ip = col('password')
  if (iu < 0 || ip < 0) throw new Error('CSV needs url and password columns')
  const opt = (r, ...names) => { for (const n of names) { const i = col(n); if (i >= 0 && r[i]) return r[i] } return '' }
  return body.map(r => ({ url: r[iu], username: in_ >= 0 ? r[in_] : '', password: r[ip], title: opt(r, 'title', 'name'), notes: opt(r, 'notes', 'note'), otp: opt(r, 'otpauth') }))
    .filter(r => r.url && r.password)
}
// ekspor dengan kolom yang sama seperti Apple Passwords (File > Export Passwords), bisa diimpor balik ke Passwords.app / Chrome
function toCsv(entries) {
  const cell = v => /[",\r\n]/.test(v = String(v ?? '')) ? '"' + v.replace(/"/g, '""') + '"' : v
  return ['Title,URL,Username,Password,Notes,OTPAuth', ...entries.map(e => [e.title || new URL(e.origin).hostname, e.origin, e.username, e.password, e.notes, e.otp].map(cell).join(','))].join('\n') + '\n'
}

module.exports = { createVault, generate, parseCsv, toCsv, seal, open, derive }
