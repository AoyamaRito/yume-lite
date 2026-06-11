/**
 * run.js — yume-constraint-simple のメイン・ストーリー
 *
 * このファイルを実行すると：
 *   1. yume-lite の推奨フロー（getSurface / skeleton / getImpact → expand）
 *   2. 厚いビューでの「駆動定義だけ」の編集
 *   3. apply → 即 deriveQuote で完全状態を再構築
 *   4. domainTag による自己記述金額（usd:）の効果
 *   5. makeThickEdit / applyThickEdit の公式コマンド形
 *
 * が一気に見られます。
 *
 * 「制約テキストを編集 → 純粋導出で状態が生まれる」だけを極限まで明確に。
 */

import {
  Graph, Block,
  getSurface, skeleton, getImpact,
  expand, apply,
  makeThickEdit, applyThickEdit,
  domainTag, DOMAINS,
} from '../../core.js';

import {
  makeSampleInput,
  quoteInputToBlockContent,
  loadQuoteInputFromBlockContent,
  deriveQuote,
} from './constraint-simple.js';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   yume-constraint-simple  —  制約駆動エッセンス最小サンプル   ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('【目的】');
console.log('  状態（料金合計など）は「直接いじらない」。');
console.log('  駆動する「制約定義（ルール・金額・割引）」だけを yume Block に持ち、');
console.log('  expand/apply で編集 → deriveQuote(純粋関数) で常に正しい状態を再構築。\n');

// ============================================================
// 0. まず yume の「安価な入り口」を使う（スケール時も同じ）
// ============================================================

const graph = new Graph();

// meta: プロジェクトの単一の真実のソース（getSurface が最初に見つけるもの）
const meta = new Block({ id: 'meta:pricing-demo', type: 'manifest' });
meta.commit({
  content: [
    'Project: yume-constraint-simple (essence sample)',
    'Pattern: All derived totals come from constraint definitions via deriveQuote.',
    'Editable surface: ONLY the policy block (pricing:policy). Never store expanded totals in Blocks.',
    'Key blocks: meta:pricing-demo, pricing:policy',
    'Domain tags: usd: values are self-describing (LLM-First Typing).',
    'Manifest keys (contract): base, lines, discounts, taxRate, shipping. Workers never invent or rename keys; renames happen only in a mapping layer.',
    'Key roots: meta:pricing-demo (manifest), pricing:policy (primary constraints source).',
  ].join('\n'),
  tags: ['manifest', 'overview', 'constraint-driven', 'yume-lite'],
  refs: [{ kind: 'policy', target: 'pricing:policy' }],
});
graph.add(meta);

// 制約の一次ソース Block（これが thick view の対象）
const policyBlock = new Block({ id: 'pricing:policy', type: 'policy' });
const initialInput = makeSampleInput();
policyBlock.commit({
  content: quoteInputToBlockContent(initialInput),
  tags: ['constraints', 'source-of-truth', 'pricing'],
});
graph.add(policyBlock);

console.log('【Step 0: 推奨の最初の一手 — getSurface / skeleton / getImpact】');
const surface = getSurface(graph);
console.log('getSurface():', surface.kind, '→', surface.id || '(inferred)');
console.log('  advice:', surface.advice || '(manifest found)');

console.log('\nskeleton(pricing:policy, {depth:0}):');
const skel = skeleton(graph, 'pricing:policy', { depth: 0 });
console.dir(skel, { depth: 1 });

console.log('\ngetImpact(pricing:policy):');
const impact = getImpact(graph, 'pricing:policy');
console.log('  directDependents:', impact.directDependents.length, '(このポリシーを変えたら誰に影響か)');

// ============================================================
// 1. expand → 厚いビュー（ここが「編集ツールが読むもの」）
//    注意: 出てくるのは「駆動定義テキスト」だけ。導出された total は一切入っていない。
// ============================================================

console.log('\n【Step 1: expand — 厚いビュー（これを人間/AI が編集する）】');
const thick = expand(graph, 'pricing:policy');
console.log(thick);

// 初期導出（編集前）
let currentInput = loadQuoteInputFromBlockContent(policyBlock.content);
let result = deriveQuote(currentInput);

console.log('\n【初期状態の導出結果（deriveQuote の出力）】');
console.log('  pre-discount:', result.preDiscount);
console.log('  applied:', result.appliedAdjustments.map(a => `${a.type}:${a.name||a.rate||''} ${a.delta||''}`).join(' | '));
console.log('  >>> TOTAL:', result.total);
console.log('  summary:', result.summary);

