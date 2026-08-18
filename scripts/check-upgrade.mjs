#!/usr/bin/env node
/**
 * Compare the locally installed Cursor against this repository's translation baseline.
 *
 * Reports whether the install version matches `config.target.verifiedCursorVersions` /
 * the last `metadata/cursor.json` extract, then (when they differ, or with `--force`)
 * refreshes the metadata snapshot and lists core keys that are new, removed, or still
 * untranslated in each enabled locale.
 *
 * Usage:
 *   npm run check-upgrade
 *   npm run check-upgrade -- --force
 *   npm run check-upgrade -- --locale=zh-cn --skeleton=.tmp-upgrade.json --limit=40
 *
 * Does not bump `verifiedCursorVersions` — do that yourself after translations catch up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findCursorInstall, readCursorInfo } from './lib/cursor-paths.mjs';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

const { flags } = parseArgs();
const config = loadConfig();
const force = Boolean(flags.force);
const limit = Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : 40;
const IGNORED_MODULE = /(^|\/)test(s)?\//;

const found = findCursorInstall();
if (!found) {
  fail(
    'Cursor installation not found. Set CURSOR_INSTALL_DIR to the install root\n' +
    '  (the directory that contains resources/app/package.json) and retry.'
  );
}

const info = readCursorInfo(found.appRoot);
const installVersion = info.cursorVersion ?? '(unknown)';
const verified = config.target?.verifiedCursorVersions ?? [];
const metadataPath = p('metadata', 'cursor.json');
const previousMeta = fs.existsSync(metadataPath) ? readJson(metadataPath) : null;
const previousVersion = previousMeta?.cursorVersion ?? null;

const locales = config.locales
  .filter((l) => l.enabled !== false)
  .filter((l) => (flags.locale ? l.id === flags.locale : true));
if (!locales.length) fail(`No enabled locale matched${flags.locale ? ` --locale=${flags.locale}` : ''}.`);

log.step('Version check');
log.plain(`  installed Cursor          ${installVersion}  (Code OSS ${info.vscodeVersion ?? '?'})`);
log.plain(`  verified in config.json ${verified.length ? verified.join(', ') : '(none)'}`);
log.plain(`  last metadata extract   ${previousVersion ?? '(none)'}`);

const matchesVerified = verified.includes(installVersion);
const matchesMetadata = previousVersion === installVersion;
const aligned = matchesVerified && matchesMetadata;

if (aligned && !force) {
  log.ok('Install matches verified versions and the last extract. Nothing to do.');
  log.plain('  Re-run with --force to refresh metadata and re-diff translations anyway.');
  log.plain('  Next tips: npm run coverage · npm run gap');
  process.exit(0);
}

if (!matchesVerified) {
  log.warn(`Install ${installVersion} is not in target.verifiedCursorVersions.`);
}
if (previousVersion && !matchesMetadata) {
  log.warn(`Install ${installVersion} differs from last extract (${previousVersion}).`);
}
if (force) log.info('--force: refreshing metadata and re-diffing.');

/** Snapshot core module→key→english before overwrite (for added/removed vs previous extract). */
function flattenCore(core) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!core) return map;
  for (const [moduleId, keys] of Object.entries(core)) {
    if (IGNORED_MODULE.test(moduleId)) continue;
    for (const [key, english] of Object.entries(keys ?? {})) {
      map.set(`${moduleId}\0${key}`, typeof english === 'string' ? english : '');
    }
  }
  return map;
}

const beforeFlat = flattenCore(previousMeta?.core);

log.step('Refreshing metadata/cursor.json from the local install');
const extract = spawnSync(process.execPath, [p('scripts', 'extract.mjs')], { stdio: 'inherit' });
if (extract.status !== 0) fail('extract failed; cannot continue check-upgrade.');

const metadata = readJson(metadataPath);
const afterFlat = flattenCore(metadata.core);

const added = [];
const removed = [];
for (const [id, english] of afterFlat) {
  if (!beforeFlat.has(id)) {
    const [moduleId, key] = id.split('\0');
    added.push({ moduleId, key, english });
  }
}
for (const [id, english] of beforeFlat) {
  if (!afterFlat.has(id)) {
    const [moduleId, key] = id.split('\0');
    removed.push({ moduleId, key, english });
  }
}

