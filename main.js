const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, dialog, clipboard, shell, screen, safeStorage, systemPreferences, powerMonitor, desktopCapturer } = require('electron')
const os = require('os')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store')
const { ElectronBlocker } = require('@ghostery/adblocker-electron')
const { getDomain } = require('tldts-experimental')
const passwords = require('./passwords')
const { createUpdater } = require('./updater')

app.setName('Almac Browser')
app.setAboutPanelOptions({ applicationName: 'Almac Browser', applicationVersion: app.getVersion(), iconPath: path.join(__dirname, 'build', 'icon.png') })
if (process.env.ALMAC_TEST_DATA) app.setPath('userData', process.env.ALMAC_TEST_DATA) // tes: folder data terpisah
// Satu instance saja: dua instance di folder data yang sama bisa merusak database (cookies, service worker)
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
const DATA = app.getPath('userData')
const STATE_FILE = path.join(DATA, 'state.json')
const HISTORY_FILE = path.join(DATA, 'history.json')
const HISTORY_MAX = 20000
const BOOKMARKS_FILE = path.join(DATA, 'bookmarks.json')
const DOWNLOADS_FILE = path.join(DATA, 'downloads.json')
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const SIDEBAR = 248 // lebar awal sidebar; bisa diubah dengan menyeret (state.sidebar.width)
const SIDEBAR_MIN = 236, SIDEBAR_MAX = 420 // min: muat tombol jendela + logo + 5 tombol status
const PAGE_MIN = 360 // halaman selalu punya ruang minimal ini; sidebar mengecil kalau jendela sempit
const GAP = 10 // samakan dengan --gap
// mesin pencari (Pengaturan). suggest: endpoint OpenSearch milik mesin itu sendiri -> ketikan tidak bocor ke mesin lain
const ENGINES = {
  google: { name: 'Google', search: 'https://www.google.com/search?q=', home: 'https://www.google.com', suggest: 'https://suggestqueries.google.com/complete/search?client=chrome&ie=utf-8&oe=utf-8&q=' },
  duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=', home: 'https://duckduckgo.com', suggest: 'https://duckduckgo.com/ac/?type=list&q=' },
  bing: { name: 'Bing', search: 'https://www.bing.com/search?q=', home: 'https://www.bing.com', suggest: 'https://api.bing.com/osjson.aspx?query=' },
  brave: { name: 'Brave Search', search: 'https://search.brave.com/search?q=', home: 'https://search.brave.com', suggest: 'https://search.brave.com/api/suggest?q=' },
  startpage: { name: 'Startpage', search: 'https://www.startpage.com/do/search?q=', home: 'https://www.startpage.com' },
  ecosia: { name: 'Ecosia', search: 'https://www.ecosia.org/search?q=', home: 'https://www.ecosia.org', suggest: 'https://ac.ecosia.org/autocomplete?type=list&q=' },
}
const engine = () => ENGINES[state.searchEngine] || ENGINES.google

// UA tanpa "Electron/..." supaya login Google & Chrome Web Store mau menerima
const UA = app.userAgentFallback.replace(/ (?!Chrome|Safari|AppleWebKit)[\w-]+\/[\d.]+/g, '')
app.userAgentFallback = UA
// Login Google ("This browser or app may not be secure"): Google menolak identitas yang tidak konsisten/menyamar.
// Panduan Google: browser harus mengidentifikasi diri dengan jelas di accounts.google.com. Jadi di sana kirim UA
// Chromium jujur + token Electron (seperti UA bawaan Electron, tanpa nama app) & Client Hints asli; situs lain UA Chrome.
// Referensi: nightly-labs/openbot PR #1711 (identifier check gagal tanpa token Electron),
// developers.googleblog.com "guidance-to-developers-affected-by-our-effort-to-block-less-secure-browsers..."
const GOOGLE_LOGIN_UA = UA.replace(' Safari/', ` Electron/${process.versions.electron} Safari/`)
const isGoogleLogin = url => /^https:\/\/accounts\.google\.com\//.test(url)

// ponytail: electron-chrome-extensions tidak menangani EPIPE saat host native messaging (mis. iCloud Passwords)
// langsung keluar -> seluruh app crash. Abaikan EPIPE saja; hapus kalau library sudah memperbaikinya.
process.on('uncaughtException', e => {
  if (e.code === 'EPIPE') return console.warn('native messaging host tertutup:', e.message)
  console.error(e)
  dialog.showErrorBox('Almac Browser error', e.stack || String(e))
})

let win, blocker, updater
let state = { profiles: [], activeProfile: null, tabs: [], theme: 'system', extPrefs: {}, sitePerms: {}, sidebar: { mode: 'pinned', width: SIDEBAR }, bookmarkBar: true, favicons: {}, searchEngine: 'google', newTabPage: 'almac', sleepAfter: 10, zoom: {}, splitRatio: {}, customDns: '', dnsMode: 'auto', blockJavaScript: false, cookiePolicy: 'allow', doNotTrack: false, hardwareAcceleration: true, httpsOnly: true, stripTracking: true, privateWipeAfter: 0, stats: {}, pwLockAfter: 15, pwTouchId: false, pet: { out: true }, tabsEaten: 0, focus: { until: 0, sites: ['youtube.com', 'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'reddit.com'] } } // splitRatio: grup split -> rasio panel kiri // sleepAfter: menit, 0 = tidak pernah // tabs: {id, profileId, url, title, favicon, lastActive, blocked, view}
const ctx = {} // profileId -> { ses, extensions }
let nextTabId = 1
let modalOpen = false // modal pixel terbuka -> halaman web (native view) disembunyikan
let covered = false   // dropdown bookmark bar terbuka -> halaman diganti snapshot
const BAR_H = 30 // tinggi bookmark bar (samakan dengan --bar-h di theme.css)
let findOpen = false // kotak cari di halaman (⌘F) memakai strip atas yang sama dengan bookmark bar
const barSpace = () => state.bookmarkBar || findOpen ? BAR_H + 6 : 0
let bookmarksVersion = 0 // naik tiap bookmark berubah -> UI ambil ulang isi bookmark bar
const nextOrder = () => bookmarks.reduce((m, b) => Math.max(m, b.order), -1) + 1
let peeking = false   // sidebar tersembunyi sedang muncul sementara (hover tepi kiri) -> halaman diganti snapshot
// lebar sidebar efektif: preferensi user, dibatasi ukuran jendela
const sideWidth = () => {
  const winW = win?.getContentSize()[0] || 1280
  return Math.max(SIDEBAR_MIN, Math.min(state.sidebar.width, SIDEBAR_MAX, winW - PAGE_MIN - GAP * 2))
}
const sideSpace = () => state.sidebar.mode === 'pinned' ? sideWidth() : 0 // ruang sidebar di kiri halaman
const certs = new Map() // "profileId|hostname" -> sertifikat terakhir yang diverifikasi Chromium
const closedTabs = [] // tab yang baru ditutup (⌘⇧T), maks 20, hanya selama sesi
const httpAllowed = new Set() // host yang boleh http setelah user setuju (HTTPS-Only), hanya selama sesi
const upgraded = new Set() // url https hasil upgrade otomatis -> kalau gagal dimuat, tawarkan versi http
const certAllowed = new Map() // host -> fingerprint sertifikat tidak valid yang user izinkan ("Proceed anyway"), hanya selama sesi
// Electron tidak punya halaman error: halaman gagal = layar putih. Almac menampilkan halaman error sendiri (UI) & menyembunyikan view-nya.
const CERT_TEXT = {
  'net::ERR_CERT_AUTHORITY_INVALID': 'The certificate is not issued by a trusted authority (self-signed or company certificate).',
  'net::ERR_CERT_DATE_INVALID': 'The certificate has expired or is not valid yet.',
  'net::ERR_CERT_COMMON_NAME_INVALID': 'The certificate belongs to a different site name.',
  'net::ERR_CERT_REVOKED': 'The certificate has been revoked.',
}
function setLoadError(t, err) {
  clearTimeout(t.httpsTimer)
  t.loadError = err
  if (t === activeTab() || isShown(t)) layout()
  render(true)
}
let privSeen = 0 // terakhir kali profil privat aktif (hapus otomatis)
const focusOn = () => state.focus.until > Date.now()
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
const isLocalHost = h => h === 'localhost' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)
// parameter pelacak di URL (utm_*, fbclid, ...) dibuang sebelum halaman dimuat
const TRACK_PARAM = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_eid|mc_cid|igshid|_hsenc|_hsmi|mkt_tok|twclid|ttclid|si)$/i
function cleanUrl(url) {
  const u = new URL(url)
  if (!u.search) return url
  let changed = false
  for (const k of [...u.searchParams.keys()]) if (TRACK_PARAM.test(k) && !(k === 'si' && !/(youtube|youtu\.be|spotify)/.test(u.hostname))) { u.searchParams.delete(k); changed = true }
  return changed ? u.toString() : url
}
// pihak ketiga = domain request beda dengan domain halaman tab
const thirdParty = d => {
  if (d.resourceType === 'mainFrame') return false
  const top = d.webContents?.getURL()
  if (!top) return false
  return (getDomain(hostOf(d.url)) || hostOf(d.url)) !== (getDomain(hostOf(top)) || hostOf(top))
}
const dropCookies = d => state.cookiePolicy === 'block_all' || (state.cookiePolicy === 'block_third_party' && thirdParty(d))
// ---- Almac Passwords: brankas terenkripsi (lihat passwords.js), satu untuk semua profil seperti Keychain ----
const vault = passwords.createVault(path.join(DATA, 'passwords.vault'))
const TOUCH_FILE = path.join(DATA, 'passwords.touchid') // kunci brankas, dienkripsi safeStorage (kunci di Keychain macOS)
let pwLastUse = 0
const pwTouch = () => { pwLastUse = Date.now() }
// origin yang sama dianggap sama dengan/tanpa www (seperti Keychain); subdomain lain tidak (mis. user.github.io)
const pwOrigin = url => { try { const u = new URL(url); return u.protocol + '//' + u.host.replace(/^www\./, '') } catch { return '' } }
const pwPublic = e => ({ id: e.id, origin: e.origin, host: new URL(e.origin).host, username: e.username, title: e.title || '', notes: e.notes || '', hasOtp: !!e.otp, updated: e.updated })
function pwLock() {
  if (!vault.unlocked()) return
  vault.lock()
  render()
}
function pwAfterUnlock() {
  pwTouch()
  activeTab()?.view?.webContents.send('pw-unlocked') // kolom yang sedang difokus langsung menampilkan login
  if (state.pwTouchId && safeStorage.isEncryptionAvailable()) fs.writeFileSync(TOUCH_FILE, safeStorage.encryptString(vault.key().toString('base64')), { mode: 0o600 })
  render(true)
}
function pwUpsert({ id, url, origin, username = '', password, title, notes, otp }) {
  origin = pwOrigin(origin || url)
  if (!origin || !password) throw new Error('URL and password are required')
  const list = vault.data.entries
  const e = (id && list.find(e => e.id === id)) || list.find(e => e.origin === origin && e.username === username)
  const fields = { origin, username, password, ...(title !== undefined && { title }), ...(notes !== undefined && { notes }), ...(otp !== undefined && { otp }), updated: Date.now() }
  e ? Object.assign(e, fields) : list.push({ id: uid('k'), created: Date.now(), ...fields })
}
const pendingPw = new Map() // id -> {origin, username, password} menunggu jawaban user
let pwSeq = 0
function pwOffer(t) {
  const c = t.pendingPw
  t.pendingPw = null
  if (!c || Date.now() - c.ts > 60000 || !win) return
  if (vault.unlocked()) {
    if (vault.data.never.includes(c.origin)) return
    const same = vault.data.entries.find(e => e.origin === c.origin && e.username === c.username)
    if (same?.password === c.password) return
    c.update = !!same
  }
  const id = ++pwSeq
  pendingPw.set(id, c)
  win.webContents.send('pw-save', { id, host: new URL(c.origin).host, username: c.username, update: !!c.update })
}

// ---- picker share screen (dipakai kalau picker sistem macOS tidak tersedia) ----
const pendingScreens = new Map()
let screenSeq = 0
async function pickScreen(request) {
  if (!win) return null
  let host = ''
  try { host = new URL(request.securityOrigin).host } catch {}
  const perm = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true })
  const own = new Set(['Almi', 'Radio'])
  const list = sources.filter(s => !own.has(s.name))
  const id = ++screenSeq
  win.focus()
  win.webContents.send('screen-pick', {
    id, host, permission: perm,
    sources: list.map(s => ({ id: s.id, name: s.name, kind: s.id.startsWith('screen') ? 'screen' : 'window',
      thumb: s.thumbnail.isEmpty() ? '' : 'data:image/jpeg;base64,' + s.thumbnail.toJPEG(70).toString('base64'),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '' })),
  })
  const chosen = await new Promise(resolve => pendingScreens.set(id, resolve))
  return list.find(s => s.id === chosen) || null
}

