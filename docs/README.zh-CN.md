# 文档索引

安装与使用见根目录 [README.zh-CN](../README.zh-CN.md) / [README](../README.md)。
本目录下的内容面向贡献者与维护者。

| 文档 | 语言 | 内容 |
| --- | --- | --- |
| [architecture.zh-CN.md](architecture.zh-CN.md) · [EN](architecture.md) | 简体中文 · EN | 为什么做成一个自包含扩展、本地化如何解析、构建流水线、运行时 |
| [publishing.zh-CN.md](publishing.zh-CN.md) · [EN](publishing.md) | 简体中文 · EN | Open VSX 优先（Cursor 搜索）、`OVSX_PAT` / `VSCE_PAT`、Cursor 升级后再发 |

两个不在本目录、但很容易漏掉的地方：

- **新增语言** — [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-language)。语言列表在 `config.json` 里，不需要改脚本。
- **扩展市场页面** — `src/marketplace/README.md`。构建时会复制进 `.vsix`。
- **给后续 AI 的发布说明** — 根目录 [AGENTS.md](../AGENTS.md)（`OVSX_PAT`、打 tag 发版流程）

贡献流程、译文规则、提 PR 前的检查项：[CONTRIBUTING.md](../CONTRIBUTING.md)。

姊妹项目：[kiro-language-pack](https://github.com/polang233/kiro-language-pack)。
