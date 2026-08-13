#!/usr/bin/env node
'use strict';

/* Cross-platform launcher for ÔNG CHÚ MMO / TicToc Live.
   Same entry point on Windows (run.bat) and macOS (run.command / run.sh):
   check Node -> install Bridge dependencies if missing -> start the Bridge
   (or reuse an already-running Bridge) -> wait for /api/health -> open the
   game and the Control Panel. Only processes started here are terminated. */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const paths = require('./paths');
const platform = require('./platform');
const health = require('./health-check');
const { BridgeProcess } = require('./process-manager');

const LAUNCHER_VERSION = '1.1.0';
const MINIMUM_NODE_MAJOR = 20;
const BRIDGE_HEALTH_TIMEOUT_MS = 30000;

let logger = null;

function createLogger() {
    const dir = paths.logsDir();
    const file = path.join(dir, 'launcher.log');
    let stream = null;
    try {
        stream = fs.createWriteStream(file, { flags: 'a' });
    } catch {
        stream = null;
    }
    const write = line => {
        const stamped = `[${new Date().toISOString()}] ${line}`;
        process.stdout.write(`${stamped}\n`);
        if (stream) {
            try {
                stream.write(`${stamped}\n`);
            } catch {
                // Logging must never break the launch flow.
            }
        }
    };
    return { write, file };
}

function parseArgs(argv) {
    const args = { browser: true, game: true, help: false };
    for (const arg of argv) {
        if (arg === '--no-browser') args.browser = false;
        else if (arg === '--no-game') args.game = false;
        else if (arg === '--help' || arg === '-h') args.help = true;
    }
    return args;
}

function printHelp() {
    process.stdout.write([
        'TicToc Live launcher',
        '',
        'Usage: node launcher/launcher.js [options]',
        '',
        'Options:',
        '  --no-browser   Do not open the Control Panel in the browser',
        '  --no-game      Start only the Bridge and Control Panel',
        '  --help, -h     Show this help',
        ''
    ].join('\n'));
}

function ensureDependencies() {
    const marker = path.join(paths.BRIDGE_DIR, 'node_modules', 'express', 'package.json');
    if (fs.existsSync(marker)) {
        logger.write('[deps] Node.js dependencies are already installed.');
        return true;
    }
    const hasLockfile = fs.existsSync(path.join(paths.BRIDGE_DIR, 'package-lock.json'));
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const command = hasLockfile ? 'ci' : 'install';
    logger.write(`[deps] Installing Node.js dependencies (npm ${command})...`);
    const result = spawnSync(npm, [command], {
        cwd: paths.BRIDGE_DIR,
        stdio: 'inherit',
        shell: false
    });
    if (result.error) {
        logger.write(`[ERROR] Could not run npm: ${result.error.message}`);
        logger.write('[ERROR] Install Node.js 20+ from https://nodejs.org/ or use a release package that includes node_modules.');
        return false;
    }
    if (result.status !== 0) {
        logger.write(`[ERROR] npm ${command} failed with exit code ${result.status}.`);
        logger.write('[ERROR] Check the network connection and run the launcher again. Do not copy node_modules from another machine.');
        return false;
    }
    logger.write('[deps] Dependencies installed.');
    return true;
}

function readBridgeSettings() {
    const environment = require(paths.bridgeEnvironmentModule());
    environment.loadEnvironmentFile();
    return environment.getServerSettings();
}

function controlPanelUrl(host, port) {
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    return `http://${displayHost}:${port}/control.html`;
}

