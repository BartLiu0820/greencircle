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
  // 原图的当局成就：开局「拒绝逃跑」+5、按平台账号的至尊积分 +1~10（至尊菜鸟~至尊王者），每次 Perfect +1。
  // 这里用本地玩家档案代替平台账号（见下面的 PROFILE），账号成就点数按档位换开局当局成就
  startAch: 5, achPerPerfect: 1, rabbitLife: 60, rabbitReach: 600, rabbitScrollAch: 20,
  heroAch: 10,               // 英雄塔（随机模式 17 个）要 10 点当局成就才能建，建成扣 10 点（BMX / BQx 等建造触发器：H3 >= 10，H3 - 10）
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

// ---------------------------------------------------------------- 地图（原图 8 人布局：世界坐标就是 WC3 地图坐标）
// 路网、出怪口、能不能建造、镜头范围都照原图：tools/war3_map.py 从地图包导出寻路图（wpm）、地块（w3e）、树（doo）和区域（assets/w3map.js）
const W3MAP = window.W3_MAP;
const rectMid = k => { const [a, b, c, d] = W3MAP.rects[k]; return [(a + c) / 2, (b + d) / 2]; };
// 路中线（原图路面 256 宽，寻路图上不能建造的一条 384 宽）：外环 ±3840、内环 ±2816、中心 4 条支路 ±1792 / ±768、四角出怪路 ±4864。
// 节点名是原图的区域名（war3map.j 的 Rect）：怪走进区域时被下令走向下一个区域
const RO = 3840, RI = 2816, RC = 1792, RS = 768, RG = 4864;
const NODES = {
  // 外环、内环（四角和四边中点）
  L: [-RO, RO], Z: [0, RO], Y: [RO, RO], k: [RO, 0], j: [RO, -RO], P: [0, -RO], O: [-RO, -RO], M: [-RO, 0],
  S: [-RI, RI], l: [0, RI], W: [RI, RI], h: [RI, 0], g: [RI, -RI], d: [0, -RI], c: [-RI, -RI], T: [-RI, 0],
  // 四角出怪口 → 拐点 → 外环角
  I: [-RG, rectMid('I')[1]], K: [-RG, RO], p: [rectMid('p')[0], RG], X: [RO, RG], m: [RG, rectMid('m')[1]], i: [RG, -RO], o: [rectMid('o')[0], -RG], N: [-RO, -RG],
  // 中心四个出怪口 → 拐点 → 内环边上的路口（R / V / f / b 在内环上，内环的怪路过时直行）
  r: [-RS, RS], Q: [-RC, RS], R: [-RC, RI], q: [RS, RS], U: [RS, RC], V: [RI, RC], n: [RS, -RS], e: [RC, -RS], f: [RC, -RI], u: [-RS, -RS], a: [-RS, -RC], b: [-RI, -RC],
};
const EDGES = [
  ['L', 'Z'], ['Z', 'Y'], ['Y', 'k'], ['k', 'j'], ['j', 'P'], ['P', 'O'], ['O', 'M'], ['M', 'L'],
  ['S', 'R'], ['R', 'l'], ['l', 'W'], ['W', 'V'], ['V', 'h'], ['h', 'g'], ['g', 'f'], ['f', 'd'], ['d', 'c'], ['c', 'b'], ['b', 'T'], ['T', 'S'],
  ['M', 'T'], ['Z', 'l'], ['k', 'h'], ['P', 'd'],
];
// 原图 8 个出怪口，顺序是 Qu[1..8]（出怪器 wv 依次在 I p m o r q n u 刷怪，BOSS 波"Qu[随机]"也按这个编号）。
// 开几个口由参与人数决定：N 人开前 N 个（单人只开左上角 I；8 人全开，和原图一样）
const GATES = [['I', 'K', 'L'], ['p', 'X', 'Y'], ['m', 'i', 'j'], ['o', 'N', 'O'], ['r', 'Q', 'R'], ['q', 'U', 'V'], ['n', 'e', 'f'], ['u', 'a', 'b']];
const MAX_PLAYERS = GATES.length;
const ADJ = {};
for (const [a, b] of EDGES) { (ADJ[a] = ADJ[a] || []).push(b); (ADJ[b] = ADJ[b] || []).push(a); }
const ROAD_SEGS = EDGES.concat(GATES.flatMap(([a, b, c]) => [[a, b], [b, c]])).map(([a, b]) => [NODES[a], NODES[b]]);
const GATE_POS = GATES.map(g => NODES[g[0]]);
const ROAD_HALF = 128;   // 路宽一半
const SHOP = { isShop: true, shop: 'main', name: '商店', x: 0, y: 128 };            // 原图 CreateUnit(Player(15),'u00L',0,128)
// 商店两边的三个商人（原图 CreateUnit(Player(15), …, y=128)）：守护宗师（成就道具）、许愿商人、宠物商人。模型照单位数据（缩放 modelScale）
const MASTER = { isShop: true, shop: 'master', name: '守护宗师', sub: '中立 · 成就道具', x: 576, y: 128, mdx: 'units/critters/villagerman1/villagerman1.mdx', scale: 2.1 };
const WISHER = { isShop: true, shop: 'wish', name: '许愿商人', sub: '中立 · 用许愿点换塔', x: 1088, y: 128, mdx: 'units/critters/villagerwoman/villagerwoman.mdx', scale: 2.1 };
const PETSHOP = { isShop: true, shop: 'pet', name: '宠物商人', sub: '中立 · 宠物', x: -576, y: 128, mdx: 'units/critters/highelfpeasant/highelfpeasant.mdx', scale: 2.0 };
const SHOPS = [SHOP, MASTER, WISHER, PETSHOP];
const WORLD = 6016;                                     // 可玩区域 94×94 格（w3i），±6016
const CAM_LIM = W3MAP.camera;                           // 镜头中心的范围（w3i 的镜头边界）
// 寻路图：32 单位一格，"不能建造"的位图（不能行走的地图边界也算）
const PATHING = (() => {
  const p = W3MAP.pathing, bin = atob(p.nobuild), bits = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bits[k] = bin.charCodeAt(k);
  return { n: p.n, cell: p.cell, origin: p.origin, nobuild: (i, j) => i < 0 || j < 0 || i >= p.n || j >= p.n || (bits[(j * p.n + i) >> 3] >> ((j * p.n + i) & 7) & 1) === 1 };
})();

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

// ---------------------------------------------------------------- 玩家档案（代替原图的平台存档）
// 开局先输入玩家名称，每个名称一份档案存在本机（localStorage），记账号成就点数、局数、通关数、最高波数。
// 账号成就随游戏进展获得：每到达新的一波 +1、每次 Perfect 再 +1、通关 +30（演示模式不算），获得时立即存档，中途退出也不丢。
// 开局当局成就 = 拒绝逃跑 5 + 档位加成，档位名沿用原图的至尊称号（原图按平台至尊积分 50~8000 给 +1~+10）
const PROFILE = { key: 'gc.profiles', wave: 1, perfect: 1, clear: 30 };
const ACH_TIERS = [[10, '至尊菜鸟'], [30, '至尊学徒'], [60, '至尊达人'], [100, '至尊新秀'], [150, '至尊精英'],
  [220, '至尊高手'], [300, '至尊宗师'], [400, '至尊大神'], [520, '至尊无双'], [660, '至尊王者']];
const profiles = { all: {}, last: '' };
try { Object.assign(profiles, JSON.parse(localStorage.getItem(PROFILE.key) || '{}')); } catch (e) { /* 隐私模式等：只在本局内存里记 */ }
const saveProfiles = () => { try { localStorage.setItem(PROFILE.key, JSON.stringify(profiles)); } catch (e) { /* 忽略 */ } };
const profileOf = name => profiles.all[name] || (profiles.all[name] = { pts: 0, games: 0, clears: 0, best: 0 });
// 档位：返回 { lv: 0~10, name, next }，lv 就是开局额外的当局成就
function achTier(pts) {
  let lv = 0;
  while (lv < ACH_TIERS.length && pts >= ACH_TIERS[lv][0]) lv++;
  return { lv, name: lv ? ACH_TIERS[lv - 1][1] : '无称号', next: ACH_TIERS[lv] ? ACH_TIERS[lv][0] : null };
}
function earnAch(n, why) {
  if (!G || !G.player || G.mode === 'demo' || n <= 0) return;
  const p = profileOf(G.player);
  p.pts += n; G.earned += n; saveProfiles();
  if (why) msg(`${why}：账号成就 +${n}（${G.player} 共 ${p.pts} 点）`);
}

// ---------------------------------------------------------------- 游戏状态
let G;
// players：参与人数（1~8）。单人是 1；以后接联机时由房间里的玩家数决定。人数决定开几个出怪口（GATES 的前 N 个）和场上怪物上限（每人 40）
function newGame(mode, players = 1, player = null, bots = false) {     // player：开局输入的玩家名称（页面打开时背景里那局是 null，不记档案）；bots：空位放模拟队友
  const np = clamp(Math.round(players), 1, MAX_PLAYERS), [sx0, sy0, sx1, sy1] = W3MAP.rects.s, bx = rnd(sx0, sx1), by = rnd(sy0, sy1);
  G = {
    mode, players: np, gates: GATES.slice(0, np).map((g, k) => k),
    c9: Array.from({ length: MAX_PLAYERS }, (_, k) => k < np ? RULE.capPerPlayer : 0),    // 原图 C9[1..8]：在场玩家 40，空位 0；上限 M3 = 它们的和
    interval: MODES[mode].interval, hpScale: MODES[mode].hp, t: 0, phase: 'prep', timer: MODES[mode].prep || RULE.prepTime, wave: 0,
    gold: MODES[mode].gold || RULE.startGold, wood: MODES[mode].wood || RULE.startWood, foodCap: MODES[mode].food,
    monsters: [], towers: [], fx: [], zones: [], spawners: [], timeouts: [],
    perfect: 0, score: 1000, kills: 0, speed: 1, paused: false,
    build: [], rerolls: 0, placing: null, selected: null, hero: null, heroChoice: null,
    bossRule: null, final: null, nextId: 1, hint: '准备阶段：选中守卫者，在出怪口附近建塔！',
    // 循环圈守卫者：无敌、移速 500、全图闪烁 (CD 1 秒)。原图所有玩家的守卫者都出生在地图上方的区域 s
    builder: { isBuilder: true, x: bx, y: by, speed: 500, order: null, blinkCd: 0, mana: FOD.maxMana, fodAt: 0 },
    inv: Array(6).fill(null),
    cam: { x: bx, y: by - 600, zoom: 2.4 },
    menu: 'main', pending: null,
    player, earned: 0, ach: RULE.startAch, rabbit: null, rabbitScroll: false, buys: {}, itemCd: {},
    waveVars: {}, next: null, carryHint: null, sc: null, curUnit: null, waveHook: null, waveNote: '', finalCountdown: false,
    k7: rint(1, 2),          // 原图开局随机：30 波出亡灵飞艇（1）还是地精飞艇（2）
    mem: {},                 // 主塔回收时记下的技能等级和魔法，再建同一种主塔时恢复（原图 D1~D7、DK/DL/DM 等全局变量）
    bounce: { atk: 0, as: 0, talent: false, bolt: 1 },   // 弹跳塔的玩家科技：提升攻击 R000 / 攻速 R001、弹跳天赋 R00P、MAX 回收时记下的灵魂重击等级（Oq）
    me: 0, roster: makeRoster(np, bots, player),         // 玩家名单（见"玩家名单"一节）：本机是 Player(0)
    vote: null, voteAt: 0, liked: false,                 // 投票踢人（Ea / Sq 冷却 59 秒）、本局点过赞（H5）
    items: [], wish: 0, wishDrops: 0, talentStock: 4, candyDrop: false,   // 地上的物品；许愿点（Ou）；BOSS 掉许愿石次数（Lx）；天赋秘籍库存（FQ）；兔子掉过糖果（MF）
    pet: null, petFx: { gq: 0, g3: 0, k4: 0, kx: 0, kv: 0, lx: 0, r1: 0, go: 0, hj: 0, kr: 0 },   // 宠物（Rx）和宠物给塔 / 英雄的加成（Gq、G3、K4、Kx、KV、LX、图腾 +9% 攻速 A0R0、Go、Hj、Kr）
    wild: [], catchTries: 0, thief: false,               // 野生宠物（中立被动，用糖果抓）；抓宠累计次数（LT）；小偷出过（Lc）
    wispAt: 100, dropAt: 150, horseAt: 2,                // 小精灵每 100 秒检查、地上每 150 秒掉糖果或金币、马每 2 秒发金
  };
  seatBots();
  G.selected = G.builder;
  // 开局当局成就：拒绝逃跑 +5，再按账号成就档位 +0~10（原图 qi：至尊称号 +1~10、拒绝逃跑 +5）。演示模式固定剑神，直接给够建英雄的成就
  const tier = player && mode !== 'demo' ? achTier(profileOf(player).pts) : { lv: 0 };
  G.ach += mode === 'demo' ? RULE.heroAch : tier.lv;
  if (player && mode !== 'demo') { const p = profileOf(player); p.games++; saveProfiles(); }
  FXS.clear();
  rerollBuild(true);
  rollFn(WR.start); refreshHint();                 // 准备阶段就预告第 1 波
  SFX.startMusic();
  if (player && mode !== 'demo') {
    msg(`完成成就：拒绝逃跑　当局成就 +${RULE.startAch}`, 10);
    if (tier.lv) msg(`${player} 完成成就：${tier.name}　当局成就 +${tier.lv}`, 10);
  }
}

// ---------------------------------------------------------------- 建造栏
// 原图随机建造（war3map.j 里 Qf / Hd / He / Hf / Hh / Hg / H7 七个随机数）：1 主塔、1 原始塔、1 光环塔、1 新辅助（4 大辅助 + 4 巫系）、
// 1 小辅助、1 另类塔、1 全场唯一塔；另外 Hc = GetRandomInt(1,17) 从 17 个英雄塔里放开 1 个（有"英雄赞助"是 34 个，平台功能，不做）
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
  const hc = rint(1, 17);
  G.heroChoice = MODES[G.mode].hero || Object.keys(D.heroes).find(n => D.heroes[n].hc === hc);
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
  if (m.dead || !(amount > 0) || m.hitOnly) return 0;   // 同时挡掉 NaN；小偷的生命只按挨打次数算
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
  const pl = G.roster[pidOf(src)] || me();           // 击杀算在凶手的玩家头上（原图排行榜 Cp[凶手玩家] +1，赏金也给他）
  pl.kills++;
  addGold(pl, Math.round(m.bounty));
  if (pl.local) G.kills++;
  if (src) {
    src.kills = (src.kills || 0) + 1;
    const owner = src.owner || src;
    if (owner.isHero) {
      owner.mana = Math.min(owner.maxMana(), owner.mana + 2);                      // 英雄（和它的召唤物）每击杀 +2 魔法
      const def = HERO_DEF[owner.heroName]; if (def.onKill) def.onKill(owner, m, src);
    } else if (owner.fam && G.towers.includes(owner)) towerKilled(owner, m);       // 塔的魔法值（功勋）
  }
  if (m.elite) {
    const w = rint(1, 3); G.wood += w;
    const owner = src && (src.owner || src);
    if (owner && owner.isHero) {
      const k = growthStat(owner); owner.stat[k] += 1; msg(`英雄击杀精英怪：${statCN(k)} +1，木材 +${w}`);
      const def = HERO_DEF[owner.heroName]; if (def.onElite) def.onElite(owner, src);
    }
    else msg(`击杀精英怪：木材 +${w}`);
    const bm = G.towers.find(o => o.bmax);         // 杀死精英怪 20% 概率升级弹跳塔 MAX 的灵魂重击
    if (bm && bm.bolt < BOUNCE.bolt.length && Math.random() < 0.2) { bm.bolt++; msg(`弹跳塔 MAX 灵魂重击升到 ${bm.bolt} 级`); }
  }
  if (m.onDeath) m.onDeath(src);
  bossStone(m);
  SFX.ent('unit:' + m.uid, 'death', { x: m.x, y: m.y });
  const a = (metaOf(m) || {}).actions?.death;       // 按登记判断，不等精灵图加载（3D 模型画尸体时精灵图可能从没请求过）
  if (a) { addFx({ kind: 'corpse', ent: { uid: m.uid, face: m.face, elite: m.elite, boss: m.boss }, x: m.x, y: m.y, t0: G.t, life: a.frames / a.fps + 1.2 }); }
  else addFx({ kind: 'death', x: m.x, y: m.y, r: m.r, life: 0.35, color: ARMOR_COLOR[m.type] });
}

