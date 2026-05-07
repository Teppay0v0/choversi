// Combined variant: handSize D=4 AND guaranteeStrongForBlack=true
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
  const errors = results.filter(r => r.errors.length > 0).length;
  return {
    label, blackWins, whiteWins, draws,
    blackWinRate: blackWins / NUM_GAMES,
    avgScoreD: mean(results.map(r => r.score.D)),
    avgScoreL: mean(results.map(r => r.score.L)),
    avgMargin: mean(results.map(r => Math.abs(r.score.D - r.score.L))),
    tight, blowout,
    avgMaxChain: mean(results.map(r => r.maxChain)),
    maxChain, longChains3, longChains4, longChains5,
    errors,
    avgTurns: mean(results.map(r => r.turns)),
  };
}

const baseline = runConfig('Baseline', {});
const combined = runConfig('Combined (handSize D=4 + strong card)',
  { handSize: { D: 4, L: 3 }, guaranteeStrongForBlack: true });

function row(label, ...vals) {
  return `| ${label.padEnd(28)} | ${vals.map(v => String(v).padStart(14)).join(' | ')} |`;
}

console.log('\n=== B案修正の効果検証 ===');
console.log('| Metric                       | Baseline       | Combined       |');
console.log('|------------------------------|----------------|----------------|');
console.log(row('Black wins / total',         `${baseline.blackWins}/${NUM_GAMES}`, `${combined.blackWins}/${NUM_GAMES}`));
console.log(row('🎯 Black win rate',           pct(baseline.blackWinRate),          pct(combined.blackWinRate)));
console.log(row('Avg score D / L',            `${baseline.avgScoreD.toFixed(1)}/${baseline.avgScoreL.toFixed(1)}`,
                                              `${combined.avgScoreD.toFixed(1)}/${combined.avgScoreL.toFixed(1)}`));
console.log(row('Avg margin',                 baseline.avgMargin.toFixed(1),       combined.avgMargin.toFixed(1)));
console.log(row('Tight ≤5',                   baseline.tight,                      combined.tight));
console.log(row('Blowout >15',                baseline.blowout,                    combined.blowout));
console.log(row('Avg max chain',              baseline.avgMaxChain.toFixed(2),     combined.avgMaxChain.toFixed(2)));
console.log(row('Max chain overall',          baseline.maxChain,                   combined.maxChain));
console.log(row('Long chains ≥3',             baseline.longChains3,                combined.longChains3));
console.log(row('Long chains ≥4',             baseline.longChains4,                combined.longChains4));
console.log(row('🎯 Long chains ≥5',          baseline.longChains5,                combined.longChains5));
console.log(row('Errors',                     baseline.errors,                     combined.errors));
console.log(row('Avg turns',                  baseline.avgTurns.toFixed(1),        combined.avgTurns.toFixed(1)));

const dPP = ((combined.blackWinRate - baseline.blackWinRate) * 100).toFixed(1);
console.log(`\n勝率変化: +${dPP}pp`);
const target = combined.blackWinRate >= 0.35 && combined.blackWinRate <= 0.65;
console.log(target ? '🟢 目標達成（35〜65%）' : '🔴 目標未達（35〜65%）');
