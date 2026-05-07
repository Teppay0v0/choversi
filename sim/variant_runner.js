// Run baseline / Variant A / Variant B with identical seeds.
// Variant A: Black hand size = 4 (white still 3).
// Variant B: Black's initial top-3 guaranteed to contain one of bakudan/tanchi/hogeki.
'use strict';
const fs = require('fs');
const path = require('path');
const { playGame, FULL_DECK, ABILITIES } = require('./simulator');

const NUM_GAMES = 30;
const SEED_BASE = 42;
const cornerCells = [[0,0],[0,7],[7,0],[7,7]];

function pct(x) { return (x*100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function runConfig(label, opts) {
  const results = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = SEED_BASE + i * 7919;
    results.push(playGame(seed, opts));
  }

  // Aggregate
  const blackWins = results.filter(r => r.winner === 'D').length;
  const whiteWins = results.filter(r => r.winner === 'L').length;
  const draws = results.filter(r => r.winner === 'draw').length;
  const errors = results.flatMap((r,i) => r.errors.map(e => ({ game: i+1, ...e })));

  // Chain dist
  const chainHist = {};
  for (const r of results) for (const c of r.chains) chainHist[c] = (chainHist[c] || 0) + 1;

  // Skill use totals
  const skillUseTotals = {};
  for (const r of results) {
    for (const k of Object.keys(r.skillUses)) {
      skillUseTotals[k] = (skillUseTotals[k] || 0) + r.skillUses[k];
    }
  }

  // Win rate by skill consumed (per side)
  const winsBySkillUse = {};
  for (const ab of FULL_DECK) winsBySkillUse[ab] = { D_use_D_win: 0, D_use_total: 0, L_use_L_win: 0, L_use_total: 0 };
  for (const r of results) {
    for (const card of r.handD) {
      if (card.used) {
        winsBySkillUse[card.s].D_use_total++;
        if (r.winner === 'D') winsBySkillUse[card.s].D_use_D_win++;
      }
    }
    for (const card of r.handL) {
      if (card.used) {
        winsBySkillUse[card.s].L_use_total++;
        if (r.winner === 'L') winsBySkillUse[card.s].L_use_L_win++;
      }
    }
  }

  return {
    label,
    opts,
    results,
    summary: {
      blackWins, whiteWins, draws,
      blackWinRate: blackWins / NUM_GAMES,
      truncated: results.filter(r => r.truncated).length,
      gamesWithErrors: results.filter(r => r.errors.length > 0).length,
      errors,
      avgTurns: mean(results.map(r => r.turns)),
      avgScoreD: mean(results.map(r => r.score.D)),
      avgScoreL: mean(results.map(r => r.score.L)),
      avgMargin: mean(results.map(r => Math.abs(r.score.D - r.score.L))),
      marginDistribution: {
        tight_le5: results.filter(r => Math.abs(r.score.D - r.score.L) <= 5).length,
        mid_6to15: results.filter(r => {const m=Math.abs(r.score.D-r.score.L); return m>=6 && m<=15;}).length,
        blowout_gt15: results.filter(r => Math.abs(r.score.D - r.score.L) > 15).length,
      },
      avgMaxChain: mean(results.map(r => r.maxChain)),
      maxChainOverall: Math.max(...results.map(r => r.maxChain)),
      chainHist,
      totalChains: Object.values(chainHist).reduce((a,b)=>a+b,0),
      longChains_ge3: results.reduce((s,r) => s + r.chains.filter(c => c >= 3).length, 0),
      longChains_ge5: results.reduce((s,r) => s + r.chains.filter(c => c >= 5).length, 0),
      bakudanExplosions: results.reduce((s,r) => s + r.bakudanExplosions, 0),
      hantenBlocks: results.reduce((s,r) => s + r.hantenBlocks, 0),
      kyozoTriggered: results.reduce((s,r) => s + r.kyozoTriggered, 0),
      passesD: results.reduce((s,r) => s + r.passes.D, 0),
      passesL: results.reduce((s,r) => s + r.passes.L, 0),
      vanishUsesD: results.reduce((s,r) => s + r.vanishUses.D, 0),
      vanishUsesL: results.reduce((s,r) => s + r.vanishUses.L, 0),
      gyakushuFiresD: results.reduce((s,r) => s + r.gyakushuFires.D, 0),
      gyakushuFiresL: results.reduce((s,r) => s + r.gyakushuFires.L, 0),
      skillUseTotals,
      winsBySkillUse,
    },
  };
}

// Corner control needs full play-through; reuse stored handD/handL for corners by replaying not needed.
// Instead, we compute corners from the FINAL board... but we don't store it. Rerun with instrumentation.
function withCornerStats(label, opts) {
  const { newGame, makeRng, getValidMoves, makeMove, aiPickAction,
          execVanish, fireGyakushuAt, passTurn, countScores } = require('./simulator');
  const corners = [];
  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = SEED_BASE + i * 7919;
    const rand = makeRng(seed);
    const state = newGame(rand, opts);
    while (!state.ended) {
      const me = state.turn;
      const action = aiPickAction(state, me);
      if (action.type === 'pass') passTurn(state);
      else if (action.type === 'vanish') execVanish(state, action.r, action.c);
      else if (action.type === 'gyakushu') fireGyakushuAt(state, action.r, action.c);
      else makeMove(state, action.r, action.c, action.skillIdx);
      if (state.stats.moves.D + state.stats.moves.L > 200) break;
    }
    let cD = 0, cL = 0;
    for (const [r, c] of cornerCells) {
      if (state.board[r][c].color === 'D') cD++;
      else if (state.board[r][c].color === 'L') cL++;
    }
    corners.push({ D: cD, L: cL });
  }
  return {
    avgCornersD: mean(corners.map(x => x.D)),
    avgCornersL: mean(corners.map(x => x.L)),
    cornerHist: corners,
  };
}

