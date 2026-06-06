import { Graph, Block, expand, apply, skeleton, readPartial, getSurface, getImpact, makeThickEdit, applyThickEdit } from './core.js';
// Constraint folding is kept as a separate living template (動く典型的なテンプレート).
// Import from the template when you want to use the pattern.
import { constraintBlock, evalConstraint } from './constraint-template.js';

console.log('=== yume-lite example ===');

// Create minimal blocks
const g = new Graph();

const root = new Block({ id: 'example:fn:main', type: 'function', meta: { name: 'main' } });
root.commit({
  content: `function main() {
  console.log('hello');
  return helper();
}

function helper() { return 42; }`,
  tags: ['function', 'export']
});
g.add(root);

// Simulate some related block via ref (for demo)
const helper = new Block({ id: 'example:fn:helper', type: 'function', meta: { name: 'helper' } });
helper.commit({ content: 'function helper() { return 42; }', tags: ['function'] });
g.add(helper);

// Link them
root.commit({
  content: root.content,
  refs: [...root.refs, { kind: 'calls', target: 'example:fn:helper' }],
  tags: root.tags
});

// 1. EXPAND to thick view
const view = expand(g, 'example:fn:main', { depth: 2 });
console.log('EXPANDED VIEW:');
console.log(view);

// 2. Simulate edit (e.g. AI changes the body)
let edited = view.replace("console.log('hello');", "console.log('yume-lite!');");
edited = edited.replace('return 42;', 'return 99;');

// 3. APPLY back (direct, when you have the graph locally)
const updates = apply(g, 'example:fn:main', edited, { depth: 2 });
console.log('\nAPPLY UPDATES:');
console.log(updates);

// Show new head
console.log('\nNEW HEAD content:');
console.log(g.get('example:fn:main').content);

// === Thick Edit as the official write for the editing tool ===
// This is the part first-time readers should notice for anything involving
// browser UIs, servers, agents, or automation.
//
// expand gives the thick view.
// After editing the text, do NOT just call apply() on whatever Graph you have locally
// (it may be only a replica).
//
// Instead, create a portable command and submit it through your write pipeline.
// The real authority then applies it with applyThickEdit.

console.log('\n=== Thick Edit Command (official write path) ===');

const editCmd = makeThickEdit({
  root: 'example:fn:main',
  content: edited,
  opts: { depth: 2 }
});
console.log('Portable command to send over WS/postMessage/etc:');
console.log(editCmd);

// Authority side (server, host context, etc.):
const authorityGraph = new Graph([ /* ... real blocks ... */ ]); // in this demo we reuse g
const cmdResult = applyThickEdit(g, editCmd);
console.log('Result of applyThickEdit on authority:', cmdResult);

// Demonstrate read for history (lite keeps last ~32)
console.log('\nRead history:');
console.log('  head:', g.get('example:fn:main').readContent(-1));
console.log('  previous (if any):', g.get('example:fn:main').readContent(-2));
console.log('  oldest kept:', g.get('example:fn:main').readContent(0));

// === Token-saving features: skeleton + readPartial ===
console.log('\n=== Token saving: skeleton (block list only) ===');
const skel = skeleton(g, 'example:fn:main', { depth: 2 });
console.log('Skeleton (no full content, just metadata + preview):');
console.log(skel);

console.log('\n=== Token saving: readPartial (only inside {} ) ===');
const partial = readPartial(g, 'example:fn:main');
console.log('Partial body (only {} content):', partial);

// === Domain-Tagged Values demo (A11 core convention) ===
console.log('\n=== Domain-Tagged Values (core of the conventions) ===');

// Instead of plain numbers or magic strings that LLM might misinterpret

// === Constraint Folding (A2) — if-elseの山を1つの制約関数に ===
// This is provided as a *separate living template*, not part of core.
// The goal of yume-lite is to keep the one-pass mental model small and clear.
// When you need combinatorial state derivation, copy the template or import it.
console.log('\n=== Constraint Folding (from constraint-template.js) ===');
console.log('// 動く典型的なテンプレートとして提供しています。必要に応じてコピー／importしてください。');

const feeLogic = constraintBlock({
  id: 'fee:constraint',
  axes: ['fee', 'plan'],
  values: { fee: [100, 300, 700], plan: ['basic', 'pro'] },
  derive: (c) => ({ ...c, effective: c.fee * (c.plan === 'pro' ? 0.8 : 1) })
});

console.log('全パターン:');
console.log(evalConstraint(feeLogic));

console.log('fee=700 だけ:');
console.log(evalConstraint(feeLogic, { fee: 700 }));

// これで if-else の山が「全組み合わせ + 1つの derive」に畳み込める。
// LLM は世界を全部見てから制約で絞れる。
// See constraint-template.js for a richer, copy-paste ready version with domain tags
// and execution-loop style usage.

import { domainTag, parseDomainTag, DOMAINS } from './core.js';

const worldPos = domainTag(DOMAINS.WORLD, '10,20,0');
const price = domainTag(DOMAINS.USD, 1299);
const timestamp = domainTag(DOMAINS.TIME, Date.now());
const itemId = domainTag(DOMAINS.ID, 'item-42');

console.log('Tagged values:');
console.log('  worldPos:', worldPos);
console.log('  price:', price);
console.log('  timestamp:', timestamp);
console.log('  itemId:', itemId);

const parsed = parseDomainTag(worldPos);
console.log('Parsed:', parsed);  // { domain: 'world', value: '10,20,0' }

// In your block content, use these instead of raw values.
// LLM can read "world:10,20,0" and know it's world coord without looking up variable names or comments.

console.log('\nDone. This is the lite expand + apply flow + domain-tagged core.');

// === Minimal scaling helpers demo (for 10k+ projects) ===
console.log('\n=== Minimal scaling kit (getSurface + getImpact) ===');

const surface = getSurface(g);
console.log('getSurface (curated cheap first page or guidance):');
console.log(surface);

const impact = getImpact(g, 'example:fn:helper');
console.log('\ngetImpact (who would be affected by changing helper?):');
console.log(impact);

console.log('\nRule: skeleton/getSurface first → getImpact to decide scope → only then targeted expand/apply.');

// === Next step: real constraint-driven integration ===
// The example above shows the cartesian constraint-template lightly.
// For a full, easy-to-understand worked example of "put driving constraints
// in a yume Block as the editable surface, then derive full state after apply",
// see the official bundled sample:
console.log('\nNext: より実践的な constraint-driven サンプル → yume-lite/examples/constraint-simple/run.js');