function waitForExit(child) {
    return new Promise(resolve => {
        if (!child) return resolve(null);
        child.once('exit', (code, signal) => resolve({ code, signal }));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return 0;
    }

    logger = createLogger();
    const info = platform.describe();
    logger.write(`[launcher] TicToc Live launcher v${LAUNCHER_VERSION}`);
    logger.write(`[launcher] OS=${info.platform} arch=${info.arch} node=${info.node} root=${paths.ROOT}`);

    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (!Number.isInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
        logger.write(`[ERROR] Node.js ${MINIMUM_NODE_MAJOR} or newer is required (found ${process.versions.node}).`);
        return 1;
    }

    if (!fs.existsSync(path.join(paths.BRIDGE_DIR, 'package.json'))) {
        logger.write(`[ERROR] TikTokBridge/package.json not found under ${paths.ROOT}.`);
        logger.write('[ERROR] Run the launcher from the folder that contains TikTokBridge/, or reinstall the release package.');
        return 1;
    }

    let settings;
    try {
        settings = readBridgeSettings();
    } catch (error) {
        logger.write(`[ERROR] Could not read Bridge configuration: ${error.message}`);
        return 1;
    }
    const { port, host } = settings;
    logger.write(`[config] Bridge port=${port} host=${host}`);

    let bridge = null;
    let bridgeStartedByUs = false;
    let shuttingDown = false;

    const shutdown = async (exitCode, reason) => {
        if (shuttingDown) return exitCode;
        shuttingDown = true;
        if (reason) logger.write(`[launcher] ${reason}`);
        if (bridgeStartedByUs && bridge) {
            logger.write('[launcher] Stopping Bridge (pid=' + String(bridge.pid ?? '?') + ')...');
            await bridge.stop();
        }
        logger.write('[launcher] Bye.');
        return exitCode;
    };

    const probe = await health.probeOurBridge(port, host);
    if (probe.ours) {
        logger.write(`[health] Bridge is already running on port ${port} (provider=${probe.body.liveProvider || 'unknown'}). Reusing it.`);
    } else {
        const portFree = await health.isPortFree(port, host === '0.0.0.0' ? '127.0.0.1' : host);
        if (!portFree) {
            logger.write(`[ERROR] Port ${port} is already used by another program that is not the TikTok Bridge.`);
            logger.write('[ERROR] The launcher will NOT close other programs. Free the port yourself, then run the launcher again.');
            return 1;
        }
        if (!ensureDependencies()) return 1;

        bridge = new BridgeProcess({
            entry: paths.bridgeServerEntry(),
            cwd: paths.BRIDGE_DIR,
            logFile: path.join(paths.logsDir(), 'bridge.log'),
            log: line => logger.write(line)
        });
        bridge.onUnexpectedExit = (code, signal) => {
            logger.write(`[WARN] Bridge exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). See logs/bridge.log.`);
        };
        bridge.start();
        bridgeStartedByUs = true;
        logger.write(`[bridge] Starting TikTok Bridge (pid=${bridge.pid})...`);

        const wait = await health.waitForBridge(port, host, BRIDGE_HEALTH_TIMEOUT_MS, { bridge });
        if (!wait.ok) {
            if (wait.reason === 'bridge exited early') {
                logger.write(`[ERROR] Bridge exited before becoming healthy (exit code ${bridge.exitCode ?? bridge.exitSignal ?? 'unknown'}).`);
            } else {
                logger.write(`[ERROR] Bridge did not become healthy within ${BRIDGE_HEALTH_TIMEOUT_MS / 1000} seconds.`);
            }
            logger.write('[ERROR] Check logs/bridge.log for details.');
            await shutdown(1);
            return 1;
        }
        logger.write(`[health] Bridge is healthy on port ${port} (provider=${wait.body.liveProvider || 'unknown'}).`);
    }

    if (args.browser) {
        const url = controlPanelUrl(host, port);
        if (platform.openBrowser(url)) logger.write(`[browser] Opening Control Panel: ${url}`);
        else logger.write(`[browser] Could not open the browser automatically. Visit ${url}`);
    }

    let gameChild = null;
    if (args.game) {
        const game = paths.findGame();
        if (!game) {
            logger.write('[game] No game build found. Run the Unity build first (build.bat on Windows, build.sh on macOS).');
            logger.write('[game] The Bridge and Control Panel stay available. Press Ctrl+C to stop.');
        } else {
            const extraArgs = [];
            if (port !== 3000 || (host !== '127.0.0.1' && host !== 'localhost' && host !== '0.0.0.0')) {
                extraArgs.push(`--bridge-url=ws://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
            }
            logger.write(`[game] Launching ${game.path}${extraArgs.length ? ` (args: ${extraArgs.join(' ')})` : ''}`);
            try {
                gameChild = platform.launchGame(game, extraArgs);
                logger.write(`[game] Game process started (pid=${gameChild.pid ?? '?'})`);
                gameChild.on('error', error => logger.write(`[game] Could not start the game: ${error.message}`));
            } catch (error) {
                logger.write(`[game] Could not start the game: ${error.message}`);
                gameChild = null;
            }
        }
    }

    const interrupt = new Promise(resolve => {
        const onSignal = signal => {
            logger.write(`[launcher] Received ${signal}.`);
            resolve(signal);
        };
        process.once('SIGINT', () => onSignal('SIGINT'));
        process.once('SIGTERM', () => onSignal('SIGTERM'));
    });

    // Without our own child process handles (e.g. reusing an existing Bridge
    // with --no-game) the event loop would drain and the launcher would exit
    // immediately. Keep it resident until a signal arrives.
    const keepAlive = setInterval(() => {}, 60000);

    if (gameChild) {
        const exit = await Promise.race([waitForExit(gameChild), interrupt]);
        if (exit && typeof exit.code !== 'undefined') {
            logger.write(`[game] Game exited (code=${exit.code ?? 'null'}, signal=${exit.signal ?? 'null'}).`);
        }
    } else {
        await interrupt;
    }

    clearInterval(keepAlive);
    return shutdown(0);
}

main()
    .then(code => process.exit(code))
    .catch(error => {
        if (logger) logger.write(`[ERROR] Launcher crashed: ${error && error.stack ? error.stack : error}`);
        else process.stderr.write(`Launcher crashed: ${error && error.message ? error.message : error}\n`);
        process.exit(1);
    });
