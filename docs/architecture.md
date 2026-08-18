# Architecture

Technical design. Usage, once it ships: [README.md](../README.md). Why we are
building this: [research.md](research.md).

The pipeline is not implemented yet. This document is the target shape, copied
from [kiro-language-pack](https://github.com/polang233/kiro-language-pack) and
adjusted for Cursor.

## One self-contained extension

The pack will carry the workbench baseline from
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) *and* the Cursor
translations this project authors. It therefore owns the `vscode` translation id
and **replaces** the official VS Code language pack. Do not install both.

That follows from how the host resolves localizations. `%USERPROFILE%\.cursor\languagepacks.json`
maps each translation id to exactly one path, assigned by a plain overwrite as
extensions are scanned. There is no per-key merge.

Cursor-authored strings that went through `nls.localize` live in

```
resources/app/out/nls.messages.json
  vs/workbench/contrib/composer/…
  vs/workbench/contrib/agents/…
  vs/workbench/contrib/aiSettings/…
  vs/workbench/contrib/aiConfig/…
  vs/workbench/contrib/cursorBlame/…
  vs/workbench/contrib/cursorOrigin/…
  vs/workbench/services/cursorAuth/…
  …and a handful of `*.cursor` modules
```

Those belong to the `vscode` id, not to `anysphere.*`. Translating them means
providing the `vscode` file. Shipping the vscode-loc baseline alongside is what
makes owning that id safe.

Companion mode (Cursor ids only) is disabled in `config.json`. Cursor's built-in
extensions expose almost no `package.nls.json`.

## How localization works

A language pack is a code-free extension that declares:

```json
{
  "contributes": {
    "localizations": [
      {
        "languageId": "zh-cn",
        "languageName": "Chinese Simplified",
        "localizedLanguageName": "中文（简体）",
        "translations": [
          { "id": "vscode", "path": "./translations/main.i18n.json" },
          { "id": "vscode.git", "path": "./translations/extensions/vscode.git.i18n.json" }
        ]
      }
    ]
  }
}
```

Keys that are absent fall back to English. The host reads
`contributes.localizations` from every installed extension, so one extension can
serve any number of languages.

Display language is `locale` in `~/.cursor/argv.json`. Changing it requires a
full restart, not a window reload.

## Planned build pipeline

```
Cursor installation ──(extract)──> metadata/cursor.json ─────┐
                                                             │
microsoft/vscode-loc ──(sync)──> upstream/<locale>/ ──────────┼──(build)──> dist/<pack>/ ──(package)──> .vsix
                                                             │
src/i18n/<locale>/{overrides,cursor} ────────────────────────┘
```

`metadata/cursor.json` is a snapshot of every localizable key in the installed
build. It filters keys Cursor does not have, repairs inherited translations
whose `{0}` placeholders no longer match (the menu-bar desync Cursor staff
described), and gives `coverage` a real denominator.

Pin `upstream.ref` to a vscode-loc snapshot close to Cursor's `vscodeVersion`
(1.128.x on the probe), not blindly `main`. Tracking a newer VS Code line than
the fork is how File/Edit/View revert to English.

## What a pack cannot do

Cursor Settings, Agent/Chat, and similar overlay chrome are not in
`nls.messages.json`. A language pack cannot reach them. Phase 2 is an optional
install patch (workbench.html injection or string rewrite), documented in
[roadmap.md](roadmap.md), kept off the Marketplace. Same conclusion as the
Vietnamese DMCTN pack.

## Runtime (planned)

A language pack does not need code. The Kiro pack still ships a small
`main.cjs` for a language picker and a conflict warning when another extension
also claims `vscode`. Port that file; change `kiroLanguagePack` →
`cursorLanguagePack` and read `product.json` → `dataFolderName` (`.cursor`).

## Repository layout

```
config.json                       publisher, version, locales, modes
src/
  manifest.template.json          extension manifest skeleton
  marketplace/README.md           store page body
  i18n/<locale>/
    glossary.json                 terminology
    cursor/                       Cursor NLS (not written yet)
    overrides/                    corrections to vscode-loc (not written yet)
scripts/
  detect-cursor.mjs               live
  not-yet.mjs                     extract / sync / build / package stubs
  lib/cursor-paths.mjs
  lib/util.mjs
```