// DNS-over-HTTPS berlaku untuk seluruh app (Chromium: satu resolver untuk semua sesi)
// VPN (GlobalProtect, Tailscale, WARP, ...): interface tunnel dengan IPv4. Selama tersambung, DoH dijeda -> DNS sistem/VPN
// (DNS internal kantor tidak dikenal DoH publik & VPN sering memblokir DoH -> tanpa ini tidak bisa internetan).
const vpnActive = () => Object.entries(os.networkInterfaces()).some(([name, addrs]) =>
  /^(utun|gpd|ppp|ipsec|tun|tap|wg)/i.test(name) && addrs.some(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')))
let dnsVpn = null
function applyDns() {
  const url = /^https:\/\//.test(state.customDns || '') ? state.customDns : ''
  dnsVpn = vpnActive()
  if (state.dnsMode === 'doh' && url && !dnsVpn) app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: [url] })
  else app.configureHostResolver({ secureDnsMode: state.dnsMode === 'off' ? 'off' : 'automatic' })
  for (const c of Object.values(ctx)) c.ses.clearHostResolverCache().catch(() => {}) // jawaban DNS lama jangan dipakai lagi
}
function watchVpn() {
  if (vpnActive() === dnsVpn) return
  applyDns()
  if (state.dnsMode === 'doh') win?.webContents.send('toast', dnsVpn ? 'VPN connected: DNS-over-HTTPS paused so company sites work' : 'VPN disconnected: DNS-over-HTTPS is back on')
  render()
}

// ---- izin situs (seperti Chrome: tanya dulu, bisa diingat per situs) ----
const PERM_KIND = { geolocation: 'geolocation', notifications: 'notifications', 'clipboard-read': 'clipboard', openExternal: 'openExternal' }
const PERM_DENY = new Set(['hid', 'serial', 'usb', 'midiSysex']) // akses perangkat: tolak
const permKinds = (permission, mediaTypes) => permission === 'media'
  ? [...new Set((mediaTypes || []).map(t => t === 'video' ? 'camera' : t === 'audio' ? 'microphone' : null))].filter(Boolean)
  : PERM_KIND[permission] ? [PERM_KIND[permission]] : []
const sitePermsOf = (profileId, origin) => state.sitePerms[profileId]?.[origin] || {}
const pendingPerms = new Map()
let permSeq = 0
function askPermission(profileId, origin, kinds) {
  if (!win) return Promise.resolve(false)
  return new Promise(resolve => {
    const id = ++permSeq
    pendingPerms.set(id, { resolve, profileId, origin, kinds })
    win.webContents.send('perm-request', { id, host: new URL(origin).host, kinds })
  })
}
async function onPermissionRequest(profileId, permission, details) {
  if (PERM_DENY.has(permission)) return false
  const kinds = permKinds(permission, details.mediaTypes)
  if (!kinds.length) return true // izin ringan (fullscreen, dsb.) tetap diizinkan seperti bawaan Electron
  let origin
  try { origin = new URL(details.requestingUrl).origin } catch { return false }
  const saved = sitePermsOf(profileId, origin)
  if (kinds.some(k => saved[k] === 'block')) return false
  if (kinds.every(k => saved[k] === 'allow')) return true
  return askPermission(profileId, origin, kinds)
}
const SITE_STORAGES = ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache', 'websql']
let history = [] // {url, title, ts, n (jumlah kunjungan), p (profileId)}
// link: {id, url, title, path, order, ts, p}; folder: {id, folder: true, title, path, order, p}
// path = folder induk, mis. ['Kerja', 'Tools']; [] = langsung di bookmark bar
let bookmarks = []
// unduhan: {id, filename, path, url, total, received, state: progressing|paused|completed|cancelled|interrupted, ts, p}
let downloads = []
const liveDownloads = new Map() // id -> DownloadItem (hanya selama sesi)
let downloadsVersion = 0, downloadTimer

function load() {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } } catch {}
  if (typeof state.pet !== 'object' || !state.pet) state.pet = { out: state.pet !== false } // dulu boolean
  if (!state.profiles.length) state.profiles.push({ id: 'p1', name: 'Personal', color: '#41a6f6' })
  if (!state.profiles.some(p => p.id === state.activeProfile)) state.activeProfile = state.profiles[0].id
  state.profiles.forEach(workspaces)
  state.tabs = state.tabs.map(t => ({
    ...t, id: nextTabId++, view: null, blocked: 0, // dipulihkan dalam kondisi tidur
    wsId: profileOf(t.profileId)?.workspaces.some(w => w.id === t.wsId) ? t.wsId : profileOf(t.profileId)?.workspaces[0].id,
  }))
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) } catch {}
  try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8')) } catch {}
  try { downloads = JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf8')).map(d => d.state === 'progressing' || d.state === 'paused' ? { ...d, state: 'interrupted' } : d) } catch {}
  bookmarks.forEach((b, i) => { if (typeof b.folder === 'string') { b.path = b.folder ? b.folder.split(' / ') : []; delete b.folder } b.path ||= []; b.order ??= i }) // format lama
}

const uid = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const hostOf = url => { try { return new URL(url).hostname } catch { return '' } }
const profileOf = id => state.profiles.find(p => p.id === id)
// ikon emoji versi lama -> ikon Lucide animasi
const EMOJI_ICON = {
  '💼': 'briefcase', '🏠': 'house', '💻': 'laptop', '🎮': 'gamepad', '📚': 'book-open', '🎓': 'graduation-cap', '🎵': 'music',
  '🎬': 'clapperboard', '🛒': 'shopping-cart', '🎨': 'palette', '✈️': 'plane', '💡': 'lightbulb', '☕': 'coffee', '⭐': 'star',
  '🔥': 'flame', '🌙': 'moon', '❤️': 'heart',
}
// tiap profil punya workspace (grup tab), minimal satu
function workspaces(p) {
  if (!p.workspaces?.length) p.workspaces = [{ id: uid('w'), name: 'Main' }]
  p.workspaces.forEach(w => { if (EMOJI_ICON[w.icon]) w.icon = EMOJI_ICON[w.icon] })
  if (!p.workspaces.some(w => w.id === p.activeWs)) p.activeWs = p.workspaces[0].id
  return p.workspaces
}
const activeWs = (profileId = state.activeProfile) => profileOf(profileId).activeWs

let historyTimer
function saveHistory() {
  clearTimeout(historyTimer)
  historyTimer = setTimeout(() => fs.writeFile(HISTORY_FILE, JSON.stringify(history), () => {}), 2000)
}

