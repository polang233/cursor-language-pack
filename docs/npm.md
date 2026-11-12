# npm 维护

`@polang233/cursor-language-pack` 已公开发布；扩展 id 保持 `polang233.cursor-language-pack`。推荐用户使用 Node.js 22+，实际最低 18.17。日常用户通过 npx 使用包内同版本 VSIX，无需下载源码或构建。

## 源码联调与产物

在仓库根目录执行：

```bash
npm ci
npm run sync -- --strategy=api
npm test
npm run package:npm
node bin/cli.mjs preview --locale=zh-tw
node bin/cli.mjs status
```

按需复测已有产物可单独运行 `npm run test:package`；`package:npm` 已包含同一套完整 tarball 测试。

开发时也可用本地 TGZ 联调 npx，以下命令运行本地产物：

```bash
npx --yes --package="./dist/polang233-cursor-language-pack-1.1.5.tgz" cursor-language-pack preview
```

源码入口与 npx 使用相同参数：默认 `install`，也支持 `install/preview/status/restore`、`--locale=zh-cn/zh-tw` 和 `--dir="路径"`。实际安装前退出应用；联调安装与恢复时使用隔离 fixture。系统语言含 TW/HK/MO 或 zh-Hant 时选 `zh-tw`，其余选 `zh-cn`。

| 命令 | 职责 |
| --- | --- |
| `npm run test:cli` | 纯 CLI/locale 测试，不构建、不要求真实应用 |
| `npm test` | 扩展运行时、CLI、升级差异、硬编码文案与 commerce 资源测试 |
| `npm run verify` | 原有构建、manifest、覆盖率检查，需要先 detect/extract 本机应用 |
| `npm run validate:install` | 在临时目录改写本机 Cursor 的两种语言程序副本并检查语法，不修改安装目录 |
| `npm run package:npm` | 构建本版本 VSIX、准备包内 assets、执行 npm pack 到 dist，再验证真实 TGZ |
| `npm run test:published` | 下载并校验公开 latest 包，实际运行 npx，检查自动语言、手动切换和恢复 |
| `npm run test:package` | 重新测试 dist 中本版本已有 TGZ，可重复运行，不依赖重新打包 |

`test:package` 必须把 `dist/polang233-cursor-language-pack-<version>.tgz` 安装到仓库外的临时目录，从安装后的包运行 CLI，不能借用源码或开发依赖。检查 CLI/译文/同版本 VSIX 都在包内，并逐条核对自维护内置扩展译文确实存在于 VSIX 的 package 区段，并用临时应用与用户配置 fixture 覆盖 preview、status、install、重复安装、restore、语言选择和带空格的 `--dir`。测试不能修改真实应用或用户配置。

CI 在 Windows、macOS、Linux 分别执行 npm ci、npm test、API sync、package:npm 和 manifest 校验，package:npm 已含真实 tarball 的完整 fixture 测试。本机发布前另跑 verify。应用更新后用户重跑 install；restore 只恢复程序文件，扩展和显示语言可在应用内切换。

## npm 发布

npm 首发已完成。该包已配置 GitHub Actions 可信发布，仓库变量 `NPM_PUBLISH_ENABLED` 为 `true`。经授权推送 `v<version>` 标签后，发布流程会将已测试的 VSIX 和 npm 包一起发布。配置限定如下：

| 字段 | 值 |
| --- | --- |
| Organization or user | `polang233` |
| Repository | `cursor-language-pack` |
| Workflow filename | `release.yml`，只填文件名 |
| Environment | 留空，与当前工作流一致 |
| Allowed actions | 允许直接 `npm publish` |

更改可信发布权限或关闭、开启仓库变量仍需明确授权。未设置开关或值为 `false` 时，npm job 跳过。

手动 dispatch 只有 `publish=true` 才能发布。`publish=false` 对所有 registry 都生效，包括在 tag 上运行时。

[官方 trusted publishing 要求](https://docs.npmjs.com/trusted-publishers/)为 Node ≥22.14.0、npm ≥11.5.1。发布 job 选 Node 24，显式检查 npm 下限，配置 `registry-url: https://registry.npmjs.org` 和 job 级 `id-token: write`，通过 OIDC 发布已测试的确定 TGZ，无需 npm 长期发布令牌。

工作流查询精确包名/版本，确认已发布才 skip；只有 HTTP 404 才进入发布，超时、网络、鉴权、服务端或响应解析错误均失败。发布本身的错误也保持失败。版本、覆盖率与升级流程见[发布说明](publishing.zh-CN.md)。

## 发布后验收

发布工作流会在 Windows、macOS、Linux 自动运行 `npm run test:published`。也可在本地手动运行。它分别最多等待约 6 分钟，确认 registry 元数据和 npx 的 `latest` 都指向当前版本；npx 查询会重新验证缓存。该检查从官方 registry 下载并核对完整性，在仓库外安装实际 tarball，再用官方 npx 入口按包名运行默认安装、手动简繁体切换和恢复。它验证本机系统语言，也通过隔离的系统查询模拟 TW/HK/MO/Hant/CN/英文及明确字形优先级；不会修改电脑语言或真实应用。`--dir` 使用带空格的临时安装目录。

npm 刚接收发布时，版本元数据可能暂未传到所有查询入口。首次 npx 版本探测遇到 `ETARGET` 时会等待重试；后续安装、切换和恢复的错误仍立即失败。
