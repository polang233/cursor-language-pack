import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { chineseLocale, systemLocale } from './lib/system-locale.mjs';
import { parseCli } from './lib/cli.mjs';
import { nodeScript } from './lib/npm-tooling.mjs';
import { p, readJson, parseArgs } from './lib/util.mjs';
import { packInstalled, conflictingPacks } from './translate-install.mjs';

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
    const ours = path.join(dir, 'polang233.cursor-language-pack-1.1.1');
    fs.mkdirSync(ours);
    fs.writeFileSync(path.join(ours, 'package.json'), JSON.stringify({
      publisher: 'polang233',
      name: 'cursor-language-pack',
      contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode' }] }] }
    }));

    assert.equal(packInstalled(dir), true, 'the pack itself is still detected');
    assert.doesNotThrow(() => conflictingPacks(dir, 'zh-cn'));
    assert.deepEqual(conflictingPacks(dir, 'zh-cn'), [], 'our own pack is never a conflict');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
