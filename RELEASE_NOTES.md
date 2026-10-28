## 📺 YouTube ads skipped
- YouTube now puts ads inside the video stream, so blocking them shows "Ad blockers violate YouTube's Terms of Service" or a playback error. Almac no longer blocks ads on YouTube. Instead, it mutes each ad and skips it right away.
- If YouTube already flagged your account, the warning can still show for a while until YouTube clears the flag.

## 🛡️ Ad blocker on/off
- Turn the ad blocker off or on from **Almi's house** (the Almi button in the sidebar). The current page reloads so the change shows right away.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.12-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
