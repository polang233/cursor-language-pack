# Documentation

Installing and using the pack: root [README.md](../README.md) (English) /
[README.zh-CN.md](../README.zh-CN.md) (简体中文). Everything here is for contributors and maintainers.

| Document | Language | What it covers |
| --- | --- | --- |
| [architecture.md](architecture.md) · [zh-CN](architecture.zh-CN.md) | EN · 简体中文 | Why one self-contained extension, localization, build, runtime |
| [publishing.md](publishing.md) · [zh-CN](publishing.zh-CN.md) | EN · 简体中文 | Release steps, `OVSX_PAT` / `VSCE_PAT`, ship again after a Cursor update |

Also outside this folder:

- **Adding a language** — [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-language)
- **Full translation** — user steps in [README.md](../README.md#full-translation). Strings live in `src/i18n/<locale>/hardcoded.json`; the command is `npm run translate`.
- **Extension marketplace page** — `src/marketplace/README.md` (copied into the `.vsix`)
- **Agent / release notes** — root [AGENTS.md](../AGENTS.md) (`OVSX_PAT`, tag-and-push flow)

Contributor workflow: [CONTRIBUTING.md](../CONTRIBUTING.md).
