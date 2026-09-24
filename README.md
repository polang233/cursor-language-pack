# Cursor Language Pack

A multilingual language pack for Cursor. Simplified Chinese and Traditional Chinese are supported.

**English** · [简体中文](README.zh-CN.md)

<img src="media/icon.png" width="96" height="96" alt="Cursor Language Pack icon" />

[![Open VSX](https://img.shields.io/open-vsx/v/polang233/cursor-language-pack?label=Open%20VSX)](https://open-vsx.org/extension/polang233/cursor-language-pack)
[![Downloads](https://img.shields.io/open-vsx/dt/polang233/cursor-language-pack)](https://open-vsx.org/extension/polang233/cursor-language-pack)

<img src="media/settings-zh.png" alt="Settings in Simplified Chinese" width="720" />

<img src="media/settings-en.png" alt="Settings in English" width="720" />

There are two ways to install. The plugin alone translates only part of the interface. Clone the repo and run the command to translate most of it.

## VS Code only

Install the extension. This stays inside the plugin: menus, files, the editor and the terminal switch language. English compiled into Settings, the Agent window and the account page stays as it is.

1. Uninstall any other language pack. This one replaces the official VS Code pack. Two packs together make the UI flip translations on every restart.
2. Extensions → search **汉化** or **中文语言包** → Install. Or download a [GitHub Release](https://github.com/polang233/cursor-language-pack/releases) `.vsix` and run **Extensions: Install from VSIX…**. Do not double-click the file on Windows.
3. Command Palette → **Language Pack: Select Display Language** → pick **中文（简体）** or **中文（繁體）** → **quit Cursor and open it again**. Reload is not enough.

To switch later, restart after either of these:

- Command Palette → **Language Pack: Select Display Language**
- Setting `cursorLanguagePack.language`: `auto`, `zh-cn`, `zh-tw`, `en`

`en` returns the UI to English. The extension stays installed.

## Full translation

Settings, the Agent window and the account page keep English in the app files. The extension cannot change those. Edit the install, then restart.

Quit Cursor completely. Install Node.js 18, clone this repo, then:

```bash
npm install
npm run translate
```

The script backs up the files, rewrites those strings, updates the install checksum, installs this pack, and sets the display language to Simplified Chinese. Open Cursor again.

Traditional Chinese: `npm run translate -- --locale=zh-tw`. If the install is not found, add `--dir="path"` — the folder that contains `resources/app`. On macOS that is `Cursor.app/Contents`.

A Cursor update wipes the rewrite. Run the command again. Restore only the app files with `npm run translate -- --undo`. The extension and display language stay.

The product name Cursor and the protocol name MCP stay in English.

## Languages

| Locale | Status |
| --- | --- |
| `zh-cn` 简体中文 | Shipped. Workbench 12725/12747 (99.8%), 1741 own strings (100%), plus 578 compiled strings |
| `zh-tw` 繁體中文 | Shipped. Same numbers as Simplified Chinese |
| `ja` `ko` `fr` `de` `es` `it` `ru` `pt-br` `tr` `pl` `cs` | Reserved, no translations yet |

One extension holds every enabled locale. The compiled strings change only after the command above. Anything not translated stays English.

The current translation matches Cursor **3.21.13**. Older versions generally work. On newer versions, newly added text stays English until we translate it.

### Adding a language

1. Set `enabled: true` for that locale in `config.json`.
2. Add `src/i18n/<locale>/`: glossary first, then translations under `cursor/`.
3. For the full translation, add `hardcoded.json`. Copy `src/i18n/zh-cn/hardcoded.json` and translate the values. `npm run translate -- --locale=<locale>` reads that file.
4. `npm run build && npm run validate && npm run coverage`.

Details: [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-language).

## Development

Node.js 18.17+.

```bash
npm install
npm run detect
npm run extract
npm run sync
npm run verify
npm run package
npm run translate -- --preview
npm run check-upgrade
```

Docs: [architecture](docs/architecture.md) · [contributing](CONTRIBUTING.md) · [publishing](docs/publishing.md)

## License

MIT. Workbench strings come from [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc); see [NOTICE](NOTICE).

Not affiliated with Anysphere or Microsoft.
