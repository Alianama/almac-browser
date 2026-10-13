<div align="center">
  <img src="ui/logo.svg" width="80" alt="Almac Browser Logo">
  <h1>Almac Browser</h1>
  <p><strong>A pixel-aesthetic, privacy-focused browser built on Electron + Chromium</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-1.3.2-brightgreen?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/badge/built%20with-Electron-47848f?style=flat-square&logo=electron" alt="Electron">
    <img src="https://img.shields.io/badge/Chrome-Extensions-yellow?style=flat-square&logo=googlechrome" alt="Chrome Extensions">
  </p>

  <p>
    <img src="https://img.shields.io/badge/adblock-built--in-success?style=flat-square" alt="Adblock">
    <img src="https://img.shields.io/badge/DNS--over--HTTPS-supported-blueviolet?style=flat-square" alt="DoH">
    <img src="https://img.shields.io/badge/multi--profile-supported-orange?style=flat-square" alt="Multi Profile">
  </p>
</div>

---

## ✨ Features

### 🎨 Pixel-Aesthetic Design
- Unique **pixel + glassmorphism** UI theme with animated Lucide icons
- Full **light / dark / system** theme support
- Animated sidebar with smooth workspace transitions
- Customizable accent color per profile and workspace

### 🛡️ Privacy & Security
- **Built-in ad & tracker blocker** (Ghostery / EasyList / EasyPrivacy)
- **DNS-over-HTTPS (DoH)** — choose from Google, Cloudflare, Quad9, AdGuard, NextDNS, or your own custom DoH URL
- **Do Not Track** signal support
- **Cookie policy control** — allow all, block third-party, or block all
- **JavaScript toggle** per browser session
- **Site permissions** (camera, microphone, location, notifications, clipboard) with per-origin memory
- **Private (ephemeral) mode** — zero disk storage, no history, no extensions
- **HTTPS-Only mode** — http:// is upgraded automatically, with a warning before opening an insecure site
- **Tracking parameter removal** — strips `utm_*`, `fbclid`, `gclid` and friends from links
- **Global Privacy Control** — sent together with Do Not Track
- **Private session auto-delete** after a chosen idle time
- **Crashed tab recovery** — reload prompt instead of a blank page

### 🔑 Almac Passwords
- Built-in password manager: **AES-256-GCM** vault, key derived from your master password (PBKDF2-SHA256, 600k iterations). Same scheme as Almac Remote
- Bitwarden-style autofill: cat icon in login fields, dropdown on focus, email-first sign-ins, **⌘⇧L** to fill; strong password generator
- **Touch ID unlock**, auto-lock after inactivity, sleep, or screen lock; copied passwords are cleared from the clipboard after 30 s
- **Import / export CSV in Apple Passwords format** (`Title,URL,Username,Password,Notes,OTPAuth`), also reads Chrome/Brave/Edge exports
- Private profiles never autofill or save

### ⚡ Productivity & Fun
- **Command palette (⌘K)** — search tabs across workspaces, bookmarks, history and commands
- **Reopen closed tab (⌘⇧T)** and **Picture-in-Picture (⌘⌥P)**
- **Focus mode** — block distracting sites for 25/50/90 minutes
- **Almi, the pixel cat** — walks around your pages with gravity (perches on surfaces), eats blocked trackers, eats tabs you drop on her (closes them), naps in her house
- **Radio widget (⌘⇧M)** — floating pixel radio controls YouTube Music from any page: tracklist to pick a song, animated volume
- **In-app updates** — signed (Ed25519) and checksum-verified, one click to update & restart

### 🔖 Profiles
- Multiple **isolated profiles** — separate cookies, history, bookmarks, extensions
- Per-profile **Google login** support
- Custom name, color, and animated icon per profile
- **Profile data management** — clear cache, clear cookies, or nuke all data

### 🗂️ Workspaces
- Multiple **workspaces per profile** (like Arc browser)
- Custom name, animated icon, and color per workspace
- Swipe between workspaces with **2-finger trackpad gesture** or **3-finger swipe**

### 🌐 Extensions
- Full **Chrome Extension (MV2 & MV3)** support via `electron-chrome-extensions`
- Install extensions directly from **Chrome Web Store**
- Pin/unpin extensions to toolbar
- Per-profile extension isolation

### 📚 Browsing
- **Bookmark bar** with folder support and nested dropdown menus
- **History** with search, grouped by day
- **Downloads manager** with pause / resume / cancel
- **Import** bookmarks & history from Chrome, Brave, Edge, Arc, Vivaldi
- **Split view** — browse two pages side by side

### 🔍 Smart URL Bar
- Combined search + address bar with **OpenSearch suggestions**
- Supports Google, DuckDuckGo, Bing, Brave Search, Startpage, Ecosia
- Bookmark and history suggestions inline

### ⚙️ Settings
Tabbed settings panel similar to Chrome:
- **General** — search engine, new tab page, memory saver, bookmark bar
- **Privacy** — Do Not Track, cookie policy, JavaScript control, clear data
- **DNS & Network** — DNS mode, DoH presets, custom DoH URL
- **Profile & Account** — edit profile, Google account links, password manager

---

## 📦 Installation

### Prerequisites
- **Node.js** 18+
- **macOS** (primary target; Linux/Windows partially supported)

