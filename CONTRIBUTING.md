# Contributing

Translation fixes, new languages and terminology proposals are welcome.

Install / usage: [README.md](README.md) · [README.zh-CN.md](README.zh-CN.md).
Docs index: [docs/README.md](docs/README.md).

## Setup

Node.js 18.17+. No compile step.

```bash
npm install
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
| Enable locale / bump version | `config.json` |

Do not edit `dist/`, `metadata/`, `upstream/` or `reports/` — generated and gitignored.

Store search also uses `pack.displayName` / `pack.description` in `config.json` and `keywords` in `src/manifest.template.json`.

## Finding gaps

```bash
npm run gap
npm run gap -- --module=composer
npm run gap -- --skeleton=.tmp-todo.json   # stub only — do not commit English stubs as translations
```

`npm run coverage` reports **core workbench** (mostly vscode-loc) and **cursor core** (keys this repo authors). Only the latter is ours.

## Translation rules

`validate` enforces these; broken PRs will fail CI:

- Keep `{0}`, `{1}`, … placeholders (same count; reordering OK).
- Keep codicons like `$(add)` verbatim.
- In `[Label](command:…)`, translate the label only.
- Keep menu mnemonics (`&&`); Chinese style e.g. `文件(&&F)`.
- Keep key glyphs (`⌘Enter`) and significant whitespace / `\n`.
- No empty values. Follow `glossary.json`; change the glossary in the same PR if you rename a term.
- Prefer terms that match the official VS Code Chinese pack when the concept exists in both.
- Keep product names in English: Cursor, Agent, Composer, Tab, MCP, Bugbot.

After filling `zh-cn`, regenerate Traditional Chinese with:

```bash
node scripts/convert-zh-tw.mjs
```

Then hand-edit Taiwan terms in `src/i18n/zh-tw/` if needed.

## Before a PR

```bash
npm run build && npm run validate && npm run coverage
npm test    # only if you changed src/extension/
```

Describe: Cursor version tested (`npm run detect`), coverage for the locale you touched, and a screenshot for a new locale.

## Adding a language

Locales from vscode-loc are already in `config.json` with `enabled: false`.

1. Set `enabled: true` (or add an entry with `upstreamPackDir: null` if upstream has no pack — workbench stays English, Cursor strings still help).
2. Write `src/i18n/<locale>/glossary.json` first.
3. `npm run sync -- --locale=<locale>` then `npm run gap -- --locale=<locale> --skeleton=.tmp-todo.json`.
4. Fill `src/i18n/<locale>/cursor/…` (use zh-cn files as reference).
5. `npm run build && npm run validate && npm run coverage`, then open the PR.
6. Mention the language in `src/marketplace/README.md` and, if useful, in `pack.displayName` / `pack.description`.

Partial translations are fine — missing keys fall back to English.

## After a Cursor upgrade

```bash
npm run check-upgrade
# or: npm run check-upgrade -- --force
```

Read **orphaned authored keys first** — often keys *moved* (new module path), not deleted. Rename the module id in `core*.i18n.json`; do not retranslate. `validate` catches wrong renames.

Then `npm run sync`, `npm run gap`, `npm run coverage`, add the version to `target.verifiedCursorVersions`, bump `version`.

Publishing (web upload / local `vsce` / tag `v*` + GitHub secret `VSCE_PAT`): [docs/publishing.md](docs/publishing.md) · [docs/publishing.zh-CN.md](docs/publishing.zh-CN.md) · [AGENTS.md](AGENTS.md).

## Reporting issues

Include Cursor version, platform, which pack is installed, and the string you saw vs expected.

- Mostly English UI → uninstall other language packs (do not run two packs that claim `vscode`).
- No change after install → fully restart Cursor once.
- Cursor Settings / Agent / Chat overlay / account popup → not reachable by a language pack; do not file translation issues here.

### Runtime

`src/extension/main.cjs` may only do what a declarative language pack cannot (language picker + conflict warning). Keep the path list in the file header accurate; `npm test` covers `argv.json`.

## License

Contributions are MIT, same as this repository.
