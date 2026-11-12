# 发布 Cursor Language Pack

[English](publishing.md) · [npm 维护](npm.md)

npm 包 `@polang233/cursor-language-pack` 已公开发布。扩展 id 仍为 `polang233.cursor-language-pack`。

## 准备版本

1. 若应用已升级，先核对新增、删除和移动的键，见[应用升级](#应用升级)。
2. 对齐 `config.json.version`、`package.json.version`、`package-lock.json.version` 和 `package-lock.json.packages[""].version`。npm 包名与 lock 中的包名使用上述 scope；扩展 publisher/name 保持原样。
3. 在已提取本机 Cursor 元数据的环境执行覆盖率和产物检查：

```bash
npm ci
npm run sync -- --strategy=api
npm run verify
npm test
npm run package:npm
```

`verify` 保留原有构建、manifest 与覆盖率检查，需要本机应用元数据。托管 CI 不安装应用，打包后继续执行 manifest 校验。`npm test` 包含现有运行时测试与 `test:cli`。`package:npm` 构建当前 VSIX、准备包内 assets、用 `npm pack` 生成 `dist/*.tgz` 并验证真实 tarball。按需可用 `npm run test:package` 对 dist 中本版本已有的 TGZ 重跑同一套完整 fixture 测试。

每个版本应生成：

| 产物 | 路径 |
| --- | --- |
| 扩展 | `dist/cursor-language-pack-<version>.vsix` |
| npm 包 | `dist/polang233-cursor-language-pack-<version>.tgz` |

归档应包含 CLI、所需运行时文件与译文，以及同版本 VSIX。必须在仓库外安装真实 TGZ，用隔离的应用和用户配置 fixture 测试，见 [npm.md](npm.md)。

## Release 工作流

提交、打 tag、推送及发布都需要明确授权。经授权推送 `v<version>` tag 后，[release.yml](../.github/workflows/release.yml) 会：

- 校验 scoped npm 包名、扩展身份、config/package/lock 版本和 tag。
- 执行 `npm ci`、`npm test`、API sync、`package:npm` 和 manifest 校验，package:npm 已包含完整 tarball fixture 测试。
- 将本版本确定路径的 VSIX 和 TGZ 上传到 workflow artifact 与 GitHub Release，不匹配 dist 中的旧版本。
- 存在 `OVSX_PAT` 时发布 Open VSX。重跑时仅在公共 API 确认 namespace、名称与版本完全一致后跳过，查询异常仍报错。存在可选的 `VSCE_PAT` 时也发布 VS Marketplace。
- 仅在 `NPM_PUBLISH_ENABLED == 'true'`，且为 tag push 或手动 `publish=true` 时运行独立的 npm OIDC job。

手动 dispatch 默认 `publish=false`，只构建并上传 workflow artifact，即使选择 tag 也不会发布到任何 registry。缺少扩展市场 secret 时跳过对应市场；测试、打包或发布失败仍然报错。

npm job 使用 Node 24，检查 npm ≥11.5.1，设置 job 级 `id-token: write` 与 `registry-url: https://registry.npmjs.org`，发布已测试的 TGZ。仅在 registry 确认同名同版本已存在时跳过；网络错误、非 404 HTTP 错误和异常响应都会失败。并发导致版本已存在时，发布失败也不会被吞掉。

npm 首发及可信发布已配置完成，`NPM_PUBLISH_ENABLED` 为 `true`，权限限定为当前仓库的 `release.yml`。修改远程权限仍需明确授权，字段见 [npm.md](npm.md)。npm 发布后在三平台运行 `npm run test:published`，验收公开 registry 中的版本和 npx 安装。

## 扩展市场

| 市场 | 身份 | 凭据 |
| --- | --- | --- |
| [Open VSX](https://open-vsx.org/extension/polang233/cursor-language-pack) | `polang233.cursor-language-pack` | `OVSX_PAT` |
| [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack) | 相同扩展 id，可选上架 | `VSCE_PAT` |

Cursor 内置搜索使用 Open VSX。工作流保留两个市场的逻辑，Marketplace 可选。令牌只放环境变量或仓库 secret，不能写入或打印。现有 `publish:ovsx` / `publish:vsce` 命令发布当前版本 VSIX。Open VSX 的 `polang233` namespace、Marketplace publisher 和 npm scope 互相独立。

商店正文来自 `src/marketplace/README.md`，标题与简介来自 `config.json` 的 `pack.displayName` / `pack.description`，关键词来自 `src/manifest.template.json` 的 `keywords`，图标为 `media/icon.png`。保持扩展身份及汉化、中文翻译等搜索词。

## 应用升级

1. 对更新后的应用运行 `npm run check-upgrade`、`npm run detect`、`npm run extract`。
2. 核对新增、删除、英文原文变更和移动的键。补齐 `src/i18n/zh-cn/`，移动模块时复用译文，审查过时键。
3. 运行 `node scripts/convert-zh-tw.mjs` 并校对译文和术语一致性。
4. 同步上游，执行 `npm run verify`、`npm test`、`npm run package:npm`，按需用 `npm run test:package` 复测，核对归档内容和隔离安装。
5. 更新 `target.verifiedCursorVersions`、文档及所有版本字段。授权后让 npm 包与 VSIX 按相同版本一起发布。

提醒用户在应用更新后重跑安装并完全重启。`restore` 只恢复程序文件；扩展和显示语言在 Cursor 内切换。
