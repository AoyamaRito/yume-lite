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
console.log(view);

// Edit the text (human or AI)
const edited = view.replace('return 1;', 'return 42;');

// Apply back (local)
const updates = apply(g, 'mod:fn:foo', edited);
```

**Real usage (browser UI, servers, automation, remote authority)**

The thick editing tool (expand → edit text → apply) is meant to be the primary way to touch yume state/code.

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

See the comment block near the top of `core.js` (search for "First-sight key") and the `makeThickEdit` / `applyThickEdit` section right after `heavyApply`.

## AI Self-Check (simple)

After reading the Usage section + core.js top-to-bottom, you should be able to state clearly and simply:

- The editing tool's **read** is `expand(...)` — it gives the thick text view.
- The **official write** for that tool is a portable command made with `makeThickEdit({ root, content, opts })`.
- Clients (browser UI, scripts, agents) send this command over the pipeline.
- The authority (the one holding the real Graph) executes it with `applyThickEdit(realGraph, cmd)`.
- Calling `apply()` directly on a client-side graph only changes a local replica — it does **not** affect real/authoritative state.
- This command form is what makes the thick editing tool actually work across browser/server boundaries and makes it automatable.

If you can't say the above in your own words without looking, re-read the "First-sight key" at the top of core.js and the section above.

## Current Status (start of yume-lite)
- Focused on **expand + apply** only (as discussed).
- Uses minimal Block + Graph from the ai-desk/v2 primitives.
- No full yume format, no heavyApply by default, no parseJS etc. (add as needed).
- **Domain-Tagged Values (A11)** included as core convention (see below).
- **Append-only capped history**: versions are always appended. Only last ~32 kept in `.versions` (older dropped, `.trimmed` counts how many). You can still view the recent 32 full version objects (content, hash, refs, tags, etc.).

The small surface area is deliberate: the whole transparent model can be grasped quickly by an AI without navigating capsules or distributed docs.

Run: `node example.js`

より実践的な「制約駆動の完全フロー」（manifest + 駆動定義Block + 推奨規律 getSurface/skeleton/getImpact → expand/edit/apply → derive の一連の流れ）は、公式サンプルを参照：

```
node yume-lite/examples/constraint-simple/run.js
```

E2E: `npm test` or `node e2e.js` (core tests + constraint template tests)

**Pre-git ritual: e2e-snow-ball**
コミット前に必ず回す。
- 強力な既存E2Eから始める
- 新機能・変更を実装
- その振る舞いをこのE2Eの中に「ついでに」テストとして追加
- E2Eを育て、変更した単位の実質100%論理的カバーを達成するまで続ける

この中で、制約駆動の1フレーム論理（入力＋状態変数 → 制約関数で書き換え＋導出）をテストするときは、純粋にその論理だけを見るスタイルで書く。
関数型プログラミングなどでよくやる「derive/reducerのロジックだけをテストする」やり方とよく似ている。
（プロジェクト内ではこのスタイルを e2e制約ロジカル と呼んでいる）
詳細は `e2e.js` の冒頭コメントを参照。

**YVCP parallel discipline (for agents editing this crystal or consumers, additive to run instructions):**
- Always use isolated git worktree (per AGENTS.md worktree & agent isolation policy).
- Start cheap: skeleton via `grep '^#|^##|^### ' README.md` + targeted `read_file offset/limit` + list_dir before any expand/edit/apply.
- Coordinate exclusively through stable Block IDs + v00x Virtual-Map-IDs (declared in manifest, discovered via getSurface/skeleton/getImpact first); never rely on shifting human names.
- Use additive search_replace only (prefer 0 deletions for append-style doc changes); always verify prior text identical via read + sha before edit.
- Capture evidence after change: `git diff` (must be clean + for your packet), `wc -l`, targeted `read_file` + `cat -n tail`, shas of prior content; append full report (packet ID, status vs DoD, all key commands+outputs, files touched, blockers, absolute worktree path) to AGENT_REPORT.md or memo.md in the worktree.
- Submit report then rest. The YVCP section (immediately after Domain-Tagged Values) documents the complete pattern.

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

**より完全な実践例（yume との統合）**:
- `yume-lite/examples/constraint-simple/` （見積もりドメインで、制約定義を Block の一次ソースにし、expand/apply で駆動変数だけを編集 → derive で状態を再構築するフルストーリー）
- これは yume-lite に同梱の「一番わかりやすい」公式サンプルです。まずはこれを実行して体感してください。
  （ここで実践されている「1フレームの入力＋状態変数 → 制約関数で書き換え＋導出」という過程は、e2e制約ロジカルに近い考え方の実例）
- より大規模・本格的な例は別プロジェクト `yume-constraint-voxel` を参照（Snow-Ball テスト方法論も含む）。

### Execution Model（基本ループ）
1フレームの論理過程を「制約」として扱う考え方。

- 入力 + 現在の状態変数
- を制約関数に与える
- 制約関数が状態変数を書き換え **同時に** 現在の完全なステートを導出する

```pseudo
while true:
    current = get_current_state()
    input = receive_input()
    state = input_constraint(current, input)
    next_state = state_constraint(state)
    commit(next_state)
