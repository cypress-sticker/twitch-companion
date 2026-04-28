# コアたん

**配信をまるっと支える、Twitch配信者向け総合アプリ**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)](https://github.com/cypress-sticker/twitch-companion/releases)
[![Version](https://img.shields.io/badge/Version-0.1.1-green.svg)](https://github.com/cypress-sticker/twitch-companion/releases)

[English README](README.en.md)

コアたんは、Twitch配信者のための無料デスクトップツールです。フォロー・サブスク・レイドなどのアラートをOBSにリアルタイム表示したり、定期コメントをチャットに自動投稿したりと、配信に欲しい機能をひとつにまとめました。

> ⚠️ 現在 **Windows のみ** 対応しています。

---

## 機能

### アラート通知
フォロー・サブスク・レイド・Bits・チャンネルポイントをOBSオーバーレイにリアルタイム表示します。

- 5種のアニメーション（スライド・フェード・バウンスなど）
- 画像・効果音・音量・サイズのカスタマイズ
- タグ式チップエディタでメッセージを柔軟に作成（`{user}`・`{viewers}` など）

### 定期コメント
タイマーで最大5件のメッセージをチャットに自動投稿します。投稿間隔は1〜120分で設定可能です。

### レイド時自動投稿
レイド到着時に、配信者情報を含むウェルカムメッセージを自動でチャットに送信します。

### OBSオーバーレイ
`http://localhost:3001/overlay` をOBSのブラウザソースに追加するだけで使用できます。

### その他
- ダーク / ライトモード
- フォント選択（7種）
- オーバーレイ位置・表示時間のカスタマイズ

---

## ダウンロード

[Releases](https://github.com/cypress-sticker/twitch-companion/releases) から最新の `.exe` または `.zip` をダウンロードしてください。

> **初回起動時の警告について**  
> 「WindowsによってPCが保護されました」と表示される場合は、「詳細情報」→「実行」でご利用いただけます。コード署名に未対応のため表示される警告であり、ウイルスではありません。

---

## 使い方

1. インストーラー（`.exe`）を実行してアプリを起動
2. **「Twitchでログイン」** をクリックして認証
3. アラート・定期コメントを設定して **「保存」**
4. OBS に `http://localhost:3001/overlay` をブラウザソースとして追加

---

## 開発環境のセットアップ

### 必要なもの
- [Node.js](https://nodejs.org/) 18以上
- Twitch Developer Application（[dev.twitch.tv/console](https://dev.twitch.tv/console) で作成）

### 手順

```bash
git clone https://github.com/cypress-sticker/twitch-companion.git
cd twitch-companion
npm install
```

`.env.example` をコピーして `.env` を作成し、自分のTwitch Client IDを設定します。

```bash
cp .env.example .env
# .env を編集して TWITCH_CLIENT_ID を入力
```

Twitch Developer Consoleで以下を設定してください：
- **OAuth Redirect URL**: `http://localhost:3000`

```bash
npm start
```

### ビルド

```bash
npm run build
```

`release/` フォルダにインストーラー（`.exe`）とポータブル版（`.zip`）が生成されます。

---

## アーキテクチャ

```
main.js                  ← Electron メインプロセス
preload.js               ← IPC ブリッジ（context bridge）
renderer/                ← フロントエンド（HTML / CSS / JS）
src/
  auth/oauth.js          ← Twitch OAuth（Implicit Flow）
  config/settings.js     ← 設定の読み書き（userData/settings.json）
  servers/
    alert-server.js      ← EventSub WebSocket + HTTP オーバーレイサーバー
    bot-server.js        ← 定期コメント（tmi.js）
  utils/ipc-channels.js  ← IPC チャンネル定数
assets/                  ← アイコン・デフォルト効果音
```

---

## コントリビューション

バグ報告・機能提案・プルリクエスト、いずれも歓迎です。  
詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

---

## ライセンス

[MIT](LICENSE) © cypress_sticker
