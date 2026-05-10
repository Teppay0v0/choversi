// 鬼神強化の即席検証：LV99 が LV50/LV85 にどれだけ勝つか
'use strict';
const { playGame } = require('./simulator');

const SEEDS = 20;
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
  return { winRate: highWins / total, avgMargin: marginSum / total };
}

console.log('\n強化検証（LV99 主軸・20戦×2方向 = 40戦）:');
[[50, 99], [85, 99], [95, 99]].forEach(([lo, hi]) => {
  const r = matchPair(lo, hi);
  console.log(`  LV${lo} vs LV${hi}: 上位${pct(r.winRate)}（差 ${r.avgMargin.toFixed(1)}）`);
});
