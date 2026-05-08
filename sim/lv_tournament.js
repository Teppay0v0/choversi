// LV50〜LV99 を1レベルずつトーナメント
// 各ペア (LVx vs LVx+1) を多数の seed で対戦させ、上位LVの勝率を集計
//
// 注：シミュレータのAIは閾値ベース（50/70/85）でしか差が出ないため、
//   tier 内（例: 50-69 内）のLV差はノイズになります。
//   tier 越え（69→70, 84→85）では明確な勝率差が見えるはず。
'use strict';

const { playGame } = require('./simulator');

const SEEDS_PER_PAIR = 20;          // 各方向ごとのシード数
const SEED_BASE = 13_579;

function pct(x) { return (x * 100).toFixed(0) + '%'; }

// ペア対戦（lower vs higher）を両色入替で実行
// 返却：higher が何戦勝ったか / 全戦数 / margin の合計
function playPair(lvLow, lvHigh) {
  let higherWins = 0, total = 0, marginSum = 0;
  for (let i = 0; i < SEEDS_PER_PAIR; i++) {
    const seed = SEED_BASE + i * 9973;

    // パターン1: 下位LV = 黒（先手・有利）、上位LV = 白
    const r1 = playGame(seed, {
      handSize: { D: 4, L: 3 },
      guaranteeStrongForBlack: true,
      cascadeBonus: false,
      aiLevels: { D: lvLow, L: lvHigh },
    });
    if (r1.winner === 'L') higherWins++;
    total++;
    marginSum += (r1.score.L - r1.score.D); // 上位視点の得失差

    // パターン2: 上位LV = 黒、下位LV = 白
    const r2 = playGame(seed + 1, {
      handSize: { D: 4, L: 3 },
      guaranteeStrongForBlack: true,
      cascadeBonus: false,
      aiLevels: { D: lvHigh, L: lvLow },
    });
    if (r2.winner === 'D') higherWins++;
    total++;
    marginSum += (r2.score.D - r2.score.L);
  }
  return { higherWins, total, avgMargin: marginSum / total };
}

const results = [];
for (let lv = 50; lv <= 98; lv++) {
  const r = playPair(lv, lv + 1);
  results.push({ low: lv, high: lv + 1, ...r });
}

console.log('\n========================================================');
console.log(`  LV50〜99 1レベル差トーナメント（各ペア ${SEEDS_PER_PAIR * 2} 戦）`);
console.log('========================================================\n');
console.log('  ペア  | 上位勝率 | 上位視点平均得失差 | 注釈');
console.log('  ----- | ---------| ------------------ | ----');

for (const r of results) {
  const winRate = r.higherWins / r.total;
  const note =
    (r.low === 49 || r.low === 69 || r.low === 84) ? '← tier 越え' :
    Math.abs(winRate - 0.5) > 0.15 ? '*' : '';
  const bar = '█'.repeat(Math.round(winRate * 20)) + '░'.repeat(20 - Math.round(winRate * 20));
  console.log(`  LV${String(r.low).padStart(2)} vs LV${String(r.high).padStart(2)} | ${pct(winRate).padStart(4)} | ${bar} | ${r.avgMargin.toFixed(1).padStart(6)} | ${note}`);
}

// 集計：tier 内 vs tier 越え
const tierBoundaries = [69, 84]; // 69→70, 84→85
const tierBoundaryResults = results.filter(r => tierBoundaries.includes(r.low));
const tierInteriorResults = results.filter(r => !tierBoundaries.includes(r.low));

console.log('\n--- 集計 ---');
console.log(`tier 越えペア (49→50, 69→70, 84→85):`);
for (const r of tierBoundaryResults) {
  console.log(`  LV${r.low} vs LV${r.high}: 上位 ${pct(r.higherWins/r.total)}`);
}
const interiorAvg = tierInteriorResults.reduce((s,r)=>s+r.higherWins/r.total,0) / tierInteriorResults.length;
console.log(`tier 内ペアの上位勝率 平均: ${pct(interiorAvg)}（≈50% ならノイズ）`);
