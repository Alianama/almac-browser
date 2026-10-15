// Viewer JSON bawaan: respons API (application/json, atau teks biasa yang isinya JSON) tampil sebagai pohon yang bisa dilipat.
// jsonView() dijalankan DI HALAMAN (toString + executeJavaScript), jadi tidak boleh memakai variabel dari luar fungsinya.
// Semua isi dimasukkan lewat textContent (bukan innerHTML) -> isi JSON tidak bisa menyuntik HTML/script.
// CSS dipasang dari main dengan insertCSS: lolos CSP API seperti "default-src 'none'" (GitHub API).
function jsonView() {
  const root = document.documentElement
  if (root.dataset.almacJson || !document.body) return false
  const body = document.body, pre = body.children.length === 1 && body.firstElementChild.tagName === 'PRE' ? body.firstElementChild : null
  if (!/json/.test(document.contentType) && !(document.contentType === 'text/plain' && pre)) return false
  const raw = (pre || body).textContent
  if (!/^\s*[[{]/.test(raw)) return false
  let data
  try { data = JSON.parse(raw) } catch { return false }
  root.dataset.almacJson = '1'

  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e }
  const big = raw.length > 3e6 // > 3 MB: pohon terlalu berat, cukup tampilan rapi
  let count = 0
  const value = v => {
    if (v === null) return h('span', 'j-null', 'null')
    if (typeof v === 'string') {
      if (/^https?:\/\/\S+$/.test(v)) { const a = h('a', 'j-str', JSON.stringify(v)); a.href = v; return a }
      return h('span', 'j-str', JSON.stringify(v))
    }
    return h('span', 'j-' + typeof v, String(v))
  }
  // objek/array = <details>; terbuka sampai kedalaman 2, atau semua kalau JSON-nya kecil
  const node = (key, v, depth) => {
    count++
    const label = key === null ? [] : [h('span', 'j-key', typeof key === 'number' ? key : JSON.stringify(key)), h('span', 'j-punct', ': ')]
    if (v === null || typeof v !== 'object') { const row = h('div', 'j-row'); row.append(...label, value(v)); return row }
    const arr = Array.isArray(v), keys = arr ? v.map((_, i) => i) : Object.keys(v)
    const d = h('details', 'j-node')
    d.open = depth < 2 || raw.length < 20000
    const sum = h('summary')
    sum.append(...label, h('span', 'j-punct', arr ? '[' : '{'), h('span', 'j-count', ` ${keys.length} ${arr ? (keys.length === 1 ? 'item' : 'items') : (keys.length === 1 ? 'key' : 'keys')} `), h('span', 'j-punct j-close', arr ? ']' : '}'))
    d.append(sum)
    const kids = h('div', 'j-kids')
    for (const k of keys) kids.append(node(k, v[k], depth + 1))
    d.append(kids, h('div', 'j-punct j-end', arr ? ']' : '}'))
    return d
  }

  const tree = h('div', 'j-tree'), pretty = h('pre', 'j-pretty', JSON.stringify(data, null, 2)), rawPre = h('pre', 'j-pretty', raw)
  if (!big) tree.append(node(null, data, 0))
  const views = { tree, pretty, raw: rawPre }
  const bar = h('div', 'j-bar')
  const show = name => { for (const [k, el] of Object.entries(views)) el.hidden = k !== name; bar.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === name)) }
  const btn = (text, fn, v) => { const b = h('button', '', text); b.type = 'button'; b.onclick = fn; if (v) b.dataset.v = v; return b }
  const copy = text => navigator.clipboard.writeText(text).then(() => true, () => {
    const t = h('textarea'); t.value = text; body.append(t); t.select(); document.execCommand('copy'); t.remove()
  })
  bar.append(
    ...(big ? [] : [btn('Tree', () => show('tree'), 'tree')]), btn('Pretty', () => show('pretty'), 'pretty'), btn('Raw', () => show('raw'), 'raw'),
    h('span', 'j-sep'),
    ...(big ? [] : [btn('Expand all', () => { show('tree'); tree.querySelectorAll('details').forEach(d => { d.open = true }) }),
      btn('Collapse all', () => { show('tree'); tree.querySelectorAll('details').forEach((d, i) => { d.open = i === 0 }) })]),
    btn('Copy', function () { copy(JSON.stringify(data, null, 2)); this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy' }, 1200) }),
    h('span', 'j-info', `${(raw.length / 1024).toFixed(raw.length < 10240 ? 1 : 0)} KB${big ? ' · large file: tree off' : ''}`))
  body.replaceChildren(bar, tree, pretty, rawPre)
  show(big ? 'pretty' : 'tree')
  return true
}

const JSON_VIEW_CSS = `
html[data-almac-json] { color-scheme: light dark; }
html[data-almac-json] body { margin: 0; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; background: #fbfaf7; color: #1d1d1f; }
.j-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 8px 12px; font: 12px -apple-system, system-ui, sans-serif; background: #f0ede6; border-bottom: 2px solid #111; }
.j-bar button { height: 26px; padding: 0 10px; font: inherit; color: inherit; background: #fff; border: 2px solid #111; border-radius: 7px; box-shadow: 2px 2px 0 #111; cursor: pointer; }
.j-bar button.on { background: #7eebd3; }
.j-bar button:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 #111; }
.j-sep { flex: 1; }
.j-info { color: #777; }
.j-tree { padding: 10px 16px 40px; }
.j-kids { padding-left: 18px; border-left: 1px dashed #ccc; margin-left: 4px; }
.j-node > summary { cursor: pointer; list-style: none; border-radius: 4px; }
.j-node > summary::-webkit-details-marker { display: none; }
.j-node > summary::before { content: '▸'; display: inline-block; width: 14px; color: #999; transition: transform .1s; }
.j-node[open] > summary::before { transform: rotate(90deg); }
.j-node > summary:hover { background: rgba(0, 0, 0, .05); }
.j-node[open] > summary .j-count, .j-node[open] > summary .j-close { display: none; }
.j-node:not([open]) > .j-end { display: none; }
.j-row, .j-end { padding-left: 14px; white-space: pre-wrap; word-break: break-word; }
.j-key { color: #8b3fbf; } .j-str { color: #2f7d32; } .j-number { color: #c25e00; } .j-boolean { color: #1f5fbf; } .j-null { color: #999; }
.j-count { color: #999; font-style: italic; } .j-punct { color: #666; }
a.j-str { text-decoration: none; } a.j-str:hover { text-decoration: underline; }
.j-pretty { margin: 0; padding: 10px 16px 40px; white-space: pre-wrap; word-break: break-word; }
[hidden] { display: none !important; }
@media (prefers-color-scheme: dark) {
  html[data-almac-json] body { background: #1c1c1e; color: #e6e6e6; }
  .j-bar { background: #26262a; border-color: #000; }
  .j-bar button { background: #333338; border-color: #000; box-shadow: 2px 2px 0 #000; }
  .j-bar button.on { background: #2f6f62; }
  .j-kids { border-color: #444; }
  .j-node > summary:hover { background: rgba(255, 255, 255, .06); }
  .j-key { color: #c792ea; } .j-str { color: #a5d6a7; } .j-number { color: #f78c6c; } .j-boolean { color: #82aaff; }
}`

module.exports = { jsonView, JSON_VIEW_CSS }
