// Mode dev: binary Electron di node_modules bernama "Electron" (menu bar macOS, Dock). Ganti jadi "Almac Browser".
// Dijalankan otomatis lewat `postinstall`. Build produksi (.app) nanti memakai nama dari package.json.
const { execFileSync } = require('child_process')
const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
if (process.platform !== 'darwin') process.exit(0)
const app = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = path.join(app, 'Contents', 'Info.plist')
;(async () => {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', 'Almac Browser', plist])
  // cookie (sesi login) dienkripsi dengan kunci di Keychain seperti Chrome; bawaan Electron = teks biasa di disk
  await flipFuses(path.join(app, 'Contents', 'MacOS', 'Electron'), { version: FuseVersion.V1, [FuseV1Options.EnableCookieEncryption]: true })
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]) // tanda tangan ad-hoc ulang setelah Info.plist & fuse diubah
  console.log('dev-brand: Electron.app -> "Almac Browser", cookie terenkripsi')
})()
