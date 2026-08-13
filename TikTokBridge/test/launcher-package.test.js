'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.join(__dirname, '..', '..');
const read = fileName => fs.readFileSync(path.join(repositoryRoot, fileName), 'utf8');

test('Windows batch scripts use CRLF line endings', () => {
    for (const fileName of ['run.bat', 'build.bat']) {
        const content = read(fileName);
        assert.match(content, /\r\n/, `${fileName} must contain CRLF line endings`);
        assert.doesNotMatch(content, /(^|[^\r])\n/, `${fileName} contains bare LF line endings`);
    }
});

test('shell launchers use LF line endings and call the cross-platform launcher', () => {
    for (const fileName of ['run.command', 'run.sh']) {
        const content = read(fileName);
        assert.doesNotMatch(content, /\r/, `${fileName} must not contain CR characters`);
        assert.match(content, /launcher\/launcher\.js/, `${fileName} must delegate to launcher/launcher.js`);
    }
});

test('run.bat is a thin wrapper around the cross-platform launcher', () => {
    const launcher = read('run.bat');
    assert.match(launcher, /launcher\\launcher\.js/, 'run.bat must delegate to launcher\\launcher.js');
    for (const forbidden of ['netstat', 'taskkill', 'tasklist', 'powershell', 'npm start']) {
        assert.ok(
            !launcher.toLowerCase().includes(forbidden),
            `run.bat must not contain Windows-only business logic (${forbidden})`
        );
    }
});

test('launcher checks npm exit status at execution time', () => {
    const launcher = read(path.join('launcher', 'launcher.js'));
    assert.match(launcher, /npm/, 'launcher must manage dependencies');
    assert.match(launcher, /result\.status !== 0/, 'launcher must check the npm exit code');
    assert.doesNotMatch(launcher, /NPM_RESULT=%ERRORLEVEL%/);
});

test('launcher never kills processes it did not start', () => {
    const files = ['launcher/launcher.js', 'launcher/process-manager.js', 'launcher/platform.js', 'launcher/health-check.js', 'launcher/paths.js'];
    for (const fileName of files) {
        const content = read(path.join(...fileName.split('/')));
        for (const forbidden of ['netstat', 'taskkill', 'pkill', 'killall', 'tasklist']) {
            assert.ok(
                !content.toLowerCase().includes(forbidden),
                `${fileName} must not use ${forbidden}`
            );
        }
    }
});

test('POSIX launchers keep their executable bit', { skip: process.platform === 'win32' }, () => {
    for (const fileName of ['run.command', 'run.sh', 'build.sh']) {
        const stats = fs.statSync(path.join(repositoryRoot, fileName));
        assert.ok((stats.mode & 0o111) !== 0, `${fileName} must be executable`);
    }
});
