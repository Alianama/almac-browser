// Autofill & simpan password di halaman web (isolated world, halaman tidak bisa memanggil ipc ini).
// Main yang menentukan origin (dari frame pengirim) dan hanya mengembalikan login untuk origin itu.
// Hanya frame utama; aksi hanya dari event asli user (isTrusted).
// Seperti Bitwarden: ikon di dalam kolom login, dropdown saat kolom difokus (termasuk login "email dulu"), ⌘⇧L = isi otomatis.
const { ipcRenderer } = require('electron')

if (window === window.top && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const ask = (type, arg) => ipcRenderer.invoke('pw', type, arg)
  const visible = el => el.offsetWidth > 0 && el.offsetHeight > 0 && getComputedStyle(el).visibility !== 'hidden'
  const isPw = el => el?.tagName === 'INPUT' && el.type === 'password'
  const USER_HINT = /user|email|e-mail|login|account|identifier|phone|surel|nama/i
  const isUser = el => el?.tagName === 'INPUT' && ['text', 'email', 'tel', ''].includes(el.type) &&
    (el.type === 'email' || /username|email/.test(el.autocomplete) || USER_HINT.test([el.name, el.id, el.placeholder, el.getAttribute('aria-label')].join(' ')))
  // kolom di dalam shadow DOM terbuka juga dicari
  function allInputs(root = document, out = []) {
    for (const el of root.querySelectorAll('input, *')) {
      if (el.tagName === 'INPUT') { if (visible(el)) out.push(el) } else if (el.shadowRoot) allInputs(el.shadowRoot, out)
    }
    return out
  }
  const scopeOf = el => el.form || el.getRootNode()
  const inScope = (el, scope) => scope === document || scope.contains?.(el) || el.getRootNode() === scope
  // username = kolom teks sebelum password (utamakan yang namanya mirip email/username)
  function userFor(pw) {
    const before = allInputs().filter(i => i !== pw && ['text', 'email', 'tel', ''].includes(i.type) && inScope(i, scopeOf(pw)) &&
      (i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING))
    return before.filter(isUser).at(-1) || before.at(-1) || null
  }
  function fieldsAround(field) {
    if (isPw(field)) return { pw: field, user: userFor(field) }
    const pw = allInputs().find(i => isPw(i) && inScope(i, scopeOf(field))) || null
    return { pw, user: field }
  }
  const loginFields = () => allInputs().filter(i => isPw(i) || (isUser(i) && i.offsetWidth >= 80)).slice(0, 8)
  const setVal = (el, v) => {
    if (!el) return
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v) // React/Vue ikut terdeteksi
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  async function fill(field, id) {
    const c = await ask('fill', id)
    if (!c) return
    const { pw, user } = fieldsAround(field)
    if (user) setVal(user, c.username)
    if (pw) setVal(pw, c.password)
    else ask('chose', id) // langkah email saja: ingat login ini untuk langkah password berikutnya
  }

  // ---- lapisan Almac (shadow root tertutup: halaman tidak bisa membaca isinya): dropdown + ikon di kolom ----
  const host = document.createElement('almac-passwords')
  const ui = host.attachShadow({ mode: 'closed' })
  ui.innerHTML = `<style>
    :host { all: initial; }
    .menu { position: fixed; z-index: 2147483647; min-width: 240px; background: #fffdf3; color: #111; border: 2px solid #4a2b3d; border-radius: 10px;
      box-shadow: 3px 3px 0 #4a2b3d; padding: 4px; font: 13px -apple-system, system-ui, sans-serif; }
    .menu button { all: unset; box-sizing: border-box; display: flex; gap: 9px; align-items: center; width: 100%; padding: 7px 9px; border-radius: 7px; cursor: pointer; }
    .menu button:hover, .menu button.sel { background: #ffe1ec; }
    .menu small { color: #6b5562; margin-left: auto; padding-left: 10px; }
    .menu hr { border: 0; border-top: 1px solid #e8d5de; margin: 3px 2px; }
    .menu .who { display: flex; flex-direction: column; min-width: 0; }
    .menu .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
    .menu .head { padding: 4px 9px 6px; font-size: 11px; color: #6b5562; }
    .ico { position: fixed; z-index: 2147483646; width: 18px; height: 18px; padding: 0; border: 0; background: none; cursor: pointer; opacity: .9; }
    .ico:hover { opacity: 1; transform: scale(1.1); }
    svg { display: block; shape-rendering: crispEdges; }
    @media (prefers-color-scheme: dark) {
      .menu { background: #2a2e48; color: #f1f2f6; border-color: #000; box-shadow: 3px 3px 0 #000; }
      .menu button:hover, .menu button.sel { background: #3b3f63; } .menu small, .menu .head { color: #9aa0bd; } .menu hr { border-top-color: #3b3f63; }
    }
  </style><div id="icons"></div>`
  // ikon kepala kucing pink (Almi), 9x8 pixel
  const CAT = '<svg viewBox="0 0 9 8" width="18" height="16"><path fill="#5c324a" d="M0 0h2v1H0zM7 0h2v1H7zM0 1h1v6H0zM8 1h1v6H8zM2 1h1v1H2zM6 1h1v1H6zM3 2h3v1H3zM1 7h7v1H1z"/><path fill="#ffb8d0" d="M1 1h1v6H1zM7 1h1v6H7zM2 2h1v5H2zM6 2h1v5H6zM3 3h3v4H3z"/><path fill="#fff" d="M3 4h3v3H3z"/><path fill="#2e1c2a" d="M2 4h1v1H2zM6 4h1v1H6z"/><path fill="#ff6896" d="M4 5h1v1H4z"/></svg>'
  let mounted = false
  const mount = () => { if (!mounted && document.documentElement) { document.documentElement.append(host); mounted = true } }

  let menu = null, anchor = null, items = [], sel = -1
  const close = () => { menu?.remove(); menu = null; anchor = null }
  function show(field, list, head) {
    close(); mount()
    anchor = field; items = list; sel = -1
    menu = document.createElement('div'); menu.className = 'menu'
    if (head) menu.append(Object.assign(document.createElement('div'), { className: 'head', textContent: head }))
    for (const it of list) {
      if (it === '-') { menu.append(document.createElement('hr')); continue }
      const b = document.createElement('button')
      b.innerHTML = CAT + '<div class="who"><span></span></div><small></small>'
      b.querySelector('span').textContent = it.label
      b.querySelector('small').textContent = it.sub || ''
      b.addEventListener('mousedown', e => e.preventDefault()) // kolom tetap fokus
      b.addEventListener('click', e => { if (e.isTrusted) { close(); it.run() } })
      menu.append(b)
    }
    ui.append(menu)
    const r = field.getBoundingClientRect()
    menu.style.left = Math.max(4, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px'
    menu.style.top = (r.bottom + menu.offsetHeight + 8 > innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4) + 'px'
  }

  function narrow(text) {
    const q = text.trim().toLowerCase()
    const logins = allItems.filter(it => it.login && it.label.toLowerCase().startsWith(q))
    if (!q || !logins.length || isPw(anchor)) return close()
    show(anchor, logins, lastHead)
  }
  let lastHead = '', allItems = []
  async function offer(field) {
    const { pw } = fieldsAround(field)
    const isNew = isPw(field) && (field.autocomplete === 'new-password' || allInputs().filter(isPw).length > 1)
    const s = await ask('query')
    if (!s || anchor && anchor !== field) return
    if (isPw(field) && field.value) return // sudah mulai mengetik password: jangan munculkan dropdown yang menutupi tombol login
    const list = []
    if (!s.setup) list.push({ label: 'Set up Almac Passwords', sub: 'save & autofill', run: () => ask('unlock') })
    else if (s.locked) list.push({ label: 'Unlock Almac Passwords', sub: '⌘⇧L', run: () => ask('unlock') })
    for (const l of s.logins || []) list.push({ login: true, label: l.username || '(no username)', sub: l.chosen ? 'continue' : pw ? 'fill' : 'fill email', run: () => fill(field, l.id) })
    if (s.setup && !s.locked && !s.logins?.length && !isNew) list.push({ label: 'No saved login for ' + s.host, sub: 'sign in to save', run: () => {} })
    if (isNew) list.push({ label: 'Use a strong password', sub: 'generated', run: async () => {
      const g = await ask('generate')
      allInputs().filter(i => isPw(i) && inScope(i, scopeOf(field))).forEach(p => setVal(p, g))
    } })
    if (s.setup) list.push('-', { label: 'Manage passwords…', sub: '⌘⇧P', run: () => ask('manager') })
    allItems = list
    if (field.value && !isPw(field)) { anchor = field; lastHead = s.logins?.length ? `Almac Passwords · ${s.host}` : ''; return narrow(field.value) } // sudah ada isinya: langsung disaring
    lastHead = s.logins?.length ? `Almac Passwords · ${s.host}` : ''
    show(field, list, lastHead)
  }

  const target = e => e.composedPath?.()[0] || e.target
  document.addEventListener('focusin', e => {
    const f = target(e)
    if (e.isTrusted && (isPw(f) || isUser(f))) offer(f)
  }, true)
  // tutup hanya kalau fokus sudah pindah dari kolom pemilik dropdown
  document.addEventListener('focusout', () => setTimeout(() => { if (menu && !anchor?.matches(':focus')) close() }, 150), true)
  document.addEventListener('keydown', e => {
    if (!menu || !e.isTrusted) return
    const btns = [...menu.querySelectorAll('button')]
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle('sel', i === sel)) }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); e.stopPropagation(); btns[sel].click() }
  }, true)
  addEventListener('scroll', () => { close(); placeIcons() }, true)
  addEventListener('resize', () => { close(); placeIcons() })

  // ikon kucing di sisi kanan kolom login (klik = buka dropdown).
  // Hemat CPU: cek murah dulu (selector biasa); penelusuran shadow DOM paling sering tiap 3 dtk.
  let iconTimer, lastDeep = 0
  const LOGIN_SEL = 'input[type=password], input[type=email], input[autocomplete~=username], input[autocomplete~=email], input[name*=user i], input[name*=email i], input[name*=login i], input[id*=user i], input[id*=email i]'
  function placeIcons() {
    const box = ui.getElementById('icons')
    if (!document.querySelector(LOGIN_SEL)) {
      const now = performance.now()
      if (now - lastDeep < 3000) return box.childElementCount && box.replaceChildren()
      lastDeep = now
    }
    const fields = loginFields()
    if (!fields.length) return box.replaceChildren()
    mount()
    box.replaceChildren(...fields.map(f => {
      const r = f.getBoundingClientRect()
      if (r.width < 80 || r.height < 18) return ''
      const b = Object.assign(document.createElement('button'), { className: 'ico', title: 'Almac Passwords', innerHTML: CAT })
      b.style.left = r.right - 26 + 'px'; b.style.top = r.top + (r.height - 16) / 2 + 'px'
      b.addEventListener('mousedown', e => e.preventDefault())
      b.addEventListener('click', e => { if (!e.isTrusted) return; f.focus(); offer(f) })
      return b
    }))
  }
  const schedule = () => { iconTimer ||= setTimeout(() => { iconTimer = null; placeIcons() }, 300) } // throttle: halaman beranimasi tetap dapat ikon
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] }) // class/style berubah terus di SPA -> diabaikan
  addEventListener('load', schedule)

  // ⌘⇧L (menu Almac) / tombol "Fill" di pengelola: isi login untuk situs ini
  ipcRenderer.on('pw-autofill', async (_, id) => {
    const fields = loginFields()
    const focused = fields.find(f => f === document.activeElement || f.matches(':focus'))
    const field = focused || fields.find(isUser) || fields.find(isPw)
    if (!field) return
    const s = await ask('query')
    if (!s?.setup || s.locked) return ask('unlock')
    const l = (s.logins || []).find(x => x.id === id) || s.logins?.[0]
    if (l) fill(field, l.id); else field.focus()
  })

  ipcRenderer.on('pw-unlocked', () => { const f = loginFields().find(x => x.matches(':focus')); if (f) offer(f) })

  // ---- tawarkan simpan setelah login berhasil (seperti Chrome) ----
  // Password dicatat saat diketik, dikirim ke main saat submit / Enter / klik apa pun (bukan saat halaman ditinggalkan:
  // password yang tidak pernah dikirim tidak ditawarkan).
  // Main baru menawarkan simpan kalau login tampak berhasil: halaman pindah, atau kolom password hilang
  // (login XHR tanpa ganti URL). Password salah -> kolom tetap ada -> tidak ditawarkan.
  let draft = null, lastSent = '', watch = null
  document.addEventListener('input', e => {
    const t = target(e)
    if (e.isTrusted && menu && t === anchor) narrow(t.value) // mengetik: dropdown menyaring / menutup (tidak menutupi kolom berikutnya)
    if (!e.isTrusted || !isPw(t) || !t.value) return
    draft = { el: t, password: t.value, username: userFor(t)?.value || '' }
  }, true)
  function capture() {
    if (!draft) return
    draft.password = draft.el.isConnected ? draft.el.value || draft.password : draft.password
    draft.username = (draft.el.isConnected && userFor(draft.el)?.value) || draft.username
    if (!draft.password) return
    const key = draft.username + '\n' + draft.password
    if (key !== lastSent) { lastSent = key; ask('capture', { username: draft.username, password: draft.password }) }
    watchGone()
  }
  // kolom password hilang / disembunyikan setelah submit = login berhasil tanpa pindah halaman
  function watchGone() {
    clearInterval(watch)
    const el = draft.el, until = Date.now() + 20000
    watch = setInterval(() => {
      if (Date.now() > until) return clearInterval(watch)
      if (!el.isConnected || !visible(el)) { clearInterval(watch); ask('gone') }
    }, 400)
  }
  // langkah email saja (Google, Microsoft, dll): ingat username untuk langkah password
  function captureUser(scope) {
    const u = allInputs().find(i => isUser(i) && i.value && inScope(i, scope || document))
    if (u) ask('user', u.value)
  }
  document.addEventListener('submit', e => { if (e.isTrusted) draft ? capture() : captureUser(e.target) }, true)
  document.addEventListener('keydown', e => {
    const t = target(e)
    if (!e.isTrusted || e.key !== 'Enter' || menu) return
    if (isPw(t) || (draft && isUser(t))) capture(); else if (isUser(t)) captureUser(scopeOf(t))
  }, true)
  // klik elemen apa pun (banyak tombol login berupa <div>), selama ada password yang sudah diketik
  document.addEventListener('pointerdown', e => {
    if (!e.isTrusted) return
    if (draft) setTimeout(capture, 0)
    else { const b = target(e).closest?.('button, input[type=submit], [role=button], a'); if (b) captureUser(b.form || b.closest('form') || document) }
  }, true)
}
