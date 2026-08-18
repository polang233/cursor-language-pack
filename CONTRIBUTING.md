# Contributing

This repository is a scaffold. There is no `.vsix` and no translation files to
review yet. The useful contributions right now are:

- running `npm run detect` on a Cursor version we have not probed
- filling `src/i18n/<locale>/glossary.json` if a term is wrong
- porting the kiro-language-pack pipeline (see [docs/roadmap.md](docs/roadmap.md))

Install / usage once it ships: [README.md](README.md) · [README.zh-CN.md](README.zh-CN.md).
Docs index: [docs/README.md](docs/README.md).

## Setup

Node.js 18.17+. No compile step.

```bash
npm install
npm run detect      # find local Cursor (or set CURSOR_INSTALL_DIR)
```

The rest of the scripts (`extract`, `sync`, `build`, `validate`, `coverage`,
`package`) print a "not implemented" message until they are ported from
[kiro-language-pack](https://github.com/polang233/kiro-language-pack).

## What to edit (once translations exist)

| Change | Where |
| --- | --- |
| Cursor UI in the core | `src/i18n/<locale>/cursor/core.*.i18n.json` |
| Inherited workbench string | `src/i18n/<locale>/overrides/main.i18n.json` |
| Terminology | `src/i18n/<locale>/glossary.json` |
| Store page | `src/marketplace/README.md` |
| Enable locale / bump version | `config.json` |

Do not edit `dist/`, `metadata/`, `upstream/` or `reports/` — generated and gitignored.

## Translation rules (same as the Kiro pack)

- Keep `{0}`, `{1}`, … placeholders (same count; reordering OK).
- Keep codicons like `$(add)` verbatim.
- In `[Label](command:…)`, translate the label only.
- Keep menu mnemonics (`&&`); Chinese style e.g. `文件(&&F)`.
- Keep key glyphs (`⌘Enter`) and significant whitespace / `\n`.
- No empty values. Follow `glossary.json`.
- Prefer terms that match the official VS Code Chinese pack when the concept exists in both.
- Keep product names in English: Cursor, Agent, Composer, Tab, MCP, Bugbot.

## Adding a language

Locales from vscode-loc can be listed in `config.json` with `enabled: false`.

1. Set `enabled: true` (or add an entry with `upstreamPackDir: null` if upstream has no pack).
2. Write `src/i18n/<locale>/glossary.json` first.
3. After `extract` / `gap` exist: fill `src/i18n/<locale>/cursor/…`.
4. Open the PR.

Partial translations are fine — missing keys fall back to English.
