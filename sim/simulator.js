// Choversi headless simulator — port of game.html logic.
// DOM/animation is stripped; all logic flows synchronously.
// Source-of-truth: ../game.html (initial commit, 2026-05-07).

'use strict';

// ---------------- Seedable RNG (mulberry32) ----------------
function makeRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Constants (mirrors game.html) ----------------
const N = 8;
const DIRS_8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIRS_4 = [[-1,0],[1,0],[0,-1],[0,1]];

const ABILITIES = {
  kyozo:    { name: '虚像',  cost: 1, trigger: 'flipped' },
  zoshoku:  { name: '増殖',  cost: 1, trigger: 'placed'  },
  hanten:   { name: '反転',  cost: 1, trigger: 'flipped' },
  gyakushu: { name: '逆襲',  cost: 2, trigger: 'manual'  },
  muko:     { name: '無効',  cost: 2, trigger: 'placed'  },
  hogeki:   { name: '砲撃',  cost: 3, trigger: 'placed'  },
  bakudan:  { name: '爆弾',  cost: 3, trigger: 'flipped' },
  shoshitsu:{ name: '消滅',  cost: 3, trigger: 'special' },
  tanchi:   { name: '探知',  cost: 3, trigger: 'placed'  },
};

const FULL_DECK = [
  'kyozo', 'zoshoku', 'hanten',
  'gyakushu', 'muko',
  'hogeki', 'bakudan', 'shoshitsu', 'tanchi',
];
const HAND_SIZE = 3;

const POS_WEIGHTS = [
  [120,-20, 20,  5,  5, 20,-20,120],
  [-20,-40, -5, -5, -5, -5,-40,-20],
  [ 20, -5, 15,  3,  3, 15, -5, 20],
  [  5, -5,  3,  3,  3,  3, -5,  5],
  [  5, -5,  3,  3,  3,  3, -5,  5],
  [ 20, -5, 15,  3,  3, 15, -5, 20],
  [-20,-40, -5, -5, -5, -5,-40,-20],
  [120,-20, 20,  5,  5, 20,-20,120],
];

const SKILL_BONUS = {
  bakudan: 18, hogeki: 15, gyakushu: 14,
  shoshitsu: 12, muko: 8,
  // 探知は情報カードに変更（Phase 1）
  tanchi: 5,
  zoshoku: 4, hanten: 3, kyozo: 1,
};

// ---------------- Helpers ----------------
function inb(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
function emptyCell() { return { color: null, skill: null, owner: null, hantenUsed: false }; }
function stone(color, skill = null, owner = null) {
  return { color, skill, owner: owner || color, hantenUsed: false };
}
function coord(r, c) { return `${String.fromCharCode(97 + c)}${r + 1}`; }
function labelOf(c) { return c === 'D' ? '黒' : '白'; }

function shuffleDeck(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- Game state ----------------
function createBoard() {
  const b = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(emptyCell());
    b.push(row);
  }
  b[3][3] = stone('L'); b[3][4] = stone('D');
  b[4][3] = stone('D'); b[4][4] = stone('L');
  return b;
}

function newGame(rand, opts = {}) {
  // opts:
  //   handSize: { D, L }   per-color hand size (default { D: 3, L: 3 })
  //   guaranteeStrongForBlack: bool — Variant B: ensure one of bakudan/tanchi/hogeki
  //                                    sits in black's initial top-3 (white untouched)
  const handSize = {
    D: opts.handSize?.D ?? HAND_SIZE,
    L: opts.handSize?.L ?? HAND_SIZE,
  };

  const blackDeck = shuffleDeck(FULL_DECK, rand);
  if (opts.guaranteeStrongForBlack) {
    const STRONG = ['bakudan', 'tanchi', 'hogeki'];
    const top = blackDeck.slice(0, handSize.D);
    const hasStrong = top.some(s => STRONG.includes(s));
    if (!hasStrong) {
      // Pick one of the three uniformly via the seeded RNG, then swap it into a random top slot.
      const pickIdx = Math.floor(rand() * STRONG.length);
      const pick = STRONG[pickIdx];
      const fromIdx = blackDeck.indexOf(pick);
      const toIdx = Math.floor(rand() * handSize.D);
      [blackDeck[fromIdx], blackDeck[toIdx]] = [blackDeck[toIdx], blackDeck[fromIdx]];
    }
  }
  const whiteDeck = shuffleDeck(FULL_DECK, rand);

  return {
    board: createBoard(),
    turn: 'D',
    hands: {
      D: blackDeck.map(s => ({ skill: s, used: false })),
      L: whiteDeck.map(s => ({ skill: s, used: false })),
    },
    handSize,
    cascadeBonus: opts.cascadeBonus !== false, // default ON
    rand,
    selectedSkill: -1,
    pendingAction: null,
    chainCount: 0,
    peakChainThisMove: 0,
    triggeredThisChain: new Set(),
    nullifiedCells: new Set(),
    revealedToD: new Set(),    // Phase 1: 視界（D側が見えている相手異能）
    revealedToL: new Set(),
    firedAbilities: { D: new Set(), L: new Set() }, // Phase 2: 発動済み異能の集合
    aiLevel: opts.aiLevel || 50,  // sim default: LV50（Phase 2 機能を試す）
    // 色別レベル（指定があればこちらを優先）
    aiLevels: opts.aiLevels || null,  // 例 { D: 60, L: 80 }
    ended: false,
    passes: 0,
    // sim-only stats
    stats: {
      moves: { D: 0, L: 0 },
      skillUses: {},
      chains: [],          // length of each chain (>=1 ability fired)
      maxChain: 0,
      currentMoveChain: 0, // running chain count for current move
      passes: { D: 0, L: 0 },
      vanishUses: { D: 0, L: 0 },
      gyakushuFires: { D: 0, L: 0 },
      bakudanExplosions: 0,
      zoshokuSpawns: 0,
      hantenBlocks: 0,
      kyozoTriggered: 0,
      events: [],
    },
    rand,
  };
}

function getActiveHand(state, player) {
  const size = state.handSize?.[player] ?? HAND_SIZE;
  return state.hands[player]
    .map((c, i) => ({ ...c, idx: i }))
    .filter(c => !c.used)
    .slice(0, size);
}

function countScores(state) {
  let D = 0, L = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (state.board[r][c].color === 'D') D++;
    else if (state.board[r][c].color === 'L') L++;
  }
  return { D, L };
}

