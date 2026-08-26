# Agent notes (cursor-language-pack)

Persistent instructions for coding agents. Human docs: [README.md](README.md),
[docs/publishing.md](docs/publishing.md) /
[docs/publishing.zh-CN.md](docs/publishing.zh-CN.md), [CONTRIBUTING.md](CONTRIBUTING.md).

Sibling product: `../Kiro` →
[kiro-language-pack](https://github.com/polang233/kiro-language-pack). Prefer
porting scripts from there over inventing a second pipeline.

## Secrets — never write these to the repo

| Secret | Where it lives | Used by |
| --- | --- | --- |
| `VSCE_PAT` | GitHub Actions secret (not set yet) | `.github/workflows/release.yml` → `npm run publish:vsce` — **this is the primary gallery**, Cursor proxies it |
| `OVSX_PAT` | GitHub Actions secret (not set yet) | optional Open VSX publish |

Do **not** commit tokens, put them in markdown, or print them. Confirm only the
**name**: `gh secret list`. Do not commit `.cursor/` (local IDE state); clones
use [AGENTS.md](AGENTS.md) and [docs/publishing.md](docs/publishing.md).

Cursor's `product.json` → `extensionsGallery.serviceUrl` is
`https://marketplace.cursorapi.com/_apis/public/gallery`. Users search inside
Cursor, which is the VS Marketplace, not Open VSX. Publish vsce first.

Local publish (token from Marketplace publisher management, not from git):

```powershell
$env:VSCE_PAT = "<token>"
npm run package
npm run publish:vsce
```

## Shipping a release

Three publish paths (web upload / local `vsce` / tag+CI): [docs/publishing.md](docs/publishing.md).
Preferred once `VSCE_PAT` is a repo secret:

1. Bump **both** `config.json` → `version` and `package.json` / lockfile **root** version (same string).
2. `npm run verify` against the local Cursor install (`npm run detect`).
3. Commit, then `git tag v<version>` and push **main + the tag**.
4. Tag `v*` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): package, GitHub Release, VS Marketplace if `VSCE_PAT` is set.
5. Do not tag until `npm run package` produces a real `.vsix`.

Do not ask the maintainer for `VSCE_PAT` on a normal release once CI has it.

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
- VS Marketplace (Cursor gallery): https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack
- Open VSX: optional, not published
- Store page body: `src/marketplace/README.md` (copied into the `.vsix`)
