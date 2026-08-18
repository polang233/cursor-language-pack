#!/usr/bin/env node
/**
 * Tests the one destructive thing the runtime does: editing `locale` in argv.json.
 *
 * argv.json is JSON with comments, is shared with the editor, and a botched write means
 * Cursor may not start. Everything else in src/extension/main.cjs only shows notifications,
 * so this is where the risk is concentrated.
 *
 * Usage: npm run test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { p, log } from './lib/util.mjs';

// The runtime does `require('vscode')`, which only resolves inside the editor. Stub it:
// the functions under test touch nothing but the filesystem.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return {
      l10n: { t: (message) => message },
      env: { appRoot: '', language: 'en' },
      window: {}, commands: {}, workspace: {}, extensions: { all: [] }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const require = createRequire(import.meta.url);
const { __test: { readLocale, writeLocale } } = require(p('src', 'extension', 'main.cjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-lp-test-'));
let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
    log.err(`${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  } else {
    log.ok(name);
  }
}

/** Write `text` to a scratch argv.json, set the locale, return the result. */
function edit(text, locale) {
  const file = path.join(tmp, `argv-${Math.random().toString(36).slice(2)}.json`);
  if (text !== null) fs.writeFileSync(file, text, 'utf8');
  writeLocale(file, locale);
  return { file, text: fs.readFileSync(file, 'utf8') };
}

log.step('argv.json editing');

// The real file as Cursor ships it: comments, tabs, an existing locale.
const shipped = [
  '// This configuration file allows you to pass permanent command line arguments to VS Code.',
  '//',
  '// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT',
  '{',
  '\t// Allows to disable crash reporting.',
  '\t"enable-crash-reporter": true,',
  '',
  '\t// Unique id used for correlating crash reports sent from this instance.',
  '\t"crash-reporter-id": "66f06082-00ee-4236-9f08-3768fe24f926",',
  '\t"locale": "zh-cn"',
  '}',
  ''
].join('\n');

{
  const { text } = edit(shipped, 'ja');
  check('replaces an existing locale', readLocale(path.join(tmp, 'x')) === null && text.includes('"locale": "ja"'), true);
  check('  leaves the comments alone', text.includes('PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT'), true);
  check('  leaves the other fields alone', text.includes('"crash-reporter-id": "66f06082-00ee-4236-9f08-3768fe24f926"'), true);
  check('  changes exactly one line', diffLines(shipped, text), 1);
  check('  stays parseable after stripping comments', parseable(text), true);
}

{
  const withoutLocale = shipped.replace('\n\t"locale": "zh-cn"', '');
  const { text } = edit(withoutLocale, 'zh-cn');
  check('adds a missing locale', /"locale":\s*"zh-cn"/.test(text), true);
  check('  keeps the previous field comma-correct', parseable(text), true);
  const kept = withoutLocale.split('\n').filter((l) => l.trim()).every((l) => text.includes(l));
  check('  keeps every original line', kept, true);
  check('  adds only the locale line', text.split('\n').length - withoutLocale.split('\n').length, 1);
}

{
  const { text } = edit('{}\n', 'zh-cn');
  check('handles an empty object', parseable(text) && /"locale":\s*"zh-cn"/.test(text), true);
}

{
  const { text } = edit('{\n\t// only a comment\n}\n', 'zh-cn');
  check('handles an object with only comments', parseable(text), true);
}

{
  const file = path.join(tmp, 'missing', 'argv.json');
  writeLocale(file, 'zh-cn');
  check('creates the file when absent', readLocale(file), 'zh-cn');
}

log.step('reading');
check('reads the shipped layout', readLocale(edit(shipped, 'ko').file), 'ko');
check('returns null when the field is absent', readLocale(edit(shipped.replace('\n\t"locale": "zh-cn"', ''), 'x').file.replace('argv-', 'nope-')), null);
check('is not fooled by the word in a comment', readLocale(writeThen('{\n\t// "locale": "de" is what you would set\n\t"enable-crash-reporter": true\n}\n')), null);

function writeThen(text) {
  const file = path.join(tmp, `read-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  let n = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
}

function parseable(text) {
  try {
    JSON.parse(text.replace(/^[ \t]*\/\/[^\n]*$/gm, ''));
    return true;
  } catch {
    return false;
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures) {
  log.step(`${failures} failure(s)`);
  process.exit(1);
}
log.step('All checks passed');