// ---------------- Reversi ----------------
function getFlipsForPlace(state, r, c, color) {
  const flips = [];
  const opp = color === 'D' ? 'L' : 'D';
  for (const [dr, dc] of DIRS_8) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inb(nr, nc)) {
      const cell = state.board[nr][nc];
      if (cell.color === opp) line.push([nr, nc]);
      else if (cell.color === color) { flips.push(...line); break; }
      else break;
      nr += dr; nc += dc;
    }
  }
  return flips;
}

function getValidMoves(state, color) {
  const moves = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (state.board[r][c].color === null) {
      if (getFlipsForPlace(state, r, c, color).length > 0) moves.push([r, c]);
    }
  }
  return moves;
}

// ---------------- Chain processing ----------------
function processFlipQueue(state, initial, byColor) {
  const queue = [...initial];
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const newFlips = flipOne(state, r, c, byColor);
    queue.push(...newFlips);
  }
}

// カムバック型カスケード：負けている時のみ発動
function applyCascadeBonus(state, byColor, peak) {
  if (!state.cascadeBonus) return 0;
  // 自分の石数が相手より多ければボーナスなし（勝ってる時は不要）
  const scores = countScores(state);
  const myScore = byColor === 'D' ? scores.D : scores.L;
  const oppScore = byColor === 'D' ? scores.L : scores.D;
  if (myScore > oppScore) return 0;
  let count = 0;
  if (peak >= 5) count = 4;
  else if (peak >= 4) count = 2;
  else if (peak >= 3) count = 1;
  if (count === 0) return 0;

  const opp = byColor === 'D' ? 'L' : 'D';
  const targets = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (state.board[r][c].color === opp) targets.push([r, c]);
  }
  if (targets.length === 0) return 0;

  // RNG-based shuffle (deterministic via state.rand)
  const shuffled = [...targets];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(state.rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const toConvert = shuffled.slice(0, Math.min(count, shuffled.length));
  for (const [r, c] of toConvert) {
    state.board[r][c].color = byColor;
    state.board[r][c].owner = byColor;
  }
  state.stats.cascadeBonuses = (state.stats.cascadeBonuses || 0) + 1;
  state.stats.cascadeStones = (state.stats.cascadeStones || 0) + toConvert.length;
  state.stats.events.push({ type: 'cascade_bonus', peak, converted: toConvert.length, byColor });
  return toConvert.length;
}

function flipOne(state, r, c, byColor) {
  const cell = state.board[r][c];
  if (!cell || cell.color === null) return [];
  const key = `${r},${c}`;

  // 反転(hanten): 1回だけスキップ
  if (cell.skill === 'hanten' && !cell.hantenUsed && !state.nullifiedCells.has(key)) {
    cell.hantenUsed = true;
    state.triggeredThisChain.add(key);
    state.chainCount++;
    state.stats.currentMoveChain++;
    state.stats.hantenBlocks++;
    state.stats.events.push({ type: 'hanten_block', r, c });
    return [];
  }

  // Invert color
  cell.color = cell.color === 'D' ? 'L' : 'D';

  // Fire flipped-trigger ability
  if (cell.skill && !state.triggeredThisChain.has(key) && !state.nullifiedCells.has(key)) {
    const ab = ABILITIES[cell.skill];
    if (ab && ab.trigger === 'flipped') {
      state.triggeredThisChain.add(key);
      state.chainCount++;
      state.stats.currentMoveChain++;
      return fireAbility(state, r, c, cell.skill, cell.color);
    }
  }
  return [];
}

// ---------------- Abilities ----------------
function fireAbility(state, r, c, skillKey, byColor) {
  state.stats.skillUses[skillKey] = (state.stats.skillUses[skillKey] || 0) + 1;
  state.stats.events.push({ type: 'ability', skill: skillKey, r, c, color: byColor });
  // Phase 2: 発動済み異能を追跡
  if (state.firedAbilities && state.firedAbilities[byColor]) {
    state.firedAbilities[byColor].add(skillKey);
  }

  switch (skillKey) {
    case 'kyozo':
      // After firing once, becomes a normal stone (marked nullified to suppress retrigger)
      state.nullifiedCells.add(`${r},${c}`);
      state.stats.kyozoTriggered++;
      return [];

    case 'zoshoku': {
      const empties = [];
      for (const [dr, dc] of DIRS_8) {
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && state.board[nr][nc].color === null) empties.push([nr, nc]);
      }
      if (empties.length > 0) {
        const [tr, tc] = empties[Math.floor(state.rand() * empties.length)];
        state.board[tr][tc] = stone(byColor, null, byColor);
        state.stats.zoshokuSpawns++;
      }
      return [];
    }

    case 'hogeki': {
      const out = [];
      for (const [dr, dc] of DIRS_4) {
        for (let k = 1; k <= 3; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (!inb(nr, nc)) break;
          if (state.board[nr][nc].color !== null) out.push([nr, nc]);
        }
      }
      return out;
    }

    case 'tanchi': {
      // Phase 1: 反転しない・相手の異能石を露出するだけ
      const opp = byColor === 'D' ? 'L' : 'D';
      const revealSet = byColor === 'D' ? state.revealedToD : state.revealedToL;
      for (const [dr, dc] of DIRS_4) {
        for (let k = 1; k <= 3; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (!inb(nr, nc)) break;
          const cell = state.board[nr][nc];
          if (cell.color === opp && cell.skill) revealSet.add(`${nr},${nc}`);
        }
      }
      state.stats.tanchiReveals = (state.stats.tanchiReveals || 0) + 1;
      return [];
    }

    case 'bakudan': {
      const out = [];
      for (const [dr, dc] of DIRS_8) {
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && state.board[nr][nc].color !== null) out.push([nr, nc]);
      }
      // self destruct
      state.board[r][c] = emptyCell();
      state.stats.bakudanExplosions++;
      return out;
    }

    case 'gyakushu': {
      const out = [];
      for (const [dr, dc] of DIRS_8) {
        for (let k = 1; k <= 2; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (!inb(nr, nc)) break;
          if (state.board[nr][nc].color !== null) out.push([nr, nc]);
        }
      }
      return out;
    }

    case 'muko': {
      // 隣接の相手異能石をすべて無効化（マッピング: placed trigger）
      const opp = byColor === 'D' ? 'L' : 'D';
      for (const [dr, dc] of DIRS_8) {
        const nr = r + dr, nc = c + dc;
        if (!inb(nr, nc)) continue;
        const tCell = state.board[nr][nc];
        if (tCell.color === opp && tCell.skill && !state.nullifiedCells.has(`${nr},${nc}`)) {
          state.nullifiedCells.add(`${nr},${nc}`);
        }
      }
      return [];
    }

    default:
      return [];
  }
}

