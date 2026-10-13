## 🔒 No more blank pages on "not secure" sites
Almac used to show a white page when a site failed to load. It now shows a clear error page with Almi:
- **Invalid certificate** (self-signed, expired, wrong name, e.g. company or router sites): "Your connection is not private", with **Back to safety** and **Proceed (unsafe)**. Proceed needs two clicks and only applies to that exact certificate for this session.
- **Site without HTTPS**: if the secure version fails or does not answer within 5 seconds, you get **Open insecure version (http)**. No more endless white pages.
- **Can't reach the page** (unknown domain, connection failed): **Try again**, plus **Use system DNS** when DNS-over-HTTPS was the cause.

## ⬆️ Update dialog fix
- **Fixed:** opening **Check for Updates…** showed the new version but only a **Close** button. **Update & Restart** now appears as soon as an update is found.

## Install / update
- On **v1.3.1**: **Almac Browser › Check for Updates…** → **Update & Restart**.
- On **v1.3.0**: restart Almac, wait for the "Almac v1.3.2 is available" notification, then click it (the button bug is fixed from this version on).
- New install: `Almac-Browser-1.3.2-arm64.dmg` (Apple Silicon) or `Almac-Browser-1.3.2-x64.dmg` (Intel).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
