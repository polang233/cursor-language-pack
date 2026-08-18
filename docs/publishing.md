# Publishing the language pack

**Nothing is published.** Version is `0.0.0`. Read this before the first tag.

Cursor’s extension gallery is **not** Open VSX. `product.json` →
`extensionsGallery.serviceUrl` is
`https://marketplace.cursorapi.com/_apis/public/gallery`, a proxy of the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/). Users who
search inside Cursor see Marketplace extensions. Publish there first.

The id in [`config.json`](../config.json) → `publisher` is `polang233`. That
string must match the VS Marketplace **publisher** and (if we also publish
there) the Open VSX **namespace**.

## Two registries

| | VS Code Marketplace (**needed for Cursor**) | Open VSX (optional) |
| --- | --- | --- |
| Who runs it | Microsoft | Eclipse Foundation |
| URL | `marketplace.visualstudio.com/items?itemName=<publisher>.<name>` | `open-vsx.org/extension/<namespace>/<name>` |
| Your id is called | **Publisher** | **Namespace** |
| Token env var | `VSCE_PAT` | `OVSX_PAT` |
| Publish command | `npm run publish:vsce` (stub) | `npm run publish:ovsx` (stub) |

They are independent. Reuse `polang233` on both so the identity stays
`polang233.cursor-language-pack`.

Kiro’s pack is Open VSX-first because Kiro’s gallery *is* Open VSX. Do not copy
that part blindly.

## Prerequisites (when the pack exists)

1. `npm run package` produces `dist/cursor-language-pack-<version>.vsix`
2. `config.json` → `version` matches the git tag (`v*`)
3. Create publisher `polang233` at
   [Marketplace publisher management](https://marketplace.visualstudio.com/manage)
4. Azure DevOps PAT with **Marketplace → Manage** → `VSCE_PAT`
5. GitHub Actions secret `VSCE_PAT` on the repo (names only in chat:
   `gh secret list`)

Never commit the token, never paste it into markdown, never print it.

## After publishing

- Uninstall `MS-CEINTL.vscode-language-pack-zh-hans` (and zh-hant) in Cursor
  before installing this pack
- Bump `config.json` → `version` and `package.json` together before the next tag

中文说明见 [publishing.zh-CN.md](publishing.zh-CN.md)。
