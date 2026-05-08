// LV差が大きい時に上位が確実に勝つかをテスト
'use strict';
const { playGame } = require('./simulator');

const SEEDS = 30;
const SEED_BASE = 13_579;

function pct(x) { return (x*100).toFixed(0) + '%'; }

function matchPair(lvLow, lvHigh) {
  let highWins = 0, total = 0, marginSum = 0;
  for (let i = 0; i < SEEDS; i++) {
    const seed = SEED_BASE + i * 9973;
    const r1 = playGame(seed, { handSize:{D:4,L:3}, guaranteeStrongForBlack:true, cascadeBonus:false, aiLevels:{D:lvLow, L:lvHigh} });
    if (r1.winner === 'L') highWins++;
    total++;
    marginSum += (r1.score.L - r1.score.D);
    const r2 = playGame(seed+1, { handSize:{D:4,L:3}, guaranteeStrongForBlack:true, cascadeBonus:false, aiLevels:{D:lvHigh, L:lvLow} });
    if (r2.winner === 'D') highWins++;
    total++;
    marginSum += (r2.score.D - r2.score.L);
  }
  return { highWins, total, avgMargin: marginSum / total };
}

const tests = [
  [50, 60], [50, 70], [50, 85], [50, 99],
  [70, 80], [70, 85], [70, 99],
  [85, 90], [85, 95], [85, 99],
  [90, 99], [95, 99],
];

console.log('\n========================================================');
console.log('  LV差が大きい時の上位勝率（30戦×2方向 = 60戦）');
console.log('========================================================\n');
console.log('  LV pair      | 上位勝率 | 平均得失差（上位視点）');
console.log('  -------------|----------|------------------------');
for (const [low, high] of tests) {
  const r = matchPair(low, high);
  const winRate = r.highWins / r.total;
  const bar = '█'.repeat(Math.round(winRate * 20)) + '░'.repeat(20 - Math.round(winRate * 20));
  console.log(`  LV${String(low).padStart(2)} vs LV${String(high).padStart(2)} | ${pct(winRate).padStart(5)}    | ${bar} | ${r.avgMargin.toFixed(1).padStart(6)}`);
}