### Download
Grab the `.dmg` from [Releases](https://github.com/Alianama/almac-browser/releases) (`arm64` = Apple Silicon, the other = Intel).
The app is not notarized, so on first launch right-click the app → **Open**, or run:
`xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"`

### Updates
From v1.3.0, Almac updates itself: it checks GitHub Releases on launch and every 6 hours, or use **Almac Browser › Check for Updates…**.
Every release ships a manifest signed with the maintainer's Ed25519 key. The app installs a download only when the signature and the SHA-512 checksum both match, so a compromised GitHub account cannot push a fake update.

### Build & release
- `npm run dist` → unsigned-feed build in `dist/`
- `npm run release -- notes.md` → build, sign the update manifest with `~/.almac/update-key.pem`, and publish the GitHub release

### Run from Source

```bash
git clone https://github.com/Alianama/almac-browser.git
cd almac-browser
npm install
npm start
```

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New Tab | `⌘T` |
| Close Tab | `⌘W` |
| Private Tab | `⌘⇧N` |
| Focus Address Bar | `⌘L` |
| Find in Page | `⌘F` |
| Bookmark Page | `⌘D` |
| History & Bookmarks | `⌘Y` |
| Settings | `⌘,` |
| Toggle Bookmark Bar | `⌘⇧B` |
| Toggle Sidebar | `⌘S` |
| Zoom In / Out | `⌘+` / `⌘-` |
| Next Workspace | `⌘⌥→` |
| Previous Workspace | `⌘⌥←` |
| Passwords (Keychain) | `⌘⇧P` |
| DevTools | `⌘⌥I` |

---

## 🏗️ Architecture

```
almac-browser/
├── main.js          # Electron main process — window, sessions, IPC, commands
├── preload.js       # Context bridge (almac.cmd / almac.ask / almac.on*)
├── ui/
│   ├── index.html   # Entire sidebar UI + all JS (vanilla, no framework)
│   ├── theme.css    # Pixel + glassmorphism design system
│   ├── icons.js     # Bundled Lucide animated icons
│   └── logo.svg     # Almac pixel logo
├── scripts/
│   ├── build-icons.js   # Bundles Lucide icons → icons.js
│   ├── build-logo.js    # Generates pixel logo SVG
│   └── dev-brand.js     # Sets app icon in dev mode
└── build/
    ├── icon.png     # App icon
    └── icon.icns    # App icon (macOS bundle)
```

### Key Libraries

| Library | Purpose |
|---------|---------|
| [`electron`](https://electronjs.org) | App shell + Chromium engine |
| [`electron-chrome-extensions`](https://github.com/samuelmaddock/electron-browser-shell) | MV2/MV3 Chrome extension support |
| [`electron-chrome-web-store`](https://github.com/samuelmaddock/electron-chrome-web-store) | Install extensions from Chrome Web Store |
| [`@ghostery/adblocker-electron`](https://github.com/ghostery/adblocker) | Built-in ad & tracker blocking |
| [`tldts-experimental`](https://github.com/remusao/tldts) | Domain parsing for cookie management |
| [`@fontsource/silkscreen`](https://fontsource.org/fonts/silkscreen) | Pixel font for UI elements |

---

## 🔒 Privacy Notes

- No telemetry, no analytics, no data collection of any kind
- History, bookmarks, and state stored **locally only** in Electron's `userData` directory
- Ad blocking uses cached filter lists (EasyList, EasyPrivacy) — no cloud sync
- DNS-over-HTTPS is **opt-in** and goes directly to your chosen provider
- Private mode tabs leave **zero trace** on disk

---

## 🧩 Chrome Extension Support

Almac Browser supports most Chrome extensions (MV2 and MV3). Install via:
1. Click the **Extensions** button in the sidebar (puzzle icon)
2. Click **Chrome Web Store**
3. Install any extension as you would in Chrome

> **Note:** Extensions are isolated per profile. Private mode tabs do not load extensions.

---

## 🚧 Known Limitations

- Currently optimized for **macOS** (traffic light buttons, `hiddenInset` title bar, iCloud Keychain integration)
- No mobile / responsive layout (desktop app only)
- Some Chrome APIs may not be available in all extensions
- Hardware acceleration toggle requires app restart to take full effect

---

## 📝 Changelog

### v1.0.0 — Initial Release (2026-10-12)
- Full-featured browser with unique pixel + glassmorphism UI
- Multi-profile, multi-workspace support
- Built-in ad & tracker blocker (Ghostery / EasyList)
- Chrome extension support via Web Store (MV2 + MV3)
- Import bookmarks & history from Chrome / Brave / Edge / Arc / Vivaldi
- Split view, bookmark bar, history, downloads manager
- Site permissions manager, site info panel, SSL certificate viewer
- **DNS-over-HTTPS** with presets (Google, Cloudflare, Quad9, AdGuard, NextDNS)
- **Tabbed settings panel** — General, Privacy, DNS & Network, Profile & Account
- Cookie policy control, JavaScript toggle, Do Not Track
- Clear cache / clear cookies / clear all profile data
- Fixed: pinned extensions now correctly appear in the toolbar
- Private (ephemeral) browsing mode

---

## 📄 License

Licensed under the **GNU General Public License v3.0**.  
See [LICENSE](LICENSE) for details.

This project uses:
- `electron-chrome-extensions` — GPL-3.0
- `@ghostery/adblocker-electron` — MPL-2.0

---

<div align="center">
  <sub>Built with ❤️ and pixels · <a href="https://github.com/Alianama">@Alianama</a></sub>
</div>
