# 发布语言包

Cursor 的扩展市场**不是** Open VSX。`product.json` → `extensionsGallery.serviceUrl` 是
`https://marketplace.cursorapi.com/_apis/public/gallery`，也就是
[Visual Studio Marketplace](https://marketplace.visualstudio.com/) 的代理。用户在 Cursor
里搜索，搜到的是微软商店。请**先上 VS Marketplace**。

[`config.json`](../config.json) 里的 `publisher` 是 `polang233`。这个字符串必须等于
VS Marketplace 的**出版商**，以及（若也上 Open VSX）那边的**命名空间**。

## 两个市场，两套账号

| | VS Code Marketplace（**Cursor 用户需要**） | Open VSX（可选） |
| --- | --- | --- |
| 运营方 | Microsoft | Eclipse Foundation |
| 扩展地址 | `marketplace.visualstudio.com/items?itemName=<出版商>.<名>` | `open-vsx.org/extension/<命名空间>/<名>` |
| 你的 id 叫什么 | **Publisher（出版商）** | **Namespace（命名空间）** |
| 令牌环境变量 | `VSCE_PAT` | `OVSX_PAT` |
| 发布命令 | `npm run publish:vsce` | `npm run publish:ovsx` |

二者互不相通。两边用同一个 id（`polang233`），扩展身份就一直是 `polang233.cursor-language-pack`。

姊妹项目 [kiro-language-pack](https://github.com/polang233/kiro-language-pack) 之所以先发
Open VSX，是因为 Kiro 的商店就是 Open VSX。不要把那一段顺序抄过来。

## 准备

```bash
npm install
npm run package          # 产出 dist/cursor-language-pack-<version>.vsix
```

确认 `config.json` 的 `version` 与即将打的 tag 一致（CI 在 `v*` tag 上会校验）。

| 页面上的位置 | 来源 |
| --- | --- |
| 正文 | `src/marketplace/README.md`，构建时复制进 `.vsix` |
| 标题和短描述 | `config.json` → `pack.displayName`、`pack.description` |
| 搜索关键词 | `src/manifest.template.json` → `keywords`，外加打包进去的 locale id |

## VS Code Marketplace（Cursor 用户需要）

1. 打开 [出版商管理页](https://marketplace.visualstudio.com/manage)，用 Microsoft 账号登录。
2. 创建出版商，名称尽量与 `config.json` → `publisher` 一致（`polang233`）。
3. 创建带 **Marketplace → Manage** 权限的 Azure DevOps PAT，这就是 `VSCE_PAT`。
4. 发布：

```bash
# Windows PowerShell
$env:VSCE_PAT = "your-token"
npm run publish:vsce
```

5. **CI：** 仓库 secret `VSCE_PAT`（目前还没设）。打匹配的 tag：

```bash
git tag v0.1.0
git push origin v0.1.0
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) 会打包 `.vsix`、挂到
GitHub Release，并在 secret 存在时跑 `npm run publish:vsce`。只许用 `gh secret list` 确认**名字**。
不要把令牌写进仓库、写进 markdown、或打印出来。

## Open VSX（可选）

只有当你也想出现在 [open-vsx.org](https://open-vsx.org/) 时才需要。创建 PAT（`OVSX_PAT`），
`npx ovsx create-namespace polang233`，然后 `npm run publish:ovsx`。

## 发布之后

- 在 Cursor 里先卸载 `MS-CEINTL.vscode-language-pack-zh-hans`（以及繁体包）再装本扩展
- 下一次发版前同时改 `config.json` 和 `package.json` 的 `version`
