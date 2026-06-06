/**
 * constraint-simple.js
 *
 * yume-lite「制約駆動状態導出」のエッセンスを最小で抜き出した、超わかりやすいサンプル。
 *
 * 目的（yume-constraint-voxel から抽出した本質）:
 * - 状態は「直接編集しない」。**駆動変数（制約定義）だけを編集**する。
 * - 駆動変数は yume Block に載り、expand/apply の対象になる（小さい！）。
 * - 実際の完全な状態（ここでは「見積もり totals」）は、**純粋関数 deriveQuote で常に再導出**される。
 * - これにより thick view が小さく保て、履歴が意味のある単位になり、LLM が全体を把握しやすい。
 *
 * このドメインは「見積もり (Quote / Pricing)」。
 * - 金額は domainTag(DOMAINS.USD, ...) で自己記述的にする（LLM-First Typing）。
 * - ルール追加・変更が「テキスト1行」で済むのがポイント。
 *
 * voxel の本格実装に比べて：
 * - 3Dループ・ミラー特殊処理・複雑パーサを全部排除
 * - 1つの derive 関数で「金額の畳み込み」だけに集中
 * - テキスト形式が「# コメント + key: value」だけで誰でも即読める
 */

import { domainTag, DOMAINS, Graph, Block, expand, apply, getSurface, skeleton, getImpact, makeThickEdit, applyThickEdit } from '../../core.js';

// ============================================================
// 1. ドメイン固有の「制約（駆動定義）」表現
//    thick view で人間/AI が直接編集するテキストの形
// ============================================================

/**
 * 見積もり駆動定義の内部表現（parse 後の形）。
 * これが「一次ソース」。voxels や final total はここから導出するだけ。
 */
export function createQuoteInput({
  base = 0,
  lines = [],           // [{label, amountUsd}]
  discounts = [],       // [{name, percent}]
  taxRate = 0,
  shipping = 0,
} = {}) {
  return { base, lines, discounts, taxRate, shipping };
}

// ============================================================
// 2. テキスト <-> 駆動定義 の往復（thick view の主役）
//    このフォーマットが expand で出て、apply で書き戻される。
//    極力シンプルに：# コメント、 key: value 系
// ============================================================

export function quoteToBlockContent(input, title = 'quote:policy') {
  const lines = [];
  lines.push(`# ${title} — 駆動定義だけを書く（これを thick edit する）`);
  lines.push('');
  lines.push(`base: usd:${input.base}`);
  lines.push('');

  if (input.lines?.length) {
    lines.push('# 明細行（アイテム追加・変更はここ）');
    for (const ln of input.lines) {
      lines.push(`line: "${ln.label}" usd:${ln.amountUsd}`);
    }
    lines.push('');
  }

  if (input.discounts?.length) {
    lines.push('# 割引ルール（percent は 0.0-1.0）');
    for (const d of input.discounts) {
      lines.push(`discount: ${d.name} ${d.percent}`);
    }
    lines.push('');
  }

  lines.push(`tax: ${input.taxRate}`);
  if (input.shipping) {
    lines.push(`shipping: usd:${input.shipping}`);
  }
  return lines.join('\n');
}

export function loadQuoteFromBlockContent(content) {
  if (!content) return createQuoteInput();

  const input = createQuoteInput();
  const textLines = content.split('\n');

  for (const raw of textLines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('base:')) {
      const m = line.match(/usd:(\d+)/);
      if (m) input.base = parseInt(m[1], 10);
    } else if (line.startsWith('line:')) {
      const m = line.match(/"([^"]+)"\s+usd:(\d+)/);
      if (m) {
        input.lines.push({ label: m[1], amountUsd: parseInt(m[2], 10) });
      }
    } else if (line.startsWith('discount:')) {
      const m = line.match(/(\S+)\s+([\d.]+)/);
      if (m) {
        input.discounts.push({ name: m[1], percent: parseFloat(m[2]) });
      }
    } else if (line.startsWith('tax:')) {
      const m = line.match(/([\d.]+)/);
      if (m) input.taxRate = parseFloat(m[1]);
    } else if (line.startsWith('shipping:')) {
      const m = line.match(/usd:(\d+)/);
      if (m) input.shipping = parseInt(m[1], 10);
    }
  }
  return input;
}

// ============================================================
// 3. 純粋導出関数（これが本質）
//    駆動定義だけを見て、常に一貫した「現在の見積もり全体」を返す。
//    直接 total を触らない。制約（ルール）の出力として生まれる。
// ============================================================

/**
 * 駆動定義から完全な見積もり結果を導出。
 * すべての金額は domainTag で「usd:xxxx」として自己記述。
 */
export function deriveQuote(input) {
  let running = input.base || 0;

  const applied = [];
  const detailLines = [];

  // ベース + 明細
  detailLines.push({ label: 'base', amount: domainTag(DOMAINS.USD, input.base) });
  for (const ln of input.lines || []) {
    running += ln.amountUsd;
    detailLines.push({ label: ln.label, amount: domainTag(DOMAINS.USD, ln.amountUsd) });
  }

  const preDiscount = running;

  // 割引を順に適用（このサンプルでは単純に乗算累積）
  let discountTotal = 0;
  for (const d of input.discounts || []) {
    const delta = Math.round(preDiscount * d.percent);
    discountTotal += delta;
    running -= delta;
    applied.push({
      type: 'discount',
      name: d.name,
      percent: d.percent,
      delta: domainTag(DOMAINS.USD, -delta),
    });
  }

  const taxable = running;
  const tax = Math.round(taxable * (input.taxRate || 0));
  running += tax;
  if (tax > 0) {
    applied.push({ type: 'tax', rate: input.taxRate, delta: domainTag(DOMAINS.USD, tax) });
  }

  const ship = input.shipping || 0;
  running += ship;
  if (ship > 0) {
    applied.push({ type: 'shipping', delta: domainTag(DOMAINS.USD, ship) });
  }

  const total = running;

  return {
    input,
    detailLines,
    appliedAdjustments: applied,
    preDiscount: domainTag(DOMAINS.USD, preDiscount),
    tax: domainTag(DOMAINS.USD, tax),
    shipping: domainTag(DOMAINS.USD, ship),
    total: domainTag(DOMAINS.USD, total),
    // 人間が見やすいサマリ（デモ用）
    summary: `total=${domainTag(DOMAINS.USD, total)} (pre-discount ${domainTag(DOMAINS.USD, preDiscount)}, discounts ${applied.filter(a=>a.type==='discount').length})`,
  };
}

// ============================================================
// 4. yume との統合ヘルパー（voxel と同等のパターン）
// ============================================================

/**
 * 駆動定義を yume Block の content として保存するための形に。
 * これを expand すると「制約テキスト」だけが出てくる（巨大な total 一覧は出ない）。
 */
export function quoteInputToBlockContent(input) {
  return quoteToBlockContent(input);
}

export function loadQuoteInputFromBlockContent(content) {
  return loadQuoteFromBlockContent(content);
}

// ============================================================
// 5. 便利なファクトリ（デモでよく使う初期状態）
// ============================================================

export function makeSampleInput() {
  return createQuoteInput({
    base: 10000,
    lines: [
      { label: '基本デザイン', amountUsd: 4500 },
      { label: '追加ページ x2', amountUsd: 1800 },
    ],
    discounts: [
      { name: 'early-bird', percent: 0.12 },
    ],
    taxRate: 0.10,
    shipping: 1200,
  });
}
