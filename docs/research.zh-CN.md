# 调研记录（2026-08-18）

为什么值得做 Cursor 语言包**扩展**、店里已经有什么、语言包实际能覆盖哪里。这是决策记录。
产品形态见 [architecture.zh-CN.md](architecture.zh-CN.md)，节奏见 [roadmap.md](roadmap.md)。

探测环境：Cursor **3.16.17**（stable，commit `6b2afae0…`，2026-08-14），安装在
`F:\AI\cursor`，内核 Code OSS **1.128.0**，`dataFolderName` 为 `.cursor`。
扩展源：`https://marketplace.cursorapi.com/_apis/public/gallery`。

## 1. Cursor 市场上有没有现成的中文插件？

2026-08-18 在 [VS Marketplace 语言包搜索](https://marketplace.visualstudio.com/search?term=cursor%20language%20pack&target=VSCode&category=Language%20Packs&sortBy=Relevance)
和 [Open VSX](https://open-vsx.org/?search=cursor%20language%20pack) 上，**没有**中文的
Cursor 语言包扩展。

大家现在装的是微软的
[Chinese (Simplified) Language Pack for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)
（`MS-CEINTL.vscode-language-pack-zh-hans`）。教程会让人在 Cursor 里搜 "chinese" 然后装这个。
那是 VS Code 的包，不是 Cursor 的包。

商店里真正「提到 Cursor」的语言包是越南语，不是中文：

- [Tiếng Việt (DMCTN) Language Pack for VS Code & Cursor](https://marketplace.visualstudio.com/items?itemName=buivantinh.dmctn-vscode-language-pack-vi)
  （`buivantinh.dmctn-vscode-language-pack-vi`），约 3.8k 安装，最近更新 2026-05-02。
  正规语言包。1.0.9 明确把 **Cursor 专有 UI 的补丁拆成单独的伴随包，并且不上 Marketplace**，
  因为会改安装目录。

这正是本仓库要走的分层：商店上架插件，补丁可选、不上架。

## 2. 中文社区已经有的（都不是插件）

这些都会改 Cursor 安装目录，不是 `.vsix` 语言包。

| 项目 | 做法 | 备注 |
| --- | --- | --- |
| [Ericwyn/cursor-chinese-translate](https://github.com/Ericwyn/cursor-chinese-translate) | Python。往 `workbench.html` 注入 `cursor_hanhua.js`，改 `product.json` 校验；可选改 `out/main.js` / `nls.messages.json` 做原生菜单 | 13 star。部分版本会读 `state.vscdb` 的 token。Cursor 一更新就失效 |
| [Lovest20018/cursor-v3-chinese-translate](https://github.com/Lovest20018/cursor-v3-chinese-translate) | 上面的 fork | 仍然是补丁。最近提交 2026-07 |
| [somersby10ml/cursor-i18n](https://github.com/somersby10ml/cursor-i18n) | `npx cursor-i18n apply`，在安装上叠一层「翻译层」 | 4 star。含 zh-cn。每次更新要重跑 |

它们存在，是因为浮层否则不可达。这也说明干净扩展是空缺：不愿意（也不该）去改
`resources/app` 的人，现在只能用微软包。

## 3. 官方对本地化的态度

Cursor 员工，[2026-07-12](https://forum.cursor.com/t/bug-japanese-language-pack-only-translates-the-run-menu-in-cursor-3-11-13/165485)：

> Cursor 是 VS Code 的 fork，第三方语言包是 best-effort。大部分 UI 能被翻译，但一部分菜单栏会保持英文，包括顶层的 File、Edit、Selection、View、Go、Terminal、Help。**Cursor 自己的 Settings/账号页和 Agent/Chat 窗口也会保持英文。**

他们还指出：Cursor 和微软语言包一起更新时，NLS 会和 fork **对不齐**，原先已经汉化的菜单会退回英文。权宜之计是回滚语言包版本。完整 UI 本地化是 open feature request，**没有 ETA**
（[Add support for Chinese](https://forum.cursor.com/t/add-support-for-chinese/91148)）。

中文用户专门在要 Settings 汉化：
[Add Chinese localization for Cursor Settings UI](https://forum.cursor.com/t/add-chinese-localization-for-cursor-settings-ui/163648)
（2026-06-19）。

结论：残留英文是官方承认的，官方 i18n 短期内不会来；连 VS Code 工作台都会因为微软包跟踪的 Code OSS 版本和 Cursor 不一致而回退（本机是 **1.128.0**）。

## 4. 本机 NLS 探测

和当前 Code OSS / Kiro 同一套布局：

```
resources/app/out/nls.keys.json      [[moduleId, [key, …]], …]
resources/app/out/nls.messages.json  [english, …]  同序
```

| 指标（3.16.17） | 数量 |
| --- | --- |
| 内核模块 | 1148 |
| 内核 key | 13623（keys 与 messages 对齐） |
| Cursor 自有模块（启发式） | 34 |
| Cursor 自有 key | **231** |
| 内置扩展 | 95+ |
| Cursor 命名的内置扩展 | 22 |
| 这些扩展上的 `package.nls.json` | **8 条** |

启发式（见 `scripts/lib/cursor-paths.mjs` → `isCursorAuthoredModule`）：
`composer`、`agents`、`aiConfig`、`aiSettings`、`cursor*`、`*.cursor` 路径，去掉 VS Code 自己的 `multicursor`。

语言包**能**覆盖的例子：

- `vs/workbench/contrib/aiSettings/.../settingsRulesTab` — 「从 GitHub/GitLab 导入项目规则」这类
- `vs/workbench/contrib/aiConfig/browser/aiconfig.contribution` — General、HTTP/2、计划字号、对话密度
- `vs/workbench/contrib/agents/browser/agentsQuickAccess` — Chats、Cloud agents
- `vs/workbench/contrib/composer/...` — 内置浏览器标签、chimes、「Cursor AI」
- `cursorBlame`、`cursorOrigin`、`cursorAuth`、终端里的 Cursor contrib

语言包**不能**覆盖的（官方 + 越南语包作者 + 补丁作者一致）：

- Cursor Settings 主页面（Models、MCP、Rules、Billing、Account）
- Agent / Chat 浮层
- 大量商店 / 账号铬框

只做 companion（只声明 Cursor 扩展 id，把 `vscode` 留给微软包）**在这里没用**：那 8 条清单键可以忽略。必须自己占有 `vscode`，和 Kiro 一样。

## 5. 结论

| 问题 | 答案 |
| --- | --- |
| 店里已有中文 Cursor 插件？ | 没有 |
| 值得做插件吗？ | 值得 |
| 要不要替代微软包？ | 要 — 否则加不进 Cursor 的 NLS 键 |
| 插件能做完吗？ | 不能。浮层仍英文，除非补丁或官方 i18n |
| 先做补丁？ | 不。先插件，补丁后做，不上 Marketplace |
| 主商店 | VS Marketplace（`VSCE_PAT`），因为 Cursor 的 gallery 就是它的代理 |
| Open VSX | 可选。和 Kiro 不同，Cursor 默认不搜 Open VSX |

对照：Kiro 把大量自有 UI 编进了内核（约 1159 键）。Cursor 编进去的少（231），其余放在 React 浮层。插件仍然划算：可以把 vscode-loc 钉在 Cursor 的 1.128 线上（修菜单栏错位），**再**补上这 231 个 Cursor 键。这严格多于「只装 `MS-CEINTL`」。
