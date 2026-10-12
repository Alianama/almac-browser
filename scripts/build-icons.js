// Konversi ikon animasi Lucide dari animateicons (React + motion, MIT) ke data ringan untuk UI Almac.
// Pemakaian: node scripts/build-icons.js <folder repo animateicons>
//   (git clone --depth 1 https://github.com/Avijit07x/animateicons; butuh `typescript`, mis. npx -p typescript ...)
// Tiap komponen dijalankan di sandbox dengan React/motion palsu untuk merekam pohon SVG + variants yang
// sudah dihitung (termasuk `duration` dan fungsi `custom`). Hasil: ui/icons.js -> window.ALMAC_ICONS.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const ts = require('typescript')

const repo = process.argv[2]
if (!repo) throw new Error('pakai: node scripts/build-icons.js <folder repo animateicons>')
const dir = path.join(repo, 'icons', 'lucide')

const MOTION_KEYS = new Set(['variants', 'custom', 'animate', 'initial', 'exit', 'transition', 'whileHover', 'whileTap', 'onMouseEnter', 'onMouseLeave', 'className', 'children', 'key', 'ref', 'style'])
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
const esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// React/motion palsu: createElement merekam pohon, hook dibuat no-op
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const motionTag = new Proxy({}, { get: (_, tag) => 'm:' + String(tag) })
const fakeModules = {
  react: {
    forwardRef: render => ({ render }),
    useCallback: f => f, useMemo: f => f(), useRef: v => ({ current: v }), useImperativeHandle: () => {},
    useEffect: () => {}, useLayoutEffect: () => {}, useId: () => 'id', useState: v => [typeof v === 'function' ? v() : v, () => {}],
  },
  'motion/react': {
    LazyMotion: 'fragment', domMin: {}, domAnimation: {}, m: motionTag, motion: motionTag,
    useAnimation: () => ({ start() {}, stop() {}, set() {} }), useReducedMotion: () => false, useAnimate: () => [{}, () => {}],
  },
  '@/lib/utils': { cn: (...a) => a.filter(Boolean).join(' ') },
}

function render(node, specs) {
  if (node == null || node === false || node === true) return ''
  if (typeof node !== 'object') return ''
  let { type, props, children } = node
  if (props.children !== undefined && !children.length) children = [].concat(props.children)
  if (type === 'fragment' || typeof type === 'symbol') return children.map(c => render(c, specs)).join('')
  if (type === 'm:div' || type === 'div') return children.map(c => render(c, specs)).join('')
  const tag = String(type).replace(/^m:/, '')
  const attrs = []
  for (const [k, v] of Object.entries(props)) {
    if (MOTION_KEYS.has(k) || v == null || typeof v === 'function' || typeof v === 'object') continue
    if (tag === 'svg' && (k === 'width' || k === 'height' || k === 'xmlns')) continue
    attrs.push(`${k === 'viewBox' ? k : kebab(k)}="${esc(v)}"`)
  }
  // style statis (bukan dari motion) + origin transform
  const style = props.style || {}
  const css = []
  if (style.transformBox) css.push(`transform-box:${kebab(style.transformBox)}`)
  const ox = style.originX ?? style.transformOrigin, oy = style.originY
  const unit = v => typeof v === 'number' ? v * 100 + '%' : v
  if (style.transformOrigin && oy === undefined) css.push(`transform-origin:${style.transformOrigin}`)
  else if (ox !== undefined || oy !== undefined) css.push(`transform-origin:${unit(ox ?? 0.5)} ${unit(oy ?? 0.5)}`)
  // variants: hitung animate/normal (bisa fungsi custom)
  const variants = props.variants
  if (variants && variants.animate) {
    const resolve = v => typeof v === 'function' ? v(props.custom) : v
    specs.push({ animate: resolve(variants.animate), normal: resolve(variants.normal) || {} })
    attrs.push(`data-a="${specs.length - 1}"`)
    const n = specs[specs.length - 1].normal
    if (n.opacity !== undefined) css.push(`opacity:${n.opacity}`)
    if (n.pathLength !== undefined) { attrs.push('pathLength="1"'); css.push(`stroke-dasharray:${n.pathLength} 1`) }
    if (n.strokeDashoffset !== undefined) css.push(`stroke-dashoffset:${n.strokeDashoffset}`)
    if (n.strokeDasharray !== undefined) css.push(`stroke-dasharray:${n.strokeDasharray}`)
  } else if (style.opacity !== undefined) css.push(`opacity:${style.opacity}`)
  if (css.length) attrs.push(`style="${css.join(';')}"`)
  const inner = children.map(c => render(c, specs)).join('')
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${tag}>`
}

// buang fungsi & nilai yang tidak bisa diserialisasi dari spec animasi
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === Infinity ? 'Infinity' : typeof v === 'function' ? undefined : v)))

const out = {}, failed = []
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('-icon.tsx')).sort()) {
  const name = file.replace(/-icon\.tsx$/, '')
  try {
    const js = ts.transpileModule(fs.readFileSync(path.join(dir, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText
    const mod = { exports: {} }
    const sandbox = {
      module: mod, exports: mod.exports, React: { createElement: h, Fragment: 'fragment' },
      require: id => { if (!fakeModules[id]) throw new Error('modul tak dikenal: ' + id); return fakeModules[id] },
    }
    vm.runInNewContext(js, sandbox, { timeout: 200 })
    const comp = Object.values(mod.exports).find(v => v && v.render)
    const specs = []
    const svg = render(comp.render({ size: 24, duration: 1 }, null), specs)
    if (!svg.startsWith('<svg')) throw new Error('tidak menghasilkan <svg>')
    out[name] = specs.length ? { s: svg, a: clean(specs) } : { s: svg }
  } catch (e) {
    failed.push(name + ': ' + e.message.split('\n')[0])
  }
}

const header = `// Dibuat otomatis oleh scripts/build-icons.js — jangan edit manual.
// Ikon: Lucide (ISC, https://github.com/lucide-icons/lucide), animasi: animateicons (MIT, https://github.com/Avijit07x/animateicons)
`
fs.writeFileSync(path.join(__dirname, '..', 'ui', 'icons.js'), header + 'window.ALMAC_ICONS = ' + JSON.stringify(out) + '\n')
console.log(`ikon: ${Object.keys(out).length} berhasil, ${failed.length} gagal`)
if (failed.length) console.log(failed.join('\n'))
