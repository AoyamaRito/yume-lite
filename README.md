# yume-lite

**Stable lite version** of the yume conventions (based on ai-desk/v2 primitives).

### For AI agents (read this first)

yume-lite is intentionally tiny (one core file) so you can load the **entire integrated philosophy** in a single pass.

Small here does not mean "simplified for humans".
Small means **clear**: the full structure (Block units + visible history + expand/apply as transparent editing + skeleton/readPartial + domain-tagged self-describing values) is visible at once, with no hidden parts or distributed concepts you have to hunt for.

Constraint-based state derivation (A2) is valuable but kept as a **separate living template** (`constraint-template.js`) so that the core mental model stays minimal.

This is the point of "clearify": remove opacity and capsules so the AI sees the logic, refs, types, and history directly instead of guessing.

If you read core.js top-to-bottom, you should be able to hold the complete model in working memory immediately.

---

Focus: just `expand` and `apply` for treating groups of Blocks as one "thick" editable file for AI/human editing, then applying changes back.

## Philosophy (lite)
- Blocks are the real units (with history via versions).
- For editing, "expand" a root + related blocks into one virtual thick content.
- Edit the content (keep the BLOCK headers!).
- "apply" the edits back to individual blocks (creates new versions).
- No need to remember virtualHeavy, heavyApply, etc. Just expand + apply.

This is extracted and simplified from ai-desk/v2 primitives.

## Usage
```js
import { Graph, Block, expand, apply } from './core.js';

// Build a simple graph
const g = new Graph();
const b1 = new Block({ id: 'mod:fn:foo', type: 'function' });
b1.commit({ content: 'function foo() { return 1; }' });
g.add(b1);

// Expand to thick view
const view = expand(g, 'mod:fn:foo');
console.log(view); // the virtual heavy string

// Edit the content part (imagine LLM or human edits the body)
const edited = view.replace('return 1;', 'return 42;');

// Apply back
const updates = apply(g, 'mod:fn:foo', edited);
console.log(updates);
```

See core.js for the full (minimal) primitives.

## Current Status (start of yume-lite)
- Focused on **expand + apply** only (as discussed).
- Uses minimal Block + Graph from the ai-desk/v2 primitives.
- No full yume format, no heavyApply by default, no parseJS etc. (add as needed).
- **Domain-Tagged Values (A11)** included as core convention (see below).
- **Append-only capped history**: versions are always appended. Only last ~32 kept in `.versions` (older dropped, `.trimmed` counts how many). You can still view the recent 32 full version objects (content, hash, refs, tags, etc.).

The small surface area is deliberate: the whole transparent model can be grasped quickly by an AI without navigating capsules or distributed docs.

Run: `node example.js`

E2E: `npm test` or `node e2e.js` (core tests + constraint template tests)

**Pre-git ritual: e2e-snow-ball**
Before committing, run the e2e-snow-ball process:
- Start with the strong E2E
- Implement units (or new modules like templates)
- Add their tests inside this E2E (so they are checked "ついでに")
- Grow E2E cases until the changed units reach real 100% behavioral coverage
See top of `e2e.js` for the exact definition. This keeps the whole thing "clear" (clearify).

This should be much easier to remember and use for Virtual Heavy workflows.

Current e2e covers:
- Basic expand/apply flows + headers
- Refs/tags inheritance
- Depth & kind filtering
- Domain-Tagged Values (core) roundtrips
- Edge cases (scope, malformed, large graphs)
- Append-only + trim to 32 + viewable recent history

### History Model (your proposal)
- Always append (commit / applyPatch always push new version)
- Auto-trim to last 32 after commit if exceeded
- `.versions` = viewable recent history (array of full version objs)
- `.trimmed` + `.versions.length` = total commits ever
- `.totalHistory` = convenience
- `read(index = -1)` / `readContent(index = -1)` : read a specific version ( -1 = head, 0 = oldest kept). Returns the version object or content.

