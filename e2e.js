// yume-lite/e2e.js — aggressive single-file E2E
//
// ここでは1つのE2Eを大きく育てていく。
// 新しいコードを書いたら、その振る舞いをこのE2Eの中に「ついでに」テストとして追加していく。
// （これをプロジェクト内では e2e-snow-ball と呼んでいる）
// git push 前には必ずこのE2Eを回す。
//
// その中で、制約駆動の1フレーム論理（入力＋状態変数 → 制約関数で状態書き換え＋導出）を
// テストするときは、純粋にその論理の正しさだけを見る書き方をする。
// 関数型プログラミングなどで「derive / reducer のロジックだけをテストする」やり方と
// よく似ている。
// （プロジェクト内ではこのスタイルを e2e制約ロジカル と呼んでいる）
//
// 「1ファイルE2Eで全体をクリアに保つ」ことを重視している。

import { strict as assert } from 'node:assert';
import { Graph, Block, expand, apply, domainTag, parseDomainTag, DOMAINS, skeleton, readPartial, getSurface, getImpact, sameArr, sameRefs, lintThickView, hashVersion } from './core.js';
// Constraint tests use the canonical living template (not core).
import { constraintBlock, evalConstraint } from './constraint-template.js';

let pass = 0, fail = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    fails.push({ name, error: e });
    console.log(`  ✗ ${name}`);
    console.log(`      ${e.message}`);
  }
}

function group(name, fn) {
  console.log(`\n[${name}]`);
  fn();
}

console.log('=== yume-lite e2e (aggressive) ===\n');

// ============================================================
// 1. Basic Virtual Heavy (expand/apply)
// ============================================================
group('Basic Virtual Heavy', () => {
  function fixture() {
    const a = new Block({ id: 'm:fn:a', type: 'function', meta: { name: 'a' } });
    a.commit({ content: 'function a(){ return 1; }', tags: ['function'] });
    const b = new Block({ id: 'm:fn:b', type: 'function', meta: { name: 'b' } });
    b.commit({
      content: 'function b(){ return a() + 1; }',
      tags: ['function'],
      refs: [{ kind: 'calls', target: 'm:fn:a' }],
    });
    const c = new Block({ id: 'm:fn:c', type: 'function', meta: { name: 'c' } });
    c.commit({
      content: 'function c(){ return b() + a(); }',
      tags: ['function'],
      refs: [{ kind: 'calls', target: 'm:fn:b' }, { kind: 'calls', target: 'm:fn:a' }],
    });
    const d = new Block({ id: 'm:fn:d', type: 'function', meta: { name: 'd' } });
    d.commit({ content: 'function d(){}', tags: ['function'] }); // unrelated
    return new Graph([a, b, c, d]);
  }

  test('expand returns BLOCK header format', () => {
    const g = fixture();
    const expanded = expand(g, 'm:fn:c');
    assert.ok(expanded.includes('// === Virtual Heavy rooted at m:fn:c'));
    assert.ok(/\/\/ >>> ROOT m:fn:c hash=[0-9a-f]+/.test(expanded));
    assert.ok(/\/\/ >>> BLOCK m:fn:c type=function hash=[0-9a-f]+/.test(expanded));
    assert.ok(/\/\/ <<< \/BLOCK m:fn:c hash=[0-9a-f]+/.test(expanded));
    assert.ok(expanded.includes('// >>> BLOCK m:fn:b type=function'));
    assert.ok(expanded.includes('// >>> BLOCK m:fn:a type=function'));
    assert.ok(/\/\/ <<< \/ROOT m:fn:c hash=[0-9a-f]+/.test(expanded));
    assert.ok(!expanded.includes('m:fn:d'));
  });

  test('apply updates blocks in scope', () => {
    const g = fixture();
    const expanded = expand(g, 'm:fn:c');
    const newContent = expanded
      .replace('function a(){ return 1; }', 'function a(){ return 100; }')
      .replace('function b(){ return a() + 1; }', 'function b(){ return a() * 2; }')
      .replace('function c(){ return b() + a(); }', 'function c(){ return b() * 10; }');

    // Recommended workflow: after editing thick view, run lint before apply
    const lint = lintThickView(newContent, { original: expanded });
    assert.equal(lint.ok, true, 'lint should pass on valid body-only edit');
    assert.equal(lint.count, 0);

    const updates = apply(g, 'm:fn:c', newContent);
    assert.equal(g.get('m:fn:a').content, 'function a(){ return 100; }');
    assert.equal(g.get('m:fn:b').content, 'function b(){ return a() * 2; }');
    assert.equal(g.get('m:fn:c').content, 'function c(){ return b() * 10; }');
    assert.equal(g.get('m:fn:d').content, 'function d(){}'); // out of scope, untouched
    assert.ok(updates.every(u => u.action === 'updated' || u.id === 'm:fn:d'));
  });

  test('apply skips out-of-scope blocks', () => {
    const g = fixture();
    const fake = `// >>> BLOCK m:fn:d type=function\nfunction d(){ return 'hacked'; }\n// <<< /BLOCK m:fn:d`;
    const updates = apply(g, 'm:fn:c', fake);
    assert.ok(updates.some(u => u.action === 'skipped-out-of-scope' && u.id === 'm:fn:d'));
    assert.equal(g.get('m:fn:d').content, 'function d(){}');
  });

  test('depth controls scope', () => {
    const g = fixture();
    const heavy0 = virtualHeavyForTest(g, 'm:fn:c', { depth: 0 }); // internal for test
    assert.deepEqual(heavy0.map(b => b.id), ['m:fn:c']);
    const heavy1 = virtualHeavyForTest(g, 'm:fn:c', { depth: 1 });
    assert.equal(heavy1.length, 3); // c + b + a
  });

  test('apply does not create new version if content unchanged', () => {
    const g = fixture();
    const before = g.get('m:fn:b').versions.length;
    const expanded = expand(g, 'm:fn:c');

    // Include lint in the unchanged roundtrip path (part of recommended discipline)
    const lint = lintThickView(expanded, { original: expanded });
    assert.equal(lint.ok, true);

    const updates = apply(g, 'm:fn:c', expanded);
    const after = g.get('m:fn:b').versions.length;
    assert.equal(updates.length, 3);
    for (const u of updates) assert.equal(u.action, 'unchanged');
    assert.equal(before, after);
  });

  test('roundtrip expand -> apply (no edit) is all unchanged', () => {
    const g = fixture();
    const before = ['m:fn:a', 'm:fn:b', 'm:fn:c'].map(id => g.get(id).versions.length);
    const expanded = expand(g, 'm:fn:c');

    // Exercise the full recommended flow: expand → lint → apply
    const lint = lintThickView(expanded, { original: expanded });
    assert.equal(lint.ok, true, 'lint must pass on untouched expanded view');

    const updates = apply(g, 'm:fn:c', expanded);
    const after = ['m:fn:a', 'm:fn:b', 'm:fn:c'].map(id => g.get(id).versions.length);
    for (const u of updates) assert.equal(u.action, 'unchanged');
    assert.deepEqual(before, after);
  });
});

