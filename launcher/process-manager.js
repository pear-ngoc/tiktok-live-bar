'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Owns the Node Bridge child process for the lifetime of the launcher.
// The launcher only ever terminates processes it started itself.
class BridgeProcess {
    constructor({ entry, cwd, logFile, env = process.env, log = () => {} }) {
        this.entry = entry;
        this.cwd = cwd;
        this.logFile = logFile;
        this.env = env;
        this.log = log;
        this.child = null;
        this.stream = null;
        this.exited = false;
        this.exitCode = null;
        this.exitSignal = null;
        this.onUnexpectedExit = null;
    }

    get pid() {
        return this.child ? this.child.pid : null;
    }

    start() {
        try {
            fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
            this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
        } catch (error) {
            this.log(`Could not open bridge log file: ${error.message}`);
            this.stream = null;
        }

        this.child = spawn(process.execPath, [this.entry], {
            cwd: this.cwd,
            env: this.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        this.child.stdout.on('data', chunk => this.relay('stdout', chunk));
        this.child.stderr.on('data', chunk => this.relay('stderr', chunk));
        this.child.on('error', error => {
            this.log(`Bridge failed to start: ${error.message}`);
            this.exited = true;
        });
        this.child.on('exit', (code, signal) => {
            this.exited = true;
            this.exitCode = code;
            this.exitSignal = signal;
            this.write(`[launcher] bridge exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
            if (this.onUnexpectedExit && !this.stopping) this.onUnexpectedExit(code, signal);
        });
        this.write(`[launcher] bridge started (pid=${this.child.pid}, node=${process.version}, entry=${this.entry})`);
        return this.child;
    }

    relay(_source, chunk) {
        const text = chunk.toString('utf8');
        this.write(text);
        process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
    }

    write(text) {
        if (!this.stream) return;
        try {
            this.stream.write(text.endsWith('\n') ? text : `${text}\n`);
        } catch {
            // Logging must never take the bridge down.
        }
    }

    async stop(timeoutMs = 5000) {
        if (!this.child || this.exited) return;
        this.stopping = true;
        this.write('[launcher] launcher is shutting down; stopping bridge');
        try {
            // server.js handles SIGTERM with a graceful shutdown on POSIX.
            this.child.kill('SIGTERM');
        } catch {
            this.exited = true;
            return;
        }
        const deadline = Date.now() + timeoutMs;
        while (!this.exited && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!this.exited) {
            this.write('[launcher] bridge did not exit in time; forcing termination');
            try {
                this.child.kill('SIGKILL');
            } catch {
                // Already gone.
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

module.exports = { BridgeProcess };
