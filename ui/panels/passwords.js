// dimuat saat pertama kali dibuka (lazy di ui/index.html); script biasa, berbagi scope global dengan index.html
async function openPasswords(q = '') {
  if (!await pwReady()) return
  const list = el('div', { className: 'pw-list' })
  const search = el('input', { className: 'field', placeholder: 'Search sites or usernames', value: q, autocomplete: 'off' })
  const draw = async () => {
    const items = await askErr('pwList', search.value)
    if (items.error) return closeModal()
    list.replaceChildren(...(items.length ? items.map(e => el('div', { className: 'hrow pw-row', onclick: () => editPassword(e) },
      el('img', { className: 'fav-img', src: lastState.favicons?.[e.host] || '', onerror() { this.replaceWith(iconEl('globe')) } }),
      el('div', { className: 'meta' }, el('b', { textContent: e.title || e.host }), el('small', { textContent: e.username || '(no username)' })),
      el('button', { type: 'button', className: 'mini', title: 'Copy username', onclick: ev => { ev.stopPropagation(); almac.ask('pwCopy', { id: e.id, field: 'username' }); toast('Username copied', 'copy') } }, iconEl('user')),
      el('button', { type: 'button', className: 'mini', title: 'Copy password (cleared from clipboard after 30 s)', onclick: ev => { ev.stopPropagation(); almac.ask('pwCopy', { id: e.id }); toast('Password copied — clipboard clears in 30 s', 'key') } }, iconEl('copy')),
      el('button', { type: 'button', className: 'mini', title: 'View / edit username & password' }, iconEl('edit'))))
      : [el('p', { className: 'none', textContent: search.value ? 'No matches.' : 'No passwords yet. Sign in to a site and Almac will offer to save it, or import a CSV from Apple Passwords / Chrome.' })]))
  }
  let timer
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(draw, 100) }
  const tools = el('div', { className: 'inline' },
    el('button', { type: 'button', onclick: () => editPassword(null) }, iconEl('plus'), 'Add'),
    el('button', { type: 'button', onclick: async () => {
      const r = await askErr('pwImport')
      if (r?.error) return toast('Import failed: ' + r.error, 'warn')
      if (r) { toast(`Imported ${r.added} new, ${r.updated} updated`, 'download'); draw() }
    } }, iconEl('download'), 'Import CSV'),
    el('button', { type: 'button', onclick: () => { closeModal(); setTimeout(exportPasswords, 80) } }, iconEl('file'), 'Export CSV'),
    el('button', { type: 'button', onclick: () => { closeModal(); setTimeout(openDevices, 80) } }, iconEl('cpu'), 'Device notes'),
    el('button', { type: 'button', onclick: () => { closeModal(); setTimeout(passwordSettings, 80) } }, iconEl('gear'), 'Settings'),
    el('button', { type: 'button', onclick: () => { almac.cmd('pwLock'); closeModal() } }, iconEl('lock'), 'Lock'))
  // login untuk situs yang sedang dibuka: isi langsung ke halaman (seperti Bitwarden)
  const site = await almac.ask('pwSite')
  const siteBox = site.logins.length ? el('div', { className: 'pw-site' },
    el('div', { className: 'day', textContent: 'This site · ' + site.host }),
    ...site.logins.map(e => el('div', { className: 'hrow pw-row' },
      iconEl('user'), el('div', { className: 'meta' }, el('b', { textContent: e.username || '(no username)' }), el('small', { textContent: e.host })),
      el('button', { type: 'button', className: 'mini', title: 'View / edit username & password', onclick: () => editPassword(e) }, iconEl('edit')),
      el('button', { type: 'button', className: 'primary', onclick: () => { closeModal(); setTimeout(() => almac.cmd('pwFillActive', e.id), 120) } }, 'Fill')))) : ''
  await openModal('Passwords', [siteBox, search, tools, list], [{ label: 'Done', primary: true }])
  search.focus()
  draw()
}

async function editPassword(e) {
  const isNew = !e
  const pw = pwField('Password')
  if (!isNew) pw.value = await almac.ask('pwReveal', e.id) || ''
  const site = el('input', { className: 'field', placeholder: 'https://example.com', value: e?.origin || '', spellcheck: false })
  const user = el('input', { className: 'field', placeholder: 'Username or email', value: e?.username || '', spellcheck: false })
  const notes = el('textarea', { className: 'field focus-sites', placeholder: 'Notes', value: e?.notes || '', rows: 3 })
  const err = el('p', { className: 'modal-text error' })
  const gen = el('button', { type: 'button', className: 'mini', title: 'Generate strong password', onclick: async () => { pw.value = await almac.ask('pwGenerate'); pw.type = 'text' } }, iconEl('retry'))
  openModal(isNew ? 'Add password' : (e.title || e.host), [
    el('label', { className: 'row' }, el('span', { textContent: 'Website' }), site),
    el('label', { className: 'row' }, el('span', { textContent: 'Username' }), user),
    el('div', { className: 'row' }, el('span', { textContent: 'Password' }), el('div', { className: 'inline' }, pw, pwEye(pw), gen)),
    el('label', { className: 'row' }, el('span', { textContent: 'Notes' }), notes),
    ...(e?.hasOtp ? [el('p', { className: 'modal-text', textContent: 'Has a verification code (OTP) setup, kept for export.' })] : []),
    ...(!isNew ? [twoStep('Delete password', 'Sure? Delete', () => { almac.ask('pwDelete', e.id); setTimeout(openPasswords, 120) })] : []),
    err,
  ], [{ label: 'Cancel', onClick: () => { setTimeout(openPasswords, 80) } }, { label: 'Save', primary: true, onClick: () => {
    const url = /^[a-z]+:\/\//i.test(site.value.trim()) ? site.value.trim() : 'https://' + site.value.trim()
    askErr('pwSave', { id: e?.id, url, username: user.value.trim(), password: pw.value, notes: notes.value }).then(r => {
      if (r?.error) err.textContent = r.error; else { closeModal(); setTimeout(openPasswords, 80) }
    })
    return false
  } }])
}