### Token-saving primitives (for LLM context efficiency)
- `skeleton(graph, rootId, opts?)` : returns **only the list of blocks** in the heavy scope (id, type, tags, refs, preview signature, sizes, etc.). No full function bodies. Perfect first step to let the model see the structure without dumping thousands of tokens.
- `readPartial(graph, blockId)` : returns only the content **inside the main {}** of a block (the body), with `partial: true` flag and fullLength. Lets you read "just the inside of the braces" for even more token savings.

These directly address "ブロックのリストだけみれればいい" + " {}のなかだけ一部分読める " while keeping the full `expand` available when you actually need the thick content for editing.

### Minimal scaling kit for ~10k LOC (最大限の効果を最小の追加で)
For projects that outgrow the "one small graph you can always fully expand", we added two tiny, high-leverage functions (still fits in one mental model pass):

- `getSurface(graph)`: Returns a **cheap curated entry surface** (looks for a conventional `meta:project` / `doc:ai` / tag:`manifest` block). This is the lite equivalent of yume-develop's aiDoc / AiRunAndRead_* "first page". If none exists, it gives a strong recommendation + a cheap top-level view. **Always call this (or skeleton) first.**
- `getImpact(graph, blockId)`: Cheap "who references this block?" (direct dependents + kinds). Lets the AI decide the right scope *before* paying for a heavy expand. Extremely useful for scoping decisions at 5k–15k LOC.

Usage discipline that scales:
1. Start every non-trivial task with `getSurface()` or `skeleton(root, {depth: 0 or 1})`.
2. Before changing something important, call `getImpact(id)`.
3. Maintain **one small manifest block** as the single source of truth for "key roots, domains in use, top constraints, entry points".
4. Domain-Tagged Values remain one of the highest-ROI conventions even at this size.
   Constraint Folding is available as a high-quality template when you need combinatorial state derivation.

These two functions + the existing skeleton/readPartial give most of the "discovery + smart scoping" benefit from the full yume-develop system with almost zero added surface area.

### Constraint Folding (A2) — 状態の導出（サンプルテンプレート）
if-else の山を「全パターン + 1つの制約関数」に置き換える。
状態は制約関数の出力として正確に導出される（遷移という人間的概念は使わない）。

**これは yume-lite のコア API からは分離されています。**

動く典型的なテンプレートとして `constraint-template.js` を提供しています。
必要になったらこのファイルをコピーするか import して使ってください。

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

テンプレートには domain tag を組み合わせた例や、実行ループ風の使い方も入っています。
`node constraint-template.js` で実際の出力を見られます。

e2e でもこのテンプレートを使ってテストしています。

このパターンは「複雑にしたくない」範囲で非常に強力です。特にバリアント生成、ポリシー、ルール系の状態で有効です。

### Execution Model（基本ループ）
入力制約関数で入力を状態データに変換 → 状態管理制約関数で次の完全な状態を導出 → commit（新しいバージョンとして実行）。

```pseudo
while true:
    current = get_current_state()
    input = receive_input()
    state = input_constraint(current, input)   # 入力を tagged 状態に変換
    next_state = state_constraint(state)       # 次の状態を正確に導出
    commit(next_state)
```

これをひたすら繰り返すだけ。制約関数が状態をピシッと出す。

## Domain-Tagged Values (very core)
This is one of the foundational conventions.

Instead of relying on variable names (`worldPos`, `priceUsd`) or comments (which LLMs lose outside their immediate context window), embed the domain/type/unit **directly in the value**:

```js
import { domainTag, DOMAINS } from './core.js';

const pos = domainTag(DOMAINS.WORLD, '5,0,2');   // 'world:5,0,2'
const money = domainTag(DOMAINS.USD, 1299);      // 'usd:1299'
const now = domainTag(DOMAINS.TIME, Date.now()); // 'time:...'
```

Benefits (from the axioms):
- LLM sees the type in the token itself → fewer inference steps → lower mistake rate.
- Self-describing: works even when context is thin.
- Enforces "LLM-First Typing".

Use these in your block contents. The Virtual Heavy view will carry them as-is.

See example.js for demo + parseDomainTag.
