# Publishing the language pack

Cursor’s extension gallery is **not** Open VSX. `product.json` →
`extensionsGallery.serviceUrl` is
`https://marketplace.cursorapi.com/_apis/public/gallery`, a proxy of the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/). Users who
search inside Cursor see Marketplace extensions. Publish there first.

The id in [`config.json`](../config.json) → `publisher` is `polang233`. That
string must match the VS Marketplace **publisher** and (if we also publish
there) the Open VSX **namespace**.

## Two registries, two accounts

| | VS Code Marketplace (**needed for Cursor**) | Open VSX (optional) |
| --- | --- | --- |
| Who runs it | Microsoft | Eclipse Foundation |
| URL | `marketplace.visualstudio.com/items?itemName=<publisher>.<name>` | `open-vsx.org/extension/<namespace>/<name>` |
| Your id is called | **Publisher** | **Namespace** |
| Token env var | `VSCE_PAT` | `OVSX_PAT` |
| Publish command | `npm run publish:vsce` | `npm run publish:ovsx` |

They are independent. Reuse `polang233` on both so the identity stays
`polang233.cursor-language-pack`.

The sibling [kiro-language-pack](https://github.com/polang233/kiro-language-pack)
is Open VSX-first because Kiro’s gallery *is* Open VSX. Do not copy that order.

## Prerequisites

```bash
npm install
npm run package          # produces dist/cursor-language-pack-<version>.vsix
```

Confirm `config.json` → `version` matches the tag you will push (CI enforces this on `v*`).

| Shown as | Source |
| --- | --- |
| Page body | `src/marketplace/README.md`, copied into the `.vsix` by `npm run build` |
| Title and short description | `config.json` → `pack.displayName`, `pack.description` |
| Search keywords | `src/manifest.template.json` → `keywords`, plus the packaged locale ids |

## VS Code Marketplace (required for Cursor users)

1. Open [Visual Studio Marketplace publisher management](https://marketplace.visualstudio.com/manage)
   and sign in with a Microsoft account.
2. Create a **Publisher** whose name matches `config.json` → `publisher` (`polang233`).
3. Create an Azure DevOps **Personal Access Token** with **Marketplace → Manage** scope.
   That token is `VSCE_PAT`.
4. Publish:

```bash
# Windows PowerShell
$env:VSCE_PAT = "your-token"
npm run publish:vsce

# macOS / Linux
export VSCE_PAT=your-token
npm run publish:vsce
```

5. **CI path:** repository secret `VSCE_PAT` (not set yet). Push a matching tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) builds the `.vsix`,
attaches it to the GitHub Release, and runs `npm run publish:vsce` when the secret exists.
Confirm the **name** only with `gh secret list`. Never commit the token, never paste it
into markdown, never print it.

## Open VSX (optional)

Use this only if you also want the pack on [open-vsx.org](https://open-vsx.org/).

1. Sign in, create a PAT (`OVSX_PAT`), `npx ovsx create-namespace polang233`.
2. `npm run publish:ovsx` with `OVSX_PAT` in the environment, or set the GitHub Actions secret.

## After publishing

- Uninstall `MS-CEINTL.vscode-language-pack-zh-hans` (and zh-hant) in Cursor before installing this pack
- Bump `config.json` → `version` and `package.json` together before the next tag

中文说明见 [publishing.zh-CN.md](publishing.zh-CN.md)。
