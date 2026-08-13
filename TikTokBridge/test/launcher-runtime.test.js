'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const launcherDir = path.join(__dirname, '..', '..', 'launcher');
const health = require(path.join(launcherDir, 'health-check.js'));
const paths = require(path.join(launcherDir, 'paths.js'));

function startMockBridge(appId, { failHealth = false } = {}) {
    return new Promise(resolve => {
        const server = http.createServer((request, response) => {
            if (request.url === '/api/health' && !failHealth) {
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ status: 'ok', appId, liveProvider: 'tiktok' }));
                return;
            }
            response.statusCode = 404;
            response.end('not found');
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('probeOurBridge recognizes the project bridge', async () => {
    const server = await startMockBridge(health.BRIDGE_APP_ID);
    try {
        const probe = await health.probeOurBridge(server.address().port, '127.0.0.1');
        assert.equal(probe.ours, true);
        assert.equal(probe.body.liveProvider, 'tiktok');
    } finally {
        server.close();
    }
});

test('probeOurBridge rejects a foreign HTTP service', async () => {
    const server = await startMockBridge('some-other-app');
    try {
        const probe = await health.probeOurBridge(server.address().port, '127.0.0.1');
        assert.equal(probe.ours, false);
    } finally {
        server.close();
    }
});

test('isPortFree reports used and free ports', async () => {
    const server = await startMockBridge(health.BRIDGE_APP_ID);
    const usedPort = server.address().port;
    try {
        assert.equal(await health.isPortFree(usedPort, '127.0.0.1'), false);
    } finally {
        server.close();
    }
    const probeServer = http.createServer(() => {});
    await new Promise(resolve => probeServer.listen(0, '127.0.0.1', resolve));
    const freePort = probeServer.address().port;
    await new Promise(resolve => probeServer.close(resolve));
    assert.equal(await health.isPortFree(freePort, '127.0.0.1'), true);
});

test('waitForBridge succeeds once the bridge becomes healthy', async () => {
    const server = await startMockBridge(health.BRIDGE_APP_ID);
    try {
        const result = await health.waitForBridge(server.address().port, '127.0.0.1', 3000);
        assert.equal(result.ok, true);
    } finally {
        server.close();
    }
});

test('waitForBridge times out when nothing listens', async () => {
    const probeServer = http.createServer(() => {});
    await new Promise(resolve => probeServer.listen(0, '127.0.0.1', resolve));
    const freePort = probeServer.address().port;
    await new Promise(resolve => probeServer.close(resolve));
    const result = await health.waitForBridge(freePort, '127.0.0.1', 1200);
    assert.equal(result.ok, false);
});

function makeTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tictoc-launcher-test-'));
}

test('findGame discovers the Windows executable with legacy fallbacks', () => {
    const root = makeTempRoot();
    try {
        assert.equal(paths.findGame({ root, platform: 'win32' }), null);

        const legacy = path.join(root, 'Build', 'OngChuMMO_Live.exe');
        fs.mkdirSync(path.dirname(legacy), { recursive: true });
        fs.writeFileSync(legacy, '');
        assert.equal(paths.findGame({ root, platform: 'win32' }).path, legacy);

        const modern = path.join(root, 'TicToc_Live.exe');
        fs.writeFileSync(modern, '');
        assert.equal(paths.findGame({ root, platform: 'win32' }).path, modern);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('findGame discovers the macOS application bundle', () => {
    const root = makeTempRoot();
    try {
        assert.equal(paths.findGame({ root, platform: 'darwin' }), null);

        const binary = path.join(root, 'Build', 'macOS', 'TicToc_Live.app', 'Contents', 'MacOS', 'TicToc_Live');
        fs.mkdirSync(path.dirname(binary), { recursive: true });
        fs.writeFileSync(binary, '');
        const game = paths.findGame({ root, platform: 'darwin' });
        assert.equal(game.kind, 'app');
        assert.equal(game.binary, binary);
        assert.ok(game.path.endsWith('TicToc_Live.app'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('findGame returns null on unsupported platforms', () => {
    const root = makeTempRoot();
    try {
        assert.equal(paths.findGame({ root, platform: 'linux' }), null);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
