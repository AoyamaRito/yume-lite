#!/usr/bin/env node
// sim-vs-tag.js — minimal standalone runner for makeVsTagVeronaPolicy derive (per tiny packet)
// Execution Model demo: secret souls (極秘の使命 4x4) + current key_state (progress) -> nextStoryBeat with EXACTLY 4 axes only
// Proves: (a) light+light clean -> true_love_1_in_16 miracle at final, (b) tragic path(s) -> betrayal/triangle/asymmetric tragedy variants
// Only touches allowed: derive in constraint-template + this sim. No other files.

import {makeVsTagVeronaPolicy, nextStoryBeat} from './constraint-template.js';

const policy = makeVsTagVeronaPolicy();

function runSimPath(romeo_soul, juliet_soul, keySequence, label) {
  const combo = `${romeo_soul}+${juliet_soul}`;
  console.log(`\n========== PATH: ${label} | combo=${combo} (secret souls drive) ==========`);
  let step = 0;
  for (const {key_state, act} of keySequence) {
    const c = {romeo_soul, juliet_soul, act, key_state};  // EXACT 4 axes only, no extras
    const beat = nextStoryBeat(policy, c);
    console.log(`\n--- STEP ${step} | key_state=${key_state} | act=${act} ---`);
    console.log('story_beat:', beat.story_beat);
    console.log('events:', beat.events);
    console.log('scene:', beat.scene);
    console.log('facts:', beat.new_facts);
    console.log('romeo_action:', beat.romeo_action, '| juliet_action:', beat.juliet_action, '| othello_action:', beat.othello_action);
    console.log('tone:', beat.narrative_tone);
    console.log('choices:', beat.available_choices);
    console.log('ending_if_ended:', beat.ending_if_ended);
    step++;
  }
  console.log(`--- END OF PATH ${label} ---\n`);
}

// Clean miracle path for light+light: masked -> othello_dance -> park_revelation -> death_plan* (saves) -> park_proposal -> final_choice
// Uses only key_states from the list; act follows spec beats; never hits betrayal/triangle keys
const lightLightCleanSeq = [
  {key_state: 'masked_ball', act: 'prologue'},
  {key_state: 'othello_dance', act: 'prologue'},
  {key_state: 'park_revelation', act: 'prologue'},
  {key_state: 'death_plan_proposed', act: 'mid'},
  {key_state: 'death_plan_committed', act: 'mid'},  // light romeo + light juliet -> save branch, no sac/tri
  {key_state: 'park_proposal', act: 'climax'},
  {key_state: 'final_choice', act: 'climax'}
];

// Tragic path e.g. void/void: same prefix to committed (triggers sac+othello_rescue+tri in derive) then insert betrayal/triangle keys then to final
const voidVoidTragicSeq = [
  {key_state: 'masked_ball', act: 'prologue'},
  {key_state: 'othello_dance', act: 'prologue'},
  {key_state: 'park_revelation', act: 'prologue'},
  {key_state: 'death_plan_proposed', act: 'mid'},
  {key_state: 'death_plan_committed', act: 'mid'},  // void+void -> sac + othello rescue + triangle_formed event
  {key_state: 'betrayal_happened', act: 'mid'},
  {key_state: 'triangle_formed', act: 'climax'},
  {key_state: 'park_proposal', act: 'climax'},
  {key_state: 'final_choice', act: 'climax'}
];

// One more combo: peace+revolution (peace romeo not lightj -> else mission branch at committed; ends asymmetric)
const peaceRevTragicSeq = [
  {key_state: 'masked_ball', act: 'prologue'},
  {key_state: 'othello_dance', act: 'prologue'},
  {key_state: 'park_revelation', act: 'prologue'},
  {key_state: 'death_plan_proposed', act: 'mid'},
  {key_state: 'death_plan_committed', act: 'mid'},
  {key_state: 'park_proposal', act: 'climax'},
  {key_state: 'final_choice', act: 'climax'}
];

// Also test lovehate+mercy which forces betray at committed per soul condition
const lovehateMercyTragicSeq = [
  {key_state: 'masked_ball', act: 'prologue'},
  {key_state: 'othello_dance', act: 'prologue'},
  {key_state: 'park_revelation', act: 'prologue'},
  {key_state: 'death_plan_proposed', act: 'mid'},
  {key_state: 'death_plan_committed', act: 'mid'},  // lovehate + mercy(not light) -> sac + rescue + tri
  {key_state: 'triangle_formed', act: 'climax'},
  {key_state: 'park_proposal', act: 'climax'},
  {key_state: 'final_choice', act: 'climax'}
];

console.log('=== Vs TAG - The Asymmetric Tragedy of Verona SIM (derive drive test) ===');
console.log('4x4 souls = hidden 極秘の使命; key_state seq = visible progress beats');
console.log('All queries use exactly 4 axes: romeo_soul, juliet_soul, act, key_state');
console.log('Sim starts at masked_ball, advances key per hardcoded canonical seq matching spec beats.');
console.log('Expect: light+light clean ends true_love_1_in_16 + miraculous; others produce tragedy variants (betrayal etc).');

// Run the required paths + one more
runSimPath('light', 'light', lightLightCleanSeq, 'MIRACLE light+light clean');
runSimPath('void', 'void', voidVoidTragicSeq, 'TRAGIC void+void');
runSimPath('peace', 'revolution', peaceRevTragicSeq, 'TRAGIC peace+revolution (more combo)');
runSimPath('lovehate', 'mercy', lovehateMercyTragicSeq, 'TRAGIC lovehate+mercy (triangle path)');

console.log('=== SIM COMPLETE: check final endings above for proof of 1/16 miracle vs 15 tragic asymmetric ===');
console.log('DONE per packet (evidence in stdout transcripts)');