function downloadsChanged() { // progres sering berubah -> simpan & render dibatasi
  downloadsVersion++
  if (downloadTimer) return
  downloadTimer = setTimeout(() => {
    downloadTimer = null
    downloads = downloads.slice(-200)
    const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
    fs.writeFile(DOWNLOADS_FILE, JSON.stringify(downloads.filter(d => !priv.has(d.p))), () => {})
    render()
  }, 300)
}
function uniquePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext)
  let p = path.join(dir, name)
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`)
  return p
}

let bookmarkTimer
function saveBookmarks() {
  bookmarksVersion++
  clearTimeout(bookmarkTimer)
  bookmarkTimer = setTimeout(() => fs.writeFile(BOOKMARKS_FILE, JSON.stringify(bookmarks), () => {}), 1000)
}
const isBookmarked = (profileId, url) => bookmarks.some(b => b.p === profileId && !b.folder && b.url === url)
const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const startsWith = (path, prefix) => prefix.every((x, i) => path[i] === x)

// ---- import dari browser Chromium lain di perangkat ini (Chrome, Brave, Edge, Arc, Vivaldi) ----
const CHROMIUM_BROWSERS = {
  chrome: ['Google Chrome', 'Google/Chrome'], brave: ['Brave', 'BraveSoftware/Brave-Browser'], edge: ['Microsoft Edge', 'Microsoft Edge'],
  arc: ['Arc', 'Arc/User Data'], vivaldi: ['Vivaldi', 'Vivaldi'], chromium: ['Chromium', 'Chromium'],
}
const browserDir = key => path.join(app.getPath('appData'), CHROMIUM_BROWSERS[key][1])
const chromeTime = t => Math.round(Number(t) / 1000 - 11644473600000) // date_added bookmark (string mikrodetik sejak 1601) -> ms unix

function importSources() {
  const out = []
  for (const [key, [label]] of Object.entries(CHROMIUM_BROWSERS)) {
    let profiles
    try { profiles = JSON.parse(fs.readFileSync(path.join(browserDir(key), 'Local State'), 'utf8')).profile?.info_cache } catch { continue }
    for (const [dir, info] of Object.entries(profiles || {})) {
      const has = f => fs.existsSync(path.join(browserDir(key), dir, f))
      if (has('Bookmarks') || has('History')) out.push({ browser: key, label, dir, name: info.name, email: info.user_name || '', bookmarks: has('Bookmarks'), history: has('History') })
    }
  }
  return out
}

async function importRun({ browser, dir, bookmarks: wantBookmarks, history: wantHistory }) {
  // hanya profil yang memang terdeteksi (jangan baca path sembarang dari UI)
  if (!importSources().some(s => s.browser === browser && s.dir === dir)) throw new Error('Unknown import source')
  const base = path.join(browserDir(browser), dir)
  const label = CHROMIUM_BROWSERS[browser][0]
  const profileId = state.activeProfile
  const result = { bookmarks: 0, history: 0 }

  if (wantBookmarks && fs.existsSync(path.join(base, 'Bookmarks'))) {
    const roots = JSON.parse(fs.readFileSync(path.join(base, 'Bookmarks'), 'utf8')).roots
    const have = new Set(bookmarks.filter(b => b.p === profileId).map(b => b.url))
    let order = nextOrder()
    const walk = (node, folderPath) => {
      if (node.type === 'url') {
        if (have.has(node.url)) return
        have.add(node.url)
        bookmarks.push({ id: uid('b'), url: node.url, title: node.name, path: folderPath, order: order++, ts: chromeTime(node.date_added) || Date.now(), p: profileId })
        result.bookmarks++
      } else {
        // folder ikut disimpan (folder kosong & urutan tetap terjaga), kecuali sudah ada
        if (!bookmarks.some(b => b.p === profileId && b.folder && b.title === node.name && samePath(b.path, folderPath)))
          bookmarks.push({ id: uid('f'), folder: true, title: node.name, path: folderPath, order: order++, p: profileId })
        for (const child of node.children || []) walk(child, [...folderPath, node.name])
      }
    }
    // struktur & urutan asli: isi "Bookmarks bar" -> bookmark bar Almac, lainnya ke folder sendiri
    for (const child of roots.bookmark_bar?.children || []) walk(child, [])
    for (const child of roots.other?.children || []) walk(child, ['Bookmark lain'])
    for (const child of roots.synced?.children || []) walk(child, ['Bookmark seluler'])
    saveBookmarks()
  }

  if (wantHistory && fs.existsSync(path.join(base, 'History'))) {
    // DB terkunci saat browser sumber berjalan -> salin dulu, file asli tidak disentuh
    const tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'almac-import-'))
    try {
      for (const f of ['History', 'History-wal', 'History-journal']) if (fs.existsSync(path.join(base, f))) fs.copyFileSync(path.join(base, f), path.join(tmp, f))
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(path.join(tmp, 'History'))
      // waktu Chrome (mikrodetik sejak 1601) terlalu besar untuk number JS -> konversi ke ms unix di SQL
      const rows = db.prepare('SELECT url, title, visit_count, (last_visit_time / 1000 - 11644473600000) AS ts FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?').all(HISTORY_MAX)
      db.close()
      const mine = new Map(history.filter(h => h.p === profileId).map(h => [h.url, h]))
      for (const r of rows) {
        if (!/^https?:/.test(r.url)) continue
        const ts = r.ts, h = mine.get(r.url)
        if (h) { h.ts = Math.max(h.ts, ts); h.n += r.visit_count; h.title ||= r.title; continue }
        const entry = { url: r.url, title: r.title, ts, n: r.visit_count, p: profileId }
        history.push(entry); mine.set(r.url, entry); result.history++
      }
      if (history.length > HISTORY_MAX) history = history.sort((a, b) => b.ts - a.ts).slice(0, HISTORY_MAX)
      saveHistory()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }
  render(true)
  return result
}

function addHistory(t, visit) {
  if (!/^https?:/.test(t.url) || profileOf(t.profileId)?.ephemeral) return // privat: tidak dicatat
  let h = history.find(h => h.url === t.url && h.p === t.profileId)
  if (!h) { h = { url: t.url, title: '', ts: 0, n: 0, p: t.profileId }; history.push(h) }
  h.title = t.title || h.title
  h.ts = Date.now()
  if (visit) h.n++
  if (history.length > HISTORY_MAX) history = history.sort((a, b) => b.ts - a.ts).slice(0, HISTORY_MAX)
  saveHistory()
}

let renderTimer
function render(now) {
  if (now === true) { clearTimeout(renderTimer); renderTimer = null; return flush() }
  if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; flush() }, 100)
}
function flush() {
  if (!win) return // jendela sudah ditutup (saat keluar app)
  const active = activeTab()
  win.webContents.send('state', {
    profiles: state.profiles,
    activeProfile: state.activeProfile,
    workspaces: profileOf(state.activeProfile).workspaces.map(w => ({
      ...w, tabs: state.tabs.filter(t => t.profileId === state.activeProfile && t.wsId === w.id).length,
    })),
    activeWs: activeWs(),
    accent: profileOf(state.activeProfile).workspaces.find(w => w.id === activeWs())?.color || profileOf(state.activeProfile).color,
    tabs: state.tabs.filter(t => t.profileId === state.activeProfile && t.wsId === activeWs()).sort((a, b) => !!b.pinned - !!a.pinned).map(t => ({
      id: t.id, title: t.title || t.url || 'New tab', url: t.url, split: !!t.group, favicon: t.favicon, sleeping: !t.view, active: t === active,
      pinned: !!t.pinned, atPin: !t.pinned || t.url === t.pinUrl,
    })),
    url: active?.url || active?.loadError?.url || '',
    loadError: active?.loadError || null,
    security: security(active),
    bookmarked: !!active && isBookmarked(active.profileId, active.url),
    blocked: active?.blocked || 0,
    adblock: !!blocker,
    theme: state.theme,
    sidebar: { ...state.sidebar, width: sideWidth() },
    bookmarkBar: state.bookmarkBar,
    split: (() => { const v = visibleTabs(); return v.length === 2 ? { ratio: state.splitRatio[v[0].group] ?? 0.5, activeSide: v.indexOf(activeTab()) } : null })(),
    zoom: Math.round((state.zoom[hostOf(active?.url)] || 1) * 100),
    downloadsVersion, downloadsActive: downloads.filter(d => d.state === 'progressing').length,
    searchEngine: state.searchEngine, engineName: engine().name, newTabPage: state.newTabPage, sleepAfter: state.sleepAfter,
    engines: Object.entries(ENGINES).map(([id, e]) => ({ id, name: e.name })),
    bookmarksVersion: bookmarksVersion + '|' + state.activeProfile,
    extensions: extList(state.activeProfile),
    customDns: state.customDns || '', dnsMode: state.dnsMode || 'auto', dnsPausedForVpn: state.dnsMode === 'doh' && !!dnsVpn,
    blockJavaScript: !!state.blockJavaScript, cookiePolicy: state.cookiePolicy || 'allow',
    doNotTrack: !!state.doNotTrack, hardwareAcceleration: state.hardwareAcceleration !== false,
    music: !!musicWin,
    httpsOnly: state.httpsOnly, stripTracking: state.stripTracking, privateWipeAfter: state.privateWipeAfter,
    focusUntil: focusOn() ? state.focus.until : 0, focusSites: state.focus.sites,
    canReopen: closedTabs.length > 0,
    allSleeping: !state.tabs.some(t => t.view),
    blockedToday: state.stats[dayKey()] || 0,
    appVersion: app.getVersion(), pet: { out: !!state.pet.out }, tabsEaten: state.tabsEaten || 0, update: updater?.get() || { status: 'idle' },
    pw: { setup: vault.exists(), unlocked: vault.unlocked(), touchId: state.pwTouchId && fs.existsSync(TOUCH_FILE), canTouchId: process.platform === 'darwin' && systemPreferences.canPromptTouchID?.() && safeStorage.isEncryptionAvailable(), lockAfter: state.pwLockAfter },
  })
  const petState = JSON.stringify({ sleeping: !state.tabs.some(t => t.view), today: state.stats[dayKey()] || 0 })
  if (petWin && petState !== petSent) { petSent = petState; petWin.webContents.send('pet-state', JSON.parse(petState)) }
  // profil privat tidak pernah ditulis ke disk
  const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
  const tabs = state.tabs.filter(t => !priv.has(t.profileId)).map(({ profileId, wsId, url, title, favicon, lastActive, group, pinned, pinUrl }) => ({ profileId, wsId, url, title, favicon, lastActive, group, pinned, pinUrl }))
  const profiles = state.profiles.filter(p => !p.ephemeral)
  const sitePerms = Object.fromEntries(Object.entries(state.sitePerms).filter(([id]) => !priv.has(id)))
  const activeProfile = priv.has(state.activeProfile) ? profiles[0]?.id : state.activeProfile
  fs.writeFile(STATE_FILE, JSON.stringify({ ...state, tabs, profiles, sitePerms, activeProfile }), () => {})
}

// ikon di kolom alamat: secure (https), insecure (http), neutral (internal/kosong)
function security(t) {
  if (!t?.url) return 'neutral'
  if (t.url.startsWith('http:')) return 'insecure'
  if (!t.url.startsWith('https:')) return 'neutral'
  // sertifikat tidak valid sudah ditolak Electron, jadi https yang termuat = aman kecuali tercatat gagal verifikasi
  const cert = certs.get(t.profileId + '|' + t.url.split('/')[2]?.split(':')[0])
  return !cert || cert.result === 'net::OK' ? 'secure' : 'insecure'
}

function profileCtx(profileId) {
  if (ctx[profileId]) return ctx[profileId]
  // profil privat: partisi tanpa "persist:" = hanya di memori, hilang saat ditutup / app keluar
  const ses = session.fromPartition(profileOf(profileId)?.ephemeral ? 'private-' + profileId : 'persist:' + profileId)
  ses.setUserAgent(UA)
  ses.setSpellCheckerEnabled(false)
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'media-preload.js') }) // widget musik
  if (!profileOf(profileId)?.ephemeral) ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'password-preload.js') }) // privat: tanpa autofill/simpan
  // navigasi + XHR/fetch: login Google = UA dengan token Electron (Client Hints asli tetap dikirim);
  // situs lain tidak diubah, kecuali dipastikan kembali ke UA Chrome setelah keluar dari halaman login
  // + Do Not Track / Global Privacy Control, + kebijakan cookie (header Cookie dibuang)
  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const login = isGoogleLogin(details.url)
    const fixUa = (login || details.requestHeaders['User-Agent'] === GOOGLE_LOGIN_UA) && ['mainFrame', 'subFrame', 'xhr'].includes(details.resourceType)
    const noCookie = 'Cookie' in details.requestHeaders && dropCookies(details)
    if (!fixUa && !noCookie && !state.doNotTrack) return callback({}) // jalur cepat: tidak diubah
    const headers = { ...details.requestHeaders }
    if (fixUa) headers['User-Agent'] = login ? GOOGLE_LOGIN_UA : UA
    if (noCookie) delete headers.Cookie
    if (state.doNotTrack) { headers.DNT = '1'; headers['Sec-GPC'] = '1' }
    callback({ requestHeaders: headers })
  })
  // catat sertifikat untuk Info Situs; -3 = pakai hasil verifikasi Chromium apa adanya
  ses.setCertificateVerifyProc((req, cb) => {
    const c = req.certificate
    certs.set(profileId + '|' + req.hostname, {
      subject: c.subject.commonName, subjectOrg: c.subject.organizations.join(', '),
      issuer: c.issuer.commonName, issuerOrg: c.issuer.organizations.join(', '),
      validStart: c.validStart, validExpiry: c.validExpiry, fingerprint: c.fingerprint, serial: c.serialNumber,
      result: req.verificationResult, knownRoot: req.isIssuedByKnownRoot,
    })
    cb(-3)
  })
  ses.setPermissionRequestHandler((wc, permission, callback, details) => { onPermissionRequest(profileId, permission, details).then(callback) })
  // share screen (Meet, Zoom, Teams, ...): tanpa handler ini getDisplayMedia selalu ditolak Electron.
  // macOS 15+: picker bawaan sistem (handler tidak dipanggil); selain itu picker Almac.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickScreen(request).then(src => callback(src ? { video: src } : null)).catch(e => { console.error('share screen:', e); callback(null) })
  }, { useSystemPicker: true })
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (PERM_DENY.has(permission)) return false
    const kinds = permKinds(permission, details.mediaType ? [details.mediaType] : [])
    if (!kinds.length) return true
    let origin
    try { origin = new URL(requestingOrigin).origin } catch { return false }
    return kinds.every(k => sitePermsOf(profileId, origin)[k] === 'allow')
  })
  if (blocker) {
    // ponytail: Ghostery mendaftarkan handler IPC global per sesi -> sesi kedua error. Handler-nya sama, jadi daftar ulang saja.
    ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters')
    ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled')
    blocker.enableBlockingInSession(ses)
  }
  // Electron hanya menerima satu listener per event webRequest -> handler Ghostery dibungkus, bukan ditimpa
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame' && /^https?:/.test(details.url)) {
      const u = new URL(details.url)
      if (focusOn() && state.focus.sites.some(s => u.hostname === s || u.hostname.endsWith('.' + s))) {
        win?.webContents.send('toast', `Focus mode: ${u.hostname} blocked (${Math.ceil((state.focus.until - Date.now()) / 60000)} min left)`)
        return callback({ cancel: true })
      }
      if (state.httpsOnly && u.protocol === 'http:' && !isLocalHost(u.hostname) && !httpAllowed.has(u.hostname)) {
        u.protocol = 'https:'
        upgraded.add(u.toString())
        return callback({ redirectURL: u.toString() })
      }
      if (state.stripTracking) {
        const clean = cleanUrl(details.url)
        if (clean !== details.url) return callback({ redirectURL: clean })
      }
    }
    blocker ? blocker.onBeforeRequest(details, callback) : callback({})
  })
  ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    const h = details.responseHeaders
    const key = h && Object.keys(h).find(k => k.toLowerCase() === 'set-cookie')
    if (key && dropCookies(details)) {
      const responseHeaders = { ...h }
      delete responseHeaders[key]
      return blocker ? blocker.onHeadersReceived({ ...details, responseHeaders }, r => callback({ responseHeaders, ...r })) : callback({ responseHeaders })
    }
    blocker ? blocker.onHeadersReceived(details, callback) : callback({})
  })
  const findTab = wc => state.tabs.find(t => t.view?.webContents === wc)
  const extensions = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab: async d => [newTab(d.url || engine().home, profileId, d.active !== false).view.webContents, win],
    selectTab: wc => { const t = findTab(wc); if (t) selectTab(t) },
    removeTab: wc => { const t = findTab(wc); if (t) closeTab(t) },
    createWindow: async d => { newTab([].concat(d.url || engine().home)[0], profileId); return win },
  })
  ctx[profileId] = { ses, extensions }
  // ponytail: web store selalu memuat semua ekstensi di folder -> yang dinonaktifkan langsung di-unload lagi.
  ses.extensions.on('extension-loaded', (_, ext) => {
    if (extPrefs(profileId).disabled[ext.id]) setImmediate(() => ses.extensions.removeExtension(ext.id))
    render()
  })
  ses.extensions.on('extension-unloaded', render)
  // Ekstensi tiap profil disimpan terpisah, seperti Chrome
  // unduhan langsung ke folder Downloads (nama unik), progres ditampilkan di Library > Unduhan
  ses.on('will-download', (_, item) => {
    const file = uniquePath(app.getPath('downloads'), item.getFilename())
    item.setSavePath(file)
    const d = { id: uid('d'), filename: path.basename(file), path: file, url: item.getURL(), total: item.getTotalBytes(), received: 0, state: 'progressing', ts: Date.now(), p: profileId }
    downloads.push(d)
    liveDownloads.set(d.id, item)
    win?.webContents.send('download-started', d.filename)
    item.on('updated', (_, st) => { d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.state = st === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'; downloadsChanged() })
    item.once('done', (_, st) => { d.received = item.getReceivedBytes(); d.state = st; liveDownloads.delete(d.id); downloadsChanged() })
    downloadsChanged()
  })
  if (!profileOf(profileId)?.ephemeral) // privat: tanpa ekstensi (seperti incognito Chrome)
    installChromeWebStore({ session: ses, extensionsPath: extDir(profileId) })
      .catch(e => console.error('web store:', e))
  return ctx[profileId]
}

const extDir = profileId => path.join(DATA, 'Extensions', profileId)
const extPrefs = profileId => (state.extPrefs[profileId] ||= { unpinned: [], disabled: {} })

// Nama ekstensi bisa berupa "__MSG_appName__" -> ambil dari _locales
function extName(e) {
  const m = /^__MSG_(\w+)__$/.exec(e.name)
  if (!m) return e.name
  try {
    const msgs = JSON.parse(fs.readFileSync(path.join(e.path, '_locales', e.manifest.default_locale || 'en', 'messages.json'), 'utf8'))
    const key = Object.keys(msgs).find(k => k.toLowerCase() === m[1].toLowerCase())
    return msgs[key]?.message || e.name
  } catch { return e.name }
}

function extList(profileId) {
  const c = ctx[profileId]
  if (!c) return []
  const prefs = extPrefs(profileId)
  const loaded = c.ses.extensions.getAllExtensions().filter(e => !prefs.disabled[e.id]).map(e => ({
    id: e.id, name: extName(e), version: e.version, enabled: true,
    pinned: !prefs.unpinned.includes(e.id),
    options: !!(e.manifest.options_ui?.page || e.manifest.options_page),
  }))
  const off = Object.entries(prefs.disabled).map(([id, d]) => ({ id, name: d.name, version: d.version, enabled: false, pinned: false, options: false }))
  return [...loaded, ...off].sort((a, b) => a.name.localeCompare(b.name))
}

function activeTab() {
  return state.tabs
    .filter(t => t.profileId === state.activeProfile && t.wsId === activeWs())
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0]
}

function wake(t) {
  if (!t.url) return // tab baru kosong: halaman Almac di UI, belum ada webContents
  const { ses, extensions } = profileCtx(t.profileId)
  t.view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, spellcheck: false, javascript: !state.blockJavaScript } })
  t.view.setBorderRadius(10)
  const wc = t.view.webContents
  extensions.addTab(wc, win)
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'new-window') return { action: 'allow' } // popup login (OAuth) butuh window.opener
    const n = newTab(url, t.profileId, disposition !== 'background-tab')
    if (disposition === 'background-tab') n.lastActive = (t.lastActive || Date.now()) - 1
    return { action: 'deny' }
  })
  const sync = visit => { t.url = wc.getURL(); t.title = wc.getTitle(); addHistory(t, visit); render() }
  // navigator.userAgent (JS) di halaman login sama dengan header (konsisten), situs lain Chrome
  wc.on('did-start-navigation', ({ url, isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return
    const want = isGoogleLogin(url) ? GOOGLE_LOGIN_UA : UA
    if (wc.getUserAgent() !== want) wc.setUserAgent(want)
  })
  wc.on('focus', () => { // klik di panel split lain -> panel itu jadi tab aktif (kolom alamat ikut)
    if (t !== activeTab() && isShown(t)) { t.lastActive = Date.now(); profileCtx(t.profileId).extensions.selectTab(wc); render(true) }
  })
  wc.on('media-started-playing', () => { musicTab = t })
  // renderer crash: tab di belakang ditidurkan (dimuat ulang saat dipilih), tab yang tampil -> tanya muat ulang
  wc.on('render-process-gone', (_, d) => {
    if (d.reason === 'clean-exit' || !state.tabs.includes(t)) return
    if (!isShown(t)) return setImmediate(() => { sleep(t); render() })
    win?.webContents.send('tab-crashed', { id: t.id, title: t.title || t.url, reason: d.reason })
  })
  // HTTPS-Only: versi https gagal -> tawarkan buka versi http (tidak aman)
  // halaman gagal dimuat -> halaman error Almac (bukan layar putih)
  wc.on('did-fail-load', (_, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = dibatalkan (pindah halaman, tombol stop)
    const https = url.replace(/^http:/, 'https:') // juga kasus https -> redirect balik ke http (loop)
    if (upgraded.has(https)) { // HTTPS-Only: versi https gagal -> tawarkan http
      upgraded.delete(https)
      return setLoadError(t, { kind: 'https', code: desc, url: url.replace(/^https:/, 'http:'), host: hostOf(url) })
    }
    const cert = t.certError?.url === url && t.certError
    if (cert || (code <= -200 && code > -300)) return setLoadError(t, { kind: 'cert', code: desc, url, host: hostOf(url), text: CERT_TEXT[desc] || 'The site\'s security certificate is not valid.', issuer: cert?.issuer || '' })
    setLoadError(t, { kind: 'net', code: desc, url, host: hostOf(url), dns: code === -105 && state.dnsMode === 'doh' })
  })
  wc.on('did-start-navigation', ({ url, isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return
    if (t.loadError) { t.loadError = null; layout(); render() }
    clearTimeout(t.httpsTimer)
    // HTTPS-First: versi https tidak menjawab dalam 5 detik -> hentikan & tawarkan http (Chrome: 3 detik)
    if (upgraded.has(url)) t.httpsTimer = setTimeout(() => {
      if (!upgraded.has(url) || wc.isDestroyed() || !wc.isLoading()) return
      upgraded.delete(url)
      wc.stop()
      setLoadError(t, { kind: 'https', code: 'no response over HTTPS', url: url.replace(/^https:/, 'http:'), host: hostOf(url) })
    }, 5000)
  })
  wc.on('did-navigate', (_, url) => { clearTimeout(t.httpsTimer); upgraded.delete(url) })
  wc.on('found-in-page', (_, r) => { if (t === activeTab()) win?.webContents.send('find-result', { active: r.activeMatchOrdinal, matches: r.matches }) })
  // zoom per situs: terapkan zoom tersimpan setiap pindah halaman
  wc.on('did-navigate', () => { const z = state.zoom[hostOf(wc.getURL())]; if (z && z !== 1) wc.setZoomFactor(z) })
  wc.on('did-navigate', () => { t.blockedSeen = null; sync(true); if (t.pendingPw) setTimeout(() => pwOffer(t), 600) })
  wc.on('did-navigate-in-page', (_, url, isMainFrame) => { if (isMainFrame) { sync(true); if (t.pendingPw) setTimeout(() => pwOffer(t), 600) } })
  wc.on('page-title-updated', () => sync(false))
  wc.on('page-favicon-updated', (_, icons) => {
    t.favicon = icons[0]
    const host = hostOf(t.url)
    if (host && icons[0] && state.favicons[host] !== icons[0]) {
      delete state.favicons[host] // urutan sisip = urutan terbaru
      state.favicons[host] = icons[0]
      const hosts = Object.keys(state.favicons)
      if (hosts.length > 3000) delete state.favicons[hosts[0]]
    }
    render()
  })
  wc.loadURL(t.url)
}

function sleep(t) {
  if (!t.view) return
  win?.contentView.removeChildView(t.view)
  shownViews = shownViews.filter(v => v !== t.view)
  t.view.webContents.close()
  t.view = null
}

// tab yang tampil: tab aktif + pasangan split-nya (kiri/kanan sesuai urutan di daftar tab)
function visibleTabs() {
  const t = activeTab()
  if (!t) return []
  const partner = t.group && state.tabs.find(x => x !== t && x.group === t.group)
  if (!partner) return [t]
  return state.tabs.indexOf(t) < state.tabs.indexOf(partner) ? [t, partner] : [partner, t]
}
// posisi halaman di jendela: satu kotak, atau dua kotak dipisah GAP untuk split view
function paneBounds(count, group) {
  const [w, h] = win.getContentSize()
  const x = sideSpace() + GAP, y = GAP + barSpace(), W = Math.max(w - x - GAP, 0), H = Math.max(h - y - GAP, 0)
  if (count < 2) return [{ x, y, width: W, height: H }]
  const lw = Math.round((W - GAP) * (state.splitRatio[group] ?? 0.5))
  return [{ x, y, width: lw, height: H }, { x: x + lw + GAP, y, width: Math.max(W - lw - GAP, 0), height: H }]
}
let shownViews = []
const isShown = t => !!t.view && shownViews.includes(t.view)
function layout() {
  if (!win) return
  const tabs = modalOpen || peeking || covered ? [] : visibleTabs().filter(t => !t.loadError) // halaman error tampil di UI
  for (const t of tabs) if (!t.view) wake(t) // pasangan split ikut dihidupkan
  const views = tabs.map(t => t.view).filter(Boolean)
  for (const v of shownViews) if (!views.includes(v)) win.contentView.removeChildView(v)
  shownViews = views
  const bounds = paneBounds(views.length, tabs[0]?.group)
  views.forEach((v, i) => { win.contentView.addChildView(v); v.setBounds(bounds[i]) })
  petSync()
}

function selectTab(t) {
  if (findOpen && t !== activeTab()) commands.findClose()
  t.lastActive = Date.now()
  state.activeProfile = t.profileId
  profileOf(t.profileId).activeWs = t.wsId
  if (!t.view) wake(t)
  layout()
  if (t.view) profileCtx(t.profileId).extensions.selectTab(t.view.webContents)
  render()
}

const newTabUrl = () => state.newTabPage === 'engine' ? engine().home : '' // '' = halaman Almac
function newTab(url = newTabUrl(), profileId = state.activeProfile, focus = true) {
  const t = { id: nextTabId++, profileId, wsId: activeWs(profileId), url, title: '', blocked: 0, lastActive: Date.now(), view: null }
  state.tabs.push(t)
  wake(t)
  focus ? selectTab(t) : render()
  return t
}

function unsplit(t) {
  if (!t?.group) return
  for (const x of state.tabs) if (x.group === t.group) delete x.group
  delete state.splitRatio[t.group]
}

function closeTab(t) {
  if (t.url && !profileOf(t.profileId)?.ephemeral) { closedTabs.push({ url: t.url, profileId: t.profileId, wsId: t.wsId }); if (closedTabs.length > 20) closedTabs.shift() }
  unsplit(t)
  sleep(t)
  state.tabs = state.tabs.filter(x => x !== t)
  const next = activeTab()
  next ? selectTab(next) : (layout(), render())
}

// buka url di tab aktif (tab kosong dihidupkan dulu), atau tab baru kalau tidak ada tab
function goTo(url) {
  const t = activeTab()
  if (!t) return newTab(url)
  if (t.view) return t.view.webContents.loadURL(url)
  t.url = url
  wake(t)
  layout()
  render()
}

function toUrl(input) {
  input = input.trim()
  if (/^[a-z]+:\/\//i.test(input) || input.startsWith('about:')) return input
  if (/^[^\s]+\.[^\s]{2,}$/.test(input) || input.startsWith('localhost')) return 'https://' + input
  return engine().search + encodeURIComponent(input)
}

const commands = {
  navigate: input => goTo(toUrl(input)),
  newTab: url => newTab(url ? toUrl(url) : undefined),
  select: id => { const t = state.tabs.find(t => t.id === id); if (t) selectTab(t) },
  close: id => { const t = state.tabs.find(t => t.id === id); if (t) closeTab(t) },
  back: () => activeTab()?.view?.webContents.navigationHistory.goBack(),
  forward: () => activeTab()?.view?.webContents.navigationHistory.goForward(),
  reload: () => activeTab()?.view?.webContents.reload(),
  switchProfile: id => {
    state.activeProfile = id
    const t = activeTab()
    t ? selectTab(t) : newTab()
  },
  addProfile: ({ name, color }) => {
    const p = { id: 'p' + Date.now().toString(36), name: name || 'Profile', color: color || '#ffcd75' }
    workspaces(p)
    state.profiles.push(p)
    state.activeProfile = p.id
    newTab('https://accounts.google.com/', p.id) // langsung login akun Google untuk profil ini
  },
  removeProfile: id => {
    if (state.profiles.length < 2) return
    state.tabs.filter(t => t.profileId === id).forEach(sleep)
    state.tabs = state.tabs.filter(t => t.profileId !== id)
    state.profiles = state.profiles.filter(p => p.id !== id)
    delete state.extPrefs[id]
    history = history.filter(h => h.p !== id)
    saveHistory()
    bookmarks = bookmarks.filter(b => b.p !== id)
    saveBookmarks()
    delete state.sitePerms[id]
    session.fromPartition('persist:' + id).clearData()
    commands.switchProfile(state.profiles[0].id)
  },
  ready: render, // UI baru dimuat/reload -> kirim state
  openPrivate: () => {
    let p = state.profiles.find(p => p.ephemeral)
    if (!p) { p = { id: uid('private'), name: 'Private', color: '#8b5cf6', icon: 'eye-off', ephemeral: true }; workspaces(p); state.profiles.push(p) }
    state.activeProfile = p.id
    privSeen = Date.now()
    newTab()
  },
  closePrivate: () => {
    const p = state.profiles.find(p => p.ephemeral)
    if (!p) return
    state.tabs.filter(t => t.profileId === p.id).forEach(t => { unsplit(t); sleep(t) })
    state.tabs = state.tabs.filter(t => t.profileId !== p.id)
    ctx[p.id]?.ses.clearStorageData() // sesi memori dikosongkan
    delete ctx[p.id]
    downloads = downloads.filter(d => d.p !== p.id)
    state.profiles = state.profiles.filter(x => x !== p)
    commands.switchProfile(state.profiles[0].id)
  },
  setting: ({ key, value }) => {
    if (key === 'searchEngine' && ENGINES[value]) state.searchEngine = value
    if (key === 'newTabPage' && ['almac', 'engine'].includes(value)) state.newTabPage = value
    if (key === 'bookmarkBar') { state.bookmarkBar = !!value; layout() }
    if (key === 'sleepAfter' && [0, 5, 10, 30].includes(value)) state.sleepAfter = value
    if (key === 'dnsMode' && ['auto', 'doh', 'off'].includes(value)) { state.dnsMode = value; applyDns() }
    if (key === 'customDns') { state.customDns = (value || '').trim(); applyDns() }
    if (key === 'blockJavaScript') {
      state.blockJavaScript = !!value
      // webPreferences.javascript hanya berlaku saat halaman dibuat -> tidurkan semua tab, yang tampil langsung dihidupkan ulang
      state.tabs.forEach(sleep)
      layout()
    }
    if (key === 'cookiePolicy' && ['allow', 'block_third_party', 'block_all'].includes(value)) state.cookiePolicy = value
    if (key === 'doNotTrack') state.doNotTrack = !!value
    if (key === 'httpsOnly') state.httpsOnly = !!value
    if (key === 'pwLockAfter' && [1, 5, 15, 60].includes(value)) state.pwLockAfter = value
    if (key === 'stripTracking') state.stripTracking = !!value
    if (key === 'privateWipeAfter' && [0, 15, 30, 60].includes(value)) state.privateWipeAfter = value
    if (key === 'focusSites' && Array.isArray(value)) state.focus.sites = [...new Set(value.map(s => String(s).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean))].slice(0, 100)
    render(true)
  },
  profileUpdate: ({ id, name, color, icon }) => {
    const p = profileOf(id)
    if (!p) return
    if (name?.trim()) p.name = name.trim().slice(0, 24)
    if (/^#[0-9a-f]{6}$/i.test(color || '')) p.color = color
    p.icon = icon || ''
    render(true)
  },

  // ---- info situs ----
  permAnswer: ({ id, allow, remember }) => {
    const p = pendingPerms.get(id)
    if (!p) return
    pendingPerms.delete(id)
    if (remember) for (const k of p.kinds) ((state.sitePerms[p.profileId] ||= {})[p.origin] ||= {})[k] = allow ? 'allow' : 'block'
    render()
    p.resolve(allow)
  },
  sitePerm: ({ origin, kind, value }) => {
    const perms = ((state.sitePerms[state.activeProfile] ||= {})[origin] ||= {})
    if (value === 'ask') delete perms[kind]; else perms[kind] = value
    render()
  },
  siteClearData: async origin => {
    const { ses } = profileCtx(state.activeProfile)
    const host = new URL(origin).hostname
    const domain = getDomain(host) || host // hapus untuk seluruh domain, mis. mail.google.com -> google.com
    const cookies = await ses.cookies.get({ domain })
    await Promise.all(cookies.map(c => ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {})))
    await ses.clearStorageData({ origin, storages: SITE_STORAGES })
    history = history.filter(h => !(h.p === state.activeProfile && (getDomain(hostOf(h.url)) || hostOf(h.url)) === domain)) // lupakan situs ini
    saveHistory()
    activeTab()?.view?.webContents.reload()
  },

  clearCache: async () => {
    const { ses } = profileCtx(state.activeProfile)
    await ses.clearCache()
  },
  clearCookies: async () => {
    const { ses } = profileCtx(state.activeProfile)
    await ses.clearStorageData({ storages: SITE_STORAGES })
    const cookies = await ses.cookies.get({})
    await Promise.all(cookies.map(c => ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {})))
    // tutup semua tab dan buka tab baru
    const profileId = state.activeProfile
    state.tabs.filter(t => t.profileId === profileId && t.view).forEach(t => { t.view.webContents.reload() })
  },
  clearAll: async () => {
    const profileId = state.activeProfile
    const { ses } = profileCtx(profileId)
    await ses.clearCache()
    await ses.clearStorageData({ storages: SITE_STORAGES })
    const cookies = await ses.cookies.get({})
    await Promise.all(cookies.map(c => ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {})))
    history = history.filter(h => h.p !== profileId)
    saveHistory()
    state.tabs.filter(t => t.profileId === profileId && t.view).forEach(t => { t.view.webContents.reload() })
    render(true)
  },

  // ---- workspace ----
  wsSwitch: id => {
    profileOf(state.activeProfile).activeWs = id
    const t = activeTab()
    t ? selectTab(t) : layout() // workspace kosong -> tampilkan layar kosong
    render(true) // tanpa debounce supaya animasi geser terasa langsung
  },
  wsStep: dir => {
    const list = profileOf(state.activeProfile).workspaces
    const i = list.findIndex(w => w.id === activeWs())
    const next = list[i + dir]
    if (next) commands.wsSwitch(next.id)
  },
  wsAdd: ({ name, icon, color } = {}) => {
    const p = profileOf(state.activeProfile)
    const w = { id: uid('w'), name: name || 'Workspace ' + (p.workspaces.length + 1), icon, color }
    p.workspaces.push(w)
    commands.wsSwitch(w.id)
  },
  wsUpdate: ({ id, name, icon, color }) => {
    const w = profileOf(state.activeProfile).workspaces.find(w => w.id === id)
    if (!w) return
    Object.assign(w, { name: name || w.name, icon, color })
    render(true)
  },
  wsMove: ({ id, dir }) => {
    const list = profileOf(state.activeProfile).workspaces
    const i = list.findIndex(w => w.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    render(true)
  },
  wsCloseTabs: id => { // tab dipin tetap ada
    const p = profileOf(state.activeProfile)
    state.tabs.filter(t => t.profileId === p.id && t.wsId === id && !t.pinned).forEach(sleep)
    state.tabs = state.tabs.filter(t => !(t.profileId === p.id && t.wsId === id && !t.pinned))
    layout()
    render(true)
  },
  wsRemove: id => {
    const p = profileOf(state.activeProfile)
    if (p.workspaces.length < 2) return
    state.tabs.filter(t => t.profileId === p.id && t.wsId === id).forEach(sleep)
    state.tabs = state.tabs.filter(t => !(t.profileId === p.id && t.wsId === id))
    p.workspaces = p.workspaces.filter(w => w.id !== id)
    commands.wsSwitch(p.workspaces[0].id)
  },
  tabMove: ({ id, wsId }) => {
    const t = state.tabs.find(t => t.id === id)
    if (!t) return
    const wasActive = t === activeTab()
    unsplit(t)
    t.wsId = wsId
    const next = wasActive && activeTab()
    if (next) selectTab(next); else if (wasActive) layout()
    render(true)
  },
  // ---- cari di halaman ----
  findOpen: () => { findOpen = true; layout(); render(true) },
  find: ({ text, forward = true, next = false }) => {
    const wc = activeTab()?.view?.webContents
    if (!wc) return
    if (!text) { wc.stopFindInPage('clearSelection'); win?.webContents.send('find-result', { active: 0, matches: 0 }); return }
    wc.findInPage(text, { forward, findNext: !next })
  },
  findClose: () => {
    activeTab()?.view?.webContents.stopFindInPage('clearSelection')
    findOpen = false
    layout(); render(true)
  },

  // ---- zoom per situs ----
  zoom: dir => {
    const t = activeTab(), wc = t?.view?.webContents
    const host = hostOf(t?.url)
    if (!wc || !host) return
    const cur = wc.getZoomFactor()
    const i = ZOOM_STEPS.findIndex(z => z >= cur - 0.001)
    const next = dir === 0 ? 1 : ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? 5 : i) + dir))]
    wc.setZoomFactor(next)
    if (next === 1) delete state.zoom[host]; else state.zoom[host] = next
    render(true)
  },

  // ---- unduhan ----
  dlOpen: id => { const d = downloads.find(d => d.id === id); if (d) shell.openPath(d.path) },
  dlShow: id => { const d = downloads.find(d => d.id === id); if (d) shell.showItemInFolder(d.path) },
  dlPause: id => liveDownloads.get(id)?.pause(),
  dlResume: id => { const item = liveDownloads.get(id); if (item?.canResume()) item.resume() },
  dlCancel: id => liveDownloads.get(id)?.cancel(),
  dlRemove: id => { liveDownloads.get(id)?.cancel(); downloads = downloads.filter(d => d.id !== id); downloadsChanged() },
  dlClear: () => { downloads = downloads.filter(d => d.state === 'progressing' || d.state === 'paused'); downloadsChanged() },

  // ---- split view ----
  splitWith: ({ id, other }) => {
    const a = state.tabs.find(t => t.id === id), b = state.tabs.find(t => t.id === other)
    if (!a || !b || a === b) return
    unsplit(a); unsplit(b)
    if (!b.url) b.url = engine().home // tab kosong tidak punya halaman untuk ditampilkan
    if (!a.url) a.url = engine().home
    const g = uid('g')
    a.group = b.group = g
    state.splitRatio[g] = 0.5
    state.tabs.splice(state.tabs.indexOf(b), 1)
    state.tabs.splice(state.tabs.indexOf(a) + 1, 0, b) // pasangan di sebelah kanan
    selectTab(a)
  },
  splitNew: id => {
    const b = newTab(engine().home, undefined, false)
    commands.splitWith({ id, other: b.id })
  },
  unsplit: id => { unsplit(state.tabs.find(t => t.id === id)); layout(); render(true) },
  splitRatio: ratio => {
    const g = activeTab()?.group
    if (!g) return
    state.splitRatio[g] = Math.min(0.8, Math.max(0.2, +ratio || 0.5))
    layout(); render()
  },

  // tab dipin: tampil sebagai ubin di atas, tersimpan, tidak tertutup oleh ⌘W / "close all tabs"
  pinTab: id => {
    const t = state.tabs.find(t => t.id === (id ?? activeTab()?.id))
    if (!t || !t.url) return
    t.pinned = !t.pinned
    if (t.pinned) t.pinUrl = t.url; else delete t.pinUrl
    render(true)
  },
  pinReset: id => { const t = state.tabs.find(t => t.id === id); if (t?.pinUrl) { t.view ? t.view.webContents.loadURL(t.pinUrl) : (t.url = t.pinUrl, selectTab(t)) } },
  closePinned: id => { const t = state.tabs.find(t => t.id === id); if (t) { t.pinned = false; closeTab(t) } },
  // ⌘W: tab biasa ditutup; tab dipin hanya ditidurkan & pindah ke tab lain (seperti Arc)
  closeActive: () => {
    const t = activeTab()
    if (!t) return
    if (!t.pinned) return closeTab(t)
    const next = state.tabs.filter(x => x !== t && x.profileId === t.profileId && x.wsId === t.wsId).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0]
    if (!next) return win?.webContents.send('toast', 'This pinned tab stays. Right-click it to unpin or close')
    unsplit(t)
    t.lastActive = 0
    selectTab(next)
    sleep(t); render(true)
    win?.webContents.send('toast', 'Pinned tab kept. Right-click it to unpin or close')
  },
  sleepTab: id => { const t = state.tabs.find(t => t.id === id); if (t && !isShown(t)) { sleep(t); render() } },
  sleepOthers: id => { for (const t of state.tabs) if (t.id !== id && t.view && !isShown(t) && !t.view.webContents.isCurrentlyAudible()) sleep(t); render() },
  copyUrl: id => clipboard.writeText(state.tabs.find(t => t.id === id)?.url || ''),
  modalClose: () => { modalOpen = false; layout() },
  sidebarToggle: () => {
    state.sidebar.mode = state.sidebar.mode === 'pinned' ? 'hidden' : 'pinned'
    peeking = false
    win?.setWindowButtonVisibility?.(state.sidebar.mode === 'pinned')
    layout()
    render(true)
  },
  sidebarWidth: w => {
    state.sidebar.width = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, +w || SIDEBAR)))
    layout()
    render()
  },

  // ---- history ----
  open: url => newTab(url),
  bookmarkAddCurrent: () => { // ⌘D / bintang: tambah (kalau belum) lalu UI membuka modal edit
    const t = activeTab()
    if (!t?.url || profileOf(t.profileId)?.ephemeral) return null // privat: tidak menyimpan bookmark
    let b = bookmarks.find(b => b.p === t.profileId && !b.folder && b.url === t.url)
    if (b) return { ...b, added: false }
    b = { id: uid('b'), url: t.url, title: t.title || t.url, path: [], order: nextOrder(), ts: Date.now(), p: t.profileId }
    bookmarks.push(b); saveBookmarks(); render(true)
    return { ...b, added: true }
  },
  bookmarkSave: ({ id, title, url, path }) => {
    const b = bookmarks.find(b => b.id === id)
    if (!b) return
    if (title?.trim()) b.title = title.trim()
    if (!b.folder && url?.trim()) b.url = /^[a-z]+:/i.test(url.trim()) ? url.trim() : 'https://' + url.trim()
    if (Array.isArray(path) && !samePath(b.path, path)) { b.path = path; b.order = nextOrder() } // pindah folder -> taruh di akhir
    saveBookmarks(); render(true)
  },
  folderAdd: ({ path = [], title }) => {
    title = (title || '').trim() || 'Folder baru'
    bookmarks.push({ id: uid('f'), folder: true, title, path, order: nextOrder(), p: state.activeProfile })
    saveBookmarks(); render(true)
  },
  folderRename: ({ path, title, newTitle }) => {
    newTitle = (newTitle || '').trim()
    if (!newTitle || newTitle === title) return
    const p = state.activeProfile, full = [...path, title]
    for (const b of bookmarks) {
      if (b.p !== p) continue
      if (b.folder && b.title === title && samePath(b.path, path)) b.title = newTitle
      else if (startsWith(b.path, full)) b.path = [...path, newTitle, ...b.path.slice(full.length)]
    }
    // folder yang hanya tersirat (dari path) dibuat jadi entri supaya namanya tersimpan
    if (!bookmarks.some(b => b.p === p && b.folder && b.title === newTitle && samePath(b.path, path)))
      bookmarks.push({ id: uid('f'), folder: true, title: newTitle, path, order: nextOrder(), p })
    saveBookmarks(); render(true)
  },
  folderRemove: ({ path, title }) => { // folder + seluruh isinya
    const p = state.activeProfile, full = [...path, title]
    bookmarks = bookmarks.filter(b => b.p !== p || !((b.folder && b.title === title && samePath(b.path, path)) || startsWith(b.path, full)))
    saveBookmarks(); render(true)
  },
  bookmarkBarToggle: () => { state.bookmarkBar = !state.bookmarkBar; layout(); render(true) },
  openHere: url => goTo(url),
  bookmarkRemove: id => { bookmarks = bookmarks.filter(b => b.id !== id); saveBookmarks(); render(true) },
  historyRemove: url => { history = history.filter(h => !(h.url === url && h.p === state.activeProfile)); saveHistory() },
  historyClear: () => { history = history.filter(h => h.p !== state.activeProfile); saveHistory() },
  webStore: () => newTab('https://chromewebstore.google.com/'),
  music: () => toggleMusic(),
  // iCloud Keychain tidak bisa diakses browser non-resmi -> salin domain & buka app Passwords untuk dicari
  pwAnswer: ({ id, action }) => {
    const c = pendingPw.get(id)
    pendingPw.delete(id)
    if (!c || !vault.unlocked()) return
    if (action === 'never') { if (!vault.data.never.includes(c.origin)) vault.data.never.push(c.origin) }
    else if (action === 'save') pwUpsert(c)
    else return
    vault.save(); pwTouch()
  },
  pwLock,
  screenPick: ({ id, sourceId }) => { const r = pendingScreens.get(id); pendingScreens.delete(id); r?.(sourceId || null) },
  openScreenSettings: () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'),
  // tombol "Fill" di pengelola / ⌘⇧L: kirim ke halaman aktif, hanya kalau login itu memang untuk situs tersebut
  pwFillActive: id => {
    const t = activeTab(), wc = t?.view?.webContents
    if (!wc) return
    if (id && !(vault.unlocked() && vault.data.entries.some(e => e.id === id && e.origin === pwOrigin(wc.getURL())))) return
    wc.focus(); wc.send('pw-autofill', id || null)
  },
  petOut: out => petOut(!!out),
  // tab mulai diseret dari sidebar: Almi lapar; tab diingat sebentar setelah drag selesai (drop bisa datang belakangan)
  petFeed: id => { clearTimeout(petFeedTimer); petFeedTab = id; petWin?.webContents.send('pet-hungry', true) },
  petLedges: list => {
    if (!Array.isArray(list)) return
    petUiLedges = list.slice(0, 12).filter(l => [l?.x1, l?.x2, l?.y].every(Number.isFinite)).map(l => ({ x1: Math.round(l.x1), x2: Math.round(l.x2), y: Math.round(l.y) }))
    petSync()
  },
  petFeedEnd: () => { petWin?.webContents.send('pet-hungry', false); petFeedTimer = setTimeout(() => { petFeedTab = null }, 1500) },
  updateCheck: () => updater.check({ manual: true }),
  updateDownload: async () => { await updater.download(); updater.install() }, // tombol "Update & Restart"
  updateInstall: () => updater.install(),
  passwords: () => {
    try { clipboard.writeText(new URL(activeTab()?.url).hostname.replace(/^www\./, '')) } catch {}
    shell.openPath('/System/Applications/Passwords.app')
  },
  extPin: id => {
    const prefs = extPrefs(state.activeProfile)
    prefs.unpinned = prefs.unpinned.includes(id) ? prefs.unpinned.filter(x => x !== id) : [...prefs.unpinned, id]
    render()
  },
  extToggle: id => {
    const { ses } = profileCtx(state.activeProfile)
    const prefs = extPrefs(state.activeProfile)
    const off = prefs.disabled[id]
    if (off) {
      delete prefs.disabled[id]
      ses.extensions.loadExtension(off.path).catch(e => console.error('gagal memuat ekstensi:', e.message))
    } else {
      const e = ses.extensions.getExtension(id)
      if (!e) return
      prefs.disabled[id] = { name: extName(e), version: e.version, path: e.path }
      ses.extensions.removeExtension(id)
    }
    render()
  },
  extOptions: id => {
    const e = profileCtx(state.activeProfile).ses.extensions.getExtension(id)
    const page = e?.manifest.options_ui?.page || e?.manifest.options_page
    if (page) newTab(`chrome-extension://${id}/${page}`)
  },
  extRemove: async id => {
    const profileId = state.activeProfile
    const prefs = extPrefs(profileId)
    delete prefs.disabled[id]
    prefs.unpinned = prefs.unpinned.filter(x => x !== id)
    await uninstallExtension(id, { session: profileCtx(profileId).ses, extensionsPath: extDir(profileId) })
    render()
  },
  reopenTab: () => {
    const c = closedTabs.pop()
    if (!c) return
    const p = profileOf(c.profileId)
    if (!p) return commands.reopenTab()
    state.activeProfile = p.id
    if (p.workspaces.some(w => w.id === c.wsId)) p.activeWs = c.wsId
    newTab(c.url, p.id)
  },
  reloadTab: id => state.tabs.find(t => t.id === id)?.view?.webContents.reload(),
  errRetry: () => {
    const t = activeTab(), url = t?.loadError?.url
    if (!t || !url) return
    t.loadError = null
    t.view ? t.view.webContents.loadURL(url) : (t.url = url, wake(t))
    layout(); render(true)
  },
  errBack: () => {
    const t = activeTab()
    if (!t?.loadError) return
    const wc = t.view?.webContents
    t.loadError = null
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    else { t.url = newTabUrl(); sleep(t) } // tidak ada halaman sebelumnya -> halaman awal
    layout(); render(true)
  },
  certProceed: () => {
    const t = activeTab(), e = t?.loadError
    if (e?.kind !== 'cert' || !t.certError?.fingerprint) return
    certAllowed.set(e.host, t.certError.fingerprint)
    commands.errRetry()
  },
  httpProceed: () => {
    const t = activeTab(), e = t?.loadError
    if (e?.kind !== 'https' || !/^http:/.test(e.url)) return
    httpAllowed.add(e.host)
    commands.errRetry()
  },
  useSystemDns: () => { commands.setting({ key: 'dnsMode', value: 'auto' }); commands.errRetry() },
  allowHttp: ({ id, url }) => {
    const t = state.tabs.find(t => t.id === id)
    if (!t?.view || !/^http:/.test(url)) return
    httpAllowed.add(hostOf(url))
    t.view.webContents.loadURL(url)
  },
  // Picture-in-Picture: video terbesar yang sedang diputar di tab aktif (klik lagi = keluar)
  pip: () => activeTab()?.view?.webContents.executeJavaScript(`(() => {
    if (document.pictureInPictureElement) return document.exitPictureInPicture()
    const v = [...document.querySelectorAll('video')].filter(v => v.readyState > 0).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    if (v) v.requestPictureInPicture().catch(() => {})
  })()`, true).catch(() => {}),
  focusStart: minutes => { state.focus.until = Date.now() + Math.min(240, Math.max(1, +minutes || 25)) * 60000; render(true) },
  focusStop: () => { state.focus.until = 0; render(true) },
  theme: () => {
    const order = ['system', 'light', 'dark']
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length]
    nativeTheme.themeSource = state.theme // UI & halaman web ikut prefers-color-scheme
    render()
  },
}

