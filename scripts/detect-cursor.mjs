#!/usr/bin/env node
/**
 * Reports everything the (future) build needs to know about the locally installed Cursor:
 *   - Cursor release and the underlying Code OSS version (drives engines.vscode)
 *   - NLS metadata layout (decides whether core UI can be localized at all)
 *   - how many Cursor-authored keys sit in the `vscode` translation id
 *   - argv.json location (where the display language is stored)
 *
 * Usage: npm run detect [-- --json]
 *        CURSOR_INSTALL_DIR=<path> npm run detect
 */
import fs from 'node:fs';
import {
  findCursorInstall, readCursorInfo, findCoreNlsMetadata,
  listBuiltinExtensions, argvJsonPath, extensionsDir, isCursorAuthoredModule
} from './lib/cursor-paths.mjs';
import { log, fail, parseArgs, readJson } from './lib/util.mjs';

const { flags } = parseArgs();

const found = findCursorInstall();
if (!found) {
  fail(
    'Cursor installation not found.\n' +
    '  Set CURSOR_INSTALL_DIR to the install root and retry, for example:\n' +
    '    Windows  $env:CURSOR_INSTALL_DIR = "C:\\Users\\<you>\\AppData\\Local\\Programs\\cursor"\n' +
    '    macOS    export CURSOR_INSTALL_DIR="/Applications/Cursor.app/Contents"\n' +
    '    Linux    export CURSOR_INSTALL_DIR="/usr/share/cursor"\n' +
    '  The directory must contain resources/app/package.json.'
  );
}

const info = readCursorInfo(found.appRoot);
const nls = findCoreNlsMetadata(found.appRoot);
const builtins = listBuiltinExtensions(found.appRoot);
const argv = argvJsonPath(info.dataFolderName);
const extDir = extensionsDir(info.dataFolderName);
const argvContents = fs.existsSync(argv) ? readJson(argv, {}) : null;
const installedPacks = fs.existsSync(extDir)
  ? fs.readdirSync(extDir).filter((n) => /language-pack/i.test(n))
  : [];

let coreModules = 0;
let coreKeys = 0;
let cursorModules = 0;
let cursorKeys = 0;
if (nls.layout === 'keys') {
  const keyPairs = readJson(nls.keys);
  for (const entry of keyPairs) {
    const [moduleId, keys] = entry;
    const n = (keys ?? []).length;
    coreModules++;
    coreKeys += n;
    if (isCursorAuthoredModule(moduleId)) {
      cursorModules++;
      cursorKeys += n;
    }
  }
}

const cursorBuiltins = builtins.filter((e) =>
  /cursor|anysphere|everysphere/i.test(e.id) || /cursor/i.test(e.folder)
);

const report = {
  installRoot: found.installRoot,
  appRoot: found.appRoot,
  productName: info.productName,
  cursorVersion: info.cursorVersion,
  vscodeVersion: info.vscodeVersion,
  commit: info.commit,
  quality: info.quality,
  galleryUrl: info.galleryUrl,
  nlsLayout: nls.layout,
  coreModules,
  coreKeys,
  cursorAuthoredModules: cursorModules,
  cursorAuthoredKeys: cursorKeys,
  argvJson: argv,
  argvLocale: argvContents?.locale ?? null,
  extensionsDir: extDir,
  installedLanguagePacks: installedPacks,
  builtinExtensionCount: builtins.length,
  cursorBuiltinCount: cursorBuiltins.length,
  cursorBuiltinsWithNls: cursorBuiltins.filter((e) => e.hasNls).map((e) => e.id)
};

if (flags.json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

log.step('Cursor installation');
log.plain(`  install root       ${report.installRoot}`);
log.plain(`  app root           ${report.appRoot}`);
log.plain(`  product            ${report.productName ?? '(unknown)'}`);
log.plain(`  Cursor version     ${report.cursorVersion ?? '(unknown)'}`);
log.plain(`  Code OSS version   ${report.vscodeVersion ?? '(unknown)'}`);
log.plain(`  commit             ${report.commit ?? '(unknown)'}`);
log.plain(`  quality            ${report.quality ?? '(unknown)'}`);
log.plain(`  extension registry ${report.galleryUrl ?? '(not configured)'}`);

log.step('Localization support');
if (nls.layout === 'keys') {
  log.ok(`NLS layout is nls.keys.json + nls.messages.json (${coreModules} modules, ${coreKeys} keys).`);
  log.plain(`  Cursor-authored    ${cursorModules} modules / ${cursorKeys} keys (reachable via a language pack that owns \`vscode\`)`);
} else if (nls.layout === 'metadata') {
  log.ok('NLS layout is the legacy nls.metadata.json.');
} else {
  log.warn('No core NLS metadata found. A language pack cannot translate the workbench.');
}
log.plain(`  argv.json          ${argv}`);
log.plain(`  current locale     ${report.argvLocale ?? '(not set — English)'}`);
log.plain(`  user extensions    ${extDir}`);
log.plain(`  installed packs    ${installedPacks.length ? installedPacks.join(', ') : '(none matching *language-pack*)'}`);

log.step('Built-in extensions');
log.plain(`  total              ${builtins.length}`);
log.plain(`  Cursor-named       ${cursorBuiltins.length} (${report.cursorBuiltinsWithNls.length} with package.nls.json)`);
if (report.cursorBuiltinsWithNls.length) {
  for (const id of report.cursorBuiltinsWithNls) log.plain(`    ${id}`);
}

log.step('Next steps');
log.plain(`  1. Set engines.vscode in config.json to a bound not above ${report.vscodeVersion ?? 'x.y.z'}`);
log.plain('  2. npm run extract   # snapshot the localizable surface of this build');
log.plain('  3. npm run gap       # Cursor keys the vscode-loc baseline does not cover');
log.plain('  4. npm run sync && npm run build && npm run package');
