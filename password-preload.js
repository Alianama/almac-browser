// Autofill & simpan password di halaman web (isolated world, halaman tidak bisa memanggil ipc ini).
// Main yang menentukan origin (dari frame pengirim) dan hanya mengembalikan login untuk origin itu.
// Hanya frame utama; aksi hanya dari event asli user (isTrusted).
const { ipcRenderer } = require('electron')

if (window === window.top && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const ask = (type, arg) => ipcRenderer.invoke('pw', type, arg)
  const visible = el => el.offsetWidth > 0 && el.offsetHeight > 0
  const pwFields = root => [...root.querySelectorAll('input[type=password]')].filter(visible)
  // kolom username = input teks/email terakhir sebelum kolom password (dalam form yang sama kalau ada)
  function userField(pw) {
    const scope = pw.form || document
    const inputs = [...scope.querySelectorAll('input:not([type]),input[type=text],input[type=email],input[type=tel]')].filter(visible)
    return inputs.filter(i => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1) || null
  }
  const setVal = (el, v) => {
    if (!el) return
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v) // React/Vue ikut terdeteksi
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // ---- dropdown di bawah kolom (shadow root tertutup: halaman tidak bisa membaca isinya) ----
  let host = null, anchor = null
  const close = () => { host?.remove(); host = null }
  function dropdown(anchor_, items) {
    close()
    anchor = anchor_
    host = document.createElement('almac-passwords')
    const root = host.attachShadow({ mode: 'closed' })
    const r = anchor_.getBoundingClientRect()
    root.innerHTML = `<style>
      :host { all: initial; position: fixed; z-index: 2147483647; left: ${r.left}px; top: ${r.bottom + 4}px; }
      div { min-width: ${Math.max(220, r.width)}px; background: #fffdf3; color: #111; border: 2px solid #111; border-radius: 10px;
        box-shadow: 3px 3px 0 #111; padding: 4px; font: 13px -apple-system, system-ui, sans-serif; }
      button { all: unset; box-sizing: border-box; display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 9px; border-radius: 7px; cursor: pointer; }
      button:hover { background: #f6ec9f; }
      small { color: #4b5563; margin-left: auto; }
      b { font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: .5px; }
      @media (prefers-color-scheme: dark) { div { background: #2a2e48; color: #f1f2f6; border-color: #000; box-shadow: 3px 3px 0 #000; } button:hover { background: #3b3f63; } small { color: #9aa0bd; } }
    </style><div></div>`
    const box = root.querySelector('div')
    for (const it of items) {
      const b = document.createElement('button')
      b.innerHTML = '<b>ALMAC</b><span></span><small></small>'
      b.children[1].textContent = it.label
      b.children[2].textContent = it.sub || ''
      b.addEventListener('mousedown', e => e.preventDefault()) // kolom tetap fokus
      b.addEventListener('click', e => { if (e.isTrusted) { close(); it.run() } })
      box.append(b)
    }
    document.documentElement.append(host)
  }

  async function offer(field) {
    const pw = field.type === 'password' ? field : pwFields(field.form || document)[0]
    if (!pw) return
    const isNew = pw.autocomplete === 'new-password' || pwFields(pw.form || document).length > 1
    const s = await ask('query')
    if (document.activeElement !== field) return
    const items = []
    if (s.locked && s.setup) items.push({ label: 'Unlock Almac Passwords', run: () => ask('unlock') })
    for (const l of s.logins || []) items.push({ label: l.username || '(no username)', sub: '••••••••', run: async () => {
      const c = await ask('fill', l.id)
      if (c) { setVal(userField(pw), c.username); setVal(pw, c.password) }
    } })
    if (isNew && field.type === 'password') items.push({ label: 'Use a strong password', sub: 'generated', run: async () => {
      const g = await ask('generate')
      pwFields(pw.form || document).forEach(p => setVal(p, g))
    } })
    items.length ? dropdown(field, items) : close()
  }
  document.addEventListener('focusin', e => {
    const f = e.target
    if (!e.isTrusted || f.tagName !== 'INPUT') return
    if (f.type === 'password' || (pwFields(f.form || document).length && userField(pwFields(f.form || document)[0]) === f)) offer(f)
  }, true)
  // tutup hanya kalau fokus sudah pindah dari kolom pemilik dropdown (focusout kolom sebelumnya jangan menutup dropdown baru)
  document.addEventListener('focusout', () => setTimeout(() => { if (host && document.activeElement !== anchor) close() }, 150), true)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close() }, true)
  addEventListener('scroll', close, true)

  // ---- tawarkan simpan: submit form, Enter di kolom password, atau klik tombol di form login (SPA tanpa submit) ----
  let lastSent = ''
  function capture(scope) {
    const pw = pwFields(scope).find(p => p.value)
    if (!pw) return
    const username = userField(pw)?.value || ''
    const key = username + '\n' + pw.value
    if (key === lastSent) return
    lastSent = key
    ask('capture', { username, password: pw.value })
  }
  document.addEventListener('submit', e => { if (e.isTrusted) capture(e.target) }, true)
  document.addEventListener('keydown', e => { if (e.isTrusted && e.key === 'Enter' && e.target.type === 'password') capture(e.target.form || document) }, true)
  document.addEventListener('click', e => {
    const b = e.isTrusted && e.target.closest?.('button, input[type=submit], [role=button]')
    if (b) capture(b.form || b.closest('form') || document)
  }, true)
}