// ---------------------------------------------------------------- 怪物
// opt.gate：第几个出怪口（GATES 的下标，默认 0 = 左上角 I）；opt.at：从出怪路的第几个点出发（原图有的单位直接刷在拐点 K / Q 等区域）
function spawnMonster(id, opt = {}) {
  const u = D.units[id];
  if (!u) return null;
  const path = GATES[opt.gate || 0].slice(opt.at || 0), [x, y] = NODES[path[0]];
  const hpMul = (1 + RULE.hpPerWave * G.wave) * G.hpScale * (opt.hpMul || 1);
  const m = {
    id: G.nextId++, uid: id, name: u.name, x: x + rnd(-150, 150), y: y + rnd(-150, 150),
    maxHp: u.hp * hpMul, hp: u.hp * hpMul, armor: u.armor, type: u.armorType, speed: u.speed || 250,
    bounty: u.bounty, regen: u.regen || 0, path: path.slice(1), prev: null, cur: path[0], lane: rnd(-0.75, 0.75),
    slow: 0, slowUntil: 0, stunUntil: 0, shred: 0, shredUntil: 0, armorDown: 0, armorDownUntil: 0,
    auraFocus: 0, auraArmorDown: 0, auraSlow: 0, auraSpeed: 0, auraRegen: 0, burn: null, dots: [],
    deb: {}, ignoreArmorUntil: 0, frozenUntil: 0, expel: null,       // deb：限时减甲 / 加速（{ v, until }）；expel：被驱逐（遣返用）
    boss: !!opt.boss, r: opt.boss ? 90 : 55, elite: null, gate: opt.gate || 0, at: opt.at || 0,
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
// 遣返（war3map.j 的 BHC）：带驱逐状态的怪走进 L、Y 两个转弯口时，驱逐塔的驱逐 85%、巫师塔（光明）的驱逐 95% 概率被传回 1 号出怪口（Uk[1] = I）。
// 魔王不会被遣返
const REPATRIATE_AT = new Set(['L', 'Y']);
function repatriate(m) {
  const e = m.expel;
  if (!e || e.until <= G.t || m.uid === 'Udea' || !REPATRIATE_AT.has(m.cur) || Math.random() >= e.p) return false;
  FXS.ring(m.x, m.y, 140, '#9fe3ff', 0.45, 4);
  const g = GATES[0], [x, y] = NODES[g[0]];
  Object.assign(m, { x: x + rnd(-150, 150), y: y + rnd(-150, 150), cur: g[0], prev: null, path: g.slice(1), expel: null });
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
  if (m.neutral) return wander(m, dt);
  if (!m.target) m.target = nextNode(m);
  if (G.t < m.stunUntil) return;
  let spd = m.speed * (1 + m.auraSpeed + debuff(m, 'expelSpeed')) * (1 - Math.max(m.slow * (G.t < m.slowUntil ? 1 : 0), m.auraSlow)) * (1 - Math.min(0.95, m.heroSlow || 0));
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
function towerFood(fam) { return fam === 'hero' ? D.heroes[G.heroChoice].food : fam === 'ancient' ? 1 : Math.max(0, D.towers[fam].levels[0].food || 0); }
function foodUsed() { return G.towers.reduce((s, t) => s + (mine(t) ? t.food || 0 : 0), 0); }
// 建造网格：一格 64（= 2×2 个寻路格），格子边线在 64 的倍数上（和原图寻路图里路、出怪口的边线对齐），所以格子中心是 64k+32；
// 塔占 3×3 格，中心对齐格子中心
const CELL = 64, TOWER_CELLS = 3, GRID_OFF = CELL / 2;
const FOOT_HALF = TOWER_CELLS * CELL / 2;                         // 96
// 地形本身能不能建（不看塔）：照原图寻路图，格子里的 2×2 个寻路格都能建才行（路、出怪口围栏、中央、地图边界都不能建）
function cellBuildable(cx, cy) {
  const i = Math.floor((cx - CELL / 2 - PATHING.origin) / PATHING.cell), j = Math.floor((cy - CELL / 2 - PATHING.origin) / PATHING.cell);
  return !PATHING.nobuild(i, j) && !PATHING.nobuild(i + 1, j) && !PATHING.nobuild(i, j + 1) && !PATHING.nobuild(i + 1, j + 1);
}
// 格子是否被塔（或排队中的建造命令）占了
function cellTaken(cx, cy, withOrders) {
  for (const t of G.towers) if ((t.cat !== 'summon' || t.solid) && !t.isHero && Math.abs(cx - t.x) < FOOT_HALF && Math.abs(cy - t.y) < FOOT_HALF) return true;
  if (G.hero && Math.abs(cx - G.hero.home.x) < FOOT_HALF && Math.abs(cy - G.hero.home.y) < FOOT_HALF) return true;   // 英雄塔占的是原位置（狂牛瞬移后也一样）
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
  const f = D.towers[fam], n = fn => G.towers.filter(t => mine(t) && fn(t)).length;
  // 弹跳塔不占主塔名额（原图要求的是 n01U，不是 ovln）：随机模式最多 3 座（Bbt），有弹跳塔 MAX 后不能再建（n01U 被删掉）
  if (fam === '弹跳塔') return G.towers.some(t => mine(t) && t.bmax) ? '拥有弹跳塔 MAX 后不能建造弹跳塔' : n(t => t.fam === fam) >= 3 ? '只允许建造 3 个弹跳塔' : null;
  if (f.cat === 'main' && G.towers.some(t => mine(t) && t.cat === 'main' && t.fam !== '弹跳塔')) return '只能建造一个主塔';
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
  if (fam === 'ancient') return G.hero && plantAncient(G.hero, x, y);       // 古树：种召唤古树
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
  if (G.hero && HERO_DEF[G.hero.heroName].towerUpgraded) HERO_DEF[G.hero.heroName].towerUpgraded(G.hero, t);   // 幻影：暴击 / 冰霜 / 重击塔升到 3 级
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
  const cost = fam === 'hero' ? D.heroes[G.heroChoice].gold : fam === 'ancient' ? 500 : D.towers[fam].levels[0].gold;
  const food = towerFood(fam);
  if (G.gold < cost) return msg('金币不足'), false;
  if (fam === 'hero' && G.wood < D.heroes[G.heroChoice].wood) return msg('木材不足'), false;
  if (foodUsed() + food > G.foodCap) return msg('人口不足（12 木材可买 1 人口）'), false;
  const why = fam === 'hero' ? heroBlock() : fam === 'ancient' ? null : buildBlock(fam);
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
    if (o.target.dead || (o.kind === 'use' && !itemTarget(o.target)) || (o.kind === 'pick' && !G.items.includes(o.target))) { b.order = (b.queue && b.queue.shift()) || null; uiDirty(); return; }
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
    if (o.kind === 'pick') pickUp(o.target);
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
  if (G.pet) { const a = rnd(0, TAU); G.pet.e.x = b.x + Math.cos(a) * 100; G.pet.e.y = b.y + Math.sin(a) * 100; }   // 原图 Bff：宠物跟着闪烁
  addFx({ kind: 'ring', x: b.x, y: b.y, r: 120, life: 0.4, color: '#c48bff' });
}

function towerStats(t) {
  if (t.isHero) return heroStats(t);
  const lv = curLevel(t);
  // 目标数只对弹射武器有意义：弹跳塔、通灵塔（武器类型 mbounce，3 个目标）。毒塔单位表里的 targCount 是普通飞弹，原图只打一个目标
  const targets = t.fam === '弹跳塔' || t.fam === '通灵塔' ? lv.targets || 1 : 1;
  const dmg = lv.dmg + (t.fam === '弹跳塔' ? BOUNCE.atkStep * G.bounce.atk : 0);     // 弹跳提升攻击（R000）加的是基础攻击
  if (t.stats) { const x = t.stats(t); return { dmg: x.dmg ?? dmg, cd: (x.cd ?? lv.cd) / Math.min(AS_CAP, 1 + (x.as || 0)), range: lv.range, atk: lv.atk, targets }; }   // 英雄召唤物：攻击随英雄属性 / 科技变
  return { dmg, cd: lv.cd, range: lv.range, atk: lv.atk, targets };
}
// WC3 的塔锁定目标：一直打同一个，直到它死掉或走出射程才重新找最近的（腐蚀、减速、重击就集中在一个目标上）
function lockTarget(t, r) {
  const m = t.target;
  if (m && !m.dead && !(m.invisUntil > G.t) && dist2(t.x, t.y, m.x, m.y) <= r * r) return m;
  return (t.target = nearest(t.x, t.y, r));
}
function inRange(x, y, r) { return G.monsters.filter(m => !m.dead && dist2(x, y, m.x, m.y) <= r * r); }
function nearest(x, y, r) {
  let best = null, bd = r * r;
  for (const m of G.monsters) { if (m.dead || m.invisUntil > G.t) continue; const d = dist2(x, y, m.x, m.y); if (d <= bd) { bd = d; best = m; } }   // 疾风步隐身的找不到
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
// WC3 的攻速加成是一个总和（敏捷、技能、光环、嗜血、科技一起加），封顶 +400%（攻击间隔最多缩短到 1/5）。
// 英雄 / 召唤物自身的攻速已经算进 towerStats 的 cd（ownAS），这里只乘上光环等加成，再按总和封顶
const AS_CAP = 5;
function ownAS(t) {
  if (t.isHero) { const def = HERO_DEF[t.heroName], x = def.stats ? def.stats(t) : {}; return 1 + t.stat.agi * 0.01 + t.asBonus + (x.as || 0); }
  return t.stats ? 1 + (t.stats(t).as || 0) : 1;
}
function towerAS(t) {
  const own = ownAS(t), add = Math.max(t.buffAS, t.selfAS || 0) + Math.max(bv(t, 'bloodlust'), t.selfAS2 || 0) + bv(t, 'fire') + (t.fam === '弹跳塔' ? BOUNCE.asStep * G.bounce.as : 0);
  return Math.min(AS_CAP, own + add) / Math.min(AS_CAP, own) * (1 - t.eliteAS);
}
//   神牛的神盾光辉（战鼓）和攻击光环叠加；古树的心灵之火另算
const towerAtk = t => (1 + Math.max(t.buffDmg, t.selfAtk2 || 0) + (t.selfAtk || 0) + bv(t, 'roar') + bv(t, 'divine') + (t.drums || 0) + bv(t, 'innerfire')) * (1 - t.eliteWeak);

function towerUpdate(t, dt) {
  if (t.cat === 'aura') return;
  const kit = KITS[t.fam];
  if (t.isHero) heroTick(t, dt);
  if (t.maxMana && t.manaRegen) t.mana = clamp(t.mana + t.manaRegen * dt, 0, t.maxMana);
  if (kit && kit.tick) kit.tick(t, dt);
  if (t.tick) t.tick(t, dt);
  const st = towerStats(t);
  t.atkMul = towerAtk(t);
  if (t.mobile) summonMove(t, dt, st.range);
  if (t.fam === '扫射塔') return sweepUpdate(t, dt, st);
  t.cdLeft -= dt * towerAS(t);
  if (t.cdLeft > 0) return;
  if (t.noAttack) { t.cdLeft = 0; return; }
  const target = lockTarget(t, st.range);
  if (!target) { t.cdLeft = 0; return; }
  if (target.onAttacked) target.onAttacked(t);            // 原图"单位被攻击"事件：小精灵疾风步、小偷掉东西
  t.cdLeft += st.cd;
  t.attacks++; t.atkT = G.t;
  if (G.hero && HERO_DEF[G.hero.heroName].anyAttack) HERO_DEF[G.hero.heroName].anyAttack(G.hero, t, target);   // 坦克的能量
  if (t.isHero) return heroAttack(t, target, st);
  attack(t, target, st);
}
// 会走动的召唤物（炎魔、水元素、骷髅）：射程里没有敌人就走向最近的敌人，但不离开英雄 leash 范围
function summonMove(t, dt, range) {
  if (nearest(t.x, t.y, range)) return;
  const o = t.owner, m = nearest(o.x, o.y, t.mobile.leash) || null;
  if (!m) return;
  const dx = m.x - t.x, dy = m.y - t.y, d = Math.hypot(dx, dy), step = Math.min(d - range * 0.8, t.mobile.speed * dt);
  if (step > 0) { t.x += dx / d * step; t.y += dy / d * step; t.face = Math.atan2(dy, dx); }
}

// 普通塔一次攻击 (按 WC3 技能代码解释附加效果)
function attack(t, target, st) {
  const lv = curLevel(t), kit = KITS[t.fam];
  let dmg = st.dmg * t.atkMul;
  // 致命一击（剑圣塔的致命一击由它的技能包按成长模式处理）
  const crit = !(kit && kit.ownCrit) && abil(lv, 'AOcr');
  if (crit && Math.random() * 100 < (crit.A || 25)) { dmg *= crit.B || 3; addFx({ kind: 'text', x: target.x, y: target.y, text: '暴击', life: 0.6, color: '#ffd257' }); }
  // 英雄的召唤物：马甲只跑触发器（silent）；致命一击；出手时的触发器
  if (t.silent) { shot(t, target); return t.onLaunch(t, target); }
  const sc = t.crit && t.crit();
  if (sc && Math.random() < sc[0]) { dmg *= sc[1]; popText(target.x, target.y, sc[1] + '倍', '#ffd257'); }
  if (t.onLaunch) t.onLaunch(t, target);
  // 目标集合
  let targets = [target];
  if (t.fam === '弹跳塔' || t.fam === '通灵塔') targets = chainTargets(target, st.targets, 500);   // 弹射；通灵塔武器是 mbounce：3 个目标、弹射范围 500
  if (lv.bounce) targets = chainTargets(target, lv.bounce, lv.jump || 500);
  if (lv.multi) targets = [target].concat(inRange(t.x, t.y, lv.multiR || st.range).filter(m => m !== target).slice(0, lv.multi));   // 弹幕：额外目标
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
    if (lv.splash) splash(t, c, lv.splash, dmg, st.atk);
  };
  const land = (m, primary) => (hit, x, y) => {
    if (hit) { hurt(hit, dmg, st.atk, t); onHitEffects(t, lv, hit, st); frozenBurst(hit); if (t.onHit) t.onHit(t, hit); }
    if (primary) { area(hit, x, y); SFX.ent(sndKey(t), 'hit', { x, y }); }
  };
  SFX.ent(sndKey(t), 'launch', { x: t.x, y: t.y });
  if (t.fam === '弹跳塔' || t.fam === '通灵塔' || lv.bounce) {     // 依次弹到下一个目标
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
    hi: t => Math.max(Math.floor(t.mana), godStep() * t.god.cap + curLevel(t).dmg),
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
        costCmd(t, 'W', '增加攻击上限', `攻击上限 ${g.cap * godStep()} → ${(g.cap + 1) * godStep()}（另加塔的攻击力 ${curLevel(t).dmg}）${G.petFx.gq ? '（宠物加成：每级 ' + godStep() + '）' : ''}<br>10 级起每次还要 1000 魔法；回收返还每级 800 金`,
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
  // 全场唯一塔的技能等级：天赋卷轴 +1、天赋秘籍 +2（银行 +3）、宠物至尊天赋 +1（t.ulv，原图 SetUnitAbilityLevel(+n)）。数值取技能表 / w3a 的各级数据
  恐惧塔: {
    tick(t) {
      const [v, dur, cd] = UL.fear(t);
      if (!cdReady(t, 'howl') || !anyEnemy(t.x, t.y, 600)) return;
      setCd(t, 'howl', cd);
      for (const m of inRange(t.x, t.y, 600)) debuffM(m, 'fear', v, dur);
      FXS.nova(t.x, t.y, 600, '#c48bff', 0.6); SFX.spell('frostNova', { x: t.x, y: t.y });
    },
    info: t => { const [v, dur, cd] = UL.fear(t); return [`恐怖嚎叫${ulTxt(t)}：每 ${cd} 秒 600 范围敌人护甲 -${v}，持续 ${dur} 秒`]; },
  },
  火速塔: {
    tick(t) {
      const [v, dur, cd, r] = UL.fire(t);
      if (!cdReady(t, 'fire') || !anyEnemy(t.x, t.y, 1500)) return;
      setCd(t, 'fire', cd);
      for (const o of alliesNear(t.x, t.y, r)) giveBuff(o, 'fire', v, dur);
      FXS.nova(t.x, t.y, r + 100, '#ff8a3c', 0.5);
    },
    info: t => { const [v, dur, cd, r] = UL.fire(t); return [`火速${ulTxt(t)}：每 ${cd} 秒 ${r} 范围友军攻速 +${pctTxt(v)}，持续 ${dur} 秒`]; },
  },
  神力塔: {
    tick(t) {
      const [v, dur, cd] = UL.inner(t);
      if (!cdReady(t, 'inner') || !anyEnemy(t.x, t.y, 1500)) return;
      const c = alliesNear(t.x, t.y, 800).filter(o => o !== t && o.cat !== 'uniq' && !bv(o, 'divine'))
        .sort((a, b) => towerStats(b).dmg / towerStats(b).cd - towerStats(a).dmg / towerStats(a).cd)[0];
      if (!c) return;
      setCd(t, 'inner', cd);
      giveBuff(c, 'divine', v, dur);
      FXS.beam(t.x, t.y, 160, c.x, c.y, 160, '#ffe08a', 1.4, 0.4); FXS.ring(c.x, c.y, 160, '#ffe08a', 0.5, 3);
    },
    info: t => { const [v, dur, cd] = UL.inner(t); return [`神力${ulTxt(t)}：每 ${cd} 秒给附近攻击最强的一座塔 +${pctTxt(v)} 攻击，持续 ${dur} 秒`]; },
  },
  冰封塔: {
    tick(t) {
      const dur = UL.freeze(t);
      if (!cdReady(t, 'freeze') || !anyEnemy(t.x, t.y, 600)) return;
      setCd(t, 'freeze', 3);
      for (const m of inRange(t.x, t.y, 600)) { if (m.boss || m.neutral) continue; stun(m, dur); m.frozenUntil = G.t + dur; m.frozenBy = t; FXS.snow(m.x, m.y, 30, 0.4); }
      FXS.nova(t.x, t.y, 600, '#bff4ff', 0.5);
    },
    info: t => [`冰封${ulTxt(t)}：每 3 秒冰封 600 范围敌人 ${UL.freeze(t)} 秒；冰封的敌人被攻击时，范围 500 无视护甲伤害（每 0.2 秒一次）`],
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
    cmds(t) { const r = t.bank.rate, top = 10 + (t.ulv || 0); return [costCmd(t, 'Q', '提升金币利息', `当前每秒 ${r} 金 → ${r + 1} 金<br>回收返还木材`, { wood: r < top ? 8 : 0 }, () => { t.bank.rate++; }, { why: r >= top ? '已经是最高等级' : null })]; },
    info(t) { return [`利息：每秒 ${t.bank.rate} 金；${Math.ceil(t.bank.wood)} 秒后木材 +${t.mana >= 400 ? 2 : t.mana >= 100 ? 1 : 0}`]; },
    sell(t) { G.wood += Math.max(0, t.bank.rate - 1 - (t.ulv || 0)) * 8; },
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
// 原图随机建造（Hc = GetRandomInt(1,17)）每次放开 1 个英雄塔，D.heroes 的 hc 就是这个编号（tools/add_heroes.py）。
// 英雄塔是建筑（1500 金 + 5 木 + 4 人口），建成时换成英雄单位：全场唯一、无敌、不能移动、不能回收。
// 每个英雄的技能都按原图触发器实现（war3map.j）：HERO_KITS 是技能（学会后生效），HERO_DEF 是英雄本身的规则（攻击方式、计数器、命令）。
// 原图的主动技能几乎都是"攻击时自动施放"（EVENT_PLAYER_UNIT_ATTACKED 里 IssueImmediateOrder），冷却好了就放，所以这里都是自动的。
//
// 技能包字段（都可选）：
//   init(h) 学会时    onLaunch(h, tg) 每次攻击出手时    onAttack(h, hit) 主目标被打中时    tick(h, dt) 每帧    onKill(h, m, src) 英雄或它的召唤物杀敌
//   crit(h) → [概率, 倍数] / critChance + critMul 致命一击    canLearn(h) → 不能学的原因（第 5 个技能的额外条件）
//   up = { tip(h), why(h), cost(h) → { gold, mana }, apply(h) } 学会后"再次学习"（升级技能）    cdKey + cd(h) 命令面板显示冷却
const lvBy = (v, div, max) => clamp(Math.floor(v / div), 1, max);              // 原图 SetUnitAbilityLevel(属性 / div)：0 级无效，至少 1 级
const tiers = (v, steps, xs) => { for (let i = 0; i < steps.length; i++) if (v >= steps[i]) return xs[i]; return xs[steps.length]; };
const learned = (h, i) => h.learned.includes(i);
const cdOk = (h, k, cd) => { if (!cdReady(h, k)) return false; setCd(h, k, cd); return true; };
const pickIn = (x, y, r) => { const ms = inRange(x, y, r); return ms.length ? pick(ms) : null; };
const firstIn = (x, y, r) => G.monsters.find(m => !m.dead && dist2(x, y, m.x, m.y) <= r * r) || null;   // 原图 FirstOfGroup：最早出场的那个
const heroUnits = h => G.towers.filter(t => t.owner === h && t.cat === 'summon');
const countSum = (h, kind) => heroUnits(h).filter(t => t.kind === kind && (!t.until || t.until > G.t)).length;
// 英雄的召唤物 / 马甲：放进 G.towers，用普通塔的攻击逻辑（towerUpdate → attack），击杀算英雄的（英雄 +2 魔法）。
// lv：{ dmg, cd, range, atk, bounce（弹射个数）, jump（弹射距离）, multi（额外目标数，弹幕）, multiR, splash }；
// o：label / title（画面上的字和名字）、kind（计数用）、stats(s)（动态攻击数值）、onLaunch(s, tg)、onHit(s, m)、silent（马甲：不发弹道，只跑 onLaunch）、
//    mobile（会走动：追射程外最近的敌人，不离开英雄 leash 范围）、aura（{ kind, r, v } 给塔或敌人加光环）、solid（占建造格子）
function hsum(h, x, y, life, lv, o = {}) {
  return summon(h, { fam: '召唤', title: o.title || '召唤物', label: o.label || '召', x, y, until: life ? G.t + life : undefined,
    levels: [{ dmg: 0, cd: 1, range: 600, atk: 'normal', targets: 1, abils: [], ...lv }], ...o });
}
// ---- 各英雄的数值表（技能表 / war3map.w3a 的 1~10 级数据）
const JS = {   // 剑神
  storm: [20, 100, 300, 900, 1500, 2700, 3500, 5000, 12000, 30000],     // 剑刃风暴 A0I1：400 范围每秒伤害（等级 = 敏捷/24）
  mirror: [10, 25, 100, 200, 500, 1000, 2000, 5000, 10000, 20000],      // 剑刃风暴 2 A0I3：180 范围每秒伤害（等级 = 敏捷/20）
};
const HH = {   // 火魂
  burn: [40, 160, 800, 1500, 4500, 9000, 20000, 40000, 80000, 150000],  // 焚化之炎 A0EG（液体火焰）：每秒伤害（等级 = 力量/35）
  beasts: [3, 3, 3, 4, 4, 4, 5, 5, 5, 6], stamp: [50, 300, 600, 1000, 2000, 3000, 4000, 8000, 14000, 30000],   // 惊吓 A0E8（等级 = 智力/28）
  lava: [[20, 0.75], [145, 0.65], [600, 0.6], [2000, 0.55], [4000, 0.45], [10000, 0.3]], split: [10, 12, 14, 16, 18, 20],   // 炎魔 n03Q~n03H
  stomp: [10000, 20000, 40000, 80000, 120000],                          // 召唤火凤 A0FW：1000 范围伤害 + 晕 6 秒（等级 = 智力/100+1）
};
const ZS = {   // 战神
  berserk: [20, 300, 600, 1200, 1800, 2500, 4000, 6000, 12000, 24000], slow: [0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.5, 0.7, 0.9, 1.2],   // 狂战士 A0D3
  as: [0.4, 0.4, 0.4, 0.4, 0.65, 0.65, 0.7, 0.9, 1.2, 1.6],             // 马甲的 A0D9：友军攻速
  roar: [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0],            // 圣战士马甲的咆哮 A0D4（等级 = 力量/20）
  snipe: [2000, 4000, 8000, 16000, 32000, 64000, 120000, 240000, 360000, 480000],   // 狙击枪：风暴之锤 A0E7（等级 = 智力/25）
};
const SM = {   // 水魔
  lust: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 10, 1.1], lustDur: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3],   // 冰原力的嗜血 A0D0（9 级 10 倍，原图数据）
  armor: [40, 60, 80, 120, 200, 400],                                  // 暴风雪的减防光环 A0CR（等级 = 智力/60）
  ringR: [600, 630, 660, 690, 720, 750, 780, 810, 840, 900], ringV: [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.42, 0.44, 0.46, 0.5],   // 水魔环 A0D1
  elem: [[400, 40000, 0.4], [301, 20000, 0.6], [201, 5000, 0.7], [101, 1200, 0.8], [0, 180, 0.9]],   // 水元素：敏捷门槛、攻击、间隔
};
const DF = {   // 电法
  chain: [40, 200, 500, 1000, 2000, 4000, 8000, 15000, 25000, 40000, 70000], chainN: [6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 10],   // 闪电链 A0BI
};
const FS = {   // 风神
  lockDur: [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8],          // 刀风之锁的残废 A0I9
  rampCd: [12, 11, 10, 9, 8, 7, 6, 5], bandit: [0, 1, 2, 4, 7, 10, 15, 25, 50, 100],   // 狂风肆虐 A068 冷却 / 土匪的战鼓 A067
  hammer: [1, 2, 3, 4, 5, 6, 7, 8, 9, 999],                            // 风暴之锤 A0B5：额外目标
};
const YL = {   // 渔人：甲乙丙丁（普通 / Plus）
  fish: [
    { name: '鱼人甲', n: [50, 1.6, 400, 'normal', 4, 500, { kind: 'towerDmg', r: 1500, v: 1.3 }], p: [1550, 1.6, 600, 'normal', 9, 800, { kind: 'towerDmg', r: 1500, v: 1.8 }] },
    { name: '鱼人乙', n: [300, 1.8, 400, 'pierce', 4, 400, { kind: 'armor', r: 1200, v: 90 }], p: [300, 1.1, 600, 'pierce', 9, 800, { kind: 'armor', r: 1200, v: 160 }] },
    { name: '鱼人丙', n: [30, 1.8, 400, 'magic', 10, 500, { kind: 'slow', r: 900, v: 0.6 }], p: [1530, 1.1, 600, 'magic', 10, 800, { kind: 'slow', r: 900, v: 0.9 }] },
    { name: '鱼人丁', n: [70, 2.2, 800, 'chaos', 3, 600, { kind: 'towerAS', r: 1500, v: 0.7 }], p: [1570, 1.5, 800, 'chaos', 8, 600, { kind: 'towerAS', r: 1500, v: 1.2 }] },
  ],
};
const KN = { wave: [50, 200, 600, 1000, 1600, 2500, 4000, 8000, 16000, 40000] };   // 狂牛震荡波 A0JP（等级 = 智力/25）
const SN = {   // 神牛
  up: [[1000, 120], [1500, 80], [2000, 40], [2500, 0], [500, 20]],    // 再次学习：金币 + 魔法
  multi: [1, 2, 3, 4, 5, 6, 8, 10, 12, 14], drums: [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 3.0],
};
const JL = {   // 箭灵
  ice: [[320, 15000, 0.16], [260, 10000, 0.3], [220, 6000, 0.3], [180, 3000, 0.3], [140, 1000, 0.3], [80, 300, 0.3], [0, 50, 0.3]],
  fire: [50, 200, 600, 1200, 2400, 4000, 8000, 12000, 20000, 32000], fireArmor: [20, 40, 60, 80, 120, 180, 250, 400, 600, 800],
  skel: [[240, 6000, 0.25], [160, 2400, 0.6], [80, 600, 0.6], [0, 35, 0.6]],
};
const GS = {   // 古树
  wind: [20, 40, 100, 200, 400, 700, 1200, 2400, 6600, 12500, 14500, 17000], slime: [0.2, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5],
  fire: [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7],
};
// 原图说明 / 数值里的"属性档位"
const t5 = (v, xs) => tiers(v, [400, 300, 200, 100], xs);              // ≥400 / ≥300 / ≥200 / ≥100 / 其他
const HERO_KITS = {
  // ---------------------------------------------------------------- 剑神（BQ3 / BQ6 / BQ9 / BRG）
  剑神: [
    // 剑刃风暴：每次攻击，场上没有剑魂就在目标处召唤一个（5 秒，400 范围每秒伤害）；消失时 400 范围 智力×700 混乱（敏捷 ≥400 无视护甲）
    { onLaunch(h, tg) {
      if (G.zones.some(z => z.owner === h && z.kind === 'js1')) return;
      zone(h, tg.x, tg.y, 400, 5, JS.storm[lvBy(h.stat.agi, 24, 10) - 1], 'magic', () => ({ dmg: h.stat.int * 700, atk: 'chaos', ignore: h.stat.agi >= 400 }), 'bladestorm', { kind: 'js1' });
    } },
    // 致命剑刃：攻击时在目标处判定三次（智力 ≥400：几率 5% / 10% / 20%，无视护甲）
    { onLaunch(h, tg) {
      const ig = h.stat.int >= 400, r = () => Math.random() * 100;
      if (r() < (ig ? 5 : 15)) aoe(h, tg, 120, h.stat.str * 960, 'pierce', ig);
      if (r() < (ig ? 10 : 30)) aoe(h, tg, 240, h.stat.agi * 300, 'magic', ig);
      if (r() < (ig ? 20 : 60)) aoe(h, tg, 360, h.stat.int * 120, 'chaos', ig);
    } },
    // 风暴镜像：20% 在英雄身边召唤剑魂 2 号（3 秒，最多 5 个），180 范围每秒伤害；消失时 180 范围 力量×X 穿刺
    { onLaunch(h) {
      if (Math.random() >= 0.2 || G.zones.filter(z => z.owner === h && z.kind === 'js2').length > 4) return;
      const s = h.stat.str, x = tiers(s, [400, 340, 280, 220, 160, 100, 40], [800, 500, 300, 200, 140, 80, 40, 20]);
      zone(h, h.x, h.y, 180, 3, JS.mirror[lvBy(h.stat.agi, 20, 10) - 1], 'magic', () => ({ dmg: h.stat.str * x, atk: 'pierce' }), 'bladestorm', { kind: 'js2' });
    } },
    // 急速命刃：5% ×50；科技 R00F 攻速 +1000%（受攻速上限限制）
    { init(h) { h.asBonus += 10; }, critChance: 0.05, critMul: 50 },
  ],
  // ---------------------------------------------------------------- 枪神：技能本身只有学习次数（Hy：1 学会、2 再次学习）和致命一击，每次攻击的效果在 HERO_ATTACK.枪神 里
  枪神: [0, 1, 2, 3].map(i => ({ relearn: true, init(h) { qsLearn(h, i, 1); }, crit: h => [QS_CRIT[i][h.qs[i] - 1], QS_CRIT[i][2]] })),
  // ---------------------------------------------------------------- 邪冰：巨型冰雹 / 疯狂爆冰 / 邪恶冰冻都是"攻击时"触发（原图 BPw），各自有计数器当冷却：
  // 触发时设为 2 / 3 / 4，每秒减 1（BGU），小于 0 才能再触发。触发后放出一个限时马甲单位，由马甲反复攻击造成伤害
  邪冰: [
    { onLaunch(h, tg) { if (h.xb.hail < 0) { h.xb.hail = 2; xbHail(h, tg.x, tg.y); } } },
    { init(h) { h.stat.str += 20; h.stat.agi += 30; h.stat.int += 40; }, critChance: 0.2, critMul: 40 },
    { onLaunch(h) { if (h.xb.burst < 0) { h.xb.burst = 3; xbBurst(h); } } },
    { onLaunch(h) { if (h.xb.freeze < 0) { h.xb.freeze = 4; xbFreeze(h); } } },
    // 究极闪冰术：三属性总和 ≥750 才能学；英雄身边永久马甲，每 0.2 秒对 600 范围放闪冰术（55000 魔法，弹 5 个，无视护甲）
    { canLearn: h => h.stat.str + h.stat.agi + h.stat.int >= 750 ? null : '需要三属性总和达到 750',
      init(h) {
        hsum(h, h.x, h.y, 0, { cd: 0.2, range: 600 }, { label: '闪', title: '究极闪冰', silent: true, onLaunch(s, tg) {
          let p = { x: s.x, y: s.y };
          const [dmg, n] = G.petFx.kx ? [70000, 7] : [55000, 5];     // 宠物绵羊（Kx = 2）：闪冰术 A0GC 2 级
          for (const m of chainTargets(tg, n, 200)) { FXS.beam(p.x, p.y, 60, m.x, m.y, 50, '#bfefff', 1.2, 0.15); hurt(m, dmg, 'magic', h, { ignoreArmor: true }); p = m; }
        } });
      } },
  ],
  // ---------------------------------------------------------------- 火魂（BOh 攻击时放 陨石之火 / 召唤炎魔 / 召唤火凤）
  火魂: [
    // 焚化之炎（液体火焰）：打中的敌人永久燃烧，不叠加
    { onAttack(h, tg) { tg.burn = { dps: HH.burn[lvBy(h.stat.str, 35, 10) - 1], src: h }; } },
    // 爆裂之焰：学会时在英雄处召唤冰龙（永久）；冰龙每次攻击，0.3 秒后目标处 200 范围 敏捷×X 穿刺
    { init(h) {
      hsum(h, h.x + 120, h.y - 60, 0, { dmg: 1, cd: 0.8, range: 900, atk: 'pierce' }, { label: '龙', title: '冰龙', kind: 'dragon', onLaunch(s, tg) {
        const x = tg.x, y = tg.y, a = h.stat.agi, k = tiers(a, [500, 400, 300, 200, 100], [420, 250, 120, 60, 30, 10]);
        later(0.3, () => { aoeAt(h, x, y, 200, a * k, 'pierce'); FXS.explosion(x, y, 0.5, '#ff8a3c'); });
      } });
    } },
    // 陨石之火（CD10）：英雄附近（y ± 256）召唤马甲放惊吓：5 秒内每秒若干头野兽，700 范围内随机落点 300 范围伤害
    { cdKey: 'meteor', cd: () => 10, onLaunch(h) {
      if (!cdOk(h, 'meteor', 10)) return;
      const lv = lvBy(h.stat.int, 28, 10), cx = h.x, cy = h.y + Math.sin(rnd(0, TAU)) * 256, n = HH.beasts[lv - 1], dmg = HH.stamp[lv - 1];
      for (let k = 0; k < 5 * n; k++) later(k / n, () => {
        const a = rnd(0, TAU), r = rnd(0, 700), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        FXS.fall(x, y, { z: 900, dx: -300, dy: 160, dur: 0.35, color: '#ff6a2a', core: '#fff0b0', size: 26, rock: '#3a2014', onEnd: () => { aoeAt(h, x, y, 300, dmg, 'magic'); FXS.explosion(x, y, 0.8, '#ff5a4f'); } });
      });
    } },
    // 召唤炎魔（CD18）：英雄处召唤炎魔 16 秒（会走动），攻击 N 次后分裂成两个；施放时已有的炎魔回到英雄身边
    { cdKey: 'lava', cd: () => 18, onLaunch(h) {
      if (!cdOk(h, 'lava', 18)) return;
      for (const s of heroUnits(h)) if (s.kind === 'lava') { s.x = h.x + rnd(-50, 50); s.y = h.y + rnd(-50, 50); }
      lavaSpawn(h, h.x + rnd(-50, 50), h.y + rnd(-50, 50), lvBy(h.stat.str, 30, 6));
      SFX.spell('summon', { x: h.x, y: h.y });
    } },
    // 召唤火凤（第 5 个：要先学召唤炎魔，且力量 ≥180）CD8：1000 范围伤害 + 晕 6 秒，英雄处召唤火凤凰 6 秒（打 1000 范围所有敌人）
    { canLearn: h => !learned(h, 3) ? '需要先学会"召唤炎魔"' : h.stat.str < 180 ? '需要力量达到 180' : null,
      cdKey: 'phoenix', cd: () => 8, onLaunch(h) {
        if (!cdOk(h, 'phoenix', 8)) return;
        const lv = clamp(Math.floor(h.stat.int / 100) + 1, 1, 5);
        for (const m of inRange(h.x, h.y, 1000)) { hurt(m, HH.stomp[lv - 1], 'magic', h); stun(m, 6); }
        FXS.nova(h.x, h.y, 1000, '#ff8a3c', 0.6);
        const [dmg, cd, sp] = t5(h.stat.int, [[50000, 0.2, 350], [30000, 0.4, 300], [20000, 0.45, 250], [15000, 0.5, 200], [10000, 0.55, 200]]);
        hsum(h, h.x, h.y - 120, 6, { dmg, cd, range: 1000, atk: 'pierce', multi: 88, multiR: 1000, splash: sp }, { label: '凤', title: '火凤凰', kind: 'phoenix' });
      } },
  ],
  // ---------------------------------------------------------------- 战神（BNz 猛力击 / BN2 狂战士 / BN5 圣战士 / BOJ 狙击枪 / BOC 分身术）
  战神: [
    // 猛力击：每次攻击，目标处 350 范围 敏捷×30 穿刺、150 范围 智力×70 混乱（目标被圣战士晕住时无视护甲）
    { onLaunch(h, tg) {
      const ig = tg.zsUntil > G.t;
      aoe(h, tg, 350, h.stat.agi * 30, 'pierce', ig); aoe(h, tg, 150, h.stat.int * 70, 'chaos', ig);
    } },
    // 狂战士（CD10）：等级 = 敏捷/35；700 范围敌人魔法伤害 + 减速 6 秒；700 范围友军攻速加成 6 秒（不与火速叠加）
    { cdKey: 'berserk', cd: () => 10, onLaunch(h) {
      if (!cdOk(h, 'berserk', 10)) return;
      const lv = h.stat.agi >= 350 ? 10 : lvBy(h.stat.agi, 35, 10);
      for (const m of inRange(h.x, h.y, 700)) { hurt(m, ZS.berserk[lv - 1], 'magic', h); slowM(m, Math.min(0.95, ZS.slow[lv - 1]), 6); }
      for (const t of alliesNear(h.x, h.y, 700)) giveBuff(t, 'fire', ZS.as[lv - 1], 6);
      FXS.nova(h.x, h.y, 700, '#ff5a4f', 0.5); SFX.spell('frostNova', { x: h.x, y: h.y });
    } },
    // 圣战士（CD8）：700 范围敌人晕 4 秒；700 范围友军攻击加成 4 秒（等级 = 力量/20，不与兽人咆哮叠加）
    { cdKey: 'crusade', cd: () => 8, onLaunch(h) {
      if (!cdOk(h, 'crusade', 8)) return;
      for (const m of inRange(h.x, h.y, 700)) { stun(m, 4); m.zsUntil = G.t + 4; }
      const lv = h.stat.str >= 200 ? 10 : lvBy(h.stat.str, 20, 10);
      for (const t of alliesNear(h.x, h.y, 700)) giveBuff(t, 'roar', ZS.roar[lv - 1], 4);
      FXS.nova(h.x, h.y, 700, '#ffd257', 0.5);
    } },
    // 狙击枪：每 2 秒（K2）攻击时对 1400 范围内一个敌人放风暴之锤（等级 = 智力/25），晕 4 秒
    { onLaunch(h) {
      if (!h.sk.k2) return;
      const m = firstIn(h.x, h.y, 1400); if (!m) return;
      h.sk.k2 = false;
      const dmg = ZS.snipe[(h.stat.int >= 250 ? 10 : lvBy(h.stat.int, 25, 10)) - 1];
      FXS.launch('stormHammer', muzzle(h, 'stormHammer'), m, hit => { if (hit) { hurt(hit, dmg, 'magic', h, { ignoreArmor: true }); stun(hit, 4); } });
    } },
    // 分身术：GG 每秒 +1；攻击时 GG ≥8 且分身 <2：GG -4，英雄 256 外召唤时空战士 5 秒（间隔 0.15，射程 900，每击 Qi 通用无视护甲）
    { onLaunch(h) {
      if (h.sk.gg < 8 || countSum(h, 'clone') >= 2) return;
      h.sk.gg -= 4;
      const a = rnd(0, TAU);
      hsum(h, h.x + Math.cos(a) * 256, h.y + Math.sin(a) * 256, 5, { cd: 0.15, range: 900, atk: 'hero' }, { label: '分', title: '时空战士', kind: 'clone', silent: true, onLaunch(s, tg) {
        hurt(tg, zsQi(h), 'hero', h, { ignoreArmor: true }); FXS.beam(s.x, s.y, 80, tg.x, tg.y, 50, '#ffd257', 1, 0.08);
      } });
    } },
  ],
  // ---------------------------------------------------------------- 水魔（BNT 冰原力 / BNQ 水元素 / BNN 暴风雪 / BNW 水魔环 / BNc 噬水魂）
  水魔: [
    // 冰原力：攻击时（触发器开着）：嗜血（等级 = 力量/25）+ 弹幕打射程内所有敌人；力量 >200 持续 5 秒、>100 4 秒、否则 3 秒，8 秒一轮
    { onLaunch(h) {
      if (h.sk.iceBusy) return;
      h.sk.iceBusy = true;
      const s = h.stat.str, lv = s >= 250 ? 10 : lvBy(s, 25, 10), on = s > 200 ? 5 : s > 100 ? 4 : 3;
      giveBuff(h, 'bloodlust', SM.lust[lv - 1], SM.lustDur[lv - 1]);
      h.sk.allUntil = G.t + on;
      later(8, () => { h.sk.iceBusy = false; });
      FXS.ring(h.x, h.y, 160, '#7ab8ff', 0.5, 4);
    } },
    // 水元素：攻击时 10%（每种水元素都 <5 只）在目标处召唤水元素 8 秒（弹射 6 个，穿刺）
    { onLaunch(h, tg) {
      if (Math.random() >= 0.1 || countSum(h, 'elem') >= 5) return;
      const [, dmg, cd] = SM.elem.find(([a]) => h.stat.agi >= a);
      hsum(h, tg.x, tg.y, 8, { dmg, cd, range: 600, atk: 'pierce', bounce: 6, jump: 500 }, { label: '水', title: '水元素', kind: 'elem', mobile: { speed: 300, leash: 1400 } });
    } },
    // 暴风雪：F1 每 5 秒置 1；攻击时若 F1：英雄处 1000 范围 敏捷×敏捷/3 普通，并带 1.2 秒减防光环（等级 = 智力/60，和减防光环取大）
    { onLaunch(h) {
      if (!h.sk.f1) return;
      h.sk.f1 = false;
      const x = h.x, y = h.y, a = h.stat.agi, armor = SM.armor[(h.stat.int >= 360 ? 6 : lvBy(h.stat.int, 60, 6)) - 1];
      for (const m of inRange(x, y, 1000)) debuffM(m, 'blade', armor, 1.5);
      later(0.7, () => { aoeAt(h, x, y, 1000, a / 3 * a, 'normal'); for (let k = 0; k < 14; k++) FXS.snow(x + rnd(-900, 900), y + rnd(-900, 900), 40, 0.8); });
    } },
    // 水魔环：英雄身边减速光环（等级 = 敏捷/25，与减速光环叠加）；打被它减速的敌人：200 范围 智力×50 普通
    { onLaunch(h, tg) {
      const lv = lvBy(h.stat.agi, 25, 10);
      if (dist2(h.x, h.y, tg.x, tg.y) <= SM.ringR[lv - 1] ** 2) aoe(h, tg, 200, h.stat.int * 50, 'normal');
    } },
    // 噬水魂：攻击时 10%：英雄处马甲 2.1 秒，每 0.2 秒攻击一次，目标处 150 范围 力量×35 通用
    { onLaunch(h) {
      if (Math.random() >= 0.1) return;
      hsum(h, h.x, h.y, 2.1, { cd: 0.2, range: 1000, atk: 'hero' }, { label: '噬', title: '噬水魂', silent: true, onLaunch(s, tg) {
        aoe(h, tg, 150, h.stat.str * 35, 'hero', false, '#7ab8ff'); FXS.beam(s.x, s.y, 120, tg.x, tg.y, 40, '#7ab8ff', 1, 0.12);
      } });
    } },
  ],
  // ---------------------------------------------------------------- 电法（BM9 刺电 / BNE+BNH 爆电 / BNK 云电 / BM6 链电）
  电法: [
    // 云电：攻击时 10%：目标处闪电 2 号 3 秒，攻击力 = 敏捷×智力，间隔 0.2，射程 500，普通，额外 2 个目标
    { onLaunch(h, tg) {
      if (Math.random() >= 0.1) return;
      hsum(h, tg.x, tg.y, 3, { dmg: h.stat.agi * h.stat.int, cd: 0.2, range: 500, atk: 'normal', multi: 2, multiR: 500 }, { label: '云', title: '云电' });
    } },
    // 爆电（CD4）：800 范围随机一个敌人处放电球，1 秒后爆炸：400 范围 智力×X 混乱无视护甲（学了神电再来一次），减速 100% 6 秒
    { cdKey: 'ball', cd: () => 4, onLaunch(h) {
      const m = pickIn(h.x, h.y, 800);
      if (!m || !cdOk(h, 'ball', 4)) return;
      const x = m.x, y = m.y;
      FXS.ring(x, y, 400, '#7ab8ff', 1, 3);
      later(1, () => {
        const dmg = h.stat.int * tiers(h.stat.agi, [400, 320, 240, 160, 80], [600, 300, 150, 80, 60, 40]);
        for (const o of inRange(x, y, 400)) { slowM(o, 0.95, 6); hurt(o, dmg, 'chaos', h, { ignoreArmor: true }); if (learned(h, 4)) hurt(o, dmg, 'chaos', h, { ignoreArmor: true }); }
        FXS.explosion(x, y, 1.2, '#9fd8ff'); FXS.nova(x, y, 400, '#7ab8ff', 0.4);
      });
    } },
    // 刺电：每次攻击目标处 250 范围 力量×X 穿刺
    { onLaunch(h, tg) {
      const x = tiers(h.stat.agi, [370, 290, 210, 130, 50], [160, 80, 40, 20, 10, 5]), d = h.stat.str * x;
      aoe(h, tg, 250, d, 'pierce'); popText(tg.x, tg.y + 40, fmt(d) + '！', '#ff5a4f');
    } },
    // 链电（CD6）：英雄处召唤闪电 1 号 4 秒，对射程 800 内的敌人反复放闪电链（等级 = 智力/20）
    { cdKey: 'chain', cd: () => 6, onLaunch(h) {
      if (!cdOk(h, 'chain', 6)) return;
      hsum(h, h.x, h.y, 4, { cd: 0.4, range: 800, atk: 'magic' }, { label: '链', title: '闪电链', silent: true, onLaunch(s, tg) {
        const i = h.stat.int, lv = i >= 380 && learned(h, 4) ? 11 : i >= 200 ? 10 : lvBy(i, 20, 10);
        let p = { x: s.x, y: s.y };
        for (const m of chainTargets(tg, DF.chainN[lv - 1], 700)) { FXS.beam(p.x, p.y, 120, m.x, m.y, 50, '#9fd8ff', 1.4, 0.18); hurt(m, DF.chain[lv - 1], 'magic', h, { ignoreArmor: true }); p = m; }
      } });
    } },
    // 神电：爆电再炸一次；智力 ≥380 时链电用 11 级（70000，弹 10 个）
    {},
  ],
};
Object.assign(HERO_KITS, {
  // ---------------------------------------------------------------- 风神（BMi / BMl / BMo / BMr / BMg）
  风神: [
    // 风暴之锤（弹幕）：等级 = (智力+敏捷)/40；额外攻击 900 范围 1~9 个（10 级全部）敌人；每次攻击英雄周围 900 范围 等级²×100 普通
    { onLaunch(h) { const lv = lvBy(h.stat.int + h.stat.agi, 40, 10); aoeAt(h, h.x, h.y, 900, lv * lv * 100, 'normal'); } },
    // 刀风之锁：等级 = 敏捷/30；(5+等级)% 锁住目标（残废）；风神攻击被锁住的敌人：600 范围 智力×65 混乱
    { onLaunch(h, tg) {
      const lv = lvBy(h.stat.agi, 30, 10);
      if (tg.lockUntil > G.t) aoe(h, tg, 600, h.stat.int * 65, 'chaos');
      if (Math.random() * 100 < 5 + lv) { const d = FS.lockDur[lv - 1]; stun(tg, d); tg.lockUntil = G.t + d; FXS.ring(tg.x, tg.y, 90, '#bfefff', d, 3); }
    } },
    // 嗜血狂风：攻击时 10%：目标处刺客 3 秒，身上的永久献祭每隔一段时间烧 250 范围（魔法）
    { onLaunch(h, tg) {
      if (Math.random() >= 0.1) return;
      const [dmg, every] = tiers(h.stat.int, [320, 240, 160, 80], [[12000, 0.1], [3600, 0.14], [900, 0.16], [300, 0.18], [50, 0.2]]);
      field(h, tg.x, tg.y, 250, 3, { color: 'rgba(255,90,79,.12)', tick(z, dt) { z.acc = (z.acc || 0) + dt; while (z.acc >= every) { z.acc -= every; aoeAt(h, z.x, z.y, 250, dmg, 'magic'); } } });
    } },
    // 狂风肆虐（攻击时放，CD 12~5 秒，等级 = 敏捷/30）：英雄处土匪 5 秒，每 0.2 秒对 900 范围所有敌人穿刺 1000×(1+[智力/32 级加成])
    { cdKey: 'ramp', cd: h => FS.rampCd[lvBy(h.stat.agi, 30, 8) - 1], onLaunch(h) {
      if (!cdOk(h, 'ramp', FS.rampCd[lvBy(h.stat.agi, 30, 8) - 1])) return;
      const k = 1 + FS.bandit[lvBy(h.stat.int, 32, 10) - 1];
      hsum(h, h.x, h.y, 5, { cd: 0.2, range: 900, atk: 'pierce' }, { label: '风', title: '狂风肆虐', silent: true, onLaunch(s) {
        for (const m of inRange(s.x, s.y, 900)) hurt(m, 1000 * k, 'pierce', h);
        FXS.nova(s.x, s.y, 900, '#cfe8ff', 0.2);
      } });
    } },
    // 混乱飓风：GF 每秒 +1；攻击时若 GF ≥4：GF=0，从英雄放一道弹跳（混乱，射程 1000，弹射 600）
    { onLaunch(h) {
      if (h.sk.gf < 4) return;
      const m = nearest(h.x, h.y, 1000); if (!m) return;
      h.sk.gf = 0;
      const [dmg, n] = tiers(h.stat.str, [200, 160, 120, 80, 40], [[160000, 16], [40000, 14], [10000, 12], [3000, 10], [1000, 8], [300, 6]]);
      let p = { x: h.x, y: h.y };
      for (const o of chainTargets(m, n, 600)) { FXS.beam(p.x, p.y, 100, o.x, o.y, 50, '#c48bff', 1.4, 0.2); hurt(o, dmg, 'chaos', h); p = o; }
    } },
  ],
  // ---------------------------------------------------------------- 大巫师（BSi 攻击时放技能 / BSo 施放时的伤害 / BSl 巫祭）
  大巫师: [
    // 巫伤：+80% 攻速；升级时多给技能点；放技能 30% 刷新冷却
    { init(h) { h.asBonus += 0.8; } },
    // 恐怖嚎叫（CD7；学了巫缓变 2 级 CD4）：700 范围护甲 -120 7 秒（2 级 -220 4 秒，不和恐惧 / 巫魔叠加）+ 智力×X×等级 穿刺
    { cdKey: 'howl', cd: h => learned(h, 4) ? 4 : 7, onLaunch(h) {
      const l2 = learned(h, 4);
      if (!cdOk(h, 'howl', l2 ? 4 : 7)) return;
      for (const m of inRange(h.x, h.y, 700)) debuffM(m, 'fear', l2 ? 220 : 120, l2 ? 4 : 7);
      aoeAt(h, h.x, h.y, 700, h.stat.int * tiers(h.stat.int, [700, 500, 300, 100], [18, 15, 12, 9, 6]) * h.level, 'pierce');
      FXS.nova(h.x, h.y, 700, '#c48bff', 0.5);
      wsRefresh(h, true);
    } },
    // 死亡呐喊（CD6；学了巫缓 2 级 CD3）：700 范围减速 60% 6 秒（2 级 80% 3 秒）+ 智力×X×等级 混乱
    { cdKey: 'yell', cd: h => learned(h, 4) ? 3 : 6, onLaunch(h) {
      const l2 = learned(h, 4);
      if (!cdOk(h, 'yell', l2 ? 3 : 6)) return;
      for (const m of inRange(h.x, h.y, 700)) slowM(m, l2 ? 0.8 : 0.6, l2 ? 3 : 6);
      aoeAt(h, h.x, h.y, 700, h.stat.int * tiers(h.stat.int, [700, 500, 300, 100], [24, 16, 10, 6, 2]) * h.level, 'chaos');
      FXS.nova(h.x, h.y, 700, '#5aa8ff', 0.5);
      wsRefresh(h, false);
    } },
    // 巫驱（巫祭献祭巫师塔（光明）获得，CD3）：1000 范围敌人移速 +300% 20 秒，第二个转弯口 99.5% 遣返；力量×X×等级 通用
    { canLearn: () => '用"巫祭"献祭一座巫师塔（光明）获得', cdKey: 'expel', cd: () => 3, onLaunch(h) {
      if (!cdOk(h, 'expel', 3)) return;
      for (const m of inRange(h.x, h.y, 1000)) { debuffM(m, 'expelSpeed', 3, 20); m.expel = { p: 0.995, until: G.t + 20 }; }
      const s = h.stat.str, x = s >= 1000 && h.learned.length >= 4 ? 80 : tiers(s, [700, 500, 300, 100], [50, 20, 10, 4, 2]);
      aoeAt(h, h.x, h.y, 1000, s * x * h.level, 'hero');
      FXS.ring(h.x, h.y, 1000, '#9fe3ff', 0.5, 4);
      wsRefresh(h, false);
    } },
    // 巫缓（巫祭献祭巫师塔（暗黑）获得）：攻击 100% 晕 5 秒；漩涡 ≤3 个时目标处留下漩涡 5 秒（减速 100%），并 220 范围 敏捷×X×等级 通用无视护甲
    { canLearn: () => '用"巫祭"献祭一座巫师塔（暗黑）获得', onLaunch(h, tg) {
      stun(tg, 5);
      if (G.zones.filter(z => z.owner === h && z.kind === 'vortex').length > 2) return;
      const a = h.stat.agi, x = a >= 900 && h.learned.length >= 4 ? 5 : tiers(a, [700, 500, 300, 100], [3.5, 2.5, 2, 1.5, 1]);
      aoe(h, tg, 220, a * x * h.level, 'hero', true);
      field(h, tg.x, tg.y, 220, 5, { kind: 'vortex', color: 'rgba(122,184,255,.16)', each: m => slowM(m, 0.95, 0.3) });
    } },
  ],
  // ---------------------------------------------------------------- 幻影（BQK 召唤影子 / BQN 智力魔击 / BQQ 科技 / BQU 召唤影子技能）
  幻影: [
    // 召唤影子（CD8，攻击时放）：1000 范围随机敌人处召唤影子 16 秒
    { cdKey: 'shadow', cd: () => 8, onLaunch(h) {
      const m = pickIn(h.x, h.y, 1000);
      if (!m || !cdOk(h, 'shadow', 8)) return;
      hySpawn(h, m.x, m.y, 16);
      const has = fam => G.towers.some(t => t.fam === fam && isMax(t));
      if (!has('重击塔')) h.sk.bash = 1; else if (!has('冰霜塔')) h.sk.gk = 0; else if (!has('暴击塔')) h.sk.crit = 1;
    } },
    // 力量暴击：25% ×4（暴击塔升到 3 级后 ×5）；R009 改成 力量/50
    { crit: h => [0.25, h.sk.crit >= 2 ? 5 : 4] },
    // 敏捷重击：15% 晕 1 秒（重击塔升到 3 级后 1.5 秒）；R00A 改成 敏捷/20
    { onAttack(h, tg) { if (Math.random() < 0.15) stun(tg, h.sk.bash >= 2 ? 1.5 : 1); } },
    // 智力魔击：影子攻击时额外 智力×1.5 通用无视护甲；R00B 改成 智力/40
    {},
    // 幻影之刺：召唤影子 50% 是远程影子；影子上限 +1
    {},
  ],
  // ---------------------------------------------------------------- 渔人（BQm 召唤鱼人 / BQp 鱼人科技 / BQj 学习与再次学习）
  渔人: [0, 1, 2, 3].map(i => ({
    up: { tip: () => '再次学习：技能升到 2 级（大鱼几率 +1%），最多召唤的大鱼 +1', why: h => h.sk.fl[i] >= 2 ? '已经再次学习过了' : null, cost: () => ({ gold: 10000 }),
      apply(h) { h.sk.fl[i] = 2; h.sk.go++; } },
    init(h) { h.sk.fl[i] = 1; },
  })).concat([{ init(h) { h.sk.evo = 1; h.sk.lp = 5; } }]),
  // ---------------------------------------------------------------- 狂牛（BSI 震荡波 / BSL 祭坛守卫 / BSC+BSF 重生点 / BSO 狂暴重击）
  狂牛: [
    // 震荡波：每次攻击，马甲移到目标外 400 处朝目标放震荡波（冷却 0.5）：等级 = 智力/25，魔法无视护甲
    { onLaunch(h, tg) {
      if (!cdOk(h, 'wave', 0.5)) return;
      const a = rnd(0, TAU), x0 = tg.x + Math.cos(a) * 400, y0 = tg.y + Math.sin(a) * 400;
      const dmg = KN.wave[(h.stat.int >= 250 ? 10 : lvBy(h.stat.int, 25, 10)) - 1];
      shockwave({ x: x0, y: y0 }, tg.x - x0, tg.y - y0, dmg, false, { owner: h, len: 1200, w0: 125, w1: 200, speed: 1050 });
    } },
    // 祭坛守卫：学会时召唤 3 个守卫（永久），每次攻击目标处 120 范围 敏捷×36 穿刺（目标被晕时无视护甲）；英雄和英雄塔原位置各带 800 范围减速 50%
    { init(h) {
      for (let k = 0; k < 3; k++) hsum(h, h.home.x + rnd(-150, 150), h.home.y + rnd(-150, 150), 0, { cd: 0.2, range: 300, atk: 'chaos' }, { label: '守', title: '狂牛祭坛守卫', silent: true, onLaunch(s, tg) {
        aoe(h, tg, 120, h.stat.agi * 36, 'pierce', tg.stunUntil > G.t);
      } });
    } },
    // 重生点（CD3，攻击时放；"再次学习"切换自动 / 手动）：在目标处放守卫，2 秒后英雄瞬移过去，350 范围 力量×300 普通无视护甲 + 晕 8 秒；
    // 第一次放后 40 秒失效并瞬移回原处，再 12 秒后恢复
    { up: { tip: h => `切换自动释放（现在：${h.sk.hj ? '自动' : '手动'}）`, why: () => null, cost: () => ({}), apply(h) { h.sk.hj = !h.sk.hj; msg(`重生点：${h.sk.hj ? '自动' : '手动'}释放`); } },
      init(h) { h.sk.hj = true; h.sk.kn3 = 1; },
      cdKey: 'ward', cd: () => 3, onLaunch(h, tg) { if (h.sk.hj) knWard(h, tg.x, tg.y); } },
    // 狂暴重击：攻击 100% 晕 8 秒，并对目标 力量×480 混乱无视护甲
    { onLaunch(h, tg) { hurt(tg, h.stat.str * 480, 'chaos', h, { ignoreArmor: true }); }, onAttack(h, tg) { stun(tg, 8); } },
  ],
  // ---------------------------------------------------------------- 神牛（BRR 学习与升级 / BRU 杀敌加属性 / BRX 神灵 / BRa 神盾）
  神牛: [0, 1, 2, 3, 4].map(i => ({
    up: { tip: h => `升到 ${h.sk.g2[i] + 1} 级（需要英雄等级 ≥ ${h.sk.g2[i] * 3 + 3}）`,
      why: h => h.sk.g2[i] >= 10 ? '已经是最高等级' : h.level < h.sk.g2[i] * 3 + 3 ? `需要英雄等级 ≥ ${h.sk.g2[i] * 3 + 3}` : null,
      cost: () => ({ gold: SN.up[i][0], mana: SN.up[i][1] }), apply(h) { h.sk.g2[i]++; } },
    init(h) { h.sk.g2[i] = 1; },
    onLaunch: i === 3 ? (h, tg) => aoe(h, tg, 50, h.stat.int * (h.stat.int >= 3000 ? 5 : 2.5), 'chaos', true)
      : i === 4 ? h => aoeAt(h, h.x, h.y, 400, h.stat.agi * ((h.stat.agi >= 3000 ? 8 : 4) + h.sk.g2[4]), 'pierce') : undefined,
  })),
  // ---------------------------------------------------------------- 箭灵（BO9 寒冰之箭 / BPD 燃烧之箭 / BPL 邪恶之箭 / BPR 神之箭魂 / BPX 箭灵之殇）
  箭灵: [
    // 寒冰之箭：攻击时 10%：英雄旁冰箭 3 秒（进化后 6 秒），打 900 范围所有敌人，带 900 范围减速光环 60%
    { onLaunch(h) {
      if (h.sk.ga || Math.random() >= 0.1) return;
      const [, dmg, cd] = JL.ice.find(([a]) => h.stat.int >= a);
      hsum(h, h.x, h.y - 20, 3 + h.sk.gc, { dmg, cd, range: 1000, atk: 'normal', multi: 66, multiR: 900 }, { label: '冰', title: '寒冰之箭', aura: { kind: 'slow', r: 900, v: 0.6 } });
    } },
    // 燃烧之箭：GB 每秒 +1；攻击时 GB >5：GB=0，火箭马甲 3 秒（进化后 6 秒），间隔 0.1，射程 1200，每击附加伤害并减甲 10 秒（等级 = 敏捷/25）
    { onLaunch(h) {
      if (h.sk.ga || h.sk.gb <= 5) return;
      h.sk.gb = 0;
      const lv = h.stat.agi >= 250 ? 10 : lvBy(h.stat.agi, 25, 10);
      hsum(h, h.x, h.y, 3 + h.sk.gc, { dmg: 1 + JL.fire[lv - 1], cd: 0.1, range: 1200, atk: 'pierce' }, { label: '火', title: '燃烧之箭', onHit(s, m) {
        m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, JL.fireArmor[lv - 1]); m.shredUntil = G.t + 10;
      } });
    } },
    // 邪恶之箭：弹幕额外 2 个目标（900 范围）；英雄或骷髅杀死的敌人变成骷髅弓箭手（见 HERO_DEF.箭灵.onKill）
    {},
    // 进化弓箭：技能点 +30；冰箭 / 火箭持续 +3 秒，骷髅上限 13
    { init(h) { h.points += 30; h.sk.gc = 3; } },
    // 神之箭魂（第 5 个：30 级且学会寒冰 / 燃烧 / 邪恶三箭；学会后三箭失效）CD12：英雄身后召唤箭魂 4 秒
    { canLearn: h => h.level < 30 ? '需要英雄 30 级' : ![0, 1, 2].every(i => learned(h, i)) ? '需要先学会寒冰之箭、燃烧之箭、邪恶之箭' : null,
      init(h) { h.sk.ga = 1; }, cdKey: 'soul', cd: () => 12, onLaunch(h) {
        if (!cdOk(h, 'soul', 12)) return;
        hsum(h, h.x - 150, h.y, 4, { cd: 0.19, range: 1000, atk: 'hero', multi: 5, multiR: 1000 }, { label: '魂', title: '神之箭魂', kind: 'soul',
          stats: () => ({ dmg: 12000 + 1000 * h.sk.r01b }), aura: [{ kind: 'slow', r: 900, v: 0.8 }, { kind: 'armor', r: 1200, v: 120 }] });
      } },
  ],
  // ---------------------------------------------------------------- 神幻（BRo 召唤三霆 / BRr 三霆伤害 / BRu 附加范围伤害 / BRx 霆杀计数）
  神幻: [
    // 流星（弹幕）：攻击 700 范围所有敌人；再次学习（5000 金 + 500 魔法）扩大到 1000
    { up: { tip: () => '攻击范围扩大到 1000', why: h => h.sk.hc[0] >= 2 ? '已经升级过了' : null, cost: () => ({ gold: 5000, mana: 500 }), apply(h) { h.sk.hc[0] = 2; } },
      init(h) { h.sk.hc[0] = 1; } },
    ...[0, 1, 2].map(j => ({   // 雷霆 / 战霆 / 怒霆：再次学习（5000 金 + 500 魔法）技能 2 级、上限 2 个
      up: { tip: () => '技能升到 2 级，最多同时召唤 2 个', why: h => h.sk.hc[j + 1] >= 2 ? '已经升级过了' : null, cost: () => ({ gold: 5000, mana: 500 }), apply(h) { h.sk.hc[j + 1] = 2; } },
      init(h) { h.sk.hc[j + 1] = 1; },
    })),
    // 霆杀：之后三霆杀敌计数，每击额外 计数×50 无视护甲
    { init(h) { h.sk.hc[4] = 1; } },
  ],
  // ---------------------------------------------------------------- 坦克（BWU 学习 / BWX 能量与火炮 / BWa+BWd 轰炸 / BWg 开关）
  坦克: [
    { init(h) { h.sk.nf = 1; } },                      // 多重火箭弹：额外 2 个目标（800 范围）；攻击积累能量更快
    { init(h) { h.sk.kn = 1; h.sk.w = 1; } },          // 巨型火炮弹（开）
    { init(h) { h.sk.km = 1; h.sk.e = 2; } },          // 混乱轰炸区（关）
    { init(h) {                                        // 小型冲锋枪：坦克旁永久冲锋枪
      h.sk.ko = 1;
      h.sk.smg = hsum(h, h.x + 110, h.y + 40, 0, { range: 800, atk: 'pierce' }, { label: '枪', title: '小型冲锋枪', kind: 'smg',
        stats: () => h.sk.ne ? { dmg: 2200 + 200 * tkTech(h), cd: 0.16 } : { dmg: 200 + 200 * tkTech(h), cd: 0.25 } });
    } },
    { init(h) { h.sk.ne = 1; } },                      // 战争科技
  ],
  // ---------------------------------------------------------------- 古树（BVE 学习 / BVK 清风 / BVN 粘液与精灵 / BVQ / BVZ / BVT 链带）
  古树: [
    { init(h) { h.sk.j7++; } },                                   // 清风
    { init(h) { h.sk.j7++; } },                                   // 粘液
    { init(h) { h.sk.j7++; } },                                   // 精灵
    { init(h) { h.sk.j7++; } },                                   // 链带
    { init(h) {                                                   // 生灵：主古树处召唤龙鹰（2000 通用，弹 16，间隔 4）；清风上限 12 级
      h.sk.j7++; h.sk.ni = 2;
      hsum(h, h.x, h.y + 100, 0, { cd: 4, range: 800, atk: 'hero', bounce: 16, jump: 400 }, { label: '鹰', title: '龙鹰骑士', kind: 'eagle',
        stats: () => ({ dmg: 2000 + 100 * gsTech(h).atk }), onLaunch(s) { gsTreeAttack(h, s); } });
    } },
  ],
});
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
// 震荡波：从起点出发直线前进，每个敌人只打一次（枪神火焰喷射：长 600、宽 150→300；狂牛震荡波：长 1200、宽 125→200）
function shockwave(src, dx, dy, dmg, crit, o = {}) {
  const { owner = src, len = 600, w0 = 150, w1 = 300, speed = 1050 } = o;
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, x0 = src.x, y0 = src.y, color = crit ? '#ffd257' : '#ff8a3c';
  for (const m of G.monsters) {
    if (m.dead) continue;
    const ax = m.x - x0, ay = m.y - y0, along = ax * ux + ay * uy, side = Math.abs(ax * uy - ay * ux);
    if (along < 0 || along > len || side > w0 + (w1 - w0) * along / len) continue;
    later(along / speed, () => { if (!m.dead) hurt(m, dmg, 'magic', owner, { ignoreArmor: true }); });
  }
  for (let d = 0; d <= len; d += 100) later(d / speed, () => FXS.explosion(x0 + ux * d, y0 + uy * d, (0.35 + d / (2 * len)) * (crit ? 1.4 : 1), color));
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
// ---- 技能用到的小函数
// 炎魔（熔岩爆破召唤的）：会走动，攻击 N 次后分裂成两个（新的那个重新计时 16 秒）
function lavaSpawn(h, x, y, lv) {
  const [dmg, cd] = HH.lava[lv - 1], need = HH.split[lv - 1];
  return hsum(h, x, y, 16, { dmg, cd, range: 300, atk: 'chaos' }, { label: '炎', title: '炎魔', kind: 'lava', mobile: { speed: 320, leash: 1600 }, hits: 0,
    onLaunch(s) { if (++s.hits === need) { lavaSpawn(h, s.x + rnd(-60, 60), s.y + rnd(-60, 60), lv); FXS.explosion(s.x, s.y, 0.5, '#ff5a2a'); } } });
}
// 战神分身的伤害 Qi（原图学技能点 / 升级时重算）
const zsQi = h => { const s = h.stat.str + h.stat.agi, i = h.stat.int; return i >= 200 ? s * 72 : i >= 150 ? s * 36 : i >= 100 ? s * 9 : i >= 50 ? s * 3 : s; };
// 大巫师：放恐怖嚎叫时（学了巫伤）30% 刷新所有冷却；原图条件的优先级让死亡呐喊 / 巫驱每次都刷新（照搬）
function wsRefresh(h, howl) {
  if (howl ? learned(h, 0) && Math.random() < 0.3 : true) { h.cds = {}; popText(h.x, h.y + 90, '刷新', '#ff5a4f'); }
}
// 幻影的影子：近战 n055 / 远程 n08Y（学了幻影之刺 50%）；攻击力 80 + R009、攻速吃 R00A；带敏捷重击 / 致命力量（等级 = 英雄的 +1）
function hySpawn(h, x, y, life) {
  const far = learned(h, 4) && Math.random() < 0.5;
  return hsum(h, x, y, life, { cd: far ? 0.25 : 0.45, range: far ? 600 : 120, atk: 'hero', splash: far ? 120 : 60 }, { label: '影', title: far ? '幻影（远程）' : '幻影', kind: 'shadow',
    stats: () => ({ dmg: 80 + 600 * hyTech(h).atk, as: 0.25 * hyTech(h).as }),
    onLaunch(s, tg) {
      if (!far || learned(h, 3)) aoe(h, tg, far ? 120 : 60, h.stat.int * (1.5 + G.petFx.k4), 'hero', true, '#9fb8ff');   // 宠物鹰：K4 = 1.5      // 智力魔击（近战影子不学也有，照搬）
      const b = learned(h, 2) ? (h.sk.bash >= 2 ? 1.5 : 1) : 0;
      if (b && Math.random() < 0.15) stun(tg, b);
    },
    crit: () => learned(h, 1) ? [0.25, h.sk.crit >= 2 ? 3 : 2] : null });
}
// 幻影的科技：R009 攻击 +600/级、R00A 攻速 +25%/级、R00B 回魔 +2%/级
const hyTech = h => ({ atk: Math.min(20, Math.floor(h.stat.str / (learned(h, 1) ? 50 : 100))), as: Math.min(40, Math.floor(h.stat.agi / (learned(h, 2) ? 20 : 40))),
  mp: Math.min(20, Math.floor(h.stat.int / (learned(h, 3) ? 40 : 80))) });
// 狂牛重生点：目标处守卫 2 秒，消失时英雄瞬移过去并践踏
function knWard(h, x, y) {
  if (h.sk.kn3 === 3 || !cdOk(h, 'ward', 3)) return;
  FXS.ring(x, y, 120, '#6fd17a', 2, 3);
  if (h.sk.kn3 === 1) {             // 第一次放：40 秒后失效并瞬移回原处，再 12 秒恢复
    h.sk.kn3 = 2;
    later(40, () => { h.sk.kn3 = 3; heroMove(h, h.home.x, h.home.y); later(12, () => { h.sk.kn3 = 1; }); });
  }
  later(2, () => {
    if (h.sk.kn3 === 3) return;
    for (const m of inRange(x, y, 350)) { hurt(m, h.stat.str * 300, 'normal', h, { ignoreArmor: true }); stun(m, 8); }
    FXS.nova(x, y, 350, '#ffd257', 0.5); SFX.spell('frostNova', { x, y });
    heroMove(h, x, y);
  });
}
function heroMove(h, x, y) { FXS.ring(h.x, h.y, 140, '#ffd257', 0.4, 4); h.x = x; h.y = y; FXS.ring(x, y, 140, '#ffd257', 0.4, 4); }
// 坦克伤害 R01J：+200/级 = 三属性和 / X（只在坦克或冲锋枪杀敌时更新）
const tkTech = h => h.sk.r01j || 0;
// 古树链带：R01H 攻击 +100/级 = 力量/20；R01I 攻速 +10%/级 = 敏捷/15（学了链带才有）；主古树杀敌时更新
const gsTech = h => ({ atk: h.sk.r01h || 0, as: h.sk.r01i || 0 });
// 古树：任意一棵古树（主古树、召唤古树、龙鹰）攻击时：粘液 / 精灵的触发和计数（BVN）
function gsTreeAttack(h, tree) {
  const sk = h.sk;
  if (sk.j8 >= 12 && learned(h, 3)) { sk.j8 = 0; sk.j9 += 5; for (const t of gsTrees(h)) gsSlime(h, t); }
  if (Math.random() < 1 / 8 && learned(h, 1)) { gsSlime(h, h); sk.j9++; }
  if (Math.random() < 0.2 && learned(h, 2) && tree.kind !== 'eagle') { giveBuff(h, 'innerfire', GS.fire[lvBy(h.stat.str, 32, 10) - 1], 3); gsSpirit(h, h); }
  if (sk.j9 >= 8 && learned(h, 3)) { sk.j9 = 0; for (const t of gsTrees(h)) gsSpirit(h, t); }
  if (tree.kind === 'eagle' && !(h.sk.b02g > G.t)) {
    if (sk.nx >= 4) { sk.nx -= 4; h.sk.b02g = G.t + 5; FXS.nova(tree.x, tree.y, 600, '#9fffb0', 0.6); }
    else sk.nx++;
  }
}
const gsTrees = h => [h, ...heroUnits(h).filter(t => t.kind === 'tree')];
// 粘液：在古树处 600 范围减速 5 秒并造成伤害（等级 = 敏捷/26，敏捷 ≥400 → 11 级 700 范围）
function gsSlime(h, t) {
  const a = h.stat.agi, lv = a >= 400 ? 11 : lvBy(a, 26, 10), r = lv === 11 ? 700 : 600, b = h.sk.b02g > G.t;
  const dmg = a * (lv === 11 ? 200 : 140) * (b ? 2 : 1);
  for (const m of inRange(t.x, t.y, r)) { slowM(m, Math.min(0.95, GS.slime[lv - 1]), 5); hurt(m, dmg, b ? 'hero' : 'chaos', h); }
  FXS.nova(t.x, t.y, r, '#9fffb0', 0.4);
}
// 精灵：从古树扑向最近的敌人践踏：200 范围 智力×120（生灵 B02G 时 ×240 通用），定 0.3 秒；J8 +1
function gsSpirit(h, t) {
  const m = nearest(t.x, t.y, 1000); if (!m) return;
  FXS.launch('wisp', { x: t.x, y: t.y, z: 150 }, m, (hit, x, y) => {
    const b = h.sk.b02g > G.t;
    for (const o of inRange(x, y, 200)) { hurt(o, h.stat.int * (b ? 240 : 120), b ? 'hero' : 'normal', h); stun(o, 0.3); }
    FXS.ring(x, y, 200, '#9fffb0', 0.35, 3); h.sk.j8++;
  });
}
// 古树：种一棵召唤古树（500 金 1 人口，数量 = 学会的技能数，最多 4 棵进清风链条）
function plantAncient(h, x, y) {
  const n = heroUnits(h).filter(t => t.kind === 'tree').length;
  if (n >= Math.min(4, h.sk.j7)) return msg('学会更多古树技能才能再种古树');
  if (G.gold < 500) return msg('金币不足');
  if (foodUsed() + 1 > G.foodCap) return msg('人口不足');
  G.gold -= 500;
  const k = n + 1;
  hsum(h, x, y, 0, { cd: 1.6, range: 900, atk: 'hero', splash: 120 }, { label: '树', title: `古树（召唤的）${k}`, kind: 'tree', idx: k, solid: true, food: 1, spent: 500,
    stats: () => ({ dmg: 20 + 100 * gsTech(h).atk, as: 0.1 * gsTech(h).as }), onLaunch(s) { gsTreeAttack(h, s); } });
  FXS.nova(x, y, 200, '#9fffb0', 0.5); SFX.ui('construct', { x, y });
}
// ---- 英雄本身的规则（原图每个英雄单位的触发器）
// init(h) 建成时    second(h) 每秒（原图 BGU 等 1 秒计时器）    tick(h, dt) 每帧    stats(h) → { dmg, as, multi, multiR } 攻击加成 / 弹幕
// auras(h) → [{ x, y, r, kind, v }] 光环（kind：towerDmg / towerAS / drums 给塔，armor / slow / heroSlow 给敌人）
// onLaunch(h, tg) 攻击出手时（在技能之前）    onKill(h, m, src) 英雄或召唤物杀敌    onElite(h, src)    anyAttack(h, t, tg) 任意塔攻击时
// onLevel(h) 升级时（HERO_LEVEL）    onLevelBtn(h) 点"升级"时（原图 BaJ，升级之后判断等级）    towerUpgraded(h, t)    cmds(h) 额外命令    info(h) 信息面板多的几行
// randomStat 没有"属性选择"（A0CD）的英雄：杀精英 +1、满级升级 +3、知识药水、重修药水都改成随机一项（原图对 H05J 单独判断）
const HERO_DEF = {
  剑神: {}, 火魂: {},
  枪神: {},
  邪冰: {},
  战神: {
    init(h) { h.sk.gg = 0; h.sk.k2 = false; },
    second(h) { h.sk.gg++; if (Math.floor(G.t) % 2 === 0) h.sk.k2 = true; },                   // GG 每秒 +1（BGU）；K2 每 2 秒置 1（Rz）
    info: h => learned(h, 4) ? [`分身术计数 ${h.sk.gg}（≥8 召唤分身）· 分身伤害 ${fmt(zsQi(h))}`] : [],
  },
  水魔: {
    init(h) { h.sk.f1 = false; h.sk.allUntil = 0; },
    second(h) { if (Math.floor(G.t) % 5 === 0) h.sk.f1 = true; },                               // F1 每 5 秒置 1
    stats: h => h.sk.allUntil > G.t ? { multi: 999 } : {},                                       // 冰原力：弹幕打射程内所有敌人
    auras: h => learned(h, 3) ? [{ x: h.x, y: h.y, r: SM.ringR[lvBy(h.stat.agi, 25, 10) - 1], kind: 'heroSlow', v: SM.ringV[lvBy(h.stat.agi, 25, 10) - 1] }] : [],
  },
  电法: {},
  风神: {
    init(h) { h.sk.gf = 0; },
    second(h) { h.sk.gf++; },
    stats: h => learned(h, 0) ? { multi: FS.hammer[lvBy(h.stat.int + h.stat.agi, 40, 10) - 1], multiR: 900 } : {},
  },
  大巫师: {
    // 升级（HERO_LEVEL，原图 BMR 的 else 链：只取第一个学会的）
    onLevel(h) { if (learned(h, 0)) h.points++; else if (learned(h, 1)) h.stat.agi++; else if (learned(h, 2)) h.stat.int++; else if (learned(h, 3)) h.stat.str++; },
    // 点"升级"时（BaJ，升级后 <30 级，所以 29→30 那次没有）：巫伤 技能点 +2，死亡呐喊 / 恐怖嚎叫 各 智力 +1
    onLevelBtn(h) { if (h.level >= 30) return; if (learned(h, 0)) h.points += 2; if (learned(h, 2)) h.stat.int++; if (learned(h, 1)) h.stat.int++; },
    randomStat: true,
    cmds: h => [cmd('G', '祭', '巫祭', '<b>巫祭</b><br>献祭自己的一座塔（直接消失、不返还）：<br>巫医塔（3 木）力量 +30~60；巫术塔（3 木）敏捷 +30~60；巫法塔 随机一项 +60；巫魔塔（3 木）智力 +30~60<br>巫师塔（光明）→ 学会巫驱；巫师塔（暗黑）→ 学会巫缓（占技能名额，木材 / 力量要求同学习技能）',
      () => { G.pending = 'wuji'; G.placing = null; msg('巫祭：选择要献祭的塔（Esc 取消）'); uiDirty(); }, { active: G.pending === 'wuji', ico: 'learn' })],
  },
  幻影: {
    init(h) { h.sk.bash = 1; h.sk.crit = 1; h.sk.gk = 0; },
    stats: h => ({ dmg: 600 * hyTech(h).atk, as: 0.25 * hyTech(h).as }),
    manaRegen: h => 1 + 0.02 * hyTech(h).mp,
    onLaunch(h, tg) {                                   // 攻击时 (力暴 + 敏重 + 召唤×2)/25 召唤影子 8 秒（总数 < 6 + 幻影之刺 + Gk）
      const n = (learned(h, 1) ? 1 : 0) + (learned(h, 2) ? 1 : 0) + (learned(h, 0) ? 2 : 0);
      if (rint(1, 25) <= n && countSum(h, 'shadow') < 6 + (learned(h, 4) ? 1 : 0) + h.sk.gk) hySpawn(h, tg.x, tg.y, 8);
    },
    towerUpgraded(h, t) {                               // 暴击塔 / 冰霜塔 / 重击塔升到 3 级（BQX）
      if (t.lv < 2) return;
      if (t.fam === '暴击塔') h.sk.crit = 2; if (t.fam === '冰霜塔') h.sk.gk = 2; if (t.fam === '重击塔') h.sk.bash = 2;
    },
    info: h => [`影子 ${countSum(h, 'shadow')} 个 · 攻击 +${600 * hyTech(h).atk}（R009 ${hyTech(h).atk}）· 攻速 +${25 * hyTech(h).as}%（R00A ${hyTech(h).as}）`],
  },
  渔人: {
    init(h) { h.sk.fl = [0, 0, 0, 0]; h.sk.go = 1; h.sk.lp = 0; h.sk.evo = 0; h.sk.r00c = 0; },
    onLaunch(h, tg) {                                   // BQm：学了的每种鱼人，场上没有普通版且 Plus 版 ≤1 时召唤；再判定大鱼
      YL.fish.forEach((f, i) => {
        if (!h.sk.fl[i] || countSum(h, 'fishN' + i) || countSum(h, 'fishP' + i) > 1) return;
        const plus = h.sk.evo, [dmg, cd, range, atk, n, jump, aura] = plus ? f.p : f.n;
        hsum(h, tg.x + rnd(-80, 80), tg.y + rnd(-80, 80), plus ? 12 : 8, { range, atk, bounce: n, jump }, { label: '甲乙丙丁'[i], title: f.name + (plus ? '（Plus）' : ''), kind: (plus ? 'fishP' : 'fishN') + i,
          stats: () => ({ dmg: dmg + 200 * h.sk.r00c, cd: cd / (1 + 0.15 * Math.min(50, Math.floor(h.stat.agi / 10))) }), aura });
      });
      const chance = h.sk.fl.reduce((s, v) => s + v, 0);
      if (rint(1, 100) <= chance && countSum(h, 'bigfish') < h.sk.go + G.petFx.go - h.sk.lp)   // 宠物小鱼人 / 小牛：Go 加大鱼上限
        hsum(h, tg.x, tg.y, h.sk.evo * 20 + 50, { range: 500, atk: 'hero', bounce: 8, jump: 600 }, { label: '鱼', title: '大鱼', kind: 'bigfish',
          stats: () => ({ dmg: 1200 + 200 * h.sk.r00c, cd: 1 / (1 + 0.15 * Math.min(50, Math.floor(h.stat.agi / 10))) }),
          onHit(s, m) { if (Math.random() < 0.1) { aoeAt(h, m.x, m.y, 300, 40000, 'hero'); FXS.nova(m.x, m.y, 300, '#5aa8ff', 0.4); } } });
    },
    onKill(h, m, src) { if (src === h) h.sk.r00c = Math.min(50, Math.max(h.sk.r00c, Math.floor(h.stat.int / 20) - 2)); },   // R00C 只升不降
    info: h => [`鱼人攻击 +${200 * h.sk.r00c} · 攻速 +${15 * Math.min(50, Math.floor(h.stat.agi / 10))}% · 大鱼上限 ${Math.max(0, h.sk.go + G.petFx.go - h.sk.lp)}`],
  },
  狂牛: {
    init(h) { h.home = { x: h.x, y: h.y }; h.sk.hj = false; h.sk.kn3 = 0; },
    auras: h => learned(h, 1) ? [{ x: h.x, y: h.y, r: 800, kind: 'heroSlow', v: 0.5 }, { x: h.home.x, y: h.home.y, r: 800, kind: 'heroSlow', v: 0.5 }] : [],
    cmds: h => learned(h, 2) && !h.sk.hj ? [cmd('G', '生', '放重生点', '<b>重生点</b>（手动）<br>选择一个地点：2 秒后英雄瞬移过去并践踏', () => { G.pending = 'kuward'; G.placing = null; msg('重生点：选择地点（Esc 取消）'); uiDirty(); },
      { active: G.pending === 'kuward', ico: 'blink', cdOf: () => [cdLeft(h, 'ward'), 3] })] : [],
    info: h => learned(h, 2) ? [`重生点：${h.sk.hj ? '自动' : '手动'}${h.sk.kn3 === 3 ? '（失效中）' : ''}`] : [],
  },
  神牛: {
    init(h) { h.sk.g2 = [0, 0, 0, 0, 0]; h.sk.gz = 0; h.sk.g1 = 0; h.sk.g0 = 0; h.sk.mp = 0; },
    stats: h => learned(h, 0) ? { multi: SN.multi[h.sk.g2[0] - 1], multiR: 800 } : {},
    auras: h => learned(h, 4) ? [{ x: h.x, y: h.y, r: 300, kind: 'drums', v: SN.drums[h.sk.g2[4] - 1] }] : [],
    onKill(h, m, src) {                                 // BRU：英雄亲手杀敌累计属性
      if (src !== h) return;
      const s = h.sk;
      if (s.mp < 1) s.mp = h.stat.str >= 1000 ? 1 : h.stat.agi >= 1000 ? 2 : h.stat.int >= 1000 ? 3 : 0;
      if (s.gz >= 1) { h.stat.str += s.mp === 1 ? 2 : 1; s.gz -= 1; } else s.gz += s.g2[1] * 0.15 + 0.2;
      if (s.g1 >= 1) { h.stat.agi += s.mp === 2 ? 2 : 1; s.g1 -= 1; } else s.g1 += s.g2[2] * 0.15 + G.petFx.g3;   // 宠物小牛：G3
      if (s.g0 >= 2) { h.stat.int += s.mp === 3 ? 4 : 2; s.g0 -= 1; } else s.g0 += s.g2[3] * 0.25 + G.petFx.g3;
    },
  },
  箭灵: {
    init(h) { h.sk.gb = 0; h.sk.gc = 0; h.sk.ga = 0; h.sk.jg = 0; h.sk.r01b = 0; },
    second(h) { h.sk.gb++; },
    stats: h => ({ dmg: 1000 * h.sk.r01b, multi: learned(h, 2) && !h.sk.ga ? 2 : 0, multiR: 900 }),
    onKill(h, m, src) {
      const s = h.sk;
      // 邪恶之箭：英雄或骷髅杀死的敌人变成骷髅弓箭手 5 秒（总数 < 4 + 3×GC）
      if (!s.ga && learned(h, 2) && (src === h || src.kind === 'skel') && countSum(h, 'skel') < 4 + 3 * s.gc) {
        const [, dmg, cd] = JL.skel.find(([a]) => h.stat.str >= a);
        hsum(h, m.x, m.y, 5, { dmg, cd, range: 400, atk: 'chaos', multi: 2, multiR: 400 }, { label: '骷', title: '骷髅弓箭手', kind: 'skel', mobile: { speed: 270, leash: 1400 } });
      }
      // 神之箭魂杀敌：900 范围 [魔法/3000 × 英雄攻击力] 通用无视护甲
      if (src.kind === 'soul') aoeAt(h, src.x, src.y, 900, h.mana / 3000 * heroStats(h).dmg, 'hero', { ignoreArmor: true });
      // 箭灵之殇：每杀 50 个 +1000 攻击（最多 30 级）
      if (++s.jg >= 50 && s.r01b < 30) { s.jg -= 50; s.r01b++; }
    },
    info: h => [`箭灵之殇 ${h.sk.r01b} 级（攻击 +${1000 * h.sk.r01b}）· 下一级还要 ${50 - h.sk.jg} 个`],
  },
  神幻: {
    init(h) { h.sk.hc = [0, 0, 0, 0, 0]; h.sk.jt = [1, 1, 1]; },
    stats: h => learned(h, 0) ? { multi: 999, multiR: h.sk.hc[0] >= 2 ? 1000 : 700 } : {},
    onLaunch(h, tg) {
      // 每次攻击：目标处 700 范围 (三霆技能等级之和)×英雄等级×20 通用无视护甲
      const sum = h.sk.hc[1] + h.sk.hc[2] + h.sk.hc[3];
      if (sum) aoeAt(h, tg.x, tg.y, 700, sum * h.level * 20, 'hero', { ignoreArmor: true });
      // 雷霆 10% / 战霆 6% / 怒霆 5%（数量 < 技能等级）
      [[1, 10, 2.1, 200, '雷', '雷霆'], [2, 6, 3.1, 250, '战', '战霆'], [3, 5, 4.1, 300, '怒', '怒霆']].forEach(([j, p, life, r, label, title]) => {
        if (!h.sk.hc[j] || rint(1, 100) > p || countSum(h, 'th' + j) >= h.sk.hc[j]) return;
        hsum(h, tg.x, tg.y, life, { cd: 0.4, range: 500, atk: 'normal' }, { label, title, kind: 'th' + j, silent: true, onLaunch(s, m) {
          const x = j === 1 ? t5(h.stat.str, [90, 60, 30, 12, 6]) * h.stat.str : j === 2 ? t5(h.stat.agi, [120, 90, 60, 30, 10]) * h.stat.agi
            : (h.stat.int >= 200 ? t5(h.stat.int, [150, 100, 60, 0, 0]) : h.stat.agi >= 100 ? 30 : 15) * h.stat.int;
          aoe(h, m, r, x, ['normal', 'magic', 'chaos'][j - 1]); aoe(h, m, r, h.sk.jt[j - 1] * 50, ['normal', 'magic', 'chaos'][j - 1], true);
          if (j === 1) { m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, 180); m.shredUntil = G.t + 10; }
          if (j === 2 && Math.random() < 0.25) stun(m, 10);
          FXS.beam(s.x, s.y, 300, m.x, m.y, 40, ['#ffd257', '#7ab8ff', '#c48bff'][j - 1], 1.4, 0.15);
        } });
      });
    },
    onKill(h, m, src) { if (h.sk.hc[4] && /^th[123]$/.test(src.kind || '')) h.sk.jt[+src.kind[2] - 1]++; },
    info: h => h.sk.hc[4] ? [`霆杀：雷霆 ${h.sk.jt[0]} · 战霆 ${h.sk.jt[1]} · 怒霆 ${h.sk.jt[2]}`] : [],
  },
  坦克: {
    init(h) { Object.assign(h.sk, { kl: 0, kp: 0, nh: 0, nf: 0, kn: 0, km: 0, ko: 0, ne: 0, w: 0, e: 0, r01j: 0, bt: 0 }); },
    stats: h => ({ dmg: 200 * tkTech(h), multi: h.sk.nf ? 2 : 0, multiR: 800 }),
    // BWX：学了火炮时英雄自己的攻击、学了轰炸区后任何塔的攻击（原图条件优先级，照搬）都会走一次
    anyAttack(h, t, tg) {
      const s = h.sk;
      if (!((t === h && s.kn) || s.km)) return;
      if (s.kl >= 100 && s.km) { s.kl -= 100; h.baseBonus += 15; popText(h.x, h.y + 80, '+15', '#7fffd4'); }
      if (s.kl >= 24 - s.ne * 8 && s.kn && s.w === 1 && tg) {
        s.kl = 0; s.nh = 18; h.baseBonus += 3;
        const x = tg.x, y = tg.y, d = heroStats(h).dmg * tiers(h.stat.agi, [210, 140, 70], [9, 6, 3, 1]);
        later(0.1, () => { aoeAt(h, x, y, 400, d, 'hero'); FXS.explosion(x, y, 1.4, '#ffb347'); FXS.nova(x, y, 400, '#ffb347', 0.4); });
      } else if (s.e !== 1) {
        s.kl++;
        if (s.kp >= 1) { s.kl++; s.kp = s.kp - 1 + s.nf * (h.stat.int / (333 - s.ne * 133)); }
        else s.kp += s.nf * (h.stat.int / 500);
      }
    },
    tick(h, dt) {                                       // 每 0.2 秒：轰炸区开着时轰炸（BWa）；关着时火炮后 2 秒的余波（BWd）
      const s = h.sk;
      s.bt += dt;
      while (s.bt >= 0.2) {
        s.bt -= 0.2;
        if (s.km && s.e === 1) {
          if (s.kl >= 2) {
            s.kl--; tkBomb(h, 4);
            if (s.w === 2) { const k = s.ne ? tiers(h.stat.agi, [210, 140, 70], [12, 8, 5, 2]) : tiers(h.stat.agi, [210, 140, 70], [4, 2.66, 1.66, 0.66]); tkShell(h, k); }
          }
          if (s.kl < 2) { s.e = 2; msg('能量不足，混乱轰炸区自动关闭'); uiDirty(); }
        } else if (s.km && s.nh >= 2) { s.nh--; if (s.nh < 12) tkBomb(h, 4); }
      }
    },
    onKill(h, m, src) {                                 // R01J：坦克或冲锋枪杀敌时更新
      if (src !== h && src.kind !== 'smg') return;
      const sum = h.stat.str + h.stat.agi + h.stat.int, x = h.level >= 30 ? 8 : h.level >= 20 ? 20 : h.level >= 10 ? 30 : 40;
      if (h.sk.r01j <= 100) h.sk.r01j = Math.min(100, Math.floor(sum / x));
    },
    onElite(h, src) { if (src === h || src.kind === 'smg') { h.stat.str += 3; msg('坦克击杀精英：力量 +3'); } },   // 原图条件优先级：不需要战争科技
    cmds: h => [
      h.sk.kn ? cmd('G', '炮', '巨型火炮弹：' + (h.sk.w === 1 ? '开' : '关'), `<b>巨型火炮弹</b>（点击切换开关）<br>开：能量 ≥${24 - 8 * h.sk.ne} 时攻击发射巨型火炮，400 范围 攻击力×X 通用<br>关：混乱轰炸区里随机落下小一号的巨型火炮`,
        () => { h.sk.w = h.sk.w === 1 ? 2 : 1; uiDirty(); }, { active: h.sk.w === 1, ico: 'upgrade' }) : null,
      h.sk.km ? cmd('H', '轰', '混乱轰炸区：' + (h.sk.e === 1 ? '开' : '关'), `<b>混乱轰炸区</b>（点击切换开关）<br>开：每 0.2 秒消耗 1 点能量，坦克周围随机 4 处轰炸（攻击力×${18 + 3 * h.sk.ko} 混乱）；开着时不攒能量，少于 2 点自动关<br>关：巨型火炮之后轰炸 2 秒`,
        () => { if (h.sk.e !== 1 && h.sk.kl < 2) return msg('能量不足'); h.sk.e = h.sk.e === 1 ? 2 : 1; uiDirty(); }, { active: h.sk.e === 1, ico: 'upgrade' }) : null,
    ].filter(Boolean),
    info: h => [`能量 ${h.sk.kl} · 坦克伤害 ${h.sk.r01j} 级（+${200 * h.sk.r01j}）`],
  },
  古树: {
    init(h) { Object.assign(h.sk, { j7: 0, j8: 0, j9: 0, nx: 0, ni: 0, b02g: 0, r01h: 0, r01i: 0, wt: 0 }); },
    stats: h => ({ dmg: 100 * gsTech(h).atk, as: 0.1 * gsTech(h).as }),
    onLaunch(h) { gsTreeAttack(h, h); },
    tick(h, dt) {                                       // 清风：每 0.5 秒沿 1→2→3→4→主古树→1 依次吹
      if (!learned(h, 0)) return;
      h.sk.wt += dt;
      if (h.sk.wt < 0.5) return;
      h.sk.wt -= 0.5;
      const trees = heroUnits(h).filter(t => t.kind === 'tree').sort((a, b) => a.idx - b.idx), chain = [...trees, h];
      if (chain.length < 2) return;
      const lv = Math.min(10 + h.sk.ni, Math.max(1, Math.floor(h.stat.int / 20))), dmg = GS.wind[lv - 1];
      for (let k = 0; k < chain.length; k++) { const a = chain[k], b = chain[(k + 1) % chain.length]; gsWind(h, a, b, dmg); }
    },
    onKill(h, m, src) {
      if (src !== h) return;
      h.sk.r01h = Math.min(40, Math.floor(h.stat.str / 20));
      if (learned(h, 3)) h.sk.r01i = Math.min(40, Math.floor(h.stat.agi / 15));
    },
    cmds: h => [cmd('G', '树', '种古树', `<b>种古树</b> <span class="gold">500 金</span> · 1 人口<br>每学会 1 个技能可以多种 1 棵（最多 4 棵连成清风链条）。现在 ${heroUnits(h).filter(t => t.kind === 'tree').length}/${Math.min(4, h.sk.j7)}`,
      () => { G.placing = 'ancient'; G.pending = null; uiDirty(); }, { active: G.placing === 'ancient', ico: 'build', disabled: heroUnits(h).filter(t => t.kind === 'tree').length >= Math.min(4, h.sk.j7) })],
    info: h => [`古树链带：攻击 +${100 * gsTech(h).atk} · 攻速 +${10 * gsTech(h).as}%${h.sk.b02g > G.t ? ' · 生灵激活' : ''}`],
  },
};
// 清风（腐臭蜂群）：从一棵古树吹向下一棵，宽 100→200，长 1100，魔法无视护甲
function gsWind(h, a, b, dmg) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  for (const m of G.monsters) {
    if (m.dead) continue;
    const ax = m.x - a.x, ay = m.y - a.y, along = ax * ux + ay * uy, side = Math.abs(ax * uy - ay * ux);
    if (along < 0 || along > 1100 || side > 100 + 100 * along / 1100) continue;
    hurt(m, dmg, 'magic', h, { ignoreArmor: true });
  }
  FXS.beam(a.x, a.y, 120, a.x + ux * Math.min(L, 1100), a.y + uy * Math.min(L, 1100), 80, '#9fffb0', 1.6, 0.3);
}
// 坦克：轰炸区里随机 n 处（坦克 ±700）150 范围 最大攻击力×(18+3×冲锋枪) 混乱
function tkBomb(h, n) {
  const d = heroStats(h).dmg * (18 + 3 * h.sk.ko);
  for (let k = 0; k < n; k++) { const x = h.x + rnd(-700, 700), y = h.y + rnd(-700, 700); aoeAt(h, x, y, 150, d, 'chaos'); FXS.explosion(x, y, 0.6, '#ff8a3c'); }
}
function tkShell(h, k) { const x = h.x + rnd(-700, 700), y = h.y + rnd(-700, 700); aoeAt(h, x, y, 200, heroStats(h).dmg * k, 'hero'); FXS.explosion(x, y, 1, '#ffb347'); }
// 光环：英雄本身的 + 召唤物身上的（鱼人、冰箭、箭魂）
function heroAuraList(h) {
  const out = (HERO_DEF[h.heroName].auras || (() => []))(h);
  for (const s of heroUnits(h)) if (s.aura && (!s.until || s.until > G.t)) for (const a of [].concat(s.aura)) out.push({ x: s.x, y: s.y, ...a });
  return out;
}
const statCN = s => ({ str: '力量', agi: '敏捷', int: '智力' })[s];
// 原图英雄塔是建筑（h03R 剑神等：1500 金 + 5 木 + 4 人口），建成后触发器把它换成英雄单位；全场唯一，建造后不能回收。
// 还要 10 点当局成就（不够时原图退钱并提示"需要10点成就"），建成扣 10 点
const heroBlock = () => G.hero ? '英雄塔全场只能建造一个' : !G.heroChoice ? '建造栏里没有英雄塔'
  : G.ach < RULE.heroAch ? `需要 ${RULE.heroAch} 点当局成就（当前 ${G.ach}）` : null;
function buildHero(x, y) {
  const hd = D.heroes[G.heroChoice], why = heroBlock();
  if (why) return msg(why);
  if (G.gold < hd.gold) return msg('金币不足');
  if (G.wood < hd.wood) return msg('木材不足');
  if (foodUsed() + hd.food > G.foodCap) return msg('人口不足');
  G.gold -= hd.gold; G.wood -= hd.wood; G.ach -= RULE.heroAch;
  const h = { id: G.nextId++, isHero: true, fam: 'hero', heroName: hd.name, cat: 'hero', x, y, lv: 0, level: 1, spent: hd.gold, food: hd.food,
    stat: { str: 10, agi: 10, int: 10 }, growth: 'str', points: 3, baseBonus: 0, mana: 0, learned: [], cdLeft: 0, cds: {}, auto: {}, asBonus: 0, sk: {},
    qs: [0, 0, 0, 0], nb: 0, last: { p: 0, m: 0, c: 0 }, xb: { hail: 0, burst: 0, freeze: 0 },   // 枪神学习次数 / 火焰暴击率 / 上次致命；邪冰技能计数器
    kills: 0, dealt: 0, attacks: 0, buff: {}, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, levels: [{}],
    maxMana() { return D.heroes[this.heroName].mana || 1000; } };
  h.home = { x, y };
  // 建成时随机成长值（原图 DR / DS / DT：力量 0~7，敏捷 0~剩余，智力补足 7）。每次升级英雄自带全属性 +1，再按成长值加，所以显示时各 +1，合计 10
  const r = rint(0, 7), a = rint(0, 7 - r);
  h.grow = { str: r + 1, agi: a + 1, int: 7 - r - a + 1 };
  msg(`${hd.name} 英雄成长值（每次升级自动加属性）：力量 ${h.grow.str} · 敏捷 ${h.grow.agi} · 智力 ${h.grow.int}；有 3 点技能点可以分配`, 8);
  G.towers.push(h); G.hero = h;
  const def = HERO_DEF[hd.name];
  if (def.init) def.init(h);
  return h;
}
// 攻击力 = 基础攻击 + 升级累计的 [力量/5] + 力量×5（StrAttackBonus）+ 技能 / 科技加成；攻速 = 1 + 敏捷×1%（AgiAttackSpeedBonus）+ 技能加成，封顶 +400%
function heroStats(h) {
  const hd = D.heroes[h.heroName], def = HERO_DEF[h.heroName], x = def.stats ? def.stats(h) : {};
  const as = Math.min(AS_CAP, ownAS(h));
  return { dmg: hd.dmg + h.baseBonus + h.stat.str * 5 + (x.dmg || 0), cd: hd.cd / as, range: hd.range, atk: hd.atk, targets: 1, multi: x.multi || 0, multiR: x.multiR || hd.range };
}
function heroTick(h, dt) {
  const def = HERO_DEF[h.heroName];
  h.mana = Math.min(h.maxMana(), h.mana + dt * h.stat.int * 0.01 * (def.manaRegen ? def.manaRegen(h) : 1));   // IntRegenBonus = 0.01
  const sec = Math.floor(G.t) - Math.floor(G.t - dt);                 // 原图每秒一次的计时器（BGU 等）
  for (let k = 0; k < sec; k++) { for (const key in h.xb) h.xb[key] -= 1; if (def.second) def.second(h); }
  for (const i of h.learned) {
    const s = HERO_KITS[h.heroName][i];
    if (s.tick) s.tick(h, dt);
    if (s.cast && h.auto[i] !== false && skillReady(h, i)) castSkill(h, i, true);     // 自动施放
  }
  if (def.tick) def.tick(h, dt);
}
// 主动技能（手动施放的）：冷却剩余秒数 / 是否可放 / 施放
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
  const kit = HERO_KITS[h.heroName], hd = D.heroes[h.heroName], def = HERO_DEF[h.heroName];
  let dmg = st.dmg * h.atkMul;                      // 光环等加成只加普通攻击，技能伤害不加
  for (const i of h.learned) {
    const s = kit[i], c = s.crit ? s.crit(h) : s.critChance && [s.critChance, s.critMul];
    if (c && Math.random() < c[0]) { dmg *= c[1]; SFX.spell('crit', { x: tg.x, y: tg.y }); popText(tg.x, tg.y, c[1] + '倍', '#ffd257'); break; }
  }
  shot(h, tg);
  // 原图的"攻击时"触发器（EVENT_PLAYER_UNIT_ATTACKED）在出手时就判定，不等投射物命中
  if (HERO_ATTACK[h.heroName]) HERO_ATTACK[h.heroName](h, tg);
  if (def.onLaunch) def.onLaunch(h, tg);
  for (const i of h.learned) if (kit[i].onLaunch) kit[i].onLaunch(h, tg);
  // 目标：弹幕（额外 multi 个，multiR 范围内）；弹射（mbounce）
  let targets = [tg];
  if (st.multi) targets = targets.concat(inRange(h.x, h.y, st.multiR).filter(m => m !== tg).slice(0, st.multi));
  const style = missileOf(h), splash = hd.splash, bounce = hd.bounce;
  SFX.ent(sndKey(h), 'launch', { x: h.x, y: h.y });
  const land = primary => (hit, x, y) => {
    if (primary) SFX.ent(sndKey(h), 'hit', { x, y });
    // msplash：落点 Farea1 范围内全额伤害；其他是单体
    if (splash) for (const m of inRange(x, y, splash)) hurt(m, dmg, st.atk, h);
    else if (hit) hurt(hit, dmg, st.atk, h);
    if (hit && primary) for (const i of h.learned) { const s = kit[i]; if (s.onAttack) s.onAttack(h, hit); }
  };
  if (hd.instant) {                                 // 瞬间命中（电法）
    for (const m of targets) { FXS.beam(h.x, h.y, 150, m.x, m.y, 50, '#9fd8ff', 1.2, 0.12); land(m === tg)(m, m.x, m.y); }
    return;
  }
  if (bounce) {                                     // 弹射：依次弹到下一个目标
    const chain = chainTargets(tg, bounce.n, bounce.jump);
    const hop = (i, src) => { if (i >= chain.length) return; FXS.launch(style, src, chain[i], (hit, x, y) => { land(i === 0)(hit, x, y); hop(i + 1, { x, y, z: 50 }); }, { scale: 1.3, ...w3opt(h) }); };
    hop(0, muzzle(h, style));
    for (const m of targets.slice(1)) FXS.launch(style, muzzle(h, style), m, land(false), { scale: 1.3, ...w3opt(h) });
    return;
  }
  for (const m of targets) FXS.launch(style, muzzle(h, style), m, land(m === tg), { scale: 1.3, ...w3opt(h) });
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
// 学习技能：第 n 个（已学 DU = n-1 个）要 18×DU 木材、力量 ≥ 80×DU，最多 4 个；有的技能还有额外条件（canLearn）
const LEARN_COST = [{ wood: 0, str: 0 }, { wood: 18, str: 80 }, { wood: 36, str: 160 }, { wood: 54, str: 240 }];
function learnBlock(h, i, viaSacrifice) {
  const kit = HERO_KITS[h.heroName][i], c = LEARN_COST[h.learned.length];
  if (!c) return '最多学习 4 个技能';
  if (h.stat.str < c.str) return `需要力量达到 ${c.str}`;
  if (G.wood < c.wood) return '木材不足';
  return !viaSacrifice && kit.canLearn ? kit.canLearn(h) : null;
}
function learnSkill(h, i, viaSacrifice) {
  const kit = HERO_KITS[h.heroName][i], name = D.heroes[h.heroName].skills[i].name;
  if (learned(h, i)) return kit.relearn ? relearnSkill(h, i) : kit.up ? upSkill(h, i) : msg('你已经学习了这个技能');
  const why = learnBlock(h, i, viaSacrifice);
  if (why) return msg(why), false;
  G.wood -= LEARN_COST[h.learned.length].wood; h.learned.push(i);
  if (kit.init) kit.init(h);
  msg(`学会了 ${name}`);
  G.menu = 'main';                                   // 学完回到英雄面板，技能就在第一行
  uiDirty();
  return true;
}
// 枪神的技能可以再学一次：10000 金，致命一击升到 2 级（概率 +3%），触发几率 +3%
function relearnSkill(h, i) {
  if (h.qs[i] >= 2) return msg('已经再次学习过了');
  if (G.gold < QS_RELEARN) return msg(`金币不足（再次学习需要 ${QS_RELEARN} 金币）`);
  G.gold -= QS_RELEARN; qsLearn(h, i, 2);
  msg(`再次学习了 ${D.heroes[h.heroName].skills[i].name}`);
  uiDirty();
}
// 其他英雄的"再次学习"（渔人 / 神牛 / 神幻升级技能，狂牛切换重生点）
function upSkill(h, i) {
  const up = HERO_KITS[h.heroName][i].up, c = up.cost(h), why = up.why(h) || (c.gold && G.gold < c.gold ? '金币不足' : c.mana && h.mana < c.mana ? '魔法值不足' : null);
  if (why) return msg(why);
  G.gold -= c.gold || 0; h.mana -= c.mana || 0;
  up.apply(h); SFX.ui('upgrade', { x: h.x, y: h.y });
  uiDirty();
}
// 升级（原图 A0B6 + BMR）：花 等级×100 金 + 200 魔法；英雄自带全属性 +1，基础攻击 + [力量/5]，再加成长值；技能点 +3（≤10 级）/ +4（≤20）/ +5（≤29）/ +9（30 级）
// 满级后：500 金 + 400 魔法，属性选择那项 +3（大巫师随机一项）
function heroLevelUp(h) {
  const max = h.level >= 30, def = HERO_DEF[h.heroName];
  const gold = max ? 500 : h.level * 100, mana = max ? 400 : 200;
  if (G.gold < gold) return msg('金币不足');
  if (h.mana < mana) return msg('魔法值不足（升级需要 ' + mana + ' 魔法）');
  G.gold -= gold; h.mana -= mana; h.spent += gold;
  if (max) { const k = growthStat(h); h.stat[k] += 3; msg(`${statCN(k)} +3`); }
  else {
    h.level++;
    for (const k in h.stat) h.stat[k] += 1;
    h.baseBonus += h.stat.str / 5;
    for (const k in h.grow) h.stat[k] += h.grow[k] - 1;
    h.points += h.level <= 10 ? 3 : h.level <= 20 ? 4 : h.level <= 29 ? 5 : 9;
    if (def.onLevel) def.onLevel(h);
  }
  if (def.onLevelBtn) def.onLevelBtn(h);
  SFX.ui('levelup', { x: h.x, y: h.y });
  uiDirty();
}
// 属性选择那一项；没有属性选择的英雄（大巫师）每次随机一项
const growthStat = h => HERO_DEF[h.heroName].randomStat ? pick(['str', 'agi', 'int']) : h.growth;
// 技能点（原图英雄技能 A05Y / A060 / A05Z / A0FL，学了就移除，所以能一直学）：力量 / 敏捷 / 智力 +2；随机：5% 某项 +3，25% 某项 +2，3% 某项 +4，1% 全 +2
function spendPoint(h, k) {
  if (h.points < 1) return msg('没有技能点');
  h.points--;
  if (k !== 'rand') { h.stat[k] += 2; msg(`${statCN(k)} +2`); }
  else {
    const g = rint(1, 100), [st, v] = g <= 5 ? ['str', 3] : g <= 10 ? ['agi', 3] : g <= 15 ? ['int', 3] : g <= 40 ? ['agi', 2] : g <= 65 ? ['int', 2] : g <= 90 ? ['str', 2]
      : g <= 93 ? ['int', 4] : g <= 96 ? ['agi', 4] : g <= 99 ? ['str', 4] : ['all', 2];
    if (st === 'all') for (const s in h.stat) h.stat[s] += v; else h.stat[st] += v;
    msg(`${st === 'all' ? '全属性' : statCN(st)} +${v}`);
  }
  uiDirty();
}
// 大巫师的巫祭（BSl）：献祭自己的一座塔
const WUJI = { 巫医塔: 'str', 巫术塔: 'agi', 巫魔塔: 'int' };
function wujiSacrifice(h, t) {
  if (!t || !G.towers.includes(t) || t.isHero || t.cat === 'summon') return msg('只能献祭自己的塔');
  if (WUJI[t.fam]) { if (G.wood < 3) return msg('木材不足（需要 3 木材）'); G.wood -= 3; const v = rint(30, 60); h.stat[WUJI[t.fam]] += v; msg(`献祭成功，增加 ${v} 点${statCN(WUJI[t.fam])}`); }
  else if (t.fam === '巫法塔') { const k = pick(['agi', 'int', 'str']); h.stat[k] += 60; msg(`献祭成功，增加 60 点${statCN(k)}`); }
  else if (t.fam === '巫师塔（光明）' || t.fam === '巫师塔（暗黑）') {
    const i = t.fam === '巫师塔（光明）' ? 3 : 4;
    if (learned(h, i)) return msg('你已经学习了这个技能');
    if (!learnSkill(h, i, true)) return;
    msg(`献祭成功，获得[${D.heroes[h.heroName].skills[i].name}]技能`);
  } else return msg('只能献祭巫医 / 巫术 / 巫法 / 巫魔塔和巫师塔（光明 / 暗黑）');
  FXS.nova(t.x, t.y, 200, '#c48bff', 0.6);
  G.towers = G.towers.filter(o => o !== t);
  if (G.selected === t) G.selected = h;
  uiDirty();
}

// ---------------------------------------------------------------- 光环 (每帧重算)
function applyAuras() {
  for (const m of G.monsters) { m.auraFocus = 0; m.auraArmorDown = 0; m.auraSlow = 0; m.auraSpeed = 0; m.auraRegen = 0; m.heroSlow = 0; }
  for (const t of G.towers) { t.buffAS = 0; t.buffDmg = 0; t.eliteAS = 0; t.eliteWeak = 0; t.selfAS = 0; t.selfAS2 = 0; t.selfAtk = 0; t.selfAtk2 = 0; t.drums = 0; }
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
  // 英雄和它的召唤物身上的光环：鱼人的攻击 / 加速 / 减防 / 减速光环和同类光环塔取大；神盾光辉（战鼓）另算；水魔环 / 狂牛的减速与减速光环叠加
  const heroSlows = [];
  if (G.hero) for (const a of heroAuraList(G.hero)) {
    const near = t => dist2(a.x, a.y, t.x, t.y) <= (a.r + FOOT_HALF) ** 2;
    if (a.kind === 'towerDmg') for (const t of G.towers) { if (near(t)) t.buffDmg = Math.max(t.buffDmg, a.v); }
    if (a.kind === 'towerAS') for (const t of G.towers) { if (near(t)) t.buffAS = Math.max(t.buffAS, a.v); }
    if (a.kind === 'drums') for (const t of G.towers) { if (near(t)) t.drums = Math.max(t.drums, a.v); }
    if (a.kind === 'armor') armorAuras.push([a, a.r, a.v]);
    if (a.kind === 'slow') slowAuras.push([a, a.r, a.v]);
    if (a.kind === 'heroSlow') heroSlows.push([a, a.r, a.v]);
  }
  // 寒冰塔的冰霜光环：600 范围敌人移速 -(5 + 3×(等级-1))%（和减速光环同类，取最大）
  for (const t of G.towers) if (t.fam === '寒冰塔') slowAuras.push([t, 600, 0.05 + 0.03 * (t.ice.aura - 1)]);
  for (const m of G.monsters) {
    if (m.dead) continue;
    for (const [a, r, v] of armorAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraArmorDown = Math.max(m.auraArmorDown, v);
    for (const [a, r, v] of slowAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraSlow = Math.max(m.auraSlow, v);
    for (const [a, r, v] of heroSlows) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.heroSlow = Math.max(m.heroSlow, v);
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
function monstersAlive() { return G.monsters.filter(m => !m.dead && !m.neutral).length; }   // 中立单位（小精灵、小偷）不算怪数（原图只数 Player(11)）
// 场上怪物上限（原图 M3 = C9[1]+…+C9[8]）：每个在场玩家 40
function cap() { return G.final && G.final.endless ? 15 : G.c9.reduce((a, b) => a + b, 0); }
// 玩家离开（联机用）：原图 SQ 等触发器把他的 C9 每秒 -1 直到 0，上限慢慢降下来；他的出怪口照样出怪
function playerLeft(slot) {
  const tick = () => { if (G.c9[slot] > 0) { G.c9[slot]--; later(1, tick); } };
  later(1, tick);
}
// 出怪口：spec 是原图刷怪的位置写法（tools/wave_rolls.py 解析）——
//   'each'：8 个口各刷 1 只（循环 Uk[1..8]）→ 每个开着的口各 1 只
//   [a, b]：Uk[GetRandomInt(a,b)] / Qu[GetRandomInt(a,b)]，第 a~b 个口随机一个 → 在其中开着的口里随机，都没开就不刷
//   出怪口区域名（I、p、m…，原图把 Uk[1]~Uk[8] 逐个写出来各刷 1 只）→ 这个口开着才刷
//   拐点区域名（K、X、Q…，原图"全图随机一个口刷 1 只"的分支）→ 这个口没开就改在随机一个开着的口
//   'any'：沿用上一个函数里的位置（全图只刷 1 只）→ 随机一个开着的口
// 返回 [{ gate, at }] 列表
function gateSpots(spec = [1, 1]) {
  if (spec === 'each') return G.gates.map(g => ({ gate: g, at: 0 }));
  if (Array.isArray(spec)) {
    const open = G.gates.filter(g => g >= spec[0] - 1 && g <= spec[1] - 1);
    return open.length ? [{ gate: pick(open), at: 0 }] : [];
  }
  for (let g = 0; g < GATES.length; g++) {
    const at = GATES[g].indexOf(spec);
    if (at === 0) return G.gates.includes(g) ? [{ gate: g, at }] : [];
    if (at === 1) return [{ gate: G.gates.includes(g) ? g : pick(G.gates), at }];
  }
  return [{ gate: pick(G.gates), at: 0 }];
}
function spawnAt(spec, id, opt = {}) { return gateSpots(spec).map(p => spawnMonster(id, { ...opt, ...p })).filter(Boolean); }
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
function waveOp(op, id, n, life, gate) {
  if (op === 'sc') { G.sc = id; if (!G.curUnit) { G.curUnit = id; refreshHint(); } }
  if (op === 'sp') startSpawner(id);
  if (op === 'mk') for (let i = 0; i < n; i++) for (const m of spawnAt(gate, id, { boss: D.units[id] && D.units[id].hp >= 3000 })) if (life) m.until = G.t + life;
}
function startWave() {
  const lastWave = MODES[G.mode].waves;
  if (lastWave && G.wave >= lastWave) {           // 演示模式：最后一波打完（场上清空）就结束
    if (monstersAlive() === 0 && !G.spawners.length) return demoEnd();
    G.timer = 2; G.hint = `第 ${G.wave} 波已出完：清掉场上剩余的 ${monstersAlive()} 只怪物，演示结束`; return;
  }
  const alive = monstersAlive();
  G.wave++;
  if (alive === 0) { G.perfect++; G.ach += RULE.achPerPerfect; msg(`Perfect +1（当前 ${G.perfect}），当局成就 +${RULE.achPerPerfect}`); earnAch(PROFILE.perfect); }
  if (G.player && G.mode !== 'demo') { const p = profileOf(G.player); if (G.wave > p.best) p.best = G.wave; }
  earnAch(PROFILE.wave);
  G.score -= alive;
  // 每波发金：排行榜名次 ×8 + 波数 ×2（原图 wX：LeaderboardGetPlayerIndexBJ，按杀敌数排，名次越靠后拿得越多；只有你一人时是第 1 名）
  for (const p of activePlayers()) addGold(p, rankOf(p.slot) * 8 + G.wave * 2);
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
  for (const [t, op, id, k, life, gate] of row.ev) later(t, () => waveOp(op, id, k, life, gate));
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
    later(60, () => {
      for (const m of G.monsters) if (m.uid === 'nsqt') m.dead = true;
      for (const p of activePlayers()) addGold(p, killed * 100);        // 原图给 Player(0)~(7) 每人 Dq×100
      msg(`BOSS 波通关，20 秒后下波开始。大红牛死亡 ${killed} 个，每位玩家获得 ${killed * 100} 金币`);
      spawnWildPet();
    });
  },
  // 10 波大豪猪：同上，奖励是木材（死亡个数 ÷ 7）
  xK() {
    let killed = 0;
    G.waveNote = '　坚持 60 秒，未杀完 BOSS 不会失败；杀死的大豪猪越多，结束后木材越多（每 7 只 +1），60 秒时没杀死的自动消失';
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsqa' || m.uid === 'n09B') m.onDeath = () => { killed++; }; } };
    later(60, () => {
      for (const m of G.monsters) if (m.uid === 'nsqa' || m.uid === 'n09B') m.dead = true;
      const w = Math.floor(killed / 7); for (const p of activePlayers()) addWood(p, w);
      msg(`BOSS 波通关，20 秒后下波开始。大豪猪死亡 ${killed} 个，每位玩家获得 ${w} 木材`);
      spawnWildPet();
    });
  },
  // 20 波骷髅：100 秒内杀死 BOSS，否则失败
  xf() { BOSS_WAVES.xi(); },
  xi() {
    G.waveNote = '　<b style="color:#ff5a4f">100 秒内杀死所有 BOSS，否则游戏失败</b>';
    G.bossRule = { killBy: G.t + 100, ids: [] };
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsko' || m.uid === 'n071') G.bossRule && G.bossRule.ids.push(m); } };
  },
  // 30 波飞艇：出怪单位每秒在 4 种护甲的飞艇里随机换（开局定下是亡灵飞艇还是地精飞艇）；63 秒出怪结束，
  // 杀得最多（比其他每个玩家都多，原图 EG[i] > 其余 7 个）的玩家 +20 木，否则（并列，或都没杀）全体 +5 木
  x3() {
    const ships = {};
    G.waveNote = '　坚持 80 秒！飞艇每只护甲随机；杀死最多飞艇的玩家奖励 20 木材';
    const kinds = AIRSHIPS[G.k7];
    G.waveHook = { onSpawn(m) { if (kinds.includes(m.uid)) m.onDeath = src => { const k = pidOf(src); ships[k] = (ships[k] || 0) + 1; }; } };
    for (let s = 0; s < 63; s++) later(s, () => { G.sc = pick(kinds); });
    later(63, () => {
      const ps = activePlayers(), n = p => ships[p.slot] || 0;
      msg('出怪结束：' + ps.map(p => `${p.name} ${n(p)}`).join(' / '));
      const top = ps.find(p => ps.every(q => q === p || n(p) > n(q)) && n(p) > 0);
      if (top) { addWood(top, 20); msg(`${top.name}杀死最多飞艇，获得 20 木材奖励`); }
      else { for (const p of ps) addWood(p, 5); msg('多个玩家杀死同样最多飞艇，全体玩家获得 5 木材奖励'); }
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
// 最终 BOSS 波（原图 yo）：倒计时 300 秒。先出熊猫（第 34 波定下的那种），20 秒后出龙：上限 M3 ≤ 50（单人）1 条四色随机的龙，
// 否则青龙（1~2 号口），M3 > 50 再加红龙（2~4 号口）、> 200 绿龙（7~8 号口）、> 300 蓝龙（5~6 号口），每条龙一半概率护甲改成 200；
// 每条龙进场带 4 只狗头人；59 秒出魔王（随机一个口，按人数带护甲 / 生命物品）并开始刷耐瑟龙，同时每个口出巨龙，之后每 55 秒补魔龙、速龙。
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
  const dragon = (id, spec) => {
    for (const d of spawnAt(spec, id, { boss: true })) {
      need(d);
      if (Math.random() < 0.5) d.armor = 200;
      d.onDeath = () => { G.wood += 20; msg('你杀死了一条龙，获得 20 点木材'); };
      for (const k of KOBOLDS) { const g = spawnMonster(k, { boss: true, gate: d.gate, at: d.at }); if (g) { Object.assign(g, { x: d.x, y: d.y }); g.onDeath = () => { G.wood += 5; msg('你杀死了一只狗，获得 5 点木材'); }; } }
      msg(`${d.name}出现了，带着 4 只狗头人`);
    }
  };
  later(20, () => {
    const M3 = cap();
    if (M3 <= 50) dragon(Math.random() < 1 / 4 ? 'nbzd' : Math.random() < 1 / 3 ? 'nrdr' : pick(['nrdk', 'ngrd']), [1, 1]);
    else dragon('nbzd', [1, 2]);
    if (M3 > 50) later(0.3, () => dragon('nrdr', [2, 4]));
    if (M3 > 200) later(0.6, () => dragon('ngrd', [7, 8]));
    if (M3 > 300) later(0.9, () => dragon('nrdk', [5, 6]));
  });
  later(59.3, () => {
    G.sc = 'nndr';
    // 魔王的物品按人数（原图 CountPlayersInForceBJ）：≤2 人护甲 +22；≤4 人 +52、生命 +20 万；≤6 人 +82、+40 万；8 人 +122、+80 万
    const [arm, hp] = G.players <= 2 ? [22, 0] : G.players <= 4 ? [52, 2e5] : G.players <= 6 ? [82, 4e5] : [122, 8e5];
    for (const u of spawnAt([1, 8], 'Udea', { boss: true })) { need(u); u.armor += arm; u.maxHp += hp * G.hpScale; u.hp += hp * G.hpScale; }
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
  [[59.3, 'njga'], [114.3, 'n07W'], [169.3, 'n07V']].forEach(([t, id]) => later(t, () => { startSpawner('少'); spawnAt('each', id, { boss: true }); }));
}

// ---------------------------------------------------------------- 兔子（成就商店）
// 原图 nshe：中立单位，模型是复活节兔子（放大 3 倍），刷在外环外四块区域里的随机一点，小地图闪烁，60 秒后"咕~"一声消失
const RABBIT_TALK = ['跑圈啦! 跑圈啦!跑圈啦!', '咦，人呢？找不到我！啦啦啦！', '别过来，你们都别过来！我就只是想逛逛圈圈而已！',
  '这些宠物一点都比不上我，我是说速度！1，2，3虚浮！', '主塔后面不补塔，一看就是个麻瓜！', '我真希望能永远在大家身边！T。T'];
// 兔子卖的东西（原图 nshe 的物品栏，analysis/data/shops.json）。药水原图是买下后对塔使用：知识 / 重修药水只能对英雄用，单人只有一个英雄塔，买下直接用在英雄塔上；
// 魔法药水、天赋秘籍要选目标（放进守卫者物品栏）。4 种塔类之球每买一个 +1 许愿点；每局第一次在兔子这里买东西（重修药水除外）有 1/20 掉一包糖果（原图 BL1）
// 魔法药水的目标（原图 BKO：有这些功勋 / 魔法技能的塔 +200，天神塔 +600；英雄没有这些技能，用不了）
const MP_POTION_FAMS = new Set(['扫射塔', '天将塔', '巫妖塔', '剑圣塔', '魔幻塔', '风行塔', '寒冰塔', '将军塔', '神圣塔', '人马塔', '银行塔', '五行塔', '燃烧塔', '破坏塔', '小熊猫塔', '死亡塔', '狂狼塔', '深渊塔', '兽王塔', '弹跳塔']);
const orb = cat => () => { if (rerollSlot(cat) === false) return false; G.wish++; msg(`许愿点 +1（当前 ${G.wish}）`); };
const RABBIT_SHOP = [
  { id: 'I00K', key: 'Q', name: '原始之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的原始塔<br>获得 1 点许愿点', use: orb('raw') },
  { id: 'I00M', key: 'W', name: '光环之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的光环塔<br>获得 1 点许愿点', use: orb('aura') },
  { id: 'I00N', key: 'E', name: '辅助之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的 2 个辅助塔<br>获得 1 点许愿点', use: orb('sup') },
  { id: 'I00L', key: 'R', name: '另类之球', ach: 2, wood: 1, tip: '随机 1 次建造栏的另类塔<br>获得 1 点许愿点', use: orb('alt') },
  { id: 'I01I', key: 'A', name: '5个木材', ach: 1, gold: 2500, cd: 1, tip: '购买 5 个木材', use: () => { G.wood += 5; msg('木材 +5'); } },
  { id: 'I01U', key: 'S', name: '魔法药水', ach: 2, gold: 4000, cd: 6, inv: true, range: 600,
    tip: '对一座有魔法功勋的塔（魔幻、剑圣、寒冰、神圣、扫射、银行、弹跳塔 MAX 等）使用，获得 200 点魔法；天神塔获得 600 点魔法<br>英雄塔不能使用',
    pick: '魔法药水：选择有魔法功勋的塔（Esc 取消）',
    ok: t => !t || t.isHero || !(t.fam === '天神塔' || (MP_POTION_FAMS.has(t.fam) && t.maxMana > 0 && (t.fam !== '弹跳塔' || t.bmax))) ? '添加失败，该单位无魔法功勋' : null,
    use: t => { const v = t.fam === '天神塔' ? 600 : 200; addMana(t, v); msg(`${curLevel(t).name} 魔法 +${v}`); } },
  { id: 'I01W', key: 'D', name: '天赋秘籍', ach: 5, wood: 20, give: 'I01X', tip: '对 MAX 光环塔使用，激活<b>至尊天赋</b>（光环升到 3 级：加速 +90% / 攻击 +154% / 减防 -115 / 减速 -80%），已激活基础天赋的不能再激活<br>对全场唯一塔（恐惧 / 火速 / 神力 / 冰封）使用技能 +2 级，银行塔 +3 级<br>每局只有 4 个库存（所有玩家共用）',
    why: () => G.talentStock > 0 ? null : '已无库存', onBuy: () => { G.talentStock--; } },
  { id: 'I02A', key: 'F', name: '知识药水', ach: 3, gold: 2500, cd: 6, hero: true, max: 6, tip: '英雄塔属性选择那一项 +7~12 点（大巫师随机一项，每局最多 6 支）',
    use: h => { const v = rint(7, 12), k = growthStat(h); h.stat[k] += v; msg(`${h.heroName} ${statCN(k)} +${v}`); } },
  { id: 'I00Q', key: 'Z', name: '重修药水', ach: 3, cd: 6, hero: true, max: 1, tip: '英雄塔属性选择那一项 -6 点（大巫师随机一项），获得 3 点技能点<br>三项属性都要 ≥7 才能用（每局最多 1 支）',
    use: h => {
      if (h.stat.str < 7 || h.stat.agi < 7 || h.stat.int < 7) { msg('英雄三项属性都要 ≥7 才能重修'); return false; }
      const k = growthStat(h); h.stat[k] -= 6; h.points += 3; msg(`英雄重修${statCN(k)} 6 点，技能点 +3`);
    } },
];
function spawnRabbit(by) {
  const [a, b, c, d] = W3MAP.rects[pick(['y', 'z', 'BB', 'BC'])];      // 原图 qR：外环外的左、右、上、下四块区域等概率选一块，区域内随机一点
  const x = rnd(a, c), y = rnd(b, d);
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
  const w = it.why && it.why(); if (w) return w;
  if ((it.inv || it.give) && !invRoom(it.give ? ITEMS[it.give] : it)) return '物品栏已满';
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
// 买东西（各个商店共用）：inv / give 的放进守卫者物品栏（give 是物品栏里的另一种物品，比如兔子卖的天赋秘籍），其余买下即用
function buyItem(it, why) {
  if (why) return msg(why), false;
  if (it.inv || it.give) {
    invAdd(it.give ? ITEMS[it.give] : it, it.charges);
    msg(`${it.name}放进了守卫者的物品栏：选中守卫者，点物品使用${it.charges ? `（${it.charges} 次）` : ''}`);
  } else if (it.use(G.hero) === false) return false;
  payItem(it);
  if (it.onBuy) it.onBuy();
  return true;
}
function buyRabbit(it) {
  const r = G.rabbit;
  if (!buyItem(it, rabbitBlock(it))) return;
  if (!G.candyDrop && it.id !== 'I00Q' && rint(1, 20) === 2) { G.candyDrop = true; dropItem('I00W', r.x, r.y); msg('兔子掉下了一包糖果！（地上，让守卫者去捡）'); }   // 原图 BL1：每人每局最多一次
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
// 复制卷轴、收购卷轴的目标是队友的守卫者 / 光环塔（见"玩家名单"）：只有你一个人时没有目标
const TALENT_A = { 加速光环: 0.8, 攻击光环: 1.42, 减防光环: -100, 减速光环: -0.7 };   // 基础天赋 = MAX 光环技能升到 2 级（A01F / A007 / A00W / A00V 的 2 级数值）
const TALENT_A3 = { 加速光环: 0.9, 攻击光环: 1.54, 减防光环: -115, 减速光环: -0.8 };  // 至尊天赋（天赋秘籍）= 升到 3 级
const UNIQ_TALENT = new Set(['恐惧塔', '火速塔', '神力塔', '冰封塔', '银行塔']);       // 天赋卷轴 / 秘籍 / 宠物至尊天赋能加技能等级的全场唯一塔（魔法塔没有）
const talentName = t => t.talent === 2 ? '至尊天赋' : t.talent ? (t.cat === 'aura' ? '基础天赋' : '天赋') : '';
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
    ok: t => !t || !t.fam ? '只能对塔使用' : UNIQ_TALENT.has(t.fam) ? null : !(t.cat === 'aura' || TALENT_FAMS.has(t.fam)) ? '只能对光环塔、大辅助、巫系、弹跳塔 MAX、破坏塔 / 通灵塔 / 地精塔、全场唯一塔使用' : !isMax(t) || (t.fam === '弹跳塔' && !t.bmax) ? '要升到 MAX 才能激活天赋' : t.talent ? '该单位已经激活' : null,
    use: t => {
      if (UNIQ_TALENT.has(t.fam)) return ulUp(t, 1, '天赋卷轴');
      t.talent = true; if (t.bmax) G.bounce.talent = true; FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); msg(`${curLevel(t).name}获得了${talentName(t)}`);
    } },
  { id: 'I009', key: 'S', name: '复制卷轴', gold: 3000, inv: true, range: 600,
    tip: '对一位友军的守卫者使用，获得与其一模一样的建造能力（建造栏和英雄塔都换成他的；以后随机建筑需 6 木材），对方获得 5 木材',
    pick: '复制卷轴：选择一位队友的守卫者（Esc 取消）',
    why: () => activePlayers().some(p => !p.local && p.builder) ? null : '没有队友的守卫者可以复制（多人规模开局可以放模拟队友）',
    ok: t => !t || !t.remote ? '只能对友军的守卫者使用' : sameBuild(G.roster[t.pid]) ? '复制相同建造能力守护者无效' : null,
    use: b => copyBuild(G.roster[b.pid]) },
  { id: 'I00B', key: 'D', name: '收购卷轴', gold: 1800, inv: true, range: 600,
    tip: '对一个允许收购的友军 1 级光环塔使用，收购这个光环；出售者获得 1500 金币（原图收购荣誉光环要 10000 金币，本复刻没有荣誉光环）<br>自己的 1 级光环塔可以在命令面板里设成"允许收购"',
    pick: '收购卷轴：选择队友允许收购的 1 级光环塔（Esc 取消）',
    why: () => G.towers.some(t => !mine(t) && t.cat === 'aura') ? null : '没有队友的光环塔可以收购（多人规模开局可以放模拟队友）',
    ok: t => !t || !t.fam || t.cat !== 'aura' || mine(t) ? '只能对友军的光环塔使用' : t.lv !== 0 ? '只能收购 1 级光环塔' : !t.forSale ? '收购失败：对方没有允许收购' : null,
    use: t => buyAura(t) },
];
const shopNear = () => dist2(G.builder.x, G.builder.y, SHOP.x, SHOP.y) <= RULE.shopReach ** 2;
function shopBlock(it) {
  if (!it.na && !shopNear()) return `守卫者离商店太远（要在 ${RULE.shopReach} 范围内）`;
  return itemBlock(it);
}
function buyShop(it) { buyItem(it, shopBlock(it)); }
// ---------------------------------------------------------------- 物品栏（原图守卫者带 6 格单位物品栏 Aiun）
// 点物品 → 选目标 → 守卫者走到施法距离内再使用（和 WC3 对单位使用物品一样），用掉后从物品栏消失
// 物品栏里放的是物品的实例（Object.create(定义)，带自己的 charges 次数）。定义的写法：
//   ok(t) / use(t) / pick / range：对目标使用；self + use()：点了直接用；passive：不能用（马上有钱的字、梦、光环碎片），只能出售或凑齐
//   pawn：出售时得到的 { gold, wood, wish }（守卫者在任意商店旁边时右键物品出售）
const invRoom = def => G.inv.includes(null) || (def.stack && G.inv.some(x => x && x.id === def.id));
function invAdd(def, charges) {
  const n = charges || def.charges || 0;
  const same = def.stack && G.inv.find(x => x && x.id === def.id);
  if (same) { same.charges += n; uiDirty(); return same; }
  const i = G.inv.indexOf(null); if (i < 0) return null;
  const it = Object.create(def); it.charges = n; G.inv[i] = it;
  if (def.onPick) def.onPick(it);
  uiDirty(); return it;
}
function invRemove(it) { const i = G.inv.indexOf(it); if (i >= 0) G.inv[i] = null; uiDirty(); }
function invPick(i) {
  const it = G.inv[i]; if (!it) return;
  if (it.passive) return msg(it.hint || `${it.name}：不能使用${it.pawn ? '，守卫者在商店旁边时右键出售' : ''}`);
  if (it.self) { if (it.use() !== false) { if (it.charges > 1) it.charges--; else invRemove(it); SFX.ui('item'); } uiDirty(); return; }
  if (it.cdKey && G.itemCd[it.cdKey] > G.t) return msg(`${it.name}冷却中`);
  G.pending = 'inv:' + i; G.placing = null; msg(it.pick); uiDirty();
}
// 物品的目标：自己和队友的塔、队友的守卫者、怪物（糖果对小精灵）、野生宠物
const itemTarget = t => !!t && (G.towers.includes(t) || G.monsters.includes(t) || G.wild.includes(t) || activePlayers().some(p => p.builder === t));
function orderUse(i, t, queue) {
  const it = G.inv[i], why = it.ok(t); if (why) return msg(why);
  giveOrder({ kind: 'use', item: it, target: t, x: t.x, y: t.y, reach: it.range }, queue);
}
function useItem(it, t) {
  if (G.inv.indexOf(it) < 0) return;
  if (!itemTarget(t) || t.dead) return msg('目标已经不在了');
  const why = it.ok(t); if (why) return msg(why);
  if (it.cdKey) G.itemCd[it.cdKey] = G.t + (it.cd || 0);
  if (it.use(t) === false) return uiDirty();
  if (it.charges > 1) it.charges--; else invRemove(it);
  SFX.ui('item'); uiDirty();
}
// 出售（原图把物品卖给商店，得一半金币 / 木材；许愿石、梦另给 5 许愿点，BL5）
const anyShopNear = () => SHOPS.some(s => dist2(G.builder.x, G.builder.y, s.x, s.y) <= RULE.shopReach ** 2);
function sellItem(i) {
  const it = G.inv[i]; if (!it) return;
  if (!it.pawn) return msg(`${it.name}不能出售`);
  if (!anyShopNear()) return msg(`守卫者要在商店旁边（${RULE.shopReach} 范围内）才能出售`);
  const k = it.charges > 1 && it.stack ? it.charges : 1, p = it.pawn;
  G.gold += (p.gold || 0) * k; G.wood += (p.wood || 0) * k; G.wish += (p.wish || 0) * k;
  invRemove(it); SFX.ui('sell');
  msg(`出售${it.name}：` + [p.gold && `${p.gold * k} 金`, p.wood && `${p.wood * k} 木材`, p.wish && `${p.wish * k} 许愿点（目前 ${G.wish}）`].filter(Boolean).join('，'));
}
const TALENT_FAMS = new Set(['弹跳塔', '萨满塔', '兽人塔', '驱逐塔', '缓速塔', '巫医塔', '巫术塔', '巫法塔', '巫魔塔', '破坏塔', '通灵塔', '地精塔']);
const auraAb = t => { const ab = curLevel(t).abils[0]; return ab && t.talent ? { ...ab, A: (t.talent === 2 ? TALENT_A3 : TALENT_A)[t.fam] } : ab; };


// ================================================================ 玩家名单（为联机准备）
// 原图按玩家 Player(0)~Player(7) 记杀敌数（排行榜 RF 的值 Cp[i]）、飞艇击杀（EG[i]）、投票（Ea[i]）、点赞等。这里每个在场玩家一条 G.roster[slot]，
// 本机玩家的资源就是 G.gold / G.wood / G.ach；其他玩家由联机层同步（window.GC_NET.send 发出、window.GC.receive 收到，现在还没有联机）。
// 多人规模开局可以在空位放"模拟队友"：站在出生点不操作，带一座允许收购的 1 级光环塔，用来试复制 / 收购 / 投票 / 点赞。
// 只算实际在场的玩家（空位、离开、被踢的不算）：排名、飞艇奖励、投票人数、大红牛奖励都按实际人数。
const NET = { send(ev) { try { if (window.GC_NET && window.GC_NET.send) window.GC_NET.send(ev); } catch (e) { console.warn('[net]', e); } } };
function makeRoster(np, bots, player) {
  const r = [{ slot: 0, name: player || '你', local: true }];
  if (bots) for (let s = 1; s < np; s++) r.push({ slot: s, name: `模拟队友${s + 1}`, bot: true });
  return r.map(p => Object.assign({ kills: 0, gold: 0, wood: 0, likes: 0, out: null, build: [], heroChoice: null, builder: null }, p));
}
const me = () => G.roster[G.me];
const activePlayers = () => G.roster.filter(p => p && !p.out);
const pidOf = e => e ? (e.pid ?? (e.owner && e.owner.pid) ?? G.me) : G.me;
const mine = t => pidOf(t) === G.me;
const pname = slot => (G.roster[slot] || {}).name || `玩家${slot + 1}`;
// 排行榜（原图 RF，按杀敌数从多到少排序）：名次 1 = 杀得最多
const board = () => activePlayers().slice().sort((a, b) => b.kills - a.kills || a.slot - b.slot);
const rankOf = slot => board().findIndex(p => p.slot === slot) + 1;
// 给某个玩家加资源：本机直接加；其他玩家记在名单上（联机时每台机器跑同一套规则，各自加自己的）
function addGold(p, n) { if (p.local) G.gold += n; else p.gold += n; }
function addWood(p, n) { if (p.local) G.wood += n; else p.wood += n; }
// 模拟队友：守卫者站在出生区域 s，随机一套建造栏，在自己的出怪口旁放一座允许收购的 1 级光环塔
function seatBots() {
  const [sx0, sy0, sx1, sy1] = W3MAP.rects.s;
  for (const p of G.roster) {
    if (p.local) continue;
    p.builder = { isBuilder: true, remote: true, pid: p.slot, x: rnd(sx0, sx1), y: rnd(sy0, sy1), face: -Math.PI / 2 };
    p.build = SLOTS.map(s => pick(slotPool(s)));
    const hc = rint(1, 17); p.heroChoice = Object.keys(D.heroes).find(n => D.heroes[n].hc === hc) || null;
    const [gx, gy] = NODES[GATES[p.slot][1]], spot = freeSpotNear(gx, gy, 700);
    if (spot) G.towers.push(newTower(p.build[SLOTS.indexOf('aura')], spot[0], spot[1], { pid: p.slot, forSale: true }));
  }
}
function freeSpotNear(x, y, r) {
  for (let k = 0; k < 300; k++) {
    const a = rnd(0, TAU), d = rnd(150, r), gx = snap(x + Math.cos(a) * d), gy = snap(y + Math.sin(a) * d);
    if (canPlace(gx, gy, true)) return [gx, gy];
  }
  return null;
}
// 复制卷轴（原图 BKX）：建造栏换成对方的（含英雄塔），以后随机建造要 6 木材；对方 +5 木材
const sameBuild = p => p.build.join() === G.build.join() && p.heroChoice === G.heroChoice;
function copyBuild(p) {
  G.build = p.build.slice(); G.heroChoice = p.heroChoice; G.rerolls = Math.max(G.rerolls, 1); G.placing = null;
  addWood(p, 5);
  NET.send({ t: 'copy', slot: G.me, target: p.slot });
  msg(`复制成功：建造栏换成了 ${p.name} 的（${G.build.join('、')}${G.heroChoice ? '、' + G.heroChoice : ''}）；${p.name} 获得 5 木材`);
}
// 收购卷轴（原图 BKC）：对方的 1 级光环塔要打开"允许收购"（A03K 2 级），收购后归你，出售者 +1500 金
function buyAura(t) {
  const p = G.roster[pidOf(t)];
  addGold(p, 1500); t.pid = G.me; t.forSale = false;
  NET.send({ t: 'buy', slot: G.me, tower: t.id });
  msg(`收购成功：${curLevel(t).name} 现在是你的了；${p.name} 获得 1500 金币`);
}
// 投票踢人（原图 s2 / tD / tH）：守护宗师卖投票卷轴，买下后所有玩家弹出投票对话框，每票 +2，某人票数超过在场人数就被踢出；
// 59 秒后才能再买（原图 TriggerSleepAction 59）。原图买卷轴的判断里 B2 恒为 true，实际不扣英雄点 / 成就币，照搬
function voteBlock() {
  if (G.vote) return '投票进行中';
  if (G.t < G.voteAt) return `${Math.ceil(G.voteAt - G.t)} 秒后才能再发起投票`;
  if (activePlayers().length < 2) return '只有你一个玩家，没有可以投票踢出的人';
  return null;
}
function startVote(by) {
  G.vote = { by, tally: {}, voted: {} }; G.voteAt = G.t + 59;
  msg(`${pname(by)}发起了投票踢出玩家`);
  if (by === G.me) NET.send({ t: 'vote-start', slot: G.me });
  for (const p of activePlayers()) if (p.bot) castVote(p.slot, null);      // 模拟队友一律弃权
  if (G.vote) showDialog('投票踢出玩家', activePlayers().map(p => ({ text: escHtml(p.name) + (p.local ? '（你）' : ''), fn: () => { hideModal(); castVote(G.me, p.slot); } }))
    .concat([{ text: '（弃权）', fn: () => { hideModal(); castVote(G.me, null); } }]), `每票 +2，票数超过在场人数（${activePlayers().length} 人）就被踢出游戏`);
}
function castVote(voter, target) {
  const v = G.vote; if (!v || v.voted[voter]) return;
  v.voted[voter] = true;
  if (voter === G.me) NET.send({ t: 'vote', slot: voter, target });
  if (target != null) { v.tally[target] = (v.tally[target] || 0) + 2; msg(`${pname(voter)} 投票踢出 ${pname(target)}（${v.tally[target]} 票）`); }
  const n = activePlayers().length, out = Object.keys(v.tally).map(Number).find(s => v.tally[s] > n);
  if (out != null) { G.vote = null; return kickPlayer(out); }
  if (activePlayers().every(p => v.voted[p.slot])) { G.vote = null; msg('投票结束，没有玩家被踢出'); }
}
// 踢出 / 离开：他的单位全部移除（原图 m5(玩家) → RemoveUnit），上限每秒 -1（playerLeft）
function kickPlayer(slot, left) {
  const p = G.roster[slot]; if (!p || p.out) return;
  p.out = left ? 'left' : 'kicked';
  msg(left ? `${p.name} 离开了游戏` : `${p.name} 被投票踢出了游戏`);
  if (p.local) return gameOver('你已经被踢出游戏!!');
  G.towers = G.towers.filter(t => pidOf(t) !== slot);
  if (G.selected && (G.selected === p.builder || (G.selected.fam && pidOf(G.selected) === slot))) G.selected = G.builder;
  p.builder = null;
  playerLeft(slot);
  uiDirty();
}
// 点赞（原图 s4 / s8）：到达第 48 波以后，花 10 点当局成就给一位队友点赞，每局一次；被赞的人记在他的玩家档案里
function likeBlock() {
  if (G.liked) return '每局只能为一位队友点赞';
  if (G.wave < 48) return '需要到达最终 BOSS 波（第 48 波）后开启';
  if (activePlayers().length < 2) return '没有队友可以点赞';
  if (G.ach < 10) return '成就不足';
  return null;
}
function buyLike() {
  const why = likeBlock(); if (why) return msg(why);
  G.ach -= 10; G.liked = true; uiDirty();
  showDialog('赞', activePlayers().filter(p => !p.local).map(p => ({ text: escHtml(p.name), fn: () => { hideModal(); giveLike(G.me, p.slot); } })), '为一位队友点赞（每局一次）');
}
function giveLike(from, to) {
  const p = G.roster[to]; if (!p) return;
  p.likes++;
  msg(`[${pname(from)}]为[${p.name}]点了1个赞！`);
  if (from === G.me) NET.send({ t: 'like', slot: from, target: to });
  if (p.local && G.player && G.mode !== 'demo') { const pr = profileOf(G.player); pr.likes = (pr.likes || 0) + 1; saveProfiles(); }
}
// 收到联机层的事件（以后接联机时由 window.GC.receive 调用；模拟队友不发事件）
function netReceive(ev) {
  if (!G || !ev) return;
  const p = G.roster[ev.slot];
  if (ev.t === 'join') { G.roster[ev.slot] = Object.assign({ kills: 0, gold: 0, wood: 0, likes: 0, out: null, build: [], heroChoice: null, builder: null }, { slot: ev.slot, name: ev.name }); msg(`${ev.name} 加入了游戏`); }
  else if (!p) return;
  else if (ev.t === 'leave') kickPlayer(ev.slot, true);
  else if (ev.t === 'state') Object.assign(p, ev.state);                                  // kills / build / heroChoice / builder 位置等
  else if (ev.t === 'vote-start') startVote(ev.slot);
  else if (ev.t === 'vote') castVote(ev.slot, ev.target);
  else if (ev.t === 'like') giveLike(ev.slot, ev.target);
  else if (ev.t === 'copy' && ev.target === G.me) { G.wood += 5; msg(`${p.name}复制了你的建造能力，你获得 5 木材`); }
  else if (ev.t === 'buy') { const t = G.towers.find(o => o.id === ev.tower); if (t && mine(t)) { t.pid = ev.slot; t.forSale = false; G.gold += 1500; msg(`${p.name}收购了你的${curLevel(t).name}，你获得 1500 金币`); } }
  uiDirty();
}
window.GC = { receive: netReceive, roster: () => G && G.roster };

// ================================================================ 全场唯一塔的技能等级（t.ulv）
// 数值按技能表 + war3map.w3a 的各级数据；恐惧塔、火速塔建成时是技能 2 级（和之前的数值一致），神力、冰封是 1 级
const ULT = {
  fear: { v: [80, 90, 100, 110, 120, 130, 140, 150, 160, 200, 200, 200], dur: [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 8, 8], cd: [12, 11, 11, 11, 10, 10, 10, 9, 9, 7, 7, 7] },
  fire: { v: [1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.8, 2.8], dur: [2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3, 3, 3], cd: [12, 11.8, 11.6, 11.4, 11.2, 11, 10.8, 10.6, 10.4, 10, 10, 10], r: [200, 300] },
  inner: { v: [2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.8, 4.8, 4.8], dur: [1.8, 2], cd: [5, 4.8, 4.6, 4.4, 4.2, 4, 3.8, 3.6, 3.4, 3, 3, 3] },
  freeze: { dur: [2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.9, 3.1, 3.3, 3.5, 3.7, 4] },
};
const ulAt = (arr, t) => arr[Math.min(arr.length - 1, t.ulv || 0)];
const UL = {
  fear: t => [ulAt(ULT.fear.v, t), ulAt(ULT.fear.dur, t), ulAt(ULT.fear.cd, t)],
  fire: t => [ulAt(ULT.fire.v, t), ulAt(ULT.fire.dur, t), ulAt(ULT.fire.cd, t), ulAt(ULT.fire.r, t)],
  inner: t => [ulAt(ULT.inner.v, t), ulAt(ULT.inner.dur, t), ulAt(ULT.inner.cd, t)],
  freeze: t => ulAt(ULT.freeze.dur, t),
};
const ulTxt = t => t.ulv ? `（+${t.ulv} 级）` : '';
function ulUp(t, n, why) {
  if (t.fam === '银行塔') t.bank.rate += n;                  // 银行塔的技能等级就是利息
  t.ulv = (t.ulv || 0) + n;
  FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4);
  msg(`${why}：${curLevel(t).name}技能 +${n} 级`);
}
// 天神塔每级攻击上限：40 ×（10 + 宠物浣熊的 Gq）（原图 zt）
const godStep = () => 40 * (10 + G.petFx.gq);

// ================================================================ 守护宗师（地图中央商店右边，原图 u01A）
// 卖的东西：兔子卷轴、重置卷轴、宠物卷轴、糖果、赞、投票卷轴。绑定 / 号令卷轴要无尽关卡，英雄卷轴、轮回卷轴只能用平台成就币，没有做
const MASTER_ITEMS = [
  { id: 'I00S', key: 'Q', name: '兔子卷轴', ach: RULE.rabbitScrollAch, tip: '额外召唤一次兔子，每局只能额外召唤 1 次',
    why: () => G.rabbitScroll ? '召唤失败，每局只能额外召唤一次' : G.rabbit ? '兔子已经在场上了' : null, use: () => { G.rabbitScroll = true; spawnRabbit('你'); } },
  { id: 'I00R', key: 'W', name: '重置卷轴', ach: 15, max: 1, hero: true, tip: '重新随机自己英雄的成长值（力 / 敏 / 智合计 10），每局只能重置一次',
    use: h => { const r = rint(0, 7), a = rint(0, 7 - r); h.grow = { str: r + 1, agi: a + 1, int: 7 - r - a + 1 }; msg(`${h.heroName} 新的成长值：力量 ${h.grow.str} · 敏捷 ${h.grow.agi} · 智力 ${h.grow.int}`); } },
  { id: 'I00X', key: 'E', name: '宠物卷轴', ach: 8, tip: '直接召唤出最后一次抓到的野生宠物（存在玩家档案里，带上它当时的技能和"提升主塔"加成）',
    why: () => G.pet ? '已经有宠物了' : !(G.player && profileOf(G.player).pet) ? '还没有抓到过野生宠物（BOSS 波后会出现，用糖果抓）' : null,
    use: () => { const s = profileOf(G.player).pet; makePet(s.uid, { lw: s.lw, lv: s.lv }); } },
  { id: 'I00V', key: 'R', name: '糖果', ach: 5, cd: 2, give: 'I00W', charges: 5, tip: '购买 5 个糖果：对小精灵使用，有一定几率让宠物技能升级（也可能让小精灵直接死亡）；对野生宠物使用可以抓宠物<br>宠物要先激活普通天赋，糖果才能升级技能' },
  { id: 'I01V', key: 'A', name: '赞', ach: 10, tip: '消耗 10 点成就为一位队友点赞，每局只能为一位队友点赞<br>到达第 48 波后开启', why: likeBlock, use: () => { G.ach += 10; buyLike(); } },
  { id: 'I01Q', key: 'S', name: '投票卷轴', tip: '发起踢出玩家的投票：所有玩家各投一票（每票 +2），票数超过在场人数的玩家被踢出<br>原图写的是 1 点英雄点或 20 成就币，触发器里实际不扣',
    why: voteBlock, use: () => startVote(G.me) },
];

// ================================================================ 地上的物品（原图 CreateItemLoc）
// 守卫者选中时点物品（或右键）走过去捡起。金币类是捡起即用；其余进物品栏（满了捡不了）
const WORD_TIP = '凑齐"马""上""有"+"钱"得 8000 金、+"木"得 20 木材、+"梦"得 20 许愿点';
const ITEMS = {
  gold: { id: 'gold', name: '金币', power: true, use: () => { G.gold += 100; msg('捡到 100 金币'); } },
  I003: { id: 'I003', name: '金币', power: true, use: () => { G.gold += 500; msg('捡到 500 金币'); } },
  I004: { id: 'I004', name: '马', passive: true, tip: WORD_TIP, hint: `"马"字：${WORD_TIP}` },
  I006: { id: 'I006', name: '上', passive: true, tip: WORD_TIP, hint: `"上"字：${WORD_TIP}` },
  I007: { id: 'I007', name: '有', passive: true, tip: WORD_TIP, hint: `"有"字：${WORD_TIP}` },
  I005: { id: 'I005', name: '钱', self: true, pawn: { gold: 1000 }, tip: `使用后直接获得 1000 金币。${WORD_TIP}`, use: () => { G.gold += 1000; msg('金币 +1000'); } },
  I008: { id: 'I008', name: '木', self: true, pawn: { wood: 3 }, tip: `使用后直接获得 3 木材。${WORD_TIP}`, use: () => { G.wood += 3; msg('木材 +3'); } },
  I03Y: { id: 'I03Y', name: '梦', passive: true, pawn: { gold: 1, wish: 5 }, tip: `出售可获得 5 点许愿点。${WORD_TIP}`, hint: '"梦"字：守卫者在商店旁边时右键出售得 5 许愿点，或凑齐"马上有梦"得 20 许愿点' },
  I00P: { id: 'I00P', name: '重修药水', self: true, tip: '对英雄塔使用：属性选择那项 -6，获得 3 点技能点（三项属性都要 ≥7）',
    use: () => G.hero ? RABBIT_SHOP.find(i => i.id === 'I00Q').use(G.hero) : (msg('还没有建造英雄塔'), false) },
  I029: { id: 'I029', name: '知识药水', self: true, tip: '对英雄塔使用：属性选择那项 +7~12', use: () => G.hero ? RABBIT_SHOP.find(i => i.id === 'I02A').use(G.hero) : (msg('还没有建造英雄塔'), false) },
  I01X: { id: 'I01X', name: '天赋秘籍', range: 750, tip: RABBIT_SHOP.find(i => i.id === 'I01W').tip.split('<br>每局')[0], pick: '天赋秘籍：选择 MAX 光环塔或全场唯一塔（Esc 取消）',
    ok: t => !t || !t.fam ? '只能对塔使用' : UNIQ_TALENT.has(t.fam) ? null : t.cat !== 'aura' || !isMax(t) ? '只能对MAX光环使用' : t.talent ? '该单位已经激活' : null,
    use: t => {
      if (UNIQ_TALENT.has(t.fam)) return ulUp(t, t.fam === '银行塔' ? 3 : 2, '天赋秘籍');
      t.talent = 2; FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); msg(`${curLevel(t).name}获得了至尊天赋`);
    } },
  I01R: { id: 'I01R', name: '光环碎片', passive: true, pawn: { gold: 1500 }, tip: '集齐 3 个光环碎片，合成一个高级光环基塔', hint: '光环碎片：集齐 3 个自动合成高级光环基塔',
    onPick() { const s = G.inv.filter(x => x && x.id === 'I01R'); if (s.length >= 3) { s.slice(0, 3).forEach(invRemove); invAdd(ITEMS.I01S); msg('3 个光环碎片合成了高级光环基塔'); } } },
  I01S: { id: 'I01S', name: '高级光环基塔', self: true, pawn: { gold: 4500 }, tip: '在守卫者旁边放一座高级光环基塔，选一种光环花 4000 金升成 4 级光环塔（原图 h02Z）',
    use: () => { auraBase(); return false; } },
  I00W: { id: 'I00W', name: '糖果', stack: true, charges: 5, range: 800, cdKey: 'A0QV', cd: 1, tip: '对小精灵使用：有一定几率让宠物技能升级，也可能让小精灵直接死亡（宠物要先有普通天赋）<br>对野生宠物使用：抓宠物（每次 1%，累计 100 次必定成功，抓的时候不消耗糖果）',
    pick: '糖果：选择小精灵或野生宠物（Esc 取消）', ok: t => t && (t.uid === 'n07K' || t.isWild) ? null : '只能对小精灵或野生宠物使用', use: t => t.isWild ? candyWild(t) : candyWisp(t) },
};
ITEMS.I00Y = { ...ITEMS.I00W, id: 'I00Y', name: '糖果(小)', charges: 2 };
ITEMS.I028 = Object.assign(Object.create(SHOP_ITEMS.find(i => i.id === 'I028')), { pawn: { gold: 1100 } });
ITEMS.I01T = Object.assign(Object.create(RABBIT_SHOP.find(i => i.id === 'I01U')), { id: 'I01T', pawn: { gold: 1250 } });
// 许愿石（原图 bD[1..36]，BOSS 死亡时掉）：使用后把建造栏里同类那一格换成这座塔；出售得 5 许愿点
const STONES = { I015: '地精塔', I01B: '精灵塔', I019: '巨箭塔', I012: '科技塔', I010: '灵魂塔', I017: '燃烧塔', I01J: '魔石塔', I018: '炎魔塔', I01A: '死亡塔', I016: '深渊塔',
  I01G: '毒塔', I01D: '混乱塔', I02C: '箭塔', I01K: '牛头塔', I01E: '破坏塔', I01H: '群攻塔', I01F: '闪电塔', I01L: '通灵塔', I02Q: '暴击塔', I02T: '冰霜塔', I02P: '腐蚀塔',
  I02U: '缓速塔', I02W: '驱逐塔', I02N: '神力塔', I02M: '魔法塔', I01C: '恐惧塔', I02F: '火速塔', I02J: '冰封塔', I02R: '重击塔', I02X: '巫医塔', I02O: '巫术塔', I02V: '巫魔塔',
  I02Z: '巫法塔', I02S: '萨满塔', I02Y: '兽人塔', I011: '银行塔' };
for (const [id, fam] of Object.entries(STONES)) ITEMS[id] = { id, name: `许愿石（${fam}）`, self: true, pawn: { wood: 1, wish: 5 },
  tip: `使用后把建造栏里同类的那一格换成${fam}${D.towers[fam] ? '' : '（本复刻没有这座塔，只能出售）'}<br>出售可获得 5 点许愿点`, use: () => wishTower(fam, '许愿石') };
const BOSS_STONE = new Set(['njgb', 'ndmu', 'ndrj', 'njga', 'nskg', 'njg1', 'nanm', 'nenf', 'nbld', 'ndrw', 'ndrh', 'ndrd', 'nrdr', 'nrdk', 'nbzd', 'ngrd', 'nsgt', 'ngst', 'nlkl', 'nslm', 'nvdg', 'n06Y']);
function dropItem(id, x, y, charges) {
  const def = ITEMS[id]; if (!def) return null;
  const it = { isItem: true, id: G.nextId++, def, x: x + rnd(-40, 40), y: y + rnd(-40, 40), charges: charges ?? def.charges ?? 0, t0: G.t };
  G.items.push(it); return it;
}
function orderPick(it, queue) { giveOrder({ kind: 'pick', target: it, x: it.x, y: it.y, reach: 100 }, queue); }
function pickUp(it) {
  if (!G.items.includes(it)) return;
  const d = it.def;
  if (!d.power && !invRoom(d)) return msg('物品栏已满');
  G.items = G.items.filter(x => x !== it);
  if (G.selected === it) G.selected = G.builder;
  SFX.ui('item');
  if (d.power) { d.use(); return uiDirty(); }
  invAdd(d, it.charges);
  msg(`捡到${d.name}`);
  checkWords();
}
// 马上有钱 / 马上有木 / 马上有梦（原图 BJ9，捡起物品时判断）
function checkWords() {
  const has = id => G.inv.find(x => x && x.id === id);
  if (!(has('I004') && has('I006') && has('I007'))) return;
  const done = (k, text, fn) => { ['I004', 'I006', 'I007', k].forEach(id => invRemove(has(id))); fn(); msg(`【${me().name}】集齐了马上有${text}`, 10); };
  if (has('I005')) done('I005', '钱，获得 8000 金币', () => { G.gold += 8000; });
  else if (has('I008')) done('I008', '木，获得 20 木材', () => { G.wood += 20; });
  else if (has('I03Y')) done('I03Y', '梦，获得 20 许愿点', () => { G.wish += 20; });
}
// 高级光环基塔：在守卫者旁边找个空位，选一种光环（4000 金）直接成为 4 级光环塔
function auraBase() {
  const fams = ['加速光环', '攻击光环', '减防光环', '减速光环'];
  showDialog('高级光环基塔', fams.map(f => ({ text: `${f}（4 级，4000 金）`, fn: () => {
    hideModal();
    const why = buildBlock(f); if (why) return msg(why);
    if (G.gold < 4000) return msg('金币不足');
    const spot = freeSpotNear(G.builder.x, G.builder.y, 500); if (!spot) return msg('守卫者附近没有空地');
    G.gold -= 4000;
    const t = newTower(f, spot[0], spot[1]); t.lv = 3; t.spent = 4000; G.towers.push(t);
    invRemove(G.inv.find(x => x && x.id === 'I01S'));
    msg(`建成了${curLevel(t).name}`); uiDirty();
  } })).concat([{ text: '取消', fn: hideModal }]), '原图高级光环基塔可以升级成 4 种光环塔的 4 级');
}

// ================================================================ 许愿（原图许愿商人 u00M ~ u00Q，许愿点 Ou）
// 许愿点：兔子的塔类之球每个 +1、出售许愿石 / 梦 +5、凑齐马上有梦 +20。许愿商人那里选一类塔再选一座，花 20 许愿点，建造栏同类的那一格换成它
const WISH_COST = 20;
const WISH_CATS = [
  ['原始塔', ['群攻塔', '毒塔', '牛头塔', '箭塔', '混乱塔', '闪电塔', '破坏塔', '通灵塔']],
  ['辅助塔', ['暴击塔', '冰霜塔', '腐蚀塔', '重击塔', '缓速塔', '驱逐塔', '萨满塔', '兽人塔']],
  ['光环塔', ['冰封塔', '火速塔', '恐惧塔', '魔法塔', '神力塔', '银行塔']],
  ['另类塔', ['死亡塔', '深渊塔', '地精塔', '精灵塔', '巨箭塔', '科技塔', '灵魂塔', '魔石塔', '炎魔塔', '燃烧塔']],
];
function wishTower(fam, by) {
  if (!D.towers[fam]) return msg(`本复刻还没有${fam}`), false;
  const s = slotOf(fam), i = G.build.findIndex(f => D.towers[f] && slotOf(f) === s);
  if (i < 0) return msg('建造栏里没有这一类塔'), false;
  if (G.build[i] === fam) return msg(`建造栏里已经是${fam}`), false;
  G.build[i] = fam;
  if (G.placing && G.placing !== 'hero' && !G.build.includes(G.placing)) G.placing = null;
  msg(`${by}成功：建造栏的${CAT_CN[D.towers[fam].cat]}换成了${fam}`); uiDirty();
}
function wishBuy(fam) {
  if (G.wish < WISH_COST) return msg(`需要 ${WISH_COST} 许愿点（目前：${G.wish}）`);
  if (wishTower(fam, '许愿') === false) return;
  G.wish -= WISH_COST; SFX.ui('item'); uiDirty();
}
// BOSS 掉许愿石（原图 BLx）：条件是 (1/12 且掉过不到 4 次 且 变异巫师) 或 其余各种 BOSS —— 优先级写错了，其余 BOSS 每次死都掉，照搬
function bossStone(m) {
  if (!((m.uid === 'njgb' && rint(1, 12) === 8 && G.wishDrops < 4) || (m.uid !== 'njgb' && BOSS_STONE.has(m.uid)))) return;
  G.wishDrops++;
  dropItem(pick(Object.keys(STONES)), m.x, m.y);
  msg(`${m.name}掉下了一块许愿石`);
}

// ================================================================ 小精灵、小偷、地上的糖果（原图 qR / qd / qf / Bf8）
// 小精灵（n07K）：场上没有时每 100 秒在外环外四块区域刷一只（第一次有 1/10 是小偷），中立、会游荡，被攻击时疾风步（隐身 2.3 秒）；
// 死了掉一件东西（马 / 木 / 知识之书 / 上 / 有 / 魔法药水 / 重修药水 / 天赋秘籍 / 知识药水 / 光环碎片 / 梦，都没中就是 500 金币）。
// 对小精灵用糖果升级宠物技能。小偷（n08A）：30 秒后消失，每被攻击一次掉糖果或金币，挨 20 下掉 800 金币、变回小精灵。
// 每 150 秒在中央区域 BD 掉一包糖果（1/6）或 100 金币
const CRIT_RECTS = () => W3MAP.rects[rint(1, 4) === 4 ? 'y' : rint(1, 3) === 3 ? 'z' : rint(1, 2) === 2 ? 'BB' : 'BC'];
const CRITTERS = {
  n07K: { name: '小精灵', hp: 80, speed: 100, mdx: 'units/nightelf/wisp/wisp.mdx', scale: 0.5, color: '#9fe8ff' },
  n08A: { name: '小偷', hp: 200000, speed: 400, mdx: 'units/human/peasant/peasant.mdx', scale: 1.0, color: '#d8b36a' },
};
function spawnCritter(uid, x, y) {
  const c = CRITTERS[uid];
  const m = { id: G.nextId++, uid, name: c.name, x, y, hx: x, hy: y, maxHp: c.hp, hp: c.hp, armor: 0, type: 'medium', speed: c.speed, bounty: 0, regen: 0, path: [], prev: null, cur: null, lane: 0,
    slow: 0, slowUntil: 0, stunUntil: 0, shred: 0, shredUntil: 0, armorDown: 0, armorDownUntil: 0, auraFocus: 0, auraArmorDown: 0, auraSlow: 0, auraSpeed: 0, auraRegen: 0, burn: null, dots: [],
    deb: {}, ignoreArmorUntil: 0, frozenUntil: 0, expel: null, boss: false, r: 40, elite: null, gate: 0, at: 0, neutral: true, mdx: c.mdx, scale: c.scale, color: c.color, next: G.t };
  m.cr = colRadius(m);
  G.monsters.push(m);
  return m;
}
const WISP_DROP = [[60, 1, 'I004'], [56, 2, 'I008'], [54, 4, 'I028'], [48, 6, 'I006'], [44, 8, 'I007'], [40, 10, 'I01T'], [200, 199, 'I00P'], [200, 188, 'I01X'], [140, 10, 'I029'], [100, 100, 'I01R'], [200, 99, 'I03Y']];
function spawnWisp(x, y) {
  const w = spawnCritter('n07K', x, y);
  w.onAttacked = () => { if (!(w.wwAt > G.t)) { w.wwAt = G.t + 6; w.invisUntil = G.t + 2.3; } };       // 疾风步 A0QR：冷却 6 秒，隐身 2.3 秒、移速 +30%
  w.onDeath = () => { const d = WISP_DROP.find(([n, k]) => rint(1, n) === k); dropItem(d ? d[2] : 'I003', w.x, w.y); };
  return w;
}
function critterTick() {
  if (G.phase !== 'run' && G.phase !== 'prep') return;
  if (G.t >= G.wispAt) {
    G.wispAt += 100;
    if (!G.monsters.some(m => m.uid === 'n07K' && !m.dead)) {
      const [a, b, c, d] = CRIT_RECTS(), x = rnd(a, c), y = rnd(b, d);
      if (rint(1, 10) === 1 && !G.thief) {
        G.thief = true;
        const th = spawnCritter('n08A', x, y); th.until = G.t + 30; th.hitOnly = true; th.hits = 0;
        th.onAttacked = () => {
          if (th.dead) return;
          if (th.hits >= 20) {
            for (let k = 0; k < 8; k++) dropItem('gold', th.x, th.y);
            th.dead = true; spawnWisp(th.x, th.y); msg(pick(['小偷：我的..小...精.......', '小偷：小精灵快跑...有...坏.....']));
          } else {
            th.hits++; th.hp = th.maxHp * (100 - 5 * th.hits) / 100;
            dropItem(rint(1, 10) === 1 ? 'I00W' : rint(1, 5) === 1 ? 'I00Y' : 'gold', th.x, th.y);
          }
        };
        msg(`小偷：${pick(['看见我～看不见我～～', '哈哈～～我要发财了！～', '嘘！～～～'])}（30 秒内打它，每打一下掉东西）`, 10);
      } else spawnWisp(x, y);
    }
  }
  if (G.t >= G.dropAt) {
    G.dropAt += 150;
    const [a, b, c, d] = W3MAP.rects.BD;
    dropItem(rint(1, 6) === 1 ? 'I00W' : 'gold', rnd(a, c), rnd(b, d));
  }
}
// 中立单位游荡（原图 Awan）：在出生点附近随机走
function wander(m, dt) {
  if (G.t < m.stunUntil) return;
  if (G.t >= m.next) { const a = rnd(0, TAU), d = rnd(0, 400); m.tx = m.hx + Math.cos(a) * d; m.ty = m.hy + Math.sin(a) * d; m.next = G.t + rnd(2, 5); }
  if (m.tx == null) return;
  const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
  const spd = m.speed * (m.invisUntil > G.t ? 1.3 : 1) * (1 - Math.max(G.t < m.slowUntil ? m.slow : 0, m.auraSlow || 0));
  if (d > 4) { const k = Math.min(d, spd * dt) / d; m.x += dx * k; m.y += dy * k; m.face = Math.atan2(dy, dx); m.moving = true; } else m.moving = false;
}

// ================================================================ 宠物（原图宠物商人 u00Z、宠物天赋 A0F1、糖果 A0QV、野生宠物）
// 每人一只（Fj）。宠物跟着守卫者走（原图每 2 秒对守卫者身边 100 的一点下攻击移动令，离开 1000 就瞬移过去，守卫者闪烁时跟着闪），
// 攻击射程内的敌人，攻击力每波提升（宠物攻击科技 = 波数）。技能等级：普通天赋 +1，糖果升级（Kq 最多 4）每次 +1。
// 宠物商人：浣熊 / 小猪 / 小牛 8 点当局成就；其余原图要平台的"宠物赞助"，这里同样 8 点当局成就。
// 原图浣熊模型（units\critters\Raccoon）不在资源包里，用蜥蜴代替
const PETS = {
  n037: { name: '浣熊', item: 'I01Z', mdx: 'units/critters/skink/skink.mdx', scale: 1, dmg: 29, cd: 0.6, range: 300, speed: 100, wave: 9, skill: 'bash', fx: { gq: 2, lx: 2 }, boost: '天神塔每级攻击上限 400 → 480、图腾随机伤害下限 +6%' },
  n03G: { name: '小猪', item: 'I024', mdx: 'units/critters/pig/pig.mdx', scale: 1, dmg: 202, cd: 1.4, range: 300, speed: 150, wave: 5, skill: 'drums' },
  n05P: { name: '小牛', item: 'I02B', mdx: 'units/creeps/mammoth/mammoth.mdx', scale: 0.4, dmg: 120, cd: 0.6, range: 120, speed: 180, wave: 21, skill: 'lust', splash: 150, fx: { g3: 0.03, go: 1 }, boost: '神牛杀敌累计属性更快、渔人大鱼上限 +1' },
  n038: { name: '海龟', item: 'I020', mdx: 'units/creeps/seaturtle/seaturtle.mdx', scale: 0.25, dmg: 65, cd: 0.3, range: 300, speed: 100, wave: 9, skill: 'frost' },
  n03A: { name: '小狼', item: 'I022', mdx: 'units/creeps/whitewolf/whitewolf.mdx', scale: 0.5, dmg: 13, cd: 0.25, range: 300, speed: 270, wave: 9, skill: 'crit', splash: 100 },
  n039: { name: '小鬼', item: 'I021', mdx: 'units/undead/shade/shade.mdx', scale: 0.7, dmg: 14, cd: 0.5, range: 600, speed: 500, wave: 5, skill: 'shade' },
  n03E: { name: '企鹅', item: 'I023', mdx: 'units/critters/penguin/penguin.mdx', scale: 1, dmg: 171, cd: 1.2, range: 200, speed: 100, wave: 21, skill: 'stomp', fx: { kv: 0.06 }, boost: '先知释魂最小攻击 +6%' },
  n03J: { name: '鹰', item: 'I025', mdx: 'units/creeps/wareagle/wareagle.mdx', scale: 0.5, dmg: 37, cd: 0.3, range: 300, speed: 200, wave: 5, skill: 'corrode', fx: { k4: 1.5 }, boost: '幻影的智力魔击伤害 智力×1.5 → ×3' },
  n05A: { name: '绵羊', item: 'I026', mdx: 'units/critters/sheep/sheep.mdx', scale: 1.2, dmg: 10, cd: 0.7, range: 300, speed: 200, wave: 14, skill: 'clap', fx: { kx: 2, r1: 0.09 }, boost: '邪冰的究极闪冰术 55000×5 → 70000×7、先知命运几率每级 +2%、图腾攻速 +9%' },
  n05B: { name: '小鱼人', item: 'I027', mdx: 'units/creeps/murgultidewarrior/murgultidewarrior.mdx', scale: 0.5, dmg: 22, cd: 0.6, range: 300, speed: 200, wave: 14, skill: 'fish', bounce: 3, fx: { go: 2 }, boost: '渔人大鱼上限 +2' },
  n06G: { name: '马', item: 'I00O', mdx: 'units/critters/packhorse/packhorse.mdx', scale: 0.5, dmg: 0, cd: 1, range: 0, speed: 350, wave: 0, skill: 'horse', fx: { hj: 1 }, boost: '每 2 秒给杀敌最少的玩家 [在场人数] 金币' },
  // 野生宠物（BOSS 波后出现，用糖果抓）：两个技能随机一个
  n085: { name: '青蛙', wild: true, mdx: 'units/critters/frog/frog.mdx', scale: 2, dmg: 29, cd: 0.5, range: 300, speed: 100, wave: 9, skills: ['rot', 'nova'] },
  n086: { name: '飞翔的绵羊', wild: true, mdx: 'units/critters/flyingsheep/flyingsheep.mdx', scale: 1.3, dmg: 29, cd: 0.7, range: 600, speed: 100, wave: 9, skills: ['multi', 'lust2'] },
  n08F: { name: '小火箭', wild: true, mdx: 'abilities/spells/other/tinkerrocket/tinkerrocketmissile.mdx', scale: 1, dmg: 29, cd: 0.3, range: 800, speed: 400, wave: 9, skills: ['rocket', 'rbash'], splash: 100 },
};
// 宠物技能（技能表 + w3a 各级数据，下标 = 技能等级 - 1）
const PSK = {
  bash: { name: '重击', p: [15, 25, 25, 25, 25, 25], dur: [1.5, 2, 2.5, 3.5, 5, 8], txt: (i, k) => `攻击时 ${k.p[i]}% 几率晕眩 ${k.dur[i]} 秒` },
  drums: { name: '战鼓', r: [200, 400, 400, 400, 400, 400], v: [0.12, 0.26, 0.3, 0.35, 0.42, 0.5], txt: (i, k) => `${k.r[i]} 范围友军攻击 +${pctTxt(k.v[i])}` },
  lust: { name: '嗜血术', v: 1.5, dur: [1, 1.1, 1.2, 1.3, 1.5, 1.8], txt: (i, k) => `每 10 秒给 800 范围一座塔攻速 +150%，持续 ${k.dur[i]} 秒` },
  frost: { name: '霜冻攻击', dur: [3.2, 10, 15, 25, 40, 60], txt: (i, k) => `攻击减速 30%，持续 ${k.dur[i]} 秒` },
  crit: { name: '会心一击', m: [6, 7, 9, 12, 18, 20], txt: (i, k) => `10% 几率 ${k.m[i]} 倍伤害` },
  shade: { name: '小鬼', v: [0.15, 0.25, 0.27, 0.29, 0.32, 0.36, 0.4], txt: (i, k) => `180 范围敌人移速 -${pctTxt(k.v[i])}` },
  stomp: { name: '踩脚趾', cd: [7, 4, 3.8, 3.5, 3.1, 2.6], txt: (i, k) => `每 ${k.cd[i]} 秒让 210 范围敌人不能移动 2 秒` },
  corrode: { name: '腐蚀攻击', v: [10, 100, 110, 125, 140, 160], txt: (i, k) => `攻击腐蚀护甲 ${k.v[i]}，持续 5 秒（和腐蚀塔不叠加）` },
  clap: { name: '雷霆一击', cd: [6, 4, 3.8, 3.4, 2.8, 2], s: [0.5, 0.6, 0.6, 0.6, 0.6, 0.6], dur: [2, 2.5, 2.5, 2.5, 2.5, 3], txt: (i, k) => `每 ${k.cd[i]} 秒 300 范围敌人移速 -${pctTxt(k.s[i])}，持续 ${k.dur[i]} 秒` },
  fish: { name: '弹射', txt: () => '攻击弹射 3 个敌人；糖果升级加攻击力' },
  horse: { name: '金币补贴', txt: () => `每 2 秒给杀敌最少的玩家 [在场人数 + 糖果升级次数] 金币` },
  rot: { name: '腐蚀术', v: [30, 140, 160, 180, 200, 240], txt: (i, k) => `攻击腐蚀护甲 ${k.v[i]}，持续 120 秒` },
  nova: { name: '爆冰术', d: [100, 300, 600, 1000, 1500, 2000], cd: [3, 2.5, 2, 1.5, 1, 0.5], txt: (i, k) => `每 ${k.cd[i]} 秒对目标 200 范围造成 ${k.d[i]} 魔法伤害` },
  multi: { name: '多重攻击', txt: () => '每次攻击 600 范围内所有敌人；糖果升级加攻击力' },
  lust2: { name: '嗜血术', v: 1.8, dur: [1.2, 1.4, 1.6, 1.8, 2, 2.2], txt: (i, k) => `每 10 秒给 800 范围一座塔攻速 +180%，持续 ${k.dur[i]} 秒` },
  rocket: { name: '急速炮弹', cd: [0.3, 0.25, 0.2, 0.15, 0.1], d: [50, 100, 150, 200, 250], txt: (i, k) => `每 ${k.cd[i]} 秒对 800 范围一个敌人造成 ${k.d[i]} 魔法伤害` },
  rbash: { name: '晕眩炮弹', d: [20, 40, 60, 80, 100], txt: (i, k) => `每次攻击额外 ${k.d[i]} 伤害并晕眩 0.2 秒` },
};
// 野生宠物抓到时随机的"提升主塔"（原图 LW = 1~14）：本复刻有的塔 / 英雄才有效果
const WILD_BONUS = [null, ['天神塔（浣熊）', { gq: 2 }], ['神牛（小牛）', { g3: 0.03 }], ['风行塔（海豹）'], ['战神塔（小狼）'], ['巫妖塔（小鬼）'], ['先知（企鹅）', { kv: 0.06 }], ['炼金塔（鹰）'],
  ['幻影（鹰）', { k4: 1.5 }], ['邪冰（绵羊）', { kx: 2 }], ['图腾（绵羊）', { r1: 0.09 }], ['渔人（小鱼人）', { go: 1 }], ['金币补贴和人马塔（小马）', { hj: 1 }], ['图腾（浣熊）', { lx: 2 }], ['狂狼塔（小狼）']];
function applyPetFx(fx) {
  for (const [k, v] of Object.entries(fx || {})) G.petFx[k] = k === 'go' || k === 'kr' ? G.petFx[k] + v : Math.max(G.petFx[k], v);
}
const petSkill = P => P.def.skill || P.def.skills[P.lv - 1];
const petSkLv = P => { const k = PSK[petSkill(P)], n = Object.values(k).find(Array.isArray); return Math.min((n ? n.length : 1) - 1, P.inc); };
function makePet(uid, o = {}) {
  const def = PETS[uid], b = G.builder;
  const P = G.pet = { uid, def, kq: 0, ks: 0, talent: 0, inc: 0, lv: o.lv || 1, lw: o.lw || 0, bonusDmg: 0, as: 0 };
  const lv = { dmg: def.dmg, cd: def.cd, range: def.range, atk: 'hero', targets: 1, abils: [] };
  if (def.bounce) Object.assign(lv, { bounce: def.bounce, jump: 500 });
  if (def.splash) lv.splash = def.splash;
  if (petSkill(P) === 'multi') Object.assign(lv, { multi: 99, multiR: 600 });
  const e = P.e = summon(b, { fam: '宠物', kind: 'pet', title: def.name, label: def.name.slice(-1), x: b.x + 80, y: b.y - 80, levels: [lv], mdx: def.mdx, scale: def.scale,
    speed: def.speed, face: -Math.PI / 2, next: 0, noAttack: !def.dmg,
    stats: () => ({ dmg: def.dmg + def.wave * G.wave + P.bonusDmg, as: P.as }),
    crit: petSkill(P) === 'crit' ? () => [0.1, PSK.crit.m[petSkLv(P)]] : null,
    onLaunch: (s, tg) => petLaunch(P, tg), onHit: (s, m) => petHit(P, m), tick: (s, dt) => petTick(P, dt) });
  applyPetFx(def.fx);
  if (P.lw) { const wb = WILD_BONUS[P.lw]; applyPetFx(wb[1]); msg(`提升主塔：${wb[0]}${wb[1] ? '' : '（本复刻没有这座塔，没有效果）'}`); }
  msg(`你的宠物${def.name}来了：${PSK[petSkill(P)].name}（选中宠物可以激活天赋）`);
  uiDirty();
  return e;
}
function petTick(P, dt) {
  const e = P.e, b = G.builder, sk = petSkill(P), i = petSkLv(P), k = PSK[sk];
  // 跟随：离守卫者 1000 以上直接瞬移到身后；射程内有敌人就站着打，没有就走向守卫者身边
  if (dist2(e.x, e.y, b.x, b.y) > 1000 * 1000) { e.x = b.x - Math.cos(b.face || 0) * 100; e.y = b.y - Math.sin(b.face || 0) * 100; }
  if (G.t >= e.next) { const a = rnd(0, TAU); e.tx = b.x + Math.cos(a) * 100; e.ty = b.y + Math.sin(a) * 100; e.next = G.t + 2; }
  const busy = !e.noAttack && nearest(e.x, e.y, e.levels[0].range);
  e.moving = false;
  if (!busy && e.tx != null) {
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
    if (d > 20) { const st = Math.min(d, Math.max(e.speed, dist2(e.x, e.y, b.x, b.y) > 400 * 400 ? b.speed : 0) * dt); e.x += dx / d * st; e.y += dy / d * st; e.face = Math.atan2(dy, dx); e.moving = true; }
  }
  if (sk === 'drums') for (const t of G.towers) if (t !== e && dist2(e.x, e.y, t.x, t.y) <= (k.r[i] + FOOT_HALF) ** 2) t.drums = Math.max(t.drums, k.v[i]);
  if (sk === 'shade') for (const m of inRange(e.x, e.y, 180)) m.auraSlow = Math.max(m.auraSlow, k.v[i]);
  if (sk === 'lust' || sk === 'lust2') lust(e, k.v, k.dur[i], 10, 800);
  if (sk === 'rocket' && cdReady(e, 'rocket')) {
    const m = nearest(e.x, e.y, 800);
    if (m) { setCd(e, 'rocket', k.cd[i]); FXS.beam(e.x, e.y, 80, m.x, m.y, 50, '#ffb347', 1, 0.15); hurt(m, k.d[i], 'magic', e); }
  }
}
function petLaunch(P, tg) {
  const e = P.e, sk = petSkill(P), i = petSkLv(P), k = PSK[sk];
  if (sk === 'stomp' && cdReady(e, 'stomp')) { setCd(e, 'stomp', k.cd[i]); stunArea(e, 210, 2); FXS.nova(e.x, e.y, 210, '#e8d0a0', 0.4); }
  if (sk === 'clap' && cdReady(e, 'clap')) { setCd(e, 'clap', k.cd[i]); for (const m of inRange(e.x, e.y, 300)) slowM(m, k.s[i], k.dur[i]); FXS.nova(e.x, e.y, 300, '#c8d8ff', 0.4); }
  if (sk === 'nova' && cdReady(e, 'nova')) { setCd(e, 'nova', k.cd[i]); aoeAt(e, tg.x, tg.y, 200, k.d[i], 'magic'); FXS.nova(tg.x, tg.y, 200, '#bff4ff', 0.4); }
}
function petHit(P, m) {
  const sk = petSkill(P), i = petSkLv(P), k = PSK[sk];
  if (sk === 'bash' && Math.random() * 100 < k.p[i]) stun(m, k.dur[i]);
  if (sk === 'frost') slowM(m, 0.3, k.dur[i]);
  if (sk === 'corrode' || sk === 'rot') { const dur = sk === 'rot' ? 120 : 5; m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, k.v[i]); m.shredUntil = Math.max(m.shredUntil, G.t + dur); }
  if (sk === 'rbash') { hurt(m, k.d[i], 'hero', P.e); stun(m, 0.2); }
}
// 糖果升级一次（原图 qX）：技能等级 +1；小鱼人 / 飞翔的绵羊（多重攻击）/ 小火箭（晕眩炮弹）是攻击力 +[等级×200]；马是金币补贴 +1
function petLevelUp(jump) {
  const P = G.pet, sk = petSkill(P);
  P.kq++; P.ks = 0;
  if (sk === 'fish' || sk === 'multi' || sk === 'rbash') P.bonusDmg += P.kq * 200;
  if (sk === 'rbash' || sk === 'rocket') P.inc++;          // 小火箭急速炮弹那一种两个技能一起升（原图对 A0SA / A0U6）
  else if (sk === 'horse') G.petFx.kr++;
  else if (sk !== 'fish' && sk !== 'multi') P.inc++;
  FXS.ring(P.e.x, P.e.y, 160, '#ff9ad5', 0.6, 4);
  msg(P.kq >= 4 ? `【${me().name}】的宠物技能升级到了MAX${jump ? '[跳级]' : ''}` : `宠物技能升级[${P.kq}]${jump ? '[跳级]' : ''}`);
  uiDirty();
}
function candyWisp(w) {
  const P = G.pet;
  if (P && P.kq >= 4) { msg('宠物技能等级已经是最大了'); return false; }       // 原图把糖果次数加回去（不消耗）
  if (!P || P.talent < 1) { msg('需要先升级宠物基础天赋（选中宠物激活普通天赋）'); return false; }
  P.ks++;
  FXS.ring(w.x, w.y, 80, '#ff9ad5', 0.4, 3);
  if (rint(1, 30) === 10) { msg('小精灵吃了糖果，死掉了……'); kill(w, null); return; }
  if (rint(1, 1 + (P.kq + 1) ** 2) === 2 || P.ks >= P.kq * 5) {
    w.dead = true;
    petLevelUp(false);
    if (Math.random() < 0.15 && P.kq < 4) petLevelUp(true);
  } else msg(`小精灵吃掉了糖果（这一级已经喂了 ${P.ks} 个，喂够 ${P.kq * 5} 个必定升级）`);
}
// 抓野生宠物（原图 qa）：已有宠物不能抓；每次 1/100，累计 100 次必定成功，不消耗糖果
function candyWild(w) {
  if (G.pet) { msg('已有宠物，无法抓取'); return false; }
  G.catchTries++;
  FXS.ring(w.x, w.y, 80, '#ff9ad5', 0.4, 3);
  if (rint(1, 100) !== 89 && G.catchTries < 100) { msg(`抓取失败（累计 ${G.catchTries} 次，100 次必定成功）`); return false; }
  G.catchTries = 0;
  G.wild = G.wild.filter(x => x !== w);
  if (G.selected === w) G.selected = G.builder;
  const lw = rint(1, 14), lv = rint(1, 2);
  msg('宠物捕获成功');
  makePet(w.uid, { lw, lv });
  if (G.player && G.mode !== 'demo') { profileOf(G.player).pet = { uid: w.uid, lw, lv }; saveProfiles(); msg('宠物记进了玩家档案，以后的局可以用守护宗师的宠物卷轴召唤它'); }
  return false;
}
// 野生宠物：10 波 BOSS 结束后在外环外刷一只（原图 xH / xK），中立被动、游荡
function spawnWildPet() {
  const [a, b, c, d] = CRIT_RECTS(), x = rnd(a, c), y = rnd(b, d);
  const uid = rint(1, 4) === 3 ? 'n08F' : rint(1, 2) === 1 ? 'n086' : 'n085', def = PETS[uid];
  G.wild.push({ isWild: true, id: G.nextId++, uid, name: def.name, x, y, hx: x, hy: y, speed: def.speed, mdx: def.mdx, scale: def.scale, next: G.t, stunUntil: 0, slowUntil: 0, slow: 0, face: 0 });
  msg(`${{ n08F: '咻～～～', n086: '咩～～～', n085: '呱～～～' }[uid]}（一只野生${def.name}出现在外环外，用糖果可以抓它当宠物）`, 10);
}
// 宠物天赋（原图 A0F1）：普通天赋 10 木材（之后糖果才能升级）；至尊天赋 5 木材 + 2 当局成就，场上所有全场唯一塔技能 +1 级
function petTalent() {
  const P = G.pet; if (!P) return;
  if (P.talent === 0) {
    if (G.wood < 10) return msg('木材不足');
    G.wood -= 10; P.talent = 1;
    const sk = petSkill(P);
    if (sk === 'crit') P.as += 0.6;
    else if (sk === 'fish') { G.petFx.go++; P.bonusDmg += 300; }
    else if (sk === 'lust') G.petFx.g3 = Math.max(G.petFx.g3, 0.06);
    else if (sk === 'multi') P.bonusDmg += 300;
    else if (sk === 'rocket') P.as += 0.8;
    else if (sk !== 'horse' && sk !== 'rbash') P.inc++;
    msg(`【${me().name}】的宠物获得了普通天赋`);
  } else if (P.talent === 1) {
    if (G.wood < 5) return msg('木材不足');
    if (G.ach < 2) return msg('成就不足');
    G.wood -= 5; G.ach -= 2; P.talent = 2;
    for (const t of G.towers) if (UNIQ_TALENT.has(t.fam)) ulUp(t, 1, '宠物至尊天赋');
    msg(`【${me().name}】的宠物获得了至尊天赋`);
  }
  uiDirty();
}
// 马的金币补贴（原图 Bfc，每 2 秒）：给排行榜最后一名 Hj×在场人数 + Kr 金币
function horseTick() {
  if (G.t < G.horseAt) return;
  G.horseAt += 2;
  const n = G.petFx.hj * activePlayers().length + G.petFx.kr;
  if (n > 0) { const last = board().slice(-1)[0]; if (last) addGold(last, n); }
}
function extrasUpdate(dt) {
  critterTick();
  horseTick();
  for (const w of G.wild) wander(w, dt);
  if (G.pet && !G.towers.includes(G.pet.e)) G.pet = null;
}
// 宠物商人的货物
const PET_ITEMS = Object.entries(PETS).filter(([, d]) => d.item).map(([uid, d], i) => ({
  id: d.item, key: ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C'][i], name: d.name, ach: 8,
  tip: `购买 1 只${d.name}为自己战斗（只当局存在）<br>攻击 ${d.dmg ? d.dmg + '（每波 +' + d.wave + '）' : '无'} · 间隔 ${d.cd}s · 射程 ${d.range}<br>技能：${PSK[d.skill].name}——${PSK[d.skill].txt(0, PSK[d.skill])}${d.boost ? '<br>加成：' + d.boost : ''}`,
  why: () => G.pet ? '每人只能有一只宠物' : null, use: () => { makePet(uid); } }));

// ================================================================ 不在精灵表里的原版模型（宠物、小精灵、商人）：直接按 MDX 路径画（tools/war3_models.py 的 EXTRA 拷进 assets/w3）
const W3X = {};
function w3meta(mdx, scale) {
  const k = mdx + '|' + scale;
  return W3X[k] || (W3X[k] = { war3: true, aliasOf: 'model:x:' + mdx.replace(/\.mdx$/, ''), unitsPerPixel: 1, modelScale: scale, frameH: 120, anchor: [0.5, 0.9],
    actions: { idle: { loop: true, frames: 30, fps: 30, dirs: 8 }, walk: { loop: true, frames: 30, fps: 30, dirs: 8 }, attack: { frames: 12, fps: 30, dirs: 8 }, death: { frames: 30, fps: 30, dirs: 8 } } });
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
    while (s.next <= 0 && s.left > 0) { if (G.sc) for (const g of G.gates) spawnMonster(G.sc, { gate: g }); s.left--; s.next += s.every; }   // 每个开着的出怪口各刷 1 只"当前出怪单位"（原图的 Ul）
  }
  G.spawners = G.spawners.filter(s => s.left > 0);
  builderUpdate(dt);
  rabbitUpdate(dt);
  extrasUpdate(dt);
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
// 结算时附上本局获得的账号成就和档位
function achSummary() {
  if (!G.player || G.mode === 'demo') return '';
  const p = profileOf(G.player), t = achTier(p.pts);
  return `<p>${G.player}：本局账号成就 <b style="color:#ff9ad5">+${G.earned}</b>，共 ${p.pts} 点 · ${t.name}（下局开局当局成就 ${RULE.startAch + t.lv}${t.next ? `，${t.next} 点升下一档` : ''}）</p>`;
}
function gameOver(reason) {
  G.phase = 'over'; SFX.end('defeat');
  showModal(`<h2>大家很厉害！很遗憾，还是失败了！</h2><p>${reason}</p>
    <p>到达第 <b>${G.wave}</b> 波 · 击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>${achSummary()}
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
  if (G.player && G.mode !== 'demo') { profileOf(G.player).clears++; earnAch(PROFILE.clear); }
  showModal(`<h2>通关！</h2><p>你杀死了最终 BOSS。击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>${achSummary()}
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
const spriteKey = e => e.isShop ? (e.mdx ? 'npc:' + e.shop : 'shop') : e.isRabbit ? 'rabbit' : e.isBuilder ? 'builder' : e.isHero ? 'hero:' + e.heroName : e.uid ? 'unit:' + e.uid : e.fam ? 'tower:' + e.fam + ':' + (e.lv + 1) : null;
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
  if (e.isShop) return e.mdx ? null : sheetByKey('shop');
  if (e.isHero) return sheetByKey('hero:' + e.heroName);
  if (e.uid) return sheetByKey('unit:' + e.uid);
  if (e.fam && e.cat !== 'summon') return towerSheet(e.fam, e.lv + 1);
  return null;
}
// 实体对应的精灵表登记（不管图片加载没有）：3D 模型按它找 MDX、算缩放和动作时长
function metaOf(e) {
  if (!e) return null;
  if (e.mdx) return w3meta(e.mdx, e.scale);          // 宠物、小精灵、商人：直接按 MDX 画
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
    || ((e.uid && !e.neutral) || e.moving || (e.isBuilder && e.order) ? (A.walk ? ['walk', 0] : null) : null) || (A.idle ? ['idle', 0] : A.walk ? ['walk', 0] : [Object.keys(A)[0], 0]);
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
  BASE = Math.min(W, H) / VIEW_REF;
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
// 缩放 1 = 画面短边看到 VIEW_REF 世界单位；最小缩放能看到整张地图
const VIEW_REF = 6900, ZMIN = VIEW_REF / (WORLD * 2 + 300), ZMAX = 6, FOVY = 2 * Math.atan(Math.tan(35 * Math.PI / 180) * 0.75);
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
const TER = window.Terrain.create({ world: WORLD, roadSegs: ROAD_SEGS, roadHalf: ROAD_HALF, spawns: GATE_POS, center: [0, 0], map: W3MAP });
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
  GATE_POS.forEach(([x, y], k) => { const on = G.gates.includes(k); label(on ? `出怪口 ${k + 1}` : `出怪口 ${k + 1}（${k + 1} 人以上开放）`, x, y + 300, on ? '#ffb0a8' : '#9a8784', 12); });
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
  for (const s of SHOPS) drawShop(s);
  for (const it of G.items) drawItem(it);
  for (const t of G.towers) drawTower(t);
  for (const m of G.monsters) drawMonster(m);
  for (const w of G.wild) drawWild(w);
  drawBuilder(b);
  for (const p of activePlayers()) if (p.builder) { drawBuilder(p.builder); onTop(() => label(p.name, p.builder.x, p.builder.y + 230, '#9fd8ff', 11)); }
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
    const range = fam === 'hero' ? D.heroes[G.heroChoice].range : fam === 'ancient' ? 900 : (D.towers[fam].cat === 'aura' ? (D.towers[fam].levels[0].abils[0] || {}).area || 900 : D.towers[fam].levels[0].range);
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
    const gm = fam === 'hero' ? SHEETS['hero:' + G.heroChoice] : fam === 'ancient' ? SHEETS['hero:古树'] : D.towers[fam].cat === 'aura' ? null : SHEETS['tower:' + fam];   // 光环塔没有建筑，只有地面光环
    const ganim = gm && [Object.keys(gm.actions)[0], G.t];
    if (gm && !model3d(GHOST, gm, x, y, -Math.PI / 2, ganim, 1, ok ? 0.6 : 0.35)) {
      const gsh = fam === 'hero' ? sheetByKey('hero:' + G.heroChoice) : fam === 'ancient' ? sheetByKey('hero:古树') : towerSheet(fam, 1);
      if (gsh) drawSheet(gsh, { face: -Math.PI / 2 }, x, y, ganim, 1, ok ? 0.6 : 0.35);
    }
    ctx = octx;
  }
  if (G.pending && mouse) { label(G.pending === 'blink' ? '闪烁到这里' : G.pending.startsWith('xfer:') ? '把魔法转给这座弹跳塔' : G.pending === 'wuji' ? '献祭这座塔' : G.pending === 'kuward' ? '在这里放重生点' : G.pending.startsWith('item:') ? '对这里的光环塔使用' : '移动到这里', wx(mouse.x, mouse.y), wy(mouse.y) + 90, '#c8f5c8', 12); }
  TER.drawOverlay(ctx, view);
  ctx = gctx;
  if (U3) { U3.render(G.t - (draw.lastT ?? G.t), gctx.canvas); draw.lastT = G.t; }
  drawMinimap();
}
const snap = v => Math.round((v - GRID_OFF) / CELL) * CELL + GRID_OFF;
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
function drawShop(S) {
  if (!onScr(S.x, S.y)) return;
  const K = kAt(S.y);
  const x = sx(S.x, S.y), y = sy(S.y), r = Math.max(10 * DPR, 90 * K);
  if (G.selected === S) selRing(x, y, r, '#ffd257'); else if (HOV === S) selRing(x, y, r, '#ffd257', 0.45);
  const m3 = metaOf(S);
  if (m3 && model3d(S, m3, S.x, S.y, -Math.PI / 2, pickAnim(S, m3))) shadow(S.x, S.y, r * 0.9);
  else { const sh = sheetOf(S);
    if (sh) { shadow(S.x, S.y, r * 0.9); drawSheet(sh, S, S.x, S.y, pickAnim(S, sh.m)); }
    else { ctx.fillStyle = '#5a3d1e'; ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 2 * DPR; ctx.fillRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); ctx.strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
      ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`; ctx.fillStyle = '#ffd257'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S.name.slice(0, 1), x, y + 1); } }
  onTop(() => label(S.name, S.x, S.y - 150, '#ffd257', 11));
}
// 地上的物品：发光的小方块 + 名字（原版物品模型没有做）
function drawItem(it) {
  if (!onScr(it.x, it.y)) return;
  const x = sx(it.x, it.y), y = sy(it.y), r = Math.max(5 * DPR, 26 * kAt(it.y)), ph = 0.6 + 0.4 * Math.sin((G.t - it.t0) * 4);
  if (G.selected === it || HOV === it) selRing(x, y, r * 1.6, '#ffd257', G.selected === it ? 1 : 0.5);
  const gold = it.def.power;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gold ? `rgba(255,210,87,${0.35 * ph})` : `rgba(160,220,255,${0.35 * ph})`;
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 1.6 * qAt(it.y, 0.5), 0, 0, 7); ctx.fill(); ctx.restore();
  ctx.fillStyle = gold ? '#ffd257' : it.def.id === 'I00W' || it.def.id === 'I00Y' ? '#ff9ad5' : '#cfe8ff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1 * DPR;
  ctx.fillRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 1.2); ctx.strokeRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 1.2);
  if (HOV === it || G.selected === it || r > 9 * DPR) onTop(() => label(it.def.name, it.x, it.y + 60, gold ? '#ffd257' : '#cfe8ff', 10));
}
// 野生宠物（中立被动）：原版模型，画不了就画个粉圈
function drawWild(w) {
  if (!onScr(w.x, w.y)) return;
  const x = sx(w.x, w.y), y = sy(w.y), r = Math.max(6 * DPR, 40 * kAt(w.y));
  if (G.selected === w) selRing(x, y, r, '#ffd257'); else if (HOV === w) selRing(x, y, r, '#ffd257', 0.45);
  const m3 = metaOf(w);
  if (m3 && model3d(w, m3, w.x, w.y, w.face, pickAnim(w, m3))) shadow(w.x, w.y, r * 0.8);
  else { ctx.fillStyle = '#ff9ad5'; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill(); }
  onTop(() => label(`野生${w.name}`, w.x, w.y + 120, '#ff9ad5', 11));
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
  GATE_POS.forEach(([x, y], i) => { mctx.fillStyle = G.gates.includes(i) ? '#ff4a3a' : '#6a3a35'; mctx.beginPath(); mctx.arc(mx(x), my(y), Math.max(3, 200 * k), 0, 7); mctx.fill(); });
  mctx.strokeStyle = '#6dff6d'; mctx.lineWidth = Math.max(1, 30 * k); mctx.beginPath(); mctx.arc(mx(0), my(0), 300 * k, 0, 7); mctx.stroke();
  const dot = (x, y, c, s) => { mctx.fillStyle = c; mctx.fillRect(mx(x) - s / 2, my(y) - s / 2, s, s); };
  for (const t of G.towers) dot(t.x, t.y, t.isHero ? '#ffd257' : '#3cdc3c', 4 * DPR);
  for (const m of G.monsters) dot(m.x, m.y, m.boss ? '#ff2bff' : '#ff3c3c', (m.boss ? 4 : 2.5) * DPR);
  for (const s of SHOPS) dot(s.x, s.y, '#ffd257', (s === SHOP ? 5 : 3.5) * DPR);
  for (const it of G.items) dot(it.x, it.y, it.def.power ? '#ffd257' : '#cfe8ff', 2.5 * DPR);
  for (const w of G.wild) dot(w.x, w.y, '#ff9ad5', 4 * DPR);
  for (const p of activePlayers()) if (p.builder) dot(p.builder.x, p.builder.y, '#9fd8ff', 4 * DPR);
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
  // 排行榜（原图 RF：按杀敌数排，每波发金按名次）
  const bd = board().map((p, i) => `<span class="${p.local ? 'me' : ''}">${i + 1}. ${escHtml(p.name)} <b>${p.kills}</b></span>`).join('　')
    + G.roster.filter(p => p.out).map(p => `　<span class="out">${escHtml(p.name)}</span>`).join('') + (G.wish ? `　许愿点 <b>${G.wish}</b>` : '');
  if ($('w-board').dataset.v !== bd) { $('w-board').innerHTML = '杀敌排行：' + bd; $('w-board').dataset.v = bd; }
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
const builderState = b => { const o = b.order; return !o ? '待命' : o.kind === 'build' ? '前往建造 ' + (o.fam === 'hero' ? G.heroChoice : o.fam === 'ancient' ? '古树' : o.fam)
  : o.kind === 'use' ? `前去使用${o.item.name}` : o.kind === 'fod' ? '前去施放死亡之指' : o.kind === 'pick' ? `去捡${o.target.def.name}` : '移动中'; };
// 新加的几类单位（三个商人、队友的守卫者、地上的物品、野生宠物、宠物）的信息卡内容：{ name, sub, lines }
const known = e => e === G.builder || e === G.rabbit || SHOPS.includes(e) || G.towers.includes(e) || G.monsters.includes(e) || G.items.includes(e) || G.wild.includes(e) || activePlayers().some(p => p.builder === e);
function extraCard(e) {
  if (e.isShop && e !== SHOP) {
    const d = Math.round(Math.hypot(G.builder.x - e.x, G.builder.y - e.y)), near = d <= RULE.shopReach;
    const lines = [`守卫者距离 ${d}：${near ? '<b style="color:#6fd17a">可以购买</b>' : `<b style="color:#ff8f86">要在 ${RULE.shopReach} 范围内</b>`}`];
    if (e.shop === 'wish') lines.push(`许愿点：<b>${G.wish}</b>（每次许愿 ${WISH_COST} 点；兔子的塔类之球 +1，出售许愿石 / 梦 +5，凑齐马上有梦 +20）`);
    if (e.shop === 'master') lines.push(`当局成就：<b style="color:#ff9ad5">${G.ach}</b>`);
    if (e.shop === 'pet') lines.push(G.pet ? `你的宠物：${G.pet.def.name}` : '每人只能有一只宠物；野生宠物（10 波 BOSS 后出现）用糖果抓');
    return { name: e.name, sub: e.sub, lines };
  }
  if (e.remote) { const p = G.roster[e.pid]; return { name: `${p.name} 的守卫者`, sub: '队友 · 循环圈守卫者', lines: [`建造栏：${p.build.join('、')}${p.heroChoice ? '、' + p.heroChoice : ''}`, `杀敌 ${p.kills} · 被赞 ${p.likes}`, '可以对他使用复制卷轴'] }; }
  if (e.isItem) return { name: e.def.name + (e.charges > 1 ? ` ×${e.charges}` : ''), sub: '物品 · 选中守卫者后点它（或右键）去捡', lines: [e.def.tip || ''] };
  if (e.isWild) return { name: `野生${e.name}`, sub: '中立 · 宠物', lines: ['用糖果抓它当宠物：每次 1%，累计 100 次必定成功（抓的时候不消耗糖果）', `已经试了 ${G.catchTries} 次`] };
  if (e.kind === 'pet' && G.pet && G.pet.e === e) {
    const P = G.pet, sk = PSK[petSkill(P)], i = petSkLv(P), st = towerStats(e);
    return { name: `${P.def.name}（宠物）`, sub: `技能等级 ${P.kq}/4 · ${['未激活天赋', '普通天赋', '至尊天赋'][P.talent]}`, lines: [
      e.noAttack ? '不攻击' : `攻击 ${fmt(st.dmg)}（每波 +${P.def.wave}）· 间隔 ${st.cd.toFixed(2)}s · 射程 ${st.range} · 击杀 ${e.kills}`,
      `${sk.name}（${i + 1} 级）：${sk.txt(i, sk)}`, P.def.boost ? '加成：' + P.def.boost : P.lw ? '提升主塔：' + WILD_BONUS[P.lw][0] : '',
      P.talent < 1 ? '先激活普通天赋，糖果（对小精灵用）才能升级技能' : P.kq < 4 ? `糖果：这一级已经喂了 ${P.ks} 个` : ''].filter(Boolean) };
  }
  return null;
}
function renderInfo() {
  const e = G.selected, box = $('info');
  if (!e || !known(e)) { G.selected = null; box.innerHTML = '<div class="empty">未选择单位</div>'; $('hpt').textContent = $('mpt').textContent = ''; setPortrait(null); return; }
  let left = '', mid = '';
  const xc = extraCard(e);
  if (xc) {
    if (innerWidth <= 820) { box.innerHTML = `<div class="col-l">${portrait(e, xc.name, '#2a3a4e')}</div><div class="col-m"><div class="nm">${xc.name}</div><div class="sub">${xc.sub}</div><div class="tip">${xc.lines.join('<br>')}</div></div>`; return; }
    $('info').innerHTML = `<div class="nm">${xc.name}</div><div class="sub">${xc.sub}</div><div class="tip">${xc.lines.join('<br>')}</div>`;
    $('hpt').textContent = ''; $('mpt').textContent = ''; setPortrait(e); return;
  }
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
      <span>成长值</span><b>力 ${e.grow.str} · 敏 ${e.grow.agi} · 智 ${e.grow.int}</b><span>属性选择</span><b>${statCN(e.growth)}（每杀精英 +1）</b>
      <span>技能点</span><b>${e.points}</b></div>
      <div class="skills">${hd.skills.map((s, i) => `<span class="${e.learned.includes(i) ? 'on' : ''}">${s.name}</span>`).join('')}</div>${heroInfo(e) ? `<div class="sub">${heroInfo(e).slice(4)}</div>` : ''}`;
  } else if (e.fam) {
    if (e.cat === 'summon') { box.innerHTML = `<div class="col-l">${portrait(null, e.label || '魔', '#7a2a10')}</div><div class="col-m"><div class="nm">${e.title || '炎魔'}</div><div class="sub">召唤物 · ${summonLeft(e)}</div></div>`; return; }
    const lv = curLevel(e), st = towerStats(e);
    left = portrait(e, e.fam, e.cat === 'aura' ? '#2f7a3b' : '#2a3a4e') + bar('hp', 1, 1, '无敌的') +
      (e.maxMana ? bar('mp', e.mana, e.maxMana, `${Math.floor(e.mana)} / ${e.maxMana}`) : bar('mp', e.lv + 1, e.levels.length, `等级 ${e.lv + 1}/${e.levels.length}`));
    mid = `<div class="nm">${lv.name}</div><div class="sub">${CAT_CN[e.cat]}${e.branch ? ' · ' + e.branch + '分支' : ''} ${e.cat === 'aura' ? atkTag('aura') : atkTag(lv.atk)}</div><div class="kv">`;
    if (e.cat === 'aura') { const ab = auraAb(e) || {}; mid += `<span>光环</span><b>${auraText(e.fam, ab)}${e.talent ? `（${talentName(e)}）` : ''}</b><span>范围</span><b>${ab.area}</b>`; }
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
const HERO_PRIMARY = 'str';                       // 原图 17 个英雄的主属性都是力量
const summonLeft = e => e.until ? `剩余 ${Math.ceil(e.until - G.t)} 秒` : '永久';
const heroInfo = h => { const def = HERO_DEF[h.heroName], l = def.info ? def.info(h) : []; return l.length ? '<br>' + l.join('<br>') : ''; };
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
    extra = '<div class="tip">买木材、魔力卷轴、知识之书、天赋卷轴、复制 / 收购卷轴。卷轴放进守卫者的物品栏，再对目标使用；复制 / 收购卷轴的目标是队友的守卫者 / 允许收购的 1 级光环塔。</div>';
    hp = '无敌的';
  } else if (e.isRabbit) {
    name = '兔子'; sub = '成就商店 · 中立';
    c1 = `<div class="st"><div><span>剩余时间：</span><b>${Math.ceil(e.until - G.t)} 秒</b><br><span>当局成就：</span><b style="color:#ff9ad5">${G.ach}</b></div></div>`;
    const d = Math.round(Math.hypot(G.builder.x - e.x, G.builder.y - e.y));
    c2 = `<div class="st"><div><span>守卫者距离：</span><b>${d}</b><br>${rabbitNear() ? '<b style="color:#6fd17a">可以购买</b>' : `<b style="color:#ff8f86">要在 ${RULE.rabbitReach} 范围内</b>`}</div></div>`;
    extra = `<div class="tip">用当局成就购买道具（开局 ${RULE.startAch} 点 + 账号成就档位加成，每次 Perfect +1；英雄塔也要 ${RULE.heroAch} 点）。兔子到时间就会消失。</div>`;
    hp = '15 / 15';
  } else if (e.isBuilder) {
    name = '循环圈守卫者'; sub = '不死族';
    c1 = stat('attack-melee', '攻击力', '1 - 1') + stat('armor-small', '护甲', INVULN);
    c2 = `<div class="st"><div><span>移动速度：</span><b>500</b><br><span>状态：</span><b>${builderState(e)}</b></div></div>`;
    extra = `<div class="tip">许愿点 ${G.wish}${G.pet ? ` · 宠物 ${G.pet.def.name}（技能等级 ${G.pet.kq}/4）` : ''} · 物品栏：点物品使用，在商店旁边右键出售</div>`;
    hp = '500000 / 500000'; mp = `${Math.floor(e.mana)} / ${FOD.maxMana}`;
  } else if (e.isHero) {
    const st = heroStats(e), hd = D.heroes[e.heroName];
    name = hd.name; sub = `等级 ${e.level} 英雄 · ${hd.title}`;
    c1 = stat(ATK_ICON[hd.atk] || 'attack-hero', '攻击力', fmt(st.dmg)) + stat('armor-hero', '护甲', INVULN);
    const at = (k, cn) => `<span class="${k === HERO_PRIMARY ? 'pri' : ''}">${cn}：${e.stat[k]}</span>`;
    c2 = `<div class="attr"><img src="${ui('heroattributes-' + HERO_PRIMARY)}">${at('str', '力量')}${at('agi', '敏捷')}${at('int', '智力')}</div>`;
    const sk = e.learned.map(i => { const im = img('icon:skill:' + e.heroName + ':' + i); return im ? `<img src="${im.src}" title="${hd.skills[i].name}">` : ''; }).join('');
    extra = `<div class="buffs">状态：${sk || '<b style="color:#999;font-weight:400">还没有学习技能</b>'}</div>
      <div class="tip">攻击间隔 ${st.cd.toFixed(2)}s · 射程 ${st.range} · 成长值 力 ${e.grow.str} / 敏 ${e.grow.agi} / 智 ${e.grow.int} · 属性选择 ${statCN(e.growth)} · 技能点 ${e.points} · 击杀 ${e.kills}${heroInfo(e)}</div>`;
    hp = '无敌的'; mp = `${Math.floor(e.mana)} / ${e.maxMana()}`;
  } else if (e.fam) {
    if (e.cat === 'summon') { name = e.title || '炎魔'; sub = `召唤物 · ${summonLeft(e)}`; }
    else {
      const lv = curLevel(e), st = towerStats(e);
      name = lv.name; sub = `${CAT_CN[e.cat]}${e.branch ? ' · ' + e.branch + '分支' : ''} · 等级 ${e.lv + 1}/${e.levels.length}`;
      if (!mine(e)) sub += ` · <span style="color:#9fd8ff">${escHtml(pname(pidOf(e)))} 的塔${e.forSale ? '（允许收购）' : ''}</span>`;
      else if (e.forSale) sub += ' · 允许收购';
      if (e.cat === 'aura') { const ab = auraAb(e) || {}; c1 = stat('armor-fortified', '护甲', INVULN); c2 = `<div class="st"><div><span>光环：</span><b>${auraText(e.fam, ab)}${e.talent ? `（${talentName(e)}）` : ''}</b><br><span>范围：</span><b>${ab.area}</b></div></div>`; }
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
  if (t.cat === 'aura' && t.lv === 0 && !mine(t) && t.forSale) lines.push('<b style="color:#9fd8ff">允许收购：可以用收购卷轴买下</b>');
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
  const comeHere = (near, x, y, what) => cmd('V', '✦', '守卫者过来', `守卫者全图闪烁到${what}旁边（闪烁冷却 1 秒）`, () => { blinkTo(x + 150, y - 100); uiDirty(); }, { disabled: near, ico: 'blink' });
  if (e.isShop) {
    const near = dist2(G.builder.x, G.builder.y, e.x, e.y) <= RULE.shopReach ** 2, far = near ? null : `守卫者离${e.name}太远（要在 ${RULE.shopReach} 范围内）`;
    const blk = it => far || itemBlock(it);
    if (e.shop === 'main') for (const it of SHOP_ITEMS) out.push(itemCmd(it, shopBlock(it), () => buyShop(it)));
    if (e.shop === 'master') for (const it of MASTER_ITEMS) out.push(itemCmd(it, blk(it), () => buyItem(it, blk(it))));
    if (e.shop === 'pet') for (const it of PET_ITEMS) out.push(itemCmd(it, blk(it), () => buyItem(it, blk(it))));
    if (e.shop === 'wish') {
      const cat = G.menu.startsWith('wish:') ? WISH_CATS[+G.menu.slice(5)] : null;
      if (!cat) {
        WISH_CATS.forEach(([nm], i) => out.push(cmd(['Q', 'W', 'E', 'R'][i], nm.slice(0, 2), '许愿' + nm, `点击选择${nm}<br>成功许愿需消耗 ${WISH_COST} 许愿点（目前 ${G.wish}）<br>兔子购买塔类之球或出售许愿石可获得许愿点`, () => { G.menu = 'wish:' + i; uiDirty(); }, { ico: 'build' })));
        out.push(cmd('A', '查', '查询许愿点', `许愿点：<b>${G.wish}</b>`, () => msg(`许愿点：${G.wish}`), { ico: 'item-I03X' }));
      } else {
        cat[1].forEach((fam, i) => { const has = !!D.towers[fam], why = far || (!has ? '本复刻没有这座塔' : G.wish < WISH_COST ? `需要 ${WISH_COST} 许愿点（目前：${G.wish}）` : G.build.includes(fam) ? '建造栏里已经是它了' : null);
          out.push(cmd(['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X'][i], fam.slice(0, 2), fam, `<b>${fam}</b>（${WISH_COST} 许愿点）<br>建造栏里同类的那一格换成这座塔${why ? `<br><b style="color:#ff5a4f">${why}</b>` : ''}`,
            () => wishBuy(fam), { disabled: !!why, iconKey: has ? 'icon:' + fam : null, ico: has && SVG_CATS.has(D.towers[fam].cat) ? 'tower-' + fam : null })); });
        while (out.length < 10) out.push(null);
        out.push(cmd('C', '↩', '返回', '返回选择塔类目录', () => { G.menu = 'main'; uiDirty(); }, { ico: 'back' }));
      }
    }
    while (out.length < 11) out.push(null);
    out.push(comeHere(near, e.x, e.y, e.name));
    return out;
  }
  if (e.isRabbit) {
    for (const it of RABBIT_SHOP) out.push(itemCmd(it, rabbitBlock(it), () => buyRabbit(it)));
    while (out.length < 11) out.push(null);
    out.push(comeHere(rabbitNear(), e.x, e.y, '兔子'));
    return out;
  }
  if (e.remote || e.isItem || e.isWild) return out;            // 队友的守卫者、地上的物品、野生宠物没有命令
  if (e.kind === 'pet' && G.pet && G.pet.e === e) {
    const P = G.pet;
    out.push(cmd('Q', '天', '普通天赋', `<b>宠物普通天赋</b>（10 木材）<br>宠物技能升 1 级（小狼攻速 +60%、小鱼人攻击 +300 且渔人大鱼上限 +1、小牛给神牛的加成翻倍……）；激活后才能用糖果给宠物升级${P.talent ? '<br><b style="color:#6fd17a">已激活</b>' : ''}`,
      petTalent, { disabled: P.talent > 0 || G.wood < 10, learned: P.talent > 0, ico: 'learn' }));
    out.push(cmd('W', '尊', '至尊天赋', `<b>宠物至尊天赋</b>（5 木材 + 2 当局成就）<br>场上所有全场唯一塔（神力 / 火速 / 恐惧 / 银行 / 冰封）技能 +1 级${P.talent < 1 ? '<br><b style="color:#ff5a4f">要先激活普通天赋</b>' : P.talent > 1 ? '<br><b style="color:#6fd17a">已激活</b>' : ''}`,
      petTalent, { disabled: P.talent !== 1 || G.wood < 5 || G.ach < 2, learned: P.talent > 1, ico: 'upgrade' }));
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
        out.push(cmd('F', h.name, h.name + '（英雄塔）', `<b>${h.name}</b> ${atkTag(h.atk)}<br>英雄塔 · 全场唯一 · 建造后不能回收<br><span class="gold">${h.gold} 金</span> · ${h.wood} 木材 · ${h.food} 人口 · <b style="color:#ff9ad5">${RULE.heroAch} 当局成就</b><br>${h.title}${blocked ? '<br><b style="color:#ff5a4f">' + blocked + '</b>' : ''}`,
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
    const h = e, hd = D.heroes[h.heroName], kits = HERO_KITS[h.heroName], def = HERO_DEF[h.heroName];
    const skIco = i => ({ ico: 'skill-' + h.heroName + '-' + i, iconKey: 'icon:skill:' + h.heroName + ':' + i });
    // 学习技能：技能书里的 4~5 个，最多学 4 个；学会后有"再次学习"的显示升级
    if (G.menu === 'skills') {
      const c = LEARN_COST[h.learned.length];
      hd.skills.forEach((s, i) => {
        const kit = kits[i], has = learned(h, i), re = has && kit.relearn && h.qs[i] < 2, up = has && kit.up;
        const upWhy = up && (kit.up.why(h) || (kit.up.cost(h).gold && G.gold < kit.up.cost(h).gold ? '金币不足' : kit.up.cost(h).mana && h.mana < kit.up.cost(h).mana ? '魔法值不足' : null));
        const why = has ? null : learnBlock(h, i);
        const uc = up && kit.up.cost(h), upCost = up ? [uc.gold && `${uc.gold} 金币`, uc.mana && `${uc.mana} 魔法`].filter(Boolean).join(' + ') : '';
        const need = re ? `<br><b>再次学习：${QS_RELEARN} 金币</b>` : up ? `<br><b>再次学习${upCost ? '（' + upCost + '）' : ''}：${kit.up.tip(h)}</b>${upWhy ? `<br><b style="color:#ff5a4f">${upWhy}</b>` : ''}`
          : !has && c ? `<br><b>需要：木材 ${c.wood}，力量 ≥ ${c.str}</b>${why ? `<br><b style="color:#ff5a4f">${why}</b>` : ''}` : '';
        out.push(cmd(['Q', 'W', 'E', 'R', 'T'][i], s.name.slice(0, 2), s.name, `<b>${s.name}</b>${has ? ' ✓ 已学习' + (h.qs[i] >= 2 ? '（已再次学习）' : '') : ''}<br>${s.desc.replace(/\n/g, '<br>')}${need}`,
          () => re ? relearnSkill(h, i) : up ? upSkill(h, i) : has ? msg('已经学会了') : learnSkill(h, i),
          { learned: has && !re && !up, disabled: re ? G.gold < QS_RELEARN : up ? !!upWhy : !has && !!why, ...skIco(i), cost: re ? QS_RELEARN : up ? uc.gold || 0 : 0 }));
      });
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    // 分配技能点：力量 / 敏捷 / 智力 +2，或随机
    if (G.menu === 'points') {
      [['Q', 'str', '力量'], ['W', 'agi', '敏捷'], ['E', 'int', '智力']].forEach(([k, st, nm]) =>
        out.push(cmd(k, nm.slice(0, 1), nm + ' +2', `分配 1 点技能点：${nm} +2（剩余 ${h.points} 点）`, () => spendPoint(h, st), { disabled: h.points < 1, ico: st })));
      out.push(cmd('R', '随', '随机', `分配 1 点技能点，随机：5% 某项 +3，25% 某项 +2，3% 某项 +4，1% 全属性 +2（剩余 ${h.points} 点）`, () => spendPoint(h, 'rand'), { disabled: h.points < 1, ico: 'learn' }));
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    // 第一行：学会的技能（按学会的顺序）。原图的主动技能都是攻击时自动放，这里显示冷却
    for (let k = 0; k < 4; k++) {
      const i = h.learned[k];
      if (i == null) { out.push(null); continue; }
      const sk = hd.skills[i], kit = kits[i], key = ['Q', 'W', 'E', 'R'][k], desc = sk.desc.replace(/\n/g, '<br>');
      if (kit.cast) {
        const auto = h.auto[i] !== false;
        out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-magic">主动</span><br>冷却 ${kit.cd} 秒 · 按 <b>${key}</b> 或左键施放（对射程内最近的敌人）<br>右键：自动施放 <b style="color:${auto ? '#6fd17a' : '#ff8f86'}">${auto ? '开' : '关'}</b><br>${desc}`,
          () => castSkill(h, i), { ...skIco(i), auto, cdOf: () => [skillCdLeft(h, i), kit.cd], rfn: () => { h.auto[i] = !auto; msg(`${sk.name}：自动施放${auto ? '关闭' : '开启'}`); uiDirty(); } }));
      } else out.push(cmd(key, sk.name.slice(0, 2), sk.name, `<b>${sk.name}</b> <span class="atk atk-normal">${kit.cdKey ? '攻击时自动施放' : '被动'}</span><br>${desc}`, () => {},
        { ...skIco(i), passive: true, cdOf: kit.cdKey ? () => [cdLeft(h, kit.cdKey), kit.cd(h)] : undefined }));
    }
    // 第二行：属性选择（杀精英 +1、满级升级 +3 的那项）+ 技能点
    if (!def.randomStat) for (const [k, st, nm] of [['A', 'str', '力量'], ['S', 'agi', '敏捷'], ['D', 'int', '智力']])
      out.push(cmd(k, nm.slice(0, 1), '属性选择：' + nm, `属性选择<b>${nm}</b>：每杀死 1 个精英怪，${nm} +1；满级后再升级 ${nm} +3`, () => { h.growth = st; uiDirty(); }, { active: h.growth === st, ico: st }));
    out.push(cmd('F', '点', `技能点（${h.points}）`, `<b>技能点 ${h.points}</b><br>每点可以加 2 点力量 / 敏捷 / 智力，或随机。建成时 3 点；升级时 ≤10 级 +3、≤20 级 +4、≤29 级 +5、30 级 +9`,
      () => { G.menu = 'points'; uiDirty(); }, { ico: 'upgrade', disabled: h.points < 1 }));
    // 第三行：升级、学习技能、英雄自己的命令
    const maxed = h.level >= 30, g = maxed ? 500 : h.level * 100, mp = maxed ? 400 : 200;
    out.push(cmd('U', '↑', '升级', `需要 <b>${g} 金币 + ${mp} 魔法</b><br>${maxed ? `满级后：${def.randomStat ? '随机一项' : '所选属性'} +3` : `等级 +1：全属性 +1 再按成长值加（力量 +${h.grow.str} · 敏捷 +${h.grow.agi} · 智力 +${h.grow.int}），基础攻击 +[力量/5]，技能点 +${h.level + 1 <= 10 ? 3 : h.level + 1 <= 20 ? 4 : h.level + 1 <= 29 ? 5 : 9}`}`,
      () => heroLevelUp(h), { disabled: G.gold < g || h.mana < mp, ico: 'upgrade', cost: g }));
    const canUp = h.learned.some(i => (kits[i].relearn && h.qs[i] < 2) || kits[i].up);
    out.push(cmd('L', '书', '学习技能', `最多 4 个。第 1 个免费，第 2/3/4 个需要木材 18/36/54，力量 ≥ 80/160/240${canUp ? '<br>学会的技能有的可以再次学习' : ''}`, () => { G.menu = 'skills'; uiDirty(); }, { ico: 'learn', disabled: h.learned.length >= 4 && !canUp }));
    if (def.cmds) out.push(...def.cmds(h).slice(0, 2));
    return out;                                      // 英雄塔建造后不能回收（原图英雄塔说明）
  }
  if (e.fam && e.cat !== 'summon') {
    if (!mine(e)) return out;                                  // 队友的塔：只能看
    const f = famOf(e), kit = KITS[e.fam];
    if (e.cat === 'aura' && e.lv === 0) out.push(cmd('T', '售', e.forSale ? '允许收购（点击关闭）' : '当前不能收购（点击允许）', `原图 A03K：允许收购后，队友可以用收购卷轴买下这座 1 级光环塔，你获得 1500 金币<br>当前：<b>${e.forSale ? '允许收购' : '不能收购'}</b>`,
      () => { e.forSale = !e.forSale; NET.send({ t: 'state', slot: G.me, sale: { tower: e.id, on: e.forSale } }); msg(e.forSale ? '这座光环塔现在允许队友收购' : '这座光环塔现在不能收购'); uiDirty(); }, { active: !!e.forSale, ico: 'sell' }));
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
      b.innerHTML = (icon ? `<img src="${icon.src}">` : `<span class="ic">${it.name.slice(0, 2)}</span>`) + `<span class="hk">${INV_KEYS[i]}</span>` + (it.charges > 0 ? `<span class="cost">${it.charges}</span>` : '');
      const how = it.passive ? '不能直接使用' : it.self ? '点击使用' : `点击后选择目标使用（施法距离 ${it.range}，守卫者会先走过去）`;
      const c = { name: it.name, key: INV_KEYS[i], tip: `${it.tip || ''}<br>${how}${it.pawn ? '<br>守卫者在商店旁边时<b>右键出售</b>：' + [it.pawn.gold && it.pawn.gold + ' 金', it.pawn.wood && it.pawn.wood + ' 木材', it.pawn.wish && it.pawn.wish + ' 许愿点'].filter(Boolean).join(' + ') : ''}` };
      b.onclick = () => { showTip(c); SFX.ui('click'); invPick(i); };
      b.oncontextmenu = ev => { ev.preventDefault(); sellItem(i); showTip(null); };
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
  for (const p of activePlayers()) { const rb = p.builder; if (rb && d2(rb, 150) < rpx(rb, 108, 14)) return rb; }
  const rb = G.rabbit; if (rb && d2(rb, 90) < rpx(rb, 120, 16)) return rb;
  if (!G.pending) for (const s of SHOPS) if (d2(s, 220) < rpx(s, 144, 19)) return s;
  for (const w of G.wild) if (d2(w, 80) < rpx(w, 90, 14)) return w;
  if (!G.pending) for (const it of G.items) if (d2(it, 30) < rpx(it, 60, 12)) return it;
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
    if (G.inv[i]) { if (itemTarget(t)) orderUse(i, t, shift); else msg(G.inv[i].ok(null)); }
    uiDirty(); return;
  }
  if (G.pending === 'wuji') {                                  // 大巫师巫祭：对自己的塔
    const t = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null; if (G.hero) wujiSacrifice(G.hero, t); uiDirty(); return;
  }
  if (G.pending === 'kuward') {                                // 狂牛手动放重生点
    G.pending = null; if (G.hero) knWard(G.hero, x, y); uiDirty(); return;
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
  if (hit && hit.isItem && G.selected === G.builder) return orderPick(hit, shift);     // 选中守卫者时点地上的物品 = 去捡
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
    if (G.selected === G.builder) { const h = hitTest(mouse.x, mouse.y); if (h && h.isItem) orderPick(h, e.shiftKey); else orderMove(x, y, e.shiftKey); }
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
// 开局先输入玩家名称（代替原图的平台账号）：同名继承账号成就点数，下面列出本机已有的名称可以直接点
const escHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const profileLine = name => { const p = profileOf(name), t = achTier(p.pts); return `${p.pts} 点 · ${t.name} · 开局当局成就 ${RULE.startAch + t.lv}`; };
function askName() {
  const names = Object.keys(profiles.all).sort((a, b) => profiles.all[b].pts - profiles.all[a].pts).slice(0, 4);
  const foot = `同一个名称继承它的账号成就点数（存在本机浏览器里）。账号成就每到达新的一波 +${PROFILE.wave}、每次 Perfect +${PROFILE.perfect}、通关 +${PROFILE.clear}，攒够档位开局多给当局成就；英雄塔要 ${RULE.heroAch} 点当局成就才能建`;
  showModal(`<div class="w3dlg"><h2>输入玩家名称</h2>
    <input id="p-name" class="w3input" maxlength="12" placeholder="玩家名称（最多 12 个字）" value="${escHtml(profiles.last)}" autocomplete="off">
    <button class="w3btn" id="p-ok">确定</button>
    ${names.map((n, i) => `<button class="w3btn" data-i="${i}">${escHtml(n)}（${profileLine(n)}）</button>`).join('')}
    <div class="w3hint">${foot}</div></div>`);
  $('modal-box').classList.add('dlg');
  fitDialog();
  const input = $('p-name'), hint = $('modal-box').querySelector('.w3hint');
  const pick = name => {
    name = name.trim().slice(0, 12);
    if (!name) { hint.innerHTML = '<b style="color:#ff8f86">请先输入玩家名称</b>'; input.focus(); return; }
    SFX.ui('bigClick'); profileOf(name); profiles.last = name; saveProfiles(); showStart();
  };
  $('p-ok').onclick = () => pick(input.value);
  input.onkeydown = e => { if (e.key === 'Enter') pick(input.value); };
  $('modal-box').querySelectorAll('.w3btn[data-i]').forEach(el => { el.onclick = () => pick(names[+el.dataset.i]); });
  input.focus(); input.select();
}
function showStart() {
  if (!profiles.last) return askName();
  const player = profiles.last;
  const start = (mode, players = 1, bots = false) => { newGame(mode, players, player, bots); hideModal(); resize(); clampCam(); uiDirty(); };
  const intro = () => showDialog('玩法简介', [{ text: '返回', fn: pickMode }],
    `怪物沿"回"字形双环路线<b>永远绕圈</b>，不会漏到基地。<b>场上怪物超过上限即失败</b>（每个玩家 ${RULE.capPerPlayer} 只，单人 ${RULE.capPerPlayer} 只）。地图是原图的 8 人地图，有 8 个出怪口，参与几人就开几个（单人只开左上角）。每波按时出怪，不管上一波清没清完。<br><br>
    选中<b>守卫者</b>（F1），点击地面让它移动；在右下角命令面板里打开<b>建造</b>，选塔后点地面，守卫者会走过去建造。拖动画面或点击小地图移动镜头，滚轮缩放。`);
  const pickMode = () => showDialog('选择游戏模式', Object.entries(MODES).filter(([, m]) => !m.hidden).map(([k, m]) => ({
    text: `${m.name}（${m.short}）`, hint: m.desc, fn: () => start(k),
  })).concat([
    { text: '演示：前两波', hint: MODES.demo.desc, fn: () => start('demo') },
    { text: '多人规模（2~8 人）', hint: '按原图多人局的规模开局：N 人开 N 个出怪口，怪物上限 40×N，最终波的龙和魔王也按人数。原版数值，联机前用来试玩', fn: pickPlayers },
    { text: '玩法简介', hint: '怎么玩、怎么操作', fn: intro },
    { text: `玩家 ${escHtml(player)} · 成就 ${profileOf(player).pts} 点（切换）`, hint: `账号成就 ${profileLine(player)}<br>点这里换一个玩家名称，各名称的账号成就分开记`, fn: askName },
  ]), '把鼠标移到选项上查看说明');
  const pickPlayers = () => showDialog('多人规模', [2, 3, 4, 5, 6, 7, 8].map(n => ({
    text: `${n} 人`, hint: `开放 ${n} 个出怪口（${GATES.slice(0, n).map(g => g[0]).join(' ')}），怪物上限 ${n * RULE.capPerPlayer}；原版数值`, fn: () => pickSeats(n),
  })).concat([{ text: '返回', fn: pickMode }]), '只有你一个人操作，出怪口和上限按所选人数');
  // 其他位置：空着（实际只有你一人：排名、飞艇、投票都按 1 人算），或放模拟队友（不操作，用来试复制 / 收购卷轴、投票踢人、点赞、杀敌排行）
  const pickSeats = n => showDialog(`${n} 人：其他 ${n - 1} 个位置`, [
    { text: '空着（只有你一个玩家）', hint: '只有你一个实际玩家：每波发金按第 1 名、飞艇奖励和投票都按 1 人算', fn: () => start('origin', n) },
    { text: `放 ${n - 1} 个模拟队友`, hint: '模拟队友站在出生点不操作，各带一座允许收购的 1 级光环塔：可以对他们用复制卷轴、收购卷轴，发起投票、点赞，看杀敌排行', fn: () => start('origin', n, true) },
    { text: '返回', fn: pickPlayers },
  ], '联机以后这些位置由其他玩家占');
  pickMode();
}
function showHelp() {
  const rows = Object.entries({ 普通: 'normal', 穿刺: 'pierce', 魔法: 'magic', 混乱: 'chaos' }).map(([cn, k]) => {
    const r = D.damage[k];
    return `<tr><th>${cn}</th>${[1, 2, 0, 6].map(i => `<td>${Math.round(r[i] * 100)}</td>`).join('')}</tr>`;
  }).join('');
  const was = G.paused; G.paused = true;
  showModal(`<h2>说明</h2>
    <p><b>失败</b>：场上怪物数 &gt; ${cap()}（每个玩家 ${RULE.capPerPlayer}，本局 ${G.players} 人；开放 ${G.players} 个出怪口）。<b>胜利</b>：撑过 48 波后，在 300 秒内击杀最终 BOSS（龙 + 魔王）。</p>
    <p><b>操作</b>：按住 Shift 下命令可以排队（连续建造多座塔）；F1 选中守卫者，F2 选中英雄；守卫者选中时点击 / 右键地面 = 移动；命令面板的按钮都有热键（Q W E R / A S D F …），Esc 返回或取消；方向键或拖动画面移动镜头，滚轮缩放，点击小地图跳转；空格让镜头对准选中单位；P 暂停。</p>
    <p><b>护甲系数</b>（%，原图任务面板原文）：</p>
    <table><tr><th>攻击＼护甲</th><th>抗性</th><th>魔法</th><th>物理</th><th>神圣</th></tr>${rows}</table>
    <p>护甲减伤 = 护甲×0.02 /（1 + 护甲×0.02）。腐蚀塔、减防光环可以把护甲打成负数，负护甲会增伤。</p>
    <p><b>精英怪</b>：每只怪 1/55 概率成为精英（粉色外圈），带一种 900 范围的光环。击杀得 1~3 木材；由英雄塔击杀时，英雄所选属性 +1。</p>
    <p><b>资源</b>：起手 2000 金、5 木；12 木 = 1 人口；1 木 = 300 金。回收塔返还 100% 金币。</p>
    <p><b>死亡之指</b>：守卫者的技能（热键 X），对 800 范围内的一个敌人使用，直接杀死它；BOSS 只扣一部分生命。冷却 90 秒，耗 5 点魔法（守卫者魔法上限 10）。</p>
    <p><b>商店</b>：地图中央，守卫者走到 ${RULE.shopReach} 范围内选中商店购买：1 个木材（500 金，冷却 30 秒）、10 个木材（5000 金，冷却 300 秒）、魔力卷轴（英雄塔 +120 魔法）、知识之书（英雄塔随机属性 +10）、天赋卷轴（15 木，MAX 光环塔激活基础天赋，开局 1200 秒后开放）。三种卷轴买下后放进守卫者的<b>物品栏</b>（6 格），选中守卫者点物品（或小键盘 7 8 4 5 1 2），再点目标塔，守卫者走到施法距离内使用。复制 / 收购卷轴要对队友使用（守卫者 / 允许收购的 1 级光环塔）。商店两边还有<b>宠物商人</b>（左）、<b>守护宗师</b>和<b>许愿商人</b>（右）。物品栏的物品在商店旁边右键可以出售。</p>
    <p><b>宠物</b>：宠物商人卖 11 种宠物（8 当局成就，每人一只），跟着守卫者走、自动攻击，攻击每波提升；选中宠物激活普通天赋（10 木）后，对<b>小精灵</b>（外环外每 100 秒刷一只）用<b>糖果</b>（守护宗师 5 成就 5 个，地上也会掉）可以升级宠物技能。10 波 BOSS 后外环外出现野生宠物，用糖果抓（抓到的记进玩家档案，下局用宠物卷轴召唤）。</p>
    <p><b>许愿</b>：兔子的塔类之球每个 +1 许愿点，出售许愿石（BOSS 掉落）/ 梦 +5，凑齐"马上有梦" +20；在许愿商人那里花 20 许愿点把建造栏的一格换成想要的塔。</p>
    <p><b>守护宗师</b>：兔子卷轴、重置卷轴（重新随机英雄成长值）、宠物卷轴、糖果、赞（48 波后给队友点赞）、投票卷轴（投票踢人：每票 +2，超过在场人数踢出）。每波发金 = 杀敌排行名次 ×8 + 波数 ×2。</p>
    <p><b>兔子</b>：每个 BOSS 波（10/20/30/40 波、最终波）开始 ${RULE.rabbitDelay} 秒后，地图随机位置出现一只兔子（小地图粉点），${RULE.rabbitLife} 秒后消失。守卫者走到它 ${RULE.rabbitReach} 范围内，选中兔子就能用<b>当局成就</b>买道具：4 种塔类之球（重新随机建造栏的某一类塔）、5 个木材、魔法药水（有魔法功勋的塔 +200，天神塔 +600）、知识药水、重修药水（属性选择那项 -6、技能点 +3，每局 1 支）。当局成就开局 ${RULE.startAch} 点（拒绝逃跑）再加账号成就档位 +0~10，每次 Perfect +${RULE.achPerPerfect}；守护宗师的<b>兔子卷轴</b>（${RULE.rabbitScrollAch} 成就）可以额外召唤一次兔子；兔子还卖天赋秘籍（5 成就 + 20 木，MAX 光环至尊天赋 / 唯一塔技能 +2 级，每局 4 个）。</p>
    <p><b>英雄塔</b>：每次随机建造给出 1 个英雄塔（和原图随机模式一样），1500 金 + 5 木材 + 4 人口，还要 <b>${RULE.heroAch} 点当局成就</b>（建成扣掉），全场唯一，建造后不能回收。建成时随机给出力量 / 敏捷 / 智力的成长值（合计 10），每次升级按成长值加属性；属性选择决定杀精英怪 +1 的属性和满级后升级 +3 的属性。升级要 等级×100 金 + 200 魔法（英雄每击杀 +2 魔法）。学技能：第 1 个免费；第 2/3/4 个分别要 18/36/54 木材，且力量 ≥ 80/160/240，最多 4 个（第 5 个特殊技能有额外条件）。英雄有技能点：建成 3 点、每升一级 3~9 点，每点力量 / 敏捷 / 智力 +2 或随机。
      随机建造在原图随机模式的 17 个英雄里抽，原图的主动技能都是攻击时自动放。</p>
    <p><b>账号成就</b>（玩家 ${escHtml(G.player || '—')}：${G.player ? profileLine(G.player) : '未登记'}）：开局输入的玩家名称代替原图的平台账号，同名继承点数，存在本机浏览器里。每到达新的一波 +${PROFILE.wave}、每次 Perfect +${PROFILE.perfect}、通关 +${PROFILE.clear}（演示模式不算）。
      档位（开局当局成就加成）：${ACH_TIERS.map(([n, t], i) => `${t} ${n} 点 +${i + 1}`).join('、')}。</p>
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
window.__dbg = { get G() { return G; }, NODES, EDGES, kill, hurt, spawnMonster, FXS, buildTower, upgradeTower, learnSkill, heroLevelUp, step, canPlace, newGame, monstersAlive, towerStats, rerollBuild, orderBuild, orderMove, castSkill, spawnRabbit, buyRabbit, RABBIT_SHOP, makePet, spawnWisp, spawnWildPet, dropItem, invAdd, ITEMS, startVote, kickPlayer, giveLike, netReceive, MASTER_ITEMS, PET_ITEMS, wishBuy, petTalent, MASTER, WISHER, PETSHOP, buyItem, critterTick, sellItem, pickUp, candyWild, renderCmds, SHOP, SHOP_ITEMS, buyShop, orderFinger, KITS, towerAS, towerAtk, effArmor, applyAuras, sellTower, select, hurt, buildCmds, newTower, attack, bounceXfer, spendPoint, upSkill, wujiSacrifice, plantAncient, knWard, heroStats, HERO_KITS, HERO_DEF, heroAuraList, gateSpots, spawnAt, cap, playerLeft, startFinal, GATES };
})();
