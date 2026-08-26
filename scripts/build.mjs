#!/usr/bin/env node
/**
 * Assembles the installable language packs into `dist/<name>/`, ready for
 * `npm run package`.
 *
 * Two shapes, selected by mode (see config.json):
 *   full       one extension declaring every enabled locale, self-contained
 *              (vscode-loc workbench baseline + Cursor translations). Owns the
 *              `vscode` translation id, so it replaces the official pack.
 *   companion  one extension per locale, only Cursor built-in extension ids,
 *              coexists with the official pack but cannot reach anything Cursor
 *              compiled into the Code OSS core. Disabled: those ids are almost empty.
 *
 * Inputs, in increasing precedence:
 *   1. upstream/<locale>/                       Code OSS baseline (full mode only)
 *   2. src/i18n/<locale>/overrides/*.i18n.json  hand fixes to that baseline
 *   3. src/i18n/<locale>/cursor/core.i18n.json    Cursor strings living in the core
 *   4. src/i18n/<locale>/cursor/*.i18n.json       Cursor built-in extension strings
 *
 * `metadata/cursor.json` (from `npm run extract`) is optional. When present, keys
 * that do not exist in the local Cursor build are dropped. When absent - as in CI -
 * filtering is skipped so the build still succeeds.
 *
 * Usage: npm run build [-- --locale=zh-cn] [--mode=full] [--no-filter] [--no-repair]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  p, readJson, writeJson, deepMerge, listFiles, rmrf, log, fail, parseArgs, loadConfig
} from './lib/util.mjs';
import { markerMismatches } from './lib/markers.mjs';

const I18N_VERSION = '1.0.0';
const CORE_TRANSLATION_ID = 'vscode';

/**
 * Cursor strings that live in the Code OSS core rather than in an extension go into
 * `core*.i18n.json` under `src/i18n/<locale>/cursor/`. Any number of files is allowed
 * so the ~1400 keys can be split by area (`core.cursor.i18n.json`,
 * `core.chat.i18n.json`, ...) instead of living in one unreviewable blob. Keeping
 * them apart from the inherited baseline is what lets `coverage` report what this
 * project actually authored.
 */
const isCursorCoreFile = (file) => /^core[.\-]/.test(path.basename(file)) || path.basename(file) === 'core.i18n.json';

const { flags } = parseArgs();
const config = loadConfig();

const metadataFile = p('metadata', 'cursor.json');
const metadata = fs.existsSync(metadataFile) ? readJson(metadataFile) : null;

const filterEnabled = (() => {
  if (flags.filter === false || flags['no-filter']) return false;
  if (!config.build.filterByCursorMetadata) return false;
  if (!metadata) {
    log.warn('metadata/cursor.json not found - key filtering disabled. Run `npm run extract` on a machine with Cursor installed for a leaner pack.');
    return false;
  }
  return true;
})();

/**
 * Marker repair needs the English source, which only metadata provides. It removes
 * inherited translations that would render broken placeholders or dead command
 * links - a real defect in the upstream baseline caused by version skew.
 */
const repairEnabled = (() => {
  if (flags.repair === false || flags['no-repair']) return false;
  if (config.build.repairMismatchedMarkers === false) return false;
  return Boolean(metadata);
})();

const locales = config.locales
  .filter((l) => l.enabled !== false)
  .filter((l) => (flags.locale ? l.id === flags.locale : true));
if (!locales.length) fail(`No enabled locale matched${flags.locale ? ` --locale=${flags.locale}` : ''}.`);

const modes = Object.entries(config.modes)
  .filter(([, m]) => m.enabled !== false)
  .filter(([id]) => (flags.mode ? id === flags.mode : true));
if (!modes.length) {
  if (flags.mode && flags.mode in config.modes) {
    fail(
      `Build mode "${flags.mode}" is disabled. Set modes.${flags.mode}.enabled to true in config.json.\n` +
      `  Available: ${Object.entries(config.modes).map(([id, m]) => `${id}${m.enabled === false ? ' (disabled)' : ''}`).join(', ')}`
    );
  }
  fail(
    `No enabled mode matched${flags.mode ? ` --mode=${flags.mode}` : ''}.\n` +
    `  Known modes: ${Object.keys(config.modes).join(', ')}`
  );
}

const template = fs.readFileSync(p('src', 'manifest.template.json'), 'utf8');