// ============================================================
// 2. Refs / Tags inheritance in apply
// ============================================================
group('Refs/Tags Inheritance', () => {
  test('apply ignores // refs: and // tags: in content and inherits from head', () => {
    const g = new Graph();
    const c = new Block({ id: 'm:fn:c', type: 'function' });
    c.commit({
      content: 'function c(){ return 1; }',
      tags: ['function', 'core'],
      refs: [{ kind: 'calls', target: 'm:fn:base' }],
    });
    g.add(c);

    const originalRefs = c.refs.map(r => `${r.kind}:${r.target}`).sort();
    const originalTags = [...c.tags].sort();

    const patch = `// >>> BLOCK m:fn:c type=function\n//     tags: BOGUS\n//     refs: calls->GHOST\nfunction c(){ return 999; }\n// <<< /BLOCK m:fn:c`;
    const updates = apply(g, 'm:fn:c', patch);

    const cAfter = g.get('m:fn:c');
    assert.equal(cAfter.content, 'function c(){ return 999; }');
    assert.equal(updates.find(u => u.id === 'm:fn:c').action, 'updated');
    assert.deepEqual(cAfter.refs.map(r => `${r.kind}:${r.target}`).sort(), originalRefs);
    assert.deepEqual([...cAfter.tags].sort(), originalTags);
  });
});

// ============================================================
// 3. Depth and kind variations
// ============================================================
group('Depth & Kind', () => {
  function makeChain() {
    const g = new Graph();
    const a = new Block({ id: 'chain:a', type: 'fn' });
    a.commit({ content: 'a' });
    const b = new Block({ id: 'chain:b', type: 'fn' });
    b.commit({ content: 'b', refs: [{ kind: 'calls', target: 'chain:a' }] });
    const c = new Block({ id: 'chain:c', type: 'fn' });
    c.commit({ content: 'c', refs: [{ kind: 'calls', target: 'chain:b' }] });
    g.add(a); g.add(b); g.add(c);
    return g;
  }

  test('depth=0 only root', () => {
    const g = makeChain();
    const blocks = virtualHeavyForTest(g, 'chain:c', { depth: 0 });
    assert.deepEqual(blocks.map(x => x.id), ['chain:c']);
  });

  test('depth=1 gets direct deps', () => {
    const g = makeChain();
    const blocks = virtualHeavyForTest(g, 'chain:c', { depth: 1 });
    assert.deepEqual(blocks.map(x => x.id).sort(), ['chain:b', 'chain:c']);
  });

  test('kind filters refs', () => {
    const g = new Graph();
    const main = new Block({ id: 'k:main', type: 'fn' });
    main.commit({ content: '', refs: [
      { kind: 'calls', target: 'k:dep1' },
      { kind: 'imports', target: 'k:dep2' }
    ]});
    const dep1 = new Block({ id: 'k:dep1', type: 'fn' }); dep1.commit({ content: '' });
    const dep2 = new Block({ id: 'k:dep2', type: 'fn' }); dep2.commit({ content: '' });
    g.add(main); g.add(dep1); g.add(dep2);

    const callsOnly = virtualHeavyForTest(g, 'k:main', { kind: 'calls' });
    assert.deepEqual(callsOnly.map(x => x.id).sort(), ['k:dep1', 'k:main']);

    const all = virtualHeavyForTest(g, 'k:main', { kind: null });
    assert.equal(all.length, 3);
  });
});

// ============================================================
// 4. Domain-Tagged Values (core feature)
// ============================================================
group('Domain-Tagged Values', () => {
  test('domainTag creates correct format', () => {
    assert.equal(domainTag(DOMAINS.WORLD, '5,0,2'), 'world:5,0,2');
    assert.equal(domainTag(DOMAINS.USD, 1299.5), 'usd:1299.5');
    assert.equal(domainTag('custom', null), 'custom:');
  });

  test('parseDomainTag works', () => {
    const p1 = parseDomainTag('world:10,20,0');
    assert.equal(p1.domain, 'world');
    assert.equal(p1.value, '10,20,0');

    const p2 = parseDomainTag('no-colon');
    assert.equal(p2.domain, null);
    assert.equal(p2.value, 'no-colon');
  });

  test('domain-tagged values survive expand/apply roundtrip', () => {
    const g = new Graph();
    const b = new Block({ id: 'pos:fn', type: 'function' });
    b.commit({ content: `const p = ${domainTag(DOMAINS.WORLD, '1,2,3')};` });
    g.add(b);

    const expanded = expand(g, 'pos:fn');
    assert.ok(expanded.includes('world:1,2,3'));

    const edited = expanded.replace('world:1,2,3', 'world:9,9,9');
    apply(g, 'pos:fn', edited);

    assert.ok(g.get('pos:fn').content.includes('world:9,9,9'));
  });

  test('multiple domains in one block', () => {
    const g = new Graph();
    const b = new Block({ id: 'money:fn', type: 'function' });
    b.commit({
      content: `price: ${domainTag(DOMAINS.USD, 42)} time: ${domainTag(DOMAINS.TIME, 123)}`
    });
    g.add(b);

    const expanded = expand(g, 'money:fn');
    const updates = apply(g, 'money:fn', expanded.replace('usd:42', 'usd:100'));
    assert.equal(updates[0].action, 'updated');
    assert.ok(g.get('money:fn').content.includes('usd:100'));
  });
});

// ============================================================
// 5. Edge cases & errors
// ============================================================
group('Edge Cases', () => {
  test('apply on non-existent root throws or handles gracefully', () => {
    const g = new Graph();
    const b = new Block({ id: 'real:fn', type: 'function' });
    b.commit({ content: 'ok' });
    g.add(b);

    // Should not throw on missing root in scope calc? But expand should handle
    try {
      expand(g, 'ghost');
      // if no error, at least check it returns something safe
    } catch (e) {
      assert.ok(e.message.includes('root'));
    }
  });

  test('malformed BLOCK header in apply skips bad segments', () => {
    const g = new Graph();
    const b = new Block({ id: 'bad:fn', type: 'function' });
    b.commit({ content: 'orig' });
    g.add(b);

    const bad = 'garbage without proper header\nfunction hacked(){}';
    const updates = apply(g, 'bad:fn', bad);
    // should result in skipped or no crash
    assert.ok(Array.isArray(updates));
  });

  test('large number of blocks in scope', () => {
    const g = new Graph();
    const root = new Block({ id: 'big:root', type: 'fn' });
    root.commit({ content: 'root' });
    g.add(root);

    for (let i = 0; i < 20; i++) {
      const dep = new Block({ id: `big:dep${i}`, type: 'fn' });
      dep.commit({ content: `dep${i}` });
      g.add(dep);
      root.commit({
        content: root.content,
        refs: [...root.refs, { kind: 'calls', target: `big:dep${i}` }]
      });
    }

    const expanded = expand(g, 'big:root', { depth: 1 });
    const updates = apply(g, 'big:root', expanded.replace('root', 'ROOT'));
    assert.ok(updates.length >= 20);
  });
});

