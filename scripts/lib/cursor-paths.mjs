import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson } from './util.mjs';

/**
 * Cursor is a Code OSS fork, so the desktop layout matches VS Code:
 *   <install>/resources/app/package.json
 *   <install>/resources/app/product.json
 *   <install>/resources/app/out/            core NLS metadata
 *   <install>/resources/app/extensions/     built-in extensions
 * On macOS <install> is Cursor.app/Contents.
 */
function candidateRoots() {
  const home = os.homedir();
  const env = process.env;
  const roots = [];

  if (env.CURSOR_INSTALL_DIR) roots.push(env.CURSOR_INSTALL_DIR);

  if (process.platform === 'win32') {
    const bases = [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      path.join(home, 'AppData', 'Local', 'Programs')
    ].filter(Boolean);
    for (const base of bases) {
      roots.push(path.join(base, 'cursor'), path.join(base, 'Cursor'));
    }
    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      roots.push(`${drive}:\\cursor`, `${drive}:\\Cursor`, `${drive}:\\AI\\cursor`, `${drive}:\\AI\\Cursor`);
    }
  } else if (process.platform === 'darwin') {
    roots.push(
      '/Applications/Cursor.app/Contents',
      path.join(home, 'Applications', 'Cursor.app', 'Contents')
    );
  } else {
    roots.push(
      '/usr/share/cursor',
      '/opt/Cursor',
      '/opt/cursor',
      '/usr/lib/cursor',
      path.join(home, '.local', 'share', 'cursor')
    );
  }
  return roots;
}

export function findCursorInstalls() {
  const seen = new Set();
  const found = [];
  for (const root of candidateRoots()) {
    const appRoot = path.join(root, 'resources', 'app');
    if (!fs.existsSync(path.join(appRoot, 'package.json'))) continue;
    const key = path.resolve(appRoot).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ installRoot: path.resolve(root), appRoot });
  }
  return found;
}

export function findCursorInstall() {
  return findCursorInstalls()[0] ?? null;
}

export function readCursorInfo(appRoot) {
  const pkg = readJson(path.join(appRoot, 'package.json'), {});
  const product = readJson(path.join(appRoot, 'product.json'), {});
  return {
    appRoot,
    cursorVersion: product.version ?? pkg.version ?? null,
    // Underlying Code OSS version — this is what engines.vscode must satisfy.
    // Cursor's product.json uses `vscodeVersion` (camelCase), not `vsCodeVersion`.
    vscodeVersion: product.vscodeVersion ?? product.vsCodeVersion ?? null,
    commit: product.commit ?? null,
    quality: product.quality ?? null,
    productName: product.nameLong ?? product.nameShort ?? pkg.name ?? null,
    galleryUrl: product.extensionsGallery?.serviceUrl ?? null,
    dataFolderName: product.dataFolderName ?? '.cursor'
  };
}

export function extensionsDir(dataFolderName) {
  return path.join(os.homedir(), dataFolderName || '.cursor', 'extensions');
}

export function argvJsonPath(dataFolderName) {
  return path.join(os.homedir(), dataFolderName || '.cursor', 'argv.json');
}

export function findCoreNlsMetadata(appRoot) {
  const out = path.join(appRoot, 'out');
  const metadata = path.join(out, 'nls.metadata.json');
  const keys = path.join(out, 'nls.keys.json');
  const messages = path.join(out, 'nls.messages.json');

  if (fs.existsSync(metadata)) return { layout: 'metadata', metadata };
  if (fs.existsSync(keys)) {
    return { layout: 'keys', keys, messages: fs.existsSync(messages) ? messages : null };
  }
  return { layout: 'none' };
}

export function listBuiltinExtensions(appRoot) {
  const dir = path.join(appRoot, 'extensions');
  if (!fs.existsSync(dir)) return [];

  const result = [];
  for (const name of fs.readdirSync(dir)) {
    const extDir = path.join(dir, name);
    const manifest = path.join(extDir, 'package.json');
    if (!fs.statSync(extDir).isDirectory() || !fs.existsSync(manifest)) continue;

    const pkg = readJson(manifest, null);
    if (!pkg?.name) continue;

    result.push({
      id: `${pkg.publisher || 'vscode'}.${pkg.name}`,
      folder: name,
      dir: extDir,
      manifest,
      version: pkg.version ?? null,
      displayName: pkg.displayName ?? pkg.name,
      hasNls: fs.existsSync(path.join(extDir, 'package.nls.json'))
    });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/** Modules that look Cursor-authored (not VS Code multicursor, not remoteAgent). */
export function isCursorAuthoredModule(moduleId) {
  if (/multicursor|cursorUndo|toggleMultiCursor/i.test(moduleId)) return false;
  if (/\/(cursor|composer|aiConfig|aiSettings)\b/i.test(moduleId)) return true;
  if (/\.cursor$/.test(moduleId) || /cursor[A-Z]/.test(moduleId)) return true;
  if (/\/agents\//i.test(moduleId)) return true;
  if (/\/agent(?:Layout|Exec)/i.test(moduleId)) return true;
  if (/services\/agent\//i.test(moduleId) && !/remoteAgent/i.test(moduleId)) return true;
  return false;
}
