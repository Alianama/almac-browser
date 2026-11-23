// dimuat saat pertama kali dibuka (lazy di ui/index.html); script biasa, berbagi scope global dengan index.html
// ---- pengaturan ----
// almac://settings/<bagian>: isi Settings digambar ke dalam host (halaman penuh). closeModal() di tombol-tombolnya aman (tidak ada modal)
function settingsPage(host, initialTab = 'general') {
  let s = lastState
  let activeTab = initialTab

  // ---- Tab: Umum ----
  function tabGeneral() {
    const engines = el('div', { className: 'engine-list' }, ...s.engines.map(e => {
      const radio = el('input', { type: 'radio', name: 'engine', checked: e.id === s.searchEngine, onchange: () => almac.cmd('setting', { key: 'searchEngine', value: e.id }) })
      return el('label', { className: 'import-src' }, radio, el('div', { className: 'meta' }, el('b', { textContent: e.name })))
    }))
    const ntp = el('div', { className: 'seg' }, ...[['almac', 'Almac page'], ['engine', 'Search engine homepage']].map(([v, t]) => el('button', {
      type: 'button', className: v === s.newTabPage ? 'on ask' : '', textContent: t,
      onclick() { almac.cmd('setting', { key: 'newTabPage', value: v }); ntp.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
    })))
    const sleepSeg = el('div', { className: 'seg' }, ...[[5, '5 min'], [10, '10 min'], [30, '30 min'], [60, '1 hour'], [0, 'Never']].map(([v, t]) => el('button', {
      type: 'button', className: v === s.sleepAfter ? 'on ask' : '', textContent: t,
      onclick() { almac.cmd('setting', { key: 'sleepAfter', value: v }); sleepSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
    })))
    const bar = el('input', { type: 'checkbox', checked: s.bookmarkBar, onchange: () => almac.cmd('setting', { key: 'bookmarkBar', value: bar.checked }) })
    const petCheck = el('input', { type: 'checkbox', checked: s.pet.out, onchange: () => almac.cmd('petOut', petCheck.checked) })
    const gpu = el('input', { type: 'checkbox', checked: s.hardwareAcceleration, onchange: () => almac.cmd('setting', { key: 'hardwareAcceleration', value: gpu.checked }) })
    return [
      el('div', { className: 'row' }, el('span', { textContent: 'Search engine' }), engines),
      el('div', { className: 'row' }, el('span', { textContent: 'New tab opens' }), ntp),
      el('div', { className: 'row' }, el('span', { textContent: 'Theme' }), skinPicker(s.skin),
        el('p', { className: 'modal-text', style: 'font-size:11px', textContent: 'Each pixel theme also sets light or dark for websites. Classic follows the sun/moon button (system, light or dark); with other themes that button is turned off.' })),
      el('div', { className: 'row' }, el('span', { textContent: 'Memory saver: sleep tabs after' }), sleepSeg,
        el('p', { className: 'modal-text', style: 'font-size:11px', textContent: 'Smart: mail, chat and docs stay awake 6× longer, pinned tabs and tabs with notifications 3×, light tabs 2×. Heavy tabs (700 MB+) sleep sooner, and all tabs sleep 4× sooner when the Mac is low on memory. Sleeping tabs keep their back/forward history and scroll position. Meetings, music, tabs with unsent typing and tabs you set to “Always awake” (right-click a tab) never sleep.' })),
      el('label', { className: 'check' }, bar, el('span', { textContent: 'Show bookmark bar (⌘⇧B)' })),
      el('label', { className: 'check' }, gpu, el('span', { textContent: 'Use hardware acceleration (applies after restart)' })),
      (() => { // unduhan: seperti Chrome
        const seg = el('div', { className: 'seg' }, ...[['auto', 'Save to folder'], ['last', 'Last used folder'], ['ask', 'Ask every time']].map(([v, t]) => el('button', {
          type: 'button', className: v === s.dl.mode ? 'on ask' : '', textContent: t,
          onclick() { almac.cmd('setting', { key: 'dlMode', value: v }); seg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
        })))
        return el('div', { className: 'row' }, el('span', { textContent: 'Downloads' }), seg,
          el('div', { className: 'inline dl-dir' }, iconEl('folder'), el('code', { textContent: s.dl.dir.replace(/^\/Users\/[^/]+/, '~'), title: s.dl.dir }),
            el('button', { type: 'button', onclick: () => { closeModal(); almac.cmd('dlChooseDir') } }, 'Change…'),
            ...(s.dl.custom ? [el('button', { type: 'button', onclick() { almac.cmd('setting', { key: 'dlDirReset' }); this.remove() } }, 'Use Downloads')] : [])),
          el('p', { className: 'modal-text', style: 'font-size:11px', textContent: 'Save to folder: files go straight to the folder above. Last used folder: straight to the folder you picked last time. Ask every time: choose the location for each download.' }))
      })(),
      el('label', { className: 'check' }, petCheck, el('span', { textContent: 'Almi is out of her house (drag her anywhere, drop tabs on her to close them)' })),
      el('div', { className: 'row' }, el('span', { textContent: 'Default browser' }),
        s.defaultBrowser ? el('p', { className: 'modal-text', textContent: '✓ Almac is your default browser. Links from other apps open here.' })
          : el('button', { type: 'button', disabled: !s.canSetDefault, title: s.canSetDefault ? '' : 'Only in the installed app', onclick: () => { almac.cmd('setDefaultBrowser'); closeModal() } }, iconEl('globe'), 'Set Almac as default browser')),
      el('div', { className: 'row' }, el('span', { textContent: 'Almac Browser v' + s.appVersion }),
        el('button', { type: 'button', onclick: () => { closeModal(); almac.cmd('updateCheck'); setTimeout(openUpdate, 80) } }, iconEl('retry'), 'Check for updates')),
    ]
  }

  // ---- Tab: Privasi ----
  function tabPrivacy() {
    const dnt = el('input', { type: 'checkbox', checked: !!s.doNotTrack, onchange: () => almac.cmd('setting', { key: 'doNotTrack', value: dnt.checked }) })
    const cookieSeg = el('div', { className: 'seg' },
      ...['allow', 'block_third_party', 'block_all'].map((v, i) => {
        const labels = ['Allow all', 'Block third-party', 'Block all']
        return el('button', {
          type: 'button', className: v === (s.cookiePolicy || 'allow') ? 'on ask' : '', textContent: labels[i],
          onclick() { almac.cmd('setting', { key: 'cookiePolicy', value: v }); cookieSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
        })
      })
    )
    const jsCheck = el('input', { type: 'checkbox', checked: !!s.blockJavaScript, onchange: () => almac.cmd('setting', { key: 'blockJavaScript', value: jsCheck.checked }) })
    const toggle = (key, label) => { const c = el('input', { type: 'checkbox', checked: !!s[key], onchange: () => almac.cmd('setting', { key, value: c.checked }) }); return el('label', { className: 'check sett-row' }, c, el('span', { textContent: label })) }
    // sertifikat tidak valid yang diingat (router, NAS, iLO): bisa dicabut
    const trusted = el('div', { className: 'row' }, el('span', { textContent: 'Remembered certificates (self-signed devices)' }))
    almac.ask('certTrust').then(hosts => trusted.append(hosts.length ? el('div', { className: 'pw-list' }, ...hosts.map(h => el('div', { className: 'hrow' }, el('div', { className: 'meta' }, el('b', { textContent: h })),
      el('button', { type: 'button', className: 'mini hx', title: 'Forget: ask again next time', onclick() { almac.cmd('certForget', h); this.parentNode.remove() } }, iconEl('x')))))
      : el('p', { className: 'modal-text', style: 'font-size:11px', textContent: 'None yet. On a certificate warning, tick "Remember this certificate" before proceeding.' })))
    const wipeSeg = el('div', { className: 'seg' }, ...[[0, 'Never'], [15, '15 min'], [30, '30 min'], [60, '1 hour']].map(([v, t]) => el('button', {
      type: 'button', className: v === s.privateWipeAfter ? 'on ask' : '', textContent: t,
      onclick() { almac.cmd('setting', { key: 'privateWipeAfter', value: v }); wipeSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '') },
    })))
    return [
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('shield'), el('span', { textContent: 'Privacy & Security' })),
        el('label', { className: 'check sett-row' }, dnt, el('span', { textContent: 'Send a Do Not Track request to websites' })),
        el('div', { className: 'row' }, el('span', { textContent: 'Cookie policy' }), cookieSeg),
        el('label', { className: 'check sett-row' }, jsCheck, el('span', { textContent: 'Block JavaScript on all sites (not recommended)' })),
        toggle('httpsOnly', 'HTTPS-Only mode: upgrade http:// links, warn before opening insecure sites'),
        toggle('stripTracking', 'Remove tracking parameters from links (utm_*, fbclid, gclid…)'),
        el('div', { className: 'row' }, el('span', { textContent: 'Auto-delete the private session after it is unused for' }), wipeSeg),
        trusted,
      ),
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('trash'), el('span', { textContent: 'Clear Data' })),
        el('div', { className: 'row' },
          el('span', { textContent: 'Clear browsing data for this profile' }),
          el('div', { className: 'inline' },
            el('button', { type: 'button', className: 'danger', onclick: async () => { if (await confirmModal('Clear cache', 'Cached web pages will be deleted. History & bookmarks are kept.', 'Clear')) { almac.cmd('clearCache'); } } }, iconEl('trash'), 'Clear cache'),
            el('button', { type: 'button', className: 'danger', onclick: async () => { if (await confirmModal('Clear cookies', 'All cookies & site data will be deleted. You will be signed out of all sites.', 'Clear')) { almac.cmd('clearCookies'); } } }, iconEl('cookie'), 'Clear cookies & site data'),
          )
        ),
      ),
    ]
  }

  // ---- Tab: DNS ----
  function tabDns() {
    const currentMode = s.dnsMode || 'auto'
    const dnsInput = el('input', { className: 'field', value: s.customDns || '', placeholder: 'https://dns.google/dns-query', spellcheck: false,
      oninput() { }, onchange() { almac.cmd('setting', { key: 'customDns', value: this.value }) } })
    const dnsSave = el('button', { type: 'button', className: '', onclick() { almac.cmd('setting', { key: 'customDns', value: dnsInput.value }) } }, iconEl('check'), 'Save')
    dnsInput.addEventListener('input', () => { dnsInput.style.borderColor = '' })
    const modeSeg = el('div', { className: 'seg' },
      ...[
        ['auto', 'Automatic (system)'], ['doh', 'DNS-over-HTTPS'], ['off', 'Unencrypted'],
      ].map(([v, t]) => el('button', {
        type: 'button', className: v === currentMode ? 'on ask' : '', textContent: t,
        onclick() {
          almac.cmd('setting', { key: 'dnsMode', value: v })
          modeSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : '')
          dnsSection.style.display = v === 'doh' ? '' : 'none'
        },
      }))
    )
    const dnsSection = el('div', { className: 'row', style: currentMode !== 'doh' ? 'display:none' : '' },
      el('span', { textContent: 'Custom DoH URL' }),
      el('div', { className: 'inline' }, dnsInput, dnsSave),
      el('p', { className: 'modal-text', style: 'font-size:11px;margin-top:2px', textContent: 'Examples: https://dns.google/dns-query · https://cloudflare-dns.com/dns-query · https://dns.quad9.net/dns-query' }),
    )
    const presets = el('div', { className: 'row' },
      el('span', { textContent: 'Quick DNS presets' }),
      el('div', { className: 'dns-presets' },
        ...[
          { name: 'Google DNS', url: 'https://dns.google/dns-query' },
          { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
          { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
          { name: 'AdGuard', url: 'https://dns.adguard.com/dns-query' },
          { name: 'NextDNS', url: 'https://dns.nextdns.io' },
        ].map(p => el('button', {
          type: 'button', className: 'dns-preset-btn' + (s.customDns === p.url ? ' on' : ''),
          onclick() {
            dnsInput.value = p.url
            almac.cmd('setting', { key: 'customDns', value: p.url })
            almac.cmd('setting', { key: 'dnsMode', value: 'doh' })
            modeSeg.querySelectorAll('button').forEach((b, i) => b.className = i === 1 ? 'on ask' : '')
            dnsSection.style.display = ''
            this.closest('.dns-presets').querySelectorAll('.dns-preset-btn').forEach(x => x.classList.toggle('on', x === this))
          },
        }, p.name))
      )
    )
    // proxy per profil (container & tab sekali pakai di profil ini ikut)
    const profile = s.profiles.find(p => p.id === s.activeProfile)
    const px = { mode: 'system', rules: '', bypass: '', pac: '', ...profile.proxy }
    const rules = el('input', { className: 'field', value: px.rules, placeholder: 'socks5://127.0.0.1:1080  or  http://proxy.kantor:8080', spellcheck: false })
    const bypass = el('input', { className: 'field', value: px.bypass, placeholder: '<local>;*.kantor.local;10.0.0.0/8', spellcheck: false })
    const pac = el('input', { className: 'field', value: px.pac, placeholder: 'http://wpad.kantor.local/proxy.pac', spellcheck: false })
    const fixedBox = el('div', { className: 'row' }, el('span', { textContent: 'Proxy server (SSH tunnel: ssh -D 1080 host → socks5://127.0.0.1:1080)' }), rules,
      el('span', { textContent: 'Bypass (no proxy for)' }), bypass)
    const pacBox = el('div', { className: 'row' }, el('span', { textContent: 'PAC script URL' }), pac)
    let pxMode = px.mode
    const showPx = () => { fixedBox.hidden = pxMode !== 'fixed'; pacBox.hidden = pxMode !== 'pac' }
    const pxSeg = el('div', { className: 'seg' }, ...[['system', 'System'], ['direct', 'No proxy'], ['fixed', 'Manual'], ['pac', 'PAC']].map(([v, t]) => el('button', {
      type: 'button', className: v === pxMode ? 'on ask' : '', textContent: t,
      onclick() { pxMode = v; pxSeg.querySelectorAll('button').forEach(b => b.className = b === this ? 'on ask' : ''); showPx() },
    })))
    showPx()
    const proxySection = el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('shield'), el('span', { textContent: 'Proxy · profile ' + profile.name })),
      el('div', { className: 'row' }, el('span', { textContent: 'Proxy for this profile' }), pxSeg), fixedBox, pacBox,
      el('div', { className: 'inline' }, el('button', { type: 'button', onclick: () => {
        if (pxMode === 'fixed' && !rules.value.trim()) return toast('Enter a proxy server first', 'warn')
        if (pxMode === 'pac' && !/^(https?|file|data):/.test(pac.value.trim())) return toast('Enter a PAC URL (http://…)', 'warn')
        almac.cmd('proxySet', { mode: pxMode, rules: rules.value, bypass: bypass.value, pac: pac.value })
      } }, iconEl('check'), 'Apply proxy')),
      el('p', { className: 'modal-text', style: 'font-size:11px;line-height:1.6', textContent: 'Each profile can use its own proxy, e.g. "Work" through the company proxy or an SSH tunnel, "Personal" direct. Proxies that ask for a password show a sign-in box.' }))
    return [
      proxySection,
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('globe'), el('span', { textContent: 'DNS Settings' })),
        el('div', { className: 'row' }, el('span', { textContent: 'Mode DNS' }), modeSeg),
        ...(s.dnsPausedForVpn ? [el('div', { className: 'site-card' }, iconEl('info'), el('div', { className: 'meta' },
          el('b', { textContent: 'Paused while your VPN is connected' }),
          el('small', { textContent: 'Company VPNs (GlobalProtect, etc.) use their own DNS. Almac uses it until the VPN disconnects, then DNS-over-HTTPS turns back on.' })))] : []),
        presets,
        dnsSection,
        el('p', { className: 'modal-text', style: 'font-size:11px;line-height:1.6' },
          'DNS-over-HTTPS (DoH) encrypts DNS requests so your ISP cannot monitor or block the sites you visit. Pick a preset or enter your own DoH URL.'
        ),
      ),
    ]
  }

  // ---- Tab: Fokus ----
  function tabFocus() {
    const sites = el('textarea', { className: 'field focus-sites', value: s.focusSites.join('\n'), spellcheck: false, rows: 7,
      onchange: () => almac.cmd('setting', { key: 'focusSites', value: sites.value.split(/[\s,]+/) }) })
    const status = el('p', { className: 'modal-text', textContent: s.focusUntil ? `Focus is on until ${new Date(s.focusUntil).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.` : 'Focus is off.' })
    return [
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('target'), el('span', { textContent: 'Focus mode' })),
        el('p', { className: 'modal-text', textContent: 'While a focus session runs, these sites are blocked. Pair it with the radio widget (⌘⇧M) for some lo-fi.' }),
        el('div', { className: 'row' }, el('span', { textContent: 'Blocked sites (one per line, subdomains included)' }), sites),
        status,
        el('div', { className: 'inline' },
          ...[25, 50, 90].map(m => el('button', { type: 'button', onclick: () => { almac.cmd('setting', { key: 'focusSites', value: sites.value.split(/[\s,]+/) }); almac.cmd('focusStart', m); closeModal() } }, iconEl('play'), `${m} min`)),
          s.focusUntil ? el('button', { type: 'button', className: 'danger', onclick: () => { almac.cmd('focusStop'); closeModal() } }, iconEl('cancel'), 'Stop') : ''),
      ),
    ]
  }

  // ---- Tab: Profil & Akun ----
  function tabProfile() {
    const profile = s.profiles.find(p => p.id === s.activeProfile)
    return [
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('user'), el('span', { textContent: 'Active Profile: ' + profile.name })),
        el('div', { className: 'row' },
          el('span', { textContent: 'Active profile' }),
          el('button', { type: 'button', className: 'link', onclick: () => { closeModal(); setTimeout(() => editProfile(profile), 80) } },
            iconEl('user'), el('span', { textContent: `Edit profile "${profile.name}" (name, color, icon)` }))
        ),
        el('div', { className: 'row' },
          el('span', { textContent: 'Google account' }),
          el('div', { className: 'inline' },
            el('button', { type: 'button', onclick: () => { closeModal(); almac.cmd('navigate', 'https://accounts.google.com/') } }, iconEl('user'), 'Sign in / Manage Google account'),
            el('button', { type: 'button', onclick: () => { closeModal(); almac.cmd('navigate', 'https://myaccount.google.com/') } }, iconEl('gear'), 'Google My Account'),
          ),
        ),
        el('div', { className: 'row' },
          el('span', { textContent: 'Saved passwords' }),
          el('div', { className: 'inline' },
            el('button', { type: 'button', onclick: () => { closeModal(); setTimeout(openPasswords, 80) } }, iconEl('key'), 'Almac Passwords'),
            el('button', { type: 'button', onclick: () => almac.cmd('passwords') }, iconEl('external'), 'Passwords.app (iCloud Keychain)')),
        ),
        ...(s.profiles.length > 1 ? [
          el('div', { className: 'row danger-zone' },
            el('span', { textContent: `${s.profiles.length} profiles` }),
            el('div', { className: 'inline' },
              ...s.profiles.filter(p => !p.ephemeral).map(p =>
                el('button', { type: 'button', className: p.id === s.activeProfile ? 'primary' : '',
                  onclick: () => almac.cmd('switchProfile', p.id),
                  style: `--c:${p.color}; border-left: 4px solid ${p.color}` },
                  el('span', { textContent: p.name + (p.id === s.activeProfile ? ' ✓' : '') })
                )
              )
            )
          ),
        ] : []),
      ),
      ...(profile.ephemeral ? [] : [containerSection(profile)]),
      el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('shield'), el('span', { textContent: 'Session & Profile Data' })),
        el('div', { className: 'row' },
          el('span', { textContent: 'Session data' }),
          el('div', { className: 'inline' },
            el('button', { type: 'button', onclick: async () => {
              if (await confirmModal('Delete all data for this profile', `History, cookies, cache, and logins for profile "${profile.name}" will be deleted.`, 'Delete')) {
                almac.cmd('clearAll')
              }
            }}, iconEl('trash'), 'Delete all data for this profile'),
          )
        ),
      ),
    ]
  }

  // ---- container: daftar, ganti nama/warna, hapus ----
  function containerSection(profile) {
    const list = el('div', { className: 'cont-list' }, ...(profile.containers || []).map(c => {
      const name = el('input', { className: 'field', value: c.name, maxLength: 24, onchange: () => almac.cmd('containerUpdate', { id: c.id, name: name.value }) })
      const color = el('input', { type: 'color', className: 'pick-color', value: c.color, onchange: () => almac.cmd('containerUpdate', { id: c.id, color: color.value }) })
      return el('div', { className: 'inline' }, color, name,
        el('button', { type: 'button', onclick: () => { closeModal(); almac.cmd('newTabIn', c.id) } }, iconEl('plus'), 'New tab'),
        twoStep('Delete', 'Delete tabs & data?', () => almac.cmd('containerRemove', c.id)))
    }))
    const newName = el('input', { className: 'field', placeholder: 'e.g. AWS Prod, Azure Client A', maxLength: 24 })
    return el('div', { className: 'sett-section' }, el('div', { className: 'sett-head' }, iconEl('layers'), el('span', { textContent: 'Containers' })),
      el('p', { className: 'modal-text', textContent: 'Like Firefox containers: each container keeps its own cookies and logins inside this profile, so you can be signed in to several AWS, Azure or Google Cloud accounts in one workspace. Right-click a tab or the + button to use them.' }),
      list,
      el('div', { className: 'inline' }, newName, el('button', { type: 'button', onclick: () => { almac.cmd('containerAdd', { name: newName.value }); setTimeout(() => switchTab('profile'), 120) } }, iconEl('plus'), 'Add container')))
  }

  // ---- Bangun modal dengan tab ----
  const TABS = [
    { id: 'general', label: 'General', icon: 'gear' },
    { id: 'privacy', label: 'Privacy', icon: 'shield' },
    { id: 'dns', label: 'DNS & Network', icon: 'globe' },
    { id: 'focus', label: 'Focus', icon: 'target' },
    { id: 'profile', label: 'Profile & Account', icon: 'user' },
  ]
  const content = el('div', { className: 'sett-content' })
  const tabBtns = el('div', { className: 'sett-tabs' })
  function switchTab(id) {
    s = lastState // terbaru (mis. container baru ditambahkan)
    activeTab = id
    tabBtns.querySelectorAll('.sett-tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === id))
    const fns = { general: tabGeneral, privacy: tabPrivacy, dns: tabDns, focus: tabFocus, profile: tabProfile }
    content.replaceChildren(...(fns[id]?.() || []))
  }
  TABS.forEach(t => {
    const b = el('button', { type: 'button', className: 'sett-tab-btn' + (t.id === activeTab ? ' on' : ''), 'data-tab': t.id,
      onclick: () => switchTab(t.id) }, iconEl(t.icon), el('span', { textContent: t.label }))
    b.dataset.tab = t.id
    tabBtns.append(b)
  })
  switchTab(activeTab)
  host.replaceChildren(tabBtns, content)
}
