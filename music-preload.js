// preload widget musik: hanya satu pintu ke main process (perintah divalidasi di sana)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('music', cmd => ipcRenderer.invoke('music', cmd))
