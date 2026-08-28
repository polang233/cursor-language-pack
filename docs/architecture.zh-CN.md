# 架构说明

Cursor Language Pack 的技术设计文档。安装与日常使用见 [README.zh-CN.md](../README.zh-CN.md)。

## 单个自包含扩展

语言包同时携带来自
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) 的编辑器主体基线**和**本项目
自己写的 Cursor 译文。因此它占用 `vscode` 这个翻译 id，会**替代** VS Code 官方语言包。两者不要
同时安装。

这不是偏好，而是 Cursor 的实现决定的。Cursor 是一个 fork，把自己的界面直接编译进了 Code OSS
内核：

```
resources/app/out/nls.messages.json
  vs/workbench/contrib/composer/…
  vs/workbench/contrib/agents/…
  vs/workbench/contrib/aiSettings/…
  vs/workbench/contrib/aiConfig/…
  vs/workbench/contrib/cursorBlame/…
  vs/workbench/contrib/cursorOrigin/…
  vs/workbench/services/cursorAuth/…
  …以及一批 `*.cursor` 模块
```

这些字符串属于 `vscode` 这个翻译 id，而不是 `anysphere.*`。宿主对每个 id 只认一个文件 ——
`%USERPROFILE%\.cursor\languagepacks.json` 把每个翻译 id 映射到唯一路径，扫描扩展时直接覆盖：

```js
for (const c of localization.translations)
  entry.translations[c.id] = join(extension.location.fsPath, c.path);
```

**没有按 key 合并的机制。** 想翻译 composer / agents 这些 NLS，就必须提供 `vscode` 这个文件，
而两个扩展不可能同时提供它。把主体基线一起打包进来，正是为了让占用这个 id 不至于让工作台退化。

这样换掉官方包不会有损失：主体译文来自钉在 Code OSS 1.128（对应 Cursor 3.17.21）的那份 MIT
许可 `vscode-loc` 快照，而且本构建还会丢掉占位符已经和原文对不上的继承译文（见[标记修复](#标记修复)）。

| 版本 | 扩展名 | 内容 | 默认 |
| --- | --- | --- | --- |
| **完整版** | `cursor-language-pack` | 主体基线 + Cursor 译文，含所有已启用语言 | 发布 |
| **互补版** | `cursor-language-pack-<locale>-companion` | 仅 Cursor 内置扩展 id | 仅本地构建，默认关闭 |

互补版能与官方包并存，因为它从不声明 `vscode`。代价是范围：Cursor 内置扩展几乎没有
`package.nls.json`，所以互补模式没有用。它在 `config.json` 里默认关闭。

## 本地化机制

VS Code（因此也是 Cursor）通过语言包贡献点解析界面字符串。语言包是一个可以没有代码的扩展，
每种语言一条：

```json
{
  "contributes": {
    "localizations": [
      {
        "languageId": "zh-cn",
        "languageName": "Chinese Simplified",
        "localizedLanguageName": "中文（简体）",
        "translations": [
          { "id": "vscode", "path": "./translations/zh-cn/main.i18n.json" }
        ]
      }
    ]
  }
}
```

缺译文的键静默回落英文。宿主会读每个已装扩展的 `contributes.localizations`，所以一个扩展可以
服务多种语言。

显示语言写在 `~/.cursor/argv.json` 的 `locale`。改它必须整进程重启，重载窗口无效。

## 构建流水线

```
Cursor 安装目录 ──(extract)──> metadata/cursor.json ─────┐
                                                        │
microsoft/vscode-loc ──(sync)──> upstream/<locale>/ ─────┼──(build)──> dist/<pack>/ ──(package)──> .vsix
                                                        │
src/i18n/<locale>/{overrides,cursor} ───────────────────┘
```

`metadata/cursor.json` 是本机安装里每一条可本地化键的快照，用途是过滤、标记修复、缺口分析、覆盖率分母。CI 没有 Cursor 安装时可以跳过这份快照。

`upstream.ref` 必须钉在接近 Cursor `vscodeVersion`（1.128.x）的 vscode-loc 提交上，不要追 `main`。追更新的 VS Code 线，文件 / 编辑 / 查看菜单会错位回英文。

## 标记修复

`scripts/lib/markers.mjs` 对比 `{0}` 占位符、`$(codicon)` 图标和 `(command:…)` 链接。继承基线里对不上的丢掉；本仓库自己维护的文件对不上则报错。

## 语言包做不到的

Cursor Settings、Agent/Chat 浮层以及类似的 React 界面不在 `nls.messages.json` 里，语言包碰不到。安装目录补丁在扩展成为用户装的产品之前不做。

## 运行时

语言包不需要代码，译文没有它也能工作。仍然带了一个很小的 `main.cjs`，用来选语言，以及在另一个扩展也声称 `vscode` 时警告。

它只做这些：读 `product.json` 得知用户数据目录名；读写 `argv.json` 的 `locale` 字段（只有你确认后才写）；读已装扩展清单以发现冲突语言包；在自己的 globalState 里存两个「不再询问」标记。不联网、不遥测。`argv.json` 是原地改一个字段，所以 `npm test` 专门测这一处。

## 仓库布局

```
config.json                       发布者、版本、语言、构建模式
src/
  manifest.template.json          扩展清单骨架
  extension/main.cjs              运行时：选语言、冲突警告
  marketplace/README.md           商店页正文
  i18n/<locale>/
    glossary.json                 术语表
    extension.l10n.json           运行时自己的提示
    cursor/core.*.i18n.json       Cursor 编进内核的字符串
    overrides/main.i18n.json      对 vscode-loc 基线的修正
scripts/                          构建流水线
metadata/  upstream/  dist/  reports/   生成物，已 gitignore
```

`cursor/` 下任何名为 `core*.i18n.json` 的文件都会合并进 `vscode` 翻译 id。
