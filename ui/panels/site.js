// dimuat saat pertama kali dibuka (lazy di ui/index.html); script biasa, berbagi scope global dengan index.html
async function openSiteInfo() {
  const info = await almac.ask('siteInfo')
  if (!info) return
  const web = info.protocol === 'https:' || info.protocol === 'http:'
  const secure = info.protocol === 'https:' && (!info.cert || info.cert.result === 'net::OK')
  const body = []
  const conn = card(secure ? 'lock' : web ? 'warn' : 'info',
    secure ? 'Connection is secure' : web ? 'Connection is not secure' : 'Internal page',
    secure ? 'Data you send (passwords, cards) is encrypted.' : web ? 'Do not enter passwords or personal data here.' : info.url)
  conn.classList.add(secure ? 'ok' : web ? 'bad' : 'neutral')
  body.push(conn)
  if (info.container) body.push(card('layers', 'Container: ' + info.container, 'Cookies and logins in this tab are kept apart from the rest of the profile.'))
  const c = info.cert
  if (c && c.daysLeft <= 30) body.push(Object.assign(card('warn', c.daysLeft < 0 ? 'Certificate has expired' : `Certificate expires in ${c.daysLeft} ${c.daysLeft === 1 ? 'day' : 'days'}`, 'Valid until ' + fmtDate(c.validExpiry)), { className: 'site-card bad' }))
  if (c) {
    const t = info.tls
    const details = dl([
      ['Issued to', c.subject + (c.subjectOrg ? ` (${c.subjectOrg})` : '')],
      ['Issued by', c.issuer + (c.issuerOrg ? ` (${c.issuerOrg})` : '')],
      ['Valid', `${fmtDate(c.validStart)} – ${fmtDate(c.validExpiry)} (${c.daysLeft < 0 ? 'expired' : c.daysLeft + ' days left'})`],
      ['Names (SAN)', c.san?.length ? c.san.join(', ') : '—'],
      ['Verification', c.result + (c.knownRoot ? ' · trusted root CA' : '') + (c.trusted ? ' · remembered by you' : '')],
      ['TLS', t ? [t.protocol, t.alpn && 'ALPN ' + t.alpn].filter(Boolean).join(' · ') : info.proxy ? 'not measured (profile uses a proxy)' : 'could not measure'],
      ['Cipher', t?.cipher],
      ['Key exchange', t?.kx],
      ['Serial number', c.serial],
      ['SHA-256', c.fingerprint.replace(/^sha256\//, '')],
    ])
    details.hidden = true
    body.push(el('div', { className: 'inline' }, toggleLink('cert', 'certificate & TLS', details),
      ...(c.trusted ? [el('button', { type: 'button', className: 'link', onclick() { almac.cmd('certForget', info.host); this.remove() } }, iconEl('x'), 'Forget remembered certificate')] : [])), details)
  }
  if (web) {
    // jaringan & HTTP: IP server, kode status (+ redirect), header keamanan
    const r = info.resp
    const last = r?.chain.at(-1)
    const headers = el('dl', { className: 'cert headers', hidden: true }, ...(r?.headers || []).flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]))
    const has = new Set((r?.headers || []).map(([k]) => k.toLowerCase()))
    const val = name => r?.headers.find(([k]) => k.toLowerCase() === name)?.[1]
    body.push(el('div', { className: 'site-card http-card' }, iconEl('globe'), el('div', { className: 'meta' },
      el('b', {}, ...(last ? [el('span', { className: 'code ' + codeClass(last.code), textContent: last.code }), ' ' + (r.line.replace(/^HTTP\/[\d.]+ \d+ ?/, '') || '')] : ['No response recorded'])),
      el('small', { textContent: [info.ips.length ? 'IP ' + info.ips.join(', ') : '', val('server') && 'Server: ' + val('server'), val('x-powered-by') && 'X-Powered-By: ' + val('x-powered-by')].filter(Boolean).join(' · ') || info.host }),
      ...(r && r.chain.length > 1 ? [el('small', { className: 'chain', textContent: r.chain.map(h => `${h.code} ${h.url}`).join('\n') })] : []),
      ...(r ? [el('div', { className: 'hdr-chips' }, ...SEC_HEADERS.map(([k, label]) => el('span', { className: 'hdr' + (has.has(k) ? ' on' : ''), title: val(k) || 'Missing', textContent: (has.has(k) ? '✓ ' : '✗ ') + label })))] : []))))
    if (r) body.push(toggleLink('file', `all ${r.headers.length} response headers`, headers), headers)
    body.push(
      card('cookie', `${info.cookies} ${info.cookies === 1 ? 'cookie' : 'cookies'}`, 'stored for ' + info.domain,
        twoStep('Clear data', 'Sure?', () => almac.cmd('siteClearData', info.origin), false)),
      card('shield', `${info.blocked} ads & trackers blocked`, `${info.requests} ${info.requests === 1 ? 'request' : 'requests'} to ${info.domains} ${info.domains === 1 ? 'domain' : 'domains'} on this page`,
        el('button', { type: 'button', onclick: () => { closeModal(); setTimeout(openRequestLog, 80) } }, 'Request log')),
      deviceNotes(info),
      el('div', { className: 'row' }, el('span', { textContent: 'Site permissions' }), el('div', { className: 'perms' }, ...PERMS.map(([kind, label, icon]) => {
        const seg = el('div', { className: 'seg' }, ...[['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']].map(([v, t]) => el('button', {
          type: 'button', className: v + ((info.perms[kind] || 'ask') === v ? ' on' : ''), textContent: t,
          onclick() { almac.cmd('sitePerm', { origin: info.origin, kind, value: v }); seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === this)) },
        })))
        return el('div', { className: 'perm' }, iconEl(icon), el('span', { textContent: label }), seg)
      }))),
    )
  }
  openModal(info.host || 'Site info', body, [{ label: 'Done', primary: true }])
}

