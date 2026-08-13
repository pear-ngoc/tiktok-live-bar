'use strict';

const http = require('node:http');
const net = require('node:net');

const BRIDGE_APP_ID = 'ongchu-mmo-live-bridge';

function fetchHealth(port, host = '127.0.0.1', timeoutMs = 2000) {
    return new Promise(resolve => {
        const request = http.get({ host, port, path: '/api/health' }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
                if (body.length > 64 * 1024) request.destroy();
            });
            response.on('end', () => {
                try {
                    resolve({ reachable: true, body: JSON.parse(body) });
                } catch {
                    resolve({ reachable: true, body: null });
                }
            });
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error('health check timeout')));
        request.on('error', () => resolve({ reachable: false, body: null }));
    });
}

async function probeOurBridge(port, host) {
    const hosts = host && host !== '127.0.0.1' ? [host, '127.0.0.1'] : ['127.0.0.1'];
    for (const candidate of hosts) {
        const result = await fetchHealth(port, candidate);
        if (result.reachable && result.body && result.body.status === 'ok' && result.body.appId === BRIDGE_APP_ID) {
            return { ours: true, body: result.body };
        }
        if (result.reachable) return { ours: false, body: result.body };
    }
    return { ours: false, body: null };
}

function isPortFree(port, host = '127.0.0.1', timeoutMs = 2000) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.unref();
        let settled = false;
        const finish = free => {
            if (settled) return;
            settled = true;
            server.close(() => {});
            resolve(free);
        };
        server.once('error', () => finish(false));
        server.listen({ port, host, exclusive: true }, () => finish(true));
        const timer = setTimeout(() => finish(false), timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
    });
}

async function waitForBridge(port, host, timeoutMs, { onPoll, bridge } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (bridge && bridge.exited) return { ok: false, reason: 'bridge exited early' };
        const probe = await probeOurBridge(port, host);
        if (probe.ours) return { ok: true, body: probe.body };
        if (typeof onPoll === 'function') onPoll();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return { ok: false, reason: 'timeout' };
}

module.exports = { BRIDGE_APP_ID, fetchHealth, probeOurBridge, isPortFree, waitForBridge };
