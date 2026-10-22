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
  foodPrice: 12, woodToGold: 300,
  maxAuraPerKind: 2,
  // 兔子 = 原图单位 nshe「成就商店」：每个 BOSS 波刷在地图随机位置，60 秒后消失（UnitApplyTimedLife 60），用当局成就买道具。
  // 原图的当局成就大多来自平台账号（至尊等级开局送 1~10 点、各种成就），这里改成开局送 5 点 + 每次 Perfect 1 点
  startAch: 5, achPerPerfect: 1, rabbitLife: 60, rabbitReach: 600, rabbitScrollAch: 20,
  rabbitWaves: [10, 20, 30, 40, 48], rabbitDelay: 20,
  rerollWood: 6,             // 随机建造：第一次免费，之后每次 6 木材（A03C 的触发器 nY / nZ）
  shopReach: 600,            // 商店（u00L，原图摆在地图中央 (0,128)）：守卫者要走到旁边才能买
};
const MODES = {
  solo: { name: '单人推荐', interval: 38, hp: 0.35, food: 8, short: '怪物生命 ×0.35', desc: '38 秒/波，怪物生命 ×0.35，起手人口 8' },
  origin: { name: '原版数值', interval: 33, hp: 1, food: 6, short: '8 人合作难度', desc: '33 秒/波，原图数值（原图为 8 人合作设计，单人极难）' },
  relax: { name: '休闲', interval: 50, hp: 0.2, food: 10, short: '50 秒一波', desc: '50 秒/波（旧版节奏），怪物生命 ×0.2，起手人口 10' },
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
const CAT_CN = { main: '主塔', raw: '原始塔', sup: '辅助塔', aura: '光环塔', alt: '另类塔', hero: '英雄塔', big: '大辅助', witch: '巫系辅助', uniq: '全场唯一', evo: '大辅助（进化）', summon: '召唤物' };

// ---------------------------------------------------------------- 路线 (由地图 region + 移动指令还原)
// 原图 8 名玩家的塔遍布整个环；单人时把路线整体缩小到 MAP_SCALE，让塔的射程覆盖更多路段（射程、移速等数值不变）
const MAP_SCALE = 0.55;
const NODES_RAW = {
  // 外环
  L: [-3856, 3888], Z: [0, 3888], Y: [3888, 3840], k: [3888, 16], j: [3840, -3888], P: [0, -3888], O: [-3888, -3840], M: [-3888, 0],
  // 内环
  S: [-2864, 2848], l: [0, 2768], W: [2832, 2880], h: [2768, 0], g: [2864, -2864], d: [-16, -2768], c: [-2880, -2880], T: [-2768, 0],
  // 四角出怪口：左上 I → K → L（红色玩家），右上 p → X → Y，右下 m → i → j，左下 o → N → O
  I: [-4864, 5216], K: [-4864, 3776], p: [5216, 4880], X: [3744, 4864], m: [4832, -5264], i: [4800, -3744], o: [-5248, -4832], N: [-3808, -4768],
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
    I: [-42 * CELL, 45 * CELL], K: [-42 * CELL, o], p: [45 * CELL, 42 * CELL], X: [o, 42 * CELL],
    m: [42 * CELL, -45 * CELL], i: [42 * CELL, -o], o: [-45 * CELL, -42 * CELL], N: [-o, -42 * CELL],
  };
})();
const EDGES = [
  ['L', 'Z'], ['Z', 'Y'], ['Y', 'k'], ['k', 'j'], ['j', 'P'], ['P', 'O'], ['O', 'M'], ['M', 'L'],
  ['S', 'l'], ['l', 'W'], ['W', 'h'], ['h', 'g'], ['g', 'd'], ['d', 'c'], ['c', 'T'], ['T', 'S'],
  ['M', 'T'], ['Z', 'l'], ['k', 'h'], ['P', 'd'],
];
// 原图 8 个出怪口：四角各一个进外环、中心四个进内环。单人只开左上角那个；另外三个角先摆出来，留给以后多人联机
const SPAWN_GATES = [['I', 'K', 'L'], ['p', 'X', 'Y'], ['m', 'i', 'j'], ['o', 'N', 'O']];
const SPAWN_PATH = SPAWN_GATES[0];
const ADJ = {};
for (const [a, b] of EDGES) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }
const ROAD_SEGS = EDGES.concat(SPAWN_GATES.flatMap(([a, b, c]) => [[a, b], [b, c]])).map(([a, b]) => [NODES[a], NODES[b]]);
const GATE_POS = SPAWN_GATES.map(g => NODES[g[0]]);
const ROAD_HALF = 110;   // 路宽一半
const SHOP = { isShop: true, x: 0, y: 64 };             // 原图 CreateUnit(Player(15),'u00L',0,128)，按 MAP_SCALE 缩放后对齐网格
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
    builder: { isBuilder: true, x: NODES.L[0] + 250, y: NODES.L[1] + 450, speed: 500, order: null, blinkCd: 0, mana: FOD.maxMana, fodAt: 0 },
    inv: Array(6).fill(null),
    cam: { x: NODES.L[0] + 600, y: NODES.L[1] - 300, zoom: 2.4 },
    menu: 'main', pending: null,
    ach: RULE.startAch, rabbit: null, rabbitScroll: false, buys: {}, itemCd: {},
    waveVars: {}, next: null, carryHint: null, sc: null, curUnit: null, waveHook: null, waveNote: '', finalCountdown: false,
    k7: rint(1, 2),          // 原图开局随机：30 波出亡灵飞艇（1）还是地精飞艇（2）
    mem: {},                 // 主塔回收时记下的技能等级和魔法，再建同一种主塔时恢复（原图 D1~D7、DK/DL/DM 等全局变量）
    bounce: { atk: 0, as: 0, talent: false, bolt: 1 },   // 弹跳塔的玩家科技：提升攻击 R000 / 攻速 R001、弹跳天赋 R00P、MAX 回收时记下的灵魂重击等级（Oq）
  };
  G.selected = G.builder;
  FXS.clear();
  rerollBuild(true);
  rollFn(WR.start); refreshHint();                 // 准备阶段就预告第 1 波
  SFX.startMusic();
}

// ---------------------------------------------------------------- 建造栏
// 原图随机建造（war3map.j 里 Qf / Hd / He / Hf / Hh / Hg / H7 七个随机数）：1 主塔、1 原始塔、1 光环塔、1 新辅助（4 大辅助 + 4 巫系）、
// 1 小辅助、1 另类塔、1 全场唯一塔；另外 Hc 从 17 个英雄塔里随机放开 1 个（有"英雄赞助"是 34 个）。本复刻只做了 4 个英雄，就在这 4 个里抽
const FAM = Object.values(D.towers);
const byCat = c => FAM.filter(f => f.cat === c).map(f => f.name);
const SLOT_POOL = { main: ['main'], raw: ['raw'], aura: ['aura'], newsup: ['big', 'witch'], sup: ['sup'], alt: ['alt'], uniq: ['uniq'] };
const SLOTS = Object.keys(SLOT_POOL);
const slotPool = s => SLOT_POOL[s].flatMap(byCat);
const slotOf = fam => SLOTS.find(s => SLOT_POOL[s].includes(D.towers[fam].cat));
function rerollBuild(free) {
  if (!free) {
    if (G.rerolls > 0 && G.wood < RULE.rerollWood) return msg(`木材不足（随机建造需要 ${RULE.rerollWood} 木材，首次免费）`);
    if (G.rerolls > 0) G.wood -= RULE.rerollWood;
    G.rerolls++;
  }
  if (MODES[G.mode].build) G.build = MODES[G.mode].build.slice();      // 演示模式：固定建造栏
  else G.build = SLOTS.map(s => pick(slotPool(s)));
  G.heroChoice = MODES[G.mode].hero || pick(Object.keys(D.heroes));
  G.placing = null;
  uiDirty();
}

// ---------------------------------------------------------------- 伤害
function armorMult(armor) {
  return armor >= 0 ? 1 / (1 + 0.02 * armor) : 2 - Math.pow(0.98, -armor);   // DefenseArmor=0.02
}
// 护甲：减防光环和剑刃之魂的减甲是同一种光环（AHad），只取大的；恐惧塔 / 恐惧之眼也不叠加，只取大的
const debuff = (m, k) => m.deb[k] && m.deb[k].until > G.t ? m.deb[k].v : 0;
function effArmor(m) {
  return m.armor + m.auraFocus - Math.max(m.auraArmorDown, debuff(m, 'blade')) - m.armorDown - m.shred - debuff(m, 'fear');
}
function typeMult(atk, m) {
  const row = D.damage[atk] || D.damage.normal;
  return row[ARMOR_COL[m.type] ?? 7];
}
// 光环、原始战力等只加塔的"基础攻击"（在 attack() 里乘进攻击伤害），这里不再放大技能、持续伤害和区域伤害
function hurt(m, amount, atk, src, opt = {}) {
  if (m.dead || !(amount > 0)) return 0;   // 同时挡掉 NaN
  if (m.magicImmune && atk === 'magic') return 0;          // 魔法免疫（ACm3）：魔法攻击打不动
  let dmg = amount * typeMult(atk, m);
  if (!opt.ignoreArmor && !(m.ignoreArmorUntil > G.t)) dmg *= armorMult(effArmor(m));   // 灵魂锁链：目标护甲被无视
  m.hp -= dmg;
  const owner = src && src.cat === 'summon' && src.owner && !src.owner.isHero ? src.owner : src;   // 冰雹狮鹫等召唤物的伤害算在塔上
  if (owner) owner.dealt = (owner.dealt || 0) + dmg;
  if (m.hp <= 0) kill(m, src);
  return dmg;
}
function kill(m, src) {
  if (m.dead) return;
  m.dead = true; m.hp = 0;
  G.gold += Math.round(m.bounty);
  G.kills++;
  if (src) {
    src.kills = (src.kills || 0) + 1;
    const owner = src.owner || src;
    if (owner.isHero) owner.mana = Math.min(owner.maxMana(), owner.mana + 2);    // 英雄每击杀 +2 魔法
    else if (owner.fam && G.towers.includes(owner)) towerKilled(owner, m);         // 塔的魔法值（功勋）
  }
  if (m.elite) {
    const w = rint(1, 3); G.wood += w;
    const owner = src && (src.owner || src);
    if (owner && owner.isHero) { owner.stat[owner.growth] += 1; msg(`英雄击杀精英怪：${statCN(owner.growth)} +1，木材 +${w}`); }
    else msg(`击杀精英怪：木材 +${w}`);
    const bm = G.towers.find(o => o.bmax);         // 杀死精英怪 20% 概率升级弹跳塔 MAX 的灵魂重击
    if (bm && bm.bolt < BOUNCE.bolt.length && Math.random() < 0.2) { bm.bolt++; msg(`弹跳塔 MAX 灵魂重击升到 ${bm.bolt} 级`); }
  }
  if (m.onDeath) m.onDeath(src);
  SFX.ent('unit:' + m.uid, 'death', { x: m.x, y: m.y });
  const a = (metaOf(m) || {}).actions?.death;       // 按登记判断，不等精灵图加载（3D 模型画尸体时精灵图可能从没请求过）
  if (a) { addFx({ kind: 'corpse', ent: { uid: m.uid, face: m.face, elite: m.elite, boss: m.boss }, x: m.x, y: m.y, t0: G.t, life: a.frames / a.fps + 1.2 }); }
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
    auraFocus: 0, auraArmorDown: 0, auraSlow: 0, auraSpeed: 0, auraRegen: 0, burn: null, dots: [],
    deb: {}, ignoreArmorUntil: 0, frozenUntil: 0, expel: null,       // deb：限时减甲 / 加速（{ v, until }）；expel：被驱逐（遣返用）
    boss: !!opt.boss, r: opt.boss ? 90 : 55, elite: null,
  };
  if (!opt.noElite && !NO_ELITE.has(id) && Math.random() < RULE.eliteChance) makeElite(m);
  m.cr = colRadius(m);
  G.monsters.push(m);
  if (G.waveHook && G.waveHook.onSpawn) G.waveHook.onSpawn(m);
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
// 遣返（war3map.j 的 BHC）：带驱逐状态的怪走进 L、Y 两个转弯口时，驱逐塔的驱逐 85%、巫师塔（光明）的驱逐 95% 概率被传回出怪口。
// 魔王不会被遣返
const REPATRIATE_AT = new Set(['L', 'Y']);
function repatriate(m) {
  const e = m.expel;
  if (!e || e.until <= G.t || m.uid === 'Udea' || !REPATRIATE_AT.has(m.cur) || Math.random() >= e.p) return false;
  FXS.ring(m.x, m.y, 140, '#9fe3ff', 0.45, 4);
  const [x, y] = NODES[SPAWN_PATH[0]];
  Object.assign(m, { x: x + rnd(-150, 150), y: y + rnd(-150, 150), cur: SPAWN_PATH[0], prev: null, path: SPAWN_PATH.slice(1), expel: null });
  m.target = nextNode(m);
  FXS.ring(m.x, m.y, 140, '#9fe3ff', 0.45, 4);
  return true;
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
  let spd = m.speed * (1 + m.auraSpeed + debuff(m, 'expelSpeed')) * (1 - Math.max(m.slow * (G.t < m.slowUntil ? 1 : 0), m.auraSlow));
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
    m.prev = m.cur; m.cur = m.target;
    if (repatriate(m)) return;
    m.target = nextNode(m);
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
function towerFood(fam) { return fam === 'hero' ? D.heroes[G.heroChoice].food : Math.max(0, D.towers[fam].levels[0].food || 0); }
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
  for (const [sx0, sy0] of GATE_POS) if (Math.abs(cx - sx0) < 352 && Math.abs(cy - sy0) < 352) return false;
  if (Math.abs(cx - SHOP.x) < 160 && Math.abs(cy - SHOP.y) < 160) return false;     // 中央商店
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
// 数量限制（原图用"只能建造一个主塔 / 只能建造2个新辅助 / 只能建造1个巫系辅助 / 全场只能建造一个"这些占位单位实现）
function buildBlock(fam) {
  const f = D.towers[fam], n = fn => G.towers.filter(fn).length;
  // 弹跳塔不占主塔名额（原图要求的是 n01U，不是 ovln）：随机模式最多 3 座（Bbt），有弹跳塔 MAX 后不能再建（n01U 被删掉）
  if (fam === '弹跳塔') return G.towers.some(t => t.bmax) ? '拥有弹跳塔 MAX 后不能建造弹跳塔' : n(t => t.fam === fam) >= 3 ? '只允许建造 3 个弹跳塔' : null;
  if (f.cat === 'main' && G.towers.some(t => t.cat === 'main' && t.fam !== '弹跳塔')) return '只能建造一个主塔';
  if (f.cat === 'aura' && n(t => t.fam === fam) >= RULE.maxAuraPerKind) return '随机模式每种光环限制 2 个';
  if (f.cat === 'big' && n(t => t.cat === 'big' || t.cat === 'evo') >= 2) return '只能建造 2 个新辅助（大辅助）';
  if (f.cat === 'witch' && n(t => t.cat === 'witch') >= 1) return '只能建造 1 个巫系辅助';
  if (f.cat === 'uniq' && n(t => t.fam === fam) >= 1) return '全场唯一，只能建造一个';
  return null;
}
function newTower(fam, x, y, extra) {
  const f = D.towers[fam], lv0 = f.levels[0];
  const t = { id: G.nextId++, fam, cat: f.cat, x, y, lv: 0, levels: f.levels, spent: lv0.gold, food: lv0.food || 0,
    cdLeft: 0, kills: 0, dealt: 0, attacks: 0, mana: 0, maxMana: 0, angle: 0, buff: {}, cds: {}, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, ...extra };
  const kit = KITS[fam];
  if (kit && kit.init) kit.init(t, G.mem[fam]);
  return t;
}
function buildTower(fam, x, y) {
  if (fam === 'hero') return buildHero(x, y);
  const lv0 = D.towers[fam].levels[0], why = buildBlock(fam);
  if (why) return msg(why);
  if (G.gold < lv0.gold) return msg('金币不足');
  if (foodUsed() + (lv0.food || 0) > G.foodCap) return msg('人口不足（12 木材可买 1 人口）');
  G.gold -= lv0.gold;
  const t = newTower(fam, x, y);
  G.towers.push(t);
  const kit = KITS[fam];
  return kit && kit.built ? kit.built(t) : t;     // 建成时的触发器（弹跳天赋快建会把它换成 MAX）
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
  SFX.ui('upgrade');
  uiDirty();
}
function sellTower(t) {
  G.gold += t.spent;                      // ConstructionRefundRate = UpgradeRefundRate = 1.0
  const kit = KITS[t.fam];
  if (kit && kit.sell) kit.sell(t);       // 功勋木材、容器金币等额外返还，主塔记下技能等级
  SFX.ui('sell');
  if (t.isHero) G.hero = null;
  G.towers = G.towers.filter(x => x !== t && x.owner !== t);
  G.zones = G.zones.filter(z => z.owner !== t);
  if (G.selected === t) G.selected = G.builder;
  G.menu = 'main'; uiDirty();
}

// ---------------------------------------------------------------- 守卫者 (移动 / 走到目标再建造 / 闪烁)
function giveOrder(o, queue) { const b = G.builder; if (queue && b.order) (b.queue = b.queue || []).push(o); else { b.order = o; b.queue = []; } }
function orderMove(x, y, queue) { giveOrder({ kind: 'move', x, y }, queue); addFx({ kind: 'mark', x, y, life: 0.6, color: '#6fd17a' }); }
function orderBuild(fam, x, y, queue) {
  const cost = fam === 'hero' ? D.heroes[G.heroChoice].gold : D.towers[fam].levels[0].gold;
  const food = towerFood(fam);
  if (G.gold < cost) return msg('金币不足'), false;
  if (fam === 'hero' && G.wood < D.heroes[G.heroChoice].wood) return msg('木材不足'), false;
  if (foodUsed() + food > G.foodCap) return msg('人口不足（12 木材可买 1 人口）'), false;
  const why = fam === 'hero' ? heroBlock() : buildBlock(fam);
  if (why) return msg(why), false;
  giveOrder({ kind: 'build', fam, x, y }, queue);
  return true;
}
function builderUpdate(dt) {
  const b = G.builder, o = b.order;
  b.blinkCd = Math.max(0, b.blinkCd - dt);
  b.mana = Math.min(FOD.maxMana, b.mana + FOD.regen * dt);
  if (!o) return;
  if (o.target) {                                              // 对单位的命令（用物品、死亡之指）：跟着目标走，目标没了就作废
    if (o.target.dead || (o.kind === 'use' && !G.towers.includes(o.target))) { b.order = (b.queue && b.queue.shift()) || null; uiDirty(); return; }
    o.x = o.target.x; o.y = o.target.y;
  }
  const reach = o.reach || (o.kind === 'build' ? 220 : 8);
  const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
  if (d <= reach) {
    if (o.kind === 'build') {
      if (!canPlace(o.x, o.y)) msg('目标位置已被占用');
      else { const t = buildTower(o.fam, o.x, o.y); if (t) { addFx({ kind: 'ring', x: t.x, y: t.y, r: 160, life: 0.5, color: '#ffd257' }); SFX.ui('construct', { x: t.x, y: t.y }); b.buildT = G.t; b.face = Math.atan2(o.y - b.y, o.x - b.x); } }
      uiDirty();
    }
    if (o.kind === 'use') useItem(o.item, o.target);
    if (o.kind === 'fod') castFinger(o.target);
    b.order = (b.queue && b.queue.shift()) || null; return;     // Shift 排队的下一个命令
  }
  const stepLen = Math.min(d - reach + 1, b.speed * dt);
  b.x += dx / d * stepLen; b.y += dy / d * stepLen; b.face = Math.atan2(dy, dx);
}
// 死亡之指（原图 A04W，守卫者自带）：对敌人使用，射程 800，冷却 90 秒，消耗 5 点魔法（守卫者魔法上限 10，每秒恢复 2）。
// 技能本身（ANfd）直接杀死目标；BOSS 按原图触发器另算（war3map.j 的 wd）：龙 / 狗头人类 BOSS 生命高于 15 万时扣 10 万、否则无效，
// 大红牛扣 7000，大骷髅 2.5 万，再次复活的骷髅 100 万，直升机 / 游艇 / 魔王 10 万。本复刻怪物生命按模式缩放，这些数也一起缩放
const FOD = { range: 800, cd: 90, mana: 5, maxMana: 10, regen: 2, mdx: 'abilities/spells/demon/demonboltimpact/demonboltimpact.mdx' };
const FOD_BOSS = { nsqt: 7000, nsko: 25000, nsoc: 25000, nslm: 1e6, ndrj: 1e5, n06Y: 1e5, Udre: 1e5, Udea: 1e5 };
const FOD_DRAGON = ['nbzd', 'nrdr', 'nrdk', 'ngrd', 'nkob', 'nkot', 'nkog', 'ngst', 'njga'];
const fodLeft = () => Math.max(0, G.builder.fodAt - G.t);
function fodBlock() { return fodLeft() > 0 ? '死亡之指冷却中' : G.builder.mana < FOD.mana ? '魔法值不足' : null; }
function orderFinger(m, queue) {
  if (!m || !m.uid || m.dead) return msg('只能对敌人使用');
  if (m.magicImmune) return msg('目标魔法免疫');
  const why = fodBlock(); if (why) return msg(why);
  giveOrder({ kind: 'fod', target: m, x: m.x, y: m.y, reach: FOD.range }, queue);
}
function castFinger(m) {
  const b = G.builder, why = fodBlock();
  if (why) return msg(why);
  if (m.magicImmune) return msg('目标魔法免疫，死亡之指没有放出');
  b.mana -= FOD.mana; b.fodAt = G.t + FOD.cd; b.spellT = G.t; b.face = Math.atan2(m.y - b.y, m.x - b.x);
  FXS.beam(b.x, b.y, 120, m.x, m.y, 60, '#c48bff', 1.6, 0.45);
  if (!(U3 && U3.burst(FOD.mdx, m.x, m.y))) FXS.explosion(m.x, m.y, 0.7, '#c48bff');
  const k = G.hpScale;
  const loss = FOD_DRAGON.includes(m.uid) ? (m.hp > 150000 * k ? 100000 * k : 0) : FOD_BOSS[m.uid] ? FOD_BOSS[m.uid] * k : m.hp;
  uiDirty();
  if (!loss) return msg(`死亡之指对${m.name}没有效果（它的生命不高于 ${fmt(150000 * k)}）`);
  m.hp -= loss; b.dealt = (b.dealt || 0) + Math.min(loss, m.hp + loss);
  if (m.hp <= 0) kill(m, b); else msg(`死亡之指：${m.name}失去 ${fmt(loss)} 生命`);
}
function blinkTo(x, y) {
  const b = G.builder;
  if (b.blinkCd > 0) return msg('闪烁冷却中');
  addFx({ kind: 'ring', x: b.x, y: b.y, r: 120, life: 0.4, color: '#c48bff' }); SFX.ui('blink', { x: b.x, y: b.y });
  b.x = clamp(x, -WORLD, WORLD); b.y = clamp(y, -WORLD, WORLD); b.order = null; b.queue = []; b.blinkCd = 1;
  addFx({ kind: 'ring', x: b.x, y: b.y, r: 120, life: 0.4, color: '#c48bff' });
}

function towerStats(t) {
  if (t.isHero) return heroStats(t);
  const lv = curLevel(t);
  // 目标数只对弹射武器有意义：弹跳塔、通灵塔（武器类型 mbounce，3 个目标）。毒塔单位表里的 targCount 是普通飞弹，原图只打一个目标
  const targets = t.fam === '弹跳塔' || t.fam === '通灵塔' ? lv.targets || 1 : 1;
  const dmg = lv.dmg + (t.fam === '弹跳塔' ? BOUNCE.atkStep * G.bounce.atk : 0);     // 弹跳提升攻击（R000）加的是基础攻击
  return { dmg, cd: lv.cd, range: lv.range, atk: lv.atk, targets };
}
// WC3 的塔锁定目标：一直打同一个，直到它死掉或走出射程才重新找最近的（腐蚀、减速、重击就集中在一个目标上）
function lockTarget(t, r) {
  const m = t.target;
  if (m && !m.dead && dist2(t.x, t.y, m.x, m.y) <= r * r) return m;
  return (t.target = nearest(t.x, t.y, r));
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
// 原版投射物（assets/w3missiles.js）：有就用原图的模型、速度、弧度，命中效果沿用上面的风格
const W3M = window.W3_MISSILE_OF || {};
const w3opt = t => { const o = W3M[t.isHero ? 'hero:' + t.heroName : 'tower:' + t.fam]; return o ? { w3: o.missile, speed: o.speed, arc: o.arc } : {}; };
const sndKey = t => t.isHero ? 'hero:' + t.heroName : 'tower:' + t.fam;      // 音效登记（assets/w3sounds.js）的 key
const muzzle = (t, style) => ({ x: t.x, y: t.y, z: (MUZZLE[style] || 150) + (t.isHero ? 30 : 0) });
function shot(t, m) { t.face = Math.atan2(m.y - t.y, m.x - t.x); }

// 攻速 / 攻击加成。WC3 里同一种 buff 不叠加，取最大：
//   攻速：加速光环、原始战速、魔幻塔急速、破坏塔极速都是"耐久光环"类（AOae），取最大；萨满嗜血术和剑圣致速不叠加，取最大；火速另算
//   攻击：攻击光环和剑圣强攻（AEar）取最大；原始战力、魔幻塔强攻（Aakb）、兽人咆哮、神力另算
// 这些都只加塔的基础攻击（attack() / heroAttack() 里乘进去），不加技能伤害
const bv = (t, k) => t.buff && t.buff[k] && t.buff[k].until > G.t ? t.buff[k].v : 0;
//   弹跳提升攻速（R001）是科技，和光环叠加
const towerAS = t => (1 + Math.max(t.buffAS, t.selfAS || 0) + Math.max(bv(t, 'bloodlust'), t.selfAS2 || 0) + bv(t, 'fire') + (t.fam === '弹跳塔' ? BOUNCE.asStep * G.bounce.as : 0)) * (1 - t.eliteAS);
const towerAtk = t => (1 + Math.max(t.buffDmg, t.selfAtk2 || 0) + (t.selfAtk || 0) + bv(t, 'roar') + bv(t, 'divine')) * (1 - t.eliteWeak);

function towerUpdate(t, dt) {
  if (t.cat === 'aura') return;
  const kit = KITS[t.fam];
  if (t.isHero) heroTick(t, dt);
  if (t.maxMana && t.manaRegen) t.mana = clamp(t.mana + t.manaRegen * dt, 0, t.maxMana);
  if (kit && kit.tick) kit.tick(t, dt);
  const st = towerStats(t);
  t.atkMul = towerAtk(t);
  if (t.fam === '扫射塔') return sweepUpdate(t, dt, st);
  t.cdLeft -= dt * towerAS(t);
  if (t.cdLeft > 0) return;
  const target = lockTarget(t, st.range);
  if (!target) { t.cdLeft = 0; return; }
  t.cdLeft += st.cd;
  t.attacks++; t.atkT = G.t;
  if (t.isHero) return heroAttack(t, target, st);
  attack(t, target, st);
}

// 普通塔一次攻击 (按 WC3 技能代码解释附加效果)
function attack(t, target, st) {
  const lv = curLevel(t), kit = KITS[t.fam];
  let dmg = st.dmg * t.atkMul;
  // 致命一击（剑圣塔的致命一击由它的技能包按成长模式处理）
  const crit = !(kit && kit.ownCrit) && abil(lv, 'AOcr');
  if (crit && Math.random() * 100 < (crit.A || 25)) { dmg *= crit.B || 3; addFx({ kind: 'text', x: target.x, y: target.y, text: '暴击', life: 0.6, color: '#ffd257' }); }
  // 目标集合
  let targets = [target];
  if (t.fam === '弹跳塔' || t.fam === '通灵塔') targets = chainTargets(target, st.targets, 500);   // 弹射；通灵塔武器是 mbounce：3 个目标、弹射范围 500
  // 破坏塔：分裂破坏 A06U（多重射击）。说明"同时攻击 4 个单位"，2~MAX 级还是同一个技能；天赋（分裂破坏 2 级）9 个
  if (t.fam === '破坏塔') targets = [target].concat(inRange(t.x, t.y, 1200).filter(m => m !== target).slice(0, (t.talent ? 9 : 4) - 1));
  // 箭塔：箭射 A07X 每次攻击升 1 级，4 级时（每 4 次攻击里的第 4 次）打 800 范围内所有敌人
  if (t.fam === '箭塔' && t.attacks % 4 === 0) targets = inRange(t.x, t.y, 800);
  // 通灵塔：每攻击 1 次得 1 个灵魂，10 个进入通灵状态 6 倍攻击 1 秒；天赋（高级通灵）8 个、10 倍 2 秒，通灵状态不存灵魂
  if (t.fam === '通灵塔') {
    const [need, mul, dur] = t.talent ? [8, 10, 2] : [10, 6, 1];
    if (!(t.talent && t.necroUntil > G.t) && (t.souls = (t.souls || 0) + 1) >= need) { t.souls = 0; t.necroUntil = G.t + dur; t.necroMul = mul; FXS.souls(t.x, t.y, 160, '#c48bff'); }
    if (t.necroUntil > G.t) dmg *= t.necroMul;
  }
  const a = { dmg, targets };
  if (kit && kit.attack && kit.attack(t, target, st, a) === false) return;
  dmg = a.dmg; targets = a.targets;
  const style = missileOf(t), from = muzzle(t, style);
  shot(t, target);
  // 主目标命中后的范围效果（目标在飞行途中死了，就以落点为中心）
  const area = (hit, x, y) => {
    const c = hit || { x, y };
    if (t.fam === '牛头塔') splash(t, c, (abil(lv, 'Aroc') || {}).area || 500, dmg, st.atk);     // 粉碎（分裂）A0A9：500 范围
    if (t.fam === '群攻塔') { splash(t, c, 300, dmg, st.atk); stunArea(c, 300, 0.1); }
  };
  const land = (m, primary) => (hit, x, y) => {
    if (hit) { hurt(hit, dmg, st.atk, t); onHitEffects(t, lv, hit, st); frozenBurst(hit); }
    if (primary) { area(hit, x, y); SFX.ent(sndKey(t), 'hit', { x, y }); }
  };
  SFX.ent(sndKey(t), 'launch', { x: t.x, y: t.y });
  if (t.fam === '弹跳塔' || t.fam === '通灵塔') {     // 依次弹到下一个目标
    const hop = (i, src) => { if (i >= targets.length) return;
      FXS.launch(style, src, targets[i], (hit, x, y) => { land(targets[i], i === 0)(hit, x, y); hop(i + 1, { x, y, z: 50 }); }, w3opt(t)); };
    return hop(0, from);
  }
  for (const m of targets) FXS.launch(style, from, m, land(m, m === target), w3opt(t));
}
// 自带的重击由技能包处理的塔（群攻塔的范围重击、巨箭塔的双刃箭、巫师塔（暗黑）的范围晕眩、缓速塔天赋的魔法攻击）
const OWN_BASH = new Set(['群攻塔', '巨箭塔', '巫师塔（暗黑）', '缓速塔']);
function onHitEffects(t, lv, m, st) {
  const bash = abil(lv, 'AHbh');
  if (bash && !OWN_BASH.has(t.fam) && Math.random() * 100 < (bash.A || 0)) {
    if (bash.C) hurt(m, bash.C, st.atk, t);
    stun(m, bash.dur || 1);
  }
  const corr = abil(lv, 'AIcb');
  if (corr) { m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, corr.B || 10); m.shredUntil = G.t + (corr.dur || 5); }
  const sl = abil(lv, 'Aven');
  if (sl) slowM(m, sl.B || 0.2, sl.dur || 5);
  // 慢性毒药 Aspo：每秒 A 点伤害、移速降低 C，持续 Dur（20 秒）；同一种毒不叠加，新的覆盖旧的
  const po = abil(lv, 'Aspo');
  if (po) {
    m.dots = m.dots.filter(d => d.kind !== 'poison');
    m.dots.push({ kind: 'poison', dps: po.A || 10, until: G.t + (po.dur || 20), atk: st.atk, src: t });
    slowM(m, po.C ?? po.B ?? 0.2, po.dur || 20);
  }
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
function debuffM(m, k, v, s) {
  const d = m.deb[k], on = d && d.until > G.t;
  m.deb[k] = { v: on ? Math.max(d.v, v) : v, until: Math.max(on ? d.until : 0, G.t + s) };
}
function aoeAt(src, x, y, r, dmg, atk, opt) { for (const m of inRange(x, y, r)) hurt(m, dmg, atk, src, opt); }

// 扫射塔：360 度旋转射线（穿透之箭 AUcs，宽 100，CD 0.1/0.05 秒，无视护甲）。转速受攻速光环影响，伤害不受光环影响。
// 强化 A07J（每级 200 魔法，共 7 级）：射线长 600/650/…/850/900，伤害 ×1/2/3/4/5/6/10
const SWEEP_MUL = [1, 2, 3, 4, 5, 6, 10];
function sweepUpdate(t, dt, st) {
  const lv = curLevel(t), arrow = abil(lv, 'AUcs'), k = t.sw ? t.sw.k : 1;
  const asMul = towerAS(t);
  t.angle = (t.angle + dt * 2.2 * asMul) % (Math.PI * 2);
  t.cdLeft -= dt * asMul;
  if (t.cdLeft > 0) return;
  t.cdLeft += arrow ? arrow.cool || 0.1 : 0.1;
  const len = k === 7 ? 900 : 550 + k * 50, ex = t.x + Math.cos(t.angle) * len, ey = t.y + Math.sin(t.angle) * len;
  const dmg = (arrow ? arrow.A : 6) * SWEEP_MUL[k - 1];
  for (const m of G.monsters) {
    if (m.dead) continue;
    if (segDist2(m.x, m.y, [t.x, t.y], [ex, ey]) < (100 + m.r) ** 2) hurt(m, dmg, 'magic', t, { ignoreArmor: true });
  }
  FXS.beam(t.x, t.y, 150, ex, ey, 40, '#7ab8ff', 1.3, 0.09);
}

// ================================================================ 塔的技能（按原图触发器 war3map.j 和技能表实现）
// 每种塔一个技能包，都是可选的：
//   init(t, mem) 建成时（mem：主塔回收时记下的技能等级和魔法）    tick(t, dt) 每帧
//   self(t) → { as, as2, atk, atk2 } 自身攻速 / 攻击加成（见 towerAS / towerAtk）
//   attack(t, target, st, a) 每次攻击（原图 EVENT_PLAYER_UNIT_ATTACKED，攻击出手时触发）；a = { dmg, targets } 可以改
//   kill(t, m) 击杀    cmds(t) 命令按钮    info(t) 信息面板多出来的几行    sell(t) 回收时（额外返还、记下状态）
const isMax = t => t.lv === t.levels.length - 1;
const cdReady = (t, k) => !(t.cds[k] > G.t);
const cdLeft = (t, k) => Math.max(0, (t.cds[k] || 0) - G.t);
const setCd = (t, k, s) => { t.cds[k] = G.t + s; };
const addMana = (t, v) => { t.mana = clamp(t.mana + v, 0, t.maxMana || Infinity); };
function giveBuff(t, k, v, dur) { if (!t.buff) return; const b = t.buff[k], on = b && b.until > G.t; t.buff[k] = { v: on ? Math.max(b.v, v) : v, until: G.t + dur }; }
// 友军塔（建筑之间按"中心距离 ≤ 范围 + 占地半边"算，和魔兽按碰撞体积算范围一样，否则 100 范围的咆哮连隔壁的塔都够不着）
const alliesNear = (x, y, r) => G.towers.filter(o => o.cat !== 'aura' && dist2(x, y, o.x, o.y) <= (r + FOOT_HALF) ** 2);
const anyEnemy = (x, y, r) => G.monsters.some(m => !m.dead && dist2(x, y, m.x, m.y) <= r * r);
const pctTxt = v => Math.round(v * 100) + '%';
// 召唤物（冰雹狮鹫）：放进 G.towers，用普通塔的攻击逻辑；伤害和击杀算在召唤它的塔上
function summon(owner, o) {
  const s = { id: G.nextId++, cat: 'summon', owner, lv: 0, cdLeft: 0, food: 0, spent: 0, kills: 0, dealt: 0, attacks: 0, buff: {}, cds: {},
    buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, ...o };
  G.towers.push(s);
  return s;
}
// 木材 / 金币 / 魔法检查，返回不满足的原因
function lack(cost) {
  if (cost.gold && G.gold < cost.gold) return '金币不足';
  if (cost.wood && G.wood < cost.wood) return '木材不足';
  if (cost.mana && cost.t.mana < cost.mana) return '魔法值不足';
  return null;
}
function pay(cost) { G.gold -= cost.gold || 0; G.wood -= cost.wood || 0; if (cost.mana) cost.t.mana -= cost.mana; uiDirty(); }
// 命令按钮：带花费的技能（不够就灰掉，提示里写原因）
function costCmd(t, key, name, tip, cost, fn, opt = {}) {
  const why = opt.why || lack({ ...cost, t });
  const c = [cost.gold && `<span class="gold">${cost.gold} 金</span>`, cost.wood && `<span class="wood">${cost.wood} 木材</span>`, cost.mana && `<span style="color:#7ab8ff">${cost.mana} 魔法</span>`].filter(Boolean).join(' + ');
  return cmd(key, name.slice(0, 2), name, `<b>${name}</b>${c ? `<br>需要 ${c}` : ''}<br>${tip}${why ? `<br><b style="color:#ff5a4f">${why}</b>` : ''}`,
    () => { const w = opt.why || lack({ ...cost, t }); if (w) return msg(w); pay({ ...cost, t }); fn(); uiDirty(); }, { disabled: !!why, cost: cost.gold, ...opt.o });
}
// 功勋：花木材提升，每杀一个敌人多得魔法；回收时返还用掉的木材
function meritCmd(t, key, step, max, perKill) {
  const m = t.merit;
  return costCmd(t, key, '功勋', `等级 ${m}/${max}：每杀死一个敌人获得 <b>${perKill(m)}</b> 点魔法${m < max ? `，下一级 ${perKill(m + 1)}` : ''}<br>回收时返还用掉的木材`,
    { wood: m < max ? step(m) : 0 }, () => { t.merit++; msg(`功勋提升到 ${t.merit} 级`); }, { why: m >= max ? '已经是最高等级' : null });
}
const meritSpent = (t, step) => { let s = 0; for (let i = 1; i < t.merit; i++) s += step(i); return s; };

// ---------------------------------------------------------------- 原始战速 / 原始战力
// 每座 MAX 原始塔身上有原始战速（A082，牛头 / 通灵 / 闪电 / 箭塔）或原始战力（A073，毒 / 群攻 / 混乱 / 破坏），
// 技能等级 = 自己的 MAX 原始塔总数（建好 / 回收时由触发器 BCc / p8 重设）。1 座时不加成；
// 战速：80% → 每多一座 +10%，最高 150%（不和加速光环叠加）；战力：60% → 每多一座 +20%，最高 200%（能和攻击光环叠加）
const primalSpd = n => n < 2 ? 0 : Math.min(1.5, 0.6 + 0.1 * n);
const primalPow = n => n < 2 ? 0 : Math.min(2, 0.2 + 0.2 * n);
const hasAbil = (t, id) => (curLevel(t).abils || []).some(a => a.id === id);

// ---------------------------------------------------------------- 主塔数值（技能说明 / 技能表）
const MAGIC = {   // 魔幻塔
  bolt: [30, 90, 150, 250, 410, 1200, 2000, 4000, 8000, 20000],          // 雷霆闪电 A05F：每道闪电的魔法伤害（星落 A04Y，900 范围，3.1 秒）
  darts: [3, 4, 5, 6, 7, 9, 10, 11, 13, 15],                              // 穿刺之镖 A050：攻击目标数
  power: [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.8, 2.4, 3, 4],                   // 强攻 A03G（等级 = 穿刺之镖）
  meteor: [60, 330, 690, 1140, 1680, 2500, 4000, 8000, 25000, 60000],     // 混乱流星 A05E / 流星伤害 A05D：每击混乱伤害 + 晕 0.3 秒
  haste: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1, 1.3, 1.6, 2],                 // 急速 A04I（等级 = 混乱流星）
  charge: [0.2, 0.4, 0.6, 0.8, 1],                                         // 雷霆闪电每秒充能（DI，按塔等级），充满 10 点放一次
  modes: ['雷霆闪电', '穿刺之镖', '混乱流星'],
};
const HOLY = { r: [250, 275, 300, 325, 350, 400], d: [30, 70, 120, 250, 800, 1500], gain: [1.5, 1.6, 1.7, 1.8, 1.9, 2], types: [null, 'normal', 'pierce', 'magic', 'chaos'] };
const ICE = {
  names: ['冰雹术', '闪冰术', '爆冰术'],
  hailDmg: [100, 700, 2000, 4000, 10000], hailCd: [0.2, 0.25, 0.3, 0.45, 0.25], hailRange: [600, 500, 500, 500, 500],   // 狮鹫骑士（按寒冰塔等级）
  hailArmor: [8, 16, 24, 32, 40, 50, 100, 150, 200, 250, 300],                                                        // 冰雹术 A032 / 腐蚀 A02Z
  flash: [150, 300, 600, 900, 1200, 2100, 3000, 4000, 8000, 15000, 50000], flashN: [7, 7, 8, 8, 9, 9, 10, 10, 12, 14, 14],   // 闪冰术 A031 / A030
  nova: [250, 1000, 2250, 4000, 6250, 9000, 12250, 16000, 20250, 25000, 50000],                                        // 爆冰术 A038 / A039
};
const BOUNCE = {   // 弹跳塔
  mana: 300, value: 58000,                     // 魔法上限；MAX 的造价（3 座 4 级弹跳塔 3×16000 + 合成 10000，回收按这个返还）
  atkStep: 60, atkMax: 20, asStep: 0.09, asMax: 10,   // 提升基础攻击 A0CE / 攻速 A0CF：每次 2 木材 + 150 魔法
  merge: 10000, xferRange: 600, xferCd: 3,     // 合成大跳跳 A0CI；转移魔法 A0CJ
  bolt: [10000, 20000, 40000, 80000, 160000, 400000, 800000, 1200000, 1600000, 2000000], boltCd: 5, boltStun: 5,   // 灵魂重击 A0M0（说明只写到 10 级）
};
const GOD_PAIRS = [['magic', 'pierce'], ['chaos', 'pierce'], ['normal', 'pierce'], ['chaos', 'magic'], ['chaos', 'normal'], ['magic', 'normal']];   // 切换伤害类型 A06V 1~6 级
const SWORD = {
  modes: ['剑刃之魂', '风暴之魂', '致命一击'],
  blade: [60, 180, 340, 540, 780, 1500, 2000, 3000, 5500, 8000, 12000],   // 剑刃之魂 A01R：250 范围（MAX 350）魔法伤害
  bladeArmor: [10, 20, 30, 40, 50, 60, 80, 110],                            // 剑刃风暴的专注光环 A01T：按剑圣塔等级减甲
  crit: [8, 9, 10, 11, 12, 14, 18, 20, 40, 60, 120],                        // 致命一击 A03O：15% 概率的倍数
  atk: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.6],           // 强攻 A01V（等级 = 致命一击，不和攻击光环叠加）
  as: [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2],                  // 致速 A03D（等级 = 风暴之魂，不和萨满嗜血叠加）
};

