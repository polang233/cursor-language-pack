# Research (2026-08-18)

Why a Cursor language-pack **extension** is worth building, what already exists,
and what a pack can actually reach. This is the decision record. Product shape
is in [architecture.md](architecture.md); sequencing is in [roadmap.md](roadmap.md).

Probed install: Cursor **3.16.17** (stable, commit `6b2afae0…`, 2026-08-14) at
`F:\AI\cursor`, Code OSS **1.128.0**, `dataFolderName` `.cursor`.
Gallery: `https://marketplace.cursorapi.com/_apis/public/gallery`.

## 1. Is there already a Cursor Chinese plugin on the store?

**No Chinese Cursor language pack as a VS Code extension** showed up on the
[VS Marketplace Language Packs search](https://marketplace.visualstudio.com/search?term=cursor%20language%20pack&target=VSCode&category=Language%20Packs&sortBy=Relevance)
or on [Open VSX](https://open-vsx.org/?search=cursor%20language%20pack) on
2026-08-18.

What users actually install today is Microsoft's
[Chinese (Simplified) Language Pack for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-zh-hans)
(`MS-CEINTL.vscode-language-pack-zh-hans`). Tutorials tell people to search
"chinese" inside Cursor and pick that pack. That is a VS Code pack, not a
Cursor pack.

The one Marketplace hit that *is* Cursor-aware is Vietnamese, not Chinese:

- [Tiếng Việt (DMCTN) Language Pack for VS Code & Cursor](https://marketplace.visualstudio.com/items?itemName=buivantinh.dmctn-vscode-language-pack-vi)
  (`buivantinh.dmctn-vscode-language-pack-vi`), ~3.8k installs, last updated
  2026-05-02. It is a normal language pack. Version 1.0.9 explicitly splits
  **Cursor-only UI patching into a separate companion that they refuse to put
  on the Marketplace**, because it rewrites install files.

That is the same split this repo wants: plugin on the store, patch optional and
off-store.

## 2. What the Chinese community already built (not plugins)

These rewrite the Cursor install. They are not `.vsix` language packs.

| Project | Mechanism | Notes |
| --- | --- | --- |
| [Ericwyn/cursor-chinese-translate](https://github.com/Ericwyn/cursor-chinese-translate) | Python. Injects `cursor_hanhua.js` into `workbench.html`, patches `product.json` checksum; optionally rewrites `out/main.js` / `nls.messages.json` for native menus | 13 stars. Reads `state.vscdb` for tokens in some versions. Dies on Cursor update |
| [Lovest20018/cursor-v3-chinese-translate](https://github.com/Lovest20018/cursor-v3-chinese-translate) | Fork of the above | Still a patcher. Last commits 2026-07 |
| [somersby10ml/cursor-i18n](https://github.com/somersby10ml/cursor-i18n) | `npx cursor-i18n apply` — "translation layer" over the install | 4 stars. zh-cn among 6 locales. Re-apply after every Cursor update |

They exist because the overlay is otherwise unreachable. They are also why a
clean extension is a gap: people who will not (and should not) patch
`Cursor.exe`'s `resources/app` currently have only the Microsoft pack.

## 3. Official position on localization

Cursor staff, [2026-07-12](https://forum.cursor.com/t/bug-japanese-language-pack-only-translates-the-run-menu-in-cursor-3-11-13/165485):

> Cursor is a VS Code fork, and third-party language packs work on a
> best-effort basis. Most of the UI gets translated, but some menu chrome stays
> in English, including the top-level menu bar labels File, Edit, Selection,
> View, Go, Terminal, Help. **Cursor's own pages Settings/account and the
> Agent/Chat window also stay in English.**

They also noted that when Cursor and the Microsoft pack both update, the NLS
bundle can **desync** from the fork and previously translated menus revert to
English. Rolling the pack back is the workaround. Full UI localization is an
open feature request with **no ETA**
([Add support for Chinese](https://forum.cursor.com/t/add-support-for-chinese/91148)).

Chinese users have been asking for Settings localization specifically:
[Add Chinese localization for Cursor Settings UI](https://forum.cursor.com/t/add-chinese-localization-for-cursor-settings-ui/163648)
(2026-06-19).

So: the leftover English is acknowledged, official i18n is not coming soon, and
even the VS Code workbench can regress when the Microsoft pack tracks a
*different* Code OSS version than Cursor (this tree is on **1.128.0**).

## 4. Local NLS probe

Same layout as current Code OSS / Kiro:

```
resources/app/out/nls.keys.json      [[moduleId, [key, …]], …]
resources/app/out/nls.messages.json  [english, …]  same order
```

| Metric (3.16.17) | Count |
| --- | --- |
| Core modules | 1148 |
| Core keys | 13623 (keys and messages aligned) |
| Cursor-authored modules (heuristic) | 34 |
| Cursor-authored keys | **231** |
| Built-in extensions | 95+ |
| Cursor-named builtins | 22 |
| `package.nls.json` keys on those | **8** |

Heuristic (see `scripts/lib/cursor-paths.mjs` → `isCursorAuthoredModule`):
module paths under `composer`, `agents`, `aiConfig`, `aiSettings`, `cursor*`,
`*.cursor`, minus VS Code's own `multicursor`.

Examples that **are** in NLS and therefore pack-reachable:

- `vs/workbench/contrib/aiSettings/.../settingsRulesTab` — "Import Project Rules from GitHub/GitLab", …
- `vs/workbench/contrib/aiConfig/browser/aiconfig.contribution` — "General", HTTP/2, plan text size, conversation density
- `vs/workbench/contrib/agents/browser/agentsQuickAccess` — "Chats", "Cloud agents", "No chats available"
- `vs/workbench/contrib/composer/...` — browser tab chrome, chimes, "Cursor AI"
- `vs/workbench/contrib/cursorBlame/...`, `cursorOrigin`, `cursorAuth`, terminal Cursor contribs

Examples that **are not** in NLS (staff + Vietnamese pack + patcher authors agree):

- Cursor Settings main page (Models, MCP, Rules, Billing, Account)
- Agent / Chat overlay
- A lot of marketplace / account chrome

Companion-only mode (claim Cursor extension ids, leave `vscode` to Microsoft) is
**not useful** here: those 8 manifest keys are noise. Owning `vscode` is required,
same as Kiro.

## 5. Decision

| Question | Answer |
| --- | --- |
| Store plugin for Chinese Cursor already? | No |
| Worth doing a plugin anyway? | Yes |
| Replace the Microsoft pack? | Yes — must, to add Cursor NLS keys |
| Will the plugin finish the job? | No. Overlay stays English until a patch or official i18n |
| Patch first? | No. Plugin first, patch later, off the Marketplace |
| Primary registry | VS Marketplace (`VSCE_PAT`), because Cursor's gallery proxies it |
| Open VSX | Optional. Unlike Kiro, Cursor does not search Open VSX by default |

Sister evidence: Kiro compiled much more of its UI into the core (~1159 keys).
Cursor compiled less (231) and left the rest in a React overlay. The plugin
still pays for itself: it can pin vscode-loc to Cursor's 1.128 line (fixing
menu-bar desync) **and** cover those 231 Cursor keys. That is strictly more
than `MS-CEINTL` plus nothing.