// ---------------- Move execution ----------------
function makeMove(state, r, c, selectedSkillIdx = -1) {
  const turn = state.turn;
  const flips = getFlipsForPlace(state, r, c, turn);
  if (flips.length === 0) return { ok: false, reason: 'invalid_placement' };

  state.chainCount = 0;
  state.stats.currentMoveChain = 0;
  state.triggeredThisChain.clear();

  let placedSkill = null;
  if (selectedSkillIdx >= 0) {
    const card = state.hands[turn][selectedSkillIdx];
    if (!card || card.used) return { ok: false, reason: 'invalid_skill' };
    placedSkill = card.skill;
    state.hands[turn][selectedSkillIdx].used = true;
  }
  state.board[r][c] = stone(turn, placedSkill, turn);

  let extraFlips = [];
  if (placedSkill && ABILITIES[placedSkill].trigger === 'placed') {
    state.chainCount++;
    state.stats.currentMoveChain++;
    extraFlips = fireAbility(state, r, c, placedSkill, turn);
  }

  processFlipQueue(state, [...flips, ...extraFlips], turn);

  // カスケードボーナス
  if (state.stats.currentMoveChain >= 3) {
    applyCascadeBonus(state, turn, state.stats.currentMoveChain);
  }

  // Record chain stats
  if (state.stats.currentMoveChain > 0) {
    state.stats.chains.push(state.stats.currentMoveChain);
    if (state.stats.currentMoveChain > state.stats.maxChain) {
      state.stats.maxChain = state.stats.currentMoveChain;
    }
  }

  state.stats.moves[turn]++;
  state.passes = 0;
  switchTurn(state);
  return { ok: true, placedSkill, chainLength: state.stats.currentMoveChain };
}

function execVanish(state, r, c) {
  const cell = state.board[r][c];
  const turn = state.turn;
  if (!cell || cell.color === null || cell.color === turn) {
    return { ok: false, reason: 'invalid_vanish_target' };
  }
  const idx = state.hands[turn].findIndex(s => s.skill === 'shoshitsu' && !s.used);
  if (idx < 0) return { ok: false, reason: 'no_shoshitsu_card' };
  state.hands[turn][idx].used = true;
  state.board[r][c] = emptyCell();
  state.stats.skillUses['shoshitsu'] = (state.stats.skillUses['shoshitsu'] || 0) + 1;
  state.stats.vanishUses[turn]++;
  state.stats.events.push({ type: 'vanish', r, c, color: turn });
  state.passes = 0;  // bug fix: 行動したのでリセット
  state.stats.moves[turn]++;
  switchTurn(state);
  return { ok: true };
}

function isGyakushuEligible(state, r, c, color) {
  const cell = state.board[r][c];
  if (!cell || cell.skill !== 'gyakushu' || cell.owner !== color) return false;
  if (state.nullifiedCells.has(`${r},${c}`)) return false;
  let blocked = 0;
  for (const [dr, dc] of DIRS_4) {
    const nr = r + dr, nc = c + dc;
    if (!inb(nr, nc) || state.board[nr][nc].color !== null) blocked++;
  }
  return blocked >= 3;
}

function findEligibleGyakushu(state, color) {
  const list = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (isGyakushuEligible(state, r, c, color)) list.push([r, c]);
  }
  return list;
}

function fireGyakushuAt(state, r, c) {
  if (!isGyakushuEligible(state, r, c, state.turn)) {
    return { ok: false, reason: 'not_eligible' };
  }
  const turn = state.turn;
  state.chainCount = 1;
  state.stats.currentMoveChain = 1;
  state.triggeredThisChain.clear();
  const flips = fireAbility(state, r, c, 'gyakushu', turn);
  state.nullifiedCells.add(`${r},${c}`);
  processFlipQueue(state, flips, turn);
  state.stats.gyakushuFires[turn]++;

  // カスケードボーナス
  if (state.stats.currentMoveChain >= 3) {
    applyCascadeBonus(state, turn, state.stats.currentMoveChain);
  }

  if (state.stats.currentMoveChain > 0) {
    state.stats.chains.push(state.stats.currentMoveChain);
    if (state.stats.currentMoveChain > state.stats.maxChain) {
      state.stats.maxChain = state.stats.currentMoveChain;
    }
  }
  state.passes = 0;  // bug fix: 行動したのでリセット
  state.stats.moves[turn]++;
  switchTurn(state);
  return { ok: true };
}

function passTurn(state) {
  state.passes++;
  state.stats.passes[state.turn]++;
  state.stats.events.push({ type: 'pass', color: state.turn });
  if (state.passes >= 2) { state.ended = true; return; }
  switchTurn(state);
  // checkPassOrEnd: if next player also has no moves → auto-pass
  const moves = getValidMoves(state, state.turn);
  if (moves.length === 0) {
    state.passes++;
    state.stats.passes[state.turn]++;
    if (state.passes >= 2) { state.ended = true; return; }
    switchTurn(state);
  }
}

function switchTurn(state) { state.turn = state.turn === 'D' ? 'L' : 'D'; }

// ---------------- AI (parametric on color, show-all=false) ----------------
// ---------------- AI Profile (game.htmlからポート) ----------------
function getAIProfile(lv) {
  const advFactor    = lv >= 85 ? 1 + ((lv - 85) / 14) * 1.2 : 1;
  const weightFactor = lv >= 85 ? 1 + ((lv - 85) / 14) * 5.0 : 1;
  if (lv < 10)  return { skillUseProb: 0.25, posWeightFactor: 0,   threatAvoid: false, lookahead: 0, randomness: 0.95, advFactor, weightFactor, lv };
  if (lv < 20)  return { skillUseProb: 0.5,  posWeightFactor: 0.2, threatAvoid: false, lookahead: 0, randomness: 0.7, advFactor, weightFactor, lv };
  if (lv < 30)  return { skillUseProb: 0.7,  posWeightFactor: 0.5, threatAvoid: false, lookahead: 0, randomness: 0.4, advFactor, weightFactor, lv };
  if (lv < 50)  return { skillUseProb: 1.0,  posWeightFactor: 1.0, threatAvoid: false, lookahead: 0, randomness: 0.0, advFactor, weightFactor, lv };
  if (lv < 70)  return { skillUseProb: 1.0,  posWeightFactor: 1.0, threatAvoid: true,  lookahead: 0, randomness: 0.0, advFactor, weightFactor, lv };
  if (lv < 85)  return { skillUseProb: 1.0,  posWeightFactor: 1.2, threatAvoid: true,  lookahead: 1, randomness: 0.0, advFactor, weightFactor, lv };
  return                { skillUseProb: 1.0,  posWeightFactor: 1.3, threatAvoid: true,  lookahead: 2, randomness: 0.0, advFactor, weightFactor, lv };
}

