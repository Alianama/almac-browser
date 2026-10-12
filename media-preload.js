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
