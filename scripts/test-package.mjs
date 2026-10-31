#!/usr/bin/env node
/** Exercise the shipped tarball against an isolated editor and user profile. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { p, readJson, writeJson } from './lib/util.mjs';
import { npmCommand } from './lib/npm-tooling.mjs';
import { chineseLocale, systemLocale } from './lib/system-locale.mjs';

// ZIP central directory reader for the VSIX built by vsce; no runtime dependency.
function zipEntry(zip, name) {
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid VSIX ZIP');
  let at = zip.readUInt32LE(end + 16);
  const count = zip.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const size = zip.readUInt32LE(at + 20);
    const length = zip.readUInt16LE(at + 28);
    const entryName = zip.subarray(at + 46, at + 46 + length).toString();
    if (entryName === name) {
      const local = zip.readUInt32LE(at + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      const method = zip.readUInt16LE(at + 10);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error('Unsupported ZIP compression');
    }
    at += 46 + length + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error(`VSIX entry missing: ${name}`);
}

const config = readJson(p('config.json'));
const pkg = readJson(p('package.json'));
const product = config.namePrefix.startsWith('cursor') ? 'cursor' : 'kiro';
const name = product === 'cursor' ? 'Cursor' : 'Kiro';
const given = process.argv.slice(2).find((arg) => arg.startsWith('--tarball='))?.slice('--tarball='.length);
const published = process.argv.includes('--published');
const propagationAttempts = 36;
const filename = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
let tarball = path.resolve(given ?? p('dist', filename));
if (!published && !fs.existsSync(tarball)) throw new Error('Build the npm tarball first: npm run package:npm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'language-pack-npm-'));
assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
const home = path.join(temp, 'user');
const installRoot = path.join(temp, 'Apps & Tools', `${name}=test`);
const app = path.join(installRoot, 'resources', 'app');
const runtime = path.join(temp, 'runtime');
const dataFolder = `.${product}-npm-test`;
const data = path.join(home, dataFolder);
const env = { ...process.env, HOME: home, USERPROFILE: home,
  APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  npm_config_cache: path.join(temp, 'npm-cache'), npm_config_userconfig: path.join(temp, 'npmrc'),
  npm_config_globalconfig: path.join(temp, 'global-npmrc') };
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(env.npm_config_userconfig, '');
fs.writeFileSync(env.npm_config_globalconfig, '');

try {
  if (published) {
    let registry;
    for (let attempt = 0; attempt < propagationAttempts; attempt++) {
      const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(pkg.name) + '/latest',
        { signal: AbortSignal.timeout(30_000) });
      assert.ok(response.status === 200 || response.status === 404, 'npm metadata HTTP ' + response.status);
      if (response.status === 200) {
        registry = await response.json();
        assert.equal(registry.name, pkg.name);
        if (registry.version === pkg.version) break;
      }
      if (attempt < propagationAttempts - 1) {
        console.log(`Waiting for npm latest ${pkg.version}; registry reports ${registry?.version ?? 'not found'}.`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
    assert.equal(registry?.version, pkg.version, 'latest must select the version under test');
    const url = new URL(registry.dist.tarball);
    assert.equal(url.origin, 'https://registry.npmjs.org');
    const download = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    assert.equal(download.status, 200, 'published npm tarball');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), registry.dist.integrity);
    tarball = path.join(temp, filename);
    fs.writeFileSync(tarball, bytes);
    console.log(`${pkg.name}@${registry.version}: downloaded from the public registry; integrity verified.`);
  }
  npmCommand(['install', '--prefix', runtime, '--offline', '--ignore-scripts', '--omit=dev',
    '--no-audit', '--no-fund', '--package-lock=false', tarball], { env, cwd: temp });
  const installed = path.join(runtime, 'node_modules', ...pkg.name.split('/'));
  const manifest = readJson(path.join(installed, 'package.json'));
  assert.equal(manifest.version, config.version);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'no runtime dependencies');
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts?.[hook], undefined);
  const asset = path.join(installed, 'assets', 'language-pack.vsix');
  const extension = JSON.parse(zipEntry(fs.readFileSync(asset), 'extension/package.json'));
  assert.equal(extension.version, pkg.version);
  assert.equal(extension.name, config.namePrefix);
  assert.equal(extension.publisher, config.publisher);
  assert.deepEqual(extension.contributes.localizations.map((item) => item.languageId).sort(), ['zh-cn', 'zh-tw']);
  for (const locale of extension.contributes.localizations) {
    for (const item of locale.translations) {
      const bytes = zipEntry(fs.readFileSync(asset), 'extension/' + item.path.replace(/^\.\//, ''));
      assert.ok(bytes.length > 0);
      if (item.id === 'vscode') continue;
      const authored = readJson(p('src', 'i18n', locale.languageId, 'overrides', item.id + '.i18n.json'), null)?.contents;
      const translations = JSON.parse(bytes).contents;
      const localMetadata = readJson(p('metadata', product + '.json'), null);
      for (const [key, value] of Object.entries(authored?.package ?? {})) {
        if (localMetadata && !(key in (localMetadata.extensions[item.id]?.packageNls ?? {}))) continue;
        assert.equal(translations.package?.[key], value, locale.languageId + ': shipped manifest translation ' + item.id + '/' + key);
      }
    }
  }
  fs.mkdirSync(path.join(app, 'out', 'vs', 'workbench'), { recursive: true });
  writeJson(path.join(app, 'package.json'), { name: product, version: '1.131.0' });
  const versions = product === 'cursor' ? config.target.verifiedCursorVersions : config.target.verifiedKiroVersions;
  const productJson = { nameShort: name, version: versions.at(-1), vscodeVersion: '1.131.0', commit: 'fixture-a', dataFolderName: dataFolder };
  writeJson(path.join(app, 'product.json'), productJson);
  const executable = path.join(installRoot, process.platform === 'win32' ? `${name}.exe` : product);
  try { fs.linkSync(process.execPath, executable); } catch { fs.copyFileSync(process.execPath, executable); }
  // The real CLI protocol is exercised with a local stand-in for Electron/VS Code.
  // It reads the actual bundled VSIX and records every install/uninstall request.
  fs.writeFileSync(path.join(app, 'out', 'cli.js'), `
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const zipEntry = ${zipEntry.toString()};
const args = process.argv.slice(2);
const data = path.join(os.homedir(), ${JSON.stringify(dataFolder)});
fs.mkdirSync(data, {recursive:true});
fs.appendFileSync(path.join(data,'cli-calls.jsonl'), JSON.stringify(args)+'\\n');
if(process.env.LANGUAGE_PACK_TEST_FAIL === 'install' && args[0] === '--install-extension') process.exit(17);
const extDir = path.join(data,'extensions');
fs.mkdirSync(extDir,{recursive:true});
const registry = path.join(extDir,'extensions.json');
const registered = fs.existsSync(registry) ? JSON.parse(fs.readFileSync(registry,'utf8')) : [];
if(args[0] === '--install-extension') {
  const m = JSON.parse(zipEntry(fs.readFileSync(args[1]), 'extension/package.json'));
  const id = m.publisher+'.'+m.name;
  const dir = path.join(extDir,id+'-'+m.version);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(m));
  if(process.env.LANGUAGE_PACK_TEST_FAIL === 'register') process.exit(0);
  fs.writeFileSync(registry,JSON.stringify([...registered.filter(e => e.identifier.id !== id),
    {identifier:{id},version:m.version,relativeLocation:path.basename(dir)}]));
} else if(args[0] === '--uninstall-extension') {
  for(const folder of fs.readdirSync(extDir,{withFileTypes:true})) {
    if(!folder.isDirectory()) continue;
    const file = path.join(extDir,folder.name,'package.json');
    const m = JSON.parse(fs.readFileSync(file,'utf8'));
    if(m.publisher+'.'+m.name === args[1]) fs.rmSync(path.dirname(file),{recursive:true,force:true});
  }
  fs.writeFileSync(registry,JSON.stringify(registered.filter(e => e.identifier.id !== args[1])));
} else process.exit(18);
`);
  const cli = path.join(installed, 'bin', 'cli.mjs');
  const execute = (args, success = true, extraEnv = {}) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: temp, env: { ...env, ...extraEnv }, encoding: 'utf8', windowsHide: true });
    assert.equal(result.error, undefined);
    if (success) assert.equal(result.status, 0, result.stdout + result.stderr);
    else assert.notEqual(result.status, 0, 'operation should report failure');
    return result.stdout + result.stderr;
  };
  assert.match(execute(['--help']), /--locale/);
  assert.equal(execute(['--version']).trim(), pkg.version);
  execute(['--locale=invalid'], false);
  const args = ['--dir=' + installRoot];
  const extRoot = path.join(data, 'extensions');
  const official = path.join(extRoot, 'official-test');
  writeJson(path.join(official, 'package.json'), { publisher: 'ms-ceintl', name: 'vscode-language-pack-zh-hans',
    contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode', path: 'test.json' }] }] } });
  fs.writeFileSync(path.join(data, 'argv.json'), '// user option\n{\n  "disable-hardware-acceleration": true\n}\n');
  let target;
  let original;
  let commerceTarget;
  let commerceOriginal;
  if (product === 'cursor') {
    target = path.join(app, 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
    original = 'const ui={label:"Sign In",title:"General",id:"Sign In"};\n';
    commerceTarget = path.join(app, 'out', 'vs', 'workbench', 'workbench.xai-commerce-prepaid.js');
    commerceOriginal = 'async function copy(e,t){const{instance:r,ready:o}=get(e);if(await o,!r.isInitialized)return;const n={};for(const[s,m]of Object.entries(t))allowed(s)&&typeof m=="string"&&m.length>0&&(n[s]=m);if(Object.keys(n).length===0)return;const i=r.resolvedLanguage??r.language;r.addResourceBundle(i,ns,n,!0,!0),r.services.i18nFormat?.clearCache?.()}export{copy as applyCursorCommerceCopy};\n';
    fs.writeFileSync(commerceTarget, commerceOriginal);
  } else {
    const ext = path.join(app, 'extensions', 'kiro.kiro-agent');
    target = path.join(ext, 'package.json');
    original = JSON.stringify({ name: 'kiroAgent', publisher: 'kiro', contributes: { commands: [{ command: 'kiro.test', title: 'SPECS' }] } }, null, 2) + '\n';
    const dictionary = readJson(path.join(installed, 'src', 'i18n', 'zh-cn', 'patch', 'kiro.kiroAgent.json'));
    const traditionalDictionary = readJson(path.join(installed, 'src', 'i18n', 'zh-tw', 'patch', 'kiro.kiroAgent.json'));
    const title = Object.keys(dictionary.manifest).find((key) => dictionary.manifest[key] !== key
      && traditionalDictionary.manifest[key] !== dictionary.manifest[key]);
    assert.ok(title, 'the fixture needs a command whose Simplified and Traditional translations differ');
    original = original.replace('SPECS', title);
    fs.mkdirSync(path.join(ext, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(ext, 'dist', 'extension.js'), 'const workflow=' + JSON.stringify(Object.keys(dictionary.extension)[0]) + ';\n');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, original);
  const callsFile = path.join(data, 'cli-calls.jsonl');
  const calls = () => fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  execute(['preview', ...args, '--locale=zh-cn']);
  assert.equal(fs.readFileSync(target, 'utf8'), original, 'preview preserves the install');
  if (commerceTarget) assert.equal(fs.readFileSync(commerceTarget, 'utf8'), commerceOriginal, 'preview preserves the commerce bundle');
  assert.equal(calls().length, 0, 'preview does not run the editor CLI');
  execute(['install', ...args, '--locale=zh-cn'], false, { LANGUAGE_PACK_TEST_FAIL: 'install' });
  assert.ok(fs.existsSync(path.join(official, 'package.json')), 'failed extension installation must preserve the working language pack');
  assert.equal(calls().some((call) => call[0] === '--uninstall-extension'), false);
  const unregistered = execute(['install', ...args, '--locale=zh-cn'], false, { LANGUAGE_PACK_TEST_FAIL: 'register' });
  assert.match(unregistered, /未检测到当前版本语言扩展的有效安装登记/);
  assert.ok(fs.existsSync(path.join(official, 'package.json')), 'CLI exit 0 without registration must preserve the working language pack');
  assert.equal(calls().some((call) => call[0] === '--uninstall-extension'), false);
  execute(['install', ...args, '--locale=zh-cn']);
  assert.notEqual(fs.readFileSync(target, 'utf8'), original);
  if (commerceTarget) assert.match(fs.readFileSync(commerceTarget, 'utf8'), /cursor-commerce-i18n/, 'commerce resources are installed from the shipped dictionary');
  const simplified = fs.readFileSync(target, 'utf8');
  assert.equal(fs.existsSync(official), false, 'conflicting pack removed after a successful install');
  const argv = fs.readFileSync(path.join(data, 'argv.json'), 'utf8');
  assert.match(argv, /"locale":\s*"zh-cn"/);
  assert.match(argv, /disable-hardware-acceleration/);
  assert.match(argv, /user option/);
  execute(['install', ...args, '--locale=zh-cn']);
  assert.equal(fs.readFileSync(target, 'utf8'), simplified, 'repeat install converges');
  assert.ok(calls().filter((call) => call[0] === '--install-extension').length >= 3, 'repeat install retries extension setup');
  const registry = path.join(extRoot, 'extensions.json');
  const packId = `${config.publisher}.${config.namePrefix}`;
  const registeredPack = () => readJson(registry).find((entry) => entry.identifier.id === packId);
  assert.equal(registeredPack()?.version, config.version, 'the shipped CLI installs and registers the current version');
  const residual = path.join(extRoot, registeredPack().relativeLocation, 'package.json');
  writeJson(registry, readJson(registry).filter((entry) => entry.identifier.id !== packId));
  assert.ok(fs.existsSync(residual), 'uninstall can leave the extension directory behind');
  const installsBeforeRepair = calls().filter((call) => call[0] === '--install-extension').length;
  execute(['install', ...args, '--locale=zh-cn']);
  assert.equal(registeredPack()?.version, config.version, 'reinstall repairs missing registration despite residual files');
  assert.equal(calls().filter((call) => call[0] === '--install-extension').length, installsBeforeRepair + 1);
  const stateFiles = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? stateFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) : [];
  const stateRoot = path.join(data, `${product}-language-pack`);
  const backup = stateFiles(stateRoot).find((file) => path.basename(path.dirname(file)) === 'backup'
    && fs.readFileSync(file).equals(Buffer.from(original)));
  assert.ok(backup, 'original application bytes are backed up in the user profile');
  const savedBackup = path.join(temp, 'saved-backup');
  fs.renameSync(backup, savedBackup);
  execute(['restore', ...args], false);
  assert.equal(fs.readFileSync(target, 'utf8'), simplified, 'missing backup never overwrites the target');
  assert.ok(stateFiles(stateRoot).some((file) => file.endsWith('.json')), 'incomplete restore keeps its state');
  fs.renameSync(savedBackup, backup);
  execute(['install', ...args, '--locale=zh-tw']);
  const traditional = fs.readFileSync(target, 'utf8');
  assert.notEqual(traditional, original);
  assert.match(fs.readFileSync(path.join(data, 'argv.json'), 'utf8'), /"locale":\s*"zh-tw"/);
  execute(['status', ...args]);
  // External edits must survive both a refused reinstall and restore.
  fs.appendFileSync(target, '\n// external change\n');
  execute(['install', ...args, '--locale=zh-cn'], false);
  execute(['restore', ...args], false);
  assert.match(fs.readFileSync(target, 'utf8'), /external change/);
  fs.writeFileSync(target, traditional);
  execute(['restore', ...args]);
  assert.equal(fs.readFileSync(target, 'utf8'), original, 'restore is byte-for-byte');
  if (commerceTarget) assert.equal(fs.readFileSync(commerceTarget, 'utf8'), commerceOriginal, 'commerce restore is byte-for-byte');
  execute(['restore', ...args]);
  execute(['install', ...args, '--locale=zh-cn']);
  // An application update must use the new originals, including without a commit id.
  const updated = original + (product === 'cursor' ? '// new build\n' : ' ');
  fs.writeFileSync(target, updated);
  if (commerceTarget) fs.writeFileSync(commerceTarget, commerceOriginal);
  productJson.commit = 'fixture-b';
  productJson.version += '-fixture';
  writeJson(path.join(app, 'product.json'), productJson);
  execute(['install', ...args, '--locale=zh-tw']);
  execute(['restore', ...args]);
  assert.equal(fs.readFileSync(target, 'utf8'), updated, 'restore never reinstates an older application build');
  execute(args);
  const automaticLocale = chineseLocale(systemLocale());
  assert.ok(fs.readFileSync(path.join(data, 'argv.json'), 'utf8').includes(`"${automaticLocale}"`), 'default install uses the detected OS language');
  execute(['restore', ...args]);
  // Exercise npx's one-off tarball install and generated command, outside the repository.
  const npx = npmCommand(['exec', '--offline', '--yes', `--package=${tarball}`, '--', config.namePrefix, '--version'], { env, cwd: temp });
  assert.equal(npx.stdout.trim(), pkg.version);
  if (published) {
    const npmEntry = [process.env.npm_execpath,
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
      .find((file) => file && fs.existsSync(file));
    assert.ok(npmEntry, 'run the published check through npm run');
    const npxEntry = path.join(path.dirname(npmEntry), 'npx-cli.js');
    assert.ok(fs.existsSync(npxEntry), 'the actual npx CLI is available');
    const localeStub = path.join(temp, 'system-locale-fixture.cjs');
    // Simulate only the OS language query. The downloaded package and its CLI stay intact.
    fs.writeFileSync(localeStub, `
const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function (command, args, options) {
  if (args?.includes('(Get-UICulture).Name')) return {status: 0, stdout: process.env.LANGUAGE_PACK_TEST_LOCALE};
  if (command === '/usr/bin/defaults' && args?.includes('AppleLanguages'))
    return {status: 0, stdout: '(' + process.env.LANGUAGE_PACK_TEST_LOCALE + ')'};
  return original.call(this, command, args, options);
};
require('node:module').syncBuiltinESMExports();
`);
    const runNpx = (cliArgs, simulatedLocale, waitingForVersion = false) => {
      const testEnv = { ...env, npm_config_prefer_online: 'true' };
      if (simulatedLocale) {
        testEnv.LANGUAGE_PACK_TEST_LOCALE = simulatedLocale;
        testEnv.LC_ALL = simulatedLocale;
        testEnv.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + pathToFileURL(localeStub).href].filter(Boolean).join(' ');
      }
      const result = spawnSync(process.execPath, [npxEntry, '--yes', pkg.name + '@latest', ...cliArgs],
        { cwd: temp, env: testEnv, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
      assert.equal(result.error, undefined);
      // npm's version and dist-tag endpoints can propagate at different times.
      // Retry ETARGET only during the initial version probe; install failures stay errors.
      if (waitingForVersion && result.status !== 0 && /\bETARGET\b/.test(result.stdout + result.stderr)) return null;
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout + result.stderr;
    };
    let npxVersion;
    for (let attempt = 0; attempt < propagationAttempts; attempt++) {
      npxVersion = runNpx(['--version'], undefined, true)?.trim() ?? '(ETARGET: metadata not propagated)';
      if (npxVersion === pkg.version) break;
      if (attempt < propagationAttempts - 1) {
        console.log(`Waiting for npx latest ${pkg.version}; npx resolves ${npxVersion}.`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
    assert.equal(npxVersion, pkg.version, 'npx latest must resolve the version under test');
    const beforeNpx = fs.readFileSync(target);
    const selectedLocale = () => JSON.parse(fs.readFileSync(path.join(data, 'argv.json'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '')).locale;
    runNpx(args);
    assert.equal(selectedLocale(), automaticLocale, 'README default command uses the real OS display language');
    console.log(`npx ${pkg.name}@latest: real system ${systemLocale()} selected ${automaticLocale}.`);
    for (const [tag, expected] of [['zh-TW', 'zh-tw'], ['zh-HK', 'zh-tw'], ['zh-MO', 'zh-tw'],
      ['zh-Hant', 'zh-tw'], ['zh-CN', 'zh-cn'], ['en-US', 'zh-cn'], ['zh-Hans-HK', 'zh-cn']]) {
      runNpx(args, tag);
      assert.equal(selectedLocale(), expected, 'npx default for simulated system ' + tag);
    }
    runNpx([...args, '--locale=zh-tw'], 'zh-CN');
    assert.equal(selectedLocale(), 'zh-tw', 'manual Traditional Chinese overrides the system');
    const traditionalNpx = fs.readFileSync(target);
    runNpx([...args, '--locale=zh-cn'], 'zh-HK');
    assert.equal(selectedLocale(), 'zh-cn', 'manual Simplified Chinese overrides the system');
    assert.notDeepEqual(fs.readFileSync(target), traditionalNpx, 'switching locales changes the app translations');
    runNpx(['status', ...args]);
    runNpx(['restore', ...args]);
    assert.deepEqual(fs.readFileSync(target), beforeNpx, 'published npx restores the original app bytes');
    console.log('Published npx: default installation, TW/HK/MO/Hant/CN/English/script precedence, manual locale overrides and restore passed.');
  }
  console.log(`${pkg.name}: tarball install, npx entry, VSIX, preview, retries, language switch, restore and app upgrade passed.`);
} finally {
  assert.equal(path.dirname(temp), path.resolve(os.tmpdir()));
  fs.rmSync(temp, { recursive: true, force: true });
}
