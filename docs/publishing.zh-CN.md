# 发布语言包

Cursor 应用内搜扩展走的是 **[Open VSX](https://open-vsx.org/)**（经 `marketplace.cursorapi.com` 代理）。
**先上 Open VSX**，否则 Cursor 里搜不到。VS Marketplace 只是额外曝光，不是 Cursor 的搜索源。

`config.json` 的 `publisher` 是 `polang233`，必须同时等于 Open VSX 命名空间，以及（若也上微软商店）那边的出版商名。

英文版：[publishing.md](publishing.md)

| | |
| --- | --- |
| 扩展 id | `polang233.cursor-language-pack` |
| Open VSX（必发） | https://open-vsx.org/extension/polang233/cursor-language-pack |
| VS Marketplace（可选） | https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack |
| GitHub Release | https://github.com/polang233/cursor-language-pack/releases |

姊妹项目 [kiro-language-pack](https://github.com/polang233/kiro-language-pack) 同样是 Open VSX 优先。

## 两个市场

| | Open VSX（Cursor 能搜到） | VS Marketplace（可选） |
| --- | --- | --- |
| 令牌 | `OVSX_PAT` | `VSCE_PAT` |
| 发布 | `npm run publish:ovsx` | `npm run publish:vsce` |
| 一次性创建 id | `npx ovsx create-namespace polang233` | [管理页](https://marketplace.visualstudio.com/manage) 里的出版商 `polang233` |

两边账号互不相通。尽量用同一个 id，扩展身份就一直是 `polang233.cursor-language-pack`。

## 商店页从哪来

| 用户看到的 | 来源 |
| --- | --- |
| 正文 | [`src/marketplace/README.md`](../src/marketplace/README.md)，构建时复制进 `.vsix` |
| 标题、短描述 | `config.json` → `pack.displayName`、`pack.description` |
| 搜索关键词 | `src/manifest.template.json` → `keywords`，外加打进包里的 locale id |
| 图标 | [`media/icon.png`](../media/icon.png) |

标题和简介以 **汉化 / 中文翻译** 打头，方便中文用户搜到。其他语言靠贡献，不要把搜索词冲淡。

同一个版本号不能发第二次。图标、商店文案、译文改了都要升版本。

## 每次发版

1. [`config.json`](../config.json) 和 [`package.json`](../package.json) 写成同一个 `version`（lockfile 根版本若被 npm 改了也要一起）。
2. 若这次是 Cursor 升级后的对账，先走 [Cursor 升级后](#cursor-升级后)。
3. `npm run verify`，再 `npm run package`。没打出 `.vsix` 之前不要打 tag。

### Open VSX（必发）

命名空间 `polang233` 已有（Kiro 包在用），一般可以直接发。Owner / verified 是另一步。

1. [open-vsx.org](https://open-vsx.org/) 用 GitHub 登录、签 Publisher Agreement，建 PAT，这就是 `OVSX_PAT`。
2. 本机：

```powershell
$env:OVSX_PAT = "<token>"
npm run publish:ovsx
```

试运行：`npm run publish:ovsx -- --dry-run`。

3. CI：`gh secret set OVSX_PAT --repo polang233/cursor-language-pack`，然后打 tag：

```bash
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) 会打包、挂 Release，secret 存在时跑 `publish:ovsx`。只核对名字：`gh secret list --repo polang233/cursor-language-pack`。

### VS Marketplace（可选）

已经上过架。同一版本号 bump 之后：

- 本机 `$env:VSCE_PAT = "<token>"; npm run publish:vsce`
- 或在已有的 **Cursor Language Pack** 那一行上传 `.vsix`（[管理页](https://marketplace.visualstudio.com/manage)），不要点「+ 新延伸」
- 或设 secret `VSCE_PAT`，同一套 tag 工作流也会发微软商店

`VSCE_PAT`：Azure DevOps PAT，Organization 选 **All accessible organizations**，权限 **Marketplace → Manage**。

### 打 tag 走 CI（secret 齐了之后推荐）

```bash
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

缺 `OVSX_PAT` / `VSCE_PAT` 就跳过对应商店，GitHub Release 仍会挂上 `.vsix`。

## Cursor 升级后

```bash
npm run check-upgrade
# 在 src/i18n/zh-cn/ 里补新键；模块路径变了就改路径，不要重译
node scripts/convert-zh-tw.mjs
npm run sync && npm run verify
```

把 Cursor 版本写进 `target.verifiedCursorVersions`，更新 README 覆盖率，升 `version`，发**新版本**。不要在旧版本号上重传。

## 用户侧可提醒

- 先卸 `MS-CEINTL.vscode-language-pack-zh-hans`（以及繁体官方包）。
- 选显示语言后必须**重启** Cursor。
- 在 Cursor 里搜 **汉化**、**中文语言包** 或 `polang233.cursor-language-pack`。索引可能比 Open VSX 公开页再慢几分钟。
