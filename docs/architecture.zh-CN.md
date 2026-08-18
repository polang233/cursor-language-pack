# 架构

技术设计。发布之后的用法见 [README.zh-CN.md](../README.zh-CN.md)。为什么做：
[research.zh-CN.md](research.zh-CN.md)。

流水线还没实现。本文是目标形态，从
[kiro-language-pack](https://github.com/polang233/kiro-language-pack) 搬过来，按 Cursor 改过。

## 自包含单扩展

包会带上 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) 的工作台基线，
**加上**本项目写的 Cursor 译文。因此它拥有 `vscode` 这个 translation id，**替代**
VS Code 官方语言包。不要两个一起装。

主机解析本地化的方式决定了这一点。`%USERPROFILE%\.cursor\languagepacks.json`
把每个 translation id 映射到**一个**路径，扩展扫描时后写覆盖先写，没有按 key 合并。

Cursor 里走了 `nls.localize` 的自有字符串在：

```
resources/app/out/nls.messages.json
  vs/workbench/contrib/composer/…
  vs/workbench/contrib/agents/…
  vs/workbench/contrib/aiSettings/…
  vs/workbench/contrib/aiConfig/…
  vs/workbench/contrib/cursorBlame/…
  …
```

它们属于 `vscode`，不属于 `anysphere.*`。要译它们就必须提供 `vscode` 那份文件。
把 vscode-loc 基线一并带上，占有这个 id 才安全。

companion 模式（只声明 Cursor 扩展 id）在 `config.json` 里关着。Cursor 内置扩展几乎没有
`package.nls.json`。

## 本地化怎么工作

语言包是无代码扩展，声明 `contributes.localizations`。缺的 key 静默回落英文。
显示语言写在 `~/.cursor/argv.json` 的 `locale`，必须整进程重启，重载窗口无效。

## 计划中的流水线

```
Cursor 安装 ──(extract)──> metadata/cursor.json ─────┐
                                                     │
microsoft/vscode-loc ──(sync)──> upstream/<locale>/ ──┼──(build)──> dist/<pack>/ ──(package)──> .vsix
                                                     │
src/i18n/<locale>/{overrides,cursor} ────────────────┘
```

`metadata/cursor.json` 是已装构建里每一个可本地化 key 的快照：过滤 Cursor 没有的键、
丢掉占位符已经对不上的继承译文（也就是官方说的菜单栏错位）、给 coverage 一个真实分母。

`upstream.ref` 要钉在接近 Cursor `vscodeVersion`（探测时是 1.128.x）的 vscode-loc 快照上，
不要盲目跟 `main`。跟踪比 fork 更新的 VS Code 线，正是 File/Edit/View 退回英文的原因。

## 语言包做不到的

Cursor Settings、Agent/Chat 这类浮层不在 `nls.messages.json` 里。语言包到不了。
第二阶段才是可选的安装补丁（注入 workbench.html 或改字符串），见 [roadmap.md](roadmap.md)，
不上 Marketplace。和越南语 DMCTN 包的结论相同。

## 运行时（计划）

语言包不需要代码。Kiro 包仍然带了一个很小的 `main.cjs`，用来选语言、以及在另一个扩展也声称
`vscode` 时警告。把那份文件迁过来，把 `kiroLanguagePack` 改成 `cursorLanguagePack`，
从 `product.json` 读 `dataFolderName`（`.cursor`）。
