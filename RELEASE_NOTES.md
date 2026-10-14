## 🪟 Almac Browser for Windows
Almac now runs on **Windows 10 and 11 (x64)** too, built from the same code as the Mac version.
- Tabs, workspaces, split view, Chrome extensions, ad blocking, DNS-over-HTTPS, profiles, Almac Passwords, Glance, Boosts and Quick Search all work on Windows.
- **Ctrl** replaces **⌘**. The shortcut sheet (**Ctrl+/**) and the command palette (**Ctrl+K**) show the Windows keys.
- **Quick Search** is **Alt+Shift+Space**, because Windows uses Alt+Space for the window menu.
- Switch workspaces with **Ctrl+Alt+PgUp/PgDn**.
- **In-app updates** work on Windows. Almac checks the signature and checksum of every update, then installs it in the background and reopens.
- **Import** bookmarks and history from Chrome, Brave, Edge or Vivaldi on Windows.
- Not on Windows yet: setting Almac as the default browser, Touch ID unlock.

## 🍎 Mac
- Nothing changes on the Mac. Update as usual.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.6-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
