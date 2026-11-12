# Publishing Cursor Language Pack

[简体中文](publishing.zh-CN.md) · [npm maintenance](npm.md)

The npm package `@polang233/cursor-language-pack` is public. The extension id stays `polang233.cursor-language-pack`.

## Prepare a version

1. If Cursor has updated, reconcile added, removed and moved keys first. See [App upgrades](#app-upgrades).
2. Align `config.json.version`, `package.json.version`, `package-lock.json.version` and `package-lock.json.packages[""].version`. The npm package name and lockfile names must use the scoped name above. Keep the extension publisher/name unchanged.
3. With local app metadata available, run the coverage check and all package checks:

```bash
npm ci
npm run sync -- --strategy=api
npm run verify
npm test
npm run package:npm
```

`verify` keeps its existing build, manifest and coverage checks and requires metadata from a local Cursor install. Hosted CI has no app install; it retains manifest validation after packaging. `npm test` includes the existing runtime tests and `test:cli`. `package:npm` builds the current VSIX, prepares bundled assets, runs `npm pack` into `dist/` and validates the real tarball. For optional retesting, `npm run test:package` repeats the same full fixture suite against that version's existing TGZ.

Expected artifacts for each version:

| Artifact | Path |
| --- | --- |
| Extension | `dist/cursor-language-pack-<version>.vsix` |
| npm package | `dist/polang233-cursor-language-pack-<version>.tgz` |

The archive must contain the CLI, its runtime files and translations, and the matching VSIX. Test the installed archive outside the checkout against temporary app/profile fixtures. See [npm.md](npm.md).

## Release workflow

Only commit, tag, push or publish with explicit authorization. An authorized `v<version>` tag runs [release.yml](../.github/workflows/release.yml):

- Check scoped package identity, extension identity, config/package/lock versions and tag.
- Run `npm ci`, `npm test`, API sync, `package:npm` and manifest validation. `package:npm` includes the full tarball fixture suite.
- Upload the exact current-version VSIX and TGZ as workflow artifacts and GitHub Release assets. Older files in `dist/` are excluded.
- Publish to Open VSX when `OVSX_PAT` is available. A rerun skips only when the public API confirms the exact namespace, name and version; lookup failures remain errors. Publish to VS Marketplace when the optional `VSCE_PAT` is available.
- Run the separate npm OIDC job only when `NPM_PUBLISH_ENABLED == 'true'` and the event is a tag push or manual dispatch with `publish=true`.

Manual dispatch defaults to `publish=false`. It builds and uploads workflow artifacts without publishing to any registry, including when a tag is selected. Missing extension-registry secrets skip that registry; test, packaging and publishing failures remain failures.

The npm job uses Node 24, checks npm ≥11.5.1, grants job-level `id-token: write` and sets `registry-url: https://registry.npmjs.org`. It publishes the tested TGZ. It skips only after the registry confirms the exact package/version already exists; network errors, non-404 HTTP errors and malformed replies fail the job. A concurrent duplicate publish also fails rather than hiding an error.

npm publication and its trusted publisher are configured. `NPM_PUBLISH_ENABLED` is `true`; the publisher is limited to this repository and `release.yml`. Changes to remote permissions still require explicit authorization. Exact fields are in [npm.md](npm.md). After npm publication, the workflow runs `npm run test:published` on Windows, macOS and Linux against the public registry and actual npx entry point.

## Extension registries

| Registry | Identity | Credentials |
| --- | --- | --- |
| [Open VSX](https://open-vsx.org/extension/polang233/cursor-language-pack) | `polang233.cursor-language-pack` | `OVSX_PAT` |
| [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack) | Same extension id; optional listing | `VSCE_PAT` |

Open VSX is Cursor's in-app gallery. The workflow retains both registries, with Marketplace optional. Keep tokens in environment variables or repository secrets; never write or print them. The existing `publish:ovsx` and `publish:vsce` commands publish the current-version VSIX. Namespace `polang233` and the Marketplace publisher are separate from the npm scope.

Store content comes from `src/marketplace/README.md`, `config.json` → `pack.displayName` / `pack.description`, `src/manifest.template.json` → `keywords` and `media/icon.png`. Preserve the extension identity and Chinese search terms.

## App upgrades

1. Run `npm run check-upgrade`, `npm run detect` and `npm run extract` against the updated app.
2. Review added and deleted keys, changed source text and moved module paths. Translate new keys in `src/i18n/zh-cn/`, reuse translations at moved paths and review obsolete keys.
3. Run `node scripts/convert-zh-tw.mjs` and review the output for consistent terminology.
4. Sync upstream, run `npm run verify`, `npm test`, `npm run package:npm`. Use `npm run test:package` for optional retesting. Check the archive's contents and isolated installation.
5. Update `target.verifiedCursorVersions`, documentation and all version fields together. After authorization, release npm and VSIX with the same version.

Tell users to rerun installation after an app update and fully restart the app. `restore` restores only app files; extensions and display language can be changed inside Cursor.
