#!/usr/bin/env node
/**
 * Measures translation coverage of the built packs against the installed Cursor
 * build, and writes the list of untranslated keys so contributors have a
 * concrete TODO list.
 *
 * Three numbers per locale, because they mean different things:
 *   core workbench   everything in nls.messages.json, mostly inherited from vscode-loc
 *   cursor core        the subset the upstream baseline does not cover - Cursor's own
 *                    session shell, Settings panel, spec toolbar, rewritten chat
 *   cursor core        the subset the upstream baseline does not cover
 *
 * Requires `metadata/cursor.json` (npm run extract) and `dist/` (npm run build).
 *
 * Usage: npm run coverage [-- --locale=zh-cn] [--mode=full] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

const CORE_TRANSLATION_ID = 'vscode';
const IGNORED_MODULE = /(^|\/)test(s)?\//;

const { flags } = parseArgs();
const config = loadConfig();

const metadataFile = p('metadata', 'cursor.json');
if (!fs.existsSync(metadataFile)) {
  fail('metadata/cursor.json not found. Run `npm run extract` on a machine with Cursor installed.');
}
const metadata = readJson(metadataFile);

const summaryFile = p('dist', 'build-summary.json');
if (!fs.existsSync(summaryFile)) fail('dist/build-summary.json not found. Run `npm run build` first.');
const summary = readJson(summaryFile);

const builds = summary.builds
  .filter((b) => (flags.locale ? (b.locales ?? [b.locale]).includes(flags.locale) : true))
  .filter((b) => (flags.mode ? b.mode === flags.mode : true));
if (!builds.length) fail('No build matched the given filters.');

const pct = (done, total) => (total === 0 ? 100 : Math.round((done / total) * 1000) / 10);

/**
 * Keys the upstream baseline cannot supply for this locale. That difference is
 * what this project has to author itself, so it is reported separately from the
 * inherited workbench coverage.
 */
function cursorCoreKeySet(localeId) {
  const upstreamMain = p('upstream', localeId, 'main.i18n.json');
  const upstream = fs.existsSync(upstreamMain) ? (readJson(upstreamMain).contents ?? {}) : {};
  const set = new Set();
  for (const [moduleId, keys] of Object.entries(metadata.core)) {
    if (IGNORED_MODULE.test(moduleId)) continue;
    for (const [key, english] of Object.entries(keys)) {
      if (english === '') continue;
      const translated = upstream[moduleId]?.[key];
      if (typeof translated === 'string' && translated !== '') continue;
      set.add(`${moduleId}\u0000${key}`);
    }
  }
  return set;
}

const reports = [];

