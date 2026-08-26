# Cursor Language Pack

Cursor IDE 中文语言包（汉化）。翻译编辑器主体，以及 Cursor 写进内核的界面文案。

**English** · [简体中文](README.zh-CN.md)

[![Open VSX](https://img.shields.io/open-vsx/v/polang233/cursor-language-pack?label=Open%20VSX)](https://open-vsx.org/extension/polang233/cursor-language-pack)
[![Downloads](https://img.shields.io/open-vsx/dt/polang233/cursor-language-pack)](https://open-vsx.org/extension/polang233/cursor-language-pack)

> 中文用户看 [简体中文说明](README.zh-CN.md)。先卸其他语言包，装完选语言后**重启** Cursor。

<img src="media/icon.png" width="96" height="96" alt="Cursor Language Pack icon" />

Ships **Simplified Chinese** and **Traditional Chinese**. Other locales are declared in `config.json` and need translations from native speakers — see [Adding a language](#adding-a-language).

## Install

1. **Uninstall any other language pack first.** This one replaces the official VS Code pack ([why](docs/architecture.md#one-self-contained-extension)). Two packs together make the UI flip translations on every restart.
2. Install:
   - **In Cursor:** Extensions → search **汉化** / **中文语言包** / **Cursor Language Pack** → Install.
     Listing: [Open VSX](https://open-vsx.org/extension/polang233/cursor-language-pack)
   - or a [GitHub Release](https://github.com/polang233/cursor-language-pack/releases) `.vsix` → Command Palette → **Extensions: Install from VSIX…**
3. Command Palette → **Language Pack: Select Display Language** → pick a language → restart.

Do not double-click the `.vsix` on Windows; Visual Studio may steal the file type.

### Switching language later

No reinstall needed:

- Command Palette → **Language Pack: Select Display Language**
- Settings → `cursorLanguagePack.language` (`auto`, `zh-cn`, `zh-tw`, `en`)
- Built-in **Configure Display Language**

`en` returns the UI to English with the pack still installed. All three only write `locale` in `argv.json`. Restart Cursor; reload is not enough.

## Language support

| Locale | Status |
| --- | --- |
| `zh-cn` 简体中文 | Shipped — workbench 99.8% plus all 1621 Cursor-specific core keys (100%) |
| `zh-tw` 繁體中文 | Shipped — same surface, Taiwan terminology |
| `ja` `ko` `fr` `de` `es` `it` `ru` `pt-br` `tr` `pl` `cs` | Declared, `enabled: false`, no translations yet |

One extension, every enabled locale. Missing keys fall back to English.

### Adding a language

1. Set `enabled: true` in `config.json`. If [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) has no pack, set `upstreamPackDir: null` — workbench stays English, Cursor strings still get translated.
2. Add `src/i18n/<locale>/` (glossary first).
3. `npm run build && npm run validate && npm run coverage`.

Details: [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-language).

## Known limits

These strings are not in NLS, so a language pack cannot reach them:

- Cursor Settings
- Agent / Chat overlay
- account / marketplace overlay

Do not file translation issues for those. UI language does not change the AI reply language.

Reconciled against Cursor **3.16.17** (Code OSS 1.128.0). Other builds usually work; new strings stay English until someone runs `npm run check-upgrade`.

## Development

Node.js 18.17+. No compile step.

```bash
npm install
npm run detect          # find the local Cursor install
npm run extract         # snapshot localizable strings
npm run sync            # vscode-loc workbench baseline
npm run verify          # build + validate + coverage
npm run package         # dist/cursor-language-pack-<version>.vsix
npm run check-upgrade   # after a Cursor update
```

Pipeline is based on [kiro-language-pack](https://github.com/polang233/kiro-language-pack). Cursor’s in-app search uses Open VSX, so publish there first.

Docs: [architecture](docs/architecture.md) · [contributing](CONTRIBUTING.md) · [publishing](docs/publishing.md) · [index](docs/README.md)

## License

MIT. Workbench strings come from MIT-licensed [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc); see [NOTICE](NOTICE).

Not affiliated with Anysphere or Microsoft.
