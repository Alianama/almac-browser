## 📄 Full-page Downloads, History, Bookmarks, Extensions and Settings
- Like `chrome://downloads`, these now open as full pages in a tab: `almac://downloads`, `almac://history`, `almac://bookmarks`, `almac://extensions` and `almac://settings`.
- Open them with the shortcuts, the sidebar buttons or ⌘K, or type the address (`chrome://` works too). A page that is already open is reused instead of opening a second tab.
- Settings sections have their own addresses, for example `almac://settings/privacy`.
- In History and Bookmarks, a click opens the page in the same tab, like Chrome. ⌘-click opens it in a new tab.

## ⬇️ Downloads button with a pixel progress ring
- A Downloads button sits next to the extensions button at the top of the sidebar.
- While files download, a ring of pixel squares fills up around the button. If the file size is unknown, the squares spin. With more than one download, a number shows on the button.
- **⌘J** opens Downloads, like Chrome (Ctrl+J on Windows). ⌘⇧J still works.

## ☕ Always-awake tabs
- Right-click a tab › **Keep this tab always awake**. It is never put to sleep or closed by a temporary profile. A cup icon marks it.

## 🎨 Themes and light/dark
- Each pixel theme now also sets light or dark for websites. With a theme other than Classic, the sun/moon button is turned off, so the two settings no longer overlap.
- The Almac logo moved to the top-right corner, next to the bookmark bar.

## 🔎 Quick Search
- On Windows, Quick Search now opens with **Alt+Space**, like on the Mac. If another app already uses it, Almac falls back to Alt+Shift+Space.
- Typing now works right away on Windows. Before, releasing Alt could move the keyboard focus away from the search box.
- **Shift+Enter** opens the result in the current tab instead of a new one.

## 🐞 Fixes
- You can switch back to the Classic theme again.
- Empty new tabs no longer show "zz" as if they were asleep.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.10-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
