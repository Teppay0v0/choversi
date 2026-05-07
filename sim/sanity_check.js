// Spot-check sanity: dump first few moves of a single game to confirm
// the simulator behaves like game.html (initial board, valid moves, abilities).
'use strict';
const { newGame, makeRng, getValidMoves, makeMove, aiPickAction, execVanish, fireGyakushuAt, passTurn, countScores, ABILITIES } = require('./simulator');

const rand = makeRng(42);
const state = newGame(rand);

function showBoard(s) {
  let out = '   a b c d e f g h\n';
  for (let r = 0; r < 8; r++) {
    out += `${r+1}  `;
    for (let c = 0; c < 8; c++) {
      const cell = s.board[r][c];
      let ch = '·';
      if (cell.color === 'D') ch = cell.skill ? 'D' : '●';
      else if (cell.color === 'L') ch = cell.skill ? 'L' : '○';
      out += ch + ' ';
    }
    out += '\n';
  }
  return out;
}

console.log('=== Initial ===');
console.log(showBoard(state));
console.log('Black hand top3:', state.hands.D.slice(0,3).map(h => h.skill));
console.log('White hand top3:', state.hands.L.slice(0,3).map(h => h.skill));
console.log('Black valid moves:', getValidMoves(state, 'D').map(([r,c]) => String.fromCharCode(97+c)+(r+1)));
console.log('Expected for opening Black: c4, d3, e6, f5 (uppercase letters in cols)\n');

let step = 0;
while (!state.ended && step < 8) {
  step++;
  const me = state.turn;
  const action = aiPickAction(state, me);
  let desc = '';
  if (action.type === 'pass') {
    desc = 'PASS';
    passTurn(state);
  } else if (action.type === 'vanish') {
    desc = `VANISH @ ${String.fromCharCode(97+action.c)}${action.r+1}`;
    execVanish(state, action.r, action.c);
  } else if (action.type === 'gyakushu') {
    desc = `GYAKUSHU FIRE @ ${String.fromCharCode(97+action.c)}${action.r+1}`;
    fireGyakushuAt(state, action.r, action.c);
  } else {
    const skillName = action.skillIdx >= 0 ? ABILITIES[state.hands[me][action.skillIdx].skill].name : '通常石';
    desc = `${skillName} @ ${String.fromCharCode(97+action.c)}${action.r+1}`;
    makeMove(state, action.r, action.c, action.skillIdx);
  }
  const s = countScores(state);
  console.log(`Step ${step} (${me === 'D' ? '黒' : '白'}): ${desc}  | scores D=${s.D} L=${s.L}  chainLen=${state.stats.currentMoveChain}`);
}

console.log('\n=== After 8 plies ===');
console.log(showBoard(state));
