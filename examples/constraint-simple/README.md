# yume-constraint-simple

**yume-lite の「制約駆動状態導出」パターンを、必要最小限まで削ぎ落とした「一番わかりやすい」サンプル。**

- 誰でも 5〜10 分で「なぜこれが強いのか」を体感できる
- コード総量が少なく、1つの run.js で全ストーリーが完結
- 3Dループ・特殊ミラー・複雑パーサなどは一切なし
- 料金計算（pricing / fee）という**普遍的に理解しやすいドメイン**を採用

---

## このサンプルが教えること（エッセンス）

### 核心の考え方
**状態は直接編集・保存しない。**  
「制約定義（駆動変数）」だけを yume Block に一次ソースとして持ち、  
`deriveXXX(制約)` という**純粋関数**で必要なときに完全な状態を再構築する。

これにより：

- `expand` で出てくるテキストが**極めて小さい**（駆動ルールだけ）
- LLM / 人間が「今何が効いているか」を一目で把握できる
- 履歴が「baseを上げた」「この割引を追加した」といった**意味のある単位**になる
- 導出ロジックを1箇所に集中できる（if-else の山が消える）

### yume-lite との関係
- `core.js` の `Block` / `Graph` / `expand` / `apply` / `getSurface` / `skeleton` / `getImpact` / `domainTag` を**全部使って**デモ
- `makeThickEdit` + `applyThickEdit`（本物の権威側にコマンドを送る公式パス）も明示
- `constraint-template.js` は「もっと組み合わせ爆発する軸が必要になったとき」の living template として別扱い（このサンプルでは使わず、ドメイン特化の軽いテキスト形式で代用）

---

## 実行方法

```bash
# このサンプルは yume-lite/examples/ 内に公式に同梱されています
cd yume-lite/examples/constraint-simple
node run.js
```

（yume-lite ディレクトリから相対で実行する場合も同じ）

これだけで以下のすべてが順にコンソールに出力されます：

1. `getSurface` / `skeleton` / `getImpact`（スケール時も同じ最初の一手）
2. `expand` による厚いビュー（**制約定義テキストだけ**が見える）
3. テキスト編集（割引追加・アイテム追加・税率変更）
4. `apply` → `deriveQuote` で即座に新しい totals（usd: タグ付き）が得られる
5. `makeThickEdit` / `applyThickEdit` のコマンド形デモ
6. 最後に「なぜこれが強いのか」の言語化サマリ

---

## ディレクトリ構成（最小）

```
yume-lite/examples/constraint-simple/
├── README.md
├── package.json
├── run.js                 # 全部入りのストーリーテラー（これを node で実行）
└── constraint-simple.js   # ドメインロジック（parse / derive / yume統合ヘルパー）
```

**これは yume-lite に公式同梱されたサンプル**です。

`constraint-simple.js` を読めば「自分のドメインに置き換えるときのテンプレート」としてそのまま使えます。

---

## コードで特に見てほしいポイント

### 1. 厚いビューの中身が小さい（constraint-simple.js + run.js）

```js
// expand した結果に出てくるのはこれだけ
base: usd:10000
line: "standard service" usd:4500
discount: early-bird 0.15
tax: 0.08
shipping: usd:1200
```

導出された `total: usd:xxxx` や明細の計算結果は**一切入らない**。

### 2. 導出は純粋関数（deriveQuote）

```js
const result = deriveQuote(loadedInput);
// result.total === 'usd:12345'
// result.appliedAdjustments に何が効いたかが全部入る
```

この関数を呼ぶだけで「現在の制約集合に対する唯一の正しい答え」が返る。

### 3. yume Block には「駆動定義」しか入らない

`pricing:policy` ブロックの `.content` は常に上記の短いテキスト形式。  
巨大な計算済みデータは保存しない。

### 4. domainTag の効果（core の最重要規約）

導出結果に `usd:12900` と書いてあるだけで、LLM は「これは金額で、単位はUSD」と即座に理解できる。  
変数名 `grandTotal` やコメントに頼らない。

---

## 推奨の作業フロー（このサンプルが体現）

（どんな yume-lite プロジェクトでも同じ）

1. `getSurface(graph)` または `skeleton(root, {depth: 0 or 1})` を**最初に呼ぶ**
2. 触る前に `getImpact(blockId)` で影響範囲を確認
3. 必要な最小スコープで `expand`
4. テキストを編集（BLOCK ヘッダと hash は触らない）
5. `apply`（または `makeThickEdit` → パイプライン経由 → `applyThickEdit`）
6. 必要なら `deriveXXX` を呼んでビュー/キャッシュを更新
7. また 1. に戻る

---

## 拡張アイデア（自分でやってみてほしい）

- 自分のドメインに置き換える（在庫・スケジュール・キャラクターステータス・レシピなど）
- 割引ルールを「名前でディスパッチ」から「constraint-template.js の cartesian 方式」に変えてみる
- 複数の Block に制約を分割（例: `quote:base-rules` + `quote:seasonal-campaigns`）
- derive 結果をさらに別の制約の入力にする（多段導出）

---

## 関連（把握順推奨）

1. `yume-lite/README.md` + `yume-lite/core.js`（これを先に読む）
2. `yume-lite/constraint-template.js`（combinatorial が必要になったときの living template）
3. `yume-lite/examples/constraint-simple/`（今ここ：yume-lite に同梱の公式エッセンスサンプル）

---

このサンプルが「制約駆動って結局何が嬉しいの？」をクリアに伝えるものになっていれば幸いです。

質問や改善案があれば、遠慮なくどうぞ。
