# 发布语言包

Cursor 里搜扩展走的是 [Visual Studio Marketplace](https://marketplace.visualstudio.com/)，
不是 Open VSX。`product.json` 里的 `extensionsGallery.serviceUrl` 是
`https://marketplace.cursorapi.com/_apis/public/gallery`，也就是微软商店的代理。
**发新版本时优先上 VS Marketplace。** Open VSX 可选，Cursor 用户搜不到。

| | |
| --- | --- |
| 扩展 id | `polang233.cursor-language-pack` |
| 出版商 | `polang233`（已建好，管理页：[marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)） |
| 商店页 | https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack |
| GitHub Release | https://github.com/polang233/cursor-language-pack/releases |

姊妹项目 [kiro-language-pack](https://github.com/polang233/kiro-language-pack) 是 Open VSX 优先，
**不要抄它的发布顺序。**

英文版：[publishing.md](publishing.md)。

---

## 发新版本

每次发版都先做完「改版本 + 验证」，再从下面三种上架方式里选一种。
**同一个版本号不能发第二次**（商店会拒）。图标、商店文案、译文改了都要升版本。

### 每次都要做

1. **同时改两个文件的 `version`，写成同一个字符串**（例如 `0.2.0`）：
   - [`config.json`](../config.json)
   - [`package.json`](../package.json)（以及 lockfile 根版本，如果 `npm version` / 安装把它带上了）
2. 若这次是 **Cursor 升级后的对账**，先走 [升级后](#cursor-升级后)，再回来发版。
3. 本地过一遍：

```bash
npm run verify
```

`verify` = `build` + `validate` + `coverage`，对着本机装的 Cursor（`npm run detect`）。
4. 再选一种上架方式。没打出 `.vsix` 之前不要打 tag。

商店页上显示什么、改哪里：

| 用户看到的 | 来源 |
| --- | --- |
| 正文 | [`src/marketplace/README.md`](../src/marketplace/README.md)，`npm run build` 时复制进 `.vsix` |
| 标题、短描述 | `config.json` → `pack.displayName`、`pack.description` |
| 图标 | [`media/icon.png`](../media/icon.png)（128×128 PNG） |
| 搜索关键词 | `src/manifest.template.json` → `keywords`，外加打进包里的 locale id |

### 三种上架方式

| | A 网页上传 | B 本机 `vsce` | C 打 tag 走 CI |
| --- | --- | --- | --- |
| 需要 `VSCE_PAT` | 否 | 是（当前终端环境变量） | 是（GitHub Actions secret） |
| 上 VS Marketplace | 是 | 是 | 是（secret 存在时） |
| 挂 GitHub Release | 要自己另做 | 否 | 自动 |
| 适合 | PAT 还没设；或只要热修商店 | 本机已有 token，不想等 CI | **日常发版（推荐）** |

第一次 `0.1.0` 用的是 **A**。`VSCE_PAT` 写进仓库 secret 之后，日常用 **C**。

#### 方式 A — 出版商网页上传（不需要 PAT）

不要再点「+ 新延伸」：那会新建另一个扩展。在已有的 **Cursor Language Pack** 上更新版本。

1. `npm run package`，得到 `dist/cursor-language-pack-<version>.vsix`。
2. 打开 [出版商管理页](https://marketplace.visualstudio.com/manage)，选出版商 `polang233`。
3. 点列表里已有的扩展（不要「新延伸」）。
4. 上传这个新的 `.vsix`（界面上一般是更新 / 新版本 / 上传包）。
5. 状态会变成 **Verifying**，几分钟后公开页上的版本号会变。Availability 保持 **Public**。

也可以先从 GitHub Release 下载 CI 打好的 `.vsix` 再上传（见方式 C：即使没有 `VSCE_PAT`，打 tag 也会挂 Release）。

#### 方式 B — 本机命令行

需要 [VSCE_PAT](#创建-vsce_pat)。令牌只放在当前终端，不要写进仓库、markdown，也不要贴到聊天里。

```powershell
npm run package
$env:VSCE_PAT = "<token>"
npm run publish:vsce
```

这只会推商店，**不会**创建 GitHub Release。需要 Release 时用方式 C，或自己在 GitHub 上挂 `dist/*.vsix`。

#### 方式 C — 打 `v*` tag，GitHub Actions 打包并发布（推荐）

工作流：[`.github/workflows/release.yml`](../.github/workflows/release.yml)。

1. 把改动提交到 `main`（版本号已经改好）。
2. 打 **和 `config.json` 的 `version` 完全一致** 的 tag，并推送 **main + tag**：

```bash
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

3. CI 会：`npm ci` → sync → `npm run package` → `validate` → 校验 tag 与 `config.json` 一致 →
   把 `.vsix` 挂到 GitHub Release。
4. **若仓库 secret 里有 `VSCE_PAT`**，再跑 `npm run publish:vsce`。没有这个 secret 时这一步会跳过
   （Release 仍然有），然后用方式 A 把 Release 上的包传到商店。

也可以在 Actions 里手动跑 **Release** workflow（`workflow_dispatch`），勾上 publish；同样要有 secret。

只许用 `gh secret list` 确认 secret **名字**。不要打印值。

```bash
gh secret list --repo polang233/cursor-language-pack
```

---

## 创建 VSCE_PAT

方式 B、C 需要。出版商已经是 `polang233`，只是缺这个令牌。

1. 打开 [Azure DevOps PAT](https://dev.azure.com/_usersSettings/tokens)（用和 Marketplace 同一个 Microsoft 账号）。
2. **New Token**。Organization 选 **All accessible organizations**（只绑一个 org 时，商店发布经常 401）。
3. Scopes 选 **Custom** → **Marketplace** → **Manage**（不要只勾 Read）。
4. 创建后 **立刻复制**。页面关掉就看不到了。
5. 二选一（或两个都设，日常发版只靠 GitHub secret）：
   - **GitHub Actions（方式 C）：** 在本机交互写入，不要把值写进命令历史能看到的地方：

     ```bash
     gh secret set VSCE_PAT --repo polang233/cursor-language-pack
     ```

     按提示把令牌粘进 stdin。设好后 `gh secret list` 里应出现名字 `VSCE_PAT`。
   - **本机（方式 B）：** 只在当前 PowerShell 会话：`$env:VSCE_PAT = "<token>"`。

令牌泄露就去 Azure DevOps 撤销，再 `gh secret set` 覆盖。不要把 PAT 提交进 git。

---

## Cursor 升级后

对齐新版本的 NLS，**然后再**按上面发新版本（升 `version`、打新 tag）。不要在旧版本号上重传。

```bash
npm run check-upgrade
# 在 src/i18n/zh-cn/ 里补新键；模块路径变了就改路径，不要重译
node scripts/convert-zh-tw.mjs
npm run sync && npm run verify
```

把 Cursor 版本写进 `config.json` → `target.verifiedCursorVersions`，更新 README 里的覆盖率数字，再发版。

孤儿键可以留着，构建会过滤。键搬家：改 **module path**，不要当新词重译。

更细的流水线说明见 [architecture.zh-CN.md](architecture.zh-CN.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)。

---

## Open VSX（可选）

Cursor 用户用不到。只有当你也想出现在 [open-vsx.org](https://open-vsx.org/) 时才做。

1. 登录，创建 PAT，这是 `OVSX_PAT`。`npx ovsx create-namespace polang233`。
2. 本机：`$env:OVSX_PAT = "<token>"; npm run publish:ovsx`。
3. 或设 GitHub secret `OVSX_PAT`，方式 C 的 tag 会顺带发 Open VSX。

---

## 用户侧（发版说明里可提醒）

- 先卸载 `MS-CEINTL.vscode-language-pack-zh-hans`（以及繁体官方包），不要两个语言包并存。
- 选显示语言后必须 **重启 Cursor**，重载窗口无效。
- 商店索引可能比管理后台的 Verifying 再慢一点；公开页先可用：
  https://marketplace.visualstudio.com/items?itemName=polang233.cursor-language-pack
