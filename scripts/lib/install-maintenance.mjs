import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export function backupLimit(value = 3) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new Error('--keep-backups 必须是大于 0 的整数（包含当前版本，默认 3）。');
  }
  return Number(value);
}

function removeEmptyLock(dir) {
  try { fs.rmdirSync(dir); }
  catch (err) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err;
  }
}

function processStartedAt(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`],
    { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return result.status === 0 ? Number(result.stdout.trim()) / 10000 - 11644473600000 : NaN;
  }
  if (process.platform === 'linux') {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19]);
    const result = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 5000 });
    const frequency = Number(result.stdout?.trim());
    if (result.status !== 0 || frequency <= 0) return NaN;
    return Date.now() - (os.uptime() - ticks / frequency) * 1000;
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='],
    { encoding: 'utf8', timeout: 5000, env: { ...process.env, LC_ALL: 'C' } });
  return result.status === 0 ? Date.parse(result.stdout.trim()) : NaN;
}

function ownerHasExited(pid, marker) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); }
  catch (err) {
    if (err.code === 'ESRCH') return true;
    if (err.code !== 'EPERM') return false;
  }
  try {
    // 活进程的启动时间晚于旧标记，说明系统已把 PID 分配给另一进程。
    return processStartedAt(pid) > fs.statSync(marker).mtimeMs + 2000;
  } catch { return false; }
}

function clearAbandonedLock(dir) {
  let stat;
  try { stat = fs.lstatSync(dir); }
  catch (err) {
    if (err.code === 'ENOENT') return true;
    throw err;
  }
  if (stat.isFile()) {
    let owner;
    try { owner = JSON.parse(fs.readFileSync(dir, 'utf8')); } catch { /* 旧版可能在写入期间中断。 */ }
    if (!ownerHasExited(owner?.pid, dir) && (owner?.pid || Date.now() - stat.mtimeMs < 30000)) return false;
    // 旧客户端也会回收该文件。普通文件没有可以安全定向删除的所有者标记。
    throw new Error(`检测到旧版遗留锁。请关闭旧版语言包的安装或恢复任务，确认已退出后，仅删除这个锁文件再重试：${dir}`);
  }
  if (!stat.isDirectory()) return false;
  let names;
  try { names = fs.readdirSync(dir); }
  catch (err) {
    if (err.code === 'ENOENT') return true;
    throw err;
  }
  if (names.length > 1) return false;
  if (names.length === 1) {
    const owner = /^(\d+)-[a-f0-9-]{36}$/.exec(names[0]);
    const marker = path.join(dir, names[0]);
    if (!owner || !ownerHasExited(Number(owner[1]), marker)) return false;
    try { fs.unlinkSync(marker); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  removeEmptyLock(dir);
  return true;
}

function publishLock(staging, dir) {
  if (process.platform !== 'win32') {
    fs.renameSync(staging, dir);
    return;
  }
  // Windows 的 Node rename 可替换普通文件，Directory.Move 则拒绝任何已存在的目标。
  const move = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; [IO.Directory]::Move($env:PACK_LOCK_SOURCE, $env:PACK_LOCK_TARGET)"],
  { env: { ...process.env, PACK_LOCK_SOURCE: staging, PACK_LOCK_TARGET: dir },
    encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (move.status === 0) return;
  if (move.error) throw move.error;
  const err = new Error(`无法发布安装锁：${dir}`);
  if (fs.existsSync(dir)) err.code = 'EEXIST';
  throw err;
}

/** 先完成所有者标记，再原子发布目录；回收时只移除已知标记和空目录。 */
export function acquireInstallLock(dir) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const owner = `${process.pid}-${crypto.randomUUID()}`;
  const staging = fs.mkdtempSync(dir + '-candidate-');
  const candidate = path.join(staging, owner);
  try {
    fs.closeSync(fs.openSync(candidate, 'wx', 0o600));
    for (let attempt = 0; ; attempt++) {
      try {
        publishLock(staging, dir);
        break;
      } catch (err) {
        if (!['ENOTEMPTY', 'EEXIST', 'EISDIR', 'ENOTDIR', 'EPERM', 'EACCES'].includes(err.code)) throw err;
        if (attempt === 0 && clearAbandonedLock(dir)) continue;
        throw new Error(`另一个安装或恢复任务可能正在运行，请结束后重试。若确认没有任务，检查遗留锁：${dir}`);
      }
    }
  } finally {
    fs.rmSync(candidate, { force: true });
    removeEmptyLock(staging);
  }
  const release = () => {
    try {
      fs.unlinkSync(path.join(dir, owner));
      removeEmptyLock(dir);
    } catch { /* 其他进程的标记保持原样。 */ }
  };
  process.once('exit', release);
  return () => { release(); process.removeListener('exit', release); };
}

export function atomicReplace(file, data, expectedHash) {
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  try {
    const mode = fs.statSync(file).mode & 0o777;
    const fd = fs.openSync(temp, 'wx', mode);
    try { fs.writeFileSync(fd, data); fs.fchmodSync(fd, mode); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    if (hash(fs.readFileSync(file)) !== expectedHash) throw new Error(`文件在准备期间被修改，已保留原文件：${file}`);
    fs.renameSync(temp, file);
  } finally { fs.rmSync(temp, { force: true }); }
}

/** 只识别工具自己的版本目录；损坏记录和符号链接留给人工检查。 */
export function buildHistory(root, recordName) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory() || !/^(?:[a-f0-9]{16}|[a-f0-9]{64})$/.test(entry.name)) return [];
    const dir = path.resolve(root, entry.name);
    try {
      const recordFile = path.join(dir, recordName);
      if (fs.lstatSync(recordFile).isSymbolicLink()) return [];
      const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
      if (!record.installRoot || !record.files || typeof record.files !== 'object' || Array.isArray(record.files)) return [];
      return [{ dir, record, modified: fs.statSync(recordFile).mtimeMs }];
    } catch { return []; }
  });
}

export function reportPreviousBuilds(root, current, recordName, legacyRecords = []) {
  const older = buildHistory(root, recordName).filter(item => item.dir !== path.resolve(current));
  const count = older.length + legacyRecords.filter(record => record?.files && typeof record.files === 'object').length;
  console.log(count
    ? `当前版本没有补丁记录；检测到 ${count} 份旧版本记录。旧版本备份不能直接恢复到当前程序，请重新安装当前语言包，或用 --dir 指定原安装目录。`
    : '当前版本没有补丁记录；未发现此安装的旧版本记录。若曾汉化，请确认 --dir 指向当时的安装目录，且使用同一系统用户。');
}

function childPath(root, rel) {
  const file = path.resolve(root, rel);
  const tail = path.relative(root, file);
  return tail && tail !== '..' && !tail.startsWith(`..${path.sep}`) && !path.isAbsolute(tail) ? file : null;
}

/** 部分升级可能留下旧补丁。只有当前构建有可恢复记录的文件才可继续处理。 */
export function leftoverPatches({ root, current, recordName, targetRoot, currentFiles = {}, legacyRecords = [] }) {
  const records = buildHistory(root, recordName)
    .filter(item => item.dir !== path.resolve(current))
    .map(item => item.record)
    .concat(legacyRecords);
  const oldHashes = new Map();
  for (const record of records) {
    for (const [rel, entry] of Object.entries(record?.files ?? {})) {
      if (!entry || !/^[a-f0-9]{64}$/.test(entry.original)) continue;
      const candidates = [entry.patched, entry.pendingFrom, entry.pending?.before, entry.pending?.after]
        .filter(hash => hash !== entry.original && /^[a-f0-9]{64}$/.test(hash));
      if (!candidates.length) continue;
      if (!oldHashes.has(rel)) oldHashes.set(rel, new Set());
      for (const hash of candidates) oldHashes.get(rel).add(hash);
    }
  }
  const leftovers = [];
  for (const [rel, hashes] of oldHashes) {
    const entry = currentFiles[rel];
    if (entry && !hashes.has(entry.original)) continue;
    const file = childPath(targetRoot, rel);
    if (!file) continue;
    let hash;
    try {
      if (!fs.lstatSync(file).isFile()) continue;
      hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    if (hashes.has(hash) || (entry && hashes.has(entry.original))) {
      leftovers.push(rel);
    }
  }
  return leftovers;
}

export function leftoverMessage(files) {
  return `检测到旧版本补丁残留：${files.join('、')}。请用完整安装包修复当前应用；备份已保留。`;
}

function hasSymlink(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).some(entry =>
    entry.isSymbolicLink() || (entry.isDirectory() && hasSymlink(path.join(dir, entry.name))));
}

/** 在持有安装锁且当前安装成功后调用；保留当前版本和最近的旧版本。 */
export function pruneBuilds({ root, current, recordName, installRoot, targetRoot, keep = 3 }) {
  keep = backupLimit(keep);
  root = path.resolve(root);
  current = path.resolve(current);
  const builds = buildHistory(root, recordName).sort((a, b) => b.modified - a.modified);
  const currentRecord = builds.find(item => item.dir === current)?.record;
  const old = builds.filter(item => item.dir !== current);
  const removed = [];
  for (const item of old.slice(keep - 1)) {
    const { dir, record } = item;
    if (path.dirname(dir) !== root || dir === current) continue;
    if (fs.readdirSync(dir).some(name => ![recordName, 'backup', 'reports'].includes(name))) continue;
    const normalized = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    if (normalized(record.installRoot) !== normalized(installRoot)) continue;
    if (record.status && !['patched', 'restored'].includes(record.status)) continue;
    const entries = Object.entries(record.files);
    if (!entries.length || entries.some(([, entry]) => !entry || entry.pending || entry.pendingFrom)) continue;
    const safe = entries.every(([rel, entry]) => {
      if (!/^[a-f0-9]{64}$/.test(entry.original) || !/^[a-f0-9]{64}$/.test(entry.patched)) return false;
      const file = path.resolve(targetRoot, rel);
      const tail = path.relative(targetRoot, file);
      if (!tail || tail === '..' || tail.startsWith(`..${path.sep}`) || path.isAbsolute(tail)) return false;
      // 当前文件仍携带旧版本补丁时，必须保留对应的原始文件。
      if (entry.patched !== entry.original && fs.existsSync(file)) {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (hash === entry.patched) {
          const active = currentRecord?.files?.[rel];
          if (!active || active.patched !== hash || active.original === hash || active.pending || active.pendingFrom) return false;
          const backup = path.resolve(current, active.backup ?? '');
          const tail = path.relative(current, backup);
          if (!tail || tail === '..' || tail.startsWith(`..${path.sep}`) || path.isAbsolute(tail)) return false;
          if (!fs.existsSync(backup) || crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex') !== active.original) return false;
        }
      }
      return true;
    });
    if (!safe || hasSymlink(dir)) continue;
    // 最终绝对路径必须是本安装状态目录的直接子目录。
    if (path.dirname(fs.realpathSync(dir)) !== fs.realpathSync(root)) continue;
    fs.rmSync(dir, { recursive: true });
    removed.push(dir);
  }
  return removed;
}

export function appProcesses(product, installRoot, { platform = process.platform, run = spawnSync } = {}) {
  try {
    let result;
    if (platform === 'win32') {
      const name = product === 'cursor' ? 'Cursor.exe' : 'Kiro.exe';
      result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter "Name='${name}'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (result.error || result.status !== 0) return { checked: false, pids: [] };
      const rows = result.stdout.trim() ? JSON.parse(result.stdout) : [];
      const root = path.win32.resolve(installRoot).toLowerCase() + '\\';
      return {
        checked: [].concat(rows).every(row => Boolean(row.ExecutablePath)),
        pids: [].concat(rows).filter(row => row.ExecutablePath?.toLowerCase().startsWith(root)).map(row => row.ProcessId)
      };
    }
    result = run('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8', timeout: 5000 });
    if (result.error || result.status !== 0) return { checked: false, pids: [] };
    const root = path.posix.resolve(installRoot) + '/';
    let checked = true;
    const pids = result.stdout.split('\n').flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match || path.posix.basename(match[2]).toLowerCase() !== product) return [];
      let executable = match[2];
      if (!path.posix.isAbsolute(executable)) {
        try {
          if (platform !== 'linux') throw new Error('process path unavailable');
          executable = fs.readlinkSync(`/proc/${match[1]}/exe`);
        } catch { checked = false; return []; }
      }
      return executable.startsWith(root) ? [Number(match[1])] : [];
    });
    return { checked, pids };
  } catch { return { checked: false, pids: [] }; }
}

export function reportAppProcesses(product, installRoot, { writing = false, ...probe } = {}) {
  const result = appProcesses(product, installRoot, probe);
  if (writing && result.pids.length) {
    throw new Error(`检测到应用进程（PID ${result.pids.join(', ')}）。请完全退出应用后重试。`);
  }
  console.log(result.pids.length ? `检测到应用进程（PID ${result.pids.join(', ')}），安装或恢复前请完全退出。`
    : !result.checked ? '未能检查应用进程，请自行确认应用已完全退出。'
      : '未检测到此应用的进程。');
}

export function missingInstallMessage(name, dir, command) {
  const location = dir ? `指定目录中找不到 ${name} 的 resources/app：${dir}。` : `找不到 ${name} 安装目录。`;
  const help = `请用 --dir 指定包含 resources/app 的安装目录；macOS 可以指定 ${name}.app。`;
  return `${location}\n${help}${command === 'restore' ? '\n恢复需要原安装目录及同一系统用户下的备份。请确认应用是否被移动、卸载或更新；备份已保留，旧版本备份不能直接覆盖新版本。' : ''}`;
}
