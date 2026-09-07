# 公開手順（Vercel）

MAAi は単一のHTMLファイルなので、ビルドは要らない。
`maai/` を静的ディレクトリとしてそのまま配信する。

## 初回だけ：Vercel 側の設定

1. https://vercel.com/new でこのリポジトリ（`Teppay0v0/choversi`）を Import
2. **Root Directory を `maai` にする**（ここが最重要。リポジトリのルートは
   別プロジェクト＝choversi 本体なので、必ず `maai` を指定する）
3. Framework Preset は **Other**、Build Command は空、Output Directory も空
4. Deploy

以降は `maai/` への push で自動デプロイされる。

## 公開ブランチ

Settings → Git → Production Branch を、公開したいブランチに設定する。
`main` にマージしていない間は `claude/mmai-game-dev-vya53q` を指定すればよい。

## 配信されるもの

`.vercelignore` により、上がるのは `index.html`（2.5MB）だけ。
3Dモデルは base64 で内蔵されているので `assets/`（7.7MB）は実行時に読まれない。

## 注意

- **three.js を CDN から読む**（cdnjs / jsdelivr）。読めなければ2D描画へ自動で落ちる
- **初回ロードは 2.5MB**。モバイル回線で数秒かかる
- 縦持ち専用。PCで開くと縦長に表示される（仕様どおり）