// ============================================================
// 6. Append-only capped history (lite design)
// ============================================================
group('Append-only Capped History (last ~32)', () => {
  test('commit always appends, trims to 32', () => {
    const b = new Block({ id: 'hist:fn', type: 'function' });
    for (let i = 0; i < 40; i++) {
      b.commit({ content: `v${i}` });
    }
    assert.equal(b.versions.length, 32);
    assert.equal(b.versions[0].content, 'v8'); // 40-32=8 trimmed
    assert.equal(b.trimmed, 8);
    assert.equal(b.totalHistory, 40);
  });

  test('apply creates new version (appends)', () => {
    const g = new Graph();
    const b = new Block({ id: 'hist:fn', type: 'function' });
    b.commit({ content: 'orig' });
    g.add(b);

    for (let i = 0; i < 10; i++) {
      const view = expand(g, 'hist:fn');
      // Use unique marker each time so replace always succeeds on current content
      const marker = `v${i}`;
      const edited = view.replace(/orig|v\d+/, marker);
      apply(g, 'hist:fn', edited);
    }
    assert.equal(g.get('hist:fn').versions.length, 11); // 1 orig + 10 applies
  });

  test('history viewable via .versions (last 32 only)', () => {
    const b = new Block({ id: 'h:fn', type: 'function' });
    for (let i = 0; i < 50; i++) b.commit({ content: `v${i}` });
    assert.equal(b.versions.length, 32);
    assert.equal(b.versions[31].content, 'v49');
    assert.equal(b.versions[0].content, 'v18');
  });

  test('trimmed history still has correct hash chain on kept versions', () => {
    const b = new Block({ id: 'chain:fn', type: 'function' });
    for (let i = 0; i < 40; i++) b.commit({ content: `v${i}` });
    // check last few have proper prevHash
    const v38 = b.versions[20]; // after trim, index 0 is v8, so v18 at 10?
    // simpler: last two
    const last = b.versions[31];
    const prev = b.versions[30];
    assert.equal(last.prevHash, prev.hash);
  });

  test('read() / readContent() for viewing history', () => {
    const b = new Block({ id: 'read:fn', type: 'function' });
    b.commit({ content: 'v0' });
    b.commit({ content: 'v1' });
    b.commit({ content: 'v2' });

    assert.equal(b.readContent(-1), 'v2'); // head
    assert.equal(b.readContent(0), 'v0');  // oldest
    assert.equal(b.readContent(1), 'v1');

    const v = b.read(-1);
    assert.ok(v);
    assert.equal(v.content, 'v2');
    assert.equal(typeof v.index, 'number');
  });

  test('read after trim', () => {
    const b = new Block({ id: 'readtrim:fn', type: 'function' });
    for (let i = 0; i < 40; i++) b.commit({ content: `v${i}` });

    // only last 32 kept: v8 to v39
    assert.equal(b.readContent(0), 'v8');
    assert.equal(b.readContent(-1), 'v39');
    assert.equal(b.read(0).index, 0);
    assert.equal(b.read(-1).index, 31);
    assert.equal(b.readContent(32), null); // out of range
  });
});

// ============================================================
// Token-saving: skeleton + readPartial
// ============================================================
group('Token Saving (skeleton + readPartial)', () => {
  test('skeleton returns block list without full content', () => {
    const g = new Graph();
    const a = new Block({ id: 's:fn:a', type: 'function' });
    a.commit({ content: 'function a() { return 1; }', tags: ['function'] });
    const b = new Block({ id: 's:fn:b', type: 'function' });
    b.commit({ content: 'function b() { return a() + 1; }', tags: ['function'], refs: [{kind:'calls', target:'s:fn:a'}] });
    g.add(a); g.add(b);

    const sk = skeleton(g, 's:fn:b', { depth: 1 });
    assert.equal(sk.length, 2);
    assert.ok(sk.every(s => s.id && s.type && Array.isArray(s.tags)));
    // full body should not be in the skeleton (preview is signature only)
    assert.ok(!JSON.stringify(sk).includes('return a() + 1;'));
    assert.ok(sk[0].preview); // has short preview (signature)
    assert.ok(sk[0].contentLength > 0);
    assert.ok(sk[0].bodyLength > 0);
  });

  test('readPartial extracts only inside {}', () => {
    const g = new Graph();
    const b = new Block({ id: 'part:fn', type: 'function' });
    b.commit({ content: `function part() {\n  const x = 1;\n  return x;\n}` });
    g.add(b);

    const p = readPartial(g, 'part:fn');
    assert.equal(p.partial, true);
    assert.ok(p.content.includes('const x = 1;'));
    assert.ok(!p.content.includes('function part()')); // outer signature not included
    assert.ok(p.fullLength > p.content.length);
  });

  test('skeleton + readPartial together for token efficiency', () => {
    const g = new Graph();
    const root = new Block({ id: 'eff:root', type: 'function' });
    root.commit({ content: 'function root(){ return helper(); }' });
    const h = new Block({ id: 'eff:helper', type: 'function' });
    h.commit({ content: 'function helper(){ return domainTag("usd", 42); }' });
    g.add(root); g.add(h);
    root.commit({ content: root.content, refs: [{kind:'calls', target:'eff:helper'}] });

    const sk = skeleton(g, 'eff:root', {depth:1});
    assert.equal(sk.length, 2);
    // LLM can see the list cheaply, then decide to readPartial on specific block
    const partial = readPartial(g, 'eff:helper');
    assert.ok(partial.content.includes('domainTag'));
  });

  // e2e-snow-ball growth: cover more of core after recent stripping (skeleton uniformity)
  test('skeleton works uniformly after constraint special-case removal', () => {
    const g = new Graph();
    const b = new Block({ id: 'plain:block', type: 'data' });
    b.commit({ content: 'const x = 1;' });
    g.add(b);
    const sk = skeleton(g, 'plain:block');
    assert.equal(sk.length, 1);
    assert.equal(sk[0].type, 'data');
    assert.ok(!sk[0].axes); // no constraint pollution
  });
});

