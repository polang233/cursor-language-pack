# Agent notes (cursor-language-pack)

Persistent instructions for coding agents. Human docs: [README.md](README.md),
[docs/publishing.md](docs/publishing.md), [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/roadmap.md](docs/roadmap.md).

Sibling product (already shipping): `../Kiro` →
[kiro-language-pack](https://github.com/polang233/kiro-language-pack). Prefer
porting scripts from there over inventing a second pipeline.

## Status

Scaffold only. `npm run detect` is implemented. extract / sync / build / package
/ patch / publish are stubs (`scripts/not-yet.mjs`). Do not claim a listing
exists. Do not bump past `0.0.0` until there is a `.vsix`.

## Secrets — never write these to the repo

| Secret | Where it will live | Used by |
| --- | --- | --- |
| `VSCE_PAT` | GitHub Actions secret (not set yet) | VS Marketplace publish — **this is the primary gallery**, Cursor proxies it |
| `OVSX_PAT` | GitHub Actions secret (not set yet) | optional Open VSX publish |

Do **not** commit tokens, put them in markdown, or print them. Confirm only the
**name**: `gh secret list`.

Cursor's `product.json` → `extensionsGallery.serviceUrl` is
`https://marketplace.cursorapi.com/_apis/public/gallery`. Users search inside
Cursor, which is the VS Marketplace, not Open VSX. Publish vsce first.

## After a Cursor update (once the pack ships)

```bash
npm run detect
npm run check-upgrade
# translate new keys in src/i18n/zh-cn/
# then zh-tw
npm run sync && npm run verify
```

Add the Cursor version to `config.target.verifiedCursorVersions`, update README
coverage numbers and `CHANGELOG.md`, bump the pack version, tag, push.

Moved keys: rename the **module path**, do not retranslate. Orphans can stay;
the build will filter them.

## Product (planned)

- Extension id: `polang233.cursor-language-pack`
- Cursor / VS Marketplace: not published
- Open VSX: optional, not published
- Store page body: `src/marketplace/README.md` (copied into the `.vsix`)