// 角に隣接する危険マス（X打ち・C打ち）— 角が空いている時のみペナルティ
function isThreatCell(r, c, board) {
  const corners = [[0,0],[0,7],[7,0],[7,7]];
  for (const [cr, cc] of corners) {
    if (board[cr][cc].color !== null) continue;
    const dr = cr === 0 ? 1 : -1, dc = cc === 0 ? 1 : -1;
    if ((r === cr+dr && c === cc) || (r === cr && c === cc+dc) || (r === cr+dr && c === cc+dc)) return true;
  }
  return false;
}

// オセロ基礎ヘルパー
function countMobility(board, color) {
  let count = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color !== null) continue;
    for (const [dr, dc] of DIRS_8) {
      let nr = r + dr, nc = c + dc, found = false;
      while (inb(nr, nc) && board[nr][nc].color && board[nr][nc].color !== color) {
        nr += dr; nc += dc; found = true;
      }
      if (found && inb(nr, nc) && board[nr][nc].color === color) { count++; break; }
    }
  }
  return count;
}
function countFrontier(board, color) {
  let count = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color !== color) continue;
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && board[nr][nc].color === null) { count++; break; }
    }
  }
  return count;
}
function countStableEdgeStones(board, color) {
  const stable = new Set();
  const corners = [[0,0],[0,7],[7,0],[7,7]];
  for (const [cr, cc] of corners) {
    if (board[cr][cc].color !== color) continue;
    stable.add(`${cr},${cc}`);
    const hdir = cc === 0 ? 1 : -1;
    for (let c = cc + hdir; c >= 0 && c < N; c += hdir) {
      if (board[cr][c].color !== color) break;
      stable.add(`${cr},${c}`);
    }
    const vdir = cr === 0 ? 1 : -1;
    for (let r = cr + vdir; r >= 0 && r < N; r += vdir) {
      if (board[r][cc].color !== color) break;
      stable.add(`${r},${cc}`);
    }
  }
  return stable.size;
}

// 1色から見たフラットな盤面評価値（オセロ基礎要素統合 + 鬼神強化）
function evaluateBoardFlat(board, color, profile) {
  const opp = color === 'D' ? 'L' : 'D';
  const wf = profile.weightFactor || 1;
  let score = 0;
  // 終盤判定：石数を直接最大化
  let emptyCount = 0, myCount = 0, oppCount = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color === null) emptyCount++;
    else if (board[r][c].color === color) myCount++;
    else oppCount++;
  }
  if (profile.lv >= 85 && emptyCount <= 12) {
    score += (myCount - oppCount) * 100 * wf;
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color === color)            score += POS_WEIGHTS[r][c] * profile.posWeightFactor;
    else if (board[r][c].color !== null)        score -= POS_WEIGHTS[r][c] * profile.posWeightFactor;
  }
  const myMob = countMobility(board, color);
  const oppMob = countMobility(board, opp);
  score += (myMob - oppMob) * 5 * wf;
  const myFront = countFrontier(board, color);
  const oppFront = countFrontier(board, opp);
  score += (oppFront - myFront) * 2 * wf;
  const myStable = countStableEdgeStones(board, color);
  const oppStable = countStableEdgeStones(board, opp);
  score += (myStable - oppStable) * 10 * wf;
  if (profile.lv >= 95) {
    const corners = [[0,0],[0,7],[7,0],[7,7]];
    const cornerBonus = (15 + ((profile.lv - 95) / 4) * 10) * wf;
    for (const [cr, cc] of corners) {
      if (board[cr][cc].color === color)        score += cornerBonus;
      else if (board[cr][cc].color !== null)    score -= cornerBonus;
    }
  }
  return score;
}

function getValidMovesForBoardSim(board, color) {
  const moves = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color !== null) continue;
    for (const [dr, dc] of DIRS_8) {
      let nr = r + dr, nc = c + dc, found = false;
      while (inb(nr, nc) && board[nr][nc].color && board[nr][nc].color !== color) {
        nr += dr; nc += dc; found = true;
      }
      if (found && inb(nr, nc) && board[nr][nc].color === color) { moves.push([r, c]); break; }
    }
  }
  return moves;
}
function orderMovesSim(moves) {
  return moves.slice().sort((a, b) => POS_WEIGHTS[b[0]][b[1]] - POS_WEIGHTS[a[0]][a[1]]);
}
function minimaxSim(board, depth, alpha, beta, currentColor, me, profile) {
  if (depth === 0) return evaluateBoardFlat(board, me, profile);
  const opp = me === 'D' ? 'L' : 'D';
  const otherColor = currentColor === 'D' ? 'L' : 'D';
  const moves = orderMovesSim(getValidMovesForBoardSim(board, currentColor));
  if (moves.length === 0) {
    const oppMoves = getValidMovesForBoardSim(board, otherColor);
    if (oppMoves.length === 0) {
      // 終局：石数差で完全評価
      let myC = 0, oppC = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (board[r][c].color === me) myC++;
        else if (board[r][c].color === opp) oppC++;
      }
      return (myC - oppC) * 1000;
    }
    return minimaxSim(board, depth, alpha, beta, otherColor, me, profile);
  }
  if (currentColor === me) {
    let best = -Infinity;
    for (const [r, c] of moves) {
      const next = simulatePlaceFlat(board, r, c, currentColor);
      const v = minimaxSim(next, depth - 1, alpha, beta, opp, me, profile);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const [r, c] of moves) {
      const next = simulatePlaceFlat(board, r, c, currentColor);
      const v = minimaxSim(next, depth - 1, alpha, beta, me, me, profile);
      if (v < best) best = v;
      if (v < beta) beta = v;
      if (alpha >= beta) break;
    }
    return best;
  }
}

