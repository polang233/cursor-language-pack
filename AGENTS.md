# Agent notes (cursor-language-pack)

Persistent instructions for coding agents. Human docs: [README.md](README.md),
[docs/publishing.md](docs/publishing.md) /
[docs/publishing.zh-CN.md](docs/publishing.zh-CN.md), [CONTRIBUTING.md](CONTRIBUTING.md).

Sibling: `../Kiro` →
[kiro-language-pack](https://github.com/polang233/kiro-language-pack). Prefer
porting scripts from there over inventing a second pipeline.

## Secrets — never write these to the repo

| Secret | Where it lives | Used by |
| --- | --- | --- |
| `OVSX_PAT` | GitHub Actions secret | `.github/workflows/release.yml` → `npm run publish:ovsx` — **primary gallery** (Cursor search) |
| `VSCE_PAT` | GitHub Actions secret | optional VS Marketplace publish |

Do **not** commit tokens, put them in markdown, or print them. Confirm only the
**name**: `gh secret list`. Do not commit `.cursor/` (local IDE state).

Cursor’s in-app search is Open VSX (proxied at `marketplace.cursorapi.com`).
Publish `ovsx` first. VS Marketplace is optional.

```powershell
$env:OVSX_PAT = "<token>"
npm run package
npm run publish:ovsx
```

## Shipping a release

1. Bump **both** `config.json` → `version` and `package.json` / lockfile **root** version (same string).
2. `npm run verify` against the local Cursor install (`npm run detect`).
3. Commit, then `git tag v<version>` and push **main + the tag**.
4. Tag `v*` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): package, GitHub Release, Open VSX if `OVSX_PAT` is set, VS Marketplace if `VSCE_PAT` is set.
5. Do not tag until `npm run package` produces a real `.vsix`.

Store copy: `src/marketplace/README.md`, `config.json` → `pack.displayName` /
`pack.description`, `src/manifest.template.json` → `keywords`. Keep Chinese search
terms (汉化、中文翻译、中文语言包) first; other languages are contribution-only.

## After a Cursor update

```bash
npm run check-upgrade
# translate new keys in src/i18n/zh-cn/
node scripts/convert-zh-tw.mjs
npm run sync && npm run verify
```

Add the Cursor version to `config.target.verifiedCursorVersions`, update README
coverage numbers, bump the pack version, tag, push.

Moved keys: rename the **module path**, do not retranslate. Orphans can stay;
the build will filter them.

## Live product

- Extension id: `polang233.cursor-language-pack`
- Open VSX (Cursor gallery): https://open-vsx.org/extension/polang233/cursor-language-pack
- VS Marketplace: https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack (optional)
- Store page body: `src/marketplace/README.md` (copied into the `.vsix`)
