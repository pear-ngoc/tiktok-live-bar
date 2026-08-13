'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE_DIR = path.join(ROOT, 'TikTokBridge');
const BUILD_DIR = path.join(ROOT, 'Build');

const WINDOWS_GAME_NAMES = ['TicToc_Live.exe', 'OngChuMMO_Live.exe', 'TIKTOK_LIVE_BAR.exe'];
const MACOS_GAME_NAMES = ['TicToc_Live.app', 'OngChuMMO_Live.app'];

function logsDir() {
    const override = process.env.TICTOC_LOGS_DIR;
    const dir = override ? path.resolve(override) : path.join(ROOT, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function searchDirs(root) {
    return [
        root,
        path.join(root, 'Build'),
        path.join(root, 'Build', 'Windows'),
        path.join(root, 'Build', 'macOS')
    ];
}

// Distribution folders and local development checkouts share the same layout,
// so the launcher searches the same candidate locations on every machine.
// Legacy build names are kept so existing Windows installs keep working.
function findGame(options = {}) {
    const root = options.root || ROOT;
    const platformName = options.platform || process.platform;
    const exists = options.exists || (candidate => fs.existsSync(candidate));
    const readDir = options.readDir || (dir => fs.readdirSync(dir));

    if (platformName === 'win32') {
        for (const dir of searchDirs(root)) {
            for (const name of WINDOWS_GAME_NAMES) {
                const candidate = path.join(dir, name);
                if (exists(candidate)) return { kind: 'exe', path: candidate };
            }
        }
        return null;
    }

    if (platformName === 'darwin') {
        for (const dir of searchDirs(root)) {
            for (const name of MACOS_GAME_NAMES) {
                const bundle = path.join(dir, name);
                if (!exists(bundle)) continue;
                const expectedBinary = path.join(bundle, 'Contents', 'MacOS', path.basename(name, '.app'));
                if (exists(expectedBinary)) return { kind: 'app', path: bundle, binary: expectedBinary };
                try {
                    const entries = readDir(path.join(bundle, 'Contents', 'MacOS'))
                        .filter(entry => !entry.startsWith('.'));
                    if (entries.length > 0) {
                        return { kind: 'app', path: bundle, binary: path.join(bundle, 'Contents', 'MacOS', entries[0]) };
                    }
                } catch {
                    // Not a valid application bundle; keep searching.
                }
            }
        }
        return null;
    }

    return null;
}

function bridgeServerEntry() {
    return path.join(BRIDGE_DIR, 'server.js');
}

function bridgeEnvironmentModule() {
    return path.join(BRIDGE_DIR, 'src', 'config', 'environment.js');
}

function embeddedNodeBinary() {
    const name = process.platform === 'win32' ? 'node.exe' : 'node';
    return path.join(ROOT, 'runtime', name);
}

module.exports = {
    ROOT,
    BRIDGE_DIR,
    BUILD_DIR,
    logsDir,
    findGame,
    bridgeServerEntry,
    bridgeEnvironmentModule,
    embeddedNodeBinary
};
