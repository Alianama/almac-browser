## 🪟 Popup windows close again
- Separate windows opened by a site, like the Proxmox shell console, can be closed with the close button again. Before, a "leave this page?" check on the site silently stopped them from closing.
- **⌘W** in a popup window closes that window, not the tab behind it.

## 🔗 Link preview on hover
- Hover a link to see where it goes, in a small label at the bottom-right of the page, like Chrome.

## 🧹 Tidier tabs
- New tabs open at the top of the tab list.
- Tabs you haven't opened for 7 days close automatically. Pinned tabs, tabs in a group and split-view tabs are kept. Press **⌘⇧T** to reopen a closed tab.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.11-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
