# Roadmap

Scaffold is done. Implementation is intentionally later. Port from
`../Kiro` (kiro-language-pack) instead of rewriting.

## Phase 0 — this commit

- [x] Repo, git, MIT, NOTICE
- [x] Docs: research, architecture, publishing, contributing
- [x] `config.json` with zh-cn / zh-tw enabled, other locales declared
- [x] Glossaries
- [x] `npm run detect` against a local Cursor install
- [ ] 128×128 `media/icon.png`
- [ ] GitHub remote `polang233/cursor-language-pack` (create when you want it public)

## Phase 1 — plugin (the actual product)

Port, in this order, renaming Kiro → Cursor:

1. `scripts/extract.mjs` → `metadata/cursor.json`
2. `scripts/sync-upstream.mjs` — pin vscode-loc near Cursor 1.128, not latest main
3. `scripts/gap.mjs` — list Cursor-authored keys missing from vscode-loc
4. `scripts/build.mjs` + `src/extension/main.cjs` (language picker + conflict warning)
5. Translate `src/i18n/zh-cn/cursor/` (231 keys / 34 modules on 3.16.17, plus any
   gap the heuristic missed). Then OpenCC → zh-tw and hand-edit Taiwan terms
6. `validate` / `coverage` / `package`
7. `engines.vscode` = `^1.128.0` until an older Cursor is verified
8. Publish **VS Marketplace** first (`VSCE_PAT`). Open VSX optional
9. README install: uninstall `MS-CEINTL.vscode-language-pack-zh-hans`, install
   this pack, Configure Display Language, restart Cursor

Do not ship a patch in this phase. Incomplete overlay translation is documented,
not a bug.

## Phase 2 — optional install patch

Only after the extension is installable:

- Decide mechanism: string rewrite in `nls.messages.json` / `main.js` (Kiro-style)
  vs `workbench.html` script injection (Ericwyn-style). Prefer rewrite of known
  literals over injecting a MutationObserver into the workbench
- Never publish the patcher to VS Marketplace
- Survive checksums (`product.json` checksums of `workbench.html`)
- `npm run patch -- --restore` must be real
- Re-apply after every Cursor update; `check-upgrade` should say so

## Explicit non-goals for v0.1

- Translating model output / chat replies (steering / rules, not this pack)
- Supporting locales beyond zh-cn / zh-tw
- Coexisting with the official Microsoft pack
- Shipping on Open VSX before VS Marketplace