// semua catatan perangkat (IP, VLAN, PIC): dicari, klik = buka perangkatnya
async function openDevices() {
  if (!await pwReady('Unlock to see device notes.')) return
  const list = el('div', { className: 'pw-list' })
  const search = el('input', { className: 'field', placeholder: 'Search host, IP, VLAN, PIC, notes', autocomplete: 'off', spellcheck: false })
  const draw = async () => {
    const items = await askErr('deviceList', search.value)
    if (items.error) return closeModal()
    list.replaceChildren(...(items.length ? items.map(d => el('div', { className: 'hrow pw-row', title: d.notes || '', onclick: () => { closeModal(); almac.cmd('open', 'https://' + d.host) } },
      iconEl('cpu'), el('div', { className: 'meta' }, el('b', { textContent: d.host }), el('small', { textContent: [d.ip, d.vlan && 'VLAN ' + d.vlan, d.pic && 'PIC ' + d.pic].filter(Boolean).join(' · ') || d.notes })),
      el('button', { type: 'button', className: 'mini', title: 'Copy details', onclick: ev => { ev.stopPropagation(); navigator.clipboard.writeText([`Host: ${d.host}`, d.ip && `IP: ${d.ip}`, d.vlan && `VLAN: ${d.vlan}`, d.pic && `PIC: ${d.pic}`, d.notes && `Notes: ${d.notes}`].filter(Boolean).join('\n')); toast('Device details copied', 'copy') } }, iconEl('copy'))))
      : [el('p', { className: 'none', textContent: search.value ? 'No matches.' : 'No device notes yet. Open a device (router, NAS, iLO…) and add notes from Site info (lock icon).' })]))
  }
  let timer
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(draw, 100) }
  await openModal('Device notes', [search, list], [{ label: 'Back', onClick: () => { setTimeout(openPasswords, 80) } }, { label: 'Done', primary: true }])
  search.focus()
  draw()
}

function exportPasswords() {
  const pw = pwField('Master password')
  const err = el('p', { className: 'modal-text error' })
  openModal('Export passwords', [
    el('p', { className: 'modal-text', textContent: 'The CSV uses the same format as Apple Passwords (File › Export Passwords) and can be imported into Passwords.app, Chrome, or another Almac. It is NOT encrypted: anyone with the file can read every password. Delete it after use.' }),
    pw, err,
  ], [{ label: 'Cancel' }, { label: 'Export', primary: true, danger: true, onClick: () => {
    askErr('pwExport', pw.value).then(r => {
      if (r === false) { err.textContent = 'Wrong master password.'; return }
      closeModal()
      if (r?.error) toast('Export failed: ' + r.error, 'warn'); else if (r !== null) toast(`Exported ${r} passwords`, 'file')
    })
    return false
  } }])
}

function passwordSettings() {
  const s = lastState.pw
  const lockSeg = el('div', { className: 'seg' }, ...[[1, '1 min'], [5, '5 min'], [15, '15 min'], [60, '1 hour']].map(([v, t]) => el('button', {
    type: 'button', className: v === s.lockAfter ? 'on ask' : '', textContent: t,
    onclick() { almac.cmd('setting', { key: 'pwLockAfter', value: v }); lockSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
  })))
  const touch = el('input', { type: 'checkbox', checked: s.touchId, disabled: !s.canTouchId, onchange: () => almac.ask('pwTouchId', touch.checked) })
  const oldPw = pwField('Current master password'), newPw = pwField('New master password (min. 8)'), msg = el('p', { className: 'modal-text' })
  const never = el('div', { className: 'pw-list' })
  askErr('pwNever').then(list => !list.error && never.replaceChildren(...list.map(o => el('div', { className: 'hrow' }, el('div', { className: 'meta' }, el('b', { textContent: o })),
    el('button', { type: 'button', className: 'mini hx', title: 'Allow saving again', onclick() { almac.ask('pwNeverRemove', o); this.parentNode.remove() } }, iconEl('x'))))))
  openModal('Password settings', [
    el('div', { className: 'row' }, el('span', { textContent: 'Lock automatically after inactivity (also locks when the Mac sleeps or the screen locks)' }), lockSeg),
    el('label', { className: 'check sett-row' }, touch, el('span', { textContent: s.canTouchId ? 'Unlock with Touch ID (key kept in macOS Keychain)' : 'Unlock with Touch ID (not available on this Mac)' })),
    el('div', { className: 'row' }, el('span', { textContent: 'Change master password' }), oldPw, newPw,
      el('button', { type: 'button', onclick: async () => { const r = await askErr('pwChange', { oldPassword: oldPw.value, newPassword: newPw.value }); msg.textContent = r?.error || (r ? 'Master password changed.' : 'Current master password is wrong.') } }, iconEl('check'), 'Change'), msg),
    el('div', { className: 'row' }, el('span', { textContent: 'Never save on these sites' }), never),
  ], [{ label: 'Back', onClick: () => { setTimeout(openPasswords, 80) } }, { label: 'Done', primary: true }])
}
