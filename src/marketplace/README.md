# Cursor Language Pack — 简体中文 / 繁體中文

[![Open VSX](https://img.shields.io/open-vsx/v/polang233/cursor-language-pack?label=Open%20VSX)](https://open-vsx.org/extension/polang233/cursor-language-pack)
[![Downloads](https://img.shields.io/open-vsx/dt/polang233/cursor-language-pack)](https://open-vsx.org/extension/polang233/cursor-language-pack)

![Cursor Language Pack](../../media/icon.png)

**Cursor IDE 中文语言包（汉化 / 中文翻译）。** 翻译编辑器主体，以及 Cursor 写进内核的界面文案。当前发布简体中文和繁体中文。

Community language pack for [Cursor](https://cursor.com/). Ships **Simplified Chinese** and **Traditional Chinese**. Other languages can be added by contributors.

> 安装前请先卸载其他语言包。本扩展**替代** VS Code 官方中文语言包，两个包不要并存，否则每次重启翻译都会乱。
>
> Uninstall any other language pack first. This pack **replaces** the official VS Code one.

## 安装 / Install

1. 卸载其他语言包。Uninstall other language packs.
2. 在 Cursor 扩展视图搜索 **汉化**、**中文语言包**、**中文翻译** 或 **Cursor Language Pack** → 安装。
   In Cursor: Extensions → search those terms → Install.
   商店页: [open-vsx.org/extension/polang233/cursor-language-pack](https://open-vsx.org/extension/polang233/cursor-language-pack)
3. 命令面板 → **Language Pack: Select Display Language** → 选 **中文（简体）** 或 **中文（繁體）** → **重启** Cursor。

显示语言是启动参数，必须重启，重载窗口无效。 Restart Cursor; reload is not enough.

也可以从 [GitHub Release](https://github.com/polang233/cursor-language-pack/releases) 下 `.vsix`，命令面板 → **Extensions: Install from VSIX…**。

## 切换语言 / Switching language

不用重装：

- 命令面板 **Language Pack: Select Display Language**
- 设置 `cursorLanguagePack.language`：`auto` / `zh-cn` / `zh-tw` / `en`
- Cursor 自带的 **Configure Display Language**

选 `en` 就回到英文，扩展还在。

## 翻译范围 / What is translated

已包含：

- 编辑器主体（底座来自 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)，钉在 Code OSS 1.128，对齐 Cursor 3.16.17）
- Cursor 写进内核的 NLS：composer、agents、aiSettings、aiConfig、cursorBlame 等

碰不到（不在 `nls.messages.json` 里）：Cursor Settings、Agent/Chat 浮层、账号和商店浮层。这些请不要提翻译 issue。

已对齐 Cursor **3.16.17**。其他版本一般能用，新增字符串会先显示英文。界面语言和 AI 回复语言无关。

## 其他语言 / Other languages

简体和繁体已经发布。日语、韩语、法语、德语、西班牙语等已在仓库里预留，**还没有译文**，需要对应语言的用户自己翻、提 PR。没翻的键显示英文。

Shipped: `zh-cn`, `zh-tw`. Other locales are declared in the repo and waiting for translations.

贡献: [polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack)

## 隐私 / Privacy

只在你确认后写 `argv.json` 的 `locale`。不联网，不采集。

## 许可 / License

MIT. 工作台译文来自 MIT 许可的 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)。

社区项目，与 Anysphere、Microsoft 无隶属关系。

文档: [English](https://github.com/polang233/cursor-language-pack#readme) · [简体中文](https://github.com/polang233/cursor-language-pack/blob/main/README.zh-CN.md)
