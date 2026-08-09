# 日本語クラス・ゲーム（Japanese Class Games）

日本語クラスで使う **ゲーム集＋授業ツール** のまとまり。すべて素の HTML/JS・API キー不要・localStorage 保存。
**単語カードメーカー（別プロジェクト）から切り離した独立プロジェクト**。将来の販売を見据えて分離。

## 中身
- 入口: `games.html`（`/` は `index.html` から `games.html` へリダイレクト）
- ゲーム: `roulette`（ルーレット）/ `bingo`（ビンゴ・ビンゴカード発行つき）/ `memory`（神経衰弱）/ `wordquiz`（単語クイズ）/ `gesture`（ジェスチャー）
- 授業ツール: `grammar`（今日の文法・グループ分け）/ `katsuyo`（活用の部屋）/ `kanji`（漢字辞典）/ `roleplay`（ロールプレイ）/ `textbook`（今日の教科書）/ `strokes`（書き順）/ `words`（今日の単語）/ `phrases`（今日のフレーズ）/ `memorize`（言葉を覚える・数字を覚える）
- 共通JS: `intro.js`（各ページの説明カード）/ `editbar.js`（編集バー）/ `kana-strokes.js` `kanji-strokes.js`（書き順データ）

## ローカルで動かす
```
node server.mjs   # → http://localhost:5183
```
`start.bat`（ダブルクリック）でも起動します。

## デプロイ
Vercel（静的ホスティング）。`vercel --prod` で本番に反映。

## メモ
- データは各ブラウザの **localStorage のみ**（端末間で共有されない）。移行・バックアップは `games.html` の「設定のバックアップ」から。
- 印刷は端末により回転仕様（ビンゴカード等）。
- 元は単語カードメーカー（`word-card-maker` リポジトリ）と同居していたが、2026-08 に独立化。
