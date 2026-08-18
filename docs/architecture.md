# Architecture

Technical design notes for the Cursor Language Pack. For installation and everyday use, see
[README.md](../README.md).

## One self-contained extension

The pack carries the workbench baseline from
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) *and* the Cursor translations
this project authors. It therefore owns the `vscode` translation id and **replaces** the
official VS Code language pack. Do not install both.

That is not a preference, it follows from how Cursor is built. Cursor is a fork that compiled
its own UI into the Code OSS core:

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

Those strings belong to the `vscode` translation id, not to `anysphere.*`. And the host
resolves ids one file at a time — `%USERPROFILE%\.cursor\languagepacks.json` maps each
translation id to exactly one path, assigned by a plain overwrite as extensions are scanned:

```js
for (const c of localization.translations)
  entry.translations[c.id] = join(extension.location.fsPath, c.path);
```

There is no per-key merge. Translating Cursor's composer / agents NLS means providing the
`vscode` file, and two extensions cannot both provide it. Shipping the baseline alongside is
what makes owning that id safe.

Nothing is lost by the swap: the workbench strings come from the same MIT-licensed
`vscode-loc` snapshot the official pack is built from (pinned to Code OSS 1.128, matching
Cursor 3.16.17), and this build additionally drops inherited strings whose placeholders no
longer match the source (see [Marker repair](#marker-repair)).

| Edition | Extension name | Contents | Default |
| --- | --- | --- | --- |
| **Full** | `cursor-language-pack` | Workbench baseline + Cursor strings, every enabled locale | published |
| **Companion** | `cursor-language-pack-<locale>-companion` | Cursor built-in extension ids only | build only, disabled |

Companion coexists with the official pack because it never claims `vscode`. The trade-off is
scope: Cursor's built-in extensions expose almost no `package.nls.json`, so companion mode is
not useful. It is disabled in `config.json`.

## How localization works

VS Code, and therefore Cursor, resolves UI strings through the language pack contribution
point. A pack is a code-free extension that declares one entry per language:

```json
{
  "contributes": {
    "localizations": [
      {
        "languageId": "zh-cn",
        "languageName": "Chinese Simplified",
        "localizedLanguageName": "中文（简体）",
        "translations": [
          { "id": "vscode", "path": "./translations/zh-cn/main.i18n.json" },
          { "id": "vscode.git", "path": "./translations/zh-cn/extensions/vscode.git.i18n.json" }
        ]
      }
    ]
  }
}
```

Each translation file maps module paths and keys to translated text. Keys that are absent
fall back to English silently. The host reads `contributes.localizations` from every
installed extension, so a single extension can serve any number of languages.

Display language is `locale` in `~/.cursor/argv.json`. Changing it requires a full restart,
not a window reload.

## Build pipeline

```
Cursor installation ──(extract)──> metadata/cursor.json ─────┐
                                                             │
microsoft/vscode-loc ──(sync)──> upstream/<locale>/ ──────────┼──(build)──> dist/<pack>/ ──(package)──> .vsix
                                                             │
src/i18n/<locale>/{overrides,cursor} ────────────────────────┘
                                                             ├──(gap)──────> reports/cursor-core-gap-<locale>.json
                                                             └──(coverage)─> reports/
```

`metadata/cursor.json` is a snapshot of every localizable key in the installed build,
including the English source text. It serves four purposes:

- **Filtering.** Keys that do not exist in Cursor are dropped.
- **Repair.** Because `vscode-loc` tracks current VS Code while Cursor may lag, some inherited
  translations no longer match their source. The build drops those so the string falls back
  to English instead of rendering `{2}` literally.
- **Gap analysis.** `npm run gap` diffs the installed key set against the upstream baseline.
  That difference is what this project has to translate itself.
- **Coverage.** It gives `coverage` a real denominator instead of a guess.

The snapshot is optional, so CI can build without Cursor installed — filtering, repair and
gap analysis are skipped in that case.

Pin `upstream.ref` to a vscode-loc snapshot close to Cursor's `vscodeVersion` (1.128.x), not
`main`. Tracking a newer VS Code line than the fork is how File/Edit/View revert to English.

## Marker repair

`scripts/lib/markers.mjs` compares `{0}` placeholders, `$(codicon)` icons and
`(command:…)` links between the English source in the installed build and each translation.
Mismatches in the inherited baseline are dropped. Mismatches in files this repository
maintains are reported as errors.

## What a pack cannot do

Cursor Settings, the Agent/Chat overlay, and similar React chrome are not in
`nls.messages.json`. A language pack cannot reach them. An optional install-directory patch
is out of scope until the extension is the product people install.

## Runtime

A language pack does not need code, and the translations work without it. The pack ships a
single small file anyway, for the two things the host leaves undone: the language picker
(**Language Pack: Select Display Language**), and a warning when another extension also
claims the workbench translations.

The complete list of what it touches:

| Access | Path | When |
| --- | --- | --- |
| read | `<appRoot>/product.json` | to learn the user data folder name |
| read | `~/<dataFolder>/argv.json` | to know the current display language |
| write | `~/<dataFolder>/argv.json` | only the `locale` field, only after you confirm |
| read | manifests of installed extensions | to spot a conflicting language pack |
| write | this extension's own global state | two "do not ask again" flags |

No network access, no telemetry, no other files. `argv.json` is edited in place so comments
and formatting survive — that is the one destructive operation, so it is also the one thing
with tests (`npm test`).

## Repository layout

```
config.json                       single source of truth: publisher, version, locales, modes
src/
  manifest.template.json          extension manifest skeleton
  extension/main.cjs              the runtime: language picker, conflict warning
  marketplace/README.md           the page shown on the extension marketplace
  i18n/<locale>/
    glossary.json                 terminology contract for the locale
    extension.l10n.json           the runtime's own messages
    cursor/core.*.i18n.json       Cursor strings compiled into the Code OSS core
    cursor/<extId>.i18n.json      built-in extension manifest strings (rare)
    overrides/main.i18n.json      corrections to the upstream workbench baseline
scripts/                          the build pipeline
metadata/                         generated, gitignored
upstream/                         translation cache, gitignored
dist/                             build output, gitignored
reports/                          coverage, gap and audit reports, gitignored
```

Any file named `core*.i18n.json` under `cursor/` is merged into the `vscode` translation id.
Splitting by area is a convenience.
