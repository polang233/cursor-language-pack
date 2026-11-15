# Contributing

Translation fixes, new languages, terminology reviews and missing-text reports are welcome. You can start with a few strings or one screen; partial translations fall back to English.

Install / usage: [README.md](../README.md) (简体中文) · [README.en.md](README.en.md) (English).
Docs index: [README.md](README.md).

## Setup

Node.js 22+ is recommended; the minimum is 18.17. Run these commands from the repository root with Cursor installed locally.

```bash
npm ci
npm run detect      # find local Cursor (or set CURSOR_INSTALL_DIR)
npm run extract
npm run sync
npm run build && npm run validate && npm run coverage
```

## What to edit

| Change | Where |
| --- | --- |
| Cursor UI in the core | `src/i18n/<locale>/cursor/core.*.i18n.json` |
| Cursor built-in extension manifest | `src/i18n/<locale>/cursor/<extId>.i18n.json` |
| Inherited workbench string | `src/i18n/<locale>/overrides/main.i18n.json` |
| Terminology | `src/i18n/<locale>/glossary.json` |
| Store page | `src/marketplace/README.md` |
| Runtime notifications | `src/i18n/<locale>/extension.l10n.json` |
| Hardcoded Cursor UI | `src/i18n/<locale>/hardcoded.json` |
| Credits, top-up and billing messages | `src/i18n/<locale>/commerce.json` |
| Enable locale / bump version | `config.json` |

Do not edit `dist/`, `metadata/`, `upstream/` or `reports/` — generated and gitignored.

Store search also uses `pack.displayName` / `pack.description` in `config.json` and `keywords` in `src/manifest.template.json`. Keep 汉化 / 中文翻译 near the front.

## Finding gaps

```bash
npm run gap
npm run gap -- --module=composer
npm run gap -- --skeleton=.tmp-todo.json   # stub only — do not commit English stubs as translations
```

`npm run coverage` reports **core workbench** (mostly vscode-loc) and **cursor core** (keys this repo authors). Only the latter is ours.

## Translation rules

`validate` checks structural markers. Review terminology and runtime strings against the installed Cursor as well:

- Keep `{0}`, `{1}`, … placeholders (same count; reordering OK).
- Keep codicons like `$(add)` verbatim.
- In `[Label](command:…)`, translate the label only.
- Keep menu mnemonics (`&&`); Chinese style e.g. `文件(&&F)`.
- Keep key glyphs (`⌘Enter`) and significant whitespace / `\n`.
- No empty values. Follow `glossary.json`; change the glossary in the same PR if you rename a term.
- Prefer terms that match the official VS Code Chinese pack when the concept exists in both.
- Keep Cursor and the protocol name MCP in English. Translate feature labels: Agent 智能体, Tab 代码补全, Cloud Agent 云端智能体, Composer 编写, Steer 引导, Bugbot 缺陷检查. Editor tabs stay 标签页, not 代码补全.

`hardcoded.json` ships with the npm installer. The CLI patches supported text in the app files, including Cursor Settings, Agents and Chat. English keys must match the installed Cursor byte for byte. Add replacements for UI fields or reviewed display-text fragments in `scripts/translate-install.mjs`; preserve command IDs, routes and search metadata. Preview with `npm run translate -- --preview --locale=<locale>` and check real application file copies with `npm run validate:install`.

After filling `zh-cn`, regenerate Traditional Chinese with:

```bash
node scripts/convert-zh-tw.mjs
```

Then review the diff and wording in `src/i18n/zh-tw/`, preserving existing reviewed translations. The conversion script rewrites the Traditional Chinese files.

## Before a PR

```bash
npm run verify
npm test
npm run package:npm
```

For installer, hardcoded-text or commerce changes, also run `npm run validate:install`. It checks rewritten application file copies without changing the installed application. `package:npm` tests the actual tarball against isolated application and user-profile fixtures.

Describe the Cursor version tested (`npm run detect`), locale, coverage and changed screens. Include a screenshot for a new locale or a visible UI correction. Report which checks you ran and any remaining gaps.

## Adding a language

Locales from vscode-loc are already in `config.json` with `enabled: false`.

1. Set `enabled: true` (or add an entry with `upstreamPackDir: null` if upstream has no pack — workbench stays English, Cursor strings still help).
2. Write `src/i18n/<locale>/glossary.json` first.
3. `npm run sync -- --locale=<locale>` then `npm run gap -- --locale=<locale> --skeleton=.tmp-todo.json`.
4. Fill `src/i18n/<locale>/cursor/…` (use zh-cn files as reference).
5. Add `src/i18n/<locale>/hardcoded.json` for strings compiled into Cursor. Use the English keys from `zh-cn` as a reference and translate the values. Preview with `npm run translate -- --preview --locale=<locale>`; English keys must match the UI exactly. Add `commerce.json` and runtime notification translations for the areas you cover.
6. For npm installation, check locale validation and help in `scripts/lib/cli.mjs`, OS-language selection in `scripts/lib/system-locale.mjs`, and packaged dictionaries in `package.json`. Cover the new locale in `scripts/test-cli.mjs` and `scripts/test-package.mjs`.
7. Run the checks in **Before a PR**, then open the PR with the tested Cursor version, coverage and screenshots.
8. Mention the language in `src/marketplace/README.md` and, if useful, in `pack.displayName` / `pack.description`.

Partial translations are fine — missing keys fall back to English.

## After a Cursor upgrade

```bash
npm run check-upgrade
# or: npm run check-upgrade -- --force
# repeat a comparison against a preserved snapshot:
npm run check-upgrade -- --baseline=reports/baselines/cursor-<version>-<commit>.json
```

Review added/removed keys, `changedKeys` and `movedKeys`. Existing translations still need review when their English source changes. Previous snapshots are archived before extraction; `--baseline` repeats a comparison even when the installed version is already verified. Historical orphaned authored keys are reported separately from keys removed in this upgrade. Reuse translations for confirmed module moves, and keep older-version entries when they are still needed for compatibility.

Hardcoded UI dictionaries are audited separately from NLS metadata. `commerce.json` supplies the credits, top-up and billing messages through the commerce bundle's resource API. Keep ICU arguments such as `{amount}`, plural branches and component tags intact. Run `npm test` and check rewritten application bundles in temporary files before marking an app version verified.

Then `npm run sync`, `npm run gap`, `npm run coverage`, add the version to `target.verifiedCursorVersions`, bump `version`.

Publishing: [publishing.md](publishing.md) · [publishing.zh-CN.md](publishing.zh-CN.md) · [AGENTS.md](../AGENTS.md).

## Reporting issues

Include the Cursor version, operating system, language-pack version, selected locale and installation method (extension only or npm CLI). For missing or incorrect text, include the original string, expected translation, screen location and a screenshot when possible.

- Mostly English UI: check the display language and conflicting language packs. Only one pack should claim `vscode` for a locale.
- No change after install: fully quit and reopen Cursor. After a Cursor update, rerun the npm installer to apply the current patch.
- Cursor Settings, Agents, Chat or account text: report missing translations here. These screens include text handled by the CLI installer, so tell us whether you ran it and which version you used.
- Installation failure: include the command and error output, removing credentials and personal data. Avoid attaching entire application bundles.

### Runtime

`src/extension/main.cjs` may only do what a declarative language pack cannot (language picker + conflict warning). Keep the path list in the file header accurate; `npm test` covers `argv.json`.

## License

Contributions are MIT, same as this repository.
