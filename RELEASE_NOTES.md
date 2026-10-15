## 🧰 Quick tools in the command palette (⌘K)
- Type a keyword and the result appears right away:
  - `jwt` (or just paste a token): decode a JWT, with readable expiry times and an **EXPIRED** warning
  - `b64` and `url`: encode and decode
  - `hash`: MD5, SHA-1, SHA-256 and SHA-512
  - `dns`: DNS records (A, AAAA, MX, NS, TXT, SOA, CAA, or PTR for an IP)
  - `whois`: domain or IP owner, following the registry referrals
  - `ip`: your public IP, as seen from the current profile (through its proxy, if it has one)
- Text you type into a tool is never sent to search suggestions, so tokens and secrets stay on your Mac.

## 📄 JSON viewer
- API responses show as a colored, collapsible tree, with **Pretty** and **Raw** views, **Expand all**, **Collapse all** and **Copy**. Links inside the JSON can be clicked.

## 🎧 Meetings and music stay awake
- Memory saver no longer puts a tab to sleep while it uses your **camera or microphone** (Meet, Zoom, Teams), while it **plays video or music** (even muted), or within 5 minutes after it last played sound.
- Tabs in a meeting show a red microphone icon.

## ✨ What's new
- After each update, Almac shows what changed. Open it again any time from **Almac Browser › What's New…** or ⌘K.
- Release notes in the update dialog are easier to read.

## 🗂️ Clearer tabs and profiles
- The current profile name is shown above your tabs. Click it to switch profiles.
- Status and container badges no longer push the close button out of the tab.
- Status badges are shorter (`502`, `301`). The full redirect chain is in the tooltip and in Site info.
- Split view tabs show their full title again.

## 🐞 Fixes
- Typing a common word after a tool keyword in ⌘K (for example "url shortener") still lets you search for it.
- tiktokv.com, an official TikTok domain, no longer shows a look-alike warning.
- Redirects made by Almac itself (HTTPS-Only, tracker removal) no longer show a redirect badge.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.8-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
