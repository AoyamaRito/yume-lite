# Tiny Packet: Vs TAG Constraint Drive Experiment (Final Spec)

**Date**: 2026 (this session)
**From**: HQ (main, thin interface per AGENTS.md)
**For**: Narrow coding subagent (worktree isolation only)

## Exact Goal (1-3 sentences)
Refine ONLY the `derive` inside `makeVsTagVeronaPolicy` (in yume-lite/constraint-template.js) so that it cleanly and exactly drives the stories described in the user's 【最終確定版：MVP設計図『Vs TAG - The Asymmetric Tragedy of Verona』】 using the 4x4 souls as hidden "極秘の使命". Add ONE minimal standalone sim runner (e.g. `sim-vs-tag.js` next to the template or in examples/) that starts from souls + initial key_state, steps sequentially through key_states (only querying with exact 4 axes), prints narrative beats (domainTagged story_beat, events, scene, facts, tone, choices, ending_if_ended), and proves: (a) light+light clean path produces the "true_love_1_in_16" miracle at final, (b) at least one tragic path (e.g. void/void or peace/lovehate) produces betrayal/triangle/asymmetric_tragedy or equivalent per spec. Use Execution Model style (current axes -> nextStoryBeat/derive -> commit/advance key conceptually). No other changes.

## Narrow Scope (skeleton / targeted only)
- Target file 1 (edit): yume-lite/constraint-template.js — ONLY the derive function body of makeVsTagVeronaPolicy. Do not touch other functions (makeMinimalStoryPolicy, makeRomeoJulietMeetingPolicy, helpers, demos at top).
- Target file 2 (new, minimal): one new sim-*.js (or add to existing if tiny) that imports {makeVsTagVeronaPolicy, nextStoryBeat, domainTag} from './constraint-template.js' (or relative), hardcodes 2-4 soul pairs + a fixed sequence of key_state advances that match spec beats (masked_ball start -> ... -> final_choice), loops calling nextStoryBeat with *exactly* {romeo_soul, juliet_soul, act, key_state} (no extra keys), logs the returned derived fields + combo + step.
- Do NOT create/edit: core.js, any trpg/ files (lp.html, over-dark-ai, AIGM_SPEC etc), e2e.js, other examples, package.json, worktrees, or add new policies.
- First actions (cheap bootstrap, do not skip): 
  1. list_dir or read the yume-lite/ relevant (but stay cheap).
  2. read_file the exact makeVsTagVeronaPolicy (use offset/limit or grep pattern for the function only — targeted, no full file dump in your thinking).
  3. Optionally run node to repro current issues.
- Edits only after your own cheap scoping. Use search_replace with precise old_string (unique lines from the derive ifs).
- After edit: run the sim (node sim-xxx.js), capture + print the full output transcripts for the miracle path and >=1 tragic path as evidence. Also test at least one more combo.
- If derive needs a helper tweak inside the function only, ok if minimal and local to this derive.

## Constraints + Do Not Touch
- 4 axes only for all queries/filters: romeo_soul, juliet_soul, act, key_state. Never pass extra (this was root cause of prior "No matching").
- Key_state advancement in sim must be explicit/sequential (you decide the string to pass next based on spec beats or returned events; derive itself should not "advance" but react to the passed current key_state).
- Make ifs strict: primary if (c.key_state === 'the_current_one') { ... soul-specific inside for branches at decision points (esp. death_plan_committed for romeo choice: void or (lovehate+not light juliet) = betray+othello rescue+triangle; light or (peace+light juliet) = save+love above mission; ...). }
- Preserve/strengthen the 16-ending logic at final_choice: ONLY romeo_soul+ juliet_soul === 'light'+'light' AND no prior betrayal/triangle events -> 'true_love_1_in_16' (miraculous); all other 15 combos + any dirty path -> tragedy variants (pure_assassin, romeo_betrayal_..., othello_..., asymmetric_default, etc). Match user's spec "唯一の奇跡：16分の1の確率...【光】本物 vs 【光】本物".
- Use domainTag for story_beat and ending_if_ended (narrative:..., ending:... or similar). Carry events/new_facts/available_choices/scene/romeo_action etc as before.
- Keep the key_state list as-is (or minimal add if derive requires a missing transition state; prefer reuse existing 9).
- No new axes, no othello_bond as input axis (derive can return extra derived like othello_bond if needed for internal, but sim queries never include it).
- Follow yume-lite: this is the "living template" for constraint folding (per README). The sim demonstrates the Execution Model loop for story (current secret souls + visible key_state progress -> input_constraint (here the fixed souls) + state_constraint (derive) -> story_beat facts).
- Do not mention or use full chat history; stay to packet + what you read in the target file + user spec pasted in this prompt.
- Evidence over claims: your final report must include the exact sim command, the stdout transcript(s) showing the miracle vs tragedy, and the worktree path.