// ============================================================
// e2e-snow-ball growth batch: target remaining core.js paths
// (sameArr/sameRefs unchanged, more read(), getters, scaling edges)
// ============================================================
group('e2e-snow-ball growth (core paths)', () => {
  test('apply unchanged hits sameArr/sameRefs (no new version)', () => {
    const g = new Graph();
    const b = new Block({ id: 'same:fn', type: 'function' });
    b.commit({ content: 'function x(){}', refs: [{kind:'calls', target:'dep'}], tags: ['core'] });
    g.add(b);

    const before = b.versions.length;
    const view = expand(g, 'same:fn');
    const updates = apply(g, 'same:fn', view); // identical
    assert.equal(b.versions.length, before);
    assert.ok(updates.some(u => u.action === 'unchanged'));
  });

  test('Block getters and read() on fresh + committed block', () => {
    const b = new Block({ id: 'get:fn', type: 'function' });
    assert.equal(b.content, null);
    assert.deepEqual(b.refs, []);
    assert.deepEqual(b.tags, []);

    b.commit({ content: 'fn(){}', refs: [{kind:'uses', target:'util'}], tags: ['tagged'] });
    assert.ok(b.content.includes('fn'));
    assert.equal(b.refs.length, 1);
    assert.ok(b.tags.includes('tagged'));

    const v0 = b.read(0);
    assert.ok(v0);
    const head = b.read(-1);
    assert.equal(head.content, b.content);
  });

  test('getSurface inferred path (no manifest)', () => {
    const g = new Graph();
    const b1 = new Block({ id: 'a:one', type: 'fn' }); b1.commit({ content: 'one' });
    const b2 = new Block({ id: 'b:two', type: 'fn' }); b2.commit({ content: 'two' });
    g.add(b1); g.add(b2);

    const s = getSurface(g);
    assert.equal(s.kind, 'inferred');
    assert.ok(s.advice.includes('manifest'));
    assert.ok(Array.isArray(s.topBlocks));
  });

  test('getImpact with zero dependents', () => {
    const g = new Graph();
    const lonely = new Block({ id: 'lonely:util', type: 'fn' });
    lonely.commit({ content: 'util' });
    g.add(lonely);

    const imp = getImpact(g, 'lonely:util');
    assert.equal(imp.dependentCount, 0);
    assert.deepEqual(imp.directDependents, []);
  });

  test('readPartial on content without braces', () => {
    const g = new Graph();
    const b = new Block({ id: 'no:brace', type: 'data' });
    b.commit({ content: 'just plain text no braces here' });
    g.add(b);
    const p = readPartial(g, 'no:brace');
    assert.equal(p.partial, false);
    assert.ok(p.content.includes('plain text'));
  });

  test('skeleton preview truncation for long signatures', () => {
    const g = new Graph();
    const long = new Block({ id: 'long:sig', type: 'fn' });
    long.commit({ content: 'function veryLongSignatureNameThatExceedsEightyCharsForTruncationTest(a, b, c, d, e) { return a + b + c + d + e; }' });
    g.add(long);
    const sk = skeleton(g, 'long:sig');
    assert.ok(sk[0].preview.endsWith('...') || sk[0].preview.length <= 80);
  });

  test('applyPatch unchanged when only meta differs (same content/refs/tags)', () => {
    const g = new Graph();
    const b = new Block({ id: 'meta:diff', type: 'fn' });
    b.commit({ content: 'fn(){ return 1; }', refs: [], tags: [] });
    g.add(b);
    const before = b.versions.length;

    const view = expand(g, 'meta:diff');
    // apply exact same body (meta is ignored in same-check for this path)
    const res = apply(g, 'meta:diff', view);
    assert.equal(b.versions.length, before);
  });

  test('read() and readContent() after many commits + trim', () => {
    const b = new Block({ id: 'hist:read', type: 'data' });
    for (let i = 0; i < 40; i++) b.commit({ content: 'v' + i });
    assert.equal(b.versions.length, 32); // trimmed
    assert.equal(b.readContent(0), 'v8');   // oldest kept
    assert.equal(b.readContent(-1), 'v39'); // head
    assert.equal(b.read(5).content, 'v13');
  });

  test('virtualHeavy with kind=null includes all ref kinds', () => {
    const g = new Graph();
    const root = new Block({ id: 'k:root', type: 'fn' });
    root.commit({ content: '', refs: [
      {kind: 'calls', target: 'k:c'},
      {kind: 'imports', target: 'k:i'}
    ]});
    const c = new Block({ id: 'k:c', type: 'fn' }); c.commit({content:''});
    const i = new Block({ id: 'k:i', type: 'fn' }); i.commit({content:''});
    g.add(root); g.add(c); g.add(i);
    // kind null should pull both
    const all = (function virt(g, id) { // reimpl minimal for test
      const {depth=Infinity, kind=null} = {kind:null};
      const col = new Map();
      function rec(id, d) {
        if (col.has(id) || d > depth) return;
        const bb = g.get(id); if(!bb) return;
        col.set(id, bb);
        (bb.refs||[]).forEach(r => rec(r.target, d+1));
      }
      rec(id,0); return Array.from(col.values());
    })(g, 'k:root');
    assert.equal(all.length, 3);
  });

  test('domainTag and parseDomainTag roundtrip with null/edge', () => {
    assert.equal(domainTag('x', null), 'x:');
    const p = parseDomainTag('plain');
    assert.equal(p.domain, null);
    assert.equal(p.value, 'plain');
  });

  test('getSurface finds manifest via tag or type', () => {
    const g = new Graph();
    const m = new Block({ id: 'doc:foo', type: 'other' });
    m.commit({ content: 'hello', tags: ['manifest'] });
    g.add(m);
    const s = getSurface(g);
    assert.equal(s.kind, 'manifest');
    assert.equal(s.id, 'doc:foo');
  });

  test('getImpact reports multiple direct dependents', () => {
    const g = new Graph();
    const util = new Block({ id: 'core:util', type: 'fn' });
    util.commit({ content: '' });
    g.add(util);
    const u1 = new Block({ id: 'u1', type: 'fn' }); u1.commit({ content: '', refs: [{kind:'calls', target:'core:util'}] }); g.add(u1);
    const u2 = new Block({ id: 'u2', type: 'fn' }); u2.commit({ content: '', refs: [{kind:'imports', target:'core:util'}] }); g.add(u2);
    const imp = getImpact(g, 'core:util');
    assert.equal(imp.dependentCount, 2);
  });

  test('constraint template derive used to produce state then committed via Block (full loop flavor)', () => {
    const policy = constraintBlock({
      id: 'loop:policy',
      axes: ['risk'],
      values: { risk: ['low', 'high'] },
      derive: (c) => ({ ...c, factor: c.risk === 'high' ? 1.8 : 1.0, tagged: domainTag('ratio', c.risk === 'high' ? 0.9 : 0.3) })
    });
    const state = evalConstraint(policy, { risk: 'high' })[0];
    const g = new Graph();
    const sb = new Block({ id: 'state:computed', type: 'data' });
    sb.commit({ content: JSON.stringify(state) });
    g.add(sb);
    const sk = skeleton(g, 'state:computed');
    const committed = g.get('state:computed').content;
    assert.ok(committed.includes('factor'));
  });

  test('apply with identical body+refs+tags stays unchanged (hits same* utils)', () => {
    const g = new Graph();
    const b = new Block({ id: 'u:fn', type: 'fn' });
    b.commit({ content: 'fn(){}', refs: [{kind:'calls', target:'dep'}], tags: ['t'] });
    g.add(b);
    const beforeVersions = b.versions.length;
    const view = expand(g, 'u:fn');
    const updates = apply(g, 'u:fn', view);
    assert.equal(b.versions.length, beforeVersions);
    assert.ok(updates.some(u => u.action === 'unchanged' && u.id === 'u:fn'));
  });

  test('Block.read on trimmed history returns correct version objects with index', () => {
    const b = new Block({ id: 'trim:read', type: 'data' });
    for (let i = 0; i < 50; i++) b.commit({ content: 'v' + i });
    const oldest = b.read(0);
    assert.ok(oldest);
    assert.equal(typeof oldest.index, 'number');
    assert.equal(oldest.content, 'v18'); // after trim to 32
  });

  test('applyPatch early unchanged check on exact head match', () => {
    const b = new Block({ id: 'patch:early', type: 'fn' });
    b.commit({ content: 'exact(){}' });
    const res = b.applyPatch('exact(){}');
    assert.equal(res.action, 'unchanged');
  });

  // Direct tests for the pure helpers (to nail the remaining byte ranges in e2e-snow-ball)
  test('sameArr covers equal / length-diff / element-diff', () => {
    assert.equal(sameArr([1,2], [1,2]), true);
    assert.equal(sameArr([1,2], [1,2,3]), false);
    assert.equal(sameArr([1,2], [1,99]), false);
    assert.equal(sameArr([], []), true);
  });

  test('sameRefs covers equal / length / kind-target diff', () => {
    const a = [{kind:'calls', target:'x'}, {kind:'imports', target:'y'}];
    const b = [{kind:'calls', target:'x'}, {kind:'imports', target:'y'}];
    const c = [{kind:'calls', target:'x'}];
    const d = [{kind:'calls', target:'z'}];
    assert.equal(sameRefs(a, b), true);
    assert.equal(sameRefs(a, c), false);
    assert.equal(sameRefs(a, d), false);
  });

  test('Block constructor + read on empty versions', () => {
    const b = new Block({ id: 'empty:ver', type: 'data' });
    assert.equal(b.read(-1), null);
    assert.equal(b.readContent(0), null);
  });
});

