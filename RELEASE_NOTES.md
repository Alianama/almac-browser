## ⌥Space Quick Search
- Press **⌥Space** from any app to open a pixel-art search window, like Spotlight. It searches your open tabs, bookmarks, history and search suggestions. **↩** opens the result, **Esc** closes the window.

## 👀 Glance (like Zen and Arc Peek)
- **⌥-click** a link to open it in a floating window over the current tab.
- **Esc** or a click outside closes it. **⌘↩** or **Open as tab** keeps it as a tab.

## 🚀 Boosts (like Arc)
- **⌘⌥K** adds your own CSS and JavaScript to a site. Almac applies them every time the site loads.
- **⌘⌥Z** (Zap) hides any element with one click. Remove a zap in the Boost editor.

## 🗂️ Tabs
- **Tab groups**: right-click a tab › **Add tab to new group**. Groups have a name and a color, and they collapse.
- **Unread counters on tabs**: Gmail, WhatsApp and other sites show their unread count on their own tab. The count no longer appears on the Dock icon.
- **Speaker icon** on tabs that play sound. Click it to mute the tab.
- **More room for pages**: the bookmark bar is thinner, and pages start 12px higher.

## ⌨️ Chrome-style shortcuts and menus
- **Help › Keyboard Shortcuts** (**⌘/**) shows every shortcut in a searchable list.
- New shortcuts:
  - ⌘1–9 to switch tabs, ⌃Tab or ⌘⌥←→ for the next and previous tab
  - ⌘⇧R force reload, ⌘P print, ⌘⇧A search tabs
  - DevTools ⌘⌥I / F12, Console ⌘⌥J, Inspect ⌘⌥C, View Source ⌘⌥U
- **Changed shortcuts**:
  - **⌘S** now saves the page. Show/hide the sidebar moved to **⌘⇧S**.
  - **⌘⌥←→** now switches tabs. Switch workspace moved to **⌃⌘←→**.
- **Right-click menu** on pages:
  - Open a link in a new tab, a private tab or Glance
  - Copy or save an image
  - Search the selected text, or translate it
  - Spelling suggestions
  - View source and Inspect
- Type `chrome://settings`, `chrome://history`, `chrome://extensions` and similar addresses to open the matching panel.
- New in the **View** menu:
  - **Reader Mode** (⌘⌥R)
  - **Translate Page**

## 🧩 Extensions
- **Fixed:** clicking an extension did nothing on a new empty tab. Almac now shows a message to open a website first, because extensions work on the page in the current tab.
- **Developer mode**: **Load unpacked** loads an extension from a folder. Use **Reload** after you edit it.

## 💾 Your data is safer
- **Fixed:** if Almac quit or crashed while saving, bookmarks, history or tabs could be lost. Almac now saves to a temporary file and then swaps it in. A damaged file is kept as `*.corrupt-<time>` instead of being replaced.
- **File › Back Up Data…** and **Restore Backup…**: back up tabs, bookmarks, history, settings and the encrypted password vault.
- Spell check is on in text fields.

## Install (first time)
1. Download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
2. Almac is not notarized by Apple, so macOS blocks it the first time ("Almac Browser is damaged" or "cannot be opened"). Run this once in Terminal:
   ```
   xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
   ```
   Or open **System Settings › Privacy & Security** and click **Open Anyway**.

You only need this step after you download Almac from the internet. In-app updates don't need it.

## Update
**Almac Browser › Check for Updates…** → **Update & Restart**.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