// 異能込み minimax (LV95+)：両陣営の異能を実際にシミュレートして読む
function minimaxFullSim(state, board, depth, alpha, beta, currentColor, me, profile, usedSetByColor, abilityPliesLeft) {
  if (depth === 0) return evaluateBoardFlat(board, me, profile);
  const opp = me === 'D' ? 'L' : 'D';
  const otherColor = currentColor === 'D' ? 'L' : 'D';
  const moves = orderMovesSim(getValidMovesForBoardSim(board, currentColor));
  if (moves.length === 0) {
    const oppMoves = getValidMovesForBoardSim(board, otherColor);
    if (oppMoves.length === 0) {
      let myC = 0, oppC = 0;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (board[r][c].color === me) myC++;
        else if (board[r][c].color === opp) oppC++;
      }
      return (myC - oppC) * 1000;
    }
    return minimaxFullSim(state, board, depth, alpha, beta, otherColor, me, profile, usedSetByColor, abilityPliesLeft);
  }
  const candidates = [];
  for (const [r, c] of moves) candidates.push({ r, c, skill: null, idx: null });
  if (abilityPliesLeft > 0 && state.hands) {
    const hand = state.hands[currentColor] || [];
    const usedSet = usedSetByColor[currentColor];
    const topMoves = moves.slice(0, 3);
    for (const card of hand) {
      if (!card || card.used) continue;
      if (usedSet.has(card.idx)) continue;
      if (card.skill === 'shoshitsu' || card.skill === 'tanchi' || card.skill === 'kyozo' || card.skill === 'hanten' || card.skill === 'gyakushu' || card.skill === 'muko') continue;
      for (const [r, c] of topMoves) {
        candidates.push({ r, c, skill: card.skill, idx: card.idx });
      }
    }
  }
  const isMax = currentColor === me;
  let best = isMax ? -Infinity : Infinity;
  const nextAbilityPlies = abilityPliesLeft - 1;
  for (const cand of candidates) {
    const next = cand.skill
      ? simulatePlaceWithSkillFlat(board, cand.r, cand.c, currentColor, cand.skill)
      : simulatePlaceFlat(board, cand.r, cand.c, currentColor);
    let newUsedSet = usedSetByColor;
    if (cand.idx !== null) {
      const newSet = new Set(usedSetByColor[currentColor]);
      newSet.add(cand.idx);
      newUsedSet = { D: currentColor === 'D' ? newSet : usedSetByColor.D, L: currentColor === 'L' ? newSet : usedSetByColor.L };
    }
    const v = minimaxFullSim(state, next, depth - 1, alpha, beta, otherColor, me, profile, newUsedSet, nextAbilityPlies);
    if (isMax) {
      if (v > best) best = v;
      if (v > alpha) alpha = v;
    } else {
      if (v < best) best = v;
      if (v < beta) beta = v;
    }
    if (alpha >= beta) break;
  }
  return best;
}
function getSearchDepthSim(lv, emptyCount) {
  if (lv < 85) return 1;
  if (lv < 90) return 3;
  if (lv < 95) return 4;
  if (emptyCount <= 8)  return 10;
  if (emptyCount <= 12) return 9;
  if (emptyCount <= 16) return 7;
  if (lv >= 99) return 6;
  return 5;
}

// 1手打った後の盤面をシミュレート（実stateを変えずに、通常の挟みフリップのみ）
function simulatePlaceFlat(board, r, c, color) {
  const next = board.map(row => row.map(cell => ({ ...cell })));
  const flips = [];
  for (const [dr, dc] of DIRS_8) {
    const line = [];
    for (let k = 1; k < N; k++) {
      const nr = r + dr*k, nc = c + dc*k;
      if (!inb(nr, nc)) break;
      const cell = next[nr][nc];
      if (cell.color === null) break;
      if (cell.color === color) { for (const p of line) flips.push(p); break; }
      line.push([nr, nc]);
    }
  }
  next[r][c] = { color, skill: null, owner: color, hantenUsed: false };
  for (const [fr, fc] of flips) next[fr][fc].color = color;
  return next;
}

// 異能効果込みの盤面シミュレーション（鬼神級の AI 先読み用）
function simulatePlaceWithSkillFlat(board, r, c, color, skill) {
  let next = simulatePlaceFlat(board, r, c, color);
  if (!skill) return next;
  if (skill === 'bakudan') {
    next[r][c] = { color: null, skill: null, owner: null, hantenUsed: false };
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && next[nr][nc].color) next[nr][nc].color = color;
    }
  } else if (skill === 'hogeki') {
    for (const [dr, dc] of DIRS_4) {
      for (let k = 1; k <= 3; k++) {
        const nr = r + dr*k, nc = c + dc*k;
        if (!inb(nr, nc)) break;
        if (next[nr][nc].color) next[nr][nc].color = color;
      }
    }
  } else if (skill === 'zoshoku') {
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && next[nr][nc].color === null) {
        next[nr][nc] = { color, skill: null, owner: color, hantenUsed: false };
        break;
      }
    }
  }
  if (skill !== 'bakudan' && skill !== 'shoshitsu') {
    next[r][c] = { color, skill, owner: color, hantenUsed: false };
  }
  return next;
}

// 相手から見た最善応手のスコア（profile.lookahead == 1 なら使用）
function opponentBestScoreSim(board, oppColor, profile) {
  let oppMoves = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color !== null) continue;
    for (const [dr, dc] of DIRS_8) {
      let nr = r + dr, nc = c + dc, found = false;
      while (inb(nr, nc) && board[nr][nc].color && board[nr][nc].color !== oppColor) { nr+=dr; nc+=dc; found=true; }
      if (found && inb(nr, nc) && board[nr][nc].color === oppColor) { oppMoves.push([r,c]); break; }
    }
  }
  if (oppMoves.length === 0) return evaluateBoardFlat(board, oppColor, profile);
  let best = -Infinity;
  for (const [r, c] of oppMoves) {
    const next = simulatePlaceFlat(board, r, c, oppColor);
    const s = evaluateBoardFlat(next, oppColor, profile);
    if (s > best) best = s;
  }
  return best;
}