// ============================================================
// 2. 「厚いビューを編集」する（ここが本番の操作イメージ）
//    例: 割引を増やし、アイテムを追加し、tax を変える
// ============================================================

console.log('\n【Step 2: 厚いビューを編集（駆動変数だけを変える）】');
let edited = thick
  // 割引を強化（元の 0.12 を 0.15 にし、friend 割引を追加）
  .replace('discount: early-bird 0.12', 'discount: early-bird 0.15\ndiscount: friend 0.05')
  // アイテム追加
  .replace('line: "extra options x2" usd:1800', 'line: "extra options x2" usd:1800\nline: "priority handling" usd:2500')
  // tax を少し下げる（政策変更）— 実際の文字列に合わせる
  .replace('tax: 0.1', 'tax: 0.08');

console.log('=== 編集後のテキスト（人間が書いたつもり） ===');
console.log(edited);

// ============================================================
// 3. apply で書き戻し → 即 derive で新しい状態を得る
//    これが「制約駆動」の核心ループ。
// ============================================================

console.log('\n【Step 3: apply → 再導出】');
const updates = apply(graph, 'pricing:policy', edited);
console.log('apply result:', updates.ok ? 'ok' : 'fail', 'warnings:', updates.warnings?.length || 0);

currentInput = loadQuoteInputFromBlockContent(policyBlock.content);
result = deriveQuote(currentInput);

console.log('\n【編集後の導出結果】');
console.log('  pre-discount:', result.preDiscount);
console.log('  applied:', result.appliedAdjustments.map(a => `${a.type} ${a.name||a.rate||''} ${a.delta||''}`).join(' | '));
console.log('  >>> NEW TOTAL:', result.total);
console.log('  summary:', result.summary);

// ============================================================
// 4. 公式の「書き込みコマンド」形（ブラウザ/サーバー/エージェント跨ぎで重要）
//    クライアントは makeThickEdit でコマンドを作って送るだけ。
//    本物の権威（サーバーなど）が applyThickEdit で適用。
// ============================================================

console.log('\n【Step 4: 公式書き込みコマンド形（makeThickEdit / applyThickEdit）】');

const cmd = makeThickEdit({
  root: 'pricing:policy',
  content: edited,           // すでに編集済みのテキストを使う（デモ用）
  opts: {},
});
console.log('生成された portable command:');
console.log('  kind:', cmd.kind);
console.log('  root:', cmd.root);
console.log('  (content は省略表示)');

// 権威側（ここでは同じ graph で代用）
const authorityResult = applyThickEdit(graph, cmd);
console.log('applyThickEdit on authority:', authorityResult.ok ? 'success' : 'rejected');

const afterCmdInput = loadQuoteInputFromBlockContent(graph.get('pricing:policy').content);
const afterCmdResult = deriveQuote(afterCmdInput);
console.log('コマンド適用後の TOTAL:', afterCmdResult.total);

// ============================================================
// 5. なぜこれが強いのか（エッセンスの言語化）
// ============================================================

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                        エッセンスのポイント                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');

console.log(`
【1. 厚いビューが小さいまま保てる】
   expand すると「制約定義（数行〜十数行）」しか出てこない。
   導出された何十個もの明細や最終金額は一切テキストに入らない。

【2. 状態は「導出の出力」として正確に一発特定される】
   if (plan==='pro' && coupon) ... みたいな山は存在しない。
   deriveQuote(input) を呼ぶだけで、現在の制約集合に対する
   唯一の正しい totals が返ってくる。

【3. 履歴・undo・LLM編集が劇的にやりやすい】
   Block に保存されるのは「どの割引を有効にしたか」「baseをいくらにしたか」。
   巨大な計算済みリストの diff ではなく、意味のある高レベル変更だけが履歴に残る。

【4. domainTag による LLM-First Typing】
   出力に 'usd:12300' と入っているだけで、LLM は「これは金額だ」と
   変数名やコメントを見なくても即理解できる（core の最重要規約）。

【5. スケール時の規律（getSurface → getImpact → targeted expand）】
   このサンプルは小さいが、10k LOC になっても同じ手順で始める。
   最初に skeleton や getSurface を呼ぶ習慣が「clearify」を守る。

【次のステップ】
  - 自分のドメインで似た「XXXInput + deriveXXX + to/fromBlockContent」を作る。
  - 複雑な combinatorial が必要になったら yume-lite/constraint-template.js をコピー。
`);

console.log('=== デモ終了 ===');
console.log('node run.js を何度か編集しながら回してみてください。');
console.log('「制約テキストを変える → 全部の合計が正しく再計算される」感覚が掴めるはずです。\n');
