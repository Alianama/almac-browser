## 🧰 Tools for IT & security work
- **Site info** (lock icon) now shows the full certificate: issuer, validity, names (SAN), SHA-256, plus the **TLS version, cipher and key exchange** and the **server IP**.
- **Certificate expiry warning**: Almac tells you when a site's certificate expires within 14 days.
- **HTTP status on tabs**: errors and redirects show a badge, for example `502` or `301›200`. Site info lists the response headers with a checklist for HSTS, CSP, X-Frame-Options and more.
- **Request log** (**⌘⌥L**): every domain the page contacted, with request counts, blocked requests, first/third party and IP. Copy it as CSV.
- **Remember self-signed certificates**: routers, firewalls, iLO/iDRAC, Proxmox and NAS boxes only need to be trusted once. Almac remembers the exact certificate and asks again if it changes. Manage the list in **Settings › Privacy**.
- **Device notes**: keep the IP, VLAN, owner and notes for each device, encrypted together with your passwords (**Site info**, or **Passwords › Device notes**).
- **Sign-in boxes for HTTP Basic login and proxies**: device panels that use Basic login now ask for a username and password instead of failing.

## 🛡️ Security
- **Look-alike site warning**: addresses that imitate well-known sites (`paypa1.com`, `аpple.com` written with Cyrillic letters, `paypal-secure-login.com`) show "Is this the site you want?" before the page loads.
- **Disposable tabs** (**⌘⌥N**, or right-click a link › **Open Link in Disposable Tab**): open a suspicious link in a throwaway session that is wiped when the tab closes.

## 🗂️ Containers & proxy
- **Containers** (like Firefox): separate cookies and logins inside one profile, so you can be signed in to several AWS, Azure or Google Cloud accounts in one workspace. Create them in **Settings › Profile**, then right-click a tab or the **+** button.
- **Proxy per profile**: system, none, manual (HTTP or SOCKS5, for example an `ssh -D` tunnel) or PAC, in **Settings › DNS & Network**.

## 🐞 Fixes
- Pages that fail with an empty server error (for example **HTTP 502**) show an error page instead of a blank white screen.
- The certificate warning explains the problem again (the explanation was missing).
- Trackers that the ad blocker replaces with an empty script are counted as blocked.

## Install (first time)
**macOS:** download the `.dmg` (**arm64** for Apple Silicon, **x64** for Intel), open it, and drag **Almac Browser** to **Applications**.
Apple has not notarized Almac, so macOS blocks it the first time ("damaged" or "cannot be opened"). Run this once in Terminal:
```
xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"
```
Or open **System Settings › Privacy & Security** and click **Open Anyway**.

**Windows:** download `Almac-Browser-1.3.7-win-x64.exe` and run it. It installs for your user account, with no admin rights needed.
The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.

You only need these steps after you download Almac from the internet. In-app updates don't need them.

## Update
**Check for Updates…** → **Update & Restart** (macOS: **Almac Browser** menu; Windows: **Ctrl+K** › "Check for updates").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