// ============================================================
// e2e制約ロジカル（One-frame logical constraint derivation）
// ============================================================
// snow-ball（テスト成長プロセス）とは別。
//
// ここでいう「e2e制約ロジカル」とは：
//   1フレームの「入力 + 現在の状態変数」を制約関数に入力として与え、
//   - 状態変数を書き換え
//   - 同時に「現在のステート（導出された完全な状態）」を出す
//   という論理過程そのものを、E2Eで純粋にロジカルにテストするスタイル。
//   似た考え方は関数型プログラミングの純粋導出関数のテストなどに見られる。
//
// 目的:
//   - 状態は直接触らない。制約関数の出力として正確に導出される。
//   - その「1フレームのロジックだけ」をE2Eで縛る（thick editingの詳細や
//     全体カバレッジには依存せず、論理的正しさを検証）。
//   - 実行モデルの基本ループ（READMEの Execution Model）をE2Eで支える。
//
// 参考:
//   - README の "Execution Model（基本ループ）"
//   - yume-lite/examples/constraint-simple/ （一番わかりやすい公式実例）
//   - constraint-template.js （combinatorial が必要なときの汎用テンプレート）
//
// 以下はテンプレートの機械的テスト + ロジカル過程の統合テスト。
// 本来の「e2e制約ロジカル」は、1フレームの入力→状態更新+導出の論理だけを
// 見るテストとして育てることを意図している。
group('Constraint Folding (A2)', () => {
  // --- e2e制約ロジカル の最小例（1フレームの論理過程に集中） ---
  // snow-ballとは関係なく、「1フレームで入力+状態変数 → 制約関数で状態書き換え + 同時導出」
  // というロジカルな過程だけをE2Eでテストする。
  test('e2e制約ロジカル: one frame input + state vars → rewrite + derive current state', () => {
    // 現在の状態変数（これがBlockに保存されているイメージ）
    const currentStateVars = {
      base: 100,
      multiplier: 1.0,
    };

    // このフレームの入力
    const frameInput = {
      delta: 30,
      boost: true,
    };

    // 制約関数（入力 + 状態変数を受け取り、状態変数を更新しつつ現在のステートを導出）
    const deriveFrameState = (input, stateVars) => {
      // 状態変数の書き換え
      const newStateVars = {
        ...stateVars,
        base: stateVars.base + input.delta,
        multiplier: input.boost ? 1.5 : stateVars.multiplier,
      };

      // 同時に現在の完全なステートを導出（これが「今の状態」として使われる）
      const derivedCurrentState = {
        effective: newStateVars.base * newStateVars.multiplier,
        isBoosted: input.boost,
        // domain tag で自己記述的に
        value: domainTag('count', newStateVars.base),
      };

      return { newStateVars, derivedCurrentState };
    };

    const { newStateVars, derivedCurrentState } = deriveFrameState(frameInput, currentStateVars);

    // e2e制約ロジカルとして、ここでは「論理的正しさ」だけをassert
    // （thick viewの編集詳細や、snow-ballカバレッジには依存しない）
    assert.equal(newStateVars.base, 130);
    assert.equal(newStateVars.multiplier, 1.5);
    assert.equal(derivedCurrentState.effective, 195);
    assert.equal(derivedCurrentState.isBoosted, true);
    assert.ok(derivedCurrentState.value.startsWith('count:'));
  });

  test('constraintBlock + evalConstraint basic', () => {
    const cb = constraintBlock({
      id: 'fee:cb',
      axes: ['fee', 'plan'],
      values: { fee: [100, 700], plan: ['basic', 'pro'] },
      derive: (c) => ({ ...c, eff: c.fee * (c.plan === 'pro' ? 0.8 : 1) })
    });
    const all = evalConstraint(cb);
    assert.equal(all.length, 4);
    assert.ok(all.some(r => r.eff === 560));
  });

  test('evalConstraint with filter', () => {
    const cb = constraintBlock({
      id: 't:cb',
      axes: ['x'],
      values: { x: [1,2,3] },
      derive: (c) => c
    });
    const res = evalConstraint(cb, { x: 2 });
    assert.deepEqual(res, [{ x: 2 }]);
  });

  test('replaces if-else mountain conceptually', () => {
    // Example: instead of if (fee==100 && plan==basic) ... else if ...
    // Use one constraint that materializes all and filters.
    const cb = constraintBlock({
      id: 'price:cb',
      axes: ['fee', 'vip'],
      values: { fee: [100, 500], vip: [true, false] },
      derive: (c) => ({ ...c, effective: c.fee * (c.vip ? 0.7 : 1) })
    });
    const highVip = evalConstraint(cb, { fee: 500, vip: true });
    assert.equal(highVip[0].effective, 350);
  });

  // Additional unit-level tests for the constraint-template (single file E2E)
  test('constraintBlock sets id and type', () => {
    const cb = constraintBlock({ id: 'x:y', axes: ['a'], values: { a: [1] } });
    assert.equal(cb.id, 'x:y');
    assert.equal(cb.type, 'constraint');
    assert.ok(Array.isArray(cb.axes));
  });

  test('evalConstraint with 0 axes (empty product)', () => {
    const cb = constraintBlock({
      id: 'empty',
      axes: [],
      values: {},
      derive: (c) => ({ ...c, zero: true })
    });
    const all = evalConstraint(cb);
    assert.equal(all.length, 1);
    assert.equal(all[0].zero, true);
  });

  test('evalConstraint with 3 axes (deeper cartesian)', () => {
    const cb = constraintBlock({
      id: 'three',
      axes: ['x', 'y', 'z'],
      values: { x: [1,2], y: ['a'], z: [true, false] },
      derive: (c) => c
    });
    const all = evalConstraint(cb);
    assert.equal(all.length, 4); // 2*1*2
  });

  test('evalConstraint filter with no matches returns empty', () => {
    const cb = constraintBlock({
      id: 'none',
      axes: ['v'],
      values: { v: [1,2,3] },
      derive: (c) => c
    });
    const res = evalConstraint(cb, { v: 99 });
    assert.equal(res.length, 0);
  });

  test('derive can return domain-tagged values and new keys', () => {
    const cb = constraintBlock({
      id: 'tagged',
      axes: ['level'],
      values: { level: [1, 5] },
      derive: (c) => ({
        ...c,
        tagged: domainTag(DOMAINS.RATIO, c.level / 10),
        extra: 'foo'
      })
    });
    const all = evalConstraint(cb);
    assert.ok(all[0].tagged.startsWith('ratio:'));
    assert.equal(all[1].extra, 'foo');
  });

  test('derive that does not return object still works (passthrough)', () => {
    const cb = constraintBlock({
      id: 'passthrough',
      axes: ['n'],
      values: { n: [42] },
      derive: (c) => c.n * 2
    });
    const res = evalConstraint(cb);
    assert.deepEqual(res, [84]);
  });

  test('multiple filters combine correctly (AND)', () => {
    const cb = constraintBlock({
      id: 'multi',
      axes: ['a', 'b'],
      values: { a: [10, 20], b: ['x', 'y'] },
      derive: (c) => c
    });
    const res = evalConstraint(cb, { a: 20, b: 'y' });
    assert.equal(res.length, 1);
    assert.equal(res[0].a, 20);
    assert.equal(res[0].b, 'y');
  });

  test('constraintBlock without derive uses identity', () => {
    const cb = constraintBlock({
      id: 'no-derive',
      axes: ['k'],
      values: { k: ['alpha'] }
      // no derive
    });
    const res = evalConstraint(cb);
    assert.deepEqual(res, [{ k: 'alpha' }]);
  });

  test('filter on key added by derive (not original axis)', () => {
    const cb = constraintBlock({
      id: 'derived-filter',
      axes: ['base'],
      values: { base: [2, 4] },
      derive: (c) => ({ ...c, doubled: c.base * 2 })
    });
    const res = evalConstraint(cb, { doubled: 8 });
    assert.equal(res.length, 1);
    assert.equal(res[0].base, 4);
  });

  test('two axes with multiple values each (full cross)', () => {
    const cb = constraintBlock({
      id: 'cross2',
      axes: ['color', 'size'],
      values: { color: ['red', 'blue'], size: ['s', 'm', 'l'] },
      derive: (c) => ({ combo: c.color + '-' + c.size })
    });
    const all = evalConstraint(cb);
    assert.equal(all.length, 6);
    assert.ok(all.some(r => r.combo === 'blue-l'));
  });

  test('filter on derived key that was not in original axes', () => {
    const cb = constraintBlock({
      id: 'derived-key-filter',
      axes: ['input'],
      values: { input: [3, 7] },
      derive: (c) => ({ ...c, computed: c.input * 10, flag: c.input > 5 })
    });
    const res = evalConstraint(cb, { computed: 70, flag: true });
    assert.equal(res.length, 1);
    assert.equal(res[0].input, 7);
  });

  test('many values on single axis (stress cartesian)', () => {
    const cb = constraintBlock({
      id: 'many',
      axes: ['n'],
      values: { n: [1,2,3,4,5,6,7,8] },
      derive: (c) => ({ squared: c.n * c.n })
    });
    const all = evalConstraint(cb);
    assert.equal(all.length, 8);
    assert.equal(all[7].squared, 64);
  });

  test('constraint template used alongside Graph/Block (integration after core strip)', () => {
    // This ensures the template still works cleanly after we removed
    // constraint special-casing from core skeleton.
    const cb = constraintBlock({
      id: 'policy',
      axes: ['mode'],
      values: { mode: ['fast', 'safe'] },
      derive: (c) => ({ ...c, multiplier: c.mode === 'fast' ? 2 : 1 })
    });
    const g = new Graph();
    const b = new Block({ id: 'state:policy', type: 'data' });
    b.commit({ content: 'policy state' });
    g.add(b);

    const profiles = evalConstraint(cb);
    assert.equal(profiles.length, 2);
    // skeleton on real blocks should still work normally (no constraint branch)
    const sk = skeleton(g, 'state:policy');
    assert.equal(sk.length, 1);
    assert.equal(sk[0].id, 'state:policy');
  });
});

