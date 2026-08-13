'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const notes = [];

function check(condition, okMessage, failMessage) {
    if (condition) {
        notes.push(`OK   ${okMessage}`);
    } else {
        errors.push(failMessage);
    }
}

function exists(relativePath) {
    return fs.existsSync(path.join(ROOT, relativePath));
}

function verifyWindows() {
    check(exists('Build/Windows/TicToc_Live.exe'), 'TicToc_Live.exe exists', 'Build/Windows/TicToc_Live.exe is missing');
    check(exists('Build/Windows/TicToc_Live_Data'), 'TicToc_Live_Data exists', 'Build/Windows/TicToc_Live_Data is missing (Unity runtime data)');
    check(exists('Build/Windows/UnityPlayer.dll'), 'UnityPlayer.dll exists', 'Build/Windows/UnityPlayer.dll is missing');
    check(exists('Build/Windows/GameAssembly.dll'), 'GameAssembly.dll exists (IL2CPP)', 'Build/Windows/GameAssembly.dll is missing (expected for IL2CPP builds)');
}

function verifyMacOS() {
    const app = 'Build/macOS/TicToc_Live.app';
    const binary = path.join(app, 'Contents', 'MacOS', 'TicToc_Live');
    check(exists(app), 'TicToc_Live.app exists', `${app} is missing`);
    check(exists(path.join(app, 'Contents', 'Info.plist')), 'Info.plist exists', `${app}/Contents/Info.plist is missing`);
    check(exists(path.join(app, 'Contents', 'Resources', 'Data')), 'Player data (Contents/Resources/Data) exists', `${app}/Contents/Resources/Data is missing`);

    const binaryPath = path.join(ROOT, binary);
    if (!fs.existsSync(binaryPath)) {
        errors.push(`${binary} is missing`);
        return;
    }
    const stats = fs.statSync(binaryPath);
    check((stats.mode & 0o111) !== 0, 'binary is executable', `${binary} lost its executable bit`);

    const fileProbe = spawnSync('file', [binaryPath], { encoding: 'utf8' });
    const fileText = `${fileProbe.stdout || ''}${fileProbe.stderr || ''}`;
    check(fileText.includes('Mach-O'), 'binary is a Mach-O executable', `file(1) does not recognize the binary: ${fileText.trim()}`);

    // Prefer lipo (macOS hosts); on Linux fall back to file(1), which lists
    // every slice of a universal binary.
    let archText = '';
    const lipoProbe = spawnSync('lipo', ['-info', binaryPath], { encoding: 'utf8' });
    if (lipoProbe.status === 0) {
        archText = `${lipoProbe.stdout || ''}${lipoProbe.stderr || ''}`;
    } else {
        archText = fileText;
    }
    notes.push(`     arch: ${archText.trim().split('\n')[0]}`);
    check(
        archText.includes('x86_64') && archText.includes('arm64'),
        'binary is Universal (x86_64 + arm64)',
        `binary is NOT Universal (Intel + Apple Silicon): ${archText.trim()}`
    );
}

const target = process.argv[2];
if (target === 'windows') verifyWindows();
else if (target === 'macos') verifyMacOS();
else {
    process.stderr.write('Usage: node scripts/verify-build.js <windows|macos>\n');
    process.exit(2);
}

for (const line of notes) process.stdout.write(`[verify] ${line}\n`);
if (errors.length > 0) {
    for (const line of errors) process.stderr.write(`[verify] FAIL ${line}\n`);
    process.exit(1);
}
process.stdout.write(`[verify] ${target} build verified.\n`);
