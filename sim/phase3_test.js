// Phase 3 検証：LV70+ で確率的フリップ・リスク評価＋探知ブースト
'use strict';

const { playGame } = require('./simulator');

const NUM_GAMES = 30;
const SEED_BASE = 42;

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function runLevel(label, aiLevel) {
  const results = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = SEED_BASE + i * 7919;
    results.push(playGame(seed, {
      handSize: { D: 4, L: 3 },
      guaranteeStrongForBlack: true,
      cascadeBonus: false,
      aiLevel,
    }));
  }
  const blackWins = results.filter(r => r.winner === 'D').length;
  const allChains = results.flatMap(r => r.chains);
  return {
    label,
    aiLevel,
    blackWins,
    avgScoreD: mean(results.map(r => r.score.D)),
    avgScoreL: mean(results.map(r => r.score.L)),
    avgMargin: mean(results.map(r => Math.abs(r.score.D - r.score.L))),
    avgMaxChain: mean(results.map(r => r.maxChain)),
    longChains3: allChains.filter(c => c >= 3).length,
    longChains5: allChains.filter(c => c >= 5).length,
    avgTurns: mean(results.map(r => r.turns)),
    tanchiUses: results.reduce((s, r) => s + ((r.skillUses && r.skillUses.tanchi) || 0), 0),
    bakudanFires: results.reduce((s, r) => s + (r.bakudanExplosions || 0), 0),
    vanishUses: results.reduce((s, r) => s + ((r.vanishUses && (r.vanishUses.D + r.vanishUses.L)) || 0), 0),
  };
}

function row(label, ...vals) {
  return `| ${label.padEnd(20)} | ${vals.map(v => String(v).padStart(15)).join(' | ')} |`;
}

const lv30 = runLevel('Phase 1 (LV30)', 30);
const lv50 = runLevel('Phase 2 (LV50)', 50);
const lv70 = runLevel('Phase 3 (LV70)', 70);
const lv85 = runLevel('Phase 3 (LV85)', 85);

console.log('\n========================================================');
console.log('  ChoVersi — Phase 3 検証（30戦・LV別比較）');
console.log('========================================================\n');
console.log('| Metric               |   Phase 1 LV30 |   Phase 2 LV50 |   Phase 3 LV70 |   Phase 3 LV85 |');
console.log('|----------------------|----------------|----------------|----------------|----------------|');
console.log(row('Black wins',         `${lv30.blackWins}/${NUM_GAMES} (${pct(lv30.blackWins/NUM_GAMES)})`,
                                       `${lv50.blackWins}/${NUM_GAMES} (${pct(lv50.blackWins/NUM_GAMES)})`,
                                       `${lv70.blackWins}/${NUM_GAMES} (${pct(lv70.blackWins/NUM_GAMES)})`,
                                       `${lv85.blackWins}/${NUM_GAMES} (${pct(lv85.blackWins/NUM_GAMES)})`));
console.log(row('Avg margin',         lv30.avgMargin.toFixed(1), lv50.avgMargin.toFixed(1), lv70.avgMargin.toFixed(1), lv85.avgMargin.toFixed(1)));
console.log(row('Avg max chain',      lv30.avgMaxChain.toFixed(2), lv50.avgMaxChain.toFixed(2), lv70.avgMaxChain.toFixed(2), lv85.avgMaxChain.toFixed(2)));
console.log(row('Long chains ≥3',     lv30.longChains3, lv50.longChains3, lv70.longChains3, lv85.longChains3));
console.log(row('Long chains ≥5',     lv30.longChains5, lv50.longChains5, lv70.longChains5, lv85.longChains5));
console.log(row('Tanchi uses',        lv30.tanchiUses, lv50.tanchiUses, lv70.tanchiUses, lv85.tanchiUses));
console.log(row('Bakudan fires',      lv30.bakudanFires, lv50.bakudanFires, lv70.bakudanFires, lv85.bakudanFires));
console.log(row('Vanish uses',        lv30.vanishUses, lv50.vanishUses, lv70.vanishUses, lv85.vanishUses));
console.log(row('Avg turns',          lv30.avgTurns.toFixed(1), lv50.avgTurns.toFixed(1), lv70.avgTurns.toFixed(1), lv85.avgTurns.toFixed(1)));

console.log('\n');
console.log('LV70+ 期待される変化：');
console.log('  - Bakudan fires: 不明異能のフリップを警戒 → 爆発を踏まないので減るはず');
console.log('  - Tanchi uses: 強カードが残ってる時に多く使うはず');
console.log('  - Avg margin: より接戦に / 大事故が減る');
