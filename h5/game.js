/* 绿色循环圈外传 H5 复刻
 * 规则与数值来自原地图 (见 analysis/详细玩法拆解.md)。世界坐标沿用 WC3 地图坐标 (约 ±6000)。
 */
(() => {
'use strict';
const D = window.GAME_DATA;

// ---------------------------------------------------------------- 常量 / 规则
const RULE = {
  capPerPlayer: 40,          // C9[i]=40
  prepTime: 60,              // 开局 60 秒
  startGold: 2000, startWood: 5, startFood: 6,
  eliteChance: 1 / 55,       // GetRandomInt(1,55)==30
  eliteHp: [150, 2000, 6000, 25000, 90000], eliteArmor: 20,
  hpPerWave: 0.01,           // 科技 Rhar: 每级 +1% 生命
  foodPrice: 12, woodToGold: 300, goldToWood: 500,
  maxAuraPerKind: 2,
};
const MODES = {
  solo: { name: '单人推荐', interval: 38, hp: 0.35, food: 8, desc: '38 秒/波，怪物生命 ×0.35，起手人口 8' },
  origin: { name: '原版数值', interval: 33, hp: 1, food: 6, desc: '33 秒/波，原图数值（原图为 8 人合作设计，单人极难）' },
  relax: { name: '休闲', interval: 50, hp: 0.2, food: 10, desc: '50 秒/波（旧版节奏），怪物生命 ×0.2，起手人口 10' },
  demo: { name: '演示', interval: 38, hp: 0.35, food: 20, desc: '只打前 2 波；固定英雄剑神和 5 种塔，开局 60000 金方便演示升级', hidden: true,
          gold: 60000, wood: 10, prep: 30, waves: 2, hero: '剑神', build: ['魔幻塔', '闪电塔', '攻击光环', '冰霜塔', '灵魂塔'] },
};
const ARMOR_COL = { small: 0, medium: 1, large: 2, fort: 3, none: 4, normal: 4, hero: 5, divine: 6, unarmored: 7 };
const ARMOR_CN = { small: '物理', medium: '抗性', large: '魔法', divine: '神圣', hero: '英雄', none: '无甲', normal: '无甲', fort: '城甲', unarmored: '无甲' };
const ARMOR_COLOR = { small: '#ff9a3c', medium: '#5fd35f', large: '#5aa8ff', divine: '#fff27a', hero: '#ff6bd5', none: '#cccccc', normal: '#cccccc' };
const ATK_CN = { normal: '普通', pierce: '穿刺', magic: '魔法', chaos: '混乱', hero: '英雄', spells: '法术' };
const ATK_COLOR = { normal: '#e8e8e8', pierce: '#ffb347', magic: '#7ab8ff', chaos: '#c48bff', hero: '#ffd257', spells: '#7ab8ff' };
const COUNTER = { '物理': 'magic', '抗性': 'normal', '魔法': 'pierce', '神圣': 'chaos' };
const SPAWNER = { '多': { every: 0.25, count: 62 }, '中': { every: 0.6, count: 32 }, '少': { every: 1.0, count: 15 } };
const CAT_CN = { main: '主塔', raw: '原始塔', sup: '辅助塔', aura: '光环塔', alt: '另类塔', hero: '英雄塔' };

// ---------------------------------------------------------------- 路线 (由地图 region + 移动指令还原)
// 原图 8 名玩家的塔遍布整个环；单人时把路线整体缩小到 MAP_SCALE，让塔的射程覆盖更多路段（射程、移速等数值不变）
const MAP_SCALE = 0.55;
const NODES_RAW = {
  // 外环
  L: [-3856, 3888], Z: [0, 3888], Y: [3888, 3840], k: [3888, 16], j: [3840, -3888], P: [0, -3888], O: [-3888, -3840], M: [-3888, 0],
  // 内环
  S: [-2864, 2848], l: [0, 2768], W: [2832, 2880], h: [2768, 0], g: [2864, -2864], d: [-16, -2768], c: [-2880, -2880], T: [-2768, 0],
  // 出怪口 (红色玩家：左上角 I → K → L)
  I: [-4864, 5216], K: [-4864, 3776],
};
// 缩放后对齐到建造网格：路的中线都落在格子中心（64 的倍数），并且全部横平竖直，
// 这样路两侧的可建造区是整齐的矩形。内外环中线相距 11 格 = 路占 5 格 + 两排塔（每座 3×3 格）。
const CELL = 64, TOWER_CELLS = 3, ROAD_BLOCK = 160;            // ROAD_BLOCK：路中线两侧各 2.5 格不能建造
const RING_OUT = 33 * CELL, RING_IN = RING_OUT - 11 * CELL;     // 2112 / 1408
const NODES = (() => {
  const o = RING_OUT, i = RING_IN;
  return {
    L: [-o, o], Z: [0, o], Y: [o, o], k: [o, 0], j: [o, -o], P: [0, -o], O: [-o, -o], M: [-o, 0],
    S: [-i, i], l: [0, i], W: [i, i], h: [i, 0], g: [i, -i], d: [0, -i], c: [-i, -i], T: [-i, 0],
    I: [-42 * CELL, 45 * CELL], K: [-42 * CELL, o],
  };
})();
const EDGES = [
  ['L', 'Z'], ['Z', 'Y'], ['Y', 'k'], ['k', 'j'], ['j', 'P'], ['P', 'O'], ['O', 'M'], ['M', 'L'],
  ['S', 'l'], ['l', 'W'], ['W', 'h'], ['h', 'g'], ['g', 'd'], ['d', 'c'], ['c', 'T'], ['T', 'S'],
  ['M', 'T'], ['Z', 'l'], ['k', 'h'], ['P', 'd'],
];
const SPAWN_PATH = ['I', 'K', 'L'];
const ADJ = {};
for (const [a, b] of EDGES) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }
const ROAD_SEGS = EDGES.concat([['I', 'K'], ['K', 'L']]).map(([a, b]) => [NODES[a], NODES[b]]);
const ROAD_HALF = 110;   // 路宽一半
const WORLD = Math.round(6000 * MAP_SCALE);
const BUILD_LIM = 3168;  // 可建造区外边界（格子边线）

// ---------------------------------------------------------------- 工具
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpStat = (a, b, stat, max) => a + (b - a) * clamp(stat / max, 0, 1);   // "[a-b] 与属性相关，Max 为属性 ≥ max"
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
function segDist2(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return dist2(px, py, ax + t * dx, ay + t * dy);
}
const abil = (lv, code) => (lv.abils || []).find(a => a.code === code);

// ---------------------------------------------------------------- 游戏状态
let G;
function newGame(mode) {
  G = {
    mode, interval: MODES[mode].interval, hpScale: MODES[mode].hp, t: 0, phase: 'prep', timer: MODES[mode].prep || RULE.prepTime, wave: 0,
    gold: MODES[mode].gold || RULE.startGold, wood: MODES[mode].wood || RULE.startWood, foodCap: MODES[mode].food,
    monsters: [], towers: [], fx: [], zones: [], spawners: [], timeouts: [],
    perfect: 0, score: 1000, kills: 0, speed: 1, paused: false,
    build: [], rerolls: 0, placing: null, selected: null, hero: null, heroChoice: null,
    bossRule: null, final: null, nextId: 1, hint: '准备阶段：选中守卫者，在出怪口附近建塔！',
    // 循环圈守卫者：无敌、移速 500、全图闪烁 (CD 1 秒)
    builder: { isBuilder: true, x: NODES.L[0] + 250, y: NODES.L[1] + 450, speed: 500, order: null, blinkCd: 0 },
    cam: { x: NODES.L[0] + 600, y: NODES.L[1] - 300, zoom: 2.4 },
    menu: 'main', pending: null,
  };
  G.selected = G.builder;
  FXS.clear();
  rerollBuild(true);
  if (MODES[mode].hero) G.heroChoice = MODES[mode].hero;
}

// ---------------------------------------------------------------- 建造栏 (随机 6 选：1 主塔、1 原始、1 光环、2 辅助、1 另类)
const FAM = Object.values(D.towers);
const byCat = c => FAM.filter(f => f.cat === c).map(f => f.name);
function rerollBuild(free) {
  if (!free) {
    if (G.rerolls > 0 && G.wood < 1) return msg('木材不足（随机建造需要 1 木材，首次免费）');
    if (G.rerolls > 0) G.wood -= 1;
    G.rerolls++;
  }
  const sups = byCat('sup').sort(() => Math.random() - 0.5);
  if (MODES[G.mode].build) G.build = MODES[G.mode].build.slice();      // 演示模式：固定建造栏
  else G.build = [pick(byCat('main')), pick(byCat('raw')), pick(byCat('aura')), sups[0], sups[1], pick(byCat('alt'))];
  G.placing = null;
  uiDirty();
}

// ---------------------------------------------------------------- 伤害
function armorMult(armor) {
  return armor >= 0 ? 1 / (1 + 0.02 * armor) : 2 - Math.pow(0.98, -armor);   // DefenseArmor=0.02
}
function effArmor(m) { return m.armor + m.auraArmor - m.armorDown - m.shred; }
function typeMult(atk, m) {
  const row = D.damage[atk] || D.damage.normal;
  return row[ARMOR_COL[m.type] ?? 7];
}
function hurt(m, amount, atk, src, opt = {}) {
  if (m.dead || !(amount > 0)) return 0;   // 同时挡掉 NaN
  let dmg = amount * typeMult(atk, m);
  if (!opt.ignoreArmor) dmg *= armorMult(effArmor(m));
  if (src && src.dmgMul) dmg *= src.dmgMul;
  m.hp -= dmg;
  if (src) src.dealt = (src.dealt || 0) + dmg;
  if (m.hp <= 0) kill(m, src);
  return dmg;
}
function kill(m, src) {
  if (m.dead) return;
  m.dead = true; m.hp = 0;
  G.gold += Math.round(m.bounty);
  G.kills++;
  if (src) { src.kills = (src.kills || 0) + 1; const owner = src.owner || src; if (owner.isHero) owner.mana = Math.min(owner.maxMana(), owner.mana + 2); }   // 英雄每击杀 +2 魔法
  if (m.elite) {
    const w = rint(1, 3); G.wood += w;
    const owner = src && (src.owner || src);
    if (owner && owner.isHero) { owner.stat[owner.growth] += 1; msg(`英雄击杀精英怪：${statCN(owner.growth)} +1，木材 +${w}`); }
    else msg(`击杀精英怪：木材 +${w}`);
  }
  if (m.onDeath) m.onDeath(src);
  const sh = sheetOf(m);
  if (sh && sh.m.actions.death) { const a = sh.m.actions.death; addFx({ kind: 'corpse', ent: { uid: m.uid, face: m.face, elite: m.elite, boss: m.boss }, x: m.x, y: m.y, t0: G.t, life: a.frames / a.fps + 1.2 }); }
  else addFx({ kind: 'death', x: m.x, y: m.y, r: m.r, life: 0.35, color: ARMOR_COLOR[m.type] });
}

// ---------------------------------------------------------------- 怪物
function spawnMonster(id, opt = {}) {
  const u = D.units[id];
  if (!u) return null;
  const [x, y] = NODES[SPAWN_PATH[0]];
  const hpMul = (1 + RULE.hpPerWave * G.wave) * G.hpScale * (opt.hpMul || 1);
  const m = {
    id: G.nextId++, uid: id, name: u.name, x: x + rnd(-150, 150), y: y + rnd(-150, 150),
    maxHp: u.hp * hpMul, hp: u.hp * hpMul, armor: u.armor, type: u.armorType, speed: u.speed || 250,
    bounty: u.bounty, regen: u.regen || 0, path: SPAWN_PATH.slice(1), prev: null, cur: SPAWN_PATH[0], lane: rnd(-0.75, 0.75),
    slow: 0, slowUntil: 0, stunUntil: 0, shred: 0, shredUntil: 0, armorDown: 0, armorDownUntil: 0,
    auraArmor: 0, auraSlow: 0, auraSpeed: 0, auraRegen: 0, burn: null, dots: [],
    boss: !!opt.boss, r: opt.boss ? 90 : 55, elite: null,
  };
  if (!opt.boss && !opt.noElite && G.wave < 50 && Math.random() < RULE.eliteChance) makeElite(m);
  m.cr = colRadius(m);
  G.monsters.push(m);
  return m;
}
const ELITE_AURAS = [
  { key: 'focus', name: '专注光环', desc: ['周围怪护甲 +10', '周围怪护甲 +30', '周围怪护甲 +60'], v: [10, 30, 60] },
  { key: 'slowas', name: '减攻速光环', desc: ['周围塔攻速 -10%', '周围塔攻速 -25%', '周围塔攻速 -50%'], v: [0.1, 0.25, 0.5] },
  { key: 'weak', name: '弱击光环', desc: ['周围塔伤害 -10%', '周围塔伤害 -30%', '周围塔伤害 -50%'], v: [0.1, 0.3, 0.5] },
  { key: 'endur', name: '耐久光环', desc: ['周围怪移速 +5%', '周围怪移速 +15%', '周围怪移速 +30%'], v: [0.05, 0.15, 0.3] },
  { key: 'unholy', name: '邪恶光环', desc: ['周围怪每秒回血 4%', '周围怪每秒回血 6%', '周围怪每秒回血 8%'], v: [0.04, 0.06, 0.08] },
];
function makeElite(m) {
  const tier = clamp(Math.floor((G.wave - 1) / 10), 0, 4);
  const a = pick(ELITE_AURAS);
  const lvl = Math.random() < 0.2 ? 3 : Math.random() < 1 / 3 ? 2 : 1;
  m.maxHp += RULE.eliteHp[tier]; m.hp += RULE.eliteHp[tier]; m.armor += RULE.eliteArmor;
  m.elite = { aura: a, lvl }; m.r = 72; m.cr = colRadius(m);
}
function nextNode(m) {
  if (m.path.length) return m.path.shift();
  const opts = ADJ[m.cur].filter(n => n !== m.prev);
  return pick(opts.length ? opts : ADJ[m.cur]);   // 路口 50/50 随机，不走回头路
}
// ---------------------------------------------------------------- 怪物移动与碰撞
// 每只怪沿路线走，但有自己的"车道"（离路中线的偏移，左右以前进方向为准）；怪与怪之间互相推开，
// 被推的位移拆成"沿路"和"横向"两部分：横向换道（不出路面），沿路被挡住就慢下来排队。
const colRadius = m => m.boss ? m.r * 0.9 : m.r * 0.6;           // 碰撞半径（比画面上的选中圈小一点，允许轻微贴近）
const maxLane = m => Math.max(0, ROAD_HALF - m.cr * 0.7);          // 允许身体一小部分压到路沿
function segFrame(m) {                                             // 当前路段：起点、方向、垂直方向、长度
  const A = NODES[m.cur], B = NODES[m.target];
  const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  return { A, ux, uy, nx: -uy, ny: ux, len };
}
const toSeg = (f, x, y) => [(x - f.A[0]) * f.ux + (y - f.A[1]) * f.uy, (x - f.A[0]) * f.nx + (y - f.A[1]) * f.ny];
function moveMonster(m, dt) {
  if (!m.target) m.target = nextNode(m);
  if (G.t < m.stunUntil) return;
  let spd = m.speed * (1 + m.auraSpeed) * (1 - Math.max(m.slow * (G.t < m.slowUntil ? 1 : 0), m.auraSlow));
  spd = clamp(spd, 30, 522);
  let f = segFrame(m), [sAlong, lat] = toSeg(f, m.x, m.y);
  sAlong += spd * dt;
  // 横向慢慢靠向自己的车道
  const want = m.lane * maxLane(m), dl = want - lat, lstep = spd * 0.35 * dt;
  lat += Math.abs(dl) <= lstep ? dl : Math.sign(dl) * lstep;
  // 到达路口：换到下一段，用当前位置在新路段上的投影接着走（转弯不跳变），车道略微随机变化
  let guard = 0;
  while (sAlong >= f.len && guard++ < 3) {
    const px = f.A[0] + f.ux * sAlong + f.nx * lat, py = f.A[1] + f.uy * sAlong + f.ny * lat;
    m.prev = m.cur; m.cur = m.target; m.target = nextNode(m);
    m.lane = clamp(m.lane * 0.6 + rnd(-0.4, 0.4), -0.85, 0.85);
    f = segFrame(m); [sAlong, lat] = toSeg(f, px, py);
  }
  lat = clamp(lat, -maxLane(m), maxLane(m));
  const ox = m.x, oy = m.y;
  m.x = f.A[0] + f.ux * sAlong + f.nx * lat; m.y = f.A[1] + f.uy * sAlong + f.ny * lat;
  if (Math.abs(m.x - ox) + Math.abs(m.y - oy) > 0.01) m.face = Math.atan2(m.y - oy, m.x - ox);
}
// 怪物之间的碰撞：空间网格找邻居，重叠的两只按体重（BOSS 更重）互相推开，迭代两次
const COL_CELL = 160;
function separateMonsters() {
  const ms = G.monsters.filter(m => !m.dead && m.target);
  if (ms.length < 2) return;
  for (let it = 0; it < 2; it++) {
    const grid = new Map();
    for (const m of ms) { const k = Math.floor(m.x / COL_CELL) + ',' + Math.floor(m.y / COL_CELL); (grid.get(k) || grid.set(k, []).get(k)).push(m); m.pdx = 0; m.pdy = 0; }
    for (const m of ms) {
      const cx = Math.floor(m.x / COL_CELL), cy = Math.floor(m.y / COL_CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = grid.get(gx + ',' + gy); if (!cell) continue;
        for (const o of cell) {
          if (o.id <= m.id) continue;                      // 每对只算一次
          let dx = o.x - m.x, dy = o.y - m.y; const min = m.cr + o.cr, d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          if (d < 0.01) { const a = (m.id * 2.399) % TAU; dx = Math.cos(a); dy = Math.sin(a); d = 1; }   // 完全重合时按 id 给个固定方向
          const push = (min - d), wm = o.cr / (m.cr + o.cr), wo = 1 - wm;   // 小的被推得多
          const nx = dx / d, ny = dy / d;
          m.pdx -= nx * push * wm; m.pdy -= ny * push * wm;
          o.pdx += nx * push * wo; o.pdy += ny * push * wo;
        }
      }
    }
    for (const m of ms) {
      if (!m.pdx && !m.pdy) continue;
      const f = segFrame(m); let [sAlong, lat] = toSeg(f, m.x, m.y);
      const da = m.pdx * f.ux + m.pdy * f.uy, dl = m.pdx * f.nx + m.pdy * f.ny;
      sAlong += Math.min(da, 0.5 * m.cr * 0.25) * 0.9;          // 往前推得少（不会被挤着加速），往后推照常（排队）
      lat = clamp(lat + dl, -maxLane(m), maxLane(m));
      m.x = f.A[0] + f.ux * sAlong + f.nx * lat; m.y = f.A[1] + f.uy * sAlong + f.ny * lat;
    }
  }
}

// ---------------------------------------------------------------- 塔
function famOf(t) { return D.towers[t.fam]; }
function curLevel(t) { return t.levels[t.lv]; }
function towerFood(fam) { return fam === 'hero' ? 1 : Math.max(0, D.towers[fam].levels[0].food || 0); }
function foodUsed() { return G.towers.reduce((s, t) => s + (t.food || 0), 0); }
// 建造网格：格子中心在 64 的倍数上；塔占 3×3 格，中心对齐格子中心
const FOOT_HALF = TOWER_CELLS * CELL / 2;                         // 96
// 地形本身能不能建（不看塔）：格子完全在边界内、不碰路的禁建带、不碰出怪口
function cellBuildable(cx, cy) {
  const h = CELL / 2;
  if (Math.abs(cx) + h > BUILD_LIM || Math.abs(cy) + h > BUILD_LIM) return false;
  for (const [a, b] of ROAD_SEGS) {
    if (cx + h > Math.min(a[0], b[0]) - ROAD_BLOCK && cx - h < Math.max(a[0], b[0]) + ROAD_BLOCK &&
        cy + h > Math.min(a[1], b[1]) - ROAD_BLOCK && cy - h < Math.max(a[1], b[1]) + ROAD_BLOCK) return false;
  }
  const [sx0, sy0] = NODES.I;
  if (Math.abs(cx - sx0) < 352 && Math.abs(cy - sy0) < 352) return false;
  return true;
}
// 格子是否被塔（或排队中的建造命令）占了
function cellTaken(cx, cy, withOrders) {
  for (const t of G.towers) if (t.cat !== 'summon' && Math.abs(cx - t.x) < FOOT_HALF && Math.abs(cy - t.y) < FOOT_HALF) return true;
  if (withOrders) for (const o of buildOrders()) if (Math.abs(cx - o.x) < FOOT_HALF && Math.abs(cy - o.y) < FOOT_HALF) return true;
  return false;
}
const buildOrders = () => { const b = G.builder; return [b.order, ...(b.queue || [])].filter(o => o && o.kind === 'build'); };
const footCells = (x, y) => { const r = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) r.push([x + i * CELL, y + j * CELL]); return r; };
function canPlace(x, y, withOrders = false) {
  return footCells(x, y).every(([cx, cy]) => cellBuildable(cx, cy) && !cellTaken(cx, cy, withOrders));
}
function buildTower(fam, x, y) {
  if (fam === 'hero') return buildHero(x, y);
  const f = D.towers[fam], lv0 = f.levels[0];
  if (f.cat === 'main' && G.towers.some(t => t.cat === 'main')) return msg('只能建造一个主塔');
  if (f.cat === 'aura' && G.towers.filter(t => t.fam === fam).length >= RULE.maxAuraPerKind) return msg('随机模式每种光环限制 2 个');
  if (G.gold < lv0.gold) return msg('金币不足');
  if (foodUsed() + (lv0.food || 0) > G.foodCap) return msg('人口不足（12 木材可买 1 人口）');
  G.gold -= lv0.gold;
  const t = { id: G.nextId++, fam, cat: f.cat, x, y, lv: 0, levels: f.levels, spent: lv0.gold, food: lv0.food || 0,
    cdLeft: 0, kills: 0, dealt: 0, attacks: 0, mana: 0, angle: 0, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0 };
  G.towers.push(t);
  return t;
}
function upgradeTower(t, branchKey) {
  const f = famOf(t);
  let next;
  if (branchKey) { next = f.branches[branchKey][0]; }
  else next = t.levels[t.lv + 1];
  if (!next) return;
  if (G.gold < next.gold) return msg('金币不足');
  G.gold -= next.gold; t.spent += next.gold;
  if (branchKey) { t.levels = [t.levels[0]].concat(f.branches[branchKey]); t.branch = branchKey; }
  t.lv++;
  uiDirty();
}
function sellTower(t) {
  G.gold += t.spent;                      // ConstructionRefundRate = UpgradeRefundRate = 1.0
  if (t.isHero) G.hero = null;
  G.towers = G.towers.filter(x => x !== t);
  G.zones = G.zones.filter(z => z.owner !== t);
  if (G.selected === t) G.selected = G.builder;
  G.menu = 'main'; uiDirty();
}

