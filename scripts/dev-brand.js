// Mode dev: binary Electron di node_modules bernama "Electron" (menu bar macOS, Dock). Ganti jadi "Almac Browser".
// Dijalankan otomatis lewat `postinstall`. Build produksi (.app) nanti memakai nama dari package.json.
const { execFileSync } = require('child_process')
const path = require('path')
if (process.platform !== 'darwin') process.exit(0)
const app = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = path.join(app, 'Contents', 'Info.plist')
for (const key of ['CFBundleName', 'CFBundleDisplayName']) execFileSync('plutil', ['-replace', key, '-string', 'Almac Browser', plist])
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]) // tanda tangan ad-hoc ulang setelah Info.plist diubah
console.log('dev-brand: Electron.app -> "Almac Browser"')
