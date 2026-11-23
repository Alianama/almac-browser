## 💤 Sleeping tabs remember where you were
- A tab that wakes up comes back on the same page, scrolled to where you left it, and Back/Forward still work. Before, it reloaded from scratch.
- When your computer is low on memory, tabs you are not using sleep 4× sooner.

## 🐱 Almi stays home on new installs
- On a fresh install Almi now starts in her house. Bring her out from **Settings › General** or the Almi button. If she is already out on your computer, nothing changes.

## ⚡ Lighter and faster
- Settings, Passwords, Site info, Request log and Weekly stats now load the first time you open them, so Almac starts with less to load.
- The Quick Search window (⌥Space) closes itself after 5 minutes without use. Opening it again takes a moment longer.
- On heavy web apps like Gmail or Figma, password autofill stops scanning the page when it finds no login form. It starts again as soon as you click into a text field.
- The sidebar no longer refreshes every minute when nothing changed.

## 🖥️ Hardware acceleration switch
- **Settings › General › Use hardware acceleration** now works. Turn it off if pages flicker or look wrong, then restart Almac.

## 🔖 Bookmark bar
- Fixed a bookmark folder menu that sometimes could not be closed while a page was still loading.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.14-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