// ---- Run all 3 configs ----
const baseline = runConfig('Baseline', {});
const variantA = runConfig('Variant A (Black handSize=4)', { handSize: { D: 4, L: 3 } });
const variantB = runConfig('Variant B (Black guaranteed strong card)', { guaranteeStrongForBlack: true });

const baselineCorners = withCornerStats('Baseline', {});
const variantACorners = withCornerStats('Variant A', { handSize: { D: 4, L: 3 } });
const variantBCorners = withCornerStats('Variant B', { guaranteeStrongForBlack: true });

baseline.summary.avgCornersD = baselineCorners.avgCornersD;
baseline.summary.avgCornersL = baselineCorners.avgCornersL;
variantA.summary.avgCornersD = variantACorners.avgCornersD;
variantA.summary.avgCornersL = variantACorners.avgCornersL;
variantB.summary.avgCornersD = variantBCorners.avgCornersD;
variantB.summary.avgCornersL = variantBCorners.avgCornersL;

// ---- Save ----
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'variant_baseline.json'),
  JSON.stringify({ label: baseline.label, summary: baseline.summary, results: baseline.results }, null, 2));
fs.writeFileSync(path.join(outDir, 'variant_a.json'),
  JSON.stringify({ label: variantA.label, summary: variantA.summary, results: variantA.results }, null, 2));
fs.writeFileSync(path.join(outDir, 'variant_b.json'),
  JSON.stringify({ label: variantB.label, summary: variantB.summary, results: variantB.results }, null, 2));