added.sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.key.localeCompare(b.key));
removed.sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.key.localeCompare(b.key));

log.step(`Core key drift vs previous extract (${previousVersion ?? 'none'} → ${metadata.cursorVersion})`);
log.plain(`  added    ${added.length}`);
log.plain(`  removed  ${removed.length}`);
if (added.length) {
  const byMod = new Map();
  for (const row of added) {
    byMod.set(row.moduleId, (byMod.get(row.moduleId) ?? 0) + 1);
  }
  const top = [...byMod.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  log.plain('\n  new keys by module (largest first):');
  for (const [mod, n] of top) log.plain(`    ${String(n).padStart(4)}  ${mod}`);
  if (byMod.size > top.length) log.plain(`    ... ${byMod.size - top.length} more module(s)`);
}

/** Load authored core*.i18n.json for a locale. */
function loadOwnCore(localeId) {
  const own = {};
  const cursorDir = p('src', 'i18n', localeId, 'cursor');
  if (!fs.existsSync(cursorDir)) return own;
  for (const name of fs.readdirSync(cursorDir).filter((f) => /^core[.\-].*\.i18n\.json$/.test(f) || f === 'core.i18n.json')) {
    const contents = readJson(path.join(cursorDir, name)).contents ?? {};
    for (const [moduleId, entries] of Object.entries(contents)) {
      own[moduleId] = { ...(own[moduleId] ?? {}), ...entries };
    }
  }
  return own;
}

function loadOwnAgent(localeId, extId) {
  if (!extId) return { package: {}, bundle: {} };
  const file = p('src', 'i18n', localeId, 'cursor', `${extId}.i18n.json`);
  if (!fs.existsSync(file)) return { package: {}, bundle: {} };
  const contents = readJson(file).contents ?? {};
  return {
    package: contents.package ?? {},
    bundle: contents.bundle ?? {}
  };
}

/** Keys that need this repo (not covered by upstream) and lack a translation. */
function missingAuthored(locale, core, upstream, own) {
  const missing = [];
  const modules = new Map();

  for (const [moduleId, keys] of Object.entries(core)) {
    if (IGNORED_MODULE.test(moduleId)) continue;
    const fromUpstream = upstream?.[moduleId] ?? {};
    const fromUs = own[moduleId] ?? {};
    for (const [key, english] of Object.entries(keys)) {
      if (typeof fromUpstream[key] === 'string' && fromUpstream[key] !== '') continue;
      if (english === '') continue;
      if (typeof fromUs[key] === 'string' && fromUs[key] !== '') continue;
      missing.push({ moduleId, key, english });
      if (!modules.has(moduleId)) modules.set(moduleId, []);
      modules.get(moduleId).push({ key, english });
    }
  }
  return { missing, modules };
}

/** Authored keys no longer present in the install (safe to delete later). */
function orphanedAuthored(locale, core, own) {
  const orphans = [];
  for (const [moduleId, entries] of Object.entries(own)) {
    const live = core[moduleId] ?? {};
    for (const key of Object.keys(entries)) {
      if (!(key in live)) orphans.push({ moduleId, key });
    }
  }
  return orphans;
}

const skeletonAll = {};

for (const locale of locales) {
  const upstreamMain = p('upstream', locale.id, 'main.i18n.json');
  const upstream = fs.existsSync(upstreamMain) ? (readJson(upstreamMain).contents ?? {}) : null;
  if (!upstream) {
    log.warn(`${locale.id}: no upstream baseline (npm run sync). Treating every non-authored core key as missing.`);
  }

  const own = loadOwnCore(locale.id);
  const { missing, modules } = missingAuthored(locale, metadata.core, upstream, own);
  const orphans = orphanedAuthored(locale, metadata.core, own);

  // New since previous extract AND still untranslated
  const addedUntranslated = added.filter((row) => {
    const fromUpstream = upstream?.[row.moduleId]?.[row.key];
    if (typeof fromUpstream === 'string' && fromUpstream !== '') return false;
    if (row.english === '') return false;
    const tr = own[row.moduleId]?.[row.key];
    return !(typeof tr === 'string' && tr !== '');
  });

  const agentId = config.target?.cursorExtensionId;
  const agentMeta = agentId ? metadata.extensions?.[agentId] : null;
  const agentOwn = loadOwnAgent(locale.id, agentId);
  const agentMissing = [];
  if (agentMeta?.packageNls) {
    for (const [key, english] of Object.entries(agentMeta.packageNls)) {
      if (english === '') continue;
      if (typeof agentOwn.package[key] === 'string' && agentOwn.package[key] !== '') continue;
      agentMissing.push({ key, english });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    locale: locale.id,
    install: {
      cursorVersion: metadata.cursorVersion,
      vscodeVersion: metadata.vscodeVersion,
      commit: metadata.commit
    },
    previousExtract: previousVersion,
    verifiedCursorVersions: verified,
    alignedWithVerified: matchesVerified,
    core: {
      addedSincePreviousExtract: added.length,
      removedSincePreviousExtract: removed.length,
      stillMissingTranslations: missing.length,
      orphanedAuthoredKeys: orphans.length,
      addedAndStillUntranslated: addedUntranslated.length
    },
    cursorAgent: {
      packageNlsTotal: agentMeta ? Object.keys(agentMeta.packageNls ?? {}).length : 0,
      packageNlsMissing: agentMissing.length
    },
    addedKeys: added,
    removedKeys: removed,
    missingTranslations: missing,
    addedUntranslated,
    orphanedAuthored: orphans,
    missingByModule: Object.fromEntries(
      [...modules.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([moduleId, keys]) => [moduleId, keys])
    ),
    agentMissing
  };

  const safeVer = String(metadata.cursorVersion ?? 'unknown').replace(/[^\w.-]+/g, '_');
  const reportPath = p('reports', `upgrade-${safeVer}-${locale.id}.json`);
  writeJson(reportPath, report);

  log.step(`${locale.id}  translation gaps against install ${metadata.cursorVersion}`);
  log.plain(`  still missing (core, authored here)     ${missing.length}`);
  log.plain(`  new since last extract & untranslated ${addedUntranslated.length}`);
  log.plain(`  orphaned authored keys (gone upstream)  ${orphans.length}`);
  if (agentId) log.plain(`  ${agentId} package.nls missing      ${agentMissing.length}`);
  log.plain(`  report: ${path.relative(p('.'), reportPath)}`);

  if (missing.length) {
    const top = [...modules.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, limit);
    log.plain('\n  missing modules (largest first):');
    for (const [mod, keys] of top) log.plain(`    ${String(keys.length).padStart(4)}  ${mod}`);
    if (modules.size > top.length) log.plain(`    ... ${modules.size - top.length} more module(s)`);
  }

  // Skeleton: prefer newly added untranslated; if none, all still-missing.
  const forSkeleton = addedUntranslated.length ? addedUntranslated : missing;
  for (const row of forSkeleton) {
    (skeletonAll[row.moduleId] ??= {})[row.key] = row.english;
  }
}

if (typeof flags.skeleton === 'string') {
  const target = path.isAbsolute(flags.skeleton) ? flags.skeleton : p(flags.skeleton);
  let n = 0;
  for (const keys of Object.values(skeletonAll)) n += Object.keys(keys).length;
  writeJson(target, { version: '1.0.0', contents: skeletonAll });
  log.ok(`skeleton with ${n} key(s) -> ${path.relative(p('.'), target)}`);
  log.plain('  Do not copy this into src/ with English values still as “translations”.');
}

log.step('Next steps');
log.plain('  1. Translate new keys (or merge the skeleton into src/i18n/<locale>/cursor/).');
log.plain('  2. npm run sync && npm run gap   # refresh upstream baseline / work list');
log.plain('  3. npm run build && npm run validate && npm run coverage');
log.plain('  4. Add this Cursor version to config.target.verifiedCursorVersions when done.');
if (!matchesVerified) {
  log.plain(`  (config still lists verified: ${verified.join(', ') || '∅'} — update after you catch up)`);
}
