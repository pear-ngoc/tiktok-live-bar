'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('./package-lib');

const options = lib.parseArgs(process.argv.slice(2));
const version = lib.resolveVersion(options.version);

const appPath = path.join(lib.ROOT, 'Build', 'macOS', 'TicToc_Live.app');
const appBinary = path.join(appPath, 'Contents', 'MacOS', 'TicToc_Live');
if (!fs.existsSync(appBinary)) {
    lib.fail('Build/macOS/TicToc_Live.app not found. Run ./build.sh (or the CI build) first.');
}

// The release name promises a Universal binary; verify before packaging.
(function verifyUniversal() {
    let archText = '';
    if (lib.hasCommand('lipo')) {
        const info = spawnSync('lipo', ['-info', appBinary], { encoding: 'utf8' });
        archText = `${info.stdout || ''}${info.stderr || ''}`;
    } else {
        const info = spawnSync('file', [appBinary], { encoding: 'utf8' });
        archText = `${info.stdout || ''}${info.stderr || ''}`;
    }
    if (!archText.includes('x86_64') || !archText.includes('arm64')) {
        lib.fail(`macOS binary is not Universal (Intel + Apple Silicon): ${archText.trim()}`);
    }
    lib.log(`Universal binary confirmed: ${archText.trim().split('\n')[0]}`);
})();

const packageName = 'TicToc-Live-macOS';
const packageDir = path.join(lib.ROOT, 'dist', packageName);
lib.ensureEmptyDir(packageDir);

// ditto preserves bundle metadata, symlinks and executable bits.
if (lib.hasCommand('ditto')) {
    lib.run('ditto', [appPath, path.join(packageDir, 'TicToc_Live.app')]);
} else {
    lib.copyDirFiltered(appPath, path.join(packageDir, 'TicToc_Live.app'), new Set());
}

lib.copyBridge(lib.ROOT, packageDir);
lib.copyLauncher(lib.ROOT, packageDir);
const assets = lib.copyRequiredDirs(lib.ROOT, packageDir);
for (const scriptName of ['run.command', 'run.sh']) {
    const target = path.join(packageDir, scriptName);
    fs.copyFileSync(path.join(lib.ROOT, scriptName), target);
    fs.chmodSync(target, 0o755);
}

if (options.withNode) {
    lib.embedNode(path.join(packageDir, 'runtime', 'node'), options.withNode);
}

fs.writeFileSync(path.join(packageDir, 'README.txt'), [
    'TIC TOC LIVE - macOS (Universal: Apple Silicon + Intel)',
    '',
    'Cach chay:',
    '  1. Giai nen toan bo ZIP.',
    '  2. Nhan doi (double-click) run.command trong Terminal,',
    '     hoac mo Terminal tai thu muc nay va chay: ./run.command',
    '',
    'Yeu cau:',
    '  - macOS chay tren Apple Silicon (M1/M2/M3/M4...) hoac Intel.',
    '  - Node.js 20 tro len (https://nodejs.org/) neu goi nay khong co runtime/node.',
    '',
    'Ung dung CHUA duoc ky so (unsigned). Lan chay dau, macOS co the canh bao:',
    '  - Chuot phai vao run.command (hoac TicToc_Live.app) -> Open -> Open.',
    '  - Hoac System Settings -> Privacy & Security -> Open Anyway.',
    'Khong tat Gatekeeper cho toan he thong.',
    '',
    'Nhac nen: tha file MP3/WAV/OGG vao DJ_MUSIC/. Video nen: DJ_VIDEO/.',
    'Control Panel: http://127.0.0.1:3000/control.html',
    'Nguon su kien LIVE mac dinh tren macOS: ket noi truc tiep TikTok (LIVE_PROVIDER=tiktok).',
    'Muon dung TikFinity: sua TikTokBridge/.env -> LIVE_PROVIDER=tikfinity.'
].join('\n') + '\n');

if (!options.skipZip) {
    const zipPath = path.join(lib.ROOT, 'dist', `${packageName}-Universal-${version}.zip`);
    lib.zipDirectory(packageDir, zipPath);
    lib.log(`Created ${zipPath}`);
}
lib.log(`Packaged ${packageName} (version ${version}); media folders: ${assets.join(', ') || 'none'}`);