// 冰封塔冻住的敌人被攻击时，范围 500 无视护甲伤害（每 0.2 秒最多一次）
function frozenBurst(m) {
  const by = m.frozenBy;
  if (!(m.frozenUntil > G.t) || !by || !G.towers.includes(by) || G.t - (m.frozenProc || 0) < 0.2) return;
  m.frozenProc = G.t;
  aoeAt(by, m.x, m.y, 200, 500, 'hero', { ignoreArmor: true });
  FXS.ring(m.x, m.y, 200, '#bff4ff', 0.25, 3);
}
// 区域效果（落地的漩涡、陷阱、守卫、恐惧之眼）：每帧对范围内的怪调用 each(m, dt)，tick(z, dt) 处理自己的逻辑
function field(owner, x, y, r, dur, o) { G.zones.push({ owner, x, y, r, t0: G.t, until: G.t + dur, dps: 0, fxT: 0, ...o }); }

const KITS = {
  // ---------------------------------------------------------------- 主塔
  // 魔幻塔：三种成长（切换成长类型 A051）。当前成长的技能吃魔法自动升级：雷霆闪电 100+20×等级、穿刺之镖 150+10×等级、混乱流星 180；
  // 不是当前成长的技能不生效，到 5 级后一直生效。杀一个敌人得 1+0.2×功勋 点魔法（2功勋 A05G）
  魔幻塔: {
    init(t, mem) { t.maxMana = 500; t.mana = mem ? mem.mana : 0; t.mg = { mode: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], dh: 0, meteors: [] }; t.merit = 1; },
    on: (t, i) => t.mg.mode === i + 1 || t.mg.lv[i] >= 5,
    self(t) { const k = KITS.魔幻塔, l = t.mg.lv; return { atk: k.on(t, 1) ? MAGIC.power[l[1] - 1] : 0, as: k.on(t, 2) ? MAGIC.haste[l[2] - 1] : 0 }; },
    tick(t, dt) {
      t.mg.dh += MAGIC.charge[t.lv] * dt;
      // 流星陨落（nano）：活 4 秒，每 0.4 秒打一次 900 范围内的敌人；MAX 魔幻塔时每击再加 150 范围 1~等级×1000 混乱伤害
      const l = t.mg.lv[2];
      for (const s of t.mg.meteors) {
        if (G.t < s.next) continue;
        s.next += 0.4;
        const m = nearest(s.x, s.y, 300) || nearest(t.x, t.y, 900);
        if (!m) continue;
        const mx = m.x, my = m.y;
        FXS.fall(mx, my, { z: 900, dx: -300, dy: 160, dur: 0.25, color: '#c48bff', core: '#ffe0ff', size: 18, rock: '#3a2050', onEnd: () => {
          if (!m.dead) { hurt(m, MAGIC.meteor[l - 1], 'chaos', t); stun(m, 0.3); }
          if (isMax(t)) aoeAt(t, mx, my, 150, rint(1, l * 1000), 'chaos');
          FXS.explosion(mx, my, 0.45, '#c48bff');
        } });
      }
      t.mg.meteors = t.mg.meteors.filter(s => s.until > G.t);
    },
    attack(t, target, st, a) {
      const k = KITS.魔幻塔, g = t.mg, l = g.lv;
      // 成长：当前成长类型的技能魔法够了就升级（最高 10 级）
      if (g.mode === 1 && l[0] < 10 && t.mana >= 100 + 20 * l[0]) { t.mana -= 100 + 20 * l[0]; l[0]++; msg(`魔幻塔：雷霆闪电升到 ${l[0]} 级`); }
      if (g.mode === 2 && l[1] < 10 && t.mana >= 150 + 10 * l[1]) { t.mana -= 150 + 10 * l[1]; l[1]++; msg(`魔幻塔：穿刺之镖升到 ${l[1]} 级`); }
      if (g.mode === 3 && l[2] < 10 && t.mana >= 180) { t.mana -= 180; l[2]++; msg(`魔幻塔：混乱流星升到 ${l[2]} 级`); }
      // 雷霆闪电：充能满 10 点就放一次星落：3.1 秒内每 0.5 秒（每级快 0.04 秒）对 900 范围内所有敌人造成魔法伤害
      if (k.on(t, 0) && g.dh >= 10) {
        g.dh = g.dh < 15 ? g.dh - 10 : 0;
        const lv = l[0], every = 0.5 - 0.04 * (lv - 1);
        for (let s = 0; s < 3.1; s += every) later(s, () => {
          if (!G.towers.includes(t)) return;
          const ms = inRange(t.x, t.y, 900);
          for (const m of ms) hurt(m, MAGIC.bolt[lv - 1], 'magic', t);
          for (const m of ms.slice(0, 5)) FXS.beam(m.x + rnd(-40, 40), m.y, 900, m.x, m.y, 30, '#9fd0ff', 1, 0.12);
        });
        FXS.nova(t.x, t.y, 900, '#9fd0ff', 0.5); SFX.spell('frostPulse', { x: t.x, y: t.y });
      }
      // 穿刺之镖：多重射击（900 范围）
      if (k.on(t, 1)) a.targets = [target].concat(inRange(t.x, t.y, 900).filter(m => m !== target)).slice(0, MAGIC.darts[l[1] - 1]);
      // 混乱流星：1/8 概率召唤流星（同时最多 3 个）
      if (k.on(t, 2) && Math.random() < 1 / 8 && g.meteors.length < 3) { g.meteors.push({ x: target.x, y: target.y, until: G.t + 4, next: G.t + 0.4 }); FXS.flash(t.x, t.y, 160, '#c48bff', 120); }
    },
    kill(t) { addMana(t, 1 + 0.2 * t.merit); },
    cmds(t) {
      const g = t.mg;
      return [
        costCmd(t, 'Q', '切换成长类型', `当前 <b>${MAGIC.modes[g.mode - 1]}</b> 成长 → 切换到 ${MAGIC.modes[g.mode % 3]}<br>当前成长的技能吃魔法自动升级；不是当前成长的技能不生效，到 5 级后一直生效`,
          { mana: 3 }, () => { g.mode = g.mode % 3 + 1; setCd(t, 'mode', 2); msg(`魔幻塔切换到${MAGIC.modes[g.mode - 1]}成长`); },
          { why: cdReady(t, 'mode') ? null : '冷却中', o: { cdOf: () => [cdLeft(t, 'mode'), 2] } }),
        meritCmd(t, 'W', m => m + 1, 10, m => (1 + 0.2 * m).toFixed(1)),
      ];
    },
    info(t) {
      const g = t.mg, l = g.lv, on = i => KITS.魔幻塔.on(t, i) ? '' : '（未生效）';
      return [`成长：${MAGIC.modes[g.mode - 1]}`, `雷霆闪电 ${l[0]} 级${on(0)}：每道 ${MAGIC.bolt[l[0] - 1]}，充能 ${Math.min(10, g.dh).toFixed(1)}/10`,
        `穿刺之镖 ${l[1]} 级${on(1)}：${MAGIC.darts[l[1] - 1]} 个目标，攻击 +${pctTxt(MAGIC.power[l[1] - 1])}`,
        `混乱流星 ${l[2]} 级${on(2)}：每击 ${MAGIC.meteor[l[2] - 1]}，攻速 +${pctTxt(MAGIC.haste[l[2] - 1])}`];
    },
    sell(t) { G.wood += meritSpent(t, m => m + 1); G.mem.魔幻塔 = { lv: t.mg.lv.slice(), mana: t.mana }; },
  },
  // 神圣塔：选一种伤害类型后，每次攻击对目标周围造成"神圣攻击"（基础值 + 当前魔法值）。杀敌得 1.5~2 魔法，但魔法超过容器（200×等级）就不再增加
  神圣塔: {
    init(t, mem) { t.maxMana = 4000; t.mana = mem ? mem.mana : 0; t.holy = { type: 0, cont: 1 }; },
    attack(t, target) {
      const ty = HOLY.types[t.holy.type]; if (!ty) return;
      const r = HOLY.r[t.lv], d = HOLY.d[t.lv] + t.mana;
      aoeAt(t, target.x, target.y, r, d, ty);
      FXS.nova(target.x, target.y, r, ATK_COLOR[ty], 0.3);
    },
    kill(t) { if (t.mana <= t.holy.cont * 200) addMana(t, HOLY.gain[t.lv]); },
    cmds(t) {
      const h = t.holy, out = ['普通', '穿刺', '魔法', '混乱'].map((nm, i) => costCmd(t, 'QWER'[i], '切换' + nm, `神圣攻击改成 <b>${nm}</b> 伤害（每种切换冷却 90 秒）`, {},
        () => { h.type = i + 1; setCd(t, 'type' + i, 90); msg(`神圣塔：神圣攻击切换为${nm}伤害`); },
        { why: h.type === i + 1 ? '当前就是这种伤害' : cdReady(t, 'type' + i) ? null : '冷却中', o: { active: h.type === i + 1, cdOf: () => [cdLeft(t, 'type' + i), 90], atk: HOLY.types[i + 1] } }));
      out.push(costCmd(t, 'A', '魔法容器', `容器 ${h.cont} 级：魔法值不超过 <b>${h.cont * 200}</b> 时杀敌才得魔法；每级 +200<br>回收时返还容器的金币`,
        { gold: h.cont < 20 ? 3000 : 0 }, () => { h.cont++; }, { why: h.cont >= 20 ? '已经是最高等级' : null }));
      return out;
    },
    info(t) { const ty = t.holy.type; return [`神圣攻击：${ty ? ATK_CN[HOLY.types[ty]] + '，' + HOLY.r[t.lv] + ' 范围 ' + fmt(HOLY.d[t.lv] + t.mana) : '<b style="color:#ffb347">还没选伤害类型（按 Q W E R 选）</b>'}`,
      `魔法容器 ${t.holy.cont} 级（上限 ${t.holy.cont * 200}），杀敌 +${HOLY.gain[t.lv]} 魔法`]; },
    sell(t) { G.gold += (t.holy.cont - 1) * 3000; G.mem.神圣塔 = { mana: Math.max(t.mana, G.mem.神圣塔 ? G.mem.神圣塔.mana : 0) }; },
  },
  // 寒冰塔：冰雹术 / 闪冰术 / 爆冰术。"选择升级技能"选中的那个每次攻击都放，魔法够了自动升级（160 / 7 级起 280 / 10→11 级 450 魔法 + 10000 金）；
  // 没选中的按 等级/7 的概率放。冰霜光环每次攻击升 1 级，升满 5 级放一次"关联技能"（冰封），然后回到关联等级（三个技能平均等级）
  寒冰塔: {
    init(t, mem) { t.maxMana = 500; t.mana = mem ? mem.mana : 0; t.ice = { sel: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], aura: 1 }; t.merit = 1; },
    link: t => Math.floor(t.ice.lv.reduce((s, v) => s + v, 0) / 3),
    attack(t, target) {
      const c = t.ice, L = c.lv, s = c.sel - 1, x = target.x, y = target.y;
      if (t.mana >= 160 && L[s] < 7) { L[s]++; t.mana -= 160; msg(`寒冰塔：${ICE.names[s]}升到 ${L[s]} 级`); }
      if (t.mana >= 280 && L[s] >= 7 && L[s] < 10) { L[s]++; t.mana -= 280; msg(`寒冰塔：${ICE.names[s]}升到 ${L[s]} 级`); }
      if (t.mana >= 450 && L[s] === 10 && !L.includes(11) && G.gold >= 10000) { L[s] = 11; t.mana -= 450; G.gold -= 10000; msg(`寒冰塔：${ICE.names[s]}升到 MAX（花费 10000 金币）`); }
      const k = KITS.寒冰塔, link = k.link(t), linked = c.aura >= link + 5;
      for (let i = 0; i < 3; i++) {
        if (i === s) k.cast(t, i, target, x, y, true, linked);
        else if (rint(1, 7) <= L[i]) k.cast(t, i, target, x, y, false, false);
      }
      c.aura = linked ? link + 1 : Math.max(c.aura, link) + 1;
    },
    cast(t, i, target, x, y, sel, linked) {
      const L = t.ice.lv[i];
      if (i === 0) {                         // 冰雹术：在目标处召唤狮鹫骑士（按寒冰塔等级）攻击，每击减甲；关联：每击冰封 10 秒
        summon(t, { fam: '冰雹', title: '冰雹（狮鹫骑士）', label: '雹', x, y, until: G.t + (L === 11 ? 12 : (sel ? 2 : 1.6) + 0.4 * L),
          levels: [{ name: '冰雹', dmg: ICE.hailDmg[t.lv], cd: ICE.hailCd[t.lv], range: ICE.hailRange[t.lv], atk: 'normal', targets: 1,
            abils: [{ code: 'AIcb', B: ICE.hailArmor[L - 1], dur: 5 }].concat(linked ? [{ code: 'AHbh', A: 100, dur: 10 }] : []) }] });
        FXS.snow(x, y, 60, 1);
      }
      if (i === 1) {                         // 闪冰术：从目标开始连锁，伤害不递减；关联：冰封 600 范围 4 秒，并重置攻击冷却
        const chain = chainTargets(target, ICE.flashN[L - 1], L >= 8 ? 800 : 700);
        chain.forEach((m, j) => { const p = j ? chain[j - 1] : { x: t.x, y: t.y }; FXS.beam(p.x, p.y, j ? 50 : 160, m.x, m.y, 50, '#bff4ff', 1.2, 0.18); hurt(m, ICE.flash[L - 1], 'magic', t); });
        if (linked) { stunArea({ x, y }, 600, 4); t.cdLeft = 0; FXS.nova(x, y, 600, '#bff4ff', 0.5); }
      }
      if (i === 2) {                         // 爆冰术：300 范围混乱伤害 + 减速 30% 6 秒（MAX 再加 60000 魔法）；关联：冰封 7 秒并造成魔法伤害
        for (const m of inRange(x, y, 300)) {
          hurt(m, ICE.nova[L - 1], 'chaos', t); slowM(m, 0.3, 6);
          if (L === 11) hurt(m, 60000, 'magic', t);
          if (linked) { stun(m, 7); hurt(m, ICE.nova[L - 1], 'magic', t); }
        }
        FXS.nova(x, y, 300, '#9fe3ff', 0.4); FXS.snow(x, y, 30, 0.8);
      }
    },
    kill(t) { addMana(t, 0.7 + 0.3 * t.merit); },
    cmds(t) {
      const c = t.ice;
      return [
        cmd('Q', '选', '选择升级技能', `当前：<b>${ICE.names[c.sel - 1]}</b> → ${ICE.names[c.sel % 3]}<br>选中的技能每次攻击都释放，魔法够了自动升级；其他技能按 等级/7 的概率释放`,
          () => { c.sel = c.sel % 3 + 1; msg(`寒冰塔：选择升级${ICE.names[c.sel - 1]}`); uiDirty(); }),
        meritCmd(t, 'W', m => m * 3 + 2, 6, m => (0.7 + 0.3 * m).toFixed(1)),
      ];
    },
    info(t) {
      const c = t.ice, L = c.lv, link = KITS.寒冰塔.link(t);
      return [`选择升级：${ICE.names[c.sel - 1]}`, `冰雹术 ${L[0]} 级（减甲 ${ICE.hailArmor[L[0] - 1]}）· 闪冰术 ${L[1]} 级（${ICE.flash[L[1] - 1]}×${ICE.flashN[L[1] - 1]}）· 爆冰术 ${L[2]} 级（${ICE.nova[L[2] - 1]}）`,
        `冰霜光环 ${c.aura} 级：600 范围敌人移速 -${5 + 3 * (c.aura - 1)}%（再攻击 ${Math.max(0, link + 5 - c.aura)} 次放关联技能）`];
    },
    sell(t) { G.wood += meritSpent(t, m => m * 3 + 2); G.mem.寒冰塔 = { lv: t.ice.lv.slice(), mana: t.mana }; },
  },
  // 天神塔：攻击下限 = 魔法值，上限 = 攻击上限技能（每级 400）+ 塔的攻击力；每次攻击对目标 300 范围造成下限~上限之间的随机伤害（两种伤害类型随机一种），
  // 并获得 1~4 点魔法。开启最高伤害：每次攻击造成上限伤害、消耗 2 魔法。雷霆一击（每 10 秒）：900 范围 魔法值×(8/10/12/14) 随机类型伤害 + 减速 80%
  天神塔: {
    init(t, mem) { t.maxMana = 30000; t.mana = mem ? mem.mana : 0; t.god = { pair: 1, cap: 1, power: 1, max: false }; },
    hi: t => Math.max(Math.floor(t.mana), 400 * t.god.cap + curLevel(t).dmg),
    attack(t, target) {
      const g = t.god, x = target.x, y = target.y, lo = Math.floor(t.mana), hi = KITS.天神塔.hi(t);
      if (g.power > 1) aoeAt(t, x, y, 300, Math.floor(hi / 50) * (g.power - 1) + 120 * (g.power - 1), 'hero', { ignoreArmor: true });   // 天神之力
      if (g.max) {
        if (t.mana >= hi / 2) { aoeAt(t, x, y, 300, hi, 'hero'); t.mana -= 2; }
        else { g.max = false; msg('天神塔魔法不足最高伤害的一半，关闭最高伤害'); }
      }
      if (!g.max) {
        if (lo < hi) addMana(t, t.lv + 1);
        aoeAt(t, x, y, 300, rint(lo, hi), pick(GOD_PAIRS[g.pair - 1]));
      }
      FXS.ring(x, y, 300, '#ffe9a0', 0.3, 4);
      if (cdReady(t, 'clap') && lo > 0) {    // 雷霆一击（自动释放）
        setCd(t, 'clap', 10);
        const ty = pick(['normal', 'pierce', 'magic', 'chaos']);
        for (const m of inRange(t.x, t.y, 900)) { hurt(m, lo * ((t.lv + 1) * 2 + 6), ty, t); slowM(m, 0.8, 10); }
        FXS.nova(t.x, t.y, 900, '#ffe9a0', 0.6); addFx({ kind: 'text', x: t.x, y: t.y + 80, text: `雷霆一击 ${ATK_CN[ty]}`, life: 1, color: '#ffe9a0' });
      }
    },
    cmds(t) {
      const g = t.god, hi = KITS.天神塔.hi(t), cn = p => GOD_PAIRS[p - 1].map(a => ATK_CN[a]).join(' / ');
      return [
        costCmd(t, 'Q', '切换伤害类型', `当前：<b>${cn(g.pair)}</b> → ${cn(g.pair % 6 + 1)}（冷却 5 秒）`, { mana: 1 },
          () => { g.pair = g.pair % 6 + 1; setCd(t, 'pair', 5); }, { why: cdReady(t, 'pair') ? null : '冷却中', o: { cdOf: () => [cdLeft(t, 'pair'), 5], ico: 'switchdmg' } }),
        costCmd(t, 'W', '增加攻击上限', `攻击上限 ${g.cap * 400} → ${(g.cap + 1) * 400}（另加塔的攻击力 ${curLevel(t).dmg}）<br>10 级起每次还要 1000 魔法；回收返还每级 800 金`,
          { gold: g.cap < 20 ? 1500 : 0, mana: g.cap >= 10 && g.cap < 20 ? 1000 : 0 }, () => { g.cap++; }, { why: g.cap >= 20 ? '已经是最高等级' : null }),
        costCmd(t, 'E', g.max ? '关闭最高伤害' : '开启最高伤害', g.max ? '恢复成两种伤害随机，可以获得魔法' : `每次攻击造成上限伤害（${fmt(hi)}），每次消耗 2 魔法，不再获得魔法<br>魔法值要不少于上限的一半（${fmt(hi / 2)}）`,
          {}, () => { g.max = !g.max; }, { why: !g.max && t.mana < hi / 2 ? '魔法值不足最高伤害的一半' : null, o: { active: g.max } }),
        costCmd(t, 'R', '天神之力', `等级 ${g.power}/11：每次攻击额外造成 [上限的 ${2 * (g.power - 1)}% + ${120 * (g.power - 1)}] 无视护甲伤害<br>回收返还木材`,
          { wood: g.power < 11 ? 5 : 0, mana: g.power < 11 ? 600 : 0 }, () => { g.power++; }, { why: g.power >= 11 ? '已经是最高等级' : null }),
      ];
    },
    info(t) { const g = t.god; return [`攻击下限 ${Math.floor(t.mana)} ~ 上限 ${KITS.天神塔.hi(t)}（${GOD_PAIRS[g.pair - 1].map(a => ATK_CN[a]).join(' / ')}）${g.max ? ' · 最高伤害开启' : ''}`,
      `天神之力 ${g.power} 级 · 雷霆一击 ${cdReady(t, 'clap') ? '就绪' : Math.ceil(cdLeft(t, 'clap')) + ' 秒'}`]; },
    sell(t) { G.gold += (t.god.cap - 1) * 800; G.wood += (t.god.power - 1) * 5; G.mem.天神塔 = { mana: t.mana }; },
  },
  // 剑圣塔：模式切换选成长技能，杀敌得 0.7+0.3×功勋 魔法，200 魔法自动升级（10→11 级要 500 魔法 + 20 木材）；不是当前模式的技能 5 级起才生效
  剑圣塔: {
    ownCrit: true,
    init(t, mem) { t.maxMana = 1000; t.mana = mem ? mem.mana : 0; t.bm = { mode: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], hits: 0 }; t.merit = 1; },
    on: (t, i) => t.bm.mode === i + 1 || t.bm.lv[i] >= 5,
    self(t) { const l = t.bm.lv; return { atk2: SWORD.atk[l[2] - 1], as2: SWORD.as[l[1] - 1] }; },
    attack(t, target, st, a) {
      const k = KITS.剑圣塔, l = t.bm.lv;
      if (k.on(t, 0) && G.zones.filter(z => z.owner === t && z.style === 'bladestorm').length <= 1) {   // 剑刃之魂：目标处的剑刃风暴
        const armor = SWORD.bladeArmor[t.lv];
        zone(t, target.x, target.y, l[0] === 11 ? 350 : 250, 0.6, SWORD.blade[l[0] - 1], 'magic', null, 'bladestorm', { each: m => debuffM(m, 'blade', armor, 0.3) });
      }
      if (k.on(t, 1) && ++t.bm.hits >= 5) {    // 风暴之魂：每 5 次攻击，800 范围 150×等级² 混乱伤害
        t.bm.hits = 0;
        aoeAt(t, t.x, t.y, 800, 150 * l[1] * l[1], 'chaos');
        FXS.nova(t.x, t.y, 800, '#9fe3ff', 0.4); SFX.spell('bladestorm', { x: t.x, y: t.y });
      }
      if (k.on(t, 2) && l[2] < 11) {           // 致命一击：15% 倍数暴击；25% 额外 等级²×200、5% 额外 等级²×1000 普通伤害
        if (Math.random() < 0.15) { a.dmg *= SWORD.crit[l[2] - 1]; addFx({ kind: 'text', x: target.x, y: target.y, text: SWORD.crit[l[2] - 1] + '倍', life: 0.7, color: '#ffd257' }); }
        if (Math.random() < 0.25) hurt(target, l[2] * l[2] * 200, 'normal', t);
        if (Math.random() < 0.05) hurt(target, l[2] * l[2] * 1000, 'normal', t);
      } else if (k.on(t, 2) && Math.random() < 0.15) a.dmg *= SWORD.crit[10];
    },
    kill(t) {
      addMana(t, 0.7 + 0.3 * t.merit);
      const i = t.bm.mode - 1, l = t.bm.lv;
      if (l[i] <= 9 && t.mana >= 200) { l[i]++; t.mana -= 200; msg(`剑圣塔：${SWORD.modes[i]}升到 ${l[i]} 级`); }
      else if (l[i] === 10 && t.mana >= 500 && G.wood >= 20) { l[i] = 11; t.mana -= 500; G.wood -= 20; msg(`剑圣塔：${SWORD.modes[i]}升到 MAX（扣除 500 魔法、20 木材）`); }
    },
    cmds(t) {
      const b = t.bm;
      return [
        costCmd(t, 'Q', '模式切换', `当前 <b>${SWORD.modes[b.mode - 1]}</b> 成长 → ${SWORD.modes[b.mode % 3]}<br>杀敌攒够 200 魔法自动升级当前技能；其他技能 5 级起一直生效`, { mana: 1 },
          () => { b.mode = b.mode % 3 + 1; setCd(t, 'mode', 1); msg(`剑圣塔切换到${SWORD.modes[b.mode - 1]}成长`); }, { why: cdReady(t, 'mode') ? null : '冷却中' }),
        meritCmd(t, 'W', () => 8, 6, m => (0.7 + 0.3 * m).toFixed(1)),
      ];
    },
    info(t) {
      const l = t.bm.lv, on = i => KITS.剑圣塔.on(t, i) ? '' : '（未生效）';
      return [`成长：${SWORD.modes[t.bm.mode - 1]}`, `剑刃之魂 ${l[0]} 级${on(0)}：${SWORD.blade[l[0] - 1]}/秒，减甲 ${SWORD.bladeArmor[t.lv]}`,
        `风暴之魂 ${l[1]} 级${on(1)}：每 5 击 ${150 * l[1] * l[1]}，致速 +${pctTxt(SWORD.as[l[1] - 1])}`,
        `致命一击 ${l[2]} 级${on(2)}：15% ${SWORD.crit[l[2] - 1]} 倍，强攻 +${pctTxt(SWORD.atk[l[2] - 1])}`];
    },
    sell(t) { G.wood += meritSpent(t, () => 8); G.mem.剑圣塔 = { lv: t.bm.lv.slice(), mana: t.mana }; },
  },
  // 扫射塔：杀敌 +1 魔法，强化（200 魔法）提升射线长度和伤害倍数，共 7 级
  扫射塔: {
    init(t, mem) { t.maxMana = 1000; t.mana = mem ? mem.mana : 0; t.sw = { k: mem ? mem.k : 1 }; },
    kill(t) { addMana(t, 1); },
    cmds(t) {
      const k = t.sw.k;
      return [costCmd(t, 'Q', '强化', `强化 ${k}/7：射线长 ${k === 7 ? 900 : 550 + k * 50}，伤害 ×${SWEEP_MUL[k - 1]}${k < 7 ? `<br>下一级：长 ${k + 1 === 7 ? 900 : 600 + k * 50}，伤害 ×${SWEEP_MUL[k]}` : ''}`,
        { mana: k < 7 ? 200 : 0 }, () => { t.sw.k++; msg(`扫射塔强化到 ${t.sw.k} 级`); }, { why: k >= 7 ? '已经是最高等级' : null })];
    },
    info(t) { const k = t.sw.k, a = abil(curLevel(t), 'AUcs'); return [`强化 ${k}/7：射线长 ${k === 7 ? 900 : 550 + k * 50}，每次 ${(a ? a.A : 6) * SWEEP_MUL[k - 1]} 伤害`]; },
    sell(t) { G.mem.扫射塔 = { k: t.sw.k, mana: t.mana }; },
  },

  // ---------------------------------------------------------------- 另类塔
  // 灵魂塔：灵魂锁链（自动）对攻击目标造成魔法伤害，并让它的护甲被无视 1 秒
  灵魂塔: {
    attack(t, target) {
      const [d, cd] = [[1000, 3], [5000, 3], [20000, 3], [40000, 2]][t.lv];
      if (!cdReady(t, 'chain')) return;
      setCd(t, 'chain', cd);
      hurt(target, d, 'magic', t); target.ignoreArmorUntil = G.t + 1;
      FXS.beam(t.x, t.y, 160, target.x, target.y, 50, '#c48bff', 1.4, 0.3); FXS.souls(target.x, target.y, 60, '#c48bff');
    },
    info(t) { const [d, cd] = [[1000, 3], [5000, 3], [20000, 3], [40000, 2]][t.lv]; return [`灵魂锁链：${d} 魔法伤害 + 无视护甲 1 秒，冷却 ${cd} 秒`]; },
  },
  // 弹跳塔（原图触发器 BE5 提升 / BE8 杀敌得魔法 / BFc 转移魔法 / BFS 合成 / BFW 天赋快建 / BBr 灵魂重击）：
  // 杀敌 +1 魔法（上限 300）。提升基础攻击 / 攻速是玩家科技，对所有弹跳塔（含 MAX）生效，回收不返还。
  // 3 座 4 级弹跳塔 + 10000 金合成弹跳塔 MAX（全场 1 个，保留施法那座的魔法）；MAX 每次攻击对目标放灵魂重击，杀精英 20% 升级。
  // 天赋卷轴激活 MAX 的弹跳天赋后，MAX 回收了再建弹跳塔：金币 ≥ 58000 且空余人口 ≥ 2 时扣 58000，所有 1 级弹跳塔回收，直接变成 MAX
  弹跳塔: {
    init(t) { t.maxMana = BOUNCE.mana; },
    kill(t) { addMana(t, 1); },
    built(t) {
      const b = G.bounce;
      if (!b.talent || G.towers.some(o => o.bmax) || G.gold < BOUNCE.value || G.foodCap - foodUsed() < 2) return t;
      G.gold -= BOUNCE.value;
      for (const o of G.towers.filter(o => o.fam === '弹跳塔' && !o.bmax && o.lv === 0)) sellTower(o);
      msg('弹跳天赋：花费 58000 金币，直接建成弹跳塔 MAX');
      return bounceMax(t.x, t.y, 0, b.bolt);
    },
    attack(t, target) {
      if (!t.bmax || !cdReady(t, 'bolt')) return;
      setCd(t, 'bolt', BOUNCE.boltCd);
      const dmg = BOUNCE.bolt[t.bolt - 1];
      FXS.launch('stormHammer', muzzle(t, 'stormHammer'), target, hit => { if (hit) { hurt(hit, dmg, 'magic', t); stun(hit, BOUNCE.boltStun); } });
    },
    cmds(t) {
      const b = G.bounce, out = [
        costCmd(t, 'A', '提升基础攻击', `所有弹跳塔基础攻击 +${BOUNCE.atkStep}（${b.atk}/${BOUNCE.atkMax} 级，现在 +${b.atk * BOUNCE.atkStep}）<br>受攻击光环等加成影响；回收不返还木材和魔法`,
          { wood: 2, mana: 150 }, () => { b.atk++; msg(`升级成功，当前攻击提升 ${b.atk} 级`); }, { why: b.atk >= BOUNCE.atkMax ? '已经是最高等级' : null }),
        costCmd(t, 'S', '提升基础攻速', `所有弹跳塔攻速 +${pctTxt(BOUNCE.asStep)}（${b.as}/${BOUNCE.asMax} 级，现在 +${pctTxt(b.as * BOUNCE.asStep)}）<br>和光环叠加；回收不返还木材和魔法`,
          { wood: 2, mana: 150 }, () => { b.as++; msg(`升级成功，当前攻速提升 ${b.as} 级`); }, { why: b.as >= BOUNCE.asMax ? '已经是最高等级' : null }),
      ];
      if (t.bmax) return out;
      out.push(cmd('B', '转移', '转移魔法', `<b>转移魔法</b><br>把魔法转给 ${BOUNCE.xferRange} 范围内另一座弹跳塔，对方最多补到 ${BOUNCE.mana}，多出的留在这座<br>不能转给弹跳塔 MAX，冷却 ${BOUNCE.xferCd} 秒`,
        () => { if (!cdReady(t, 'xfer')) return msg('转移魔法冷却中'); G.pending = 'xfer:' + t.id; G.placing = null; msg('转移魔法：选择另一座弹跳塔（Esc 取消）'); uiDirty(); },
        { active: G.pending === 'xfer:' + t.id, cdOf: () => [cdLeft(t, 'xfer'), BOUNCE.xferCd] }));
      if (isMax(t) && t.lv > 0) {
        const four = G.towers.filter(o => o.fam === '弹跳塔' && !o.bmax && isMax(o) && o.lv > 0).length;
        out.push(costCmd(t, 'T', '合成弹跳塔MAX', `消耗任意 3 座 4 级弹跳塔，在这里合成 <b>弹跳塔 MAX</b>（全场只能合成 1 个，保留这座的魔法）<br>${D.towers.弹跳塔.max.tip}<br>MAX 每次攻击放灵魂重击：${fmt(BOUNCE.bolt[0])} 魔法伤害 + 晕 ${BOUNCE.boltStun} 秒，冷却 ${BOUNCE.boltCd} 秒；杀死精英怪 20% 概率升级`,
          { gold: BOUNCE.merge }, () => bounceMerge(t), { why: four < 3 ? `需要 3 座 4 级弹跳塔（现在 ${four} 座）` : null }));
      }
      return out;
    },
    info(t) {
      const b = G.bounce, out = [`提升基础攻击 ${b.atk}/${BOUNCE.atkMax} 级（+${b.atk * BOUNCE.atkStep}），攻速 ${b.as}/${BOUNCE.asMax} 级（+${pctTxt(b.as * BOUNCE.asStep)}）`];
      if (t.bmax) out.push(`灵魂重击 ${t.bolt} 级：${fmt(BOUNCE.bolt[t.bolt - 1])} 魔法伤害 + 晕 ${BOUNCE.boltStun} 秒，${cdReady(t, 'bolt') ? '就绪' : '冷却 ' + Math.ceil(cdLeft(t, 'bolt')) + ' 秒'}`);
      if (b.talent) out.push('弹跳天赋：MAX 回收后再建弹跳塔，金币 ≥ 58000 且空余人口 ≥ 2 时直接变成 MAX');
      return out;
    },
    sell(t) { if (t.bmax) G.bounce.bolt = t.bolt; },
  },
  // 图腾塔：图腾之链（每 5 秒）从攻击目标开始弹 8 个敌人，每弹一次伤害 +20%（MAX +25%），无视护甲
  图腾塔: {
    init(t) { t.maxMana = 1600; },
    attack(t, target) {
      const a = abil(curLevel(t), 'AOcl'); if (!a || !cdReady(t, 'chain')) return;
      setCd(t, 'chain', a.cool || 5);
      let d = a.A;
      const chain = chainTargets(target, a.B || 8, a.area || 800);
      chain.forEach((m, j) => { const p = j ? chain[j - 1] : { x: t.x, y: t.y }; FXS.beam(p.x, p.y, j ? 50 : 170, m.x, m.y, 50, '#7ab8ff', 1.2, 0.2); hurt(m, d, 'magic', t, { ignoreArmor: true }); d *= 1 - (a.C || -0.2); });
    },
    kill(t) { if (isMax(t)) addMana(t, 1); },
    info(t) { const a = abil(curLevel(t), 'AOcl') || {}; return [`图腾之链：${a.A} 伤害弹 ${a.B} 个，每弹 +${pctTxt(-(a.C || -0.2))}，冷却 ${cdReady(t, 'chain') ? '就绪' : Math.ceil(cdLeft(t, 'chain')) + ' 秒'}`]; },
  },
  // 精灵塔：召唤精灵（自动），精灵碰到敌人造成魔法伤害，并纠缠 200 范围内的敌人
  精灵塔: {
    lv: t => [[1, 20, 0.6, 1.7], [2, 200, 1, 2.2], [3, 500, 1.4, 2.8], [4, 1000, 1.8, 3.2]][t.lv],
    tick(t) {
      if (!cdReady(t, 'wisp')) return;
      const ms = inRange(t.x, t.y, 1000); if (!ms.length) return;
      const [n, d, root, cd] = KITS.精灵塔.lv(t);
      setCd(t, 'wisp', cd);
      for (let i = 0; i < n; i++) FXS.launch('wisp', { x: t.x, y: t.y, z: 150 }, pick(ms), (hit, x, y) => {
        for (const m of inRange(x, y, 200)) { hurt(m, d, 'magic', t); stun(m, root); }
        FXS.ring(x, y, 200, '#9fffb0', 0.35, 3);
      });
    },
    info(t) { const [n, d, root, cd] = KITS.精灵塔.lv(t); return [`召唤精灵：每 ${cd} 秒 ${n} 个，每个 ${d} 魔法伤害、纠缠 200 范围 ${root} 秒`]; },
  },
  // 地精塔：魔法满 10 点时火箭群激活——这次和之后 3 次攻击打 1000 范围内所有敌人，消耗 10 魔法；每秒回魔 0.5/1/1/1.5，杀敌 +1
  地精塔: {
    init(t) { t.maxMana = 12; t.rk = { on: false, n: 0 }; },
    tick(t) { t.manaRegen = (t.levels[t.lv].manaRegen || [0.5, 1, 1, 1.5][t.lv]) + (t.talent ? 2.5 : 0); },
    attack(t, target, st, a) {
      const r = t.rk;
      if (r.on && t.mana < 10) { if (r.n >= 3) { r.on = false; r.n = 0; } else r.n++; }
      if (t.mana >= 10) { r.on = true; t.mana -= 10; }
      if (r.on) a.targets = inRange(t.x, t.y, 1000);
    },
    kill(t) { addMana(t, 1); },
    info(t) { return [`火箭群：${t.rk.on ? '<b>激活中</b>' : '魔法 10 点时激活'}，每秒回魔 ${t.manaRegen || 0}`]; },
  },
  // 巨箭塔：双刃箭。伤害等级（每级 2 木材）×1500 单体无视护甲伤害 + 晕 0.8 秒；转换后 200 范围 ×250；每次消耗 2 魔法
  巨箭塔: {
    init(t) { t.maxMana = 6; t.ba = { lv: 1, mode: 1 }; },
    tick(t) { t.manaRegen = [1, 1, 1.2][t.lv]; },
    attack(t, target) {
      const b = t.ba, n = b.lv - 1;
      if (b.mode === 1) stun(target, 0.8);                      // 双刃箭本身是 100% 的重击
      if (n < 1 || t.mana < 2) return;
      t.mana -= 2;
      if (b.mode === 1) hurt(target, 1500 * n, 'hero', t, { ignoreArmor: true });
      else { aoeAt(t, target.x, target.y, 200, 250 * n, 'hero', { ignoreArmor: true }); FXS.ring(target.x, target.y, 200, '#ffd257', 0.25, 3); }
    },
    cmds(t) {
      const b = t.ba;
      return [
        cmd('Q', '转', '转换攻击效果', `当前：<b>${b.mode === 1 ? '单体' : '范围'}</b>。单体：伤害等级×1500 无视护甲伤害 + 晕眩 0.8 秒；范围：200 范围 伤害等级×250`,
          () => { b.mode = 3 - b.mode; uiDirty(); }),
        costCmd(t, 'W', '升级伤害', `伤害等级 ${b.lv - 1}/10`, { wood: b.lv < 11 ? 2 : 0 }, () => { b.lv++; }, { why: b.lv >= 11 ? '已经是最高等级' : null }),
      ];
    },
    info(t) { const n = t.ba.lv - 1; return [`双刃箭（${t.ba.mode === 1 ? '单体' : '范围'}）：伤害等级 ${n}，${t.ba.mode === 1 ? 1500 * n : 250 * n} 伤害，每次 2 魔法`]; },
  },

  // ---------------------------------------------------------------- 大辅助（MAX 效果要用天赋卷轴激活）
  萨满塔: { tick(t) { lust(t, t.talent ? 0.6 : 0.4, t.talent ? 13 : 10, t.talent ? 3 : 4, t.talent ? 600 : 400); },
    info(t) { return [`嗜血术：给附近一座塔 +${t.talent ? 60 : 40}% 攻速 ${t.talent ? 13 : 10} 秒，冷却 ${t.talent ? 3 : 4} 秒`]; }, cmds: t => [evoCmd(t, '冰霜塔', '小熊猫塔（风）')] },
  兽人塔: { attack(t) { roar(t, t.talent ? 0.85 : 0.55, t.talent ? 12 : 10, 12, t.talent ? 150 : 100); },
    info(t) { return [`咆哮：${t.talent ? 150 : 100} 范围友军攻击 +${t.talent ? 85 : 55}% ${t.talent ? 12 : 10} 秒，冷却 12 秒`]; }, cmds: t => [evoCmd(t, '腐蚀塔', '小熊猫塔（火）')] },
  驱逐塔: {
    attack(t, target) {
      expel(t, target, t.talent ? 2 : 0.5, t.talent ? 10 : 5, t.talent ? 0.5 : 2, 0.85);
      if (t.talent) aoeAt(t, target.x, target.y, 200, 300, 'chaos');
    },
    info(t) { return [`驱逐：200 范围敌人移速 +${t.talent ? 200 : 50}% ${t.talent ? 10 : 5} 秒；被驱逐的敌人走到第二个转弯口 85% 被遣返出怪口`]; },
    cmds: t => [evoCmd(t, '暴击塔', '巫师塔（光明）')],
  },
  缓速塔: {
    init(t) { t.maxMana = 6; t.manaRegen = 1.3; },
    attack(t, target) {
      if (t.talent) hurt(target, 2000, 'magic', t);
      if (t.mana < 1) return;
      t.mana -= 1;
      vortex(t, target, 200, t.talent ? 0.48 : 0.3, t.talent ? 3.8 : 2.2);
    },
    info(t) { return [`缓速带：每次攻击（1 魔法）在地上留下漩涡，经过的敌人减速 ${t.talent ? 48 : 30}% ${t.talent ? 3.8 : 2.2} 秒`]; },
    cmds: t => [evoCmd(t, '重击塔', '巫师塔（暗黑）')],
  },
  // 进化后的大辅助
  '小熊猫塔（风）': {
    init(t) { t.lust = 1; },
    tick(t) { const l = t.lust; lust(t, 1.2, 2 + 0.5 * l, 6.5 - 0.5 * l, 150); },
    cmds(t) { return [costCmd(t, 'Q', '风之强化', `嗜血术（风）${t.lust}/4 级：附近一座塔 +120% 攻速 ${2 + 0.5 * t.lust} 秒，冷却 ${6.5 - 0.5 * t.lust} 秒`, { wood: t.lust < 4 ? 5 : 0 },
      () => { t.lust++; }, { why: t.lust >= 4 ? '已经是最高等级' : null })]; },
  },
  '小熊猫塔（火）': { attack(t) { roar(t, 1, 6, 9, 100); }, info: () => ['咆哮（火）：100 范围友军攻击 +100% 6 秒，冷却 9 秒'] },
  '巫师塔（光明）': { attack(t, target) { expel(t, target, 0.2, 15, 1, 0.95); }, info: () => ['驱逐：200 范围敌人移速 +20% 15 秒；走到第二个转弯口 95% 被遣返出怪口'] },
  '巫师塔（暗黑）': {
    init(t) { t.maxMana = 6; t.manaRegen = 1.5; },
    attack(t, target) {
      if (t.mana < 1) return;
      t.mana -= 1;
      vortex(t, target, 220, 0.4, 3);
      for (const m of inRange(target.x, target.y, 220)) { stun(m, 0.5); hurt(m, 5000, 'magic', t); }
    },
    info: () => ['缓速：每次攻击（1 魔法）220 范围晕眩 0.5 秒、5000 魔法伤害，并留下减速 40% 的漩涡'],
  },

  // ---------------------------------------------------------------- 巫系（MAX 效果要用天赋卷轴激活）
  巫术塔: {
    attack(t, target) {
      const [r, d, pct, cd] = t.talent ? [300, 10000, 0.07, 10] : [250, 800, 0.05, 12];
      if (!cdReady(t, 'dd')) return;
      setCd(t, 'dd', cd);
      aoeAt(t, target.x, target.y, r, d, 'normal');
      field(t, target.x, target.y, r, 1, { color: 'rgba(120,255,120,.16)', each: (m, dt) => hurt(m, m.maxHp * pct * dt, 'hero', t, { ignoreArmor: true }) });
      FXS.nova(target.x, target.y, r, '#7dff7d', 0.6);
    },
    info(t) { const [r, d, pct, cd] = t.talent ? [300, 10000, 0.07, 10] : [250, 800, 0.05, 12]; return [`死亡凋零：${r} 范围 ${d} 普通伤害，之后 1 秒每秒消耗敌人 ${pct * 100}% 生命，冷却 ${cd} 秒`]; },
  },
  巫法塔: {
    attack(t, target) {
      const [detect, r, delay, s, cd] = t.talent ? [250, 300, 0.5, 3, 3.5] : [150, 200, 1, 2, 4.5];
      if (!cdReady(t, 'trap')) return;
      setCd(t, 'trap', cd);
      field(t, target.x, target.y, r, 8, { color: 'rgba(255,210,87,.10)', tick(z) {
        if (z.armAt == null && anyEnemy(z.x, z.y, detect)) z.armAt = G.t + delay;
        if (z.armAt != null && G.t >= z.armAt) { stunArea(z, r, s); FXS.nova(z.x, z.y, r, '#ffd257', 0.4); z.until = G.t; }
      } });
    },
    info(t) { const [, r, delay, s, cd] = t.talent ? [250, 300, 0.5, 3, 3.5] : [150, 200, 1, 2, 4.5]; return [`静止陷阱：有敌人靠近 ${delay} 秒后晕眩 ${r} 范围 ${s} 秒，冷却 ${cd} 秒`]; },
  },
  巫魔塔: {
    attack(t, target) {
      const [v, dur, cd] = t.talent ? [100, 3, 3] : [60, 4, 4];
      if (!cdReady(t, 'eye')) return;
      setCd(t, 'eye', cd);
      field(t, target.x, target.y, 250, dur, { color: 'rgba(196,139,255,.14)', each: m => debuffM(m, 'fear', v, dur) });
    },
    info(t) { const [v, dur, cd] = t.talent ? [100, 3, 3] : [60, 4, 4]; return [`恐惧之眼：经过的敌人护甲 -${v}，持续 ${dur} 秒（不和恐惧塔叠加），冷却 ${cd} 秒`]; },
  },
  巫医塔: {
    attack(t, target) {
      const [r, d, cd, dur] = t.talent ? [300, 3000, 9, 9] : [200, 300, 12, 12];
      if (!cdReady(t, 'ward')) return;
      setCd(t, 'ward', cd);
      zone(t, target.x, target.y, r, dur, d, 'magic', null, 'ward', { color: 'rgba(122,184,255,.16)' });
    },
    info(t) { const [r, d, cd, dur] = t.talent ? [300, 3000, 9, 9] : [200, 300, 12, 12]; return [`守卫：${dur} 秒内每秒对 ${r} 范围造成 ${d} 魔法伤害，冷却 ${cd} 秒`]; },
  },

  // ---------------------------------------------------------------- 全场唯一
  恐惧塔: {
    tick(t) {
      if (!cdReady(t, 'howl') || !anyEnemy(t.x, t.y, 600)) return;
      setCd(t, 'howl', 12);
      for (const m of inRange(t.x, t.y, 600)) debuffM(m, 'fear', 80, 3);
      FXS.nova(t.x, t.y, 600, '#c48bff', 0.6); SFX.spell('frostNova', { x: t.x, y: t.y });
    },
    info: () => ['恐怖嚎叫：每 12 秒 600 范围敌人护甲 -80，持续 3 秒'],
  },
  火速塔: {
    tick(t) {
      if (!cdReady(t, 'fire') || !anyEnemy(t.x, t.y, 1500)) return;
      setCd(t, 'fire', 12);
      for (const o of alliesNear(t.x, t.y, 200)) giveBuff(o, 'fire', 1.7, 2);
      FXS.nova(t.x, t.y, 300, '#ff8a3c', 0.5);
    },
    info: () => ['火速：每 12 秒 200 范围友军攻速 +170%，持续 2 秒'],
  },
  神力塔: {
    tick(t) {
      if (!cdReady(t, 'inner') || !anyEnemy(t.x, t.y, 1500)) return;
      const c = alliesNear(t.x, t.y, 800).filter(o => o !== t && o.cat !== 'uniq' && !bv(o, 'divine'))
        .sort((a, b) => towerStats(b).dmg / towerStats(b).cd - towerStats(a).dmg / towerStats(a).cd)[0];
      if (!c) return;
      setCd(t, 'inner', 5);
      giveBuff(c, 'divine', 2.6, 1.8);
      FXS.beam(t.x, t.y, 160, c.x, c.y, 160, '#ffe08a', 1.4, 0.4); FXS.ring(c.x, c.y, 160, '#ffe08a', 0.5, 3);
    },
    info: () => ['神力：每 5 秒给附近攻击最强的一座塔 +260% 攻击，持续 1.8 秒'],
  },
  冰封塔: {
    tick(t) {
      if (!cdReady(t, 'freeze') || !anyEnemy(t.x, t.y, 600)) return;
      setCd(t, 'freeze', 3);
      for (const m of inRange(t.x, t.y, 600)) { if (m.boss) continue; stun(m, 2); m.frozenUntil = G.t + 2; m.frozenBy = t; FXS.snow(m.x, m.y, 30, 0.4); }
      FXS.nova(t.x, t.y, 600, '#bff4ff', 0.5);
    },
    info: () => ['冰封：每 3 秒冰封 600 范围敌人 2 秒；冰封的敌人被攻击时，范围 500 无视护甲伤害（每 0.2 秒一次）'],
  },
  // 银行塔：每秒 +利息金币（8 木材提升 1 点，最高 10）；每 90 秒按银行魔法给木材（100~399：1 个，400 以上：2 个），魔法每秒 -0.2
  银行塔: {
    init(t) { t.maxMana = 1000; t.mana = 1000; t.bank = { rate: 1, acc: 0, wood: 90 }; },
    tick(t, dt) {
      const b = t.bank;
      b.acc += b.rate * dt; if (b.acc >= 1) { const g = Math.floor(b.acc); G.gold += g; b.acc -= g; }
      addMana(t, -0.2 * dt);
      if ((b.wood -= dt) <= 0) { b.wood += 90; const w = t.mana >= 400 ? 2 : t.mana >= 100 ? 1 : 0; if (w) { G.wood += w; msg(`银行塔：木材利息 +${w}`); } }
    },
    cmds(t) { const r = t.bank.rate; return [costCmd(t, 'Q', '提升金币利息', `当前每秒 ${r} 金 → ${r + 1} 金<br>回收返还木材`, { wood: r < 10 ? 8 : 0 }, () => { t.bank.rate++; }, { why: r >= 10 ? '已经是最高等级' : null })]; },
    info(t) { return [`利息：每秒 ${t.bank.rate} 金；${Math.ceil(t.bank.wood)} 秒后木材 +${t.mana >= 400 ? 2 : t.mana >= 100 ? 1 : 0}`]; },
    sell(t) { G.wood += (t.bank.rate - 1) * 8; },
  },
  // 魔法塔：每秒 +0.7 魔法，可以转给英雄塔（每次 20 点）
  魔法塔: {
    init(t) { t.maxMana = 1000; t.manaRegen = 0.7; },
    cmds(t) {
      return [costCmd(t, 'Q', '补充魔法', '把 20 点魔法转给英雄塔', { mana: 20 }, () => { const h = G.hero; h.mana = Math.min(h.maxMana(), h.mana + 20); msg(`${h.heroName} 魔法 +20`); },
        { why: G.hero ? null : '还没有建造英雄塔' })];
    },
  },
};
// 嗜血术：给附近一座没有嗜血的塔加攻速（优先打得最多的）
function lust(t, v, dur, cd, range) {
  if (!cdReady(t, 'lust') || !anyEnemy(t.x, t.y, 1500)) return;
  const c = alliesNear(t.x, t.y, range).filter(o => !bv(o, 'bloodlust') && o.cat !== 'uniq').sort((a, b) => (b.dealt || 0) - (a.dealt || 0))[0];
  if (!c) return;
  setCd(t, 'lust', cd);
  giveBuff(c, 'bloodlust', v, dur);
  FXS.ring(c.x, c.y, 150, '#ff5a4f', 0.5, 3);
}
// 咆哮：附近友军攻击力加成（攻击时自动释放）
function roar(t, v, dur, cd, area) {
  if (!cdReady(t, 'roar')) return;
  setCd(t, 'roar', cd);
  for (const o of alliesNear(t.x, t.y, area)) giveBuff(o, 'roar', v, dur);
  FXS.nova(t.x, t.y, area + FOOT_HALF, '#ff8a3c', 0.5);
}
// 驱逐：目标处 200 范围的敌人加速通过，并带上"被驱逐"状态（遣返用）
function expel(t, target, speed, dur, cd, p) {
  if (!cdReady(t, 'expel')) return;
  setCd(t, 'expel', cd);
  for (const m of inRange(target.x, target.y, 200)) { debuffM(m, 'expelSpeed', speed, dur); m.expel = { p: Math.max(p, m.expel && m.expel.until > G.t ? m.expel.p : 0), until: G.t + dur }; }
  FXS.ring(target.x, target.y, 200, '#9fe3ff', 0.4, 3);
}
// 缓速漩涡：留在地上 3 秒，经过的敌人减速
function vortex(t, target, r, v, s) {
  field(t, target.x, target.y, r, 3, { color: 'rgba(122,184,255,.14)', each: m => slowM(m, v, s) });
}
// 进化（大辅助 + 1 座同系 MAX 小辅助 + 8000 金币）：大辅助变成小熊猫塔 / 巫师塔，那座小辅助被消耗掉
function evoCmd(t, small, to) {
  const need = G.towers.find(o => o.fam === small && isMax(o));
  const why = !need ? `需要 1 座 ${small} MAX` : G.towers.filter(o => o.fam === t.fam).length >= 2 ? '合成时不能同时拥有 2 个该单位' : null;
  const d = D.towers[to].levels[0];
  return costCmd(t, 'E', '进化', `进化成 <b>${to}</b>（消耗 1 座 ${small} MAX）<br>${(d.tip || '').replace(/\n/g, '<br>')}`, { gold: 8000 }, () => {
    const o = G.towers.find(x => x.fam === small && isMax(x));
    if (!o) return;
    G.towers = G.towers.filter(x => x !== o && x !== t);
    if (G.selected === o) G.selected = G.builder;
    const n = newTower(to, t.x, t.y, { spent: t.spent + 8000, food: t.food, kills: t.kills, dealt: t.dealt });
    G.towers.push(n);
    if (G.selected === t) G.selected = n;
    FXS.nova(t.x, t.y, 260, '#9fffb0', 0.6); SFX.ui('upgrade');
    msg(`${t.fam}进化成了${to}`);
  }, { why });
}
// 弹跳塔 MAX：等级表只有一级（h021），回收返还 58000
function bounceMax(x, y, mana, bolt) {
  const d = D.towers.弹跳塔.max;
  const t = newTower('弹跳塔', x, y, { levels: [d], spent: BOUNCE.value, food: d.food, bmax: true, bolt, talent: G.bounce.talent });
  t.mana = mana;
  G.towers.push(t);
  FXS.nova(x, y, 300, '#c8b8ff', 0.6); SFX.ui('upgrade');
  return t;
}
// 合成大跳跳：所有 4 级弹跳塔被消耗（最多 3 座），在施法那座的位置建成 MAX
function bounceMerge(t) {
  const four = G.towers.filter(o => o.fam === '弹跳塔' && !o.bmax && isMax(o) && o.lv > 0);
  G.towers = G.towers.filter(o => !four.includes(o));
  const m = bounceMax(t.x, t.y, t.mana, 1);
  if (four.includes(G.selected)) G.selected = m;
  msg('合成了弹跳塔 MAX');
}
// 转移魔法：对方补到 300，多出的留下
function bounceXfer(src, t) {
  if (!G.towers.includes(src)) return;
  if (!t || t === src || t.fam !== '弹跳塔' || t.bmax) return msg('只能转给另一座弹跳塔（不能转给弹跳塔 MAX）');
  if (dist2(src.x, src.y, t.x, t.y) > (BOUNCE.xferRange + FOOT_HALF) ** 2) return msg('目标太远');
  if (!cdReady(src, 'xfer')) return msg('转移魔法冷却中');
  const sum = src.mana + t.mana;
  t.mana = Math.min(BOUNCE.mana, sum); src.mana = sum - t.mana;
  setCd(src, 'xfer', BOUNCE.xferCd);
  FXS.beam(src.x, src.y, 150, t.x, t.y, 150, '#7ab8ff', 1.4, 0.4);
}
// 击杀：塔的魔法值（功勋）
function towerKilled(t, m) { const kit = KITS[t.fam]; if (kit && kit.kill) kit.kill(t, m); }

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
  // 枪神：技能本身只有学习次数（Hy：1 学会、2 再次学习）和致命一击，每次攻击的效果在 HERO_ATTACK.枪神 里
  枪神: [0, 1, 2, 3].map(i => ({ relearn: true, init(h) { qsLearn(h, i, 1); }, crit: h => [QS_CRIT[i][h.qs[i] - 1], QS_CRIT[i][2]] })),
  // 邪冰：巨型冰雹 / 疯狂爆冰 / 邪恶冰冻都是"攻击时"触发（原图 BPw，EVENT_PLAYER_UNIT_ATTACKED），各自有计数器当冷却：
  // 触发时设为 2 / 3 / 4，每秒减 1（BGU），小于 0 才能再触发。触发后放出一个限时马甲单位，由马甲反复攻击造成伤害
  邪冰: [
    { onLaunch(h, tg) { if (h.xb.hail < 0) { h.xb.hail = 2; xbHail(h, tg.x, tg.y); } } },
    { init(h) { h.stat.str += 20; h.stat.agi += 30; h.stat.int += 40; }, critChance: 0.2, critMul: 40 },
    { onLaunch(h) { if (h.xb.burst < 0) { h.xb.burst = 3; xbBurst(h); } } },
    { onLaunch(h) { if (h.xb.freeze < 0) { h.xb.freeze = 4; xbFreeze(h); } } },
  ],
  火魂: [
    { onAttack(h, tg) { tg.burn = { dps: lerpStat(40, 150000, h.stat.str, 350), src: h }; } },
    { cd: 0.8, cast(h) {
      const ms = inRange(h.x, h.y, heroStats(h).range); if (!ms.length) return false;
      const tg = pick(ms), a = h.stat.agi, X = a < 100 ? 10 : a < 200 ? 30 : a < 300 ? 60 : a < 400 ? 120 : a < 500 ? 250 : 420;
      const fx0 = tg.x, fy0 = tg.y;
      FXS.fall(fx0, fy0, { z: 500, dur: 0.22, color: '#ff8a3c', core: '#ffe08a', size: 16, onEnd: () => { aoe(h, { x: fx0, y: fy0 }, 200, a * X, 'pierce', false, '#ff8a3c'); FXS.explosion(fx0, fy0, 0.5, '#ff8a3c'); SFX.spell('fireFall', { x: fx0, y: fy0 }); } });
    } },
    { cd: 4, cast(h) {
      const ms = inRange(h.x, h.y, heroStats(h).range); if (!ms.length) return false;
      const tg = pick(ms);
      const mx0 = tg.x, my0 = tg.y;
      FXS.fall(mx0, my0, { z: 1100, dx: -500, dy: 260, dur: 0.45, color: '#ff6a2a', core: '#fff0b0', size: 40, rock: '#3a2014', onEnd: () => {
        aoe(h, { x: mx0, y: my0 }, 350, lerpStat(50, 30000, h.stat.int, 280), 'magic', true, '#ff5a4f');
        FXS.explosion(mx0, my0, 1.3, '#ff5a4f'); SFX.spell('meteor', { x: mx0, y: my0 }); FXS.nova(mx0, my0, 380, '#ff7a3a', 0.45); FXS.splat(mx0, my0, '#2a1a10'); FXS.debris(mx0, my0, '#5a3a20');
      } });
    } },
    { cd: 10, needsTarget: false, cast(h) {
      if (G.towers.filter(t => t.summonOf === h && t.until > G.t).length >= 4) { msg('炎魔最多同时存在 4 个'); return false; }
      const ang = Math.random() * Math.PI * 2;
      const x = h.x + Math.cos(ang) * 250, y = h.y + Math.sin(ang) * 250;
      G.towers.push({ id: G.nextId++, fam: '炎魔', cat: 'summon', summonOf: h, owner: h, x, y, lv: 0, cdLeft: 0, until: G.t + 30, food: 0, spent: 0,
        levels: [{ dmg: lerpStat(20, 10000, h.stat.str, 180), cd: 1, range: 600, atk: 'chaos', targets: 1, abils: [] }], title: '炎魔', label: '魔', buff: {}, cds: {}, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0 });
      FXS.explosion(x, y, 0.6, '#ff5a2a'); SFX.spell('summon', { x, y });
    } },
  ],
};
// ---- 枪神（原图触发器 BSu 学习 / BSx 每次攻击 / BS0 连击）
const QS_CRIT = [[0.06, 0.09, 9], [0.09, 0.12, 6], [0.12, 0.15, 3], [0.03, 0.06, 12]];   // 致命一击 1~4（AOcr）：学会 / 再次学习时的概率，倍数
const QS_NB = [[2, 2], [0, 3], [1, 1], [0, 0]];       // 学会 / 再次学习时火焰喷射暴击率（Nb）增加的百分点
const QS_RELEARN = 10000;                             // 再次学习的金币
// 火焰喷射 = 喷火马甲（KLFZ）放的震荡波 A0LK，1~10 级按智力，暴击时 +10 级
const QS_WAVE = [20, 100, 300, 600, 1000, 1500, 3000, 6000, 9000, 15000, 200, 1000, 3000, 6000, 10000, 15000, 30000, 60000, 90000, 150000];
function qsLearn(h, i, n) {
  h.qs[i] = n; h.nb += QS_NB[i][n - 1];
  if (i === 3 && n === 1) h.asBonus += 0.8;           // 增加 80% 攻击速度（A059）
}
const popText = (x, y, text, color) => addFx({ kind: 'text', x, y, text, life: 0.8, color });
// 震荡波：从施法者出发直线 600，起点宽 150、终点宽 300，速度 1050，每个敌人只打一次
function shockwave(src, dx, dy, dmg, crit) {
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, x0 = src.x, y0 = src.y, color = crit ? '#ffd257' : '#ff8a3c';
  for (const m of G.monsters) {
    if (m.dead) continue;
    const ax = m.x - x0, ay = m.y - y0, along = ax * ux + ay * uy, side = Math.abs(ax * uy - ay * ux);
    if (along < 0 || along > 600 || side > 150 + 150 * along / 600) continue;
    later(along / 1050, () => { if (!m.dead) hurt(m, dmg, 'magic', src, { ignoreArmor: true }); });
  }
  for (let d = 0; d <= 600; d += 100) later(d / 1050, () => FXS.explosion(x0 + ux * d, y0 + uy * d, (0.35 + d / 1200) * (crit ? 1.4 : 1), color));
}
// 每次攻击（攻击开始时）：火焰喷射、[魔法值×2] 范围穿刺，四种致命里按顺序最多触发一种，再判定一次连击
const HERO_ATTACK = {
  枪神(h, tg) {
    const { str, agi, int } = h.stat, lv = h.level, hy = h.qs, roll = n => rint(1, n), x = tg.x, y = tg.y;
    const at = (dmg, atk, ign, txt, color) => { aoe(h, { x, y }, 150, dmg, atk, ign, color); if (txt) popText(x, y + 40, txt, color); };
    if (hy[1]) {     // 原图喷火马甲固定朝 (英雄 x-15, y-200) 放（朝南）；这里改成朝攻击目标喷
      const fire = roll(100) <= h.nb + 3, lvW = clamp((int <= 300 ? Math.floor(int / 30) : 10) + (fire ? 10 : 0), 1, 20);
      if (fire) popText(h.x, h.y + 80, '火焰×10', '#7fffd4');
      shockwave(h, x - h.x || 0.01, y - h.y, QS_WAVE[lvW - 1], fire);
    }
    if (hy[0]) aoe(h, { x, y }, 150, h.mana * 2, 'pierce', false, '#ffb347');
    if (hy[0] && roll(150) <= hy[0] * 3) { at(str * lv, 'pierce', false, '穿刺致命', '#ff5a4f'); h.last.p = 1; }
    else if (hy[1] && roll(150) <= 3 + hy[1] * 3) { at(agi * lv, 'magic', false, '魔法致命', '#6fd17a'); h.last.m = 1; }
    else if (hy[3] && roll(100) <= hy[3] * 3) { hurt(tg, lv * 3000, 'hero', h, { ignoreArmor: true }); popText(x, y + 40, '通用致命', '#9fb8ff'); }
    else if (hy[2] && roll(150) <= 6 + hy[2] * 3) { at(int * lv, 'chaos', false, '混乱致命', '#c48bff'); h.last.c = 1; }
    // 连击：上次是对应的致命时再判定一次，造成强化伤害（无视护甲）并清掉标记
    if (hy[0] && h.last.m && roll(150) <= hy[0] * 3) { at(str * lv * (str >= 400 ? 18 : 12), 'pierce', true, '穿刺连击', '#7fffd4'); h.last.m = 0; }
    else if (hy[1] && h.last.p && roll(150) <= 3 + hy[1] * 3) { at(agi * lv * (agi >= 400 ? 12 : 8), 'magic', true, '魔法连击', '#7fffd4'); h.last.p = 0; }
    else if (hy[3] && h.last.c && roll(150) <= hy[3] * 2) { at(lv * (lv >= 30 ? 4500 : 3000), 'hero', true, '通用连击', '#7fffd4'); h.last.c = 0; }
    else if (hy[2] && h.last.c && roll(150) <= 6 + hy[2] * 3) { at(int * lv * (int >= 400 ? 15 : 10), 'chaos', true, '混乱连击', '#7fffd4'); h.last.c = 0; }
  },
};
// ---- 邪冰的三个马甲（原图 h036 冰雹 / n04Z 爆冰 / h038 冰冻）
const tierX = (v, xs) => v >= 400 ? xs[0] : v >= 300 ? xs[1] : v >= 200 ? xs[2] : v >= 100 ? xs[3] : xs[4];
// 冰雹：在目标处存在 3 秒，每 0.15 秒攻击 500 范围内的敌人：命中减 160 护甲 3 秒（腐蚀攻击，不和腐蚀塔叠加），
// 落点 150 范围 [力量×X] 普通伤害（力量 ≥ 400 无视护甲）
function xbHail(h, x, y) {
  const d = { x, y, target: null };
  for (let k = 0; k * 0.15 < 3; k++) later(k * 0.15, () => {
    const m = lockTarget(d, 500); if (!m) return;
    const hx = m.x, hy = m.y, str = h.stat.str;
    FXS.fall(hx, hy, { z: 700, dur: 0.3, color: '#bfefff', core: '#ffffff', size: 18, rock: 'rgba(220,245,255,.9)', onEnd: () => {
      if (!m.dead) { m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, 160); m.shredUntil = G.t + 3; }
      for (const o of inRange(hx, hy, 150)) hurt(o, str * tierX(str, [60, 160, 80, 40, 10]), 'normal', h, { ignoreArmor: str >= 400 });
      FXS.snow(hx, hy, 20, 0.8); if (k % 3 === 0) SFX.spell('iceFall', { x: hx, y: hy });
    } });
  });
}
// 爆冰：在英雄处存在 2 秒，每 0.3 秒对 800 范围内的敌人放霜冻新星：300 范围 [敏捷×X] 混乱伤害（敏捷 ≥ 400 无视护甲），减速 30% 3 秒
function xbBurst(h) {
  const d = { x: h.x, y: h.y, target: null };
  for (let k = 0; k * 0.3 < 2; k++) later(k * 0.3, () => {
    const m = lockTarget(d, 800); if (!m) return;
    const x = m.x, y = m.y, agi = h.stat.agi;
    for (const o of inRange(x, y, 300)) { hurt(o, agi * tierX(agi, [90, 240, 120, 60, 15]), 'chaos', h, { ignoreArmor: agi >= 400 }); slowM(o, 0.3, 3); }
    FXS.flash(x, y, 40, '#c48bff', 160); FXS.nova(x, y, 300, '#c48bff', 0.35); FXS.snow(x, y, 30, 0.8); SFX.spell('frostPulse', { x, y });
  });
}
// 冰冻：在英雄处存在 4.2 秒，放流星雨（A0G8，等级 = 智力 / 32，最高 10 级）：每 0.18 秒对 1000 范围造成一波魔法伤害；
// 身上的邪恶光环让 900 范围内的敌人减速 45%
const XB_STAR = [50, 350, 750, 1250, 1850, 2550, 5000, 12000, 20000, 36000];
function xbFreeze(h) {
  const x = h.x, y = h.y, dmg = XB_STAR[clamp(Math.floor(h.stat.int / 32), 1, 10) - 1];
  SFX.spell('frostNova', { x, y }); FXS.nova(x, y, 1000, '#7ab8ff', 0.6);
  for (let k = 0; k * 0.18 < 4.2; k++) later(k * 0.18, () => {
    for (const m of inRange(x, y, 1000)) { hurt(m, dmg, 'magic', h); if (dist2(x, y, m.x, m.y) <= 900 * 900) slowM(m, 0.45, 0.5); }
    const a = rnd(0, TAU), r = rnd(0, 800);
    FXS.snow(x + Math.cos(a) * r, y + Math.sin(a) * r, 40, 0.5);
  });
}
const statCN = s => ({ str: '力量', agi: '敏捷', int: '智力' })[s];
// 原图英雄塔是建筑（h03R 剑神等：1500 金 + 5 木 + 4 人口），建成后触发器把它换成英雄单位；全场唯一，建造后不能回收
const heroBlock = () => G.hero ? '英雄塔全场只能建造一个' : !G.heroChoice ? '建造栏里没有英雄塔' : null;
function buildHero(x, y) {
  const hd = D.heroes[G.heroChoice], why = heroBlock();
  if (why) return msg(why);
  if (G.gold < hd.gold) return msg('金币不足');
  if (G.wood < hd.wood) return msg('木材不足');
  if (foodUsed() + hd.food > G.foodCap) return msg('人口不足');
  G.gold -= hd.gold; G.wood -= hd.wood;
  const h = { id: G.nextId++, isHero: true, fam: 'hero', heroName: hd.name, cat: 'hero', x, y, lv: 0, level: 1, spent: hd.gold, food: hd.food,
    stat: { str: 10, agi: 10, int: 10 }, growth: 'str', points: 0, mana: 0, learned: [], cdLeft: 0, cds: {}, auto: {}, asBonus: 0,
    qs: [0, 0, 0, 0], nb: 0, last: { p: 0, m: 0, c: 0 }, xb: { hail: 0, burst: 0, freeze: 0 },   // 枪神学习次数 / 火焰暴击率 / 上次致命；邪冰技能计数器
    kills: 0, dealt: 0, attacks: 0, buff: {}, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, levels: [{}],
    maxMana() { return D.heroes[this.heroName].mana || 1000; } };
  // 建成时随机成长值（原图 DR / DS / DT：力量 0~7，敏捷 0~剩余，智力补足 7）。每次升级英雄自带全属性 +1，再按成长值加，所以显示时各 +1，合计 10
  const r = rint(0, 7), a = rint(0, 7 - r);
  h.grow = { str: r + 1, agi: a + 1, int: 7 - r - a + 1 };
  msg(`${hd.name} 英雄成长值（每次升级自动加属性）：力量 ${h.grow.str} · 敏捷 ${h.grow.agi} · 智力 ${h.grow.int}`, 8);
  G.towers.push(h); G.hero = h;
  return h;
}
function heroStats(h) {
  const hd = D.heroes[h.heroName];
  return { dmg: 9 + h.stat.str * 5, cd: hd.cd / (1 + h.stat.agi * 0.01 + h.asBonus), range: hd.range, atk: hd.atk, targets: 1 };
}
function heroTick(h, dt) {
  h.mana = Math.min(h.maxMana(), h.mana + dt * h.stat.int * 0.01);   // IntRegenBonus = 0.01
  const sec = Math.floor(G.t) - Math.floor(G.t - dt);                 // 原图每秒一次的计时器（BGU）把邪冰的计数器减 1
  if (sec) for (const k in h.xb) h.xb[k] -= sec;
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
  if (!auto) SFX.ack(sndKey(h), 'yesAttack');
  if (tg) h.face = Math.atan2(tg.y - h.y, tg.x - h.x);
  if (!auto) addFx({ kind: 'text', x: h.x, y: h.y + 60, text: D.heroes[h.heroName].skills[i].name, life: 0.8, color: '#9fe3ff' });
}
function heroAttack(h, tg, st) {
  const kit = HERO_KITS[h.heroName], splash = D.heroes[h.heroName].splash;
  let dmg = st.dmg * h.atkMul;                      // 光环等加成只加普通攻击，技能伤害不加
  for (const i of h.learned) {
    const s = kit[i], c = s.crit ? s.crit(h) : s.critChance && [s.critChance, s.critMul];
    if (c && Math.random() < c[0]) { dmg *= c[1]; SFX.spell('crit', { x: tg.x, y: tg.y }); popText(tg.x, tg.y, c[1] + '倍', '#ffd257'); break; }
  }
  shot(h, tg);
  // 原图的"攻击时"触发器（EVENT_PLAYER_UNIT_ATTACKED）在出手时就判定，不等投射物命中
  if (HERO_ATTACK[h.heroName]) HERO_ATTACK[h.heroName](h, tg);
  for (const i of h.learned) if (kit[i].onLaunch) kit[i].onLaunch(h, tg);
  const style = missileOf(h);
  SFX.ent(sndKey(h), 'launch', { x: h.x, y: h.y });
  FXS.launch(style, muzzle(h, style), tg, (hit, x, y) => {
    SFX.ent(sndKey(h), 'hit', { x, y });
    // 剑神 / 枪神 / 邪冰的攻击是溅射（msplash）：落点 Farea1 范围内全额伤害；火魂是单体
    if (splash) for (const m of inRange(x, y, splash)) hurt(m, dmg, st.atk, h);
    else if (hit) hurt(hit, dmg, st.atk, h);
    if (hit) for (const i of h.learned) { const s = kit[i]; if (s.onAttack) s.onAttack(h, hit); }
  }, { scale: 1.3, ...w3opt(h) });
}
function aoe(h, c, r, dmg, atk, ignoreArmor, color) {
  for (const m of inRange(c.x, c.y, r)) hurt(m, dmg, atk, h, { ignoreArmor });
  addFx({ kind: 'ring', x: c.x, y: c.y, r, life: 0.25, color: color || ATK_COLOR[atk] });
}
function zone(owner, x, y, r, dur, dps, atk, endFn, style, extra) {
  if (style === 'bladestorm') SFX.spell('bladestorm', { x, y });
  G.zones.push({ owner, x, y, r, t0: G.t, until: G.t + dur, dps, atk, endFn, style, fxT: 0, ...extra });
}
function later(s, fn) { G.timeouts.push({ at: G.t + s, fn }); }
const LEARN_COST = [{ wood: 0, str: 0 }, { wood: 18, str: 80 }, { wood: 36, str: 160 }, { wood: 54, str: 240 }];
function learnSkill(h, i) {
  if (h.learned.includes(i) && HERO_KITS[h.heroName][i].relearn) return relearnSkill(h, i);
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
// 枪神的技能可以再学一次：10000 金，致命一击升到 2 级（概率 +3%），触发几率 +3%
function relearnSkill(h, i) {
  if (h.qs[i] >= 2) return msg('已经再次学习过了');
  if (G.gold < QS_RELEARN) return msg(`金币不足（再次学习需要 ${QS_RELEARN} 金币）`);
  G.gold -= QS_RELEARN; qsLearn(h, i, 2);
  msg(`再次学习了 ${D.heroes[h.heroName].skills[i].name}`);
  uiDirty();
}
function heroLevelUp(h) {
  const max = h.level >= 30;
  const gold = max ? 500 : h.level * 100, mana = max ? 400 : 200;
  if (G.gold < gold) return msg('金币不足');
  if (h.mana < mana) return msg('魔法值不足（升级需要 ' + mana + ' 魔法）');
  G.gold -= gold; h.mana -= mana; h.spent += gold;
  if (max) h.stat[h.growth] += 3;
  else { h.level++; for (const k in h.grow) h.stat[k] += h.grow[k]; }
  SFX.ui('levelup', { x: h.x, y: h.y });
  uiDirty();
}

// ---------------------------------------------------------------- 光环 (每帧重算)
function applyAuras() {
  for (const m of G.monsters) { m.auraFocus = 0; m.auraArmorDown = 0; m.auraSlow = 0; m.auraSpeed = 0; m.auraRegen = 0; }
  for (const t of G.towers) { t.buffAS = 0; t.buffDmg = 0; t.eliteAS = 0; t.eliteWeak = 0; t.selfAS = 0; t.selfAS2 = 0; t.selfAtk = 0; t.selfAtk2 = 0; }
  // 塔自身的加成：原始战速 / 原始战力（等级 = MAX 原始塔数量），各主塔的技能（魔幻塔急速 / 强攻、剑圣塔致速 / 强攻）
  const primal = G.towers.filter(t => t.cat === 'raw' && isMax(t)).length;
  for (const t of G.towers) {
    if (t.cat === 'raw' && isMax(t)) { if (hasAbil(t, 'A082')) t.selfAS = primalSpd(primal); if (hasAbil(t, 'A073')) t.selfAtk = primalPow(primal); }
    const kit = KITS[t.fam], b = kit && kit.self && kit.self(t);
    if (b) { t.selfAS = Math.max(t.selfAS, b.as || 0); t.selfAS2 = b.as2 || 0; t.selfAtk += b.atk || 0; t.selfAtk2 = b.atk2 || 0; }
  }
  // 光环塔 (同类光环不叠加，取最大)
  let armorAuras = [], slowAuras = [];
  for (const a of G.towers) {
    if (a.cat !== 'aura') continue;
    const ab = auraAb(a);
    if (!ab) continue;
    const r = ab.area || 900;
    if (a.fam === '加速光环') for (const t of G.towers) { if (dist2(a.x, a.y, t.x, t.y) <= r * r) t.buffAS = Math.max(t.buffAS, ab.A); }
    if (a.fam === '攻击光环') for (const t of G.towers) { if (dist2(a.x, a.y, t.x, t.y) <= r * r) t.buffDmg = Math.max(t.buffDmg, ab.A); }
    if (a.fam === '减防光环') armorAuras.push([a, r, -ab.A]);
    if (a.fam === '减速光环') slowAuras.push([a, r, -ab.A]);
  }
  // 寒冰塔的冰霜光环：600 范围敌人移速 -(5 + 3×(等级-1))%（和减速光环同类，取最大）
  for (const t of G.towers) if (t.fam === '寒冰塔') slowAuras.push([t, 600, 0.05 + 0.03 * (t.ice.aura - 1)]);
  for (const m of G.monsters) {
    if (m.dead) continue;
    for (const [a, r, v] of armorAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraArmorDown = Math.max(m.auraArmorDown, v);
    for (const [a, r, v] of slowAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraSlow = Math.max(m.auraSlow, v);
  }
  // 精英怪光环 (900 范围)
  for (const e of G.monsters) {
    if (e.dead || !e.elite) continue;
    const { aura, lvl } = e.elite, v = aura.v[lvl - 1];
    if (aura.key === 'focus' || aura.key === 'endur' || aura.key === 'unholy') {
      for (const m of G.monsters) {
        if (m.dead || dist2(e.x, e.y, m.x, m.y) > 900 * 900) continue;
        if (aura.key === 'focus') m.auraFocus = Math.max(m.auraFocus, v);
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

// ---------------------------------------------------------------- 波次（waves.js：tools/wave_rolls.py 从原图脚本枚举出的每一波所有随机分支和概率）
// 原图的波次是一条触发器链：第 N 波的函数在第 N-1 波开始时就执行，先定下第 N 波的提示词（倒计时期间就显示，相当于预告），
// 等一个波次间隔后"第 N 波开始"，再设置出怪单位、打开出怪器。三个出怪器（多 / 中 / 少）刷的都是"当前出怪单位"，
// 出怪单位中途换了，还没刷完的出怪器也跟着换（30 波飞艇每秒换一种、40 波坦克后面换成维修工都是这样）。
const WR = window.WAVE_ROLLS;
// 原图精英怪的排除名单（war3map.j 精英触发器的条件）：只有这些不会变精英，BOSS 波的其他单位照样可能变
const NO_ELITE = new Set(['Nfir', 'Nalc', 'Ntin', 'Npbm', 'hhdl', 'nhef', 'njks', 'nhew', 'nsqt', 'nsko', 'nrdr', 'nrdk', 'nbzd', 'ngrd', 'ngst', 'nkob', 'nkot', 'nkog',
  'nglm', 'nfgl', 'ndrl', 'ndrt', 'ndrn', 'nogo', 'nsw2', 'nogn', 'noga', 'ndsa', 'Udea', 'nbal', 'nchw', 'nchg', 'njga', 'njgb', 'nskg', 'nanm', 'h08S']);
const HINT_ARMOR = { '物理': 'small', '抗性': 'medium', '魔法': 'large', '神圣': 'divine' };
function monstersAlive() { return G.monsters.filter(m => !m.dead).length; }
function cap() { return G.final && G.final.endless ? 15 : RULE.capPerPlayer; }
function startSpawner(word) {
  if (G.spawners.some(s => s.word === word)) return;            // 出怪器是周期触发器：已经开着，再打开一次没有效果
  const s = SPAWNER[word] || SPAWNER['中'];
  G.spawners.push({ word, every: s.every, left: s.count, next: s.every });   // 第一只在一个周期后出
}
// 抽第 N 波函数的一条执行路径（只在"进入时要求的变量"和当前一致的路径里抽），并定下它的预告
function rollFn(name) {
  const f = WR.fns[name], vars = G.waveVars;
  let rows = f.rows.filter(r => Object.entries(r.req).every(([k, v]) => vars[k] === v));
  if (!rows.length) rows = f.rows;
  let x = Math.random() * rows.reduce((s, r) => s + r.p, 0), row = rows[rows.length - 1];
  for (const r of rows) if ((x -= r.p) <= 0) { row = r; break; }
  Object.assign(vars, row.set);
  // 11 / 21 / 41 波的提示词是上一个 BOSS 波函数里定的
  G.next = { fn: name, row, hint: row.hint || G.carryHint || '' };
  G.carryHint = row.nextHint;
}
// 从这一波开始到下一波开始的秒数：本波函数里执行下一波函数的时刻 + 下一波函数等到"开始"的时间（含波次间隔）
function waveLen(row) {
  const nf = WR.fns[row.next];
  return row.nextAt + nf.pre + (nf.dm ? G.interval : 0);
}
function waveOp(op, id, n, life) {
  if (op === 'sc') { G.sc = id; if (!G.curUnit) { G.curUnit = id; refreshHint(); } }
  if (op === 'sp') startSpawner(id);
  if (op === 'mk') for (let i = 0; i < n; i++) {
    const m = spawnMonster(id, { boss: D.units[id] && D.units[id].hp >= 3000 });
    if (m && life) m.until = G.t + life;
  }
}
function startWave() {
  const lastWave = MODES[G.mode].waves;
  if (lastWave && G.wave >= lastWave) {           // 演示模式：最后一波打完（场上清空）就结束
    if (monstersAlive() === 0 && !G.spawners.length) return demoEnd();
    G.timer = 2; G.hint = `第 ${G.wave} 波已出完：清掉场上剩余的 ${monstersAlive()} 只怪物，演示结束`; return;
  }
  const alive = monstersAlive();
  G.wave++;
  if (alive === 0) { G.perfect++; G.ach += RULE.achPerPerfect; msg(`Perfect +1（当前 ${G.perfect}），当局成就 +${RULE.achPerPerfect}`); }
  G.score -= alive;
  G.gold += 8 + G.wave * 2;                 // 排名序号*8 + 波数*2 (单人排名 1)
  G.bossRule = null; G.waveHook = null; G.waveNote = ''; G.curUnit = null;
  const n = G.wave, { fn, row } = G.next;
  SFX.stinger(n);                                  // 原图每波开始放一段音乐（war3map.j 的 PlaySoundBJ）
  if (RULE.rabbitWaves.includes(n)) later(RULE.rabbitDelay, () => spawnRabbit());     // 原图：BOSS 波中途 TriggerExecute(U0) 放出兔子
  if (!row.next) {                                 // 最后一个函数（原图第 47 波之后）：最终 BOSS 波，先倒计时 30 秒
    G.spawners = []; G.next = null;               // 原图在这里关掉三个出怪器
    G.finalCountdown = true; G.timer = 30;
    G.waveNote = '　<b>30 秒后最终 BOSS 波——龙 开启</b>';
    msg('30 秒后最终 BOSS 波——龙 开启');
    return refreshHint();
  }
  if (BOSS_WAVES[fn]) BOSS_WAVES[fn]();
  for (const [t, op, id, k, life] of row.ev) later(t, () => waveOp(op, id, k, life));
  rollFn(row.next);
  G.timer = waveLen(row);
  refreshHint();
}
// 提示栏：本波实际出的怪 + 下一波的预告（原图的提示词就是倒计时期间给出的预告）
function hintTags(hint) {
  const [word, armor] = (hint || '').split(' ');
  if (!HINT_ARMOR[armor]) return `<b>${word || ''}</b>`;
  const counter = COUNTER[armor];
  return `<span class="tag" style="background:#333">${word}</span><span class="tag" style="background:${ARMOR_COLOR[HINT_ARMOR[armor]]};color:#111">${armor}护甲</span>` +
    ` → 克制：<b style="color:${ATK_COLOR[counter]}">${ATK_CN[counter]}攻击</b>`;
}
function refreshHint() {
  let cur;
  if (G.phase === 'prep') cur = '准备阶段：选中守卫者，在出怪口附近建塔！';
  else {
    const u = G.curUnit && D.units[G.curUnit];
    cur = `第 ${G.wave} 波` + (u ? `：${u.name}（${ARMOR_CN[u.armorType]}护甲，生命 ${fmt(u.hp * (1 + RULE.hpPerWave * G.wave) * G.hpScale)}，护甲 ${u.armor}，移速 ${u.speed}，赏金 ${u.bounty}）` : '');
  }
  const nx = G.next && G.next.hint;
  G.hint = cur + (G.waveNote || '') + (nx ? `　<span style="opacity:.85">下一波预告：</span>${hintTags(nx)}` : '');
}
// BOSS 波的额外规则（出怪本身来自 waves.js）。key 是原图的函数名（8.6.6 脚本），同一波有两种随机版本时各写一个
const AIRSHIPS = { 1: ['ncen', 'ncim', 'ncnk', 'ncks'], 2: ['n07R', 'n07S', 'n07T', 'n07U'] };
const BOSS_WAVES = {
  // 10 波大红牛：坚持 60 秒不会失败；60 秒时没杀死的大红牛自动消失，每杀 1 只全员 +100 金；80 秒后下一波
  xH() {
    let killed = 0;
    G.waveNote = '　坚持 60 秒，未杀完 BOSS 不会失败；杀死的大红牛越多，结束后金币越多（每只 +100），60 秒时没杀死的自动消失';
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsqt') m.onDeath = () => { killed++; }; } };
    later(60, () => { for (const m of G.monsters) if (m.uid === 'nsqt') m.dead = true; G.gold += killed * 100; msg(`BOSS 波通关，20 秒后下波开始。大红牛死亡 ${killed} 个，获得 ${killed * 100} 金币`); });
  },
  // 10 波大豪猪：同上，奖励是木材（死亡个数 ÷ 7）
  xK() {
    let killed = 0;
    G.waveNote = '　坚持 60 秒，未杀完 BOSS 不会失败；杀死的大豪猪越多，结束后木材越多（每 7 只 +1），60 秒时没杀死的自动消失';
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsqa' || m.uid === 'n09B') m.onDeath = () => { killed++; }; } };
    later(60, () => { for (const m of G.monsters) if (m.uid === 'nsqa' || m.uid === 'n09B') m.dead = true; const w = Math.floor(killed / 7); G.wood += w; msg(`BOSS 波通关，20 秒后下波开始。大豪猪死亡 ${killed} 个，获得 ${w} 木材`); });
  },
  // 20 波骷髅：100 秒内杀死 BOSS，否则失败
  xf() { BOSS_WAVES.xi(); },
  xi() {
    G.waveNote = '　<b style="color:#ff5a4f">100 秒内杀死所有 BOSS，否则游戏失败</b>';
    G.bossRule = { killBy: G.t + 100, ids: [] };
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsko' || m.uid === 'n071') G.bossRule && G.bossRule.ids.push(m); } };
  },
  // 30 波飞艇：出怪单位每秒在 4 种护甲的飞艇里随机换（开局定下是亡灵飞艇还是地精飞艇）；63 秒出怪结束，杀得最多的玩家 +20 木
  x3() {
    let killed = 0;
    G.waveNote = '　坚持 80 秒！飞艇每只护甲随机；杀死最多飞艇的玩家奖励 20 木材';
    const kinds = AIRSHIPS[G.k7];
    G.waveHook = { onSpawn(m) { if (kinds.includes(m.uid)) m.onDeath = () => { killed++; }; } };
    for (let s = 0; s < 63; s++) later(s, () => { G.sc = pick(kinds); });
    later(63, () => {
      if (killed > 0) { G.wood += 20; msg(`出怪结束：杀死 ${killed} 艘飞艇，杀死最多飞艇，获得 20 木材奖励`); }
      else { G.wood += 5; msg('出怪结束：多个玩家杀死同样最多飞艇，全体玩家获得 5 木材奖励'); }
    });
  },
  // 40 波：坦克 + 大游艇 + 直升机，之后出维修工；91 秒时坦克、大游艇、直升机还有活着的就失败（维修工不算）
  yO() {
    const must = ['nerw', 'nfor', 'nfot', 'nfod', 'ndrj', 'n06Y'];
    G.waveNote = '　<b style="color:#ff5a4f">90 秒内杀死全部坦克、嚣张的大游艇和疯狂的直升机，否则游戏失败</b>（维修工不算）';
    later(91, () => {
      const left = G.monsters.filter(m => !m.dead && must.includes(m.uid));
      if (left.length) return gameOver(`90 秒内没有杀死全部坦克、大游艇和直升机（还剩 ${left.length} 个）`);
      msg('BOSS 波通关，20 秒后下波开始');
    });
  },
};
// 最终 BOSS 波（原图 yo）：倒计时 300 秒。先出熊猫（第 34 波定下的那种），20 秒后出 1 条龙（四色等概率，一半概率护甲改成 200），
// 每条龙进场带 4 只狗头人；59 秒出魔王（单人带 +22 护甲的物品）并开始刷耐瑟龙，同时出巨龙，之后每 55 秒补魔龙、速龙。
// 杀死所有龙和魔王即通关；杀龙 +20 木，杀狗头人 +5 木
const PANDA = { 1: 'Ntin', 2: 'Npbm', 3: 'Nalc', 4: 'Nfir' };
const KOBOLDS = ['nkob', 'nkot', 'nkog', 'ngst'];
function startFinal() {
  G.finalCountdown = false;
  G.final = { need: [], check: false };
  G.timer = 300;
  G.waveNote = '　<b>最终 BOSS 波</b>：300 秒内杀死所有龙和魔王即可通关！';
  msg('杀死所有龙 BOSS 和魔王后会通关');
  G.sc = PANDA[G.waveVars.HI] || pick(Object.values(PANDA)); G.curUnit = G.sc; startSpawner('少');
  refreshHint();
  const need = m => { if (m) G.final.need.push(m); return m; };
  later(20, () => {
    const d = need(spawnMonster(pick(['nbzd', 'nrdr', 'nrdk', 'ngrd']), { boss: true }));
    if (d) {
      if (Math.random() < 0.5) d.armor = 200;
      d.onDeath = () => { G.wood += 20; msg('你杀死了一条龙，获得 20 点木材'); };
      for (const k of KOBOLDS) { const g = spawnMonster(k, { boss: true }); if (g) g.onDeath = () => { G.wood += 5; msg('你杀死了一只狗，获得 5 点木材'); }; }
      msg(`${d.name}出现了，带着 4 只狗头人`);
    }
  });
  later(59.3, () => {
    G.sc = 'nndr';
    const u = need(spawnMonster('Udea', { boss: true }));
    if (u) u.armor += 22;                                       // A0EO 能提高护甲的物品（AIde，+22）
    msg('魔王：翻滚吧！');
    G.final.check = true;
  });
  // 魔王的魔法免疫（Bau，5 秒一次）：从这里第 28.3 秒开始，单数次去掉、双数次加上；魔王 59.3 秒才出场，出场时没有免疫，68.3 秒起开始有
  G.final.immune = false;
  for (let k = 1; 28.3 + 5 * k < 300; k++) later(28.3 + 5 * k, () => {
    G.final.immune = k % 2 === 0;
    for (const m of G.monsters) if (m.uid === 'Udea' && !m.dead) {
      m.magicImmune = G.final.immune;
      addFx({ kind: 'text', x: m.x, y: m.y + 80, text: m.magicImmune ? '魔法免疫' : '免疫消失', life: 1, color: m.magicImmune ? '#7ab8ff' : '#cccccc' });
      if (G.selected === m) uiDirty();
    }
  });
  [[59.3, 'njga'], [114.3, 'n07W'], [169.3, 'n07V']].forEach(([t, id]) => later(t, () => { startSpawner('少'); spawnMonster(id, { boss: true }); }));
}

// ---------------------------------------------------------------- 兔子（成就商店）
// 原图 nshe：中立单位，模型是复活节兔子（放大 3 倍），刷在可玩区域内随机一点，小地图闪烁，60 秒后"咕~"一声消失
const RABBIT_TALK = ['跑圈啦! 跑圈啦!跑圈啦!', '咦，人呢？找不到我！啦啦啦！', '别过来，你们都别过来！我就只是想逛逛圈圈而已！',
  '这些宠物一点都比不上我，我是说速度！1，2，3虚浮！', '主塔后面不补塔，一看就是个麻瓜！', '我真希望能永远在大家身边！T。T'];
// 兔子卖的东西（原图 nshe 的物品栏，analysis/data/shops.json）。药水原图是买下后对塔使用；单人只有一个英雄塔，买下直接用在英雄塔上。
// 没做：天赋秘籍（本复刻没有光环天赋）、重修药水（没有属性点）、许愿点（没有许愿商人）、卖东西 1/20 掉糖果（没有宠物）
const RABBIT_SHOP = [
  { id: 'I00K', key: 'Q', name: '原始之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的原始塔', use: () => rerollSlot('raw') },
  { id: 'I00M', key: 'W', name: '光环之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的光环塔', use: () => rerollSlot('aura') },
  { id: 'I00N', key: 'E', name: '辅助之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的 2 个辅助塔', use: () => rerollSlot('sup') },
  { id: 'I00L', key: 'R', name: '另类之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的另类塔', use: () => rerollSlot('alt') },
  { id: 'I01I', key: 'A', name: '5个木材', ach: 1, gold: 2500, cd: 1, tip: '购买 5 个木材', use: () => { G.wood += 5; msg('木材 +5'); } },
  { id: 'I01U', key: 'S', name: '魔法药水', ach: 2, gold: 4000, cd: 6, hero: true, tip: '英雄塔获得 200 点魔法',
    use: h => { h.mana = Math.min(h.maxMana(), h.mana + 200); msg(`${h.heroName} 魔法 +200`); } },
  { id: 'I02A', key: 'D', name: '知识药水', ach: 3, gold: 2500, cd: 6, hero: true, max: 6, tip: '英雄塔当前成长属性 +7~12 点（每局最多 6 支）',
    use: h => { const v = rint(7, 12); h.stat[h.growth] += v; msg(`${h.heroName} ${statCN(h.growth)} +${v}`); } },
];
function spawnRabbit(by) {
  const lim = BUILD_LIM - 150;
  let x, y;
  do { x = rnd(-lim, lim); y = rnd(-lim, lim); } while (GATE_POS.some(([gx, gy]) => dist2(x, y, gx, gy) < 700 * 700));   // 不刷进出怪口的围栏里
  G.rabbit = { isRabbit: true, id: G.nextId++, x, y, hx: x, hy: y, t0: G.t, until: G.t + RULE.rabbitLife, face: rnd(0, TAU), next: G.t + 1 };
  SFX.ui('hint');
  msg(by ? `${by}召唤了一次兔子，大家快找呀！` : `兔子：${pick(RABBIT_TALK)}`);
  msg(`兔子出现了（小地图上闪烁的粉点），${RULE.rabbitLife} 秒内让守卫者走到它旁边，用当局成就买道具`);
  uiDirty();
}
function rabbitUpdate(dt) {
  const r = G.rabbit; if (!r) return;
  if (G.t >= r.until) {
    FXS.ring(r.x, r.y, 140, '#ff9ad5', 0.5, 4); msg('兔子：咕~');
    if (G.selected === r) G.selected = G.builder;
    G.rabbit = null; uiDirty(); return;
  }
  if (G.t >= r.next) {                                  // 在出生点附近蹦来蹦去
    const a = rnd(0, TAU), d = rnd(0, 180);
    r.tx = r.hx + Math.cos(a) * d; r.ty = r.hy + Math.sin(a) * d; r.next = G.t + rnd(1.5, 3.5);
  }
  if (r.tx != null) {
    const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
    if (d > 4) { const k = Math.min(d, 160 * dt) / d; r.x += dx * k; r.y += dy * k; r.face = Math.atan2(dy, dx); r.moving = true; }
    else r.moving = false;
  }
}
const rabbitNear = () => G.rabbit && dist2(G.builder.x, G.builder.y, G.rabbit.x, G.rabbit.y) <= RULE.rabbitReach ** 2;
// 道具能不能买（兔子和商店共用）：返回不能买的原因，能买返回 null
const itemCdLeft = it => Math.max(0, (G.itemCd[it.id] || 0) - G.t, (it.firstAt || 0) - G.t);
function itemBlock(it) {
  if (it.na) return it.na;
  if (it.inv && !G.inv.includes(null)) return '物品栏已满';
  if (it.hero && !G.hero) return '还没有建造英雄塔';
  if (it.max && (G.buys[it.id] || 0) >= it.max) return `每局最多购买 ${it.max} 支`;
  if (it.firstAt && G.t < it.firstAt) return `开局 ${it.firstAt} 秒后才能购买（还有 ${Math.ceil(it.firstAt - G.t)} 秒）`;
  if (itemCdLeft(it) > 0) return '冷却中';
  if (G.ach < (it.ach || 0)) return '成就不足';
  if (G.gold < (it.gold || 0)) return '金币不足';
  if (G.wood < (it.wood || 0)) return '木材不足';
  return null;
}
function payItem(it) {
  G.ach -= it.ach || 0; G.gold -= it.gold || 0; G.wood -= it.wood || 0;
  G.buys[it.id] = (G.buys[it.id] || 0) + 1; G.itemCd[it.id] = G.t + (it.cd || 0);
  SFX.ui('item');
  uiDirty();
}
function rabbitBlock(it) {
  if (!G.rabbit) return '兔子已经走了';
  if (!rabbitNear()) return `守卫者离兔子太远（要在 ${RULE.rabbitReach} 范围内）`;
  return itemBlock(it);
}
function buyRabbit(it) {
  const why = rabbitBlock(it); if (why) return msg(why);
  if (it.use(G.hero) === false) return;
  payItem(it);
}
// 球：只重新随机建造栏里这一类的格子（辅助之球：新辅助和小辅助两格一起换）
function rerollSlot(cat) {
  const kinds = cat === 'sup' ? ['newsup', 'sup'] : [cat];
  const idx = G.build.map((f, i) => D.towers[f] && kinds.includes(slotOf(f)) ? i : -1).filter(i => i >= 0);
  if (!idx.length) return msg(`建造栏里没有${CAT_CN[cat]}`), false;
  for (const i of idx) {
    const s = slotOf(G.build[i]), all = slotPool(s), pool = all.filter(f => f !== G.build[i]);
    G.build[i] = pick(pool.length ? pool : all);
  }
  if (G.placing && G.placing !== 'hero' && !G.build.includes(G.placing)) G.placing = null;
  msg(`${CAT_CN[cat]}换成了：${idx.map(i => G.build[i]).join('、')}`);
}
// ---------------------------------------------------------------- 商店（地图中央，原图 u00L「商店」，模型是"摇滚阿尔萨斯"）
// 卖的东西按原图 Sellitems：I001,I002,I009,I00A,I00B,I01Y,I028。木材是买下即用的（powerup）；
// 魔力卷轴 / 知识之书 / 天赋卷轴是可使用的道具：买下放进守卫者的物品栏，再对目标使用（施法距离 600 / 600 / 750）。
// 魔力卷轴 / 知识之书只能对英雄塔用（本复刻只有英雄塔有魔法），天赋卷轴要选一座 MAX 光环塔。
// 复制卷轴、收购卷轴的目标是队友的守卫者 / 光环塔，单人模式用不了，只显示
const TALENT_A = { 加速光环: 0.8, 攻击光环: 1.42, 减防光环: -100, 减速光环: -0.7 };   // 基础天赋 = MAX 光环技能升到 2 级（A01F / A007 / A00W / A00V 的 2 级数值）
const SHOP_ITEMS = [
  { id: 'I001', key: 'Q', name: '1个小材', gold: 500, cd: 30, tip: '使用 500 金币购买 1 个木材', use: () => { G.wood += 1; } },
  { id: 'I002', key: 'W', name: '10个木材', gold: 5000, cd: 300, tip: '使用 5000 金币购买 10 个木材', use: () => { G.wood += 10; msg('木材 +10'); } },
  { id: 'I00A', key: 'E', name: '魔力卷轴', gold: 2400, inv: true, range: 600, tip: '对英雄塔使用获得 120 点魔法，对天神塔使用获得 400 点魔法',
    pick: '魔力卷轴：选择英雄塔或天神塔（Esc 取消）', ok: t => t && (t.isHero || t.fam === '天神塔') ? null : '只能对英雄塔或天神塔使用',
    use: t => { if (t.isHero) { t.mana = Math.min(t.maxMana(), t.mana + 120); msg(`${t.heroName} 魔法 +120`); } else { addMana(t, 400); msg('天神塔魔法 +400'); } } },
  { id: 'I028', key: 'R', name: '知识之书', gold: 2200, inv: true, range: 600, tip: '对英雄塔使用，随机一项属性（力量 / 敏捷 / 智力）+10',
    pick: '知识之书：选择英雄塔（Esc 取消）', ok: t => t && t.isHero ? null : '只能对英雄塔使用',
    use: h => { const st = pick(['str', 'agi', 'int']); h.stat[st] += 10; msg(`英雄增加${statCN(st)} 10`); } },
  { id: 'I01Y', key: 'A', name: '天赋卷轴', wood: 15, firstAt: 1200, cd: 300, inv: true, range: 750,
    tip: `激活天赋（原图 A053）：<br>MAX 光环塔：光环升到 2 级（加速 +80% / 攻击 +142% / 减防 -100 / 减速 -70%）<br>大辅助、巫系：技能升到 MAX<br>弹跳塔 MAX：弹跳天赋（MAX 回收后再建弹跳塔，金币 ≥ 58000 时直接变成 MAX）<br>破坏塔 MAX：同时攻击 9 个；通灵塔 MAX：高级通灵；地精塔 MAX：每秒多回 2.5 魔法<br>开局 1200 秒后开放，购买间隔 300 秒`,
    pick: '天赋卷轴：选择一座可以激活天赋的塔（Esc 取消）',
    ok: t => !t || !(t.cat === 'aura' || TALENT_FAMS.has(t.fam)) ? '只能对光环塔、大辅助、巫系、弹跳塔 MAX、破坏塔 / 通灵塔 / 地精塔使用' : !isMax(t) || (t.fam === '弹跳塔' && !t.bmax) ? '要升到 MAX 才能激活天赋' : t.talent ? '该单位已经激活' : null,
    use: t => { t.talent = true; if (t.bmax) G.bounce.talent = true; FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); msg(`${curLevel(t).name}获得了${t.cat === 'aura' ? '基础天赋' : '天赋'}`); } },
  { id: 'I009', key: 'S', name: '复制卷轴', gold: 3000, na: '单人模式没有友军的守卫者可以复制',
    tip: '对一位友军的守卫者使用，获得与其一模一样的建造能力（不保留自身守护神技等级，以后随机建筑需 6 木材）' },
  { id: 'I00B', key: 'D', name: '收购卷轴', gold: 1800, na: '单人模式没有友军的光环塔可以收购',
    tip: '对一个允许收购的友军 1 级光环塔使用，收购这个光环；出售者获得 1500 金币（收购荣誉光环要 10000 金币）' },
];
const shopNear = () => dist2(G.builder.x, G.builder.y, SHOP.x, SHOP.y) <= RULE.shopReach ** 2;
function shopBlock(it) {
  if (!it.na && !shopNear()) return `守卫者离商店太远（要在 ${RULE.shopReach} 范围内）`;
  return itemBlock(it);
}
function buyShop(it) {
  const why = shopBlock(it); if (why) return msg(why);
  if (it.inv) { G.inv[G.inv.indexOf(null)] = it; payItem(it); msg(`${it.name}放进了守卫者的物品栏：选中守卫者，点物品再点目标使用`); return; }
  if (it.use(G.hero) === false) return;
  payItem(it);
}
// ---------------------------------------------------------------- 物品栏（原图守卫者带 6 格单位物品栏 Aiun）
// 点物品 → 选目标 → 守卫者走到施法距离内再使用（和 WC3 对单位使用物品一样），用掉后从物品栏消失
function invPick(i) {
  const it = G.inv[i]; if (!it) return;
  G.pending = 'inv:' + i; G.placing = null; msg(it.pick); uiDirty();
}
function orderUse(i, t, queue) {
  const it = G.inv[i], why = it.ok(t); if (why) return msg(why);
  giveOrder({ kind: 'use', item: it, target: t, x: t.x, y: t.y, reach: it.range }, queue);
}
function useItem(it, t) {
  const i = G.inv.indexOf(it); if (i < 0) return;
  if (!G.towers.includes(t)) return msg('目标已经不在了');
  const why = it.ok(t); if (why) return msg(why);
  it.use(t); G.inv[i] = null; SFX.ui('item'); uiDirty();
}
const TALENT_FAMS = new Set(['弹跳塔', '萨满塔', '兽人塔', '驱逐塔', '缓速塔', '巫医塔', '巫术塔', '巫法塔', '巫魔塔', '破坏塔', '通灵塔', '地精塔']);
const auraAb = t => { const ab = curLevel(t).abils[0]; return ab && t.talent ? { ...ab, A: TALENT_A[t.fam] } : ab; };

// 兔子卷轴（原图守护宗师卖，20 点成就）：额外召唤一次兔子，每局只能 1 次
function rabbitScroll() {
  if (G.rabbitScroll) return msg('召唤失败，每局只能额外召唤一次');
  if (G.rabbit) return msg('兔子已经在场上了');
  if (G.ach < RULE.rabbitScrollAch) return msg('成就不足');
  G.ach -= RULE.rabbitScrollAch; G.rabbitScroll = true;
  spawnRabbit('你');
}

// ---------------------------------------------------------------- 主循环
function step(dt) {
  if (G.phase === 'over' || G.phase === 'win') return;
  G.t += dt;
  // 计时
  G.timer -= dt;
  if (G.timer <= 0) {
    if (G.phase === 'prep') { G.phase = 'run'; startWave(); }
    else if (G.final) return gameOver('300 秒内没有杀死所有龙和魔王');
    else if (G.finalCountdown) startFinal();
    else startWave();
  }
  // 延时事件
  const due = G.timeouts.filter(x => x.at <= G.t);
  G.timeouts = G.timeouts.filter(x => x.at > G.t);
  due.forEach(x => x.fn());
  // 出怪
  for (const s of G.spawners) {
    s.next -= dt;
    while (s.next <= 0 && s.left > 0) { if (G.sc) spawnMonster(G.sc); s.left--; s.next += s.every; }   // 刷的是"当前出怪单位"（原图的 Ul）
  }
  G.spawners = G.spawners.filter(s => s.left > 0);
  builderUpdate(dt);
  rabbitUpdate(dt);
  applyAuras();
  // 塔
  for (const t of G.towers) towerUpdate(t, dt);
  G.towers = G.towers.filter(t => !t.until || t.until > G.t);
  // 区域效果（剑魂、守卫、漩涡、陷阱、恐惧之眼……）
  for (const z of G.zones) {
    const victims = inRange(z.x, z.y, z.r);
    for (const m of victims) { if (z.dps) hurt(m, z.dps * dt, z.atk, z.owner); if (z.each) z.each(m, dt); }
    if (z.tick) z.tick(z, dt);
    if (z.until <= G.t && z.endFn) {
      const e = z.endFn(); aoe(z.owner, z, z.r, e.dmg, e.atk, e.ignore);
    }
  }
  G.zones = G.zones.filter(z => z.until > G.t);
  // 怪物
  for (const m of G.monsters) {
    if (m.dead) continue;
    if (m.until && G.t >= m.until) { m.dead = true; continue; }     // 限时单位到时间消失（不给赏金）
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
  if (G.final && G.final.check && G.final.need.every(m => m.dead)) return victory();
  // 特效
  for (const f of G.fx) f.life -= dt;
  FXS.update(dt);
  G.fx = G.fx.filter(f => f.life > 0);
}
function gameOver(reason) {
  G.phase = 'over'; SFX.end('defeat');
  showModal(`<h2>大家很厉害！很遗憾，还是失败了！</h2><p>${reason}</p>
    <p>到达第 <b>${G.wave}</b> 波 · 击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>
    <div class="row"><button class="primary" id="m-restart">再来一局</button></div>`);
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}
function demoEnd() {
  G.phase = 'win'; SFX.end('victory');
  showModal(`<h2>演示结束</h2><p>撑过了前 ${G.wave} 波。击杀 ${G.kills} · Perfect ${G.perfect} · 剩余 ${Math.floor(G.gold)} 金</p>
    <div class="row"><button class="primary" id="m-again">再演示一次</button><button id="m-restart">回到开始菜单</button></div>`);
  document.getElementById('m-again').onclick = () => { hideModal(); newGame('demo'); resize(); clampCam(); uiDirty(); };
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}
function victory() {
  G.phase = 'win'; SFX.end('victory');
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
  if (!IMG[key]) {
    const i = new Image(); i.src = 'assets/' + src; IMG[key] = i;
    // 命令面板只在命令变了时才重建，开局那一次往往图标还没下载完、用了 SVG 占位；原版图标到了就重画一次
    if (/^(ico|icon):/.test(key)) i.onload = () => { if (G) uiDirty(); };
  }
  return IMG[key].complete && IMG[key].naturalWidth ? IMG[key] : null;
}
for (const k in AM.sprites || {}) img(k);            // 图标和头像先加载好，第一次打开面板就有图
const spriteKey = e => e.isShop ? 'shop' : e.isRabbit ? 'rabbit' : e.isBuilder ? 'builder' : e.isHero ? 'hero:' + e.heroName : e.uid ? 'unit:' + e.uid : e.fam ? 'tower:' + e.fam + ':' + (e.lv + 1) : null;
function entityImg(e) {
  const k = spriteKey(e); if (!k) return null;
  return img(k) || (e.fam && !e.isHero && img('tower:' + e.fam));
}

// ================================================================ 精灵表（tools/blender/render_sprites.py 出图 → tools/register_sprites.py 登记）
const SHEETS = window.SPRITE_SHEETS || {};
const SHEET_IMG = {}, TINT_CACHE = {};
// 原版模型：同一模型的单位共用一张图，单位数据里的 red/green/blue 乘到图上（和 WC3 的顶点颜色一样）。
// 只用合成模式、不读像素，用 file:// 打开也能用；每种"图 + 颜色"只做一次
function tinted(im, c) {
  const id = im.src + '|' + c.join(',');
  let cv = TINT_CACHE[id];
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${c.map(v => Math.round(v * 255)).join(',')})`; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
    TINT_CACHE[id] = cv;
  }
  return cv;
}
function sheetByKey(key) {
  const m = SHEETS[key]; if (!m) return null;
  let im = SHEET_IMG[m.src];
  if (!im) { im = new Image(); im.src = 'assets/' + m.src; SHEET_IMG[m.src] = im; }
  if (!(im.complete && im.naturalWidth)) return null;
  return { m, im: m.tint ? tinted(im, m.tint) : im };
}
// 塔的档位外观：tower:魔幻塔:3 表示"从第 3 级起用"；找不超过当前等级的最高一档，没有就用基础外观
function towerSheet(fam, lv) {
  for (let l = lv; l >= 2; l--) if (SHEETS['tower:' + fam + ':' + l]) { const s = sheetByKey('tower:' + fam + ':' + l); if (s) return s; }
  return sheetByKey('tower:' + fam);
}
function sheetOf(e) {
  if (!e) return null;
  if (e.isBuilder) return sheetByKey('builder');
  if (e.isShop) return sheetByKey('shop');
  if (e.isHero) return sheetByKey('hero:' + e.heroName);
  if (e.uid) return sheetByKey('unit:' + e.uid);
  if (e.fam && e.cat !== 'summon') return towerSheet(e.fam, e.lv + 1);
  return null;
}
// 实体对应的精灵表登记（不管图片加载没有）：3D 模型按它找 MDX、算缩放和动作时长
function metaOf(e) {
  if (!e) return null;
  if (e.isBuilder) return SHEETS.builder;
  if (e.isShop) return SHEETS.shop;
  if (e.isHero) return SHEETS['hero:' + e.heroName];
  if (e.uid) return SHEETS['unit:' + e.uid];
  if (e.fam && e.cat !== 'summon') {
    for (let l = e.lv + 1; l >= 2; l--) if (SHEETS['tower:' + e.fam + ':' + l]) return SHEETS['tower:' + e.fam + ':' + l];
    return SHEETS['tower:' + e.fam];
  }
  return null;
}
// ---------------------------------------------------------------- 实时 3D（units3d.js）：魔兽原版模型，拉近了也清楚；画不了时调用方退回精灵图
const U3 = window.Units3D && window.Units3D.create(document.getElementById('gl3d'), SHEETS);
// 打开页面就按出场顺序（waves.js 里第 1 波 → 最终波）在后台预载怪物模型（没有原版模型的预载精灵图），
// 不然每种怪第一次出场时还在下载，那几帧只能画成色块圆点
{
  const order = new Set();
  for (const f of Object.values(WR.fns)) for (const r of f.rows) for (const e of r.ev) if (e[1] === 'sc' || e[1] === 'mk') order.add(e[2]);
  for (const id of Object.keys(D.units)) order.add(id);
  for (const id of order) {
    const m = SHEETS['unit:' + id]; if (!m) continue;
    if (U3 && m.war3) U3.ready(m); else sheetByKey('unit:' + id);
  }
}
const GHOST = {};                                     // 建造预览的虚影（固定一个实例）
// key：哪个 3D 实例（实体本身，或尸体特效）；ent：用来定队伍颜色的实体（怪物属于玩家 12，棕色）
function model3d(key, m, x, y, face, anim, scaleMul = 1, alpha = 1, ent = key) {
  if (!U3 || !m) return false;
  if (!((m.actions[anim[0]] || {}).dirs > 1)) face = null;       // 精灵图只有一个方向的（塔、建筑）：模型也固定朝南，不跟着攻击方向转
  return U3.put(key, m, x, y, face ?? -Math.PI / 2, anim, G.t, { scale: scaleMul, alpha, team: ent.uid ? 11 : 0 });
}
// 精灵图画出来的顶部再往下 30%（放血条），3D 模型按同样的框算
function sheetTop(m, y, scaleMul = 1) {
  const h = m.frameH * m.unitsPerPixel * scaleMul * (m.anchor[1] - 0.3);           // 精灵图里锚点以上的高度（50° 俯视下的屏幕长度）
  return CAM ? sy(y, h * 1.25) : sy(y) - h * S;                                      // 3D：换成离地高度（÷cos50° 再扣掉身体前后的厚度）
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
  return ((e.isHero || e.isBuilder) && once('spell', e.spellT)) || once('attack', e.atkT) || (e.isBuilder && (A.build && e.buildT != null && G.t - e.buildT < 1.2) && ['build', e.buildT])
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
  const k = kAt(y), w = fw * m.unitsPerPixel * k * scaleMul, h = fh * m.unitsPerPixel * k * scaleMul;
  const px = sx(x, y) - w * m.anchor[0], py = sy(y) - h * m.anchor[1];
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, fx, fy, fw, fh, px, py, w, h);
  const gl = m.war3 && !m.glow && sheetByKey('glow:' + m.key);    // 模型自带的叠加发光层（光效表，tools/war3_batch.py），用 lighter 叠上去
  if (gl) { ctx.globalCompositeOperation = 'lighter'; drawSheet(gl, e, x, y, anim, scaleMul, alpha); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
  return py + h * 0.3;
}
function shadow(x, y, r) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx(x, y), sy(y), r, r * (CAM ? CAM.s * 0.75 : 0.45), 0, 0, 7); ctx.fill(); }
// 用精灵表第一帧做头像/图标（CSS 背景裁切）
function sheetThumb(sh, px) {
  if (!sh) return null;
  const { m } = sh, a = m.actions.idle || m.actions.walk || Object.values(m.actions)[0];
  const k = px / m.frameW * 1.4;                 // 放大一点，主体更饱满
  const fx = 0, fy = a.row * m.frameH;
  const ox = -fx * k - (m.frameW * k - px) / 2, oy = -fy * k - (m.frameH * k * m.anchor[1] - px * 0.82);
  return `background:#0b0f0b url('assets/${m.src}') ${ox}px ${oy}px / ${m.cols * m.frameW * k}px ${m.rows * m.frameH * k}px no-repeat`;
}

// 左上角快捷按钮：有原版头像图标（manifest 的 portrait:xxx）就用图标，同原版英雄按钮；
// 没有就用模型正面（idle 第 1 帧，朝南）的头肩特写：先按不透明像素求出模型的包围盒再裁切，不同体型的模型都能把头部放在中间；
// 用 file:// 打开时画布读不了像素，就退回按锚点估算的固定裁切。
const QT_DONE = new WeakMap();
function quickThumb(btn, key) {
  if (QT_DONE.get(btn) === key) return;
  if (AM.sprites && AM.sprites['portrait:' + key]) {
    const ic = img('portrait:' + key); if (!ic) return;           // 图标还在加载，下一帧再画
    let cv = btn.querySelector('canvas.qt');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'qt'; btn.prepend(cv); }
    const px = Math.round(btn.clientWidth * (window.devicePixelRatio || 1)) || 92;
    cv.width = cv.height = px;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(ic, 0, 0, px, px);
    btn.classList.add('has-thumb'); QT_DONE.set(btn, key);
    return;
  }
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
// 三层画布：#cv 地面（地块、阴影、选中圈、光环）→ #gl3d 单位的 3D 模型（units3d.js）→ #ov 界面（血条、特效、投射物、建造预览）。
// 画图函数都画在 ctx 上，draw() 里按层切换它
const cv = document.getElementById('cv'), gctx = cv.getContext('2d'), ov = document.getElementById('ov'), octx = ov.getContext('2d');
let ctx = gctx;
function onTop(fn) { const c = ctx; ctx = octx; fn(); ctx = c; }
const mm = document.getElementById('minimap'), mctx = mm.getContext('2d');
let S = 0.05, BASE = 0.05, DPR = 1, W = 0, H = 0;
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  W = cv.width = ov.width = Math.max(1, r.width * DPR); H = cv.height = ov.height = Math.max(1, r.height * DPR);
  BASE = Math.min(W, H) / (WORLD * 2 + 300);
  const mr = mm.getBoundingClientRect();
  mm.width = Math.max(1, mr.width * DPR); mm.height = Math.max(1, mr.height * DPR);
  if (G) clampCam();
}
function clampCam() {
  const c = G.cam; c.zoom = clamp(c.zoom, ZMIN, ZMAX); S = BASE * c.zoom;
  const hw = W / 2 / S, hh = H / 2 / S, lim = WORLD + 150;
  c.x = hw >= lim ? 0 : clamp(c.x, -lim + hw, lim - hw);
  // 往南拉的极限按真正看得到的下边缘算：桌面上底部控制台盖在地图上（藤蔓之下的实心部分挡住了），3D 时近处看到的地面也比平面画法短。
  // 和魔兽一样让镜头能多往南走一点，下边两个角的出怪口才露得出来
  camera();
  const r = cv.getBoundingClientRect(), cr = $('console').getBoundingClientRect();
  const dn = Math.min(hh, c.y - groundAt(W / 2 / DPR, Math.min(r.height, cr.top - r.top + cr.height * 60 / 342))[1]);
  const lo = -lim + dn, hi = lim - hh;
  c.y = lo > hi ? (lo + hi) / 2 : clamp(c.y, lo, hi);
  camera();
}
// ---------------------------------------------------------------- 3D 镜头（有 WebGL 时）：和魔兽一样的透视相机，镜头朝北
// 魔兽的默认镜头：距离 1650、俯角 56°（Angle of Attack 304°）、视野 70°（4:3 画面的水平视野，换成竖直约 55°）。
// 这里滚轮拉远时俯角变大、接近俯视（方便看全图），拉到最近正好是魔兽的标准镜头；镜头注视点 = G.cam.x / y，
// 注视点处每世界单位的像素数 = S（和原来的平面画法一样，所以缩放档位、平移速度都不用改）。
// 没有 WebGL（U3 为空）时退回原来的正上方平面：sx / sy 就是线性换算，k(y) = S。
const ZMIN = 1, ZMAX = 6, FOVY = 2 * Math.atan(Math.tan(35 * Math.PI / 180) * 0.75);
const PITCH_FAR = 82, PITCH_NEAR = 56;
const camPitch = zoom => (PITCH_FAR - (PITCH_FAR - PITCH_NEAR) * Math.pow(Math.log(zoom / ZMIN) / Math.log(ZMAX / ZMIN), 1.4)) * Math.PI / 180;
let CAM = null;                                       // { ex, ey, ez, c, s, F, d }：眼睛位置、俯角的 cos / sin、焦距（像素）、到注视点的距离
function camera() {
  if (!U3 || !G) { CAM = null; return; }
  const ph = camPitch(G.cam.zoom), F = H / 2 / Math.tan(FOVY / 2), d = F / S, c = Math.cos(ph), s = Math.sin(ph);
  CAM = { ex: G.cam.x, ey: G.cam.y - d * c, ez: d * s, c, s, F, d, pitch: ph };
}
// 世界 → 屏幕（设备像素）。镜头不转向，所以屏幕 y 只和 (y, z) 有关；x 还和 y、z 有关（越远越往中间收）
const camZ = (y, z) => (y - CAM.ey) * CAM.c - (z - CAM.ez) * CAM.s;          // 沿视线的深度
const sx = (x, y = G.cam.y, z = 0) => CAM ? W / 2 + (x - G.cam.x) * CAM.F / camZ(y, z) : W / 2 + (x - G.cam.x) * S;
const sy = (y, z = 0) => CAM ? H / 2 - ((y - CAM.ey) * CAM.s + (z - CAM.ez) * CAM.c) * CAM.F / camZ(y, z) : H / 2 - (y - G.cam.y) * S - z * 0.64 * S;
const kAt = (y, z = 0) => CAM ? CAM.F / camZ(y, z) : S;                      // y 处每世界单位的像素数（横向）
// 地面上南北方向在屏幕上的压缩比（俯视 = 1）。2D 时用各处原来的压扁系数 c2d
const qAt = (y, c2d) => { if (!CAM) return c2d; const zc = camZ(y, 0), yc = (y - CAM.ey) * CAM.s - CAM.ez * CAM.c; return (CAM.s * zc - CAM.c * yc) / zc; };
// 屏幕（CSS 像素）→ 地面：视线和 z = 0 的交点。wy 只和屏幕 y 有关，wx 两个都要
function groundAt(px, py) {
  if (!CAM) return [(px * DPR - W / 2) / S + G.cam.x, G.cam.y - (py * DPR - H / 2) / S];
  const a = (px * DPR - W / 2) / CAM.F, b = -(py * DPR - H / 2) / CAM.F;
  const dy = CAM.c + b * CAM.s, dz = -CAM.s + b * CAM.c, t = CAM.ez / Math.max(1e-3, -dz);   // 视线方向 = 前 + a·右 + b·上
  return [G.cam.x + a * t, CAM.ey + dy * t];
}
const wx = (px, py) => groundAt(px, py)[0], wy = py => groundAt(W / 2 / DPR, py)[1];
// 地面上的圆 / 多边形（世界坐标）投影成屏幕路径：3D 时每条边按透视算，2D 时就是原样
function gpath(pts) {
  const y0 = CAM ? CAM.ey + CAM.d * 0.1 : -Infinity;          // 跑到镜头背后的点压回镜头前面，不然投影会翻过来
  ctx.beginPath(); pts.forEach(([x, y], i) => { y = Math.max(y, y0); ctx[i ? 'lineTo' : 'moveTo'](sx(x, y), sy(y)); }); ctx.closePath();
}
// (x, y) 附近 pad 世界单位内有没有东西在画面里（3D 时镜头背后的一律不算）。画面外的单位不画，免得投影出错
function onScr(x, y, pad = 300) {
  if (CAM && camZ(y, 0) < CAM.d * 0.1) return false;
  const k = kAt(y), X = sx(x, y), Y = sy(y);
  return X > -pad * k && X < W + pad * k && Y > -pad * k * 1.5 && Y < H + pad * k;
}
function gcircle(x, y, r, n = 56) {
  if (!CAM) { ctx.beginPath(); ctx.arc(sx(x), sy(y), r * S, 0, 7); return; }
  gpath(Array.from({ length: n }, (_, i) => [x + r * Math.cos(i * 2 * Math.PI / n), y + r * Math.sin(i * 2 * Math.PI / n)]));
}
const grect = (x, y, hw, hh = hw) => gpath([[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh]]);
// 看得见的地面范围（世界坐标的框）：屏幕四角打到地面上的点
function footprint() {
  const w = W / DPR, h = H / DPR, P = [groundAt(0, 0), groundAt(w, 0), groundAt(0, h), groundAt(w, h)];
  return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
}
function centerOn(e) { zoomTo = null; G.cam.x = e.x; G.cam.y = e.y; clampCam(); }

// ================================================================ 渲染
let mouse = null, HOV = null;
const TER = window.Terrain.create({ world: WORLD, roadSegs: ROAD_SEGS, roadHalf: ROAD_HALF, spawns: GATE_POS, center: [0, 0] });
// 3D 时树墙用原版树模型（tools/war3_terrain.py 的 TREES：哪种树用哪个模型的第几个变体，费伍德树是灰谷树换贴图）
const TREE_MDX = {
  ATtr: ['doodads/terrain/ashentree/ashentree', [0, 3, 6]], CTtr: ['doodads/terrain/ashentree/ashentree', [1, 4], ['ashentree.blp', 'felwoodtree.blp']],
  VTlt: ['doodads/terrain/lordaerontree/lordaerontree', [0, 1, 2, 3]], ZTtw: ['doodads/terrain/ruinstree/ruinstree', [0, 2, 4]],
};
const TREES3D = !!(U3 && TER.trees.length);
if (TREES3D) {
  const list = window.W3_TERRAIN.trees.list;
  for (const o of TER.trees) {
    const [mdl, vs, retex] = TREE_MDX[o.t.id], v = vs[list.filter(t => t.id === o.t.id).indexOf(o.t)] ?? vs[0];
    U3.doodad(`${mdl}${v}.mdx`, o.x, o.y, (o.flip ? Math.PI : 0) + (o.x * 7 + o.y * 13) % 1.2 - 0.6, o.s, retex);
  }
}
function draw() {
  clampCam();
  const view = { W, H, S, cx: G.cam.x, cy: G.cam.y }, now = performance.now() / 1000;
  if (CAM) Object.assign(view, { sx, sy, k: kAt, q: y => qAt(y, 1), footprint, camY: CAM.ey, vis: onScr,
    cam: { eye: [CAM.ex, CAM.ey, CAM.ez], target: [G.cam.x, G.cam.y, 0], fovy: FOVY, near: Math.max(20, CAM.d * 0.05), far: CAM.d * 8 + 6000 } });
  ctx = gctx; octx.clearRect(0, 0, W, H);
  if (CAM) gctx.clearRect(0, 0, W, H);            // 3D：地面画布是透明的贴地层，地块在 GL 里画
  if (U3) U3.frame(view, TER.glSource());
  TER.drawGround(ctx, view, now);                 // 原版地块铺的地面、中央法阵、出怪口（terrain.js）
  GATE_POS.forEach(([x, y], k) => label(k ? '出怪口（联机）' : '出怪口', x, y + 300, k ? '#c9a39e' : '#ffb0a8', 12));
  for (const z of G.zones) if (z.style !== 'bladestorm') { ctx.fillStyle = z.color || 'rgba(122,184,255,.18)'; gcircle(z.x, z.y, z.r); ctx.fill(); }
  for (const z of G.zones) if (z.style === 'bladestorm') drawBladestormGround(z);
  for (const t of G.towers) if (t.cat === 'aura') { t.m3 = auraModel(t); if (!t.m3) drawAuraGround(t, now); }   // 光环塔：原版光环模型，画不了才程序绘制地面光环
  for (const t of G.towers) if (t.cat !== 'aura' && t.cat !== 'summon' && !t.isHero) drawTierGround(t, now);   // 塔的等级光圈
  // 选中范围
  const sel = G.selected;
  if (sel && sel.fam) rangeCircle(sel.x, sel.y, sel.cat === 'aura' ? (curLevel(sel).abils[0] || {}).area || 900 : towerStats(sel).range, 'rgba(255,255,255,.35)');
  // 守卫者的移动/建造目标
  const b = G.builder;
  if (b.order) {
    ctx.strokeStyle = b.order.kind === 'build' ? 'rgba(255,210,87,.7)' : 'rgba(111,209,122,.7)'; ctx.lineWidth = 1.5 * DPR; ctx.setLineDash([5 * DPR, 5 * DPR]);
    ctx.beginPath(); ctx.moveTo(sx(b.x, b.y), sy(b.y)); ctx.lineTo(sx(b.order.x, b.order.y), sy(b.order.y)); ctx.stroke(); ctx.setLineDash([]);
    if (b.order.kind === 'build') { ctx.strokeStyle = 'rgba(255,210,87,.8)'; footRect(b.order.x, b.order.y); ctx.stroke(); }
  }
  if (b.queue && b.queue.length) {
    let px = b.order ? b.order.x : b.x, py = b.order ? b.order.y : b.y;
    ctx.strokeStyle = 'rgba(255,210,87,.45)'; ctx.setLineDash([4 * DPR, 6 * DPR]); ctx.beginPath(); ctx.moveTo(sx(px, py), sy(py));
    for (const q of b.queue) { ctx.lineTo(sx(q.x, q.y), sy(q.y)); if (q.kind === 'build') { ctx.stroke(); footRect(q.x, q.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx(q.x, q.y), sy(q.y)); } }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (!TREES3D) TER.drawTrees(ctx, view);
  HOV = hovered();
  drawShop();
  for (const t of G.towers) drawTower(t);
  for (const m of G.monsters) drawMonster(m);
  drawBuilder(b);
  if (G.rabbit) drawRabbit(G.rabbit);
  for (const z of G.zones) if (z.style === 'bladestorm') drawBladestormSpirit(z);
  ctx = octx;                                     // 往下是界面层（盖在 3D 模型上面）
  for (const f of G.fx) {
    ctx.globalAlpha = f.kind === 'corpse' ? 1 : clamp(f.life * 4, 0, 1);
    if (f.kind === 'line') { ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 1.5) * DPR; ctx.beginPath(); ctx.moveTo(sx(f.x1, f.y1), sy(f.y1)); ctx.lineTo(sx(f.x2, f.y2), sy(f.y2)); ctx.stroke(); }
    if (f.kind === 'ring') { ctx.strokeStyle = f.color; ctx.lineWidth = 2 * DPR; gcircle(f.x, f.y, f.r); ctx.stroke(); }
    if (f.kind === 'mark') {
      const k = clamp(f.life / 0.6, 0, 1), px = sx(f.x, f.y), py = sy(f.y), d = (8 + 26 * k) * DPR, a = 6 * DPR, q = qAt(f.y, 0.55);
      ctx.fillStyle = f.color; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1 * DPR;
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + Math.PI / 4, ux = Math.cos(ang), uy = Math.sin(ang) * q;
        const tx = px + ux * d, ty = py + uy * d;           // 箭头尖朝向中心
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ux * a * 1.6 - uy * a, ty + uy * a * 1.6 + ux * a * 0.55); ctx.lineTo(tx + ux * a * 1.6 + uy * a, ty + uy * a * 1.6 - ux * a * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.5 * DPR; ctx.beginPath(); ctx.ellipse(px, py, d * 0.8, d * 0.8 * q, 0, 0, 7); ctx.stroke();
    }
    if (f.kind === 'corpse') {
      const m3 = metaOf(f.ent), a = m3 && m3.actions.death;
      if (a) {
        const done = G.t - f.t0 >= a.frames / a.fps, anim = ['death', f.t0, done], k = f.ent.elite ? 1.3 : 1, al = done ? clamp(f.life, 0, 1) : 1;
        if (!model3d(f, m3, f.x, f.y, f.ent.face, anim, k, al, f.ent)) { const sh = sheetOf(f.ent); if (sh) drawSheet(sh, f.ent, f.x, f.y, anim, k, al); }
      }
    }
    if (f.kind === 'death') { ctx.fillStyle = f.color; gcircle(f.x, f.y, f.r * (1.6 - f.life), 24); ctx.fill(); }
    if (f.kind === 'text') label(f.text, f.x, f.y + 120 + (0.7 - f.life) * 300, f.color, 12);
    ctx.globalAlpha = 1;
  }
  FXS.draw(ctx, view);
  // 建造预览（贴地的范围圈、格子画在地面层，3D 时在模型下面）
  if (G.placing && mouse) {
    ctx = gctx;
    const x = snap(wx(mouse.x, mouse.y)), y = snap(wy(mouse.y)), ok = canPlace(x, y, true);
    const fam = G.placing;
    const range = fam === 'hero' ? D.heroes[G.heroChoice].range : (D.towers[fam].cat === 'aura' ? (D.towers[fam].levels[0].abils[0] || {}).area || 900 : D.towers[fam].levels[0].range);
    const col = ok ? '#6fd17a' : '#ff5a4f';
    rangeCircle(x, y, range, col, 0.08);
    drawBuildGrid(x, y);
    // 占地 3×3 格：每格单独标绿 / 红（和魔兽一样，一眼看出是哪一格挡住了）
    for (const [cx, cy] of footCells(x, y)) {
      const good = cellBuildable(cx, cy) && !cellTaken(cx, cy, true);
      ctx.fillStyle = good ? 'rgba(111,209,122,.38)' : 'rgba(255,90,79,.45)';
      grect(cx, cy, CELL / 2 - 1 / kAt(cy)); ctx.fill();
    }
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 * DPR; ctx.strokeStyle = col; ctx.lineWidth = 2 * DPR;
    footRect(x, y); ctx.stroke(); ctx.restore();
    const gm = fam === 'hero' ? SHEETS['hero:' + G.heroChoice] : D.towers[fam].cat === 'aura' ? null : SHEETS['tower:' + fam];   // 光环塔没有建筑，只有地面光环
    const ganim = gm && [Object.keys(gm.actions)[0], G.t];
    if (gm && !model3d(GHOST, gm, x, y, -Math.PI / 2, ganim, 1, ok ? 0.6 : 0.35)) {
      const gsh = fam === 'hero' ? sheetByKey('hero:' + G.heroChoice) : towerSheet(fam, 1);
      if (gsh) drawSheet(gsh, { face: -Math.PI / 2 }, x, y, ganim, 1, ok ? 0.6 : 0.35);
    }
    ctx = octx;
  }
  if (G.pending && mouse) { label(G.pending === 'blink' ? '闪烁到这里' : G.pending.startsWith('xfer:') ? '把魔法转给这座弹跳塔' : G.pending.startsWith('item:') ? '对这里的光环塔使用' : '移动到这里', wx(mouse.x, mouse.y), wy(mouse.y) + 90, '#c8f5c8', 12); }
  TER.drawOverlay(ctx, view);
  ctx = gctx;
  if (U3) { U3.render(G.t - (draw.lastT ?? G.t), gctx.canvas); draw.lastT = G.t; }
  drawMinimap();
}
const snap = v => Math.round(v / CELL) * CELL;
// 塔的占地方框（世界坐标 → 屏幕路径）
function footRect(x, y) { grect(x, y, FOOT_HALF); }
// 建造时在光标附近显示可建造的格子（只画能建的格，越远越淡）
function drawBuildGrid(x, y) {
  const R = 9;
  if (CELL * kAt(y) < 5 * DPR) return;
  ctx.save(); ctx.lineWidth = 1 * DPR;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const d = Math.hypot(i, j) / R; if (d > 1) continue;
    const cx = x + i * CELL, cy = y + j * CELL;
    if (!cellBuildable(cx, cy)) continue;
    const taken = cellTaken(cx, cy, true);
    ctx.strokeStyle = taken ? `rgba(255,120,100,${0.35 * (1 - d)})` : `rgba(190,255,190,${0.45 * (1 - d)})`;
    grect(cx, cy, CELL / 2 - 0.5 / kAt(cy)); ctx.stroke();
  }
  ctx.restore();
}
function rangeCircle(x, y, r, c, fill = 0.07) {
  gcircle(x, y, r, 96);
  ctx.globalAlpha = fill; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = c; ctx.lineWidth = 1.5 * DPR; ctx.stroke();
}
function label(text, x, y, color, size) {
  if (!onScr(x, y, 100)) return;
  ctx.font = `${size * DPR}px -apple-system,"PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * DPR; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, sx(x, y), sy(y)); ctx.fillStyle = color; ctx.fillText(text, sx(x, y), sy(y));
}
function selRing(x, y, r, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = color; ctx.shadowBlur = 8 * DPR;
  const q = CAM ? CAM.s : 0.55 / 1.15, dy = CAM ? 0 : r * 0.35;              // 3D：圈就在脚下，按俯角压扁
  ctx.strokeStyle = color; ctx.lineWidth = 2.2 * DPR; ctx.beginPath(); ctx.ellipse(x, y + dy, r * 1.15, r * 1.15 * q, 0, 0, 7); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = alpha * 0.18; ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
// ---------------------------------------------------------------- 剑刃风暴：剑魂
// 原图：在被攻击的目标处召唤剑魂（n05F，1.5 倍的剑圣，带"幽灵"所以半透明）施放旋风斩，持续 5 秒；
// 风暴镜像召唤的小剑魂（n05E）是 0.6 倍。精灵图是原版剑圣模型的旋风斩动作（tools/war3_batch.py 的 fx:bladestorm）
function bsFade(z) { return clamp(Math.min((G.t - z.t0) / 0.25, (z.until - G.t) / 0.3), 0, 1); }
function drawBladestormGround(z) { if (onScr(z.x, z.y, 400)) shadow(z.x, z.y, z.r * 0.18 * kAt(z.y) * (z.r >= 300 ? 1 : 0.5)); }
function drawBladestormSpirit(z) {
  if (!onScr(z.x, z.y, 400)) return;
  const k = z.r >= 300 ? 1 : 0.6 / 1.5, fade = bsFade(z);
  if (model3d(z, SHEETS['fx:bladestorm'], z.x, z.y, -Math.PI / 2, ['spin', z.t0], k, 0.62 * fade)) return;
  const sh = sheetByKey('fx:bladestorm'); if (!sh) return;
  drawSheet(sh, { face: -Math.PI / 2 }, z.x, z.y, ['spin', z.t0], k, 0.62 * fade);   // 旋风 + 红光是模型的叠加层，drawSheet 自动叠光效表
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
    c = document.createElement('canvas'); c.width = sh.im.naturalWidth || sh.im.width; c.height = sh.im.naturalHeight || sh.im.height;
    const g = c.getContext('2d'); g.drawImage(sh.im, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = amount; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    TINTED.set(key, c);
  }
  return { m: sh.m, im: c };
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function drawTierGround(t, now) {                    // 底座下的光圈：档位越高越亮、越多层
  if (!onScr(t.x, t.y, 300)) return;
  const K = kAt(t.y);
  const tier = towerTier(t); if (!tier) return;
  const col = TIER[tier].color, px = sx(t.x, t.y), py = sy(t.y), R = (FOOT_HALF + 10) * K, pulse = 0.75 + 0.25 * Math.sin(now * 2.4 + t.id);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(px, py, R * 0.2, px, py, R);
  g.addColorStop(0, hexA(col, 0.32 * pulse)); g.addColorStop(0.7, hexA(col, 0.12 * pulse)); g.addColorStop(1, hexA(col, 0));
  const sq = qAt(t.y, 0.62);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, R, R * sq, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = hexA(col, 0.55 * pulse); ctx.lineWidth = Math.max(1, 3 * K * 4);
  for (let k = 0; k < Math.min(tier, 3); k++) {      // 1~3 圈旋转的虚线符文环
    const r = R * (0.62 + k * 0.16); ctx.setLineDash([r * 0.18, r * 0.12]); ctx.lineDashOffset = (k % 2 ? 1 : -1) * now * 30 * DPR;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * sq, 0, 0, 7); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.restore();
}
function drawTierTop(t, tier, now) {                 // 3 档起：往上飘的光点；满级：头顶光晕 + 光芒
  const K = kAt(t.y);
  const col = TIER[tier].color, px = sx(t.x, t.y), py = sy(t.y), k = K * 4;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const n = tier === 4 ? 10 : 5;
  for (let i = 0; i < n; i++) {
    const ph = (now * 0.45 + i / n + t.id * 0.13) % 1, a = i * 2.39 + t.id;
    const ox = Math.cos(a) * 70 * K, oy = -ph * 200 * K, r = Math.max(1.2, (5 - ph * 3) * k * 0.35);
    ctx.fillStyle = hexA(col, (1 - ph) * 0.9); ctx.beginPath(); ctx.arc(px + ox, py + oy - 20 * K, r, 0, 7); ctx.fill();
  }
  if (tier === 4) {
    const hy = py - 230 * K, hr = 60 * K;
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
// 原图光环塔单位的模型就是光环特效本身（units 表的 file），每级 modelScale 变大：
// 加速 = 荆棘光环（h01V…h010），攻击 = 专注光环（h00I…h00P），减防 = 吸血光环（h00G…h01X），减速 = 强击光环（h01W…h01U）
// 3D 时直接画这几个原版模型；没有 WebGL / 没导出 assets/w3/ 时退回下面的程序绘制
const AURA_MDX = {
  加速光环: ['abilities/spells/nightelf/thornsaura/thornsaura.mdx', [1, 1.2, 1.4, 1.6, 1.8, 2]],
  攻击光环: ['abilities/spells/human/devotionaura/devotionaura.mdx', [1.3, 1.45, 1.6, 1.75, 1.9, 2.2]],
  减防光环: ['abilities/spells/undead/vampiricaura/vampiricaura.mdx', [0.8, 0.95, 1.1, 1.25, 1.4, 1.55]],
  减速光环: ['abilities/spells/nightelf/trueshotaura/trueshotaura.mdx', [1, 1.2, 1.4, 1.6, 1.8, 2]],
};
if (U3) [...Object.values(AURA_MDX).map(a => a[0]), FOD.mdx].forEach(U3.preload);
function auraModel(t) {
  const a = AURA_MDX[t.fam];
  return !!(U3 && a && U3.putModel(t, a[0], t.x, t.y, a[1][Math.min(t.lv, a[1].length - 1)]));
}
function auraGlyph(kind, g, r) {
  g.beginPath();
  if (kind === 'arrow') { g.moveTo(-r, -r * 0.6); g.lineTo(r * 0.4, 0); g.lineTo(-r, r * 0.6); g.moveTo(-r * 0.2, -r * 0.6); g.lineTo(r, 0); g.lineTo(-r * 0.2, r * 0.6); }
  else if (kind === 'blade') { g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(r * 0.55, -r * 0.35); g.lineTo(r, 0); g.lineTo(r * 0.55, r * 0.35); g.moveTo(-r * 0.6, -r * 0.4); g.lineTo(-r * 0.6, r * 0.4); }
  else if (kind === 'crack') { g.moveTo(-r * 0.7, -r); g.lineTo(r * 0.7, -r); g.lineTo(r * 0.7, 0); g.lineTo(0, r); g.lineTo(-r * 0.7, 0); g.closePath(); g.moveTo(-r * 0.1, -r); g.lineTo(r * 0.15, -r * 0.3); g.lineTo(-r * 0.15, r * 0.2); g.lineTo(r * 0.05, r * 0.8); }
  else { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); } }
  g.stroke();
}
function drawAuraGround(t, now) {
  if (!onScr(t.x, t.y, ((curLevel(t).abils || [])[0] || {}).area || 900)) return;
  const K = kAt(t.y);
  const L = AURA_LOOK[t.fam] || AURA_LOOK.攻击光环, lvl = auraLevel(t), px = sx(t.x, t.y), py = sy(t.y);
  const R = (FOOT_HALF + 20) * K * (1 + lvl * 0.25), pulse = 0.8 + 0.2 * Math.sin(now * 2 + t.id), sq = qAt(t.y, 0.62);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // 作用范围：每 3 秒一圈很淡的波纹扩散到范围边缘
  const area = ((curLevel(t).abils || [])[0] || {}).area || 900, ph = (now / 3 + t.id * 0.17) % 1;
  ctx.strokeStyle = hexA(L.c1, 0.22 * (1 - ph)); ctx.lineWidth = Math.max(1, 6 * K * (1 - ph) + 1);
  if (CAM) gcircle(t.x, t.y, area * ph, 72); else { ctx.beginPath(); ctx.ellipse(px, py, area * K * ph, area * K * ph * sq, 0, 0, 7); }
  ctx.stroke();
  // 底光
  const g = ctx.createRadialGradient(px, py, 0, px, py, R * 1.15);
  g.addColorStop(0, hexA(L.c2, 0.35 * pulse)); g.addColorStop(0.5, hexA(L.c1, 0.22 * pulse)); g.addColorStop(1, hexA(L.c1, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, R * 1.15, R * 1.15 * sq, 0, 0, 7); ctx.fill();
  // 外圈 + 内圈（等级越高圈越多）
  ctx.strokeStyle = hexA(L.c1, 0.85 * pulse); ctx.lineWidth = Math.max(1.2, 9 * K);
  ctx.beginPath(); ctx.ellipse(px, py, R, R * sq, 0, 0, 7); ctx.stroke();
  const rings = 1 + Math.round(lvl * 2);
  for (let k = 1; k <= rings; k++) {
    const r = R * (1 - k * 0.2); ctx.lineWidth = Math.max(1, 5 * K); ctx.strokeStyle = hexA(k % 2 ? L.c2 : L.c1, 0.6 * pulse);
    ctx.setLineDash([r * 0.22, r * 0.1]); ctx.lineDashOffset = (k % 2 ? -1 : 1) * now * 40 * DPR;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * sq, 0, 0, 7); ctx.stroke();
  }
  ctx.setLineDash([]);
  // 符文：沿圈旋转（压扁成地面透视）
  const n = 6 + Math.round(lvl * 4), gr = 16 * K * (1 + lvl * 0.3);
  ctx.strokeStyle = hexA(L.c2, 0.95); ctx.lineWidth = Math.max(1, 4 * K); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const a = now * (t.fam === '减速光环' ? 0.25 : 0.6) + i * Math.PI * 2 / n, rr = R * 0.86;
    ctx.save(); ctx.translate(px + Math.cos(a) * rr, py + Math.sin(a) * rr * sq); ctx.scale(1, sq); ctx.rotate(a + Math.PI / 2);
    auraGlyph(L.glyph, ctx, gr); ctx.restore();
  }
  // 往上飘的光点
  const motes = 8 + Math.round(lvl * 14);
  for (let i = 0; i < motes; i++) {
    const ph2 = (now * 0.35 + i / motes + t.id * 0.11) % 1, a = i * 2.399 + t.id, rr = R * (0.2 + (i * 0.37 % 1) * 0.75);
    const mx = px + Math.cos(a) * rr, my = py + Math.sin(a) * rr * sq - ph2 * 160 * K;
    ctx.fillStyle = hexA(i % 3 ? L.c1 : L.c2, (1 - ph2) * 0.85); ctx.beginPath(); ctx.arc(mx, my, Math.max(1, (4 - ph2 * 2.5) * K * 2.2), 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawAuraCore(t, now) {                       // 光环中心浮着的核心（方便点选；满级多一圈光芒）
  const K = kAt(t.y);
  const L = AURA_LOOK[t.fam] || AURA_LOOK.攻击光环, lvl = auraLevel(t), px = sx(t.x, t.y), py = sy(t.y) - (70 + 12 * Math.sin(now * 2 + t.id)) * K;
  const r = (22 + lvl * 14) * K;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.25, hexA(L.c2, 0.85)); g.addColorStop(0.6, hexA(L.c1, 0.35)); g.addColorStop(1, hexA(L.c1, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r * 2.4, 0, 7); ctx.fill();
  ctx.translate(px, py); ctx.rotate(now * 1.2);                     // 旋转的菱形晶核
  ctx.fillStyle = hexA(L.c2, 0.9); ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.6, 0); ctx.closePath(); ctx.fill();
  if (lvl >= 0.99) { ctx.strokeStyle = 'rgba(255,240,200,.7)'; ctx.lineWidth = Math.max(1, 2 * K * 3); for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, r * 1.2); ctx.lineTo(0, r * 2.2); ctx.stroke(); } }
  ctx.restore();
}

function footRing(t, alpha) {
  const K = kAt(t.y);
  const x = sx(t.x, t.y), y = sy(t.y), r = FOOT_HALF * K * 0.98;
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = '#3cff3c'; ctx.shadowBlur = 8 * DPR;
  ctx.strokeStyle = '#3cff3c'; ctx.lineWidth = 2.2 * DPR; if (CAM) gcircle(t.x, t.y, FOOT_HALF * 0.98); else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); } ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = alpha * 0.15; ctx.fillStyle = '#3cff3c'; ctx.fill(); ctx.restore();
}
// 鼠标悬停的单位：细一点、半透明的圈
const hovered = () => mouse && !G.placing && !G.pending ? hitTest(mouse.x, mouse.y) : null;
function drawSprite(im, x, y, size) { const w = size, h = size * im.naturalHeight / im.naturalWidth; ctx.drawImage(im, x - w / 2, y - h * 0.75, w, h); }
// 塔模型体型不一（毒塔、图腾塔出图比别的塔大一大圈）：按 idle 帧可见包围盒统一到差不多的大小，只缩大的、略放小的
const TOWER_MAX_W = 240, TOWER_MAX_H = 300, TOWER_MIN_W = 124;
function towerFit(m) {
  if (m.war3 || !m.vis) return 1;                   // 原版模型：大小按原图的 modelScale，不统一
  const [w, h] = m.vis;
  return Math.min(TOWER_MAX_W / w, TOWER_MAX_H / h, Math.max(1, TOWER_MIN_W / w));
}
function drawTower(t) {
  if (!onScr(t.x, t.y)) return;
  const K = kAt(t.y);
  const x = sx(t.x, t.y), y = sy(t.y), s = Math.max((t.cat === 'summon' ? 90 : 150) * K, (t.cat === 'summon' ? 9 : 14) * DPR);
  const atk = t.cat === 'aura' ? 'aura' : (t.isHero ? heroStats(t).atk : curLevel(t).atk);
  if (t.cat === 'summon') { if (t === G.selected) selRing(x, y, s * 0.6, '#3cff3c'); else if (t === HOV) selRing(x, y, s * 0.6, '#3cff3c', 0.45); }
  else if (t === G.selected) footRing(t, 1); else if (t === HOV) footRing(t, 0.45);
  if (t.cat === 'aura') { if (!t.m3) drawAuraCore(t, performance.now() / 1000); return; }
  const tier = t.cat === 'summon' || t.isHero ? 0 : towerTier(t);
  const m3 = metaOf(t), in3d = m3 && model3d(t, m3, t.x, t.y, t.face, pickAnim(t, m3), towerFit(m3));
  let sh = !in3d && sheetOf(t); const im = !in3d && !sh && entityImg(t);   // 3D 画了就不再加载精灵图
  const w3 = sh && sh.m.war3;                       // 原版模型：每级的颜色和大小用原图数据，不再额外染色放大
  if (sh && tier && !w3) sh = tintedSheet(sh, TIER[tier].color, TIER[tier].tint);
  if (in3d) shadow(t.x, t.y, s * 0.55);
  else if (sh) { shadow(t.x, t.y, s * 0.55); drawSheet(sh, t, t.x, t.y, pickAnim(t, sh.m), towerFit(sh.m) * (w3 ? 1 : 1 + tier * 0.035)); }
  else if (im) drawSprite(im, x, y, s * 1.6);
  else {
    ctx.fillStyle = t.cat === 'aura' ? '#2f7a3b' : t.isHero ? '#6b4a12' : t.cat === 'summon' ? '#7a2a10' : '#2a3a4e';
    ctx.strokeStyle = ATK_COLOR[atk] || '#6fd17a'; ctx.lineWidth = 2 * DPR;
    if (t.isHero || t.cat === 'main') { ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, 7); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x - s / 2, y - s / 2, s, s); ctx.strokeRect(x - s / 2, y - s / 2, s, s); }
    const name = t.isHero ? t.heroName : t.cat === 'summon' ? t.label || '魔' : t.fam.replace('光环', '').replace('塔', '');
    const small = s < 26 * DPR;
    ctx.font = `bold ${Math.round(s * (small ? 0.62 : 0.36))}px sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(small ? name.slice(0, 1) : name.slice(0, 2), x, y + 1);
  }
  if (tier >= 3) onTop(() => drawTierTop(t, tier, performance.now() / 1000));
}
function drawMonster(m) {
  if (!onScr(m.x, m.y)) return;
  const K = kAt(m.y);
  const x = sx(m.x, m.y), y = sy(m.y), r = Math.max(2.5 * DPR, m.r * K);
  if (m === G.selected) selRing(x, y, r, '#ff3c3c'); else if (m === HOV) selRing(x, y, r, '#ff3c3c', 0.5);
  const m3 = metaOf(m), k3 = m.elite ? 1.3 : 1;
  const in3d = m3 && model3d(m, m3, m.x, m.y, m.face, pickAnim(m, m3), k3);
  const sh = !in3d && sheetOf(m), im = !in3d && !sh && entityImg(m);
  let barY = y - r - 7 * DPR;
  if (in3d) {
    shadow(m.x, m.y, r * 0.9 * k3);
    if (m.elite) { ctx.strokeStyle = 'rgba(255,79,216,.8)'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 1.3 * qAt(m.y, 0.46), 0, 0, 7); ctx.stroke(); }
    if (m.boss) { ctx.strokeStyle = 'rgba(255,43,43,.8)'; ctx.lineWidth = 2.5 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 1.2 * qAt(m.y, 0.46), 0, 0, 7); ctx.stroke(); }
    barY = Math.min(barY, sheetTop(m3, m.y, k3) - 4 * DPR);
  } else if (sh) {
    const k = m.elite ? 1.3 : 1;                                   // 精英怪放大 130%
    shadow(m.x, m.y, r * 0.9 * k);
    if (m.elite) { ctx.strokeStyle = 'rgba(255,79,216,.8)'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 1.3 * qAt(m.y, 0.46), 0, 0, 7); ctx.stroke(); }
    if (m.boss) { ctx.strokeStyle = 'rgba(255,43,43,.8)'; ctx.lineWidth = 2.5 * DPR; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 1.2 * qAt(m.y, 0.46), 0, 0, 7); ctx.stroke(); }
    barY = Math.min(barY, drawSheet(sh, m, m.x, m.y, pickAnim(m, sh.m), k) - 4 * DPR);
  } else if (im) drawSprite(im, x, y, r * 2.6);
  else {
    if (m.elite) { ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(x, y, r + 3 * DPR, 0, 7); ctx.stroke(); }
    ctx.fillStyle = ARMOR_COLOR[m.type] || '#ccc'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (m.boss) { ctx.strokeStyle = '#ff2b2b'; ctx.lineWidth = 2.5 * DPR; ctx.stroke(); }
  }
  onTop(() => {
    if (G.t < m.stunUntil) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - r, y - r - 4 * DPR, r * 2, 2 * DPR); }
    const w = Math.max(14 * DPR, r * 2.4), p = clamp(m.hp / m.maxHp, 0, 1);
    ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2, barY, w, 3 * DPR);
    ctx.fillStyle = p > 0.5 ? '#3cdc3c' : p > 0.25 ? '#ffd257' : '#ff5a4f'; ctx.fillRect(x - w / 2, barY, w * p, 3 * DPR);
  });
}
function drawBuilder(b) {
  if (!onScr(b.x, b.y)) return;
  const K = kAt(b.y);
  const x = sx(b.x, b.y), y = sy(b.y), r = Math.max(9 * DPR, 70 * K);
  if (b === G.selected) selRing(x, y, r, '#3cff3c'); else if (b === HOV) selRing(x, y, r, '#3cff3c', 0.45);
  const m3 = metaOf(b);
  if (m3 && model3d(b, m3, b.x, b.y, b.face, pickAnim(b, m3))) { shadow(b.x, b.y, r * 0.9); return; }
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
// 商店：原版"摇滚阿尔萨斯"模型（tools/war3_batch.py 的 shop），没有图时画个占位
function drawShop() {
  if (!onScr(SHOP.x, SHOP.y)) return;
  const K = kAt(SHOP.y);
  const x = sx(SHOP.x, SHOP.y), y = sy(SHOP.y), r = Math.max(10 * DPR, 90 * K);
  if (G.selected === SHOP) selRing(x, y, r, '#ffd257'); else if (HOV === SHOP) selRing(x, y, r, '#ffd257', 0.45);
  const m3 = metaOf(SHOP);
  if (m3 && model3d(SHOP, m3, SHOP.x, SHOP.y, -Math.PI / 2, pickAnim(SHOP, m3))) shadow(SHOP.x, SHOP.y, r * 0.9);
  else { const sh = sheetOf(SHOP);
    if (sh) { shadow(SHOP.x, SHOP.y, r * 0.9); drawSheet(sh, SHOP, SHOP.x, SHOP.y, pickAnim(SHOP, sh.m)); }
    else { ctx.fillStyle = '#5a3d1e'; ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2 * DPR; ctx.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); ctx.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`; ctx.fillStyle = '#ffd257'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('商', x, y + 1); } }
  onTop(() => label('商店', SHOP.x, SHOP.y - 150, '#ffd257', 11));
}
// 兔子：原版复活节兔子模型不在资源包里，程序画一只白兔子（蹦跳 + 地上一圈粉色光，方便找到）
function drawRabbit(r) {
  if (!onScr(r.x, r.y)) return;
  const K = kAt(r.y);
  const x = sx(r.x, r.y), y = sy(r.y), k = Math.max(7 * DPR, 48 * K), age = G.t - r.t0, left = r.until - G.t;
  const hop = r.moving ? Math.abs(Math.sin(age * 9)) : Math.max(0, Math.sin(age * 3)) ** 8;
  const lift = hop * k * 0.7, dir = Math.cos(r.face) >= 0 ? 1 : -1;
  const pulse = 0.6 + 0.4 * Math.sin(age * 4), blink = left < 10 && Math.sin(age * 12) < 0;     // 快消失时闪烁
  if (r === G.selected) selRing(x, y, k * 1.2, '#ffd257'); else if (r === HOV) selRing(x, y, k * 1.2, '#ffd257', 0.45);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,120,200,${0.55 * pulse})`; ctx.lineWidth = 2.5 * DPR;
  ctx.beginPath(); ctx.ellipse(x, y, k * (2 + pulse * 0.6), k * (2 + pulse * 0.6) * qAt(r.y, 0.5), 0, 0, 7); ctx.stroke(); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y, k * (1.1 - hop * 0.3), k * 0.45, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.globalAlpha = blink ? 0.45 : 1; ctx.translate(x, y - lift); ctx.scale(dir, 1);
  ctx.strokeStyle = 'rgba(80,60,70,.55)'; ctx.lineWidth = 1 * DPR;
  const ear = (ox, rot) => { ctx.save(); ctx.translate(ox, -k * 2.05); ctx.rotate(rot);
    ctx.fillStyle = '#f7f3f0'; ctx.beginPath(); ctx.ellipse(0, -k * 0.5, k * 0.2, k * 0.62, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffa8c8'; ctx.beginPath(); ctx.ellipse(0, -k * 0.48, k * 0.09, k * 0.45, 0, 0, 7); ctx.fill(); ctx.restore(); };
  ear(k * 0.3, -0.25 + hop * 0.2); ear(k * 0.62, 0.2 + hop * 0.25);
  ctx.fillStyle = '#f7f3f0';
  ctx.beginPath(); ctx.ellipse(-k * 0.1, -k * 0.75, k * 0.9, k * 0.72, 0, 0, 7); ctx.fill(); ctx.stroke();      // 身体
  ctx.beginPath(); ctx.arc(-k * 0.95, -k * 0.85, k * 0.26, 0, 7); ctx.fill(); ctx.stroke();                    // 尾巴
  ctx.beginPath(); ctx.ellipse(k * 0.55, -k * 1.55, k * 0.52, k * 0.46, 0, 0, 7); ctx.fill(); ctx.stroke();    // 头
  ctx.fillStyle = '#c0306a'; ctx.beginPath(); ctx.arc(k * 0.72, -k * 1.62, k * 0.08, 0, 7); ctx.fill();         // 眼睛
  ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.arc(k * 1.03, -k * 1.45, k * 0.07, 0, 7); ctx.fill();         // 鼻子
  ctx.fillStyle = '#ffb3cf'; ctx.beginPath(); ctx.ellipse(k * 0.3, -k * 0.12, k * 0.24, k * 0.12, 0, 0, 7); ctx.fill();   // 脚
  ctx.restore();
  onTop(() => label(`兔子 ${Math.ceil(left)}秒`, r.x, r.y + 48 * 3.4 + lift / K, '#ff9ad5', 12));
}
function drawMinimap() {
  const w = mm.width, h = mm.height, k = Math.min(w, h) / (WORLD * 2 + 300);
  const mx = x => w / 2 + x * k, my = y => h / 2 - y * k;
  mctx.fillStyle = '#10240f'; mctx.fillRect(0, 0, w, h);                 // 外围森林
  const gi = TER.groundImage();
  if (gi) {                                                               // 和原图小地图一样：直接缩小地面
    mctx.imageSmoothingEnabled = true; mctx.drawImage(gi.img, mx(-gi.L), my(gi.L), gi.L * 2 * k, gi.L * 2 * k);
    mctx.fillStyle = 'rgba(0,0,0,.45)';                                   // 地图边界外压暗
    mctx.fillRect(0, 0, w, my(WORLD)); mctx.fillRect(0, my(-WORLD), w, h - my(-WORLD)); mctx.fillRect(0, my(WORLD), mx(-WORLD), WORLD * 2 * k); mctx.fillRect(mx(WORLD), my(WORLD), w - mx(WORLD), WORLD * 2 * k);
  } else {
    mctx.fillStyle = '#2f5a29'; mctx.fillRect(mx(-WORLD), my(WORLD), WORLD * 2 * k, WORLD * 2 * k);
    mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    for (const [lw, c] of [[ROAD_HALF * 2 + 70, '#5e4a2e'], [ROAD_HALF * 2, '#a39a86']]) {
      mctx.strokeStyle = c; mctx.lineWidth = Math.max(2, lw * k); mctx.beginPath();
      for (const [a, b] of ROAD_SEGS) { mctx.moveTo(mx(a[0]), my(a[1])); mctx.lineTo(mx(b[0]), my(b[1])); }
      mctx.stroke();
    }
  }
  GATE_POS.forEach(([x, y], i) => { mctx.fillStyle = i ? '#9a4038' : '#ff4a3a'; mctx.beginPath(); mctx.arc(mx(x), my(y), Math.max(3, 200 * k), 0, 7); mctx.fill(); });
  mctx.strokeStyle = '#6dff6d'; mctx.lineWidth = Math.max(1, 30 * k); mctx.beginPath(); mctx.arc(mx(0), my(0), 300 * k, 0, 7); mctx.stroke();
  const dot = (x, y, c, s) => { mctx.fillStyle = c; mctx.fillRect(mx(x) - s / 2, my(y) - s / 2, s, s); };
  for (const t of G.towers) dot(t.x, t.y, t.isHero ? '#ffd257' : '#3cdc3c', 4 * DPR);
  for (const m of G.monsters) dot(m.x, m.y, m.boss ? '#ff2bff' : '#ff3c3c', (m.boss ? 4 : 2.5) * DPR);
  dot(SHOP.x, SHOP.y, '#ffd257', 5 * DPR);
  dot(G.builder.x, G.builder.y, '#ffffff', 4 * DPR);
  if (G.rabbit) {                                        // 兔子：粉点 + 一圈圈扩散的提示（原图 PingMinimap）
    const r = G.rabbit, ph = ((G.t - r.t0) * 0.8) % 1;
    dot(r.x, r.y, '#ff9ad5', 5 * DPR);
    mctx.strokeStyle = `rgba(255,154,213,${1 - ph})`; mctx.lineWidth = 1.5 * DPR;
    mctx.beginPath(); mctx.arc(mx(r.x), my(r.y), (4 + ph * 14) * DPR, 0, 7); mctx.stroke();
  }
  // 镜头范围：屏幕四角打到地面上的点（3D 时是上宽下窄的梯形，同魔兽的小地图）
  const cw = W / DPR, ch = H / DPR;
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1 * DPR; mctx.beginPath();
  [[0, 0], [cw, 0], [cw, ch], [0, ch]].forEach(([a, b], i) => { const [x, y] = groundAt(a, b); mctx[i ? 'lineTo' : 'moveTo'](mx(x), my(y)); });
  mctx.closePath(); mctx.stroke();
}
function addFx(f) { if (f.kind === 'ring') return FXS.ring(f.x, f.y, f.r, f.color, f.life, 4); if (G.fx.length < 400) G.fx.push(f); }   // 冲击波统一交给 fx.js 画

// ================================================================ 控制台 UI：信息面板 + 命令面板
const $ = id => document.getElementById(id);
let dirty = true;
function uiDirty() { dirty = true; }
// 提示语音：和 WC3 一样资源不足 / 不能建造时有语音，其余失败提示只响一声
const MSG_SND = [[/^金币不足/, 'noGold'], [/^木材不足/, 'noLumber'], [/^人口不足/, 'noFood'], [/不能建造|已被占用/, 'cantBuild'],
  [/冷却中|射程内没有敌人|只能|限制|最多|太远|召唤失败|已经在场上|已经学习|需要力量|魔法值不足/, 'error']];
function msg(text, sec = 6) {
  const snd = MSG_SND.find(([re]) => re.test(text)); if (snd) SFX.ui(snd[1]);
  const d = document.createElement('div'); d.textContent = text; $('msgs').appendChild(d);
  setTimeout(() => d.remove(), sec * 1000);
  while ($('msgs').children.length > 6) $('msgs').firstChild.remove();
}
function renderTop() {
  $('r-gold').textContent = Math.floor(G.gold); $('r-wood').textContent = G.wood;
  $('r-food').textContent = foodUsed() + '/' + G.foodCap;
  $('r-ach').textContent = G.ach;
  $('r-mode').textContent = MODES[G.mode].name;
  $('w-title').textContent = G.phase === 'prep' ? '准备阶段' : G.wave >= 48 ? '最终BOSS' : `第${G.wave}波`;
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
  const snd = SFX.pref.sfx ? (SFX.pref.music ? 0 : 1) : 2;
  if ($('btn-snd').dataset.v !== String(snd)) { $('btn-snd').dataset.v = snd; $('btn-snd').textContent = ['♪', '♩', '×'][snd]; $('btn-snd').title = ['声音：全开（点击关闭音乐）', '声音：只有音效（点击静音）', '声音：静音（点击全开）'][snd]; }
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
const builderState = b => { const o = b.order; return !o ? '待命' : o.kind === 'build' ? '前往建造 ' + (o.fam === 'hero' ? G.heroChoice : o.fam)
  : o.kind === 'use' ? `前去使用${o.item.name}` : o.kind === 'fod' ? '前去施放死亡之指' : '移动中'; };
function renderInfo() {
  const e = G.selected, box = $('info');
  if (!e || (e !== G.builder && e !== G.rabbit && e !== SHOP && !G.towers.includes(e) && !G.monsters.includes(e))) { G.selected = null; box.innerHTML = '<div class="empty">未选择单位</div>'; $('hpt').textContent = $('mpt').textContent = ''; setPortrait(null); return; }
  let left = '', mid = '';
  if (e.isShop) {
    left = portrait(e, '商', '#5a3d1e') + bar('hp', 1, 1, '无敌的');
    mid = `<div class="nm">商店</div><div class="sub">中立 · 木材和卷轴</div>
      <div class="kv"><span>守卫者</span><b>${shopNear() ? '在旁边，可以购买' : `太远（要在 ${RULE.shopReach} 范围内）`}</b></div>`;
  } else if (e.isRabbit) {
    left = portrait(e, '兔', '#d86a9a') + bar('hp', 1, 1, '15 / 15');
    mid = `<div class="nm">兔子</div><div class="sub">成就商店 · 剩余 ${Math.ceil(e.until - G.t)} 秒</div>
      <div class="kv"><span>当局成就</span><b>${G.ach}</b><span>守卫者</span><b>${rabbitNear() ? '在旁边，可以购买' : `太远（要在 ${RULE.rabbitReach} 范围内）`}</b></div>`;
  } else if (e.isBuilder) {
    left = portrait(e, '守', '#a5521a') + bar('hp', 1, 1, '400000') + bar('mp', e.mana, FOD.maxMana, `${Math.floor(e.mana)} / ${FOD.maxMana}`);
    mid = `<div class="nm">循环圈守卫者</div><div class="sub">建造者 · 无敌的</div>
      <div class="kv"><span>移动速度</span><b>500</b><span>技能</span><b>建造 · 随机建造 · 使用木材 · 全图闪烁 · 死亡之指</b>
      <span>状态</span><b>${builderState(e)}</b></div>`;
  } else if (e.isHero) {
    const st = heroStats(e), hd = D.heroes[e.heroName];
    left = portrait(e, e.heroName, '#6b4a12') + bar('hp', 1, 1, '无敌的') + bar('mp', e.mana, e.maxMana(), `${Math.floor(e.mana)} / ${e.maxMana()}`);
    mid = `<div class="nm">${hd.name} <small>${hd.title}</small></div><div class="sub">等级 ${e.level} · 英雄塔 ${atkTag(hd.atk)}</div>
      <div class="kv"><span>攻击力</span><b>${fmt(st.dmg)}</b><span>攻击间隔</span><b>${st.cd.toFixed(2)}s</b>
      <span>射程</span><b>${st.range}</b><span>击杀/伤害</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b>
      <span style="color:#ff6b5f">力量</span><b>${e.stat.str}</b><span style="color:#ffd257">敏捷</span><b>${e.stat.agi}</b><span style="color:#7ab8ff">智力</span><b>${e.stat.int}</b>
      <span>成长值</span><b>力 ${e.grow.str} · 敏 ${e.grow.agi} · 智 ${e.grow.int}</b><span>属性选择</span><b>${statCN(e.growth)}（每杀精英 +1）</b></div>
      <div class="skills">${hd.skills.slice(0, 4).map((s, i) => `<span class="${e.learned.includes(i) ? 'on' : ''}">${s.name}</span>`).join('')}</div>`;
  } else if (e.fam) {
    if (e.cat === 'summon') { box.innerHTML = `<div class="col-l">${portrait(null, e.label || '魔', '#7a2a10')}</div><div class="col-m"><div class="nm">${e.title || '炎魔'}</div><div class="sub">召唤物 · 剩余 ${Math.ceil(e.until - G.t)} 秒</div></div>`; return; }
    const lv = curLevel(e), st = towerStats(e);
    left = portrait(e, e.fam, e.cat === 'aura' ? '#2f7a3b' : '#2a3a4e') + bar('hp', 1, 1, '无敌的') +
      (e.maxMana ? bar('mp', e.mana, e.maxMana, `${Math.floor(e.mana)} / ${e.maxMana}`) : bar('mp', e.lv + 1, e.levels.length, `等级 ${e.lv + 1}/${e.levels.length}`));
    mid = `<div class="nm">${lv.name}</div><div class="sub">${CAT_CN[e.cat]}${e.branch ? ' · ' + e.branch + '分支' : ''} ${e.cat === 'aura' ? atkTag('aura') : atkTag(lv.atk)}</div><div class="kv">`;
    if (e.cat === 'aura') { const ab = auraAb(e) || {}; mid += `<span>光环</span><b>${auraText(e.fam, ab)}${e.talent ? '（基础天赋）' : ''}</b><span>范围</span><b>${ab.area}</b>`; }
    else mid += `<span>攻击力</span><b>${fmt(st.dmg)}${bonusTxt(towerAtk(e))}</b><span>攻击间隔</span><b>${st.cd}s${bonusTxt(towerAS(e), '攻速')}</b><span>射程</span><b>${st.range}</b>`;
    mid += `<span>击杀/伤害</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b><span>已投入</span><b class="gold">${e.spent} 金</b></div>${towerInfo(e)}<div class="tip">${(lv.tip || '').replace(/\n/g, ' ')}</div>`;
  } else {
    const ar = effArmor(e);
    left = portrait(e, e.name, ARMOR_COLOR[e.type]) + bar('hp', e.hp, e.maxHp, `${fmt(e.hp)} / ${fmt(e.maxHp)}`);
    mid = `<div class="nm">${e.name}${e.boss ? ' <em>BOSS</em>' : ''}${e.elite ? ' <em style="color:#ff4fd8">精英</em>' : ''}</div><div class="sub">怪物 · <span style="color:${ARMOR_COLOR[e.type]}">${ARMOR_CN[e.type]}护甲</span> → 克制：${ATK_CN[COUNTER[ARMOR_CN[e.type]]] || '—'}</div>
      <div class="kv"><span>护甲</span><b>${Math.round(ar)}（减伤 ${Math.round((1 - armorMult(ar)) * 100)}%）</b><span>移动速度</span><b>${e.speed}</b><span>赏金</span><b class="gold">${Math.round(e.bounty)}</b>
      ${e.elite ? `<span>光环</span><b>${e.elite.aura.name} ${e.elite.lvl} 级：${e.elite.aura.desc[e.elite.lvl - 1]}</b>` : ''}
      ${e.uid === 'Udea' ? `<span>魔法免疫</span><b style="color:${e.magicImmune ? '#7ab8ff' : '#999'}">${e.magicImmune ? '有（魔法攻击无效，每 5 秒切换）' : '无（每 5 秒切换）'}</b>` : ''}</div>`;
  }
  if (innerWidth <= 820) { box.innerHTML = `<div class="col-l">${left}</div><div class="col-m">${mid}</div>`; return; }
  renderCard(e);
}

// ---------------------------------------------------------------- 桌面：原版控制台的信息区（头像窗 + 血蓝条 + 中间的信息卡）
const ATK_ICON = { normal: 'attack-melee', pierce: 'attack-piercing', magic: 'attack-magic', chaos: 'attack-chaos', hero: 'attack-hero', spells: 'attack-magic', siege: 'attack-siege' };
const ARMOR_ICON = { small: 'armor-small', medium: 'armor-medium', large: 'armor-large', divine: 'armor-divine', hero: 'armor-hero', fort: 'armor-fortified' };
const HERO_PRIMARY = 'str';                       // 原图 4 个英雄的主属性都是力量
const ui = n => `assets/ui/infocard-${n}.png`;
const stat = (icon, label, val) => `<div class="st"><img src="${ui(icon)}"><div><span>${label}：</span><br><b>${val}</b></div></div>`;
const INVULN = '<b style="color:#ff4f4f">无敌的</b>';
function renderCard(e) {
  let name = '', sub = '', c1 = '', c2 = '', extra = '', hp = '', mp = '';
  if (e.isShop) {
    name = '商店'; sub = '中立 · 木材和卷轴';
    c1 = stat('armor-fortified', '护甲', INVULN);
    const d = Math.round(Math.hypot(G.builder.x - SHOP.x, G.builder.y - SHOP.y));
    c2 = `<div class="st"><div><span>守卫者距离：</span><b>${d}</b><br>${shopNear() ? '<b style="color:#6fd17a">可以购买</b>' : `<b style="color:#ff8f86">要在 ${RULE.shopReach} 范围内</b>`}</div></div>`;
    extra = '<div class="tip">买木材、魔力卷轴、知识之书、天赋卷轴。卷轴放进守卫者的物品栏，再对目标使用。复制 / 收购卷轴要对队友使用，单人模式用不了。</div>';
    hp = '无敌的';
  } else if (e.isRabbit) {
    name = '兔子'; sub = '成就商店 · 中立';
    c1 = `<div class="st"><div><span>剩余时间：</span><b>${Math.ceil(e.until - G.t)} 秒</b><br><span>当局成就：</span><b style="color:#ff9ad5">${G.ach}</b></div></div>`;
    const d = Math.round(Math.hypot(G.builder.x - e.x, G.builder.y - e.y));
    c2 = `<div class="st"><div><span>守卫者距离：</span><b>${d}</b><br>${rabbitNear() ? '<b style="color:#6fd17a">可以购买</b>' : `<b style="color:#ff8f86">要在 ${RULE.rabbitReach} 范围内</b>`}</div></div>`;
    extra = '<div class="tip">用当局成就购买道具（开局 5 点，每次 Perfect +1）。兔子到时间就会消失。</div>';
    hp = '15 / 15';
  } else if (e.isBuilder) {
    name = '循环圈守卫者'; sub = '不死族';
    c1 = stat('attack-melee', '攻击力', '1 - 1') + stat('armor-small', '护甲', INVULN);
    c2 = `<div class="st"><div><span>移动速度：</span><b>500</b><br><span>状态：</span><b>${builderState(e)}</b></div></div>`;
    hp = '500000 / 500000'; mp = `${Math.floor(e.mana)} / ${FOD.maxMana}`;
  } else if (e.isHero) {
    const st = heroStats(e), hd = D.heroes[e.heroName];
    name = hd.name; sub = `等级 ${e.level} 英雄 · ${hd.title}`;
    c1 = stat(ATK_ICON[hd.atk] || 'attack-hero', '攻击力', fmt(st.dmg)) + stat('armor-hero', '护甲', INVULN);
    const at = (k, cn) => `<span class="${k === HERO_PRIMARY ? 'pri' : ''}">${cn}：${e.stat[k]}</span>`;
    c2 = `<div class="attr"><img src="${ui('heroattributes-' + HERO_PRIMARY)}">${at('str', '力量')}${at('agi', '敏捷')}${at('int', '智力')}</div>`;
    const sk = e.learned.map(i => { const im = img('icon:skill:' + e.heroName + ':' + i); return im ? `<img src="${im.src}" title="${hd.skills[i].name}">` : ''; }).join('');
    extra = `<div class="buffs">状态：${sk || '<b style="color:#999;font-weight:400">还没有学习技能</b>'}</div>
      <div class="tip">攻击间隔 ${st.cd.toFixed(2)}s · 射程 ${st.range} · 成长值 力 ${e.grow.str} / 敏 ${e.grow.agi} / 智 ${e.grow.int} · 属性选择 ${statCN(e.growth)} · 击杀 ${e.kills}</div>`;
    hp = '无敌的'; mp = `${Math.floor(e.mana)} / ${e.maxMana()}`;
  } else if (e.fam) {
    if (e.cat === 'summon') { name = e.title || '炎魔'; sub = `召唤物 · 剩余 ${Math.ceil(e.until - G.t)} 秒`; }
    else {
      const lv = curLevel(e), st = towerStats(e);
      name = lv.name; sub = `${CAT_CN[e.cat]}${e.branch ? ' · ' + e.branch + '分支' : ''} · 等级 ${e.lv + 1}/${e.levels.length}`;
      if (e.cat === 'aura') { const ab = auraAb(e) || {}; c1 = stat('armor-fortified', '护甲', INVULN); c2 = `<div class="st"><div><span>光环：</span><b>${auraText(e.fam, ab)}${e.talent ? '（基础天赋）' : ''}</b><br><span>范围：</span><b>${ab.area}</b></div></div>`; }
      else {
        c1 = stat(ATK_ICON[lv.atk] || 'attack-melee', '攻击力', fmt(st.dmg) + bonusTxt(towerAtk(e))) + stat('armor-fortified', '护甲', INVULN);
        c2 = `<div class="st"><div><span>攻击间隔：</span><b>${st.cd}s</b>${bonusTxt(towerAS(e), '攻速')}<br><span>射程：</span><b>${st.range}</b><br>
          <span>击杀 / 伤害：</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b><br><span>已投入：</span><b class="gold">${e.spent} 金</b></div></div>`;
      }
      extra = towerInfo(e) || `<div class="tip">${(lv.tip || '').replace(/\n/g, ' ')}</div>`;   // 有技能状态就显示技能状态（信息卡放不下两段）
    }
    hp = '无敌的'; mp = e.maxMana ? `${Math.floor(e.mana)} / ${e.maxMana}` : '';
  } else {
    const ar = effArmor(e);
    name = e.name + (e.boss ? ' <em style="color:#ff5a4f;font-style:normal">BOSS</em>' : '') + (e.elite ? ' <em style="color:#ff4fd8;font-style:normal">精英</em>' : '');
    sub = `怪物 · ${ARMOR_CN[e.type]}护甲 → 克制：${ATK_CN[COUNTER[ARMOR_CN[e.type]]] || '—'}`;
    c1 = stat(ARMOR_ICON[e.type] || 'armor-unarmored', '护甲', `${Math.round(ar)}（减伤 ${Math.round((1 - armorMult(ar)) * 100)}%）`);
    c2 = `<div class="st"><div><span>移动速度：</span><b>${e.speed}</b><br><span>赏金：</span><b class="gold">${Math.round(e.bounty)}</b></div></div>`;
    if (e.elite) extra = `<div class="tip">光环：${e.elite.aura.name} ${e.elite.lvl} 级：${e.elite.aura.desc[e.elite.lvl - 1]}</div>`;
    hp = `${fmt(e.hp)} / ${fmt(e.maxHp)}`;
  }
  $('info').innerHTML = `<div class="nm">${name}</div><div class="sub">${sub}</div><div class="card"><div class="c">${c1}</div><div class="c">${c2}</div></div>${extra}`;
  $('hpt').textContent = hp; $('mpt').textContent = mp;
  setPortrait(e);
}
// 头像窗：有原版头像动画（assets/w3portraits.js）就逐帧画，没有就用图标 / 精灵缩略图
const PORTRAITS = window.W3_PORTRAITS || {}, PIMG = {};
let PORT = null;
function portraitKey(e) {
  const k = spriteKey(e); if (!k) return null;
  return PORTRAITS[k] ? k : PORTRAITS[k.replace(/:1$/, '')] ? k.replace(/:1$/, '') : null;
}
function setPortrait(e) {
  const k = e && portraitKey(e), fb = $('portrait').querySelector('.fb');
  if (k) { if (!PORT || PORT.key !== k) PORT = { key: k, m: PORTRAITS[k] }; fb.innerHTML = ''; return; }
  PORT = null;
  const html = e ? portrait(e, e.isHero ? e.heroName : e.fam || e.name || '守', e.isHero ? '#6b4a12' : '#2a3a4e') : '';
  if (fb.dataset.h !== html) { fb.innerHTML = html; fb.dataset.h = html; }
}
function drawPortrait() {
  const cv = $('pcv'); if (!cv) return;
  const g = cv.getContext('2d'), r = cv.getBoundingClientRect();
  if (!PORT || !r.width) { if (cv.width) { cv.width = 0; } return; }
  const W = Math.round(r.width * DPR), H = Math.round(r.height * DPR);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const m = PORT.m; let im = PIMG[m.src];
  if (!im) { im = new Image(); im.src = 'assets/' + m.src; PIMG[m.src] = im; }
  if (!(im.complete && im.naturalWidth)) { g.clearRect(0, 0, W, H); return; }       // 新头像还在加载：先清掉上一个
  const src = m.tint ? tinted(im, m.tint) : im, f = Math.floor(performance.now() / 1000 * m.fps) % m.frames;
  g.clearRect(0, 0, W, H);
  const k = Math.max(W / m.w, H / m.h), dw = m.w * k, dh = m.h * k;      // 铺满窗口（cover）
  g.drawImage(src, f * m.w, 0, m.w, m.h, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
// 攻击 / 攻速加成的显示（只算加在基础攻击上的那部分）
function bonusTxt(mul, label = '') {
  if (Math.abs(mul - 1) < 0.005) return '';
  return mul > 1 ? ` <em>${label}+${Math.round((mul - 1) * 100)}%</em>` : ` <em style="color:#ff8f86">${label}-${Math.round((1 - mul) * 100)}%</em>`;
}
// 塔的技能状态（技能包的 info）、原始战速 / 战力、身上的增益
function towerInfo(t) {
  const kit = KITS[t.fam], lines = kit && kit.info ? kit.info(t).slice() : [];
  if (t.cat === 'raw' && isMax(t) && (hasAbil(t, 'A082') || hasAbil(t, 'A073'))) {
    const n = G.towers.filter(o => o.cat === 'raw' && isMax(o)).length, spd = hasAbil(t, 'A082');
    lines.push(`原始${spd ? '战速' : '战力'}：MAX 原始塔 ${n} 座，` + (n < 2 ? '再有一座 MAX 原始塔才生效' : `${spd ? '攻速' : '攻击'} +${pctTxt(spd ? primalSpd(n) : primalPow(n))}`));
  }
  const bufs = [['bloodlust', '嗜血术 攻速'], ['fire', '火速 攻速'], ['roar', '咆哮 攻击'], ['divine', '神力 攻击']].filter(([k]) => bv(t, k)).map(([k, n]) => `${n} +${pctTxt(bv(t, k))}`);
  if (bufs.length) lines.push('状态：' + bufs.join('，'));
  if (t.talent && t.cat !== 'aura') lines.push('<b style="color:#9fffb0">已激活天赋</b>');
  return lines.length ? `<div class="tip">${lines.join('<br>')}</div>` : '';
}
function auraText(fam, ab) {
  const v = Math.abs(ab.A || 0);
  return { 加速光环: `范围内塔攻速 +${Math.round(v * 100)}%`, 攻击光环: `范围内塔攻击 +${Math.round(v * 100)}%`, 减防光环: `范围内敌人护甲 -${v}`, 减速光环: `范围内敌人移速 -${Math.round(v * 100)}%` }[fam];
}

// 命令面板：4×3，和 WC3 一样每个按钮有热键
function cmd(key, icon, name, tip, fn, opt = {}) { return { key, icon, name, tip, fn, ...opt }; }
const SVG_CATS = new Set(['main', 'raw', 'sup', 'aura', 'alt']);     // 这几类塔有 assets/icons/tower-*.svg 图标
function buildCmds() {
  const e = G.selected, out = [];
  const back = cmd('Esc', '↩', '返回', '返回上一级', () => { G.menu = 'main'; G.placing = null; G.pending = null; uiDirty(); }, { ico: 'back' });
  if (!e) return out;
  // 商店 / 兔子的道具按钮
  const itemCmd = (it, why, buy) => {
    const cost = [it.ach && `<b style="color:#ff9ad5">${it.ach} 成就</b>`, it.gold && `<span class="gold">${it.gold} 金</span>`, it.wood && `<span class="wood">${it.wood} 木材</span>`].filter(Boolean).join(' + ');
    const cdOf = it.cd || it.firstAt ? { cdOf: () => [itemCdLeft(it), G.t < (it.firstAt || 0) ? it.firstAt : it.cd] } : {};
    return cmd(it.key, it.name.slice(0, 2), it.name, `<b>${it.name}</b><br>需要 ${cost}${it.cd ? ` · 冷却 ${it.cd} 秒` : ''}<br>${it.tip}${why ? `<br><b style="color:#ff5a4f">${why}</b>` : ''}`,
      buy, { disabled: !!why, ico: 'item-' + it.id, cost: it.gold, ...cdOf });
  };
  const comeHere = (near, x, y, what) => cmd('F', '✦', '守卫者过来', `守卫者全图闪烁到${what}旁边（闪烁冷却 1 秒）`, () => { blinkTo(x + 150, y - 100); uiDirty(); }, { disabled: near, ico: 'blink' });
  if (e.isShop) {
    for (const it of SHOP_ITEMS) out.push(itemCmd(it, shopBlock(it), () => buyShop(it)));
    while (out.length < 8) out.push(null);
    out.push(comeHere(shopNear(), SHOP.x, SHOP.y, '商店'));
    return out;
  }
  if (e.isRabbit) {
    for (const it of RABBIT_SHOP) out.push(itemCmd(it, rabbitBlock(it), () => buyRabbit(it)));
    while (out.length < 8) out.push(null);
    out.push(comeHere(rabbitNear(), e.x, e.y, '兔子'));
    return out;
  }
  if (e.isBuilder) {
    if (G.menu === 'build') {
      const keys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D'];
      G.build.forEach((fam, i) => {
        const d = D.towers[fam], l = d.levels[0], blocked = buildBlock(fam);
        out.push(cmd(keys[i], fam.slice(0, 2), fam, `<b>${fam}</b> ${d.cat === 'aura' ? atkTag('aura') : atkTag(l.atk)}<br>${CAT_CN[d.cat]} · <span class="gold">${l.gold} 金</span> · ${l.food || 0} 人口<br>${l.tip.replace(/\n/g, '<br>')}${blocked ? '<br><b style="color:#ff5a4f">' + blocked + '</b>' : ''}`,
          () => { G.placing = fam; G.pending = null; uiDirty(); }, { cat: d.cat, atk: d.cat === 'aura' ? 'aura' : l.atk, active: G.placing === fam, disabled: !!blocked || G.gold < l.gold, iconKey: 'icon:' + fam,
            ico: SVG_CATS.has(d.cat) ? 'tower-' + fam : null, cost: l.gold }));
      });
      if (G.heroChoice) { const h = D.heroes[G.heroChoice], blocked = heroBlock();
        out.push(cmd('F', h.name, h.name + '（英雄塔）', `<b>${h.name}</b> ${atkTag(h.atk)}<br>英雄塔 · 全场唯一 · 建造后不能回收<br><span class="gold">${h.gold} 金</span> · ${h.wood} 木材 · ${h.food} 人口<br>${h.title}${blocked ? '<br><b style="color:#ff5a4f">' + blocked + '</b>' : ''}`,
          () => { G.placing = 'hero'; uiDirty(); }, { atk: h.atk, active: G.placing === 'hero', disabled: !!blocked || G.gold < h.gold || G.wood < h.wood, hero: true, iconKey: 'icon:hero:' + h.name, ico: 'hero-' + h.name, cost: h.gold })); }
      while (out.length < 11) out.push(null);
      out.push(back); return out;
    }
    if (G.menu === 'wood') {
      out.push(cmd('Q', '人', '购买人口', '用 <b>12 木材</b>购买 1 个人口', () => { if (G.wood < RULE.foodPrice) return msg('木材不足'); G.wood -= RULE.foodPrice; G.foodCap++; msg('用 12 木材兑换了 1 个人口'); uiDirty(); }, { disabled: G.wood < 12, ico: 'buyfood' }));
      out.push(cmd('W', '金', '兑换金币', '<b>1 木材</b>兑换 300 金币', () => { if (G.wood < 1) return msg('木材不足'); G.wood--; G.gold += RULE.woodToGold; uiDirty(); }, { disabled: G.wood < 1, ico: 'wood2gold' }));
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    out.push(cmd('M', '➜', '移动', '移动守卫者。也可以选中守卫者后直接右键 / 点击地面', () => { G.pending = 'move'; G.placing = null; uiDirty(); }, { active: G.pending === 'move', ico: 'move' }));
    out.push(cmd('S', '■', '停止', '停止当前命令（包括排队的命令）', () => { e.order = null; e.queue = []; G.pending = null; G.placing = null; uiDirty(); }, { ico: 'stop' }));
    out.push(cmd('F', '✦', '闪烁', '全图闪烁：瞬间移动到目标点，冷却 1 秒', () => { G.pending = 'blink'; G.placing = null; uiDirty(); }, { active: G.pending === 'blink', ico: 'blink' }));
    out.push(cmd('T', '兔', '兔子卷轴', `——需要 <b style="color:#ff9ad5">${RULE.rabbitScrollAch} 点当局成就</b>（当前 ${G.ach}）<br>额外召唤一次兔子，每局只能额外召唤 1 次${G.rabbitScroll ? '<br><b style="color:#ff5a4f">本局已经召唤过了</b>' : G.rabbit ? '<br><b style="color:#ff5a4f">兔子已经在场上了</b>' : ''}`,
      rabbitScroll, { disabled: G.rabbitScroll || !!G.rabbit || G.ach < RULE.rabbitScrollAch, ico: 'item-I00S' }));
    out.push(cmd('B', '建', '建造', '打开建造栏（当前随机给出的 7 个塔 + 1 个英雄塔）', () => { G.menu = 'build'; uiDirty(); }, { ico: 'build' }));
    out.push(cmd('R', '🎲', '随机建造', `重新随机建造栏：1 主塔、1 原始塔、1 光环塔、1 新辅助（大辅助 / 巫系）、1 小辅助、1 另类塔、1 全场唯一、1 英雄塔<br>${G.rerolls === 0 ? '首次免费' : `需要 ${RULE.rerollWood} 木材`}`, () => rerollBuild(false), { disabled: G.rerolls > 0 && G.wood < RULE.rerollWood, ico: 'reroll' }));
    out.push(cmd('U', '木', '使用木材', '购买人口（12 木）、兑换金币（1 木 → 300 金）。买木材去地图中央的商店', () => { G.menu = 'wood'; uiDirty(); }, { ico: 'woodmenu' }));
    const fw = fodBlock();
    out.push(cmd('X', '指', '死亡之指', `<span class="atk atk-magic">主动</span> 射程 ${FOD.range} · 冷却 ${FOD.cd} 秒 · <span style="color:#7ab8ff">${FOD.mana} 魔法</span><br>选择一个敌人：直接杀死它。<br>BOSS 只损失一部分生命（大红牛 7000、大骷髅 2.5 万、直升机 / 游艇 / 魔王 10 万、龙 / 狗头人 BOSS 生命高于 15 万时 10 万，按模式缩放）${fw ? `<br><b style="color:#ff5a4f">${fw}</b>` : ''}`,
      () => { const why = fodBlock(); if (why) return msg(why); G.pending = 'fod'; G.placing = null; msg('死亡之指：选择一个敌人（Esc 取消）'); uiDirty(); },
      { ico: 'fod', active: G.pending === 'fod', cdOf: () => [fodLeft(), FOD.cd] }));
    return out;
  }
  if (e.isHero) {
    const h = e, hd = D.heroes[h.heroName];
    if (G.menu === 'skills') {
      const c = LEARN_COST[h.learned.length];
      hd.skills.slice(0, 4).forEach((s, i) => {
        const learned = h.learned.includes(i), re = learned && HERO_KITS[h.heroName][i].relearn && h.qs[i] < 2;   // 枪神：可以再次学习
        const need = re ? `<br><b>再次学习：${QS_RELEARN} 金币</b>` : !learned && c ? `<br><b>需要：木材 ${c.wood}，力量 ≥ ${c.str}</b>` : '';
        out.push(cmd(['Q', 'W', 'E', 'R'][i], s.name.slice(0, 2), s.name, `<b>${s.name}</b>${learned ? ' ✓ 已学习' + (h.qs[i] >= 2 ? '（已再次学习）' : '') : ''}<br>${s.desc.replace(/\n/g, '<br>')}${need}`,
          () => re ? relearnSkill(h, i) : learned ? msg('已经学会了') : learnSkill(h, i),
          { learned: learned && !re, disabled: re ? G.gold < QS_RELEARN : !learned && (!c || h.stat.str < c.str || G.wood < c.wood), iconKey: 'icon:skill:' + h.heroName + ':' + i, ico: 'skill-' + h.heroName + '-' + i, cost: re ? QS_RELEARN : 0 }));
      });
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    // 第一行：已学的技能（Q W E R 对应技能位置）。主动技能按热键 / 左键施放，右键切换自动施放；被动技能只显示
    hd.skills.slice(0, 4).forEach((sk, i) => {
      if (!h.learned.includes(i)) return out.push(null);
      const kit = HERO_KITS[h.heroName][i], key = ['Q', 'W', 'E', 'R'][i], ico = 'skill-' + h.heroName + '-' + i, iconKey = 'icon:skill:' + h.heroName + ':' + i, desc = sk.desc.replace(/\n/g, '<br>');
      if (kit.cast) {
        const auto = h.auto[i] !== false;
        out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-magic">主动</span><br>冷却 ${kit.cd} 秒 · 按 <b>${key}</b> 或左键施放（对射程内最近的敌人）<br>右键：自动施放 <b style="color:${auto ? '#6fd17a' : '#ff8f86'}">${auto ? '开' : '关'}</b><br>${desc}`,
          () => castSkill(h, i), { ico, iconKey, auto, cdOf: () => [skillCdLeft(h, i), kit.cd], rfn: () => { h.auto[i] = !auto; msg(`${sk.name}：自动施放${auto ? '关闭' : '开启'}`); uiDirty(); } }));
      } else out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-normal">被动</span><br>${desc}`, () => {}, { ico, iconKey, passive: true }));
    });
    // 第二行：成长属性
    for (const [k, st, nm] of [['A', 'str', '力量'], ['S', 'agi', '敏捷'], ['D', 'int', '智力']])
      out.push(cmd(k, nm.slice(0, 1), '属性选择：' + nm, `属性选择<b>${nm}</b>：每杀死 1 个精英怪，${nm} +1；满级后再升级 ${nm} +3`, () => { h.growth = st; uiDirty(); }, { active: h.growth === st, ico: st }));
    out.push(null);
    // 第三行：升级、学习技能、回收
    const maxed = h.level >= 30, g = maxed ? 500 : h.level * 100, mp = maxed ? 400 : 200;
    out.push(cmd('U', '↑', '升级', `需要 <b>${g} 金币 + ${mp} 魔法</b><br>${maxed ? '满级后：所选属性 +3' : `等级 +1，按成长值加属性：力量 +${h.grow.str} · 敏捷 +${h.grow.agi} · 智力 +${h.grow.int}`}`, () => heroLevelUp(h), { disabled: G.gold < g || h.mana < mp, ico: 'upgrade', cost: g }));
    const relearn = h.learned.some(i => HERO_KITS[h.heroName][i].relearn && h.qs[i] < 2);
    out.push(cmd('L', '书', '学习技能', `最多 4 个。第 1 个免费，第 2/3/4 个需要木材 18/36/54，力量 ≥ 80/160/240${HERO_KITS[h.heroName][0].relearn ? `<br>学会的技能可以花 ${QS_RELEARN} 金币再次学习一次` : ''}`, () => { G.menu = 'skills'; uiDirty(); }, { ico: 'learn', disabled: h.learned.length >= 4 && !relearn }));
    return out;                                      // 英雄塔建造后不能回收（原图英雄塔说明）
  }
  if (e.fam && e.cat !== 'summon') {
    const f = famOf(e), kit = KITS[e.fam];
    if (kit && kit.cmds) out.push(...kit.cmds(e));
    if (f.branches && e.lv === 0 && !e.bmax) Object.keys(f.branches).forEach((k, i) => { const n = f.branches[k][0]; out.push(cmd(['Q', 'W', 'E', 'R'][i], k, k + '分支', `<b>${n.name}</b> ${atkTag(n.atk)}<br><span class="gold">${n.gold} 金</span> · 攻击 ${n.dmg} · 弹射 ${n.targets} 个`, () => upgradeTower(e, k), { atk: n.atk, disabled: G.gold < n.gold, ico: 'branch-' + n.atk, cost: n.gold })); });
    else if (e.levels[e.lv + 1]) { const n = e.levels[e.lv + 1]; out.push(cmd('U', '↑', '升级', `升级到 <b>${n.name}</b><br><span class="gold">${n.gold} 金</span>${e.cat === 'aura' ? '' : ` · 攻击 ${fmt(n.dmg)} · 间隔 ${n.cd}s · 射程 ${n.range}`}<br>${n.tip || ''}`, () => upgradeTower(e), { disabled: G.gold < n.gold, ico: 'upgrade', iconKey: `portrait:tower:${e.fam}:${e.lv + 2}`, cost: n.gold })); }
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
      const icon = (c.iconKey && img(c.iconKey)) || (c.ico && img('ico:' + c.ico));   // 原版图标（assets/war3_icons.js）优先
      const thumb = !icon && c.iconKey && sheetThumb(sheetByKey(c.iconKey.replace(/^icon:/, c.iconKey.startsWith('icon:hero:') ? '' : 'tower:')), innerWidth <= 820 ? 40 : 48);
      // 图标优先（风格统一，像 WC3）；没有图标的才用模型缩略图或文字
      const face = icon ? `<img src="${icon.src}">` : c.ico ? `<img class="svg" src="assets/icons/${c.ico}.svg" alt="">`
        : thumb ? `<span class="thumb" style="${thumb}"></span>` : `<span class="ic ${c.atk ? 'atk-' + c.atk : ''}">${c.icon}</span>`;
      const ring = c.atk && (c.ico || thumb) && !c.hero ? `<span class="atkring atk-${c.atk}"></span>` : '';     // 塔按攻击类型加一圈颜色
      b.innerHTML = face + ring + `<span class="hk">${c.key}</span>` + (c.cost ? `<span class="cost">${c.cost >= 10000 ? (c.cost / 1000).toFixed(0) + 'k' : c.cost}</span>` : '')
        + (c.cdOf ? '<span class="cdov"></span><span class="cdtx"></span>' : '') + (c.passive ? '<span class="tag">被动</span>' : '') + (c.learned ? '<span class="tag ok">已学</span>' : '');
      b.oncontextmenu = ev => { ev.preventDefault(); if (c.rfn) { c.rfn(); showTip(null); } };
      b.disabled = !!c.disabled;
      b.onclick = () => { showTip(c); SFX.ui('click'); if (!c.disabled) c.fn(); };
      b.onmouseenter = () => showTip(c); b.onmouseleave = () => showTip(null);
    }
    grid.appendChild(b);
  }
  renderInv();
}
// 物品栏：2×3 格，选中守卫者时显示它的物品（其他单位没有物品栏，格子空着）。热键同 WC3 的小键盘 7 8 / 4 5 / 1 2
const INV_KEYS = ['7', '8', '4', '5', '1', '2'];
const invItems = () => G.selected === G.builder ? G.inv : [];
function renderInv() {
  const box = $('inv'), items = invItems();
  box.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const it = items[i], b = document.createElement('button');
    b.className = 'cb' + (it ? '' : ' none') + (it && G.pending === 'inv:' + i ? ' active' : '');
    if (it) {
      const icon = img('ico:item-' + it.id);
      b.innerHTML = (icon ? `<img src="${icon.src}">` : `<span class="ic">${it.name.slice(0, 2)}</span>`) + `<span class="hk">${INV_KEYS[i]}</span>`;
      const c = { name: it.name, key: INV_KEYS[i], tip: `${it.tip}<br>点击后选择目标使用（施法距离 ${it.range}，守卫者会先走过去）` };
      b.onclick = () => { showTip(c); SFX.ui('click'); invPick(i); };
      b.onmouseenter = () => showTip(c); b.onmouseleave = () => showTip(null);
    }
    box.appendChild(b);
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
// 鼠标点选（CSS 像素）：按屏幕上的距离找单位。3D 时单位是立着的，点在身体上也算 —— 量点到"脚 → 头顶"这条竖线的距离
// （和魔兽一样点模型本身选中，而不是只认脚下的地面）
function hitTest(px, py) {
  const X = px * DPR, Y = py * DPR;
  const d2 = (e, h) => {
    const x0 = sx(e.x, e.y), y0 = sy(e.y), x1 = CAM ? sx(e.x, e.y, h) : x0, y1 = CAM ? sy(e.y, h) : y0;
    const vx = x1 - x0, vy = y1 - y0, L = vx * vx + vy * vy, t = L ? clamp(((X - x0) * vx + (Y - y0) * vy) / L, 0, 1) : 0;
    return (X - x0 - vx * t) ** 2 + (Y - y0 - vy * t) ** 2;
  };
  const rpx = (e, rw, min) => Math.max(rw * kAt(e.y), min * DPR) ** 2;
  const b = G.builder; if (d2(b, 150) < rpx(b, 108, 14)) return b;
  const rb = G.rabbit; if (rb && d2(rb, 90) < rpx(rb, 120, 16)) return rb;
  if (!G.pending && d2(SHOP, 220) < rpx(SHOP, 144, 19)) return SHOP;
  let best = null, bd = Infinity;
  for (const t of G.towers) { const d = d2(t, t.cat === 'aura' ? 80 : 200); if (d < rpx(t, 120, 16) && d < bd) { bd = d; best = t; } }
  if (best) return best;
  for (const m of G.monsters) { const d = d2(m, 110 * (m.elite ? 1.3 : 1)); if (d < rpx(m, 90, 12) && d < bd) { bd = d; best = m; } }
  return best;
}
// 选中单位的语音（敌方怪物没有）
const voiceKey = e => !e ? null : e.isBuilder ? 'builder' : e.isShop ? 'shop' : e.isRabbit ? 'rabbit' : e.isHero ? 'hero:' + e.heroName : e.fam && e.cat !== 'summon' ? 'tower:' + e.fam : null;
function select(e) { const k = voiceKey(e); if (k) SFX.select(k); G.selected = e; G.menu = 'main'; G.placing = null; G.pending = null; showTip(null); uiDirty(); }
function groundClick(x, y, shift) {
  if (G.placing) {
    const gx = snap(x), gy = snap(y);
    if (!canPlace(gx, gy, true)) return msg('这里不能建造（不能挡路或重叠）');
    if (orderBuild(G.placing, gx, gy, shift)) { SFX.ui('place', { x: gx, y: gy }); if (!shift) { G.placing = null; G.menu = 'main'; } uiDirty(); }   // 按住 Shift 可连续排队建造
    return;
  }
  if (G.pending === 'move') { orderMove(x, y, shift); G.pending = null; uiDirty(); return; }
  if (G.pending === 'blink') { blinkTo(x, y); G.pending = null; uiDirty(); return; }
  if (G.pending && G.pending.startsWith('inv:')) {           // 对目标使用物品栏里的道具
    const i = +G.pending.slice(4), t = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null;
    if (G.inv[i]) { if (t && G.towers.includes(t)) orderUse(i, t, shift); else msg(G.inv[i].ok(null)); }
    uiDirty(); return;
  }
  if (G.pending && G.pending.startsWith('xfer:')) {          // 弹跳塔转移魔法：对另一座弹跳塔
    const src = G.towers.find(o => o.id === +G.pending.slice(5)), t = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null;
    if (src) bounceXfer(src, t);
    uiDirty(); return;
  }
  if (G.pending === 'fod') {                                  // 死亡之指：对敌人
    const t = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null; orderFinger(t, shift); uiDirty(); return;
  }
  const hit = mouse && hitTest(mouse.x, mouse.y);
  if (hit) return select(hit);
  if (G.selected === G.builder) orderMove(x, y, shift);   // 选中守卫者时点击空地 = 移动（方便触屏）
  else select(null);
}
let drag = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const r = cv.getBoundingClientRect();
  drag = { x: e.clientX, y: e.clientY, g: groundAt(e.clientX - r.left, e.clientY - r.top), moved: false, button: e.button };
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (drag && drag.button === 0) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
    if (drag.moved) {                                        // 按下时点住的那块地一直跟着鼠标走
      zoomTo = null;
      const [gx, gy] = groundAt(mouse.x, mouse.y); G.cam.x += drag.g[0] - gx; G.cam.y += drag.g[1] - gy; clampCam();
    }
  }
});
cv.addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!G || !d || d.moved || G.phase === 'over' || G.phase === 'win') return;
  const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  const x = wx(mouse.x, mouse.y), y = wy(mouse.y);
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
  else if (mouse) { const h = hitTest(mouse.x, mouse.y); c = !h ? '' : h.uid ? 'cur-enemy' : 'cur-friend'; }
  if (c !== curCls) { curCls = c; cv.className = c; }
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  // 触控板的连续滚动量小、鼠标滚轮一格约 100：按滚动量换算倍数，镜头平滑地拉过去（见 zoomStep），鼠标下的那块地不动
  const z0 = zoomTo ? zoomTo.z : G.cam.zoom, f = Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -300, 300) * 0.0014);
  zoomTo = { z: clamp(z0 * f, ZMIN, ZMAX), px, py, g: groundAt(px, py) };
}, { passive: false });
// 滚轮缩放的缓动：每帧往目标走一段，同时把鼠标下的地面点拉回鼠标下
let zoomTo = null;
function zoomStep(dt) {
  if (!zoomTo) return;
  const c = G.cam, k = 1 - Math.exp(-dt * 14);
  c.zoom = Math.abs(zoomTo.z - c.zoom) < 0.002 ? zoomTo.z : c.zoom + (zoomTo.z - c.zoom) * k; clampCam();
  const [gx, gy] = groundAt(zoomTo.px, zoomTo.py); c.x += zoomTo.g[0] - gx; c.y += zoomTo.g[1] - gy; clampCam();
  if (c.zoom === zoomTo.z) zoomTo = null;
}
// 小地图：点击/拖动移动镜头
let mmDown = false;
const mmMove = e => {
  const r = mm.getBoundingClientRect(), k = Math.min(mm.width, mm.height) / (WORLD * 2 + 300);
  zoomTo = null;
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
  const ni = e.code.startsWith('Numpad') ? INV_KEYS.indexOf(e.code.slice(6)) : -1;   // 小键盘：物品栏
  if (ni >= 0) { e.preventDefault(); if (invItems()[ni]) { SFX.ui('click'); invPick(ni); } return; }
  const k = e.key.toUpperCase();
  if (dirty) { renderCmds(); dirty = false; }          // 连按热键（如 B → W）时先刷新命令面板
  const c = CMDS.find(c => c && c.key === k);
  if (c && !c.disabled) { SFX.ui('click'); c.fn(); showTip(c); }
});
window.addEventListener('keyup', e => keys.delete(e.key));
$('btn-start').onclick = () => { if (G.phase === 'prep') G.timer = 0.01; };
$('btn-pause').onclick = () => { G.paused = !G.paused; };
$('btn-snd').onclick = () => {                              // 全开 → 只有音效 → 静音 → 全开
  const p = SFX.pref;
  if (p.sfx && p.music) SFX.toggle('music'); else if (p.sfx) SFX.toggle('sfx'); else { SFX.toggle('sfx'); SFX.toggle('music'); }
};
$('btn-speed').onclick = () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; };
$('btn-help').onclick = showHelp;
const zoomBtn = f => { const z0 = zoomTo ? zoomTo.z : G.cam.zoom, w = W / DPR / 2, h = H / DPR / 2; zoomTo = { z: clamp(z0 * f, ZMIN, ZMAX), px: w, py: h, g: groundAt(w, h) }; };
$('btn-zin').onclick = () => zoomBtn(1.3);
$('btn-zout').onclick = () => zoomBtn(1 / 1.3);
$('q-builder').onclick = () => { select(G.builder); centerOn(G.builder); };
$('q-hero').onclick = () => { if (G.hero) { select(G.hero); centerOn(G.hero); } };
window.addEventListener('resize', resize);