// ---------------------------------------------------------------- 守卫者 (移动 / 走到目标再建造 / 闪烁)
function giveOrder(o, queue) { const b = G.builder; if (queue && b.order) (b.queue = b.queue || []).push(o); else { b.order = o; b.queue = []; } }
function orderMove(x, y, queue) { giveOrder({ kind: 'move', x, y }, queue); addFx({ kind: 'mark', x, y, life: 0.6, color: '#6fd17a' }); }
function orderBuild(fam, x, y, queue) {
  const cost = fam === 'hero' ? D.heroes[G.heroChoice].gold : D.towers[fam].levels[0].gold;
  const food = fam === 'hero' ? 1 : D.towers[fam].levels[0].food || 0;
  if (G.gold < cost) return msg('金币不足'), false;
  if (foodUsed() + food > G.foodCap) return msg('人口不足（12 木材可买 1 人口）'), false;
  giveOrder({ kind: 'build', fam, x, y }, queue);
  return true;
}
function builderUpdate(dt) {
  const b = G.builder, o = b.order;
  b.blinkCd = Math.max(0, b.blinkCd - dt);
  if (!o) return;
  const reach = o.kind === 'build' ? 220 : 8;
  const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
  if (d <= reach) {
    if (o.kind === 'build') {
      if (!canPlace(o.x, o.y)) msg('目标位置已被占用');
      else { const t = buildTower(o.fam, o.x, o.y); if (t) { addFx({ kind: 'ring', x: t.x, y: t.y, r: 160, life: 0.5, color: '#ffd257' }); b.buildT = G.t; b.face = Math.atan2(o.y - b.y, o.x - b.x); } }
      uiDirty();
    }
    b.order = (b.queue && b.queue.shift()) || null; return;     // Shift 排队的下一个命令
  }
  const stepLen = Math.min(d - reach + 1, b.speed * dt);
  b.x += dx / d * stepLen; b.y += dy / d * stepLen; b.face = Math.atan2(dy, dx);
}
function blinkTo(x, y) {
  const b = G.builder;
  if (b.blinkCd > 0) return msg('闪烁冷却中');
  addFx({ kind: 'ring', x: b.x, y: b.y, r: 120, life: 0.4, color: '#c48bff' });
  b.x = clamp(x, -WORLD, WORLD); b.y = clamp(y, -WORLD, WORLD); b.order = null; b.queue = []; b.blinkCd = 1;
  addFx({ kind: 'ring', x: b.x, y: b.y, r: 120, life: 0.4, color: '#c48bff' });
}

function towerStats(t) {
  if (t.isHero) return heroStats(t);
  const lv = curLevel(t);
  return { dmg: lv.dmg, cd: lv.cd, range: lv.range, atk: lv.atk, targets: lv.targets || 1 };
}
function inRange(x, y, r) { return G.monsters.filter(m => !m.dead && dist2(x, y, m.x, m.y) <= r * r); }
function nearest(x, y, r) {
  let best = null, bd = r * r;
  for (const m of G.monsters) { if (m.dead) continue; const d = dist2(x, y, m.x, m.y); if (d <= bd) { bd = d; best = m; } }
  return best;
}
// ---------------------------------------------------------------- 弹道（fx.js）：按塔的种类和攻击属性选择飞行物，伤害在命中时结算
const FXS = window.FX.create();
const MISSILE = {
  魔幻塔: 'arcaneDagger', 冰霜塔: 'frostBolt', 灵魂塔: 'soulWisp', 闪电塔: 'lightning', 箭塔: 'arrow', 巨箭塔: 'ballista',
  毒塔: 'poison', 腐蚀塔: 'acid', 群攻塔: 'cannon', 牛头塔: 'boulder', 寒冰塔: 'iceSpear', 神圣塔: 'holyBeam', 天神塔: 'holy',
  剑圣塔: 'windSlash', 通灵塔: 'necro', 混乱塔: 'chaosOrb', 破坏塔: 'arcaneMissile', 暴击塔: 'thrownAxe', 重击塔: 'stormHammer',
  图腾塔: 'elemOrb', 精灵塔: 'wisp', 地精塔: 'rocket', 弹跳塔: 'moonGlaive', 炎魔: 'fireball',
  'hero:剑神': 'windSlash', 'hero:枪神': 'bullet', 'hero:邪冰': 'frostBolt', 'hero:火魂': 'fireball',
};
const BY_ATK = { normal: 'thrownAxe', pierce: 'arrow', magic: 'elemOrb', chaos: 'chaosOrb', hero: 'holy' };
// 发射点高度（世界单位，约 80 = 1 米）：塔座 0.6 米 + 角色手部；器械塔从顶上的球 / 线圈发出
const MUZZLE = { lightning: 175, elemOrb: 170, holyBeam: 190, cannon: 120, boulder: 150, rocket: 130, ballista: 120, arrow: 150 };
const missileOf = t => MISSILE[t.isHero ? 'hero:' + t.heroName : t.fam] || BY_ATK[t.isHero ? heroStats(t).atk : curLevel(t).atk] || 'arcaneDagger';
const muzzle = (t, style) => ({ x: t.x, y: t.y, z: (MUZZLE[style] || 150) + (t.isHero ? 30 : 0) });
function shot(t, m) { t.face = Math.atan2(m.y - t.y, m.x - t.x); }

function towerUpdate(t, dt) {
  if (t.cat === 'aura') return;
  if (t.isHero) heroTick(t, dt);
  const st = towerStats(t);
  const asMul = (1 + t.buffAS) * (1 - t.eliteAS);
  t.dmgMul = (1 + t.buffDmg) * (1 - t.eliteWeak);
  if (t.fam === '扫射塔') return sweepUpdate(t, dt, st);
  t.cdLeft -= dt * asMul;
  if (t.cdLeft > 0) return;
  const target = nearest(t.x, t.y, st.range);
  if (!target) { t.cdLeft = 0; return; }
  t.cdLeft += st.cd;
  t.attacks++; t.atkT = G.t;
  if (t.isHero) return heroAttack(t, target, st);
  attack(t, target, st);
}

// 普通塔一次攻击 (按 WC3 技能代码解释附加效果)
function attack(t, target, st) {
  const lv = curLevel(t), col = ATK_COLOR[st.atk];
  let dmg = st.dmg;
  // 致命一击
  const crit = abil(lv, 'AOcr');
  if (crit && Math.random() * 100 < (crit.A || 25)) { dmg *= crit.B || 3; addFx({ kind: 'text', x: target.x, y: target.y, text: '暴击', life: 0.6, color: '#ffd257' }); }
  // 目标集合
  let targets = [target];
  const n = st.targets > 1 ? st.targets : 1;
  if (t.fam === '破坏塔') targets = inRange(t.x, t.y, st.range).slice(0, t.lv === 0 ? 4 : 3 + t.lv);
  else if (t.fam === '弹跳塔') targets = chainTargets(target, n, 500);
  else if (n > 1) targets = [target].concat(inRange(t.x, t.y, st.range).filter(m => m !== target).slice(0, n - 1));
  if (t.fam === '箭塔' && t.attacks % 3 === 0) targets = inRange(t.x, t.y, st.range);                 // 每 3 次攻击打全部
  if (t.fam === '通灵塔' && t.attacks % 10 === 0) { t.necroUntil = G.t + 1; }                         // 每 10 击 6 倍 1 秒
  if (t.necroUntil > G.t) dmg *= 6;
  const style = missileOf(t), from = muzzle(t, style);
  shot(t, target);
  // 主目标命中后的范围效果（目标在飞行途中死了，就以落点为中心）
  const area = (hit, x, y) => {
    const c = hit || { x, y };
    if (t.fam === '牛头塔') splash(t, c, 300, dmg, st.atk);
    if (t.fam === '群攻塔') { splash(t, c, 300, dmg, st.atk); stunArea(c, 300, 0.1); }
    if (t.fam === '寒冰塔') {                                                          // 爆冰术：300 范围混乱伤害 + 减速 30%
      const ice = [250, 1000, 2250, 4000, 6250][t.lv];
      for (const m of inRange(c.x, c.y, 300)) { hurt(m, ice, 'chaos', t); slowM(m, 0.3, 6); }
    }
    if (t.fam === '天神塔') {                                                          // 300 范围两种伤害随机
      const types = t.godTypes || ['normal', 'magic'];
      for (const m of inRange(c.x, c.y, 300)) if (m !== hit) hurt(m, dmg * rnd(0.5, 1), pick(types), t);
      FXS.ring(c.x, c.y, 300, '#ffe9a0', 0.3, 4);
    }
  };
  const land = (m, primary) => (hit, x, y) => {
    if (hit) { hurt(hit, dmg, st.atk, t); onHitEffects(t, lv, hit, st); }
    if (primary) area(hit, x, y);
  };
  if (t.fam === '弹跳塔') {                     // 月刃依次弹到下一个目标
    const hop = (i, src) => { if (i >= targets.length) return;
      FXS.launch(style, src, targets[i], (hit, x, y) => { land(targets[i], i === 0)(hit, x, y); hop(i + 1, { x, y, z: 50 }); }); };
    return hop(0, from);
  }
  for (const m of targets) FXS.launch(style, from, m, land(m, m === target));
}
function onHitEffects(t, lv, m, st) {
  const bash = abil(lv, 'AHbh');
  if (bash && t.fam !== '群攻塔' && Math.random() * 100 < (bash.A || 0)) {
    if (bash.C) hurt(m, bash.C, st.atk, t);
    stun(m, bash.dur || 1);
  }
  const corr = abil(lv, 'AIcb');
  if (corr) { m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, corr.B || 10); m.shredUntil = G.t + (corr.dur || 5); }
  const sl = abil(lv, 'Aven');
  if (sl) slowM(m, sl.B || 0.2, sl.dur || 5);
  const po = abil(lv, 'Aspo');
  if (po) { m.dots.push({ dps: Math.max(po.A || 10, st.dmg * 0.2), until: G.t + 5, atk: st.atk, src: t }); slowM(m, po.B || 0.2, 4); }
  if (t.fam === '闪电塔') { if (Math.random() < 0.04) hurt(m, 10000, 'magic', t); if (Math.random() < 0.05) stun(m, 2); }
  if (t.fam === '混乱塔' && t.lv === t.levels.length - 1 && m.type === 'divine' && !m.boss && Math.random() < 0.02) hurt(m, m.hp * 10, 'hero', t, { ignoreArmor: true });
}
function chainTargets(first, n, jump) {
  const out = [first];
  let cur = first;
  while (out.length < n) {
    let best = null, bd = jump * jump;
    for (const m of G.monsters) { if (m.dead || out.includes(m)) continue; const d = dist2(cur.x, cur.y, m.x, m.y); if (d < bd) { bd = d; best = m; } }
    if (!best) break;
    out.push(best); cur = best;
  }
  return out;
}
function splash(t, center, r, dmg, atk) {
  for (const m of inRange(center.x, center.y, r)) if (m !== center) hurt(m, dmg, atk, t);
  addFx({ kind: 'ring', x: center.x, y: center.y, r, life: 0.25, color: ATK_COLOR[atk] });
}
function stun(m, s) { if (!m.boss) m.stunUntil = Math.max(m.stunUntil, G.t + s); }
function stunArea(c, r, s) { for (const m of inRange(c.x, c.y, r)) stun(m, s); }
function slowM(m, v, s) { if (G.t >= m.slowUntil || v >= m.slow) { m.slow = v; } m.slowUntil = Math.max(m.slowUntil, G.t + s); }

// 扫射塔：360 度旋转射线 (穿透之箭 AUcs，射线长 600，宽 100，CD 0.1/0.05 秒，无视护甲)
function sweepUpdate(t, dt, st) {
  const lv = curLevel(t), arrow = abil(lv, 'AUcs');
  const asMul = (1 + t.buffAS) * (1 - t.eliteAS);
  t.angle = (t.angle + dt * 2.2 * asMul) % (Math.PI * 2);
  t.cdLeft -= dt * asMul;
  if (t.cdLeft > 0) return;
  t.cdLeft += arrow ? arrow.cool || 0.1 : 0.1;
  const len = 600 + t.lv * 40, ex = t.x + Math.cos(t.angle) * len, ey = t.y + Math.sin(t.angle) * len;
  const dmg = arrow ? arrow.A : 6;
  for (const m of G.monsters) {
    if (m.dead) continue;
    if (segDist2(m.x, m.y, [t.x, t.y], [ex, ey]) < (100 + m.r) ** 2) hurt(m, dmg, 'magic', t, { ignoreArmor: true });
  }
  FXS.beam(t.x, t.y, 150, ex, ey, 40, '#7ab8ff', 1.3, 0.09);
}

