## 📌 Pinned tabs
- Pin a tab from the right-click menu, with **⌘⇧D**, or from the command palette. Pinned tabs show as icon tiles at the top of the tab list and are kept across restarts.
- **⌘W does not close a pinned tab**: it goes to sleep and Almac switches to another tab. Right-click a tile to unpin it, go back to its pinned page, or close it.
- **Close all tabs** in a workspace keeps pinned tabs.

## 🖥️ Screen sharing in meetings
- Google Meet, Zoom web, Teams and other sites can now share your screen. On macOS 15+ Almac uses the native macOS picker; on older versions it shows its own picker for screens and windows.
- If the Screen Recording permission is missing, Almac shows a shortcut to the right System Settings page.

## 🌐 VPN (GlobalProtect and others)
- **Fixed:** pages did not load while a company VPN was connected if DNS-over-HTTPS was on. Almac now detects the VPN, pauses DNS-over-HTTPS and uses the VPN's DNS, then turns DoH back on when the VPN disconnects.

## 🐱 Almi
- **Fixed:** Almi could not be dragged, especially on a fresh profile. Dragging now follows the system cursor directly, so it no longer gets stuck.

## Install / update
- Already on **v1.3.0**? Click **Update & Restart** when the update notification appears, or use **Almac Browser › Check for Updates…**.
- New install: `Almac-Browser-1.3.1-arm64.dmg` (Apple Silicon) or `Almac-Browser-1.3.1-x64.dmg` (Intel).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