for (const build of builds) {
  const outDir = p('dist', build.name);
  const manifest = readJson(path.join(outDir, 'package.json'));
  const localeIds = (build.locales ?? [build.locale]).filter(Boolean);
  const wanted = flags.locale ? localeIds.filter((id) => id === flags.locale) : localeIds;

  for (const localeId of wanted) {
    const localization = manifest.contributes.localizations.find((l) => l.languageId === localeId);
    if (!localization) {
      log.warn(`${build.name}: manifest has no localization for ${localeId}, skipping.`);
      continue;
    }

    const loaded = new Map();
    for (const entry of localization.translations) {
      const file = path.join(outDir, entry.path.replace(/^\.\//, ''));
      loaded.set(entry.id, readJson(file).contents ?? {});
    }

    // --- Core workbench -------------------------------------------------
    const coreContents = loaded.get(CORE_TRANSLATION_ID) ?? {};
    const cursorKeys = cursorCoreKeySet(localeId);
    let coreTotal = 0;
    let coreDone = 0;
    let cursorCoreTotal = 0;
    let cursorCoreDone = 0;
    const coreMissingModules = [];
    const untranslatedCore = [];

    for (const [moduleId, keys] of Object.entries(metadata.core)) {
      if (IGNORED_MODULE.test(moduleId)) continue;
      const translated = coreContents[moduleId] ?? {};
      const missing = [];
      for (const [key, english] of Object.entries(keys)) {
        if (english === '') continue;
        coreTotal++;
        const isCursorKey = cursorKeys.has(`${moduleId}\u0000${key}`);
        if (isCursorKey) cursorCoreTotal++;
        const value = translated[key];
        if (typeof value === 'string' && value !== '') {
          coreDone++;
          if (isCursorKey) cursorCoreDone++;
        } else {
          missing.push({ key, english, cursorSpecific: isCursorKey });
        }
      }
      if (missing.length) {
        coreMissingModules.push({ moduleId, missing: missing.length, total: Object.keys(keys).length });
        untranslatedCore.push({ moduleId, missing });
      }
    }

    // --- Built-in extensions -------------------------------------------
    const extensionRows = [];
    const untranslated = [];
    for (const [id, info] of Object.entries(metadata.extensions)) {
      const total = info.packageNlsKeyCount;
      if (total === 0) continue;
      const translated = loaded.get(id)?.package ?? {};
      const missingKeys = Object.keys(info.packageNls)
        .filter((k) => typeof translated[k] !== 'string' || translated[k] === '');
      const done = total - missingKeys.length;
      extensionRows.push({ id, total, done, percent: pct(done, total) });
      if (missingKeys.length) {
        untranslated.push({
          extensionId: id,
          missing: missingKeys.map((k) => ({ key: k, english: info.packageNls[k] }))
        });
      }
    }
    extensionRows.sort((a, b) => b.total - a.total);

    const targetId = config.target.cursorExtensionId;
    const target = targetId ? (extensionRows.find((r) => r.id === targetId) ?? null) : null;

    const report = {
      generatedAt: new Date().toISOString(),
      build: build.name,
      locale: localeId,
      mode: build.mode,
      cursorOnly: build.cursorOnly === true,
      selfContained: build.selfContained === true,
      against: {
        cursorVersion: metadata.cursorVersion,
        vscodeVersion: metadata.vscodeVersion,
        commit: metadata.commit
      },
      core: { total: coreTotal, translated: coreDone, percent: pct(coreDone, coreTotal) },
      cursorCore: { total: cursorCoreTotal, translated: cursorCoreDone, percent: pct(cursorCoreDone, cursorCoreTotal) },
      target,
      extensions: extensionRows,
      coreMissingModules: coreMissingModules.sort((a, b) => b.missing - a.missing),
      untranslated,
      untranslatedCore
    };
    reports.push(report);

    writeJson(p('reports', `coverage-${build.name}-${localeId}.json`), report);
  }
}

if (flags.json) {
  console.log(JSON.stringify(reports, null, 2));
  process.exit(0);
}

for (const r of reports) {
  // A Cursor-only pack deliberately ships no workbench baseline, so reporting 0% for
  // the core and for every other built-in extension would be noise.
  const cursorOnly = r.cursorOnly;

  log.step(`${r.build}  ${r.locale}   (Cursor ${r.against.cursorVersion} / Code OSS ${r.against.vscodeVersion})`);
  if (cursorOnly) {
    log.plain('  Cursor-only build: workbench strings come from the companion language pack');
  } else {
    log.plain(`  core workbench            ${String(r.core.translated).padStart(6)} / ${String(r.core.total).padEnd(6)} ${r.core.percent}%`);
    const fn = r.cursorCore.percent === 100 ? log.ok : log.warn;
    fn(`  cursor core (fork additions)${String(r.cursorCore.translated).padStart(6)} / ${String(r.cursorCore.total).padEnd(6)} ${r.cursorCore.percent}%   <- authored here`);
  }
  if (r.target) {
    const fn = r.target.percent === 100 ? log.ok : log.warn;
    fn(`  ${r.target.id.padEnd(24)} ${String(r.target.done).padStart(6)} / ${String(r.target.total).padEnd(6)} ${r.target.percent}%   <- primary target`);
  } else if (config.target.cursorExtensionId) {
    log.warn(`  ${config.target.cursorExtensionId} not present in this build`);
  }

  const others = cursorOnly
    ? []
    : r.extensions.filter((e) => e.id !== config.target.cursorExtensionId && e.percent < 100);
  if (others.length) {
    log.plain(`  built-in extensions below 100% (${others.length}):`);
    for (const e of others.slice(0, 15)) {
      log.plain(`    ${e.id.padEnd(40)} ${String(e.done).padStart(5)} / ${String(e.total).padEnd(5)} ${e.percent}%`);
    }
    if (others.length > 15) log.plain(`    ... ${others.length - 15} more, see the report`);
  }
  log.plain(`  report: reports/coverage-${r.build}-${r.locale}.json`);
}
