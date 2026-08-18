# Cursor Language Pack

[Cursor](https://cursor.com/) 的社区语言包：一个自包含的 VS Code 语言包，翻译编辑器主体，**以及** Cursor 写进 Code OSS NLS 文件里的文案。

**这个仓库目前是骨架。** 还没有 `.vsix`，还没有译文。唯一能跑的命令是 `npm run detect`。

[English](README.md) · **简体中文**

## 为什么要做

在 Cursor 里装微软的 [Chinese (Simplified) Language Pack](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)，能汉化文件 / 编辑 / 资源管理器 / 部分设置（也就是 VS Code 那一层）。Cursor 自己的界面会继续是英文：Agent、Composer、Cursor Settings、账号、商店页等等。

这是预期行为。Cursor 官方在论坛里说过，第三方语言包是 best-effort，**Cursor Settings / 账号和 Agent/Chat 窗口会保持英文**，官方中文没有排期。

截至 2026-08-18，**VS Marketplace 和 Open VSX 上都没有中文的 Cursor 语言包插件**。社区里已有的中文方案（[Ericwyn/cursor-chinese-translate](https://github.com/Ericwyn/cursor-chinese-translate)、[somersby10ml/cursor-i18n](https://github.com/somersby10ml/cursor-i18n)）都是改 Cursor 安装目录，不是扩展。

本项目采用和 [kiro-language-pack](https://github.com/polang233/kiro-language-pack) 相同的顺序：

1. **先做正规语言包扩展。** 替代 VS Code 官方包，带上 vscode-loc 的 workbench 基线，并补上微软包看不到的 Cursor NLS 键。
2. **改不动的再考虑硬编译 / 安装目录补丁**（Cursor Settings、Agent/Chat 这类 React 浮层）。还没做。

越南语已经有人在 Marketplace 上走过扩展这条路：[buivantinh.dmctn-vscode-language-pack-vi](https://marketplace.visualstudio.com/items?itemName=buivantinh.dmctn-vscode-language-pack-vi)（约 3.8k 安装）。中文缺这一环。

对着本机 Cursor **3.16.17**（Code OSS **1.128.0**）的探测结果：

| 界面 | 语言包能不能到 | 说明 |
| --- | --- | --- |
| VS Code 工作台（菜单、资源管理器、终端…） | 能 | 和微软包同一个 `contributes.localizations` |
| `nls.messages.json` 里的 Cursor 模块 | 能 | 231 个键 / 34 个模块：composer、agents、aiSettings、aiConfig、cursorBlame… |
| Cursor 内置扩展清单 | 几乎没有 | 22 个内置扩展，一共 8 条 `package.nls.json` |
| Cursor Settings / Agent / Chat 浮层 | 不能 | 硬编码 / React；要补丁，或者等官方 i18n |

所以：就算不碰安装目录，插件也有活干。微软包装完仍是英文，并不等于「全是改不动的」——一部分是 **Cursor 写进 NLS、官方包没带的键**，一部分才是 **语言包永远碰不到的浮层**。

详细记录：[docs/research.md](docs/research.md)。设计：[docs/architecture.md](docs/architecture.md)。计划：[docs/roadmap.md](docs/roadmap.md)。

## 现状

| | |
| --- | --- |
| 扩展 | 未打包，没有商店页 |
| 语言 | 已声明 `zh-cn` / `zh-tw`，目前只有术语表 |
| 流水线 | `npm run detect` 可用。extract / sync / build / package 还是占位 |
| 补丁 | 扩展上架之前不做 |

## 现在能跑的

Node.js 18.17 或更新。

```bash
npm install
npm run detect          # 找本机 Cursor，打印 NLS 规模
```

如果 Cursor 不在默认路径：

```powershell
$env:CURSOR_INSTALL_DIR = "F:\AI\cursor"
npm run detect
```

## 计划中的两种安装方式

和 Kiro 语言包同一套分层。第一版只做扩展。

| | **扩展** | **扩展 + 安装补丁** |
| --- | --- | --- |
| 做法 | 装一个 `.vsix` | clone 本仓库，跑补丁（未写） |
| 能翻译 | 工作台 + 内核里的 Cursor NLS | 再加上浮层文案 |
| 官方 VS Code 语言包 | 你自己先卸 | 补丁可以代卸 |
| Cursor 更新后 | 还在 | 失效，要重跑 |
| Anysphere 是否支持 | 这是正规扩展 | 否，改了安装 |

## 相关项目

姊妹仓库 [kiro-language-pack](https://github.com/polang233/kiro-language-pack) 是同一思路在 Kiro 上的已发布产品。本仓库会复用那套流水线（detect → extract → sync vscode-loc → 合并 → 打包），换成 Cursor 的路径，并且**优先发 VS Marketplace**：Cursor 的扩展源是 `marketplace.cursorapi.com`（微软商店代理），不是 Open VSX。

## 许可

MIT。工作台译文将来会来自 MIT 许可的 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)；见 [NOTICE](NOTICE)。

社区项目。与 Anysphere、Microsoft 无隶属、无背书、无支持关系。