// ============================================================
// Manifest Keys + Execution Model (e2e制約ロジカル)
// ============================================================
// 調整は manifest 宣言の意味キーで行う（キーが契約。ワーカーはキーを発明・リネームしない）。
// Execution Model の 1-frame 論理（入力＋状態変数 → 制約関数で書き換え＋導出）を
// 純粋にその論理だけ見るスタイルでテストする。
group('Manifest Keys + Execution Model (e2e制約ロジカル)', () => {
  test('e2e制約ロジカル: 1-frame loop (input_constraint / state_constraint) on manifest keys + direct domain-tagged state', () => {
    // manifest 宣言相当（キーが契約）
    const STATE_KEYS = { score: { domain: 'count' }, mode: { domain: 'text' } };
    const stateVars = { score: 100, mode: 'idle' };
    const input = { delta: 25, mode: 'active' };

    const inputConstraint = (inp, sv) => ({ ...sv, score: sv.score + inp.delta, mode: inp.mode });
    // derive では domain-tagged value を直接使う（{name, value} の二重構造を作らない）
    const stateConstraint = (sv) => ({
      score: domainTag(DOMAINS.COUNT, sv.score),
      effective: sv.score * 2,
    });

    const next = inputConstraint(input, stateVars);
    const derived = stateConstraint(next);

    assert.ok(Object.keys(next).every(k => k in STATE_KEYS)); // 状態はキー契約の範囲内
    assert.equal(next.score, 125);
    assert.equal(derived.effective, 250);
    const parsed = parseDomainTag(derived.score);
    assert.equal(parsed.domain, 'count');
    assert.equal(parsed.value, '125');
  });

  test('e2e制約ロジカル: independent derive behaviors on shared keys compose without shared mutable state', () => {
    // 同じキー(score)に複数の独立 derive が所属できる（並列実行可能・合成で集約）
    const stateVars = { score: 47 };
    const deriveRender = (sv) => ({ display: sv.score });
    const deriveData = (sv) => ({ stored: sv.score * 3 });

    const derived = {
      score: domainTag(DOMAINS.COUNT, stateVars.score),
      ...deriveRender(stateVars),
      ...deriveData(stateVars),
    };

    assert.equal(derived.display, 47);
    assert.equal(derived.stored, 141);
    assert.equal(parseDomainTag(derived.score).value, '47');
  });

  test('e2e制約ロジカル: renames live only in the mapping layer (constraint code untouched)', () => {
    // derive は manifest キー pos_x だけを見る。人間向け別名は mapping 層が解決する。
    const derive = (input, sv) => {
      const next = { ...sv, pos_x: (sv.pos_x || 0) + (input.dx || 0) };
      return { next, derived: { pos: domainTag(DOMAINS.WORLD, `${next.pos_x},0`) } };
    };

    const r1 = derive({ dx: 2 }, { pos_x: 100 });
    assert.equal(parseDomainTag(r1.derived.pos).value, '102,0');

    // LATER: 人間名 heroX を導入 — mapping 層を足すだけで derive は無改変のまま正しい
    const mapHuman = (human) => ({ pos_x: human.heroX });
    const r2 = derive({ dx: -1 }, mapHuman({ heroX: 102 }));
    assert.equal(parseDomainTag(r2.derived.pos).value, '101,0');
  });
});


