// preload semua tab web: catat handler Media Session (play/pause/next/prev) yang dipasang halaman,
// supaya widget musik bisa memanggilnya. Tidak membuka API apa pun ke halaman.
const { contextBridge } = require('electron')

contextBridge.executeInMainWorld({
  func: () => {
    const ms = navigator.mediaSession
    if (!ms) return
    const handlers = {}
    const set = ms.setActionHandler.bind(ms)
    ms.setActionHandler = (action, fn) => { handlers[action] = fn; return set(action, fn) }
    Object.defineProperty(window, '__almacMedia', { value: handlers })
  },
})
// Badging API (Gmail, WhatsApp, ...): angka TIDAK dipasang di ikon Dock Almac, tapi dikirim ke main untuk counter di tab situs itu
contextBridge.executeInMainWorld({
  func: () => {
    if (!navigator.setAppBadge) return
    const send = n => { document.dispatchEvent(new CustomEvent('almac-badge', { detail: n })); return Promise.resolve() }
    navigator.setAppBadge = n => send(n === undefined ? -1 : Math.max(0, Math.floor(Number(n)) || 0)) // tanpa angka = titik
    navigator.clearAppBadge = () => send(0)
  },
})

// kamera/mikrofon aktif (meeting: Meet, Zoom, Teams) -> main tidak menidurkan tab ini. Stream dari getUserMedia dicek
// tiap 5 dtk: track.stop() tidak memicu event 'ended', jadi status "masih hidup" harus diperiksa
contextBridge.executeInMainWorld({
  func: () => {
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) return
    const streams = new Set()
    let live = false, timer = 0
    const check = () => {
      for (const s of streams) if (!s.getTracks().some(t => t.readyState === 'live')) streams.delete(s)
      if (live !== streams.size > 0) { live = !live; document.dispatchEvent(new CustomEvent('almac-capture', { detail: live })) }
      if (!live) { clearInterval(timer); timer = 0 }
    }
    const gum = md.getUserMedia.bind(md)
    md.getUserMedia = constraints => gum(constraints).then(s => { streams.add(s); check(); timer ||= setInterval(check, 5000); return s })
  },
})

// ⌥+klik link -> Glance (pratinjau melayang, seperti Zen). Hanya URL yang dikirim ke main.
const { ipcRenderer } = require('electron')
document.addEventListener('almac-badge', e => { if (typeof e.detail === 'number') ipcRenderer.send('tab-badge', e.detail) })
document.addEventListener('almac-capture', e => ipcRenderer.send('tab-capture', e.detail === true))
addEventListener('click', e => {
  if (!e.altKey || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
  const a = e.target.closest?.('a[href]')
  if (!a || !/^https?:/.test(a.href)) return
  e.preventDefault(); e.stopImmediatePropagation()
  ipcRenderer.send('glance', a.href)
}, true)

// YouTube: iklan disisipkan server ke stream (SSAP/SABR), jadi tidak bisa diblokir/dibuang tanpa layar "Pemblokir iklan"
// atau error putar. Iklan dibiarkan dimuat (Ghostery mati di youtube.com, lihat blockOn di main.js), lalu dibisukan dan
// dilompati ke akhir + tombol Skip diklik -> bagi server iklan "sudah diputar".
contextBridge.executeInMainWorld({
  func: () => {
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) return
    let muted = null // status mute pengguna sebelum iklan
    setInterval(() => {
      const p = document.querySelector('#movie_player'), v = p?.querySelector('video')
      if (!v) return
      if (p.classList.contains('ad-showing')) {
        if (muted === null) muted = v.muted
        v.muted = true
        if (isFinite(v.duration) && v.currentTime < v.duration - 0.1) v.currentTime = v.duration - 0.1
        p.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')?.click()
      } else if (muted !== null) { v.muted = muted; muted = null }
    }, 250)
  },
})