// hanya jendela UI Almac yang boleh memberi perintah
const fromUI = e => e.sender === win?.webContents
ipcMain.on('cmd', (e, type, arg) => { if (fromUI(e)) commands[type]?.(arg) })

const matches = (h, q) => (h.title + ' ' + h.url).toLowerCase().includes(q)
const queries = {
  history: (q = '') => {
    q = q.trim().toLowerCase()
    return history.filter(h => h.p === state.activeProfile && (!q || matches(h, q)))
      .sort((a, b) => b.ts - a.ts).slice(0, 300)
  },
  bookmarks: (q = '') => {
    q = q.trim().toLowerCase()
    return bookmarks.filter(b => b.p === state.activeProfile && (!q || (b.title + ' ' + b.url + ' ' + b.path.join(' ')).toLowerCase().includes(q)))
      .sort((a, b) => a.order - b.order).slice(0, 5000)
      .map(b => ({ ...b, icon: state.favicons[hostOf(b.url)] }))
  },
  importSources,
  importRun,
  // command palette: semua tab di profil aktif (semua workspace)
  allTabs: () => state.tabs.filter(t => t.profileId === state.activeProfile).map(t => ({
    id: t.id, title: t.title || t.url || 'New tab', url: t.url, favicon: t.favicon,
    ws: profileOf(t.profileId).workspaces.find(w => w.id === t.wsId)?.name,
  })),
  stats: () => Array.from({ length: 7 }, (_, i) => { const k = dayKey(new Date(Date.now() - (6 - i) * 864e5)); return { day: k, n: state.stats[k] || 0 } }),
  bookmarkCurrent: () => commands.bookmarkAddCurrent(),
  downloads: () => downloads.filter(d => d.p === state.activeProfile).slice().reverse(),
  suggest: async q => {
    q = q.trim()
    if (!q) return { bookmarks: [], history: [], search: [] }
    const lq = q.toLowerCase()
    const marks = bookmarks.filter(b => b.p === state.activeProfile && !b.folder && matches(b, lq)).slice(0, 3)
    const hist = history.filter(h => h.p === state.activeProfile && matches(h, lq) && !marks.some(b => b.url === h.url))
      .sort((a, b) => b.n - a.n || b.ts - a.ts).slice(0, 4)
    let search = []
    try {
      // saran dari mesin pencari yang dipilih (format OpenSearch: [query, [saran...]])
      if (!engine().suggest) throw new Error('no suggestions')
      const res = await fetch(engine().suggest + encodeURIComponent(q), { signal: AbortSignal.timeout(1500) })
      search = (await res.json())[1].filter(s => s.toLowerCase() !== lq).slice(0, 5)
    } catch {}
    return { bookmarks: marks.map(({ url, title }) => ({ url, title })), history: hist.map(({ url, title }) => ({ url, title })), search }
  },
}
// modal pixel: sembunyikan halaman web (native view selalu di atas UI) dan kirim snapshot-nya untuk latar blur
// screenshot halaman yang tampil (1-2 panel) + posisinya, untuk ditaruh UI saat halaman disembunyikan
async function snapshot() {
  const shots = await Promise.all(shownViews.map(async v => {
    const img = await v.webContents.capturePage().catch(() => null)
    if (!img || img.isEmpty()) return null
    return { src: 'data:image/jpeg;base64,' + img.resize({ width: Math.min(1400, v.getBounds().width * 2) }).toJPEG(75).toString('base64'), ...v.getBounds() }
  }))
  return shots.filter(Boolean)
}
// dropdown bookmark bar: halaman diganti snapshot (tanpa blur) supaya menu bisa tampil di atasnya
queries.cover = async on => {
  if (on && !covered) { const snap = await snapshot(); covered = true; layout(); return snap }
  if (!on && covered) { covered = false; layout() }
  return null
}
queries.modalOpen = async () => {
  const snap = await snapshot()
  modalOpen = true
  layout()
  return snap
}
// sidebar tersembunyi muncul di atas halaman: native view diganti snapshot selama sidebar terbuka
queries.peek = async on => {
  if (on && !peeking) {
    const snap = await snapshot()
    peeking = true
    layout()
    win?.setWindowButtonVisibility?.(true)
    return snap
  }
  if (!on && peeking) {
    peeking = false
    layout()
    win?.setWindowButtonVisibility?.(state.sidebar.mode === 'pinned')
  }
  return null
}
queries.siteInfo = async () => {
  const t = activeTab()
  let u
  try { u = new URL(t.url) } catch { return null }
  const web = u.protocol === 'https:' || u.protocol === 'http:'
  const domain = web ? getDomain(u.hostname) || u.hostname : ''
  const cookies = web ? await profileCtx(t.profileId).ses.cookies.get({ domain }) : []
  return {
    url: t.url, origin: u.origin, host: u.hostname, domain, protocol: u.protocol, favicon: t.favicon,
    cert: certs.get(t.profileId + '|' + u.hostname) || null,
    cookies: cookies.length, blocked: t.blocked, perms: sitePermsOf(t.profileId, u.origin),
  }
}
// ---- Almac Passwords: perintah dari UI ----
const needVault = fn => (...a) => { if (!vault.unlocked()) throw new Error('Passwords are locked'); pwTouch(); return fn(...a) }
Object.assign(queries, {
  pwSetup: password => {
    if (typeof password !== 'string' || password.length < 8) throw new Error('Master password must be at least 8 characters')
    vault.setup(password); pwAfterUnlock(); return true
  },
  pwUnlock: password => { const ok = typeof password === 'string' && vault.unlock(password); if (ok) pwAfterUnlock(); return ok },
  pwUnlockTouch: async () => {
    if (!fs.existsSync(TOUCH_FILE)) return false
    try { await systemPreferences.promptTouchID('unlock Almac Passwords') } catch { return false }
    try { if (vault.unlockWithKey(Buffer.from(safeStorage.decryptString(fs.readFileSync(TOUCH_FILE)), 'base64'))) { pwAfterUnlock(); return true } } catch {}
    fs.rmSync(TOUCH_FILE, { force: true }) // kunci lama (master diganti / Keychain menolak) -> kembali ke master password
    render(); return false
  },
  pwTouchId: on => {
    state.pwTouchId = !!on
    if (!on) fs.rmSync(TOUCH_FILE, { force: true }); else if (vault.unlocked()) pwAfterUnlock()
    render(true); return state.pwTouchId
  },
  pwChange: ({ oldPassword, newPassword }) => {
    if (typeof newPassword !== 'string' || newPassword.length < 8) throw new Error('Master password must be at least 8 characters')
    if (!vault.changePassword(oldPassword, newPassword)) return false
    pwAfterUnlock(); return true
  },
  pwList: needVault((q = '') => {
    q = q.trim().toLowerCase()
    return vault.data.entries.filter(e => !q || (e.origin + ' ' + e.username + ' ' + (e.title || '')).toLowerCase().includes(q))
      .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username)).map(pwPublic)
  }),
  pwNever: needVault(() => vault.data.never.slice().sort()),
  pwSite: () => { // login untuk situs di tab aktif (bagian "This site" di pengelola)
    const url = activeTab()?.url
    if (!vault.unlocked() || !/^https?:/.test(url || '')) return { host: '', logins: [] }
    const o = pwOrigin(url)
    return { host: new URL(o).host, logins: vault.data.entries.filter(e => e.origin === o).map(pwPublic) }
  },
  pwNeverRemove: needVault(origin => { vault.data.never = vault.data.never.filter(o => o !== origin); vault.save() }),
  pwReveal: needVault(id => vault.data.entries.find(e => e.id === id)?.password ?? null),
  pwCopy: needVault(({ id, field }) => {
    const e = vault.data.entries.find(e => e.id === id)
    if (!e) return false
    const v = field === 'username' ? e.username : e.password
    clipboard.writeText(v)
    // password di clipboard dihapus setelah 30 detik (kalau belum diganti user)
    if (field !== 'username') setTimeout(() => { if (clipboard.readText() === v) clipboard.clear() }, 30000)
    return true
  }),
  pwSave: needVault(entry => { pwUpsert(entry); vault.save(); return true }),
  pwDelete: needVault(id => { vault.data.entries = vault.data.entries.filter(e => e.id !== id); vault.save(); return true }),
  pwGenerate: () => passwords.generate(),
  // import CSV dari Apple Passwords (File > Export Passwords) / Chrome / Brave / Edge
  pwImport: needVault(async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import passwords (CSV)', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] })
    if (r.canceled) return null
    const rows = passwords.parseCsv(fs.readFileSync(r.filePaths[0], 'utf8'))
    let added = 0, updated = 0
    for (const row of rows) {
      const origin = pwOrigin(/^[a-z]+:\/\//i.test(row.url) ? row.url : 'https://' + row.url)
      if (!origin) continue
      const same = vault.data.entries.find(e => e.origin === origin && e.username === row.username)
      if (same?.password === row.password) continue
      same ? updated++ : added++
      pwUpsert({ origin, username: row.username, password: row.password, title: row.title, notes: row.notes, otp: row.otp })
    }
    vault.save()
    return { added, updated, total: rows.length }
  }),
  // ekspor = file teks biasa (format Apple Passwords) -> wajib master password lagi
  pwExport: async password => {
    if (!vault.unlocked() || !vault.unlock(password)) return false
    const r = await dialog.showSaveDialog(win, { title: 'Export passwords (CSV)', defaultPath: path.join(app.getPath('downloads'), 'Almac Passwords.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (r.canceled) return null
    fs.writeFileSync(r.filePath, passwords.toCsv(vault.data.entries), { mode: 0o600 })
    pwTouch()
    return vault.data.entries.length
  },
})
ipcMain.handle('ask', (e, type, arg) => fromUI(e) ? queries[type]?.(arg) : null)

// ---- Almac Passwords: dari halaman web (password-preload.js) ----
// origin diambil dari frame pengirim (bukan dari halaman); hanya frame utama tab Almac, profil non-privat, https/localhost
ipcMain.handle('pw', (e, type, arg) => {
  const t = state.tabs.find(t => t.view?.webContents === e.sender)
  const frame = e.senderFrame
  if (!t || !frame || frame !== e.sender.mainFrame || profileOf(t.profileId)?.ephemeral) return null
  const u = new URL(frame.url)
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') return null
  const origin = pwOrigin(frame.url)
  const mine = () => vault.data.entries.filter(x => x.origin === origin)
  const host = new URL(origin).host
  if (type === 'query') {
    if (!vault.unlocked()) return { locked: true, setup: vault.exists(), host }
    // login yang dipilih di langkah email (Google, Microsoft, ...) tampil paling atas di langkah password
    const chosen = t.pwChosen && Date.now() - t.pwChosen.ts < 600000 ? t.pwChosen.id : null
    const logins = mine().map(x => ({ id: x.id, username: x.username, chosen: x.id === chosen })).sort((a, b) => b.chosen - a.chosen)
    return { locked: false, setup: true, host, logins }
  }
  if (type === 'chose' && vault.unlocked() && mine().some(x => x.id === arg)) { t.pwChosen = { id: arg, ts: Date.now() }; return null }
  if (type === 'user') { t.pwLastUser = { origin, username: String(arg || '').slice(0, 500), ts: Date.now() }; return null }
  if (type === 'manager') { win?.focus(); win?.webContents.send('open-passwords'); return null }
  if (type === 'fill') {
    const x = vault.unlocked() && mine().find(x => x.id === arg)
    if (!x) return null
    pwTouch()
    return { username: x.username, password: x.password }
  }
  if (type === 'unlock') { if (t === activeTab()) { win?.focus(); win?.webContents.send('pw-unlock') } return null }
  if (type === 'generate') return passwords.generate()
  if (type === 'capture') {
    // username kosong (form password saja): pakai email dari langkah sebelumnya di situs yang sama
    const prev = t.pwLastUser?.origin === origin && Date.now() - t.pwLastUser.ts < 600000 ? t.pwLastUser.username : ''
    const username = String(arg?.username || prev).slice(0, 500), password = String(arg?.password || '')
    if (!password || password.length > 1000) return null
    t.pendingPw = { origin, username, password, ts: Date.now() } // ditawarkan setelah halaman pindah (login berhasil)
  }
  return null
})

// ---- widget musik: radio retro pixel melayang yang mengontrol tab musik di Almac (default YouTube Music; situs lain juga bisa) ----
// Spotify Web tidak bisa diputar: Electron standar tidak punya Widevine DRM.
const MUSIC_HOME = 'https://music.youtube.com/'
let musicWin = null
let musicTab = null // tab terakhir yang memutar media; tidak ditidurkan supaya bisa dilanjutkan dari widget
const liveMusicTab = () => {
  const playing = state.tabs.find(t => t.view?.webContents.isCurrentlyAudible())
  if (playing) musicTab = playing
  // belum pernah diputar: pakai tab YouTube Music yang sudah terbuka (tidak buka tab baru)
  if (!state.tabs.includes(musicTab)) musicTab = state.tabs.find(t => t.url?.startsWith(MUSIC_HOME)) || null
  return musicTab
}
// handler Media Session ditangkap media-preload.js; tanpa handler -> elemen <video>/<audio> pertama
const mediaJs = (action, fallback) => `(() => {
  const h = window.__almacMedia?.[${JSON.stringify(action)}]
  if (h) return void h({ action: ${JSON.stringify(action)} })
  const v = [...document.querySelectorAll('video, audio')].find(v => v.currentSrc)
  if (v) ${fallback}
})()`
const MEDIA = {
  play: t => mediaJs(t.view.webContents.isCurrentlyAudible() ? 'pause' : 'play', 'v.paused ? v.play() : v.pause()'),
  next: () => mediaJs('nexttrack', 'v.currentTime = v.duration || 0'),
  prev: () => mediaJs('previoustrack', 'v.currentTime = 0'),
  volUp: () => volJs(10),
  volDown: () => volJs(-10),
}
// volume: player YouTube/YouTube Music (slider-nya ikut berubah), selain itu elemen media pertama
const volJs = d => `(() => {
  const p = document.getElementById('movie_player')
  if (p?.setVolume) { p.setVolume(Math.max(0, Math.min(100, p.getVolume() + ${d}))); if (p.isMuted?.()) p.unMute(); return }
  const v = [...document.querySelectorAll('video, audio')].find(v => v.currentSrc)
  if (v) v.volume = Math.max(0, Math.min(1, v.volume + ${d / 100}))
})()`
const MEDIA_INFO = `(() => {
  const m = navigator.mediaSession?.metadata, p = document.getElementById('movie_player')
  const v = [...document.querySelectorAll('video, audio')].find(v => v.currentSrc)
  return { title: m?.title || document.title, artist: m?.artist || '', art: m?.artwork?.at(-1)?.src || '',
    volume: p?.getVolume ? (p.isMuted?.() ? 0 : p.getVolume()) : v ? Math.round(v.muted ? 0 : v.volume * 100) : null }
})()`
// daftar lagu: antrean YouTube Music, atau panel playlist YouTube
const QUEUE_SEL = JSON.stringify('ytmusic-player-queue #contents > ytmusic-player-queue-item, ytd-playlist-panel-renderer #items > ytd-playlist-panel-video-renderer')
const TRACKS_JS = `[...document.querySelectorAll(${QUEUE_SEL})].slice(0, 200).map(e => ({
  title: (e.querySelector('.song-title, #video-title')?.textContent || '').trim(),
  artist: (e.querySelector('.byline, #byline')?.textContent || '').trim(),
  now: e.hasAttribute('selected'),
}))`
const pickJs = i => `(() => {
  const e = document.querySelectorAll(${QUEUE_SEL})[${i}]
  if (e) (e.querySelector('ytmusic-play-button-renderer, a#wc-endpoint') || e).click()
})()`
const LIST_H = 214 // tinggi panel daftar lagu di atas radio
ipcMain.handle('music', async (e, cmd) => {
  if (e.sender !== musicWin?.webContents) return null
  if (cmd === 'close') return toggleMusic()
  if (cmd === 'list' || cmd === 'unlist') { musicList(cmd === 'list'); return null }
  let t = liveMusicTab()
  if (cmd === 'open') { t ? selectTab(t) : newTab(MUSIC_HOME); return null }
  if (!t) return { state: 'off' }
  if (!t.view) wake(t)
  const wc = t.view.webContents
  if (MEDIA[cmd]) await wc.executeJavaScript(MEDIA[cmd](t), true).catch(() => {})
  if (Number.isInteger(cmd?.pick) && cmd.pick >= 0) { await wc.executeJavaScript(pickJs(cmd.pick), true).catch(() => {}); await new Promise(r => setTimeout(r, 700)) }
  const info = await wc.executeJavaScript(MEDIA_INFO).catch(() => ({ title: t.title }))
  const tracks = cmd === 'tracks' || cmd?.pick !== undefined ? await wc.executeJavaScript(TRACKS_JS).catch(() => []) : undefined
  return {
    state: wc.isCurrentlyAudible() ? 'playing' : 'paused', title: String(info.title || ''), artist: String(info.artist || ''), art: /^https:/.test(info.art) ? info.art : '',
    volume: Number.isFinite(info.volume) ? info.volume : null,
    ...(tracks && { tracks: tracks.map(x => ({ title: String(x.title).slice(0, 200), artist: String(x.artist).slice(0, 200), now: !!x.now })) }),
  }
})
function musicList(open) {
  if (!musicWin || !!musicWin.listOpen === open) return
  musicWin.listOpen = open
  const b = musicWin.getBounds(), d = open ? LIST_H : -LIST_H
  musicWin.setBounds({ x: b.x, y: b.y - d, width: b.width, height: b.height + d })
}
function toggleMusic() {
  if (musicWin) { state.music = { ...state.music, on: false }; musicWin.close(); return }
  const b = win.getBounds()
  // ponytail: posisi tersimpan tidak dicek terhadap layar yang ada; geser balik kalau monitor eksternal dilepas
  const { x = b.x + b.width - 300, y = b.y + b.height - 160 } = state.music || {}
  state.music = { x, y, on: true }
  musicWin = new BrowserWindow({
    parent: win, x, y, width: 280, height: 128, frame: false, transparent: true, hasShadow: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'music-preload.js'), sandbox: true, contextIsolation: true },
  })
  musicWin.webContents.on('will-navigate', e => e.preventDefault())
  musicWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // posisi tersimpan = posisi radio (panel daftar lagu tumbuh ke atas)
  musicWin.on('moved', () => { const [x, y] = musicWin.getPosition(); state.music = { x, y: y + (musicWin.listOpen ? LIST_H : 0), on: true }; render() })
  musicWin.on('closed', () => { musicWin = null; render() })
  musicWin.loadFile(path.join(__dirname, 'ui', 'music.html'))
  render()
}