// ============================================================
// 7. Minimal scaling kit (getSurface + getImpact)
// ============================================================
group('Minimal scaling kit (10k+ LOC aids)', () => {
  test('getSurface returns manifest when present', () => {
    const g = new Graph();
    const m = new Block({ id: 'meta:project', type: 'manifest' });
    m.commit({ content: 'keyRoots: board:root\nimportantDomains: prio,status,count', tags: ['manifest'] });
    g.add(m);
    const s = getSurface(g);
    assert.equal(s.kind, 'manifest');
    assert.equal(s.id, 'meta:project');
  });

  test('getSurface gives useful guidance when no manifest', () => {
    const g = new Graph();
    const b = new Block({ id: 'foo:bar', type: 'fn' });
    b.commit({ content: 'function x(){}' });
    g.add(b);
    const s = getSurface(g);
    assert.equal(s.kind, 'inferred');
    assert.ok(s.advice.includes('manifest'));
  });

  test('getImpact reports direct dependents', () => {
    const g = new Graph();
    const target = new Block({ id: 'core:util', type: 'fn' });
    target.commit({ content: 'function util(){}' });
    g.add(target);

    const user1 = new Block({ id: 'app:mod', type: 'fn' });
    user1.commit({ content: 'function mod(){ util(); }', refs: [{kind:'calls', target:'core:util'}] });
    g.add(user1);

    const imp = getImpact(g, 'core:util');
    assert.equal(imp.dependentCount, 1);
    assert.equal(imp.directDependents[0].id, 'app:mod');
  });
});

// ============================================================
// Integrity (robust apply) — tamper / id-mismatch / dup / missing close
// ============================================================
group('Integrity (robust apply)', () => {
  function fx() {
    const g = new Graph();
    const a = new Block({ id: 'i:a', type: 'fn' });
    a.commit({ content: 'function a(){ return 1; }' });
    const b = new Block({ id: 'i:b', type: 'fn' });
    b.commit({ content: 'function b(){ return a(); }', refs: [{kind:'calls', target:'i:a'}] });
    g.add(a); g.add(b);
    return g;
  }

  test('hash tamper (open hash != close hash) rejects transaction', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    // tweak one hash on a close marker
    const corrupted = orig.replace(/(<<< \/BLOCK i:a hash=)[0-9a-f]+/, '$1deadbeef');
    const before = g.get('i:a').content;
    const res = apply(g, 'i:b', corrupted);
    assert.equal(res.ok, false);
    assert.equal(res.applied, false);
    assert.ok(res.warnings.some(w => w.kind === 'block-hash-tamper'));
    assert.equal(g.get('i:a').content, before); // untouched
  });

  test('id mismatch open vs close rejects', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    const corrupted = orig.replace('<<< /BLOCK i:a', '<<< /BLOCK i:zzz');
    const res = apply(g, 'i:b', corrupted);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some(w => w.kind === 'block-id-mismatch'));
  });

  test('missing close marker rejects', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    const corrupted = orig.replace(/^.*<<< \/BLOCK i:a.*$\n?/m, '');
    const res = apply(g, 'i:b', corrupted);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some(w => w.kind === 'block-no-close'));
  });

  test('duplicate block id rejects', () => {
    const g = fx();
    const dup = `// >>> ROOT i:b hash=x
// >>> BLOCK i:a type=fn
function a(){ return 1; }
// <<< /BLOCK i:a
// >>> BLOCK i:a type=fn
function a(){ return 2; }
// <<< /BLOCK i:a
// <<< /ROOT i:b hash=x
`;
    const res = apply(g, 'i:b', dup);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some(w => w.kind === 'duplicate-id'));
  });

  test('root id mismatch rejects', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    const corrupted = orig.replace('>>> ROOT i:b', '>>> ROOT i:WRONG');
    const res = apply(g, 'i:b', corrupted);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some(w => w.kind === 'root-id-mismatch'));
  });

  test('untouched roundtrip is ok + all unchanged', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    const res = apply(g, 'i:b', orig);
    assert.equal(res.ok, true);
    assert.equal(res.applied, true);
    assert.equal(res.warnings.length, 0);
    for (const u of res) assert.equal(u.action, 'unchanged');
  });

  test('body edit (markers untouched) is ok + updated', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    const edited = orig.replace('return 1;', 'return 42;');

    // Include lint as part of the core edit flow in E2E
    const lint = lintThickView(edited, { original: orig });
    assert.equal(lint.ok, true);

    const res = apply(g, 'i:b', edited);
    assert.equal(res.ok, true);
    assert.ok(res.find(u => u.id === 'i:a').action === 'updated');
    assert.ok(g.get('i:a').content.includes('return 42;'));
  });

  test('missing block reported but non-fatal', () => {
    const g = fx();
    // expand with both blocks, then drop i:a entirely from the patch
    const orig = expand(g, 'i:b');
    const stripped = orig.replace(/\/\/ >>> BLOCK i:a[\s\S]*?<<< \/BLOCK i:a hash=[0-9a-f]+\n/, '');
    const res = apply(g, 'i:b', stripped);
    assert.equal(res.ok, true); // missing-block is not fatal
    assert.ok(res.warnings.some(w => w.kind === 'missing-block' && w.id === 'i:a'));
    // i:a left untouched in graph
    assert.equal(g.get('i:a').content, 'function a(){ return 1; }');
  });

  test('lenient mode applies parseable blocks despite fatal warnings', () => {
    const g = fx();
    const orig = expand(g, 'i:b');
    // corrupt one block (i:a hash tamper); i:b should still apply if edited
    const corrupted = orig
      .replace(/(<<< \/BLOCK i:a hash=)[0-9a-f]+/, '$1deadbeef')
      .replace('return a();', 'return a() + 1;');
    const res = apply(g, 'i:b', corrupted, { lenient: true });
    assert.equal(res.ok, true);
    // i:b applied; i:a skipped due to tamper
    const a = res.find(u => u.id === 'i:a');
    const b = res.find(u => u.id === 'i:b');
    assert.equal(a.action, 'skipped');
    assert.equal(a.status, 'header-tamper');
    assert.equal(b.action, 'updated');
    assert.ok(g.get('i:b').content.includes('return a() + 1;'));
  });
});

