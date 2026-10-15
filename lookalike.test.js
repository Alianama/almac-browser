// node lookalike.test.js -- cek peringatan situs mirip: tiruan terdeteksi, situs asli & host internal tidak diganggu
const assert = require('assert')
const { domainToASCII } = require('url')
const { lookalike } = require('./lookalike')
const target = h => lookalike(h)?.target

for (const [host, want] of [
  ['paypa1.com', 'paypal.com'], ['g00gle.com', 'google.com'], ['rnicrosoft.com', 'microsoft.com'], ['gooogle.com', 'google.com'],
  ['gogle.com', 'google.com'], ['paypall.com', 'paypal.com'], ['paypal-secure-login.com', 'paypal.com'], ['login.paypal.com.evil.xyz', 'paypal.com'],
  [domainToASCII('аpple.com'), 'apple.com'], ['klikbca-verify.net', 'klikbca.com'],
]) assert.equal(target(host), want, host)

assert.equal(lookalike(domainToASCII('gооgle-x.com'))?.target, '', 'mixed Cyrillic IDN without brand still warns')

for (const host of ['www.paypal.com', 'google.co.id', 'mail.google.com', 'google-analytics.com', 'cloud.com', 'gitlab.com', 'github.com',
  'github.kantor.local', '192.168.1.1', 'localhost', 'finance.yahoo.com', 'apple-store-indonesia.com', domainToASCII('münchen.de'),
  domainToASCII('президент.рф'), 'x.com', 'bankmandiri.co.id', 'pve', '[::1]', 'tiktokv.com', 'githubstatus.com', 'chatgpt.com', 'alibabacloud.com'])
  assert.equal(lookalike(host), null, host)

console.log('lookalike ok')
