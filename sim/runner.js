// Run 30 AI-vs-AI Choversi games, collect stats, save raw + summary.
'use strict';
const fs = require('fs');
const path = require('path');
const { playGame, ABILITIES, FULL_DECK } = require('./simulator');

const NUM_GAMES = 30;
const SEED_BASE = 42;

const results = [];
for (let i = 0; i < NUM_GAMES; i++) {
  const seed = SEED_BASE + i * 7919; // distinct seeds
  const r = playGame(seed);
  results.push(r);
}

// ---- Aggregate ----
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

const summary = {
  numGames: results.length,
  blackWins: results.filter(r => r.winner === 'D').length,
  whiteWins: results.filter(r => r.winner === 'L').length,
  draws:     results.filter(r => r.winner === 'draw').length,
  truncatedGames: results.filter(r => r.truncated).length,
  gamesWithErrors: results.filter(r => r.errors.length > 0).length,
  errors: results.flatMap((r,i) => r.errors.map(e => ({ game: i+1, ...e }))),
  avgTurns: mean(results.map(r => r.turns)),
  medianTurns: median(results.map(r => r.turns)),
  scoreMargin: {
    avg: mean(results.map(r => Math.abs(r.score.D - r.score.L))),
    distribution: {
      tight_le5: results.filter(r => Math.abs(r.score.D - r.score.L) <= 5).length,
      mid_6to15: results.filter(r => {const m=Math.abs(r.score.D-r.score.L); return m>=6 && m<=15;}).length,
      blowout_gt15: results.filter(r => Math.abs(r.score.D - r.score.L) > 15).length,
    },
  },
  avgFinalScore: {
    D: mean(results.map(r => r.score.D)),
    L: mean(results.map(r => r.score.L)),
  },
  avgMoves: {
    D: mean(results.map(r => r.moves.D)),
    L: mean(results.map(r => r.moves.L)),
  },
  totalPasses: {
    D: results.reduce((s,r) => s + r.passes.D, 0),
    L: results.reduce((s,r) => s + r.passes.L, 0),
  },
  totalChains: results.reduce((s,r) => s + r.chainCount, 0),
  maxChainOverall: Math.max(...results.map(r => r.maxChain)),
  avgMaxChainPerGame: mean(results.map(r => r.maxChain)),
  longChains_ge3: results.reduce((s,r) => s + r.chains.filter(c => c >= 3).length, 0),
  longChains_ge5: results.reduce((s,r) => s + r.chains.filter(c => c >= 5).length, 0),
  // ability-level counts
  skillUseTotals: {},
  // per-color use rates: from final hands, count cards used by each side
  skillUsageByColor: {},
  bakudanExplosions: results.reduce((s,r) => s + r.bakudanExplosions, 0),
  zoshokuSpawns: results.reduce((s,r) => s + r.zoshokuSpawns, 0),
  hantenBlocks: results.reduce((s,r) => s + r.hantenBlocks, 0),
  kyozoTriggered: results.reduce((s,r) => s + r.kyozoTriggered, 0),
  vanishUsesD: results.reduce((s,r) => s + r.vanishUses.D, 0),
  vanishUsesL: results.reduce((s,r) => s + r.vanishUses.L, 0),
  gyakushuFiresD: results.reduce((s,r) => s + r.gyakushuFires.D, 0),
  gyakushuFiresL: results.reduce((s,r) => s + r.gyakushuFires.L, 0),
};

// Total skill uses (all ability fires, including chain-triggered)
for (const r of results) {
  for (const k of Object.keys(r.skillUses)) {
    summary.skillUseTotals[k] = (summary.skillUseTotals[k] || 0) + r.skillUses[k];
  }
}

// Per-color: scan hand[].used to determine the skills each player CONSUMED (drew + played)
// (Skills sitting beyond hand-3 in deck and never reached are 'used:false'.)
for (const ab of FULL_DECK) {
  summary.skillUsageByColor[ab] = { D_consumed: 0, L_consumed: 0 };
}
for (const r of results) {
  for (const card of r.handD) if (card.used) summary.skillUsageByColor[card.s].D_consumed++;
  for (const card of r.handL) if (card.used) summary.skillUsageByColor[card.s].L_consumed++;
}

