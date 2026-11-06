# Cursor Language Pack

Chinese translations for Cursor, including the editor, Settings and Agent interface. Supports Simplified Chinese and Traditional Chinese with Taiwan terminology.

[简体中文](../README.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/polang233/cursor-language-pack/main/media/icon.png" width="96" height="96" alt="Cursor Language Pack icon" />
</p>
<p align="center">
  <a href="https://open-vsx.org/extension/polang233/cursor-language-pack"><img alt="Open VSX downloads" src="https://img.shields.io/open-vsx/dt/polang233/cursor-language-pack?label=Open%20VSX&color=C160EF" /></a>
  <a href="https://www.npmjs.com/package/@polang233/cursor-language-pack"><img alt="npm downloads" src="https://img.shields.io/npm/dt/%40polang233%2Fcursor-language-pack?logo=npm&logoColor=white&label=npm&color=CB3837" /></a>
  <a href="https://github.com/polang233/cursor-language-pack/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/polang233/cursor-language-pack?logo=github&label=stars&color=181717" /></a>
</p>

| Settings in Simplified Chinese | Settings in English |
| --- | --- |
| ![Simplified Chinese](https://raw.githubusercontent.com/polang233/cursor-language-pack/main/media/settings-zh.png) | ![English](https://raw.githubusercontent.com/polang233/cursor-language-pack/main/media/settings-en.png) |

![Agent sidebar in Simplified Chinese](https://raw.githubusercontent.com/polang233/cursor-language-pack/main/media/agents-zh.png)

## Command-line installation

Node.js 22+ is recommended; the minimum is 18.17. Quit Cursor completely first.

```bash
npx @polang233/cursor-language-pack@latest
```

The default command is `install`. It installs the language pack and translates text in the app files. Each npm version includes its matching VSIX, so users do not need to download or build the source. To switch languages or specify the install directory:

```bash
npx @polang233/cursor-language-pack@latest --locale=zh-cn
npx @polang233/cursor-language-pack@latest --locale=zh-tw
npx @polang233/cursor-language-pack@latest --dir="path/to/install"
```

| Subcommand | Purpose |
| --- | --- |
| `preview` | Preview changes |
| `status` | Report the current state |
| `restore` | Restore only the app files |

System locales with TW/HK/MO or zh-Hant select `zh-tw` with Taiwan terminology; all others select `zh-cn`. Override this with `--locale`. `--dir` selects the install directory containing `resources/app`, or `Cursor.app/Contents` on macOS.

Reopen Cursor after installation. Rerun the install command after an app update. Switch extensions and display language inside the app; `restore` does not uninstall the extension or reset the display language.

Test the source entry point from the repository. See [npm maintenance](npm.md) for preparation:

```bash
node bin/cli.mjs preview --locale=zh-tw
```

## Extension installation

1. Uninstall other language packs to avoid conflicts with the official VS Code Chinese packs.
2. Search Extensions for **Cursor Language Pack** or **汉化**, or download a VSIX from [GitHub Releases](https://github.com/polang233/cursor-language-pack/releases) and use **Extensions: Install from VSIX…**.
3. Run **Language Pack: Select Display Language**, choose Simplified or Traditional Chinese, then quit Cursor completely and reopen it.

The extension id remains `polang233.cursor-language-pack`. The setting `cursorLanguagePack.language` also accepts `auto`, `zh-cn`, `zh-tw` and `en`; restart after changing it. Translating some text compiled into the app requires the command-line installation above.

The translations target Cursor **3.29.9**. New or untranslated text stays in English. Names such as Cursor and MCP stay in English.

## Development and license

[Maintenance and source tests](npm.md) · [Publishing](publishing.md) · [Architecture](architecture.md) · [Contributing](CONTRIBUTING.md)

MIT. Workbench translations come from [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc); see [NOTICE](../NOTICE). A community project, unaffiliated with Anysphere or Microsoft.
