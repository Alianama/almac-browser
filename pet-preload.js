// preload jendela Almi: hanya pesan Almi <-> main (divalidasi di main)
const { contextBridge, ipcRenderer } = require('electron')

const on = ch => fn => ipcRenderer.on(ch, (_, v) => fn(v))
contextBridge.exposeInMainWorld('pet', {
  pos: p => ipcRenderer.send('pet', 'pos', p),
  size: s => ipcRenderer.send('pet', 'size', s),
  stats: () => ipcRenderer.send('pet', 'stats'),
  grab: on => ipcRenderer.send('pet', 'grab', !!on),
  gone: () => ipcRenderer.send('pet', 'gone'),
  eatTab: () => ipcRenderer.invoke('pet-eat'),
  onState: on('pet-state'), onArea: on('pet-area'), onPlace: on('pet-place'), onHungry: on('pet-hungry'),
  onEat: on('pet-eat'), onEnter: on('pet-enter'), onLeave: on('pet-leave'), onDrag: on('pet-drag'),
})