// Phase 4 (LV85+): 相手の最善応手を異能の確率分布を加味して評価
function opponentBestScoreWithProbabilitySim(board, oppColor, profile, state, me) {
  const oppPool = getOpponentRemainingPool(state, me);
  let oppMoves = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c].color !== null) continue;
    for (const [dr, dc] of DIRS_8) {
      let nr = r + dr, nc = c + dc, found = false;
      while (inb(nr, nc) && board[nr][nc].color && board[nr][nc].color !== oppColor) { nr+=dr; nc+=dc; found=true; }
      if (found && inb(nr, nc) && board[nr][nc].color === oppColor) { oppMoves.push([r,c]); break; }
    }
  }
  if (oppMoves.length === 0) return evaluateBoardFlat(board, oppColor, profile);
  const oppPoolSize = Math.max(1, oppPool.length);
  const probBomb   = oppPool.includes('bakudan') ? 1 / oppPoolSize : 0;
  const probHogeki = oppPool.includes('hogeki')  ? 1 / oppPoolSize : 0;
  let best = -Infinity;
  for (const [r, c] of oppMoves) {
    const next = simulatePlaceFlat(board, r, c, oppColor);
    let s = evaluateBoardFlat(next, oppColor, profile);
    let abilityBonus = 0;
    if (probBomb > 0) {
      let blast = 0;
      for (const [dr, dc] of DIRS_8) {
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && board[nr][nc].color === me) blast++;
      }
      abilityBonus = Math.max(abilityBonus, probBomb * blast * 6 * profile.advFactor);
    }
    if (probHogeki > 0) {
      let cross = 0;
      for (const [dr, dc] of DIRS_4) {
        for (let k = 1; k <= 3; k++) {
          const nr = r + dr*k, nc = c + dc*k;
          if (!inb(nr, nc)) break;
          if (board[nr][nc].color === me) cross++;
        }
      }
      abilityBonus = Math.max(abilityBonus, probHogeki * cross * 3 * profile.advFactor);
    }
    s += abilityBonus;
    if (s > best) best = s;
  }
  return best;
}

function scoreMove(state, r, c, color) {
  const flips = getFlipsForPlace(state, r, c, color);
  return POS_WEIGHTS[r][c] + flips.length * 2;
}

function skillContextBonus(state, r, c, skill, color) {
  if (skill === 'bakudan') {
    let enemies = 0, friends = 0, value = 0;
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (!inb(nr, nc)) continue;
      const c2 = state.board[nr][nc].color;
      if (c2 && c2 !== color) { enemies++; value += Math.max(0, POS_WEIGHTS[nr][nc]) * 0.3; }
      else if (c2 === color) friends++;
    }
    let empty = 0, myStones = 0;
    for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
      if (state.board[rr][cc].color === null) empty++;
      else if (state.board[rr][cc].color === color) myStones++;
    }
    if (myStones <= 5) return -200;
    if (friends >= 3) return -100;
    let timingMod = 0;
    if (empty >= 45) timingMod = -10;
    else if (empty <= 25) timingMod = +5;
    const efficiency = enemies < 4 ? -15 + enemies * 2 : 0;
    return enemies * 1.5 + value + timingMod + efficiency - friends * 8;
  }
  if (skill === 'hogeki') {
    let count = 0, value = 0;
    for (const [dr, dc] of DIRS_4) {
      for (let k = 1; k <= 3; k++) {
        const nr = r + dr*k, nc = c + dc*k;
        if (!inb(nr, nc)) break;
        if (state.board[nr][nc].color && state.board[nr][nc].color !== color) {
          count++;
          value += Math.max(0, POS_WEIGHTS[nr][nc]) * 0.25;
        }
      }
    }
    let empty = 0;
    for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
      if (state.board[rr][cc].color === null) empty++;
    }
    const timingMod = empty >= 48 ? -6 : 0;
    const efficiency = count < 3 ? -8 : 0;
    return count * 1.2 + value + timingMod + efficiency;
  }
  if (skill === 'tanchi') {
    const opp = color === 'D' ? 'L' : 'D';
    const known = color === 'D' ? state.revealedToD : state.revealedToL;
    let infoCount = 0;
    for (const [dr, dc] of DIRS_4) {
      for (let k = 1; k <= 3; k++) {
        const nr = r + dr*k, nc = c + dc*k;
        if (!inb(nr, nc)) break;
        const cell = state.board[nr][nc];
        if (cell.color === opp && cell.skill && !known.has(`${nr},${nc}`)) infoCount++;
      }
    }
    let perInfoBonus = 2;
    const lv = getAILevel(state, color);
    if (lv >= 50) {
      const pool = getOpponentRemainingPool(state, color);
      const strongLeft = pool.filter(s => ABILITIES[s].cost >= 3).length;
      perInfoBonus = 2 + strongLeft * 1.5;
      if (lv >= 70 && pool.includes('bakudan')) perInfoBonus += 4;
      if (lv >= 90) {
        let empty = 0;
        for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) {
          if (state.board[r2][c2].color === null) empty++;
        }
        if (empty >= 40) {
          const opp = color === 'D' ? 'L' : 'D';
          const known = color === 'D' ? state.revealedToD : state.revealedToL;
          let totalUnrevealed = 0;
          for (let r2 = 0; r2 < N; r2++) for (let c2 = 0; c2 < N; c2++) {
            const cell = state.board[r2][c2];
            if (cell.color === opp && cell.skill && !known.has(`${r2},${c2}`)) totalUnrevealed++;
          }
          perInfoBonus += Math.min(8, totalUnrevealed * 2);
        }
      }
    }
    return infoCount * perInfoBonus;
  }
  if (skill === 'hanten') {
    let value = Math.max(0, POS_WEIGHTS[r][c]) * 0.15;
    let enemiesNear = 0;
    const opp = color === 'D' ? 'L' : 'D';
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (inb(nr, nc) && state.board[nr][nc].color === opp) enemiesNear++;
    }
    return value + enemiesNear * 0.8;
  }
  if (skill === 'kyozo') return Math.max(0, POS_WEIGHTS[r][c]) * 0.1;
  if (skill === 'zoshoku') {
    return (r === 0 || r === 7 || c === 0 || c === 7) ? 5 : 0;
  }
  if (skill === 'muko') {
    const opp = color === 'D' ? 'L' : 'D';
    let count = 0;
    for (const [dr, dc] of DIRS_8) {
      const nr = r + dr, nc = c + dc;
      if (!inb(nr, nc)) continue;
      const cell = state.board[nr][nc];
      if (cell.color === opp && cell.skill && !state.nullifiedCells.has(`${nr},${nc}`)) count++;
    }
    return count * 12;
  }
  if (skill === 'gyakushu') {
    let blocked = 0;
    for (const [dr, dc] of DIRS_4) {
      const nr = r + dr, nc = c + dc;
      if (!inb(nr, nc) || state.board[nr][nc].color !== null) blocked++;
    }
    return blocked * 4;
  }
  return 0;
}