// ---------------------------------------------------------------- 英雄塔
const HERO_KITS = {
  // 每个技能：init(hero) 学会时；onAttack(hero, target) 攻击时触发（被动）；
  // 主动技能：cd 冷却秒数 + cast(hero, target)，可以按热键施放，也会自动施放（右键切换自动施放）；cast 返回 false 表示没放出去（不进冷却）
  剑神: [
    { cd: 8, cast(h, tg) { zone(h, tg.x, tg.y, 400, 5, lerpStat(20, 30000, h.stat.agi, 240), 'magic', () => ({ dmg: h.stat.int * 700, atk: 'chaos', ignore: h.stat.agi > 400 }), 'bladestorm'); } },
    { onAttack(h, tg) {
      const ig = h.stat.int >= 400, k = ig ? 0.33 : 1;
      if (Math.random() < 0.15 * k) aoe(h, tg, 120, h.stat.str * 960, 'pierce', ig);
      if (Math.random() < 0.30 * k) aoe(h, tg, 240, h.stat.agi * 300, 'magic', ig);
      if (Math.random() < 0.60 * k) aoe(h, tg, 360, h.stat.int * 120, 'chaos', ig);
    } },
    { onAttack(h, tg) { if (Math.random() < 0.2 && G.zones.filter(z => z.owner === h && z.r === 180).length < 5) zone(h, tg.x, tg.y, 180, 3, lerpStat(10, 20000, h.stat.agi, 200), 'magic', () => ({ dmg: h.stat.str * lerpStat(20, 800, h.stat.str, 400), atk: 'pierce' }), 'bladestorm'); } },
    { init(h) { h.asBonus += 1.0; }, critChance: 0.05, critMul: 50 },
  ],
  枪神: [
    { critChance: 0.06, critMul: 9, onAttack(h, tg) { if (Math.random() < 0.06) hurt(tg, h.stat.str * h.level, 'pierce', h); } },
    { critChance: 0.09, critMul: 6, onAttack(h, tg) {
      const crit = Math.random() < 0.02 ? 10 : 1;
      aoe(h, tg, 300, lerpStat(20, 15000, h.stat.int, 300) * crit, 'magic', true, '#ff8a3c');
      if (Math.random() < 0.09) hurt(tg, h.stat.agi * h.level, 'magic', h);
    } },
    { critChance: 0.12, critMul: 3, onAttack(h, tg) { if (Math.random() < 0.12) hurt(tg, h.stat.int * h.level, 'chaos', h); } },
    { init(h) { h.asBonus += 0.8; }, critChance: 0.03, critMul: 12, onAttack(h, tg) { if (Math.random() < 0.03) hurt(tg, 3000 * h.level, 'hero', h, { ignoreArmor: true }); } },
  ],
  邪冰: [
    { cd: 5, cast(h, tg) {
      const X = h.stat.str > 400 ? 40 : h.stat.str > 300 ? 120 : h.stat.str > 200 ? 80 : h.stat.str > 100 ? 40 : 10, x = tg.x, y = tg.y;
      for (let i = 0; i < 6; i++) later(i * 0.15, () => {
        const hx = x + rnd(-60, 60), hy = y + rnd(-60, 60);
        FXS.fall(hx, hy, { z: 800, dur: 0.3, color: '#bfefff', core: '#ffffff', size: 22, rock: 'rgba(220,245,255,.9)', onEnd: () => {
          for (const m of inRange(x, y, 150)) { hurt(m, h.stat.str * X, 'normal', h, { ignoreArmor: h.stat.str > 400 }); m.armorDown = 160; m.armorDownUntil = G.t + 4; }
          FXS.snow(hx, hy, 20, 1.2); FXS.nova(hx, hy, 170, '#bfefff', 0.3);
        } });
      });
    } },
    { init(h) { h.stat.str += 20; h.stat.agi += 30; h.stat.int += 40; }, critChance: 0.2, critMul: 40 },
    { cd: 6, cast(h, tg) {
      const a = h.stat.agi, X = a > 400 ? 90 : a > 300 ? 240 : a > 200 ? 120 : a > 100 ? 60 : 15, x = tg.x, y = tg.y;
      for (let i = 0; i < 5; i++) later(i * 0.3, () => { for (const m of inRange(x, y, 300)) { hurt(m, a * X, 'chaos', h, { ignoreArmor: a > 400 }); slowM(m, 0.3, 2.5); } FXS.flash(x, y, 40, '#c48bff', 160); FXS.nova(x, y, 300, '#c48bff', 0.35); FXS.snow(x, y, 30, 0.8); });
    } },
    { cd: 4, cast(h) {
      for (const m of inRange(h.x, h.y, 900)) { stun(m, 0.5); hurt(m, lerpStat(50, 36000, h.stat.int, 320), 'magic', h); slowM(m, 0.45, 4); FXS.snow(m.x, m.y, 40, 0.5); }
      FXS.nova(h.x, h.y, 900, '#7ab8ff', 0.6); addFx({ kind: 'ring', x: h.x, y: h.y, r: 900, life: 0.5, color: '#bfefff' });
    } },
  ],
  火魂: [
    { onAttack(h, tg) { tg.burn = { dps: lerpStat(40, 150000, h.stat.str, 350), src: h }; } },
    { cd: 0.8, cast(h) {
      const ms = inRange(h.x, h.y, heroStats(h).range); if (!ms.length) return false;
      const tg = pick(ms), a = h.stat.agi, X = a < 100 ? 10 : a < 200 ? 30 : a < 300 ? 60 : a < 400 ? 120 : a < 500 ? 250 : 420;
      const fx0 = tg.x, fy0 = tg.y;
      FXS.fall(fx0, fy0, { z: 500, dur: 0.22, color: '#ff8a3c', core: '#ffe08a', size: 16, onEnd: () => { aoe(h, { x: fx0, y: fy0 }, 200, a * X, 'pierce', false, '#ff8a3c'); FXS.explosion(fx0, fy0, 0.5, '#ff8a3c'); } });
    } },
    { cd: 4, cast(h) {
      const ms = inRange(h.x, h.y, heroStats(h).range); if (!ms.length) return false;
      const tg = pick(ms);
      const mx0 = tg.x, my0 = tg.y;
      FXS.fall(mx0, my0, { z: 1100, dx: -500, dy: 260, dur: 0.45, color: '#ff6a2a', core: '#fff0b0', size: 40, rock: '#3a2014', onEnd: () => {
        aoe(h, { x: mx0, y: my0 }, 350, lerpStat(50, 30000, h.stat.int, 280), 'magic', true, '#ff5a4f');
        FXS.explosion(mx0, my0, 1.3, '#ff5a4f'); FXS.nova(mx0, my0, 380, '#ff7a3a', 0.45); FXS.splat(mx0, my0, '#2a1a10'); FXS.debris(mx0, my0, '#5a3a20');
      } });
    } },
    { cd: 10, needsTarget: false, cast(h) {
      if (G.towers.filter(t => t.summonOf === h && t.until > G.t).length >= 4) { msg('炎魔最多同时存在 4 个'); return false; }
      const ang = Math.random() * Math.PI * 2;
      const x = h.x + Math.cos(ang) * 250, y = h.y + Math.sin(ang) * 250;
      G.towers.push({ id: G.nextId++, fam: '炎魔', cat: 'summon', summonOf: h, owner: h, x, y, lv: 0, cdLeft: 0, until: G.t + 30, food: 0, spent: 0,
        levels: [{ dmg: lerpStat(20, 10000, h.stat.str, 180), cd: 1, range: 600, atk: 'chaos', targets: 1, abils: [] }], buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0 });
      FXS.explosion(x, y, 0.6, '#ff5a2a');
    } },
  ],
};
const statCN = s => ({ str: '力量', agi: '敏捷', int: '智力' })[s];
function buildHero(x, y) {
  if (G.hero) return msg('英雄塔只能建造一个');
  const hd = D.heroes[G.heroChoice];
  if (G.gold < hd.gold) return msg('金币不足');
  if (foodUsed() + 1 > G.foodCap) return msg('人口不足');
  G.gold -= hd.gold;
  const h = { id: G.nextId++, isHero: true, fam: 'hero', heroName: hd.name, cat: 'hero', x, y, lv: 0, level: 1, spent: hd.gold, food: 1,
    stat: { str: 10, agi: 10, int: 10 }, growth: 'str', points: 0, mana: 0, learned: [], cdLeft: 0, cds: {}, auto: {}, asBonus: 0,
    kills: 0, dealt: 0, attacks: 0, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, levels: [{}],
    maxMana() { return D.heroes[this.heroName].mana || 1000; } };
  G.towers.push(h); G.hero = h;
  return h;
}
function heroStats(h) {
  const hd = D.heroes[h.heroName];
  return { dmg: 9 + h.stat.str * 5, cd: hd.cd / (1 + h.stat.agi * 0.01 + h.asBonus), range: hd.range, atk: hd.atk, targets: 1 };
}
function heroTick(h, dt) {
  h.mana = Math.min(h.maxMana(), h.mana + dt * h.stat.int * 0.01);   // IntRegenBonus = 0.01
  for (const i of h.learned) {
    const s = HERO_KITS[h.heroName][i];
    if (s.tick) s.tick(h, dt);
    if (s.cast && h.auto[i] !== false && skillReady(h, i)) castSkill(h, i, true);     // 自动施放
  }
}
// 主动技能：冷却剩余秒数 / 是否可放 / 施放
const skillCdLeft = (h, i) => Math.max(0, (h.cds['s' + i] || 0) - G.t);
const skillReady = (h, i) => skillCdLeft(h, i) <= 0;
function castSkill(h, i, auto) {
  const s = HERO_KITS[h.heroName][i];
  if (!s || !s.cast || !h.learned.includes(i)) return;
  if (!skillReady(h, i)) return auto ? null : msg(`${D.heroes[h.heroName].skills[i].name} 冷却中（${skillCdLeft(h, i).toFixed(1)} 秒）`);
  const tg = nearest(h.x, h.y, heroStats(h).range + 200);
  if (!tg && s.needsTarget !== false) return auto ? null : msg('射程内没有敌人');
  if (s.cast(h, tg) === false) return;
  h.cds['s' + i] = G.t + s.cd; h.spellT = G.t;
  if (tg) h.face = Math.atan2(tg.y - h.y, tg.x - h.x);
  if (!auto) addFx({ kind: 'text', x: h.x, y: h.y + 60, text: D.heroes[h.heroName].skills[i].name, life: 0.8, color: '#9fe3ff' });
}
function heroAttack(h, tg, st) {
  let dmg = st.dmg;
  for (const i of h.learned) { const s = HERO_KITS[h.heroName][i]; if (s.critChance && Math.random() < s.critChance) { dmg *= s.critMul; addFx({ kind: 'text', x: tg.x, y: tg.y, text: s.critMul + '倍', life: 0.7, color: '#ffd257' }); break; } }
  shot(h, tg);
  const style = missileOf(h);
  FXS.launch(style, muzzle(h, style), tg, hit => {
    if (!hit) return;
    hurt(hit, dmg, st.atk, h);
    for (const i of h.learned) { const s = HERO_KITS[h.heroName][i]; if (s.onAttack) s.onAttack(h, hit); }
  }, { scale: 1.3 });
}
function aoe(h, c, r, dmg, atk, ignoreArmor, color) {
  for (const m of inRange(c.x, c.y, r)) hurt(m, dmg, atk, h, { ignoreArmor });
  addFx({ kind: 'ring', x: c.x, y: c.y, r, life: 0.25, color: color || ATK_COLOR[atk] });
}
function zone(owner, x, y, r, dur, dps, atk, endFn, style) {
  G.zones.push({ owner, x, y, r, t0: G.t, until: G.t + dur, dps, atk, endFn, style, fxT: 0 });
  if (style === 'bladestorm') { FXS.nova(x, y, r, '#9fe3ff', 0.4); FXS.flash(x, y, 60, '#bff4ff', r * 0.5); FXS.dust(x, y, '#a08860', Math.round(r / 30)); }
}
function later(s, fn) { G.timeouts.push({ at: G.t + s, fn }); }
const LEARN_COST = [{ wood: 0, str: 0 }, { wood: 18, str: 80 }, { wood: 36, str: 160 }, { wood: 54, str: 240 }];
function learnSkill(h, i) {
  if (h.learned.length >= 4 && !h.learned.includes(i)) return msg('最多学习 4 个技能');
  const c = LEARN_COST[h.learned.length];
  if (!c) return msg('最多学习 4 个技能');
  if (h.learned.includes(i)) return msg('你已经学习了这个技能');
  if (h.stat.str < c.str) return msg(`需要力量达到 ${c.str}`);
  if (G.wood < c.wood) return msg('木材不足');
  G.wood -= c.wood; h.learned.push(i);
  const s = HERO_KITS[h.heroName][i]; if (s.init) s.init(h);
  msg(`学会了 ${D.heroes[h.heroName].skills[i].name}` + (s.cast ? `，按 ${['Q', 'W', 'E', 'R'][i]} 施放` : '（被动）'));
  G.menu = 'main';                                   // 学完回到英雄面板，技能就在第一行
  uiDirty();
}
function heroLevelUp(h) {
  const max = h.level >= 30;
  const gold = max ? 500 : h.level * 100, mana = max ? 400 : 200;
  if (G.gold < gold) return msg('金币不足');
  if (h.mana < mana) return msg('魔法值不足（升级需要 ' + mana + ' 魔法）');
  G.gold -= gold; h.mana -= mana; h.spent += gold;
  if (max) h.stat[h.growth] += 3;
  else { h.level++; h.stat.str += 1; h.stat.agi += 1; h.stat.int += 1; h.stat[h.growth] += 2; }
  uiDirty();
}