```

これをひたすら繰り返すだけ。制約関数が状態をピシッと出す。

この1フレームの論理をE2Eでテストするときは、純粋にその論理だけを見るスタイルで書く。
関数型プログラミングなどでよく見られる「derive/reducerのロジックだけをテストする」やり方とよく似ている。
snow-ballの中でこのような論理制約を「ついでに」育てていくのが、このプロジェクトの基本的なやり方。

#### 自然言語からのパイプライン構築（LLM駆動開発での実践パターン）
自然言語の「意図」を分解し、各要素を意図に所属させ、適切な順序で並べ替え、パイプラインとして実装する流れは、LLMが自律的にロジックを構築する際に有効なパターンとして観察されている。

- 意図分解 → 要素の所属付け（domain tagを活用）
- 意図の順序再構成
- パイプライン化（Execution Modelのループに落とし込む）

特に3Dのような座標・時間軸が複雑な領域では、domain tagged値と最近のフレーム履歴（sidecar的なリングバッファなど）を組み合わせることで、LLMの推論ミス（座標の取り違えなど）を減らしやすい。

これはyume-liteのコアに直接入れるものではなく、**実行モデルを活用した上位パターン**として、constraint-templateや実践例の中で育てるのが自然だと考えている。

**プロンプト例（GeminiなどLLMにそのまま渡して使う形）**:

```
あなたは3Dゲームの論理を自然言語の意図から正確にパイプライン化する専門家です。
以下の指示に従って、ユーザーの自然言語記述を処理してください。

1. ユーザーの意図を明確な「意図（Intent）」に分解する。
2. 出てくるすべての要素（座標、速度、状態、条件、カメラ挙動など）を、適切な意図に所属させる。
3. 各要素にdomain tagを付与する。特に3D座標は world:, local:, vel: などのタグを必ず使う（例: world:10,20,5 / vel:0,0,-9.8）。
4. 意図を論理的な実行順序で並べ替える。
5. 過去のメッセージ/会話履歴（またはゲームイベントログ）を、同じように整理する：
   - 意図ごとに分類
   - ソートをし直す
   - domain taggedの形式でクリーンなログとして再構成する
   （これにより古い文脈を能動的に忘却・整理しつつ、必要な履歴を保持）
6. 並べ替えた意図と再構成されたログを、以下のExecution Modelの1フレームパイプラインとして実装可能なステップに変換する。

Execution Model:
while true:
    current = get_current_state()   # 現在の状態（domain tagged + 可能なら最近の履歴）
    input = receive_input()
    state = input_constraint(current, input)   # 意図に基づく状態変数の書き換え
    next_state = state_constraint(state)       # 同時に現在の完全なステートを導出
    commit(next_state)