// ================================================================ 弹窗
function showModal(html) { $('modal-box').innerHTML = html; $('modal-box').classList.remove('dlg'); $('modal').classList.remove('hidden'); }
function hideModal() { $('modal').classList.add('hidden'); }
// 开局菜单：照原图的对话框（DialogCreate）——标题 + 一列按钮。英雄塔不在这里选，和原图随机模式一样由随机建造给出
function showDialog(title, buttons, foot = '') {
  showModal(`<div class="w3dlg"><h2>${title}</h2>${buttons.map((b, i) => `<button class="w3btn" data-i="${i}">${b.text}</button>`).join('')}
    <div class="w3hint">${foot}</div></div>`);
  $('modal-box').classList.add('dlg');
  fitDialog();
  const hint = $('modal-box').querySelector('.w3hint');
  $('modal-box').querySelectorAll('.w3btn').forEach(el => {
    const b = buttons[+el.dataset.i];
    el.onmouseenter = () => { hint.innerHTML = b.hint || foot; };
    el.onmouseleave = () => { hint.innerHTML = foot; };
    el.onclick = () => { SFX.ui('bigClick'); b.fn(); };
  });
}
// 对话框的选项一律单行：框已经撑到最宽还放不下时，所有按钮一起缩小字号（保持一致），最小 11px，再不够才用省略号
function fitDialog() {
  const btns = [...$('modal-box').querySelectorAll('.w3dlg .w3btn')];
  if (!btns.length) return;
  for (let fs = 15; fs >= 11; fs -= 0.5) {
    btns.forEach(b => { b.style.fontSize = fs + 'px'; b.style.letterSpacing = fs < 13 ? '0' : ''; });
    if (btns.every(b => b.scrollWidth <= b.clientWidth)) break;
  }
}
window.addEventListener('resize', () => { if (!$('modal').classList.contains('hidden')) fitDialog(); });
function showStart() {
  const start = mode => { newGame(mode); hideModal(); resize(); clampCam(); uiDirty(); };
  const intro = () => showDialog('玩法简介', [{ text: '返回', fn: pickMode }],
    `怪物沿"回"字形双环路线<b>永远绕圈</b>，不会漏到基地。<b>场上怪物超过 40 只即失败</b>。每波按时出怪，不管上一波清没清完。<br><br>
    选中<b>守卫者</b>（F1），点击地面让它移动；在右下角命令面板里打开<b>建造</b>，选塔后点地面，守卫者会走过去建造。拖动画面或点击小地图移动镜头，滚轮缩放。`);
  const pickMode = () => showDialog('选择游戏模式', Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => ({
    text: `${m.name}（${m.short}）`, hint: m.desc, fn: () => start(k),
  })).concat([
    { text: '演示：前两波', hint: MODES.demo.desc, fn: () => start('demo') },
    { text: '玩法简介', hint: '怎么玩、怎么操作', fn: intro },
  ]), '把鼠标移到选项上查看说明');
  pickMode();
}
function showHelp() {
  const rows = Object.entries({ 普通: 'normal', 穿刺: 'pierce', 魔法: 'magic', 混乱: 'chaos' }).map(([cn, k]) => {
    const r = D.damage[k];
    return `<tr><th>${cn}</th>${[1, 2, 0, 6].map(i => `<td>${Math.round(r[i] * 100)}</td>`).join('')}</tr>`;
  }).join('');
  const was = G.paused; G.paused = true;
  showModal(`<h2>说明</h2>
    <p><b>失败</b>：场上怪物数 &gt; 40。<b>胜利</b>：撑过 48 波后，在 300 秒内击杀最终 BOSS（龙 + 魔王）。</p>
    <p><b>操作</b>：按住 Shift 下命令可以排队（连续建造多座塔）；F1 选中守卫者，F2 选中英雄；守卫者选中时点击 / 右键地面 = 移动；命令面板的按钮都有热键（Q W E R / A S D F …），Esc 返回或取消；方向键或拖动画面移动镜头，滚轮缩放，点击小地图跳转；空格让镜头对准选中单位；P 暂停。</p>
    <p><b>护甲系数</b>（%，原图任务面板原文）：</p>
    <table><tr><th>攻击＼护甲</th><th>抗性</th><th>魔法</th><th>物理</th><th>神圣</th></tr>${rows}</table>
    <p>护甲减伤 = 护甲×0.02 /（1 + 护甲×0.02）。腐蚀塔、减防光环可以把护甲打成负数，负护甲会增伤。</p>
    <p><b>精英怪</b>：每只怪 1/55 概率成为精英（粉色外圈），带一种 900 范围的光环。击杀得 1~3 木材；由英雄塔击杀时，英雄所选属性 +1。</p>
    <p><b>资源</b>：起手 2000 金、5 木；12 木 = 1 人口；1 木 = 300 金。回收塔返还 100% 金币。</p>
    <p><b>死亡之指</b>：守卫者的技能（热键 X），对 800 范围内的一个敌人使用，直接杀死它；BOSS 只扣一部分生命。冷却 90 秒，耗 5 点魔法（守卫者魔法上限 10）。</p>
    <p><b>商店</b>：地图中央，守卫者走到 ${RULE.shopReach} 范围内选中商店购买：1 个木材（500 金，冷却 30 秒）、10 个木材（5000 金，冷却 300 秒）、魔力卷轴（英雄塔 +120 魔法）、知识之书（英雄塔随机属性 +10）、天赋卷轴（15 木，MAX 光环塔激活基础天赋，开局 1200 秒后开放）。三种卷轴买下后放进守卫者的<b>物品栏</b>（6 格），选中守卫者点物品（或小键盘 7 8 4 5 1 2），再点目标塔，守卫者走到施法距离内使用。复制 / 收购卷轴要对队友使用，单人用不了。</p>
    <p><b>兔子</b>：每个 BOSS 波（10/20/30/40 波、最终波）开始 ${RULE.rabbitDelay} 秒后，地图随机位置出现一只兔子（小地图粉点），${RULE.rabbitLife} 秒后消失。守卫者走到它 ${RULE.rabbitReach} 范围内，选中兔子就能用<b>当局成就</b>买道具：4 种塔类之球（重新随机建造栏的某一类塔）、5 个木材、魔法药水、知识药水。当局成就开局 ${RULE.startAch} 点，每次 Perfect +${RULE.achPerPerfect}；守卫者的<b>兔子卷轴</b>（${RULE.rabbitScrollAch} 成就）可以额外召唤一次兔子。</p>
    <p><b>英雄塔</b>：每次随机建造给出 1 个英雄塔（和原图随机模式一样），1500 金 + 5 木材 + 4 人口，全场唯一，建造后不能回收。建成时随机给出力量 / 敏捷 / 智力的成长值（合计 10），每次升级按成长值加属性；属性选择决定杀精英怪 +1 的属性和满级后升级 +3 的属性。升级要 等级×100 金 + 200 魔法（英雄每击杀 +2 魔法）。学技能：第 1 个免费；第 2/3/4 个分别要 18/36/54 木材，且力量 ≥ 80/160/240。</p>
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
    zoomStep(el);
    const pan = 1400 / G.cam.zoom * el;
    if (keys.has('ArrowLeft')) G.cam.x -= pan; if (keys.has('ArrowRight')) G.cam.x += pan;
    if (keys.has('ArrowUp')) G.cam.y += pan; if (keys.has('ArrowDown')) G.cam.y -= pan;
    draw(); renderTop(); updateCursor(); updateCooldowns(); drawPortrait();
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
window.__dbg = { get G() { return G; }, NODES, EDGES, kill, hurt, spawnMonster, FXS, buildTower, upgradeTower, learnSkill, heroLevelUp, step, canPlace, newGame, monstersAlive, towerStats, rerollBuild, orderBuild, orderMove, castSkill, spawnRabbit, buyRabbit, RABBIT_SHOP, SHOP, SHOP_ITEMS, buyShop, orderFinger, KITS, towerAS, towerAtk, effArmor, applyAuras, sellTower, select, hurt, buildCmds, newTower, attack, bounceXfer };
})();