const isEmpty = (obj) => !obj || Object.keys(obj).length === 0;

/** Strip a `.i18n.json` filename down to its translation id. */
const translationIdFromFile = (file) => path.basename(file).replace(/\.i18n\.json$/, '');

function readContents(file) {
  const data = readJson(file);
  if (!data || typeof data !== 'object') fail(`Malformed translation file: ${file}`);
  const contents = data.contents ?? data;
  if (typeof contents !== 'object') fail(`Missing "contents" object in ${file}`);
  return contents;
}

/**
 * Keep only modules/keys that exist in the installed Cursor build, and - unless
 * disabled - drop translations whose structural markers no longer match the English
 * source. The latter is version skew between microsoft/vscode-loc and Cursor's older
 * Code OSS base: shipping those strings would render literal `{2}` placeholders or
 * dead command links. Dropping them falls back to English, which is correct.
 */
function filterCore(contents, ownedKeys) {
  const kept = {};
  const stats = { modulesDropped: 0, keysDropped: 0, keysKept: 0, mismatched: 0, mismatchedOwned: 0 };

  for (const [moduleId, entries] of Object.entries(contents)) {
    const known = metadata.core[moduleId];
    if (!known) {
      stats.modulesDropped++;
      stats.keysDropped += Object.keys(entries ?? {}).length;
      continue;
    }
    const bucket = {};
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (!(key in known)) {
        stats.keysDropped++;
        continue;
      }
      if (repairEnabled && markerMismatches(known[key], value).length) {
        if (ownedKeys.has(`${moduleId}\u0000${key}`)) {
          stats.mismatchedOwned++;
          log.warn(`marker mismatch in ${moduleId}: ${key}`);
        } else {
          stats.mismatched++;
          continue;
        }
      }
      bucket[key] = value;
      stats.keysKept++;
    }
    if (!isEmpty(bucket)) kept[moduleId] = bucket;
  }
  return { contents: kept, stats };
}

/**
 * Filter an extension bundle. `contents.package` maps to package.nls.json keys
 * and can be validated. `contents.bundle` holds runtime vscode.l10n strings,
 * whose keys are the English source strings; those are passed through untouched.
 */
function filterExtension(id, contents, ownedKeys) {
  const known = metadata.extensions[id];
  if (!known) return { contents: null, stats: { keysKept: 0, keysDropped: 0, mismatched: 0, mismatchedOwned: 0 } };

  const out = {};
  const stats = { keysKept: 0, keysDropped: 0, mismatched: 0, mismatchedOwned: 0 };

  for (const [section, entries] of Object.entries(contents)) {
    if (section !== 'package') {
      // `bundle` holds runtime vscode.l10n strings keyed by their English source;
      // there is no separate source list to validate them against.
      out[section] = entries;
      continue;
    }
    const bucket = {};
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (!(key in known.packageNls)) {
        stats.keysDropped++;
        continue;
      }
      if (repairEnabled && markerMismatches(known.packageNls[key], value).length) {
        if (ownedKeys.has(`${id}\u0000${key}`)) {
          stats.mismatchedOwned++;
          log.warn(`marker mismatch in ${id}: ${key}`);
        } else {
          stats.mismatched++;
          continue;
        }
      }
      bucket[key] = value;
      stats.keysKept++;
    }
    if (!isEmpty(bucket)) out.package = bucket;
  }
  return { contents: isEmpty(out) ? null : out, stats };
}

function renderManifest(vars) {
  const rendered = template.replace(/\$\{([A-Z_]+)\}/g, (match, key) => {
    if (!(key in vars)) fail(`Manifest template references unknown token \${${key}}`);
    // JSON.stringify then trim the quotes so quotes/backslashes stay escaped
    return JSON.stringify(String(vars[key])).slice(1, -1);
  });
  const manifest = JSON.parse(rendered);
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('$')) delete manifest[key];
  }
  if (!vars.ICON) delete manifest.icon;
  return manifest;
}

const upstreamInfoCache = new Map();
function upstreamInfo(localeId) {
  if (!upstreamInfoCache.has(localeId)) {
    upstreamInfoCache.set(localeId, readJson(p('upstream', localeId, '.sync-info.json'), null));
  }
  return upstreamInfoCache.get(localeId);
}

/**
 * Assemble every translation file for one locale and write it under `outDir`.
 * Returns the manifest `localizations` entry plus the stats the summary reports.
 */
