// Deeper analysis: corner control, bakudan inertness, white-bias source.
'use strict';
const fs = require('fs');
const path = require('path');
const { playGame, makeRng, newGame, getValidMoves, makeMove, aiPickAction,
        execVanish, fireGyakushuAt, passTurn, countScores } = require('./simulator');

// 1) Re-run 30 games but with EXTRA stats: corners taken, bakudan-fired-or-not, last-move-color
const NUM_GAMES = 30;
const SEED_BASE = 42;

const cornerCells = [[0,0],[0,7],[7,0],[7,7]];

function playInstrumented(seed) {
  const rand = makeRng(seed);
  const state = newGame(rand);
  let firstCornerTaker = null;
  const cornersAtEnd = { D: 0, L: 0 };
  const bakudanPlacements = []; // { color, fired:bool }

  // We need to detect when bakudan is placed
  let prevBakudanCells = new Set();

  while (!state.ended) {
    const me = state.turn;
    const action = aiPickAction(state, me);
    if (action.type === 'pass') passTurn(state);
    else if (action.type === 'vanish') execVanish(state, action.r, action.c);
    else if (action.type === 'gyakushu') fireGyakushuAt(state, action.r, action.c);
    else makeMove(state, action.r, action.c, action.skillIdx);

    // Check first corner taker
    if (firstCornerTaker === null) {
      for (const [r, c] of cornerCells) {
        if (state.board[r][c].color) {
          firstCornerTaker = state.board[r][c].color;
          break;
        }
      }
    }

    if (state.ended) break;
    // Safety
    if (state.stats.moves.D + state.stats.moves.L > 200) break;
  }

  // Final corners
  for (const [r, c] of cornerCells) {
    if (state.board[r][c].color === 'D') cornersAtEnd.D++;
    else if (state.board[r][c].color === 'L') cornersAtEnd.L++;
  }

  // Bakudan still on board (didn't fire) per color
  let bakudanRemaining = { D: 0, L: 0 };
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const cell = state.board[r][c];
    if (cell.skill === 'bakudan') {
      bakudanRemaining[cell.owner]++;
    }
  }

  return {
    seed,
    winner: countScores(state).D > countScores(state).L ? 'D' :
            countScores(state).L > countScores(state).D ? 'L' : 'draw',
    score: countScores(state),
    moves: state.stats.moves,
    chains: state.stats.chains,
    maxChain: state.stats.maxChain,
    bakudanExplosions: state.stats.bakudanExplosions,
    bakudanRemaining,
    cornersAtEnd,
    firstCornerTaker,
    handD: state.hands.D.map(h => ({ s: h.skill, used: h.used })),
    handL: state.hands.L.map(h => ({ s: h.skill, used: h.used })),
  };
}

const out = [];
for (let i = 0; i < NUM_GAMES; i++) {
  out.push(playInstrumented(SEED_BASE + i * 7919));
}

// Analysis
function pct(x) { return (x*100).toFixed(1) + '%'; }
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

console.log('\n=== Corner control vs winner ===');
let firstCornerDWins = 0, firstCornerDTotal = 0;
let firstCornerLWins = 0, firstCornerLTotal = 0;
for (const g of out) {
  if (g.firstCornerTaker === 'D') {
    firstCornerDTotal++;
    if (g.winner === 'D') firstCornerDWins++;
  } else if (g.firstCornerTaker === 'L') {
    firstCornerLTotal++;
    if (g.winner === 'L') firstCornerLWins++;
  }
}
console.log(`First corner taken by Black: ${firstCornerDTotal} games, Black wins: ${firstCornerDWins} (${firstCornerDTotal? pct(firstCornerDWins/firstCornerDTotal):'-'})`);
console.log(`First corner taken by White: ${firstCornerLTotal} games, White wins: ${firstCornerLWins} (${firstCornerLTotal? pct(firstCornerLWins/firstCornerLTotal):'-'})`);
console.log(`No corners reached: ${out.filter(g => g.firstCornerTaker === null).length}`);

console.log('\n=== Corner counts at end ===');
const avgCornersD = mean(out.map(g => g.cornersAtEnd.D));
const avgCornersL = mean(out.map(g => g.cornersAtEnd.L));
console.log(`Avg corners owned at end: D=${avgCornersD.toFixed(2)}  L=${avgCornersL.toFixed(2)}`);

console.log('\n=== Bakudan inertness ===');
let bakudanInertGames = 0;
let bakudanD_inert = 0, bakudanL_inert = 0;
let bakudanD_seen = 0, bakudanL_seen = 0;
for (const g of out) {
  if (g.bakudanRemaining.D + g.bakudanRemaining.L > 0) bakudanInertGames++;
  // count bakudan cards consumed at all
  const dUsedBakudan = g.handD.find(h => h.s === 'bakudan' && h.used);
  const lUsedBakudan = g.handL.find(h => h.s === 'bakudan' && h.used);
  if (dUsedBakudan) {
    bakudanD_seen++;
    if (g.bakudanRemaining.D > 0) bakudanD_inert++;
  }
  if (lUsedBakudan) {
    bakudanL_seen++;
    if (g.bakudanRemaining.L > 0) bakudanL_inert++;
  }
}
console.log(`Games with at least 1 unfired bakudan on board at end: ${bakudanInertGames}/${NUM_GAMES} (${pct(bakudanInertGames/NUM_GAMES)})`);
console.log(`  Black bakudan placed but never fired: ${bakudanD_inert}/${bakudanD_seen}  (${bakudanD_seen? pct(bakudanD_inert/bakudanD_seen):'-'})`);
console.log(`  White bakudan placed but never fired: ${bakudanL_inert}/${bakudanL_seen}  (${bakudanL_seen? pct(bakudanL_inert/bakudanL_seen):'-'})`);

console.log('\n=== Score breakdown (D vs L) ===');
let dWinDelta = []; let lWinDelta = [];
for (const g of out) {
  const delta = g.score.L - g.score.D;
  if (g.winner === 'D') dWinDelta.push(-delta);
  if (g.winner === 'L') lWinDelta.push(delta);
}
console.log(`Avg margin when Black wins: ${dWinDelta.length? mean(dWinDelta).toFixed(1):'-'} (${dWinDelta.length} games)`);
console.log(`Avg margin when White wins: ${lWinDelta.length? mean(lWinDelta).toFixed(1):'-'} (${lWinDelta.length} games)`);

console.log('\n=== Total chains by length ===');
const chainHist = {};
for (const g of out) for (const c of g.chains) chainHist[c] = (chainHist[c] || 0) + 1;
for (const k of Object.keys(chainHist).sort((a,b)=>+a-+b)) {
  console.log(`  chain length ${k}: ${chainHist[k]}`);
}

// Save the deep analysis
fs.writeFileSync(path.join(__dirname, 'output', 'deep.json'), JSON.stringify(out, null, 2));
console.log('\nDeep → ' + path.join(__dirname, 'output', 'deep.json'));
