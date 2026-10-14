// jendela pencarian cepat ⌥Space (ui/spotlight.html): hanya saran, buka, ukuran, tutup
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spot', {
  platform: process.platform,
  suggest: q => ipcRenderer.invoke('spot', 'suggest', q),
  go: it => ipcRenderer.invoke('spot', 'go', it),
  size: h => ipcRenderer.invoke('spot', 'size', h),
  close: () => ipcRenderer.invoke('spot', 'close'),
  onOpen: fn => ipcRenderer.on('spot-open', fn),
})