// First-3-in-hand availability — proxy for "drawable rate"
const handAvailability = {};
for (const ab of FULL_DECK) handAvailability[ab] = { D_top3: 0, L_top3: 0 };
for (const r of results) {
  // We don't have initial deck order saved; we have final hand order and used flags.
  // Approximate "drawable" as: card was used (definitely accessible).
  // Already counted above.
}

// Win rate by color when using each skill (consumed)
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
summary.winsBySkillUse = winsBySkillUse;

// ---- Output ----
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'raw.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

// ---- Console pretty print ----
console.log('==== Choversi AI vs AI: 30 games ====');
console.log(`Black wins: ${summary.blackWins} (${pct(summary.blackWins/30)})`);
console.log(`White wins: ${summary.whiteWins} (${pct(summary.whiteWins/30)})`);
console.log(`Draws:      ${summary.draws}`);
console.log(`Truncated:  ${summary.truncatedGames}`);
console.log(`Errors:     ${summary.gamesWithErrors} games (${summary.errors.length} total)`);
console.log(`Avg turns:  ${summary.avgTurns.toFixed(1)}  (median ${summary.medianTurns})`);
console.log(`Avg score:  D=${summary.avgFinalScore.D.toFixed(1)}  L=${summary.avgFinalScore.L.toFixed(1)}`);
console.log(`Avg margin: ${summary.scoreMargin.avg.toFixed(1)}  (tight≤5: ${summary.scoreMargin.distribution.tight_le5}, 6-15: ${summary.scoreMargin.distribution.mid_6to15}, blowout>15: ${summary.scoreMargin.distribution.blowout_gt15})`);
console.log(`Avg moves:  D=${summary.avgMoves.D.toFixed(1)}  L=${summary.avgMoves.L.toFixed(1)}`);
console.log(`Passes:     D=${summary.totalPasses.D}  L=${summary.totalPasses.L}`);
console.log(`Chains:     total=${summary.totalChains}  long≥3=${summary.longChains_ge3}  long≥5=${summary.longChains_ge5}  max=${summary.maxChainOverall}  avgMax/game=${summary.avgMaxChainPerGame.toFixed(2)}`);
console.log(`Bakudan explosions: ${summary.bakudanExplosions}`);
console.log(`Zoshoku spawns:     ${summary.zoshokuSpawns}`);
console.log(`Hanten blocks:      ${summary.hantenBlocks}`);
console.log(`Kyozo triggered:    ${summary.kyozoTriggered}`);
console.log(`Vanish:    D=${summary.vanishUsesD}  L=${summary.vanishUsesL}`);
console.log(`Gyakushu fires: D=${summary.gyakushuFiresD}  L=${summary.gyakushuFiresL}`);

console.log('\n--- Skill activation totals (all triggers, incl. chain) ---');
for (const k of Object.keys(summary.skillUseTotals).sort()) {
  console.log(`  ${k.padEnd(10)} ${summary.skillUseTotals[k]}`);
}

console.log('\n--- Skill consumption by color (card.used in hand[]) ---');
const headers = ['skill', 'D used', 'L used', 'totalUses'];
console.log(headers.join('\t'));
for (const k of FULL_DECK) {
  const row = [k, summary.skillUsageByColor[k].D_consumed, summary.skillUsageByColor[k].L_consumed,
               summary.skillUsageByColor[k].D_consumed + summary.skillUsageByColor[k].L_consumed];
  console.log(row.join('\t'));
}

console.log('\n--- Win rate when skill consumed (per side) ---');
console.log('skill\tD_wr\tL_wr');
for (const k of FULL_DECK) {
  const w = winsBySkillUse[k];
  const dwr = w.D_use_total ? (w.D_use_D_win/w.D_use_total*100).toFixed(0) + '%' : '-';
  const lwr = w.L_use_total ? (w.L_use_L_win/w.L_use_total*100).toFixed(0) + '%' : '-';
  console.log(`${k.padEnd(10)}\t${dwr} (${w.D_use_total})\t${lwr} (${w.L_use_total})`);
}

if (summary.errors.length > 0) {
  console.log('\n--- Errors ---');
  for (const e of summary.errors) console.log(JSON.stringify(e));
}

console.log(`\nRaw → ${path.join(outDir, 'raw.json')}`);
console.log(`Summary → ${path.join(outDir, 'summary.json')}`);
