#!/usr/bin/env node
/**
 * Lists the Code OSS core strings that the upstream baseline does not cover.
 *
 * Cursor is a fork: it added whole modules to the workbench (the session shell, the
 * Settings panel, the spec toolbar, supervised diff, the welcome carousel) and
 * rewrote others (most of the chat contrib). Those keys exist in the installed
 * build but not in microsoft/vscode-loc, so nothing translates them unless this
 * repository does. This script turns that difference into a work list.
 *
 * A module counted here is "Cursor specific" in the only sense that matters for
 * translation: no upstream translation exists for it. Some entries are simply
 * newer than the vscode-loc snapshot rather than Cursor inventions; both need the
 * same treatment.
 *
 * Requires `metadata/cursor.json` (npm run extract) and, for the comparison,
 * `upstream/<locale>/main.i18n.json` (npm run sync).
 *
 * Usage: npm run gap [-- --locale=zh-cn] [--module=<substring>] [--limit=n]
 *                    [--skeleton=<file>]
 *   --skeleton  write a core.i18n.json shaped file whose values are still the
 *               English source, as a starting point for a translator. Never write
 *               it straight to src/: untranslated English there would be shipped
 *               as if it were a translation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, writeJson, log, fail, parseArgs, loadConfig } from './lib/util.mjs';

const { flags } = parseArgs();
const config = loadConfig();

const metadataFile = p('metadata', 'cursor.json');
if (!fs.existsSync(metadataFile)) {
  fail('metadata/cursor.json not found. Run `npm run extract` on a machine with Cursor installed.');
}
const metadata = readJson(metadataFile);

const locales = config.locales
  .filter((l) => l.enabled !== false)
  .filter((l) => (flags.locale ? l.id === flags.locale : true));
if (!locales.length) fail(`No enabled locale matched${flags.locale ? ` --locale=${flags.locale}` : ''}.`);

const moduleFilter = typeof flags.module === 'string' ? flags.module : null;
const limit = Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : 40;

/**
 * Test fixtures are compiled into nls.messages.json but never rendered. Counting
 * "Test View 1" as translatable would only inflate the denominator.
 */
const IGNORED_MODULE = /(^|\/)test(s)?\//;

for (const locale of locales) {
  const upstreamMain = p('upstream', locale.id, 'main.i18n.json');
  const upstream = fs.existsSync(upstreamMain) ? (readJson(upstreamMain).contents ?? {}) : null;
  if (!upstream) {
    log.warn(`${locale.id}: no upstream baseline (run npm run sync). Treating every core key as uncovered.`);
  }

  // Core translations this repository authored, split across core*.i18n.json.
  const cursorDir = p('src', 'i18n', locale.id, 'cursor');
  const own = {};
  if (fs.existsSync(cursorDir)) {
    for (const name of fs.readdirSync(cursorDir).filter((f) => /^core[.\-].*\.i18n\.json$/.test(f) || f === 'core.i18n.json')) {
      const contents = readJson(path.join(cursorDir, name)).contents ?? {};
      for (const [moduleId, entries] of Object.entries(contents)) {
        own[moduleId] = { ...(own[moduleId] ?? {}), ...entries };
      }
    }
  }

  const modules = [];
  let coreTotal = 0;
  let uncovered = 0;
  let done = 0;
  const skipped = { modules: 0, emptySource: 0 };

  for (const [moduleId, keys] of Object.entries(metadata.core)) {
    if (moduleFilter && !moduleId.includes(moduleFilter)) continue;
    // Test fixtures ship in the bundle but are never rendered; translating "Test View 1"
    // would only inflate the denominator.
    if (IGNORED_MODULE.test(moduleId)) { skipped.modules++; continue; }
    const fromUpstream = upstream?.[moduleId] ?? {};
    const fromUs = own[moduleId] ?? {};
    const entries = Object.entries(keys);
    coreTotal += entries.length;

    const missing = [];
    let translatedHere = 0;
    for (const [key, english] of entries) {
      if (typeof fromUpstream[key] === 'string' && fromUpstream[key] !== '') continue;
      // A few color registrations carry an empty description. There is nothing to
      // translate, and the host rejects empty values.
      if (english === '') { skipped.emptySource++; continue; }
      uncovered++;
      if (typeof fromUs[key] === 'string' && fromUs[key] !== '') {
        translatedHere++;
        done++;
        continue;
      }
      missing.push({ key, english });
    }
    if (missing.length || translatedHere) {
      modules.push({
        moduleId,
        moduleAbsentUpstream: !(moduleId in (upstream ?? {})),
        keys: entries.length,
        uncovered: missing.length + translatedHere,
        translated: translatedHere,
        missing
      });
    }
  }

  modules.sort((a, b) => b.missing.length - a.missing.length || a.moduleId.localeCompare(b.moduleId));

  const report = {
    generatedAt: new Date().toISOString(),
    locale: locale.id,
    against: {
      cursorVersion: metadata.cursorVersion,
      vscodeVersion: metadata.vscodeVersion,
      upstreamBaseline: upstream ? path.relative(p('.'), upstreamMain) : null
    },
    coreKeys: coreTotal,
    skipped,
    uncoveredByUpstream: uncovered,
    translatedHere: done,
    stillMissing: uncovered - done,
    percent: uncovered === 0 ? 100 : Math.round((done / uncovered) * 1000) / 10,
    modules
  };
  writeJson(p('reports', `cursor-core-gap-${locale.id}.json`), report);

  if (typeof flags.skeleton === 'string') {
    const skeleton = {};
    for (const m of modules) {
      if (!m.missing.length) continue;
      skeleton[m.moduleId] = Object.fromEntries(m.missing.map((x) => [x.key, x.english]));
    }
    const target = path.isAbsolute(flags.skeleton) ? flags.skeleton : p(flags.skeleton);
    writeJson(target, { version: '1.0.0', contents: skeleton });
    log.ok(`${locale.id}: skeleton with ${uncovered - done} untranslated key(s) -> ${path.relative(p('.'), target)}`);
    continue;
  }

  log.step(`${locale.id}   core strings not covered by ${config.upstream.repo}`);
  log.plain(`  core keys in Cursor ${metadata.cursorVersion}        ${coreTotal}`);
  log.plain(`  uncovered by the upstream baseline   ${uncovered}`);
  log.plain(`  translated in src/i18n/${locale.id}/cursor/  ${done}  (${report.percent}%)`);
  log.plain(`  still missing                        ${uncovered - done}`);
  log.plain(`  skipped                              ${skipped.modules} test module(s), ${skipped.emptySource} key(s) with an empty English source`);
  const shown = modules.filter((m) => m.missing.length).slice(0, limit);
  if (shown.length) {
    log.plain('\n  missing, largest modules first:');
    for (const m of shown) {
      log.plain(`    ${String(m.missing.length).padStart(4)}  ${m.moduleId}${m.moduleAbsentUpstream ? '' : '  (partial)'}`);
    }
    const rest = modules.filter((m) => m.missing.length).length - shown.length;
    if (rest > 0) log.plain(`    ... ${rest} more module(s)`);
  }
  log.plain(`\n  report: reports/cursor-core-gap-${locale.id}.json`);
}
