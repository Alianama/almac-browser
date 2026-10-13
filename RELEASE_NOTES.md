## 🐱 Almi 2.0: your pixel cat
- **Redrawn** as crisp, cute pixel art: a pink-and-white chibi cat with 52 frames of smooth animation, including a 4-legged walk, run, jump, blink, wave, happy, a big-mouth chomp and a curled-up sleep.
- **Gravity**: drag Almi anywhere, let go, and she falls onto the first surface below: the page floor, the top edge of the page, or the sidebar cards. She perches there and only walks along that surface.
- **Feed her tabs**: drag a tab from the sidebar onto Almi. She opens a big mouth, eats it, and the tab closes (⌘⇧T brings it back).
- **Almi's house**: the cat button in the sidebar opens her house, where you can let her out or call her home to nap.

## 🔑 Almac Passwords works like Bitwarden
- **Cat icon** inside login fields, and a dropdown whenever a login field is focused. Use the keyboard (↑ ↓ Enter) to choose a login.
- **Email-first sign-ins** (Google, Microsoft and others) now work: the email from the first step is filled, remembered and saved together with the password.
- **⌘⇧L** fills the login for the current site. The password manager has a new **This site → Fill** section.
- **Set up** is offered right from the login field, and the dropdown reappears right after you unlock.
- Fields inside shadow DOM are now detected.

## ✨ Other changes
- The ad & tracker counter moved to the top of the sidebar.
- The radio button now uses a headphones icon.

## ⬆️ In-app updates (new)
- Almac checks for updates when it opens and every 6 hours. You can also check from **Almac Browser › Check for Updates…**, the command palette (⌘K) or Settings.
- One click on **Update & Restart** installs the update. Your tabs, passwords and settings are kept.
- Every update is signed with **Ed25519** and verified with **SHA-512**. A tampered or forged update is refused.
- The app is now signed with a stable certificate. After you click **Always Allow** on the Keychain prompt once, later updates no longer ask.

> **Install this version once manually**: quit Almac, then replace the app in Applications. Updates are automatic from here on.

## Install
- `Almac-Browser-1.3.0-arm64.dmg` → Apple Silicon
- `Almac-Browser-1.3.0-x64.dmg` → Intel

The app is not notarized. On first launch, right-click the app and choose **Open**, or run:
`xattr -dr com.apple.quarantine "/Applications/Almac Browser.app"`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
