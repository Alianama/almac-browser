const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, dialog, clipboard, shell, screen, safeStorage, systemPreferences, powerMonitor, desktopCapturer, globalShortcut } = require('electron')
const os = require('os')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store')
const { ElectronBlocker } = require('@ghostery/adblocker-electron')
const { getDomain } = require('tldts-experimental')
const passwords = require('./passwords')
const { lookalike } = require('./lookalike')
const { jsonView, JSON_VIEW_CSS } = require('./viewer')
const { createUpdater } = require('./updater')

app.setName('Almac Browser')
const MAC = process.platform === 'darwin' // Windows/Linux: bingkai jendela, shortcut & path import berbeda (satu codebase)
const QUICK_KEY = MAC ? 'Alt+Space' : 'Alt+Shift+Space' // Windows: Alt+Space = menu jendela sistem
app.setAboutPanelOptions({ applicationName: 'Almac Browser', applicationVersion: app.getVersion(), iconPath: path.join(__dirname, 'build', 'icon.png') })
if (process.env.ALMAC_TEST_DATA) app.setPath('userData', process.env.ALMAC_TEST_DATA) // tes: folder data terpisah
// Satu instance saja: dua instance di folder data yang sama bisa merusak database (cookies, service worker)
if (!app.requestSingleInstanceLock()) app.exit(0)
// link dari app lain (Mail, Slack, Notes, ...) & file .html: dibuka sebagai tab baru. Datang sebelum jendela siap -> antre.
const pendingOpen = []
function openFromOutside(url) {
  if (!/^(https?:|file:)/i.test(url || '')) return
  if (!win || !uiReady) return pendingOpen.push(url)
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  newTab(url)
}
let uiReady = false
app.on('will-finish-launching', () => {
  app.on('open-url', (e, url) => { e.preventDefault(); openFromOutside(url) })
  app.on('open-file', (e, file) => { if (/\.(html?|xhtml|svg|pdf|txt)$/i.test(file)) { e.preventDefault(); openFromOutside(require('url').pathToFileURL(file).href) } })
})
app.on('second-instance', (_, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  argv.filter(a => /^https?:\/\//i.test(a)).forEach(openFromOutside) // Windows/Linux: link datang lewat argumen
})
const DATA = app.getPath('userData')
const STATE_FILE = path.join(DATA, 'state.json')
const FRESH_INSTALL = !fs.existsSync(STATE_FILE) // install baru: tidak perlu "What's new"
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
let state = { profiles: [], activeProfile: null, tabs: [], theme: 'system', skin: 'classic', extPrefs: {}, sitePerms: {}, sidebar: { mode: 'pinned', width: SIDEBAR }, bookmarkBar: true, favicons: {}, searchEngine: 'google', newTabPage: 'almac', sleepAfter: 10, zoom: {}, splitRatio: {}, customDns: '', dnsMode: 'auto', blockJavaScript: false, cookiePolicy: 'allow', doNotTrack: false, hardwareAcceleration: true, httpsOnly: true, stripTracking: true, privateWipeAfter: 0, stats: {}, pwLockAfter: 15, pwTouchId: false, dl: { mode: 'auto', dir: '', lastDir: '' }, pet: { out: true }, tabsEaten: 0, tabGroups: {}, boosts: {}, certTrust: {}, seenVersion: '', focus: { until: 0, sites: ['youtube.com', 'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'reddit.com'] } } // splitRatio: grup split -> rasio panel kiri // sleepAfter: menit, 0 = tidak pernah // tabs: {id, profileId, url, title, favicon, lastActive, blocked, view}
const ctx = {} // profileId -> { ses, extensions }
let nextTabId = 1
let modalOpen = false // modal pixel terbuka -> halaman web (native view) disembunyikan
let covered = false   // dropdown bookmark bar terbuka -> halaman diganti snapshot
const BAR_H = 24 // tinggi bookmark bar (samakan dengan --bar-h di theme.css); bar di y=5, halaman 5px di bawahnya
let findOpen = false // kotak cari di halaman (⌘F) memakai strip atas yang sama dengan bookmark bar
const barSpace = () => state.bookmarkBar || findOpen || !MAC ? BAR_H : 0 // Windows: strip atas selalu ada (tombol jendela di kanan atas) // GAP(10) + 24 = jarak atas halaman: bar 5px dari atas jendela & 5px dari halaman
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
// state.certTrust: sama, tapi diingat permanen (router, firewall, iLO/iDRAC, Proxmox, NAS pakai self-signed). Terikat fingerprint:
// sertifikat berganti -> ditanya lagi (seperti known_hosts SSH)
const lookalikeOk = new Set() // host mirip situs lain yang tetap dibuka user, hanya selama sesi
const expiryWarned = new Set() // host yang sudah diberi tahu sertifikatnya hampir kedaluwarsa (sekali per sesi)
const tabByWc = new WeakMap() // webContents -> tab (webRequest dipanggil untuk tiap request, jangan cari di state.tabs)
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
// perangkat jaringan internal: IP, nama tanpa titik (pve, nas), domain lokal -> sertifikat yang diizinkan diingat secara default
const isInternalHost = h => isLocalHost(h) || !h.includes('.') || /\.(lan|home|internal|intranet|corp|localdomain|home\.arpa)$/.test(h)
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
// pilihan: tab Almac (tanpa izin Screen Recording, bisa ikut suara tab), jendela, atau layar penuh
async function pickScreen(request) {
  if (!win) return null
  let host = ''
  try { host = new URL(request.securityOrigin).host } catch {}
  const asker = state.tabs.find(t => t.view && request.frame && t.view.webContents === webContentsOf(request.frame))
  const perm = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
  // layar/jendela hanya kalau izin sudah ada (kalau belum, getSources memunculkan prompt macOS tiap meeting)
  // getSources/capturePage bisa lambat atau macet (view tersembunyi): dibatasi waktu, supaya picker tetap muncul & Meet tidak error
  const sources = perm === 'granted' ? await within(desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true }), 4000, []) : []
  const list = sources.filter(s => !['Almi', 'Radio'].includes(s.name))
  const tabs = state.tabs.filter(t => t.profileId === (asker?.profileId ?? state.activeProfile) && /^https?:/.test(t.url || ''))
  const tabThumbs = await Promise.all(tabs.map(async t => {
    const img = t.view && await within(t.view.webContents.capturePage(), 1000, null)
    return img && !img.isEmpty() ? 'data:image/jpeg;base64,' + img.resize({ width: 320 }).toJPEG(65).toString('base64') : ''
  }))
  const id = ++screenSeq
  win.focus()
  win.webContents.send('screen-pick', {
    id, host, permission: perm, audio: !!request.audioRequested,
    tabs: tabs.map((t, i) => ({ id: t.id, title: t.title || t.url, host: hostOf(t.url), favicon: t.favicon || '', thumb: tabThumbs[i], self: t === asker })),
    sources: list.map(s => ({ id: s.id, name: s.name, kind: s.id.startsWith('screen') ? 'screen' : 'window',
      thumb: s.thumbnail.isEmpty() ? '' : 'data:image/jpeg;base64,' + s.thumbnail.toJPEG(70).toString('base64'),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '' })),
  })
  const chosen = await new Promise(resolve => pendingScreens.set(id, resolve))
  if (chosen?.tabId) { // share satu tab: frame utama tab itu = isi tab (+ suaranya kalau diminta)
    const t = state.tabs.find(t => t.id === chosen.tabId)
    if (!t) return null
    if (!t.view) wake(t)
    t.sharing = true // ponytail: tidak ditidurkan otomatis lagi selama sesi (akhir share tidak terdeteksi); tutup tab / restart untuk reset
    const frame = t.view.webContents.mainFrame
    return { video: frame, ...(chosen.audio && request.audioRequested ? { audio: frame } : {}) }
  }
  const src = list.find(s => s.id === chosen?.sourceId)
  return src ? { video: src } : null
}
const within = (p, ms, fallback) => Promise.race([p.catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))])
const webContentsOf = frame => { try { return require('electron').webContents.fromFrame(frame) } catch { return null } }

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