// ---- Pretty print ----
function row(label, ...vals) { return `| ${label.padEnd(28)} | ${vals.map(v => String(v).padStart(10)).join(' | ')} |`; }
console.log('\n=== Comparison ===');
console.log('| Metric                       | Baseline   | Variant A  | Variant B  |');
console.log('|------------------------------|------------|------------|------------|');
console.log(row('Black wins',          baseline.summary.blackWins, variantA.summary.blackWins, variantB.summary.blackWins));
console.log(row('White wins',          baseline.summary.whiteWins, variantA.summary.whiteWins, variantB.summary.whiteWins));
console.log(row('Draws',               baseline.summary.draws,     variantA.summary.draws,     variantB.summary.draws));
console.log(row('Black win rate',      pct(baseline.summary.blackWinRate), pct(variantA.summary.blackWinRate), pct(variantB.summary.blackWinRate)));
console.log(row('Avg score D',         baseline.summary.avgScoreD.toFixed(1), variantA.summary.avgScoreD.toFixed(1), variantB.summary.avgScoreD.toFixed(1)));
console.log(row('Avg score L',         baseline.summary.avgScoreL.toFixed(1), variantA.summary.avgScoreL.toFixed(1), variantB.summary.avgScoreL.toFixed(1)));
console.log(row('Avg |margin|',        baseline.summary.avgMargin.toFixed(1), variantA.summary.avgMargin.toFixed(1), variantB.summary.avgMargin.toFixed(1)));
console.log(row('Tight ≤5',            baseline.summary.marginDistribution.tight_le5, variantA.summary.marginDistribution.tight_le5, variantB.summary.marginDistribution.tight_le5));
console.log(row('Blowout >15',         baseline.summary.marginDistribution.blowout_gt15, variantA.summary.marginDistribution.blowout_gt15, variantB.summary.marginDistribution.blowout_gt15));
console.log(row('Avg max chain',       baseline.summary.avgMaxChain.toFixed(2), variantA.summary.avgMaxChain.toFixed(2), variantB.summary.avgMaxChain.toFixed(2)));
console.log(row('Max chain overall',   baseline.summary.maxChainOverall, variantA.summary.maxChainOverall, variantB.summary.maxChainOverall));
console.log(row('Long chains ≥3',      baseline.summary.longChains_ge3, variantA.summary.longChains_ge3, variantB.summary.longChains_ge3));
console.log(row('Long chains ≥5',      baseline.summary.longChains_ge5, variantA.summary.longChains_ge5, variantB.summary.longChains_ge5));
console.log(row('Avg corners D',       baseline.summary.avgCornersD.toFixed(2), variantA.summary.avgCornersD.toFixed(2), variantB.summary.avgCornersD.toFixed(2)));
console.log(row('Avg corners L',       baseline.summary.avgCornersL.toFixed(2), variantA.summary.avgCornersL.toFixed(2), variantB.summary.avgCornersL.toFixed(2)));
console.log(row('Avg turns',           baseline.summary.avgTurns.toFixed(1), variantA.summary.avgTurns.toFixed(1), variantB.summary.avgTurns.toFixed(1)));
console.log(row('Errors',              baseline.summary.gamesWithErrors, variantA.summary.gamesWithErrors, variantB.summary.gamesWithErrors));
console.log(row('Bakudan explosions',  baseline.summary.bakudanExplosions, variantA.summary.bakudanExplosions, variantB.summary.bakudanExplosions));
console.log(row('Vanish D / L',        baseline.summary.vanishUsesD + '/' + baseline.summary.vanishUsesL, variantA.summary.vanishUsesD + '/' + variantA.summary.vanishUsesL, variantB.summary.vanishUsesD + '/' + variantB.summary.vanishUsesL));
console.log(row('Gyakushu D / L',      baseline.summary.gyakushuFiresD + '/' + baseline.summary.gyakushuFiresL, variantA.summary.gyakushuFiresD + '/' + variantA.summary.gyakushuFiresL, variantB.summary.gyakushuFiresD + '/' + variantB.summary.gyakushuFiresL));
console.log(row('Passes D / L',        baseline.summary.passesD + '/' + baseline.summary.passesL, variantA.summary.passesD + '/' + variantA.summary.passesL, variantB.summary.passesD + '/' + variantB.summary.passesL));

// Skill use totals row
console.log('\n--- Skill activation totals ---');
console.log('| Skill      | Baseline   | Variant A  | Variant B  |');
for (const k of FULL_DECK) {
  console.log(`| ${k.padEnd(10)} | ${String(baseline.summary.skillUseTotals[k]||0).padStart(10)} | ${String(variantA.summary.skillUseTotals[k]||0).padStart(10)} | ${String(variantB.summary.skillUseTotals[k]||0).padStart(10)} |`);
}

// Win rate when consumed
console.log('\n--- Black win rate when D consumed each skill ---');
console.log('| Skill      | Baseline   | Variant A  | Variant B  |');
for (const k of FULL_DECK) {
  function f(c) {
    const w = c.summary.winsBySkillUse[k];
    return w.D_use_total ? `${(w.D_use_D_win/w.D_use_total*100).toFixed(0)}% (${w.D_use_total})` : '-';
  }
  console.log(`| ${k.padEnd(10)} | ${f(baseline).padStart(10)} | ${f(variantA).padStart(10)} | ${f(variantB).padStart(10)} |`);
}

console.log('\n=== Files ===');
console.log(`  ${path.join(outDir, 'variant_baseline.json')}`);
console.log(`  ${path.join(outDir, 'variant_a.json')}`);
console.log(`  ${path.join(outDir, 'variant_b.json')}`);
