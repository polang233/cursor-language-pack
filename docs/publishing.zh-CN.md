# 发布语言包

**现在没有上架。** 版本是 `0.0.0`。打第一个 tag 之前先读这篇。

Cursor 的扩展源**不是** Open VSX。`product.json` → `extensionsGallery.serviceUrl`
是 `https://marketplace.cursorapi.com/_apis/public/gallery`，也就是
[Visual Studio Marketplace](https://marketplace.visualstudio.com/) 的代理。
用户在 Cursor 里搜到的是微软商店里的扩展。先发那里。

[`config.json`](../config.json) 里的 `publisher` 是 `polang233`。必须和 VS Marketplace
的 **Publisher**、以及（如果也发）Open VSX 的 **Namespace** 一致。

## 两个仓库

| | VS Code Marketplace（**Cursor 要用**） | Open VSX（可选） |
| --- | --- | --- |
| 谁在跑 | Microsoft | Eclipse Foundation |
| 地址 | `marketplace.visualstudio.com/items?itemName=<publisher>.<name>` | `open-vsx.org/extension/<namespace>/<name>` |
| 你的 id 叫 | **Publisher** | **Namespace** |
| Token 环境变量 | `VSCE_PAT` | `OVSX_PAT` |
| 发布命令 | `npm run publish:vsce`（占位） | `npm run publish:ovsx`（占位） |

两者独立。两边都用 `polang233`，扩展身份才是
`polang233.cursor-language-pack`。

Kiro 的包之所以先发 Open VSX，是因为 Kiro 的商店就是 Open VSX。不要把那一段原样抄过来。

## 扩展存在之后的前提

1. `npm run package` 产出 `dist/cursor-language-pack-<version>.vsix`
2. `config.json` 的 `version` 和 git tag（`v*`）一致
3. 在 [Marketplace 出版商管理](https://marketplace.visualstudio.com/manage) 建 publisher `polang233`
4. Azure DevOps PAT，范围 **Marketplace → Manage** → `VSCE_PAT`
5. 仓库 GitHub Actions secret `VSCE_PAT`（聊天里只核对名字：`gh secret list`）

不要把 token 写进仓库、markdown，也不要打印。

## 上架之后

- 在 Cursor 里先卸 `MS-CEINTL.vscode-language-pack-zh-hans`（以及繁体）再装本包
- 下一次打 tag 前，`config.json` 和 `package.json` 的版本一起加
