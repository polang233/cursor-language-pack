#!/usr/bin/env node
/**
 * Validates the packs in `dist/` before they are published.
 *
 * Structural checks always run. When `metadata/cursor.json` is present the English
 * source is compared against every translated string, so placeholders, icon
 * references and command links cannot silently drift - those are the mistakes that
 * break the UI at runtime rather than merely reading badly.
 *
 * Usage: node scripts/validate-dist.mjs [--strict]
 * Exit code 1 on any error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { p, readJson, log, parseArgs, loadConfig } from './lib/util.mjs';
import { markerMismatches } from './lib/markers.mjs';

const UNRESOLVED_TOKEN = /\$\{[A-Z_]+\}/;
const CORE_TRANSLATION_ID = 'vscode';

const { flags } = parseArgs();
const config = loadConfig();

const errors = [];
const warnings = [];
const error = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const summaryFile = p('dist', 'build-summary.json');
if (!fs.existsSync(summaryFile)) {
  log.err('dist/build-summary.json not found. Run `npm run build` first.');
  process.exit(1);
}
const summary = readJson(summaryFile);
const repairWasEnabled = summary.repairEnabled === true;

const metadataFile = p('metadata', 'cursor.json');
const metadata = fs.existsSync(metadataFile) ? readJson(metadataFile) : null;
if (!metadata) {
  log.warn('metadata/cursor.json absent - source comparison checks are skipped (structural checks still run).');
}

if (String(config.publisher).startsWith('CHANGE-ME')) {
  (flags.strict ? error : warn)('config.json publisher is still a placeholder.');
}
for (const [key, value] of Object.entries({ repository: config.repository, homepage: config.homepage, bugs: config.bugs })) {
  if (typeof value === 'string' && value.includes('CHANGE-ME')) {
    (flags.strict ? error : warn)(`config.json ${key} still contains a CHANGE-ME placeholder.`);
  }
}

for (const build of summary.builds) {
  const outDir = p('dist', build.name);
  const scope = build.name;

  const manifestFile = path.join(outDir, 'package.json');
  if (!fs.existsSync(manifestFile)) {
    error(`${scope}: package.json missing`);
    continue;
  }
  const manifest = readJson(manifestFile);

  // --- manifest shape --------------------------------------------------
  for (const field of ['name', 'displayName', 'description', 'version', 'publisher', 'engines']) {
    if (!manifest[field]) error(`${scope}: manifest is missing "${field}"`);
  }
  if (UNRESOLVED_TOKEN.test(JSON.stringify(manifest))) {
    error(`${scope}: manifest still contains an unresolved \${TOKEN} from the template`);
  }
  if (!manifest.categories?.includes('Language Packs')) {
    error(`${scope}: categories must include "Language Packs" or the host will not treat it as a language pack`);
  }

  const localizations = manifest.contributes?.localizations;
  if (!Array.isArray(localizations) || localizations.length === 0) {
    error(`${scope}: contributes.localizations must declare at least one entry`);
    continue;
  }
  const expectedLocales = build.locales ?? (build.locale ? [build.locale] : []);
  const declared = localizations.map((l) => l.languageId);
  for (const locale of expectedLocales) {
    if (!declared.includes(locale)) {
      error(`${scope}: build reports locale "${locale}" but the manifest does not declare it`);
    }
  }
  for (const extra of declared.filter((id) => !expectedLocales.includes(id))) {
    error(`${scope}: manifest declares languageId "${extra}" which the build did not produce`);
  }
  if (new Set(declared).size !== declared.length) {
    error(`${scope}: contributes.localizations declares the same languageId twice; the host keeps only one`);
  }

  // --- files they point at ---------------------------------------------
  const referenced = new Set();
  let stringCount = 0;
  let bundleCount = 0;

  for (const localization of localizations) {
    for (const field of ['languageId', 'languageName', 'localizedLanguageName']) {
      if (!localization[field]) error(`${scope}: localization ${localization.languageId ?? '?'} is missing "${field}"`);
    }
    if (!Array.isArray(localization.translations) || localization.translations.length === 0) {
      error(`${scope}: localization ${localization.languageId} declares no translations`);
      continue;
    }
    bundleCount += localization.translations.length;

    const seenIds = new Set();
    for (const entry of localization.translations) {
      const label = `${scope} [${localization.languageId}]`;
      if (!entry.id || !entry.path) {
        error(`${label}: malformed translations entry ${JSON.stringify(entry)}`);
        continue;
      }
      if (seenIds.has(entry.id)) {
        error(`${label}: translation id "${entry.id}" declared twice`);
      }
      seenIds.add(entry.id);

      const relative = entry.path.replace(/^\.\//, '');
      if (!entry.path.startsWith('./')) {
        error(`${label}: translation path "${entry.path}" should be relative and start with ./`);
      }
      const file = path.join(outDir, relative);
      if (!fs.existsSync(file)) {
        error(`${label}: ${entry.id} -> ${entry.path} does not exist`);
        continue;
      }
      referenced.add(path.resolve(file));

      let data;
      try {
        data = readJson(file);
      } catch (err) {
        error(`${label}: ${entry.path} is not valid JSON - ${err.message}`);
        continue;
      }
      if (!data.contents || typeof data.contents !== 'object') {
        error(`${label}: ${entry.path} has no "contents" object`);
        continue;
      }

      // Every value must be a non-empty string; nested one level (module -> key).
      for (const [section, bucket] of Object.entries(data.contents)) {
        if (bucket === null || typeof bucket !== 'object') {
          error(`${label}: ${entry.path} section "${section}" is not an object`);
          continue;
        }
        for (const [key, value] of Object.entries(bucket)) {
          stringCount++;
          if (typeof value !== 'string') {
            error(`${label}: ${entry.id} ${section}.${key} is ${typeof value}, expected string`);
          } else if (value.trim() === '') {
            error(`${label}: ${entry.id} ${section}.${key} is empty`);
          }
        }
      }

      // --- compare against the English source --------------------------
      if (!metadata) continue;

      if (entry.id === CORE_TRANSLATION_ID) {
        for (const [moduleId, bucket] of Object.entries(data.contents)) {
          const source = metadata.core[moduleId];
          if (!source) continue;
          for (const [key, value] of Object.entries(bucket)) {
            compare(label, `${moduleId}/${key}`, source[key], value);
          }
        }
      } else {
        const source = metadata.extensions[entry.id]?.packageNls;
        if (!source) continue;
        for (const [key, value] of Object.entries(data.contents.package ?? {})) {
          compare(label, `${entry.id}/${key}`, source[key], value);
        }
      }
    }
  }

  // --- stray files ------------------------------------------------------
  const translationsDir = path.join(outDir, 'translations');
  if (fs.existsSync(translationsDir)) {
    for (const file of walk(translationsDir)) {
      if (!referenced.has(path.resolve(file))) {
        warn(`${scope}: ${path.relative(outDir, file)} is shipped but not referenced by the manifest`);
      }
    }
  }

  // --- the optional runtime ---------------------------------------------
  if (manifest.main) {
    const entry = path.join(outDir, manifest.main.replace(/^\.\//, ''));
    if (!fs.existsSync(entry)) error(`${scope}: main points at ${manifest.main}, which does not exist`);
    if (!Array.isArray(manifest.activationEvents) || !manifest.activationEvents.length) {
      error(`${scope}: an extension with code must declare activationEvents`);
    }
    const declaredIds = manifest.contributes?.localizations?.map((l) => l.languageId) ?? [];
    const setting = manifest.contributes?.configuration?.properties?.['cursorLanguagePack.language'];
    if (!setting) {
      error(`${scope}: the runtime is shipped but cursorLanguagePack.language is not contributed`);
    } else {
      for (const locale of declaredIds) {
        if (!setting.enum.includes(locale)) {
          error(`${scope}: cursorLanguagePack.language does not offer "${locale}", which the pack ships`);
        }
      }
      if (setting.enum.length !== setting.enumDescriptions?.length) {
        error(`${scope}: cursorLanguagePack.language has ${setting.enum.length} values but ${setting.enumDescriptions?.length ?? 0} descriptions`);
      }
    }
    if (manifest.l10n) {
      const dir = path.join(outDir, manifest.l10n.replace(/^\.\//, ''));
      if (!fs.existsSync(dir)) {
        error(`${scope}: l10n points at ${manifest.l10n}, which does not exist`);
      } else {
        for (const file of fs.readdirSync(dir)) {
          const data = readJson(path.join(dir, file), null);
          if (!data || typeof data !== 'object' || !Object.keys(data).length) {
            error(`${scope}: l10n/${file} is empty or malformed`);
          }
        }
      }
    }
  } else if (manifest.contributes?.configuration) {
    error(`${scope}: contributes.configuration without code - the setting would do nothing`);
  }

  for (const required of ['README.md', 'LICENSE', 'NOTICE']) {
    if (!fs.existsSync(path.join(outDir, required))) {
      (required === 'README.md' ? warn : error)(`${scope}: ${required} is missing from the package`);
    }
  }

  log.ok(`${scope}: ${localizations.length} locale(s), ${bundleCount} bundle(s), ${stringCount} string(s)`);
}

/**
 * Compare structural markers between the English source and a translation.
 *
 * When the build ran with marker repair enabled, anything still mismatched here got
 * past the repair pass on purpose - it belongs to a file this repository maintains -
 * so it is an error. Without repair (`--no-filter`, or a CI build with no metadata)
 * inherited drift is expected and only warned about.
 */
function compare(scope, label, source, translated) {
  if (typeof source !== 'string') return;

  const mismatches = markerMismatches(source, translated);
  if (mismatches.length) {
    const detail = `${scope}: ${label} ${mismatches.join(' + ')} mismatch\n    en: ${source}\n    tr: ${translated}`;
    (repairWasEnabled ? error : warn)(detail);
  }

  const sourceNewlines = (source.match(/\n/g) ?? []).length;
  const translatedNewlines = (translated.match(/\n/g) ?? []).length;
  if (sourceNewlines !== translatedNewlines) {
    warn(`${scope}: ${label} newline count differs (${sourceNewlines} vs ${translatedNewlines})`);
  }
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (warnings.length) {
  log.step(`Warnings (${warnings.length})`);
  for (const message of warnings) log.warn(`  ${message}`);
}

if (errors.length) {
  log.step(`Errors (${errors.length})`);
  for (const message of errors) log.err(`  ${message}`);
  process.exit(1);
}

log.step('Validation passed');
log.plain(`  ${summary.builds.length} pack(s) checked${metadata ? ' against the installed Cursor build' : ' (structural only)'}`);
