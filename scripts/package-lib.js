'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
    const options = { version: null, withNode: null, skipZip: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--version') options.version = argv[++index];
        else if (arg === '--with-node') options.withNode = argv[++index] || 'auto';
        else if (arg === '--skip-zip') options.skipZip = true;
    }
    return options;
}

function resolveVersion(explicit) {
    if (explicit) return explicit.replace(/^refs\/tags\//, '');
    const refName = process.env.GITHUB_REF_NAME;
    const refType = process.env.GITHUB_REF_TYPE;
    if (refType === 'tag' && refName) return refName;
    const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null;
    return sha ? `ci-${sha}` : 'local';
}

function fail(message) {
    process.stderr.write(`[package] ERROR: ${message}\n`);
    process.exit(1);
}

function log(message) {
    process.stdout.write(`[package] ${message}\n`);
}

function ensureEmptyDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

// Copies a directory tree while skipping user-specific files that must never
// ship in a release (personal .env, local logs).
function copyDirFiltered(source, destination, excludeNames = new Set()) {
    if (!fs.existsSync(source)) return false;
    fs.cpSync(source, destination, {
        recursive: true,
        filter: src => !excludeNames.has(path.basename(src))
    });
    return true;
}

function copyRequiredDirs(root, destination) {
    const excludes = new Set(['.env', '.env.local', 'logs', '.git', '.DS_Store']);
    const copied = [];
    for (const name of ['DJ_MUSIC', 'DJ_VIDEO', 'LiveAssets']) {
        if (copyDirFiltered(path.join(root, name), path.join(destination, name), excludes)) {
            copied.push(name);
        }
    }
    return copied;
}

function copyBridge(root, destination) {
    const source = path.join(root, 'TikTokBridge');
    if (!fs.existsSync(path.join(source, 'package.json'))) {
        fail(`TikTokBridge/package.json not found under ${root}`);
    }
    if (!fs.existsSync(path.join(source, 'node_modules'))) {
        fail('TikTokBridge/node_modules is missing. Run "npm ci" inside TikTokBridge first so releases ship without requiring npm install.');
    }
    const excludes = new Set(['.env', '.env.local', 'logs', '.DS_Store']);
    copyDirFiltered(source, path.join(destination, 'TikTokBridge'), excludes);
    // Ship the examples so users can configure their own .env.
    for (const example of ['.env.example', '.env.macos.example']) {
        const file = path.join(source, example);
        if (fs.existsSync(file)) fs.copyFileSync(file, path.join(destination, 'TikTokBridge', example));
    }
}

function copyLauncher(root, destination) {
    if (!copyDirFiltered(path.join(root, 'launcher'), path.join(destination, 'launcher'))) {
        fail('launcher/ directory not found.');
    }
}

function detectSystemNode() {
    const binary = process.platform === 'win32' ? process.execPath : process.execPath;
    if (fs.existsSync(binary)) return binary;
    return null;
}

function embedNode(runtimeNodePath, requested) {
    const source = requested && requested !== 'auto' ? requested : detectSystemNode();
    if (!source || !fs.existsSync(source)) {
        fail(`Cannot embed Node runtime (${requested || 'auto'}). Pass --with-node /path/to/node.`);
    }
    fs.mkdirSync(path.dirname(runtimeNodePath), { recursive: true });
    fs.copyFileSync(source, runtimeNodePath);
    if (process.platform !== 'win32') fs.chmodSync(runtimeNodePath, 0o755);
    log(`Embedded Node runtime from ${source}`);
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', ...options });
    if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
    if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

function hasCommand(command) {
    const probe = process.platform === 'win32'
        ? spawnSync('where', [command], { stdio: 'ignore' })
        : spawnSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return probe.status === 0;
}

function zipDirectory(sourceDir, zipPath) {
    ensureEmptyDir(path.dirname(zipPath));
    if (hasCommand('ditto')) {
        // ditto preserves macOS bundle metadata, symlinks and executable bits.
        run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', sourceDir, zipPath]);
        return;
    }
    if (hasCommand('zip')) {
        run('zip', ['-r', '-y', '-q', zipPath, path.basename(sourceDir)], { cwd: path.dirname(sourceDir) });
        return;
    }
    if (process.platform === 'win32') {
        const script =
            `if (Test-Path '${zipPath}') { Remove-Item '${zipPath}' }; ` +
            `Compress-Archive -Path '${sourceDir}' -DestinationPath '${zipPath}'`;
        run('powershell', ['-NoProfile', '-Command', script]);
        return;
    }
    fail('No zip tooling available (need ditto, zip or PowerShell).');
}

module.exports = {
    ROOT,
    parseArgs,
    resolveVersion,
    fail,
    log,
    ensureEmptyDir,
    copyDirFiltered,
    copyRequiredDirs,
    copyBridge,
    copyLauncher,
    embedNode,
    zipDirectory,
    hasCommand,
    run
};
