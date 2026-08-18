#!/usr/bin/env node
/**
 * Extracts the localizable surface of the locally installed Cursor build into
 * `metadata/cursor.json`. That file is the ground truth used by `build` (to drop
 * keys that do not exist) and by `coverage` (as the denominator).
 *
 * Two NLS layouts are supported:
 *   - out/nls.keys.json + out/nls.messages.json   (current Code OSS builds)
 *       nls.keys.json     -> [[moduleId, [key, ...]], ...]
 *       nls.messages.json -> [englishMessage, ...]  flattened in the same order
 *   - out/nls.metadata.json                        (older builds)
 *       { keys: { moduleId: [key|{key,comment}] }, messages: { moduleId: [msg] } }
 *
 * Usage: npm run extract [-- --json]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  findCursorInstall, readCursorInfo, findCoreNlsMetadata, listBuiltinExtensions
} from './lib/cursor-paths.mjs';
import { p, readJson, writeJson, log, fail, parseArgs } from './lib/util.mjs';

const { flags } = parseArgs();

const found = findCursorInstall();
if (!found) {
  fail(
    'Cursor installation not found. Set CURSOR_INSTALL_DIR to the install root\n' +
    '  (the directory that contains resources/app/package.json) and retry.'
  );
}

const info = readCursorInfo(found.appRoot);
const nls = findCoreNlsMetadata(found.appRoot);

/** @returns {Record<string, Record<string, string>>} module -> key -> english */
function readCore() {
  if (nls.layout === 'keys') return readCoreFromKeysLayout();
  if (nls.layout === 'metadata') return readCoreFromMetadataLayout();
  log.warn('No core NLS metadata found in out/. Core coverage will be unavailable.');
  return {};
}

function readCoreFromKeysLayout() {
  const keyPairs = readJson(nls.keys);
  if (!Array.isArray(keyPairs)) {
    fail(`Unexpected nls.keys.json shape (expected an array): ${nls.keys}`);
  }
  const messages = nls.messages ? readJson(nls.messages) : null;
  if (messages && !Array.isArray(messages)) {
    fail(`Unexpected nls.messages.json shape (expected an array): ${nls.messages}`);
  }

  const core = {};
  let cursor = 0;
  for (const entry of keyPairs) {
    const [moduleId, keys] = entry;
    const bucket = (core[moduleId] ??= {});
    for (const rawKey of keys ?? []) {
      const key = typeof rawKey === 'string' ? rawKey : rawKey?.key;
      const english = messages ? messages[cursor] : undefined;
      cursor++;
      if (key) bucket[key] = english ?? '';
    }
  }
  if (messages && cursor !== messages.length) {
    log.warn(
      `Key/message count mismatch: consumed ${cursor} of ${messages.length} messages. ` +
      'English source text may be misaligned; key lists are still correct.'
    );
  }
  return core;
}

function readCoreFromMetadataLayout() {
  const meta = readJson(nls.metadata);
  const core = {};
  for (const [moduleId, keys] of Object.entries(meta.keys ?? {})) {
    const msgs = meta.messages?.[moduleId] ?? [];
    const bucket = (core[moduleId] ??= {});
    keys.forEach((rawKey, i) => {
      const key = typeof rawKey === 'string' ? rawKey : rawKey?.key;
      if (key) bucket[key] = msgs[i] ?? '';
    });
  }
  return core;
}

const core = readCore();
const coreKeyCount = Object.values(core).reduce((n, m) => n + Object.keys(m).length, 0);

const extensions = {};
for (const ext of listBuiltinExtensions(found.appRoot)) {
  const nlsFile = path.join(ext.dir, 'package.nls.json');
  let strings = {};
  if (fs.existsSync(nlsFile)) {
    const raw = readJson(nlsFile, {});
    // package.nls.json values are either a plain string or { message, comment }
    for (const [k, v] of Object.entries(raw)) {
      strings[k] = typeof v === 'string' ? v : (v?.message ?? '');
    }
  }
  extensions[ext.id] = {
    folder: ext.folder,
    version: ext.version ?? null,
    packageNlsKeyCount: Object.keys(strings).length,
    packageNls: strings
  };
}

const metadata = {
  generatedAt: new Date().toISOString(),
  installRoot: found.installRoot,
  appRoot: found.appRoot,
  cursorVersion: info.cursorVersion,
  vscodeVersion: info.vscodeVersion,
  commit: info.commit,
  nlsLayout: nls.layout,
  coreModuleCount: Object.keys(core).length,
  coreKeyCount,
  core,
  extensions
};

const outFile = p('metadata', 'cursor.json');
writeJson(outFile, metadata, { pretty: false });

if (flags.json) {
  console.log(JSON.stringify({ ...metadata, core: undefined, extensions: undefined }, null, 2));
  process.exit(0);
}

log.ok(`Wrote ${path.relative(p('.'), outFile)}`);
log.plain(`  Cursor version      ${metadata.cursorVersion ?? '(unknown)'}`);
log.plain(`  Code OSS version  ${metadata.vscodeVersion ?? '(unknown)'}`);
log.plain(`  NLS layout        ${metadata.nlsLayout}`);
log.plain(`  core modules      ${metadata.coreModuleCount}`);
log.plain(`  core keys         ${metadata.coreKeyCount}`);
log.plain(`  builtin extensions ${Object.keys(extensions).length}`);

const withNls = Object.entries(extensions)
  .filter(([, e]) => e.packageNlsKeyCount > 0)
  .sort((a, b) => b[1].packageNlsKeyCount - a[1].packageNlsKeyCount);

log.step(`Built-in extensions exposing package.nls.json (${withNls.length})`);
for (const [id, e] of withNls) {
  log.plain(`  ${String(e.packageNlsKeyCount).padStart(5)}  ${id}`);
}
