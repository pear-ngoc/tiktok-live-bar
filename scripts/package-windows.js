'use strict';

const fs = require('node:fs');
const path = require('node:path');
const lib = require('./package-lib');

const options = lib.parseArgs(process.argv.slice(2));
const version = lib.resolveVersion(options.version);

const gameSourceDir = path.join(lib.ROOT, 'Build', 'Windows');
const exePath = path.join(gameSourceDir, 'TicToc_Live.exe');
if (!fs.existsSync(exePath)) {
    lib.fail('Build/Windows/TicToc_Live.exe not found. Run build.bat (or the CI build) first.');
}

const packageName = 'TicToc-Live-Windows-x64';
const packageDir = path.join(lib.ROOT, 'dist', packageName);
lib.ensureEmptyDir(packageDir);

// Game files (.exe, _Data, UnityPlayer.dll, MonoBleedingEdge...) live at the
// package root, next to run.bat, exactly like the launcher expects.
lib.copyDirFiltered(gameSourceDir, packageDir, new Set(['.DS_Store']));
lib.copyBridge(lib.ROOT, packageDir);
lib.copyLauncher(lib.ROOT, packageDir);
const assets = lib.copyRequiredDirs(lib.ROOT, packageDir);
fs.copyFileSync(path.join(lib.ROOT, 'run.bat'), path.join(packageDir, 'run.bat'));

if (options.withNode) {
    lib.embedNode(path.join(packageDir, 'runtime', 'node.exe'), options.withNode);
}

fs.writeFileSync(path.join(packageDir, 'README.txt'), [
    'TIC TOC LIVE - Windows x64',
    '',
    'Cach chay:',
    '  1. Giai nen toan bo ZIP ra mot thu muc (khong chay truc tiep trong ZIP).',
    '  2. Nhap doi run.bat. Launcher tu mo Bridge, Game va Control Panel.',
    '',
    'Yeu cau:',
    '  - Windows 10/11 64-bit.',
    '  - Node.js 20 tro len (https://nodejs.org/) neu goi nay khong co runtime/node.exe.',
    '',
    'Nhac nen: tha file MP3/WAV/OGG vao DJ_MUSIC/. Video nen: DJ_VIDEO/.',
    'Control Panel: http://127.0.0.1:3000/control.html',
    'Nguon su kien LIVE mac dinh: TikFinity Desktop (ws://127.0.0.1:21213/).',
    'Muon ket noi truc tiep TikTok: sua TikTokBridge/.env -> LIVE_PROVIDER=tiktok.',
    '',
    'Neu Windows SmartScreen canh bao: chon More info -> Run anyway',
    '(ban tai tu Release chinh thuc).'
].join('\r\n') + '\r\n');

if (!options.skipZip) {
    const zipPath = path.join(lib.ROOT, 'dist', `${packageName}-${version}.zip`);
    lib.zipDirectory(packageDir, zipPath);
    lib.log(`Created ${zipPath}`);
}
lib.log(`Packaged ${packageName} (version ${version}); media folders: ${assets.join(', ') || 'none'}`);
