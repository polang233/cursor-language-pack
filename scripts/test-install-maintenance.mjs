import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireInstallLock, appProcesses, atomicReplace, backupLimit, pruneBuilds, reportAppProcesses } from './lib/install-maintenance.mjs';

const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-maintenance-'));
  t.after(() => { assert.equal(fs.realpathSync(path.dirname(temp)), fs.realpathSync(os.tmpdir())); fs.rmSync(temp, { recursive: true, force: true }); });
  const root = path.join(temp, 'state');
  const targetRoot = path.join(temp, 'app');
  fs.mkdirSync(root); fs.mkdirSync(targetRoot);
  fs.writeFileSync(path.join(targetRoot, 'main.js'), 'current build');
  const build = (n, extra = {}) => {
    const dir = path.join(root, n.toString(16).padStart(64, '0'));
    fs.mkdirSync(path.join(dir, 'backup'), { recursive: true });
    const original = hash('original');
    const record = { installRoot: targetRoot, status: 'patched', files: { 'main.js': { original,
      patched: hash('old patch'), backup: `backup/${original}` } }, ...extra };
    fs.writeFileSync(path.join(dir, 'backup', original), 'original');
    fs.writeFileSync(path.join(dir, 'patch.json'), JSON.stringify(record));
    fs.utimesSync(path.join(dir, 'patch.json'), n * 100, n * 100);
    return dir;
  };
  return { temp, root, targetRoot, installRoot: targetRoot, build };
}

test('retention keeps current and two recent builds, including when current has an old mtime', t => {
  const f = fixture(t);
  const dirs = [1, 2, 3, 4, 5].map(n => f.build(n));
  const removed = pruneBuilds({ ...f, current: dirs[0], recordName: 'patch.json' });
  assert.deepEqual(new Set(removed), new Set([dirs[1], dirs[2]]));
  for (const dir of [dirs[0], dirs[3], dirs[4]]) assert.ok(fs.existsSync(dir));
});

test('pending, failed, malformed and foreign recovery records survive pruning', t => {
  const f = fixture(t);
  const pending = f.build(1, { status: 'applying' });
  const failed = f.build(2, { status: 'restore-incomplete' });
  const foreign = f.build(3, { installRoot: path.join(f.temp, 'other app') });
  const malformed = f.build(4);
  fs.writeFileSync(path.join(malformed, 'patch.json'), '{');
  const current = f.build(5);
  assert.deepEqual(pruneBuilds({ ...f, current, recordName: 'patch.json', keep: 1 }), []);
  for (const dir of [pending, failed, foreign, malformed]) assert.ok(fs.existsSync(dir));
});

test('an old patch still in the app needs a verified current backup before pruning', t => {
  const f = fixture(t);
  const old = f.build(1);
  const current = f.build(2);
  fs.writeFileSync(path.join(f.targetRoot, 'main.js'), 'old patch');
  fs.writeFileSync(path.join(current, 'backup', hash('original')), 'corrupt');
  assert.deepEqual(pruneBuilds({ ...f, current, recordName: 'patch.json', keep: 1 }), []);
  fs.writeFileSync(path.join(current, 'backup', hash('original')), 'original');
  assert.deepEqual(pruneBuilds({ ...f, current, recordName: 'patch.json', keep: 1 }), [old]);
});

test('live owners exclude a real competing process and release permits retry', t => {
  const f = fixture(t);
  const lock = path.join(f.root, 'patch.lock');
  const release = acquireInstallLock(lock);
  const moduleUrl = new URL('./lib/install-maintenance.mjs', import.meta.url).href;
  const code = `import { acquireInstallLock } from ${JSON.stringify(moduleUrl)}; acquireInstallLock(${JSON.stringify(lock)});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /另一个安装或恢复任务/);
  assert.match(fs.readdirSync(lock)[0], new RegExp('^' + process.pid + '-'));
  release();
  acquireInstallLock(lock)();
  assert.equal(fs.existsSync(lock), false);
});

test('atomic restoration refuses a changed file and removes its temporary output', t => {
  const f = fixture(t);
  const file = path.join(f.targetRoot, 'main.js');
  assert.throws(() => atomicReplace(file, 'restored', hash('stale contents')), /被修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'current build');
  assert.deepEqual(fs.readdirSync(f.targetRoot), ['main.js']);
  atomicReplace(file, 'restored', hash('current build'));
  assert.equal(fs.readFileSync(file, 'utf8'), 'restored');
});

test('an abruptly terminated lock owner permits recovery', t => {
  const f = fixture(t);
  const lock = path.join(f.root, 'patch.lock');
  const moduleUrl = new URL('./lib/install-maintenance.mjs', import.meta.url).href;
  const code = `import { acquireInstallLock } from ${JSON.stringify(moduleUrl)}; acquireInstallLock(${JSON.stringify(lock)}); process.kill(process.pid, 'SIGKILL');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.ok(child.signal || child.status !== 0);
  assert.ok(fs.existsSync(lock));
  acquireInstallLock(lock)();
  assert.equal(fs.existsSync(lock), false);
});

