# Publishing the language pack

Cursor’s in-app extension search uses **[Open VSX](https://open-vsx.org/)** (via
`marketplace.cursorapi.com`). Publish there first, or Cursor users will not find the pack.
The VS Code Marketplace listing is optional extra exposure — it is **not** what Cursor
searches.

`config.json` → `publisher` is `polang233`. Same string on Open VSX (namespace) and
VS Marketplace (publisher).

中文说明：[publishing.zh-CN.md](publishing.zh-CN.md)

| | |
| --- | --- |
| Extension id | `polang233.cursor-language-pack` |
| Open VSX (required) | https://open-vsx.org/extension/polang233/cursor-language-pack |
| VS Marketplace (optional) | https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack |
| GitHub Releases | https://github.com/polang233/cursor-language-pack/releases |

Sibling [kiro-language-pack](https://github.com/polang233/kiro-language-pack) is the same
order: Open VSX first.

## Two registries

| | Open VSX (Cursor search) | VS Marketplace (optional) |
| --- | --- | --- |
| Token | `OVSX_PAT` | `VSCE_PAT` |
| Publish | `npm run publish:ovsx` | `npm run publish:vsce` |
| Create id once | `npx ovsx create-namespace polang233` | publisher `polang233` in the [manage UI](https://marketplace.visualstudio.com/manage) |

Independent accounts. Reuse `polang233` so the id stays `polang233.cursor-language-pack`.

## What the listing is built from

| Shown as | Source |
| --- | --- |
| Page body | [`src/marketplace/README.md`](../src/marketplace/README.md) (copied into the `.vsix`) |
| Title / short description | `config.json` → `pack.displayName`, `pack.description` |
| Search keywords | `src/manifest.template.json` → `keywords`, plus packaged locale ids |
| Icon | [`media/icon.png`](../media/icon.png) |

Lead the title and description with 汉化 / 中文翻译. Other languages are contribution-only;
do not bury the Chinese search terms.

A version number can be published only once. Icon, store copy, and translations all need a bump.

## Every release

1. Same `version` in [`config.json`](../config.json) and [`package.json`](../package.json) (and the lockfile root if npm rewrote it).
2. Cursor upgrade reconciliation first, if this ships one: [After a Cursor update](#after-a-cursor-update).
3. `npm run verify` then `npm run package`. Do not tag until a real `.vsix` exists.

### Open VSX (required)

Namespace `polang233` already exists (used by the Kiro pack). You can publish as a
contributor; verified Owner is separate.

1. Open VSX PAT → `OVSX_PAT` (Access Tokens on [open-vsx.org](https://open-vsx.org/) after GitHub login + Publisher Agreement).
2. Local:

```powershell
$env:OVSX_PAT = "<token>"
npm run publish:ovsx
```

Dry-run: `npm run publish:ovsx -- --dry-run`.

3. CI: `gh secret set OVSX_PAT --repo polang233/cursor-language-pack`, then tag:

```bash
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) packages, attaches the
Release, and runs `publish:ovsx` when the secret exists. Confirm the **name** only:
`gh secret list --repo polang233/cursor-language-pack`.

### VS Marketplace (optional)

Already listed. Same bump, then either:

- `VSCE_PAT` in the shell → `npm run publish:vsce`
- or upload the `.vsix` on the existing **Cursor Language Pack** row ([manage](https://marketplace.visualstudio.com/manage)) — do not click **+ New extension**
- or set secret `VSCE_PAT`; the same tag workflow also publishes Marketplace when that secret exists

`VSCE_PAT`: Azure DevOps PAT, org **All accessible organizations**, scope **Marketplace → Manage**.

### Tag → CI (preferred once secrets exist)

```bash
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

Missing `OVSX_PAT` / `VSCE_PAT` skips that registry; the GitHub Release still gets the `.vsix`.

## After a Cursor update

```bash
npm run check-upgrade
# add keys in src/i18n/zh-cn/; renamed modules: change the path, do not retranslate
node scripts/convert-zh-tw.mjs
npm run sync && npm run verify
```

Add the Cursor version to `target.verifiedCursorVersions`, update README coverage, bump
`version`, ship a **new** version. Do not re-upload the old number.

## Tell users

- Uninstall `MS-CEINTL.vscode-language-pack-zh-hans` (and zh-hant) first.
- After choosing the display language, **restart Cursor**.
- In Cursor, search **汉化** / **中文语言包** / `polang233.cursor-language-pack`. Indexing can lag Open VSX by a few minutes.
