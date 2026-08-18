#!/usr/bin/env node
/**
 * Audits how much of a built-in extension's UI a language pack can actually
 * reach.
 *
 * A language pack can only translate manifest strings that were externalized as
 * `%key%` placeholders backed by `package.nls.json`. Any literal English string
 * left inline in `package.json` is out of reach, and so is anything rendered
 * inside a webview bundle.
 *
 * The report doubles as the evidence attached to upstream requests for better
 * i18n coverage.
 *
 * Usage: npm run audit [-- --ext=<publisher.name>] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { findCursorInstall, listBuiltinExtensions } from './lib/cursor-paths.mjs';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

/** Manifest properties whose string values are shown to the user. */
const LOCALIZABLE_FIELDS = new Set([
  'title', 'shortTitle', 'category', 'name', 'displayName', 'description',
  'markdownDescription', 'detail', 'label', 'fullName', 'contents',
  'deprecationMessage', 'markdownDeprecationMessage', 'enumDescriptions',
  'markdownEnumDescriptions', 'enumItemLabels', 'placeholder', 'tooltip'
]);

const NLS_REF = /^%([^%]+)%$/;

const { flags } = parseArgs();
const config = loadConfig();
const targetId = typeof flags.ext === 'string' ? flags.ext : config.target.cursorExtensionId;
if (!targetId) {
  fail('Pass --ext=<publisher.name>. Cursor has no single primary built-in with a useful package.nls.json.');
}

const found = findCursorInstall();
if (!found) fail('Cursor installation not found. Set CURSOR_INSTALL_DIR and retry.');

const ext = listBuiltinExtensions(found.appRoot).find((e) => e.id === targetId);
if (!ext) {
  fail(
    `Built-in extension "${targetId}" not found in ${found.appRoot}/extensions.\n` +
    '  Run `npm run extract` to list the available extension ids.'
  );
}

const manifest = readJson(ext.manifest);
const nlsFile = path.join(ext.dir, 'package.nls.json');
const declaredNls = fs.existsSync(nlsFile) ? readJson(nlsFile) : {};

const externalized = [];  // { path, key, english }
const hardcoded = [];     // { path, value }
const danglingRefs = [];  // %key% with no entry in package.nls.json

function classify(value, atPath) {
  const m = NLS_REF.exec(value);
  if (m) {
    const key = m[1];
    externalized.push({ path: atPath, key, english: declaredNls[key] ?? null });
    if (!(key in declaredNls)) danglingRefs.push({ path: atPath, key });
  } else if (value.trim() !== '') {
    hardcoded.push({ path: atPath, value });
  }
}

function walk(node, atPath) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${atPath}[${i}]`));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const childPath = atPath ? `${atPath}.${key}` : key;
    if (LOCALIZABLE_FIELDS.has(key)) {
      if (typeof value === 'string') {
        classify(value, childPath);
        continue;
      }
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        value.forEach((v, i) => classify(v, `${childPath}[${i}]`));
        continue;
      }
    }
    walk(value, childPath);
  }
}

walk(manifest.contributes ?? {}, 'contributes');

// Keys defined in package.nls.json but never referenced from the manifest are
// most likely consumed by the extension host code at runtime.
const referencedKeys = new Set(externalized.map((e) => e.key));
const unreferencedNlsKeys = Object.keys(declaredNls).filter((k) => !referencedKeys.has(k));

/** Webview bundles are opaque to language packs; count them for the report. */
function findWebviewBundles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(full);
      }
    }
  }
  return results;
}

const webviewRoots = ['packages', 'bundled-webviews']
  .map((d) => path.join(ext.dir, d))
  .filter((d) => fs.existsSync(d));
const webviewBundles = webviewRoots.flatMap(findWebviewBundles);
const webviewBytes = webviewBundles.reduce((n, f) => n + fs.statSync(f).size, 0);

const total = externalized.length + hardcoded.length;
const report = {
  generatedAt: new Date().toISOString(),
  extensionId: targetId,
  extensionVersion: manifest.version ?? null,
  extensionFolder: ext.folder,
  declaresL10n: manifest.l10n ?? null,
  l10nBundleShipped: manifest.l10n
    ? fs.existsSync(path.join(ext.dir, manifest.l10n))
    : false,
  manifestStrings: {
    total,
    externalized: externalized.length,
    hardcoded: hardcoded.length,
    reachablePercent: total === 0 ? 0 : Math.round((externalized.length / total) * 1000) / 10
  },
  packageNls: {
    declaredKeys: Object.keys(declaredNls).length,
    referencedFromManifest: referencedKeys.size,
    unreferenced: unreferencedNlsKeys
  },
  danglingRefs,
  webview: {
    bundleCount: webviewBundles.length,
    totalBytes: webviewBytes,
    note: 'Strings inside these bundles cannot be reached by a language pack.'
  },
  externalizedStrings: externalized,
  hardcodedStrings: hardcoded
};

const outFile = p('reports', `manifest-audit-${targetId}.json`);
writeJson(outFile, report);

if (flags.json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

log.step(`Manifest audit: ${targetId} @ ${report.extensionVersion ?? '?'}`);
log.plain(`  localizable manifest strings   ${total}`);
log.ok(`  externalized via %key%         ${externalized.length}  (${report.manifestStrings.reachablePercent}%)`);
log.warn(`  hardcoded English in manifest  ${hardcoded.length}  (not reachable by a language pack)`);
log.plain(`  package.nls.json keys          ${report.packageNls.declaredKeys}`);
log.plain(`  ...referenced from manifest    ${report.packageNls.referencedFromManifest}`);
log.plain(`  ...unreferenced (runtime use)  ${unreferencedNlsKeys.length}`);

log.step('Runtime (vscode.l10n) support');
log.plain(`  manifest "l10n" field          ${report.declaresL10n ?? '(absent)'}`);
log.plain(`  bundle directory shipped       ${report.l10nBundleShipped ? 'yes' : 'no'}`);
log.plain('  For built-in extensions VS Code loads the runtime bundle from the');
log.plain('  language pack (contents.bundle), so this project ships that section');
log.plain('  as soon as Cursor starts calling vscode.l10n.t().');

log.step('Webview surface (out of reach)');
log.plain(`  bundles ${report.webview.bundleCount}, ${(webviewBytes / 1048576).toFixed(1)} MiB`);

if (danglingRefs.length) {
  log.step(`Dangling %key% references (${danglingRefs.length})`);
  for (const d of danglingRefs) log.warn(`  ${d.key}  <- ${d.path}`);
}

if (hardcoded.length) {
  log.step(`Hardcoded strings, first 40 of ${hardcoded.length}`);
  for (const h of hardcoded.slice(0, 40)) {
    log.plain(`  ${JSON.stringify(h.value).slice(0, 72).padEnd(74)} ${h.path}`);
  }
}

log.plain(`\nFull report: ${path.relative(p('.'), outFile)}`);