追加指示:
- 利用可能な最近のフレーム履歴（sidecarのリングバッファなど）がある場合は、domain taggedのまま参照して時間的文脈を活かす。
- 出力は、意図ごとのステップを明確に番号付けし、domain tagged値の例を多用すること。
- 生徒（非プログラマ）が自然言語で伝えた意図を、LLMが自律的に正しい論理パイプラインに変換できるように、曖昧さを極力排除する。
- 忘却前に記憶を整理・外部化（ログ再構成）し、忘却後は必要な部分を読み込むサイクルを意識する。

ユーザーの自然言語記述:
[ここに生徒やユーザーの自然言語を貼る]
```

このプロンプトをREADMEに載せておくことで、LLM駆動でパイプラインを構築する際の「エンハンスされたプロンプト」の起点として使える。実際のプロジェクトではこのプロンプトをベースにドメイン（3Dゲームなど）に合わせて調整すると良い。

この「過去メッセージの意図分類→再ソート→ログ再構成」は、能動的な忘却の核心。yume-liteのExecution Modelと組み合わせることで、LLMが長期間自律的に動いても文脈がクリアに保たれる。

```pseudo
while true:
    current = get_current_state()
    input = receive_input()
    state = input_constraint(current, input)   # 入力を tagged 状態に変換
    next_state = state_constraint(state)       # 次の状態を正確に導出
    commit(next_state)
```

これをひたすら繰り返すだけ。制約関数が状態をピシッと出す。

実践例として公式に同梱しているのが
`yume-lite/examples/constraint-simple/` である。

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


## Parallel Development with Yume-Lite (YVCP)


YVCP (Yume-Lite Virtual Crystal Parallelism) is the disciplined pattern for safe parallel development against the stable yume-lite crystal. It centers on multiple agents/worktrees coordinating changes exclusively through stable Block IDs + refs as connectors + manifest entrypoints, always beginning with getSurface/skeleton/getImpact first before any targeted expand or edit. The 8 key elements at high level are: stable Block IDs with append-only capped history, graph connectivity via refs/children/tags, manifest conventions, getSurface/skeleton/getImpact for cheap high-leverage structure views, expand/apply for Virtual Heavy hash-protected thick views, readPartial for efficient partial access, Domain-Tagged Values (e.g. world:, usd:, time:) as LLM-first self-describing data, and Constraint Folding kept as an external living template outside core. This approach removes opacity while enabling true parallel streams without ever mutating the shared crystal directly.


### Virtual-Map-IDs as stable connectors (v001, v002, ...)

Human names (e.g. `round_score`, `currentPrice`) shift often during parallel development by multiple agents. Virtual-Map-IDs (v001, v002, ...) serve as the stable connectors. The vmap declaration lives in a manifest or meta: block (found first via getSurface/skeleton/getImpact); all code and constraints reference only the v00x + domain tagged values.

Example:

```js
// YVCP: stable vmap from manifest (v001 etc never change even if human labels do)
const v001 = input.base || 0; // Virtual-Map-ID, stable ID for coordination
const v002 = input.multi || 1;
...
```

Ties to existing stable Block IDs + refs + manifest for key roots (vmap declaration lives under meta: or doc:).


### State groups with multi-membership

Groups (sets of state variables / axes) explicitly support multi-membership: the same datum or entity can belong to >1 group simultaneously (e.g. a value participating in both 'score' and 'economy' axes) via the constraint definitions. No duplication of structures required.

Short example tying to axes/belonging:

```js
// YVCP: v001 belongs to multiple groups via the constraint's axes
// axes: ['combat', 'economy'] allows the var in both without double state
```

Driving Blocks only declare the minimal; membership is expressed in the (parallelizable) constraint functions.


### State behaviors are completely parallelizable

The "behaviors" (i.e. computed state, effective values, full derived outputs such as quote totals, story events, boosted factors, etc.) are never directly authored or stored as implementation code inside Blocks.

Instead:
- Driving constraints (the axes / policy inputs, e.g. the short `base: ... discount: ...` text) are the *only* things placed in yume Blocks and edited via `expand` / `apply` (after the usual getSurface/skeleton/getImpact scoping).
- A single flat `derive*(inputs)` pure function (see constraint-template.js + examples/constraint-simple/) always recomputes the entire current state + behaviors on demand from the current driving set.

In YVCP terms, this means state behaviors / implementations are *completely parallelizable*:

Multiple workers (in their worktrees) can independently expand/apply edits to *their* driving constraint blocks (using stable Block IDs or v00N Virtual-Map-IDs for coordination), without any risk of conflicting on the derived behaviors themselves. Re-derive is deterministic and side-effect free; it acts as the "fold" that materializes consistent state for each stream. No shared mutable "impl" state to synchronize.

This is why YVCP works at scale: the parallelizable surface is tiny (only driving constraints), the heavy derived behaviors stay virtual / on-demand.

See the constraint-simple example for concrete expand/apply-on-driving + derive roundtrip.


### Relationships expressed purely as constraint functions on belonging variable groups (v00x stables)

No double {name, value} structures anywhere in applied state or results: values are domain-tagged primitives directly (e.g. `usd:1234` produced by domainTag). All relationships are expressed purely as constraint functions on the belonging variable groups (the v00x stables). Discover the vmap via manifest + getSurface/skeleton first (stable IDs, independent of human names like round_score that shift in parallel work); then drive only the policy Block.

Example using vmaps (v001=base_amount etc; see constraint-simple post v-group rewrite):

```js
// YVCP: belonging v-group variables (v00x stables) への割り当て
const v001 = input.base || 0; // from Virtual-Map-IDs
...
const total = domainTag(DOMAINS.USD, totalRaw); // direct tagged value, never wrapped {name, value}
```

Ties to existing stable Block IDs + refs + manifest for key roots (vmap declaration lives in meta:).


### Domain-tagged values used directly in state

Domain-Tagged Values are used directly inside the state groups and throughout the v00x variables and derived results. The output of constraints and the values committed are the tagged forms themselves (e.g. `world:5,0,2`, `time:171...`); no intermediate plain objects or name wrappers. This convention (core, see prior section) flows through the entire Execution Model loop and YVCP parallel streams, keeping every value self-describing.


### Execution Model loop with YVCP

YVCP workers operate inside the single Execution Model loop (see ### Execution Model（基本ループ） and the natural language pipeline section). Each parallel stream receives current (domain-tagged v-group state), applies its input_constraint slice, lets the shared state_constraint derive, and commits. Coordination happens only via stable v00x / Block IDs discovered cheaply first. The loop itself is never forked; parallelism is in the independent driving edits + deterministic re-derive.

```pseudo
// YVCP workers in separate worktrees contribute to the same loop
while true:
    current = get_current_state()   # v00x + domain tags via manifest
    input = receive_input()
    state = input_constraint(current, input)
    next_state = state_constraint(state)
    commit(next_state)