// ---- Almi: kucing pixel (ui/pet.html). Jendela seukuran Almi yang ikut berpindah bersamanya, jadi bisa diseret ke mana saja
// di jendela Almac & bertengger di tempat dilepas. Rumahnya ada di sidebar (tombol kucing): keluar / pulang.
const PET_BASE = { w: 112, h: 112 }
let petWin = null, petSent = '', petSize = { ...PET_BASE }, petAreaSent = ''
let petFeedTab = null, petFeedTimer // tab yang sedang diseret dari sidebar (untuk dimakan)
let petUiLedges = [] // tepi atas kartu sidebar (dilaporkan UI), tempat Almi bisa bertengger
// seret: main sendiri mengikuti kursor (posisi dari sistem, 60x/detik). Kalau halaman pet yang memindahkan jendelanya
// berdasarkan event mouse, jendela bergeser di bawah kursor & macOS kadang berhenti mengirim event -> seret macet.
let petDrag = null, petDragTimer = null
function petDragStop() { clearInterval(petDragTimer); petDragTimer = null; petDrag = null }
function petDragStart() {
  if (!petWin || !win) return
  const c = win.getContentBounds(), cur = screen.getCursorScreenPoint()
  petDrag = { dx: state.pet.cx - (cur.x - c.x), dy: state.pet.by - (cur.y - c.y), t: Date.now() }
  clearInterval(petDragTimer)
  petDragTimer = setInterval(() => {
    if (!petWin || !petDrag || Date.now() - petDrag.t > 60000) return petDragStop() // pengaman: lepas setelah 1 menit
    const c = win.getContentBounds(), cur = screen.getCursorScreenPoint()
    state.pet.cx = cur.x - c.x + petDrag.dx; state.pet.by = cur.y - c.y + petDrag.dy
    petPlace()
    petWin.webContents.send('pet-drag', { cx: state.pet.cx, by: state.pet.by })
  }, 16)
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// permukaan pijakan (gravitasi): lantai halaman, tepi atas halaman web, dan tepi atas kartu sidebar. {x1, x2, y} relatif konten
function petArea() {
  const c = win.getContentBounds(), floor = c.height - GAP
  const pages = shownViews.length ? shownViews.map(v => v.getBounds()) : [{ x: sideSpace() + GAP, y: GAP + barSpace(), width: c.width - sideSpace() - GAP * 2 }]
  const ledges = [
    { x1: 0, x2: c.width, y: floor },
    ...pages.map(b => ({ x1: b.x, x2: b.x + b.width, y: b.y })),
    ...(state.sidebar.mode === 'pinned' ? petUiLedges : []),
  ].filter(l => l.x2 - l.x1 >= 30 && l.y > 40 && l.y <= floor)
  return { w: c.width, h: c.height, floor, ledges }
}
function petPlace() {
  if (!petWin) return
  const a = petArea(), p = state.pet, c = win.getContentBounds()
  p.cx = clamp(Number.isFinite(p.cx) ? p.cx : a.w * 0.75, 40, a.w - 40) // posisi rusak/kosong -> default
  p.by = clamp(Number.isFinite(p.by) ? p.by : a.floor, 40, a.floor)
  petWin.setBounds({ x: Math.round(c.x + p.cx - petSize.w / 2), y: Math.round(c.y + p.by - petSize.h), width: petSize.w, height: petSize.h })
}
function petSync() {
  if (!petWin) return
  if (modalOpen || peeking || covered || win.isMinimized() || win.isFullScreen()) return petWin.isVisible() && petWin.hide()
  petPlace() // mengisi posisi awal (default) sebelum dikirim
  const a = petArea(), key = JSON.stringify(a)
  if (key !== petAreaSent) { petAreaSent = key; petWin.webContents.send('pet-area', a); petWin.webContents.send('pet-place', { cx: state.pet.cx, by: state.pet.by }) }
  if (!petWin.isVisible()) petWin.showInactive()
}
function petOut(out) {
  state.pet.out = out
  render(true)
  if (!out) return petWin?.webContents.send('pet-leave') // melambai dulu, jendela ditutup saat 'gone'
  if (petWin || !win) return
  petSize = { ...PET_BASE }
  petWin = new BrowserWindow({
    parent: win, x: 0, y: 0, ...PET_BASE, frame: false, transparent: true, hasShadow: false, focusable: false, show: false,
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false, acceptFirstMouse: true,
    webPreferences: { preload: path.join(__dirname, 'pet-preload.js'), sandbox: true, contextIsolation: true },
  })
  petWin.webContents.on('will-navigate', e => e.preventDefault())
  petWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  petWin.on('closed', () => { petWin = null; petSent = ''; petAreaSent = ''; petDragStop() })
  petWin.webContents.once('did-finish-load', () => {
    petSent = ''; petAreaSent = ''
    render(true); petSync()
    petWin.webContents.send('pet-enter')
  })
  petWin.loadFile(path.join(__dirname, 'ui', 'pet.html'))
}
ipcMain.on('pet', (e, type, arg) => {
  if (e.sender !== petWin?.webContents) return
  if (type === 'grab') return arg ? petDragStart() : petDragStop()
  if (type === 'pos' && !petDrag && Number.isFinite(arg?.cx) && Number.isFinite(arg?.by)) {
    state.pet.cx = arg.cx; state.pet.by = arg.by
    petPlace()
    if (arg.save) render() // posisi bertengger disimpan
  }
  if (type === 'size' && Number.isFinite(arg?.w) && Number.isFinite(arg?.h)) { petSize = { w: clamp(arg.w, 80, 260), h: clamp(arg.h, 80, 200) }; petPlace() }
  if (type === 'stats') { win.focus(); win.webContents.send('open-stats') }
  if (type === 'gone') petWin?.close()
})
// tab dijatuhkan ke Almi: hanya tab yang memang sedang diseret dari sidebar Almac
ipcMain.handle('pet-eat', e => {
  if (e.sender !== petWin?.webContents) return null
  const t = state.tabs.find(t => t.id === petFeedTab)
  petFeedTab = null
  if (!t) return null
  state.tabsEaten = (state.tabsEaten || 0) + 1
  setTimeout(() => { if (state.tabs.includes(t)) closeTab(t) }, 900) // ditutup setelah animasi mengunyah
  return { title: (t.title || t.url || '').slice(0, 80), favicon: /^https:/.test(t.favicon || '') ? t.favicon : '' }
})

function buildMenu() {
  const send = ch => () => { win.webContents.focus(); win.webContents.send(ch) }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Almac Browser',
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => { updater.check({ manual: true }); send('open-update')() } },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('open-settings') },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
      ],
    },
    {
      label: 'Tab',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => { commands.newTab(); send('focus-url')() } },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => commands.closeActive() },
        { label: 'Pin / Unpin Tab', accelerator: 'CmdOrCtrl+Shift+D', click: () => commands.pinTab() },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => commands.reopenTab() },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: send('open-palette') },
        { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => commands.openPrivate() },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: send('focus-url') },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => { commands.findOpen(); send('open-find')() } },
        { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: send('find-next') },
        { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: send('find-prev') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => commands.zoom(1) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => commands.zoom(1) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => commands.zoom(-1) },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => commands.zoom(0) },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: send('toggle-downloads') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: commands.reload },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: commands.back },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: commands.forward },
        { label: 'History', accelerator: 'CmdOrCtrl+Y', click: send('toggle-history') },
        { label: 'Bookmark This Page', accelerator: 'CmdOrCtrl+D', click: send('bookmark-current') },
        { label: 'Bookmarks', accelerator: 'CmdOrCtrl+Alt+B', click: send('toggle-bookmarks') },
        { label: 'Show/Hide Bookmark Bar', accelerator: 'CmdOrCtrl+Shift+B', click: () => commands.bookmarkBarToggle() },
        { label: 'Import from Chrome/Brave…', click: send('open-import') },
        { label: 'Show/Hide Sidebar', accelerator: 'CmdOrCtrl+S', click: () => commands.sidebarToggle() },
        { type: 'separator' },
        { label: 'Next Workspace', accelerator: 'CmdOrCtrl+Alt+Right', click: () => commands.wsStep(1) },
        { label: 'Previous Workspace', accelerator: 'CmdOrCtrl+Alt+Left', click: () => commands.wsStep(-1) },
        { type: 'separator' },
        { label: 'Passwords', accelerator: 'CmdOrCtrl+Shift+P', click: send('open-passwords') },
        { label: 'Autofill Login', accelerator: 'CmdOrCtrl+Shift+L', click: () => commands.pwFillActive() },
        { label: 'Find Password in Keychain', click: () => commands.passwords() },
        { label: 'Radio Widget', accelerator: 'CmdOrCtrl+Shift+M', click: () => toggleMusic() },
        { label: 'Picture in Picture', accelerator: 'CmdOrCtrl+Alt+P', click: () => commands.pip() },
        { label: 'Page DevTools', accelerator: 'CmdOrCtrl+Alt+I', click: () => activeTab()?.view?.webContents.toggleDevTools() },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]))
}