// ---------------------------------------------------------------- 光环 (每帧重算)
function applyAuras() {
  for (const m of G.monsters) { m.auraArmor = 0; m.auraSlow = 0; m.auraSpeed = 0; m.auraRegen = 0; }
  for (const t of G.towers) { t.buffAS = 0; t.buffDmg = 0; t.eliteAS = 0; t.eliteWeak = 0; }
  // 光环塔 (同类光环不叠加，取最大)
  let armorAuras = [], slowAuras = [];
  for (const a of G.towers) {
    if (a.cat !== 'aura') continue;
    const lv = curLevel(a), ab = lv.abils[0];
    if (!ab) continue;
    const r = ab.area || 900;
    if (a.fam === '加速光环') for (const t of G.towers) { if (dist2(a.x, a.y, t.x, t.y) <= r * r) t.buffAS = Math.max(t.buffAS, ab.A); }
    if (a.fam === '攻击光环') for (const t of G.towers) { if (dist2(a.x, a.y, t.x, t.y) <= r * r) t.buffDmg = Math.max(t.buffDmg, ab.A); }
    if (a.fam === '减防光环') armorAuras.push([a, r, -ab.A]);
    if (a.fam === '减速光环') slowAuras.push([a, r, -ab.A]);
  }
  for (const m of G.monsters) {
    if (m.dead) continue;
    for (const [a, r, v] of armorAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraArmor = Math.min(m.auraArmor, -v);
    for (const [a, r, v] of slowAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraSlow = Math.max(m.auraSlow, v);
  }
  // 精英怪光环 (900 范围)
  for (const e of G.monsters) {
    if (e.dead || !e.elite) continue;
    const { aura, lvl } = e.elite, v = aura.v[lvl - 1];
    if (aura.key === 'focus' || aura.key === 'endur' || aura.key === 'unholy') {
      for (const m of G.monsters) {
        if (m.dead || dist2(e.x, e.y, m.x, m.y) > 900 * 900) continue;
        if (aura.key === 'focus') m.auraArmor = Math.max(m.auraArmor, m.auraArmor + v);
        if (aura.key === 'endur') m.auraSpeed = Math.max(m.auraSpeed, v);
        if (aura.key === 'unholy') m.auraRegen = Math.max(m.auraRegen, v);
      }
    } else {
      for (const t of G.towers) {
        if (dist2(e.x, e.y, t.x, t.y) > 900 * 900) continue;
        if (aura.key === 'slowas') t.eliteAS = Math.max(t.eliteAS, v);
        if (aura.key === 'weak') t.eliteWeak = Math.max(t.eliteWeak, v);
      }
    }
  }
}

// ---------------------------------------------------------------- 波次
function monstersAlive() { return G.monsters.filter(m => !m.dead).length; }
function cap() { return G.final && G.final.endless ? 15 : RULE.capPerPlayer; }
function startSpawner(id, word) {
  const s = SPAWNER[word] || SPAWNER['中'];
  G.spawners.push({ id, every: s.every, left: s.count, next: 0 });
}
// 由提示里的"多/中/少"选怪：多→有效生命（生命×护甲系数）最低的，少→最高的
function pickMonster(pool, word) {
  const ehp = i => D.units[i].hp * (1 + 0.02 * Math.max(0, D.units[i].armor));
  const ps = pool.filter(i => D.units[i]).sort((a, b) => ehp(a) - ehp(b));
  if (!ps.length) return null;
  if (word === '多') return ps[0];
  if (word === '少') return ps[ps.length - 1];
  return ps[Math.floor((ps.length - 1) / 2)];
}
function startWave() {
  const lastWave = MODES[G.mode].waves;
  if (lastWave && G.wave >= lastWave) {           // 演示模式：最后一波打完（场上清空）就结束
    if (monstersAlive() === 0 && !G.spawners.length) return demoEnd();
    G.timer = 2; G.hint = `第 ${G.wave} 波已出完：清掉场上剩余的 ${monstersAlive()} 只怪物，演示结束`; return;
  }
  const alive = monstersAlive();
  G.wave++;
  if (alive === 0) { G.perfect++; msg(`Perfect +1（当前 ${G.perfect}）`); }
  G.score -= alive;
  G.gold += 8 + G.wave * 2;                 // 排名序号*8 + 波数*2 (单人排名 1)
  G.bossRule = null;
  let dur = G.interval;
  const n = G.wave;
  if (n <= 47) {
    const variant = pick(D.waves[String(n)]);
    const hint = pick(variant.hints);
    const [word, armor] = hint.split(' ');
    if (n === 10) dur = wave10(variant);
    else if (n === 20) dur = wave20(variant);
    else if (n === 30) dur = wave30();
    else if (n === 40) dur = wave40(variant);
    else {
      const id = pickMonster(variant.pool, word);
      if (id) startSpawner(id, word);
      for (const d of variant.direct) later(rnd(2, 10), () => spawnMonster(d, { boss: true }));
      setHint(n, hint, id);
    }
  } else if (n === 48) dur = wave48();
  else if (n === 49) dur = finalWave();
  G.timer = dur;
}
function setHint(n, hint, id) {
  const [word, armor] = (hint || '').split(' ');
  const u = id && D.units[id];
  const counter = COUNTER[armor];
  G.hint = `第 ${n} 波：<span class="tag" style="background:#333">${word || ''}</span>` +
    (armor ? `<span class="tag" style="background:${ARMOR_COLOR[u ? u.armorType : 'none']};color:#111">${armor}护甲</span>` : '') +
    (u ? ` ${u.name}（生命 ${fmt(u.hp * (1 + RULE.hpPerWave * G.wave) * G.hpScale)}，护甲 ${u.armor}，移速 ${u.speed}，赏金 ${u.bounty}）` : '') +
    (counter ? ` → 克制：<b style="color:${ATK_COLOR[counter]}">${ATK_CN[counter]}攻击</b>` : '');
}
function wave10(variant) {
  if (variant.pool.includes('nsqo')) {
    setHint(10, 'BOSS 魔法', 'nsqt');
    G.hint += '　坚持 60 秒，未杀死的 BOSS 会自动消失；每杀 1 只大红牛 +100 金';
    startSpawner('nsqo', '中');
    let killed = 0;
    for (let i = 0; i < 3; i++) later(i * 8, () => { const b = spawnMonster('nsqt', { boss: true }); if (b) b.onDeath = () => { killed++; }; });
    later(60, () => { for (const m of G.monsters) if (m.uid === 'nsqt' && !m.dead) { m.dead = true; } G.gold += killed * 100; msg(`BOSS 波通关！大红牛死亡 ${killed} 个，获得 ${killed * 100} 金币`); });
    return 80;
  }
  setHint(10, 'BOSS 魔法', 'nsqa');
  startSpawner('nsqa', '少');
  later(16, () => startSpawner('nsty', '多'));
  return 60;
}
function wave20(variant) {
  const bossId = variant.pool.includes('n06Z') ? 'n071' : 'nsko';
  setHint(20, 'BOSS 抗性', bossId);
  G.hint += '　<b style="color:#ff5a4f">100 秒内杀死所有 BOSS，否则游戏失败</b>';
  startSpawner(variant.pool.includes('n06Z') ? 'n06Z' : 'nsog', '少');
  const b = spawnMonster(bossId, { boss: true });
  G.bossRule = { killBy: G.t + 100, ids: [b] };
  return 100;
}
function wave30() {
  G.hint = '第 30 波：飞艇 BOSS 波　坚持 80 秒！击杀 8 艘以上飞艇奖励 20 木材';
  let killed = 0;
  for (let i = 0; i < 15; i++) later(i * 3, () => { const b = spawnMonster('ncim', { boss: true }); if (b) b.onDeath = () => { killed++; }; });
  later(78, () => { if (killed >= 8) { G.wood += 20; msg(`杀死 ${killed} 艘飞艇，获得 20 木材奖励`); } });
  return 80;
}
function wave40(variant) {
  const tank = pick(['nerw', 'nfor', 'nfod', 'nfot']);
  setHint(40, 'BOSS ' + ARMOR_CN[D.units[tank].armorType], tank);
  G.hint += '　坦克 + 嚣张的大游艇 + 疯狂的直升机';
  startSpawner(tank, '少');
  later(5, () => spawnMonster('n06Y', { boss: true }));
  later(10, () => spawnMonster('ndrj', { boss: true }));
  return G.interval + 30;
}
function wave48() {
  const id = pick(['Nalc', 'Nfir', 'Npbm', 'Ntin']);
  setHint(48, '熊猫BOSS ' + ARMOR_CN[D.units[id].armorType], id);
  G.hint += '　熊猫 BOSS 波（每秒回血 1000）';
  startSpawner(id, '少');
  return G.interval + 10;
}
function finalWave() {
  const dragon = pick(['nrdk', 'nrdr', 'nbzd', 'ngrd']);    // 单人 (容怪数 ≤ 50)：随机 1 条龙
  G.final = { left: 0, deadline: G.t + 300 };
  const reg = b => { if (!b) return; G.final.left++; b.onDeath = () => { G.final.left--; }; };
  setHint('最终', 'BOSS ' + ARMOR_CN[D.units[dragon].armorType], dragon);
  G.hint = '<b>最终 BOSS 波</b>：' + G.hint.replace(/^第 最终 波：/, '') + '　40 秒后魔王降临，300 秒内杀死所有龙和魔王即可通关！';
  reg(spawnMonster(dragon, { boss: true }));
  later(40, () => { msg('魔王：翻滚吧！'); reg(spawnMonster('Udea', { boss: true })); });
  return 300;
}

// ---------------------------------------------------------------- 主循环
function step(dt) {
  if (G.phase === 'over' || G.phase === 'win') return;
  G.t += dt;
  // 计时
  G.timer -= dt;
  if (G.timer <= 0) {
    if (G.phase === 'prep') { G.phase = 'run'; startWave(); }
    else if (G.wave < 49) startWave();
    else return gameOver('时间到，未能击杀最终 BOSS');
  }
  // 延时事件
  const due = G.timeouts.filter(x => x.at <= G.t);
  G.timeouts = G.timeouts.filter(x => x.at > G.t);
  due.forEach(x => x.fn());
  // 出怪
  for (const s of G.spawners) {
    s.next -= dt;
    while (s.next <= 0 && s.left > 0) { spawnMonster(s.id); s.left--; s.next += s.every; }
  }
  G.spawners = G.spawners.filter(s => s.left > 0);
  builderUpdate(dt);
  applyAuras();
  // 塔
  for (const t of G.towers) towerUpdate(t, dt);
  G.towers = G.towers.filter(t => !t.until || t.until > G.t);
  // 区域伤害 (剑魂等)
  for (const z of G.zones) {
    const victims = inRange(z.x, z.y, z.r);
    for (const m of victims) hurt(m, z.dps * dt, z.atk, z.owner);
    if (z.style === 'bladestorm' && (z.fxT -= dt) <= 0) {              // 剑魂扫过的怪身上冒刀光
      z.fxT = 0.09;
      for (let i = 0; i < Math.min(3, victims.length); i++) { const m = pick(victims); FXS.slash(m.x, m.y, 50, '#dff6ff'); FXS.sparks(m.x, m.y, 50, '#bfefff', 2, 200); }
      if (Math.random() < 0.5) { const a = rnd(0, TAU), d = z.r * rnd(0.6, 1); FXS.dust(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, '#9a8a6a', 1); }
    }
    if (z.until <= G.t && z.endFn) {
      const e = z.endFn(); aoe(z.owner, z, z.r, e.dmg, e.atk, e.ignore);
      if (z.style === 'bladestorm') { const c = ATK_COLOR[e.atk] || '#c48bff'; FXS.nova(z.x, z.y, z.r * 1.1, c, 0.5); FXS.flash(z.x, z.y, 40, c, z.r * 0.6); FXS.sparks(z.x, z.y, 40, c, 18, z.r * 1.2); }
    }
  }
  G.zones = G.zones.filter(z => z.until > G.t);
  // 怪物
  for (const m of G.monsters) {
    if (m.dead) continue;
    moveMonster(m, dt);
    if (m.burn) hurt(m, m.burn.dps * dt, 'magic', m.burn.src, { ignoreArmor: true });
    for (const d of m.dots) if (d.until > G.t) hurt(m, d.dps * dt, d.atk, d.src);
    m.dots = m.dots.filter(d => d.until > G.t);
    if (!m.dead) m.hp = Math.min(m.maxHp, m.hp + (m.regen + m.auraRegen * m.maxHp) * dt);
    if (m.shredUntil < G.t) m.shred = 0;
    if (m.armorDownUntil < G.t) m.armorDown = 0;
  }
  G.monsters = G.monsters.filter(m => !m.dead);
  separateMonsters();
  // 规则检查
  if (G.phase === 'run' && monstersAlive() > cap()) return gameOver(`当前怪数 ${monstersAlive()} 超过上限 ${cap()}`);
  if (G.bossRule && G.t > G.bossRule.killBy) {
    if (G.bossRule.ids.some(b => b && !b.dead)) return gameOver('100 秒内没有杀死所有 BOSS');
    G.bossRule = null;
  }
  if (G.bossRule && G.bossRule.ids.every(b => !b || b.dead)) { msg('BOSS 已全部击杀！'); G.bossRule = null; }
  if (G.final && G.final.left === 0 && G.t > G.final.deadline - 300 + 41) return victory();
  // 特效
  for (const f of G.fx) f.life -= dt;
  FXS.update(dt);
  G.fx = G.fx.filter(f => f.life > 0);
}
function gameOver(reason) {
  G.phase = 'over';
  showModal(`<h2>大家很厉害！很遗憾，还是失败了！</h2><p>${reason}</p>
    <p>到达第 <b>${G.wave}</b> 波 · 击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>
    <div class="row"><button class="primary" id="m-restart">再来一局</button></div>`);
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}
function demoEnd() {
  G.phase = 'win';
  showModal(`<h2>演示结束</h2><p>撑过了前 ${G.wave} 波。击杀 ${G.kills} · Perfect ${G.perfect} · 剩余 ${Math.floor(G.gold)} 金</p>
    <div class="row"><button class="primary" id="m-again">再演示一次</button><button id="m-restart">回到开始菜单</button></div>`);
  document.getElementById('m-again').onclick = () => { hideModal(); newGame('demo'); resize(); clampCam(); uiDirty(); };
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}
function victory() {
  G.phase = 'win';
  showModal(`<h2>通关！</h2><p>你杀死了最终 BOSS。击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>
    <p>${G.perfect >= 10 ? '原版中 Perfect ≥ 10 会开启无尽关卡（本复刻暂未实现）。' : 'Perfect 未达到 10，原版中不能开启无尽关卡。'}</p>
    <div class="row"><button class="primary" id="m-restart">再来一局</button></div>`);
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}


// ================================================================ 素材 (assets/manifest.js 里登记了图片就用图片，否则用几何图形占位)
const AM = window.ASSET_MANIFEST || {};
const IMG = {};
function img(key) {
  const src = AM.sprites && AM.sprites[key];
  if (!src) return null;
  if (!IMG[key]) { const i = new Image(); i.src = 'assets/' + src; IMG[key] = i; }
  return IMG[key].complete && IMG[key].naturalWidth ? IMG[key] : null;
}
const spriteKey = e => e.isBuilder ? 'builder' : e.isHero ? 'hero:' + e.heroName : e.uid ? 'unit:' + e.uid : e.fam ? 'tower:' + e.fam + ':' + (e.lv + 1) : null;
function entityImg(e) {
  const k = spriteKey(e); if (!k) return null;
  return img(k) || (e.fam && !e.isHero && img('tower:' + e.fam));
}

// ================================================================ 精灵表（tools/blender/render_sprites.py 出图 → tools/register_sprites.py 登记）
const SHEETS = window.SPRITE_SHEETS || {};
const SHEET_IMG = {};
function sheetByKey(key) {
  const m = SHEETS[key]; if (!m) return null;
  let im = SHEET_IMG[key];
  if (!im) { im = new Image(); im.src = 'assets/' + m.src; SHEET_IMG[key] = im; }
  return im.complete && im.naturalWidth ? { m, im } : null;
}
// 塔的档位外观：tower:魔幻塔:3 表示"从第 3 级起用"；找不超过当前等级的最高一档，没有就用基础外观
function towerSheet(fam, lv) {
  for (let l = lv; l >= 2; l--) if (SHEETS['tower:' + fam + ':' + l]) { const s = sheetByKey('tower:' + fam + ':' + l); if (s) return s; }
  return sheetByKey('tower:' + fam);
}
function sheetOf(e) {
  if (!e) return null;
  if (e.isBuilder) return sheetByKey('builder');
  if (e.isHero) return sheetByKey('hero:' + e.heroName);
  if (e.uid) return sheetByKey('unit:' + e.uid);
  if (e.fam && e.cat !== 'summon') return towerSheet(e.fam, e.lv + 1);
  return null;
}
// 方向：0=朝南(屏幕下) 1=西南 2=西 3=西北 4=北 5=东北 6=东 7=东南
function dirIndex(angle, dirs) {
  if (dirs <= 1 || angle == null) return 0;
  const step = Math.PI * 2 / dirs;
  return ((Math.round((-Math.PI / 2 - angle) / step) % dirs) + dirs) % dirs;
}
// 选动作：优先播放一次性动作（攻击/施法/建造/死亡），否则待机或行走
function pickAnim(e, m) {
  const A = m.actions, once = (name, t0) => A[name] && t0 != null && G.t - t0 < A[name].frames / A[name].fps ? [name, t0] : null;
  return (e.isHero && once('spell', e.spellT)) || once('attack', e.atkT) || (e.isBuilder && (A.build && e.buildT != null && G.t - e.buildT < 1.2) && ['build', e.buildT])
    || (e.uid || (e.isBuilder && e.order) ? (A.walk ? ['walk', 0] : null) : null) || (A.idle ? ['idle', 0] : A.walk ? ['walk', 0] : [Object.keys(A)[0], 0]);
}
function frameRect(m, name, t0, face, hold) {
  const a = m.actions[name];
  let f = Math.floor((G.t - t0) * a.fps);
  f = a.loop ? f % a.frames : Math.min(f, a.frames - 1);
  if (hold) f = a.frames - 1;
  const row = a.row + (a.dirs > 1 ? dirIndex(face, a.dirs) : 0);
  return [f * m.frameW, row * m.frameH, m.frameW, m.frameH];
}
// 在世界坐标 (x,y) 画精灵，返回画出来的顶部屏幕 y（用来放血条）
function drawSheet(sh, e, x, y, anim, scaleMul = 1, alpha = 1) {
  const { m, im } = sh, [name, t0, hold] = anim;
  const [fx, fy, fw, fh] = frameRect(m, name, t0, e.face, hold);
  const w = fw * m.unitsPerPixel * S * scaleMul, h = fh * m.unitsPerPixel * S * scaleMul;
  const px = sx(x) - w * m.anchor[0], py = sy(y) - h * m.anchor[1];
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, fx, fy, fw, fh, px, py, w, h);
  ctx.globalAlpha = 1;
  return py + h * 0.3;
}
function shadow(x, y, r) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), r, r * 0.45, 0, 0, 7); ctx.fill(); }
// 用精灵表第一帧做头像/图标（CSS 背景裁切）
function sheetThumb(sh, px) {
  if (!sh) return null;
  const { m } = sh, a = m.actions.idle || m.actions.walk || Object.values(m.actions)[0];
  const k = px / m.frameW * 1.4;                 // 放大一点，主体更饱满
  const fx = 0, fy = a.row * m.frameH;
  const ox = -fx * k - (m.frameW * k - px) / 2, oy = -fy * k - (m.frameH * k * m.anchor[1] - px * 0.82);
  return `background:#0b0f0b url('assets/${m.src}') ${ox}px ${oy}px / ${m.cols * m.frameW * k}px ${m.rows * m.frameH * k}px no-repeat`;
}

// 左上角快捷按钮：用模型正面（idle 第 1 帧，朝南）的头肩特写。
// 先按不透明像素求出模型的包围盒再裁切，不同体型的模型都能把头部放在中间；
// 用 file:// 打开时画布读不了像素，就退回按锚点估算的固定裁切。
const QT_DONE = new WeakMap();
function quickThumb(btn, key) {
  if (QT_DONE.get(btn) === key) return;
  if (!SHEETS[key]) { btn.querySelector('canvas.qt')?.remove(); btn.classList.remove('has-thumb'); QT_DONE.set(btn, key); return; }   // 没有模型：显示文字
  const sh = sheetByKey(key); if (!sh) return;
  const { m, im } = sh, a = m.actions.idle || m.actions.walk || Object.values(m.actions)[0];
  const fw = m.frameW, fh = m.frameH, fy = a.row * fh;
  let bx0 = fw * 0.2, bx1 = fw * 0.8, by0 = fh * 0.12, by1 = fh * m.anchor[1];
  try {
    const t = document.createElement('canvas'); t.width = fw; t.height = fh;
    const g = t.getContext('2d'); g.drawImage(im, 0, fy, fw, fh, 0, 0, fw, fh);
    const d = g.getImageData(0, 0, fw, fh).data;
    let x0 = fw, x1 = -1, y0 = fh, y1 = -1;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 > x0 && y1 > y0) { bx0 = x0; bx1 = x1; by0 = y0; by1 = y1; }
  } catch (_) { /* file:// 下画布被污染，用估算值 */ }
  const bw = bx1 - bx0, bh = by1 - by0;
  const side = Math.min(fw, Math.max(bw * 0.85, bh * 0.6));      // 头到腰
  const cx = (bx0 + bx1) / 2, top = by0 - side * 0.04;
  let cv2 = btn.querySelector('canvas.qt');
  if (!cv2) { cv2 = document.createElement('canvas'); cv2.className = 'qt'; btn.prepend(cv2); }
  const px = Math.round(btn.clientWidth * (window.devicePixelRatio || 1)) || 92;
  cv2.width = cv2.height = px;
  const g2 = cv2.getContext('2d'); g2.imageSmoothingQuality = 'high';
  g2.drawImage(im, cx - side / 2, fy + top, side, side, 0, 0, px, px);
  btn.classList.add('has-thumb');
  QT_DONE.set(btn, key);
}

// ================================================================ 镜头
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
let S = 0.05, BASE = 0.05, DPR = 1, W = 0, H = 0;
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = cv.width = Math.max(1, r.width * DPR); H = cv.height = Math.max(1, r.height * DPR);
  BASE = Math.min(W, H) / (WORLD * 2 + 300);
  const mr = mm.getBoundingClientRect();
  mm.width = Math.max(1, mr.width * DPR); mm.height = Math.max(1, mr.height * DPR);
  if (G) clampCam();
}
function clampCam() {
  const c = G.cam; c.zoom = clamp(c.zoom, 1, 6); S = BASE * c.zoom;
  const hw = W / 2 / S, hh = H / 2 / S, lim = WORLD + 150;
  c.x = hw >= lim ? 0 : clamp(c.x, -lim + hw, lim - hw);
  c.y = hh >= lim ? 0 : clamp(c.y, -lim + hh, lim - hh);
}
const sx = x => W / 2 + (x - G.cam.x) * S, sy = y => H / 2 - (y - G.cam.y) * S;
const wx = px => (px * DPR - W / 2) / S + G.cam.x, wy = py => G.cam.y - (py * DPR - H / 2) / S;
function centerOn(e) { G.cam.x = e.x; G.cam.y = e.y; clampCam(); }

// ================================================================ 渲染
let mouse = null, HOV = null;
const TER = window.Terrain.create({ world: WORLD, roadSegs: ROAD_SEGS, roadHalf: ROAD_HALF, spawn: NODES.I, center: [0, 0] });
function draw() {
  clampCam();
  const view = { W, H, S, cx: G.cam.x, cy: G.cam.y }, now = performance.now() / 1000;
  TER.drawGround(ctx, view, now);                 // 草地、路、路边细节、中央法阵、出怪口（terrain.js）
  label('出怪口', NODES.I[0], NODES.I[1] + 300, '#ffb0a8', 12);
  for (const z of G.zones) if (z.style !== 'bladestorm') { ctx.fillStyle = 'rgba(122,184,255,.18)'; ctx.beginPath(); ctx.arc(sx(z.x), sy(z.y), z.r * S, 0, 7); ctx.fill(); }
  for (const z of G.zones) if (z.style === 'bladestorm') drawBladestormGround(z);
  for (const t of G.towers) if (t.cat === 'aura') drawAuraGround(t, now);          // 光环塔：地面光环（在单位下面）
  for (const t of G.towers) if (t.cat !== 'aura' && t.cat !== 'summon' && !t.isHero) drawTierGround(t, now);   // 塔的等级光圈
  // 选中范围
  const sel = G.selected;
  if (sel && sel.fam) rangeCircle(sel.x, sel.y, sel.cat === 'aura' ? (curLevel(sel).abils[0] || {}).area || 900 : towerStats(sel).range, 'rgba(255,255,255,.35)');
  // 守卫者的移动/建造目标
  const b = G.builder;
  if (b.order) {
    ctx.strokeStyle = b.order.kind === 'build' ? 'rgba(255,210,87,.7)' : 'rgba(111,209,122,.7)'; ctx.lineWidth = 1.5 * DPR; ctx.setLineDash([5 * DPR, 5 * DPR]);
    ctx.beginPath(); ctx.moveTo(sx(b.x), sy(b.y)); ctx.lineTo(sx(b.order.x), sy(b.order.y)); ctx.stroke(); ctx.setLineDash([]);
    if (b.order.kind === 'build') { ctx.strokeStyle = 'rgba(255,210,87,.8)'; footRect(b.order.x, b.order.y); ctx.stroke(); }
  }
  if (b.queue && b.queue.length) {
    let px = b.order ? b.order.x : b.x, py = b.order ? b.order.y : b.y;
    ctx.strokeStyle = 'rgba(255,210,87,.45)'; ctx.setLineDash([4 * DPR, 6 * DPR]); ctx.beginPath(); ctx.moveTo(sx(px), sy(py));
    for (const q of b.queue) { ctx.lineTo(sx(q.x), sy(q.y)); if (q.kind === 'build') { ctx.stroke(); footRect(q.x, q.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx(q.x), sy(q.y)); } }
    ctx.stroke(); ctx.setLineDash([]);
  }
  TER.drawTrees(ctx, view);
  HOV = hovered();
  for (const t of G.towers) drawTower(t);
  for (const m of G.monsters) drawMonster(m);
  drawBuilder(b);
  for (const z of G.zones) if (z.style === 'bladestorm') drawBladestormSpirit(z);
  for (const f of G.fx) {
    ctx.globalAlpha = f.kind === 'corpse' ? 1 : clamp(f.life * 4, 0, 1);
    if (f.kind === 'line') { ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 1.5) * DPR; ctx.beginPath(); ctx.moveTo(sx(f.x1), sy(f.y1)); ctx.lineTo(sx(f.x2), sy(f.y2)); ctx.stroke(); }
    if (f.kind === 'ring') { ctx.strokeStyle = f.color; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.r * S, 0, 7); ctx.stroke(); }
    if (f.kind === 'mark') {
      const k = clamp(f.life / 0.6, 0, 1), px = sx(f.x), py = sy(f.y), d = (8 + 26 * k) * DPR, a = 6 * DPR;
      ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1 * DPR;
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + Math.PI / 4, ux = Math.cos(ang), uy = Math.sin(ang) * 0.55;
        const tx = px + ux * d, ty = py + uy * d;           // 箭头尖朝向中心
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ux * a * 1.6 - uy * a, ty + uy * a * 1.6 + ux * a * 0.55); ctx.lineTo(tx + ux * a * 1.6 + uy * a, ty + uy * a * 1.6 - ux * a * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.ellipse(px, py, d * 0.8, d * 0.44, 0, 0, 7); ctx.stroke();
    }
    if (f.kind === 'corpse') { const sh = sheetOf(f.ent); if (sh) { const a = sh.m.actions.death, done = G.t - f.t0 >= a.frames / a.fps; drawSheet(sh, f.ent, f.x, f.y, ['death', f.t0, done], f.ent.elite ? 1.3 : 1, done ? clamp(f.life, 0, 1) : 1); } }
    if (f.kind === 'death') { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), f.r * S * (1.6 - f.life), 0, 7); ctx.fill(); }
    if (f.kind === 'text') label(f.text, f.x, f.y + 120 + (0.7 - f.life) * 300, f.color, 12);
    ctx.globalAlpha = 1;
  }
  FXS.draw(ctx, view);
  // 建造预览
  if (G.placing && mouse) {
    const x = snap(wx(mouse.x)), y = snap(wy(mouse.y)), ok = canPlace(x, y, true);
    const fam = G.placing;
    const range = fam === 'hero' ? D.heroes[G.heroChoice].range : (D.towers[fam].cat === 'aura' ? (D.towers[fam].levels[0].abils[0] || {}).area || 900 : D.towers[fam].levels[0].range);
    const col = ok ? '#6fd17a' : '#ff5a4f';
    rangeCircle(x, y, range, col, 0.08);
    drawBuildGrid(x, y);
    // 占地 3×3 格：每格单独标绿 / 红（和魔兽一样，一眼看出是哪一格挡住了）
    const cpx = CELL * S;
    for (const [cx, cy] of footCells(x, y)) {
      const good = cellBuildable(cx, cy) && !cellTaken(cx, cy, true);
      ctx.fillStyle = good ? 'rgba(111,209,122,.38)' : 'rgba(255,90,79,.45)';
      ctx.fillRect(sx(cx) - cpx / 2 + 1, sy(cy) - cpx / 2 + 1, cpx - 2, cpx - 2);
    }
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 * DPR; ctx.strokeStyle = col; ctx.lineWidth = 2 * DPR;
    footRect(x, y); ctx.stroke(); ctx.restore();
    const gsh = fam === 'hero' ? sheetByKey('hero:' + G.heroChoice) : D.towers[fam].cat === 'aura' ? null : towerSheet(fam, 1);   // 光环塔没有建筑，只有地面光环
    if (gsh) drawSheet(gsh, { face: -Math.PI / 2 }, x, y, [Object.keys(gsh.m.actions)[0], G.t], 1, ok ? 0.6 : 0.35);
  }
  if (G.pending && mouse) { label(G.pending === 'blink' ? '闪烁到这里' : '移动到这里', wx(mouse.x), wy(mouse.y) + 90, '#c8f5c8', 12); }
  TER.drawOverlay(ctx, view);
  drawMinimap();
}
const snap = v => Math.round(v / CELL) * CELL;
// 塔的占地方框（世界坐标 → 屏幕路径）
function footRect(x, y) { ctx.beginPath(); ctx.rect(sx(x) - FOOT_HALF * S, sy(y) - FOOT_HALF * S, FOOT_HALF * 2 * S, FOOT_HALF * 2 * S); }
// 建造时在光标附近显示可建造的格子（只画能建的格，越远越淡）
function drawBuildGrid(x, y) {
  const R = 9, cpx = CELL * S;
  if (cpx < 5 * DPR) return;
  ctx.save(); ctx.lineWidth = 1 * DPR;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const d = Math.hypot(i, j) / R; if (d > 1) continue;
    const cx = x + i * CELL, cy = y + j * CELL;
    if (!cellBuildable(cx, cy)) continue;
    const taken = cellTaken(cx, cy, true);
    ctx.strokeStyle = taken ? `rgba(255,120,100,${0.35 * (1 - d)})` : `rgba(190,255,190,${0.45 * (1 - d)})`;
    ctx.strokeRect(sx(cx) - cpx / 2 + 0.5, sy(cy) - cpx / 2 + 0.5, cpx - 1, cpx - 1);
  }
  ctx.restore();
}
function rangeCircle(x, y, r, c, fill = 0.07) {
  ctx.beginPath(); ctx.arc(sx(x), sy(y), r * S, 0, 7);
  ctx.globalAlpha = fill; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = c; ctx.lineWidth = 1.5 * DPR; ctx.stroke();
}
function label(text, x, y, color, size) {
  ctx.font = `${size * DPR}px -apple-system,"PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * DPR; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, sx(x), sy(y)); ctx.fillStyle = color; ctx.fillText(text, sx(x), sy(y));
}
function selRing(x, y, r, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = 8 * DPR;
  ctx.strokeStyle = color; ctx.lineWidth = 2.2 * DPR; ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 1.15, r * 0.55, 0, 0, 7); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
// ---------------------------------------------------------------- 剑刃风暴：旋转的剑魂
// 地面层：伤害范围（旋转的虚线圈）+ 几圈绕中心飞转的风刃（彗星尾渐隐的圆弧）
const ZK_SCR = 0.64;                                             // 和 fx.js 一样：高度在屏幕上的压缩
function bsFade(z) { return clamp(Math.min((G.t - z.t0) / 0.25, (z.until - G.t) / 0.3), 0, 1); }
function drawBladestormGround(z) {
  const px = sx(z.x), py = sy(z.y), R = z.r * S, age = G.t - z.t0, fade = bsFade(z);
  ctx.save(); ctx.globalAlpha = fade;
  const gr = ctx.createRadialGradient(px, py, 0, px, py, R);
  gr.addColorStop(0, 'rgba(170,230,255,.28)'); gr.addColorStop(0.7, 'rgba(120,200,255,.10)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(190,240,255,.55)'; ctx.lineWidth = 1.5 * DPR; ctx.setLineDash([10 * DPR, 8 * DPR]); ctx.lineDashOffset = -age * 60 * DPR;
  ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [rk, sp, n, w] of [[0.32, 9, 3, 5], [0.58, 6.5, 4, 4], [0.86, 4.5, 5, 3]]) {
    const r = R * rk, len = 1.5;
    for (let k = 0; k < n; k++) {
      const a0 = -age * sp + k * TAU / n;                       // 顺时针飞转
      for (let i = 0; i < 8; i++) {                              // 从尾到头 8 段，越靠前越亮越粗
        const t = i / 8;
        ctx.strokeStyle = `rgba(215,248,255,${0.55 * t})`; ctx.lineWidth = Math.max(1, w * S * 4 * (0.3 + t)) ;
        ctx.beginPath(); ctx.arc(px, py, r, a0 + len * t, a0 + len * (t + 1 / 8) + 0.02); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
// 立体层（画在单位之上）：剑魂本体快速自转（8 方向帧轮换 = 绕竖直轴转）、残影、绕身的刀光环
function drawBladestormSpirit(z) {
  const px = sx(z.x), py = sy(z.y), age = G.t - z.t0, fade = bsFade(z), k = z.r >= 300 ? 1 : 0.7;
  const spin = age * TAU * 3.2;                                   // 每秒 3.2 圈
  ctx.save(); ctx.globalAlpha = fade;
  // 刀光环：几圈不同高度的椭圆弧，绕身旋转
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [h, rr, off] of [[40, 150, 0], [85, 130, 2.1], [130, 105, 4.2]]) {
    const cy = py - h * k * ZK_SCR * S, rx = rr * k * S, ry = rx * 0.38;
    for (let i = 0; i < 10; i++) {
      const t = i / 10, a0 = spin * 1.15 + off + t * 2.4;
      ctx.strokeStyle = `rgba(210,248,255,${0.95 * t})`; ctx.lineWidth = Math.max(1.2, 11 * k * S * t + 0.8);
      ctx.beginPath(); ctx.ellipse(px, cy, rx, ry, 0, a0, a0 + 0.26); ctx.stroke();
    }
  }
  // 中心光
  const gR = 150 * k * S, gy = py - 70 * k * ZK_SCR * S;
  const g2 = ctx.createRadialGradient(px, gy, 0, px, gy, gR);
  g2.addColorStop(0, 'rgba(230,250,255,.55)'); g2.addColorStop(0.4, 'rgba(120,210,255,.25)'); g2.addColorStop(1, 'rgba(120,210,255,0)');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(px, gy, gR, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // 剑魂：用剑神的攻击动作，朝向每帧旋转；前几帧画成半透明残影
  const sh = sheetByKey('hero:剑神');
  if (sh) {
    const a = sh.m.actions.attack ? 'attack' : Object.keys(sh.m.actions)[0];
    const t0 = G.t - ((age * 2) % 0.5);                            // 攻击动作循环播放
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = fade * (i ? 0.18 * (4 - i) / 3 : 0.85);
      drawSheet(sh, { face: spin - i * 0.5 }, z.x, z.y, [a, t0], 1.05 * k, ctx.globalAlpha);
    }
  } else {                                                        // 没有精灵图时：三把旋转的剑
    ctx.translate(px, py - 60 * k * ZK_SCR * S);
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = fade * (i ? 0.2 : 1);
      for (let b = 0; b < 3; b++) {
        const ang = spin - i * 0.25 + b * TAU / 3, L = 120 * k * S, w = 9 * k * S;
        ctx.save(); ctx.scale(1, 0.45); ctx.rotate(ang);
        ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L * 0.2, -w); ctx.lineTo(L * 0.2, w); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6a4a20'; ctx.fillRect(0, -w * 0.5, L * 0.2, w); ctx.restore();
      }
    }
  }
  ctx.restore();
}
// 塔的选中圈：圆心 = 占地中心，半径 = 占地半边长，和建造时的方框对齐
// ---------------------------------------------------------------- 塔的等级外观：越高级颜色越亮、光效越多
// 等级换算成 0~4 档：0 = 1 级（原样），4 = 满级。每档：精灵染色 + 底座光圈；3 档起冒光点，满级头顶有光晕
const TIER = [null,
  { color: '#5aa8ff', tint: 0.16 }, { color: '#b46bff', tint: 0.2 }, { color: '#ff9a3c', tint: 0.22 }, { color: '#ff3b3b', tint: 0.24 }];
function towerTier(t) { const n = t.levels.length; return n <= 1 ? 0 : Math.round(t.lv / (n - 1) * 4); }
const TINTED = new Map();
function tintedSheet(sh, color, amount) {           // 精灵表叠一层颜色（只染不透明的部分），每种颜色只生成一次
  const key = sh.m.key + '|' + color;
  let c = TINTED.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = sh.im.naturalWidth; c.height = sh.im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(sh.im, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = amount; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    TINTED.set(key, c);
  }
  return { m: sh.m, im: c };
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function drawTierGround(t, now) {                    // 底座下的光圈：档位越高越亮、越多层
  const tier = towerTier(t); if (!tier) return;
  const col = TIER[tier].color, px = sx(t.x), py = sy(t.y), R = (FOOT_HALF + 10) * S, pulse = 0.75 + 0.25 * Math.sin(now * 2.4 + t.id);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(px, py, R * 0.2, px, py, R);
  g.addColorStop(0, hexA(col, 0.32 * pulse)); g.addColorStop(0.7, hexA(col, 0.12 * pulse)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, R, R * 0.62, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = hexA(col, 0.55 * pulse); ctx.lineWidth = Math.max(1, 3 * S * 4);
  for (let k = 0; k < Math.min(tier, 3); k++) {      // 1~3 圈旋转的虚线符文环
    const r = R * (0.62 + k * 0.16); ctx.setLineDash([r * 0.18, r * 0.12]); ctx.lineDashOffset = (k % 2 ? 1 : -1) * now * 30 * DPR;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.62, 0, 0, 7); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.restore();
}
function drawTierTop(t, tier, now) {                 // 3 档起：往上飘的光点；满级：头顶光晕 + 光芒
  const col = TIER[tier].color, px = sx(t.x), py = sy(t.y), k = S * 4;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const n = tier === 4 ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const ph = (now * 0.45 + i / n + t.id * 0.13) % 1, a = i * 2.39 + t.id;
    const ox = Math.cos(a) * 70 * S, oy = -ph * 200 * S, r = Math.max(1.2, (5 - ph * 3) * k * 0.35);
    ctx.fillStyle = hexA(col, (1 - ph) * 0.9); ctx.beginPath(); ctx.arc(px + ox, py + oy - 20 * S, r, 0, 7); ctx.fill();
  }
  if (tier === 4) {
    const hy = py - 230 * S, hr = 60 * S;
    const g = ctx.createRadialGradient(px, hy, 0, px, hy, hr * 1.6);
    g.addColorStop(0, 'rgba(255,240,200,.75)'); g.addColorStop(0.35, hexA(col, 0.45)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, hy, hr * 1.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,160,.55)'; ctx.lineWidth = Math.max(1, 2 * k * 0.5);
    for (let i = 0; i < 8; i++) { const a = now * 0.8 + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * hr * 0.5, hy + Math.sin(a) * hr * 0.5); ctx.lineTo(px + Math.cos(a) * hr * 1.4, hy + Math.sin(a) * hr * 1.4); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 光环塔：地面光环（原图就是地上的一圈光环，没有建筑）
const AURA_LOOK = {
  加速光环: { c1: '#7dff5a', c2: '#e8ff7a', glyph: 'arrow' },     // 攻速：绿色，旋转的箭头
  攻击光环: { c1: '#ff5a3c', c2: '#ffd257', glyph: 'blade' },     // 攻击：红金，刀刃符文
  减防光环: { c1: '#e0204a', c2: '#b45cff', glyph: 'crack' },     // 减防：血红 + 紫，破碎的盾
  减速光环: { c1: '#5ab8ff', c2: '#dff6ff', glyph: 'flake' },     // 减速：冰蓝，雪花
};
function auraLevel(t) { return t.levels.length > 1 ? t.lv / (t.levels.length - 1) : 1; }   // 0 ~ 1
function auraGlyph(kind, g, r) {
  g.beginPath();
  if (kind === 'arrow') { g.moveTo(-r, -r * 0.6); g.lineTo(r * 0.4, 0); g.lineTo(-r, r * 0.6); g.moveTo(-r * 0.2, -r * 0.6); g.lineTo(r, 0); g.lineTo(-r * 0.2, r * 0.6); }
  else if (kind === 'blade') { g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(r * 0.55, -r * 0.35); g.lineTo(r, 0); g.lineTo(r * 0.55, r * 0.35); g.moveTo(-r * 0.6, -r * 0.4); g.lineTo(-r * 0.6, r * 0.4); }
  else if (kind === 'crack') { g.moveTo(-r * 0.7, -r); g.lineTo(r * 0.7, -r); g.lineTo(r * 0.7, 0); g.lineTo(0, r); g.lineTo(-r * 0.7, 0); g.closePath(); g.moveTo(-r * 0.1, -r); g.lineTo(r * 0.15, -r * 0.3); g.lineTo(-r * 0.15, r * 0.2); g.lineTo(r * 0.05, r * 0.8); }
  else { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); } }
  g.stroke();
}
function drawAuraGround(t, now) {
  const L = AURA_LOOK[t.fam] || AURA_LOOK.攻击光环, lvl = auraLevel(t), px = sx(t.x), py = sy(t.y);
  const R = (FOOT_HALF + 20) * S * (1 + lvl * 0.25), pulse = 0.8 + 0.2 * Math.sin(now * 2 + t.id), sq = 0.62;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // 作用范围：每 3 秒一圈很淡的波纹扩散到范围边缘
  const area = ((curLevel(t).abils || [])[0] || {}).area || 900, ph = (now / 3 + t.id * 0.17) % 1;
  ctx.strokeStyle = hexA(L.c1, 0.22 * (1 - ph)); ctx.lineWidth = Math.max(1, 6 * S * (1 - ph) + 1);
  ctx.beginPath(); ctx.ellipse(px, py, area * S * ph, area * S * ph * sq, 0, 0, 7); ctx.stroke();
  // 底光
  const g = ctx.createRadialGradient(px, py, 0, px, py, R * 1.15);
  g.addColorStop(0, hexA(L.c2, 0.35 * pulse)); g.addColorStop(0.5, hexA(L.c1, 0.22 * pulse)); g.addColorStop(1, hexA(L.c1, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, R * 1.15, R * 1.15 * sq, 0, 0, 7); ctx.fill();
  // 外圈 + 内圈（等级越高圈越多）
  ctx.strokeStyle = hexA(L.c1, 0.85 * pulse); ctx.lineWidth = Math.max(1.2, 9 * S);
  ctx.beginPath(); ctx.ellipse(px, py, R, R * sq, 0, 0, 7); ctx.stroke();
  const rings = 1 + Math.round(lvl * 2);
  for (let k = 1; k <= rings; k++) {
    const r = R * (1 - k * 0.2); ctx.lineWidth = Math.max(1, 5 * S); ctx.strokeStyle = hexA(k % 2 ? L.c2 : L.c1, 0.6 * pulse);
    ctx.setLineDash([r * 0.22, r * 0.1]); ctx.lineDashOffset = (k % 2 ? -1 : 1) * now * 40 * DPR;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * sq, 0, 0, 7); ctx.stroke();
  }
  ctx.setLineDash([]);
  // 符文：沿圈旋转（压扁成地面透视）
  const n = 6 + Math.round(lvl * 4), gr = 16 * S * (1 + lvl * 0.3);
  ctx.strokeStyle = hexA(L.c2, 0.95); ctx.lineWidth = Math.max(1, 4 * S); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const a = now * (t.fam === '减速光环' ? 0.25 : 0.6) + i * Math.PI * 2 / n, rr = R * 0.86;
    ctx.save(); ctx.translate(px + Math.cos(a) * rr, py + Math.sin(a) * rr * sq); ctx.scale(1, sq); ctx.rotate(a + Math.PI / 2);
    auraGlyph(L.glyph, ctx, gr); ctx.restore();
  }
  // 往上飘的光点
  const motes = 8 + Math.round(lvl * 14);
  for (let i = 0; i < motes; i++) {
    const ph2 = (now * 0.35 + i / motes + t.id * 0.11) % 1, a = i * 2.399 + t.id, rr = R * (0.2 + (i * 0.37 % 1) * 0.75);
    const mx = px + Math.cos(a) * rr, my = py + Math.sin(a) * rr * sq - ph2 * 160 * S;
    ctx.fillStyle = hexA(i % 3 ? L.c1 : L.c2, (1 - ph2) * 0.85); ctx.beginPath(); ctx.arc(mx, my, Math.max(1, (4 - ph2 * 2.5) * S * 2.2), 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawAuraCore(t, now) {                       // 光环中心浮着的核心（方便点选；满级多一圈光芒）
  const L = AURA_LOOK[t.fam] || AURA_LOOK.攻击光环, lvl = auraLevel(t), px = sx(t.x), py = sy(t.y) - (70 + 12 * Math.sin(now * 2 + t.id)) * S;
  const r = (22 + lvl * 14) * S;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.25, hexA(L.c2, 0.85)); g.addColorStop(0.6, hexA(L.c1, 0.35)); g.addColorStop(1, hexA(L.c1, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 2.4, 0, 7); ctx.fill();
  ctx.translate(px, py); ctx.rotate(now * 1.2);                     // 旋转的菱形晶核
  ctx.fillStyle = hexA(L.c2, 0.9); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.6, 0); ctx.closePath(); ctx.fill();
  if (lvl >= 0.99) { ctx.strokeStyle = 'rgba(255,240,200,.7)'; ctx.lineWidth = Math.max(1, 2 * S * 3); for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, r * 1.2); ctx.lineTo(0, r * 2.2); ctx.stroke(); } }
  ctx.restore();
}

function footRing(t, alpha) {
  const x = sx(t.x), y = sy(t.y), r = FOOT_HALF * S * 0.98;
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = '#3cff3c'; ctx.shadowBlur = 8 * DPR;
  ctx.strokeStyle = '#3cff3c'; ctx.lineWidth = 2.2 * DPR; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = alpha * 0.15; ctx.fillStyle = '#3cff3c'; ctx.fill(); ctx.restore();
}
// 鼠标悬停的单位：细一点、半透明的圈
const hovered = () => mouse && !G.placing && !G.pending ? hitTest(wx(mouse.x), wy(mouse.y)) : null;
function drawSprite(im, x, y, size) { const w = size, h = size * im.naturalHeight / im.naturalWidth; ctx.drawImage(im, x - w / 2, y - h * 0.75, w, h); }
function drawTower(t) {
  const x = sx(t.x), y = sy(t.y), s = Math.max((t.cat === 'summon' ? 90 : 150) * S, (t.cat === 'summon' ? 9 : 14) * DPR);
  const atk = t.cat === 'aura' ? 'aura' : (t.isHero ? heroStats(t).atk : curLevel(t).atk);
  if (t.cat === 'summon') { if (t === G.selected) selRing(x, y, s * 0.6, '#3cff3c'); else if (t === HOV) selRing(x, y, s * 0.6, '#3cff3c', 0.45); }
  else if (t === G.selected) footRing(t, 1); else if (t === HOV) footRing(t, 0.45);
  if (t.cat === 'aura') { drawAuraCore(t, performance.now() / 1000); drawLevelBadge(t, x, y, s); return; }
  const tier = t.cat === 'summon' || t.isHero ? 0 : towerTier(t);
  let sh = sheetOf(t); const im = !sh && entityImg(t);
  if (sh && tier) sh = tintedSheet(sh, TIER[tier].color, TIER[tier].tint);
  if (sh) { shadow(t.x, t.y, s * 0.55); drawSheet(sh, t, t.x, t.y, pickAnim(t, sh.m), 1 + tier * 0.035); }
  else if (im) drawSprite(im, x, y, s * 1.6);
  else {
    ctx.fillStyle = t.cat === 'aura' ? '#2f7a3b' : t.isHero ? '#6b4a12' : t.cat === 'summon' ? '#7a2a10' : '#2a3a4e';
    ctx.strokeStyle = ATK_COLOR[atk] || '#6fd17a'; ctx.lineWidth = 2 * DPR;
    if (t.isHero || t.cat === 'main') { ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, 7); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x - s / 2, y - s / 2, s, s); ctx.strokeRect(x - s / 2, y - s / 2, s, s); }
    const name = t.isHero ? t.heroName : t.cat === 'summon' ? '魔' : t.fam.replace('光环', '').replace('塔', '');
    const small = s < 26 * DPR;
    ctx.font = `bold ${Math.round(s * (small ? 0.62 : 0.36))}px sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(small ? name.slice(0, 1) : name.slice(0, 2), x, y + 1);
  }
  if (t.cat === 'summon') return;
  if (tier >= 3) drawTierTop(t, tier, performance.now() / 1000);
  drawLevelBadge(t, x, y, s);
}
function drawLevelBadge(t, x, y, s) {
  // 等级小牌子：深色底 + 金字（满级是红底）
  const txt = t.isHero ? 'Lv' + t.level : t.lv === t.levels.length - 1 ? 'MAX' : 'Lv' + (t.lv + 1), fs = Math.round(Math.max(8 * DPR, s * 0.22));
  ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(txt).width + fs * 0.8, ty = y + s * 0.42 + 6 * DPR;
  ctx.fillStyle = txt === 'MAX' ? 'rgba(120,20,10,.85)' : 'rgba(10,14,10,.75)'; ctx.strokeStyle = 'rgba(255,210,87,.7)'; ctx.lineWidth = 1 * DPR;
  ctx.beginPath(); ctx.roundRect(x - tw / 2, ty - fs * 0.65, tw, fs * 1.3, fs * 0.4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd257'; ctx.fillText(txt, x, ty + 0.5);
}
function drawMonster(m) {
  const x = sx(m.x), y = sy(m.y), r = Math.max(2.5 * DPR, m.r * S);
  if (m === G.selected) selRing(x, y, r, '#ff3c3c'); else if (m === HOV) selRing(x, y, r, '#ff3c3c', 0.5);
  const sh = sheetOf(m), im = !sh && entityImg(m);
  let barY = y - r - 7 * DPR;
  if (sh) {
    const k = m.elite ? 1.3 : 1;                                   // 精英怪放大 130%
    shadow(m.x, m.y, r * 0.9 * k);
    if (m.elite) { ctx.strokeStyle = 'rgba(255,79,216,.8)'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.6, 0, 0, 7); ctx.stroke(); }
    if (m.boss) { ctx.strokeStyle = 'rgba(255,43,43,.8)'; ctx.lineWidth = 2.5 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 0.55, 0, 0, 7); ctx.stroke(); }
    barY = Math.min(barY, drawSheet(sh, m, m.x, m.y, pickAnim(m, sh.m), k) - 4 * DPR);
  } else if (im) drawSprite(im, x, y, r * 2.6);
  else {
    if (m.elite) { ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(x, y, r + 3 * DPR, 0, 7); ctx.stroke(); }
    ctx.fillStyle = ARMOR_COLOR[m.type] || '#ccc'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (m.boss) { ctx.strokeStyle = '#ff2b2b'; ctx.lineWidth = 2.5 * DPR; ctx.stroke(); }
  }
  if (G.t < m.stunUntil) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - r, y - r - 4 * DPR, r * 2, 2 * DPR); }
  const w = Math.max(14 * DPR, r * 2.4), p = clamp(m.hp / m.maxHp, 0, 1);
  ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, barY, w, 3 * DPR);
  ctx.fillStyle = p > 0.5 ? '#3cdc3c' : p > 0.25 ? '#ffd257' : '#ff5a4f'; ctx.fillRect(x - w / 2, barY, w * p, 3 * DPR);
}
function drawBuilder(b) {
  const x = sx(b.x), y = sy(b.y), r = Math.max(9 * DPR, 70 * S);
  if (b === G.selected) selRing(x, y, r, '#3cff3c'); else if (b === HOV) selRing(x, y, r, '#3cff3c', 0.45);
  const sh = sheetOf(b);
  if (sh) { shadow(b.x, b.y, r * 0.9); drawSheet(sh, b, b.x, b.y, pickAnim(b, sh.m)); return; }
  const im = entityImg(b);
  if (im) return drawSprite(im, x, y, r * 2.8);
  ctx.fillStyle = '#d0661c'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();          // 火焰熊猫酒仙造型占位
  ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2 * DPR; ctx.stroke();
  const f = b.face || -Math.PI / 2;
  ctx.fillStyle = '#ffd257'; ctx.beginPath(); ctx.arc(x + Math.cos(f) * r * 0.6, y - Math.sin(f) * r * 0.6, r * 0.28, 0, 7); ctx.fill();
  ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('守', x, y + 1);
}
function drawMinimap() {
  const w = mm.width, h = mm.height, k = Math.min(w, h) / (WORLD * 2 + 300);
  const mx = x => w / 2 + x * k, my = y => h / 2 - y * k;
  mctx.fillStyle = '#10240f'; mctx.fillRect(0, 0, w, h);                 // 外围森林
  mctx.fillStyle = '#2f5a29'; mctx.fillRect(mx(-WORLD), my(WORLD), WORLD * 2 * k, WORLD * 2 * k);
  mctx.lineCap = 'round'; mctx.lineJoin = 'round';
  for (const [lw, c] of [[ROAD_HALF * 2 + 70, '#5e4a2e'], [ROAD_HALF * 2, '#a39a86']]) {
    mctx.strokeStyle = c; mctx.lineWidth = Math.max(2, lw * k); mctx.beginPath();
    for (const [a, b] of ROAD_SEGS) { mctx.moveTo(mx(a[0]), my(a[1])); mctx.lineTo(mx(b[0]), my(b[1])); }
    mctx.stroke();
  }
  mctx.fillStyle = '#ff4a3a'; mctx.beginPath(); mctx.arc(mx(NODES.I[0]), my(NODES.I[1]), Math.max(3, 200 * k), 0, 7); mctx.fill();
  mctx.strokeStyle = '#6dff6d'; mctx.lineWidth = Math.max(1, 30 * k); mctx.beginPath(); mctx.arc(mx(0), my(0), 300 * k, 0, 7); mctx.stroke();
  const dot = (x, y, c, s) => { mctx.fillStyle = c; mctx.fillRect(mx(x) - s / 2, my(y) - s / 2, s, s); };
  for (const t of G.towers) dot(t.x, t.y, t.isHero ? '#ffd257' : '#3cdc3c', 4 * DPR);
  for (const m of G.monsters) dot(m.x, m.y, m.boss ? '#ff2bff' : '#ff3c3c', (m.boss ? 4 : 2.5) * DPR);
  dot(G.builder.x, G.builder.y, '#ffffff', 4 * DPR);
  const hw = W / 2 / S, hh = H / 2 / S;
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1 * DPR;
  mctx.strokeRect(mx(G.cam.x - hw), my(G.cam.y + hh), hw * 2 * k, hh * 2 * k);
}
function addFx(f) { if (f.kind === 'ring') return FXS.ring(f.x, f.y, f.r, f.color, f.life, 4); if (G.fx.length < 400) G.fx.push(f); }   // 冲击波统一交给 fx.js 画

// ================================================================ 控制台 UI：信息面板 + 命令面板
const $ = id => document.getElementById(id);
let dirty = true;
function uiDirty() { dirty = true; }
function msg(text) {
  const d = document.createElement('div'); d.textContent = text; $('msgs').appendChild(d);
  setTimeout(() => d.remove(), 6000);
  while ($('msgs').children.length > 6) $('msgs').firstChild.remove();
}
function renderTop() {
  $('r-gold').textContent = Math.floor(G.gold); $('r-wood').textContent = G.wood;
  $('r-food').textContent = foodUsed() + '/' + G.foodCap;
  $('r-mode').textContent = MODES[G.mode].name;
  $('w-title').textContent = G.phase === 'prep' ? '准备阶段' : G.wave >= 49 ? '最终BOSS' : `第${G.wave}波`;
  const t = Math.max(0, Math.ceil(G.timer));
  $('w-timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const c = monstersAlive(), cp = cap();
  $('w-count').textContent = c; $('w-cap').textContent = cp;
  $('w-count').className = c > cp * 0.8 ? 'danger' : c > cp * 0.5 ? 'warn' : '';
  $('w-perfect').textContent = G.perfect;
  if ($('w-hint').dataset.v !== G.hint) { $('w-hint').innerHTML = G.hint; $('w-hint').dataset.v = G.hint; }
  $('btn-start').classList.toggle('hidden', G.phase !== 'prep');
  $('btn-pause').textContent = G.paused ? '继续(P)' : '暂停(P)';
  $('btn-speed').textContent = '速度 ' + G.speed + 'x';
  $('q-builder').classList.toggle('on', G.selected === G.builder);
  quickThumb($('q-builder'), 'builder');
  if (G.hero) quickThumb($('q-hero'), 'hero:' + G.hero.heroName);
  $('q-hero').classList.toggle('hidden', !G.hero);
  if (G.hero) { $('q-hero').classList.toggle('on', G.selected === G.hero); $('q-hero-lv').textContent = G.hero.level; $('q-hero-name').textContent = G.hero.heroName.slice(0, 1); }
}
const atkTag = atk => `<span class="atk atk-${atk}">${atk === 'aura' ? '光环' : ATK_CN[atk] || atk}</span>`;
function portrait(e, name, color) {
  const st = sheetThumb(sheetOf(e), innerWidth <= 820 ? 56 : 92);
  if (st && !img('portrait:' + spriteKey(e))) return `<div class="pt" style="${st}"></div>`;
  const im = e && (img('portrait:' + spriteKey(e)) || entityImg(e));   // 优先用头像图，没有就用单位图
  return im ? `<img src="${im.src}">` : `<div class="pt" style="background:${color}">${name.slice(0, 1)}</div>`;
}
function bar(cls, v, max, text) { return `<div class="bar ${cls}"><i style="width:${clamp(v / max, 0, 1) * 100}%"></i><span>${text}</span></div>`; }
function renderInfo() {
  const e = G.selected, box = $('info');
  if (!e || (e !== G.builder && !G.towers.includes(e) && !G.monsters.includes(e))) { G.selected = null; box.innerHTML = '<div class="empty">未选择单位</div>'; return; }
  let left = '', mid = '';
  if (e.isBuilder) {
    left = portrait(e, '守', '#a5521a') + bar('hp', 1, 1, '400000') + bar('mp', 1, 1, '无敌');
    mid = `<div class="nm">循环圈守卫者</div><div class="sub">建造者 · 无敌的</div>
      <div class="kv"><span>移动速度</span><b>500</b><span>技能</span><b>建造 · 随机建造 · 使用木材 · 全图闪烁</b>
      <span>状态</span><b>${e.order ? (e.order.kind === 'build' ? '前往建造 ' + (e.order.fam === 'hero' ? G.heroChoice : e.order.fam) : '移动中') : '待命'}</b></div>`;
  } else if (e.isHero) {
    const st = heroStats(e), hd = D.heroes[e.heroName];
    left = portrait(e, e.heroName, '#6b4a12') + bar('hp', 1, 1, '无敌的') + bar('mp', e.mana, e.maxMana(), `${Math.floor(e.mana)} / ${e.maxMana()}`);
    mid = `<div class="nm">${hd.name} <small>${hd.title}</small></div><div class="sub">等级 ${e.level} · 英雄塔 ${atkTag(hd.atk)}</div>
      <div class="kv"><span>攻击力</span><b>${fmt(st.dmg)}</b><span>攻击间隔</span><b>${st.cd.toFixed(2)}s</b>
      <span>射程</span><b>${st.range}</b><span>击杀/伤害</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b>
      <span style="color:#ff6b5f">力量</span><b>${e.stat.str}</b><span style="color:#ffd257">敏捷</span><b>${e.stat.agi}</b><span style="color:#7ab8ff">智力</span><b>${e.stat.int}</b>
      <span>成长属性</span><b>${statCN(e.growth)}（每杀精英 +1）</b></div>
      <div class="skills">${hd.skills.slice(0, 4).map((s, i) => `<span class="${e.learned.includes(i) ? 'on' : ''}">${s.name}</span>`).join('')}</div>`;
  } else if (e.fam) {
    if (e.cat === 'summon') { box.innerHTML = `<div class="col-l">${portrait(null, '魔', '#7a2a10')}</div><div class="col-m"><div class="nm">炎魔</div><div class="sub">召唤物 · 剩余 ${Math.ceil(e.until - G.t)} 秒</div></div>`; return; }
    const lv = curLevel(e), st = towerStats(e);
    left = portrait(e, e.fam, e.cat === 'aura' ? '#2f7a3b' : '#2a3a4e') + bar('hp', 1, 1, '无敌的') + bar('mp', e.lv + 1, e.levels.length, `等级 ${e.lv + 1}/${e.levels.length}`);
    mid = `<div class="nm">${lv.name}</div><div class="sub">${CAT_CN[e.cat]}${e.branch ? ' · ' + e.branch + '分支' : ''} ${e.cat === 'aura' ? atkTag('aura') : atkTag(lv.atk)}</div><div class="kv">`;
    if (e.cat === 'aura') { const ab = lv.abils[0] || {}; mid += `<span>光环</span><b>${auraText(e.fam, ab)}</b><span>范围</span><b>${ab.area}</b>`; }
    else mid += `<span>攻击力</span><b>${fmt(st.dmg)}${e.buffDmg ? ` <em>+${Math.round(e.buffDmg * 100)}%</em>` : ''}</b><span>攻击间隔</span><b>${st.cd}s${e.buffAS ? ` <em>攻速+${Math.round(e.buffAS * 100)}%</em>` : ''}</b><span>射程</span><b>${st.range}</b>`;
    mid += `<span>击杀/伤害</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b><span>已投入</span><b class="gold">${e.spent} 金</b></div><div class="tip">${(lv.tip || '').replace(/\n/g, ' ')}</div>`;
  } else {
    const ar = effArmor(e);
    left = portrait(e, e.name, ARMOR_COLOR[e.type]) + bar('hp', e.hp, e.maxHp, `${fmt(e.hp)} / ${fmt(e.maxHp)}`);
    mid = `<div class="nm">${e.name}${e.boss ? ' <em>BOSS</em>' : ''}${e.elite ? ' <em style="color:#ff4fd8">精英</em>' : ''}</div><div class="sub">怪物 · <span style="color:${ARMOR_COLOR[e.type]}">${ARMOR_CN[e.type]}护甲</span> → 克制：${ATK_CN[COUNTER[ARMOR_CN[e.type]]] || '—'}</div>
      <div class="kv"><span>护甲</span><b>${Math.round(ar)}（减伤 ${Math.round((1 - armorMult(ar)) * 100)}%）</b><span>移动速度</span><b>${e.speed}</b><span>赏金</span><b class="gold">${Math.round(e.bounty)}</b>
      ${e.elite ? `<span>光环</span><b>${e.elite.aura.name} ${e.elite.lvl} 级：${e.elite.aura.desc[e.elite.lvl - 1]}</b>` : ''}</div>`;
  }
  box.innerHTML = `<div class="col-l">${left}</div><div class="col-m">${mid}</div>`;
}
function auraText(fam, ab) {
  const v = Math.abs(ab.A || 0);
  return { 加速光环: `范围内塔攻速 +${Math.round(v * 100)}%`, 攻击光环: `范围内塔攻击 +${Math.round(v * 100)}%`, 减防光环: `范围内敌人护甲 -${v}`, 减速光环: `范围内敌人移速 -${Math.round(v * 100)}%` }[fam];
}

// 命令面板：4×3，和 WC3 一样每个按钮有热键
function cmd(key, icon, name, tip, fn, opt = {}) { return { key, icon, name, tip, fn, ...opt }; }
function buildCmds() {
  const e = G.selected, out = [];
  const back = cmd('Esc', '↩', '返回', '返回上一级', () => { G.menu = 'main'; G.placing = null; G.pending = null; uiDirty(); }, { ico: 'back' });
  if (!e) return out;
  if (e.isBuilder) {
    if (G.menu === 'build') {
      const keys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D'];
      G.build.forEach((fam, i) => {
        const d = D.towers[fam], l = d.levels[0];
        const blocked = (d.cat === 'main' && G.towers.some(t => t.cat === 'main')) || (d.cat === 'aura' && G.towers.filter(t => t.fam === fam).length >= RULE.maxAuraPerKind);
        out.push(cmd(keys[i], fam.slice(0, 2), fam, `<b>${fam}</b> ${d.cat === 'aura' ? atkTag('aura') : atkTag(l.atk)}<br>${CAT_CN[d.cat]} · <span class="gold">${l.gold} 金</span> · ${l.food || 0} 人口<br>${l.tip}${blocked ? '<br><b style="color:#ff5a4f">' + (d.cat === 'main' ? '只能建造一个主塔' : '每种光环限制 2 个') + '</b>' : ''}`,
          () => { G.placing = fam; G.pending = null; uiDirty(); }, { cat: d.cat, atk: d.cat === 'aura' ? 'aura' : l.atk, active: G.placing === fam, disabled: blocked || G.gold < l.gold, iconKey: 'icon:' + fam, ico: 'tower-' + fam, cost: l.gold }));
      });
      if (G.heroChoice) { const h = D.heroes[G.heroChoice]; out.push(cmd('D', h.name, h.name + '（英雄塔）', `<b>${h.name}</b> ${atkTag(h.atk)}<br>英雄塔 · 唯一 · <span class="gold">${h.gold} 金</span> · 1 人口<br>${h.title}`, () => { G.placing = 'hero'; uiDirty(); }, { atk: h.atk, active: G.placing === 'hero', disabled: !!G.hero || G.gold < h.gold, hero: true, iconKey: 'icon:hero:' + h.name, ico: 'hero-' + h.name, cost: h.gold })); }
      while (out.length < 11) out.push(null);
      out.push(back); return out;
    }
    if (G.menu === 'wood') {
      out.push(cmd('Q', '人', '购买人口', '用 <b>12 木材</b>购买 1 个人口', () => { if (G.wood < RULE.foodPrice) return msg('木材不足'); G.wood -= RULE.foodPrice; G.foodCap++; msg('用 12 木材兑换了 1 个人口'); uiDirty(); }, { disabled: G.wood < 12, ico: 'buyfood' }));
      out.push(cmd('W', '金', '兑换金币', '<b>1 木材</b>兑换 300 金币', () => { if (G.wood < 1) return msg('木材不足'); G.wood--; G.gold += RULE.woodToGold; uiDirty(); }, { disabled: G.wood < 1, ico: 'wood2gold' }));
      out.push(cmd('E', '木', '购买木材', '<b>500 金币</b>购买 1 个木材（原图商店"1个小材"）', () => { if (G.gold < RULE.goldToWood) return msg('金币不足'); G.gold -= RULE.goldToWood; G.wood++; uiDirty(); }, { disabled: G.gold < 500, ico: 'gold2wood' }));
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    out.push(cmd('M', '➜', '移动', '移动守卫者。也可以选中守卫者后直接右键 / 点击地面', () => { G.pending = 'move'; G.placing = null; uiDirty(); }, { active: G.pending === 'move', ico: 'move' }));
    out.push(cmd('S', '■', '停止', '停止当前命令（包括排队的命令）', () => { e.order = null; e.queue = []; G.pending = null; G.placing = null; uiDirty(); }, { ico: 'stop' }));
    out.push(cmd('F', '✦', '闪烁', '全图闪烁：瞬间移动到目标点，冷却 1 秒', () => { G.pending = 'blink'; G.placing = null; uiDirty(); }, { active: G.pending === 'blink', ico: 'blink' }));
    out.push(null);
    out.push(cmd('B', '建', '建造', '打开建造栏（当前随机给出的 6 个塔 + 英雄塔）', () => { G.menu = 'build'; uiDirty(); }, { ico: 'build' }));
    out.push(cmd('R', '🎲', '随机建造', `重新随机建造栏：1 主塔、1 原始塔、1 光环塔、2 辅助塔、1 另类塔<br>${G.rerolls === 0 ? '首次免费' : '需要 1 木材'}`, () => rerollBuild(false), { disabled: G.rerolls > 0 && G.wood < 1, ico: 'reroll' }));
    out.push(cmd('U', '木', '使用木材', '购买人口（12 木）、兑换金币（1 木 → 300 金）、购买木材（500 金）', () => { G.menu = 'wood'; uiDirty(); }, { ico: 'woodmenu' }));
    return out;
  }
  if (e.isHero) {
    const h = e, hd = D.heroes[h.heroName];
    if (G.menu === 'skills') {
      const c = LEARN_COST[h.learned.length];
      hd.skills.slice(0, 4).forEach((s, i) => {
        const learned = h.learned.includes(i);
        out.push(cmd(['Q', 'W', 'E', 'R'][i], s.name.slice(0, 2), s.name, `<b>${s.name}</b>${learned ? ' ✓ 已学习' : ''}<br>${s.desc.replace(/\n/g, '<br>')}${!learned && c ? `<br><b>需要：木材 ${c.wood}，力量 ≥ ${c.str}</b>` : ''}`,
          () => learned ? msg('已经学会了，回到上一级按 ' + ['Q', 'W', 'E', 'R'][i] + ' 施放') : learnSkill(h, i), { learned, disabled: !learned && (!c || h.stat.str < c.str || G.wood < c.wood), iconKey: 'icon:skill:' + h.heroName + ':' + i, ico: 'skill-' + h.heroName + '-' + i }));
      });
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    // 第一行：已学的技能（Q W E R 对应技能位置）。主动技能按热键 / 左键施放，右键切换自动施放；被动技能只显示
    hd.skills.slice(0, 4).forEach((sk, i) => {
      if (!h.learned.includes(i)) return out.push(null);
      const kit = HERO_KITS[h.heroName][i], key = ['Q', 'W', 'E', 'R'][i], ico = 'skill-' + h.heroName + '-' + i, desc = sk.desc.replace(/\n/g, '<br>');
      if (kit.cast) {
        const auto = h.auto[i] !== false;
        out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-magic">主动</span><br>冷却 ${kit.cd} 秒 · 按 <b>${key}</b> 或左键施放（对射程内最近的敌人）<br>右键：自动施放 <b style="color:${auto ? '#6fd17a' : '#ff8f86'}">${auto ? '开' : '关'}</b><br>${desc}`,
          () => castSkill(h, i), { ico, auto, cdOf: () => [skillCdLeft(h, i), kit.cd], rfn: () => { h.auto[i] = !auto; msg(`${sk.name}：自动施放${auto ? '关闭' : '开启'}`); uiDirty(); } }));
      } else out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-normal">被动</span><br>${desc}`, () => {}, { ico, passive: true }));
    });
    // 第二行：成长属性
    for (const [k, st, nm] of [['A', 'str', '力量'], ['S', 'agi', '敏捷'], ['D', 'int', '智力']])
      out.push(cmd(k, nm.slice(0, 1), '属性选择：' + nm, `成长属性切换为<b>${nm}</b>：每杀死 1 个精英怪，${nm} +1；升级时 ${nm} 额外 +2`, () => { h.growth = st; uiDirty(); }, { active: h.growth === st, ico: st }));
    out.push(null);
    // 第三行：升级、学习技能、回收
    const maxed = h.level >= 30, g = maxed ? 500 : h.level * 100, mp = maxed ? 400 : 200;
    out.push(cmd('U', '↑', '升级', `需要 <b>${g} 金币 + ${mp} 魔法</b><br>${maxed ? '满级后：所选属性 +3' : '等级 +1，全属性 +1，所选属性额外 +2'}`, () => heroLevelUp(h), { disabled: G.gold < g || h.mana < mp, ico: 'upgrade', cost: g }));
    out.push(cmd('L', '书', '学习技能', `最多 4 个。第 1 个免费，第 2/3/4 个需要木材 18/36/54，力量 ≥ 80/160/240`, () => { G.menu = 'skills'; uiDirty(); }, { ico: 'learn', disabled: h.learned.length >= 4 }));
    while (out.length < 11) out.push(null);
    out.push(cmd('Y', '回', '回收', `返还 <b>${h.spent}</b> 金币`, () => sellTower(h), { ico: 'sell' }));
    return out;
  }
  if (e.fam && e.cat !== 'summon') {
    const f = famOf(e);
    if (f.branches && e.lv === 0) Object.keys(f.branches).forEach((k, i) => { const n = f.branches[k][0]; out.push(cmd(['Q', 'W', 'E', 'R'][i], k, k + '分支', `<b>${n.name}</b> ${atkTag(n.atk)}<br><span class="gold">${n.gold} 金</span> · 攻击 ${n.dmg} · 弹射 ${n.targets} 个`, () => upgradeTower(e, k), { atk: n.atk, disabled: G.gold < n.gold, ico: 'branch-' + n.atk, cost: n.gold })); });
    else if (e.levels[e.lv + 1]) { const n = e.levels[e.lv + 1]; out.push(cmd('U', '↑', '升级', `升级到 <b>${n.name}</b><br><span class="gold">${n.gold} 金</span>${e.cat === 'aura' ? '' : ` · 攻击 ${fmt(n.dmg)} · 间隔 ${n.cd}s · 射程 ${n.range}`}<br>${n.tip || ''}`, () => upgradeTower(e), { disabled: G.gold < n.gold, ico: 'upgrade', cost: n.gold })); }
    if (e.fam === '天神塔') out.push(cmd('T', '换', '切换伤害类型', `当前：${(e.godTypes || ['normal', 'magic']).map(a => ATK_CN[a]).join(' + ')}`, () => {
      const combos = [['normal', 'magic'], ['pierce', 'chaos'], ['normal', 'chaos'], ['pierce', 'magic'], ['normal', 'pierce'], ['magic', 'chaos']];
      const i = combos.findIndex(c => c.join() === (e.godTypes || ['normal', 'magic']).join()); e.godTypes = combos[(i + 1) % combos.length]; uiDirty();
    }, { ico: 'switchdmg' }));
    while (out.length < 7) out.push(null);
    out.push(cmd('Y', '回', '回收', `返还建造和升级花费的 100% 金币：<b>${e.spent}</b>`, () => sellTower(e), { ico: 'sell' }));
  }
  return out;
}
let CMDS = [];
function renderCmds() {
  const prev = CMDS.map(c => c && c.name).join();
  CMDS = buildCmds();
  if (CMDS.map(c => c && c.name).join() !== prev) showTip(null);
  const grid = $('cmd'); grid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const c = CMDS[i], b = document.createElement('button');
    b.className = 'cb' + (c ? '' : ' none') + (c && c.active ? ' active' : '') + (c && c.auto ? ' auto' : '') + (c && c.passive ? ' passive' : '') + (c && c.learned ? ' learned' : '');
    if (c) {
      const icon = c.iconKey && img(c.iconKey);
      const thumb = !icon && c.iconKey && sheetThumb(sheetByKey(c.iconKey.replace(/^icon:/, c.iconKey.startsWith('icon:hero:') ? '' : 'tower:')), innerWidth <= 820 ? 40 : 48);
      // 图标优先（风格统一，像 WC3）；没有图标的才用模型缩略图或文字
      const face = icon ? `<img src="${icon.src}">` : c.ico ? `<img class="svg" src="assets/icons/${c.ico}.svg" alt="">`
        : thumb ? `<span class="thumb" style="${thumb}"></span>` : `<span class="ic ${c.atk ? 'atk-' + c.atk : ''}">${c.icon}</span>`;
      const ring = c.atk && (c.ico || thumb) && !c.hero ? `<span class="atkring atk-${c.atk}"></span>` : '';     // 塔按攻击类型加一圈颜色
      b.innerHTML = face + ring + `<span class="hk">${c.key}</span>` + (c.cost ? `<span class="cost">${c.cost >= 10000 ? (c.cost / 1000).toFixed(0) + 'k' : c.cost}</span>` : '')
        + (c.cdOf ? '<span class="cdov"></span><span class="cdtx"></span>' : '') + (c.passive ? '<span class="tag">被动</span>' : '') + (c.learned ? '<span class="tag ok">已学</span>' : '');
      b.oncontextmenu = ev => { ev.preventDefault(); if (c.rfn) { c.rfn(); showTip(null); } };
      b.disabled = !!c.disabled;
      b.onclick = () => { showTip(c); if (!c.disabled) c.fn(); };
      b.onmouseenter = () => showTip(c); b.onmouseleave = () => showTip(null);
    }
    grid.appendChild(b);
  }
}
// 冷却遮罩：每帧更新（顺时针扫过的暗色扇形 + 剩余秒数）
function updateCooldowns() {
  const btns = $('cmd').children;
  CMDS.forEach((c, i) => {
    if (!c || !c.cdOf || !btns[i]) return;
    const [left, max] = c.cdOf(), ov = btns[i].querySelector('.cdov'), tx = btns[i].querySelector('.cdtx');
    if (!ov) return;
    const p = left > 0 ? left / max : 0;
    ov.style.setProperty('--p', (p * 100).toFixed(1) + '%'); ov.style.display = p > 0 ? 'block' : 'none';
    tx.textContent = left > 0.05 ? (left >= 1 ? Math.ceil(left) : left.toFixed(1)) : '';
  });
}
function showTip(c) { const t = $('tip'); if (!c) { t.classList.add('hidden'); return; } t.innerHTML = `<div class="tn">${c.name} <span class="hk2">(${c.key})</span></div><div>${c.tip}</div>`; t.classList.remove('hidden'); }

