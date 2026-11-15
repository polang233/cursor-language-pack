# Cursor Language Pack

Cursor の日本語・簡体字中国語・繁体字中国語の言語パックです。エディターに加え、Cursor の設定やエージェント画面を翻訳します。

実行前に Cursor を完全に終了し、インストール後に起動し直してください。Node.js 22 以降を推奨します。最低バージョンは 18.17 です。

次のコマンドで日本語をインストールできます。

```bash
npx @polang233/cursor-language-pack@latest --locale=ja
```

引数を省略すると、システムの表示言語から選びます。日本語は `ja`、中国語の繁体字は `zh-tw`、それ以外は `zh-cn` です。`--locale=ja`、`--locale=zh-cn`、`--locale=zh-tw` で指定できます。アプリを更新した後は、同じコマンドを再実行してください。

- `preview`：変更内容を確認
- `status`：適用状況を確認
- `restore`：アプリのファイルを復元
- `--dir="インストール先"`：Cursor の場所を指定

拡張機能の ID は `polang233.cursor-language-pack` です。言語設定と拡張機能は `restore` の対象外です。拡張機能だけを入れた場合、プログラムに直接書かれた英語の翻訳にはコマンドの実行が必要です。

Cursor 3.30.14 に対応しています。AI の回答言語は、表示言語とは別に Rules で設定できます。

[简体中文](../README.md) · [English](README.en.md) · [ソースコード](https://github.com/polang233/cursor-language-pack)