// catatan perangkat (IP, VLAN, PIC) untuk host ini, terenkripsi di brankas Almac Passwords
function deviceNotes(info) {
  const box = el('div', { className: 'row device' }, el('span', { textContent: 'Device notes (encrypted with your passwords)' }))
  if (info.device === undefined) {
    box.append(el('button', { type: 'button', onclick: async () => { closeModal(); if (await pwReady('Unlock to see device notes.')) setTimeout(openSiteInfo, 80) } }, iconEl('lock'), 'Unlock to view'))
    return box
  }
  const d = info.device || {}
  const f = (k, ph) => el('input', { className: 'field', value: d[k] || '', placeholder: ph, spellcheck: false })
  const ip = f('ip', 'IP / hostname, e.g. 10.20.1.5'), vlan = f('vlan', 'VLAN, e.g. 120 MGMT'), pic = f('pic', 'PIC / owner, e.g. Budi (NOC)')
  const notes = el('textarea', { className: 'field focus-sites', value: d.notes || '', placeholder: 'Notes: rack, serial, firmware, escalation…', rows: 3 })
  const form = el('div', { className: 'device-form', hidden: !info.device }, el('div', { className: 'inline' }, ip, vlan), pic, notes,
    el('button', { type: 'button', onclick: async () => {
      const r = await askErr('deviceSave', { host: info.host, ip: ip.value, vlan: vlan.value, pic: pic.value, notes: notes.value })
      toast(r?.error ? 'Not saved: ' + r.error : 'Device notes saved', r?.error ? 'warn' : 'check')
    } }, iconEl('check'), 'Save notes'))
  box.append(...(info.device ? [] : [toggleLink('edit', 'device notes', form)]), form)
  return box
}

// log request: domain yang dihubungi halaman ini (pihak pertama dulu), bisa disalin sebagai CSV untuk investigasi
async function openRequestLog() {
  const log = await almac.ask('requestLog')
  if (!log.rows.length) return toast('No requests recorded for this tab yet. Reload the page to record them.', 'info')
  const search = el('input', { className: 'field', placeholder: 'Filter domains', autocomplete: 'off', spellcheck: false })
  const onlyThird = el('input', { type: 'checkbox' })
  const table = el('div', { className: 'req-list' })
  const draw = () => {
    const q = search.value.trim().toLowerCase()
    const rows = log.rows.filter(r => (!q || (r.host + ' ' + r.ip).includes(q)) && (!onlyThird.checked || r.third))
    table.replaceChildren(el('div', { className: 'req head' }, ...['Domain', 'IP', 'Req', 'Blocked'].map(t => el('span', { textContent: t }))),
      ...rows.map(r => el('div', { className: 'req' + (r.third ? ' third' : '') + (r.blocked ? ' blocked' : ''), title: r.types },
        el('span', { textContent: r.host }), el('span', { textContent: r.ip || '—' }), el('span', { textContent: r.n }), el('span', { textContent: r.blocked || '' }))))
  }
  search.oninput = draw; onlyThird.onchange = draw
  draw()
  const third = log.rows.filter(r => r.third)
  const csv = () => ['domain,ip,requests,blocked,third_party,types', ...log.rows.map(r => [r.host, r.ip, r.n, r.blocked, r.third, `"${r.types}"`].join(','))].join('\n')
  openModal('Request log · ' + log.host, [
    el('p', { className: 'modal-text', textContent: `${log.rows.length} ${log.rows.length === 1 ? 'domain' : 'domains'} (${third.length} third-party), ${log.rows.reduce((a, r) => a + r.blocked, 0)} blocked or replaced by the ad blocker. Recorded since this page started loading.` }),
    el('div', { className: 'inline' }, search, el('label', { className: 'check' }, onlyThird, el('span', { textContent: 'Third-party only' }))),
    table,
  ], [
    { label: 'Copy CSV', onClick: () => { navigator.clipboard.writeText(csv()); toast('Request log copied as CSV', 'copy'); return false } },
    { label: 'Done', primary: true },
  ])
}
