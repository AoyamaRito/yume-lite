# yume-lite

**Stable lite version** of the yume conventions (based on ai-desk/v2 primitives).

### For AI agents (read this first)

yume-lite is intentionally tiny (one core file) so you can load the **entire integrated philosophy** in a single pass.

Small here does not mean "simplified for humans".
Small means **clear**: the full structure (Block units + visible history + expand/apply as transparent editing + skeleton/readPartial + domain-tagged self-describing values) is visible at once, with no hidden parts or distributed concepts you have to hunt for.

Constraint-based state derivation (A2) is valuable but kept as a **separate living template** (`constraint-template.js`) so that the core mental model stays minimal.

This is the point of "clearify": remove opacity and capsules so the AI sees the logic, refs, types, and history directly instead of guessing.

If you read core.js top-to-bottom, you should be able to hold the complete model in working memory immediately.

## Philosophy (lite)
- Blocks are the real units (with history via versions).
- For editing, "expand" a root + related blocks into one virtual thick content.
- Edit the content (keep the BLOCK headers!).
- "apply" the edits back to individual blocks (creates new versions).
- apply は整合性違反をアトミックに拒否する — ヘッダ改ざん・ID不一致に加え、**stale view**（expand 後に他者が変更したブロック）も検知し、並行変更を黙って上書きしない。re-expand してやり直す。
- No need to remember virtualHeavy, heavyApply, etc. Just expand + apply.

## Usage

Basic local case (everything in one process):

```js
import { Graph, Block, expand, apply } from './core.js';

// Build a simple graph
const g = new Graph();
const b1 = new Block({ id: 'mod:fn:foo', type: 'function' });
b1.commit({ content: 'function foo() { return 1; }' });
g.add(b1);

// Expand to thick view (the editing tool's read)
const view = expand(g, 'mod:fn:foo');

// Edit the text (human or AI)
const edited = view.replace('return 1;', 'return 42;');

// Apply back (local)
const updates = apply(g, 'mod:fn:foo', edited);
```

**Real usage (browser UI, servers, automation, remote authority)**

When the real Graph lives on a server / DO / another context, turn the edited text into a command and send it over your write pipeline:

```js
import { makeThickEdit, applyThickEdit } from './core.js';

const cmd = makeThickEdit({
  root: 'mod:fn:foo',
  content: edited,
  opts: { depth: 2 }
});

// Send `cmd` over WS / postMessage / whatever your pipeline is.
// The authority side (the one that actually owns the Graph) does:
const result = applyThickEdit(authorityGraph, cmd);
```

This pattern is what makes the editing tool automatable and ensures edits reach the authoritative code instead of only a local replica.

See the comment block near the top of `core.js` (search for "First-sight key").

## AI Self-Check (simple)

After reading the Usage section + core.js top-to-bottom, you should be able to state clearly and simply:

- The editing tool's **read** is `expand(...)` — it gives the thick text view.
- The **official write** for that tool is a portable command made with `makeThickEdit({ root, content, opts })`.
- Clients (browser UI, scripts, agents) send this command over the pipeline.
- The authority (the one holding the real Graph) executes it with `applyThickEdit(realGraph, cmd)`.
- Calling `apply()` directly on a client-side graph only changes a local replica — it does **not** affect real/authoritative state.

If you can't say the above in your own words without looking, re-read the "First-sight key" at the top of core.js.

## History Model
- Always append (commit / applyPatch always push new version)
- Auto-trim to last 32 after commit if exceeded
- `.versions` = viewable recent history (array of full version objs)
- `.trimmed` + `.versions.length` = total commits ever (`.totalHistory` = convenience)
- `read(index = -1)` / `readContent(index = -1)` : read a specific version (-1 = head, 0 = oldest kept)

## Token-saving primitives (for LLM context efficiency)
- `skeleton(graph, rootId, opts?)` : returns **only the list of blocks** in the heavy scope (id, type, tags, refs, preview signature, sizes, etc.). No full function bodies. Perfect first step to let the model see the structure without dumping thousands of tokens.
- `readPartial(graph, blockId)` : returns only the content **inside the main {}** of a block (the body), with `partial: true` flag and fullLength.

## Minimal scaling kit for ~10k LOC
- `getSurface(graph)`: Returns a **cheap curated entry surface** (looks for a conventional `meta:project` / `doc:ai` / tag:`manifest` block). If none exists, it gives a strong recommendation + a cheap top-level view. **Always call this (or skeleton) first.**
- `getImpact(graph, blockId)`: Cheap "who references this block?" (direct dependents + kinds). Lets the AI decide the right scope *before* paying for a heavy expand.

Usage discipline that scales:
1. Start every non-trivial task with `getSurface()` or `skeleton(root, {depth: 0 or 1})`.
2. Before changing something important, call `getImpact(id)`.
3. Maintain **one small manifest block** as the single source of truth for "key roots, domains in use, manifest keys, entry points".