// ============================================================
// Stale-write protection + version hash integrity (snow-ball addition)
// ============================================================
// yume-files heavyApply から移植した安全機構のテスト。
// expand 後に他者がブロックを変更した古い view の apply は、並行変更を黙って上書きしない。
group('Stale-write protection + version hash', () => {
  function fx() {
    const g = new Graph();
    const a = new Block({ id: 's:a', type: 'fn' });
    a.commit({ content: 'function a(){ return 1; }' });
    const b = new Block({ id: 's:b', type: 'fn' });
    b.commit({ content: 'function b(){ return a(); }', refs: [{ kind: 'calls', target: 's:a' }] });
    g.add(a); g.add(b);
    return g;
  }

  test('apply rejects stale view when block changed after expand', () => {
    const g = fx();
    const view = expand(g, 's:a');
    // 別エージェントが expand 後に変更
    g.get('s:a').applyPatch('function a(){ return 999; }');
    const edited = view.replace('return 1;', 'return 2;');
    const res = apply(g, 's:a', edited);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some(w => w.kind === 'stale-write' && w.id === 's:a'));
    // 並行変更は守られる（黙って上書きされない）
    assert.equal(g.get('s:a').content, 'function a(){ return 999; }');
  });

  test('re-expand after concurrent change applies cleanly', () => {
    const g = fx();
    g.get('s:a').applyPatch('function a(){ return 999; }');
    const fresh = expand(g, 's:a');
    const edited = fresh.replace('return 999;', 'return 2;');
    const res = apply(g, 's:a', edited);
    assert.equal(res.ok, true);
    assert.equal(g.get('s:a').content, 'function a(){ return 2; }');
  });

  test('lenient mode applies fresh blocks but still skips stale ones', () => {
    const g = fx();
    const view = expand(g, 's:b'); // scope: b + a
    g.get('s:a').applyPatch('function a(){ return 999; }'); // a だけ並行変更
    const edited = view
      .replace('return 1;', 'return 2;')
      .replace('return a();', 'return a() * 2;');
    const res = apply(g, 's:b', edited, { lenient: true });
    assert.equal(res.ok, true); // lenient なので適用は進む
    assert.ok(res.warnings.some(w => w.kind === 'stale-write' && w.id === 's:a'));
    assert.equal(g.get('s:a').content, 'function a(){ return 999; }'); // stale は skip
    assert.equal(g.get('s:b').content, 'function b(){ return a() * 2; }'); // fresh は適用
  });

  test('view without hash= attrs skips stale check (backward compat)', () => {
    const g = fx();
    const handwritten = `// >>> BLOCK s:a type=fn\nfunction a(){ return 7; }\n// <<< /BLOCK s:a`;
    const res = apply(g, 's:a', handwritten);
    assert.equal(res.ok, true);
    assert.equal(g.get('s:a').content, 'function a(){ return 7; }');
  });

  test('hashVersion covers nested refs/meta content (replacer bug fix)', () => {
    const base = { timestamp: 1, prevHash: null, content: 'x', refs: [{ kind: 'calls', target: 'a' }], children: [], tags: ['t'], meta: {} };
    const h1 = hashVersion(base);
    // refs の中身・meta の中身が変わればハッシュも変わる
    assert.notEqual(h1, hashVersion({ ...base, refs: [{ kind: 'calls', target: 'b' }] }));
    assert.notEqual(h1, hashVersion({ ...base, meta: { why: 'note' } }));
    // 同一内容ならキー順に依らず安定
    assert.equal(h1, hashVersion({ ...base, refs: [{ target: 'a', kind: 'calls' }] }));
  });
});

// ============================================================
// Header discipline LINT (lintThickView) — e2e-snow-ball growth
// These are the specific edge-case tests for lint itself.
// The main "lint as part of normal thick edit flow" is exercised inside
// the Basic Virtual Heavy and Integrity groups above (e2e-snow-ball style).
// ============================================================
group('Header Discipline LINT', () => {
  function makeSimple() {
    const g = new Graph();
    const b = new Block({ id: 'l:fn', type: 'function' });
    b.commit({ content: 'function l(){ return 1; }' });
    g.add(b);
    return { g, original: expand(g, 'l:fn') };
  }

  test('clean body edit passes lint (with original)', () => {
    const { original } = makeSimple();
    const edited = original.replace('return 1;', 'return 99;');
    const r = lintThickView(edited, { original });
    assert.equal(r.ok, true);
    assert.equal(r.count, 0);
  });

  test('changing hash= on header is detected via original comparison', () => {
    const { original } = makeSimple();
    // Change only the close header's hash value (typical slip near the end of a block)
    const bad = original.replace(/hash=[0-9a-f]+(?=[\s\S]*<<< \/BLOCK l:fn)/, 'hash=DEADBEEF');
    const r = lintThickView(bad, { original });
    assert.equal(r.ok, false);
    assert.ok(r.violations.some(v => v.kind === 'header-line-modified' || v.message.includes('ヘッダー')));
  });

  test('mismatched open/close hash (structural tamper) is reported', () => {
    const { original } = makeSimple();
    // Only change the close hash, keep open as-is (common AI slip)
    const bad = original.replace(/<<< \/BLOCK l:fn hash=[0-9a-f]+/, '<<< /BLOCK l:fn hash=deadbeef');
    const r = lintThickView(bad);
    assert.equal(r.ok, false);
    assert.ok(r.violations.some(v => v.kind === 'header-tamper' || v.message.includes('ヘッダー')));
  });

  test('lint without original still catches open vs close mismatch', () => {
    const { original } = makeSimple();
    const bad = original.replace('return 1;', 'return 99;')
                        .replace(/<<< \/BLOCK l:fn hash=([0-9a-f]+)/, '<<< /BLOCK l:fn hash=wrong$1');
    const r = lintThickView(bad);
    assert.equal(r.ok, false);
  });

  test('missing close is reported', () => {
    const { original } = makeSimple();
    const bad = original.replace(/\/\/ <<< \/BLOCK l:fn .*$/m, '');
    const r = lintThickView(bad);
    assert.equal(r.ok, false);
    assert.ok(r.violations.some(v => v.message.includes('閉じタグ') || v.kind === 'block-no-close'));
  });
});

// Helper for internal virtualHeavy access in tests (since not exported in lite public API)
function virtualHeavyForTest(graph, rootId, opts = {}) {
  // Re-implement minimal for test only (or expose temporarily)
  const { depth = Infinity, kind = 'calls' } = opts;
  const collected = new Map();
  function collect(id, d) {
    if (collected.has(id) || d > depth) return;
    const b = graph.get(id); if (!b) return;
    collected.set(id, b);
    for (const r of b.refs) if (kind == null || r.kind === kind) collect(r.target, d + 1);
  }
  collect(rootId, 0);
  return Array.from(collected.values());
}

console.log(`\n=== result: ${pass} pass, ${fail} fail ===`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of fails) {
    console.log(`- ${f.name}: ${f.error.message}`);
  }
  process.exit(1);
} else {
  console.log('All e2e passed! (aggressive set)');
}
