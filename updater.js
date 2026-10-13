// Update dari dalam app tanpa Apple Developer ID (Squirrel.Mac/electron-updater butuh itu).
// Rilis berisi almac-update.json + .sig: manifest ditandatangani Ed25519 dengan kunci pribadi pemilik repo
// (~/.almac/update-key.pem, lihat scripts/release.js). App hanya memasang zip yang hash SHA-512-nya ada di manifest
// bertanda tangan sah -> akun GitHub yang dibobol pun tidak bisa mengirim update palsu.
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawn } = require('child_process')

const REPO = 'Alianama/almac-browser'
// ALMAC_UPDATE_URL: feed lain untuk tes (tetap wajib bertanda tangan kunci di bawah)
const FEED = process.env.ALMAC_UPDATE_URL
const LATEST = FEED || `https://github.com/${REPO}/releases/latest/download/`
const fileUrl = (version, name) => FEED ? FEED + encodeURIComponent(name) : `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(name)}`
const PUBLIC_KEY = crypto.createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAXxYynRD5E9YcHDGEK5YOBMwCt0UJPvmoLwSsIsMzsQg=
-----END PUBLIC KEY-----`)

// 1.10.0 > 1.9.2; prerelease tidak dipakai
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}
const verifyManifest = (json, sigB64) => crypto.verify(null, Buffer.from(json), PUBLIC_KEY, Buffer.from(sigB64.trim(), 'base64'))

function createUpdater({ app, onChange }) {
  const s = { status: 'idle', version: '', notes: '', progress: 0, error: '' }
  let manifest = null, staged = null
  const set = patch => { Object.assign(s, patch); onChange({ ...s }) }
  // bundel .app yang sedang berjalan: .../Almac Browser.app/Contents/MacOS/Almac Browser
  const bundle = () => path.resolve(process.execPath, '../../..')
  function cannotUpdate() {
    if (!app.isPackaged) return 'Development build: updates are installed with git pull.'
    if (process.platform !== 'darwin') return 'In-app updates are macOS only.'
    if (/AppTranslocation|^\/Volumes\//.test(bundle())) return 'Move Almac Browser to the Applications folder first, then reopen it.'
    try { fs.accessSync(path.dirname(bundle()), fs.constants.W_OK) } catch { return `No permission to replace the app in ${path.dirname(bundle())}.` }
    return ''
  }

  async function check({ manual } = {}) {
    if (['checking', 'downloading', 'ready'].includes(s.status)) return
    const blocked = cannotUpdate()
    if (blocked) return manual && set({ status: 'error', error: blocked })
    set({ status: 'checking', error: '' })
    try {
      const get = async name => { const r = await fetch(LATEST + name, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.text() }
      const [json, sig] = await Promise.all([get('almac-update.json'), get('almac-update.json.sig')])
      if (!verifyManifest(json, sig)) throw new Error('Update signature is invalid. The update was refused.')
      const m = JSON.parse(json)
      if (!newer(m.version, app.getVersion())) return set({ status: manual ? 'latest' : 'idle' })
      if (!m.files?.[process.arch]) throw new Error(`No ${process.arch} build in this release.`)
      manifest = m
      let notes = ''
      if (!FEED) try { notes = (await (await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${m.version}`, { signal: AbortSignal.timeout(10000) })).json()).body || '' } catch {}
      set({ status: 'available', version: m.version, notes: notes.slice(0, 4000) })
    } catch (e) {
      set({ status: manual ? 'error' : 'idle', error: e.message })
    }
  }

  async function download() {
    if (s.status !== 'available' || !manifest) return
    const f = manifest.files[process.arch]
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'almac-update-'))
    const zip = path.join(dir, 'update.zip')
    try {
      set({ status: 'downloading', progress: 0 })
      const r = await fetch(fileUrl(manifest.version, f.name))
      if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`)
      const hash = crypto.createHash('sha512'), out = fs.createWriteStream(zip)
      let got = 0, last = 0
      for await (const chunk of r.body) {
        hash.update(chunk); out.write(chunk); got += chunk.length
        if (got > f.size) throw new Error('Download is larger than expected.')
        if (Date.now() - last > 200) { last = Date.now(); set({ progress: got / f.size }) }
      }
      await new Promise((res, rej) => out.end(err => err ? rej(err) : res()))
      if (got !== f.size || hash.digest('base64') !== f.sha512) throw new Error('Downloaded file does not match the signed checksum. The update was refused.')
      // ditto: ekstrak bundel macOS apa adanya (symlink framework, izin eksekusi, tanda tangan)
      await new Promise((res, rej) => execFile('/usr/bin/ditto', ['-x', '-k', zip, dir], e => e ? rej(e) : res()))
      const appDir = fs.readdirSync(dir).find(n => n.endsWith('.app'))
      if (!appDir) throw new Error('Update archive has no app inside.')
      staged = { dir, app: path.join(dir, appDir) }
      set({ status: 'ready', progress: 1 })
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true })
      set({ status: 'error', error: e.message })
    }
  }

  // ganti bundel setelah app keluar: skrip kecil menunggu PID ini selesai, menukar app lama dengan yang baru, lalu membuka lagi.
  // path dikirim sebagai argumen ($1..$4), bukan disisipkan ke teks skrip.
  function install() {
    if (s.status !== 'ready' || !staged) return
    const target = bundle(), backup = target + '.old'
    const script = `
      while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
      rm -rf "$4"
      if mv "$3" "$4" && mv "$2" "$3"; then rm -rf "$4"; else rm -rf "$3"; mv "$4" "$3"; fi
      rm -rf "$5"
      open "$3"`
    spawn('/bin/sh', ['-c', script, 'almac-update', String(process.pid), staged.app, target, backup, staged.dir], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
  }

  return { check, download, install, get: () => ({ ...s }) }
}

module.exports = { createUpdater, newer, verifyManifest }