## Definition of Done (evidence required)
- [ ] derive cleaned: every key_state in the list has a covering if (c.key_state==='...'), no JS precedence bugs, no undefined c. props in conditions, branches only fire for correct souls at correct states.
- [ ] sim runs without "No matching story state..." or runtime errors for the tested paths.
- [ ] light+light clean sequence ends with story_beat containing true_love_1_in_16 (or ending_if_ended==='true_love_1_in_16') and tone 'miraculous', no betrayal events.
- [ ] At least one non-light path produces betrayal or triangle or default tragedy ending.
- [ ] Your output message includes: worktree git path, list of files touched (only the two allowed), key diff hunks or before/after snippets of the derive changes (minimal), full relevant sim console output for 2+ paths, "DONE per packet" note.
- [ ] If more info truly required outside scope (e.g. exact park scene wording from user spec), report the question and stop — do not guess or widen.

## User Spec Reference (the exact one to match — excerpted for packet)
【最終確定版：MVP設計図『Vs TAG - The Asymmetric Tragedy of Verona』】
- 2-player TRPG, AI GM, 敵対二者 + 偽りの共闘 (共通の敵=革命軍 + 水面下和平交渉 in Juliet house).
- 4 souls Romeo: 【光】本物 / 【和平】密偵(家裏切り可) / 【愛憎】恋したアサシン / 【虚無】純アサシン
- 4 souls Juliet: 【光】本物 / 【革命】使徒(家利用して転覆) / 【慈悲】共感アサシン / 【虚無】純アサシン
- 16 combos = 16 different stories. Players never know which until end.
- 1/16 miracle only on light vs light = "真実の恋（トゥルーエンド）". This is the hook for infinite replays.
- Beats include: false alliance/elopement promise at masked, othello intervention (dance/park/rescue on betrayal paths), park revelation, fake death plan proposed+committed, at committed: soul-forced romeo betrayal (void/lovehate) vs save (light/peace), triangle on betrayal+othello save, return to park, othello proposal (revolution life vs noble death?), final choice, 16 endings.
- "この複雑怪奇な「秘密」の管理、非対称な役割に応じた物語の生成...は...AI GMだからこそ実現できる"

The derive + nextStoryBeat must make the secret souls (axes) + progress (key_state) produce exactly the asymmetric branches and the unique miracle without if-else explosion in the GM — pure constraint output.

## Scoped View (targeted excerpt of current derive — use this + your fresh read_file to edit precisely)
(See the function starting at:
export function makeVsTagVeronaPolicy() {
  return storyConstraintBlock({
    id: 'story:vs-tag-verona-final',
    axes: ['romeo_soul', 'juliet_soul', 'act', 'key_state'],
    ...
    derive: (c) => {
      ...
      // current ifs for masked_ball, othello_dance, death_*, final_choice etc.
      // the buggy betrayal if, the othello_bond checks, the 16 if at end.
    }
  });
}

Full current derive body will be visible when you read_file the file yourself with limits around line 320-440.)

## Handoff Rules (strict)
Stay inside this scope. Report if more info is truly required.
You are a coding agent in isolated worktree — changes do not affect main crystal until HQ review.
Use the yume discipline yourself: cheap first (your reads), targeted, evidence (run output).
When done, return the single message with packet DoD items + logs + worktree info. Do not spawn further agents.

Packet complete. Now execute narrowly.
