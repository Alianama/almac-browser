// Peringatan situs mirip (seperti "Did you mean …?" di Chrome): domain yang meniru merek terkenal untuk phishing,
// mis. paypa1.com, аpple.com (huruf Kiril), paypal-secure-login.com, paypal.com.evil.xyz.
// Yang dicek hanya domain terdaftar (eTLD+1) -> host internal (github.kantor.local) & IDN biasa (münchen.de) tidak diganggu.
const { domainToUnicode } = require('url')
const { getDomain, getDomainWithoutSuffix } = require('tldts-experimental')

// label merek -> domain resminya. Label persis sama di TLD lain (google.co.id, amazon.de) tidak dianggap tiruan.
// ponytail: daftar tetap; tambah merek (bank/SaaS kantor) di sini kalau perlu
const BRANDS = {
  google: 'google.com', gmail: 'gmail.com', youtube: 'youtube.com', facebook: 'facebook.com', instagram: 'instagram.com',
  whatsapp: 'whatsapp.com', microsoft: 'microsoft.com', outlook: 'outlook.com', apple: 'apple.com', icloud: 'icloud.com',
  amazon: 'amazon.com', paypal: 'paypal.com', netflix: 'netflix.com', linkedin: 'linkedin.com', github: 'github.com',
  gitlab: 'gitlab.com', dropbox: 'dropbox.com', twitter: 'twitter.com', telegram: 'telegram.org', tiktok: 'tiktok.com',
  coinbase: 'coinbase.com', metamask: 'metamask.io', cloudflare: 'cloudflare.com', okta: 'okta.com', docusign: 'docusign.com',
  adobe: 'adobe.com', yahoo: 'yahoo.com', zoom: 'zoom.us', slack: 'slack.com', atlassian: 'atlassian.com',
  salesforce: 'salesforce.com', tokopedia: 'tokopedia.com', shopee: 'shopee.co.id', bukalapak: 'bukalapak.com',
  klikbca: 'klikbca.com', bca: 'bca.co.id', bankmandiri: 'bankmandiri.co.id', gojek: 'gojek.com',
}
// domain resmi milik merek di atas yang kebetulan mirip namanya (bukan tiruan)
const OFFICIAL = new Set(['tiktokv.com'])
// huruf/angka yang sering dipakai menyamar sebagai huruf Latin (Unicode confusables, versi ringkas)
const CONFUSABLE = {
  0: 'o', 1: 'l', i: 'l', '|': 'l', 3: 'e', 5: 's',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'l', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ӏ: 'l', һ: 'h', ԛ: 'q', ԝ: 'w', // Kiril
  ο: 'o', ν: 'v', α: 'a', ι: 'l', κ: 'k', τ: 't', ρ: 'p', ε: 'e', // Yunani
}
const skeleton = s => [...s.normalize('NFKC').toLowerCase().replace(/-/g, '')].map(c => CONFUSABLE[c] ?? c).join('').replace(/rn/g, 'm').replace(/vv/g, 'w')
const NON_LATIN = /[Ͱ-ϿЀ-ԯ]/
const RISKY_WORD = /(^|-)(login|signin|sign-in|secure|verify|verification|account|update|support|wallet|auth|security|billing|recovery|help)(-|$)/

// jarak edit Damerau (salah ketik 1 huruf: kurang, lebih, salah, tertukar); > 1 cukup dilaporkan sebagai 2
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1]))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[a.length][b.length]
}

// host (ASCII/punycode, seperti dari new URL) -> null, atau { host: tampilan unicode, target: domain asli yang ditiru ('' = tidak diketahui) }
function lookalike(host) {
  if (!host || !host.includes('.') || /^[\d.]+$|:/.test(host)) return null
  const domain = getDomain(host), label = getDomainWithoutSuffix(host)
  if (!domain || !label || OFFICIAL.has(domain)) return null
  const shown = domainToUnicode(host) || host, uLabel = domainToUnicode(label) || label, sub = host.slice(0, -domain.length - 1)
  const sk = skeleton(uLabel)
  for (const [brand, official] of Object.entries(BRANDS)) {
    if (label === brand || domain === official) continue
    const fake = sk === skeleton(brand) // paypa1, g00gle, rnicrosoft, аpple
      || (brand.length >= 6 && !brand.includes(uLabel) && distance(uLabel, brand) === 1) // gooogle, gogle (cloud ≠ icloud)
      || (new RegExp(`(^|-)${brand}(-|$)`).test(uLabel) && RISKY_WORD.test(uLabel)) // paypal-secure-login
      || new RegExp(`(^|\\.)${brand}\\.(com|net|org)(\\.|$)`).test(sub) // paypal.com.evil.xyz
    if (fake) return { host: shown, target: official }
  }
  // IDN dengan huruf Kiril/Yunani yang bisa dibaca sebagai Latin (campur Latin, atau seluruhnya mirip Latin)
  if (shown !== host && shown.split('.').some(l => NON_LATIN.test(l) && (/[a-z]/.test(l) || /^[\x00-\x7f]*$/.test(skeleton(l))))) return { host: shown, target: '' }
  return null
}

module.exports = { lookalike }
