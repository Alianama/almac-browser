## 📺 YouTube ads skipped
- YouTube now puts ads inside the video stream, so blocking them shows "Ad blockers violate YouTube's Terms of Service" or a playback error. Almac no longer blocks ads on YouTube. Instead, it mutes each ad and skips it right away.
- If YouTube already flagged your account, the warning can still show for a while until YouTube clears the flag.

## 🛡️ Ad blocker on/off
- Turn the ad blocker off or on from **Almi's house** (the Almi button in the sidebar). The current page reloads so the change shows right away.

## 🧹 Auto-close, your way
- Choose per profile when unused tabs close: never, 1 hour, 6 hours, 12 hours, 1 day, 3 days, 7 days or 30 days (**Edit profile › Auto-close unused tabs after**). The default stays 7 days.
- Tabs you rarely open, or opened only once, close first. Tabs you open often get 3× longer. Pinned, grouped and split tabs, meetings and music are never closed. **⌘⇧T** reopens a closed tab.

## ↕️ Drag to reorder tabs
- Drag a tab up or down in the sidebar to move it. A line shows where it will land. Dropping it next to a tab in a group adds it to that group.

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
