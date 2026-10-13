// Almi, kucing pixel pink-putih. Atlas ui/almi.png digambar scripts/build-almi.py (pixel art 48x48 per frame,
// mengikuti referensi sprite sheet). Selalu digambar dengan perbesaran bulat tanpa smoothing supaya pixel tetap tajam.
// walk/run/jump/look menghadap kanan; ke kiri = dibalik.
const ALMI = {
  cell: 48, cols: 8,
  anims: {
    idle: [0, 1, 2, 3],
    blink: [4],
    look: [5, 6],
    alert: [7, 8],
    wave: [9, 10, 11, 12],
    happy: [13, 14, 15, 16],
    meow: [17, 18],
    hungry: [19, 20],
    chomp: [21, 22, 23, 24],
    walk: [25, 26, 27, 28, 29, 30, 31, 32],
    run: [33, 34, 35, 36, 37, 38],
    jump: [39, 40, 41],
    sleep: [42, 43, 44, 45],
  },
}
const almiImg = new Image()
almiImg.src = 'almi.png'

// gambar satu frame; (x, y) = kiri atas kotak berukuran size x size
function almiDraw(ctx, idx, x, y, size, flip = false) {
  const c = ALMI.cell
  ctx.save()
  ctx.imageSmoothingEnabled = false
  if (flip) { ctx.translate(x + size, y); ctx.scale(-1, 1); x = 0; y = 0 }
  ctx.drawImage(almiImg, (idx % ALMI.cols) * c, Math.floor(idx / ALMI.cols) * c, c, c, x, y, size, size)
  ctx.restore()
}

// <canvas> kecil yang memutar satu animasi (ikon tombol, rumah, statistik); berhenti sendiri saat dilepas dari halaman
function almiCanvas(anim, size, fps = 3) {
  const cv = Object.assign(document.createElement('canvas'), { width: size * 2, height: size * 2 })
  cv.style.width = cv.style.height = size + 'px'
  const ctx = cv.getContext('2d')
  let i = 0, started = false
  const draw = () => {
    const frames = ALMI.anims[cv.dataset.anim || anim]
    ctx.clearRect(0, 0, cv.width, cv.height)
    almiDraw(ctx, frames[i++ % frames.length], 0, 0, cv.width)
  }
  const timer = setInterval(() => { if (started && !cv.isConnected) return clearInterval(timer); if (cv.isConnected) started = true; draw() }, 1000 / fps)
  almiImg.complete ? draw() : almiImg.addEventListener('load', draw, { once: true })
  return cv
}
