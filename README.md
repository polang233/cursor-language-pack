# Cursor Language Pack

Community language pack for [Cursor](https://cursor.com/) — a self-contained
VS Code language pack that translates the editor workbench **and** the Cursor
strings that live in Code OSS's NLS files.

**This repository is a scaffold.** The `.vsix` is not built yet. Translations
have not been written. `npm run detect` is the only live command.

**English** · [简体中文](README.zh-CN.md)

> 中文用户请看 [简体中文说明](README.zh-CN.md)。

## Why this exists

Installing Microsoft's [Chinese (Simplified) Language Pack](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)
in Cursor translates File / Edit / Explorer / Settings (the VS Code parts). It
leaves Cursor's own UI in English: Agent, Composer, Cursor Settings, account,
the marketplace chrome, and more.

That is expected. Cursor staff have said third-party language packs work on a
best-effort basis, and that **Cursor Settings / account and the Agent/Chat
window stay English**. There is no official Chinese option and no ETA.

There is also **no Chinese Cursor language pack on the VS Marketplace or Open
VSX** as of 2026-08-18. The Chinese community tools that do exist
([Ericwyn/cursor-chinese-translate](https://github.com/Ericwyn/cursor-chinese-translate),
[somersby10ml/cursor-i18n](https://github.com/somersby10ml/cursor-i18n)) rewrite
files inside the Cursor install. They are not extensions.

This project takes the opposite order, copied from
[kiro-language-pack](https://github.com/polang233/kiro-language-pack):

1. **A normal language-pack extension first.** It replaces the official VS Code
   pack, carries the vscode-loc workbench baseline, and adds Cursor-authored
   NLS keys the Microsoft pack cannot see.
2. **An optional install patch later**, only for strings that never enter NLS
   (the React overlay: Cursor Settings, Agent/Chat). Not implemented.

A Vietnamese pack on the Marketplace already proved the extension route works:
[buivantinh.dmctn-vscode-language-pack-vi](https://marketplace.visualstudio.com/items?itemName=buivantinh.dmctn-vscode-language-pack-vi)
(~3.8k installs). There is no Chinese equivalent.

Probe against the local install (Cursor **3.16.17**, Code OSS **1.128.0**):

| Surface | Reachable by a language pack? | Notes |
| --- | --- | --- |
| VS Code workbench (menus, explorer, terminal, …) | Yes | Same `contributes.localizations` as Microsoft's pack |
| Cursor modules in `nls.messages.json` | Yes | 231 keys / 34 modules: composer, agents, aiSettings, aiConfig, cursorBlame, … |
| Cursor built-in extension manifests | Almost empty | 22 builtins, 8 `package.nls.json` keys |
| Cursor Settings / Agent / Chat overlay | No | Hard-coded / React; needs a patch, or official i18n |

So yes: there is plugin work to do even before touching the install directory.
The leftover English after the Microsoft pack is not "nothing we can reach" —
it is a mix of **Cursor NLS the official pack never shipped** and **overlay
strings no pack can ship**.

Full write-up: [docs/research.md](docs/research.md). Design: [docs/architecture.md](docs/architecture.md).
Plan: [docs/roadmap.md](docs/roadmap.md).

## Status

| | |
| --- | --- |
| Extension | Not packaged. No store listing. |
| Locales | `zh-cn` and `zh-tw` declared; glossaries only |
| Pipeline | `npm run detect` works. extract / sync / build / package are stubs |
| Patcher | Out of scope until the extension ships |

## What you can run today

Node.js 18.17 or newer.

```bash
npm install
npm run detect          # find the local Cursor install, print NLS stats
```

If Cursor is not in a default path:

```powershell
$env:CURSOR_INSTALL_DIR = "F:\AI\cursor"
npm run detect
```

## Two ways this will ship (planned)

Same split as the Kiro pack. Only the extension is in scope for the first
release.

| | **Extension** | **Extension + install patch** |
| --- | --- | --- |
| How | Install one `.vsix` | Clone this repo, run a patcher (not written) |
| Translates | Workbench + Cursor NLS in the core | The above, plus overlay strings |
| Official VS Code language pack | You uninstall it yourself | The patcher would offer to uninstall it |
| Survives a Cursor update | Yes | No — re-run after every update |
| Supported by Anysphere | It is a normal extension | No, the install is modified |

## Related project

The sibling repo [kiro-language-pack](https://github.com/polang233/kiro-language-pack)
is the same idea for Kiro IDE and is already published on Open VSX. This repo
will reuse its pipeline (detect → extract → sync vscode-loc → merge → package)
with Cursor-specific paths and a VS Marketplace-first publish target, because
Cursor's gallery is `marketplace.cursorapi.com` (a VS Marketplace proxy), not
Open VSX.

## License

MIT. Workbench strings will be derived from the MIT-licensed
[microsoft/vscode-loc](https://github.com/microsoft/vscode-loc); see [NOTICE](NOTICE).

A community project. Not affiliated with, endorsed by, or supported by
Anysphere or Microsoft.