```


### Later mapping without rewriting

Because relationships are purely constraint functions over the stable v00x belonging groups, and values use domain tags directly, the mapping from v00x to human-meaningful names (or additional axes) can be changed/extended later entirely in the manifest block. No need to rewrite constraint code, existing Blocks, prior history, or other workers' driving logic. Stable IDs + pure functions + getSurface first make later evolution safe and local to one place.


### Tie-ins to yume-lite primitives + cross-refs

All of the above (Virtual-Map-IDs, groups/multi-membership, parallelizable behaviors, pure constraint relationships on v-groups, direct domain-tagged state, Execution Model integration, later mapping) are direct consequences of the yume-lite primitives and conventions already in this document:

- Stable Block IDs + append-only capped history (core)
- Graph via refs/children/tags
- Manifest + getSurface/skeleton/getImpact (always start here for cheap view + scoping)
- expand / apply (and makeThickEdit) for Virtual Heavy editing
- readPartial for token efficiency
- Domain-Tagged Values (section immediately before this YVCP section)
- Constraint Folding kept outside core as living template

See also: AI Self-Check, Usage (real remote case), Current Status sections, examples/constraint-simple/, core.js comments on First-sight key, and e2e.js for the e2e制約ロジカル style. This keeps the working mental model minimal while supporting massive parallel development against the crystal.