// 色別 AI レベル取得（state.aiLevels が無ければ state.aiLevel フォールバック）
function getAILevel(state, color) {
  if (state.aiLevels && state.aiLevels[color] != null) return state.aiLevels[color];
  return state.aiLevel || 50;
}

// Phase 3: フリップ・リスク評価（LV70+）— LV85+ ほど慎重
function computeFlipRisk(state, me, r, c) {
  const flips = getFlipsForPlace(state, r, c, me);
  if (flips.length === 0) return 0;
  const aiRevealed = me === 'D' ? state.revealedToD : state.revealedToL;
  const pool = getOpponentRemainingPool(state, me);
  if (pool.length === 0) return 0;
  const bombInPool = pool.includes('bakudan') ? 1 : 0;
  const probBomb = bombInPool / pool.length;
  const probMuko = pool.includes('muko') ? 1 / pool.length : 0;
  const lv = getAILevel(state, me);
  let intensity = 10;
  if (lv >= 85) intensity = 16 + ((lv - 85) / 14) * 8;
  let risk = 0;
  for (const [fr, fc] of flips) {
    const cell = state.board[fr][fc];
    if (cell.color !== me && cell.skill && !(aiRevealed && aiRevealed.has(`${fr},${fc}`))) {
      risk += probBomb * intensity + probMuko * 2;
    }
  }
  return risk;
}

// Phase 2: 相手の残っている可能性のある異能の集合
function getOpponentRemainingPool(state, me) {
  const opp = me === 'D' ? 'L' : 'D';
  const fired = (state.firedAbilities && state.firedAbilities[opp]) || new Set();
  const revealedTo = me === 'D' ? state.revealedToD : state.revealedToL;
  const knownOnBoard = new Set();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cell = state.board[r][c];
    if (cell.color === opp && cell.skill && revealedTo && revealedTo.has(`${r},${c}`)) {
      knownOnBoard.add(cell.skill);
    }
  }
  return FULL_DECK.filter(s => !fired.has(s) && !knownOnBoard.has(s));
}

function pickVanishTarget(state, me) {
  const aiRevealed = me === 'D' ? state.revealedToD : state.revealedToL;
  const useDeckTracking = getAILevel(state, me) >= 50;
  let avgUnknownCost = 2;
  if (useDeckTracking) {
    const pool = getOpponentRemainingPool(state, me);
    if (pool.length > 0) {
      avgUnknownCost = pool.reduce((s, sk) => s + ABILITIES[sk].cost, 0) / pool.length;
    }
  }
  let best = null;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cell = state.board[r][c];
    if (cell.color && cell.color !== me) {
      let score = POS_WEIGHTS[r][c];
      const skillKnown = cell.skill && aiRevealed && aiRevealed.has(`${r},${c}`);
      if (skillKnown) {
        score += ABILITIES[cell.skill].cost * 8;
      } else if (cell.skill) {
        score += useDeckTracking ? (avgUnknownCost * 6) : 6;
      }
      if (!best || score > best.score) best = { r, c, score };
    }
  }
  return best;
}