// tulis ke file sementara lalu rename (seperti brankas): app mati di tengah penulisan tidak merusak file lama
let tmpSeq = 0
function writeAtomic(file, data) {
  const tmp = `${file}.${++tmpSeq}.tmp`
  fs.writeFile(tmp, data, e => e ? console.error('simpan gagal:', file, e.message) : fs.rename(tmp, file, () => {}))
}
function writeAtomicSync(file, data) { fs.writeFileSync(file + '.tmp', data); fs.renameSync(file + '.tmp', file) }
// file rusak tidak boleh diam-diam diganti data kosong: disisihkan sebagai *.corrupt-<waktu> supaya masih bisa dipulihkan
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) {
    if (e.code !== 'ENOENT') { console.error('file data rusak, disisihkan:', file, e.message); try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`) } catch {} }
  }
}

function load() {
  state = { ...state, ...readJson(STATE_FILE) }
  if (typeof state.pet !== 'object' || !state.pet) state.pet = { out: state.pet !== false } // dulu boolean
  state.dl = { mode: 'auto', dir: '', lastDir: '', ...state.dl }
  if (!(state.skin in SKINS)) state.skin = 'classic'
  if (!state.profiles.length) state.profiles.push({ id: 'p1', name: 'Personal', color: '#41a6f6' })
  if (!state.profiles.some(p => p.id === state.activeProfile)) state.activeProfile = state.profiles[0].id
  state.profiles.forEach(workspaces)
  state.tabs = state.tabs.map(t => ({
    ...t, id: nextTabId++, view: null, blocked: 0, // dipulihkan dalam kondisi tidur
    container: profileOf(t.profileId)?.containers?.some(c => c.id === t.container) ? t.container : undefined,
    wsId: profileOf(t.profileId)?.workspaces.some(w => w.id === t.wsId) ? t.wsId : profileOf(t.profileId)?.workspaces[0].id,
  }))
  history = readJson(HISTORY_FILE) || []
  bookmarks = readJson(BOOKMARKS_FILE) || []
  downloads = (readJson(DOWNLOADS_FILE) || []).map(d => d.state === 'progressing' || d.state === 'paused' ? { ...d, state: 'interrupted' } : d)
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
// riwayat bisa ~5 MB: ditulis paling sering tiap 10 dtk (sisanya saat keluar), bukan tiap pindah halaman
function saveHistory() {
  if (historyTimer) return
  historyTimer = setTimeout(() => { historyTimer = null; writeAtomic(HISTORY_FILE, JSON.stringify(history)) }, 10000)
}
// indeks "profil\nurl" -> entri, supaya mencatat kunjungan tidak menelusuri 20.000 entri.
// Dibangun ulang otomatis kalau array riwayat diganti (filter/sort/slice di tempat lain).
let histIdx = null, histIdxFor = null
function histEntry(p, url) {
  if (histIdxFor !== history) { histIdx = new Map(history.map(h => [h.p + '\n' + h.url, h])); histIdxFor = history }
  return histIdx.get(p + '\n' + url)
}

function downloadsChanged() { // progres sering berubah -> simpan & render dibatasi
  downloadsVersion++
  if (downloadTimer) return
  downloadTimer = setTimeout(() => {
    downloadTimer = null
    downloads = downloads.slice(-200)
    const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
    writeAtomic(DOWNLOADS_FILE, JSON.stringify(downloads.filter(d => !priv.has(d.p))))
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
  bookmarkTimer = setTimeout(() => writeAtomic(BOOKMARKS_FILE, JSON.stringify(bookmarks)), 1000)
}
const isBookmarked = (profileId, url) => bookmarks.some(b => b.p === profileId && !b.folder && b.url === url)
const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const startsWith = (path, prefix) => prefix.every((x, i) => path[i] === x)

// ---- import dari browser Chromium lain di perangkat ini (Chrome, Brave, Edge, Arc, Vivaldi) ----
// [nama, folder di ~/Library/Application Support (mac), folder di %LOCALAPPDATA% (Windows)]
const CHROMIUM_BROWSERS = {
  chrome: ['Google Chrome', 'Google/Chrome', 'Google/Chrome/User Data'], brave: ['Brave', 'BraveSoftware/Brave-Browser', 'BraveSoftware/Brave-Browser/User Data'],
  edge: ['Microsoft Edge', 'Microsoft Edge', 'Microsoft/Edge/User Data'], arc: ['Arc', 'Arc/User Data'],
  vivaldi: ['Vivaldi', 'Vivaldi', 'Vivaldi/User Data'], chromium: ['Chromium', 'Chromium', 'Chromium/User Data'],
}
const browserDir = key => MAC ? path.join(app.getPath('appData'), CHROMIUM_BROWSERS[key][1])
  : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), CHROMIUM_BROWSERS[key][2])
const chromeTime = t => Math.round(Number(t) / 1000 - 11644473600000) // date_added bookmark (string mikrodetik sejak 1601) -> ms unix

function importSources() {
  const out = []
  for (const [key, [label, , winDir]] of Object.entries(CHROMIUM_BROWSERS)) {
    if (!MAC && !winDir) continue // Arc: tidak dicari di Windows
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
        history.push(entry); mine.set(r.url, entry); result.history++; histIdxFor = null
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
  if (!/^https?:/.test(t.url) || profileOf(t.profileId)?.ephemeral || profileOf(t.profileId)?.tempAfter) return // privat & profil sementara: tidak dicatat
  let h = histEntry(t.profileId, t.url)
  if (!h) { h = { url: t.url, title: '', ts: 0, n: 0, p: t.profileId }; history.push(h); histIdx.set(h.p + '\n' + h.url, h) }
  h.title = t.title || h.title
  h.ts = Date.now()
  if (visit) h.n++
  if (history.length > HISTORY_MAX) history = history.sort((a, b) => b.ts - a.ts).slice(0, HISTORY_MAX)
  saveHistory()
}

let renderTimer, stateTimer = null, stateToSave = ''
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
      pinned: !!t.pinned, atPin: !t.pinned || t.url === t.pinUrl, pinUrl: t.pinUrl || '', loading: !!t.loadStart,
      count: tabCount(t), capturing: !!t.capturing?.size, audible: !!t.view?.webContents.isCurrentlyAudible(), muted: !!t.view?.webContents.isAudioMuted(), tg: t.tg || null,
      code: t.resp?.badge || '', codeTitle: t.resp ? t.resp.chain.map(h => `${h.code} ${h.url}`).join('\n') : '',
      container: isTemp(t.container) ? { id: t.container, name: 'Disposable', color: '#ff6b7a', temp: true } : containerOf(t) || null,
    })),
    tabGroups: state.tabGroups,
    url: active?.url || active?.loadError?.url || '',
    loadError: active?.loadError || null,
    loading: active?.loadStart ? { progress: active.progress || 0.1, since: active.loadStart, host: hostOf(active.url) } : null,
    security: security(active),
    bookmarked: !!active && isBookmarked(active.profileId, active.url),
    blocked: active?.blocked || 0,
    adblock: !!blocker,
    theme: state.theme, skin: state.skin,
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
    dl: { mode: state.dl.mode, dir: state.dl.dir && fs.existsSync(state.dl.dir) ? state.dl.dir : app.getPath('downloads'), custom: !!state.dl.dir && fs.existsSync(state.dl.dir) }, /* folder yang benar-benar dipakai */ appVersion: app.getVersion(), defaultBrowser: app.isDefaultProtocolClient('https'), canSetDefault: app.isPackaged && MAC, pet: { out: !!state.pet.out }, tabsEaten: state.tabsEaten || 0, update: updater?.get() || { status: 'idle' },
    pw: { setup: vault.exists(), unlocked: vault.unlocked(), touchId: state.pwTouchId && fs.existsSync(TOUCH_FILE), canTouchId: process.platform === 'darwin' && systemPreferences.canPromptTouchID?.() && safeStorage.isEncryptionAvailable(), lockAfter: state.pwLockAfter },
  })
  const petState = JSON.stringify({ sleeping: !state.tabs.some(t => t.view), today: state.stats[dayKey()] || 0 })
  if (petWin && petState !== petSent) { petSent = petState; petWin.webContents.send('pet-state', JSON.parse(petState)) }
  // profil privat tidak pernah ditulis ke disk; tab profil sementara tidak dipulihkan setelah restart
  const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
  const tabs = state.tabs.filter(t => !priv.has(t.profileId) && !isTemp(t.container) && !profileOf(t.profileId)?.tempAfter).map(({ profileId, wsId, url, title, favicon, lastActive, group, pinned, pinUrl, tg, container }) => ({ profileId, wsId, url, title, favicon, lastActive, group, pinned, pinUrl, tg, container }))
  for (const gid in state.tabGroups) if (!state.tabs.some(t => t.tg === gid)) delete state.tabGroups[gid] // grup tanpa tab dibuang
  const profiles = state.profiles.filter(p => !p.ephemeral)
  const sitePerms = Object.fromEntries(Object.entries(state.sitePerms).filter(([id]) => !priv.has(id)))
  const activeProfile = priv.has(state.activeProfile) ? profiles[0]?.id : state.activeProfile
  stateToSave = JSON.stringify({ ...state, tabs, profiles, sitePerms, activeProfile })
  stateTimer ||= setTimeout(() => { stateTimer = null; writeAtomic(STATE_FILE, stateToSave) }, 1000) // dikumpulkan, bukan tiap render
}

// nama di sertifikat (Subject Alternative Name) dari PEM yang diberikan Chromium
const sanOf = pem => { try { return (new crypto.X509Certificate(pem).subjectAltName || '').split(', ').filter(Boolean).map(x => x.replace(/^(DNS|IP Address):/, '')).slice(0, 100) } catch { return [] } }
// versi TLS & cipher: Electron tidak memberikannya -> jabat tangan TLS sendiri ke server (tanpa request HTTP), saat Site info dibuka.
// ponytail: koneksi langsung dari Node, bukan lewat Chromium -> dilewati kalau profil memakai proxy; cipher bisa beda dari Chromium
function tlsProbe(host, port) {
  return new Promise(resolve => {
    const done = v => { resolve(v); sock.destroy() }
    const sock = require('tls').connect({ host: host.replace(/^\[|\]$/g, ''), port: +port || 443, servername: require('net').isIP(host.replace(/^\[|\]$/g, '')) ? undefined : host, rejectUnauthorized: false, ALPNProtocols: ['h2', 'http/1.1'] }, () => {
      const c = sock.getCipher(), k = sock.getEphemeralKeyInfo()
      done({ protocol: sock.getProtocol(), cipher: c?.standardName || c?.name || '', kx: k?.name || k?.type || '', alpn: sock.alpnProtocol || '' })
    })
    sock.setTimeout(4000, () => done(null))
    sock.on('error', () => done(null))
  })
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

// container (seperti Firefox): cookie & login terpisah di dalam satu profil (mis. 3 akun AWS di satu workspace).
// 'tmp…' = tab sekali pakai: sesi hanya di memori, dibuang saat tab terakhirnya ditutup (buka link mencurigakan).
const isTemp = c => !!c && c.startsWith('tmp')
const ctxKey = (profileId, container) => container ? profileId + '~' + container : profileId
const partitionOf = (profileId, container) => isTemp(container) ? 'tmp-' + container
  : container ? 'persist:' + profileId + '~' + container
  : profileOf(profileId)?.ephemeral ? 'private-' + profileId : 'persist:' + profileId // privat: tanpa "persist:" = hanya di memori
const containerOf = t => t?.container && !isTemp(t.container) ? profileOf(t.profileId)?.containers?.find(c => c.id === t.container) : null
const tabCtx = t => profileCtx(t.profileId, t.container)
// proxy per profil (container & tab sekali pakai ikut proxy profilnya). Electron: satu pengaturan proxy per sesi
const PROXY_MODES = ['system', 'direct', 'fixed', 'pac']
function proxyConfig(profileId) {
  const x = profileOf(profileId)?.proxy
  if (x?.mode === 'fixed' && x.rules) return { mode: 'fixed_servers', proxyRules: x.rules, proxyBypassRules: x.bypass || '<local>' }
  if (x?.mode === 'pac' && x.pac) return { mode: 'pac_script', pacScript: x.pac }
  return { mode: x?.mode === 'direct' ? 'direct' : 'system' }
}
const viaProxy = profileId => ['fixed_servers', 'pac_script'].includes(proxyConfig(profileId).mode)
function applyProxy(profileId) {
  for (const [k, c] of Object.entries(ctx)) if (k === profileId || k.startsWith(profileId + '~'))
    c.ready = c.ses.setProxy(proxyConfig(profileId)).then(() => c.ses.closeAllConnections()).catch(e => console.error('proxy:', e.message))
}
// log request per tab (investigasi): domain yang dihubungi halaman, jumlah request, yang diblokir. Direset tiap pindah halaman.
function logRequest(t, d) {
  const host = hostOf(d.url)
  if (!host) return
  const log = t.reqs ||= new Map()
  let r = log.get(host)
  if (!r) { if (log.size >= 500) return; log.set(host, r = { n: 0, blocked: 0, types: new Set() }) }
  r.n++
  r.types.add(d.resourceType)
}
// kode HTTP halaman -> badge pendek di tab: error terakhir (502), atau kode redirect pertama (301). 200 biasa tanpa badge.
// Rantai lengkap (301 › 200) ada di tooltip tab & Site info.
const codeBadge = chain => { const last = chain.at(-1).code; return last >= 300 ? String(last) : chain.length > 1 ? String(chain[0].code) : '' }

function profileCtx(profileId, container) {
  const key = ctxKey(profileId, container)
  if (ctx[key]) return ctx[key]
  const temp = isTemp(container) || !!profileOf(profileId)?.ephemeral
  const ses = session.fromPartition(partitionOf(profileId, container))
  ses.setUserAgent(UA)
  ses.setSpellCheckerEnabled(true)
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'media-preload.js') }) // widget musik
  if (!temp) ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'password-preload.js') }) // privat/sekali pakai: tanpa autofill/simpan
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
      result: req.verificationResult, knownRoot: req.isIssuedByKnownRoot, san: sanOf(c.data),
    })
    cb(-3)
  })
  ses.setPermissionRequestHandler((wc, permission, callback, details) => { onPermissionRequest(profileId, permission, details).then(callback) })
  // share screen (Meet, Zoom, Teams, ...): tanpa handler ini getDisplayMedia selalu ditolak Electron.
  // macOS 15+: picker bawaan sistem (handler tidak dipanggil); selain itu picker Almac.
  // picker Almac (bukan picker sistem macOS) supaya tab Almac juga bisa dipilih
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickScreen(request).then(streams => callback(streams)).catch(e => { console.error('share screen:', e); callback(null) })
  })
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
    const tab = details.webContents && tabByWc.get(details.webContents)
    if (tab) logRequest(tab, details)
    if (details.resourceType === 'mainFrame' && /^https?:/.test(details.url)) {
      const u = new URL(details.url)
      // situs mirip merek terkenal (paypa1.com, аpple.com): tahan dulu, tampilkan peringatan (did-fail-load -> halaman error)
      const fake = tab && !lookalikeOk.has(u.hostname) && !isInternalHost(u.hostname) && lookalike(u.hostname)
      if (fake) { tab.lookalike = { url: details.url, ...fake }; return callback({ cancel: true }) }
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
    const tab = details.resourceType === 'mainFrame' && details.webContents && tabByWc.get(details.webContents)
    if (tab && !/internal redirect/i.test(details.statusLine)) { // kode HTTP & header respons halaman (Site info); redirect buatan Almac/Chromium dilewati
      const prev = (tab.resp?.chain || []).filter((h, i, a) => !(i === a.length - 1 && h.url === details.url)) // ulang di URL sama (login 401) bukan redirect
      const chain = [...prev, { code: details.statusCode, url: details.url }].slice(-10)
      const headers = Object.entries(h || {}).flatMap(([k, vs]) => vs.map(v => [k, String(v).slice(0, 2000)])).slice(0, 200)
      tab.resp = { chain, line: details.statusLine, headers, badge: codeBadge(chain) }
      render()
    }
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
    createTab: async d => [newTab(d.url || engine().home, profileId, d.active !== false, container).view.webContents, win],
    selectTab: wc => { const t = findTab(wc); if (t) selectTab(t) },
    removeTab: wc => { const t = findTab(wc); if (t) closeTab(t) },
    createWindow: async d => { newTab([].concat(d.url || engine().home)[0], profileId, true, container); return win },
  })
  // proxy dipasang sebelum halaman pertama dimuat (wake menunggu ready), supaya tidak ada request yang lolos tanpa proxy
  ctx[key] = { ses, extensions, ready: ses.setProxy(proxyConfig(profileId)).catch(e => console.error('proxy:', e.message)) }
  // ponytail: web store selalu memuat semua ekstensi di folder -> yang dinonaktifkan langsung di-unload lagi.
  ses.extensions.on('extension-loaded', (_, ext) => {
    if (extPrefs(profileId).disabled[ext.id]) setImmediate(() => ses.extensions.removeExtension(ext.id))
    render()
  })
  ses.extensions.on('extension-unloaded', render)
  // Ekstensi tiap profil disimpan terpisah, seperti Chrome
  // unduhan langsung ke folder Downloads (nama unik), progres ditampilkan di Library > Unduhan
  // lokasi unduhan (Settings): auto = folder pilihan, last = folder terakhir dipakai, ask = dialog "Save as" tiap kali
  ses.on('will-download', (_, item) => {
    const dl = state.dl, exists = d => d && fs.existsSync(d)
    const home = exists(dl.dir) ? dl.dir : app.getPath('downloads')
    const base = dl.mode === 'last' && exists(dl.lastDir) ? dl.lastDir : home
    let file = ''
    if (dl.mode === 'ask') item.setSaveDialogOptions({ title: 'Save file', defaultPath: path.join(exists(dl.lastDir) ? dl.lastDir : home, item.getFilename()) })
    else { file = uniquePath(base, item.getFilename()); item.setSavePath(file) }
    const d = { id: uid('d'), filename: path.basename(file || item.getFilename()), path: file, url: item.getURL(), total: item.getTotalBytes(), received: 0, state: 'progressing', ts: Date.now(), p: profileId }
    // dialog "Save as": path baru diketahui setelah user memilih -> ingat foldernya sebagai folder terakhir
    const learn = () => { const p = item.getSavePath(); if (p && p !== d.path) { d.path = p; d.filename = path.basename(p); dl.lastDir = path.dirname(p) } }
    downloads.push(d)
    liveDownloads.set(d.id, item)
    win?.webContents.send('download-started', d.filename)
    item.on('updated', (_, st) => { learn(); d.received = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.state = st === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'; downloadsChanged() })
    item.once('done', (_, st) => { learn(); d.received = item.getReceivedBytes(); d.state = st; liveDownloads.delete(d.id); downloadsChanged() })
    downloadsChanged()
  })
  // ponytail: ekstensi hanya di sesi utama profil; container & privat tanpa ekstensi (seperti incognito Chrome)
  if (!temp && !container)
    installChromeWebStore({ session: ses, extensionsPath: extDir(profileId) })
      .catch(e => console.error('web store:', e))
      .then(() => { for (const dir of extPrefs(profileId).unpacked) if (fs.existsSync(dir)) ses.extensions.loadExtension(dir).catch(e => console.error('unpacked:', dir, e.message)) })
  return ctx[key]
}

const extDir = profileId => path.join(DATA, 'Extensions', profileId)
// semua sesi tersimpan milik profil: sesi utama + tiap container (hapus data / hapus profil)
const profileSessions = profileId => [ctx[profileId]?.ses || session.fromPartition(partitionOf(profileId)), ...(profileOf(profileId)?.containers || []).map(c => ctx[ctxKey(profileId, c.id)]?.ses || session.fromPartition(partitionOf(profileId, c.id)))]
const extPrefs = profileId => { const p = (state.extPrefs[profileId] ||= { unpinned: [], disabled: {} }); p.unpacked ||= []; return p } // unpacked: folder ekstensi mode developer

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
    unpacked: prefs.unpacked.includes(e.path),
  }))
  const off = Object.entries(prefs.disabled).map(([id, d]) => ({ id, name: d.name, version: d.version, enabled: false, pinned: false, options: false }))
  return [...loaded, ...off].sort((a, b) => a.name.localeCompare(b.name))
}

function activeTab() {
  return state.tabs
    .filter(t => t.profileId === state.activeProfile && t.wsId === activeWs())
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0]
}

const pageView = ses => new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, spellcheck: true, javascript: !state.blockJavaScript } })
// view: halaman yang sudah termuat (Glance dijadikan tab) -> tidak dimuat ulang
function wake(t, view) {
  if (!t.url) return // tab baru kosong: halaman Almac di UI, belum ada webContents
  const c = tabCtx(t)
  t.view = view || pageView(c.ses)
  t.view.setBorderRadius(10)
  const wc = t.view.webContents
  tabByWc.set(wc, t)
  c.extensions.addTab(wc, win)
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'new-window') return { action: 'allow' } // popup login (OAuth) butuh window.opener
    const n = newTab(url, t.profileId, disposition !== 'background-tab', t.container) // tetap di container yang sama
    if (disposition === 'background-tab') n.lastActive = (t.lastActive || Date.now()) - 1
    return { action: 'deny' }
  })
  const live = () => t.view?.webContents === wc // halaman yang sedang ditutup (unload) tidak boleh mengubah tab lagi
  const sync = visit => { if (!live()) return; t.url = wc.getURL(); t.title = wc.getTitle(); addHistory(t, visit); render() }
  // video fullscreen (YouTube, Netflix, ...): halaman menutupi seluruh jendela seperti Chrome, tanpa sidebar & bar
  // (jendelanya sendiri masuk/keluar fullscreen oleh Electron; jangan ikut memanggil setFullScreen, keluar-nya jadi macet)
  wc.on('enter-html-full-screen', () => { htmlFull = t; layout() })
  wc.on('leave-html-full-screen', () => { if (htmlFull === t) { htmlFull = null; layout() } })
  // tab dipin terkunci ke situsnya: link ke situs lain dibuka di tab baru (ubah lewat "Edit pinned tab")
  wc.on('will-navigate', e => {
    if (!pinLocked(t, e.url)) return
    e.preventDefault()
    newTab(e.url, t.profileId, true, t.container)
  })
  // progres muat: mulai navigasi -> respons datang -> DOM siap -> selesai (Electron tidak memberi persentase)
  const progress = p => { if (!live()) return; t.progress = p; if (p >= 1) t.loadStart = 0; render() }
  wc.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => { if (isMainFrame && !isSameDocument && live()) { t.loadStart = Date.now(); progress(0.1) } })
  wc.on('did-navigate', () => progress(0.45))
  wc.on('dom-ready', () => progress(0.8))
  wc.on('did-stop-loading', () => progress(1))
  // navigator.userAgent (JS) di halaman login sama dengan header (konsisten), situs lain Chrome
  wc.on('did-start-navigation', ({ url, isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return
    const want = isGoogleLogin(url) ? GOOGLE_LOGIN_UA : UA
    if (wc.getUserAgent() !== want) wc.setUserAgent(want)
  })
  wc.on('focus', () => { // klik di panel split lain -> panel itu jadi tab aktif (kolom alamat ikut)
    if (t !== activeTab() && isShown(t)) { t.lastActive = Date.now(); tabCtx(t).extensions.selectTab(wc); render(true) }
  })
  wc.on('media-started-playing', () => { musicTab = t; t.playing = true })
  wc.on('media-paused', () => { t.playing = false })
  wc.on('audio-state-changed', () => { t.lastAudible = Date.now(); render() }) // ikon speaker di tab; mulai/berhenti bersuara = baru saja bersuara
  wc.on('context-menu', (_, p) => pageMenu(wc, t, p).popup({ window: win }))
  wc.on('dom-ready', () => { applyBoost(wc); viewJson(wc) })
  // renderer crash: tab di belakang ditidurkan (dimuat ulang saat dipilih), tab yang tampil -> tanya muat ulang
  wc.on('render-process-gone', (_, d) => {
    if (d.reason === 'clean-exit' || !state.tabs.includes(t)) return
    if (!isShown(t)) return setImmediate(() => { sleep(t); render() })
    win?.webContents.send('tab-crashed', { id: t.id, title: t.title || t.url, reason: d.reason })
  })
  // HTTPS-Only: versi https gagal -> tawarkan buka versi http (tidak aman)
  // halaman gagal dimuat -> halaman error Almac (bukan layar putih)
  wc.on('did-fail-load', (_, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !live()) return // -3 = dibatalkan (pindah halaman, tombol stop)
    if (t.lookalike?.url === url) { const l = t.lookalike; t.lookalike = null; return setLoadError(t, { kind: 'lookalike', code: 'LOOKALIKE_DOMAIN', url, host: hostOf(url), shown: l.host, target: l.target }) }
    const https = url.replace(/^http:/, 'https:') // juga kasus https -> redirect balik ke http (loop)
    if (upgraded.has(https)) { // HTTPS-Only: versi https gagal -> tawarkan http
      upgraded.delete(https)
      return setLoadError(t, { kind: 'https', code: desc, url: url.replace(/^https:/, 'http:'), host: hostOf(url) })
    }
    const cert = t.certError?.url === url && t.certError
    if (cert || (code <= -200 && code > -300)) return setLoadError(t, { kind: 'cert', code: desc, url, host: hostOf(url), text: CERT_TEXT['net::' + desc.replace(/^net::/, '')] || 'The site\'s security certificate is not valid.', issuer: cert?.issuer || '', internal: isInternalHost(hostOf(url)), changed: !!cert?.changed })
    setLoadError(t, { kind: 'net', code: desc, url, host: hostOf(url), dns: code === -105 && state.dnsMode === 'doh' })
  })
  wc.on('did-start-navigation', ({ url, isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return
    t.resp = null; t.reqs = null; t.capturing = null; t.playing = false // log request, header, status meeting/media milik halaman baru
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
  // HTTP 4xx/5xx tanpa isi (mis. 502 kosong) = layar putih -> halaman error seperti Chrome "HTTP ERROR 500"
  wc.on('did-navigate', (_, url, status) => { t.httpStatus = status })
  wc.on('did-finish-load', () => {
    const url = wc.getURL(), status = t.httpStatus
    if (!(status >= 400) || t.loadError) return
    wc.executeJavaScript('!document.body || (!document.body.innerText.trim() && !document.body.querySelector("img,svg,video,canvas,iframe,object,embed"))', true)
      .then(empty => { if (empty && !wc.isDestroyed() && wc.getURL() === url) setLoadError(t, { kind: 'http', code: `HTTP ERROR ${status}`, url, host: hostOf(url) }) })
      .catch(() => {})
  })
  wc.on('found-in-page', (_, r) => { if (t === activeTab()) win?.webContents.send('find-result', { active: r.activeMatchOrdinal, matches: r.matches }) })
  // zoom per situs: terapkan zoom tersimpan setiap pindah halaman
  wc.on('did-navigate', () => { const z = state.zoom[hostOf(wc.getURL())]; if (z && z !== 1) wc.setZoomFactor(z) })
  wc.on('did-navigate', () => { t.blockedSeen = null; sync(true); if (t.pendingPw) setTimeout(() => pwOffer(t), 600) })
  // sertifikat habis dalam 14 hari -> beri tahu sekali per sesi (berguna untuk audit server sendiri)
  wc.on('did-navigate', (_, url) => {
    const host = hostOf(url), c = /^https:/.test(url) && certs.get(t.profileId + '|' + host)
    const days = c ? Math.floor((c.validExpiry * 1000 - Date.now()) / 864e5) : Infinity
    if (days > 14 || expiryWarned.has(host)) return
    expiryWarned.add(host)
    toast(days < 0 ? `Certificate for ${host} has expired` : `Certificate for ${host} expires in ${days} ${days === 1 ? 'day' : 'days'}`)
  })
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
  if (!view) c.ready.then(() => { if (!wc.isDestroyed()) wc.loadURL(t.url) })
}

// tab sekali pakai terakhir ditutup: cookie, cache, storage sesinya dibuang
function dropTemp(profileId, container) {
  const key = ctxKey(profileId, container), c = ctx[key]
  if (!c) return
  delete ctx[key]
  c.ses.clearData().catch(() => {})
}

// tab sibuk = jangan ditidurkan otomatis: meeting (kamera/mikrofon aktif), share layar, media diputar (walau di-mute),
// bersuara dalam 5 menit terakhir (jeda antar lagu / bagian sunyi), atau tab musik terakhir (widget radio)
const busy = t => !!(t.sharing || t.capturing?.size || t.playing || t.view?.webContents.isCurrentlyAudible() || Date.now() - (t.lastAudible || 0) < 5 * 60000 || t === musicTab)

function sleep(t) {
  if (!t.view) return
  const view = t.view
  if (htmlFull === t) htmlFull = null
  win?.contentView.removeChildView(view)
  shownViews = shownViews.filter(v => v !== view)
  t.view = null
  t.loadStart = 0
  closePage(view.webContents)
}
// tutup halaman seperti Chrome menutup tab: dialog beforeunload dilewati, tapi pagehide/unload tetap dijalankan.
// close() biasa membunuh halaman tanpa unload -> Meet/Zoom/Teams tidak sempat mengirim "keluar", sesi meeting tertinggal.
function closePage(wc) {
  if (wc.isDestroyed()) return
  wc.on('will-prevent-unload', e => e.preventDefault())
  wc.close({ waitForBeforeUnload: true })
  setTimeout(() => { if (!wc.isDestroyed()) wc.close() }, 3000) // halaman macet di unload
}

// ---- tidur pintar: batas dasar (Settings) dikali sesuai isi tab ----
// aplikasi (mail, chat, docs) & tab dipin/bernotifikasi bangun lebih lama (notifikasi tidak hilang), tab ringan juga;
// tab berat (>700 MB) tidur lebih cepat. Tab yang sedang diisi (teks belum terkirim) tidak ditidurkan.
const APP_HOSTS = /(^|\.)(mail\.google\.com|calendar\.google\.com|docs\.google\.com|chat\.google\.com|outlook\.(office|office365|live)\.com|teams\.(microsoft|live)\.com|app\.slack\.com|discord\.com|web\.whatsapp\.com|web\.telegram\.org|messenger\.com|notion\.so|figma\.com|linear\.app)$/
function sleepDelay(t, mem) {
  const mb = mem.get(t.view.webContents.getOSProcessId()) || 0
  let x = APP_HOSTS.test(hostOf(t.url)) ? 6 : t.pinned || tabCount(t) ? 3 : mb && mb < 150 ? 2 : 1
  if (mb > 700) x = Math.max(1, x / 2)
  return state.sleepAfter * 60000 * x
}
const idleSince = t => Math.max(t.lastActive || 0, t.seenAt || 0) // seenAt: terakhir tampil di layar
const DIRTY_JS = `[...document.querySelectorAll('textarea, input:is([type=text], [type=email], [type=url], [type=tel], [type=number], :not([type]))')].some(e => e.value && e.value !== e.defaultValue)`
function sleepIfIdle(t) {
  const wc = t.view.webContents
  // halaman tidak menjawab dalam 2 detik = anggap sedang dipakai (jangan buang ketikan)
  within(wc.executeJavaScript(DIRTY_JS), 2000, true).then(dirty => {
    if (!dirty && t.view?.webContents === wc && !isShown(t) && !busy(t)) { sleep(t); render() }
  })
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
let htmlFull = null // tab yang sedang fullscreen (video): menutupi seluruh jendela
function layout() {
  if (!win) return
  if (htmlFull && !(visibleTabs().includes(htmlFull) && htmlFull.view)) { // pindah tab saat video fullscreen -> keluar dari fullscreen
    htmlFull.view?.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {})
    htmlFull = null
  }
  const full = !modalOpen && htmlFull
  const tabs = full ? [full] : modalOpen || peeking || covered || glance ? [] : visibleTabs().filter(t => !t.loadError) // halaman error tampil di UI; glance: tab diganti snapshot
  for (const t of tabs) if (!t.view) wake(t) // pasangan split ikut dihidupkan
  const views = tabs.map(t => t.view).filter(Boolean)
  for (const v of shownViews) if (!views.includes(v)) { win.contentView.removeChildView(v); const x = tabByWc.get(v.webContents); if (x) x.seenAt = Date.now() }
  shownViews = views
  const [w, h] = win.getContentSize()
  const bounds = full ? [{ x: 0, y: 0, width: w, height: h }] : paneBounds(views.length, tabs[0]?.group)
  views.forEach((v, i) => { win.contentView.addChildView(v); v.setBorderRadius(full ? 0 : 10); v.setBounds(bounds[i]) })
  if (glance) {
    if (modalOpen) win.contentView.removeChildView(glance.view)
    else { win.contentView.addChildView(glance.view); glance.view.setBounds(glanceBounds()); glanceInfo() }
  }
  petSync()
}

// ---- Glance (Zen) / Peek (Arc): ⌥+klik link -> halaman melayang di atas tab. Esc / klik latar = tutup, "Open as tab" = jadi tab ----
const GLANCE_BAR = 34 // toolbar UI di atas kotak glance
let glance = null // { view, profileId, container }
function glanceBounds() {
  const [w, h] = win.getContentSize()
  const x = sideSpace() + GAP, y = GAP + barSpace(), W = Math.max(w - x - GAP, 0), H = Math.max(h - y - GAP, 0)
  const gw = Math.min(Math.round(W * 0.86), 1200), gh = Math.max(H - 32 - GLANCE_BAR, 120)
  return { x: x + Math.round((W - gw) / 2), y: y + 16 + GLANCE_BAR, width: gw, height: gh }
}
function glanceInfo(extra) {
  if (!glance) return
  const wc = glance.view.webContents
  win?.webContents.send('glance', { url: wc.getURL() || glance.url, title: wc.getTitle(), bounds: glanceBounds(), bar: GLANCE_BAR, ...extra })
}
async function openGlance(url, profileId = state.activeProfile, container) {
  if (!win || !/^https?:/.test(url || '')) return
  if (glance) return glance.view.webContents.loadURL(url)
  const snap = await snapshot()
  const c = profileCtx(profileId, container)
  const view = pageView(c.ses)
  view.setBorderRadius(10)
  glance = { view, profileId, container, url }
  const wc = view.webContents
  const mine = () => glance?.view === view // listener mati sendiri setelah glance ditutup / jadi tab
  for (const ev of ['page-title-updated', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, () => mine() && glanceInfo())
  wc.on('dom-ready', () => { if (mine()) { applyBoost(wc); viewJson(wc) } })
  wc.on('context-menu', (_, p) => mine() && pageMenu(wc, { profileId, container }, p).popup({ window: win }))
  wc.on('before-input-event', (e, i) => {
    if (!mine() || i.type !== 'keyDown') return
    if (i.key === 'Escape') { e.preventDefault(); closeGlance() }
    if (i.key === 'Enter' && i.meta) { e.preventDefault(); commands.glanceExpand() } // ⌘↩ = jadikan tab
  })
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === 'new-window') return { action: 'allow' }
    newTab(url, profileId, disposition !== 'background-tab', container)
    return { action: 'deny' }
  })
  glanceInfo({ open: true, snap })
  layout()
  await c.ready
  wc.loadURL(url)
  wc.focus()
}
function closeGlance(keepView) {
  if (!glance) return
  const { view } = glance
  glance = null
  win?.contentView.removeChildView(view)
  if (!keepView) closePage(view.webContents)
  win?.webContents.send('glance', null)
  layout()
}

// ---- Boosts (Arc): CSS & JS sendiri per situs (host tanpa www), dipasang tiap halaman situs itu dimuat ----
const boostHost = url => hostOf(url).replace(/^www\./, '')
function applyBoost(wc) {
  const b = state.boosts[boostHost(wc.getURL())]
  if (!b?.on) return
  if (b.css) wc.insertCSS(b.css, { cssOrigin: 'user' }).catch(() => {}) // user stylesheet: !important-nya menang dari CSS situs
  if (b.js) wc.executeJavaScript(`try {\n${b.js}\n} catch (e) { console.error('Almac Boost:', e) }`).catch(() => {})
}
// respons JSON -> viewer pohon (viewer.js); CSS menyusul hanya kalau halamannya memang JSON
const viewJson = wc => wc.executeJavaScript(`(${jsonView})()`, true).then(ok => ok && wc.insertCSS(JSON_VIEW_CSS)).catch(() => {})
// Zap: sorot elemen di bawah kursor, klik = sembunyikan & kembalikan selector CSS-nya. Dijalankan di halaman (toString).
function zapPage() {
  return new Promise(done => {
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #ff6b7a;background:rgba(255,107,122,.18);box-shadow:3px 3px 0 #111;border-radius:4px'
    document.documentElement.append(box)
    let cur = null
    const unique = q => { try { return document.querySelectorAll(q).length === 1 } catch { return false } }
    const selector = el => {
      if (el.id && !/\d{3,}/.test(el.id) && unique('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id)
      const parts = []
      for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
        const cls = [...e.classList].filter(c => !/\d{3,}|:/.test(c)).slice(0, 2).map(c => '.' + CSS.escape(c)).join('')
        parts.unshift(e.tagName.toLowerCase() + cls)
        if (unique(parts.join(' > '))) return parts.join(' > ')
        parts[0] += `:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`
        if (unique(parts.join(' > '))) return parts.join(' > ')
      }
      return parts.join(' > ')
    }
    const move = e => { cur = e.target; const r = cur.getBoundingClientRect(); Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }) }
    const block = e => { e.preventDefault(); e.stopImmediatePropagation() }
    const evs = { mousemove: move, mousedown: block, pointerdown: block, mouseup: block, click: e => { block(e); if (cur) { const s = selector(cur); cur.style.setProperty('display', 'none', 'important'); end(s) } }, keydown: e => { if (e.key === 'Escape') { block(e); end(null) } } }
    const end = v => { for (const k in evs) removeEventListener(k, evs[k], true); box.remove(); done(v) }
    for (const k in evs) addEventListener(k, evs[k], true)
  })
}

function selectTab(t) {
  if (glance) closeGlance() // pindah tab = glance selesai (seperti Zen)
  if (findOpen && t !== activeTab()) commands.findClose()
  t.lastActive = Date.now()
  state.activeProfile = t.profileId
  profileOf(t.profileId).activeWs = t.wsId
  if (!t.view) wake(t)
  layout()
  if (t.view) tabCtx(t).extensions.selectTab(t.view.webContents)
  render()
}

const newTabUrl = () => state.newTabPage === 'engine' ? engine().home : '' // '' = halaman Almac
function newTab(url = newTabUrl(), profileId = state.activeProfile, focus = true, container) {
  const t = { id: nextTabId++, profileId, wsId: activeWs(profileId), url, title: '', blocked: 0, lastActive: Date.now(), view: null, ...(container && { container }) }
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
  if (t.url && !profileOf(t.profileId)?.ephemeral && !isTemp(t.container)) { closedTabs.push({ url: t.url, profileId: t.profileId, wsId: t.wsId, container: t.container }); if (closedTabs.length > 20) closedTabs.shift() }
  unsplit(t)
  sleep(t)
  state.tabs = state.tabs.filter(x => x !== t)
  if (isTemp(t.container) && !state.tabs.some(x => x.container === t.container)) dropTemp(t.profileId, t.container)
  const next = activeTab()
  next ? selectTab(next) : (layout(), render())
}

// tab dipin terkunci ke situs (domain) pin-nya. Halaman login SSO tetap boleh (sesi habis di Gmail, Outlook, ...).
// ponytail: host login dikenali dari namanya; tambahkan di AUTH_HOST kalau login di tab dipin malah terbuka di tab baru
const siteOf = url => { const h = hostOf(url); return getDomain(h) || h }
const AUTH_HOST = /(^|\.)(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|okta\.com|auth0\.com|onelogin\.com)$|^(login|auth|sso|id)\./
const pinLocked = (t, url) => !!t.pinned && !!t.pinUrl && /^https?:/.test(url || '') && siteOf(url) !== siteOf(t.pinUrl) && !AUTH_HOST.test(hostOf(url))

// buka url di tab aktif (tab kosong dihidupkan dulu), atau tab baru kalau tidak ada tab
function goTo(url) {
  const t = activeTab()
  if (!t) return newTab(url)
  if (pinLocked(t, url)) { toast(`Pinned tab stays on ${siteOf(t.pinUrl)}, opened in a new tab. Right-click it › Edit pinned tab to change`); return newTab(url, t.profileId, true, t.container) }
  if (t.view) return t.view.webContents.loadURL(url)
  t.url = url
  wake(t)
  layout()
  render()
}

// ---- menu klik kanan halaman (Electron tidak punya menu bawaan), isinya mengikuti Chrome ----
const translateLang = () => (app.getPreferredSystemLanguages()[0] || 'en').split('-')[0]
const translateUrl = url => `https://translate.google.com/translate?sl=auto&tl=${translateLang()}&u=${encodeURIComponent(url)}`
function pageMenu(wc, { profileId, container }, p) {
  const items = []
  const group = (...xs) => { if (items.length && xs.length) items.push({ type: 'separator' }); items.push(...xs) }
  const open = url => newTab(url, profileId, false, container)
  const containers = profileOf(profileId)?.containers || []
  const sel = p.selectionText.trim()
  if (p.misspelledWord) group(
    ...p.dictionarySuggestions.slice(0, 5).map(w => ({ label: w, click: () => wc.replaceMisspelling(w) })),
    ...(p.dictionarySuggestions.length ? [] : [{ label: 'No spelling suggestions', enabled: false }]),
    { label: 'Add to Dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) })
  if (p.linkURL) group(
    { label: 'Open Link in New Tab', click: () => open(p.linkURL) },
    ...(/^https?:/.test(p.linkURL) ? [{ label: 'Open Link in Glance (⌥-click)', click: () => openGlance(p.linkURL, profileId, container) }] : []),
    { label: 'Open Link in Private Tab', click: () => commands.openPrivate(p.linkURL) },
    ...(/^https?:/.test(p.linkURL) ? [{ label: 'Open Link in Disposable Tab', click: () => commands.openDisposable(p.linkURL) }] : []),
    ...(containers.length && /^https?:/.test(p.linkURL) && !profileOf(profileId)?.ephemeral ? [{ label: 'Open Link in Container', submenu: [
      { label: 'No container', enabled: !!container, click: () => newTab(p.linkURL, profileId, true) },
      ...containers.map(c => ({ label: c.name, enabled: c.id !== container, click: () => newTab(p.linkURL, profileId, true, c.id) })),
    ] }] : []),
    { label: 'Copy Link Address', click: () => clipboard.writeText(p.linkURL) })
  if (p.mediaType === 'image') group(
    { label: 'Open Image in New Tab', click: () => open(p.srcURL) },
    { label: 'Save Image As…', click: () => wc.downloadURL(p.srcURL) },
    { label: 'Copy Image', click: () => wc.copyImageAt(p.x, p.y) },
    { label: 'Copy Image Address', click: () => clipboard.writeText(p.srcURL) })
  if (p.isEditable) group({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'selectAll' })
  else if (sel) group(
    { role: 'copy' },
    { label: `Search ${engine().name} for “${sel.length > 30 ? sel.slice(0, 30) + '…' : sel}”`, click: () => open(engine().search + encodeURIComponent(sel)) },
    { label: 'Translate Selection', click: () => open(`https://translate.google.com/?sl=auto&tl=${translateLang()}&text=${encodeURIComponent(sel)}&op=translate`) })
  if (!p.linkURL && !p.mediaType.match(/image|video|audio/) && !p.isEditable && !sel) group(
    { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Save As…', click: () => commands.savePage() },
    { label: 'Print…', click: () => wc.print() },
    { label: 'Translate Page', click: () => commands.translate() },
    { label: 'Reader Mode', click: () => commands.reader() },
    { label: 'Boost This Site…', click: () => win?.webContents.send('open-boost') },
    { label: 'Zap Element', click: () => commands.boostZap() })
  group(
    { label: 'View Page Source', click: () => commands.viewSource() },
    { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) })
  return Menu.buildFromTemplate(items)
}
// mode baca: ambil blok dengan teks paragraf terbanyak, buang sisanya (CSS ditambah dari main supaya lolos CSP situs).
// Klik lagi = muat ulang halaman asli.
const READER_JS = `(() => {
  if (document.documentElement.dataset.almacReader) { location.reload(); return 'off' }
  // skor ala Readability: teks tiap <p> dihitung penuh untuk induknya, setengah untuk kakeknya (artikel yang dibagi per section)
  const score = new Map()
  for (const p of document.querySelectorAll('p')) {
    const n = p.innerText.trim().length
    if (n < 40) continue
    const a = p.parentElement, b = a?.parentElement
    if (a) score.set(a, (score.get(a) || 0) + n)
    if (b && b !== document.body) score.set(b, (score.get(b) || 0) + n / 2)
  }
  const best = [...score].sort((a, b) => b[1] - a[1])[0]
  if (!best || best[1] < 400) return 'none'
  const body = best[0].cloneNode(true)
  body.querySelectorAll('script, style, noscript, iframe, form, button, input, nav, aside, footer, svg, [aria-hidden=true], [hidden]').forEach(e => e.remove())
  const h1 = document.querySelector('h1')
  if (h1 && !body.querySelector('h1')) body.prepend(h1.cloneNode(true))
  document.querySelectorAll('link[rel=stylesheet], style').forEach(e => e.remove())
  const art = document.createElement('article')
  art.id = 'almac-reader'
  art.append(...body.childNodes)
  document.body.replaceChildren(art)
  document.body.removeAttribute('class'); document.body.removeAttribute('style')
  document.documentElement.dataset.almacReader = '1'
  scrollTo(0, 0)
  return 'on'
})()`
const READER_CSS = `html[data-almac-reader] body { all: initial; display: block; background: #f7f3ea; color: #222; margin: 0; }
#almac-reader { max-width: 680px; margin: 48px auto; padding: 0 24px 96px; font: 19px/1.7 Georgia, 'Iowan Old Style', serif; }
#almac-reader h1 { font: 700 34px/1.25 -apple-system, system-ui, sans-serif; margin: 0 0 28px; }
#almac-reader h2, #almac-reader h3 { font-family: -apple-system, system-ui, sans-serif; line-height: 1.3; margin-top: 1.6em; }
#almac-reader img, #almac-reader video, #almac-reader figure { max-width: 100%; height: auto; margin: 1em 0; }
#almac-reader a { color: #2563eb; }
#almac-reader pre, #almac-reader code { font: 14px/1.5 ui-monospace, Menlo, monospace; background: #ece6d8; border-radius: 4px; padding: 2px 4px; white-space: pre-wrap; }
@media (prefers-color-scheme: dark) { html[data-almac-reader] body { background: #1c1c1e; color: #e6e6e6; } #almac-reader a { color: #8ab4f8; } #almac-reader pre, #almac-reader code { background: #2c2c2e; } }`

// halaman internal ala Chrome (chrome://settings dst.) -> panel Almac yang setara
const INTERNAL_PAGES = ['settings', 'history', 'bookmarks', 'downloads', 'extensions', 'passwords', 'newtab', 'version', 'about']

function toUrl(input) {
  input = input.trim()
  if (/^[a-z]+:\/\//i.test(input) || input.startsWith('about:')) return input
  if (/^[^\s]+\.[^\s]{2,}$/.test(input) || input.startsWith('localhost')) return 'https://' + input
  return engine().search + encodeURIComponent(input)
}

const toast = text => win?.webContents.send('toast', text)
// "What's new": catatan rilis versi yang terpasang (RELEASE_NOTES.md ikut dibundel), tanpa bagian cara install/update
function whatsNew() {
  let md = ''
  try { md = fs.readFileSync(path.join(__dirname, 'RELEASE_NOTES.md'), 'utf8') } catch {}
  md = md.split(/^##\s+(?:Install|Update)\b/m)[0].replace(/^.*Generated with \[Claude Code\].*$/m, '').trim()
  return { version: app.getVersion(), notes: md }
}
const showWhatsNew = () => win?.webContents.send('whats-new', whatsNew())
// tab di workspace aktif, urutan sama dengan sidebar (dipin dulu) -> ⌘1-9, ⌃Tab
const wsTabs = () => state.tabs.filter(t => t.profileId === state.activeProfile && t.wsId === activeWs()).sort((a, b) => !!b.pinned - !!a.pinned)
const BACKUP_FILES = ['state.json', 'bookmarks.json', 'history.json', 'passwords.vault']
const TG_COLORS = ['#41a6f6', '#ffc93c', '#ff6b7a', '#7eebd3', '#a7f070', '#b07cff', '#ff9f43'] // = WS_COLORS di UI
const devtools = (panelJs) => {
  const wc = activeTab()?.view?.webContents
  if (!wc) return
  const run = () => wc.devToolsWebContents?.executeJavaScript(panelJs).catch(() => {})
  if (wc.isDevToolsOpened()) return run()
  wc.once('devtools-opened', () => setTimeout(run, 300)) // front-end DevTools perlu waktu sebelum API-nya siap
  wc.openDevTools()
}

const commands = {
  navigate: input => {
    const m = /^(?:chrome|almac|about):\/*([a-z-]+)\/?$/i.exec(input.trim())
    const page = m?.[1].toLowerCase()
    if (!INTERNAL_PAGES.includes(page)) return goTo(toUrl(input))
    if (page === 'newtab') return commands.newTab()
    win?.webContents.send('chrome-page', page)
  },
  newTab: url => newTab(url ? toUrl(url) : undefined),
  select: id => { const t = state.tabs.find(t => t.id === id); if (t) selectTab(t) },
  close: id => { const t = state.tabs.find(t => t.id === id); if (t) closeTab(t) },
  back: () => activeTab()?.view?.webContents.navigationHistory.goBack(),
  forward: () => activeTab()?.view?.webContents.navigationHistory.goForward(),
  reload: () => activeTab()?.view?.webContents.reload(),
  reloadOrStop: () => { const wc = activeTab()?.view?.webContents; wc?.isLoading() ? wc.stop() : wc?.reload() }, // tombol reload = stop saat memuat
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
    const sessions = profileSessions(id)
    state.tabs.filter(t => t.profileId === id).forEach(sleep)
    state.tabs = state.tabs.filter(t => t.profileId !== id)
    state.profiles = state.profiles.filter(p => p.id !== id)
    delete state.extPrefs[id]
    history = history.filter(h => h.p !== id)
    saveHistory()
    bookmarks = bookmarks.filter(b => b.p !== id)
    saveBookmarks()
    delete state.sitePerms[id]
    for (const ses of sessions) ses.clearData()
    commands.switchProfile(state.profiles[0].id)
  },
  ready: render, // UI baru dimuat/reload -> kirim state
  openPrivate: url => {
    let p = state.profiles.find(p => p.ephemeral)
    if (!p) { p = { id: uid('private'), name: 'Private', color: '#8b5cf6', icon: 'eye-off', ephemeral: true }; workspaces(p); state.profiles.push(p) }
    state.activeProfile = p.id
    privSeen = Date.now()
    newTab(typeof url === 'string' ? url : undefined)
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
    if (key === 'sleepAfter' && [0, 5, 10, 30, 60].includes(value)) state.sleepAfter = value
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
    if (key === 'dlMode' && ['auto', 'last', 'ask'].includes(value)) state.dl.mode = value
    if (key === 'dlDirReset') state.dl.dir = ''
    if (key === 'pwLockAfter' && [1, 5, 15, 60].includes(value)) state.pwLockAfter = value
    if (key === 'stripTracking') state.stripTracking = !!value
    if (key === 'privateWipeAfter' && [0, 15, 30, 60].includes(value)) state.privateWipeAfter = value
    if (key === 'focusSites' && Array.isArray(value)) state.focus.sites = [...new Set(value.map(s => String(s).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean))].slice(0, 100)
    render(true)
  },
  profileUpdate: ({ id, name, color, icon, tempAfter }) => {
    const p = profileOf(id)
    if (!p) return
    if (name?.trim()) p.name = name.trim().slice(0, 24)
    if (/^#[0-9a-f]{6}$/i.test(color || '')) p.color = color
    p.icon = icon || ''
    // profil sementara: tab yang tidak dipakai ditutup sendiri setelah tempAfter menit, tanpa riwayat, tidak dipulihkan saat restart
    if ([0, 5, 15, 30, 60].includes(tempAfter) && !p.ephemeral) { if (tempAfter) p.tempAfter = tempAfter; else delete p.tempAfter }
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
    const t = activeTab()
    if (!t) return
    const { ses } = tabCtx(t)
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
    for (const ses of profileSessions(state.activeProfile)) await ses.clearCache()
  },
  clearCookies: async () => {
    for (const ses of profileSessions(state.activeProfile)) {
      await ses.clearStorageData({ storages: SITE_STORAGES })
      const cookies = await ses.cookies.get({})
      await Promise.all(cookies.map(c => ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {})))
    }
    // tutup semua tab dan buka tab baru
    const profileId = state.activeProfile
    state.tabs.filter(t => t.profileId === profileId && t.view).forEach(t => { t.view.webContents.reload() })
  },
  clearAll: async () => {
    const profileId = state.activeProfile
    for (const ses of profileSessions(profileId)) {
      await ses.clearCache()
      await ses.clearStorageData({ storages: SITE_STORAGES })
      const cookies = await ses.cookies.get({})
      await Promise.all(cookies.map(c => ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {})))
    }
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
    delete t.tg
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
  // "Edit pinned tab": satu-satunya cara memindah tab dipin ke situs lain
  pinEdit: ({ id, url }) => {
    const t = state.tabs.find(t => t.id === id)
    if (!t?.pinned || !String(url || '').trim()) return
    t.pinUrl = toUrl(String(url))
    t.view ? t.view.webContents.loadURL(t.pinUrl) : (t.url = t.pinUrl)
    selectTab(t)
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
  sleepOthers: id => { for (const t of state.tabs) if (t.id !== id && t.view && !isShown(t) && !busy(t)) sleep(t); render() },
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
  screenPick: ({ id, sourceId, tabId, audio }) => { const r = pendingScreens.get(id); pendingScreens.delete(id); r?.(sourceId || tabId ? { sourceId, tabId, audio: !!audio } : null) },
  screenAccess: () => desktopCapturer.getSources({ types: ['screen'] }).catch(() => {}), // memunculkan prompt izin macOS
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
  // jadikan browser default: macOS menampilkan konfirmasi "Use Almac Browser as your default web browser?"
  setDefaultBrowser: () => { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); setTimeout(() => render(true), 1500) },
  dlChooseDir: async () => { // folder unduhan tetap
    const r = await dialog.showOpenDialog(win, { title: 'Download folder', defaultPath: state.dl.dir || app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] })
    if (!r.canceled && r.filePaths[0]) { state.dl.dir = r.filePaths[0]; render(true); win?.webContents.send('toast', 'Downloads now save to ' + r.filePaths[0].replace(app.getPath('home'), '~')) }
  },
  updateCheck: () => updater.check({ manual: true }),
  updateDownload: async () => { await updater.download(); updater.install() }, // tombol "Update & Restart"
  updateInstall: () => updater.install(),
  whatsNew: showWhatsNew,
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
    const prefs = extPrefs(profileId), { ses } = profileCtx(profileId)
    const dir = ses.extensions.getExtension(id)?.path || prefs.disabled[id]?.path
    delete prefs.disabled[id]
    prefs.unpinned = prefs.unpinned.filter(x => x !== id)
    if (prefs.unpacked.includes(dir)) { prefs.unpacked = prefs.unpacked.filter(d => d !== dir); ses.extensions.removeExtension(id) } // folder developer tidak dihapus
    else await uninstallExtension(id, { session: ses, extensionsPath: extDir(profileId) })
    render()
  },
  // mode developer (chrome://extensions > Load unpacked): muat ekstensi dari folder, diingat per profil
  extLoadUnpacked: async () => {
    const profileId = state.activeProfile
    if (profileOf(profileId)?.ephemeral) return toast('Extensions are off in private mode')
    const r = await dialog.showOpenDialog(win, { title: 'Select the extension folder (contains manifest.json)', properties: ['openDirectory'] })
    const dir = r.filePaths?.[0]
    if (r.canceled || !dir) return
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) return toast('No manifest.json in that folder')
    try {
      const e = await profileCtx(profileId).ses.extensions.loadExtension(dir)
      const prefs = extPrefs(profileId)
      if (!prefs.unpacked.includes(dir)) prefs.unpacked.push(dir)
      toast('Loaded ' + extName(e))
    } catch (e) { toast('Failed to load extension: ' + e.message) }
    render(true)
  },
  extReload: async id => {
    const { ses } = profileCtx(state.activeProfile)
    const e = ses.extensions.getExtension(id)
    if (!e) return
    ses.extensions.removeExtension(id)
    await ses.extensions.loadExtension(e.path).then(() => toast('Reloaded ' + extName(e)), err => toast('Reload failed: ' + err.message))
  },
  reopenTab: () => {
    const c = closedTabs.pop()
    if (!c) return
    const p = profileOf(c.profileId)
    if (!p) return commands.reopenTab()
    state.activeProfile = p.id
    if (p.workspaces.some(w => w.id === c.wsId)) p.activeWs = c.wsId
    newTab(c.url, p.id, true, p.containers?.some(x => x.id === c.container) ? c.container : undefined)
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
  certProceed: remember => {
    const t = activeTab(), e = t?.loadError
    if (e?.kind !== 'cert' || !t.certError?.fingerprint) return
    certAllowed.set(e.host, t.certError.fingerprint)
    if (remember) state.certTrust[e.host] = t.certError.fingerprint
    commands.errRetry()
  },
  certForget: host => { delete state.certTrust[host]; certAllowed.delete(host); render(true) },
  lookalikeProceed: () => {
    const e = activeTab()?.loadError
    if (e?.kind !== 'lookalike') return
    lookalikeOk.add(e.host)
    commands.errRetry()
  },
  lookalikeGo: () => {
    const t = activeTab(), e = t?.loadError
    if (e?.kind !== 'lookalike' || !e.target) return
    t.loadError = null
    goTo('https://' + e.target)
    layout(); render(true)
  },

  // ---- container & tab sekali pakai ----
  openDisposable: url => {
    const p = profileOf(state.activeProfile)
    if (p.ephemeral) return newTab(url) // privat sudah sekali pakai
    newTab(typeof url === 'string' ? url : undefined, p.id, true, uid('tmp'))
  },
  newTabIn: container => {
    const p = profileOf(state.activeProfile)
    if (container !== 'tmp' && !p.containers?.some(c => c.id === container)) return
    newTab(undefined, p.id, true, container === 'tmp' ? uid('tmp') : container)
  },
  // seperti Firefox "Reopen in Container": tab baru dengan URL yang sama di container lain, tab lama ditutup
  reopenIn: ({ id, container }) => {
    const t = state.tabs.find(t => t.id === id), p = profileOf(t?.profileId)
    if (!t || p.ephemeral || (container && container !== 'tmp' && !p.containers?.some(c => c.id === container))) return
    const n = newTab(t.url || undefined, t.profileId, true, container === 'tmp' ? uid('tmp') : container || undefined)
    if (t.pinned) { n.pinned = true; n.pinUrl = t.pinUrl }
    if (t.tg) n.tg = t.tg
    state.tabs.splice(state.tabs.indexOf(n), 1)
    state.tabs.splice(state.tabs.indexOf(t), 0, n) // posisi sama di sidebar
    closeTab(t)
    selectTab(n)
  },
  containerAdd: ({ name, color } = {}) => {
    const p = profileOf(state.activeProfile)
    if (p.ephemeral) return
    ;(p.containers ||= []).push({ id: uid('c'), name: String(name || '').trim().slice(0, 24) || 'Container ' + (p.containers.length + 1), color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : TG_COLORS[p.containers.length % TG_COLORS.length] })
    render(true)
  },
  containerUpdate: ({ id, name, color }) => {
    const c = profileOf(state.activeProfile).containers?.find(c => c.id === id)
    if (!c) return
    if (String(name || '').trim()) c.name = String(name).trim().slice(0, 24)
    if (/^#[0-9a-f]{6}$/i.test(color || '')) c.color = color
    render(true)
  },
  containerRemove: id => { // tab-nya ditutup, cookie & data container dihapus
    const p = profileOf(state.activeProfile)
    if (!p.containers?.some(c => c.id === id)) return
    for (const t of state.tabs.filter(t => t.profileId === p.id && t.container === id)) { unsplit(t); sleep(t) }
    state.tabs = state.tabs.filter(t => !(t.profileId === p.id && t.container === id))
    p.containers = p.containers.filter(c => c.id !== id)
    const key = ctxKey(p.id, id)
    ;(ctx[key]?.ses || session.fromPartition(partitionOf(p.id, id))).clearData().catch(() => {})
    delete ctx[key]
    const next = activeTab()
    next ? selectTab(next) : (layout(), render(true))
  },
  proxySet: ({ mode, rules = '', bypass = '', pac = '' }) => {
    const p = profileOf(state.activeProfile)
    if (!PROXY_MODES.includes(mode)) return
    p.proxy = { mode, rules: String(rules).trim().slice(0, 500), bypass: String(bypass).trim().slice(0, 1000), pac: String(pac).trim().slice(0, 2000) }
    applyProxy(p.id)
    toast(mode === 'system' ? 'Proxy: using system settings' : mode === 'direct' ? 'Proxy: off (direct connection)' : 'Proxy saved for profile ' + p.name)
    render(true)
  },
  authAnswer: ({ id, username, password }) => { const cb = pendingAuth.get(id); pendingAuth.delete(id); username ? cb?.(String(username), String(password || '')) : cb?.() },
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
  // ---- perintah ala Chrome ----
  hardReload: () => activeTab()?.view?.webContents.reloadIgnoringCache(),
  devtools: () => activeTab()?.view?.webContents.toggleDevTools(),
  devConsole: () => devtools("DevToolsAPI.showPanel('console')"),
  devInspect: () => devtools('DevToolsAPI.enterInspectElementMode()'),
  viewSource: () => { const url = activeTab()?.url; if (/^(https?|file):/.test(url || '')) newTab('view-source:' + url) },
  print: () => activeTab()?.view?.webContents.print(),
  savePage: async () => {
    const wc = activeTab()?.view?.webContents
    if (!wc) return
    const name = (wc.getTitle() || 'page').replace(/[\/:*?"<>|]/g, '_').slice(0, 100)
    const r = await dialog.showSaveDialog(win, { title: 'Save page', defaultPath: path.join(app.getPath('downloads'), name + '.html'), filters: [{ name: 'Web Page, Complete', extensions: ['html'] }] })
    if (!r.canceled && r.filePath) wc.savePage(r.filePath, 'HTMLComplete').then(() => toast('Page saved'), e => toast('Save failed: ' + e.message))
  },
  translate: () => { const url = activeTab()?.url; if (/^https?:/.test(url || '')) goTo(translateUrl(url)) },
  reader: async () => {
    const wc = activeTab()?.view?.webContents
    if (!wc) return
    const r = await wc.executeJavaScript(READER_JS, true).catch(() => 'none')
    if (r === 'on') wc.insertCSS(READER_CSS)
    if (r === 'none') toast('Reader mode: no article found on this page')
  },
  muteTab: id => {
    const wc = state.tabs.find(t => t.id === (id ?? activeTab()?.id))?.view?.webContents
    if (wc) { wc.setAudioMuted(!wc.isAudioMuted()); render(true) }
  },
  tabStep: dir => {
    const list = wsTabs(), i = list.indexOf(activeTab())
    if (list.length > 1) selectTab(list[(i + dir + list.length) % list.length])
  },
  tabIndex: n => { const list = wsTabs(), t = n === 9 ? list.at(-1) : list[n - 1]; if (t) selectTab(t) },

  glanceClose: () => closeGlance(),
  glanceExpand: () => {
    if (!glance) return
    const { view, profileId, container, url } = glance
    closeGlance(true)
    const t = { id: nextTabId++, profileId, wsId: activeWs(profileId), url: view.webContents.getURL() || url, title: view.webContents.getTitle(), blocked: 0, lastActive: Date.now(), view: null, ...(container && { container }) }
    state.tabs.push(t)
    wake(t, view)
    selectTab(t)
  },
  glanceCopy: () => glance && clipboard.writeText(glance.view.webContents.getURL()),
  boostSave: ({ host, css = '', js = '', on = true }) => {
    if (!host || typeof css !== 'string' || typeof js !== 'string') return
    if (css.trim() || js.trim()) state.boosts[host] = { css: css.slice(0, 100000), js: js.slice(0, 100000), on: !!on }
    else delete state.boosts[host]
    for (const t of state.tabs) if (t.view && boostHost(t.url) === host) t.view.webContents.reload() // CSS lama tidak bisa dicabut -> muat ulang
    render(true)
  },
  boostZap: async () => {
    const t = activeTab(), wc = t?.view?.webContents, host = boostHost(t?.url)
    if (!wc || !host) return toast('Zap works on websites only')
    toast('Zap: click an element to hide it on ' + host + ' · Esc to cancel')
    wc.focus()
    const sel = await wc.executeJavaScript(`(${zapPage})()`, true).catch(() => null)
    if (!sel) return
    const b = state.boosts[host] ||= { css: '', js: '', on: true }
    const rule = `${sel} { display: none !important; }`
    b.css = (b.css.trim() ? b.css.trimEnd() + '\n' : '') + rule
    b.on = true
    wc.insertCSS(rule, { cssOrigin: 'user' }).catch(() => {})
    toast('Zapped. Undo it in Boost This Site (⌘⌥K)')
    render(true)
  },

  // ---- grup tab: tab segrup selalu berurutan di state.tabs (urutan sidebar & ⌘1-9 tetap cocok) ----
  tgNew: id => {
    const t = state.tabs.find(t => t.id === id)
    if (!t) return
    const used = Object.values(state.tabGroups).map(g => g.color)
    const gid = uid('tg')
    state.tabGroups[gid] = { name: '', color: TG_COLORS.find(c => !used.includes(c)) || TG_COLORS[0], collapsed: false }
    t.tg = gid
    render(true)
  },
  tgAdd: ({ id, gid }) => {
    const t = state.tabs.find(t => t.id === id)
    if (!t || !state.tabGroups[gid]) return
    t.tg = gid
    state.tabs.splice(state.tabs.indexOf(t), 1)
    const last = state.tabs.findLastIndex(x => x.tg === gid)
    state.tabs.splice(last + 1, 0, t)
    render(true)
  },
  tgRemove: id => { const t = state.tabs.find(t => t.id === id); if (t) { delete t.tg; render(true) } },
  tgUpdate: ({ gid, name, color, collapsed }) => {
    const g = state.tabGroups[gid]
    if (!g) return
    if (typeof name === 'string') g.name = name.trim().slice(0, 30)
    if (TG_COLORS.includes(color)) g.color = color
    if (typeof collapsed === 'boolean') g.collapsed = collapsed
    render(true)
  },
  tgUngroup: gid => { for (const t of state.tabs) if (t.tg === gid) delete t.tg; render(true) },
  tgClose: gid => { for (const t of state.tabs.filter(t => t.tg === gid && !t.pinned)) closeTab(t) },

  // ---- cadangan data: tab, bookmark, riwayat, pengaturan, brankas password (tetap terenkripsi) ----
  backup: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to save the backup', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return
    flush(); saveAllSync()
    const dir = uniquePath(r.filePaths[0], `Almac Backup ${dayKey()}`)
    fs.mkdirSync(dir)
    for (const f of BACKUP_FILES) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(dir, f))
    toast('Backup saved to ' + dir.replace(app.getPath('home'), '~'))
    shell.showItemInFolder(dir)
  },
  restore: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose an Almac backup folder', defaultPath: app.getPath('documents'), properties: ['openDirectory'] })
    const dir = r.filePaths?.[0]
    if (r.canceled || !dir) return
    const ok = fs.existsSync(path.join(dir, 'state.json')) && BACKUP_FILES.filter(f => f.endsWith('.json')).every(f => {
      try { return !fs.existsSync(path.join(dir, f)) || JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return false }
    })
    if (!ok) return toast('That folder is not a valid Almac backup')
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Restore & Restart', 'Cancel'], defaultId: 0, cancelId: 1, message: 'Restore this backup?',
      detail: 'Tabs, bookmarks, history, settings and saved passwords are replaced by the backup. Almac restarts afterwards.',
    })
    if (response !== 0) return
    for (const tm of [stateTimer, historyTimer, bookmarkTimer, downloadTimer]) clearTimeout(tm)
    for (const f of BACKUP_FILES) { const src = path.join(dir, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, f)) }
    app.relaunch(); app.exit(0) // exit (bukan quit): before-quit tidak menimpa data hasil restore
  },

  skin: id => {
    if (!SKINS[id]) return
    state.skin = id
    if (!MAC) win?.setTitleBarOverlay?.(overlayColors())
    render(true)
  },
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
  boostGet: () => { const host = boostHost(activeTab()?.url); return host ? { host, css: '', js: '', on: true, ...state.boosts[host] } : null },
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
// lembar shortcut (⌘/): dibaca langsung dari menu app -> selalu sama dengan shortcut yang benar-benar berlaku
const KEY_SYMBOL = { CmdOrCtrl: '⌘', CommandOrControl: '⌘', Command: '⌘', Cmd: '⌘', Ctrl: '⌃', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Plus: '+', Backspace: '⌫', Right: '→', Left: '←', Up: '↑', Down: '↓', Enter: '↩', Return: '↩', Escape: 'Esc', Tab: 'Tab', Space: 'Space' }
const KEY_NAME = { CmdOrCtrl: 'Ctrl', CommandOrControl: 'Ctrl', Control: 'Ctrl', Option: 'Alt', Plus: '+', Backspace: 'Backspace', Right: '→', Left: '←', Up: '↑', Down: '↓', Return: 'Enter', Escape: 'Esc', PageDown: 'PgDn', PageUp: 'PgUp' }
const keyText = acc => MAC ? acc.split('+').map(k => KEY_SYMBOL[k] ?? k.toUpperCase()).join('') : acc.split('+').map(k => KEY_NAME[k] ?? k).join('+')
queries.shortcuts = () => {
  const sections = []
  const walk = (items, title) => {
    const rows = new Map() // label -> shortcut (item tersembunyi dengan label sama = shortcut alternatif)
    for (const it of items) {
      if (it.submenu || !it.accelerator || /^(Tab \d|Last Tab)$/.test(it.label)) continue // ⌘1-9 diringkas di bawah
      rows.set(it.label, [...(rows.get(it.label) || []), keyText(it.accelerator)])
    }
    if (rows.size) sections.push({ title, items: [...rows].map(([label, keys]) => ({ label, keys: [...new Set(keys)] })) })
    for (const it of items) if (it.submenu) walk(it.submenu.items, it.label) // submenu (Developer) setelah menu induknya
  }
  walk(Menu.getApplicationMenu()?.items || [], '')
  sections.push({ title: 'Mouse & Gestures', items: [
    { label: 'Jump to tab 1–8 / last tab', keys: ['⌘1 … ⌘8', '⌘9'] },
    { label: 'Glance a link (floating preview)', keys: ['⌥ click'] },
    { label: 'Glance: open as tab / close', keys: ['⌘↩', 'Esc'] },
    { label: 'Open link in new tab', keys: ['⌘ click'] },
    { label: 'Switch workspace', keys: ['swipe on sidebar'] },
    { label: 'Close tab (feed it to Almi)', keys: ['drag to Almi'] },
  ] })
  return sections
}
queries.siteInfo = async () => {
  const t = activeTab()
  let u
  try { u = new URL(t.url) } catch { return null }
  const web = u.protocol === 'https:' || u.protocol === 'http:'
  const domain = web ? getDomain(u.hostname) || u.hostname : ''
  const { ses } = tabCtx(t)
  const ipOf = h => ses.resolveHost(h.replace(/^\[|\]$/g, '')).then(r => [...new Set(r.endpoints.map(e => e.address))]).catch(() => [])
  const [cookies, ips, tls] = await Promise.all([
    web ? ses.cookies.get({ domain }) : [],
    web ? ipOf(u.hostname) : [],
    u.protocol === 'https:' && !viaProxy(t.profileId) ? tlsProbe(u.hostname, u.port) : null,
  ])
  const cert = certs.get(t.profileId + '|' + u.hostname) || null
  return {
    url: t.url, origin: u.origin, host: u.hostname, domain, protocol: u.protocol, favicon: t.favicon,
    cert: cert && { ...cert, daysLeft: Math.floor((cert.validExpiry * 1000 - Date.now()) / 864e5), trusted: !!state.certTrust[u.hostname] },
    cookies: cookies.length, blocked: t.blocked, perms: sitePermsOf(t.profileId, u.origin),
    ips, tls, proxy: viaProxy(t.profileId), resp: t.resp ? { chain: t.resp.chain, line: t.resp.line, headers: t.resp.headers } : null,
    requests: t.reqs ? [...t.reqs.values()].reduce((a, r) => a + r.n, 0) : 0, domains: t.reqs?.size || 0,
    container: containerOf(t)?.name || (isTemp(t.container) ? 'Disposable' : ''),
    device: vault.unlocked() ? vault.data.devices?.[deviceKey(u.hostname)] || null : undefined, // undefined = brankas terkunci
  }
}
// log request tab aktif: domain, jumlah, diblokir, pihak pertama/ketiga, IP (diresolve saat dibuka)
queries.requestLog = async () => {
  const t = activeTab()
  if (!t?.reqs) return { host: hostOf(t?.url), rows: [] }
  const { ses } = tabCtx(t)
  const site = getDomain(hostOf(t.url)) || hostOf(t.url)
  const rows = await Promise.all([...t.reqs].map(async ([host, r]) => ({
    host, n: r.n, blocked: r.blocked, types: [...r.types].join(', '), third: (getDomain(host) || host) !== site,
    ip: await Promise.race([ses.resolveHost(host.replace(/^\[|\]$/g, '')).then(x => x.endpoints[0]?.address || '', () => ''), new Promise(r => setTimeout(() => r(''), 1500))]),
  })))
  return { host: hostOf(t.url), url: t.url, rows: rows.sort((a, b) => a.third - b.third || b.n - a.n) }
}
queries.certTrust = () => Object.keys(state.certTrust).sort()

// ---- tools cepat di ⌘K: hash, DNS, WHOIS, IP publik (JWT, base64, URL dikerjakan di UI) ----
const hostArg = s => { try { return new URL(/^[a-z]+:\/\//i.test(s) ? s : 'http://' + s).hostname.replace(/^\[|\]$/g, '') } catch { return s } }
async function dnsLookup(input) {
  const host = hostArg(input)
  if (!host) throw new Error('Type a host name or IP')
  const r = new (require('dns').promises.Resolver)({ timeout: 3000, tries: 2 })
  if (require('net').isIP(host)) return `PTR  ${host}\n` + (await r.reverse(host).catch(e => ['(' + e.code + ')'])).map(n => '     ' + n).join('\n')
  const fmt = (t, v) => t === 'MX' ? `${v.priority} ${v.exchange}` : t === 'TXT' ? v.join('') : t === 'SOA' ? `${v.nsname} ${v.hostmaster} serial ${v.serial}` : t === 'CAA' ? `${v.critical} ${Object.entries(v).find(([k]) => !['critical', 'type'].includes(k))?.join(' ')}` : v
  const types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA']
  // record tidak ada (ENODATA) = dilewati; error lain (timeout, ditolak resolver) ditampilkan, jangan diam-diam hilang
  const res = await Promise.all(types.map(t => r.resolve(host, t).then(v => [t, [].concat(v)], e => [t, ['ENODATA', 'ENOTFOUND'].includes(e.code) ? [] : null, e.code])))
  const lines = res.flatMap(([t, vs, err]) => vs ? vs.map(v => `${t.padEnd(6)}${fmt(t, v)}`) : [`${t.padEnd(6)}⚠ ${err}`])
  // jawaban resolver Chromium (DoH / DNS VPN) bisa beda dengan DNS sistem -> tampilkan juga
  const t = activeTab(), ses = (t ? tabCtx(t) : profileCtx(state.activeProfile)).ses
  const almacIps = await ses.resolveHost(host).then(x => [...new Set(x.endpoints.map(e => e.address))], () => [])
  return `${host} · resolver ${r.getServers().join(', ')}\n\n${lines.join('\n') || 'No records found.'}\n\nAlmac resolves to: ${almacIps.join(', ') || '(nothing)'}${state.dnsMode === 'doh' ? ' (DNS-over-HTTPS)' : ''}`
}
function whoisQuery(server, q) {
  return new Promise((resolve, reject) => {
    let out = ''
    const sock = require('net').connect(43, server, () => sock.write(q + '\r\n'))
    sock.setTimeout(8000, () => { sock.destroy(); reject(new Error('WHOIS server ' + server + ' did not answer')) })
    sock.on('data', d => { out += d; if (out.length > 300000) sock.destroy() })
    sock.on('close', () => resolve(out))
    sock.on('error', reject)
  })
}
// WHOIS ikut rujukan: IANA -> registry TLD/RIR -> registrar (maks. 3 lompatan). ponytail: TCP langsung, tidak lewat proxy profil
async function whois(input) {
  let q = hostArg(input)
  if (!q) throw new Error('Type a domain or IP')
  if (!require('net').isIP(q)) q = getDomain(q) || q
  const hops = ['whois.iana.org']
  let text = await whoisQuery(hops[0], q)
  for (let i = 0; i < 2; i++) {
    const next = /^\s*(?:refer|whois|Registrar WHOIS Server|ReferralServer):\s*(?:whois:\/\/)?([a-z0-9.-]+\.[a-z]{2,})\s*$/im.exec(text)?.[1]?.toLowerCase()
    if (!next || hops.includes(next)) break
    const more = await whoisQuery(next, q).catch(() => '')
    if (!more.trim()) break
    hops.push(next); text = more
  }
  return `${q} · ${hops.join(' → ')}\n\n${text.trim()}`
}
// IP publik lewat sesi profil/tab aktif -> kalau profil memakai proxy, yang tampil IP keluar proxy itu
async function publicIp() {
  const t = activeTab(), ses = (t ? tabCtx(t) : profileCtx(state.activeProfile)).ses
  const kv = Object.fromEntries((await (await ses.fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' })).text()).trim().split('\n').map(l => l.split('=')))
  const p = profileOf(t?.profileId || state.activeProfile)
  return [['IP', kv.ip], ['Country', kv.loc], ['Cloudflare PoP', kv.colo], ['HTTP', kv.http], ['TLS', kv.tls], ['Profile', p.name + (viaProxy(p.id) ? ' (through its proxy)' : '')]]
    .filter(([, v]) => v).map(([k, v]) => k.padEnd(16) + v).join('\n')
}
queries.tool = async ({ kind, arg = '' } = {}) => {
  arg = String(arg).trim().slice(0, 100000)
  if (kind === 'hash') return Object.fromEntries(['md5', 'sha1', 'sha256', 'sha512'].map(a => [a, crypto.createHash(a).update(arg).digest('hex')]))
  if (kind === 'dns') return dnsLookup(arg)
  if (kind === 'whois') return whois(arg)
  if (kind === 'ip') return publicIp()
  return null
}
// ---- Almac Passwords: perintah dari UI ----
const needVault = fn => (...a) => { if (!vault.unlocked()) throw new Error('Passwords are locked'); pwTouch(); return fn(...a) }
// catatan perangkat internal (IP, VLAN, PIC, catatan) per host, disimpan terenkripsi di brankas yang sama dengan password
const deviceKey = host => String(host || '').toLowerCase().replace(/^www\./, '')
const DEVICE_FIELDS = ['ip', 'vlan', 'pic', 'notes']
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
  deviceSave: needVault(({ host, ...f }) => {
    const key = deviceKey(host)
    if (!key) throw new Error('Host is required')
    const d = Object.fromEntries(DEVICE_FIELDS.map(k => [k, String(f[k] || '').trim().slice(0, k === 'notes' ? 5000 : 200)]))
    vault.data.devices ||= {}
    if (DEVICE_FIELDS.some(k => d[k])) vault.data.devices[key] = { ...d, updated: Date.now() }
    else delete vault.data.devices[key]
    vault.save(); return true
  }),
  deviceList: needVault((q = '') => {
    q = q.trim().toLowerCase()
    return Object.entries(vault.data.devices || {}).map(([host, d]) => ({ host, ...d }))
      .filter(d => !q || Object.values(d).join(' ').toLowerCase().includes(q)).sort((a, b) => a.host.localeCompare(b.host))
  }),
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

// Badging API dari halaman (media-preload.js) -> counter di tab, bukan di ikon Dock
ipcMain.on('tab-badge', (e, n) => {
  const t = state.tabs.find(t => t.view?.webContents === e.sender)
  if (!t || typeof n !== 'number' || t.badge === n) return
  t.badge = n
  render()
})
// kamera/mikrofon dipakai (media-preload.js), per frame (Teams/Zoom bisa meeting di iframe)
ipcMain.on('tab-capture', (e, live) => {
  const t = tabByWc.get(e.sender)
  if (!t) return
  const key = e.processId + ':' + e.frameId
  t.capturing ||= new Set()
  live ? t.capturing.add(key) : t.capturing.delete(key)
  render()
})
// counter tab: Badging API, atau angka di judul ("(3) WhatsApp", "Inbox (12) - Gmail"). -1 = titik tanpa angka
const titleCount = title => +(/^\((\d{1,4})\+?\)\s/.exec(title || '') || /\b(?:Inbox|Kotak Masuk)\s\((\d{1,5})\)/i.exec(title || '') || [])[1] || 0
const tabCount = t => t.badge || titleCount(t.title)

// ⌥+klik link di halaman (media-preload.js) -> Glance. Hanya dari tab Almac / glance itu sendiri.
ipcMain.on('glance', (e, url) => {
  if (typeof url !== 'string' || !/^https?:/.test(url)) return
  if (glance?.view.webContents === e.sender) return glance.view.webContents.loadURL(url)
  const t = state.tabs.find(t => t.view?.webContents === e.sender)
  if (t) openGlance(url, t.profileId, t.container)
})

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
  if (type === 'gone') { if (t.pendingPw) setTimeout(() => pwOffer(t), 300); return null } // kolom password hilang = login berhasil
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

// ---- Quick Search ⌥Space (seperti Spotlight): jendela melayang di layar yang ada kursornya, juga saat Almac di belakang ----
const SPOT_W = 700 // termasuk 8px bayangan pixel
let spot = null, spotReady = null
function toggleSpotlight() {
  if (spot?.isVisible()) return spot.hide()
  if (!spot) {
    spot = new BrowserWindow({
      width: SPOT_W, height: 96, show: false, frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, transparent: true, hasShadow: false, backgroundColor: '#00000000', // kotak & bayangan pixel digambar di HTML
      webPreferences: { preload: path.join(__dirname, 'spotlight-preload.js'), sandbox: true, contextIsolation: true },
    })
    spot.webContents.on('will-navigate', e => e.preventDefault())
    spot.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    spot.on('blur', () => spot?.hide())
    spot.on('closed', () => { spot = null; spotReady = null })
    spotReady = spot.loadFile(path.join(__dirname, 'ui', 'spotlight.html'))
  }
  spotReady.then(() => {
    if (!spot) return
    const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    spot.setBounds({ x: Math.round(a.x + (a.width - SPOT_W) / 2), y: Math.round(a.y + a.height * 0.22), width: SPOT_W, height: spot.getBounds().height })
    spot.webContents.send('spot-open')
    spot.show()
    app.focus({ steal: true }) // dari app lain: Almac harus aktif supaya kolom ketik dapat fokus
    spot.focus()
  })
}
ipcMain.handle('spot', async (e, type, arg) => {
  if (!spot || e.sender !== spot.webContents) return null
  if (type === 'suggest') {
    const raw = String(arg || ''), q = raw.trim().toLowerCase()
    const tabs = state.tabs.filter(t => t.profileId === state.activeProfile && t.url && matches({ title: t.title || '', url: t.url }, q))
      .slice(0, 3).map(t => ({ id: t.id, title: t.title || t.url, url: t.url }))
    return { ...await queries.suggest(raw), tabs, engine: engine().name }
  }
  if (type === 'size') return spot.setBounds({ ...spot.getBounds(), height: clamp(Math.round(+arg) || 96, 56, 600) })
  spot.hide()
  if (type !== 'go' || !win) return null
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
  if (arg?.tabId) return commands.select(arg.tabId)
  const text = String(arg?.text || '').trim()
  if (text) /^(chrome|almac|about):/i.test(text) ? commands.navigate(text) : commands.newTab(text)
  return null
})

function buildMenu() {
  const send = ch => () => { win.webContents.focus(); win.webContents.send(ch) }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Almac Browser',
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => { updater.check({ manual: true }); send('open-update')() } },
        { label: 'What\'s New…', click: showWhatsNew },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('open-settings') },
        ...(MAC ? [{ type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }] : []), { type: 'separator' }, { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => { commands.newTab(); send('focus-url')() } },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+N', visible: false, click: () => { commands.newTab(); send('focus-url')() } }, // Chrome: jendela baru; Almac satu jendela
        { label: 'New Incognito Tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => commands.openPrivate() },
        { label: 'New Disposable Tab', accelerator: 'CmdOrCtrl+Alt+N', click: () => { commands.openDisposable(); send('focus-url')() } },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => commands.reopenTab() },
        { label: 'Open Location…', accelerator: 'CmdOrCtrl+L', click: send('focus-url') },
        { label: 'Quick Search', accelerator: QUICK_KEY, registerAccelerator: false, click: () => toggleSpotlight() }, // shortcut global, didaftarkan lewat globalShortcut
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => commands.closeActive() },
        { label: 'Save Page As…', accelerator: 'CmdOrCtrl+S', click: () => commands.savePage() },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => commands.print() },
        { type: 'separator' },
        { label: 'Import from Chrome/Brave…', click: send('open-import') },
        { label: 'Back Up Data…', click: () => commands.backup() },
        { label: 'Restore Backup…', click: () => commands.restore() },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Show/Hide Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: () => commands.sidebarToggle() },
        { label: 'Always Show Bookmarks Bar', accelerator: 'CmdOrCtrl+Shift+B', click: () => commands.bookmarkBarToggle() },
        { type: 'separator' },
        { label: 'Reload This Page', accelerator: 'CmdOrCtrl+R', click: commands.reload },
        { label: 'Force Reload This Page', accelerator: 'CmdOrCtrl+Shift+R', click: () => commands.hardReload() },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => commands.zoom(0) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => commands.zoom(1) },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => commands.zoom(1) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => commands.zoom(-1) },
        { type: 'separator' },
        { label: 'Reader Mode', accelerator: 'CmdOrCtrl+Alt+R', click: () => commands.reader() },
        { label: 'Boost This Site…', accelerator: 'CmdOrCtrl+Alt+K', click: send('open-boost') },
        { label: 'Zap Element', accelerator: 'CmdOrCtrl+Alt+Z', click: () => commands.boostZap() },
        { label: 'Translate Page', click: () => commands.translate() },
        { label: 'Picture in Picture', accelerator: 'CmdOrCtrl+Alt+P', click: () => commands.pip() },
        { type: 'separator' },
        {
          label: 'Developer',
          submenu: [
            { label: 'View Source', accelerator: 'CmdOrCtrl+Alt+U', click: () => commands.viewSource() },
            { label: 'Developer Tools', accelerator: 'CmdOrCtrl+Alt+I', click: () => commands.devtools() },
            { label: 'Developer Tools', accelerator: 'F12', visible: false, click: () => commands.devtools() },
            { label: 'Inspect Elements', accelerator: 'CmdOrCtrl+Alt+C', click: () => commands.devInspect() },
            { label: 'JavaScript Console', accelerator: 'CmdOrCtrl+Alt+J', click: () => commands.devConsole() },
            { type: 'separator' },
            { label: 'Site Info & Certificate', click: send('open-site-info') },
            { label: 'Request Log', accelerator: 'CmdOrCtrl+Alt+L', click: send('open-request-log') },
            { type: 'separator' },
            { label: 'Load Unpacked Extension…', click: () => commands.extLoadUnpacked() },
          ],
        },
      ],
    },
    {
      label: 'History',
      submenu: [
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: commands.back },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: commands.forward },
        { type: 'separator' },
        { label: 'Show Full History', accelerator: 'CmdOrCtrl+Y', click: send('toggle-history') },
        { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: send('toggle-downloads') },
        { label: 'Clear Browsing Data…', accelerator: 'CmdOrCtrl+Shift+Backspace', click: () => { win.webContents.focus(); win.webContents.send('open-settings', 'privacy') } },
      ],
    },
    {
      label: 'Bookmarks',
      submenu: [
        { label: 'Bookmark Manager', accelerator: 'CmdOrCtrl+Alt+B', click: send('toggle-bookmarks') },
        { label: 'Bookmark This Tab…', accelerator: 'CmdOrCtrl+D', click: send('bookmark-current') },
      ],
    },
    {
      label: 'Tab',
      submenu: [
        { label: 'Select Next Tab', accelerator: 'CmdOrCtrl+Alt+Right', click: () => commands.tabStep(1) },
        { label: 'Select Previous Tab', accelerator: 'CmdOrCtrl+Alt+Left', click: () => commands.tabStep(-1) },
        { label: 'Select Next Tab', accelerator: 'Ctrl+Tab', visible: false, click: () => commands.tabStep(1) },
        { label: 'Select Previous Tab', accelerator: 'Ctrl+Shift+Tab', visible: false, click: () => commands.tabStep(-1) },
        { label: 'Select Next Tab', accelerator: 'CmdOrCtrl+Shift+]', visible: false, click: () => commands.tabStep(1) },
        { label: 'Select Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', visible: false, click: () => commands.tabStep(-1) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: n === 9 ? 'Last Tab' : 'Tab ' + n, accelerator: 'CmdOrCtrl+' + n, visible: false, click: () => commands.tabIndex(n) })),
        { label: 'Pin / Unpin Tab', accelerator: 'CmdOrCtrl+Shift+D', click: () => commands.pinTab() },
        { label: 'Mute / Unmute Tab', click: () => commands.muteTab() },
        { label: 'Search Tabs…', accelerator: 'CmdOrCtrl+Shift+A', click: send('open-palette') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: send('open-palette') },
        { type: 'separator' },
        { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => { commands.findOpen(); send('open-find')() } },
        { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: send('find-next') },
        { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: send('find-prev') },
        { type: 'separator' },
        { label: 'Next Workspace', accelerator: MAC ? 'Ctrl+Command+Right' : 'Ctrl+Alt+PageDown', click: () => commands.wsStep(1) },
        { label: 'Previous Workspace', accelerator: MAC ? 'Ctrl+Command+Left' : 'Ctrl+Alt+PageUp', click: () => commands.wsStep(-1) },
        { type: 'separator' },
        { label: 'Passwords', accelerator: 'CmdOrCtrl+Shift+P', click: send('open-passwords') },
        { label: 'Autofill Login', accelerator: 'CmdOrCtrl+Shift+L', click: () => commands.pwFillActive() },
        { label: 'Find Password in Keychain', visible: MAC, click: () => commands.passwords() },
        { label: 'Radio Widget', accelerator: 'CmdOrCtrl+Shift+M', click: () => toggleMusic() },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('open-shortcuts') },
        { label: 'Almac Browser on GitHub', click: () => shell.openExternal('https://github.com/Alianama/almac-browser') },
      ],
    },
  ]))
}

// tema pixel (ui/theme.css [data-skin]): [latar, teks] untuk tombol jendela Windows & latar jendela saat dibuka; classic ikut terang/gelap
const SKINS = { classic: null, pastel: ['#ffd9ec', '#3b2a4a'], midnight: ['#0b1026', '#e6ebff'], horror: ['#0d0505', '#f2dede'], gaming: ['#090014', '#f0f6ff'], gameboy: ['#8bac0f', '#0f380f'], terminal: ['#020a02', '#7dff9a'], synthwave: ['#1a0b2e', '#fff0fb'] }
const skinBg = () => SKINS[state.skin]?.[0] || (nativeTheme.shouldUseDarkColors ? '#141623' : '#7eebd3')
const overlayColors = () => ({ color: skinBg(), symbolColor: SKINS[state.skin]?.[1] || (nativeTheme.shouldUseDarkColors ? '#f1f2f6' : '#111111'), height: GAP + BAR_H })
nativeTheme.on('updated', () => { if (!MAC) win?.setTitleBarOverlay?.(overlayColors()) })

app.whenReady().then(async () => {
  if (!MAC) pendingOpen.push(...process.argv.slice(1).filter(a => /^https?:\/\//i.test(a)))
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
    blocker.on('request-redirected', req => {
      const logged = state.tabs.find(t => t.view?.webContents.id === req.tabId)?.reqs?.get(hostOf(req.url))
      if (logged) logged.blocked++
    })
    blocker.on('request-blocked', req => {
      const t = state.tabs.find(t => t.view?.webContents.id === req.tabId)
      const logged = t?.reqs?.get(hostOf(req.url))
      if (logged) logged.blocked++
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
    backgroundColor: skinBg(),
    // mac: tombol jendela di header sidebar. Windows: tombol jendela sistem (overlay) di strip atas kanan, setinggi strip itu
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 13 } } // titik tengah ~19.5px = tengah header sidebar (39px)
      : { titleBarStyle: 'hidden', titleBarOverlay: overlayColors() }),
    icon: path.join(__dirname, 'build', 'icon.png'), // Windows/Linux
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false, contextIsolation: true },
  })
  win.on('resize', () => { layout(); render() }) // lebar sidebar efektif bisa berubah
  for (const ev of ['move', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen']) win.on(ev, petSync)
  // keluar fullscreen lewat jendela (tombol hijau, ⌃⌘F) saat video fullscreen -> videonya ikut keluar
  win.on('leave-full-screen', () => { htmlFull?.view?.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {}) })
  win.setWindowButtonVisibility?.(state.sidebar.mode === 'pinned') // tombol jendela macOS ikut sidebar
  win.on('closed', () => { win = null; clearTimeout(renderTimer); spot?.destroy() }) // jendela ⌥Space tersembunyi jangan menahan app tetap jalan
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
  uiReady = true
  pendingOpen.splice(0).forEach(openFromOutside) // link yang membuka Almac
  if (!globalShortcut.register(QUICK_KEY, toggleSpotlight)) toast(keyText(QUICK_KEY) + ' is taken by another app, so Quick Search is in the File menu only')
  if (state.music?.on) toggleMusic()
  if (state.pet.out) petOut(true)
  // baru di-update ke versi ini -> tampilkan "What's new" sekali
  if (FRESH_INSTALL) state.seenVersion = app.getVersion()
  else if (state.seenVersion !== app.getVersion()) setTimeout(() => { state.seenVersion = app.getVersion(); render(true); showWhatsNew() }, 1500)

  setInterval(() => {
    if (!win) return
    const now = Date.now()
    const mem = new Map(app.getAppMetrics().map(m => [m.pid, m.memory.workingSetSize / 1024])) // pid -> MB
    const expired = []
    for (const t of state.tabs) {
      if (isShown(t)) { t.seenAt = now; continue }
      if (busy(t)) continue
      // profil sementara: tab tidak dipakai selama tempAfter menit ditutup (tab dipin tetap)
      const temp = profileOf(t.profileId)?.tempAfter
      if (temp && !t.pinned && now - idleSince(t) > temp * 60000) { expired.push(t); continue }
      // hemat memori: tab tidak tampil & tidak bersuara ditidurkan, batasnya menyesuaikan isi tab (sleepDelay)
      if (state.sleepAfter && t.view && now - idleSince(t) > sleepDelay(t, mem)) sleepIfIdle(t)
    }
    expired.forEach(closeTab)
    if (expired.length) toast(`Temporary profile: closed ${expired.length} unused ${expired.length === 1 ? 'tab' : 'tabs'} (⌘⇧T to reopen)`)
    if (vault.unlocked() && now - pwLastUse > state.pwLockAfter * 60000) pwLock()
    if (process.platform === 'darwin' && app.getBadgeCount()) app.setBadgeCount(0) // badge dari service worker (tanpa preload): Dock tetap bersih
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
  if (certAllowed.get(host) === certificate.fingerprint || state.certTrust[host] === certificate.fingerprint) { event.preventDefault(); return callback(true) }
  callback(false)
  const t = isMainFrame && state.tabs.find(t => t.view?.webContents === wc)
  if (t) t.certError = { url, error, fingerprint: certificate.fingerprint, issuer: certificate.issuerName, changed: !!state.certTrust[host] }
})

// login HTTP Basic/Digest (panel router, iLO, ...) & proxy yang minta password: Electron menolak semua tanpa handler ini
const pendingAuth = new Map()
let authSeq = 0
app.on('login', (event, wc, details, auth, callback) => {
  if (!win) return
  event.preventDefault()
  const id = ++authSeq
  pendingAuth.set(id, callback)
  win.focus()
  win.webContents.send('auth-request', { id, host: auth.host + (auth.port && ![80, 443].includes(auth.port) ? ':' + auth.port : ''), realm: auth.realm, proxy: auth.isProxy, scheme: auth.scheme })
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())
// simpan history yang belum ditulis (debounce 2 detik) sebelum keluar
function saveAllSync() {
  if (stateToSave) { clearTimeout(stateTimer); stateTimer = null; writeAtomicSync(STATE_FILE, stateToSave) }
  clearTimeout(historyTimer); historyTimer = null; writeAtomicSync(HISTORY_FILE, JSON.stringify(history))
  clearTimeout(bookmarkTimer); writeAtomicSync(BOOKMARKS_FILE, JSON.stringify(bookmarks))
  const priv = new Set(state.profiles.filter(p => p.ephemeral).map(p => p.id))
  writeAtomicSync(DOWNLOADS_FILE, JSON.stringify(downloads.slice(-200).filter(d => !priv.has(d.p))))
}
app.on('before-quit', saveAllSync)
