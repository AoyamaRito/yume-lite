/**
 * constraint-template.js
 *
 * yume-lite の「制約関数による状態の一発特定」パターンの
 * 動く典型的なテンプレート。
 *
 * 目的:
 * - if-else の山を「全パターンの物質化 + 1つの derive 関数」に置き換える
 * - LLM が「世界を全部見てから制約で絞る」思考を直接書けるようにする
 * - 状態を「遷移」ではなく「制約の出力」として正確に導出する
 *
 * このファイルは yume-lite の core からは独立しています。
 * core.js を読むときにこの仕組みを同時に覚える必要がないようにするためです。
 *
 * 使い方:
 *   - このファイル全体をコピーしてプロジェクトに貼る
 *   - または import { constraintBlock, evalConstraint } from './constraint-template.js'
 *   - 必要ならさらに洗練した版（文字列化derive、矛盾検知など）を自前で作る
 *
 * 典型的な使いどころ:
 *   - 価格/プラン/フラグの組み合わせで最終値を出す
 *   - バリアント生成（size × kind → 物理パラメータ）
 *   - ポリシー/ルール（wind × size → settleProb など）
 *   - 入力から次の状態を一発で特定して commit するループ
 */

import { domainTag, DOMAINS } from './core.js';

export function constraintBlock({ id, axes, values, derive = c => c }) {
  return { id, type: 'constraint', axes, values, derive };
}

export function evalConstraint(cb, filter = {}) {
  const keys = Object.keys(cb.values);
  const vals = keys.map(k => cb.values[k]);

  const cartesian = (arrs) =>
    arrs.reduce((acc, arr) =>
      acc.flatMap(o => arr.map(v => ({ ...o, [keys[arrs.indexOf(arr)]]: v }))), [{}]);

  return cartesian(vals)
    .map(cb.derive)
    .filter(r => Object.entries(filter).every(([k, v]) => r[k] === v));
}

// ============================================================
// 実行例（このファイルを直接 node で実行すると見られます）
// ============================================================

if (import.meta.url.endsWith(process.argv[1] ?? '')) {
  console.log('=== Constraint Folding Template Demo ===\n');

  // 例1: 基本的な料金プラン（if-elseの山を1つの制約に）
  const feeLogic = constraintBlock({
    id: 'fee:plan',
    axes: ['fee', 'plan'],
    values: {
      fee: [100, 300, 700],
      plan: ['basic', 'pro']
    },
    derive: (c) => ({
      ...c,
      effective: c.fee * (c.plan === 'pro' ? 0.8 : 1),
      label: domainTag('text', `${c.plan}-${c.fee}`)
    })
  });

  console.log('全パターン:');
  console.log(evalConstraint(feeLogic));

  console.log('\nfee=700 のときだけ:');
  console.log(evalConstraint(feeLogic, { fee: 700 }));

  // 例2: 雪の物理パラメータ（実際のsnow-3d系で使われているパターンに近い）
  // size × kind の組み合わせで、複数の物理量を一気に導出
  const flakeTypes = constraintBlock({
    id: 'snow:flake-types',
    axes: ['size', 'kind'],
    values: {
      size: ['small', 'medium', 'large'],
      kind: ['light', 'heavy']
    },
    derive: (c) => ({
      ...c,
      radius:   { small: 0.35, medium: 0.55, large: 0.85 }[c.size],
      weight:   c.kind === 'heavy' ? 0.70 : 0.35,
      swayAmp:  c.kind === 'heavy' ? 0.40 : 1.20,
      // domain tag で導出結果も自己記述的に
      tint:     domainTag('color', c.kind === 'heavy' ? 0xbcd4ff : 0xffffff)
    })
  });

  console.log('\n=== フレークバリエーション（全パターン物質化） ===');
  const profiles = evalConstraint(flakeTypes);
  console.log(profiles);

  console.log('\nsize=large のとき:');
  console.log(evalConstraint(flakeTypes, { size: 'large' }));

  // 例3: 実行ループ風の使い方（入力 → 制約で状態を一発特定 → commit のイメージ）
  console.log('\n=== 実行モデル風の流れ（疑似） ===');
  console.log('input (current axes) → evalConstraint で next state を一発取得 → Block に commit');

  const policy = constraintBlock({
    id: 'weather:settling',
    axes: ['wind', 'size'],
    values: {
      wind: [0, 0.5, 1.5, 3.0],
      size: ['small', 'large']
    },
    derive: (c) => {
      const prob = Math.max(0.2, 0.9 - c.wind * 0.2 + (c.size === 'large' ? 0.15 : 0));
      return {
        ...c,
        settleProb: domainTag(DOMAINS.RATIO, Math.round(prob * 100) / 100),
        canSettle: prob > 0.5
      };
    }
  });

  const currentInput = { wind: 1.5, size: 'large' };
  const nextState = evalConstraint(policy, currentInput)[0];
  console.log('入力:', currentInput);
  console.log('導出された状態:', nextState);

  console.log('\nこのテンプレートをコピーして、プロジェクトの状態導出ロジックに使ってください。');
  console.log('core.js には入れないことで、Virtual Heavy 編集の基本モデルをシンプルに保っています。');
}