// Return next AI action: { type: 'pass' | 'place' | 'vanish' | 'gyakushu', ... }
function aiPickAction(state, me) {
  const validMoves = getValidMoves(state, me);
  if (validMoves.length === 0) return { type: 'pass' };

  const lv = getAILevel(state, me);
  const profile = getAIProfile(lv);
  const opp = me === 'D' ? 'L' : 'D';

  const activeHand = getActiveHand(state, me);

  // === LV30+ 消滅 ===
  if (lv >= 30) {
    const shoshitsuCard = activeHand.find(c => c.skill === 'shoshitsu');
    if (shoshitsuCard) {
      const target = pickVanishTarget(state, me);
      if (target && target.score > 30) {
        return { type: 'vanish', r: target.r, c: target.c };
      }
    }
  }

  // === LV20+ 配置済み逆襲発動 ===
  if (lv >= 20) {
    const ready = findEligibleGyakushu(state, me);
    if (ready.length > 0) {
      const [gr, gc] = ready[0];
      return { type: 'gyakushu', r: gr, c: gc };
    }
  }

  // === 候補手評価（profile + lookahead + flip-risk + frontier） ===
  const useFlipRisk = lv >= 70;
  const useFrontierAvoid = lv >= 50;
  const useProbabilistic = lv >= 85;
  const candidates = [];
  for (const [r, c] of validMoves) {
    const flips = getFlipsForPlace(state, r, c, me);
    let baseScore = profile.posWeightFactor * POS_WEIGHTS[r][c] + flips.length * 2;
    if (profile.threatAvoid && isThreatCell(r, c, state.board)) baseScore -= 30;
    if (useFrontierAvoid) {
      let emptyNeighbors = 0;
      for (const [dr, dc] of DIRS_8) {
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && state.board[nr][nc].color === null) emptyNeighbors++;
      }
      baseScore -= emptyNeighbors * 1.5;
    }
    if (useFlipRisk) baseScore -= computeFlipRisk(state, me, r, c);
    if (profile.lookahead >= 1) {
      const next = simulatePlaceFlat(state.board, r, c, me);
      if (lv >= 85) {
        // 鬼神級 minimax 探索
        let emptyCount = 0;
        for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
          if (next[rr][cc].color === null) emptyCount++;
        }
        const depth = getSearchDepthSim(lv, emptyCount);
        let score;
        if (lv >= 99 && emptyCount > 18) {
          const initUsed = { D: new Set(), L: new Set() };
          const abilityBudget = 2;
          score = minimaxFullSim(state, next, depth, -Infinity, Infinity, opp, me, profile, initUsed, abilityBudget);
        } else {
          score = minimaxSim(next, depth, -Infinity, Infinity, opp, me, profile);
        }
        baseScore = baseScore * 0.15 + score;
      } else {
        // LV70-84: 軽量 1-ply
        const myEval = evaluateBoardFlat(next, me, profile);
        const oppBest = opponentBestScoreSim(next, opp, profile);
        baseScore = baseScore * 0.3 + myEval - oppBest * 0.6;
      }
    }
    candidates.push({ score: baseScore, move: [r, c], skillIdx: -1, _baseRaw: baseScore });

    if (state.rand() < profile.skillUseProb) {
      for (const card of activeHand) {
        const skill = card.skill;
        if (skill === 'shoshitsu') continue;
        const sScore = baseScore + (SKILL_BONUS[skill] || 0) + skillContextBonus(state, r, c, skill, me);
        candidates.push({ score: sScore, move: [r, c], skillIdx: card.idx, _skill: skill, _baseRaw: baseScore });
      }
    }
  }

  // LV85+ 鬼神級：上位候補に対して異能効果込みのミニマックス先読みを実施
  if (lv >= 85 && profile.lookahead >= 1) {
    candidates.sort((a, b) => b.score - a.score);
    const topN = Math.min(8, candidates.length);
    for (let i = 0; i < topN; i++) {
      const cand = candidates[i];
      if (cand.skillIdx < 0) continue;
      const skill = cand._skill;
      if (skill === 'tanchi' || skill === 'kyozo' || skill === 'hanten' || skill === 'gyakushu' || skill === 'muko') continue;
      try {
        const [r, c] = cand.move;
        const nextSk = simulatePlaceWithSkillFlat(state.board, r, c, me, skill);
        let emptyCount = 0;
        for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
          if (nextSk[rr][cc].color === null) emptyCount++;
        }
        const depth = getSearchDepthSim(lv, emptyCount);
        let lookScore;
        if (lv >= 99 && emptyCount > 18) {
          const initUsed = { D: new Set(), L: new Set() };
          initUsed[me].add(cand.skillIdx);
          const abilityBudget = 2;
          lookScore = minimaxFullSim(state, nextSk, depth, -Infinity, Infinity, opp, me, profile, initUsed, abilityBudget);
        } else {
          lookScore = minimaxSim(nextSk, depth, -Infinity, Infinity, opp, me, profile);
        }
        const heuristic = (SKILL_BONUS[skill] || 0) + skillContextBonus(state, r, c, skill, me);
        cand.score = cand._baseRaw * 0.15 + lookScore + heuristic * 0.5;
      } catch (e) { /* fallback to heuristic */ }
    }
  }
  if (candidates.length === 0) return { type: 'pass' };
  candidates.sort((a, b) => b.score - a.score);
  let pickIdx = 0;
  if (profile.randomness > 0) {
    const poolSize = Math.max(1, Math.floor(candidates.length * profile.randomness));
    pickIdx = Math.floor(state.rand() * poolSize);
  }
  const best = candidates[pickIdx];
  return { type: 'place', r: best.move[0], c: best.move[1], skillIdx: best.skillIdx };
}

// ---------------- Game runner ----------------
function playGame(seed, opts = {}) {
  const rand = makeRng(seed);
  const state = newGame(rand, opts);
  const errors = [];
  const maxTurns = opts.maxTurns || 200; // safety net
  let turnCount = 0;

  while (!state.ended && turnCount < maxTurns) {
    turnCount++;
    const me = state.turn;
    let action;
    try {
      action = aiPickAction(state, me);
    } catch (e) {
      errors.push({ turn: turnCount, color: me, error: 'aiPickAction_threw: ' + e.message });
      break;
    }

    try {
      if (action.type === 'pass') {
        passTurn(state);
      } else if (action.type === 'vanish') {
        const r = execVanish(state, action.r, action.c);
        if (!r.ok) errors.push({ turn: turnCount, color: me, error: 'vanish_fail: ' + r.reason });
      } else if (action.type === 'gyakushu') {
        const r = fireGyakushuAt(state, action.r, action.c);
        if (!r.ok) errors.push({ turn: turnCount, color: me, error: 'gyakushu_fail: ' + r.reason });
      } else if (action.type === 'place') {
        const r = makeMove(state, action.r, action.c, action.skillIdx);
        if (!r.ok) errors.push({ turn: turnCount, color: me, error: 'place_fail: ' + r.reason });
      }
    } catch (e) {
      errors.push({ turn: turnCount, color: me, error: 'action_threw: ' + e.message });
      break;
    }

    // termination check
    if (!state.ended) {
      const movesD = getValidMoves(state, 'D').length;
      const movesL = getValidMoves(state, 'L').length;
      // if both have no moves, end
      const myMoves = getValidMoves(state, state.turn).length;
      if (myMoves === 0 && movesD === 0 && movesL === 0) {
        state.ended = true;
      }
    }
  }

  const truncated = !state.ended && turnCount >= maxTurns;
  if (truncated) errors.push({ turn: turnCount, error: 'max_turns_truncated' });

  const finalScores = countScores(state);
  const winner = finalScores.D > finalScores.L ? 'D'
              : finalScores.L > finalScores.D ? 'L'
              : 'draw';

  return {
    seed,
    turns: turnCount,
    truncated,
    winner,
    score: finalScores,
    moves: state.stats.moves,
    skillUses: state.stats.skillUses,
    chains: state.stats.chains,
    chainCount: state.stats.chains.length,
    maxChain: state.stats.maxChain,
    passes: state.stats.passes,
    vanishUses: state.stats.vanishUses,
    gyakushuFires: state.stats.gyakushuFires,
    bakudanExplosions: state.stats.bakudanExplosions,
    zoshokuSpawns: state.stats.zoshokuSpawns,
    hantenBlocks: state.stats.hantenBlocks,
    kyozoTriggered: state.stats.kyozoTriggered,
    handD: state.hands.D.map(h => ({ s: h.skill, used: h.used })),
    handL: state.hands.L.map(h => ({ s: h.skill, used: h.used })),
    cascadeBonuses: state.stats.cascadeBonuses || 0,
    cascadeStones: state.stats.cascadeStones || 0,
    errors,
  };
}

module.exports = {
  ABILITIES, FULL_DECK, HAND_SIZE, N,
  makeRng, newGame, createBoard, countScores,
  getFlipsForPlace, getValidMoves,
  makeMove, execVanish, fireGyakushuAt, passTurn,
  aiPickAction, scoreMove, skillContextBonus,
  playGame,
};