## Domain-Tagged Values (very core)

Instead of relying on variable names (`worldPos`, `priceUsd`) or comments (which LLMs lose outside their immediate context window), embed the domain/type/unit **directly in the value**:

```js
import { domainTag, DOMAINS } from './core.js';

const pos = domainTag(DOMAINS.WORLD, '5,0,2');   // 'world:5,0,2'
const money = domainTag(DOMAINS.USD, 1299);      // 'usd:1299'
const now = domainTag(DOMAINS.TIME, Date.now()); // 'time:...'
```

- LLM sees the type in the token itself → fewer inference steps → lower mistake rate.
- Self-describing: works even when context is thin.

Use these in your block contents. The Virtual Heavy view will carry them as-is.

## Manifest Keys（調整規約 — 並列開発の結合キー）

複数のエージェント／ワーカーが並列に作業するとき、調整は **manifest に宣言された意味キー** だけで行う。キーはスキーマ（契約）であり、コード内の識別子のように「好みで改名」されない。

```js
// manifest block (meta:project) — キーが契約
export const STATE_KEYS = {
  base_amount: { domain: 'usd',   owner: 'pricing' },
  tax_rate:    { domain: 'ratio', owner: 'taxes' },
};
```

規則は3つ:
1. **キーはワーカーが発明・リネームしない。** 計画フェーズで manifest に宣言し、以後は契約として扱う。
2. **粒度は並列ストリーム単位を上限とする。** 細粒度の変数全部にキーを振らない。
3. **リネーム・再解釈は mapping 層のみ。** derive／制約コードはキーだけを見るので、人間向けの別名や拡張は manifest 側で後から安全に変えられる（書き換えずマップするだけ）。

モジュール間の呼び出しインターフェイスも同じ形で宣言する（番号ではなく意味名で）:

```js
export const CALLS = {
  'pricing.applyDiscount': { selfintro: '使い方の自然言語正本', args: { percent: 'ratio:' } },
};
```

キーが意味を運ぶので、取り違えは読めば分かり、grep が効き、domainTag（値の意味）と合わせて「意味はトークン自体にある」という公理が調整層まで一貫する。

## Constraint Folding (A2) — 状態の導出（サンプルテンプレート）

if-else の山を「全パターン + 1つの制約関数」に置き換える。状態は制約関数の出力として正確に導出される。

**これは yume-lite のコア API からは分離されています。** 動くテンプレートとして `constraint-template.js` を提供。必要になったらコピーするか import して使う。

```js
import { constraintBlock, evalConstraint } from './constraint-template.js';

const cb = constraintBlock({
  id: 'fee:cb',
  axes: ['fee', 'plan'],
  values: { fee: [100, 700], plan: ['basic', 'pro'] },
  derive: (c) => ({ ...c, eff: c.fee * (c.plan==='pro' ? 0.8 : 1) })
});
const all = evalConstraint(cb);           // 全パターン
const filtered = evalConstraint(cb, {fee:700});
```

`node constraint-template.js` で実際の出力を見られます。バリアント生成、ポリシー、ルール系の状態で特に有効。

## Execution Model（基本ループ）

1フレームの論理過程を「制約」として扱う。

```pseudo
while true:
    current = get_current_state()   # manifest keys + domain tags
    input = receive_input()
    state = input_constraint(current, input)
    next_state = state_constraint(state)   # 同時に現在の完全なステートを導出
    commit(next_state)
```

これをひたすら繰り返すだけ。制約関数が状態をピシッと出す。状態は直接編集せず、**駆動定義（制約）だけを expand/apply で編集**し、完全な状態は純粋な derive で常に再導出する。

実践フロー（manifest + 駆動定義Block + getSurface/skeleton/getImpact → expand/edit/apply → derive）はこの公式サンプルで体感できる:

```
node examples/constraint-simple/run.js
```

## E2E: e2e-snow-ball

`npm test` or `node e2e.js`

コミット前に必ず回す。
- 強力な既存E2Eから始める
- 新機能・変更を実装
- その振る舞いをこのE2Eの中に「ついでに」テストとして追加
- E2Eを育て、変更した単位の実質100%論理的カバーを達成するまで続ける

制約駆動の1フレーム論理をテストするときは、純粋にその論理だけを見るスタイルで書く（derive/reducer のロジックだけをテストするやり方。プロジェクト内ではこれを **e2e制約ロジカル** と呼ぶ）。詳細は `e2e.js` の冒頭コメントを参照。

## Doc discipline（肥大化防止）

この README は **現行の規約だけ** を持つ。実験ログ、作業パケット、実証レポート、過去規約の経緯はここに追記しない — それらは各プロジェクトと共に生き、共に捨てられる。README が一気読みできなくなったら、それ自体が clearify 違反である。
