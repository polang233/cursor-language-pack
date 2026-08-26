# Publishing the language pack

Cursor’s gallery is the [Visual Studio Marketplace](https://marketplace.visualstudio.com/),
not Open VSX. `product.json` → `extensionsGallery.serviceUrl` is
`https://marketplace.cursorapi.com/_apis/public/gallery`, a proxy of Marketplace.
**Publish there first.** Open VSX is optional; Cursor users will not find the pack by
searching Open VSX.

| | |
| --- | --- |
| Extension id | `polang233.cursor-language-pack` |
| Publisher | `polang233` (already created: [manage](https://marketplace.visualstudio.com/manage)) |
| Store page | https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack |
| GitHub Releases | https://github.com/polang233/cursor-language-pack/releases |

The sibling [kiro-language-pack](https://github.com/polang233/kiro-language-pack) is
Open VSX-first because Kiro’s gallery *is* Open VSX. Do not copy that order.

中文说明：[publishing.zh-CN.md](publishing.zh-CN.md).

---

## Shipping a new version

Bump + verify first, then pick one of the three publish paths below.
**A version number can be published only once.** Icon, store copy, and translations all
need a bump.

### Every release

1. Set the **same** `version` string in both:
   - [`config.json`](../config.json)
   - [`package.json`](../package.json) (and the lockfile root version if npm rewrote it)
2. If this ships a **Cursor upgrade reconciliation**, do [After a Cursor update](#after-a-cursor-update) first.
3. Local check:

```bash
npm run verify
```

That is `build` + `validate` + `coverage` against the Cursor install `npm run detect` finds.
4. Then pick a publish path. Do not tag until `npm run package` produces a real `.vsix`.

What the listing is built from:

| Shown as | Source |
| --- | --- |
| Page body | [`src/marketplace/README.md`](../src/marketplace/README.md), copied into the `.vsix` by `npm run build` |
| Title and short description | `config.json` → `pack.displayName`, `pack.description` |
| Icon | [`media/icon.png`](../media/icon.png) (128×128 PNG) |
| Search keywords | `src/manifest.template.json` → `keywords`, plus the packaged locale ids |

### Three ways onto the store

| | A Web upload | B Local `vsce` | C Tag → CI |
| --- | --- | --- | --- |
| Needs `VSCE_PAT` | No | Yes (shell env) | Yes (GitHub Actions secret) |
| VS Marketplace | Yes | Yes | Yes (when the secret exists) |
| GitHub Release | Manual extra step | No | Automatic |
| Use when | PAT not set yet; hot-fix the listing | Token already in the shell, skip CI wait | **Normal releases (preferred)** |

`0.1.0` used **A**. Once `VSCE_PAT` is a repo secret, use **C**.

#### Path A — upload on the publisher site (no PAT)

Do **not** click **+ New extension** again; that creates a second listing. Update the
existing **Cursor Language Pack**.

1. `npm run package` → `dist/cursor-language-pack-<version>.vsix`.
2. Open [publisher management](https://marketplace.visualstudio.com/manage), publisher `polang233`.
3. Open the existing extension row (not “new extension”).
4. Upload the new `.vsix` (Update / new version / upload package).
5. Status becomes **Verifying** for a few minutes; the public page version then updates.
   Keep Availability **Public**.

You can also download the `.vsix` from a GitHub Release (path C still attaches it when
`VSCE_PAT` is missing) and upload that file.

#### Path B — local CLI

Needs [VSCE_PAT](#creating-vsce_pat). Keep the token in the current shell only. Never
commit it, paste it into markdown, or print it.

```powershell
npm run package
$env:VSCE_PAT = "<token>"
npm run publish:vsce
```

This updates Marketplace only — **no** GitHub Release. Use path C for a Release, or attach
`dist/*.vsix` on GitHub yourself.

#### Path C — `v*` tag, GitHub Actions packages and publishes (preferred)

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml).

1. Commit the bump on `main`.
2. Tag with **exactly** `config.json` → `version`, push **main and the tag**:

```bash
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

3. CI runs `npm ci` → sync → `npm run package` → `validate` → checks the tag matches
   `config.json` → attaches the `.vsix` to the GitHub Release.
4. **If** the repo secret `VSCE_PAT` is set, it runs `npm run publish:vsce`. If the secret
   is missing, that step is skipped (the Release still has the vsix); finish with path A.

You can also run the **Release** workflow by hand (`workflow_dispatch`) and tick publish;
the secret still has to exist.

Confirm the secret **name** only:

```bash
gh secret list --repo polang233/cursor-language-pack
```

---

## Creating VSCE_PAT

Needed for paths B and C. Publisher `polang233` already exists.

1. Open [Azure DevOps PAT](https://dev.azure.com/_usersSettings/tokens) with the same
   Microsoft account as Marketplace.
2. **New Token**. Organization: **All accessible organizations** (a single-org token often
   401s against Marketplace).
3. Scopes: **Custom** → **Marketplace** → **Manage** (Read is not enough).
4. Copy it **immediately**; the UI will not show it again.
5. Either or both:
   - **GitHub Actions (path C):**

     ```bash
     gh secret set VSCE_PAT --repo polang233/cursor-language-pack
     ```

     Paste into stdin when prompted. `gh secret list` should then show the name `VSCE_PAT`.
   - **Local (path B):** current PowerShell session only: `$env:VSCE_PAT = "<token>"`.

If it leaks, revoke it in Azure DevOps and `gh secret set` again. Never commit a PAT.

---

## After a Cursor update

Reconcile NLS **then** ship a **new** version (new number, new tag). Do not re-upload
the old version.

```bash
npm run check-upgrade
# add keys in src/i18n/zh-cn/; renamed modules: change the path, do not retranslate
node scripts/convert-zh-tw.mjs
npm run sync && npm run verify
```

Add the Cursor version to `config.json` → `target.verifiedCursorVersions`, update README
coverage numbers, then ship.

Orphans can stay; the build filters them. Moved keys: rename the **module path**.

More pipeline detail: [architecture.md](architecture.md), [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Open VSX (optional)

Cursor users do not need this. Use it only if you also want
[open-vsx.org](https://open-vsx.org/).

1. Sign in, create a PAT (`OVSX_PAT`), `npx ovsx create-namespace polang233`.
2. Local: `$env:OVSX_PAT = "<token>"; npm run publish:ovsx`.
3. Or set GitHub secret `OVSX_PAT`; path C will publish Open VSX on the same tag.

---

## Tell users

- Uninstall `MS-CEINTL.vscode-language-pack-zh-hans` (and zh-hant) first; two packs conflict.
- After choosing the display language, **restart Cursor** — reload is not enough.
- Search inside Cursor can lag the manage UI’s Verifying state. The public page is:
  https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack
