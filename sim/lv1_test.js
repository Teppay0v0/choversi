// LV1-9 で異能が使われているか確認
'use strict';
const { playGame } = require('./simulator');

const NUM = 30;
const SEED_BASE = 42;

function run(lv) {
  let totalSkillUses = 0, totalGames = 0;
  for (let i = 0; i < NUM; i++) {
    const r = playGame(SEED_BASE + i * 7919, {
      handSize: { D: 4, L: 3 }, guaranteeStrongForBlack: true, cascadeBonus: false,
      aiLevel: lv,
    });
    totalSkillUses += Object.values(r.skillUses || {}).reduce((s, v) => s + v, 0);
    totalGames++;
  }
  return totalSkillUses / totalGames;
}

console.log('\n=== 各LVでの平均異能使用回数（30戦平均） ===\n');
for (const lv of [1, 5, 9, 15, 30, 50, 70, 99]) {
  console.log(`  LV${String(lv).padStart(2)}: 平均 ${run(lv).toFixed(1)} 回 / 戦`);
}
