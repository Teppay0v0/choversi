# ChoVersi Online Server

オンライン対戦用の中継サーバー。Cloudflare Workers + Durable Objects 上で動きます。

## 初回セットアップ

### 1. Cloudflare アカウント作成（無料）
https://dash.cloudflare.com/sign-up

### 2. wrangler CLI のインストール
```bash
cd worker
npm install
```

### 3. ログイン
```bash
npx wrangler login
```
（ブラウザが開いて Cloudflare アカウントで認証）

### 4. デプロイ
```bash
npx wrangler deploy
```

成功すると次のような URL が表示されます:
```
Published choversi-online (X.XX sec)
  https://choversi-online.<your-subdomain>.workers.dev
```

その URL をコピーし、`choversi/game.html` の `ONLINE_SERVER` 定数に貼り付けてください（後述）。

## ローカル開発

```bash
npx wrangler dev
```
ローカルで http://localhost:8787 に立ち上がります。

## 動作確認

```bash
# 部屋作成
curl -X POST https://choversi-online.<your-subdomain>.workers.dev/api/create

# レスポンス例: {"code":"ABC123"}
```

## API

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `POST /api/create` | POST | 新しいルームを作成、6文字のコードを返す |
| `GET /ws/:code?name=...` | WS Upgrade | ルームに WebSocket 接続 |
| `GET /health` | GET | ヘルスチェック |

## WebSocket プロトコル

### サーバー → クライアント

| type | payload | 説明 |
|---|---|---|
| `joined` | `{color, partnerName}` | 自分が入室。色（D/L）と相手の名前 |
| `start` | `{color, myHand, oppHandSize, partnerName}` | 2人揃って試合開始。手札を含む |
| `move` | `{r, c, skill, from}` | 相手の通常手 |
| `vanish` | `{r, c, from}` | 相手の消滅 |
| `gyakushu` | `{r, c, from}` | 相手の逆襲発動 |
| `pass` | `{from}` | 相手のパス |
| `chat` | `{text, from}` | チャット |
| `opponent_left` | — | 相手が切断 |
| `error` | `{message}` | エラー |

### クライアント → サーバー

`type` は `move | vanish | gyakushu | pass | chat | ready | rematch_request` のいずれか。
サーバーはそのまま相手に中継します（`from` フィールドを付与して送出）。

## コスト

Cloudflare Workers 無料プラン:
- Workers: 100,000 リクエスト/日
- Durable Objects: 4 GB-time/月 + 13,000 リクエスト/日

このゲームの規模では完全無料で運用可能です。
