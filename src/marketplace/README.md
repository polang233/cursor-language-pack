# Cursor Language Pack — 简体中文 / 繁體中文

![Cursor Language Pack](../../media/icon.png)

Community language pack for [Cursor](https://cursor.com/). One extension, two languages:
**Simplified Chinese (简体中文)** and **Traditional Chinese (繁體中文)**. It translates the
editor workbench *and* Cursor-authored NLS strings the official VS Code pack cannot see.

**简体中文** — Cursor IDE 中文语言包（汉化）。一个扩展内含简体与繁体中文，覆盖编辑器主体和 Cursor 写进内核的界面文案。安装后在命令面板选择显示语言即可。

**繁體中文** — Cursor IDE 中文語言包（漢化）。一個擴充內含簡體與繁體中文，涵蓋編輯器主體與 Cursor 寫進核心的介面文案。安裝後在命令選擇區選擇顯示語言即可。

> **Read this first / 请先看这条:** this pack **replaces** the official VS Code language pack.
> Uninstall `Chinese (Simplified) Language Pack for Visual Studio Code` (or any other language
> pack) before installing it — two packs installed together produce a UI that is translated
> differently after each restart.
>
> 本扩展**替代** VS Code 官方中文语言包。安装前请先卸载官方语言包或其他语言包，不要并存，否则界面每次
> 重启的翻译结果都不一样。

## Install / 安装

1. Uninstall any other language pack. 先卸载其他语言包。
2. Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **Extensions: Install from VSIX…**
   命令面板 → **Extensions: Install from VSIX…**
3. **Language Pack: Select Display Language** → pick **中文（简体）** or **中文（繁體）** → restart Cursor.
   选择语言 → 重启 Cursor。

The display language is a launch argument, so Cursor must be restarted — reloading the window is
not enough. 显示语言是启动参数，必须重启 Cursor，重载窗口无效。

## Switching language / 切换语言

Three equivalent ways, none of which need a reinstall:
三种方式等价，都不用重装扩展：

- **Language Pack: Select Display Language** in the Command Palette / 命令面板里的这条命令
- the `cursorLanguagePack.language` setting — `auto`, `zh-cn`, `zh-tw`, `en` / 设置项
- Cursor's built-in **Configure Display Language** / Cursor 自带的命令

Choosing `en` returns the whole UI to English with the pack still installed.
选 `en` 就是整个界面回到英文，扩展留着，随时可以再切回来。

## What is translated / 翻译范围

Included / 已包含:

- The editor workbench — baseline from [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)
  / 编辑器主体，底座取自 vscode-loc（钉在 Code OSS 1.128，对齐 Cursor 3.16.17）
- Cursor-authored NLS in the core: composer, agents, aiSettings, aiConfig, cursorBlame, …
  / Cursor 写进内核的 NLS

Still English / 仍是英文: Cursor Settings, the Agent/Chat overlay, account and marketplace chrome.
Cursor does not put those strings in `nls.messages.json`, so no language pack can reach them.
这几处不在 NLS 里，任何语言包都碰不到。

Reconciled against Cursor **3.16.17**. Other builds work; strings Cursor adds later fall back to English.
已对齐 Cursor 3.16.17；其他版本可用，之后新增的字符串会先回落英文。

The UI language is independent of the language the AI replies in.
界面语言与 AI 回复语言无关。

## Want your language? / 想要其他语言？

Japanese, Korean, French, German, Spanish, Italian, Russian, Portuguese (Brazil), Turkish,
Polish and Czech are already declared in `config.json`. Untranslated keys fall back to English.

Contribute on GitHub: **[polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack)**

## Privacy / 隐私

The extension writes exactly one thing, and only after you confirm it: the `locale` field in
`argv.json`. No network requests, no telemetry, no other files.
本扩展只在你确认后写入 `argv.json` 的 `locale` 字段，不联网、不采集遥测、不动其他文件。

## License / 许可

MIT. Workbench strings are derived from the MIT-licensed
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc).

A community project. Not affiliated with, endorsed by, or supported by Anysphere or Microsoft.
社区项目，与 Anysphere、Microsoft 无隶属关系。

Documentation / 完整文档:
[English](https://github.com/polang233/cursor-language-pack#readme) ·
[简体中文](https://github.com/polang233/cursor-language-pack/blob/main/README.zh-CN.md)