test('reclaiming a stale lock cannot remove a replacement owner', t => {
  const f = fixture(t);
  const lock = path.join(f.root, 'patch.lock');
  fs.mkdirSync(lock);
  const stale = path.join(lock, '2147483647-' + crypto.randomUUID());
  fs.writeFileSync(stale, '');
  const replacement = process.pid + '-' + crypto.randomUUID();
  const unlink = fs.unlinkSync;
  fs.unlinkSync = (name, ...args) => {
    if (name === stale) {
      unlink(stale);
      fs.rmdirSync(lock);
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, replacement), '');
    }
    return unlink(name, ...args);
  };
  try { assert.throws(() => acquireInstallLock(lock), /另一个安装或恢复任务/); }
  finally { fs.unlinkSync = unlink; }
  assert.deepEqual(fs.readdirSync(lock), [replacement]);
});

test('a reused PID can be distinguished from its earlier lock owner', t => {
  const f = fixture(t);
  const lock = path.join(f.root, 'patch.lock');
  fs.mkdirSync(lock);
  const oldMarker = path.join(lock, process.pid + '-' + crypto.randomUUID());
  fs.writeFileSync(oldMarker, '');
  fs.utimesSync(oldMarker, 946684800, 946684800);
  const release = acquireInstallLock(lock);
  assert.equal(fs.existsSync(oldMarker), false);
  release();
});

test('an abandoned old file lock gives explicit recovery guidance and is left in place', t => {
  const f = fixture(t);
  const lock = path.join(f.root, 'patch.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483647, token: 'legacy' }));
  assert.throws(() => acquireInstallLock(lock), /旧版遗留锁/);
  assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).token, 'legacy');
});

test('process detection selects this installation and reports unavailable queries', () => {
  const root = 'C:\\Apps\\Cursor';
  const windows = appProcesses('cursor', root, { platform: 'win32', run: () => ({ status: 0,
    stdout: JSON.stringify([{ ProcessId: 1, ExecutablePath: path.win32.join(root, 'Cursor.exe') },
      { ProcessId: 2, ExecutablePath: 'C:\\Other\\Cursor.exe' }]) }) });
  assert.deepEqual(windows, { checked: true, pids: [1] });
  assert.deepEqual(appProcesses('kiro', root, { run: () => ({ status: 1 }) }), { checked: false, pids: [] });
  assert.deepEqual(appProcesses('kiro', '/opt/kiro', { platform: 'linux', run: () => ({ status: 0,
    stdout: '  23 /opt/kiro/kiro\n 24 /other/kiro\n 25 bash\n' }) }), { checked: true, pids: [23] });
  const active = { platform: 'win32', writing: true, run: () => ({ status: 0, stdout: JSON.stringify([
    { ProcessId: 1, ExecutablePath: path.win32.join(root, 'Cursor.exe') }, { ProcessId: 2, ExecutablePath: null }
  ]) }) };
  assert.throws(() => reportAppProcesses('cursor', root, active), /检测到应用进程（PID 1）/);
});

test('missing restore target gives recovery steps and a failing exit code', t => {
  const f = fixture(t);
  const cli = fileURLToPath(new URL('../bin/cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'restore', `--dir=${f.temp}`], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /恢复需要原安装目录及同一系统用户下的备份/);
});

test('backup count accepts positive integers and rejects ambiguous values', () => {
  assert.equal(backupLimit(), 3);
  assert.equal(backupLimit('2'), 2);
  for (const value of [0, -1, '1.5', 'NaN', true, '01', '9007199254740992']) assert.throws(() => backupLimit(value));
});

test('legacy build records are reported even before any new state directory exists', t => {
  const f = fixture(t);
  const moduleUrl = new URL('./lib/install-maintenance.mjs', import.meta.url).href;
  const root = path.join(f.temp, 'missing state');
  const code = `import { reportPreviousBuilds } from ${JSON.stringify(moduleUrl)};
    reportPreviousBuilds(${JSON.stringify(root)}, ${JSON.stringify(root + '/current')}, 'patch.json', [{files: {}}]);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /检测到 1 份旧版本记录/);
});
