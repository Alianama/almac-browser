## 📺 Real fullscreen video
- YouTube and other videos in fullscreen now fill the whole screen, like Chrome. The sidebar and bookmark bar no longer stay visible.

## ⏳ Temporary profiles
- Turn any profile into a temporary one in **Edit profile › Temporary mode**. Tabs you stop using close by themselves after 5, 15, 30 or 60 minutes.
- Temporary profiles keep no history, and their tabs are not restored after a restart. Logins stay.
- Pinned tabs, meetings and music are never closed. Press ⌘⇧T to bring back a tab that closed.

## 📌 Pinned tabs stay on their site
- Links to other sites, and addresses you type, open in a new tab, so the pinned tab stays where you pinned it. Pages on the same site still work as usual.
- To change it, right-click the pinned tab › **Edit pinned tab…**
- Sign-in pages (Google, Microsoft, Okta) still open inside the pinned tab.

## 🎨 Pixel themes
- 8 themes: Classic, Pastel, Midnight, Horror, Gaming, Game Boy, Terminal and Synthwave. Pick one in **Settings › General › Theme** or from ⌘K.
- Some themes add CRT scanlines, a dark vignette or glowing text.

## ⏱️ See when a page is loading
- A progress line shows above the page and in the address bar, and the tab icon blinks while the page loads.
- The reload button turns into a stop button while a page loads.
- If a site takes longer than 8 seconds, Almac tells you. Click the message to stop loading.

## 🧠 Smarter memory saver
- How long a tab stays awake now depends on what is in it. Mail, chat and docs stay awake 6× longer, pinned tabs and tabs with notifications 3×, and light tabs 2×. Heavy tabs (700 MB+) sleep sooner.
- Tabs with text you have typed but not sent are never put to sleep.
- A tab you just left no longer falls asleep right away because you had kept it open for a long time.
- New option: sleep tabs after 1 hour.

## 🐞 Fixes
- Closing a meeting tab (Meet, Zoom, Teams) now really leaves the meeting. Before, you stayed in the call after closing the tab.
- In the screen sharing picker, previews and text look sharp instead of pixelated, and long names are shortened with "…".
- The screen sharing picker always opens, even when a window or tab preview is slow.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.9-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
