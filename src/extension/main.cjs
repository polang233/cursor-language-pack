/**
 * The language pack's runtime. A language pack does not need code - the translations
 * work without it - so everything here exists only to close two gaps the host leaves:
 *
 *   1. Picking a language. Cursor inherits Code OSS's "Configure Display Language"
 *      command, which most people never find, and the host only offers to switch
 *      automatically when the pack matches the OS locale. This adds a setting and a
 *      command that write `locale` into argv.json for you. Switching to English (or
 *      back to a bundled language) only changes which translations the host loads —
 *      the pack stays installed; no reinstall is needed to switch again.
 *   2. Warning about a conflicting pack. This pack claims the `vscode` translation id.
 *      So does an official VS Code language pack. `languagepacks.json` maps one id to
 *      one file, assigned by whichever extension is scanned last, so having both
 *      installed produces a partly translated UI that can change between restarts.
 *      Uninstall does not auto-clear argv.json; set locale to `en` (or delete the
 *      field) when fully removing the pack.
 *
 * Exactly what it touches, and nothing else:
 *   - reads  <appRoot>/product.json       to learn the user data folder name
 *   - reads  ~/<dataFolder>/argv.json     the current display language
 *   - writes ~/<dataFolder>/argv.json     only the `locale` field, only after you
 *                                         confirm, preserving comments and formatting
 *   - reads  the manifests of installed extensions, to spot a conflicting pack
 *   - stores two "do not ask again" flags in this extension's own global state
 *
 * No network access, no telemetry, no other files, no changes to your settings.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const SECTION = 'cursorLanguagePack';
const AUTO = 'auto';
const DISMISS_LANGUAGE_PROMPT = 'dismissedLanguagePrompt';
const DISMISS_CONFLICT_WARNING = 'dismissedConflictWarning';

const t = vscode.l10n?.t ?? ((message, ...args) =>
  message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? `{${i}}`)));

/** @returns {{id: string, label: string}[]} the locales this build declares */
function declaredLocales(context) {
  const localizations = context.extension.packageJSON.contributes?.localizations ?? [];
  return localizations.map((l) => ({
    id: l.languageId,
    label: l.localizedLanguageName || l.languageName || l.languageId
  }));
}

/**
 * argv.json sits next to the user data, in a folder named by product.json. Deriving it
 * that way instead of hardcoding `.cursor` keeps this working on a portable install.
 */
function argvPath() {
  let dataFolderName = '.cursor';
  try {
    const product = JSON.parse(fs.readFileSync(path.join(vscode.env.appRoot, 'product.json'), 'utf8'));
    if (typeof product.dataFolderName === 'string' && product.dataFolderName) {
      dataFolderName = product.dataFolderName;
    }
  } catch {
    // A wrong guess only means we cannot read or write the locale, and we say so.
  }
  return path.join(os.homedir(), dataFolderName, 'argv.json');
}

/** The locale currently written in argv.json, or null when the field is absent. */
function readLocale(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(/^[ \t]*"locale"[ \t]*:[ \t]*"([^"]*)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Write `locale` into argv.json, touching nothing else. The file is JSON with comments;
 * parsing and reserializing it would drop those, so this edits the one field in place.
 */
function writeLocale(file, locale) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `{\n\t"locale": "${locale}"\n}\n`, 'utf8');
    return;
  }

  const existing = /^([ \t]*)"locale"([ \t]*):([ \t]*)"[^"]*"/m;
  if (existing.test(text)) {
    fs.writeFileSync(file, text.replace(existing, `$1"locale"$2:$3"${locale}"`), 'utf8');
    return;
  }

  const close = text.lastIndexOf('}');
  if (close === -1) throw new Error(`${file} is not a JSON object`);
  const head = text.slice(0, close).replace(/\s*$/, '');
  const tail = text.slice(close);
  // A comma is needed unless the object is still empty.
  const needsComma = !/[{,]$/.test(head.replace(/\/\/[^\n]*/g, '').replace(/\s*$/, ''));
  fs.writeFileSync(file, `${head}${needsComma ? ',' : ''}\n\t"locale": "${locale}"\n${tail}`, 'utf8');
}

const readArgvLocale = () => readLocale(argvPath());
const writeArgvLocale = (locale) => writeLocale(argvPath(), locale);

/**
 * The display language is a process argument, so reloading the window is not enough -
 * the application has to start again. Cursor ships its own restart command; when it is
 * absent we say so instead of pretending.
 */
async function offerRestart(label) {
  const commands = await vscode.commands.getCommands(true);
  const restartCommand = ['workbench.action.restart', 'cursor.restart']
    .find((c) => commands.includes(c));

  const message = t(
    'Display language set to {0}. Restart Cursor to apply it. The language pack stays installed; switch again anytime without reinstalling.',
    label
  );
  if (!restartCommand) {
    await vscode.window.showInformationMessage(t('{0} Quit and start Cursor again.', message));
    return;
  }
  const restartNow = t('Restart now');
  const choice = await vscode.window.showInformationMessage(message, restartNow, t('Later'));
  if (choice === restartNow) await vscode.commands.executeCommand(restartCommand);
}

