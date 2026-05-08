// Phase 1 検証：探知 reveal-only + AI fog-of-war
// 比較対象：simulator.js 現状（Phase 1 適用済み）
// "ベースライン" を比較したい場合は別ファイルで old SKILL_BONUS / old tanchi に切り替えて実行する。
'use strict';

const { playGame } = require('./simulator');

const NUM_GAMES = 30;
const SEED_BASE = 42;

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function run() {
  const results = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = SEED_BASE + i * 7919;
    results.push(playGame(seed, {
      handSize: { D: 4, L: 3 },
      guaranteeStrongForBlack: true,
      cascadeBonus: false,
    }));
  }

  const blackWins  = results.filter(r => r.winner === 'D').length;
  const whiteWins  = results.filter(r => r.winner === 'L').length;
  const draws      = results.filter(r => r.winner === 'draw').length;
  const tight      = results.filter(r => Math.abs(r.score.D - r.score.L) <= 5).length;
  const blowout    = results.filter(r => Math.abs(r.score.D - r.score.L) > 15).length;
  const allChains  = results.flatMap(r => r.chains);
  const longChains3 = allChains.filter(c => c >= 3).length;
  const longChains5 = allChains.filter(c => c >= 5).length;
  const longChains8 = allChains.filter(c => c >= 8).length;
  const maxChain   = Math.max(0, ...results.map(r => r.maxChain));
  const avgMargin  = mean(results.map(r => Math.abs(r.score.D - r.score.L)));
  const avgScoreD  = mean(results.map(r => r.score.D));
  const avgScoreL  = mean(results.map(r => r.score.L));
  const avgTurns   = mean(results.map(r => r.turns));
  const tanchiUses = results.reduce((s, r) => s + ((r.skillUses && r.skillUses.tanchi) || 0), 0);
  const bakudanFires = results.reduce((s, r) => s + (r.bakudanExplosions || 0), 0);
  const passesD    = results.reduce((s, r) => s + ((r.passes && r.passes.D) || 0), 0);
  const passesL    = results.reduce((s, r) => s + ((r.passes && r.passes.L) || 0), 0);

  console.log('\n========================================================');
  console.log('  ChoVersi — Phase 1 検証（30戦・自己対戦）');
  console.log('  探知 = reveal-only / SKILL_BONUS.tanchi 14→4 / fog-of-war');
  console.log('========================================================\n');

  console.log('【勝敗バランス】');
  console.log(`  黒勝利     : ${blackWins} 戦  (${pct(blackWins/NUM_GAMES)})`);
  console.log(`  白勝利     : ${whiteWins} 戦  (${pct(whiteWins/NUM_GAMES)})`);
  console.log(`  引き分け   : ${draws} 戦`);
  console.log(`  接戦 (≤5)  : ${tight}/${NUM_GAMES}`);
  console.log(`  大差 (>15) : ${blowout}/${NUM_GAMES}`);

  console.log('\n【スコア】');
  console.log(`  平均 黒/白 : ${avgScoreD.toFixed(1)} / ${avgScoreL.toFixed(1)}`);
  console.log(`  平均得失差 : ${avgMargin.toFixed(1)}`);

  console.log('\n【連鎖】');
  console.log(`  平均最大連鎖 : ${mean(results.map(r=>r.maxChain)).toFixed(2)}`);
  console.log(`  歴代最大連鎖 : ${maxChain}`);
  console.log(`  3連鎖以上    : ${longChains3} 回`);
  console.log(`  5連鎖以上    : ${longChains5} 回`);
  console.log(`  8連鎖以上    : ${longChains8} 回`);

  console.log('\n【異能の使われ方】');
  console.log(`  探知の発動回数 : ${tanchiUses}`);
  console.log(`  爆弾の爆発回数 : ${bakudanFires}`);
  console.log(`  パス D / L     : ${passesD} / ${passesL}`);

  console.log('\n【試合の長さ】');
  console.log(`  平均手数 : ${avgTurns.toFixed(1)}`);

  console.log('\n========================================================');
  // 評価
  const balanced = blackWins/NUM_GAMES >= 0.35 && blackWins/NUM_GAMES <= 0.65;
  const hasChains = longChains3 >= 5;
  console.log(`  バランス      : ${balanced ? '🟢 OK (35-65%)' : '🔴 偏り'}`);
  console.log(`  連鎖の発生量  : ${hasChains ? '🟢 十分' : '🔴 少ない'}`);
  console.log('========================================================\n');
}

run();