function buildLocale(locale, mode, outDir, { subdir }) {
  const includeUpstream = mode.includeUpstream && Boolean(locale.upstreamPackDir);
  if (mode.includeUpstream && !locale.upstreamPackDir) {
    log.warn(`${locale.id}: no upstreamPackDir, building without a workbench baseline (the editor stays English for this language).`);
  }

  /** @type {Record<string, object>} translation id -> contents */
  const bundles = {};
  let core = {};

  // Keys this repository maintains, as `<scope>\0<key>`. Marker problems in these
  // are our bugs and must be reported rather than silently dropped.
  const ownedCoreKeys = new Set();
  const ownedExtKeys = new Set();
  const recordOwnedCore = (contents) => {
    for (const [moduleId, entries] of Object.entries(contents)) {
      for (const key of Object.keys(entries ?? {})) ownedCoreKeys.add(`${moduleId}\u0000${key}`);
    }
  };
  const recordOwnedExt = (id, contents) => {
    for (const key of Object.keys(contents.package ?? {})) ownedExtKeys.add(`${id}\u0000${key}`);
  };

  if (includeUpstream) {
    const upstreamDir = p('upstream', locale.id);
    const mainFile = path.join(upstreamDir, 'main.i18n.json');
    if (!fs.existsSync(mainFile)) {
      fail(
        `${locale.id}: upstream baseline missing (${path.relative(p('.'), mainFile)}).\n` +
        `  Run: npm run sync -- --locale=${locale.id}`
      );
    }
    core = readContents(mainFile);
    const extFiles = listFiles(path.join(upstreamDir, 'extensions'), '.i18n.json');
    for (const file of extFiles) {
      bundles[translationIdFromFile(file)] = readContents(file);
    }
    log.info(`${locale.id}: upstream baseline, core + ${extFiles.length} extension bundle(s)`);
  }

  // Hand-written corrections to the upstream core baseline.
  const overrideMain = p('src', 'i18n', locale.id, 'overrides', 'main.i18n.json');
  if (fs.existsSync(overrideMain)) {
    const contents = readContents(overrideMain);
    if (!isEmpty(contents)) {
      core = deepMerge(core, contents);
      recordOwnedCore(contents);
      log.info(`${locale.id}: applied overrides/main.i18n.json`);
    }
  }
  for (const file of listFiles(p('src', 'i18n', locale.id, 'overrides'), '.i18n.json')) {
    const id = translationIdFromFile(file);
    if (id === 'main') continue;
    const contents = readContents(file);
    bundles[id] = deepMerge(bundles[id] ?? {}, contents);
    recordOwnedExt(id, contents);
  }

  // Cursor specific translations - the reason this project exists.
  const cursorDir = p('src', 'i18n', locale.id, 'cursor');
  const cursorFiles = listFiles(cursorDir, '.i18n.json');
  if (!cursorFiles.length) {
    log.warn(`${locale.id}: no files in src/i18n/${locale.id}/cursor/ - nothing Cursor specific will be translated.`);
  }
  let cursorCoreKeyCount = 0;
  for (const file of cursorFiles) {
    const contents = readContents(file);
    if (isCursorCoreFile(file)) {
      // Cursor compiled its own UI into the Code OSS core, so these belong to the
      // `vscode` translation id alongside the inherited baseline.
      if (mode.cursorOnly) {
        log.warn(`${locale.id}: mode is cursorOnly, skipping ${path.basename(file)} (${Object.keys(contents).length} module(s)) - core strings need the \`vscode\` id, which this mode deliberately does not claim.`);
        continue;
      }
      core = deepMerge(core, contents);
      recordOwnedCore(contents);
      let n = 0;
      for (const entries of Object.values(contents)) n += Object.keys(entries ?? {}).length;
      cursorCoreKeyCount += n;
      log.info(`${locale.id}: cursor core translations from ${path.basename(file)}, ${n} key(s) in ${Object.keys(contents).length} module(s)`);
      continue;
    }
    const id = translationIdFromFile(file);
    bundles[id] = deepMerge(bundles[id] ?? {}, contents);
    recordOwnedExt(id, contents);
    log.info(`${locale.id}: cursor translations, ${id}`);
  }

  // Filtering against the installed build.
  let repaired = 0;
  if (filterEnabled && !isEmpty(core)) {
    const result = filterCore(core, ownedCoreKeys);
    core = result.contents;
    repaired += result.stats.mismatched;
    log.info(`${locale.id}: core filter kept ${result.stats.keysKept}, dropped ${result.stats.keysDropped} unknown key(s) and ${result.stats.modulesDropped} unknown module(s)`);
    if (result.stats.mismatched) {
      log.info(`${locale.id}: core repair dropped ${result.stats.mismatched} upstream string(s) whose placeholders/links no longer match the source`);
    }
  }

  const prefix = subdir ? `translations/${subdir}` : 'translations';
  const translations = [];

  if (!isEmpty(core)) {
    const rel = `${prefix}/main.i18n.json`;
    writeJson(path.join(outDir, rel), { version: I18N_VERSION, contents: core }, { pretty: config.build.prettyJson });
    translations.push({ id: CORE_TRANSLATION_ID, path: `./${rel}` });
  }

  let extKept = 0;
  let extDropped = 0;
  for (const id of Object.keys(bundles).sort()) {
    let contents = bundles[id];
    if (filterEnabled) {
      const result = filterExtension(id, contents, ownedExtKeys);
      repaired += result.stats.mismatched;
      if (!result.contents) {
        extDropped++;
        continue;
      }
      contents = result.contents;
    }
    if (config.build.dropEmptyBundles && isEmpty(contents)) {
      extDropped++;
      continue;
    }
    const rel = `${prefix}/extensions/${id}.i18n.json`;
    writeJson(path.join(outDir, rel), { version: I18N_VERSION, contents }, { pretty: config.build.prettyJson });
    translations.push({ id, path: `./${rel}` });
    extKept++;
  }

  if (!translations.length) {
    fail(`${locale.id}: nothing to ship. Check src/i18n/${locale.id}/ and, for a baseline, run npm run sync.`);
  }

  const bytes = translations.reduce(
    (n, t) => n + fs.statSync(path.join(outDir, t.path.replace(/^\.\//, ''))).size,
    0
  );

  return {
    localization: {
      languageId: locale.id,
      languageName: locale.languageName,
      localizedLanguageName: locale.localizedLanguageName,
      translations
    },
    stats: {
      locale: locale.id,
      translationFiles: translations.length,
      extensionBundlesKept: extKept,
      extensionBundlesDropped: extDropped,
      coreIncluded: !isEmpty(core),
      upstreamBaseline: includeUpstream,
      cursorCoreKeys: cursorCoreKeyCount,
      repairedStrings: repaired,
      bytes
    }
  };
}

/**
 * The thin runtime. A language pack works without any code; this exists only so the
 * user can pick a language from a setting instead of hunting for "Configure Display
 * Language", and so a conflicting official pack gets flagged. `runtime: false` on a
 * mode produces a strictly code-free pack.
 */
function writeRuntime(outDir, manifest, localeList) {
  // `.cjs` in the repo because package.json declares "type": "module"; inside the .vsix
  // it lands as extension.js next to a manifest with no "type", so it stays CommonJS.
  const source = p('src', 'extension', 'main.cjs');
  if (!fs.existsSync(source)) fail(`Runtime source missing: ${path.relative(p('.'), source)}`);
  fs.copyFileSync(source, path.join(outDir, 'extension.js'));

  manifest.main = './extension.js';
  // Nothing here is needed before the workbench is up, and nothing should slow startup.
  manifest.activationEvents = ['onStartupFinished'];

  manifest.contributes.commands = [
    {
      command: 'cursorLanguagePack.selectLanguage',
      title: 'Select Display Language',
      category: 'Language Pack'
    },
    {
      command: 'cursorLanguagePack.openSettings',
      title: 'Open Language Pack Settings',
      category: 'Language Pack'
    }
  ];

  manifest.contributes.configuration = {
    title: manifest.displayName,
    properties: {
      'cursorLanguagePack.language': {
        type: 'string',
        enum: ['auto', ...localeList.map((l) => l.id), 'en'],
        enumDescriptions: [
          'Follow the editor. The display language stays whatever argv.json says; this extension only offers to change it once.',
          ...localeList.map((l) => `${l.localizedLanguageName} (${l.languageName}) — workbench and Cursor UI. Pack stays installed.`),
          'English (built-in). Workbench and Cursor UI all return to English. The pack stays installed — switch back anytime without reinstalling.'
        ],
        default: 'auto',
        markdownDescription:
          'Display language for the Cursor interface (editor chrome **and** Cursor-authored workbench strings).\n\n' +
          'Changing this writes only the `locale` field of `argv.json` and offers to restart. ' +
          'It does **not** uninstall the extension — translations stay on disk, so you can switch ' +
          'Chinese ↔ English repeatedly without reinstalling.\n\n' +
          'To remove the pack entirely: uninstall the extension, then set this to `en` (or delete ' +
          '`locale` in `argv.json`) and restart.',
        scope: 'application'
      }
    }
  };

  // Runtime messages of the runtime itself, keyed by their English source.
  const bundles = [];
  for (const locale of localeList) {
    const file = p('src', 'i18n', locale.id, 'extension.l10n.json');
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    const contents = Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith('$'))
    );
    if (isEmpty(contents)) continue;
    writeJson(path.join(outDir, 'l10n', `bundle.l10n.${locale.id}.json`), contents, { pretty: true });
    bundles.push(locale.id);
  }
  if (bundles.length) manifest.l10n = './l10n';
  return bundles;
}

function writePackFiles(outDir, localeIds) {
  // Files the marketplace and the license require inside the .vsix. A locale
  // specific marketplace page only makes sense for a single locale pack.
  const candidates = [];
  if (localeIds.length === 1) candidates.push(p('src', 'marketplace', `README.${localeIds[0]}.md`));
  candidates.push(p('src', 'marketplace', 'README.md'));
  const readmeSource = candidates.find((f) => fs.existsSync(f));
  if (readmeSource) {
    let readme = fs.readFileSync(readmeSource, 'utf8');
    // Marketplace README may use ../../media/... for GitHub; inside the .vsix the file
    // sits next to media/, so normalize the path for the packaged page.
    readme = readme.replace(/\]\(\.\.\/\.\.\/media\//g, '](media/');
    readme = readme.replace(/src="\.\.\/\.\.\/media\//g, 'src="media/');
    fs.writeFileSync(path.join(outDir, 'README.md'), readme);
  } else {
    log.warn('no marketplace README found under src/marketplace/ - the extension page will be empty.');
  }
  for (const file of ['LICENSE', 'NOTICE']) {
    if (fs.existsSync(p(file))) fs.copyFileSync(p(file), path.join(outDir, file));
  }

  // Extension marketplace icon (config.icon is relative to the packaged root).
  if (config.icon) {
    const iconSrc = p(config.icon);
    if (!fs.existsSync(iconSrc)) {
      fail(`config.icon points to a missing file: ${config.icon}`);
    }
    const iconDest = path.join(outDir, config.icon);
    fs.mkdirSync(path.dirname(iconDest), { recursive: true });
    fs.copyFileSync(iconSrc, iconDest);
  }

  // Everything in this directory is generated and meant to ship; the file only
  // exists so vsce does not warn about a missing ignore list.
  fs.writeFileSync(
    path.join(outDir, '.vscodeignore'),
    '# Generated by scripts/build.mjs - every remaining file belongs in the package.\n' +
    '.vscodeignore\n**/.DS_Store\n**/Thumbs.db\n',
    'utf8'
  );
}

const summaries = [];

for (const [modeId, mode] of modes) {
  // `perLocale: false` puts every locale in one extension and lets the host pick
  // by display language; `true` reproduces the one-extension-per-language shape.
  const groups = mode.perLocale === false
    ? [{ localeList: locales, suffix: '' }]
    : locales.map((l) => ({ localeList: [l], suffix: `-${l.id}` }));

  for (const group of groups) {
    const name = `${config.namePrefix}${group.suffix}${mode.nameSuffix ?? ''}`;
    const outDir = p('dist', name);
    log.step(`Building ${name}  (mode=${modeId}, locales=${group.localeList.map((l) => l.id).join(', ')})`);
    rmrf(outDir);

    const localizations = [];
    const localeStats = [];
    for (const locale of group.localeList) {
      const result = buildLocale(locale, mode, outDir, {
        subdir: group.localeList.length > 1 ? locale.id : null
      });
      localizations.push(result.localization);
      localeStats.push(result.stats);
    }

    const single = group.localeList.length === 1 ? group.localeList[0] : null;
    const languageList = group.localeList.map((l) => l.localizedLanguageName).join(' · ');

    const displayName = single
      ? `${single.displayName ?? `Cursor ${single.languageName} (${single.localizedLanguageName}) Language Pack`}${mode.displayNameSuffix ?? ''}`
      : `${config.pack?.displayName ?? 'Cursor Language Pack'}${mode.displayNameSuffix ?? ''}`;

    const description = single && mode.cursorOnly && single.description
      ? single.description
      : `${config.pack?.description ?? 'Language pack for Cursor IDE.'} Included: ${languageList}.`;

    const manifest = renderManifest({
      NAME: name,
      DISPLAY_NAME: displayName,
      DESCRIPTION: description,
      VERSION: config.version,
      PUBLISHER: config.publisher,
      LICENSE: config.license,
      ICON: config.icon ?? '',
      ENGINE_VSCODE: config.engines.vscode,
      REPOSITORY: config.repository,
      HOMEPAGE: config.homepage,
      BUGS_URL: config.bugs
    });
    manifest.contributes.localizations = localizations;
    manifest.keywords = [...new Set([...manifest.keywords, ...group.localeList.map((l) => l.id)])];

    // Optionally pull the companion workbench pack in automatically. Off by default:
    // it hard-couples the two extensions and fails when the companion is missing from
    // the target registry.
    if (mode.requireCompanion) {
      const companions = [...new Set(group.localeList.map((l) => l.companionExtension).filter(Boolean))];
      if (companions.length) {
        manifest.extensionDependencies = companions;
        log.info(`declared dependency on ${companions.join(', ')}`);
      }
    }

    manifest.cursorLanguagePack = {
      mode: modeId,
      cursorOnly: mode.cursorOnly === true,
      selfContained: mode.includeUpstream === true,
      locales: group.localeList.map((l) => l.id),
      companionExtensions: mode.cursorOnly
        ? group.localeList.map((l) => l.companionExtension ?? null)
        : null,
      targetExtension: config.target.cursorExtensionId,
      verifiedCursorVersions: config.target.verifiedCursorVersions,
      builtAgainst: metadata
        ? { cursorVersion: metadata.cursorVersion, vscodeVersion: metadata.vscodeVersion, commit: metadata.commit }
        : null,
      upstream: mode.includeUpstream
        ? Object.fromEntries(group.localeList.map((l) => [
          l.id,
          upstreamInfo(l.id) ?? (l.upstreamPackDir ? { repo: config.upstream.repo, ref: config.upstream.ref } : null)
        ]))
        : null
    };

    const runtimeBundles = mode.runtime === false ? null : writeRuntime(outDir, manifest, group.localeList);
    if (runtimeBundles) {
      log.info(`runtime: language picker + conflict check${runtimeBundles.length ? `, l10n for ${runtimeBundles.join(', ')}` : ''}`);
    }
    manifest.cursorLanguagePack.runtime = mode.runtime !== false;

    writeJson(path.join(outDir, 'package.json'), manifest);
    writePackFiles(outDir, group.localeList.map((l) => l.id));

    const bytes = localeStats.reduce((n, s) => n + s.bytes, 0);
    const files = localeStats.reduce((n, s) => n + s.translationFiles, 0);
    log.ok(`${name}: ${files} translation file(s), ${(bytes / 1024).toFixed(0)} KiB -> dist/${name}/`);

    summaries.push({
      name,
      mode: modeId,
      cursorOnly: mode.cursorOnly === true,
      selfContained: mode.includeUpstream === true,
      perLocale: mode.perLocale !== false,
      locales: group.localeList.map((l) => l.id),
      // Kept for tooling that assumed one locale per build.
      locale: single ? single.id : null,
      translationFiles: files,
      repairedStrings: localeStats.reduce((n, s) => n + s.repairedStrings, 0),
      cursorCoreKeys: localeStats.reduce((n, s) => n + s.cursorCoreKeys, 0),
      bytes,
      byLocale: localeStats
    });
  }
}

writeJson(p('dist', 'build-summary.json'), {
  generatedAt: new Date().toISOString(),
  version: config.version,
  filterEnabled,
  repairEnabled,
  builtAgainst: metadata
    ? { cursorVersion: metadata.cursorVersion, vscodeVersion: metadata.vscodeVersion, commit: metadata.commit }
    : null,
  builds: summaries
});

log.step('Done');
log.plain(`  ${summaries.length} pack(s) in dist/. Next: npm run validate, npm run coverage, npm run package.`);
