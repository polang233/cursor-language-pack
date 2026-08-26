# Cursor Language Pack

Community language pack for [Cursor](https://cursor.com/) — it translates the editor
workbench **and** the Cursor strings that live in Code OSS's NLS files (composer,
agents, aiSettings, and related modules).

**English** · [简体中文](README.zh-CN.md)

> 中文用户请看 [简体中文说明](README.zh-CN.md)。安装前请先卸载其他语言包，装完选显示语言后**重启** Cursor。

<img src="media/icon.png" width="96" height="96" alt="Cursor Language Pack icon" />

The project is built to hold any number of languages. **Today it ships Simplified Chinese
and Traditional Chinese.** Eleven more locales are already declared in `config.json` and
waiting for someone to fill them in; see [Adding a language](#adding-a-language).

## Install

1. **Uninstall any other language pack first.** This pack replaces the official VS Code one —
   [why](docs/architecture.md#one-self-contained-extension). Two packs installed together give
   you a UI that is translated differently after each restart.
2. Install the pack:
   - [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack) (this is what Cursor’s extension search uses)
   - or a GitHub Release `.vsix` — Command Palette → **Extensions: Install from VSIX…**
3. Command Palette → **Language Pack: Select Display Language** → pick a language → restart.

On Windows, do not double-click the `.vsix`; Visual Studio may claim the file type. Install it
from the Command Palette instead.

### Switching language later

Any of these work, and none of them require reinstalling — every bundled language is already
on disk:

- Command Palette → **Language Pack: Select Display Language**
- Settings → `cursorLanguagePack.language` (`auto`, `zh-cn`, `zh-tw`, `en`)
- The built-in **Configure Display Language** command

Picking `en` returns the whole UI to English while the pack stays installed. All three write
the `locale` field in `argv.json` and nothing else. The display language is a launch argument,
so Cursor has to be restarted, not just reloaded.

## Language support

| Locale | Status |
| --- | --- |
| `zh-cn` 简体中文 | Shipped — workbench 99.8% plus all 1621 Cursor-specific core keys (100%) |
| `zh-tw` 繁體中文 | Shipped — same surface, Taiwan-oriented terminology |
| `ja` `ko` `fr` `de` `es` `it` `ru` `pt-br` `tr` `pl` `cs` | Declared in `config.json`, `enabled: false`, no translations yet |

One extension declares every enabled locale; Cursor loads the one matching `locale` in
`argv.json`, and any key without a translation falls back to English.

### Adding a language

1. Set `enabled: true` for your locale in `config.json`. If
   [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) has no pack for it, set
   `upstreamPackDir: null`: the workbench stays English and only the Cursor strings get
   translated.
2. Add `src/i18n/<locale>/` — glossary first, then the translation files.
3. `npm run build && npm run validate && npm run coverage`.

Step-by-step: [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-language).

## Known limits

Still English, because Cursor has not externalized these strings — a language pack cannot
reach them:

- Cursor Settings
- the Agent / Chat overlay (the React chrome around the conversation)
- account / marketplace overlay chrome

Please do not file translation issues for those surfaces here.

The UI language does not change what language the AI answers in.

Reconciled against Cursor **3.16.17** (Code OSS 1.128.0) — see
`target.verifiedCursorVersions` in `config.json`. Other builds generally work; strings Cursor
adds later fall back to English until someone runs `npm run check-upgrade` and translates the
additions.

## Development

Node.js 18.17 or newer. No compile step.

```bash
npm install
npm run detect          # find the local Cursor install
npm run extract         # snapshot its localizable strings
npm run sync            # download the vscode-loc workbench baseline
npm run verify          # build + validate + coverage
npm run package         # dist/cursor-language-pack-<version>.vsix
npm run check-upgrade   # after a Cursor update: what changed, what needs translating
```

Pipeline and layout are copied from
[kiro-language-pack](https://github.com/polang233/kiro-language-pack), with Cursor paths and
a VS Marketplace-first publish target (Cursor's gallery is `marketplace.cursorapi.com`, not
Open VSX).

Docs: [architecture](docs/architecture.md) · [contributing](CONTRIBUTING.md) ·
[publishing](docs/publishing.md) · [all documents](docs/README.md)

## License

MIT. Workbench strings are derived from the MIT-licensed
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc); see [NOTICE](NOTICE).

A community project. Not affiliated with, endorsed by, or supported by Anysphere or Microsoft.
