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

// ⌥+klik link -> Glance (pratinjau melayang, seperti Zen). Hanya URL yang dikirim ke main.
const { ipcRenderer } = require('electron')
document.addEventListener('almac-badge', e => { if (typeof e.detail === 'number') ipcRenderer.send('tab-badge', e.detail) })
addEventListener('click', e => {
  if (!e.altKey || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
  const a = e.target.closest?.('a[href]')
  if (!a || !/^https?:/.test(a.href)) return
  e.preventDefault(); e.stopImmediatePropagation()
  ipcRenderer.send('glance', a.href)
}, true)