// ============================================================
// 物語駆動用の最小テンプレート（思考実験用）
// ============================================================

/**
 * 物語用の制約ブロックを作るヘルパー。
 * 軸は物語の「現在の状況」を表す少数の変数。
 * derive はその組み合わせに対して「次に起きること」を一貫して導出する。
 */
export function storyConstraintBlock({ id, axes, values, derive }) {
  return constraintBlock({ id, axes, values, derive });
}

/**
 * 物語駆動の derive 例（超ミニマム）。
 * 軸を少なく保つのがコツ。登場人物も最初は 1〜2人 + 「世界の圧力」で十分実験できる。
 */
export function makeMinimalStoryPolicy() {
  return storyConstraintBlock({
    id: 'story:minimal-demo',
    axes: ['tension', 'trust_alice', 'revelation', 'world_pressure'],
    values: {
      tension: ['low', 'med', 'high'],
      trust_alice: ['low', 'med', 'high'],
      revelation: ['none', 'partial', 'full'],
      world_pressure: ['calm', 'rising', 'crisis']
    },
    derive: (c) => {
      const events = [];
      let scene = 'quiet_reflection';
      let alice_action = 'wait';
      let new_fact = null;

      // 核心の制約（ここを増やしていく）
      if (c.tension === 'high' && c.trust_alice === 'low' && c.revelation === 'full') {
        events.push('alice_betrayal');
        scene = 'confrontation';
        alice_action = 'accuse_and_flee';
        new_fact = 'alice_has_been_working_against_you';
      } else if (c.tension === 'high' && c.revelation !== 'none') {
        events.push('alice_confronts_truth');
        scene = 'tense_dialogue';
        alice_action = 'demand_explanation';
      } else if (c.world_pressure === 'crisis' && c.tension !== 'low') {
        events.push('external_threat_arrives');
        scene = 'escape_or_fight';
      } else if (c.trust_alice === 'high' && c.revelation === 'partial') {
        events.push('alice_offers_help');
        scene = 'alliance_moment';
        alice_action = 'share_secret';
      }

      // 常に一貫した状態を返す（これが「畳み込み」の本質）
      return {
        ...c,
        scene,
        events,
        alice_action,
        new_fact,
        narrative_tone: events.length > 0 ? 'tense' : 'quiet',
        // domainTag で自己記述的に（LLMが後で読みやすい）
        story_beat: domainTag('narrative', events.join('+') || 'stillness')
      };
    }
  });
}

// 実験用に「現在の軸の値」から次の物語状態を出すだけの関数
export function nextStoryBeat(policy, currentAxes) {
  const results = evalConstraint(policy, currentAxes);
  if (results.length === 0) {
    // 制約でカバーされていない組み合わせが出たらここで検知できる（大事）
    throw new Error(`No matching story state for axes: ${JSON.stringify(currentAxes)}`);
  }
  // 通常は1つだけ返ってくるはず（制約がちゃんと書けていれば）
  return results[0];
}

// ============================================================
// ロミオとジュリエットの出会い 実験用スケルトン
// ============================================================