// ================================================================ 输入
function hitTest(x, y) {
  const r0 = Math.max(120, 16 * DPR / S);
  const b = G.builder; if (dist2(x, y, b.x, b.y) < (r0 * 0.9) ** 2) return b;
  let best = null, bd = r0 * r0;
  for (const t of G.towers) { const d = dist2(x, y, t.x, t.y); if (d < bd) { bd = d; best = t; } }
  if (best) return best;
  bd = Math.max(90, 12 * DPR / S) ** 2;
  for (const m of G.monsters) { const d = dist2(x, y, m.x, m.y); if (d < bd) { bd = d; best = m; } }
  return best;
}
function select(e) { G.selected = e; G.menu = 'main'; G.placing = null; G.pending = null; showTip(null); uiDirty(); }
function groundClick(x, y, shift) {
  if (G.placing) {
    const gx = snap(x), gy = snap(y);
    if (!canPlace(gx, gy, true)) return msg('这里不能建造（不能挡路或重叠）');
    if (orderBuild(G.placing, gx, gy, shift)) { if (!shift) { G.placing = null; G.menu = 'main'; } uiDirty(); }   // 按住 Shift 可连续排队建造
    return;
  }
  if (G.pending === 'move') { orderMove(x, y, shift); G.pending = null; uiDirty(); return; }
  if (G.pending === 'blink') { blinkTo(x, y); G.pending = null; uiDirty(); return; }
  const hit = hitTest(x, y);
  if (hit) return select(hit);
  if (G.selected === G.builder) orderMove(x, y, shift);   // 选中守卫者时点击空地 = 移动（方便触屏）
  else select(null);
}
let drag = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, cx: G.cam.x, cy: G.cam.y, moved: false, button: e.button };
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (drag && drag.button === 0) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
    if (drag.moved) { G.cam.x = drag.cx - dx * DPR / S; G.cam.y = drag.cy + dy * DPR / S; clampCam(); }
  }
});
cv.addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!G || !d || d.moved || G.phase === 'over' || G.phase === 'win') return;
  const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  const x = wx(mouse.x), y = wy(mouse.y);
  if (d.button === 2) {                                      // 右键：守卫者移动 / 取消
    if (G.placing || G.pending) { G.placing = null; G.pending = null; uiDirty(); return; }
    if (G.selected === G.builder) orderMove(x, y, e.shiftKey);
    return;
  }
  if (d.button === 0) groundClick(x, y, e.shiftKey);
});
cv.addEventListener('pointerleave', () => { mouse = null; });
// 指针样式：每帧按当前状态和鼠标下的单位更新
let curCls = '';
function updateCursor() {
  let c = '';
  if (drag && drag.moved) c = 'cur-pan';
  else if (G.placing) c = 'cur-build';
  else if (G.pending) c = 'cur-target';
  else if (mouse) { const h = hitTest(wx(mouse.x), wy(mouse.y)); c = !h ? '' : h.uid ? 'cur-enemy' : 'cur-friend'; }
  if (c !== curCls) { curCls = c; cv.className = c; }
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const bx = wx(px), by = wy(py);
  G.cam.zoom *= e.deltaY < 0 ? 1.15 : 1 / 1.15; clampCam();
  G.cam.x += bx - wx(px); G.cam.y += by - wy(py); clampCam();
}, { passive: false });
// 小地图：点击/拖动移动镜头
let mmDown = false;
const mmMove = e => {
  const r = mm.getBoundingClientRect(), k = Math.min(mm.width, mm.height) / (WORLD * 2 + 300);
  G.cam.x = ((e.clientX - r.left) * DPR - mm.width / 2) / k; G.cam.y = (mm.height / 2 - (e.clientY - r.top) * DPR) / k; clampCam();
};
mm.addEventListener('pointerdown', e => { mmDown = true; mm.setPointerCapture(e.pointerId); mmMove(e); });
mm.addEventListener('pointermove', e => { if (mmDown) mmMove(e); });
mm.addEventListener('pointerup', () => { mmDown = false; });
const keys = new Set();
window.addEventListener('keydown', e => {
  if (!G || !$('modal').classList.contains('hidden')) return;
  if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); return; }
  if (e.key === 'Escape') { if (G.placing || G.pending) { G.placing = null; G.pending = null; } else if (G.menu !== 'main') G.menu = 'main'; else select(null); uiDirty(); return; }
  if (e.key === 'F1') { e.preventDefault(); select(G.builder); centerOn(G.builder); return; }
  if (e.key === 'F2' && G.hero) { e.preventDefault(); select(G.hero); centerOn(G.hero); return; }
  if (e.key === ' ') { e.preventDefault(); if (G.selected) centerOn(G.selected); return; }
  if (e.key.toLowerCase() === 'p') { G.paused = !G.paused; return; }
  const k = e.key.toUpperCase();
  if (dirty) { renderCmds(); dirty = false; }          // 连按热键（如 B → W）时先刷新命令面板
  const c = CMDS.find(c => c && c.key === k);
  if (c && !c.disabled) { c.fn(); showTip(c); }
});
window.addEventListener('keyup', e => keys.delete(e.key));
$('btn-start').onclick = () => { if (G.phase === 'prep') G.timer = 0.01; };
$('btn-pause').onclick = () => { G.paused = !G.paused; };
$('btn-speed').onclick = () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; };
$('btn-help').onclick = showHelp;
$('btn-zin').onclick = () => { G.cam.zoom *= 1.3; clampCam(); };
$('btn-zout').onclick = () => { G.cam.zoom /= 1.3; clampCam(); };
$('q-builder').onclick = () => { select(G.builder); centerOn(G.builder); };
$('q-hero').onclick = () => { if (G.hero) { select(G.hero); centerOn(G.hero); } };
window.addEventListener('resize', resize);

// ================================================================ 弹窗
function showModal(html) { $('modal-box').innerHTML = html; $('modal').classList.remove('hidden'); }
function hideModal() { $('modal').classList.add('hidden'); }
function showStart() {
  const heroes = Object.values(D.heroes);
  showModal(`<h2>绿色循环圈外传 · H5 复刻</h2>
    <p>怪物沿"回"字形双环路线<b>永远绕圈</b>，不会漏到基地。<b>场上怪物超过 40 只即失败</b>。每波按时出怪，不管上一波清没清完。</p>
    <p>选中<b>守卫者</b>（F1），点击地面让它移动；在右下角命令面板里打开<b>建造</b>，选塔后点地面，守卫者会走过去建造。拖动画面或点击小地图移动镜头，滚轮缩放。</p>
    <div class="row"><button class="primary" id="m-demo">▶ 演示：前两波<br><small>${MODES.demo.desc}</small></button></div>
    <h3>选择模式</h3><div class="row" id="m-modes">${Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => `<button data-m="${k}" class="${k === 'solo' ? 'primary' : ''}">${m.name}<br><small>${m.desc}</small></button>`).join('')}</div>
    <h3>选择英雄塔（英雄旗帜：4 选 1）</h3><div class="hero-grid">${heroes.map(h => `<button data-h="${h.name}"><b>${h.name}</b> ${atkTag(h.atk)}<br><small>${h.title}</small><br><small>射程 ${h.range} · 攻击间隔 ${h.cd}s</small><br><small style="color:#8fa797">${h.skills.slice(0, 4).map(s => s.name).join(' / ')}</small></button>`).join('')}</div>`);
  let mode = 'solo';
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; document.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('primary', x === b)); });
  $('m-demo').onclick = () => { newGame('demo'); hideModal(); resize(); clampCam(); uiDirty(); };
  document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { newGame(mode); G.heroChoice = b.dataset.h; hideModal(); resize(); clampCam(); uiDirty(); });
}
function showHelp() {
  const rows = Object.entries({ 普通: 'normal', 穿刺: 'pierce', 魔法: 'magic', 混乱: 'chaos' }).map(([cn, k]) => {
    const r = D.damage[k];
    return `<tr><th>${cn}</th><td>${r[1] * 100}</td><td>${r[2] * 100}</td><td>${r[0] * 100}</td><td>${r[6] * 100}</td></tr>`;
  }).join('');
  const was = G.paused; G.paused = true;
  showModal(`<h2>说明</h2>
    <p><b>失败</b>：场上怪物数 &gt; 40。<b>胜利</b>：撑过 48 波后，在 300 秒内击杀最终 BOSS（龙 + 魔王）。</p>
    <p><b>操作</b>：按住 Shift 下命令可以排队（连续建造多座塔）；F1 选中守卫者，F2 选中英雄；守卫者选中时点击 / 右键地面 = 移动；命令面板的按钮都有热键（Q W E R / A S D F …），Esc 返回或取消；方向键或拖动画面移动镜头，滚轮缩放，点击小地图跳转；空格让镜头对准选中单位；P 暂停。</p>
    <p><b>护甲系数</b>（%，原图任务面板原文）：</p>
    <table><tr><th>攻击＼护甲</th><th>抗性</th><th>魔法</th><th>物理</th><th>神圣</th></tr>${rows}</table>
    <p>护甲减伤 = 护甲×0.02 /（1 + 护甲×0.02）。腐蚀塔、减防光环可以把护甲打成负数，负护甲会增伤。</p>
    <p><b>精英怪</b>：每只怪 1/55 概率成为精英（粉色外圈），带一种 900 范围的光环。击杀得 1~3 木材；由英雄塔击杀时，英雄所选属性 +1。</p>
    <p><b>资源</b>：起手 2000 金、5 木；12 木 = 1 人口；1 木 = 300 金；500 金 = 1 木。回收塔返还 100% 金币。</p>
    <p><b>英雄塔</b>：升级要 等级×100 金 + 200 魔法（英雄每击杀 +2 魔法）。学技能：第 1 个免费；第 2/3/4 个分别要 18/36/54 木材，且力量 ≥ 80/160/240。</p>
    <p style="color:#7f9483;font-size:11px">命令图标的图形来自 <a href="https://game-icons.net" target="_blank" style="color:#9fc4a6">game-icons.net</a>（Lorc、Delapouite 等，CC BY 3.0）。</p>
    <div class="row"><button class="primary" id="m-close">继续游戏</button></div>`);
  $('m-close').onclick = () => { hideModal(); G.paused = was; };
}

// ================================================================ 主循环
let last = performance.now(), acc = 0, uiTick = 0;
const DT = 1 / 30;
function frame(now) {
  const el = Math.min(0.25, (now - last) / 1000); last = now;
  if (G && !G.paused && $('modal').classList.contains('hidden')) {
    acc += el * G.speed;
    let n = 0;
    while (acc >= DT && n < 40) { step(DT); acc -= DT; n++; }
  }
  if (G) {
    // 方向键平移镜头
    const pan = 1400 / G.cam.zoom * el;
    if (keys.has('ArrowLeft')) G.cam.x -= pan; if (keys.has('ArrowRight')) G.cam.x += pan;
    if (keys.has('ArrowUp')) G.cam.y += pan; if (keys.has('ArrowDown')) G.cam.y -= pan;
    draw(); renderTop(); updateCursor(); updateCooldowns();
    uiTick += el;
    if (dirty || uiTick > 0.5) { uiTick = 0; renderInfo(); if (dirty) renderCmds(); else refreshCmdState(); dirty = false; }
  }
  requestAnimationFrame(frame);
}
// 金币/木材变化时只刷新按钮可用状态，避免整块重建打断点击
function refreshCmdState() {
  const fresh = buildCmds();
  const sig = c => c ? c.key + c.name + !!c.disabled + !!c.active + !!c.auto : '-';
  if (fresh.map(sig).join() !== CMDS.map(sig).join()) renderCmds();
}
resize();
newGame('solo');
showStart();
requestAnimationFrame(frame);
window.__G = () => G;   // 调试用
window.__dbg = { get G() { return G; }, NODES, EDGES, kill, spawnMonster, FXS, buildTower, upgradeTower, learnSkill, heroLevelUp, step, canPlace, newGame, monstersAlive, towerStats, rerollBuild, orderBuild, orderMove, castSkill };
})();
