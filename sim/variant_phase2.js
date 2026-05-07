// Phase 2: handSize D=4 + strong card + cascade bonus
'use strict';
const { playGame, FULL_DECK } = require('./simulator');

const NUM_GAMES = 30;
const SEED_BASE = 42;

function pct(x) { return (x*100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function runConfig(label, opts) {
  const results = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = SEED_BASE + i * 7919;
    results.push(playGame(seed, opts));
  }
  const blackWins = results.filter(r => r.winner === 'D').length;
  const whiteWins = results.filter(r => r.winner === 'L').length;
  const draws = results.filter(r => r.winner === 'draw').length;
  const tight = results.filter(r => Math.abs(r.score.D - r.score.L) <= 5).length;
  const blowout = results.filter(r => Math.abs(r.score.D - r.score.L) > 15).length;
  const allChains = results.flatMap(r => r.chains);
  const longChains3 = allChains.filter(c => c >= 3).length;
  const longChains4 = allChains.filter(c => c >= 4).length;
  const longChains5 = allChains.filter(c => c >= 5).length;
  const maxChain = Math.max(0, ...results.map(r => r.maxChain));
  const cascades = results.reduce((s, r) => s + (r.cascadeBonuses || 0), 0);
  const cascadeStones = results.reduce((s, r) => s + (r.cascadeStones || 0), 0);
  return {
    label, blackWins, whiteWins, draws,
    blackWinRate: blackWins / NUM_GAMES,
    avgScoreD: mean(results.map(r => r.score.D)),
    avgScoreL: mean(results.map(r => r.score.L)),
    avgMargin: mean(results.map(r => Math.abs(r.score.D - r.score.L))),
    tight, blowout,
    avgMaxChain: mean(results.map(r => r.maxChain)),
    maxChain, longChains3, longChains4, longChains5,
    cascades, cascadeStones,
    avgTurns: mean(results.map(r => r.turns)),
  };
}

const baseline   = runConfig('Baseline (no fixes)', { cascadeBonus: false });
const phase1     = runConfig('Phase 1 (handSize D=4 + strong)',
  { handSize: { D: 4, L: 3 }, guaranteeStrongForBlack: true, cascadeBonus: false });
const phase2     = runConfig('Phase 2 (Phase1 + cascade bonus)',
  { handSize: { D: 4, L: 3 }, guaranteeStrongForBlack: true, cascadeBonus: true });

function row(label, ...vals) {
  return `| ${label.padEnd(26)} | ${vals.map(v => String(v).padStart(13)).join(' | ')} |`;
}

console.log('\n=== B案 進捗検証 (30戦) ===');
console.log('| Metric                     | Baseline      | Phase 1       | Phase 2       |');
console.log('|----------------------------|---------------|---------------|---------------|');
console.log(row('Black wins',           `${baseline.blackWins}/${NUM_GAMES}`, `${phase1.blackWins}/${NUM_GAMES}`, `${phase2.blackWins}/${NUM_GAMES}`));
console.log(row('🎯 Black win rate',     pct(baseline.blackWinRate), pct(phase1.blackWinRate), pct(phase2.blackWinRate)));
console.log(row('Avg score D / L',      `${baseline.avgScoreD.toFixed(0)}/${baseline.avgScoreL.toFixed(0)}`,
                                          `${phase1.avgScoreD.toFixed(0)}/${phase1.avgScoreL.toFixed(0)}`,
                                          `${phase2.avgScoreD.toFixed(0)}/${phase2.avgScoreL.toFixed(0)}`));
console.log(row('Avg margin',           baseline.avgMargin.toFixed(1), phase1.avgMargin.toFixed(1), phase2.avgMargin.toFixed(1)));
console.log(row('Tight ≤5',             baseline.tight,                phase1.tight,                phase2.tight));
console.log(row('Blowout >15',          baseline.blowout,              phase1.blowout,              phase2.blowout));
console.log(row('Avg max chain',        baseline.avgMaxChain.toFixed(2), phase1.avgMaxChain.toFixed(2), phase2.avgMaxChain.toFixed(2)));
console.log(row('Max chain overall',    baseline.maxChain,             phase1.maxChain,             phase2.maxChain));
console.log(row('Long chains ≥3',       baseline.longChains3,          phase1.longChains3,          phase2.longChains3));
console.log(row('Long chains ≥4',       baseline.longChains4,          phase1.longChains4,          phase2.longChains4));
console.log(row('🎯 Long chains ≥5',    baseline.longChains5,          phase1.longChains5,          phase2.longChains5));
console.log(row('Cascade bonus fires',  baseline.cascades,             phase1.cascades,             phase2.cascades));
console.log(row('Cascade stones gained',baseline.cascadeStones,        phase1.cascadeStones,        phase2.cascadeStones));
console.log(row('Avg turns',            baseline.avgTurns.toFixed(1),  phase1.avgTurns.toFixed(1),  phase2.avgTurns.toFixed(1)));

const dPP = ((phase2.blackWinRate - baseline.blackWinRate) * 100).toFixed(1);
console.log(`\n累計勝率改善: +${dPP}pp`);
console.log(phase2.blackWinRate >= 0.35 && phase2.blackWinRate <= 0.65 ?
  '🟢 目標達成（35〜65%）' : '🔴 目標未達（35〜65%）');
console.log(phase2.longChains5 > 0 ?
  '🟢 連鎖長5+ 発生' : '🔴 連鎖長5+ 未発生');
