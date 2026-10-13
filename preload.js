const { contextBridge, ipcRenderer } = require('electron')
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action')

injectBrowserAction() // <browser-action-list> untuk ikon ekstensi

contextBridge.exposeInMainWorld('almac', {
  cmd: (type, arg) => ipcRenderer.send('cmd', type, arg),
  onState: fn => ipcRenderer.on('state', (_, s) => fn(s)),
  onFocusUrl: fn => ipcRenderer.on('focus-url', fn),
  onToggleHistory: fn => ipcRenderer.on('toggle-history', fn),
  onToggleBookmarks: fn => ipcRenderer.on('toggle-bookmarks', fn),
  onOpenImport: fn => ipcRenderer.on('open-import', fn),
  onBookmarkCurrent: fn => ipcRenderer.on('bookmark-current', fn),
  onOpenSettings: fn => ipcRenderer.on('open-settings', fn),
  onOpenFind: fn => ipcRenderer.on('open-find', fn),
  onFindNext: fn => ipcRenderer.on('find-next', fn),
  onFindPrev: fn => ipcRenderer.on('find-prev', fn),
  onFindResult: fn => ipcRenderer.on('find-result', (_, r) => fn(r)),
  onToggleDownloads: fn => ipcRenderer.on('toggle-downloads', fn),
  onDownloadStarted: fn => ipcRenderer.on('download-started', (_, name) => fn(name)),
  onPermRequest: fn => ipcRenderer.on('perm-request', (_, r) => fn(r)),
  onOpenPalette: fn => ipcRenderer.on('open-palette', fn),
  onOpenPasswords: fn => ipcRenderer.on('open-passwords', fn),
  onOpenUpdate: fn => ipcRenderer.on('open-update', fn),
  onOpenStats: fn => ipcRenderer.on('open-stats', fn),
  onScreenPick: fn => ipcRenderer.on('screen-pick', (_, r) => fn(r)),
  onPwSave: fn => ipcRenderer.on('pw-save', (_, r) => fn(r)),
  onPwUnlock: fn => ipcRenderer.on('pw-unlock', fn),
  onToast: fn => ipcRenderer.on('toast', (_, text) => fn(text)),
  onTabCrashed: fn => ipcRenderer.on('tab-crashed', (_, r) => fn(r)),
  onHttpsFailed: fn => ipcRenderer.on('https-failed', (_, r) => fn(r)),
  ask: (type, arg) => ipcRenderer.invoke('ask', type, arg),
})