/**
 * ロミオとジュリエットの出会い（仮面舞踏会シーン）を制約で駆動する最小例。
 * 
 * 登場人物は「ロミオ」「ジュリエット」「パーティーの空気（世界の圧力）」の3軸で始める。
 * 最初は2人＋文脈で十分。後で「ティボルトの視線」「運命の干渉」などを軸に追加すればいい。
 */
export function makeRomeoJulietMeetingPolicy() {
  return storyConstraintBlock({
    id: 'story:romeo-juliet-meeting',
    axes: ['romeo_state', 'juliet_state', 'mutual_attraction', 'family_awareness', 'party_risk'],
    values: {
      // ロミオの内面状態
      romeo_state: ['melancholy', 'restless', 'impulsive', 'love_struck'],
      // ジュリエットの内面状態
      juliet_state: ['curious', 'dutiful', 'awakening', 'bold'],
      // 互いの引力（一目惚れの強さ）
      mutual_attraction: ['spark', 'growing', 'overwhelming'],
      // 家系の正体を知っている度合い（出会いの核心）
      family_awareness: ['neither_knows', 'romeo_knows', 'juliet_knows', 'both_know'],
      // パーティーでの発覚リスク（敵対関係の緊張）
      party_risk: ['low', 'medium', 'high']
    },
    derive: (c) => {
      const events = [];
      let scene = 'masked_glance';
      let romeo_action = 'observe_from_distance';
      let juliet_action = 'dance_with_others';
      let new_fact = null;
      let next_possible_inputs = ['romeo_approaches', 'juliet_notices_him'];

      // ここが「出会いを駆動する制約」
      // 基本ルール：引力が高まると自然に行動がエスカレートし、名前を知る前にキスまで行く
      if (c.mutual_attraction === 'overwhelming' && c.family_awareness === 'neither_knows') {
        events.push('instant_love');
        scene = 'sonnet_exchange';
        romeo_action = 'approach_and_flirt';
        juliet_action = 'responds_in_kind';
        new_fact = 'they_kiss_without_knowing_names';
        next_possible_inputs = ['names_revealed', 'tybalt_appears'];
      } else if (c.mutual_attraction === 'growing' && c.party_risk !== 'high') {
        events.push('eyes_meet_across_the_room');
        scene = 'first_words';
        romeo_action = 'take_her_hand';
        juliet_action = 'lets_him';
      } else if (c.romeo_state === 'impulsive' && c.juliet_state === 'awakening') {
        events.push('romeo_dares_to_approach');
        scene = 'balcony_of_the_moment';  // 舞踏会の中の「バルコニー」
      }

      // 敵対関係がバレそうになるとリスクが跳ね上がる
      if (c.family_awareness !== 'neither_knows' && c.party_risk === 'high') {
        events.push('danger_of_discovery');
        scene = 'whispered_goodbye';
        next_possible_inputs.push('secret_meeting_arranged');
      }

      return {
        ...c,
        scene,
        events,
        romeo_action,
        juliet_action,
        new_fact,
        next_possible_inputs,
        narrative_tone: c.mutual_attraction === 'overwhelming' ? 'intoxicated' : 'charged',
        story_beat: domainTag('narrative', events.join('+') || 'first_glance')
      };
    }
  });
}

/**
 * 【最終確定版】『Vs TAG - The Asymmetric Tragedy of Verona』 専用ポリシー
 * 4×4 非対称の魂（アーキタイプ）システムを制約で完全に表現。
 *
 * 各プレイヤーはゲーム開始時に「魂」をランダムに割り当てられるが、互いに（そして自分自身にも）その正体は隠されている。
 * この2つの魂の組み合わせ（4×4=16通り）が、物語の「真実の型」を決定する。
 *
 * 軸:
 * - romeo_soul: light / peace / lovehate / void
 * - juliet_soul: light / revolution / mercy / void
 * - act: prologue / mid / climax
 * - key_state: 現在の物語の進行を表す複合状態（elopement_strength, othello_influence, death_plan_progress, betrayal, park_truth などを内包した値）
 *
 * derive は「この魂の組み合わせ＋現在の進行度」で、絶対に一貫した次のイベント・行動・新事実・利用可能な選択肢を導出する。
 * これにより「プレイヤーが知らない真実の物語」が、制約によって強制的に正しく駆動される。
 */