function localeLabel(id, locales) {
  if (id === 'en') return 'English';
  return locales.find((l) => l.id === id)?.label ?? id;
}

async function applyLocale(locale, label) {
  if (readArgvLocale() === locale) {
    vscode.window.showInformationMessage(t('The display language is already {0}.', label));
    return;
  }
  try {
    writeArgvLocale(locale);
  } catch (err) {
    vscode.window.showErrorMessage(t(
      'Could not write {0}: {1}. Run "Configure Display Language" from the Command Palette instead.',
      argvPath(),
      err.message
    ));
    return;
  }
  await offerRestart(label);
}

async function selectLanguage(context) {
  const current = readArgvLocale();
  const locales = declaredLocales(context);
  const mark = (id) => (id === current || (id === 'en' && current === null) ? t('current') : null);
  const items = [
    ...locales.map((l) => ({
      label: l.label,
      description: [l.id, mark(l.id)].filter(Boolean).join('  •  '),
      detail: t('Applies workbench and Cursor UI. The pack stays installed — switch languages anytime without reinstalling.'),
      locale: l.id
    })),
    {
      label: 'English',
      description: ['en', mark('en')].filter(Boolean).join('  •  '),
      detail: t('Built-in English. Menus, Settings and other Cursor UI all return to English. The pack stays installed — pick a language again later, no reinstall.'),
      locale: 'en'
    }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: t('Cursor Language Pack'),
    placeHolder: t('Switch language only — does not uninstall the pack. Restart required.')
  });
  if (!picked) return;

  // Keep the setting in step with argv.json, so it always reflects reality.
  await vscode.workspace.getConfiguration(SECTION).update('language', picked.locale, true);
  await applyLocale(picked.locale, picked.label);
}

/** Installed extensions that also claim the `vscode` id for a locale this pack ships. */
function conflictingPacks(context) {
  const ours = context.extension.id.toLowerCase();
  const ourLocales = new Set(declaredLocales(context).map((l) => l.id));
  const found = [];
  for (const ext of vscode.extensions.all) {
    if (ext.id.toLowerCase() === ours) continue;
    const localizations = ext.packageJSON?.contributes?.localizations;
    if (!Array.isArray(localizations)) continue;
    const clash = localizations.some((l) =>
      ourLocales.has(l.languageId) && (l.translations ?? []).some((tr) => tr.id === 'vscode'));
    if (clash) found.push(ext.id);
  }
  return found;
}

async function warnAboutConflicts(context) {
  if (context.globalState.get(DISMISS_CONFLICT_WARNING)) return;
  const conflicts = conflictingPacks(context);
  if (!conflicts.length) return;

  const show = t('Show in Extensions');
  const never = t('Do not ask again');
  const choice = await vscode.window.showWarningMessage(
    t(
      '{0} also provides the workbench translations for a language this pack covers. Only one of them can win, and which one is not stable across restarts. Uninstall the other pack.',
      conflicts.join(', ')
    ),
    show,
    never
  );

  if (choice === show) {
    await vscode.commands.executeCommand('workbench.extensions.search', `@installed ${conflicts[0]}`);
  } else if (choice === never) {
    await context.globalState.update(DISMISS_CONFLICT_WARNING, true);
  }
}

/**
 * The host only offers to switch language when the pack matches the OS locale. When it
 * does not, the pack silently does nothing, which reads as a broken extension. One
 * prompt, dismissible forever, closes that gap.
 */
async function maybeOfferLanguage(context) {
  const configured = vscode.workspace.getConfiguration(SECTION).get('language', AUTO);
  const locales = declaredLocales(context);

  if (configured !== AUTO) {
    if (readArgvLocale() !== configured) {
      await applyLocale(configured, localeLabel(configured, locales));
    }
    return;
  }

  if (locales.some((l) => l.id === vscode.env.language)) return;
  if (context.globalState.get(DISMISS_LANGUAGE_PROMPT)) return;

  const select = t('Select language');
  const never = t('Do not ask again');
  const choice = await vscode.window.showInformationMessage(
    t(
      'Cursor Language Pack is installed ({0}), but the display language is still {1}.',
      locales.map((l) => l.label).join(', '),
      vscode.env.language
    ),
    select,
    never
  );
  if (choice === select) await selectLanguage(context);
  else if (choice === never) await context.globalState.update(DISMISS_LANGUAGE_PROMPT, true);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(`${SECTION}.selectLanguage`, () => selectLanguage(context)),
    vscode.commands.registerCommand(`${SECTION}.openSettings`, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', SECTION)),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration(`${SECTION}.language`)) return;
      const configured = vscode.workspace.getConfiguration(SECTION).get('language', AUTO);
      if (configured === AUTO) return;
      if (readArgvLocale() === configured) return;
      await applyLocale(configured, localeLabel(configured, declaredLocales(context)));
    })
  );

  // Both checks are advisory; a failure must never keep the window from starting.
  void maybeOfferLanguage(context).catch(() => {});
  void warnAboutConflicts(context).catch(() => {});
}

function deactivate() {}

module.exports = { activate, deactivate };

// Exposed for scripts/test-extension.mjs. Editing argv.json is the only destructive
// thing this extension does, so it is the one part that gets tested.
module.exports.__test = { readLocale, writeLocale };