app.whenReady().then(async () => {
  load()
  applyDns()
  setInterval(watchVpn, 5000) // GlobalProtect dll. tersambung/putus -> DoH dijeda/aktif lagi
  nativeTheme.themeSource = state.theme
  try {
    // Daftar filter yang sama dipakai Ghostery/uBlock (EasyList, EasyPrivacy, dll), di-cache ke disk
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(DATA, 'adblock.bin'),
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    })
    // ponytail: scriptlet json-edit-xhr-request yang menandai request player YouTube dengan "#reloadxhr" membuat video
    // berikutnya (klik video dari dalam YouTube) macet buffering + "Mengalami gangguan?" (player mengulang request terus).
    // Terbukti lewat bisect (tanpa scriptlet ini 4/4 normal, dengan scriptlet ini 4/4 macet). Lewati scriptlet itu saja --
    // dicek di argumennya, karena kode implementasinya sama di semua scriptlet. Hapus kalau filter list sudah diperbaiki.
    const skipScriptlet = js => /reloadxhr/.test(decodeURIComponent(js.slice(js.lastIndexOf('(...['))))
    // Perbaikan bug Ghostery yang merusak player YouTube:
    // 1. scriptlet iframe disuntik ke main frame -> arahkan ke frame pengirimnya
    // 2. scriptlet tidak dibungkus -> `class JSONPath`/`safeSelf` saling bentrok di global. Bungkus per script.
    const inject = blocker.onInjectCosmeticFilters
    blocker.onInjectCosmeticFilters = (e, url, msg) => inject({
      frameId: e.frameId,
      processId: e.processId,
      sender: {
        insertCSS: (css, opts) => e.sender.insertCSS(css, opts),
        executeJavaScript: (js, gesture) => skipScriptlet(js) ? null : e.senderFrame?.executeJavaScript(`(function(){${js}\n})()`, gesture).catch(() => {}),
      },
    }, url, msg)
    blocker.on('request-blocked', req => {
      const t = state.tabs.find(t => t.view?.webContents.id === req.tabId)
      // hitung URL unik per halaman: beberapa skrip iklan mengulang request yang diblokir ribuan kali per detik
      if (!t || t.blockedSeen?.has(req.url)) return
      ;(t.blockedSeen ||= new Set()).add(req.url)
      t.blocked++
      render()
      const k = dayKey()
      state.stats[k] = (state.stats[k] || 0) + 1
      petWin?.webContents.send('pet-eat', state.stats[k])
      if (Object.keys(state.stats).length > 60) delete state.stats[Object.keys(state.stats).sort()[0]] // simpan ~2 bulan
    })
  } catch (e) {
    console.error('adblock gagal dimuat (offline?):', e.message)
  }

  app.dock?.setIcon(path.join(__dirname, 'build', 'icon.png')) // ikon pixel Almac di Dock (mode dev)
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession) // ikon ekstensi di sidebar
  profileCtx(state.activeProfile) // daftarkan handler ekstensi sebelum UI dimuat
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: SIDEBAR_MIN + PAGE_MIN + GAP * 2, minHeight: 400,
    title: 'Almac Browser',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141623' : '#7eebd3',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 13 }, // titik tengah ~19.5px = tengah header sidebar (39px)
    icon: path.join(__dirname, 'build', 'icon.png'), // Windows/Linux
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false, contextIsolation: true },
  })
  win.on('resize', () => { layout(); render() }) // lebar sidebar efektif bisa berubah
  for (const ev of ['move', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen']) win.on(ev, petSync)
  win.setWindowButtonVisibility?.(state.sidebar.mode === 'pinned') // tombol jendela macOS ikut sidebar
  win.on('closed', () => { win = null; clearTimeout(renderTimer) })
  // geser 3 jari (macOS: Trackpad > More Gestures > Swipe between pages = 3 jari) di atas panel tab -> ganti workspace
  win.on('swipe', (_, dir) => {
    if (dir !== 'left' && dir !== 'right') return
    const cursorX = screen.getCursorScreenPoint().x - win.getContentBounds().x
    if (cursorX < sideSpace() + GAP || peeking) commands.wsStep(dir === 'left' ? 1 : -1) // hanya saat kursor di sidebar
  })
  updater = createUpdater({ app, onChange: () => render(true) })
  setTimeout(() => updater.check(), 15000) // cek diam-diam: hanya memberi tahu kalau ada versi baru
  setInterval(() => updater.check(), 6 * 3600000)
  buildMenu()
  for (const ev of ['lock-screen', 'suspend']) powerMonitor.on(ev, pwLock) // layar dikunci / sleep -> brankas dikunci
  // jendela UI punya preload (window.almac): jangan pernah memuat situs luar di sini (mis. link di-drag ke sidebar)
  win.webContents.on('will-navigate', e => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await win.loadFile(path.join(__dirname, 'ui', 'index.html'))
  commands.switchProfile(state.activeProfile)
  if (state.music?.on) toggleMusic()
  if (state.pet.out) petOut(true)

  setInterval(() => {
    if (!win) return
    const now = Date.now()
    for (const t of state.tabs) {
      // hemat memori: tab tidak aktif (tidak tampil, tidak bersuara) ditidurkan setelah state.sleepAfter menit
      if (state.sleepAfter && t.view && !isShown(t) && now - (t.lastActive || 0) > state.sleepAfter * 60000 && !t.view.webContents.isCurrentlyAudible() && t !== musicTab) sleep(t)
    }
    if (vault.unlocked() && now - pwLastUse > state.pwLockAfter * 60000) pwLock()
    if (state.focus.until && !focusOn()) { state.focus.until = 0; win.webContents.send('toast', 'Focus session finished. Nice work!') }
    // sesi privat dihapus otomatis kalau tidak dipakai selama privateWipeAfter menit
    const priv = state.profiles.find(p => p.ephemeral)
    if (priv && state.activeProfile === priv.id) privSeen = now
    else if (priv && state.privateWipeAfter && now - privSeen > state.privateWipeAfter * 60000) { const back = state.activeProfile; commands.closePrivate(); commands.switchProfile(back) }
    render()
  }, 60 * 1000)
})

// sertifikat tidak valid: ditolak (Electron default), kecuali user memilih "Proceed anyway" untuk sertifikat yang sama persis
app.on('certificate-error', (event, wc, url, error, certificate, callback, isMainFrame) => {
  const host = hostOf(url)
  if (certAllowed.get(host) === certificate.fingerprint) { event.preventDefault(); return callback(true) }
  callback(false)
  const t = isMainFrame && state.tabs.find(t => t.view?.webContents === wc)
  if (t) t.certError = { url, error, fingerprint: certificate.fingerprint, issuer: certificate.issuerName }
})

app.on('window-all-closed', () => app.quit())
// simpan history yang belum ditulis (debounce 2 detik) sebelum keluar
app.on('before-quit', () => {
  clearTimeout(historyTimer); fs.writeFileSync(HISTORY_FILE, JSON.stringify(history))
  clearTimeout(bookmarkTimer); fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarks))
  const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
  fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(downloads.slice(-200).filter(d => !priv.has(d.p))))
})