export function makeVsTagVeronaPolicy() {
  return storyConstraintBlock({
    id: 'story:vs-tag-verona-final',
    axes: ['romeo_soul', 'juliet_soul', 'act', 'key_state'],
    values: {
      romeo_soul: ['light', 'peace', 'lovehate', 'void'],
      juliet_soul: ['light', 'revolution', 'mercy', 'void'],
      act: ['prologue', 'mid', 'climax'],
      // key_state は複合的な進行度を表す（簡易的に文字列で管理。実際はさらに細分化可能）
      key_state: [
        'masked_ball', 
        'othello_dance', 
        'park_revelation', 
        'death_plan_proposed', 
        'death_plan_committed', 
        'betrayal_happened', 
        'triangle_formed', 
        'park_proposal', 
        'final_choice'
      ]
    },
    derive: (c) => {
      const events = [];
      let scene = 'masked_ball';
      let romeo_action = 'observe';
      let juliet_action = 'dance';
      let othello_action = 'none';
      let new_facts = [];
      let available_choices = [];
      let narrative_tone = 'charged';
      let ending_if_ended = domainTag('ending', 'in_progress');

      const combo = `${c.romeo_soul}+${c.juliet_soul}`;

      // === 序幕：偽りの約束（masked_ball → othello_dance → park_revelation） ===
      if (c.key_state === 'masked_ball') {
        events.push('false_elopement_promise');
        scene = 'masked_ball';
        available_choices = ['romeo_approaches', 'juliet_responds_to_dance'];
        if (c.juliet_soul === 'revolution' || c.juliet_soul === 'mercy') {
          events.push('othello_appears');
          othello_action = 'invites_juliet_to_dance_planting_doubt';
          juliet_action = 'dances_with_othello';
        }
      }

      if (c.key_state === 'othello_dance') {
        events.push('othello_takes_juliet_to_park');
        scene = 'orphanage_park_ruins';
        othello_action = 'shows_childhood_place_with_double_meaning';
        new_facts.push('park_is_othello_memories_and_our_future');
        available_choices = ['romeo_feels_suspicion', 'juliet_hides_visit'];
      }

      if (c.key_state === 'park_revelation') {
        events.push('park_revelation');
        scene = 'orphanage_park_ruins';
        othello_action = 'reveals_hidden_truths_with_double_meaning';
        new_facts.push('doubt_and_revelation_at_park');
        available_choices = ['romeo_confronts_suspicion', 'juliet_protects_secret'];
        narrative_tone = 'suspicious';
      }

      // === 中盤：疑心と選択の螺旋 ===
      if (c.key_state === 'death_plan_proposed') {
        events.push('juliet_fake_death_plan_proposed');
        scene = 'secret_discussion';
        juliet_action = 'proposes_to_take_the_drug';
        available_choices = ['juliet_takes_drug', 'juliet_refuses'];
        narrative_tone = 'tense';
      }

      if (c.key_state === 'death_plan_committed') {
        events.push('juliet_takes_the_drug');
        scene = 'juliet_appears_dead';
        new_facts.push('juliet_in_fake_death');
        available_choices = ['romeo_saves_her', 'romeo_leaves_her_for_mission'];
        // 決定的な裏切りロジック（魂の組み合わせで強制） -- strict per-key if, precedence fixed, 4 axes only
        if (c.romeo_soul === 'void' || (c.romeo_soul === 'lovehate' && c.juliet_soul !== 'light')) {
          // ロミオが使命/任務を優先 → 見殺し → othello rescue → triangle (per spec for non-light paths)
          events.push('romeo_sacrifices_juliet');
          othello_action = 'appears_and_rescues_juliet';
          events.push('othello_rescues_juliet');
          juliet_action = 'awakens_to_othello';
          new_facts.push('romeo_betrayed_her_othello_saved_her');
          available_choices = ['romeo_realizes_the_loss', 'romeo_doubles_down_on_mission'];
        } else if (c.romeo_soul === 'light' || (c.romeo_soul === 'peace' && c.juliet_soul === 'light')) {
          events.push('romeo_chooses_to_save_juliet');
          juliet_action = 'saved_by_true_romeo';
          new_facts.push('romeo_put_love_above_mission');
        } else {
          // other souls (e.g. peace+nonlight, revolution souls): stay mission
          romeo_action = 'hesitates_but_prioritizes_mission';
          new_facts.push('romeo_stays_true_to_his_soul_mission');
        }
      }

      if (c.key_state === 'betrayal_happened') {
        events.push('betrayal_happened');
        scene = 'juliet_appears_dead';
        romeo_action = 'realizes_loss_too_late';
        juliet_action = 'awakens_to_othello';
        othello_action = 'claims_juliet';
        new_facts.push('romeo_betrayed_her_othello_saved_her');
        available_choices = ['romeo_pursues', 'romeo_withdraws'];
        narrative_tone = 'tragic';
      }

      if (c.key_state === 'triangle_formed') {
        events.push('triangle_formed');
        scene = 'orphanage_park_ruins';
        othello_action = 'binds_juliet_with_revolution_promise';
        juliet_action = 'torn_between_duty_and_new_bond';
        romeo_action = 'witnesses_the_bond_as_betrayer';
        new_facts.push('othello_bond_formed_triangle_complete');
        available_choices = ['juliet_chooses_othello', 'romeo_intervenes_too_late'];
        narrative_tone = 'tragic';
      }

      // === 終幕：公園での審判 ===
      if (c.key_state === 'park_proposal') {
        events.push('return_to_park');
        scene = 'orphanage_park_final';
        othello_action = 'proposes_marriage_to_juliet';
        juliet_action = 'faces_the_final_choice_revolution_or_noble_death';
        romeo_action = 'witnesses_the_proposal_as_final_trial';
        new_facts.push('othello_offers_revolution_life_vs_noble_death');
        available_choices = ['juliet_chooses_othello', 'juliet_chooses_romeo', 'romeo_intervenes', 'romeo_accepts_fate_or_destroys_all'];
      }

      // === 16通りの結末判定（魂の組み合わせ＋進行で決定。唯一の奇跡は light+light のみ、他15は非対称悲劇バリアント） ===
      if (c.key_state === 'final_choice') {
        events.push('final_choice_judgment');
        scene = 'orphanage_park_final';
        othello_action = 'proposes_marriage_to_juliet';
        juliet_action = 'faces_the_final_choice_revolution_or_noble_death';
        romeo_action = 'witnesses_the_proposal_as_final_trial';
        new_facts.push('othello_offers_revolution_life_vs_noble_death');
        available_choices = [];
        if (c.romeo_soul === 'light' && c.juliet_soul === 'light') {
          // 唯一の奇跡ルート per spec: 【光】本物 vs 【光】本物 only, 16分の1。 souls guarantee no sac/tri (save branch taken), clean key path in sim ensures
          events.push('true_love_1_in_16');
          ending_if_ended = domainTag('ending', 'true_love_1_in_16');
          narrative_tone = 'miraculous';
        } else if (c.romeo_soul === 'void' || c.juliet_soul === 'void') {
          events.push('pure_assassin_end');
          ending_if_ended = domainTag('ending', 'pure_assassin_tragedy');
        } else if (c.romeo_soul === 'lovehate' || c.juliet_soul === 'mercy' || c.romeo_soul === 'peace') {
          events.push('betrayal_othello_end');
          ending_if_ended = domainTag('ending', 'romeo_betrayal_othello_victory');
        } else {
          events.push('asymmetric_end');
          ending_if_ended = domainTag('ending', 'asymmetric_tragedy_default');
        }
      }

      return {
        ...c,
        scene,
        events,
        romeo_action,
        juliet_action,
        othello_action,
        new_facts,
        available_choices,
        narrative_tone,
        story_beat: domainTag('narrative', events.join('+') || 'masked_encounter'),
        ending_if_ended
      };
    }
  });
}

