/**
 * constraint-simple.js
 *
 * yume-lite「制約駆動状態導出」のエッセンスを最小で抜き出した、超わかりやすいサンプル。
 *
 * 目的（yume-constraint-voxel から抽出した本質）:
 * - 状態は「直接編集しない」。**駆動変数（制約定義）だけを編集**する。
 * - 駆動変数は yume Block に載り、expand/apply の対象になる（小さい！）。
 * - 実際の完全な状態（ここでは「料金 totals」）は、**純粋関数 deriveQuote で常に再導出**される。
 * - これにより thick view が小さく保て、履歴が意味のある単位になり、LLM が全体を把握しやすい。
 *
 * このドメインは「料金計算 (Pricing / Fee)」。
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
 * 料金駆動定義の内部表現（parse 後の形）。
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

export function quoteToBlockContent(input, title = 'pricing:policy') {
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
// 3. 純粋導出関数（これが本質） -- YVCP rewrite (Packet 14)
//    駆動定義だけを見て、常に一貫した「現在の料金全体」を返す。
//    直接 total を触らない。制約（ルール）の出力として生まれる。
//    関係性を所属する v-group variables (v00x stables) 上の純粋 constraint 関数として表現。
//    完全に並列実行可能な state behavior 関数群 (deriveBaseGroup(v001), deriveDiscountsGroup(v00x), deriveTaxGroup など) に分割し、独立実行→combine。
//    返却 state では domain-tagged values を直接使用（applied/results 内に {name, value} 二重構造を作らない）。
// ============================================================

/**
 * 各 v-group に対する純粋な state behavior 関数群。
 * これらは所属 v00x stables のみ（+必要最小 cross input）で動作し、独立・並列可能。
 * すべて返り値で domain-tagged value を直接用いる。
 */
function deriveBaseGroup(v001) {
  const val = v001 || 0;
  return {
    detail: { label: 'base', amount: domainTag(DOMAINS.USD, val) },
    contrib: val,
  };
}

function deriveLinesGroup(lineItems) {
  // v002, v003, ... に対応する lines group
  return (lineItems || []).map(item => ({
    detail: { label: item.label, amount: domainTag(DOMAINS.USD, item.amountUsd) },
    contrib: item.amountUsd,
  }));
}

function deriveDiscountsGroup(discountItems, preDiscountRaw) {
  // v00x (v004=early-bird など discounts group) に対する constraint
  return (discountItems || []).map(item => {
    const deltaRaw = Math.round(preDiscountRaw * item.percent);
    return {
      name: item.name,
      percent: item.percent,
      delta: domainTag(DOMAINS.USD, -deltaRaw), // direct tagged value, no {name,value} double struct
      deltaRaw,
    };
  });
}

function deriveTaxGroup(v006, taxableRaw) {
  const taxRaw = Math.round(taxableRaw * (v006 || 0));
  return {
    taxRaw,
    delta: domainTag(DOMAINS.USD, taxRaw), // direct
  };
}

function deriveShippingGroup(v007) {
  const shipRaw = v007 || 0;
  return {
    shipRaw,
    delta: domainTag(DOMAINS.USD, shipRaw), // direct
  };
}

/**
 * 駆動定義から完全な料金結果を導出。
 * すべての金額は domainTag で「usd:xxxx」として自己記述。
 * （内部実装は v-group constraint fns に分割済み。public signature / 出力内容は完全互換）
 */
export function deriveQuote(input) {
  // YVCP: belonging v-group variables (v00x stables) への割り当て
  // (Virtual-Map-IDs per prior packets: v001=base_amount, v002=line0, v003=line1, v004=discount_early-bird, ...)
  // tentative groups: pricing (v001+lines), adjustments (discount v00x), taxes (v006), logistics (v007)
  const v001 = input.base || 0; // base_amount

  const lineItems = (input.lines || []).map((ln, i) => ({
    v: `v00${2 + i}`,
    label: ln.label,
    amountUsd: ln.amountUsd,
  }));

  const discountItems = (input.discounts || []).map((d, i) => ({
    v: `v00${4 + i}`,
    name: d.name,
    percent: d.percent,
  }));

  const v006 = input.taxRate || 0; // tax
  const v007 = input.shipping || 0; // shipping

  // 並列可能な state behavior fns をそれぞれ独立に実行（combine で集約）
  const baseState = deriveBaseGroup(v001);
  const linesStates = deriveLinesGroup(lineItems);
  const preDiscountRaw = baseState.contrib + linesStates.reduce((sum, s) => sum + s.contrib, 0);
  const preDiscount = domainTag(DOMAINS.USD, preDiscountRaw);

  const discountsStates = deriveDiscountsGroup(discountItems, preDiscountRaw);

  let running = preDiscountRaw;
  const applied = [];
  const detailLines = [
    baseState.detail,
    ...linesStates.map(s => s.detail),
  ];

  for (const ds of discountsStates) {
    running -= ds.deltaRaw;
    applied.push({
      type: 'discount',
      name: ds.name,
      percent: ds.percent,
      delta: ds.delta, // direct domain-tagged
    });
  }

  const taxableRaw = running;
  const taxState = deriveTaxGroup(v006, taxableRaw);
  running += taxState.taxRaw;
  if (taxState.taxRaw > 0) {
    applied.push({ type: 'tax', rate: v006, delta: taxState.delta });
  }

  const shipState = deriveShippingGroup(v007);
  running += shipState.shipRaw;
  if (shipState.shipRaw > 0) {
    applied.push({ type: 'shipping', delta: shipState.delta });
  }

  const totalRaw = running;
  const total = domainTag(DOMAINS.USD, totalRaw);

  return {
    input,
    detailLines,
    appliedAdjustments: applied,
    preDiscount,
    tax: taxState.delta || domainTag(DOMAINS.USD, 0),
    shipping: shipState.delta || domainTag(DOMAINS.USD, 0),
    total,
    // 人間が見やすいサマリ（デモ用）
    summary: `total=${total} (pre-discount ${preDiscount}, discounts ${applied.filter(a=>a.type==='discount').length})`,
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
      { label: 'standard service', amountUsd: 4500 },
      { label: 'extra options x2', amountUsd: 1800 },
    ],
    discounts: [
      { name: 'early-bird', percent: 0.12 },
    ],
    taxRate: 0.10,
    shipping: 1200,
  });
}
