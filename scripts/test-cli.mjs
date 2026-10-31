import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { chineseLocale, systemLocale } from './lib/system-locale.mjs';
import { parseCli } from './lib/cli.mjs';
import { nodeScript } from './lib/npm-tooling.mjs';
import { p, readJson, writeJson, parseArgs } from './lib/util.mjs';
import { packInstalled, conflictingPacks } from './translate-install.mjs';
import { extensionsDir } from './lib/cursor-paths.mjs';

test('extension verification follows the CLI environment directory precedence', () => {
  const original = { VSCODE_EXTENSIONS: process.env.VSCODE_EXTENSIONS, VSCODE_PORTABLE: process.env.VSCODE_PORTABLE };
  try {
    process.env.VSCODE_EXTENSIONS = path.resolve('custom extensions');
    process.env.VSCODE_PORTABLE = path.resolve('portable data');
    assert.equal(extensionsDir('.cursor'), path.resolve('custom extensions'));
    delete process.env.VSCODE_EXTENSIONS;
    assert.equal(extensionsDir('.cursor'), path.join(path.resolve('portable data'), 'extensions'));
    delete process.env.VSCODE_PORTABLE;
    assert.equal(extensionsDir('.cursor'), path.join(os.homedir(), '.cursor', 'extensions'));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Traditional Chinese regions and script, with explicit script taking precedence', () => {
  for (const tag of ['zh-TW', 'zh_HK.UTF-8', 'zh-MO', 'zh-Hant', 'zh-Hant-HK', 'zh-CHT', 'TW', 'HK', 'MO']) {
    assert.equal(chineseLocale(tag), 'zh-tw', tag);
  }
  for (const tag of ['zh-CN', 'zh_SG.UTF-8', 'zh-Hans-HK', 'en-US', 'C.UTF-8', '', undefined]) {
    assert.equal(chineseLocale(tag), 'zh-cn', tag);
  }
});

test('Windows reads UI culture even when a terminal LANG is English', () => {
  let invocation;
  const language = systemLocale({ platform: 'win32', env: { LANG: 'en_US' },
    run: (...args) => { invocation = args; return { status: 0, stdout: 'zh-HK\r\n' }; } });
  assert.equal(language, 'zh-HK');
  assert.ok(invocation[1].includes('(Get-UICulture).Name'));
  assert.equal(invocation[2].windowsHide, true);
});

test('macOS reads the first preferred language; Linux respects locale precedence', () => {
  assert.equal(systemLocale({ platform: 'darwin', env: {}, run: () => ({ status: 0, stdout: '(\n "zh-Hant-TW",\n "en-US"\n)' }) }), 'zh-Hant-TW');
  assert.equal(systemLocale({ platform: 'linux', env: { LC_ALL: 'zh_HK.UTF-8', LANG: 'en_US' } }), 'zh_HK.UTF-8');
  assert.equal(systemLocale({ platform: 'linux', env: { LC_ALL: 'C', LANG: 'zh_TW' } }), 'C');
  assert.equal(systemLocale({ platform: 'linux', env: { LANGUAGE: 'zh_TW:en', LANG: 'en_US' } }), 'zh_TW');
  assert.equal(systemLocale({ platform: 'win32', env: {}, run: () => { throw new Error('not available'); }, fallback: () => 'zh-TW' }), 'zh-TW');
});

test('CLI accepts overrides and paths with spaces, equals signs and shell characters', () => {
  assert.deepEqual(parseCli([]), { command: 'install', options: {} });
  assert.deepEqual(parseCli(['--locale', 'zh-tw', 'preview', '--dir=D:/Apps & Tools/IDE=a']), {
    command: 'preview', options: { locale: 'zh-tw', dir: 'D:/Apps & Tools/IDE=a' }
  });
  assert.equal(parseArgs(['--dir=D:/IDE=a']).flags.dir, 'D:/IDE=a');
  for (const args of [['--locale=xx'], ['--locale'], ['--dir'], ['--what'], ['remove'], ['install', 'restore'], ['--dir=a', '--install-dir=b']]) {
    assert.throws(() => parseCli(args), args.join(' '));
  }
});

test('help/version run without any editor installation', () => {
  const pkg = readJson(p('package.json'));
  assert.match(nodeScript(p('bin', 'cli.mjs'), ['--help']).stdout, /--locale=zh-cn\|zh-tw/);
  assert.equal(nodeScript(p('bin', 'cli.mjs'), ['--version']).stdout.trim(), pkg.version);
});

test('a plain file in the extensions folder is not read as an extension directory', () => {
  // `~/.cursor/extensions` holds `extensions.json` and `.obsolete` next to the extension
  // folders; treating them as folders read `<file>/package.json` and threw ENOTDIR, which
  // ended a finished install with exit code 1.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-lp-ext-'));
  try {
    fs.writeFileSync(path.join(dir, 'extensions.json'), '[]');
    fs.writeFileSync(path.join(dir, '.obsolete'), '{"old.id":"1"}');
    const config = readJson(p('config.json'));
    const ours = path.join(dir, `polang233.cursor-language-pack-${config.version}`);
    fs.mkdirSync(ours);
    fs.writeFileSync(path.join(ours, 'package.json'), JSON.stringify({
      publisher: 'polang233',
      name: 'cursor-language-pack',
      version: config.version,
      contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode' }] }] }
    }));
    writeJson(path.join(dir, 'extensions.json'), [{ identifier: { id: 'polang233.cursor-language-pack' },
      version: config.version, relativeLocation: path.basename(ours) }]);

    assert.equal(packInstalled(dir), true, 'the pack itself is still detected');
    assert.doesNotThrow(() => conflictingPacks(dir, 'zh-cn'));
    assert.deepEqual(conflictingPacks(dir, 'zh-cn'), [], 'our own pack is never a conflict');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pack readiness requires registration of the current version at its actual directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-lp-registry-中文 %20-'));
  const config = readJson(p('config.json'));
  const id = 'polang233.cursor-language-pack';
  const folder = `${id}-${config.version}-universal`;
  const manifest = { publisher: 'polang233', name: 'cursor-language-pack', version: config.version };
  const entry = { identifier: { id: id.toUpperCase() }, version: config.version, relativeLocation: folder };
  const registry = path.join(dir, 'extensions.json');
  try {
    writeJson(path.join(dir, folder, 'package.json'), manifest);
    assert.equal(packInstalled(dir), false, 'a directory without a registry is not installed');
    writeJson(registry, []);
    assert.equal(packInstalled(dir), false, 'an uninstalled pack can leave its files behind');
    writeJson(registry, [entry]);
    assert.equal(packInstalled(dir), true, 'registered current version, including platform suffixes');
    for (const changed of [
      { identifier: { id: 'other.language-pack' } },
      { version: '0.0.1' },
      { relativeLocation: 'missing-directory' },
      { relativeLocation: 'extensions.json' }
    ]) {
      writeJson(registry, [{ ...entry, ...changed }]);
      assert.equal(packInstalled(dir), false, JSON.stringify(changed));
    }
    writeJson(registry, [entry]);
    writeJson(path.join(dir, folder, 'package.json'), { ...manifest, version: '0.0.1' });
    assert.equal(packInstalled(dir), false, 'registry and manifest versions must agree');
    writeJson(path.join(dir, folder, 'package.json'), { ...manifest, publisher: 'other' });
    assert.equal(packInstalled(dir), false, 'registry and manifest identifiers must agree');
    writeJson(path.join(dir, folder, 'package.json'), manifest);
    const location = { scheme: 'file', path: decodeURIComponent(pathToFileURL(path.join(dir, folder)).pathname) };
    writeJson(registry, [{ ...entry, relativeLocation: undefined, location }]);
    assert.equal(packInstalled(dir), true, 'older registry entries use a file URI location');
    writeJson(registry, [{ ...entry, relativeLocation: undefined, location: { ...location, scheme: 'https' } }]);
    assert.equal(packInstalled(dir), false, 'only local extension locations are supported');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer rejects residual directories and verifies a successful CLI exit before removing conflicts', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-lp-install-'));
  const config = readJson(p('config.json'));
  const home = path.join(temp, 'user');
  const install = path.join(temp, 'Apps & Tools', 'Cursor=test');
  const app = path.join(install, 'resources', 'app');
  const dataFolder = '.cursor-issue3-test';
  const data = path.join(home, dataFolder);
  const extensions = path.join(data, 'extensions');
  const id = 'polang233.cursor-language-pack';
  const folder = `${id}-${config.version}`;
  const manifest = { publisher: 'polang233', name: 'cursor-language-pack', version: config.version };
  const entry = { identifier: { id }, version: config.version, relativeLocation: folder };
  const registry = path.join(extensions, 'extensions.json');
  const env = { ...process.env, HOME: home, USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local') };
  const run = (extra = []) => spawnSync(process.execPath, [p('scripts', 'translate-install.mjs'),
    `--dir=${install}`, '--locale=zh-cn', '--yes', ...extra], { env, encoding: 'utf8', windowsHide: true });
  try {
    writeJson(path.join(app, 'package.json'), { name: 'cursor' });
    writeJson(path.join(app, 'product.json'), { version: config.target.verifiedCursorVersions.at(-1),
      commit: 'issue3', dataFolderName: dataFolder });
    const target = path.join(app, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'const ui={label:"Sign In"};');
    writeJson(path.join(extensions, folder, 'package.json'), manifest);
    writeJson(registry, []);
    let result = run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /缺少当前版本的 VSIX 或 Cursor 命令行入口/);
    writeJson(registry, [entry]);
    result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    writeJson(registry, []);
    const official = path.join(extensions, 'official-test', 'package.json');
    writeJson(official, { publisher: 'ms-ceintl', name: 'vscode-language-pack-zh-hans',
      contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode' }] }] } });
    const executable = path.join(install, process.platform === 'win32' ? 'Cursor.exe' : 'cursor');
    try { fs.linkSync(process.execPath, executable); } catch { fs.copyFileSync(process.execPath, executable); }
    fs.writeFileSync(path.join(app, 'out', 'cli.js'), `
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
const data = ${JSON.stringify(data)};
fs.appendFileSync(path.join(data, 'cli-calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] === '--install-extension' && fs.existsSync(path.join(data, 'register'))) {
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify([${JSON.stringify(entry)}]));
} else if (args[0] === '--uninstall-extension') {
  fs.rmSync(${JSON.stringify(path.dirname(official))}, {recursive:true,force:true});
}
`);
    const vsix = path.join(temp, 'fixture.vsix');
    fs.writeFileSync(vsix, 'fixture');
    result = run([`--vsix=${vsix}`]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /未检测到当前版本语言扩展的有效安装登记/);
    assert.ok(fs.existsSync(official), 'an unverified CLI success preserves the working pack');
    fs.writeFileSync(path.join(data, 'register'), '');
    result = run([`--vsix=${vsix}`]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(packInstalled(extensions), true);
    assert.equal(fs.existsSync(official), false);
    const calls = fs.readFileSync(path.join(data, 'cli-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls.map((args) => args[0]), ['--install-extension', '--install-extension', '--uninstall-extension']);
    assert.ok(calls[1].includes('--force'), 'residual files are repaired through the Cursor CLI');
  } finally {
    assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a conflicting pack is reported, and an empty folder is still safe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-lp-ext-'));
  try {
    assert.equal(packInstalled(dir), false);
    assert.deepEqual(conflictingPacks(dir, 'zh-cn'), []);
    const other = path.join(dir, 'ms-ceintl.vscode-language-pack-zh-hans-1.128.0');
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({
      publisher: 'MS-CEINTL',
      name: 'vscode-language-pack-zh-hans',
      contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode' }] }] }
    }));
    assert.deepEqual(conflictingPacks(dir, 'zh-cn'), ['MS-CEINTL.vscode-language-pack-zh-hans']);
    assert.deepEqual(conflictingPacks(dir, 'zh-tw'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
