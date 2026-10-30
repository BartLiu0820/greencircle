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
  heroSponsors: [],          // 英雄赞助名单（原图按玩家名字发 n03C，这里先清空）：名单里的玩家随机建造能抽到 18~34 号赞助英雄
  rerollWood: 6,             // 随机建造：第一次免费，之后每次 6 木材（A03C 的触发器 nY / nZ）
  shopReach: 600,            // 商店（u00L，原图摆在地图中央 (0,128)）：守卫者要走到旁边才能买
  // 无尽关卡（原图 zI / zM / zd）：杀死龙和魔王时 Perfect 分 ≥ 10 才开启；180 秒后（第一波实际在 185 秒）每 20 秒一波，
  // 每个在场玩家的怪物上限降到 15；超过上限时结束，按无尽积分结算
  endlessFp: 10, endlessCap: 15, endlessOpen: 185, endlessEvery: 20, endlessCount: 15, endlessBest: 25000,
};
const MODES = {
  // 新人随机模式（原图 JI = 1，BcR：半数以上玩家荣誉少于 30 时自动开启）：BcQ 每人 +2000 金、+7 木、+2 人口；
  // wX 每波 38 秒、发金 名次×12 + 波数×4（普通是 ×8 + ×2）；最终波魔王不带按人数加的物品。怪物生命不变
  rookie: { name: '新人随机', interval: 38, hp: 1, gold: 4000, wood: 12, food: 8, waveGold: [12, 4], plainBoss: true, short: '原图新人模式',
            desc: '原图的新人随机模式：起手多 2000 金、7 木、2 人口；38 秒/波，每 5 秒发金翻倍（名次×12 + 波数×4）；魔王降低血量。怪物生命是原图数值' },
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
const CAT_CN = { main: '主塔', raw: '原始塔', sup: '辅助塔', aura: '光环塔', alt: '另类塔', hero: '英雄塔', big: '大辅助', witch: '巫系辅助', uniq: '全场唯一', god: '神塔', evo: '大辅助（进化）', summon: '召唤物' };

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
// 天赋改了技能等级的（闪电塔闪杀、毒塔慢性毒药、混乱塔致命一击）：t.abOv 里的数值优先
const CHAOS_CRIT = [null, { A: 20, B: 3 }, { A: 25, B: 4.5 }, { A: 10, B: 7 }, { A: 40, B: 5 }];   // 混乱塔致命一击 A00I 1~4 级
const abilOf = (t, lv, code) => (t.abOv && t.abOv[code]) || (code === 'AOcr' && t.critLv ? CHAOS_CRIT[t.critLv] : null) || abil(lv, code);

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
    hl: rint(1, 5), dp: Array(MAX_PLAYERS).fill(0), je: Array(MAX_PLAYERS).fill(0),     // 原图 HL（熊猫 BOSS 的光环）、Dp / JE（BOSS 被攻击触发器按玩家的冷却，每秒 +1）
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
    player, sponsor: RULE.heroSponsors.includes(player), earned: 0, ach: RULE.startAch, rabbit: null, rabbitScroll: false, buys: {}, itemCd: {},
    waveVars: {}, next: null, carryHint: null, sc: null, curUnit: null, waveHook: null, waveNote: '', finalCountdown: false,
    k7: rint(1, 2),          // 原图开局随机：30 波出亡灵飞艇（1）还是地精飞艇（2）
    mem: {},                 // 主塔回收时记下的技能等级和魔法，再建同一种主塔时恢复（原图 D1~D7、DK/DL/DM 等全局变量）
    bounce: { atk: 0, as: 0, talent: false, bolt: 1 },   // 弹跳塔的玩家科技：提升攻击 R000 / 攻速 R001、弹跳天赋 R00P、MAX 回收时记下的灵魂重击等级（Oq）
    klPow: 0, klSpd: 0,      // 狂狼的玩家科技：狼力 R00R / 狼速 R00S
    lich: { tech: 0, mr: 0, nk: 0, kc: 0, mq: false },
    rm: { fg: 1, fi: 1, fh: 1, kz: 0, fj: 0, k0: 1, hg: 0, hh: false, breakAt: -Infinity },
    beast: { tech: 1, tamed: false, elite: [false, false, false], wpn: null },   // wpn：训兽 a1~a5 / b1~b5 每组打开的是攻击 1（'a'）还是攻击 2（'b'），见 beastUnlock
    godLock: new Set(),      // 神塔：本机建造栏里被关掉的（见 godRefresh）
    honorLv: null,           // 荣誉光环 4 个光环的等级（这次随机建造里第一次建时定下）
    god: { hq: 0, lq: 0, my: 0, lv: 0, r01l: Array(MAX_PLAYERS).fill(0) },   // 神塔的全局变量：暗牧 Hq、海妖 LQ、圣灵 My（记的是上次触发的时间）、猎人 Lv（到这个时间才能捕猎）、精准攻击 R01L 按玩家
    panda: { stomp: 1, master: 1, fire: 1 },
    cmd: { type: rint(1, 3), lv: 1, ys: [0, 0, 0, 0, 0, 0] },   // 原始指挥官：宁静类型 Jf（开局随机）、宁静等级 Jg（天赋 2）、强化原始塔 JY / JZ / Ja / Jb / Jc / Jd   // 熊猫：熊猫践踏 Gd、家族大师 Gf、火焰强化 Gg（原图按玩家记）
    wx: { fu: 1, js: 0, lv: {}, mana: 0, fn: 0, waterWin: -1, earthWin: -1 },   // 五行（原图按玩家记）：激活次数 Fu、天赋 Js、各技能等级 Fp~Ft、魔法 Fv、火的攻击计数 Fn、水 / 土的冷却窗口 Fm / Fo   // 兽王：训兽科技 R00Z、驯化过 Iy、精训过的随从位 I8 / JB / I9（重造兽王保留）   // 人马（原图按玩家记）：爆雷 FG、雷怒 FI、雷嗜 FH、雷踏 Kz、魔法 FJ、雷霆 K0、雷霆次数 HG、天赋 HH、毁灭冷却   // 巫妖：巫妖之力 R01R、获得巫妖之力次数 MR、献祭巫系次数 NK、献祭自己次数 KC、天赋 MQ
    tjTech: 0,               // 天将的玩家科技：提升攻击 R00J / 攻速 R00K（等级相同，最高 50）
    me: 0, roster: makeRoster(np, bots, player),         // 玩家名单（见"玩家名单"一节）：本机是 Player(0)
    vote: null, voteAt: 0, liked: false,                 // 投票踢人（Ea / Sq 冷却 59 秒）、本局点过赞（H5）
    items: [], wish: 0, wishDrops: 0, talentStock: 4, candyDrop: false,   // 地上的物品；许愿点（Ou）；BOSS 掉许愿石次数（Lx）；天赋秘籍库存（FQ）；兔子掉过糖果（MF）
    pet: null, petFx: { gq: 0, g3: 0, k4: 0, kx: 0, kv: 0, lx: 0, r1: 0, go: 0, hj: 0, kr: 0, gs: 0 },   // 宠物（Rx）和宠物给塔 / 英雄的加成（Gq、G3、K4、Kx、KV、LX、图腾 +9% 攻速 A0R0、Go、Hj、Kr）
    wild: [], catchTries: 0, thief: false,               // 野生宠物（中立被动，用糖果抓）；抓宠累计次数（LT）；小偷出过（Lc）
    wispAt: 100, dropAt: 150, horseAt: 2,                // 小精灵每 100 秒检查、地上每 150 秒掉糖果或金币、马每 2 秒发金
    achDone: {}, achFr: 0, achCnt: { food: 0, gold: 0, fod: 0 }, bossKills: 0,   // 完成过的当局成就；组合 / 击杀成就的次数（FR）；买人口 ES、换金币 ER、死亡之指 EQ 次数；大红牛 / 大豪猪击杀数（EG[1]）
    endless: null,           // 无尽关卡（见"无尽关卡"一节）
  };
  seatBots();
  G.selected = G.builder;
  // 开局当局成就：拒绝逃跑 +5，再按账号成就档位 +0~10（原图 qi：至尊称号 +1~10、拒绝逃跑 +5）。演示模式固定剑神，直接给够建英雄的成就
  const tier = player && mode !== 'demo' ? achTier(profileOf(player).pts) : { lv: 0 };
  const eb = player && mode !== 'demo' ? endlessBonus(profileOf(player).endless || 0) : 0;   // 原图 Oz：平台存的无尽分越高，开局当局成就越多
  G.ach += mode === 'demo' ? RULE.heroAch : tier.lv + eb;
  if (player && mode !== 'demo') { const p = profileOf(player); p.games++; saveProfiles(); }
  FXS.clear();
  rerollBuild(true);
  rollFn(WR.start); refreshHint();                 // 准备阶段就预告第 1 波
  SFX.startMusic();
  if (player && mode !== 'demo') {
    msg(`完成成就：拒绝逃跑　当局成就 +${RULE.startAch}`, 10);
    if (tier.lv) msg(`${player} 完成成就：${tier.name}　当局成就 +${tier.lv}`, 10);
    if (eb) msg(`${player} 无尽最高 ${profileOf(player).endless} 分：当局成就 +${eb}`, 10);
  }
  if (MODES[mode].waveGold) msg('新人随机模式：起手多 2000 金币、7 木材、2 人口；全局金币给予量翻倍；魔王降低血量', 10);
}

// ---------------------------------------------------------------- 建造栏
// 原图随机建造（war3map.j 里 Qf / Hd / He / Hf / Hh / Hg / H7 / H8 八个随机数）：1 主塔、1 原始塔、1 光环塔、1 新辅助（4 大辅助 + 4 巫系）、
// 1 小辅助、1 另类塔、1 全场唯一塔、1 神塔；另外 Hc = GetRandomInt(1,17) 从 17 个英雄塔里放开 1 个，有"英雄赞助"的玩家是 1~34（多 17 个赞助英雄）。
// 原图的英雄赞助按玩家名字发（触发器里写死的名单）；这里名单先清空（RULE.heroSponsors），以后再设计赞助机制
const FAM = Object.values(D.towers);
const byCat = c => FAM.filter(f => f.cat === c).map(f => f.name);
const SLOT_POOL = { main: ['main'], raw: ['raw'], aura: ['aura'], newsup: ['big', 'witch'], sup: ['sup'], alt: ['alt'], uniq: ['uniq'], god: ['god'] };
const SLOTS = Object.keys(SLOT_POOL);
const NOT_RANDOM = new Set(['图腾塔']);     // 图腾塔不在原图另类塔随机池（Hg = 1~10）里
const slotPool = s => SLOT_POOL[s].flatMap(byCat).filter(f => !NOT_RANDOM.has(f));
const slotOf = fam => SLOTS.find(s => SLOT_POOL[s].includes(D.towers[fam].cat));
function rerollBuild(free) {
  if (!free) {
    if (endlessLock()) return msg('无尽关卡里守卫者没有随机建造');
    if (G.rerolls > 0 && G.wood < RULE.rerollWood) return msg(`木材不足（随机建造需要 ${RULE.rerollWood} 木材，首次免费）`);
    if (G.rerolls > 0) G.wood -= RULE.rerollWood;
    G.rerolls++;
  }
  if (MODES[G.mode].build) G.build = MODES[G.mode].build.slice();      // 演示模式：固定建造栏
  else G.build = SLOTS.map(s => pick(slotPool(s)));
  const hc = rint(1, G.sponsor ? 34 : 17);                          // 有英雄赞助：1~34（18~34 是赞助英雄）
  G.heroChoice = MODES[G.mode].hero || Object.keys(D.heroes).find(n => D.heroes[n].hc === hc);
  G.placing = null;
  G.honorLv = null;
  godRefresh();
  uiDirty();
}
// 神塔（H8 = 1~6：驱魔 / 树妖 / 暗牧 / 海妖 / 猎人 / 圣灵）全场唯一：随机建造时先全部关掉，抽中的那座只在全场没人有时（LR = 0）放开；
// 任何玩家开始建造后所有人都关掉（BHm 等），回收时 LR 归零但不重新放开——要等下次随机建造。G.godLock 是本机建造栏里被关掉的神塔
function godRefresh() { G.godLock = new Set(G.build.filter(f => D.towers[f] && D.towers[f].cat === 'god' && G.towers.some(t => t.fam === f))); }

// ---------------------------------------------------------------- 伤害
function armorMult(armor) {
  return armor >= 0 ? 1 / (1 + 0.02 * armor) : 2 - Math.pow(0.98, -armor);   // DefenseArmor=0.02
}
// 护甲：减防光环和剑刃之魂的减甲是同一种光环（AHad），只取大的；恐惧塔 / 恐惧之眼也不叠加，只取大的
const debuff = (m, k) => m.deb[k] && m.deb[k].until > G.t ? m.deb[k].v : 0;
function effArmor(m) {
  return m.armor + m.auraFocus + (m.frostArmor > G.t ? 120 : 0) + (m.innerFire > G.t ? 200 : 0) - Math.max(m.auraArmorDown, debuff(m, 'blade')) - m.armorDown - m.shred - debuff(m, 'fear') - debuff(m, 'corrode');
}
function typeMult(atk, m) {
  const row = D.damage[atk] || D.damage.normal;
  return row[ARMOR_COL[m.type] ?? 7];
}
// 光环、原始战力等只加塔的"基础攻击"（在 attack() 里乘进攻击伤害），这里不再放大技能、持续伤害和区域伤害
function hurt(m, amount, atk, src, opt = {}) {
  if (m.dead || !(amount > 0) || m.hitOnly) return 0;   // 同时挡掉 NaN；小偷的生命只按挨打次数算
  if (HELD) { HELD.push(() => hurt(m, amount, atk, src, opt)); return 0; }   // 出手时的技能伤害：等弹道命中再算（holdHits）
  if (m.magicImmune && atk === 'magic') return 0;          // 魔法免疫（ACm3）：魔法攻击打不动
  if (m.invulUntil > G.t) return 0;                         // 龙的神圣护甲
  if (atk === 'magic' && m.ams > 0 && m.amsUntil > G.t) { const a = Math.min(m.ams, amount); m.ams -= a; amount -= a; if (!(amount > 0)) return 0; }   // 反魔法外壳
  if (atk === 'magic' && m.etherealUntil > G.t) amount *= 1.66;   // 放逐（虚无）：魔法伤害 +66%
  let dmg = amount * typeMult(atk, m);
  if (!opt.ignoreArmor && !(m.ignoreArmorUntil > G.t)) dmg *= armorMult(effArmor(m));   // 灵魂锁链：目标护甲被无视
  if (opt.noKill) dmg = Math.min(dmg, Math.max(0, m.hp - 1));   // 烧不死的（炎魔塔的烈焰燃烧）
  m.hp -= dmg;
  const owner = src && src.cat === 'summon' && src.owner && !src.owner.isHero ? src.owner : src;   // 冰雹狮鹫等召唤物的伤害算在塔上
  if (owner) owner.dealt = (owner.dealt || 0) + dmg;
  if (m.hp <= 0) kill(m, src);
  return dmg;
}
function kill(m, src) {
  if (m.dead) return;
  m.dead = true; m.hp = 0;
  if (m.spirit) return spiritDied(m, src);            // 圣灵塔的圣灵：不算击杀、没有赏金和掉落
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
    } else if (owner.fam && G.towers.includes(owner)) towerKilled(owner, m, src);  // 塔的魔法值（功勋）；src 是实际杀死它的单位（塔或召唤物）
    achKill(src);
  }
  if (G.endless && !m.neutral) G.endless.score += G.endless.nm + 4;   // 原图 zi：无尽里每杀一只怪 Ds + (NM + 4)
  if (m.elite) {
    preciseKill(m, src);
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
  monsterDied(m, src);
  if (!m.neutral) monsterDrop(m);
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
  const hpMul = (opt.noWaveHp ? 1 : 1 + RULE.hpPerWave * (G.knWave ?? G.wave)) * G.hpScale * (opt.hpMul || 1);   // 无尽怪物不吃 Rhar，生命按无尽科技（hpMul）；Rhar 也是 R6 设的，-KN 后停在当时的波数
  const m = {
    id: G.nextId++, uid: id, name: u.name, x: x + rnd(-150, 150), y: y + rnd(-150, 150),
    maxHp: u.hp * hpMul, hp: u.hp * hpMul, armor: u.armor, type: u.armorType, speed: (u.speed || 250) + (opt.speedPlus || 0),
    bounty: u.bounty, regen: u.regen || 0, path: path.slice(1), prev: null, cur: path[0], lane: rnd(-0.75, 0.75),
    slow: 0, slowUntil: 0, stunUntil: 0, shred: 0, shredUntil: 0, armorDown: 0, armorDownUntil: 0,
    auraFocus: 0, auraArmorDown: 0, auraSlow: 0, auraSpeed: 0, auraRegen: 0, burn: null, dots: [],
    deb: {}, ignoreArmorUntil: 0, frozenUntil: 0, expel: null,       // deb：限时减甲 / 加速（{ v, until }）；expel：被驱逐（遣返用）
    boss: !!opt.boss, r: opt.boss ? 90 : 55, elite: null, gate: opt.gate || 0, at: opt.at || 0,
  };
  if (opt.mdx) Object.assign(m, { mdx: opt.mdx, scale: opt.scale });
  if (u.pas) { m.pas = u.pas; if (u.pas.mi) m.magicImmune = true; }   // 被动：闪避 / 魔法免疫 / 硬化皮肤（tools/add_monster_extra.py）
  m.auras = monsterAuras(m);   // 原版包里没有模型的怪物，借用相近的模型（无尽的精灵用小精灵）
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
  sendHome(m);
  m.expel = null;
  return true;
}
// 把怪传回 1 号出怪口重新走（遣返、图腾的遣返都用这个）
function sendHome(m) {
  FXS.ring(m.x, m.y, 140, '#9fe3ff', 0.45, 4);
  const g = GATES[0], [x, y] = NODES[g[0]];
  Object.assign(m, { x: x + rnd(-150, 150), y: y + rnd(-150, 150), cur: g[0], prev: null, path: g.slice(1) });
  m.target = nextNode(m);
  FXS.ring(m.x, m.y, 140, '#9fe3ff', 0.45, 4);
}
// 怪走进路口时英雄的触发器（图腾：走进外环四边中点 Z / k / P / M 时可能被遣返）
const heroNode = m => { const h = G.hero, def = h && HERO_DEF[h.heroName]; return !!(def && def.onNode && def.onNode(h, m)); };
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
  if (G.t < m.stunUntil || !m.speed) return;                         // 速度 0 的（等死的骷髅、魔法书、酒瓶……）站着不动
  let spd = m.speed * (1 + m.auraSpeed + debuff(m, 'expelSpeed') + debuff(m, 'lustSpeed')) * (1 - Math.max(m.slow * (G.t < m.slowUntil ? 1 : 0), m.auraSlow)) * (1 - Math.min(0.95, m.heroSlow || 0));
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
    if (repatriate(m) || heroNode(m) || demonNode(m)) return;
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
const ONLY_ONE = new Set(['科技塔', '灵魂塔', '精灵塔']);
function buildBlock(fam) {
  const f = D.towers[fam], n = fn => G.towers.filter(t => mine(t) && fn(t)).length;
  // 弹跳塔不占主塔名额（原图要求的是 n01U，不是 ovln）：随机模式最多 3 座（Bbt），有弹跳塔 MAX 后不能再建（n01U 被删掉）
  if (fam === '弹跳塔') return G.towers.some(t => mine(t) && t.bmax) ? '拥有弹跳塔 MAX 后不能建造弹跳塔' : n(t => t.fam === fam) >= 3 ? '只允许建造 3 个弹跳塔' : null;
  if (f.cat === 'main' && G.towers.some(t => mine(t) && t.cat === 'main' && t.fam !== '弹跳塔')) return '只能建造一个主塔';
  if (f.cat === 'aura' && n(t => t.fam === fam) >= RULE.maxAuraPerKind) return '随机模式每种光环限制 2 个';
  if (f.cat === 'big' && n(t => t.cat === 'big' || t.cat === 'evo') >= 2) return '只能建造 2 个新辅助（大辅助）';
  if (f.cat === 'witch' && n(t => t.cat === 'witch') >= 1) return '只能建造 1 个巫系辅助';
  if (f.cat === 'uniq' && n(t => t.fam === fam) >= 1) return '全场唯一，只能建造一个';
  if (f.cat === 'god' && (G.godLock.has(fam) || G.towers.some(t => t.fam === fam))) return '神塔全场唯一：建造后全体不能再次建造，回收也不返还建造处（等下次随机建造）';
  if (ONLY_ONE.has(fam) && n(t => t.fam === fam) >= 1) return '只能建造一个';         // 科技塔 owtw、灵魂塔 otrb、精灵塔 obea
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
  if (t.cat === 'god') G.godLock.add(fam);
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
  achCombo();                             // 原图 rG：升级完成时检查组合成就
  if (t.fam === '暴击塔' && isMax(t)) for (let i = 0; i < 5; i++) {     // 原图 BCd：暴击塔升到 MAX 时，每个等级随机一座自己的混乱塔致命一击变成 2 级（25% 4.5 倍）
    const c = G.towers.filter(o => o.fam === '混乱塔' && o.lv === i && mine(o));
    if (c.length) pick(c).critLv = 2;
  }
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
    if (o.target.dead || (o.kind === 'use' && !itemTarget(o.target)) || (o.kind === 'pick' && !G.items.includes(o.target)) || (o.kind === 'talent' && !G.towers.includes(o.target))) { b.order = (b.queue && b.queue.shift()) || null; uiDirty(); return; }
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
    if (o.kind === 'talent') activateTalent(o.target);
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
// 守护神技（原图 A03W，守卫者自带的战争践踏）：900 范围敌人晕眩 3 秒，冷却 30 秒，10 魔法。原图按上月段位每 20 段 +1 级（最多 4 级、晕眩 6 秒），
// 这里没有平台段位，一直是 1 级；无尽关卡里和死亡之指一起被去掉（原图 zL）
const STOMP = { r: 900, stun: 3, cd: 30, mana: 10 };
const stompLeft = () => Math.max(0, (G.builder.stompAt || 0) - G.t);
function stompBlock() { return endlessLock() ? '无尽关卡里守卫者没有守护神技' : stompLeft() > 0 ? '守护神技冷却中' : G.builder.mana < STOMP.mana ? '魔法值不足' : null; }
function castStomp() {
  const b = G.builder, why = stompBlock();
  if (why) return msg(why);
  b.mana -= STOMP.mana; b.stompAt = G.t + STOMP.cd; b.spellT = G.t;
  stunArea(b, STOMP.r, STOMP.stun);
  FXS.nova(b.x, b.y, STOMP.r, '#d8b070', 0.6); FXS.dust(b.x, b.y, '#9a7a50', 24);
  uiDirty();
}
function fodBlock() { return endlessLock() ? '无尽关卡里守卫者没有死亡之指' : fodLeft() > 0 ? '死亡之指冷却中' : G.builder.mana < FOD.mana ? '魔法值不足' : null; }
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
  achCount('fod');
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
  const kit = KITS[t.fam];
  const dmg = lv.dmg + (t.fam === '弹跳塔' ? BOUNCE.atkStep * G.bounce.atk : 0) + (kit && kit.dmgPlus ? kit.dmgPlus(t) : 0);     // 弹跳提升攻击（R000）、天将的科技加的是基础攻击
  if (t.stats) { const x = t.stats(t); return { dmg: x.dmg ?? dmg, cd: (x.cd ?? lv.cd) / Math.min(AS_CAP, 1 + (x.as || 0)), range: lv.range, atk: lv.atk, targets }; }   // 英雄召唤物：攻击随英雄属性 / 科技变
  const w2 = kit && kit.weapon && kit.weapon(t);   // 用科技打开的第二武器（五行塔金·强化五行 R003、风行塔天赋 R006）
  if (w2) return { dmg: w2.dmg + (kit.dmgPlus ? kit.dmgPlus(t) : 0), cd: w2.cd, range: w2.range, atk: w2.atk, targets: 1, splash: w2.splash };
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
// 出手时就触发的技能（原图"单位被攻击"事件：天神塔的范围伤害、寒冰塔的冰雹……）：伤害、区域和特效先存起来，等主弹道命中再结算，
// 免得弹道还没飞到怪就死了。holdHits(fn) 跑 fn，返回结算函数（只跑一次）
let HELD = null;
for (const k of Object.keys(FXS)) if (!['launch', 'update', 'draw', 'clear', 'count'].includes(k)) { const f = FXS[k]; FXS[k] = (...a) => HELD ? HELD.push(() => f(...a)) : f(...a); }
function holdHits(fn) {
  const prev = HELD, q = HELD = [];
  try { fn(); } finally { HELD = prev; }
  let done = false;
  return () => { if (done) return; done = true; for (const f of q) f(); };
}
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
  const kit = KITS[t.fam], tech = (t.fam === '弹跳塔' ? BOUNCE.asStep * G.bounce.as : 0) + (kit && kit.asPlus ? kit.asPlus(t) : 0) + (t.talentAS || 0);   // 玩家科技的攻速（弹跳 R001、天将 R00K）；天赋加的攻速物品（AIas）
  const own = ownAS(t), add = Math.max(t.buffAS, t.selfAS || 0) + Math.max(bv(t, 'bloodlust'), t.selfAS2 || 0) + bv(t, 'fire') + tech - bv(t, 'strat');
  return Math.min(AS_CAP, own + add) / Math.min(AS_CAP, own) * (1 - Math.min(0.8, Math.max(t.eliteAS, bv(t, 'slowAS'))));   // 减攻速光环、狗头巫师的减速、沉默魔法 4 级（WC3 攻速最多减 80%）
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
  if (t.noAttack || t.unarmed || bv(t, 'silence')) { t.cdLeft = 0; return; }     // 沉默魔法：不能攻击；unarmed：被抓的怪没有打开攻击（beastAtk）
  const target = lockTarget(t, st.range);
  if (!target) { t.cdLeft = 0; return; }
  if (target.onAttacked) target.onAttacked(t);            // 原图"单位被攻击"事件：小精灵疾风步、小偷掉东西
  monsterAttacked(target, t);                             // BOSS 被攻击时的触发器
  t.cdLeft += st.cd;
  t.attacks++; t.atkT = G.t;
  const pre = holdHits(() => {     // 别的塔攻击时触发的伤害，也等这次攻击的弹道命中再结算
    if (G.hero && HERO_DEF[G.hero.heroName].anyAttack) HERO_DEF[G.hero.heroName].anyAttack(G.hero, t, target);   // 坦克的能量
    for (const o of G.towers) { const k = KITS[o.fam]; if (k && k.anyAttack) k.anyAttack(o, t, target); }      // 别的塔攻击时触发的（原始指挥官的宁静）
  });
  if (t.isHero) return heroAttack(t, target, st, pre);
  attack(t, target, st, pre);
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
function attack(t, target, st, pre = () => {}) {
  const lv = curLevel(t), kit = KITS[t.fam];
  let dmg = st.dmg * t.atkMul;
  // 致命一击（剑圣塔的致命一击由它的技能包按成长模式处理）
  const crit = !(kit && kit.ownCrit) && abilOf(t, lv, 'AOcr');
  if (crit && Math.random() * 100 < (crit.A || 25)) { dmg *= crit.B || 3; addFx({ kind: 'text', x: target.x, y: target.y, text: '暴击', life: 0.6, color: '#ffd257' }); }
  // 英雄的召唤物：马甲只跑触发器（silent）；致命一击；出手时的触发器
  if (t.silent) { shot(t, target); pre(); return t.onLaunch(t, target); }
  const sc = t.crit && t.crit();
  if (sc && Math.random() < sc[0]) { dmg *= sc[1]; popText(target.x, target.y, sc[1] + '倍', '#ffd257'); }
  // 出手时的触发器（召唤物的 onLaunch、技能包的 attack）里的伤害等主弹道命中再结算
  const f0 = holdHits(() => { if (t.onLaunch) t.onLaunch(t, target); });
  let flush = () => { pre(); f0(); };
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
  if (kit && kit.attack) {
    let r; const f1 = flush, f2 = holdHits(() => { r = kit.attack(t, target, st, a); });
    flush = () => { f1(); f2(); };
    if (r === false) return flush();
  }
  dmg = a.dmg; targets = a.targets;
  if (!targets.includes(target)) flush();          // 技能包换掉了目标，没有主弹道就当场结算
  const style = missileOf(t), from = muzzle(t, style);
  shot(t, target);
  // 主目标命中后的范围效果（目标在飞行途中死了，就以落点为中心）
  const area = (hit, x, y) => {
    const c = hit || { x, y };
    if (t.fam === '牛头塔') splash(t, c, (abil(lv, 'Aroc') || {}).area || 500, dmg, st.atk);     // 粉碎（分裂）A0A9：500 范围
    if (t.fam === '群攻塔') { splash(t, c, 300, dmg, st.atk); stunArea(c, 300, t.talent ? 0.15 : 0.1); }
    primalMaxHit(t, c, st);
    const sp = st.splash ?? lv.splash;
    if (sp) splash(t, c, sp, dmg, st.atk);
    if (lv.splashH && st.splash == null) for (const m of inRange(c.x, c.y, lv.splashH)) if (m !== c && dist2(c.x, c.y, m.x, m.y) > lv.splash ** 2) hurt(m, dmg * lv.splashF, st.atk, t);   // 外圈按 Hfact 伤害
  };
  const land = (m, primary) => (hit, x, y) => {
    if (hit) { const d = attackDmg(t, hit, dmg); if (d > 0) { hurt(hit, d, st.atk, t); onHitEffects(t, lv, hit, st); frozenBurst(hit); if (t.onHit) t.onHit(t, hit); } }
    if (primary) { area(hit, x, y); flush(); SFX.ent(sndKey(t), 'hit', { x, y }); }
  };
  SFX.ent(sndKey(t), 'launch', { x: t.x, y: t.y });
  if (t.fam === '弹跳塔' || t.fam === '通灵塔' || lv.bounce) {     // 依次弹到下一个目标
    const hop = (i, src) => { if (i >= targets.length) return;
      FXS.launch(style, src, targets[i], (hit, x, y) => { land(targets[i], i === 0)(hit, x, y); hop(i + 1, { x, y, z: 50 }); }, w3opt(t)); };
    return hop(0, from);
  }
  for (const m of targets) FXS.launch(style, from, m, land(m, m === target), w3opt(t));
}
// 原始塔 MAX 的附加伤害（原图 Baa / Bab，攻击力 = 塔的基础攻击）。条件是"(天赋 且 牛头塔 MAX) 或 群攻塔 MAX 或 闪电塔 MAX 或 箭塔 MAX"——
// 优先级写错了，群攻 / 闪电 / 箭塔 MAX 不要天赋就有（说明里写成天赋效果），只有牛头塔要天赋（照搬）
function primalMaxHit(t, c, st) {
  if (t.cat !== 'raw' || !isMax(t)) return;
  const d = st.dmg;
  if (t.fam === '牛头塔' && t.talent) aoeAt(t, t.x, t.y, 500, d * 0.2, 'chaos', { ignoreArmor: true });
  if (t.fam === '闪电塔') aoeAt(t, c.x, c.y, 100, d * 0.2, 'magic', { ignoreArmor: true });
  if (t.fam === '群攻塔') aoeAt(t, c.x, c.y, 300, d / 5, 'normal', { ignoreArmor: true });
  if (t.fam === '箭塔' && t.attacks % 4 === 0) aoeAt(t, t.x, t.y, 800, d * 0.4, 'pierce', { ignoreArmor: true });   // 箭射到 4 级的那一下
}
// 自带的重击由技能包处理的塔（群攻塔的范围重击、巨箭塔的双刃箭、巫师塔（暗黑）的范围晕眩、缓速塔天赋的魔法攻击）
const OWN_BASH = new Set(['群攻塔', '巨箭塔', '巫师塔（暗黑）', '缓速塔']);
function onHitEffects(t, lv, m, st) {
  const bash = abilOf(t, lv, 'AHbh');
  if (bash && !OWN_BASH.has(t.fam) && Math.random() * 100 < (bash.A || 0)) {
    if (bash.C) hurt(m, bash.C, st.atk, t);
    stun(m, bash.dur || 1);
  }
  const corr = abil(lv, 'AIcb');
  if (corr) { m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, corr.B || 10); m.shredUntil = G.t + (corr.dur || 5); }
  const sl = abil(lv, 'Aven');
  if (sl) slowM(m, sl.B || 0.2, sl.dur || 5);
  // 慢性毒药 Aspo：每秒 A 点伤害、移速降低 C，持续 Dur（20 秒）；同一种毒不叠加，新的覆盖旧的
  const po = abilOf(t, lv, 'Aspo');
  if (po) {
    m.dots = m.dots.filter(d => d.kind !== 'poison');
    m.dots.push({ kind: 'poison', dps: po.A || 10, until: G.t + (po.dur || 20), atk: st.atk, src: t });
    slowM(m, po.C ?? po.B ?? 0.2, po.dur || 20);
  }
  if (t.fam === '闪电塔' && m.uid !== 'Udea' && rint(1, 100) === 4) hurt(m, [10000, 30000, 60000, 100000][t.lv], 'magic', t);   // 闪杀（原图 z2，魔王除外）；晕眩是技能本身（AHbh）
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
// 射线之外，武器本身每次攻击（间隔 0.2 秒，吃攻速）走一次原图的攻击触发器（BBn 一带）：+0.06 魔法、放炮和巨魔蝙蝠、天赋的穿透火箭（扫射塔技能包的 attack）
// 改变技能旋转方向 A00K（14 级，点一次 +1，14 级再点回 1 级）：1 级逆时针转（原图角度每次 +30°，说明写的"顺时针"）、2 级反过来转；
// 3~14 级定向：射线在 c±30° 里来回扫（c = 30°、60°…360°，即 ↗ ↗ ↑ ↖ ↖ ← ↙ ↙ ↓ ↘ ↘ →），炮不再打攻击目标，改打塔边 c 方向 500 距离的点。
// 每次攻击加的魔法：1~2 级 +0.06、定向 +0.04（原图 BBn）
const SWEEP_MUL = [1, 2, 3, 4, 5, 6, 10];
const SWEEP_DIR = ['⊙', '⊙', '↗', '↗', '↑', '↖', '↖', '←', '↙', '↙', '↓', '↘', '↘', '→'];
const sweepDir = lv => (lv - 2) * Math.PI / 6;
const sweepDirTxt = lv => lv === 1 ? '360° 逆时针旋转' : lv === 2 ? '360° 顺时针旋转' : `定向 ${SWEEP_DIR[lv - 1]}（${(lv - 2) * 30}°）`;
function sweepUpdate(t, dt, st) {
  const lv = curLevel(t), arrow = abil(lv, 'AUcs'), k = t.sw ? t.sw.k : 1;
  const asMul = towerAS(t), step = dt * 2.2 * asMul, dir = t.sw ? t.sw.dir : 1;
  if (dir === 1) t.angle = (t.angle + step) % TAU;
  else if (dir === 2) t.angle = ((t.angle - step) % TAU + TAU) % TAU;
  else {   // 定向（A00K 3~14 级）：原图每次攻击 -30°，到 c-30° 以下跳回 c+30°（c = (等级-2)×30°）
    const c = sweepDir(dir), d = Math.PI / 6;
    t.angle -= step;
    const rel = ((t.angle - c) % TAU + TAU + Math.PI) % TAU - Math.PI;
    if (rel < -d) t.angle = c + d;
  }
  if ((t.swAtk = (t.swAtk || 0) - dt * asMul) <= 0) {
    const target = lockTarget(t, st.range);
    if (target && !bv(t, 'silence')) { t.swAtk += st.cd; t.attacks++; t.atkT = G.t; monsterAttacked(target, t); KITS.扫射塔.attack(t, target); } else t.swAtk = 0;
  }
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
const SWEEP = {   // 扫射塔的炮 A08E / 巨魔蝙蝠 A07H（下标 = 技能等级 - 1，1 级是没学）
  cannonCd: [2, 1.8, 1.6, 1.4, 1.2, 1, 0.8, 0.6, 0.4], cannonSlow: [0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.5],
  bat: [[0, 1], [200, 0.5], [500, 0.4], [1000, 0.35], [2000, 0.3], [4500, 0.25], [13000, 0.2], [40000, 0.15], [40000, 0.15]],   // 树魔猎手 nftt / n018 / n012 / n013 / n02M / n02N / n017 的攻击、间隔
};
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
  cleave: { dmg: 2000, cd: 0.8, range: 700, atk: 'normal', splash: 150 },   // 天赋分裂：h02V 的武器 2（dmgplus2 1999 + 1d1）
  as: [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2],                  // 致速 A03D（等级 = 风暴之魂，不和萨满嗜血叠加）
};
const WIND = {   // 风行塔（技能 1~10 级，各级数值取技能表；表里没有的取说明）
  names: ['暴力箭', '疯狂箭', '削甲箭'],
  fury: [2, 2.2, 2.4, 2.6, 2.8, 3, 3.5, 4.2, 5.5, 7], furyDur: [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7], furyCd: 8,   // 暴力箭 A0EU → 马甲放心灵之火 A0ES：攻击 +A
  shred: [10, 150, 300, 600, 900, 1200, 1600, 2400, 3600, 5500], shredCd: [14, 13, 13, 12, 11, 11, 10, 8, 5, 3],    // 削甲箭 A0ET（扇形飞刀）：1000 范围魔法伤害
  howl: [30, 45, 60, 75, 90, 105, 120, 135, 150, 165], howlDur: 4,                                                  // → 马甲放惊恐术 A0EX：1000 范围护甲 -B
  mad: [200, 500, 1800, 3000, 5000, 8000, 14000, 20000, 26000, 40000],                                              // 疯狂箭：FX箭 n03Z 的重击 A0EW 附加伤害
  madAS: [0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3, 3.5],                                                         //        FX箭对风行塔放的火速 A0EY：攻速 +D，3 秒
  multi: [3, 3, 3, 4, 5, 6, 8, 10, 13, 50],                                                                          // 多重箭 A0ER 1~10 级的目标数（平时是 11 级：1 个）
};
const GEN = {   // 将军塔：6 个技能 1~5 级（6 级 = 关闭），召唤物数值取召唤单位的单位表
  names: ['卒', '炮', '马', '車', '象', '士'],
  up: [[120, 80], [90, 90], [170, 50], [150, 60], [230, 30], [250, 40]],      // 升级魔法 = a + b×等级（4→5 级另要 20 木材）
  cd: [[2, 2, 2, 2, 2], [5.5, 5.5, 5.5, 5.5, 5.5], [16, 14.5, 13, 11.5, 10], [12, 12, 12, 12, 12], [11, 10, 9, 8, 6], [6, 5.5, 5, 4.5, 4]],
  pawn: { dmg: [20, 300, 800, 3200, 9000], cd: [0.8, 0.76, 0.72, 0.62, 0.31], armor: [30, 60, 90, 150, 240] },   // 卒 nskm / n025~n028（削甲 A02R~A02U，8 秒）
  cannon: { dmg: [30, 270, 1200, 5000, 12000], cd: [0.4, 0.4, 0.4, 0.4, 0.2], range: [800, 800, 800, 800, 1000], dur: [2, 2.5, 3, 3.5, 4] },   // 炮：小型虚无行者 nvdl / n022~n024 / n021
  horse: { n: [6, 8, 10, 12, 14], dmg: [50, 300, 1000, 3200, 18000] },        // 马：马甲放惊吓 ANst（每秒 A 只，每只 150 范围 C 伤害，马甲活 5 秒）
  chariot: { dmg: [30, 250, 2000, 8000, 16000], cd: [0.5, 0.45, 0.4, 0.35, 0.2],   // 車 h04G / h04I / h04J / h04L / h04K：火箭弹打 600 范围所有敌人
    track: [100, 300, 3000, 15000, 45000], trackCd: [1.2, 1.1, 0.95, 0.75, 0.5], trackR: [1200, 1300, 1400, 1500, 1600] },   // 追踪弹 Apxf：无视护甲
  stomp: [200, 800, 3500, 15000, 50000],                                     // 象 A08I：800 范围魔法伤害 + 晕 2 秒；2 秒后马甲 A08P 再来 等级²×1000 混乱无视护甲 + 晕 1 秒
  sage: [70, 300, 2400, 12000, 32000],                                       // 士 nskf：每次攻击（0.3 秒）向目标放冲击波 A097：长 800 宽 125 魔法伤害
};
const WOLF = {   // 狂狼塔
  names: ['致命', '野性', '兽性', '噬性'],
  crit: [1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9.5, 11, 12.5, 14, 15.5, 17.5, 20, 23, 27, 32],   // KL致命 A0KY：15% 概率的倍数（1~20 级）
  pupCd: [36, 28, 20, 12],                     // 野性（狼崽 A0KZ）1~4 级冷却：召唤小狼崽 n06B 8 秒（攻击 50，射程 300，120 范围友军攻击 +100%）
  beastCd: [15, 14, 13, 12, 11, 10, 9, 8, 7], // 兽性 A0L1 1~9 级冷却：120 范围友军（含自己）攻速 +1000%（总和封顶 400%）2 秒，和火速不叠加
  powAtk: 40, powMax: 10, spdAS: 0.13, spdMax: 20, powGold: 4000,   // 狼族力量：科技狼力 R00R（攻击 +40）/ 狼速 R00S（攻速 +13%），对狂狼、小狼崽、疯狂之狼有效
  meritWood: 5, meritMax: 6,                   // KL 功勋：每级 5 木材，杀敌（没有升级技能时）得 1 + 0.2×(等级-1) 魔法
};
const LICH = {   // 巫妖塔献祭得到的巫系技能（各级数值取技能表；守卫 / 恐惧之眼 / 陷阱的效果和巫系塔一样）
  names: { ward: '治疗守卫', eye: '恐惧之眼', trap: '静止陷阱', dd: '死亡凋零' },
  from: { 巫医塔: 'ward', 巫魔塔: 'eye', 巫法塔: 'trap', 巫术塔: 'dd' },
  ward: [[200, 300, 12, 12], [300, 3000, 9, 9], [300, 3000, 4.5, 6]],                   // A0C1：范围、每秒魔法伤害、冷却、持续（1 级 ohwd，2 / 3 级 o001）
  eye: [[60, 4, 4], [100, 3, 3], [100, 3, 2]],                                         // A0C3：护甲 -v、持续、冷却（1 级 n00O，2 / 3 级 n02H）
  trap: [[150, 200, 1, 2, 4.5], [250, 300, 0.5, 3, 3.5], [300, 300, 0.5, 4, 3.5]],     // A01K：触发范围、晕眩范围、延迟、晕眩、冷却
  dd: [null, [250, 0.04, 10], [300, 0.07, 10], [350, 0.1, 8]],                         // A0CH 2~4 级：范围、每秒消耗最大生命比例、冷却
  fp: { ward: [3, 'magic'], eye: [2, 'chaos'], trap: [1, 'pierce'], dd: [1.6, 'pierce'] },   // 放技能时 400 范围 巫术伤害 FP×倍数（KC+4 % 概率 ×8）
  techAtk: 30, techMax: 5,                                                             // 巫妖之力 R01R：攻击 +30（最多 5 级）
};
const BEAST = {   // 兽王塔
  skills: ['咆哮', '火焰雨', '战争践踏', '雷霆一击', '死亡凋零', '腐臭蜂群', '加强天赋', '暴风雪', '闪电链', '霜冻新星', '静止陷阱', '腐蚀', '重击', '致命一击', '风暴之锤', '点金术', '醉酒云雾', '火焰吐息'],   // 驯化时随机 1~18（BIT 的 IP）
  idle: new Set(['咆哮', '火焰雨', '战争践踏', '雷霆一击']),   // 每秒放的（不用目标）；其他的随从攻击时对目标放
  trainGold: 5000, trainAtk: 700, trainMax: 20, upWood: 14, eliteGold: 10000, eliteMana: 400, tameCd: 7, tameMana: 10, tameMore: 70,
};
// 训兽 a / b / c（原图 Lw，按玩家一次：猎人塔第一次捕猎 BW7、兽王第一次驯化 BIT、伏魔第一次驯化 BIm 时打开）。
// 怪物的武器默认是关着的（weapsOn 空），训兽 c（R01F）打开一大批怪的攻击 1；a1~a5 / b1~b5 五组怪各随机打开攻击 1（a）或攻击 2（b）。
// 两样都没有的怪（飞蛇、苦工、僵尸、狼骑士等）被抓 / 驯化后不会攻击，照搬；打开时训兽 R00Z 被设回 1 级（之前在兽王买的训兽等级会丢），也照搬
function beastUnlock() {
  const P = G.beast; if (P.wpn) return;
  P.tech = 1; P.wpn = [0, 0, 0, 0, 0].map(() => rint(1, 2) === 1 ? 'a' : 'b');
}
function beastAtk(uid) {   // 被抓 / 驯化的怪用的攻击；null = 不会攻击
  const u = D.units[uid] || {}, tw = u.tw, w = G.beast.wpn;
  if (tw === 'c') return u.atk || null;
  if (!tw || !w) return null;
  return w[tw[0] - 1] === 'b' ? (tw[2] && u.atk2) || null : (tw[1] && u.atk) || null;
}
const BEAST_NOATK = { dmg: 0, cd: 1.5, range: 100, type: 'normal', splash: 0 };
const beastWpnTxt = () => G.beast.wpn ? '训兽 a/b：' + G.beast.wpn.map((c, i) => `${c}${i + 1}`).join(' ') : '训兽 a/b/c 还没打开（第一次驯化 / 捕猎时打开）';
const WX = {   // 五行塔：五行（金 / 木 / 水 / 火 / 土）各有两种激活方式（吞噬 1 级光环塔或自己），1~10 级（MAX 塔才能升到 9、10 级）
  names: ['金', '木', '水', '火', '土'],
  opts: [   // [技能, 吞噬的单位, 名字]
    [['goldAura', '攻击光环', '攻击光环·金'], ['goldSelf', '五行塔', '强化五行·金']],
    [['woodSelf', '五行塔', '强化五行·木'], ['woodAura', '减速光环', '减速光环·木']],
    [['waterSlow', '减速光环', '减速光环·水'], ['waterAS', '加速光环', '速度光环·水']],
    [['fireAS', '加速光环', '速度光环·火'], ['fireArmor', '减防光环', '减防光环·火']],
    [['earthArmor', '减防光环', '减防光环·土'], ['earthAtk', '攻击光环', '攻击光环·土']],
  ],
  goldAura: [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2],                       // A0DT：900 范围攻击 +A，攻击弹射 7 个（R005）
  woodAura: [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6],                // A0DS：900 范围减速；10+2×等级 % 概率 250 范围 等级²×300 普通伤害
  waterSlow: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1],                 // A0DY：900 范围减速；水五行 h055~h058
  waterAS: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75],                // A0DW：900 范围攻速；水五行 h051~h054
  fireArmor: [20, 25, 30, 35, 40, 45, 60, 75, 90, 120],                             // A0DX：900 范围减甲；每 16 次攻击狱火雨 800 范围 等级²×350（无视护甲）
  fireAS: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.35, 1.5],                  // A0DV：900 范围攻速；每 24 次攻击狱火雨 800 范围 等级²×900
  earthArmor: [15, 30, 45, 60, 75, 90, 110, 130, 150, 200],                         // A0DU：900 范围减甲；每 2.5 秒一次攻击时 200 范围 等级²×80 + 禁锢 1 秒
  earthAtk: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.3],                       // A0DZ：900 范围攻击；同上 等级²×120
  water: { slow: [[80, 0.4], [700, 0.35], [6000, 0.25], [14000, 0.15]], as: [[60, 0.65], [380, 0.65], [1240, 0.65], [9000, 0.4]] },   // 水五行（按 1~3 / 4~6 / 7~9 / 10 级）：攻击、间隔，活 2 秒，每 6 秒最多一个
  mana: [1, 1.5, 2, 2.5],                                                            // 五行塔 1~MAX 级杀敌得魔法（JU）
};
const PFAM = {   // 熊猫家族（小熊猫塔（土）/（火）/（风）、熊猫大哥、熊猫小弟）
  stomp: [500, 1000, 2000, 3000, 4000, 5000], stompCd: [9, 7, 5, 4.5, 4, 3.5],      // 熊猫践踏 A0GL：500 范围伤害 + 晕 2 秒（大哥的 A0GV 同等级，冷却 2 秒）
  roar: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7], roarCd: [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5],   // 咆哮（火）A0GN 1~8 级
  techAtk: 360, techAS: 0.3,                                                          // 家族大师：科技 R007 / R008（等级 = 家族大师 - 1）
  big: { dmg: 4500, cd: 0.28, range: 400, splash: 200, life: 120, breathCd: 30 },    // 熊猫大哥 n054；火焰呼吸 A0DQ：400 范围 (21 - 名次)×2000 + (火焰强化-1)×2000 混乱无视护甲
  small: { dmg: 100, cd: 0.7, range: 250, splash: 150, life: 60 },                   // 熊猫小弟 n068
};
const CMDR = {   // 原始指挥官
  types: ['恐惧 + 雷霆一击', '雷霆一击 + 加速', '加速 + 恐惧'],
  armor: [100, 240], slow: [0.6, 1], slowDur: [1.5, 5], haste: [1.2, 2],     // 宁静马甲 h06N：恐惧 A0OQ（1000 范围护甲 -B 1.5 秒）、雷霆一击 A0OP（减速）、加速 A0OO（友军攻速 +D 1.5 秒）
  cd: 21, life: 3.4,
  ys: [   // 强化原始塔（8 木材 + 魔法，最高 4 级）：宁静范围内的 MAX 原始塔攻击时触发，伤害都乘 MAX 原始塔数量
    { fam: '通灵塔', name: '通灵', mana: 140, tip: '4% 概率目标 300 范围 等级×1500 普通无视护甲' },
    { fam: '闪电塔', name: '闪电', mana: 120, tip: '1% 概率目标 60 范围 等级×8000 魔法无视护甲' },
    { fam: '混乱塔', name: '混乱', mana: 180, tip: '每次攻击目标 200 范围 等级×600 混乱' },
    { fam: '破坏塔', name: '破坏', mana: 100, tip: '9% 概率目标 50 范围 等级×15000 魔法' },
    { fam: '箭塔', name: '箭塔', mana: 160, tip: '等级×15% 概率塔周围 800 范围 600 穿刺无视护甲' },
    { fam: '牛头塔', name: '牛头', mana: 200, tip: '25% 概率塔周围 500 范围 等级×1000 混乱无视护甲' },
  ],
};
const CENT = {   // 人马塔
  thunderCd: [4, 3.7, 3.4, 3.1, 2.8, 2.5, 2.2, 1.9, 1.5, 1.1, 0.7, 0.2],   // 雷霆 A0B8 1~11 级冷却，12 级是天赋狂暴
  breakDur: 4, breakCd: 40,                                                 // 毁灭 A0UI：4 秒内每次雷霆都爆雷、雷踏 3 倍，冷却 40 秒（回收不影响冷却）
};
const TJ = {    // 天将塔：卒1 / 炮2 / 马3 / 車4 / 象5 1~5 级（6 级 = 关闭），士6 是提升科技的按钮
  names: ['卒', '炮', '马', '車', '象'],
  up: [[120, 80], [90, 90], [170, 50], [150, 60], [230, 30]],               // 升级魔法 = a + b×等级（每次攻击时判断，最高 5 级）
  cd: [[8, 7, 6, 5, 4], [8, 7, 6, 5, 4], [15, 14, 13, 12, 10], [10, 8.5, 7, 5.5, 4], [8, 7.7, 7.4, 7.1, 6.8]],
  soldier: { dmg: [40, 240, 1000, 2000, 6000], cd: [0.6, 0.6, 0.6, 0.5, 0.3] },   // 卒：天兵 n05S / n05R / n05T / n05U / n05V（120 范围溅射，会走，12 秒）
  cannon: [30, 100, 600, 3500, 9000],                                       // 炮：巨炮 n05W / n05Z / n060 / n061 / n062（穿刺 120 溅射，间隔 0.8，射程 1000，6 秒）
  ship: [500, 2000, 6000, 15000, 35000],                                    // 马：马甲放惊吓 A0JA（每秒 1 艘战舰，300 范围魔法伤害，马甲活 5 秒）
  stomp: [20, 200, 600, 1200, 2400],                                        // 象：疯象 n05X（4.1 秒），每次攻击（0.2 秒）践踏 A0J8：300 范围魔法伤害 + 晕 0.25 秒
  techAtk: 80, techAS: 0.15, techMax: 50, techGold: 2000, techMana: 20,    // 士6（A0J1）：科技 R00J 攻击 +80 / R00K 攻速 +15%，对天将和天兵 / 巨炮 / 雷车都有效
};

// 冰封塔冻住的敌人被攻击时，范围 500 无视护甲伤害（每 0.2 秒最多一次）
function frozenBurst(m) {
  const by = m.frozenBy;
  if (!(m.frozenUntil > G.t) || !by || !G.towers.includes(by) || G.t - (m.frozenProc || 0) < 0.2) return;
  m.frozenProc = G.t;
  aoeAt(by, m.x, m.y, 200, m.frozenDmg || 500, 'hero', { ignoreArmor: true });
  FXS.ring(m.x, m.y, 200, '#bff4ff', 0.25, 3);
}
// 区域效果（落地的漩涡、陷阱、守卫、恐惧之眼）：每帧对范围内的怪调用 each(m, dt)，tick(z, dt) 处理自己的逻辑
function field(owner, x, y, r, dur, o) { G.zones.push({ owner, x, y, r, t0: G.t, until: G.t + dur, dps: 0, fxT: 0, ...o }); }

// ---------------------------------------------------------------- 另类塔给别的塔的加成（按玩家算，回收后归零）
const ownTower = (pid, fam) => G.towers.find(o => o.fam === fam && o.cat !== 'summon' && pidOf(o) === pid);
const techLv = t => { const o = ownTower(pidOf(t), '科技塔'); return o ? o.lv + 1 : 0; };                     // 原图 C1 = C2：科技塔等级
const stoneLv = (t, k) => { const o = ownTower(pidOf(t), '魔石塔'); return o && o.ms.sel === k ? o.lv + 1 : 0; };   // 魔石塔 1 DZ 剑圣 / 2 DY 天神 / 3 Da 炎魔 / 4 Db 灵魂
const STONE_FOR = ['剑圣塔', '天神塔', '炎魔塔', '灵魂塔'];
const ABYSS_SUP = { 腐蚀塔: 'pierce', 重击塔: 'chaos', 冰霜塔: 'magic', 暴击塔: 'normal' };     // 深渊塔给辅助塔的附加伤害类型
const ABYSS_LORD = [{ name: '深渊领主', dmg: 19999, cd: 0.23, range: 200, speed: 522, mdx: 'units/demon/heropitlord/heropitlord.mdx', scale: 1 },
  { name: '深渊霸主', dmg: 24999, cd: 0.2, range: 300, speed: 522, mdx: 'units/undead/herodeathknight/herodeathknight.mdx', scale: 1.8 },
  { name: '深渊魔主', dmg: 24999, cd: 0.25, range: 600, speed: 200, mdx: 'units/creeps/revenant/revenant.mdx', scale: 1.8 }];   // n06L / n077 / n099
const BURN_OIL = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 3300, 7300];                       // 燃烧塔 MAX 的燃烧之油 A02V 1~11 级（每 0.2 秒）
const YANMO = { burn: [20, 50, 120, 250, 500, 900, 1500, 2500, 4000, 6000],                         // 炎魔塔马甲的火焰燃烧 A06I…A06O（每秒）
  rainB: [10, 20, 50, 120, 250, 500, 900, 1500, 2500, 4000], rainE: [20, 50, 120, 250, 500, 900, 1500, 2500, 4000, 6000] };   // 火焰雨 A07V
const KITS = {
  // ---------------------------------------------------------------- 主塔
  // 魔幻塔：三种成长（切换成长类型 A051）。当前成长的技能吃魔法自动升级：雷霆闪电 100+20×等级、穿刺之镖 150+10×等级、混乱流星 180；
  // 不是当前成长的技能不生效，到 5 级后一直生效。杀一个敌人得 1+0.2×功勋 点魔法（2功勋 A05G）
  // 天赋（MAX，30 木材）：急速 10 级（混乱流星 10 级）→ 急速流星：攻速 +300%，流星每击 150000、晕 1.5 秒；否则强攻 10 级（穿刺之镖 10 级）→ 强攻 MAX：攻击 +800%；
  // 都不是 → 雷电风暴：雷霆闪电每秒多充能 4 点（原图 Dx = 4），星落按 11 级（每道 40000）
  魔幻塔: {
    talent: { wood: 30, name: '急速流星 / 强攻MAX / 雷电风暴', max: true, tip: '急速 10 级 → 急速流星（攻速 +300%，流星 150000）；否则强攻 10 级 → 强攻 MAX（攻击 +800%）；否则雷电风暴（雷霆闪电充能 +4/秒、每道 40000）',
      use(t) { const l = t.mg.lv; if (l[2] === 10) { t.mg.up = 'haste'; return '急速流星'; } if (l[1] === 10) { t.mg.up = 'power'; return '强攻MAX'; } t.mg.up = 'storm'; return '雷电风暴'; } },
    init(t, mem) { t.maxMana = 500; t.mana = mem ? mem.mana : 0; t.mg = { mode: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], dh: 0, meteors: [] }; t.merit = 1; },
    on: (t, i) => t.mg.mode === i + 1 || t.mg.lv[i] >= 5,
    self(t) { const k = KITS.魔幻塔, l = t.mg.lv, up = t.mg.up; return { atk: k.on(t, 1) ? (up === 'power' ? 8 : MAGIC.power[l[1] - 1]) : 0, as: k.on(t, 2) ? (up === 'haste' ? 3 : MAGIC.haste[l[2] - 1]) : 0 }; },
    tick(t, dt) {
      t.mg.dh += (MAGIC.charge[t.lv] + (t.mg.up === 'storm' ? 4 : 0)) * dt;
      // 流星陨落（nano）：活 4 秒，每 0.4 秒打一次 900 范围内的敌人；MAX 魔幻塔时每击再加 150 范围 1~等级×1000 混乱伤害
      const l = t.mg.lv[2];
      for (const s of t.mg.meteors) {
        if (G.t < s.next) continue;
        s.next += 0.4;
        const m = nearest(s.x, s.y, 300) || nearest(t.x, t.y, 900);
        if (!m) continue;
        const mx = m.x, my = m.y;
        FXS.fall(mx, my, { z: 900, dx: -300, dy: 160, dur: 0.25, color: '#c48bff', core: '#ffe0ff', size: 18, rock: '#3a2050', onEnd: () => {
          if (!m.dead) { const h = t.mg.up === 'haste'; hurt(m, h ? 150000 : MAGIC.meteor[l - 1], 'chaos', t); stun(m, h ? 1.5 : 0.3); }
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
          for (const m of ms) hurt(m, g.up === 'storm' ? 40000 : MAGIC.bolt[lv - 1], 'magic', t);
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
        { ...meritCmd(t, 'W', m => m + 1, 10, m => (1 + 0.2 * m).toFixed(1)), ico: 'abil-A05G' },
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
  // 天赋（MAX，30 木材）：四种切换技能升到 6 级（冷却 0 秒），攻速 +80%（A059）
  神圣塔: {
    talent: { wood: 30, name: '切换技能CD0秒+攻速提升80%', max: true, use(t) { t.talentAS = 0.8; }, tip: '切换伤害类型没有冷却，攻击速度 +80%' },
    init(t, mem) { t.maxMana = 4000; t.mana = mem ? mem.mana : 0; t.holy = { type: 0, cont: 1 }; },
    attack(t, target) {
      const ty = HOLY.types[t.holy.type]; if (!ty) return;
      const r = HOLY.r[t.lv], d = KITS.神圣塔.dmg(t);
      aoeAt(t, target.x, target.y, r, d, ty);
      FXS.nova(target.x, target.y, r, ATK_COLOR[ty], 0.3);
      // 神圣塔 MAX 且有地精塔 MAX（原图 zt）：400 范围 魔法×(1+科技塔等级/32) 英雄伤害
      if (isMax(t) && G.towers.some(o => o.fam === '地精塔' && isMax(o) && pidOf(o) === pidOf(t))) aoeAt(t, target.x, target.y, 400, t.mana * (1 + techLv(t) / 32), 'hero');
    },
    dmg: t => HOLY.d[t.lv] + t.mana + techLv(t) * HOLY.d[t.lv] / 2,     // 科技塔每级 + 基础伤害的一半
    kill(t) { if (t.mana <= t.holy.cont * 200) addMana(t, HOLY.gain[t.lv]); },
    cmds(t) {
      const h = t.holy, cd = t.talent ? 0 : 90 - 5 * techLv(t), out = ['普通', '穿刺', '魔法', '混乱'].map((nm, i) => costCmd(t, 'QWER'[i], '切换' + nm, `神圣攻击改成 <b>${nm}</b> 伤害（每种切换冷却 ${cd} 秒）`, {},
        () => { h.type = i + 1; setCd(t, 'type' + i, cd); msg(`神圣塔：神圣攻击切换为${nm}伤害`); },
        { why: h.type === i + 1 ? '当前就是这种伤害' : cdReady(t, 'type' + i) ? null : '冷却中', o: { active: h.type === i + 1, cdOf: () => [cdLeft(t, 'type' + i), cd], atk: HOLY.types[i + 1] } }));
      out.push(costCmd(t, 'A', '魔法容器', `容器 ${h.cont} 级：魔法值不超过 <b>${h.cont * 200}</b> 时杀敌才得魔法；每级 +200<br>回收时返还容器的金币`,
        { gold: h.cont < 20 ? 3000 : 0 }, () => { h.cont++; }, { why: h.cont >= 20 ? '已经是最高等级' : null }));
      return out;
    },
    info(t) { const ty = t.holy.type; return [`神圣攻击：${ty ? ATK_CN[HOLY.types[ty]] + '，' + HOLY.r[t.lv] + ' 范围 ' + fmt(KITS.神圣塔.dmg(t)) : '<b style="color:#ffb347">还没选伤害类型（按 Q W E R 选）</b>'}`,
      `魔法容器 ${t.holy.cont} 级（上限 ${t.holy.cont * 200}），杀敌 +${HOLY.gain[t.lv]} 魔法`]; },
    sell(t) { G.gold += (t.holy.cont - 1) * 3000; G.mem.神圣塔 = { mana: Math.max(t.mana, G.mem.神圣塔 ? G.mem.神圣塔.mana : 0) }; },
  },
  // 寒冰塔：冰雹术 / 闪冰术 / 爆冰术。"选择升级技能"选中的那个每次攻击都放，魔法够了自动升级（160 / 7 级起 280 / 10→11 级 450 魔法 + 10000 金）；
  // 没选中的按 等级/7 的概率放。冰霜光环每次攻击升 1 级，升满 5 级放一次"关联技能"（冰封），然后回到关联等级（三个技能平均等级）
  // 天赋（MAX，30 木材）：随机 1/4 攻速 +80%、+70%、+60%、+50%。场上有邪冰时提示"邪冰和寒冰同时获得 50% 攻速"（原图 Gm，一局一次），
  // 但给的 A086 只是个没有数值的图标技能，实际没有加成（照搬）
  寒冰塔: {
    talent: { wood: 30, name: '增加攻击速度', max: true, tip: '随机攻击速度 +80% / +70% / +60% / +50%',
      use(t) {
        if (G.hero && G.hero.heroName === '邪冰' && !G.iceDuo) { G.iceDuo = true; msg('【场上存在[邪冰和寒冰]同时获得50%攻击速度加成】'); }
        t.talentAS = rint(1, 4) === 4 ? 0.8 : rint(1, 3) === 3 ? 0.7 : rint(1, 2) === 2 ? 0.6 : 0.5;
        return `增加${t.talentAS * 100}%攻击速度`;
      } },
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
          () => { c.sel = c.sel % 3 + 1; msg(`寒冰塔：选择升级${ICE.names[c.sel - 1]}`); uiDirty(); }, { ico: 'abil-A033' }),
        { ...meritCmd(t, 'W', m => m * 3 + 2, 6, m => (0.7 + 0.3 * m).toFixed(1)), ico: 'abil-A035' },
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
  // 天赋（MAX，30 木材）：Dy = 3~6（按玩家记，回收再建的天神塔也有），每级攻击上限 40×(10+Dy+…)，即上限 +30%~60%
  天神塔: {
    talent: { wood: 30, name: '攻击上限增加', max: true, use() { G.godDy = rint(3, 6); return `攻击上限增加${G.godDy}0%`; }, tip: '每级攻击上限随机 +30% ~ +60%' },
    init(t, mem) { t.maxMana = 30000; t.mana = mem ? mem.mana : 0; t.god = { pair: 1, cap: 1, power: 1, max: false }; },
    hi: t => Math.max(Math.floor(t.mana), godStep(t) * t.god.cap + curLevel(t).dmg),
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
        costCmd(t, 'W', '增加攻击上限', `等级 ${g.cap}/20：每级攻击上限 +${godStep(t)}${G.godDy || G.petFx.gq || stoneLv(t, 2) ? '（含天赋 / 宠物 / 魔石塔加成）' : ''}<br>10 级起每次还要 1000 魔法；回收返还每级 800 金`,
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
  // 天赋（MAX，30 木材，原图 Em 按玩家记、一局一次）分裂：科技 R01C 打开第二武器——攻击 2000、间隔 0.8 秒、150 范围溅射（剑圣塔 MAX 单位表的武器 2）
  剑圣塔: {
    ownCrit: true,
    weapon: t => G.swordCleave && isMax(t) ? SWORD.cleave : null,
    talent: { wood: 30, name: '分裂天赋', max: true, why: () => G.swordCleave, use() { G.swordCleave = true; }, tip: '牺牲攻击速度（间隔 0.3 → 0.8 秒），普通攻击对 150 范围敌人造成伤害（攻击 3000 → 2000）' },
    init(t, mem) { t.maxMana = 1000; t.mana = mem ? mem.mana : 0; t.bm = { mode: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], hits: 0 }; t.merit = 1; },
    on: (t, i) => t.bm.mode === i + 1 || t.bm.lv[i] >= 5,
    self(t) { const l = t.bm.lv; return { atk2: SWORD.atk[l[2] - 1], as2: SWORD.as[l[1] - 1] }; },
    attack(t, target, st, a) {
      const k = KITS.剑圣塔, l = t.bm.lv;
      const storms = G.zones.filter(z => z.owner === t && z.style === 'bladestorm').length, dz = stoneLv(t, 1);
      if (k.on(t, 0) && (storms <= 1 || (rint(1, 4) <= dz && storms <= 2))) {   // 剑刃之魂：目标处的剑刃风暴（魔石塔 DZ 多一次机会，原图 BBr）
        const armor = SWORD.bladeArmor[t.lv];
        zone(t, target.x, target.y, l[0] === 11 ? 350 : 250, 0.6, SWORD.blade[l[0] - 1], 'magic', null, 'bladestorm', { each: m => debuffM(m, 'blade', armor, 0.3) });
      }
      if (k.on(t, 1) && ++t.bm.hits >= 5 - techLv(t)) {    // 风暴之魂：每 5 次攻击（科技塔每级少 1 次），800 范围 150×等级² + DZ×等级×60 混乱伤害
        t.bm.hits = 0;
        aoeAt(t, t.x, t.y, 800, 150 * l[1] * l[1] + dz * l[1] * 60, 'chaos');
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
        `风暴之魂 ${l[1]} 级${on(1)}：每 ${5 - techLv(t)} 击 ${150 * l[1] * l[1] + stoneLv(t, 1) * l[1] * 60}，致速 +${pctTxt(SWORD.as[l[1] - 1])}`,
        `致命一击 ${l[2]} 级${on(2)}：15% ${SWORD.crit[l[2] - 1]} 倍，强攻 +${pctTxt(SWORD.atk[l[2] - 1])}`];
    },
    sell(t) { G.wood += meritSpent(t, () => 8); G.mem.剑圣塔 = { lv: t.bm.lv.slice(), mana: t.mana }; },
  },
  // 扫射塔：杀敌 +1 魔法，每次攻击 +0.06 魔法；强化（200 魔法）提升射线长度和伤害倍数，共 7 级。
  // 炮 A08E / 巨魔蝙蝠 A07H：1 级是没学（技能表 1 级的射程、召唤都是空的），用"升级炮击"A08F / "升级巨魔等级"A07D 升到 8 级（MAX），天赋到 9 级。
  // 炮：每次攻击冷却好了就对目标放：200 范围 100×塔等级×炮等级² 普通伤害，减速 8 秒（有地精塔 MAX 再加 100×炮等级² 英雄伤害），中了的敌人被巨魔蝙蝠打时多受一份混乱伤害（buff B00R）；
  // 巨魔蝙蝠：冷却 6 秒，在塔旁召唤一只树魔猎手 4 秒（9 级 7 秒）。炮 / 巨魔等级回收后再建会恢复（原图 D5 / D6）；
  // 改变技能旋转方向 A00K 见 sweepUpdate 上面的说明（回收后再建回到 1 级，原图只记魔法 D7）
  扫射塔: {
    init(t, mem) { t.maxMana = 1000; t.mana = mem ? mem.mana : 0; t.sw = { k: mem ? mem.k : 1, cannon: mem ? mem.cannon : 1, bat: mem ? mem.bat : 1, rocket: false, dir: 1 }; },
    kill(t) { addMana(t, 1 + 0.2 * techLv(t)); },     // 科技塔每级 +0.2（原图 C1）
    attack(t, target) {
      const w = t.sw, L = w.cannon, B = w.bat;
      addMana(t, w.dir >= 3 ? 0.04 : 0.06);
      if (L >= 2 && cdReady(t, 'cannon') && (w.dir >= 3 || dist2(t.x, t.y, target.x, target.y) <= 900 ** 2)) {
        setCd(t, 'cannon', SWEEP.cannonCd[L - 1]);
        const a = sweepDir(w.dir), x = w.dir >= 3 ? t.x + Math.cos(a) * 500 : target.x, y = w.dir >= 3 ? t.y + Math.sin(a) * 500 : target.y;
        FXS.launch('cannon', { x: t.x, y: t.y, z: 120 }, { x, y }, () => {
          for (const m of inRange(x, y, 200)) { hurt(m, 100 * (t.lv + 1) * L * L, 'normal', t); slowM(m, SWEEP.cannonSlow[L - 1], 8); m.cannonUntil = G.t + 8; }
          if (G.towers.some(o => o.fam === '地精塔' && isMax(o) && pidOf(o) === pidOf(t))) aoeAt(t, x, y, 200, 100 * L * L, 'hero', { ignoreArmor: true });
        });
      }
      if (B >= 2 && cdReady(t, 'bat')) {
        setCd(t, 'bat', 6);
        const [dmg, cd] = SWEEP.bat[B - 1];
        summon(t, { fam: '树魔猎手', title: `树魔猎手${B >= 8 ? 'MAX' : B - 1}`, label: '镖', x: t.x + rnd(-60, 60), y: t.y + rnd(-60, 60), until: G.t + (B === 9 ? 7 : 4),
          levels: [{ name: '树魔猎手', dmg, cd, range: 700, atk: 'pierce', targets: 1, abils: [] }],
          onHit: (s, m) => { if (m.cannonUntil > G.t) hurt(m, dmg, 'chaos', s); } });     // 打中炮晕的敌人：额外 100% 混乱伤害（原图 z5）
      }
      if (w.rocket) {   // 穿透火箭 A04F（火焰呼吸）：朝射线方向一条线 6000 伤害
        const ex = t.x + Math.cos(t.angle) * 400, ey = t.y + Math.sin(t.angle) * 400;
        for (const m of G.monsters) if (!m.dead && segDist2(m.x, m.y, [t.x, t.y], [ex, ey]) < (125 + m.r) ** 2) hurt(m, 6000, 'magic', t);
        FXS.beam(t.x, t.y, 120, ex, ey, 40, '#ff8a3c', 2, 0.12);
      }
    },
    talent: { wood: 30, name: '穿透火箭', max: true, why: t => t.sw.rocket || t.sw.cannon === 9 || t.sw.bat === 9,
      use(t) { const w = t.sw; if (w.bat === 8) { w.bat = 9; return '神镖技能'; } if (w.cannon === 8) { w.cannon = 9; return '炮轰'; } w.rocket = true; return '穿透火箭'; },
      tip: '巨魔蝙蝠 MAX 时升到镖神（树魔猎手活 7 秒）；否则炮 MAX 时升到炮轰（冷却 0.4 秒、减速 50%）；都不是就获得穿透火箭（每次攻击朝射线方向 6000 伤害）' },
    cmds(t) {
      const w = t.sw, k = w.k, L = w.cannon, B = w.bat, lvTxt = n => n <= 1 ? '未学' : n === 8 ? 'MAX' : n === 9 ? '天赋' : `${n - 1} 级`;
      const cGold = L === 1 ? 1000 : L <= 6 ? 1000 + 1000 * L : 0, cMana = L >= 2 && L <= 6 ? 150 : L === 7 ? 800 : 0;
      const bGold = B <= 7 && B % 2 === 0 ? B * 1500 : 0, bMana = B <= 7 && B % 2 === 1 ? B * 100 : 0;
      const cNext = L < 8 ? `<br>下一级：200 范围 ${fmt(100 * (t.lv + 1) * (L + 1) ** 2)}，冷却 ${SWEEP.cannonCd[L]} 秒` : '';
      return [costCmd(t, 'Q', '强化', `强化 ${k}/7：射线长 ${k === 7 ? 900 : 550 + k * 50}，伤害 ×${SWEEP_MUL[k - 1]}${k < 7 ? `<br>下一级：长 ${k + 1 === 7 ? 900 : 600 + k * 50}，伤害 ×${SWEEP_MUL[k]}` : ''}`,
        { mana: k < 7 ? 200 : 0 }, () => { t.sw.k++; msg(`扫射塔强化到 ${t.sw.k} 级`); }, { why: k >= 7 ? '已经是最高等级' : null }),
        costCmd(t, 'W', '升级炮击', `炮：${lvTxt(L)}。每次攻击对目标放炮击（冷却好了就放）：200 范围 100×塔等级×炮等级² 普通伤害，减速 8 秒；被炮中的敌人挨树魔猎手打时多受一份混乱伤害${cNext}`,
          { gold: cGold, mana: cMana }, () => { w.cannon++; msg(`扫射塔：炮升到${lvTxt(w.cannon)}`); }, { why: L >= 8 ? '已经是最高等级' : null, o: { ico: 'abil-A08F' } }),
        costCmd(t, 'E', '升级巨魔等级', `巨魔蝙蝠：${lvTxt(B)}。冷却 6 秒，召唤一只树魔猎手 4 秒（射程 700）${B < 8 ? `<br>下一级：攻击 ${fmt(SWEEP.bat[B][0])}，间隔 ${SWEEP.bat[B][1]} 秒` : ''}`,
          { gold: bGold, mana: bMana }, () => { w.bat++; msg(`扫射塔：巨魔蝙蝠升到${lvTxt(w.bat)}`); }, { why: B >= 8 ? '已经是最高等级' : null, o: { ico: 'abil-A07D' } }),
        cmd('F', SWEEP_DIR[w.dir - 1], '改变技能方向', `<b>改变技能方向</b>（${w.dir}/14）<br>现在：${sweepDirTxt(w.dir)}<br>下一个：${sweepDirTxt(w.dir % 14 + 1)}<br>旋转时炮打攻击目标（900 范围），每次攻击 +0.06 魔法；定向时炮打这个方向 500 距离的地方，每次攻击 +0.04 魔法`,
          () => { w.dir = w.dir % 14 + 1; msg(`扫射塔：${sweepDirTxt(w.dir)}`); uiDirty(); }, { ico: 'abil-A00K' })];
    },
    info(t) {
      const w = t.sw, k = w.k, a = abil(curLevel(t), 'AUcs'), L = w.cannon, B = w.bat;
      return [`强化 ${k}/7：射线长 ${k === 7 ? 900 : 550 + k * 50}，每次 ${(a ? a.A : 6) * SWEEP_MUL[k - 1]} 伤害 · ${sweepDirTxt(w.dir)}`,
        `炮：${L < 2 ? '未学' : `200 范围 ${fmt(100 * (t.lv + 1) * L * L)}，冷却 ${SWEEP.cannonCd[L - 1]} 秒，减速 ${pctTxt(SWEEP.cannonSlow[L - 1])}`} · 巨魔蝙蝠：${B < 2 ? '未学' : `树魔猎手攻击 ${fmt(SWEEP.bat[B - 1][0])}，${B === 9 ? 7 : 4} 秒`}${w.rocket ? ' · 穿透火箭' : ''}`];
    },
    sell(t) { G.mem.扫射塔 = { k: t.sw.k, mana: t.mana, cannon: t.sw.cannon, bat: t.sw.bat }; },
  },
  // 风行塔（原图 BBX / BBa 攻击、BGI / BGL 放技能、BGO 切换技能、BGR 抉择、BGZ 杀敌，周期触发器每秒让它放削甲箭和暴力箭）：
  // 三个技能一直都能用，"切换技能"选的那个每次攻击时魔法 ≥ 200 就升 1 级（最高 10 级）。杀敌得 1 + 0.2×功勋 魔法。
  // 暴力箭 / 削甲箭冷却好了就放，每放一次多重箭次数 +2（F7）；有次数时每次攻击用掉 1 次，目标数按场上怪数（Cn / 人数 / 5）定多重箭等级，
  // 抉择 1：怪越多目标越多，抉择 2：怪越少越多。疯狂箭：攻击时 1/10 概率（间隔至少 4 秒），在塔旁放一个 FX箭（活 3.1 秒，海豹 / 海龟 +2 秒）
  // 每 0.1 秒射一箭并附带重击伤害，同时给风行塔加攻速；也给多重箭 +2 次。
  // 回收后 6 秒内（GE < 6）再建，第一次放暴力箭 / 削甲箭不带心灵之火 / 惊恐术（说明里的"建造后的第一次技能不附带加强攻击与削甲效果"）
  风行塔: {
    init(t, mem) {
      t.maxMana = 500; t.mana = mem ? mem.mana : 0; t.merit = 1;
      t.wind = { sel: 1, pick: 1, lv: mem ? mem.lv.slice() : [1, 1, 1], shots: 0, madAt: -Infinity, sec: 0, soldAt: mem ? mem.soldAt : -Infinity };
    },
    tick(t, dt) {
      const w = t.wind;
      if ((w.sec += dt) < 1) return;
      w.sec -= 1;
      KITS.风行塔.cast(t);
    },
    cast(t) {             // 削甲箭（fanofknives）和暴力箭（waterelemental）：冷却好了就放
      const w = t.wind, [fl, , sl] = w.lv, full = G.t - w.soldAt >= 6;
      if (cdReady(t, 'shred')) {
        setCd(t, 'shred', WIND.shredCd[sl - 1]);
        for (const m of inRange(t.x, t.y, 1000)) { hurt(m, WIND.shred[sl - 1], 'magic', t); if (full) debuffM(m, 'fear', WIND.howl[sl - 1], WIND.howlDur); }
        FXS.nova(t.x, t.y, 1000, '#9fe3ff', 0.4);
        if (full) KITS.风行塔.charge(t);
      }
      if (cdReady(t, 'fury')) {
        setCd(t, 'fury', WIND.furyCd);
        if (full) { giveBuff(t, 'divine', WIND.fury[fl - 1], WIND.furyDur[fl - 1]); KITS.风行塔.charge(t); FXS.flash(t.x, t.y, 150, '#ff6a3c', 120); }
      }
    },
    charge(t) { t.wind.shots += 2; popText(t.x, t.y + 120, t.wind.shots + '!', '#ff3030'); },
    talent: { wood: 30, name: '通用伤害', max: true, tip: '打开第二武器（科技 R006）：攻击变成 8000 通用伤害、间隔 0.3 秒' },
    weapon: t => t.talent && isMax(t) ? curLevel(t).weap2 : null,
    attack(t, target, st, a) {
      const k = KITS.风行塔, w = t.wind, L = w.lv, s = w.sel - 1;
      // 多重箭：有次数时用掉 1 次，按场上怪数定目标数（等级 0 时 SetUnitAbilityLevel 不生效，按 1 级算）
      let n = 1;
      if (w.shots > 0) {
        w.shots--;
        const q = Math.floor(Math.floor(monstersAlive() / activePlayers().length) / 5);
        n = WIND.multi[clamp(w.pick === 1 ? q : 10 - q, 1, 10) - 1];
      }
      if (n > 1) a.targets = [target].concat(inRange(t.x, t.y, 1000).filter(m => m !== target)).slice(0, n);
      // 疯狂箭
      if (G.t - w.madAt >= 4 && rint(1, 10) === 10) {
        w.madAt = G.t;
        const ml = L[1];
        summon(t, { fam: 'FX箭', title: '疯狂箭', label: '箭', x: t.x, y: t.y, until: G.t + 3.1 + (G.petFx.gs || 0),
          levels: [{ name: 'FX箭', dmg: 2, cd: 0.1, range: 1000, atk: 'pierce', targets: 1, abils: [{ code: 'AHbh', A: 100, C: WIND.mad[ml - 1], dur: 0.1 }] }] });
        giveBuff(t, 'fire', WIND.madAS[ml - 1], 3);
        k.charge(t);
      }
      k.cast(t);
      // 切换技能选中的那个：魔法 ≥ 200 升 1 级
      if (L[s] <= 9 && t.mana >= 200) { L[s]++; t.mana -= 200; msg(`风行塔：${WIND.names[s]}升到 ${L[s]} 级`); }
    },
    kill(t) { addMana(t, 1 + 0.2 * t.merit); },
    cmds(t) {
      const w = t.wind;
      return [
        cmd('Q', '切', '切换技能', `当前：<b>${WIND.names[w.sel - 1]}</b> → ${WIND.names[w.sel % 3]}<br>每次攻击时魔法 ≥ 200 就升级选中的技能（最高 10 级）；三个技能不用切换都能用`,
          () => { w.sel = w.sel % 3 + 1; msg(`风行塔：升级${WIND.names[w.sel - 1]}`); uiDirty(); }),
        cmd('W', '择', '抉择', `当前：怪<b>${w.pick === 1 ? '多' : '少'}</b>则多重箭目标越多 → 切换为怪${w.pick === 1 ? '少' : '多'}则越多`,
          () => { w.pick = 3 - w.pick; uiDirty(); }),
        meritCmd(t, 'E', m => m + 1, 10, m => (1 + 0.2 * m).toFixed(1)),
      ];
    },
    info(t) {
      const w = t.wind, [f, m, s] = w.lv;
      return [`升级：${WIND.names[w.sel - 1]} · 多重箭剩余 ${w.shots} 次（怪${w.pick === 1 ? '多' : '少'}则目标多）`,
        `暴力箭 ${f} 级：攻击 +${pctTxt(WIND.fury[f - 1])} ${WIND.furyDur[f - 1]} 秒，冷却 8 秒`,
        `疯狂箭 ${m} 级：10% 概率，FX箭每箭 +${WIND.mad[m - 1]}，攻速 +${pctTxt(WIND.madAS[m - 1])} 3 秒`,
        `削甲箭 ${s} 级：1000 范围 ${WIND.shred[s - 1]} 魔法伤害，护甲 -${WIND.howl[s - 1]}，冷却 ${WIND.shredCd[s - 1]} 秒`];
    },
    sell(t) { G.wood += meritSpent(t, m => m + 1); G.mem.风行塔 = { lv: t.wind.lv.slice(), mana: t.mana, soldAt: G.t }; },
  },
  // 将军塔（原图 BBC 攻击、BD2 / BD5 / BD8 放技能、BEC 杀敌）：6 个技能卒 / 炮 / 马 / 車 / 象 / 士，"切换技能"选一个成长。
  // 每次攻击：所有开着的技能冷却好了就放；选中的那个如果被关了就恢复到记下的等级再放。将军塔每放一个技能（包括切换），
  // 选中的技能魔法够了就升 1 级（4→5 级另要 20 木材）。切换时 4 级以下的技能都被关掉（原图 BD5 在切换之后判断，
  // 选中的下一个技能不关——照搬；选中的那个下次攻击时又会打开）。将军塔和它的召唤物杀敌 +1 魔法，魔法每秒自己恢复。
  // 建成时只开卒（记下的等级），其他都关着；回收后再建，魔法和各技能记下的等级恢复。
  // 天赋（MAX，30 木材）军令状：每攻击 20 次重置所有技能冷却
  将军塔: {
    init(t, mem) {
      t.maxMana = 500; t.mana = mem ? mem.mana : 0;
      const store = mem ? mem.store.slice() : [1, 1, 1, 1, 1, 1];
      t.gen = { sel: 1, store, lv: [store[0], 6, 6, 6, 6, 6], ew: 0 };
    },
    tick(t, dt) { addMana(t, (curLevel(t).manaRegen || 0) * dt); },
    talent: { wood: 30, name: '军令状', max: true, tip: '每攻击 20 次重置所有技能冷却' },
    attack(t, target) {
      const k = KITS.将军塔, g = t.gen, s = g.sel - 1;
      for (let i = 0; i < 6; i++) if (g.lv[i] < 6) k.cast(t, i);
      if (g.lv[s] !== g.store[s]) g.lv[s] = g.store[s];
      k.cast(t, s);
      if (t.talent && isMax(t)) { if (g.ew >= 20) { g.ew = 0; for (const n of GEN.names) delete t.cds[n]; } g.ew++; }
    },
    cast(t, i) {
      const g = t.gen, L = g.lv[i], nm = GEN.names[i];
      if (L >= 6 || !cdReady(t, nm)) return;
      setCd(t, nm, GEN.cd[i][L - 1]);
      const x = t.x, y = t.y, enemy = r => pick(inRange(x, y, r)) || null;
      if (i === 0) {                         // 卒：900 范围随机一个敌人的位置召唤一个卒（12 秒，不动）
        const m = enemy(900); if (m) summon(t, { fam: '卒', title: '卒', label: '卒', x: m.x, y: m.y, until: G.t + 12,
          levels: [{ name: '卒', dmg: GEN.pawn.dmg[L - 1], cd: GEN.pawn.cd[L - 1], range: 500, atk: 'normal', targets: 1, abils: [{ code: 'AIcb', B: GEN.pawn.armor[L - 1], dur: 8 }] }] });
      }
      if (i === 1) summon(t, { fam: '炮', title: '炮（小型虚无行者）', label: '炮', x: x + rnd(-80, 80), y: y + rnd(-80, 80), until: G.t + GEN.cannon.dur[L - 1],
        levels: [{ name: '炮', dmg: GEN.cannon.dmg[L - 1], cd: GEN.cannon.cd[L - 1], range: GEN.cannon.range[L - 1], atk: 'pierce', targets: 1, abils: [] }] });
      if (i === 2) {                         // 马：朝随机方向 256 外的点放惊吓，5 秒内每秒 A 只马，每只撞 150 范围
        const a = rnd(0, TAU), cx = x + Math.cos(a) * 256, cy = y + Math.sin(a) * 256, n = GEN.horse.n[L - 1], d = GEN.horse.dmg[L - 1];
        for (let j = 0; j < n * 5; j++) later(j / n, () => {
          if (!G.towers.includes(t)) return;
          const r = Math.sqrt(Math.random()) * 600, b = rnd(0, TAU), px = cx + Math.cos(b) * r, py = cy + Math.sin(b) * r;
          aoeAt(t, px, py, 150, d, 'magic'); FXS.ring(px, py, 150, '#e0c090', 0.25, 2);
        });
      }
      if (i === 3) {                         // 車：3 秒，火箭弹打 600 范围所有敌人，追踪弹每隔一段时间打一个敌人
        const c = GEN.chariot;
        summon(t, { fam: '車', title: '車（空中战舰）', label: '車', x: x + rnd(-80, 80), y: y + rnd(-80, 80), until: G.t + 3,
          levels: [{ name: '車', dmg: c.dmg[L - 1], cd: c.cd[L - 1], range: 800, atk: 'chaos', targets: 1, multi: 100, multiR: 600, abils: [] }],
          tick(s) { if (G.t < (s.trackAt || 0)) return; const m = pick(inRange(s.x, s.y, c.trackR[L - 1])); if (!m) return;
            s.trackAt = G.t + c.trackCd[L - 1]; hurt(m, c.track[L - 1], 'magic', s, { ignoreArmor: true }); FXS.beam(s.x, s.y, 200, m.x, m.y, 40, '#ff8a3c', 1, 0.15); } });
      }
      if (i === 4) {                         // 象：践踏 + 2 秒后马甲再践踏
        for (const m of inRange(x, y, 800)) { hurt(m, GEN.stomp[L - 1], 'magic', t); stun(m, 2); }
        FXS.nova(x, y, 800, '#d8b070', 0.5);
        later(2, () => { if (!G.towers.includes(t)) return; for (const m of inRange(x, y, 800)) { hurt(m, L * L * 1000, 'chaos', t, { ignoreArmor: true }); stun(m, 1); } FXS.nova(x, y, 800, '#c48bff', 0.5); });
      }
      if (i === 5) {                         // 士：800 范围随机一个敌人的位置召唤一个士（7 秒，会走），每次攻击向目标放冲击波
        const m = enemy(800); if (m) summon(t, { fam: '士', title: '士', label: '士', x: m.x, y: m.y, until: G.t + 7, mobile: { speed: 270, leash: 2000 },
          levels: [{ name: '士', dmg: 0, cd: 0.3, range: 600, atk: 'magic', targets: 1, abils: [] }], silent: true,
          onLaunch(s, tg) { const dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy) || 1, ex = s.x + dx / d * 800, ey = s.y + dy / d * 800;
            lineHit(s, s.x, s.y, ex, ey, 800, 125, GEN.sage[L - 1], 'magic', { ignoreArmor: true }, '#bfe4ff'); } });
      }
      KITS.将军塔.grow(t);
    },
    grow(t) {             // BD8：选中的技能魔法够了升 1 级
      const g = t.gen, s = g.sel - 1, L = g.lv[s], [a, b] = GEN.up[s], need = a + b * L;
      if (L <= 3 && t.mana >= need) { t.mana -= need; g.lv[s] = g.store[s] = L + 1; msg(`将军塔：${GEN.names[s]}升到 ${L + 1} 级`); }
      else if (L === 4 && t.mana >= need && G.wood >= 20) { G.wood -= 20; t.mana -= need; g.lv[s] = g.store[s] = 5; msg(`将军塔：${GEN.names[s]}升到 MAX（扣除 20 木材）`); }
    },
    kill(t) { addMana(t, 1); },
    cmds(t) {
      const g = t.gen;
      return [cmd('Q', '切', '切换技能', `当前：<b>${GEN.names[g.sel - 1]}</b> → ${GEN.names[g.sel % 6]}<br>选中的技能放技能时魔法够了自动升级；4 级以下的技能切换后关闭，4 级起可以共存`,
        () => {
          g.sel = g.sel % 6 + 1;
          for (let i = 0; i < 6; i++) if (g.lv[i] < 4 && g.sel !== (i + 5) % 6 + 1) g.lv[i] = 6;     // BD5（在 BD2 加 1 之后判断）
          KITS.将军塔.grow(t); msg(`将军塔：切换到${GEN.names[g.sel - 1]}`); uiDirty();
        })];
    },
    info(t) {
      const g = t.gen, up = i => { const L = g.lv[i], [a, b] = GEN.up[i]; return L <= 4 ? `，升级 ${a + b * L} 魔法${L === 4 ? ' + 20 木材' : ''}` : ''; };
      return [`当前技能：${GEN.names[g.sel - 1]}${up(g.sel - 1)}${t.talent ? ' · 军令状' : ''}`,
        GEN.names.map((n, i) => `${n} ${g.lv[i] >= 6 ? '关' : g.lv[i] === 5 ? 'MAX' : g.lv[i] + '级'}`).join(' · ')];
    },
    sell(t) { G.mem.将军塔 = { mana: t.mana, store: t.gen.store.slice() }; },
  },
  // 天将塔（原图 BBF / BBI 攻击、BEH / BEK 放技能、BEN 杀敌）：和将军塔一样的 5 个技能卒 / 炮 / 马 / 車 / 象，"切换技能"选一个成长，
  // 每次攻击时魔法够了升 1 级（最高 5 级），没有木材要求；炮升级时把天将科技设成炮的等级（科技只升不降）。
  // 切换时 4 级以下的技能都关掉（照搬原图 BEK：卒总会被关，选中的下一个技能不关）；选中的那个下次攻击时恢复。
  // 士6：每次 2000 金 + 20 魔法提升科技 1 级（最多 50）：天将和召唤物攻击 +80、攻速 +15%。天将和召唤物杀敌 +1 魔法
  天将塔: {
    init(t, mem) {
      t.maxMana = 500; t.mana = mem ? mem.mana : 0;
      const store = mem ? mem.store.slice() : [1, 1, 1, 1, 1];
      t.tj = { sel: 1, store, lv: [1, 6, 6, 6, 6] };
    },
    dmgPlus: () => TJ.techAtk * G.tjTech, asPlus: () => TJ.techAS * G.tjTech,
    tick(t, dt) { addMana(t, (curLevel(t).manaRegen || 0) * dt); },
    attack(t) {
      const k = KITS.天将塔, g = t.tj, s = g.sel - 1;
      for (let i = 0; i < 5; i++) if (g.lv[i] < 6) k.cast(t, i);
      if (g.lv[s] !== g.store[s]) g.lv[s] = g.store[s];
      k.cast(t, s);
      const L = g.lv[s], [a, b] = TJ.up[s], need = a + b * L;       // BBI：选中的技能魔法够了升级
      if (L <= 4 && t.mana >= need) {
        t.mana -= need; g.lv[s] = g.store[s] = L + 1; msg(`天将塔：${TJ.names[s]}升到 ${L + 1 === 5 ? 'MAX' : L + 1 + ' 级'}`);
        if (s === 1) G.tjTech = Math.max(G.tjTech, L + 1);
      }
    },
    sum(t, o, dmg, cd) {   // 天将的召唤物：攻击 / 攻速吃天将科技
      return summon(t, { ...o, stats: () => ({ dmg: dmg + TJ.techAtk * G.tjTech, cd, as: TJ.techAS * G.tjTech }) });
    },
    cast(t, i) {
      const g = t.tj, L = g.lv[i], nm = TJ.names[i];
      if (L >= 6 || !cdReady(t, nm)) return;
      setCd(t, nm, TJ.cd[i][L - 1]);
      const k = KITS.天将塔, x = t.x, y = t.y;
      if (i === 0) {                         // 卒：900 范围随机一个敌人的位置召唤天兵
        const m = pick(inRange(x, y, 900)), c = TJ.soldier;
        if (m) k.sum(t, { fam: '天兵', title: '天兵', label: '兵', x: m.x, y: m.y, until: G.t + 12, mobile: { speed: 522, leash: 2000 },
          levels: [{ name: '天兵', dmg: c.dmg[L - 1], cd: c.cd[L - 1], range: 200, atk: 'normal', targets: 1, splash: 120, abils: [] }] }, c.dmg[L - 1], c.cd[L - 1]);
      }
      if (i === 1) k.sum(t, { fam: '巨炮', title: '巨炮（小型虚无行者）', label: '炮', x: x + rnd(-80, 80), y: y + rnd(-80, 80), until: G.t + 6,
        levels: [{ name: '巨炮', dmg: TJ.cannon[L - 1], cd: 0.8, range: 1000, atk: 'pierce', targets: 1, splash: 120, abils: [] }] }, TJ.cannon[L - 1], 0.8);
      if (i === 2) {                         // 马：朝随机方向 256 外的点放惊吓，5 秒内每秒 1 艘战舰，300 范围
        const a = rnd(0, TAU), cx = x + Math.cos(a) * 256, cy = y + Math.sin(a) * 256;
        for (let j = 0; j < 5; j++) later(j, () => {
          if (!G.towers.includes(t)) return;
          const r = Math.sqrt(Math.random()) * 600, b = rnd(0, TAU), px = cx + Math.cos(b) * r, py = cy + Math.sin(b) * r;
          aoeAt(t, px, py, 300, TJ.ship[L - 1], 'magic'); FXS.nova(px, py, 300, '#9fd0ff', 0.3);
        });
      }
      if (i === 3) k.sum(t, { fam: '雷车', title: '雷车（小型虚无行者）', label: '雷', x: x + 50, y, until: G.t + 2.1,      // 車：雷车打 1000 范围所有敌人
        levels: [{ name: '雷车', dmg: 100, cd: 0.3, range: 1000, atk: 'pierce', targets: 1, multi: 100, multiR: 1000, abils: [] }] }, 100, 0.3);
      if (i === 4) {                         // 象：900 范围随机一个敌人的位置放疯象，每 0.2 秒践踏一次
        const m = pick(inRange(x, y, 900));
        if (m) summon(t, { fam: '疯象', title: '疯象', label: '象', x: m.x, y: m.y, until: G.t + 4.1, silent: true,
          levels: [{ name: '疯象', dmg: 0, cd: 0.2, range: 1500, atk: 'chaos', targets: 1, abils: [] }],
          onLaunch(s) { for (const e of inRange(s.x, s.y, 300)) { hurt(e, TJ.stomp[L - 1], 'magic', t); stun(e, 0.25); } FXS.ring(s.x, s.y, 300, '#d8b070', 0.2, 3); } });
      }
    },
    kill(t) { addMana(t, 1); },
    cmds(t) {
      const g = t.tj;
      return [
        cmd('Q', '切', '切换技能', `当前：<b>${TJ.names[g.sel - 1]}</b> → ${TJ.names[g.sel % 5]}<br>选中的技能每次攻击时魔法够了自动升级；4 级以下的技能切换后关闭，4 级起可以共存`,
          () => { g.sel = g.sel % 5 + 1; for (let i = 0; i < 5; i++) if (g.lv[i] < 4 && g.sel !== (i === 0 ? 6 : i)) g.lv[i] = 6; msg(`天将塔：切换到${TJ.names[g.sel - 1]}`); uiDirty(); }),
        costCmd(t, 'W', '士', `科技 ${G.tjTech}/${TJ.techMax}：天将、天兵、巨炮、雷车攻击 +${TJ.techAtk * G.tjTech}、攻速 +${pctTxt(TJ.techAS * G.tjTech)}<br>每次 +${TJ.techAtk} 攻击、+15% 攻速`,
          { gold: TJ.techGold, mana: TJ.techMana }, () => { G.tjTech++; msg('升级成功'); }, { why: G.tjTech >= TJ.techMax ? '已经是最高等级' : null, o: { ico: 'abil-A0J1' } }),
      ];
    },
    info(t) {
      const g = t.tj, s = g.sel - 1, L = g.lv[s], [a, b] = TJ.up[s];
      return [`当前技能：${TJ.names[s]}${L <= 4 ? `，升级 ${a + b * L} 魔法` : ''} · 科技 ${G.tjTech} 级`,
        TJ.names.map((n, i) => `${n} ${g.lv[i] >= 6 ? '关' : g.lv[i] === 5 ? 'MAX' : g.lv[i] + '级'}`).join(' · ')];
    },
    sell(t) { G.mem.天将塔 = { mana: t.mana, store: t.tj.store.slice() }; },
  },
  // 狂狼塔（原图 BBr 攻击、BHa 杀敌、BHd 放技能、BHg 技能结束、BHj 疯狂之狼）：选择升级技能（致命 / 野性 / 兽性 / 噬性），
  // 狂狼自己杀敌时升级选中的技能：致命 100 魔法（最高 20 级）、野性 50 魔法 + 10 木材（最高 4 级，并给狼速 +3）、
  // 兽性 150 魔法 + 1000 金（最高 9 级）、噬性要 250 魔法、扣 200（照搬：已经 6 级还会扣魔法）；没有升级时才得魔法。
  // 每次攻击：兽性 2 级起对目标 360 范围 等级²×40 穿刺伤害，噬性 2 级起对目标 等级²×200 混乱伤害，然后冷却好了就放兽性（给附近塔加攻速）
  // 和野性（召唤小狼崽；建成 36 秒后再加 900 范围 [致命等级 + 1000] 英雄伤害）。建成时野性 / 兽性是关闭状态，第一次放之后恢复到记下的等级。
  // 噬性：狂狼每杀 (17 - 噬性等级) 个敌人，在死亡位置让 360 范围敌人护甲 -600 5 秒。
  // 天赋（MAX，30 木材）：疯狂之狼，冷却 20 秒，攻击时自动变身：狂狼塔隐身，召唤疯狂之狼 10 秒（会走，攻击 500、间隔 0.2、360 溅射，有致命）
  狂狼塔: {
    ownCrit: true,
    init(t, mem) {
      t.maxMana = 500; t.mana = mem ? mem.mana : 0; t.merit = 1;
      t.kl = { sel: 1, crit: mem ? mem.crit : 1, pup: 5, beast: 10, bite: mem ? mem.bite : 1, store: mem ? { ...mem.store } : { pup: 1, beast: 1 }, howl: 0, built: G.t };
    },
    dmgPlus: () => WOLF.powAtk * G.klPow, asPlus: () => WOLF.spdAS * G.klSpd,
    talent: { wood: 30, name: '疯狂之狼', max: true, tip: '冷却 20 秒，攻击时变身为疯狂之狼 10 秒' },
    attack(t, target, st, a) {
      const k = t.kl, x = target.x, y = target.y;
      if (k.beast >= 2 && k.beast !== 10) aoeAt(t, x, y, 360, k.beast * k.beast * 40, 'pierce');
      if (k.bite >= 2) hurt(target, k.bite * k.bite * 200, 'chaos', t);
      if (Math.random() < 0.15) { a.dmg *= WOLF.crit[k.crit - 1]; popText(x, y, WOLF.crit[k.crit - 1] + '倍', '#ffd257'); }
      if (t.talent && isMax(t) && cdReady(t, 'morph')) KITS.狂狼塔.morph(t);
      if (cdReady(t, 'beast')) {                // 兽性：在自己位置放，120 范围友军（含自己）
        if (k.beast >= 10) { k.beast = k.store.beast; }
        else { setCd(t, 'beast', WOLF.beastCd[k.beast - 1]); for (const o of alliesNear(t.x, t.y, 120)) giveBuff(o, 'fire', 10, 2); FXS.nova(t.x, t.y, 220, '#ff8a3c', 0.4); }
      }
      if (cdReady(t, 'pup')) {                  // 野性：召唤小狼崽
        if (k.pup >= 5) k.pup = k.store.pup;
        else {
          setCd(t, 'pup', WOLF.pupCd[k.pup - 1]);
          summon(t, { fam: '小狼崽', title: '小狼崽（野性光环）', label: '狼', x: t.x + rnd(-120, 120), y: t.y + rnd(-120, 120), until: G.t + 8, aura: { kind: 'drums', r: 120, v: 1 },
            levels: [{ name: '小狼崽', dmg: 50, cd: 1, range: 300, atk: 'normal', targets: 1, abils: [] }],
            stats: () => ({ dmg: 50 + WOLF.powAtk * G.klPow, cd: 1, as: WOLF.spdAS * G.klSpd }) });
          if (G.t - k.built >= 36) { aoeAt(t, t.x, t.y, 900, k.crit + 1000, 'hero'); FXS.nova(t.x, t.y, 900, '#d07040', 0.5); }
        }
      }
    },
    morph(t) {
      setCd(t, 'morph', 20); t.noAttack = true;
      FXS.nova(t.x, t.y, 300, '#d07040', 0.5);
      summon(t, { fam: '疯狂之狼', title: '疯狂之狼', label: '狂', x: t.x, y: t.y, until: G.t + 10, mobile: { speed: 420, leash: 3000 },
        levels: [{ name: '疯狂之狼', dmg: 500, cd: 0.2, range: 800, atk: 'hero', targets: 1, splash: 360, abils: [] }],
        stats: () => ({ dmg: 500 + WOLF.powAtk * G.klPow, cd: 0.2, as: WOLF.spdAS * G.klSpd }), crit: () => [0.15, WOLF.crit[t.kl.crit - 1]],
        onExpire() { t.noAttack = false; } });
    },
    howl(m) { for (const e of inRange(m.x, m.y, 360)) debuffM(e, 'fear', 600, 5); FXS.nova(m.x, m.y, 360, '#c48bff', 0.4); },
    kill(t, m, src) {
      const k = t.kl, gain = 1 + (t.merit - 1) * 0.2;
      if (src && src.fam === '疯狂之狼') {     // BHj：疯狂之狼杀敌
        addMana(t, gain);
        if (k.howl >= 18 - k.bite * 2) { k.howl = 0; KITS.狂狼塔.howl(m); } else k.howl++;
        return;
      }
      if (src !== t) return;                    // 小狼崽杀的不算
      if (k.howl >= 17 - k.bite) { k.howl = 0; KITS.狂狼塔.howl(m); } else k.howl++;
      const s = k.sel;
      if (k.crit < 20 && s === 1 && t.mana >= 100) { k.crit++; t.mana -= 100; }
      else if (k.pup < 4 && s === 2 && t.mana >= 50 && G.wood >= 10) { t.mana -= 50; G.wood -= 10; k.pup++; k.store.pup = k.pup; G.klSpd = Math.min(WOLF.spdMax, G.klSpd + 3); }
      else if (k.beast < 9 && s === 3 && t.mana >= 150 && G.gold >= 1000) { G.gold -= 1000; t.mana -= 150; k.beast++; k.store.beast = k.beast; }
      else if (k.bite < 9 && s === 4 && t.mana >= 250) { t.mana -= 200; k.bite = Math.min(6, k.bite + 1); }
      else { addMana(t, gain); return; }
      msg(`狂狼塔：${WOLF.names[s - 1]}升级`);
    },
    cmds(t) {
      const k = t.kl, need = ['100 魔法', '50 魔法 + 10 木材', '150 魔法 + 1000 金', '250 魔法（扣 200）'];
      return [
        cmd('Q', '选', '选择升级技能', `当前：<b>${WOLF.names[k.sel - 1]}</b>（升级要 ${need[k.sel - 1]}）→ ${WOLF.names[k.sel % 4]}<br>狂狼杀死敌人时自动升级`,
          () => { k.sel = k.sel % 4 + 1; uiDirty(); }),
        costCmd(t, 'W', '狼族力量', `狼力 ${G.klPow}/${WOLF.powMax}：攻击 +${WOLF.powAtk * G.klPow}；狼速 ${G.klSpd}：攻速 +${pctTxt(WOLF.spdAS * G.klSpd)}<br>每次攻击 +40、攻速 +13%，致命 +1 级（对狂狼、小狼崽、疯狂之狼有效）`,
          { gold: WOLF.powGold }, () => { G.klPow++; G.klSpd = Math.min(WOLF.spdMax, G.klSpd + 1); if (k.crit < 20) k.crit++; }, { why: G.klPow >= WOLF.powMax ? '已经是最高等级' : null }),
        costCmd(t, 'E', '功勋', `等级 ${t.merit}/${WOLF.meritMax}：没有升级技能时，杀敌得 ${(1 + (t.merit - 1) * 0.2).toFixed(1)} 魔法<br>回收时返还木材`,
          { wood: t.merit < WOLF.meritMax ? WOLF.meritWood : 0 }, () => { t.merit++; }, { why: t.merit >= WOLF.meritMax ? '已经是最高等级' : null }),
      ];
    },
    info(t) {
      const k = t.kl, cl = (v, off) => v >= off ? '关闭（下次放时恢复）' : v + ' 级';
      return [`升级：${WOLF.names[k.sel - 1]} · 致命 ${k.crit} 级（15% ${WOLF.crit[k.crit - 1]} 倍）`,
        `野性 ${cl(k.pup, 5)} · 兽性 ${cl(k.beast, 10)} · 噬性 ${k.bite} 级（再杀 ${Math.max(0, 17 - k.bite - k.howl)} 个降甲）${t.talent ? ' · 疯狂之狼' : ''}`];
    },
    sell(t) {
      const k = t.kl; G.wood += WOLF.meritWood * (t.merit - 1);
      G.mem.狂狼塔 = { mana: t.mana, crit: k.crit, bite: k.bite, store: { pup: k.pup < 5 ? k.pup : k.store.pup, beast: k.beast < 10 ? k.beast : k.store.beast } };
    },
  },
  // 巫妖塔（原图 BBO 攻击放技能、BFF 会心一击、BEt 灵魂献祭、BEw 巫术伤害、BEz 巫术升级、BE2 杀敌 / 巫妖之力、BEq 升会心、BEn 建成）：
  // 灵魂献祭（5 木材 + 350 魔法）自己的巫医 / 巫魔 / 巫法 / 巫术塔，学会它的技能（守卫 / 恐惧之眼 / 静止陷阱 / 死亡凋零），再献祭同类升到 MAX；
  // 对自己献祭（2 木材 + 100 魔法）：功勋 +1（攻击 +100%×(等级-1)，和攻击光环不叠加），巫术 8 倍伤害的概率 +1%。
  // 每次攻击：学会的技能冷却好了就对目标放，并在 400 范围造成巫术伤害 FP×倍数（FP = 巫术等级² × (500 + 小鬼 100)）；15% 会心一击：300 范围 攻击力×会心等级² 英雄伤害。
  // 杀敌（巫妖、守卫、巫系塔）得 0.9 + 0.1×功勋 魔法；巫妖 / 守卫杀敌 0.2% 会心 +1（精英 20%）。
  // 巫妖之力：巫妖杀敌时如果最多只学了一个技能（只学恐惧之眼要天赋），魔法 ≥ 800、金币 ≥ 10000 就扣掉，攻击 +30（照搬：满 5 级后还会继续扣）；拿过之后不能再献祭巫系塔
  巫妖塔: {
    ownCrit: true,
    init(t, mem) {
      t.maxMana = 1000; t.mana = mem ? mem.mana : 0;
      t.lich = mem ? { sk: { ...mem.sk }, wit: mem.wit, crit: mem.crit, merit: mem.merit } : { sk: { ward: 0, eye: 0, trap: 0, dd: 0 }, wit: 1, crit: 1, merit: 1 };
    },
    built(t) {          // BEn：建成时在 600 范围随机位置把学会的技能各放一次
      for (const k of ['dd', 'ward', 'trap', 'eye']) { const a = rnd(0, TAU), r = rnd(0, 600); KITS.巫妖塔.cast(t, k, { x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r }); }
      return t;
    },
    self: t => ({ atk2: t.lich.merit - 1 }),
    dmgPlus: () => LICH.techAtk * Math.min(LICH.techMax, G.lich.tech),
    talent: { wood: 30, name: '提升会心一击', why: () => G.lich.mq, tip: '会心一击 +3 级（10 级以上直接到 14 或 15 级），并可以只学恐惧之眼拿巫妖之力',
      use(t) { const L = t.lich; G.lich.mq = true; L.crit = L.crit <= 10 ? L.crit + 3 : (L.crit === 14 || (L.crit === 13 && rint(1, 2) === 1) || (L.crit === 12 && rint(1, 3) === 1)) ? 15 : 14; } },
    atkVal: t => towerStats(t).dmg * (t.atkMul || 1),
    burst(t, x, y) { const d = KITS.巫妖塔.atkVal(t) * t.lich.crit ** 2; aoeAt(t, x, y, 300, d, 'hero'); popText(x, y, fmt(d), '#ffd257'); },
    cast(t, k, at) {
      const L = t.lich, lv = L.sk[k];
      if (!lv || !cdReady(t, k)) return;
      const x = at.x, y = at.y;
      if (k === 'ward') { const [r, d, cd, dur] = LICH.ward[lv - 1]; setCd(t, k, cd); zone(t, x, y, r, dur, d, 'magic', null, 'ward', { color: 'rgba(122,184,255,.16)' }); }
      if (k === 'eye') { const [v, dur, cd] = LICH.eye[lv - 1]; setCd(t, k, cd); field(t, x, y, 250, dur, { color: 'rgba(196,139,255,.14)', each: m => debuffM(m, 'fear', v, dur) }); }
      if (k === 'trap') {
        const [detect, r, delay, st, cd] = LICH.trap[lv - 1]; setCd(t, k, cd);
        field(t, x, y, r, 8, { color: 'rgba(255,210,87,.10)', tick(z) {
          if (z.armAt == null && anyEnemy(z.x, z.y, detect)) z.armAt = G.t + delay;
          if (z.armAt != null && G.t >= z.armAt) { stunArea(z, r, st); FXS.nova(z.x, z.y, r, '#ffd257', 0.4); z.until = G.t; }
        } });
      }
      if (k === 'dd') { const [r, pct, cd] = LICH.dd[lv - 1]; setCd(t, k, cd); field(t, x, y, r, 1, { color: 'rgba(120,255,120,.16)', each: (m, dt) => hurt(m, m.maxHp * pct * dt, 'hero', t, { ignoreArmor: true }) }); FXS.nova(x, y, r, '#7dff7d', 0.5); }
      // BEw：巫术伤害（FP 按当前巫术等级算）
      const [mul, atk] = LICH.fp[k], fp = L.wit * L.wit * (500 + (G.petFx.gr || 0)), big = rint(1, 100) <= G.lich.kc + 4;
      aoeAt(t, x, y, 400, fp * mul * (big ? 8 : 1), atk);
      if (big) popText(x, y, fmt(fp * mul * 8) + '！', '#ff3030');
      if (k !== 'eye' || rint(1, 20) === 1) KITS.巫妖塔.burst(t, x, y);     // 原图条件优先级：守卫 / 陷阱 / 凋零每次都会心，恐惧之眼 1/20
    },
    attack(t, target) {
      for (const k of ['eye', 'ward', 'trap', 'dd']) KITS.巫妖塔.cast(t, k, target);
      if (rint(1, 100) <= 15) KITS.巫妖塔.burst(t, target.x, target.y);
    },
    gain(t) { addMana(t, 0.9 + 0.1 * t.lich.merit); },
    anyKill(t, owner) { if (owner !== t && owner.cat === 'witch') KITS.巫妖塔.gain(t); },     // 巫系塔杀敌也给巫妖魔法
    kill(t, m) {
      const L = t.lich, sk = L.sk, P = G.lich, k = KITS.巫妖塔;
      k.gain(t);
      if (L.crit < 14 && (m.elite ? rint(1, 5) === 1 : rint(1, 1000) <= 2)) { L.crit++; msg(`巫妖塔：会心一击升到 ${L.crit} 级`); }
      const none = (...ks) => ks.every(x => !sk[x]);
      if (((P.mq && P.mr <= 2 && none('ward', 'trap', 'dd')) || none('eye', 'trap', 'dd') || none('eye', 'ward', 'dd') || none('eye', 'ward', 'trap')) && t.mana >= 800 && G.gold >= 10000) {
        P.tech++; t.mana -= 800; G.gold -= 10000; P.mr++; FXS.ring(t.x, t.y, 200, '#9fffb0', 0.6, 4); msg(`巫妖塔获得巫妖之力（第 ${P.mr} 次，攻击 +${LICH.techAtk * Math.min(LICH.techMax, P.tech)}）`);
      }
    },
    sacrifice(t, o) {
      const L = t.lich, P = G.lich;
      if (!o || !G.towers.includes(o) || !mine(o)) return msg('该单位不能献祭');
      if (o === t) {
        if (t.mana < 100 || L.merit >= 11 || G.wood < 2) return msg(L.merit >= 11 ? '功勋已经是最高等级' : '条件不足（2 木材 + 100 魔法）');
        G.wood -= 2; t.mana -= 100; L.merit++; P.kc++; FXS.ring(t.x, t.y, 160, '#c48bff', 0.5, 3); return msg('献祭成功');
      }
      const k = LICH.from[o.fam];
      if (!k) return msg('该单位不能献祭');
      if (!((G.wood >= 5 && P.mr === 0) || (P.nk === 0 && P.mr > 0)) || G.wood < 5) return msg('木材不足或获得了巫妖之力');
      if (t.mana < 350) return msg('魔法不足');
      const lv = L.sk[k], base = k === 'dd' ? 2 : 1;
      if (lv > base) return msg(`${LICH.names[k]}已经是 MAX`);
      L.sk[k] = lv ? base + 2 : base; if (!lv) P.nk++;
      G.wood -= 5; t.mana -= 350;
      G.towers = G.towers.filter(x => x !== o && x.owner !== o); G.zones = G.zones.filter(z => z.owner !== o);     // 被献祭的塔死掉（不返还），巫系名额回来
      FXS.ring(o.x, o.y, 200, '#c48bff', 0.6, 4); msg(`献祭成功：巫妖学会${LICH.names[k]}${lv ? '（MAX）' : ''}`); uiDirty();
    },
    cmds(t) {
      const L = t.lich;
      return [
        cmd('Q', '祭', '灵魂献祭', `对自己的巫医 / 巫魔 / 巫法 / 巫术塔使用（5 木材 + 350 魔法）：学会它的技能，再献祭同类升到 MAX<br>对自己使用（2 木材 + 100 魔法）：功勋 +1，巫术 8 倍伤害概率 +1%${G.lich.mr ? '<br><b style="color:#ffb347">已获得巫妖之力：只有从没献祭过巫系塔时才能再献祭</b>' : ''}`,
          () => { G.pending = 'heroPick'; G.placing = null; G.heroPick = { label: '献祭这座塔', fn: (x, y, hit) => KITS.巫妖塔.sacrifice(t, hit) }; msg('灵魂献祭：选择要献祭的塔（Esc 取消）'); uiDirty(); }, { active: G.pending === 'heroPick' }),
        costCmd(t, 'W', '巫术', `巫术 ${L.wit}/8：技能伤害 FP = ${fmt(L.wit * L.wit * (500 + (G.petFx.gr || 0)))}<br>升级：会心一击 +1，FP 按 等级² 增加`,
          { gold: L.wit < 8 ? L.wit * 2000 : 0, mana: L.wit < 8 ? 80 : 0 }, () => { if (L.crit < 14) L.crit++; L.wit++; msg('技能升级成功'); }, { why: L.wit >= 8 ? '已经是最高等级' : null }),
      ];
    },
    info(t) {
      const L = t.lich, sk = Object.entries(L.sk).filter(([, v]) => v).map(([k, v]) => `${LICH.names[k]} ${v === (k === 'dd' ? 4 : 3) ? 'MAX' : ''}`.trim());
      return [`会心一击 ${L.crit} 级（攻击 ×${L.crit * L.crit}）· 巫术 ${L.wit} 级 · 功勋 ${L.merit} 级`, `技能：${sk.length ? sk.join('、') : '没有（献祭巫系塔获得）'}${G.lich.tech ? ` · 巫妖之力 ${Math.min(LICH.techMax, G.lich.tech)} 级` : ''}`];
    },
    sell(t) { const L = t.lich; G.mem.巫妖塔 = { mana: t.mana, sk: { ...L.sk }, wit: L.wit, crit: L.crit, merit: L.merit }; },
  },
  // 兽王塔（原图 BIT 驯化、BIb 命令、BIV 每 2 秒、BIQ 每秒、BBr 攻击、BIe 杀敌）：驯化野兽（10 魔法，冷却 7 秒）把一个 12 级以下的敌人变成随从（最多 3 个），
  // 随机 1 个技能；第一次必定成功，之后 2 / 3 号随从位空着时也必定成功（照搬原图条件的优先级），否则 (40 + 训兽×2)/110；成功再扣 70 魔法，失败晕眩目标 4 秒。
  // 随从用怪物自己的攻击，吃训兽科技（每级 +700 攻击）；精英怪 +4000 攻击、+40% 攻速，按训兽等级还有几率带加攻 / 加速天赋。
  // 随从技能等级 = 随从等级（升级技能 14 木材，最高 5 级，放逐时返还）。兽王魔法 ≥ 1 时随从每秒放咆哮 / 火焰雨 / 践踏 / 雷霆一击，攻击时放其他技能，
  // 每 2 秒每个随从维持 0.1 魔法；魔法不足 1 时随从停手。离兽王 2000 以外拉回来。
  // 精训（400 魔法 + 10000 金）：选中的随从位，兽王攻击时 1/10 概率（每秒最多一次）刷新该随从技能并造成 3 倍攻击力 130 范围伤害。
  // 兽王 / 随从 / 灵魂塔杀敌 +1 魔法，灵魂锁链 +0.4~1。建造兽王时训兽科技重置为 1 级（原图 BB7）
  兽王塔: {
    init(t, mem) {
      t.maxMana = 2000; t.mana = mem ? mem.mana : 0; G.beast.tech = 1;
      t.bw = { sel: 0, slots: [null, null, null], os: [0, 0, 0], sec: 0, sec2: 0 };
      t.fake = Object.assign(Object.create(t), { stat: { str: 0, agi: 0, int: 0 }, sk: { fm: { slots: [] } } });   // 随从技能用伏魔那套，但没有英雄属性的加成
    },
    alive: (t, i) => { const s = t.bw.slots[i]; return s && G.towers.includes(s) ? s : null; },
    tick(t, dt) {
      const k = KITS.兽王塔, b = t.bw;
      if ((b.sec += dt) >= 1) {
        b.sec -= 1; b.os = b.os.map(v => v + 1);
        if (t.mana >= 1) for (let i = 0; i < 3; i++) { const s = k.alive(t, i); if (s && BEAST.idle.has(s.skill)) k.cast(t, s, nearest(s.x, s.y, 800)); }
      }
      if ((b.sec2 += dt) >= 2) {
        b.sec2 -= 2;
        for (let i = 0; i < 3; i++) { const s = k.alive(t, i); if (!s) continue;
          if (dist2(s.x, s.y, t.x, t.y) > 2000 * 2000) { s.x = t.x; s.y = t.y; }
          if (t.mana >= 1) t.mana -= 0.1; }
        for (let i = 0; i < 3; i++) { const s = k.alive(t, i); if (s) s.noAttack = t.mana < 1; }
      }
    },
    cast(t, s, tg) {
      const sk = FM_SKILL[s.skill]; if (!sk || !tg || !cdReady(s, 'sk')) return;
      if (sk.cast(s, t.fake, s.ul, tg) !== false) setCd(s, 'sk', lvl(sk.cd, s.ul));
    },
    attack(t, target) {
      const b = t.bw;
      for (let i = 0; i < 3; i++) {
        const s = KITS.兽王塔.alive(t, i);
        if (b.os[i] >= 1 && G.beast.elite[i] && rint(1, 10) === 1) {
          b.os[i] = 0; if (s) delete s.cds.sk;
          aoeAt(t, target.x, target.y, 130, towerStats(t).dmg * t.atkMul * 3, 'hero'); popText(t.x, t.y + 100, `${i + 1}+++`, '#ff3030');
        }
      }
    },
    tame(t, m) {
      const P = G.beast, b = t.bw;
      if (!m || m.dead || !G.monsters.includes(m) || m.neutral) return msg('驯化野兽：要选一个敌人');
      if (dist2(t.x, t.y, m.x, m.y) > 900 * 900) return msg('目标太远（施法距离 900）');
      if (!cdReady(t, 'tame')) return msg('驯化野兽冷却中');
      if (t.mana < BEAST.tameMana) return msg('魔法值不足');
      t.mana -= BEAST.tameMana; setCd(t, 'tame', BEAST.tameCd);
      const u = D.units[m.uid] || {}, free = [0, 1, 2].filter(i => !KITS.兽王塔.alive(t, i));
      const ok = (u.level || 1) <= 12 && m.uid !== 'Udea' && m.uid !== 'Udre' && free.length &&
        (rint(1, 110) <= 40 + P.tech * 2 || (!P.tamed && t.mana >= 80) || free.includes(1) || free.includes(2));
      if (!ok) { stun(m, 4); return msg(free.length ? '驯化失败：目标晕眩 4 秒' : '随从已满 3 个'); }
      if (P.tamed) t.mana = Math.max(0, t.mana - BEAST.tameMore);
      P.tamed = true; beastUnlock();
      const sk = pick(BEAST.skills), a0 = beastAtk(m.uid), a = a0 || BEAST_NOATK;
      let dmg = 0, as = 0;
      if (sk === '加强天赋') { dmg += 15000; as += 1.5; }
      if (m.elite) { dmg += 4000; as += 0.4; }
      if (rint(P.tech, 42) === 40) { as += 1.5; msg('该随从拥有 2 级加速天赋'); } else if (rint(P.tech, 20) === 15) { as += 0.8; msg('该随从拥有 1 级加速天赋'); }
      if (rint(P.tech, 42) === 40) { dmg += 15000; msg('该随从拥有 2 级加攻天赋'); } else if (rint(P.tech, 24) === 20) { dmg += 8000; msg('该随从拥有 1 级加攻天赋'); }
      m.dead = true; G.monsters = G.monsters.filter(o => o !== m);
      const slot = free[0], train = !!u.train;
      const s = summon(t, { fam: '随从', title: `${m.name}（${sk}）`, label: '随', x: m.x, y: m.y, skill: sk, ul: 1, slot, mobile: { speed: m.speed || 300, leash: 2000 }, unarmed: !a0,
        levels: [{ name: m.name, dmg: a.dmg, cd: a.cd, range: a.range, atk: a.type === 'siege' ? 'normal' : a.type, targets: 1, splash: a.splash || 0,
          abils: sk === '致命一击' ? [{ code: 'AOcr', A: 25, B: 10 }] : [] }],
        stats: () => ({ dmg: a.dmg + (train ? BEAST.trainAtk * (G.beast.tech - 1) : 0) + dmg, cd: a.cd, as }),
        onLaunch(f, tg) { if (!BEAST.idle.has(f.skill)) KITS.兽王塔.cast(t, f, tg); },
        onHit(f, e) { if (f.skill === '腐蚀') debuffM(e, 'fear', 200, 5); if (f.skill === '重击') { stun(e, 1.2); hurt(e, 5000, 'normal', f); } } });
      b.slots[slot] = s; FXS.ring(m.x, m.y, 160, '#ffd257', 0.6, 4); msg(`驯化成功：${s.title} 成为 ${slot + 1} 号随从${a0 ? '' : '（这种怪没有训兽科技打开攻击，不会攻击）'}`);
    },
    kill(t) { addMana(t, 1); },
    anyKill(t, owner) { if (owner !== t && owner.fam === '灵魂塔' && mine(owner) === mine(t)) addMana(t, 1); },
    cmds(t) {
      const b = t.bw, P = G.beast, cur = KITS.兽王塔.alive(t, b.sel);
      return [
        cmd('Q', '驯', '驯化野兽', `对一个 12 级以下的敌人使用（10 魔法，冷却 ${BEAST.tameCd} 秒，射程 900）：变成随从（最多 3 个），随机获得 1 个技能；成功再扣 70 魔法，失败目标晕眩 4 秒`,
          () => { G.pending = 'heroPick'; G.placing = null; G.heroPick = { label: '驯化这个敌人', fn: (x, y, hit) => KITS.兽王塔.tame(t, hit) }; msg('驯化野兽：选择一个敌人（Esc 取消）'); uiDirty(); },
          { disabled: !cdReady(t, 'tame'), cdOf: () => [cdLeft(t, 'tame'), BEAST.tameCd] }),
        cmd('W', '选', '选择随从', `当前：<b>${b.sel + 1} 号</b>${cur ? `（${cur.title}，${cur.ul} 级）` : '（空）'} → ${(b.sel + 1) % 3 + 1} 号`, () => { b.sel = (b.sel + 1) % 3; uiDirty(); }),
        costCmd(t, 'E', '升级技能', `升级选中随从的技能（最高 5 级），放逐时返还木材`, { wood: cur && cur.ul <= 4 ? BEAST.upWood : 0 }, () => { cur.ul++; msg(`随从[${b.sel + 1}]等级 ${cur.ul} 级`); },
          { why: !cur ? '这个随从位是空的' : cur.ul > 4 ? '已经是最高等级' : null }),
        cmd('R', '逐', '放逐随从', `放逐选中的随从，可以再驯化；返还升级用的木材`, () => {
          if (!cur) return msg('这个随从位是空的');
          G.wood += (cur.ul - 1) * BEAST.upWood; G.towers = G.towers.filter(o => o !== cur); b.slots[b.sel] = null; msg('放逐了随从'); uiDirty();
        }, { disabled: !cur }),
        costCmd(t, 'A', '驯兽', `训兽 ${P.tech}/${BEAST.trainMax}：驯服的野兽攻击 +${BEAST.trainAtk * (P.tech - 1)}，驯化几率 +${2 * P.tech}%`, { gold: P.tech <= 19 ? BEAST.trainGold : 0 }, () => { P.tech++; },
          { why: P.tech > 19 ? '已经是最高等级' : null }),
        costCmd(t, 'S', '精训', `激活选中的 ${b.sel + 1} 号随从位：兽王攻击时 1/10 概率刷新该随从的技能，并造成 3 倍攻击力伤害（每个随从位只激活一次，重造兽王保留）`,
          { gold: BEAST.eliteGold, mana: BEAST.eliteMana }, () => { P.elite[b.sel] = true; msg(`精训成功 ${b.sel + 1} 号随从位`); }, { why: P.elite[b.sel] ? '这个随从位已经精训过' : null }),
      ];
    },
    info(t) {
      const k = KITS.兽王塔;
      return [`训兽 ${G.beast.tech} 级 · 随从 ${[0, 1, 2].filter(i => k.alive(t, i)).length}/3${t.mana < 1 ? '（魔法不足，随从停手）' : ''}`, beastWpnTxt(),
        [0, 1, 2].map(i => { const s = k.alive(t, i); return `${i + 1} 号${G.beast.elite[i] ? '★' : ''}：${s ? `${s.skill} ${s.ul} 级` : '空'}`; }).join(' · ')];
    },
    sell(t) {
      for (let i = 0; i < 3; i++) { const s = KITS.兽王塔.alive(t, i); if (s) G.wood += (s.ul - 1) * BEAST.upWood; }   // 原图回收时随从移除、返还升级木材
      G.mem.兽王塔 = { mana: t.mana };
    },
  },
  // 小熊猫塔（土）（原图 BBd 攻击 / BDi 每秒放践踏、BGf 熊猫家族、BGi 火焰呼吸、BGk 熊猫大哥游荡、BGn 杀敌、BGq 强化）：攻击带粉碎（溅射同等伤害），
  // 熊猫践踏冷却好了就放。和小熊猫（火）、（风）都在时放践踏召唤熊猫大哥（120 秒，大哥同时放同等级践踏）；和任意一只火 / 风熊猫在时召唤熊猫小弟（60 秒）。
  // 三只小熊猫每放一次技能都会刷新熊猫大哥的冷却（火焰呼吸）。熊猫家族杀敌，土熊猫 +1 魔法。
  // 大地强化（80 魔法 + 3000 金）升践踏；家族大师（110 魔法 + 6 木）给所有熊猫 +360 攻击、+30% 攻速；火焰强化（200 魔法）加大哥火焰呼吸，并升火熊猫的咆哮
  '小熊猫塔（土）': {
    init(t, mem) { t.maxMana = 1000; t.mana = mem ? mem.mana : 0; },
    dmgPlus: () => PFAM.techAtk * (G.panda.master - 1), asPlus: () => PFAM.techAS * (G.panda.master - 1),
    attack(t, target, st, a) {
      aoeAt(t, target.x, target.y, 250, a.dmg, 'chaos');     // 粉碎 A0AR（顺劈 100%）
      KITS['小熊猫塔（土）'].stomp(t);
    },
    tick(t, dt) { if ((t.secAcc = (t.secAcc || 0) + dt) >= 1) { t.secAcc -= 1; KITS['小熊猫塔（土）'].stomp(t); } },
    fam: f => G.towers.filter(o => o.fam === f && mine(o)),
    stomp(t) {
      const k = KITS['小熊猫塔（土）'], L = G.panda.stomp;
      if (!cdReady(t, 'stomp') || !anyEnemy(t.x, t.y, 500)) return;
      setCd(t, 'stomp', PFAM.stompCd[L - 1]);
      for (const m of inRange(t.x, t.y, 500)) { hurt(m, PFAM.stomp[L - 1], 'magic', t); stun(m, 2); }
      FXS.nova(t.x, t.y, 500, '#c8a060', 0.4);
      const fire = k.fam('小熊猫塔（火）').length, wind = k.fam('小熊猫塔（风）').length, big = G.towers.find(o => o.fam === '熊猫大哥' && o.owner === t);
      const at = () => { const a = rnd(0, TAU); return { x: t.x + Math.cos(a) * 200, y: t.y + Math.sin(a) * 200 }; };
      if (fire && wind && !big) k.summonBig(t, at());
      const b2 = G.towers.find(o => o.fam === '熊猫大哥' && o.owner === t);
      if (b2) { delete b2.cds.breath; for (const m of inRange(b2.x, b2.y, 500)) { hurt(m, PFAM.stomp[L - 1], 'magic', b2); stun(m, 2); } FXS.nova(b2.x, b2.y, 500, '#c8a060', 0.4); }
      if ((fire || wind) && !G.towers.some(o => o.fam === '熊猫小弟' && o.owner === t)) {
        const p = at(), c = PFAM.small;
        summon(t, { fam: '熊猫小弟', title: '熊猫小弟', label: '弟', x: p.x, y: p.y, until: G.t + c.life, mobile: { speed: 350, leash: 600 },
          levels: [{ name: '熊猫小弟', dmg: c.dmg, cd: c.cd, range: c.range, atk: 'hero', targets: 1, splash: c.splash, abils: [] }],
          stats: () => ({ dmg: c.dmg + PFAM.techAtk * (G.panda.master - 1), cd: c.cd, as: PFAM.techAS * (G.panda.master - 1) }) });
      }
    },
    summonBig(t, p) {
      const c = PFAM.big;
      summon(t, { fam: '熊猫大哥', title: '熊猫大哥', label: '哥', x: p.x, y: p.y, until: G.t + c.life, mobile: { speed: 450, leash: 600 },
        levels: [{ name: '熊猫大哥', dmg: c.dmg, cd: c.cd, range: c.range, atk: 'normal', targets: 1, splash: c.splash, abils: [] }],
        stats: () => ({ dmg: c.dmg + PFAM.techAtk * (G.panda.master - 1), cd: c.cd, as: PFAM.techAS * (G.panda.master - 1) }),
        onLaunch(b, tg) {                        // 火焰呼吸（冷却 30 秒，小熊猫放技能时刷新）
          if (!cdReady(b, 'breath')) return;
          setCd(b, 'breath', c.breathCd);
          const d = (21 - rankOf(G.me)) * 2000 + (G.panda.fire - 1) * 2000;
          aoeAt(b, tg.x, tg.y, 400, d, 'chaos', { ignoreArmor: true }); FXS.nova(tg.x, tg.y, 400, '#ff6a2a', 0.5); popText(b.x, b.y + 100, '+' + fmt(d) + '！', '#ff3030');
        } });
      msg('熊猫大哥出现进行守护');
    },
    bigReset(o) { for (const b of G.towers) if (b.fam === '熊猫大哥' && mine(b) === mine(o)) delete b.cds.breath; },
    kill(t) { addMana(t, 1); },
    anyKill(t, owner) { if (owner !== t && (owner.fam === '小熊猫塔（火）' || owner.fam === '小熊猫塔（风）') && mine(owner) === mine(t)) addMana(t, 1); },
    cmds(t) {
      const P = G.panda;
      return [
        costCmd(t, 'Q', '大地强化', `熊猫践踏 ${P.stomp}/6 级：500 范围 ${PFAM.stomp[P.stomp - 1]} 伤害 + 晕 2 秒，冷却 ${PFAM.stompCd[P.stomp - 1]} 秒（熊猫大哥一起放）`,
          { mana: P.stomp < 6 ? 80 : 0, gold: P.stomp < 6 ? 3000 : 0 }, () => { P.stomp++; }, { why: P.stomp >= 6 ? '已经是最高等级' : null }),
        costCmd(t, 'W', '家族大师', `家族大师 ${P.master}/10 级：所有熊猫（三只小熊猫、大哥、小弟）攻击 +${PFAM.techAtk * (P.master - 1)}、攻速 +${pctTxt(PFAM.techAS * (P.master - 1))}`,
          { mana: P.master < 10 ? 110 : 0, wood: P.master < 10 ? 6 : 0 }, () => { P.master++; }, { why: P.master >= 10 ? '已经是最高等级' : null }),
        costCmd(t, 'E', '火焰强化', `火焰强化 ${P.fire}/8 级：熊猫大哥火焰呼吸 +${(P.fire - 1) * 2000}；小熊猫（火）的咆哮 ${P.fire} 级`,
          { mana: P.fire < 8 ? 200 : 0 }, () => { P.fire++; }, { why: P.fire >= 8 ? '已经是最高等级' : null }),
      ];
    },
    info(t) {
      const k = KITS['小熊猫塔（土）'], P = G.panda;
      return [`熊猫践踏 ${P.stomp} 级 · 家族大师 ${P.master} 级 · 火焰强化 ${P.fire} 级`,
        `熊猫家族：火 ${k.fam('小熊猫塔（火）').length ? '✓' : '✗'} 风 ${k.fam('小熊猫塔（风）').length ? '✓' : '✗'}（火风都在时召唤熊猫大哥，有一只时召唤小弟）`];
    },
    sell(t) { G.mem['小熊猫塔（土）'] = { mana: t.mana }; },
  },
  // 原始指挥官（原图 BI9 攻击、BJD 宁静 / 强化、BJM 雷霆一击伤害、BJJ 杀敌）：自己的塔攻击指挥官 1000 范围内的敌人时，冷却好了就放宁静（21 秒）：
  // 建成后第一次放什么都不发生（原图只记下标记），之后放时召唤马甲 3.4 秒，每秒按开局随机的宁静类型放两种技能（恐惧 / 雷霆一击 / 加速）；
  // 雷霆一击再对 1000 范围造成 魔法值×18 英雄无视护甲伤害。玩家的塔杀敌指挥官 +1 魔法（重建时魔法清零）。
  // 强化原始塔：宁静范围内的 MAX 原始塔攻击时按等级额外伤害（乘 MAX 原始塔数量）。天赋（30 木材）宁静+：马甲技能 2 级
  原始指挥官: {
    init(t) { t.maxMana = 3000; t.mana = 0; t.cmd = { flag: false }; },
    talent: { wood: 30, name: '宁静+', why: () => G.cmd.lv >= 2, use() { G.cmd.lv = 2; }, tip: '宁静召唤的马甲技能升到 2 级' },
    anyAttack(t, o, m) {
      if (!mine(o) || dist2(m.x, m.y, t.x, t.y) > 1000 * 1000) return;
      const C = G.cmd;
      if (cdReady(t, 'calm')) KITS.原始指挥官.calm(t);
      if (o.cat !== 'raw' || !isMax(o)) return;
      const hd = G.towers.filter(x => mine(x) && x.cat === 'raw' && isMax(x)).length, y = C.ys;
      if (o.fam === '通灵塔' && y[0] && rint(1, 100) <= 4) aoeAt(o, m.x, m.y, 300, hd * y[0] * 1500, 'normal', { ignoreArmor: true });
      if (o.fam === '闪电塔' && y[1] && rint(1, 100) <= 1) aoeAt(o, m.x, m.y, 60, hd * y[1] * 8000, 'magic', { ignoreArmor: true });
      if (o.fam === '混乱塔' && y[2]) aoeAt(o, m.x, m.y, 200, hd * y[2] * 600, 'chaos');
      if (o.fam === '破坏塔' && y[3] && rint(1, 100) <= 9) aoeAt(o, m.x, m.y, 50, hd * y[3] * 15000, 'magic');
      if (o.fam === '箭塔' && y[4] && rint(1, 100) <= y[4] * 15) aoeAt(o, o.x, o.y, 800, hd * 600, 'pierce', { ignoreArmor: true });
      if (o.fam === '牛头塔' && y[5] && rint(1, 100) <= 25) aoeAt(o, o.x, o.y, 500, hd * y[5] * 1000, 'chaos', { ignoreArmor: true });
    },
    calm(t) {
      setCd(t, 'calm', CMDR.cd);
      FXS.nova(t.x, t.y, 1000, '#9fffb0', 0.6);
      if (!t.cmd.flag) { t.cmd.flag = true; return; }
      const C = G.cmd, L = C.lv - 1, x = t.x, y = t.y;
      const howl = () => { for (const m of inRange(x, y, 1000)) debuffM(m, 'fear', CMDR.armor[L], 1.5); };
      const clap = () => { for (const m of inRange(x, y, 1000)) slowM(m, CMDR.slow[L], CMDR.slowDur[L]); aoeAt(t, x, y, 1000, t.mana * 18, 'hero', { ignoreArmor: true }); FXS.nova(x, y, 1000, '#ffe9a0', 0.4); };
      const haste = () => { for (const o of alliesNear(x, y, 1000)) giveBuff(o, 'fire', CMDR.haste[L], 1.5); };
      const fx = [[howl, clap], [clap, haste], [haste, howl]][C.type - 1];
      for (let s = 0; s < CMDR.life; s += 1) later(s, () => { if (G.towers.includes(t)) fx.forEach(f => f()); });
    },
    kill(t) { addMana(t, 1); },
    anyKill(t, owner) { if (owner !== t && mine(owner) === mine(t)) addMana(t, 1); },
    cmds(t) {
      const y = G.cmd.ys;
      return CMDR.ys.map((c, i) => costCmd(t, 'QWERAS'[i], `强化${c.name}`, `${c.name} ${y[i]}/4 级：宁静范围内的${c.fam} MAX ${c.tip}（再乘 MAX 原始塔数量）`,
        { wood: y[i] < 4 ? 8 : 0, mana: y[i] < 4 ? c.mana : 0 }, () => { y[i]++; }, { why: y[i] >= 4 ? '已经是最高等级' : null, o: { ico: 'abil-' + ['A0AN', 'A0AV', 'A0AW', 'A0AX', 'A0AZ', 'A0B0'][i] } }));
    },
    info(t) {
      const C = G.cmd;
      return [`宁静（${CMDR.types[C.type - 1]}${C.lv > 1 ? '，天赋 2 级' : ''}）：${cdReady(t, 'calm') ? '就绪' : Math.ceil(cdLeft(t, 'calm')) + ' 秒'}${t.cmd.flag ? '' : '（建成后第一次放不生效）'}`,
        CMDR.ys.map((c, i) => `${c.name} ${C.ys[i]}`).join(' · ')];
    },
  },
  // 五行塔（原图 BFn 五行激活、BFq 切换五行、BBU / BFt 攻击、BF3 杀敌升级、BF0 杀敌魔法、BFv / BFx 冷却窗口、Bag 天赋）：
  // 切换五行选一个元素，五行激活（第 n 个花 n²×500 金）吞噬自己的 1 级光环塔（或对自己用：金 / 木）获得该元素的一种技能，每个元素只能选一种。
  // 杀敌时选中元素的技能魔法 ≥ 200、木材 ≥ 3 就升 1 级（最高 8 级，MAX 塔 10 级）。金·强化五行加基础攻击并换成 250 范围穿刺攻击（第二武器），
  // 木·强化五行加基础攻击（木·强化的额外伤害照搬原图：80 + 等级²）。杀敌（含水五行）得 1 / 1.5 / 2 / 2.5 魔法。
  // 天赋（MAX，30 木材）：随机一种元素（土 / 木 / 火）的技能伤害再打一次（无视护甲）
  五行塔: {
    init(t) { const W = G.wx; t.maxMana = 500; t.mana = W.mana; t.wx = { el: 1, lv: { ...W.lv } }; },
    talent: { wood: 30, name: '五行天赋', max: true, why: () => G.wx.js, use() { const r = rint(1, 3); G.wx.js = r === 1 ? 1 : rint(1, 2) === 2 ? 2 : 3; msg(`五行塔 MAX 获得了额外无视护甲${['', '土', '木', '火'][G.wx.js]}伤害`); }, tip: '随机让土 / 木 / 火的技能伤害再造成一次（无视护甲）' },
    L: (t, k) => t.wx.lv[k] || 0,
    dmgPlus: t => 80 * KITS.五行塔.L(t, 'goldSelf') + 120 * KITS.五行塔.L(t, 'woodSelf'),   // R004 / R002：每级 +80 / +120 基础攻击
    weapon: t => KITS.五行塔.L(t, 'goldSelf') ? curLevel(t).weap2 : null,                 // R003 打开 250 范围穿刺的第二武器
    auras(t) {
      const L = k => KITS.五行塔.L(t, k), out = [], r = 900;
      if (L('goldAura')) out.push({ kind: 'towerDmg', r, v: WX.goldAura[L('goldAura') - 1] });
      if (L('earthAtk')) out.push({ kind: 'towerDmg', r, v: WX.earthAtk[L('earthAtk') - 1] });
      if (L('waterAS')) out.push({ kind: 'towerAS', r, v: WX.waterAS[L('waterAS') - 1] });
      if (L('fireAS')) out.push({ kind: 'towerAS', r, v: WX.fireAS[L('fireAS') - 1] });
      if (L('woodAura')) out.push({ kind: 'slow', r, v: WX.woodAura[L('woodAura') - 1] });
      if (L('waterSlow')) out.push({ kind: 'slow', r, v: WX.waterSlow[L('waterSlow') - 1] });
      if (L('fireArmor')) out.push({ kind: 'armor', r, v: WX.fireArmor[L('fireArmor') - 1] });
      if (L('earthArmor')) out.push({ kind: 'armor', r, v: WX.earthArmor[L('earthArmor') - 1] });
      return out;
    },
    attack(t, target, st, a) {
      const W = G.wx, L = k => KITS.五行塔.L(t, k), x = target.x, y = target.y;
      if (L('goldAura')) a.targets = chainTargets(target, 7, 500);                    // 金·攻击光环：弹射 7 个
      // 木
      const wa = L('woodAura'), ws = L('woodSelf');
      if (wa && rint(1, 100) <= 10 + wa * 2) { const d = wa * wa * 300; aoeAt(t, x, y, 250, d, 'normal'); if (W.js === 2) aoeAt(t, x, y, 250, d, 'normal', { ignoreArmor: true }); }
      else if (ws && rint(1, 100) <= 10 + ws * 2) { const d = 80 + ws * ws; hurt(target, d, 'normal', t, { ignoreArmor: true }); if (W.js === 2) hurt(target, d, 'normal', t, { ignoreArmor: true }); }
      // 水：每 6 秒（全局）最多召一次水五行，活 2 秒
      const win = Math.floor(G.t / 6), wsl = L('waterSlow'), was = L('waterAS');
      if ((wsl || was) && W.waterWin !== win) {
        W.waterWin = win;
        const lv = wsl || was, b = lv >= 10 ? 3 : lv >= 7 ? 2 : lv >= 4 ? 1 : 0, [d, cd] = (wsl ? WX.water.slow : WX.water.as)[b];
        summon(t, { fam: '水五行', title: '水五行', label: '水', x: t.x + rnd(-60, 60), y: t.y + rnd(-60, 60), until: G.t + 2,
          levels: [{ name: '水五行', dmg: d, cd, range: 600, atk: 'chaos', targets: 1, splash: 25, splashH: 50, splashF: 0.5, abils: [] }] });
      }
      // 土：每 2.5 秒（全局）最多一次
      const ea = L('earthArmor'), et = L('earthAtk'), ewin = Math.floor(G.t / 2.5);
      if ((ea || et) && W.earthWin !== ewin) {
        W.earthWin = ewin;
        const d = ea ? ea * ea * 80 : et * et * 120;
        aoeAt(t, x, y, 200, d, 'hero'); stunArea({ x, y }, 200, 1); FXS.nova(x, y, 200, '#c8a060', 0.35);
        if (W.js === 1) aoeAt(t, x, y, 200, d, 'hero', { ignoreArmor: true });
      }
      // 火：攻击计数
      const fa = L('fireAS'), fr = L('fireArmor');
      if (W.fn >= 24 && fa) { W.fn = 0; aoeAt(t, t.x, t.y, 800, fa * fa * 900, 'magic'); if (W.js === 3) aoeAt(t, t.x, t.y, 800, fa * fa * 600, 'magic', { ignoreArmor: true }); FXS.nova(t.x, t.y, 800, '#ff5a2a', 0.5); }
      else if (W.fn >= 16 && fr) { W.fn = 0; const d = fr * fr * 350; aoeAt(t, t.x, t.y, 800, d, 'magic', { ignoreArmor: true }); if (W.js === 3) aoeAt(t, t.x, t.y, 800, d, 'magic', { ignoreArmor: true }); FXS.nova(t.x, t.y, 800, '#ff5a2a', 0.5); }
      else W.fn++;
    },
    kill(t) {
      addMana(t, WX.mana[t.lv]);
      const opts = WX.opts[t.wx.el - 1], k = opts.map(o => o[0]).find(o => t.wx.lv[o]), cap = isMax(t) ? 9 : 7;
      if (k && G.wood >= 3 && t.mana >= 200 && t.wx.lv[k] <= cap) { t.wx.lv[k]++; G.wx.lv[k] = t.wx.lv[k]; t.mana -= 200; G.wood -= 3; msg(`五行塔：${opts.find(o => o[0] === k)[2]}升到 ${t.wx.lv[k]} 级`); }
    },
    activate(t, o) {
      const W = G.wx, el = t.wx.el, opts = WX.opts[el - 1], cost = W.fu * W.fu * 500;
      if (G.gold < cost) return msg(`激活失败：要 ${cost} 金币`);
      if (opts.some(p => t.wx.lv[p[0]])) return msg(`激活失败：${WX.names[el - 1]}已经激活过`);
      const pick1 = opts.find(p => o === t ? p[1] === '五行塔' : o && mine(o) && o.fam === p[1] && o.lv === 0);
      if (!pick1) return msg(`激活失败：${WX.names[el - 1]}要吞噬 ${opts.map(p => p[1] === '五行塔' ? '五行塔自己' : '1 级' + p[1]).join(' 或 ')}`);
      G.gold -= cost; W.fu++; t.wx.lv[pick1[0]] = 1; W.lv[pick1[0]] = 1;
      if (o !== t) { G.towers = G.towers.filter(x => x !== o); if (G.selected === o) G.selected = t; }
      FXS.ring(t.x, t.y, 200, '#ffd257', 0.6, 4); msg(`激活成功：${pick1[2]}`); uiDirty();
    },
    cmds(t) {
      const el = t.wx.el, opts = WX.opts[el - 1];
      return [
        cmd('Q', '五', '切换五行', `当前：<b>${WX.names[el - 1]}</b> → ${WX.names[el % 5]}<br>杀敌时魔法 ≥ 200、木材 ≥ 3 自动升级当前元素的技能<br>${WX.names[el - 1]}：${opts.map(p => `吞噬${p[1] === '五行塔' ? '自己' : '1 级' + p[1]} → ${p[2]}`).join('；')}`,
          () => { t.wx.el = el % 5 + 1; uiDirty(); }),
        cmd('W', '激', '五行激活', `第 ${G.wx.fu} 个要 <span class="gold">${G.wx.fu * G.wx.fu * 500} 金</span>：对自己的 1 级光环塔（或五行塔自己）使用，获得当前元素的技能，被吞噬的光环塔消失`,
          () => { G.pending = 'heroPick'; G.placing = null; G.heroPick = { label: '吞噬这座塔', fn: (x, y, hit) => KITS.五行塔.activate(t, hit) }; msg('五行激活：选择 1 级光环塔或五行塔自己（Esc 取消）'); uiDirty(); }),
      ];
    },
    info(t) {
      const got = WX.opts.flatMap(o => o).filter(p => t.wx.lv[p[0]]).map(p => `${p[2]} ${t.wx.lv[p[0]]} 级`);
      return [`切换五行：${WX.names[t.wx.el - 1]}${G.wx.js ? ` · 天赋：额外${['', '土', '木', '火'][G.wx.js]}伤害` : ''}`, got.length ? got.join(' · ') : '还没有激活五行（五行激活吞噬 1 级光环塔）'];
    },
    sell(t) { G.wx.mana = t.mana; },
  },
  // 人马塔（原图 BBL 攻击、BEb 放技能 / 升级、BEe 杀敌、BEh 建成）：每次攻击对目标 80 范围造成 (爆雷 + 雷怒 + 雷嗜 - 3)×400 穿刺伤害，冷却好了就放雷霆：
  // 雷嗜范围（500 + 50×(雷嗜-1)）内敌人护甲永久 -(4 + 4×MAX 另类塔数)；雷踏 2 级起再加 (雷踏-1)×200×MAX 另类塔数 通用伤害（毁灭时 ×3，小马 ×1.1）；
  // 然后 (爆雷×2+4)/180 概率（毁灭时必定）爆雷：5 倍伤害并晕眩（战争践踏，按雷嗜等级），否则普通伤害 [MAX 另类塔数² × 900（超过 9 座按 90000）+ 30 + 800×(雷怒-1)]。
  // 人马自己和 MAX 另类塔杀敌，人马 +1 魔法。升级：狂雷（雷霆等级×600 金，冷却缩短）、爆雷 300 魔法、雷怒 2 木 + 30 魔法、雷踏 4 木、雷嗜 2 木 + 50 魔法。
  // 照搬原图的变量：升雷踏时记成了雷怒的变量（FI），所以攻击伤害里的"雷怒"会变成雷踏等级，回收再建时雷怒恢复成那个数
  // 天赋（30 木材）雷霆（狂暴）：每放 6 次普通雷霆后变成每 0.2 秒一次，到第 10 次恢复
  人马塔: {
    init(t) {
      const R = G.rm;
      t.maxMana = 1000; t.mana = R.fj;
      t.rm = { thunder: R.k0, bomb: R.fg, rage: R.fi, eat: R.fh, step: Math.max(1, R.kz) };
      R.hg = 0;
    },
    talent: { wood: 30, name: '雷霆（狂暴）', why: () => G.rm.hh, use() { G.rm.hh = true; }, tip: '普通雷霆放 6 次后，变成每 0.2 秒一次，到第 10 次恢复' },
    maxAlt: () => G.towers.filter(o => mine(o) && o.cat === 'alt' && isMax(o)).length,
    attack(t, target) {
      const R = G.rm;
      aoeAt(t, target.x, target.y, 80, (R.fg + R.fi + R.fh - 3) * 400, 'pierce');
      if (cdReady(t, 'thunder')) KITS.人马塔.thunder(t);
    },
    thunder(t) {
      const c = t.rm, R = G.rm, ff = KITS.人马塔.maxAlt(), brk = G.t < R.breakAt + CENT.breakDur, hj = G.petFx.hj || 0;
      setCd(t, 'thunder', CENT.thunderCd[c.thunder - 1]);
      const r = 500 + 50 * (c.eat - 1);
      for (const m of inRange(t.x, t.y, r)) m.armor -= 4 * ff + 4;                      // 惊恐：永久扣基础护甲
      if (++R.hg >= 10) { c.thunder = R.k0; R.hg = 0; } else if (R.hg >= 6 && R.hh) c.thunder = 12;
      if (c.step >= 2) { const d = (c.step - 1) * (brk ? 600 : 200) * ff * (G.petFx.kw || 1); aoeAt(t, t.x, t.y, r, d, 'hero'); }
      const base = (ff <= 9 ? ff * ff * 900 : 90000) + 30 + 800 * (c.rage - 1);
      if (rint(1, 180) <= c.bomb * 2 + 4 || brk) {
        const rr = ff <= 9 ? 500 + hj * 100 + 50 * (c.eat - 1) : 500 + (hj + 100) + 50 * (c.eat - 1);
        aoeAt(t, t.x, t.y, rr, base * 5, 'hero'); stunArea(t, 500 + 50 * (c.eat - 1), 3 + 0.5 * (c.eat - 1));
        popText(t.x, t.y + 100, '爆雷' + fmt(base * 5) + '！', '#ff3030'); FXS.nova(t.x, t.y, rr, '#ffe08a', 0.5);
      } else {
        const rr = ff <= 9 ? 500 + hj * 100 + 30 * (c.eat - 1) : 500 + (hj + 100) + 50 * (c.eat - 1);
        aoeAt(t, t.x, t.y, rr, base, 'hero'); FXS.nova(t.x, t.y, rr, '#d8b070', 0.35);
      }
    },
    kill(t) { addMana(t, 1); },
    anyKill(t, owner) { if (owner !== t && owner.cat === 'alt' && isMax(owner) && mine(owner)) addMana(t, 1); },
    cmds(t) {
      const c = t.rm, R = G.rm, ff = KITS.人马塔.maxAlt();
      return [
        costCmd(t, 'Q', '升级狂雷', `雷霆 ${c.thunder > 11 ? '狂暴' : c.thunder + ' 级'}：冷却 ${CENT.thunderCd[c.thunder - 1]} 秒 → 下一级 ${CENT.thunderCd[Math.min(10, c.thunder)]} 秒`,
          { gold: c.thunder < 11 ? c.thunder * 600 : 0 }, () => { c.thunder++; R.k0++; }, { why: c.thunder >= 11 ? '已经是最高等级' : null }),
        costCmd(t, 'W', '爆雷', `爆雷 ${c.bomb}/10：雷霆有 ${((c.bomb * 2 + 4) / 1.8).toFixed(1)}% 概率 5 倍伤害并晕眩`, { mana: c.bomb < 10 ? 300 : 0 }, () => { c.bomb++; R.fg = c.bomb; }, { why: c.bomb >= 10 ? '已经是最高等级' : null }),
        costCmd(t, 'E', '雷怒', `雷怒 ${c.rage}/11：雷霆伤害 +${800 * (c.rage - 1)}`, { wood: c.rage < 11 ? 2 : 0, mana: c.rage < 11 ? 30 : 0 }, () => { c.rage++; R.fi = c.rage; }, { why: c.rage >= 11 ? '已经是最高等级' : null }),
        costCmd(t, 'R', '雷踏', `雷踏 ${c.step}/11：雷霆附加 ${(c.step - 1) * 200 * ff} 通用伤害（等级-1 × 200 × MAX 另类塔 ${ff} 座）`, { wood: c.step < 11 ? 4 : 0 }, () => { c.step++; R.fi = c.step; }, { why: c.step >= 11 ? '已经是最高等级' : null }),
        costCmd(t, 'A', '雷嗜', `雷嗜 ${c.eat}/11：雷霆范围 ${500 + 50 * (c.eat - 1)}，爆雷晕眩 ${3 + 0.5 * (c.eat - 1)} 秒`, { wood: c.eat < 11 ? 2 : 0, mana: c.eat < 11 ? 50 : 0 }, () => { c.eat++; R.fh = c.eat; }, { why: c.eat >= 11 ? '已经是最高等级' : null }),
        costCmd(t, 'S', '毁灭', `开启毁灭模式 ${CENT.breakDur} 秒：每次雷霆都爆雷，雷踏伤害 3 倍。冷却 ${CENT.breakCd} 秒（回收后冷却不变）`, {},
          () => { R.breakAt = G.t; FXS.ring(t.x, t.y, 200, '#ff5a4f', 0.6, 4); }, { why: G.t < R.breakAt + CENT.breakCd ? '冷却中' : null, o: { cdOf: () => [Math.max(0, R.breakAt + CENT.breakCd - G.t), CENT.breakCd] } }),
      ];
    },
    info(t) {
      const c = t.rm, ff = KITS.人马塔.maxAlt();
      return [`MAX 另类塔 ${ff} 座：雷霆 ${fmt((ff <= 9 ? ff * ff * 900 : 90000) + 30 + 800 * (c.rage - 1))} 通用伤害，敌人护甲永久 -${4 * ff + 4}`,
        `雷霆 ${c.thunder > 11 ? '狂暴' : c.thunder + ' 级'} · 爆雷 ${c.bomb} · 雷怒 ${c.rage} · 雷踏 ${c.step} · 雷嗜 ${c.eat}${G.t < G.rm.breakAt + CENT.breakDur ? ' · 毁灭中' : ''}`];
    },
    sell(t) { const c = t.rm, R = G.rm; R.fg = c.bomb; R.fi = c.rage; R.fh = c.eat; R.kz = c.step; R.fj = t.mana; },
  },

  // ---------------------------------------------------------------- 另类塔
  // 灵魂塔：灵魂锁链（自动）对攻击目标造成魔法伤害，并让它的护甲被无视 1 秒
  // 魔石塔选了灵魂（Db）：+Db×15（1 级）/ Db×80（原图 BEC）。天赋（25 木材，A0S3 2 级）：MAX 冷却 2 → 1 秒
  灵魂塔: {
    chain: t => { const [d, cd] = [[1000, 3], [5000, 3], [20000, 3], [40000, 2]][t.lv], db = stoneLv(t, 4); return [d + db * (t.lv ? 80 : 15), t.talent ? 1 : cd]; },
    attack(t, target) {
      const [d, cd] = KITS.灵魂塔.chain(t);
      if (!cdReady(t, 'chain')) return;
      setCd(t, 'chain', cd);
      hurt(target, d, 'magic', t); target.ignoreArmorUntil = G.t + 1;
      FXS.beam(t.x, t.y, 160, target.x, target.y, 50, '#c48bff', 1.4, 0.3); FXS.souls(target.x, target.y, 60, '#c48bff');
      for (const o of G.towers) if (o.fam === '兽王塔' && mine(o) === mine(t)) addMana(o, [0.4, 0.6, 0.8, 1][t.lv]);   // 原图 BCE：灵魂锁链给兽王魔法
    },
    talent: { wood: 25, name: '灵魂之指（速技）', max: true, tip: '灵魂锁链冷却 2 → 1 秒' },
    info(t) { const [d, cd] = KITS.灵魂塔.chain(t); return [`灵魂锁链：${d} 魔法伤害 + 无视护甲 1 秒，冷却 ${cd} 秒`]; },
  },
  // 弹跳塔（原图触发器 BE5 提升 / BE8 杀敌得魔法 / BFc 转移魔法 / BFS 合成 / BFW 天赋快建 / BBr 灵魂重击）：
  // 杀敌 +1 魔法（上限 300）。提升基础攻击 / 攻速是玩家科技，对所有弹跳塔（含 MAX）生效，回收不返还。
  // 3 座 4 级弹跳塔 + 10000 金合成弹跳塔 MAX（全场 1 个，保留施法那座的魔法）；MAX 每次攻击对目标放灵魂重击，杀精英 20% 升级。
  // 激活 MAX 的弹跳天赋（守卫者激活天赋，30 木材）后，MAX 回收了再建弹跳塔：金币 ≥ 58000 且空余人口 ≥ 2 时扣 58000，所有 1 级弹跳塔回收，直接变成 MAX
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
  // MAX 的图腾之链 A01Q 技能表有 11 级、说明写"魔法值越高伤害越大"，法力爆怒 A0H9 说明写额外魔法×1.5 伤害，但原图没有触发器用到它们：照搬，一直 1 级、法力爆怒没效果
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
      setCd(t, 'wisp', t.talent ? 2.5 : cd);
      for (let i = 0; i < n; i++) FXS.launch('wisp', { x: t.x, y: t.y, z: 150 }, pick(ms), (hit, x, y) => {
        for (const m of inRange(x, y, 200)) { hurt(m, d, 'magic', t); stun(m, root); }
        FXS.ring(x, y, 200, '#9fffb0', 0.35, 3);
      });
    },
    talent: { wood: 25, name: '召唤精灵（捷技）', max: true, tip: '召唤精灵冷却 3.2 → 2.5 秒（A06B 2 级）' },
    info(t) { const [n, d, root, cd] = KITS.精灵塔.lv(t); return [`召唤精灵：每 ${t.talent ? 2.5 : cd} 秒 ${n} 个，每个 ${d} 魔法伤害、纠缠 200 范围 ${root} 秒`]; },
  },
  // 破坏塔 MAX：极速破坏 A0GK（攻速"耐久光环"，和加速光环不叠加）1~4 级攻速 +100% / +200% / +400% / +600%（技能表数值，说明写的是 +100%~+400%）；
  // 杀敌 +1 魔法（原图 BGc，魔法上限 400、每秒回 0.2），攻击时技能等级升到 魔法÷100（只升不降，原图 BBr 一带）
  破坏塔: {
    haste: [1, 2, 4, 6],
    tick(t) { if (isMax(t)) { t.maxMana = 400; t.manaRegen = 0.2; t.gk = t.gk || 1; } },
    self: t => isMax(t) ? { as: KITS.破坏塔.haste[t.gk - 1] } : null,
    attack(t) { if (isMax(t) && t.gk < Math.min(4, Math.floor(t.mana / 100))) { t.gk = Math.min(4, Math.floor(t.mana / 100)); msg(`破坏塔 MAX：极速破坏升到 ${t.gk} 级`); } },
    kill(t) { if (isMax(t)) addMana(t, 1); },
    info: t => isMax(t) ? [`极速破坏 ${t.gk || 1} 级：攻速 +${pctTxt(KITS.破坏塔.haste[(t.gk || 1) - 1])}（不和加速光环叠加）${(t.gk || 1) < 4 ? `，魔法 ${(t.gk || 1) * 100 + 100} 时升级` : ''}`] : [],
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
  // 毒塔天赋抽到战略（A00X）：冷却 20 秒，攻击时自动放：10 秒攻击 +600%（咆哮），再让一只龙鹰骑士给它放嗜血术 A00Y（攻速 -15%）
  毒塔: {
    attack(t) {
      if (!t.strat || !cdReady(t, 'strat')) return;
      setCd(t, 'strat', 20); giveBuff(t, 'roar', 6, 10); giveBuff(t, 'strat', 0.15, 10);
      FXS.nova(t.x, t.y, 200, '#ffb347', 0.4);
    },
    info: t => t.strat ? [`战略：${cdReady(t, 'strat') ? '就绪' : Math.ceil(cdLeft(t, 'strat')) + ' 秒'}（10 秒攻击 +600%、攻速 -15%）`] : [],
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
      const [one, r, area] = t.talent ? [3000, 250, 400] : [1500, 200, 250];     // 天赋伤害加深（原图 BBm 的 UserData = 1）
      if (b.mode === 1) hurt(target, one * n, 'hero', t, { ignoreArmor: true });
      else { aoeAt(t, target.x, target.y, r, area * n, 'hero', { ignoreArmor: true }); FXS.ring(target.x, target.y, r, '#ffd257', 0.25, 3); }
    },
    cmds(t) {
      const b = t.ba;
      return [
        cmd('Q', '转', '转换攻击效果', `当前：<b>${b.mode === 1 ? '单体' : '范围'}</b>。单体：伤害等级×1500 无视护甲伤害 + 晕眩 0.8 秒；范围：200 范围 伤害等级×250`,
          () => { b.mode = 3 - b.mode; uiDirty(); }),
        costCmd(t, 'W', '升级伤害', `伤害等级 ${b.lv - 1}/10`, { wood: b.lv < 11 ? 2 : 0 }, () => { b.lv++; }, { why: b.lv >= 11 ? '已经是最高等级' : null }),
      ];
    },
    info(t) { const n = t.ba.lv - 1, k = t.talent ? [3000, 400] : [1500, 250]; return [`双刃箭（${t.ba.mode === 1 ? '单体' : '范围'}）：伤害等级 ${n}，${t.ba.mode === 1 ? k[0] * n : k[1] * n} 伤害，每次 2 魔法`]; },
  },
  // 死亡塔（原图 BBp：每次攻击放雷霆一击"死亡呐喊"和恐怖嚎叫"死亡"，冷却好了才放出来）：650 范围敌人护甲 -10~-50（4 秒，冷却 2 秒），
  // 攻速 / 移速 -18%~-50%（3~4 秒，冷却 3 秒，MAX 2 秒）。MAX 杀敌 +1 魔法（最多 400，升级时保留）。天赋（25 木材）：减甲 70、减速 70%
  死亡塔: {
    tick(t) { t.maxMana = isMax(t) ? 400 : 0; },
    attack(t) {
      const lv = curLevel(t), howl = abil(lv, 'ANht'), clap = abil(lv, 'AHtc'), tl = t.talent;
      if (howl && cdReady(t, 'howl')) {
        setCd(t, 'howl', howl.cool || 2);
        for (const m of inRange(t.x, t.y, howl.area || 650)) debuffM(m, 'fear', tl ? 70 : howl.B, howl.dur || 4);
        FXS.nova(t.x, t.y, howl.area || 650, '#9a4dff', 0.4);
      }
      if (clap && cdReady(t, 'clap')) {
        setCd(t, 'clap', clap.cool || 3);
        for (const m of inRange(t.x, t.y, clap.area || 650)) slowM(m, tl ? 0.7 : clap.D, clap.dur || 3);
        FXS.ring(t.x, t.y, clap.area || 650, '#c0c0ff', 0.4, 4);
      }
    },
    kill(t) { if (isMax(t)) addMana(t, 1); },
    talent: { wood: 25, name: '呐喊尖啸（强化）', max: true, tip: '死亡减护甲 50 → 70，死亡呐喊减速 50% → 70%' },
    info(t) {
      const lv = curLevel(t), howl = abil(lv, 'ANht') || {}, clap = abil(lv, 'AHtc') || {};
      return [`死亡：650 范围护甲 -${t.talent ? 70 : howl.B} ${howl.dur} 秒（冷却 ${howl.cool} 秒）`,
        `死亡呐喊：攻速 / 移速 -${pctTxt(t.talent ? 0.7 : clap.D)} ${clap.dur} 秒（冷却 ${clap.cool} 秒）${isMax(t) ? '；杀敌 +1 魔法' : ''}`];
    },
  },
  // 科技塔（原图 C1 / C2 = 科技塔等级 1~4，回收归零；只能建造一个）：本身只有普通攻击，给自己别的塔加成（techLv）——
  // 剑圣塔风暴之魂每 5-等级 次攻击放一次；神圣塔神圣攻击 + 等级×基础伤害/2、切换伤害冷却 90-5×等级 秒；扫射塔杀敌魔法 1+0.2×等级；
  // 神圣塔 MAX 且有地精塔 MAX 时每次攻击再加 400 范围 魔法×(1+等级/32) 英雄伤害；科技塔 MAX 时深渊塔升级超级深渊召唤深渊霸主
  科技塔: {
    info(t) {
      const c = t.lv + 1;
      return [`科技等级 ${c}：剑圣塔风暴之魂每 ${5 - c} 次攻击；神圣攻击 +${c * 50}% 基础伤害、切换冷却 ${90 - 5 * c} 秒`,
        `扫射塔杀敌 +${fmt(1 + 0.2 * c)} 魔法；神圣塔 MAX + 地精塔 MAX：额外 400 范围 魔法×${(1 + c / 32).toFixed(3)}${c >= 4 ? '；超级深渊召唤深渊霸主' : ''}`];
    },
  },
  // 深渊塔（原图 DE：1~MAX 级 2 / 4 / 6 / 8，超级 10，回收归零）：自己的腐蚀 / 重击 / 冰霜 / 暴击塔每次攻击，在目标处 100 范围再造成
  // 90 × 辅助塔等级 × DE 的穿刺 / 混乱 / 魔法 / 普通伤害。
  // 暴击塔 Bingo：原图条件是"魔法 ≥ 1 且 1/20 且有超级深渊 或 有深渊塔 MAX"（and / or 从左往右算），所以有深渊塔 MAX 时暴击塔每次攻击都 Bingo，
  // 超级深渊时只有第一座暴击塔 MAX（建成时给 1 点魔法）有 1/20；300 范围 80000×HO。HO：平时 1，四种辅助 MAX + 深渊塔 MAX 或者有超级深渊时 2，
  // 超级深渊激活天赋后 3（原图建成时才重算 HO，这里随时按条件算）。
  // 深渊塔 MAX 花 11400 金"升级超级深渊"（A0EQ，要四种辅助 MAX，还要没建主塔——用掉主塔名额）：每 15 秒召唤一个深渊领主（会走动，活 15 秒；
  // 升级时科技塔 MAX 是深渊霸主，否则魔石塔选了炎魔（Da ≥ 1）是深渊魔主），领主每次攻击在目标 190 范围加 超级深渊魔法×(10+Da) 英雄伤害，
  // 每 5 次攻击放死亡新星（目标 40000、350 范围 20000）；领主杀敌超级深渊 +1 魔法。天赋（50 木材）：Bingo# 伤害翻倍
  深渊塔: {
    init(t) { t.ik = 0; },
    de: t => t.super ? 10 : 2 * (t.lv + 1),
    // HO（暴击塔 Bingo 倍数）
    ho(t) {
      const pid = pidOf(t), max4 = ['暴击塔', '腐蚀塔', '冰霜塔', '重击塔'].every(f => G.towers.some(o => o.fam === f && isMax(o) && pidOf(o) === pid));
      return t.super ? (t.talent ? 3 : 2) : max4 && isMax(t) ? 2 : 1;
    },
    anyAttack(t, o, target) {
      const ty = ABYSS_SUP[o.fam];
      if (!ty || o.cat === 'summon' || pidOf(o) !== pidOf(t) || ownTower(pidOf(t), '深渊塔') !== t) return;   // DE 每个玩家只有一个值：只算第一座深渊塔
      aoeAt(o, target.x, target.y, 100, 90 * (o.lv + 1) * KITS.深渊塔.de(t), ty);
      FXS.ring(target.x, target.y, 100, '#b04dff', 0.25, 3);
      if (o.fam !== '暴击塔') return;
      const first = G.towers.find(x => x.fam === '暴击塔' && isMax(x) && pidOf(x) === pidOf(t));
      if (!((first === o && Math.random() < 1 / 20 && t.super) || (!t.super && isMax(t)))) return;
      const ho = KITS.深渊塔.ho(t), sharp = t.super && t.talent;
      aoeAt(o, target.x, target.y, 300, 80000 * ho, sharp ? 'hero' : 'normal');
      popText(target.x, target.y + 40, sharp ? 'Bingo#!' : ho > 1 ? 'Bingo+!' : 'Bingo!', '#ff3030');
      FXS.nova(target.x, target.y, 300, '#ff3030', 0.35);
    },
    tick(t) {
      if (!t.super || !cdReady(t, 'lord')) return;
      setCd(t, 'lord', 15);
      const L = ABYSS_LORD[t.lord - 1];
      summon(t, { fam: '深渊领主', title: L.name, label: '领', x: t.x, y: t.y, until: G.t + 15, mobile: { speed: L.speed, leash: 2400 }, mdx: L.mdx, scale: L.scale,
        levels: [{ name: L.name, dmg: L.dmg, cd: L.cd, range: L.range, atk: 'hero', targets: 1, splash: 190, abils: [] }], crit: () => [0.05, 10],
        onLaunch(s, tg) {
          if (t.ik >= 4) { t.ik = 0; hurt(tg, 40000, 'magic', s); aoeAt(s, tg.x, tg.y, 350, 20000, 'magic'); FXS.nova(tg.x, tg.y, 350, '#7ab8ff', 0.4); }
          else t.ik++;
          aoeAt(s, tg.x, tg.y, 190, Math.floor(t.mana * (10 + stoneLv(t, 3))), 'hero');
        } });
      FXS.nova(t.x, t.y, 200, '#b04dff', 0.5);
    },
    kill(t, m, src) { if (t.super && src && src.owner === t) addMana(t, 1); },
    upgrade(t) {
      t.super = true; t.cat = 'main'; t.levels = t.levels.concat([D.towers.深渊塔.super]); t.lv = t.levels.length - 1;
      t.spent += 11400; t.maxMana = 2000; t.mana = 0; t.ik = 0; delete t.cds.lord;
      t.lord = techLv(t) >= 4 ? 2 : stoneLv(t, 3) >= 1 ? 3 : 1;
      FXS.nova(t.x, t.y, 400, '#b04dff', 0.6);
      msg(`深渊塔升级为超级深渊塔（召唤${ABYSS_LORD[t.lord - 1].name}）`);
    },
    cmds(t) {
      if (t.super || !isMax(t)) return [];
      const pid = pidOf(t), miss = Object.keys(ABYSS_SUP).filter(f => !G.towers.some(o => o.fam === f && isMax(o) && pidOf(o) === pid));
      const main = G.towers.some(o => mine(o) && o.cat === 'main' && o.fam !== '弹跳塔');
      return [costCmd(t, 'Q', '升级超级深渊', `变成 <b>超级深渊塔</b>（辅助塔附加伤害 DE 8 → 10），占用主塔名额<br>每 15 秒召唤一个深渊领主（19999 英雄伤害、190 溅射，活 15 秒），
        领主每次攻击再加 超级深渊魔法×(10+Da) 英雄伤害，每 5 次攻击放死亡新星；领主杀敌超级深渊 +1 魔法<br>升级时有科技塔 MAX：召唤深渊霸主；魔石塔选了炎魔：召唤深渊魔主`,
        { gold: 11400 }, () => KITS.深渊塔.upgrade(t),
        { why: miss.length ? `需要${miss.join('、')} MAX` : main ? '已经建造了主塔，不能升级超级深渊' : null })];
    },
    talent: { wood: 50, name: 'Bingo# 伤害翻倍', only: t => t.super ? null : '只能对超级深渊塔激活', tip: '暴击塔 Bingo 变成 Bingo#：80000×3 英雄伤害' },
    info(t) {
      const out = [`辅助塔附加伤害：DE ${KITS.深渊塔.de(t)}（目标 100 范围 90×辅助塔等级×DE）`,
        `暴击塔 Bingo：${t.super ? '第一座暴击塔 MAX 1/20' : isMax(t) ? '暴击塔每次攻击' : '要深渊塔 MAX'}，300 范围 ${fmt(80000 * KITS.深渊塔.ho(t))}`];
      if (t.super) out.push(`召唤${ABYSS_LORD[t.lord - 1].name}：${cdReady(t, 'lord') ? '就绪' : Math.ceil(cdLeft(t, 'lord')) + ' 秒'}，附加 ${fmt(Math.floor(t.mana * (10 + stoneLv(t, 3))))} 英雄伤害`);
      return out;
    },
  },
  // 燃烧塔：炮弹 200 范围溅射 + 燃烧之油（落点 200 范围的敌人烧 3 秒，每 0.2 秒 A 点：1~4 级每秒 25 / 150 / 400 / 1000；同一种油不叠加）。
  // MAX（原图 BEO / BEQ）：每次攻击把燃烧之油设成 魔法/40 级（不到 40 魔法时不变；1~9 级 A = 300+100×(级-1)，10 级 3300、11 级 7300，烧 3~4 秒），
  // 杀敌 +2 魔法（上限 200）。天赋（25 木材，A0E9）：魔法上限 +200
  燃烧塔: {
    init(t) { t.oil = 1; },
    tick(t) { t.maxMana = isMax(t) ? (t.talent ? 400 : 200) : 0; },
    attack(t, target) {
      const ab = abil(curLevel(t), 'Abof'); if (!ab) return;
      let A = ab.A, dur = ab.dur || 3;
      if (isMax(t)) {
        const L = Math.floor(t.mana / 40); if (L >= 1) t.oil = Math.min(11, L);
        A = BURN_OIL[t.oil - 1]; dur = t.oil >= 10 ? 4 : 3 + 0.1 * (t.oil - 1);
      }
      for (const m of inRange(target.x, target.y, ab.area || 200)) {
        m.dots = m.dots.filter(d => d.kind !== 'oil');
        m.dots.push({ kind: 'oil', dps: A / (ab.B || 0.2), until: G.t + dur, atk: 'magic', src: t });
      }
      FXS.explosion(target.x, target.y, 0.5, '#ff7a2a');
    },
    kill(t) { if (isMax(t)) addMana(t, 2); },
    talent: { wood: 25, name: '燃烧之油（烈火）', max: true, tip: '魔法上限 +200（燃烧之油能到 10 级）' },
    info(t) {
      const ab = abil(curLevel(t), 'Abof') || {}, A = isMax(t) ? BURN_OIL[t.oil - 1] : ab.A;
      return [`燃烧之油${isMax(t) ? ` ${t.oil} 级` : ''}：200 范围每秒 ${fmt(A / (ab.B || 0.2))}${isMax(t) ? '（魔法/40 级，杀敌 +2 魔法）' : ''}`];
    },
  },
  // 炎魔塔（原图 BBp 攻击 / BDS 按钮）：每次攻击，魔法 ≥ 烈焰燃烧等级 L × (L+10) 就扣掉放一次：
  //   伤害状态 1：塔旁召唤马甲 1 秒，凤凰火每 0.1 秒烧 900 范围里的一个敌人 6 秒（每秒 20 / 50 / 120 / 250 / 500 / 900 / 1500 / 2500 / 4000 / 6000，烧不死）；
  //   伤害状态 2（攻击力状态 2 级：攻击 +5000%）：马甲在塔处放火焰雨，900 范围先 B 伤害、再每秒 E 伤害 6 秒。
  // 不放时攻击得魔法：1~3 级 等级+0.5，MAX 4，再加魔石塔 Da×0.5。增加 / 减少释放等级在 1~10 之间循环。天赋（25 木材）：攻速 +80%
  炎魔塔: {
    init(t) { t.ym = { mode: 1, L: 1 }; },
    self(t) { return { atk: t.ym.mode === 2 ? 50 : 0 }; },
    asPlus: t => t.talent ? 0.8 : 0,
    attack(t) {
      const y = t.ym, L = y.L, cost = L * (L + 10);
      if (Math.floor(t.mana) < cost) { addMana(t, (isMax(t) ? 4 : t.lv + 1.5) + stoneLv(t, 3) * 0.5); return; }
      t.mana -= cost;
      if (y.mode === 1) {
        for (const m of inRange(t.x, t.y, 900).sort(() => Math.random() - 0.5).slice(0, 10)) {
          m.dots = m.dots.filter(d => d.kind !== 'yanmo');
          m.dots.push({ kind: 'yanmo', dps: YANMO.burn[L - 1], until: G.t + 6, atk: 'magic', src: t, noKill: true });
        }
        FXS.nova(t.x, t.y, 900, '#ff7a2a', 0.5);
      } else {
        aoeAt(t, t.x, t.y, 900, YANMO.rainB[L - 1], 'magic');
        zone(t, t.x, t.y, 900, 6, YANMO.rainE[L - 1], 'magic', null, null, { color: 'rgba(255,110,40,.12)' });
        for (let i = 0; i < 6; i++) FXS.fall(t.x + rnd(-500, 500), t.y + rnd(-500, 500), { z: 900, dx: -200, dy: 120, dur: 0.3, color: '#ff7a2a', core: '#ffe0a0', size: 16, rock: '#502010' });
      }
      SFX.spell('frostPulse', { x: t.x, y: t.y });
    },
    cmds(t) {
      const y = t.ym, wrap = d => () => { y.L = (y.L + d + 9) % 10 + 1; setCd(t, 'lv', 0.5); uiDirty(); };
      const rdy = { why: cdReady(t, 'lv') ? null : '冷却中' };
      return [
        costCmd(t, 'Q', '切换伤害', `当前 <b>伤害状态 ${y.mode}</b>${y.mode === 2 ? '（攻击 +5000%，放火焰雨）' : '（放烈焰燃烧）'} → 状态 ${3 - y.mode}`, {},
          () => { y.mode = 3 - y.mode; setCd(t, 'mode', 1); msg(`炎魔塔切换到伤害状态 ${y.mode}`); }, { why: cdReady(t, 'mode') ? null : '冷却中', o: { active: y.mode === 2 } }),
        costCmd(t, 'W', '增加释放等级', `烈焰燃烧 ${y.L} → ${y.L % 10 + 1} 级（10 级再加回到 1 级）`, {}, wrap(1), rdy),
        costCmd(t, 'E', '减少释放等级', `烈焰燃烧 ${y.L} → ${(y.L + 8) % 10 + 1} 级（1 级再减回到 10 级）`, {}, wrap(-1), rdy),
      ];
    },
    talent: { wood: 25, name: '增加攻击速度', max: true, tip: '攻击速度 +80%' },
    info(t) {
      const y = t.ym, L = y.L;
      return [`伤害状态 ${y.mode} · 烈焰燃烧 ${L} 级：要 ${L * (L + 10)} 魔法`,
        y.mode === 1 ? `900 范围 10 个敌人每秒 ${fmt(YANMO.burn[L - 1])}，烧 6 秒（烧不死）` : `火焰雨：900 范围 ${fmt(YANMO.rainB[L - 1])} + 每秒 ${fmt(YANMO.rainE[L - 1])}，6 秒`];
    },
  },
  // 魔石塔：魔石杀（凤凰火，每秒一次）给 600 范围里一个还没烧着的敌人挂上持续燃烧（每秒 40 / 200 / 600 / 2000，一直烧到死）；
  // 神石气息（永久献祭）：400 范围每秒 20 / 80 / 250 / 800（天赋 25 木材：1000 范围每秒 2000）。
  // 切换提升塔类（原图 BDX / BDa，冷却 2 秒）：剑圣（DZ）/ 天神（DY）/ 炎魔（Da）/ 灵魂（Db）选中的那个 = 魔石塔等级 1~4，别的为 0（stoneLv）：
  //   剑圣塔风暴之魂 +DZ×技能等级×60，剑刃之魂多一次机会（场上 ≤2 个且 1~4 ≤ DZ）；天神塔攻击上限每级 +40×DY；
  //   炎魔塔攻击得魔法 +0.5×Da、深渊领主附加伤害 魔法×(10+Da)；灵魂锁链 +Db×15（1 级）/ Db×80
  魔石塔: {
    init(t) { t.ms = { sel: 1 }; },
    tick(t, dt) {
      const lv = curLevel(t), px = abil(lv, 'Apxf'), im = abil(lv, 'ANpi');
      if (px && cdReady(t, 'stone')) {
        const m = inRange(t.x, t.y, px.area || 600).find(e => !e.dots.some(d => d.kind === 'stone'));
        if (m) {
          setCd(t, 'stone', px.cool || 1);
          FXS.launch('fireball', { x: t.x, y: t.y, z: 150 }, m, hit => { if (hit && !hit.dead) hit.dots.push({ kind: 'stone', dps: px.B, until: G.t + 3600, atk: 'magic', src: t }); });
        }
      }
      if (im) { const [r, dps] = t.talent ? [1000, 2000] : [im.area || 400, im.A * 4]; for (const m of inRange(t.x, t.y, r)) hurt(m, dps * dt, 'magic', t); }
    },
    cmds(t) {
      const s = t.ms;
      return [costCmd(t, 'Q', '切换提升塔类', `当前提升 <b>${STONE_FOR[s.sel - 1]}</b>（${s.sel === 1 ? 'DZ' : s.sel === 2 ? 'DY' : s.sel === 3 ? 'Da' : 'Db'} = ${t.lv + 1}）→ ${STONE_FOR[s.sel % 4]}<br>
        剑圣塔：风暴之魂 +等级×技能等级×60、剑刃之魂多一次机会；天神塔：攻击上限每级 +40×等级；炎魔塔：攻击得魔法 +0.5×等级、深渊领主伤害；灵魂塔：灵魂锁链伤害`,
        {}, () => { s.sel = s.sel % 4 + 1; setCd(t, 'sel', 2); msg(`魔石塔提升${STONE_FOR[s.sel - 1]}`); }, { why: cdReady(t, 'sel') ? null : '冷却中', o: { cdOf: () => [cdLeft(t, 'sel'), 2] } })];
    },
    talent: { wood: 25, name: '神石气息（群伤）', max: true, tip: '神石气息变成 1000 范围每秒 2000 伤害' },
    info(t) {
      const lv = curLevel(t), px = abil(lv, 'Apxf') || {}, im = abil(lv, 'ANpi') || {};
      return [`魔石杀：600 范围每秒点燃一个敌人，每秒 ${fmt(px.B)}（烧到死）`, `神石气息：${t.talent ? '1000 范围每秒 2000' : `${im.area} 范围每秒 ${fmt(im.A * 4)}`}`,
        `提升${STONE_FOR[t.ms.sel - 1]}：${t.lv + 1} 级`];
    },
  },

  // ---------------------------------------------------------------- 大辅助（MAX 效果要用守卫者的激活天赋，25 木材）
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
    dmgPlus: () => PFAM.techAtk * (G.panda.master - 1), asPlus: () => PFAM.techAS * (G.panda.master - 1),   // 家族大师 R007 / R008
    tick(t) { const l = t.lust; if (lust(t, 1.2, 2 + 0.5 * l, 6.5 - 0.5 * l, 150)) KITS['小熊猫塔（土）'].bigReset(t); },
    cmds(t) { return [costCmd(t, 'Q', '风之强化', `嗜血术（风）${t.lust}/4 级：附近一座塔 +120% 攻速 ${2 + 0.5 * t.lust} 秒，冷却 ${6.5 - 0.5 * t.lust} 秒`, { wood: t.lust < 4 ? 5 : 0 },
      () => { t.lust++; }, { why: t.lust >= 4 ? '已经是最高等级' : null })]; },
  },
  // 小熊猫塔（火）：咆哮（火）A0GN 的等级 = 小熊猫塔（土）的火焰强化等级（原图 BGq 一起升级）
  '小熊猫塔（火）': {
    dmgPlus: () => PFAM.techAtk * (G.panda.master - 1), asPlus: () => PFAM.techAS * (G.panda.master - 1),
    attack(t) { const L = G.panda.fire; if (roar(t, PFAM.roar[L - 1], 6, PFAM.roarCd[L - 1], 100)) KITS['小熊猫塔（土）'].bigReset(t); },
    info: () => { const L = G.panda.fire; return [`咆哮（火）${L} 级：100 范围友军攻击 +${pctTxt(PFAM.roar[L - 1])} 6 秒，冷却 ${PFAM.roarCd[L - 1]} 秒`]; },
  },
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

  // ---------------------------------------------------------------- 巫系（MAX 效果要用守卫者的激活天赋，25 木材）
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
    cmds(t) { const r = t.bank.rate, top = 10 + (t.ulv || 0); return [costCmd(t, 'Q', '提升金币利息', `每秒利息 +1 金（现在每秒 ${r} 金）<br>回收返还木材`, { wood: r < top ? 8 : 0 }, () => { t.bank.rate++; }, { why: r >= top ? '已经是最高等级' : null })]; },
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
  // ---------------------------------------------------------------- 神塔（随机建造的 H8 格，全场唯一，见 godRefresh）
  // 驱魔塔（原图 Y8 / BHp）：驱魔一击 A0L7（手动，射程 900，冷却 3 秒）晕眩 6 秒；建成后第一次只晕眩（同时升到 2 级），之后还把目标传到一个出怪口（exorciseGate）
  驱魔塔: {
    init(t) { t.qm = 1; },
    cast(t, m) {
      if (!m || m.dead || !G.monsters.includes(m) || m.neutral) return msg('驱魔一击：要选一个敌人');
      if (dist2(t.x, t.y, m.x, m.y) > 900 * 900) return msg('目标太远（施法距离 900）');
      if (!cdReady(t, 'qm')) return msg('驱魔一击冷却中');
      setCd(t, 'qm', GOD.qmCd); stun(m, GOD.qmStun);
      FXS.ring(m.x, m.y, 120, '#c9a0ff', 0.4, 3);
      if (t.qm === 1) { t.qm = 2; return msg('驱魔一击：第一次只晕眩，之后还会遣返'); }
      teleportTo(m, exorciseGate(pidOf(t)));
    },
    cmds(t) {
      return [cmd('Q', '驱', '驱魔一击', `对一个敌人使用（射程 900，冷却 ${GOD.qmCd} 秒）：晕眩 ${GOD.qmStun} 秒，并让它随机遣返到任意一个玩家的出怪口<br>建成后第一次只晕眩`,
        () => { G.pending = 'heroPick'; G.placing = null; G.heroPick = { label: '对这个敌人放驱魔一击', fn: (x, y, hit) => KITS.驱魔塔.cast(t, hit) }; msg('驱魔一击：选择一个敌人（Esc 取消）'); uiDirty(); },
        { disabled: !cdReady(t, 'qm'), cdOf: () => [cdLeft(t, 'qm'), GOD.qmCd], ico: 'abil-A0L7' })];
    },
    info: t => [`驱魔一击：${t.qm === 1 ? '下一次只晕眩' : '晕眩并遣返'}`],
  },
  // 树妖塔（原图 ZD / BH1 建成时刷树妖箭、ZG / BH7）：自己的攻击带纠缠 A0L8（100% 晕 0.5 秒，按 AHbh 处理）；
  // 塔下面有一支看不见的树妖箭 n06H（0.5 秒一次，射程 900）：腐蚀攻击 A0L9 护甲 -200 持续 1 秒，每次攻击还永久扣目标 20 点护甲。回收时树妖箭跟着移除
  树妖塔: {
    built(t) {
      summon(t, { fam: '树妖箭', title: '树妖箭', label: '箭', x: t.x, y: t.y, hide: true, silent: true,
        levels: [{ name: '树妖箭', dmg: 2, cd: 0.5, range: 900, atk: 'pierce', targets: 1, abils: [] }],
        onLaunch(s, m) {
          hurt(m, 2, 'pierce', s);
          m.shred = Math.max(m.shredUntil > G.t ? m.shred : 0, GOD.dryadShred); m.shredUntil = Math.max(m.shredUntil, G.t + 1);
          m.armor -= GOD.dryadArmor;
        } });
      return t;
    },
    info: () => [`树妖箭：每 0.5 秒护甲 -${GOD.dryadShred}（1 秒），并永久 -${GOD.dryadArmor} 护甲`],
  },
  // 暗牧塔（原图 ZK / BIK）：减速 A0OH 自动施放（冷却 1 秒，射程 800）：移速 -60% 6 秒，只找身上没有这个减速的敌人（魔法免疫的不行）。
  // 全场前 8 次施放只计数（Hq），之后每次把目标当前生命 ×0.88（说明写的是"最大生命的 12%"，触发器扣的是当前生命）
  暗牧塔: {
    tick(t) {
      if (!cdReady(t, 'dm') || bv(t, 'silence')) return;
      const c = inRange(t.x, t.y, 800).filter(m => !m.magicImmune && !(m.dmSlow > G.t) && !(m.invisUntil > G.t))
        .sort((a, b) => dist2(t.x, t.y, a.x, a.y) - dist2(t.x, t.y, b.x, b.y))[0];
      if (!c) return;
      setCd(t, 'dm', 1); slowM(c, 0.6, 6); c.dmSlow = G.t + 6;
      if (G.god.hq >= 8) { c.hp *= 0.88; FXS.ring(c.x, c.y, 90, '#8a5cff', 0.4, 3); } else G.god.hq++;
    },
    sell() { G.god.hq = 0; },
    info: () => [G.god.hq >= 8 ? '暗影突袭：减速并扣目标当前生命的 12%' : `暗影突袭：再放 ${8 - G.god.hq} 次后开始扣生命`],
  },
  // 海妖塔（原图 ZB / BHv、ZC / BHy）：精准必杀——攻击精英怪或无尽怪物时 200 万英雄伤害（全局计数 LQ ≥ 8，即 8 秒一次；龙 / 魔王 / 熊猫除外）；
  // 精准攻击 R01L 每级 +200 攻击（最多 100 级，见 preciseKill）。
  // 原图必杀的条件写成"海妖塔 and … and LQ≥8 and 专注光环 or 减攻速光环 or … or 幽灵 and (不是龙 / 魔王 / 熊猫)"，不管 and / or 怎么结合，
  // 字面意思都是"任何单位攻击带另外 4 种光环的精英怪或无尽怪物都打 200 万"（不需要有海妖塔）——这部分没有照搬，按说明只算海妖塔、8 秒一次
  海妖塔: {
    dmgPlus: t => GOD.preciseAtk * G.god.r01l[pidOf(t)],
    attack(t, target) {
      if (G.t - G.god.lq < GOD.seaCd || !(target.elite || GOD.endless.has(target.uid)) || GOD.seaImmune.has(target.uid)) return;
      G.god.lq = G.t;
      FXS.ring(target.x, target.y, 140, '#ff3030', 0.5, 4); popText(target.x, target.y + 100, '必杀', '#ff3030');
      hurt(target, GOD.seaDmg, 'hero', t);
    },
    info: t => [`精准必杀：${G.t - G.god.lq >= GOD.seaCd ? '就绪' : Math.ceil(GOD.seaCd - (G.t - G.god.lq)) + ' 秒'} · 精准攻击 ${G.god.r01l[pidOf(t)]} 级（+${GOD.preciseAtk * G.god.r01l[pidOf(t)]} 攻击）`],
  },
  // 猎人塔（原图 BW6 / BW7 捕猎、ZQ / BIV 每 2 秒）：捕猎 A0RQ（手动，射程 900，冷却 180 秒）把一个 12 级以下、不是英雄 / 魔王的敌人变成随从
  // （全场 1 个，新的顶掉旧的）：无敌、600 秒后死亡，用怪物自己的攻击（吃训兽科技 R00Z）；精英怪 +4000 攻击、+40% 攻速。每 2 秒攻击移动到猎人塔旁边 256 内随机一点。
  // 目标不满足条件时技能照样进入冷却；回收猎人塔时随从移除，全场 180 秒内不能捕猎（Lv）
  猎人塔: {
    cast(t, m) {
      if (!m || m.dead || !G.monsters.includes(m) || m.neutral) return msg('捕猎：要选一个敌人');
      if (dist2(t.x, t.y, m.x, m.y) > 900 * 900) return msg('目标太远（施法距离 900）');
      if (!cdReady(t, 'hunt')) return msg('捕猎冷却中');
      setCd(t, 'hunt', GOD.huntCd);
      const u = D.units[m.uid] || {};
      if ((u.level || 1) > 12 || /^[A-Z]/.test(m.uid) || m.spirit) return msg('捕猎失败：只能捕获 12 级以下、不是英雄的敌人');
      if (G.t < G.god.lv) return msg(`CD:${Math.ceil(G.god.lv - G.t)}秒`);
      G.towers = G.towers.filter(o => o !== G.god.prey);
      beastUnlock();
      const a0 = beastAtk(m.uid), a = a0 || BEAST_NOATK, el = !!m.elite;
      m.dead = true; G.monsters = G.monsters.filter(o => o !== m);
      G.god.prey = summon(t, { fam: '猎物', title: `${m.name}（捕获）`, label: '猎', x: m.x, y: m.y, until: G.t + GOD.preyLife, speed: m.speed || 300, wt: 0, unarmed: !a0,
        levels: [{ name: m.name, dmg: a.dmg, cd: a.cd, range: a.range, atk: a.type === 'siege' ? 'normal' : a.type, targets: 1, splash: a.splash || 0, abils: [] }],
        stats: () => ({ dmg: a.dmg + (u.train ? BEAST.trainAtk * (G.beast.tech - 1) : 0) + (el ? 4000 : 0), cd: a.cd, as: el ? 0.4 : 0 }),
        tick: (s, dt) => KITS.猎人塔.preyMove(t, s, dt) });
      FXS.ring(m.x, m.y, 160, '#ffd257', 0.6, 4); msg(`捕猎成功：${m.name} 为你战斗 ${GOD.preyLife} 秒${a0 ? '' : '（这种怪没有训兽科技打开攻击，不会攻击）'}`);
    },
    preyMove(t, s, dt) {
      if ((s.wt -= dt) <= 0) { s.wt += 2; const a = rnd(0, TAU); s.goal = [t.x + Math.cos(a) * 256, t.y + Math.sin(a) * 256]; }
      const r = curLevel(s).range;
      if (nearest(s.x, s.y, r)) return;                                  // 射程里有敌人：站着打
      const m = nearest(s.x, s.y, GOD.preyAcquire), [gx, gy] = m ? [m.x, m.y] : s.goal;   // 攻击移动：路上索敌范围里的敌人先追着打
      const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy), step = Math.min(d - (m ? r * 0.8 : 0), s.speed * dt);
      if (step > 0) { s.x += dx / d * step; s.y += dy / d * step; s.face = Math.atan2(dy, dx); }
    },
    sell() { G.god.lv = G.t + GOD.huntCd - 1; G.god.prey = null; },
    cmds(t) {
      return [cmd('Q', '猎', '捕猎', `对一个 12 级以下、不是英雄的敌人使用（射程 900，冷却 ${GOD.huntCd} 秒）：捕获它为你战斗 ${GOD.preyLife} 秒（最多 1 个，新的顶掉旧的）`,
        () => { G.pending = 'heroPick'; G.placing = null; G.heroPick = { label: '捕获这个敌人', fn: (x, y, hit) => KITS.猎人塔.cast(t, hit) }; msg('捕猎：选择一个敌人（Esc 取消）'); uiDirty(); },
        { disabled: !cdReady(t, 'hunt'), cdOf: () => [cdLeft(t, 'hunt'), GOD.huntCd], ico: 'abil-A0RQ' })];
    },
    info: () => { const p = G.god.prey; return [p && G.towers.includes(p) ? `随从：${p.title}，还剩 ${Math.ceil(p.until - G.t)} 秒${p.unarmed ? '（不会攻击）' : ''}` : '还没有捕获敌人', beastWpnTxt()]; },
  },
  // 圣灵塔（原图 Zs / BJS、Zu / BJV）：攻击带霜冻 A0TS（移速 -30% 10 秒）。攻击时（全局计数 My ≥ 3，即 3 秒一次；场上圣灵少于 2 个）
  // 在自己的出怪口给敌方刷一个圣灵 h08S（5 生命、飞行、20 秒），跟着怪走、不算怪数；圣灵被杀时原地放战争践踏 A0TR（spiritDied）
  圣灵塔: {
    attack(t, target) {
      slowM(target, GOD.frost, 10);
      if (target.spirit || G.t - G.god.my < 3 || G.monsters.filter(m => m.spirit && !m.dead).length >= 2) return;
      G.god.my = G.t;
      const p = pidOf(t), s = spawnMonster('h08S', { gate: G.gates.includes(p) ? p : G.gates[0], noElite: true, noWaveHp: true });
      if (s) { s.spirit = true; s.until = G.t + 20; s.bounty = 0; }
    },
    sell() { G.god.hq = 0; },        // 原图回收圣灵塔也把暗牧塔的计数 Hq 清零（照搬）
    info: () => [`潜伏圣灵：场上 ${G.monsters.filter(m => m.spirit && !m.dead).length}/2`],
  },
  // 荣誉光环（h08M）：4 个光环的等级在随机到它时定好（原图 MS / MU / MT / MV = Jq+1~8），建成时设上（BJP），到下次随机建造前建的都一样
  荣誉光环: {
    init: t => { t.honor = mine(t) ? (G.honorLv || (G.honorLv = honorRoll(honorJq()))) : honorRoll(0); },
    info: t => HONOR.kinds.map((k, i) => `${k.name} ${t.honor[i]} 级：${k.txt(honorV(t.honor[i]))}（${honorArea(i, t.honor[i])} 范围）`),
  },
};
// 荣誉光环的 4 个光环（顺序同 MS / MU / MT / MV）：技能表只填了 1~4 级（6% / 8% / 10% / 12%，减防 -6 ~ -12），
// 说明写 6%~20%，5~8 级按每级 +2% 补；范围 5~8 级沿用 4 级。可与任意光环叠加（同是荣誉光环的取大）
const HONOR = {
  kinds: [
    { name: '攻击光环', area: [500], txt: v => `攻击 +${pctTxt(v)}` },                 // A0TE AEar
    { name: '减防光环', area: [800, 800, 800, 900], txt: v => `敌人护甲 -${Math.round(v * 100)}` },   // A0TB AHad
    { name: '减速光环', area: [400], txt: v => `敌人移速 -${pctTxt(v)}` },             // A0TC AOae
    { name: '速度光环', area: [500], txt: v => `攻速 +${pctTxt(v)}` },                 // A0TD AOae
  ],
};
const honorV = lv => 0.04 + 0.02 * lv;
const honorArea = (k, lv) => { const a = HONOR.kinds[k].area; return a[Math.min(lv, a.length) - 1]; };
const honorRoll = jq => HONOR.kinds.map(() => rint(jq + 1, 8));
// Jq（q9）：平台荣誉 RY ≥ 90 是 2、≥ 60 是 1。这里用玩家档案里的荣誉（原图无尽积分到 1 万时 +1，上限 300）
function honorJq() { const h = G.player ? profileOf(G.player).honor || 0 : 0; return h >= 90 ? 2 : h >= 60 ? 1 : 0; }
// 神塔的数值（技能表 / 单位表 / 触发器）
const GOD = {
  qmCd: 3, qmStun: 6,                                // 驱魔一击 A0L7：冷却 3 秒（说明写 10 秒）、晕眩 6 秒
  dryadShred: 200, dryadArmor: 20,                   // 树妖箭：腐蚀 A0L9 护甲 -200 1 秒；BH7 每次攻击基础护甲 -20
  seaCd: 8, seaDmg: 2000000, preciseAtk: 200,        // 海妖塔：LQ ≥ 8、200 万英雄伤害；精准攻击 R01L 每级 +200
  endless: new Set(['nfgl', 'ndrl', 'ndrt', 'ndrn', 'nogo', 'nsw2', 'noga', 'nogn', 'ndsa', 'nglm']),
  seaImmune: new Set(['Udea', 'Udre', 'nrdr', 'nrdk', 'ngrd', 'nbzd', 'Nfir', 'Npbm', 'Nalc', 'Ntin']),
  huntCd: 180, preyLife: 600, preyAcquire: 600,      // 捕猎 A0RQ 冷却 180 秒、随从 600 秒；攻击移动时的索敌范围
  frost: 0.3,                                        // 霜冻 Bfro：FrostMoveSpeedDecrease
};
// 驱魔一击的遣返（BHp）：按玩家顺序 1/8、1/8、1/7、1/6、1/5、1/4、1/3 的概率选这个玩家的口（他要在场）；
// 最后一档 1/2 去 8 号口，但原图查的是 7 号玩家在不在场（照搬）；都没选中就是施法者自己的口
function exorciseGate(p) {
  const rolls = [[8, 1], [8, 2], [7, 2], [6, 3], [5, 4], [4, 3], [3, 2]];
  for (let i = 0; i < rolls.length; i++) if (rint(1, rolls[i][0]) === rolls[i][1] && G.gates.includes(i)) return i;
  if (rint(1, 2) === 1 && G.gates.includes(6)) return 7;
  return p;
}
// 精准攻击 R01L（BHy）：条件"海妖塔杀了专注光环精英 or 带另外 4 种光环的精英死了"，后半句不看凶手——
// 自己的单位杀死这 4 种精英，玩家的精准攻击也 +1（只影响海妖塔，照搬）
function preciseKill(m, src) {
  if (m.elite.aura.key === 'focus' && !(src && src.fam === '海妖塔')) return;
  const g = G.god.r01l, p = pidOf(src);
  if (g[p] < 100) g[p]++;
}
// 圣灵被杀（BJV）：凶手在原地放战争践踏 A0TR——250 范围 20 伤害、纠缠 3 秒（魔法免疫的不受影响）
// 原图 BJV 在凶手的主人那里建马甲放践踏；圣灵到时间消失时凶手为空，马甲建不出来，所以不放践踏（step 里到时间直接移除，不走这里）
function spiritDied(m, src) {
  FXS.nova(m.x, m.y, 250, '#b8ffb0', 0.5);
  for (const e of inRange(m.x, m.y, 250)) { if (e.spirit || e.magicImmune) continue; stun(e, 3); hurt(e, 20, 'magic', src); }
}
// 嗜血术：给附近一座没有嗜血的塔加攻速（优先打得最多的）
function lust(t, v, dur, cd, range) {
  if (!cdReady(t, 'lust') || !anyEnemy(t.x, t.y, 1500)) return;
  const c = alliesNear(t.x, t.y, range).filter(o => !bv(o, 'bloodlust') && o.cat !== 'uniq').sort((a, b) => (b.dealt || 0) - (a.dealt || 0))[0];
  if (!c) return;
  setCd(t, 'lust', cd);
  giveBuff(c, 'bloodlust', v, dur);
  FXS.ring(c.x, c.y, 150, '#ff5a4f', 0.5, 3);
  return true;
}
// 咆哮：附近友军攻击力加成（攻击时自动释放）
function roar(t, v, dur, cd, area) {
  if (!cdReady(t, 'roar')) return;
  setCd(t, 'roar', cd);
  for (const o of alliesNear(t.x, t.y, area)) giveBuff(o, 'roar', v, dur);
  FXS.nova(t.x, t.y, area + FOOT_HALF, '#ff8a3c', 0.5);
  return true;
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
function towerKilled(t, m, src) {
  const kit = KITS[t.fam]; if (kit && kit.kill) kit.kill(t, m, src);
  for (const o of G.towers) { const k = KITS[o.fam]; if (k && k.anyKill) k.anyKill(o, t, m); }     // 别的塔杀敌时触发的（巫系塔杀敌给巫妖魔法）
}

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
// onLevel(h) 升级时（HERO_LEVEL）    onLevelBtn(h) 点"升级"时（原图 BaJ，升级之后判断等级）    onPoint(h) 分配技能点后（HERO_SKILL）    towerUpgraded(h, t)    cmds(h) 额外命令    info(h) 信息面板多的几行
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
// ================================================================ 赞助英雄（Hc 18~34，有"英雄赞助"才随机得到）
// 和前 17 个一样按原图触发器实现。没有技能书的英雄（伏魔、驯龙、先知、鬼、巨魔召唤师、地狱火）技能直接挂在单位上，
// 在命令面板第一行显示（HERO_DEF.cmds，图标 icon:cmd:英雄:序号，见 tools/add_heroes.py 的 cmds）
const cmdIco = (h, i) => ({ iconKey: 'icon:cmd:' + h.heroName + ':' + i });
const cmdTip = (h, i, extra) => `<b>${D.heroes[h.heroName].cmds[i].name}</b><br>${D.heroes[h.heroName].cmds[i].desc.replace(/\n/g, '<br>')}${extra ? '<br>' + extra : ''}`;
// 需要点一个目标的命令：点完按钮再点地图（fn(x, y, 点到的单位)），Esc 取消
function heroPick(label, fn) { G.pending = 'heroPick'; G.heroPick = { label, fn }; G.placing = null; msg(label + '（Esc 取消）'); uiDirty(); }
const lvl = (arr, L) => arr[clamp(L, 1, arr.length) - 1];
// 直线伤害（震荡波 / 腐臭蜂群）：从 (x0, y0) 朝 (x1, y1) 方向 len 长、宽 w
function lineHit(src, x0, y0, x1, y1, len, w, dmg, atk, opt, color) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  for (const m of G.monsters) {
    if (m.dead) continue;
    const ax = m.x - x0, ay = m.y - y0, along = ax * ux + ay * uy;
    if (along >= 0 && along <= len && Math.abs(ax * uy - ay * ux) <= w / 2 + m.r * 0.5) hurt(m, dmg, atk, src, opt || undefined);
  }
  FXS.beam(x0, y0, 80, x0 + ux * len, y0 + uy * len, 60, color || '#c48bff', 1.6, 0.3);
}

// ---------------------------------------------------------------- 妖灵（BTB ~ BTO）
// 飞鸟：普通 nanb / 魔法 nanc / 混乱 n00F / 通用 n06J，学了对应技能才能召唤。攻击力科技（R00V / R00U / R00T / R00Y）按属性算：
// 达到 60 点后每 X / Y / Z 点属性 +1 级（X = 18-Hx、Y = 13-Hx、Z = 11+Hx，Hx 开局随机 1~10，最多 100 级）；通用飞鸟按随机的一项属性（Hz）/10
const YL_BIRD = [
  { label: '普', title: '普通飞鸟', life: 3, dmg: 200, cd: 0.7, atk: 'normal', bounce: 4, jump: 1000, tech: h => h.stat.agi >= 60 ? Math.min(100, Math.floor(h.stat.agi / (18 - h.sk.hx))) * 400 : 0 },
  { label: '魔', title: '魔法飞鸟', life: 2, dmg: 20, cd: 0.3, atk: 'magic', bounce: 30, jump: 500, tech: h => h.stat.int >= 60 ? Math.min(100, Math.floor(h.stat.int / (13 - h.sk.hx))) * 200 : 0 },
  { label: '乱', title: '混乱飞鸟', life: 4, dmg: 100, cd: 0.6, atk: 'chaos', splash: 200, tech: h => h.stat.str >= 60 ? Math.min(100, Math.floor(h.stat.str / (11 + h.sk.hx))) * 800 : 0 },
  { label: '通', title: '通用飞鸟', life: 1, dmg: 200, cd: 0.1, atk: 'hero', splash: 70, tech: h => Math.floor(h.stat[['str', 'agi', 'int'][h.sk.hz - 1]] / 10) * 100 },
];
function ylBird(h, i) {
  const b = YL_BIRD[i], more = learned(h, 1) ? 1.5 : 1;                       // 魔法飞鸟（R00W）：弹射次数 / 范围 +50%
  hsum(h, h.x + rnd(-60, 60), h.y + rnd(-60, 60), b.life + (learned(h, 2) ? 2 : 0),      // 混乱飞鸟（Hv = 2）：持续 +2 秒
    { cd: b.cd, range: 1000, atk: b.atk, bounce: b.bounce && Math.round(b.bounce * more), jump: b.jump, splash: b.splash && b.splash * more },
    { label: b.label, title: b.title, kind: 'bird' + i, stats: () => ({ dmg: b.dmg + b.tech(h), as: learned(h, 4) ? 0.4 : 0 }) });   // 冰冻冷箭（R00X）：攻速 +40%
}
const ylBirds = h => { for (let i = 0; i < 4; i++) if (learned(h, i)) ylBird(h, i); };

// ---------------------------------------------------------------- 伏魔（BIh ~ BI6）
// 随从最多 3 个：驯化的怪物（用怪物自己的攻击）或召唤的家族成员（大地 / 风暴 / 火焰）。每个随从随机 1 个技能，杀敌数 / 100 = 技能等级（1~5）。
// 随从跟着英雄（离英雄 2000 以外拉回来），技能有冷却就自动放
const FM_FAMILY = {   // 家族成员（n06Q / n06P / n06R）：受训兽 R00Z（+700 攻击 / 级，力量/30）和攻速 R011（+10% / 级，敏捷/20）影响
  大地: { dmg: 6000, cd: 2, range: 150, atk: 'chaos', splash: 350 }, 风暴: { dmg: 3000, cd: 1, range: 600, atk: 'magic', splash: 150 }, 火焰: { dmg: 1000, cd: 0.4, range: 250, atk: 'normal', splash: 150 },
};
const FM_FAMILY_MAD = {   // 狂暴版（n08E / n08D / n08C）
  大地: { dmg: 13000, cd: 1.2, range: 300, atk: 'hero', splash: 450 }, 风暴: { dmg: 6000, cd: 0.6, range: 800, atk: 'hero', splash: 150 }, 火焰: { dmg: 2000, cd: 0.2, range: 500, atk: 'hero', splash: 100 },
};
// 随从技能（原图 666 / 888 系列，数值是技能表 1~5 级；extra 是触发器 BIr 另加的伤害，原图都用 1 号随从的杀敌数算，照搬）
const FM_SKILL = {
  咆哮: { cd: [12, 11, 10, 9, 8], cast(s, h, L) { for (const o of alliesNear(s.x, s.y, 800)) giveBuff(o, 'roar', lvl([0.3, 0.6, 0.9, 1.2, 1.5], L), 6); FXS.nova(s.x, s.y, 800, '#ff8a3c', 0.4); return true; } },
  火焰雨: { cd: [10, 8, 6, 5, 4], cast(s, h, L) { aoeAt(h, h.x, h.y, 1000, lvl([300, 1000, 3000, 6000, 15000], L), 'normal'); aoeAt(h, s.x, s.y, 1200, fmUd(h) * h.stat.int / 4, 'normal'); FXS.nova(h.x, h.y, 1000, '#ff5a2a', 0.5); return true; } },
  战争践踏: { cd: [4.5], cast(s, h) { if (!anyEnemy(s.x, s.y, 400)) return false; for (const m of inRange(s.x, s.y, 400)) stun(m, 4); aoeAt(h, s.x, s.y, 400, fmUd(h) * h.stat.int, 'chaos'); FXS.nova(s.x, s.y, 400, '#ffd257', 0.4); return true; } },
  雷霆一击: { cd: [9, 6, 5, 4, 3], cast(s, h, L) { if (!anyEnemy(s.x, s.y, 550)) return false; for (const m of inRange(s.x, s.y, 550)) slowM(m, lvl([0.5, 0.6, 0.7, 0.8, 0.9], L), 5); aoeAt(h, s.x, s.y, 550, fmUd(h) * h.stat.int / 4, 'pierce'); FXS.nova(s.x, s.y, 550, '#9fd8ff', 0.4); return true; } },
  死亡凋零: { cd: [10, 8, 7, 6, 5], cast(s, h, L, tg) { for (const m of inRange(tg.x, tg.y, 300)) hurt(m, m.maxHp * lvl([0.07, 0.1, 0.13, 0.16, 0.19], L), 'magic', s); FXS.nova(tg.x, tg.y, 300, '#6dff6d', 0.5); return true; } },
  腐臭蜂群: { cd: [2], cast(s, h, L, tg) { lineHit(s, s.x, s.y, tg.x, tg.y, 800, 200, lvl([500, 1500, 7500, 15000, 35000], L), 'magic'); return true; } },
  暴风雪: { cd: [2, 1.5, 1, 1, 1], cast(s, h, L, tg) { aoeAt(h, tg.x, tg.y, 300, h.mana * h.stat.agi / 24, 'normal'); FXS.snow(tg.x, tg.y, 300, 0.6); return true; } },
  闪电链: { cd: [6, 3, 2, 1.5, 1], cast(s, h, L, tg) { let p = s; for (const m of chainTargets(tg, 8, 500)) { FXS.beam(p.x, p.y, 80, m.x, m.y, 50, '#9fd8ff', 1.2, 0.15); hurt(m, lvl([200, 900, 3000, 10000, 30000], L), 'magic', s); p = m; } return true; } },
  霜冻新星: { cd: [8, 6.5, 5, 3.5, 2], cast(s, h, L, tg) { const d = fmUd(h) * h.stat.int * (debuff(tg, 'drunk') ? 2 : 1); aoeAt(h, tg.x, tg.y, 120, d, 'pierce'); for (const m of inRange(tg.x, tg.y, 200)) slowM(m, 0.5, 6); FXS.nova(tg.x, tg.y, 200, '#bff4ff', 0.4); return true; } },
  静止陷阱: { cd: [4.5, 3.5, 3.5], cast(s, h, L, tg) { const r = lvl([150, 250, 300], L), d = lvl([2, 3, 4], L); for (const m of inRange(tg.x, tg.y, r)) stun(m, d); FXS.ring(tg.x, tg.y, r, '#c8b8ff', 0.5, 3); return true; } },
  风暴之锤: { cd: [8], cast(s, h, L, tg) { const d = h.mana * h.stat.int / 10 * (debuff(tg, 'drunk') ? 2 : 1); aoeAt(h, tg.x, tg.y, 120, d, 'hero'); stun(tg, lvl([5, 10, 15], L)); FXS.beam(s.x, s.y, 80, tg.x, tg.y, 40, '#9fd8ff', 1.4, 0.2); return true; } },
  点金术: { cd: [10, 9, 8, 7, 6], cast(s, h, L, tg) { if (tg.boss || tg.elite) return false; const g = Math.round((tg.bounty || 0) * 0.8 * 6); hurt(tg, tg.hp + 1, 'hero', s, { ignoreArmor: true }); G.gold += g; popText(tg.x, tg.y, '+' + g, '#ffd257'); return true; } },
  醉酒云雾: { cd: [4], cast(s, h, L, tg) { for (const m of inRange(tg.x, tg.y, 200)) debuffM(m, 'drunk', 1, 4); aoeAt(h, tg.x, tg.y, 120, fmUd(h) * h.stat.int / 4, 'normal'); FXS.ring(tg.x, tg.y, 200, '#c8a060', 0.5, 3); return true; } },
  火焰吐息: { cd: [4, 3.5, 3, 2.5, 2], cast(s, h, L, tg) { lineHit(s, s.x, s.y, tg.x, tg.y, 375, 250, lvl([3000, 10000, 30000, 90000, 180000], L), 'magic', null, '#ff8a3c'); return true; } },
};
// 被动技能：腐蚀（攻击减 200 护甲 5 秒）、重击（必定 1.2 秒晕眩 +5000 伤害）、致命一击（25% ×10）、加强天赋（攻击 / 攻速物品）
const FM_TAME = ['咆哮', '火焰雨', '战争践踏', '雷霆一击', '死亡凋零', '腐臭蜂群', '加强天赋', '暴风雪', '闪电链', '霜冻新星', '静止陷阱', '腐蚀', '重击', '致命一击', '风暴之锤', '点金术'];
const FM_CALL = ['咆哮', '火焰雨', '战争践踏', '雷霆一击', '死亡凋零', '腐臭蜂群', '加强天赋', '暴风雪', '闪电链', '霜冻新星', '静止陷阱', '腐蚀', '重击', '致命一击', '风暴之锤', '醉酒云雾', '火焰吐息'];
const fmSlots = h => h.sk.fm.slots;
const fmUd = h => (fmSlots(h)[0] && G.towers.includes(fmSlots(h)[0]) ? fmSlots(h)[0].ud : 0);   // 原图 BIr 的额外伤害都用 1 号随从（IZ）的杀敌数
const fmTech = h => ({ atk: Math.min(20, Math.floor(h.stat.str / 30)), as: Math.min(20, Math.floor(h.stat.agi / 20)) });   // 训兽 R00Z / 攻速 R011（杀敌时更新）
function fmFollower(h, o) {
  const slot = fmSlots(h).findIndex(s => !s || !G.towers.includes(s));
  if (slot < 0) return null;
  const skill = o.skill, talent = o.talent || { dmg: 0, as: 0 };
  const s = hsum(h, o.x, o.y, 0, { cd: o.cd, range: o.range, atk: o.atk, splash: o.splash || 0,
    abils: skill === '致命一击' ? [{ code: 'AOcr', A: 25, B: 10 }] : [] },
    { label: o.label, title: `${o.title}（${skill}）`, kind: 'follower', family: o.family, ud: 1, skill, mobile: { speed: o.speed || 300, leash: 2000 }, unarmed: o.unarmed,
      stats: () => { const t = o.tech ? fmTech(h) : { atk: 0, as: 0 }; return { dmg: o.dmg + 700 * t.atk + talent.dmg, as: 0.1 * t.as + talent.as }; },
      onHit(f, m) {
        if (skill === '腐蚀') debuffM(m, 'fear', 200, 5);
        if (skill === '重击') { stun(m, 1.2); hurt(m, 5000, 'normal', f); }
      } });
  fmSlots(h)[slot] = s;
  msg(`${s.title} 成为第 ${slot + 1} 个随从`);
  return s;
}
// 随从放技能：等级 = 杀敌数 / 100（原图 BIr：用了技能后按 userdata 提升技能等级）
function fmCast(h, s) {
  const k = FM_SKILL[s.skill]; if (!k || !cdReady(s, 'sk')) return;
  const tg = nearest(s.x, s.y, 800); if (!tg) return;
  const L = clamp(Math.floor(s.ud / 100), 1, 5);
  if (k.cast(s, h, L, tg) !== false) setCd(s, 'sk', lvl(k.cd, L));
}
function fmTame(h, m) {
  const fail = (why) => { if (why) msg(why); };
  if (!m || m.dead || !G.monsters.includes(m)) return fail('驯化野兽：要选一个敌人');
  if (dist2(h.x, h.y, m.x, m.y) > 900 * 900) return fail('目标太远（施法距离 900）');
  if (!cdReady(h, 'tame')) return fail('驯化野兽冷却中');
  if (h.mana < 10) return fail('魔法值不足（需要 10 点）');
  h.mana -= 10; setCd(h, 'tame', 10);
  const u = D.units[m.uid] || {};
  // 驯化条件（BIl）：等级 ≤12、不是魔王 / 英雄、有 8 木材、有空位；不满足时只是风暴之锤把它晕 15 秒
  if ((u.level || 1) > 12 || m.uid === 'Udea' || m.boss || G.wood < 8 || !fmSlots(h).some(s => !s || !G.towers.includes(s))) { stun(m, 15); return fail('驯化失败：目标晕眩 15 秒'); }
  G.wood -= 8; beastUnlock();
  const a0 = beastAtk(m.uid), a = a0 || BEAST_NOATK, sk = pick(FM_TAME);
  let as = m.elite ? 0.4 : 0, dmg = 0;                                   // 精英怪（带光环）+40% 攻速
  if (Math.random() < 0.1) as += 0.8; else if (Math.random() < 1 / 30) as += 1.5;
  if (Math.random() < 0.1) dmg += 8000; else if (Math.random() < 1 / 30) dmg += 15000;
  if (sk === '加强天赋') { dmg += 15000; as += 1.5; }
  m.dead = true; G.monsters = G.monsters.filter(o => o !== m);
  fmFollower(h, { x: m.x, y: m.y, label: '随', title: m.name, skill: sk, dmg: a.dmg, cd: a.cd, range: a.range, atk: a.type === 'siege' ? 'normal' : a.type, splash: a.splash, speed: m.speed, talent: { dmg, as }, unarmed: !a0 });
  if (!a0) msg('这种怪没有训兽科技打开攻击，不会攻击');
  FXS.ring(m.x, m.y, 160, '#ffd257', 0.6, 4);
}
function fmCall(h) {
  const jo = fmSlots(h).filter(s => s && G.towers.includes(s) && s.family).length;
  if (!cdReady(h, 'call')) return msg('家族召唤冷却中');
  if (G.gold < 800) return msg('金币不足（需要 800）');
  if (h.mana < 60) return msg('魔法值不足（需要 60）');
  if (h.stat.str < 80 * jo) return msg(`需要力量达到 ${80 * jo}`);
  if (!fmSlots(h).some(s => !s || !G.towers.includes(s))) return msg('随从已满 3 个');
  G.gold -= 800; h.mana -= 60; setCd(h, 'call', 12);
  // 10%（或智力 160~180）火焰，否则大地 / 风暴各半。有科技塔 MAX（原图 Ly = 2）且 已出狂暴次数×80 ≤ 智力 时出狂暴版（n08E / n08D / n08C）
  const kind = Math.random() < 0.1 || (h.stat.int >= 160 && h.stat.int <= 180) ? '火焰' : Math.random() < 0.5 ? '大地' : '风暴';
  const mad = techLv(h) >= 4 && (h.fmLz || 0) * 80 <= h.stat.int; if (mad) h.fmLz = (h.fmLz || 0) + 1;
  let sk = pick(FM_CALL); if (sk === '风暴之锤' && Math.random() < 0.25) sk = '点金术';
  const f = (mad ? FM_FAMILY_MAD : FM_FAMILY)[kind], talent = { dmg: sk === '加强天赋' ? 8000 : 0, as: sk === '加强天赋' ? 0.8 : 0 };
  if (Math.random() < 0.01) { talent.dmg += 15000; talent.as += 1.5; msg('该随从拥有超强天赋'); }
  fmFollower(h, { x: h.x, y: h.y, label: kind[0], title: (mad ? '狂暴的' : '') + kind, family: kind, skill: sk, ...f, speed: 350, tech: true, talent });
}
function fmBanish(h) {
  const s = fmSlots(h)[h.sk.fm.sel];
  if (!s || !G.towers.includes(s)) return msg(`${h.sk.fm.sel + 1} 号随从位是空的`);
  G.towers = G.towers.filter(o => o !== s); fmSlots(h)[h.sk.fm.sel] = null;
  msg(`放逐了 ${s.title}`);
}

// ---------------------------------------------------------------- 驯龙（BUB ~ BUP）
// 拷贝神塔的技能（火速 / 冰封 / 恐惧 / 神力，或对自己拷贝出震荡波），最多 3 个；每拷贝一个，从龙池里抽一种龙绑定给它，放这个技能时召唤这种龙
const XL_POOL = [['h064', 0.2], ['h063', 1], ['h065', 1], ['h066', 1], ['h067', 1]];
const XL_DRAGON = { h063: 'normal', h064: 'hero', h065: 'pierce', h066: 'chaos', h067: 'magic' };
const XL_AB = {   // 技能等级的数值（火速 / 恐惧拷贝后从 2 级开始；原图 1 级是占位）
  火速: { max: 13, cd: [12, 12, 11.8, 11.6, 11.4, 11.2, 11, 10.8, 10.6, 10.4, 10, 10, 10], v: [1.7, 1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.8, 2.8],
    r: [200, 200, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300], dur: [2, 2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3, 3, 3] },
  冰封: { max: 13, cd: [3], dur: [2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.9, 3.1, 3.3, 3.5, 3.7, 4] },
  恐惧: { max: 13, cd: [12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 7, 7, 7], v: [80, 80, 90, 100, 110, 120, 130, 140, 150, 160, 200, 200, 200], dur: [3, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 8, 8] },
  神力: { max: 12, cd: [5, 4.8, 4.6, 4.4, 4.2, 4, 3.8, 3.6, 3.4, 3, 3, 3], v: [2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.8, 4.8, 4.8], dur: [1.8, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
};
const XL_SRC = { 火速塔: '火速', 冰封塔: '冰封', 恐惧塔: '恐惧', 神力塔: '神力' };
function xlDragon(h, uid, life) {
  const big = { h069: { dmg: 11000, cd: 0.3, range: 700, atk: 'hero', label: '三', title: '三头迷你龙' }, h07I: { dmg: 9000, cd: 0.35, range: 450, atk: 'hero', splash: 320, label: '惧', title: '恐惧之龙' },
    h068: { dmg: 10000, cd: 0.55, range: 900, atk: 'hero', splash: 180, label: '神', title: '神力巨龙' } }[uid];
  const o = big || { dmg: 220, cd: uid === 'h064' ? 0.6 : 0.5, range: 800, atk: XL_DRAGON[uid], splash: 100, label: '龙', title: '龙' };
  hsum(h, h.x + rnd(-80, 80), h.y + rnd(-80, 80), life, { cd: o.cd, range: o.range, atk: o.atk, splash: o.splash || 0 },
    { label: o.label, title: o.title, kind: 'dragon', mobile: { speed: 400, leash: 1800 }, stats: () => ({ dmg: o.dmg + 120 * h.sk.r012 }) });   // 龙族 R012：+120 / 级
}
// 放一个拷贝来的技能：效果 + 召唤绑定的龙；30 级时有几种技能组合会换成特殊的龙（BUE）
function xlCast(h, k, tg) {
  const s = h.sk.xl, L = s.lv[k], a = XL_AB[k], has = n => s.lv[n] > 0, lv30 = h.level >= 30;
  if (k === '火速') {
    for (const o of alliesNear(h.x, h.y, lvl(a.r, L))) giveBuff(o, 'fire', lvl(a.v, L), lvl(a.dur, L));
    FXS.nova(h.x, h.y, lvl(a.r, L), '#ff8a3c', 0.4); xlDragon(h, s.dragon[k], 15);
  } else if (k === '冰封') {
    for (const m of inRange(h.x, h.y, 600)) { if (m.boss) continue; stun(m, lvl(a.dur, L)); m.frozenUntil = G.t + lvl(a.dur, L); m.frozenBy = h; m.frozenDmg = 500 * L; }
    FXS.nova(h.x, h.y, 600, '#bff4ff', 0.4);
    if (lv30 && !has('神力') && has('震荡波') && has('恐惧') && h.mana >= 3) { h.mana -= 2; xlDragon(h, 'h069', 10); } else xlDragon(h, s.dragon[k], 10);
  } else if (k === '恐惧') {
    for (const m of inRange(h.x, h.y, 600)) debuffM(m, 'fear', lvl(a.v, L), lvl(a.dur, L));
    FXS.nova(h.x, h.y, 600, '#c48bff', 0.5);
    if (lv30 && has('火速') && !has('震荡波') && !has('冰封') && !has('神力')) { aoeAt(h, h.x, h.y, 600, 60000, 'hero'); h.mana = Math.max(0, h.mana - 16); xlDragon(h, 'h07I', 7); }
    else if (lv30 && !has('神力') && has('震荡波') && has('冰封') && h.mana >= 3) { h.mana -= 2; xlDragon(h, 'h069', 10); }
    else xlDragon(h, s.dragon[k], 15);
  } else if (k === '神力') {
    const c = alliesNear(h.x, h.y, 600).filter(o => o.cat !== 'uniq').sort((p, q) => towerStats(q).dmg / towerStats(q).cd - towerStats(p).dmg / towerStats(p).cd)[0];
    if (c) giveBuff(c, 'divine', lvl(a.v, L), lvl(a.dur, L));
    const only = lv30 && !has('火速') && !has('震荡波') && !has('冰封') && !has('恐惧');
    if (only && !s.ik && G.wood >= 60) { s.ik = 1; G.wood -= 60; msg('驯龙学会了驯龙神力龙'); }
    if (only && s.ik && h.mana >= 8) { h.mana -= 8; xlDragon(h, 'h068', 10); } else xlDragon(h, s.dragon[k], 10);
  } else if (k === '震荡波') {
    const lvW = s.lv.震荡波, d = lvW <= 1 ? 100 : lvW * 1000;
    lineHit(h, h.x, h.y, tg.x, tg.y, 800, 200, d, 'magic', null, '#9fd8ff');
    if (lv30 && !has('神力') && has('冰封') && has('恐惧') && h.mana >= 3) { h.mana -= 2; xlDragon(h, 'h069', 10); } else xlDragon(h, s.dragon[k], 10);
    s.lv.震荡波 = clamp(Math.floor(h.mana / 50), 1, 30);                  // 放完按魔法值重设等级（BUE：魔法/50）
  }
}
function xlCopy(h, t) {
  const s = h.sk.xl, du = h.sk.du, k = t === h ? '震荡波' : t && XL_SRC[t.fam];
  if (!k) return msg('拷贝神技：对火速塔、恐惧塔、神力塔、冰封塔或驯龙自己使用');
  if (!cdReady(h, 'copy')) return msg('拷贝神技冷却中');
  if (s.lv[k] > 0) return msg('已经拷贝过这个技能');
  if (du >= 3) return msg('最多 3 个技能');
  if (G.wood < du * 18) return msg(`木材不足（需要 ${du * 18}）`);
  if (k !== '震荡波' && h.stat.int < du * 80) return msg(`需要智力达到 ${du * 80}`);
  setCd(h, 'copy', 5);
  G.wood -= du * 18; if (k !== '震荡波') h.stat.int -= du * 80;
  h.sk.du++;
  s.lv[k] = k === '火速' || k === '恐惧' ? 2 : 1;
  // 从龙池按权重抽一种龙（抽到的移出龙池），先放出来 8 秒
  const pool = XL_POOL.filter(([u]) => !Object.values(s.dragon).includes(u));
  let x = Math.random() * pool.reduce((a, [, w]) => a + w, 0), uid = pool[pool.length - 1][0];
  for (const [u, w] of pool) if ((x -= w) <= 0) { uid = u; break; }
  s.dragon[k] = uid; if (k !== '震荡波') s.last = k;                 // 混乱只升级四种神塔技能
  xlDragon(h, uid, 8);
  msg(`驯龙拷贝了 ${k}`);
  FXS.ring(h.x, h.y, 200, '#ffd257', 0.6, 4);
}

// ---------------------------------------------------------------- 恶魔之子（BUS ~ BUp）
// 两个马甲：地刺（h06C，攻击即"地狱刺"，带腐蚀攻击和地狱火）和蝙蝠（h06D，放腐臭蜂群和火焰雨）。能量 JD：地狱火 / 地刺攻击 / 蜂群各 +1，
// 攒够 66（学了恶魔吞噬 12）时英雄攻击触发恶魔吞噬（火焰雨 + 1000 范围 [魔法×等级×X] 伤害）
const EM_CORR = [60, 500, 1500, 3000, 6000, 9000, 12000, 20000, 30000, 60000, 90000, 100000, 110000, 120000];    // 腐蚀攻击 A0O5：附加伤害
const EM_CORR_ARMOR = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 300, 400, 500, 600];                         // 腐蚀攻击：减甲
const EM_SWARM = [1000, 2000, 4000, 6000, 8000, 10000, 15000, 20000, 40000, 80000, 100000, 120000];               // 腐臭蜂群 A0OD
const emLv = h => h.sk.em;
// 地刺的腐蚀等级：智力/30（≥300 为 10）+ (地狱刺等级-1)×2，变身时 + 变身等级×2；蜂群等级：力量/27（≥270 为 10），变身时 + 变身等级×2
const emCorrLv = h => clamp((h.stat.int >= 300 ? 10 : Math.floor(h.stat.int / 30)) + (emLv(h).il ? emLv(h).In * 2 : Math.max(0, emLv(h).Io - 1) * 2), 1, 14);
const emSwarmLv = h => clamp((h.stat.str >= 270 ? 10 : Math.floor(h.stat.str / 27)) + (emLv(h).il ? emLv(h).In * 2 : 0), 1, 12);
const emEnergy = (h, n = 1) => { h.sk.em.jd += n; };
function emInferno(h, x, y, k) {   // 一次地狱火：250 范围伤害并晕 0.5 秒（变身后忽视护甲的条件见调用处）
  aoeAt(h, x, y, 250, h.stat.agi * h.level * k.mul, 'chaos', { ignoreArmor: k.ignore });
  for (const m of inRange(x, y, 250)) stun(m, 0.5);
  FXS.fall(x, y, { z: 700, dx: -200, dy: 120, dur: 0.3, color: '#7cff4a', core: '#e8ffd0', size: 24, rock: '#203018', onEnd: () => FXS.explosion(x, y, 0.6, '#7cff4a') });
  emEnergy(h);
}
function emSwarm(h) {   // 蝙蝠从英雄 1090 外随机方向飞向英雄：一条线上的腐臭蜂群
  const a = rnd(0, TAU), x0 = h.x + Math.cos(a) * 1090, y0 = h.y + Math.sin(a) * 1090;
  lineHit(h, x0, y0, h.x, h.y, 1090, 200, EM_SWARM[emSwarmLv(h) - 1], 'magic', null, '#a07cff');
  emEnergy(h);
}
function emDevour(h) {   // 恶魔吞噬：蝙蝠在英雄处放火焰雨（BUp）
  const e = emLv(h), base = h.mana * h.level, strike = (k, ign) => { aoeAt(h, h.x, h.y, 1000, base * k, 'hero', { ignoreArmor: ign }); FXS.nova(h.x, h.y, 1000, '#ff5a2a', 0.5); };
  if (!e.ns) { for (let i = 0; i < 3; i++) later(0.3 * i, () => strike(2)); later(0.9, () => strike(2 + (e.il > G.t ? e.In * 2 : 0))); }
  else later(0.5, () => strike(8 + (e.il > G.t ? e.In * 2 : 0)));
  msg('恶魔吞噬！');
}
function emSpike(h) {   // 地刺马甲（h06C）：学了地狱刺才攻击；每次攻击 能量 +1（恶魔吞噬 +2）、英雄魔法 +0.2
  hsum(h, h.x + 90, h.y - 60, 0, { cd: 1.3, range: 800, atk: 'pierce' }, { label: '刺', title: '地狱刺', kind: 'emspike',
    stats: () => ({ dmg: 3 + EM_CORR[emCorrLv(h) - 1], as: (emLv(h).Ip ? 0.6 : 0) + (emLv(h).In >= 2 ? 1 : 0.6) }),   // 傲慢：+60% 攻速；嗜血 A0O7：1 级 +60%，变身 2 级 +100%
    onLaunch() { emEnergy(h, emLv(h).ns ? 2 : 1); h.mana = Math.min(h.maxMana(), h.mana + 0.2); },
    onHit(s, m) { debuffM(m, 'corrode', EM_CORR_ARMOR[emCorrLv(h) - 1], 3600); } });
}
const emUp = (key, name) => ({ tip: () => `${name}升到 2 级（30 木材）`, why: h => emLv(h)[key] >= 2 ? '已经是 2 级' : G.wood < 30 ? '木材不足（需要 30）' : null, cost: () => ({}),
  apply(h) { G.wood -= 30; emLv(h)[key] = 2; if (key === 'In') msg('变身强化'); else msg(`${name}升到 2 级`); } });

Object.assign(HERO_KITS, {
  // 妖灵：四种飞鸟 + 冰冻冷箭（技能本身的效果在 HERO_DEF.妖灵 的攻击触发里）
  妖灵: [{}, {}, {}, {}, { onAttack(h, m) { slowM(m, 0.5, 2); m.bcsd = G.t + 2; } }],
  // 恶魔之子：学会 = 1 级，再次学习（30 木材）升 2 级（恶魔吞噬不能升级）
  恶魔之子: [
    { init(h) { emLv(h).Im = 1; }, up: emUp('Im', '地狱火') },
    { init(h) { emLv(h).Io = 1; emSpike(h); }, up: emUp('Io', '地狱刺') },
    { init(h) { emLv(h).Ip = 1; }, up: emUp('Ip', '傲慢') },
    { init(h) { emLv(h).In = 1; }, up: emUp('In', '变身') },
    { init(h) { emLv(h).ns = 1; } },
  ],
  伏魔: [], 驯龙: [],
});
Object.assign(HERO_DEF, {
  妖灵: {
    points: 8,                                          // 原图建成时给 8 点技能点（其他英雄 3 点）
    init(h) { Object.assign(h.sk, { hx: rint(1, 10), hz: rint(1, 3), l0: 0, l1: 0, md: 0 }); },
    second(h) { h.sk.l0++; h.sk.md++; },                 // L0 / MD 每秒 +1（1 秒计时器）
    stats: h => ({ multi: learned(h, 3) ? 999 : 0, multiR: 800, as: learned(h, 4) ? 0.4 : 0 }),   // 通用飞鸟（Aroc）：打 800 范围所有敌人；冷箭 R00X 攻速 +40%
    onLaunch(h, tg) {
      // BTI：每次攻击放践踏（魔法飞鸟，CD 6）、咆哮（混乱飞鸟，CD 8），放出时召唤所有学会的鸟；普通飞鸟 10% 召唤 1 只、10% 目标处 200 范围 力量×100
      if (learned(h, 1) && cdOk(h, 'stomp', 6)) ylBirds(h);
      if (learned(h, 2) && cdOk(h, 'roar', 8)) ylBirds(h);
      if (learned(h, 0) && Math.random() < 0.1) ylBird(h, 0);
      if (learned(h, 0) && Math.random() < 0.1) aoe(h, tg, 200, h.stat.str * 100, 'normal');
      // BTK：学了通用飞鸟、全属性 ≥800、L0 ≥16：每次攻击 200 范围 攻击力×12 穿刺无视护甲，打 8 次后重新计时
      const s = h.sk;
      if (learned(h, 3) && s.l0 >= 16 && h.stat.str + h.stat.agi + h.stat.int >= 800) {
        if (s.l1 >= 7) { s.l1 = 0; s.l0 = 0; } else s.l1++;
        aoe(h, tg, 200, heroStats(h).dmg * 12, 'pierce', true, '#ffd257');
      }
      // BTN：冷箭减速中的敌人生命 ≥50%、MD ≥4：200 范围 [目标最大生命/20]（智力 ≥400 为 /10）英雄伤害
      if (learned(h, 4) && tg.bcsd > G.t && tg.hp >= tg.maxHp * 0.5 && s.md >= 4) {
        s.md = 0; aoe(h, tg, 200, tg.maxHp / (h.stat.int >= 400 ? 10 : 20), 'hero', false, '#bff4ff');
      }
    },
    info: h => [`飞鸟攻击：普通 +${YL_BIRD[0].tech(h)} · 魔法 +${YL_BIRD[1].tech(h)} · 混乱 +${YL_BIRD[2].tech(h)} · 通用 +${YL_BIRD[3].tech(h)}（X=${18 - h.sk.hx} Y=${13 - h.sk.hx} Z=${11 + h.sk.hx}）`],
  },
  伏魔: {
    init(h) { h.sk.fm = { slots: [null, null, null], sel: 0, nh: false, panda: null, t: 0 }; },
    tick(h, dt) {
      const f = h.sk.fm;
      for (const s of f.slots) if (s && G.towers.includes(s)) fmCast(h, s);
      if ((f.t += dt) >= 2) {                              // BIo：每 2 秒把离英雄 2000 以外的随从拉回来
        f.t = 0;
        for (const s of [...f.slots, f.panda]) if (s && G.towers.includes(s) && (Math.abs(s.x - h.x) >= 2000 || Math.abs(s.y - h.y) >= 2000)) { s.x = h.x; s.y = h.y; }
      }
      // 疯狂伏魔令（A0NH，CD 3.5，9 魔法）：1000 范围 攻击力×8 英雄伤害
      if (f.nh && h.mana >= 9 && anyEnemy(h.x, h.y, 1000) && cdOk(h, 'nh', 3.5)) { h.mana -= 9; aoeAt(h, h.x, h.y, 1000, heroStats(h).dmg * 8, 'hero'); FXS.nova(h.x, h.y, 1000, '#ffd257', 0.5); }
    },
    onKill(h, m, src) {
      const f = h.sk.fm;
      if (f.slots.includes(src)) src.ud++;
      // 大地、火焰、风暴三个家族成员都在：一半概率获得疯狂伏魔令，一半召唤熊猫元神（各一次）；家族不全时失去伏魔令
      const fam = new Set(f.slots.filter(s => s && G.towers.includes(s)).map(s => s.family));
      if (fam.has('大地') && fam.has('火焰') && fam.has('风暴')) {
        if (Math.random() < 0.5) { if (!f.nh) { f.nh = true; msg('伏魔获得疯狂伏魔令'); } }
        else if (!f.panda) {
          f.panda = hsum(h, h.x, h.y, 0, { cd: 0.75, range: 300, atk: 'hero', splash: 300 }, { label: '熊', title: '熊猫元神', kind: 'panda', mobile: { speed: 450, leash: 2000 },
            stats: () => ({ dmg: 2 + 700 * fmTech(h).atk, as: 0.1 * fmTech(h).as }),
            onLaunch(s, tg) { if (G.towers.some(t => t.fam === '小熊猫塔（火）') && h.mana >= 1) { h.mana -= 0.2; aoeAt(h, tg.x, tg.y, 300, h.stat.agi * h.stat.agi / 12, 'hero'); } } });
          msg('熊猫元神出现了');
        }
      } else if (f.nh) f.nh = false;
    },
    cmds: h => {
      const f = h.sk.fm, n = f.slots.filter(s => s && G.towers.includes(s)).length;
      return [
        cmd('Q', '驯', '驯化野兽', cmdTip(h, 0, `8 木材 + 10 魔法 · 冷却 10 秒 · 随从 ${n}/3`), () => heroPick('驯化野兽：选择一个敌人', (x, y, hit) => fmTame(h, hit && G.monsters.includes(hit) ? hit : nearest(x, y, 200))),
          { ...cmdIco(h, 0), active: G.pending === 'heroPick', cdOf: () => [cdLeft(h, 'tame'), 10] }),
        cmd('W', '放', '放逐随从', cmdTip(h, 1, `放逐 ${f.sel + 1} 号随从`), () => fmBanish(h), { ...cmdIco(h, 1) }),
        cmd('E', '选', `选择随从（${f.sel + 1} 号）`, cmdTip(h, 2, f.slots.map((s, i) => `${i + 1} 号：${s && G.towers.includes(s) ? `${s.title} Lv${clamp(Math.floor(s.ud / 100), 1, 5)}（杀敌 ${s.ud - 1}）` : '空'}`).join('<br>')),
          () => { f.sel = (f.sel + 1) % 3; uiDirty(); }, { ...cmdIco(h, 2) }),
        cmd('R', '族', '家族召唤', cmdTip(h, 3, `800 金 + 60 魔法 · 冷却 12 秒 · 需要力量 ≥ ${80 * f.slots.filter(s => s && G.towers.includes(s) && s.family).length}`), () => fmCall(h),
          { ...cmdIco(h, 3), cost: 800, cdOf: () => [cdLeft(h, 'call'), 12] }),
      ];
    },
    info: h => [`随从：${h.sk.fm.slots.map(s => s && G.towers.includes(s) ? `${s.title} Lv${clamp(Math.floor(s.ud / 100), 1, 5)}` : '空').join(' · ')}${h.sk.fm.nh ? ' · 疯狂伏魔令' : ''}`, beastWpnTxt()],
  },
  驯龙: {
    init(h) { h.sk.xl = { lv: { 火速: 0, 冰封: 0, 恐惧: 0, 神力: 0, 震荡波: 0 }, dragon: {}, last: null, ik: 0 }; h.sk.du = 0; h.sk.r012 = 0; },
    tick(h) {
      // BUG：每 0.5 秒下令放恐怖嚎叫 / 火速 / 冰封（神力是自动施放），冷却好了才放得出来
      const s = h.sk.xl;
      for (const k of ['恐惧', '火速', '冰封', '神力']) {
        if (!s.lv[k] || !anyEnemy(h.x, h.y, k === '冰封' || k === '恐惧' ? 600 : 1500) || !cdOk(h, 'xl' + k, lvl(XL_AB[k].cd, s.lv[k]))) continue;
        if (s.lv[k] < XL_AB[k].max) s.last = k;                // 混乱升级的是最近放过的技能（eX）
        xlCast(h, k);
      }
    },
    onLaunch(h, tg) { if (h.sk.xl.lv.震荡波 && cdOk(h, 'xlwave', 4)) xlCast(h, '震荡波', tg); },   // BUJ：攻击时朝目标放震荡波
    cmds: h => {
      const s = h.sk.xl;
      return [
        cmd('Q', '乱', '混乱', cmdTip(h, 0, `冷却 8 秒 · 下一个提升：${s.last ? `${s.last} ${s.lv[s.last]} 级` : '（还没放过技能）'}`), () => {
          if (!cdReady(h, 'chaos')) return msg('混乱冷却中');
          const k = s.last;
          if (!k || h.stat.agi < 14 || s.lv[k] >= XL_AB[k].max) return msg(!k ? '还没有可以提升的神技' : h.stat.agi < 14 ? '敏捷不足 14' : '已经是最高等级');
          setCd(h, 'chaos', 8); s.lv[k]++; h.stat.agi -= 14; msg(`${k} 升到 ${s.lv[k]} 级`); uiDirty();
        }, { ...cmdIco(h, 0), cdOf: () => [cdLeft(h, 'chaos'), 8] }),
        cmd('W', '龙', `龙族（${h.sk.r012} 级）`, cmdTip(h, 1, '消耗 8 点力量 · 冷却 6 秒'), () => {
          if (!cdReady(h, 'r012')) return msg('龙族冷却中');
          if (h.stat.str < 8 || h.sk.r012 >= 100) return msg(h.stat.str < 8 ? '力量不足 8' : '已经是最高等级');
          setCd(h, 'r012', 6); h.sk.r012++; h.stat.str -= 8; uiDirty();
        }, { ...cmdIco(h, 1), cdOf: () => [cdLeft(h, 'r012'), 6] }),
        cmd('E', '拷', '拷贝神技', cmdTip(h, 2, `已拷贝：${Object.entries(s.lv).filter(([, v]) => v).map(([k, v]) => `${k} ${v} 级`).join('、') || '无'}<br>下一个需要 ${h.sk.du * 18} 木材、智力 ≥ ${h.sk.du * 80}`),
          () => heroPick('拷贝神技：选择火速塔 / 恐惧塔 / 神力塔 / 冰封塔，或驯龙自己', (x, y, hit) => xlCopy(h, hit)), { ...cmdIco(h, 2), active: G.pending === 'heroPick', cdOf: () => [cdLeft(h, 'copy'), 5] }),
      ];
    },
    info: h => [`神技：${Object.entries(h.sk.xl.lv).filter(([, v]) => v).map(([k, v]) => `${k} ${v} 级`).join(' · ') || '无'} · 龙族攻击 +${120 * h.sk.r012}`],
  },
  恶魔之子: {
    init(h) { h.sk.em = { Im: 0, Io: 0, Ip: 0, In: 0, ns: 0, il: 0, jd: 0, iq: 0 }; },
    onLaunch(h, tg) {
      const e = emLv(h), il = e.il > G.t;
      // 能量够了：恶魔吞噬（BUj）
      const need = e.ns ? 12 : 66;
      if (e.jd >= need) { e.jd -= need; emDevour(h); }
      // 变身（A0NX，CD 20）：10 秒
      if (e.In && cdOk(h, 'meta', 20)) { e.il = G.t + 10; msg('恶魔之子变身'); FXS.nova(h.x, h.y, 300, '#7cff4a', 0.6); }
      // 地狱火（A0NV，CD 8）：英雄放 1 次，地刺马甲再放 3 次（2 级 6 次）
      if (e.Im && cdOk(h, 'inferno', 8)) {
        const x = tg.x, y = tg.y, il2 = e.il > G.t;
        emInferno(h, x, y, { mul: 5 + e.ns * 2, ignore: il2 });
        for (let i = 1; i <= (e.Im >= 2 ? 6 : 3); i++) later(0.1 * i, () => emInferno(h, x, y, { mul: 6 + e.ns * 3, ignore: e.Im >= 2 && e.il > G.t }));
      }
      // 傲慢：吸收一道光（蜂群），概率按等级和是否变身；吸收 9 道（没学恶魔吞噬时）放出黑暗气息：一个方向上的敌人直接杀死
      if (e.Ip && ((e.Ip === 1 && !il && Math.random() < 0.25) || (e.Ip === 2 && !il && Math.random() < 0.5) || (e.Ip === 2 && il && Math.random() < 0.25))) {
        e.iq++; emSwarm(h);
        if (e.ns && Math.random() < 0.25) emSwarm(h);
      }
      if (e.iq >= 9 && !e.ns) {
        e.iq = 0; const a = rnd(0, TAU);
        lineHit(h, h.x, h.y, h.x + Math.cos(a), h.y + Math.sin(a), 2000, 200, 3e8, 'magic', { ignoreArmor: true }, '#3a1050');
        emEnergy(h); msg('黑暗气息');
      }
    },
    onKill(h) { const e = emLv(h); if (e.il > G.t) h.mana = Math.min(h.maxMana(), h.mana + e.In); },   // 变身中杀敌额外 +变身等级 点魔法
    info: h => { const e = emLv(h); return [`能量 ${e.jd}/${e.ns ? 12 : 66}${e.il > G.t ? ' · 变身中' : ''} · 光 ${e.iq}`]; },
  },
});

// ---------------------------------------------------------------- 图腾（BUs ~ BU7）
// 四种切换（穿刺 tt1 / 物理 tt2 / 混乱 tt3 / 魔法 tt4）：点"切换"随机学会一种（占学技能名额，条件同学技能），学会时上限 2 级，"提升上限"最多到 4 级。
// 点某个切换：伤害类型换成它，它的等级在 1 和上限之间来回走（满了 -1，没满 +1）；几种切换共用冷却（按敏捷 6~20 秒）。
// 每次攻击：英雄处 1000 范围 随机[下限, 上限] 伤害，上限 = 四种切换等级之积 × 三属性和，下限 = 上限 × JQ%（按切换时的智力 1~70）
const TT = [{ atk: 'pierce', n: '穿刺' }, { atk: 'normal', n: '物理' }, { atk: 'chaos', n: '混乱' }, { atk: 'magic', n: '魔法' }];
const ttJo = h => tiers(h.stat.agi, [300, 240, 200, 160, 120, 80, 40], [6, 8, 10, 12, 14, 16, 18, 20]);
const ttJq = h => tiers(h.stat.int, [280, 240, 200, 160, 120, 80, 40], [70, 60, 50, 40, 30, 20, 10, 1]);
function ttLearn(h) {
  const t = h.sk.tt, du = t.cap.filter(c => c >= 2).length, c = LEARN_COST[du];
  if (!c) return msg('最多学习 4 种切换');
  if (G.wood < c.wood || h.stat.str < c.str) return msg('学习条件不足');
  // BUv：1/4 穿刺、1/3 物理、1/2 混乱，否则魔法；抽到学过的就顺延到第一种没学的
  const fresh = i => t.cap[i] === 1;
  let i = Math.random() < 1 / 4 && fresh(0) ? 0 : Math.random() < 1 / 3 && fresh(1) ? 1 : Math.random() < 1 / 2 && fresh(2) ? 2 : fresh(3) ? 3 : [0, 1, 2].find(fresh);
  if (i == null) return msg('学习条件不足');
  G.wood -= c.wood; t.cap[i] = 2; t.lv[i] = 1; t.on = i;
  msg(`学会了${TT[i].n}切换`); uiDirty();
}
function ttCap(h) {
  const t = h.sk.tt, ok = i => t.cap[i] >= 2 && t.cap[i] <= 3;
  if (G.wood < 12 || h.mana < 300) return msg('条件不足（12 木材 + 300 魔法）');
  const i = Math.random() < 1 / 4 && ok(0) ? 0 : Math.random() < 1 / 3 && ok(1) ? 1 : Math.random() < 1 / 2 && ok(2) ? 2 : ok(3) ? 3 : [0, 1, 2].find(ok);
  if (i == null) return msg('条件不足');
  G.wood -= 12; h.mana -= i === 3 ? 350 : 300; t.cap[i]++;
  msg(`${TT[i].n}上限升到 ${t.cap[i]} 级`); uiDirty();
}
function ttSwitch(h, i) {
  const t = h.sk.tt;
  if (t.cap[i] < 2) return msg(`还没有学会${TT[i].n}切换`);
  if (G.t - t.last < t.jo) return msg(`共享冷却还需 ${Math.ceil(t.jo - (G.t - t.last))} 秒`);
  t.last = G.t; t.on = i;
  t.lv[i] += t.lv[i] >= t.cap[i] ? -1 : 1;
  t.jo = ttJo(h); t.jq = ttJq(h);
  msg(`切换成功：${TT[i].n} ${t.lv[i]} 级`); uiDirty();
}
Object.assign(HERO_KITS, { 图腾: [{}, {}] });
Object.assign(HERO_DEF, {
  图腾: {
    noBook: true,
    init(h) {
      h.sk.tt = { cap: [1, 1, 1, 1], lv: [0, 0, 0, 0], on: -1, last: -999, jo: 0, jq: 70, js: 0 };
      // 遣返马甲 h06M：JS ≥ 15 - 穿刺等级×2 时攻击的敌人受到 [物理等级²×3000] 英雄伤害并传回出怪口，英雄魔法 + 魔法等级×2
      hsum(h, h.x, h.y, 0, { cd: 1, range: 1000, atk: 'pierce' }, { label: '遣', title: '图腾遣返', kind: 'ttward', silent: true, onLaunch(s, tg) {
        const t = h.sk.tt;
        if (t.js < 15 - t.lv[0] * 2 || tg.boss || tg.uid === 'Udea') return;
        t.js = 0; h.mana = Math.min(h.maxMana(), h.mana + t.lv[3] * 2);
        hurt(tg, t.lv[1] * t.lv[1] * 3000, 'hero', h);
        if (!tg.dead) sendHome(tg);
      } });
    },
    second(h) { h.sk.tt.js++; },
    stats: () => ({ multi: 999, multiR: 1000, as: G.petFx.r1 || 0 }),   // TT多攻击（Aroc）：打 1000 范围所有敌人；宠物绵羊 A0R0 +9% 攻速
    onLaunch(h) {
      const t = h.sk.tt; if (t.on < 0) return;
      const jl = t.lv.reduce((a, v) => a * Math.max(1, v), 1) * (h.stat.str + h.stat.agi + h.stat.int);
      aoeAt(h, h.x, h.y, 1000, rint(Math.floor(jl * (t.jq + (G.petFx.lx || 0) * 3) / 100), jl), TT[t.on].atk);
    },
    // BU7：学了混乱切换后，敌人走进外环四边中点 Z / k / P / M 时有 [混乱等级×12]% 被传回出怪口
    onNode(h, m) { const t = h.sk.tt; if (!t.lv[2] || !'ZkPM'.includes(m.cur) || m.boss || rint(1, 100) > 12 * t.lv[2]) return false; sendHome(m); return true; },
    cmds: h => {
      const t = h.sk.tt, du = t.cap.filter(c => c >= 2).length, c = LEARN_COST[du], sk = D.heroes.图腾.skills;
      const sw = i => cmd('', TT[i].n[0], `${TT[i].n}切换${t.cap[i] >= 2 ? ` ${t.lv[i]}/${t.cap[i]}` : ''}`,
        `<b>${TT[i].n}切换</b>${t.on === i ? '（当前）' : ''}<br>${t.cap[i] >= 2 ? `等级 ${t.lv[i]}，上限 ${t.cap[i]}。点击：伤害类型换成${TT[i].n}，等级在 1 和上限之间来回` : '还没有学会'}`,
        () => ttSwitch(h, i), { ico: 'branch-' + TT[i].atk, active: t.on === i, disabled: t.cap[i] < 2, cdOf: () => [Math.max(0, t.jo - (G.t - t.last)), t.jo || 1] });
      return [
        cmd('Q', '切', '学习切换', `<b>${sk[0].name}</b><br>${sk[0].desc.replace(/\n/g, '<br>')}${c ? `<br><b>需要：木材 ${c.wood}，力量 ≥ ${c.str}</b>` : '<br>已经学满 4 种'}`, () => ttLearn(h),
          { ico: 'skill-图腾-0', iconKey: 'icon:skill:图腾:0', disabled: !c }),
        cmd('W', '升', '提升上限', `<b>${sk[1].name}</b><br>${sk[1].desc.replace(/\n/g, '<br>')}`, () => ttCap(h), { ico: 'skill-图腾-1', iconKey: 'icon:skill:图腾:1' }),
        sw(0), sw(1), sw(2), sw(3),
      ].map((x, k) => Object.assign(x, { key: x.key || ['Q', 'W', 'E', 'R', 'T', 'G'][k] }));
    },
    info: h => { const t = h.sk.tt; return [`切换：${TT.map((x, i) => t.cap[i] >= 2 ? `${x.n} ${t.lv[i]}/${t.cap[i]}` : null).filter(Boolean).join(' · ') || '无'}${t.on >= 0 ? ` · 当前${TT[t.on].n}` : ''} · 下限 ${t.jq}%`]; },
  },
});
// ---------------------------------------------------------------- 猛犸（BTZ ~ BTi）
// 雷霆（M1 A0MD，CD 7，900 范围，减速 30% / 60%）：伤害上限 IG = (敏捷 + IF) × 40 × MAX 原始塔个数 + 100，随机取 [IG/2, IG]，15% 为 IG×12；
// 践踏（M2 A0ME，CD 3，900 范围，晕 1 / 2 秒）：上限 IH = (智力 + IF) × 210 × MAX 另类塔个数 + 200，随机取 [1, IH]。塔数最多算 10。
// IF：学了力量之源后 = 力量（放技能后更新）。刷新：放技能后 40% 刷新冷却；重击 20% 晕 2 秒 + 攻击力×20。元神：攻击时在目标处召唤 3.5 秒（CD 12），离猛犸 1000 外伤害 1/3
const mmCount = cat => Math.min(10, G.towers.filter(t => t.cat === cat && t.levels && isMax(t)).length);
function mmCast(h, src, k) {
  const s = h.sk.mm, far = src !== h && dist2(src.x, src.y, h.x, h.y) >= 1000 * 1000;
  const IG = (h.stat.agi + s.if) * 40 * mmCount('raw') + 100, IH = (h.stat.int + s.if) * 210 * mmCount('alt') + 200;
  if (k === 'clap') {
    const crit = Math.random() < 0.15, d = crit ? IG * (far ? 4 : 12) : rnd(IG / 2, IG) / (far ? 3 : 1);
    aoeAt(h, src.x, src.y, 900, d, 'hero');
    for (const m of inRange(src.x, src.y, 900)) slowM(m, s.lv2 ? 0.6 : 0.3, 5);
    FXS.nova(src.x, src.y, 900, '#9fd8ff', 0.4); SFX.spell('frostNova', { x: src.x, y: src.y });
  } else {
    aoeAt(h, src.x, src.y, 900, rnd(1, IH) / (far ? 3 : 1), 'hero');
    for (const m of inRange(src.x, src.y, 900)) stun(m, s.lv2 ? 2 : 1);
    FXS.nova(src.x, src.y, 900, '#ffd257', 0.4);
  }
  if (learned(h, 3)) s.if = h.stat.str;
  if (learned(h, 2) && Math.random() < 0.4) { h.cds.mmclap = 0; h.cds.mmstomp = 0; popText(h.x, h.y + 90, '刷新', '#9fd8ff'); }
}
Object.assign(HERO_KITS, {
  猛犸: [{}, {}, { onAttack(h, m) { if (Math.random() < 0.2) { stun(m, 2); hurt(m, heroStats(h).dmg * 20, 'hero', h); } } }, {}, {}],
});
Object.assign(HERO_DEF, {
  猛犸: {
    init(h) { h.sk.mm = { if: 0, ward: true, lv2: false }; },
    onLaunch(h, tg) {
      const s = h.sk.mm;
      s.lv2 = learned(h, 2) || learned(h, 3);                 // 学了刷新或力量之源，雷霆 / 践踏升到 2 级
      if (learned(h, 1) && cdOk(h, 'mmstomp', 3)) mmCast(h, h, 'stomp');
      if (learned(h, 0) && cdOk(h, 'mmclap', 7)) mmCast(h, h, 'clap');
      if (learned(h, 4) && s.ward && cdOk(h, 'mmward', 12)) {
        const x = tg.x, y = tg.y, w = hsum(h, x, y, 3.5, { cd: 0.5, range: 900 }, { label: '元', title: '猛犸元神', kind: 'mmward', silent: true, onLaunch(t) {
          if (learned(h, 0) && cdOk(t, 'clap', 7)) mmCast(h, t, 'clap');
          if (learned(h, 1) && cdOk(t, 'stomp', 3)) mmCast(h, t, 'stomp');
        } });
        FXS.ring(w.x, w.y, 200, '#9fd8ff', 0.5, 4);
      }
    },
    cmds: h => learned(h, 4) ? [cmd('G', '元', '元神：' + (h.sk.mm.ward ? '开' : '关'), '<b>元神</b>（点击切换）<br>开：攻击时在目标处召唤元神（3.5 秒，冷却 12 秒），放学会的雷霆和践踏',
      () => { h.sk.mm.ward = !h.sk.mm.ward; uiDirty(); }, { active: h.sk.mm.ward, iconKey: 'icon:skill:猛犸:4', cdOf: () => [cdLeft(h, 'mmward'), 12] })] : [],
    info: h => [`MAX 原始塔 ${mmCount('raw')} · MAX 另类塔 ${mmCount('alt')}${learned(h, 3) ? ` · 力量之源 ${h.sk.mm.if}` : ''}`],
  },
});
// ---------------------------------------------------------------- 先知（BVc ~ BVi）
// 释魂攻击力：最大 = KP + 敏捷×2，最小 = (KO + 智力×5) × (1 + 强化最小等级×5%)。每次攻击在目标处 100 范围打一次：
// 命运几率（等级×6%）打最大，否则在 [最小, 最大] 里随机（最小比最大还大就打最小）。KU 每秒 +1，≥ 6 + 400/敏捷 时嗜血 3 秒（攻速 +500%）。
// 宠物：企鹅 KV（G.petFx.kv）最小攻击 +6%，绵羊 Kx（G.petFx.kx）命运每级 +2%
const xzMax = h => h.sk.xz.kp + h.stat.agi * 2;
const xzMin = h => Math.round((h.sk.xz.ko + h.stat.int * 5) * (1 + G.petFx.kv + h.sk.xz.lv.pq * 0.05));
function xzSoul(h, m) {   // 释魂（A0PT，CD 3，射程 1200，10 魔法）：对目标 (KP + 敏捷×2)×5 英雄伤害，按目标是不是精英随机这次能吸收的攻击力
  const s = h.sk.xz, L = s.lv.ps;
  if (!m || m.dead || !G.monsters.includes(m)) return msg('释魂：要选一个敌人');
  if (dist2(h.x, h.y, m.x, m.y) > 1200 * 1200) return msg('目标太远（施法距离 1200）');
  if (!cdReady(h, 'soul')) return msg('释魂冷却中');
  if (h.mana < 10) return msg('魔法值不足（需要 10 点）');
  h.mana -= 10; setCd(h, 'soul', 3); s.kt = 1;
  hurt(m, xzMax(h) * 5, 'hero', h);
  const r = (a, b) => rint(L * a[0] + a[1], L * b[0] + b[1]);
  if (m.elite) { if (rint(1, 20) === 3) { s.ks = L * 145 + 100; s.kr = r([145, 100], [180, 100]); } else { s.ks = r([50, 50], [120, 50]); s.kr = r([50, 50], [140, 50]); } }
  else if (rint(1, 10) <= 2) { s.ks = r([70, 30], [110, 30]); s.kr = r([10, 30], [90, 30]); }
  else if (rint(1, 10) === 3) { s.kr = r([85, 180], [160, 180]); s.ks = rint(1, L * 7 + 8); }
  else if (rint(1, 20) === 5) { s.ks = r([80, 80], [110, 80]); s.kr = r([170, 50], [200, 50]); }
  else { s.ks = r([10, 50], [90, 50]); s.kr = r([60, 50], [130, 50]); }
  FXS.beam(h.x, h.y, 150, m.x, m.y, 50, '#c48bff', 1.4, 0.3);
  msg(`释魂：可以吸收最大攻击 +${s.kr}、最小攻击 +${s.ks}`);
}
Object.assign(HERO_KITS, { 先知: [] });
Object.assign(HERO_DEF, {
  先知: {
    init(h) { h.sk.xz = { kp: 0, ko: 0, kt: 0, ks: 0, kr: 0, ku: 0, lv: { pp: 1, pq: 1, pr: 1, ps: 1 } }; },
    second(h) { h.sk.xz.ku++; },
    onLaunch(h, tg) {
      const s = h.sk.xz;
      if (s.ku >= 6 + 400 / Math.max(1, h.stat.agi)) { s.ku = 0; giveBuff(h, 'bloodlust', 5, 3); FXS.ring(h.x, h.y, 140, '#ff5a4f', 0.5, 4); }
      const max = xzMax(h), min = xzMin(h);
      const d = rint(1, 100) <= s.lv.pp * (6 + G.petFx.kx) ? max : min > max ? min : rint(min, max);
      aoe(h, tg, 100, d, 'hero', false, '#c48bff');
    },
    cmds: h => {
      const s = h.sk.xz, L = s.lv, ic = i => cmdIco(h, i);
      const up = (key, ok, pay, name) => () => { const why = ok(); if (why) return msg(why); pay(); msg(name); uiDirty(); };
      return [
        cmd('Q', '释', '释魂', cmdTip(h, 0, `冷却 3 秒 · 10 魔法 · 释魂伤害 ${fmt(xzMax(h) * 5)}`), () => heroPick('释魂：选择一个敌人', (x, y, hit) => xzSoul(h, hit && G.monsters.includes(hit) ? hit : nearest(x, y, 200))),
          { ...ic(0), active: G.pending === 'heroPick', cdOf: () => [cdLeft(h, 'soul'), 3] }),
        cmd('W', '吸', `吸收（${L.ps - 1}/20）`, cmdTip(h, 4, s.kt ? `这次可以吸收：最大 +${s.kr}、最小 +${s.ks}（消耗 1 力量）` : '先对敌人释魂'), up('ps',
          () => !s.kt ? '先对敌人释魂' : L.ps >= 21 ? '已经吸收 20 次' : h.stat.str < 2 ? '力量不足' : L.ps > h.level ? '释魂次数不能大于英雄等级' : null,
          () => { L.ps++; h.stat.str--; s.kt = 0; s.kp += s.kr; s.ko += s.ks; }, '吸收成功'), { ...ic(4), disabled: !s.kt }),
        cmd('E', '命', `命运（${L.pp} 级）`, cmdTip(h, 1, `${L.pp * (6 + G.petFx.kx)}% 打最大攻击 · 升级：${L.pp + 3} 力量 + ${L.pp * 50} 魔法`), up('pp',
          () => L.pp >= 10 ? '已经是最高等级' : h.stat.str < L.pp + 4 ? '力量不足' : h.mana < L.pp * 50 ? '魔法值不足' : null,
          () => { h.mana -= L.pp * 50; h.stat.str -= L.pp + 3; L.pp++; }, '命运升级'), ic(1)),
        cmd('R', '小', `强化最小攻击（${L.pq} 级）`, cmdTip(h, 2, `最小攻击 +${L.pq * 5}% · 升级：${L.pq + 6} 木材 + ${L.pq * 100} 魔法`), up('pq',
          () => L.pq >= 10 ? '已经是最高等级' : G.wood < L.pq + 6 ? '木材不足' : h.mana < L.pq * 100 ? '魔法值不足' : null,
          () => { h.mana -= L.pq * 100; G.wood -= L.pq + 6; L.pq++; }, '强化最小攻击升级'), ic(2)),
        cmd('G', '大', `强化最大攻击（${L.pr} 级）`, cmdTip(h, 3, `下一级：最大攻击 +${L.pr * 20}，${L.pr * 100} 金币 + ${L.pr < 10 ? 3 : L.pr < 20 ? 4 : 5} 力量`), up('pr',
          () => L.pr >= 30 ? '已经是最高等级' : G.gold < L.pr * 100 ? '金币不足' : h.stat.str < (L.pr < 10 ? 3 : L.pr < 20 ? 5 : 6) ? '力量不足' : null,
          () => { G.gold -= L.pr * 100; s.kp += L.pr * 20; h.stat.str -= L.pr < 10 ? 3 : L.pr < 20 ? 4 : 5; L.pr++; }, '强化最大攻击升级'), { ...ic(3), cost: L.pr * 100 }),
      ];
    },
    info: h => [`释魂攻击：${fmt(xzMin(h))} ~ ${fmt(xzMax(h))} · 命运 ${h.sk.xz.lv.pp * (6 + G.petFx.kx)}%`],
  },
});
// ---------------------------------------------------------------- 鬼（BVl ~ BVt）
// 药水 Q W E R 依次喝 3 瓶合成一种攻击效果（BVo）：第 1 瓶定伤害类型（普通 / 穿刺 / 魔法 / 混乱），第 2 瓶定伤害公式
// （力量²/6、敏捷×力量/2、智力×力量/2、随机 1~三属性和×50），第 3 瓶定范围（Q 目标 180、W 目标 180 无视护甲 ÷3、E 鬼身边 600 ÷1.5、R 鬼身边 600 无视护甲 ÷4.5）。
// 合成后每次攻击都放这个效果；再喝就重新开始（喝第 1 瓶时旧组合失效）。提升属性（f）：每 180 秒换一次随机属性加成 [等级×30]
const GUI_ATK = ['normal', 'pierce', 'magic', 'chaos'];
const GUI_THIRD = [{ div: 1, r: 180, self: false, ign: false }, { div: 3, r: 180, self: false, ign: true }, { div: 1.5, r: 600, self: true, ign: false }, { div: 4.5, r: 600, self: true, ign: true }];
const GUI_RAND = [50, 17, 33, 11];                           // 随机公式的系数（已经按第 3 瓶除过，照原图的整数）
function guiDrink(h, k) {
  const s = h.sk.gui;
  if (s.step === 0) { s.combo = [k, 0, 0]; s.step = 1; }
  else if (s.step === 1) { s.combo[1] = k; s.step = 2; }
  else { s.combo[2] = k; s.step = 0; msg('药水技能合成成功'); }
  uiDirty();
}
function guiDamage(h, tg) {
  const [a, b, c] = h.sk.gui.combo, { str, agi, int } = h.stat;
  if (!a || !b || !c) return;
  const t = GUI_THIRD[c - 1];
  const d = b === 4 ? rint(1, (str + agi + int) * GUI_RAND[c - 1]) : [str * str / 6, agi * str / 2, int * str / 2][b - 1] / t.div;
  aoe(h, t.self ? h : tg, t.r, d, GUI_ATK[a - 1], t.ign, '#c8b8ff');
}
function guiStat(h) {   // 换一次随机属性加成（建成时和每 180 秒）
  const s = h.sk.gui;
  if (s.ke) h.stat[s.ke] -= s.kf * 30;
  s.kf = s.lv; s.ke = Math.random() < 1 / 3 ? 'str' : Math.random() < 0.5 ? 'agi' : 'int';
  h.stat[s.ke] += s.kf * 30;
  msg(`鬼的属性加成：${statCN(s.ke)} +${s.kf * 30}`);
}
Object.assign(HERO_KITS, { 鬼: [] });
Object.assign(HERO_DEF, {
  鬼: {
    init(h) { h.sk.gui = { step: 0, combo: [0, 0, 0], lv: 1, kf: 0, ke: null }; guiStat(h); },
    second(h) { if (Math.floor(G.t) % 180 === 0) guiStat(h); },
    onLaunch(h, tg) { guiDamage(h, tg); },
    cmds: h => {
      const s = h.sk.gui, names = ['Q', 'W', 'E', 'R'];
      const pot = i => cmd(names[i], names[i], `药水 ${names[i]}`, cmdTip(h, i + 1, `下一瓶是第 ${s.step + 1} 瓶`), () => guiDrink(h, i + 1), { ...cmdIco(h, i + 1), active: s.combo[s.step === 0 ? 2 : s.step - 1] === i + 1 && s.step !== 0 });
      return [pot(0), pot(1), pot(2), pot(3),
        cmd('G', '属', `提升属性（${s.lv} 级）`, cmdTip(h, 0, `10 木材升 1 级（最多 10 级）`), () => {
          if (s.lv >= 10) return msg('已经是最高等级'); if (G.wood < 10) return msg('木材不足（需要 10）');
          G.wood -= 10; s.lv++; msg(`提升属性升到 ${s.lv} 级（下次换属性时生效）`); uiDirty();
        }, { ...cmdIco(h, 0), cost: 0 })];
    },
    info: h => { const [a, b, c] = h.sk.gui.combo, n = 'QWER'; return [`药水组合：${a ? n[a - 1] : '-'}${b ? n[b - 1] : '-'}${c ? n[c - 1] : '-'}${a && b && c ? '（生效）' : ''} · 属性加成 ${h.sk.gui.ke ? statCN(h.sk.gui.ke) + ' +' + h.sk.gui.kf * 30 : '无'}`]; },
  },
});
// ---------------------------------------------------------------- 虫（BV2 ~ BWL）
// 路刺（h076，3 秒）：每 0.25 秒 100 范围 力量×X 穿刺（X 按敏捷 / 智力较高者 10~120）；小虫（h077，6 秒）：每 0.25 秒对目标 智力×Y 混乱（Y 按智力 20~120），
// 学了尸爆后小虫死时 150 范围 敏捷×Z 混乱（无视护甲）。飞虫：每 2 秒在英雄附近放惊吓 5 秒（每秒 6 只，750 范围，等级 = 力量/50 + 尸爆 + 1，600 起每级翻倍）。
// 虫巢：英雄攻击时召唤小虫（虫巢可以搬到地图上任意地点）。甲虫：2 只，240 秒，150 范围 智力×48，攻击 4 次放 1 根路刺，冰霜光环减速 40%
const czX = h => { const m = Math.max(h.stat.agi, h.stat.int); return m > 400 ? 120 : m > 300 ? 80 : m > 200 ? 40 : m > 100 ? 20 : 10; };
const czY = h => tiers(h.stat.int, [301, 201, 101], [120, 70, 40, 20]);
const czZ = h => tiers(h.stat.agi, [421, 301, 181, 81], [80, 50, 30, 15, 10]);
function czSpike(h, x, y) {
  hsum(h, x, y, 3, { cd: 0.25, range: 130 }, { label: '刺', title: '路刺', kind: 'czspike', silent: true, onLaunch(s) { aoeAt(h, s.x, s.y, 100, h.stat.str * czX(h), 'pierce'); } });
}
function czBug(h, x, y) {
  hsum(h, x + rnd(-80, 80), y + rnd(-80, 80), 6, { cd: 0.25, range: 300 }, { label: '虫', title: '小虫', kind: 'czbug', silent: true, mobile: { speed: 300, leash: 1500 },
    onLaunch(s, tg) { hurt(tg, h.stat.int * czY(h), 'chaos', h); FXS.beam(s.x, s.y, 60, tg.x, tg.y, 40, '#c48bff', 1, 0.1); },
    onExpire(s) { if (learned(h, 3)) { aoeAt(h, s.x, s.y, 150, h.stat.agi * czZ(h), 'chaos', { ignoreArmor: true }); FXS.explosion(s.x, s.y, 0.5, '#9fffb0'); } } });
}
function czStampede(h, x, y) {   // 惊吓 A0QD：5 秒，每秒 6 只野兽落在 750 范围内随机一点
  const L = Math.min(8, Math.floor(h.stat.str / 50) + (learned(h, 3) ? 2 : 1)), d = 600 * 2 ** (L - 1);
  for (let k = 0; k < 30; k++) later(k / 6, () => {
    const a = rnd(0, TAU), r = rnd(0, 750), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    aoeAt(h, px, py, 120, d, 'magic', { ignoreArmor: true }); FXS.ring(px, py, 120, '#c8a060', 0.25, 2);
  });
}
Object.assign(HERO_KITS, {
  虫: [
    { onLaunch(h, tg) { czSpike(h, tg.x, tg.y); } },
    { tick(h, dt) { if (cdOk(h, 'czstamp', 2)) { const a = rnd(0, TAU); czStampede(h, h.x + Math.cos(a) * 200, h.y + Math.sin(a) * 200); } } },
    { init(h) { const a = rnd(0, TAU); h.sk.hive = { x: h.x + Math.cos(a) * 200, y: h.y + Math.sin(a) * 200 }; },
      onLaunch(h) { if (cdOk(h, 'czhive', 0.3)) czBug(h, h.sk.hive.x, h.sk.hive.y); } },
    {},
    { init(h) {
      for (let k = 0; k < 2; k++) hsum(h, h.x + rnd(-100, 100), h.y + rnd(-100, 100), 240, { cd: 0.6, range: 350, atk: 'normal', splash: 270 }, { label: '甲', title: '腐尸甲虫', kind: 'beetle',
        mobile: { speed: 270, leash: 1500 }, n: 0, aura: { kind: 'slow', r: 600, v: 0.4 }, stats: () => ({ dmg: 200 }),
        onLaunch(s, tg) { aoeAt(h, tg.x, tg.y, 150, h.stat.int * 48, 'normal'); if (++s.n >= 5) { s.n = 0; czSpike(h, tg.x, tg.y); } } });
    } },
  ],
});
Object.assign(HERO_DEF, {
  虫: {
    cmds: h => learned(h, 2) ? [cmd('G', '巢', '搬虫巢', '<b>虫巢</b><br>把虫巢搬到地图上任意地点（小虫从虫巢出来）',
      () => heroPick('虫巢：选择新位置', (x, y) => { h.sk.hive = { x, y }; FXS.ring(x, y, 160, '#9fffb0', 0.5, 4); }), { iconKey: 'icon:skill:虫:2', active: G.pending === 'heroPick' })] : [],
  },
});
// ---------------------------------------------------------------- 大法师（BWm ~ BWs）
// 每学一个技能在地上放一个印记（马甲），之后放这个技能（手动指定地点，CD 90 / 暗黑 60）把印记搬过去。印记不停攻击身边的敌人：
//   火焰之印 每 0.2 秒 350 范围 力量×等级×(2 / 1 / 0.5，按力量 >400 / >200) 普通；雷电之印 每 0.3 秒 200 范围 敏捷×等级×(6 / 3 / 1) 穿刺；
//   冰雪之印 每 0.3 秒 200 范围 智力×等级×(4 / 3 / 2) 魔法；暗黑之印（随机在英雄 ±800 处）每 0.15 秒 200 范围 三属性和×等级×(2 / 1 / 1/3) 混乱。
// 两个印记之间生成中间印记，伤害 = 两者距离 × 两项属性和 / X（火雷 / 火冰 / 雷冰，暗黑和英雄之间 /120）。
// 印记掌控：不再生成中间印记，火、冰印记各多一个（轮流搬），暗黑伤害 ×3（6 / 3 / 1），英雄攻击晕 0.2 秒
const DF_MARK = {
  fire: { label: '火', title: '火焰之印', cd: 0.2, r: 350, atk: 'normal', dmg: h => h.stat.str * h.level * tiers(h.stat.str, [401, 201], [2, 1, 0.5]) },
  bolt: { label: '雷', title: '雷电之印', cd: 0.3, r: 200, atk: 'pierce', dmg: h => h.stat.agi * h.level * tiers(h.stat.agi, [401, 201], [6, 3, 1]) },
  ice: { label: '冰', title: '冰雪之印', cd: 0.3, r: 200, atk: 'magic', dmg: h => h.stat.int * h.level * tiers(h.stat.int, [401, 201], [4, 3, 2]) },
  dark: { label: '暗', title: '暗黑之印', cd: 0.15, r: 200, atk: 'chaos', dmg: h => (h.stat.str + h.stat.agi + h.stat.int) * h.level * (learned(h, 4) ? tiers(h.stat.str, [401, 201], [6, 3, 1]) : tiers(h.stat.str, [401, 201], [2, 1, 1 / 3])) },
};
function dfMark(h, key, x, y, title, dmgFn, r, atk, cd, opt = {}) {
  return hsum(h, x, y, 0, { cd, range: Math.min(r, 350) }, { label: DF_MARK[key] ? DF_MARK[key].label : '印', title, kind: 'dfmark', silent: true, ...opt,
    onLaunch(s) { aoeAt(h, s.x, s.y, r, dmgFn(), atk, { ignoreArmor: !!opt.ignore }); } });
}
function dfMids(h) {   // 重新生成中间印记（BWs）
  const d = h.sk.df, m = d.marks;
  G.towers = G.towers.filter(t => !d.mids.includes(t)); d.mids = [];
  if (learned(h, 4)) return;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mid = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2], { str, agi, int } = h.stat;
  const add = (a, b, title, f, r, atk, ignore) => { if (!a || !b) return; const [x, y] = mid(a, b), L = dist(a, b); d.mids.push(dfMark(h, 'mid', x, y, title, () => L * f(), r, atk, 0.16, { ignore })); };
  add(m.fire, m.bolt, '火雷之印', () => (str + agi) / (agi > str * 2 ? 20 : agi > str ? 30 : 60), 350, 'normal');
  add(m.fire, m.ice, '火冰之印', () => (str + int) / (int > str * 2 ? 20 : int > str ? 30 : 60), 200, 'pierce');
  add(m.bolt, m.ice, '雷冰之印', () => (int + agi) / (int > agi * 2 || agi > int * 2 ? 20 : 40), 200, 'magic');
  add(h, m.dark, '暗黑中间之印', () => (str + agi + int) / 120, 150, 'chaos', true);
}
const dfKit = (key, cd, point) => ({
  cd, point, needsTarget: !!point,
  init(h) {
    const k = DF_MARK[key], a = rnd(0, TAU), r = key === 'dark' ? rnd(0, 800) : 0;
    h.sk.df.marks[key] = dfMark(h, key, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, k.title, () => k.dmg(h), k.r, k.atk, k.cd);
    dfMids(h);
  },
  cast(h, p) {
    const d = h.sk.df;
    if (key === 'dark') { const m = d.marks.dark; m.x = h.x + rnd(-800, 800); m.y = h.y + rnd(-800, 800); }
    else {
      let m = d.marks[key];
      if (learned(h, 4) && (key === 'fire' || key === 'ice')) {      // 印记掌控：火、冰各两个，轮流搬
        const k2 = key + '2', k = DF_MARK[key];
        if (!d.marks[k2]) d.marks[k2] = dfMark(h, key, p.x, p.y, k.title, () => k.dmg(h), k.r, k.atk, k.cd);
        else { d.flip[key] = !d.flip[key]; if (d.flip[key]) m = d.marks[k2]; }
      }
      m.x = p.x; m.y = p.y;
    }
    FXS.ring(p ? p.x : h.x, p ? p.y : h.y, 200, '#9fd8ff', 0.5, 4);
    dfMids(h);
  },
});
Object.assign(HERO_KITS, {
  大法师: [dfKit('fire', 90, 1000), dfKit('bolt', 90, 1100), dfKit('ice', 90, 900), dfKit('dark', 60, 0),
    { init(h) { dfMids(h); }, onAttack(h, m) { stun(m, 0.2); } }],
});
Object.assign(HERO_DEF, { 大法师: { init(h) { h.sk.df = { marks: {}, mids: [], flip: {} }; } } });
// ---------------------------------------------------------------- 狗头人觉醒者（BW1 ~ BXR）
// [额外]伤害（BW4，每次攻击按目标重算）：属性（属性选择那项）× F / (X - 属性转换)，X 按属性 ≥800 / 600 / 400 / 200 为 9 / 12 / 15 / 18，否则 21；
// 类型 1：F = 100 + 目标移速；类型 2：F = 550 - 目标移速（目标晕眩时按 550）。
// 额外伤害：每 3 秒开关一次，开着时攻击在目标处 150 范围打一次（模式 2：每 9 秒、350 范围；原图切换模式的触发器没有改到 Lg，这里按说明做）；
// 属性掌控：每 3 秒 1000 范围 [额外]×等级，附近敌人移速 +30%（升级 6000 金，最多 4 级）；禁止通行：放陷阱（最多 1~4 个，12 木升级），
// 敌人经过时每 1.4 秒 160 范围 [额外] 并晕 0.6 秒；狗头分身：额外伤害改成 /3 无视护甲，陷阱换成分身（每次攻击 100 范围 [额外]/6 无视护甲），英雄攻击 5% 晕眩
function gtLq(h, m) {
  const s = h.sk.gt, v = h.stat[h.growth], X = tiers(v, [800, 600, 400, 200], [9, 12, 15, 18, 21]) - (learned(h, 1) ? 1 : 0);
  const spd = m ? m.speed * (1 + (m.auraSpeed || 0)) : 300, F = s.lu === 1 ? 100 + spd : m && m.stunUntil > G.t ? 550 : 550 - spd;
  return v * F / X;
}
function gtTrap(h, x, y) {
  const s = h.sk.gt, me = learned(h, 4);
  if (s.traps.some(t => G.towers.includes(t) && dist2(t.x, t.y, x, y) < 150 * 150)) return msg('离已有的陷阱太近');
  const t = me
    ? hsum(h, x, y, 0, { cd: 0.4, range: 300 }, { label: '狗', title: '狗头分身', kind: 'gttrap', silent: true, onLaunch(u, tg) { aoe(h, tg, 100, gtLq(h, tg) / 6, 'hero', true); if (Math.random() < 0.05) stun(tg, 2); } })
    : hsum(h, x, y, 0, { cd: 1.4, range: 140 }, { label: '阱', title: '陷阱', kind: 'gttrap', silent: true, onLaunch(u, tg) { aoeAt(h, u.x, u.y, 160, gtLq(h, tg), 'hero'); for (const m of inRange(u.x, u.y, 160)) stun(m, 0.6); FXS.nova(u.x, u.y, 160, '#ffd257', 0.3); } });
  s.traps = s.traps.filter(o => G.towers.includes(o));
  if (s.traps.length >= s.lh) { const old = s.traps.shift(); G.towers = G.towers.filter(o => o !== old); }
  s.traps.push(t);
}
Object.assign(HERO_KITS, {
  狗头人觉醒者: [
    { init(h) { h.sk.gt.lg = 1; } },
    { init(h) { h.sk.gt.li = 1; },                                       // 属性转换：再次学习（2 木）把另外两项各 20 点换成所选属性 40 点
      up: { tip: () => '另外两项属性各 -20，所选属性 +40（2 木材）', why: h => { const o = ['str', 'agi', 'int'].filter(k => k !== h.growth); return G.wood < 2 ? '木材不足（需要 2）' : o.some(k => h.stat[k] < 21) ? '另外两项属性都要 ≥21' : null; },
        cost: () => ({}), apply(h) { G.wood -= 2; for (const k of ['str', 'agi', 'int']) h.stat[k] += k === h.growth ? 40 : -20; msg(`${statCN(h.growth)} +40`); } } },
    { init(h) { h.sk.gt.lj = 1; },
      up: { tip: h => `属性掌控升到 ${h.sk.gt.lj + 1} 级（6000 金）`, why: h => h.sk.gt.lj >= 4 ? '已经是最高等级' : null, cost: () => ({ gold: 6000 }), apply(h) { h.sk.gt.lj++; } } },
    { init(h) { h.sk.gt.lh = 1; },
      up: { tip: h => `陷阱数量 ${h.sk.gt.lh} → ${h.sk.gt.lh + 1}（12 木材）`, why: h => h.sk.gt.lh >= 4 ? '已经是最多' : G.wood < 12 ? '木材不足（需要 12）' : null, cost: () => ({}), apply(h) { G.wood -= 12; h.sk.gt.lh++; } } },
    { onAttack(h, m) { if (Math.random() < 0.05) stun(m, 20); } },     // A0SL 重击：5%，晕 20 秒（技能表数值）
  ],
});
Object.assign(HERO_DEF, {
  狗头人觉醒者: {
    init(h) { h.sk.gt = { lg: 0, li: 0, lj: 0, lh: 0, lu: 1, mode: 1, ls: 0, t: 0, traps: [] }; },
    second(h) {
      const s = h.sk.gt;
      if ((Math.floor(G.t) % (s.mode === 2 ? 9 : 3)) === 0) s.ls = s.ls ? 0 : 1;
      if (s.lj && Math.floor(G.t) % 3 === 0) { aoeAt(h, h.x, h.y, 1000, gtLq(h, nearest(h.x, h.y, 1000)) * s.lj, 'hero'); FXS.nova(h.x, h.y, 1000, '#ffb347', 0.4); }
    },
    auras: h => h.sk.gt.lj ? [{ x: h.x, y: h.y, r: 1000, kind: 'enemySpeed', v: 0.2 + 0.1 * h.sk.gt.lj }] : [],    // 诱导作战：附近敌人移速 +30%（每级 +10%）
    onLaunch(h, tg) {
      const s = h.sk.gt;
      if (!s.lg || !s.ls) return;
      const q = gtLq(h, tg), r = s.mode === 2 ? 350 : 150;
      if (learned(h, 4)) aoe(h, tg, r, q / 3, 'hero', true, '#ffb347'); else aoe(h, tg, r, q, 'hero', false, '#ffb347');
    },
    cmds: h => {
      const s = h.sk.gt, out = [];
      if (s.lg) out.push(cmd('G', '模', `额外伤害：模式 ${s.mode}`, '<b>额外伤害</b>（点击切换，冷却 20 秒）<br>模式 1：每 3 秒开关一次，150 范围<br>模式 2：每 9 秒开关一次，350 范围',
        () => { if (!cdOk(h, 'gtmode', 20)) return msg('冷却中'); s.mode = s.mode === 1 ? 2 : 1; uiDirty(); }, { iconKey: 'icon:skill:狗头人觉醒者:0', cdOf: () => [cdLeft(h, 'gtmode'), 20] }));
      if (s.li) out.push(cmd('H', '类', `伤害类型 ${s.lu}`, '<b>伤害类型</b>（点击切换，冷却 8 秒）<br>类型 1：属性 × (100 + 敌人移速) / X<br>类型 2：属性 × (550 - 敌人移速) / X（晕眩的敌人按 550）',
        () => { if (!cdOk(h, 'gtlu', 8)) return msg('冷却中'); s.lu = s.lu === 1 ? 2 : 1; uiDirty(); }, { iconKey: 'icon:skill:狗头人觉醒者:1', cdOf: () => [cdLeft(h, 'gtlu'), 8] }));
      if (s.lh) out.push(cmd('J', '阱', `放${learned(h, 4) ? '分身' : '陷阱'}（${s.traps.filter(t => G.towers.includes(t)).length}/${s.lh}）`, '<b>禁止通行</b><br>在地上放陷阱（冷却 6.5 秒），超过数量时替换最早的那个',
        () => { if (!cdReady(h, 'gttrap')) return msg('冷却中'); heroPick('禁止通行：选择地点', (x, y) => { if (dist2(h.x, h.y, x, y) > 1000 * 1000) return msg('太远了（施法距离 1000）'); setCd(h, 'gttrap', 6.5); gtTrap(h, x, y); }); },
        { iconKey: 'icon:skill:狗头人觉醒者:3', active: G.pending === 'heroPick', cdOf: () => [cdLeft(h, 'gttrap'), 6.5] }));
      return out;
    },
    info: h => { const s = h.sk.gt, m = nearest(h.x, h.y, 1500); return [`[额外] ${fmt(gtLq(h, m))}（类型 ${s.lu}，${statCN(h.growth)}）${s.lg ? ` · 额外伤害${s.ls ? '开' : '关'}` : ''}`]; },
  },
});
// ---------------------------------------------------------------- 巨魔召唤师（BXX ~ BXs）
// 召唤巨魔：在可建造的地方放一个固定不动的巨魔（6 种随机，最多 英雄等级/5 + 2 个），回收要 60 魔法。
// 随机技能：最多 2 个（同一种再抽到 +1 级，第一次 +2 级），拥有 2 个后 10 秒内再点清空（120 魔法 + 2 木材）。各颜色巨魔攻击时的触发（BXa，只触发第一个满足的）：
//   蓝（智力）8%：300 范围 智力×24×等级（三种蓝巨魔都在场时，否则 智力×8×等级）；紫（魔法）1/3：150 范围 英雄魔法×6×等级（同上，否则 ×2）；
//   绿（强化）12%：200 范围 巨魔攻击/2×等级；远程（敏捷）1/5：100 范围 敏捷×45×等级（否则 ×15）；近战（力量）3/25：200 范围 力量×60×等级（否则 300 范围 ×20）。
// 原图这些条件是 and / or 同级从左到右算（照搬）。自爆巨魔：1 级每秒在英雄附近放惊吓（每秒 1 只，800 范围 2 秒，等级 力量/40+1）；2 级每攻击 8 次在目标处 250 范围 敏捷×240
const JM_TROLL = { h08E: ['蓝', 'magic', 0.85, 800, 260, 0], h08D: ['紫', 'pierce', 0.85, 800, 260, 0], h08F: ['绿', 'chaos', 0.85, 800, 380, 0], h08H: ['紫', 'chaos', 0.7, 400, 680, 0],
  h08C: ['蓝', 'magic', 0.7, 400, 280, 0], h08I: ['蓝', 'normal', 0.6, 800, 260, 0], h08J: ['紫', 'normal', 0.55, 400, 380, 300], h08G: ['绿', 'pierce', 0.7, 400, 260, 0] };
const JM_STAMP = [500, 1000, 2000, 4000, 6000, 15000, 30000, 50000, 90000];
// 巨魔科技（玩家科技，原图在巨魔身上研究，选中巨魔时显示）：近战巨魔（h08C / h08G / h08H / h08J）R01N 攻速 +25%/级、R01O 攻击 +800/级；
// 远程巨魔（h08D / h08E / h08F / h08I）和巨魔召唤师本身 R01P 攻速 +18%/级、R01Q 攻击 +500/级。各 5 级，每级 6 / 8 木材（不要金币）
const JM_MELEE = new Set(['h08C', 'h08G', 'h08H', 'h08J']);
const JM_TECH = { melee: { as: 0.25, atk: 800, name: '近战', ids: ['R01N', 'R01O'] }, ranged: { as: 0.18, atk: 500, name: '远程', ids: ['R01P', 'R01Q'] } };
const jmCls = uid => JM_MELEE.has(uid) ? 'melee' : 'ranged';
function jmTechCmds(t) {
  const h = t.owner, c = jmCls(t.uid), T = h.sk.jm.tech[c], k = JM_TECH[c];
  const up = (key, f, wood, id, label, step) => costCmd(t, key, `巨魔${label}（${k.name}）`, `${T[f]}/5 级，现在 +${step(T[f])}${T[f] < 5 ? `，下一级 +${step(T[f] + 1)}` : ''}<br>所有${k.name}巨魔${c === 'ranged' ? '和巨魔召唤师' : ''}都有效`,
    { wood: T[f] < 5 ? wood : 0 }, () => { T[f]++; msg(`巨魔${label}（${k.name}）升到 ${T[f]} 级`); }, { why: T[f] >= 5 ? '已经是最高等级' : null, o: { ico: 'upg-' + id } });
  return [up('Q', 'atk', 8, k.ids[1], '攻击力', n => fmt(n * k.atk)), up('W', 'as', 6, k.ids[0], '攻速', n => pctTxt(n * k.as))];
}
const jmTrolls = h => heroUnits(h).filter(t => t.kind === 'troll');
const jmHas = (h, ...ids) => ids.every(id => jmTrolls(h).some(t => t.uid === id));
function jmTrollHit(h, t, tg) {   // BXa：从左到右的 and / or（同级运算）
  const J = h.sk.jm.mj, T = id => t.uid === id, s = h.stat, P = (r, k, d, atk = 'hero', ign = false) => { aoe(h, tg, r, d, atk, ign, '#9fffb0'); };
  const lr = (...xs) => xs.reduce((acc, [op, v]) => op === '&' ? acc && v : acc || v, true);
  const r8 = rint(1, 100) <= 8, r3 = rint(1, 3) === 2, r12 = rint(1, 100) <= 12, r5 = rint(1, 5) === 1, r25 = rint(1, 25) <= 3;
  if (lr(['&', r8], ['&', J[5] >= 1], ['&', T('h08E')], ['|', T('h08I')], ['|', T('h08C')], ['&', jmHas(h, 'h08E', 'h08I', 'h08C')])) return P(300, 0, s.int * 24 * J[5], 'hero', true);
  if (lr(['&', r8], ['&', J[5] >= 1], ['&', T('h08E')], ['|', T('h08I')], ['|', T('h08C')])) return P(300, 0, s.int * 8 * J[5], 'hero', true);
  if (lr(['&', r3], ['&', J[3] >= 1], ['&', T('h08D')], ['|', T('h08H')], ['|', T('h08J')], ['&', jmHas(h, 'h08D', 'h08H', 'h08J')])) return P(150, 0, h.mana * 6 * J[3]);
  if (lr(['&', r3], ['&', J[3] >= 1], ['&', T('h08D')], ['|', T('h08H')], ['|', T('h08J')])) return P(150, 0, h.mana * 2 * J[3]);
  if (lr(['&', r12], ['&', J[4] >= 1], ['&', T('h08F')], ['|', T('h08G')], ['&', jmHas(h, 'h08F', 'h08G')])) return P(200, 0, towerStats(t).dmg / 2 * J[4], 'hero', true);
  if (lr(['&', r5], ['&', J[2] >= 1], ['&', T('h08E')], ['|', T('h08D')], ['|', T('h08F')], ['|', T('h08I')], ['&', jmHas(h, 'h08E', 'h08D', 'h08F', 'h08I')])) return P(100, 0, s.agi * 45 * J[2]);
  if (lr(['&', r5], ['&', J[2] >= 1], ['&', T('h08E')], ['|', T('h08D')], ['|', T('h08F')], ['|', T('h08I')])) return P(100, 0, s.agi * 15 * J[2]);
  if (lr(['&', r25], ['&', J[1] >= 1], ['&', T('h08H')], ['|', T('h08C')], ['|', T('h08G')], ['|', T('h08J')], ['&', jmHas(h, 'h08H', 'h08C', 'h08G', 'h08J')])) return P(200, 0, s.str * 60 * J[1]);
  if (lr(['&', r25], ['&', J[1] >= 1], ['&', T('h08H')], ['|', T('h08C')], ['|', T('h08G')], ['|', T('h08J')])) return P(300, 0, s.str * 20 * J[1]);
}
function jmSummon(h, x, y) {
  const gx = snap(x), gy = snap(y);
  if (Math.floor(h.level / 5) < jmTrolls(h).length - 1) return msg('英雄等级过低');
  if (!canPlace(gx, gy)) return msg('需要放到可建造的位置');
  const r = rint(1, 6), uid = r === 1 ? 'h08E' : r === 2 ? 'h08D' : r === 3 ? 'h08F' : r === 5 ? 'h08H' : r === 6 ? 'h08C' : rint(1, 6) === 4 ? 'h08I' : rint(1, 3) === 2 ? 'h08J' : 'h08G';
  const [c, atk, cd, range, dmg, splash] = JM_TROLL[uid];
  const T = h.sk.jm.tech[jmCls(uid)], k = JM_TECH[jmCls(uid)];
  hsum(h, gx, gy, 0, { dmg, cd, range, atk, splash }, { label: c, title: `巨魔（${c}）`, kind: 'troll', uid, solid: true, onLaunch(t, tg) { jmTrollHit(h, t, tg); },
    stats: () => ({ dmg: dmg + T.atk * k.atk, as: T.as * k.as }) });
  FXS.ring(gx, gy, 160, '#9fffb0', 0.5, 4);
}
function jmRandom(h) {
  const s = h.sk.jm;
  if (s.mk <= 1) {
    s.mk++; const k = rint(1, 5);
    s.mj[k] += s.mj[k] >= 1 ? 1 : 2;
    msg(`获得技能：${['', '力量近巨魔', '敏捷远巨魔', '魔法紫巨魔', '强化绿巨魔', '智力蓝巨魔'][k]}（${s.mj[k]} 级）`);
    if (s.mk === 2) { s.ml = G.t + 10; msg('10 秒内再次随机技能可以清除全部技能（120 魔法 + 2 木材）'); }
  } else if (s.ml > G.t) {
    if (h.mana < 120 || G.wood < 2) return msg('魔法不足或木材不足');
    h.mana -= 120; G.wood -= 2; s.mk = 0; s.ml = 0; s.mj = [0, 0, 0, 0, 0, 0]; msg('全部技能已清除');
  } else { msg('最大只能获得 2 个技能（10 秒内再点一次可以清除）'); s.ml = G.t + 10; }
  uiDirty();
}
Object.assign(HERO_KITS, { 巨魔召唤师: [] });
Object.assign(HERO_DEF, {
  巨魔召唤师: {
    init(h) { h.sk.jm = { mj: [0, 0, 0, 0, 0, 0], mk: 0, ml: 0, bat: 1, mm: 0, tech: { melee: { atk: 0, as: 0 }, ranged: { atk: 0, as: 0 } } }; },
    stats: h => { const T = h.sk.jm.tech.ranged; return { dmg: T.atk * JM_TECH.ranged.atk, as: T.as * JM_TECH.ranged.as }; },   // 远程巨魔科技也作用于英雄（H08A 的科技列表）
    second(h) {                                         // 自爆巨魔 1 级：每秒一次惊吓
      if (h.sk.jm.bat !== 1 || !anyEnemy(h.x, h.y, 1200)) return;
      const L = h.stat.str >= 320 ? 9 : Math.floor(h.stat.str / 40) + 1, a = rnd(0, TAU), cx = h.x + Math.cos(a) * 200, cy = h.y + Math.sin(a) * 200;
      for (let k = 0; k < 2; k++) later(k, () => { const b = rnd(0, TAU), r = rnd(0, 800), x = cx + Math.cos(b) * r, y = cy + Math.sin(b) * r;
        aoeAt(h, x, y, 150, lvl(JM_STAMP, L), 'magic', { ignoreArmor: true }); FXS.explosion(x, y, 0.4, '#ff8a3c'); });
    },
    onLaunch(h, tg) {                                   // 自爆巨魔 2 级：每攻击 8 次
      const s = h.sk.jm;
      if (s.bat !== 2) return;
      if (s.mm >= 8) { s.mm = 0; aoe(h, tg, 250, h.stat.agi * 240, 'normal', true, '#ff8a3c'); for (const m of inRange(tg.x, tg.y, 250)) slowM(m, 0.5, 3); } else s.mm++;
    },
    cmds: h => {
      const s = h.sk.jm, n = jmTrolls(h).length;
      return [
        cmd('Q', '爆', `自爆巨魔：${s.bat === 1 ? '力量' : '敏捷'}`, cmdTip(h, 0), () => { s.bat = s.bat === 1 ? 2 : 1; uiDirty(); }, cmdIco(h, 0)),
        cmd('W', '召', `召唤巨魔（${n}/${Math.floor(h.level / 5) + 2}）`, cmdTip(h, 1), () => heroPick('召唤巨魔：选择可建造的地点', (x, y) => jmSummon(h, x, y)), { ...cmdIco(h, 1), active: G.pending === 'heroPick' }),
        cmd('E', '随', '随机技能', cmdTip(h, 2, `当前：${['力量近', '敏捷远', '魔法紫', '强化绿', '智力蓝'].map((n2, i) => s.mj[i + 1] ? `${n2} ${s.mj[i + 1]}` : null).filter(Boolean).join('、') || '无'}`), () => jmRandom(h), cmdIco(h, 2)),
        cmd('R', '收', '回收巨魔', '<b>回收巨魔</b><br>点击后选择一个巨魔，消耗 60 魔法收回', () => heroPick('回收巨魔：选择一个巨魔', (x, y, t) => {
          if (!t || t.kind !== 'troll' || t.owner !== h) return msg('要选自己的巨魔');
          if (h.mana < 60) return msg('魔法不足（需要 60）');
          h.mana -= 60; G.towers = G.towers.filter(o => o !== t);
        }), { ico: 'sell' }),
      ];
    },
    info: h => { const T = h.sk.jm.tech; return [`巨魔 ${jmTrolls(h).length} 个 · 技能 ${h.sk.jm.mk}/2 · 科技 近战 攻击 ${T.melee.atk} 攻速 ${T.melee.as} / 远程 攻击 ${T.ranged.atk} 攻速 ${T.ranged.as}（选中巨魔研究）`]; },
  },
});
// ---------------------------------------------------------------- 地狱火（BXv ~ BYY）
// 英雄和召唤的小地狱火各有一种颜色（绿 / 黄 / 橙 / 红，切换：英雄 60 魔法、小地狱火 30 魔法），同色个数（最多算 3）决定该色技能的伤害。
// 随机技能（最多 3 个，不重复；10 秒内再点清空，240 魔法）对应四种颜色：
//   绿：每 20 秒 1000 范围 力量×150×绿色个数+20000；约每 12-绿色个数 秒朝目标放三重蜂群；绿色小地狱火带腐臭蜂群
//   黄：黄色地狱火杀敌加基础攻击（英雄 +2、小地狱火 +1），攻击时召唤灵魂地狱火（120 范围 [累计攻击×黄色个数]）
//   橙：英雄每 5 次攻击 250 范围 敏捷×20×橙色个数 穿刺（无视护甲），英雄是橙色时每 41 次 550 范围 敏捷×90×…；橙色小地狱火每 5 次 敏捷×10×(1+…)
//   红：英雄每次攻击 120 范围 智力×(4 / 嗜血时 12)×红色个数 混乱（英雄是红色再加 6 / 18 倍）；红色小地狱火 智力×2×…
// 每 20 秒英雄得到嗜血（等级 (橙色个数+1)×橙技能）和神力（(黄色个数+1)×黄技能）。小地狱火在英雄 1000 范围内召唤，数量上限花金币提升（英雄等级 ≥ 次数×6）
// 地狱火之力 R01T（攻击 +300/级）/ 地狱火之速 R01S（攻速 +10%/级），各 50 级，对英雄、小地狱火、灵魂地狱火都有效，触发器自动给：
// 英雄升级时 力量 ≥ (之力等级+1)×30 → +1 级（敏捷 / 之速同理）；学技能点时条件写成 力量 ≥ 之力等级×30（少了 +1，照搬），每次最多 +1 级
function dyhTech(h, lvUp) {
  const s = h.sk.dyh, n = lvUp ? 1 : 0;
  if (s.str < 50 && h.stat.str >= (s.str + n) * 30) { s.str++; msg(`地狱火之力 ${s.str} 级`); }
  if (s.agi < 50 && h.stat.agi >= (s.agi + n) * 30) { s.agi++; msg(`地狱火之速 ${s.agi} 级`); }
}
const DYH_C = ['绿', '黄', '橙', '红'];
const dyhN = (h, c) => [h, ...heroUnits(h).filter(t => t.kind === 'dyh')].filter(t => t.dyh === c).length;
const dyhK = (h, c) => Math.min(3, dyhN(h, c));
const DYH_EXTRA = ['神力', '嗜血', '致命', '恐惧', '重击', '咆哮'];
function dyhMinion(h, x, y) {
  const s = h.sk.dyh, mins = heroUnits(h).filter(t => t.kind === 'dyh');
  if (mins.length >= s.max) return msg(s.max ? `最多 ${s.max} 个小地狱火` : '先提升召唤个数');
  if (dist2(h.x, h.y, x, y) > 1000 * 1000) return msg('需要在英雄 1000 范围以内');
  const extra = pick(DYH_EXTRA), L2 = Math.random() < 0.25;
  const t = hsum(h, x, y, 0, { cd: 1.2, range: 700, atk: 'normal', splash: 250, abils: extra === '致命' ? [{ code: 'AOcr', A: L2 ? 10 : 5, B: 10 }] : [] },
    { label: '火', title: `小地狱火（${extra}）`, kind: 'dyh', dyh: rint(0, 3), extra, n: 0, base: 80,
      stats: t2 => ({ dmg: (t2.base + 300 * s.str) * (1 + (extra === '神力' ? (L2 ? 1 : 0.6) : 0)), as: (extra === '嗜血' ? (L2 ? 0.7 : 0.4) : 0) + 0.1 * s.agi }),
      onLaunch(t2, tg) { dyhAttack(h, t2, tg); },
      onHit(t2, m) { if (extra === '重击' && Math.random() < (L2 ? 0.25 : 0.2)) { hurt(m, L2 ? 6000 : 2000, 'normal', t2); stun(m, 4); } } });
  FXS.fall(x, y, { z: 700, dx: -200, dy: 120, dur: 0.3, color: '#7cff4a', core: '#e8ffd0', size: 30, rock: '#203018', onEnd: () => FXS.explosion(x, y, 0.8, '#7cff4a') });
  return t;
}
function dyhAttack(h, t, tg) {   // BYG / BYS / BYV / BYY：英雄和小地狱火攻击时
  const s = h.sk.dyh, E = s.me, isH = t === h, agi = h.stat.agi, int = h.stat.int;
  if (!isH && t.extra === '恐惧' && cdOk(t, 'howl', 8)) for (const m of inRange(t.x, t.y, 600)) debuffM(m, 'fear', 60, 8);
  if (!isH && t.extra === '咆哮' && cdOk(t, 'roar', 4)) for (const o of alliesNear(t.x, t.y, 900)) giveBuff(o, 'roar', 0.3, 3);
  // 绿：小地狱火的腐臭蜂群（A0TY，CD 20 / 12 / 6）；英雄每约 12 秒三重蜂群（A0U3）
  if (E[1] && !isH && t.dyh === 0 && cdOk(t, 'swarm', [20, 12, 6, 6][Math.min(3, dyhK(h, 0))])) lineHit(h, t.x, t.y, tg.x, tg.y, 800, 200, 6000, 'magic', null, '#7cff4a');
  if (E[1] && isH && s.mm + dyhK(h, 0) >= (dyhN(h, 0) >= 3 ? 10 : 12)) {
    s.mm = 0; const d = [2000, 6000, 12000, 20000, 30000][Math.min(4, dyhK(h, 0))], a = Math.atan2(tg.y - h.y, tg.x - h.x);
    for (const da of [-0.35, 0, 0.35]) lineHit(h, h.x, h.y, h.x + Math.cos(a + da), h.y + Math.sin(a + da), 900, 200, d, 'magic', { ignoreArmor: true }, '#7cff4a');
  }
  // 黄：灵魂地狱火（英雄或黄色小地狱火攻击时 1/15，英雄是黄色时另有 1/50 大灵魂）
  if (E[2] && dyhN(h, 1) && (isH ? s.color === 1 : t.dyh === 1)) {
    const souls = heroUnits(h).filter(o => o.kind === 'dyhsoul').length;
    const soul = (life, title) => hsum(h, tg.x, tg.y, life, { cd: 0.4, range: 300 }, { label: '魂', title, kind: 'dyhsoul', silent: true, stats: () => ({ dmg: 1 + 300 * s.str, as: 0.1 * s.agi }),
      onLaunch(u, m) { hurt(m, 1 + 300 * s.str, 'normal', u); aoe(h, m, 120, s.ms * E[2] * dyhN(h, 1), 'normal', title === '大灵魂地狱火'); } });   // 灵魂本身的攻击 1 点（+地狱火之力）
    if (souls <= dyhN(h, 1) && rint(1, 15) === 7) soul(10, '灵魂地狱火');
    if (isH && rint(1, 50) === 6 && !heroUnits(h).some(o => o.title === '大灵魂地狱火')) soul(6, '大灵魂地狱火');
  }
  // 橙
  if (E[3] && isH && dyhN(h, 2)) {
    if (s.mz >= 4) { s.mz = 0; aoe(h, tg, 250, agi * 20 * dyhK(h, 2), 'pierce', true, '#ffb347'); } else s.mz++;
    if (s.color === 2) { if (s.mv >= 40) { s.mv = 0; aoe(h, tg, 550, agi * 90 * dyhK(h, 2), 'pierce', true, '#ffb347'); } else s.mv++; }
  }
  if (E[3] && !isH && t.dyh === 2) { if (t.n >= 4) { t.n = 0; aoe(h, tg, 250, agi * 10 * (1 + dyhK(h, 2)), 'pierce', false, '#ffb347'); } else t.n++; }
  // 红
  if (E[4] && dyhN(h, 3)) {
    const lust = bv(h, 'bloodlust') > 0, k = dyhK(h, 3);
    if (isH && s.color === 3) aoe(h, tg, 120, int * (lust ? 18 : 6) * k, 'chaos', true, '#ff5a4f');
    if (isH) aoe(h, tg, 120, int * (lust ? 12 : 4) * k, 'chaos', true, '#ff5a4f');
    if (!isH && t.dyh === 3) aoe(h, tg, 120, int * 2 * k, 'chaos', true, '#ff5a4f');
  }
}
function dyhRandom(h) {   // BXy：随机技能，最多 3 个，不重复
  const s = h.sk.dyh, have = [1, 2, 3, 4].filter(k => s.me[k]);
  if (have.length < 3) {
    const k = pick([1, 2, 3, 4].filter(x => !s.me[x])); s.me[k] = 1;
    msg(`获得技能：${DYH_C[k - 1]}色地狱火`);
    if (have.length === 2) { s.mb = G.t + 10; msg('10 秒内再次随机会清除技能（240 魔法）'); }
  } else if (s.mb > G.t) {
    if (h.mana < 240) return msg('魔法不足');
    h.mana -= 240; s.me = [0, 0, 0, 0, 0]; s.mb = 0; msg('全部技能已清除');
  } else { msg('最大只能获得 3 个技能（10 秒内再点一次可以清除）'); s.mb = G.t + 10; }
  uiDirty();
}
Object.assign(HERO_KITS, { 地狱火: [] });
Object.assign(HERO_DEF, {
  地狱火: {
    init(h) { h.sk.dyh = { color: rint(0, 3), me: [0, 0, 0, 0, 0], mb: 0, mm: 0, mz: 0, mv: 0, ms: 0, max: 0, up: 1, str: 0, agi: 0 }; h.dyh = h.sk.dyh.color; },
    onLevel(h) { dyhTech(h, true); },
    onPoint(h) { dyhTech(h, false); },
    second(h) {
      const s = h.sk.dyh; s.mm++;
      if (Math.floor(G.t) % 20 !== 0) return;                // BYD：每 20 秒
      if (s.me[3]) giveBuff(h, 'bloodlust', 0.6 * Math.min(5, (dyhN(h, 2) + 1) * s.me[3]), 20);
      if (s.me[2]) giveBuff(h, 'divine', Math.min(5, (dyhN(h, 1) + 1) * s.me[2]), 20);
      if (s.me[1] && dyhN(h, 0)) { aoeAt(h, h.x, h.y, 1000, h.stat.str * 150 * s.me[1] * dyhK(h, 0) + 20000, 'hero'); FXS.nova(h.x, h.y, 1000, '#7cff4a', 0.6); }
    },
    stats: h => ({ dmg: h.sk.dyh.ms * 2 + 300 * h.sk.dyh.str, as: 0.1 * h.sk.dyh.agi }),   // 黄色英雄杀敌累计的基础攻击（原图直接加在单位攻击上）+ 地狱火之力 / 之速
    onLaunch(h, tg) { dyhAttack(h, h, tg); },
    onKill(h, m, src) {                                 // BYM：黄色地狱火杀敌加攻击
      const s = h.sk.dyh; if (!s.me[2] || !dyhN(h, 1)) return;
      if (src.kind === 'dyh' && src.dyh === 1) { src.base += s.me[2]; s.ms += s.me[2]; }
      if (src === h && s.color === 1) s.ms += s.me[2] * 2;
    },
    cmds: h => {
      const s = h.sk.dyh, L = s.up;
      return [
        cmd('Q', '色', `切换：${DYH_C[s.color]}色`, cmdTip(h, 1, '60 魔法 · 绿 → 黄 → 橙 → 红'), () => {
          if (h.mana < 60) return msg('魔法不足'); h.mana -= 60; s.color = (s.color + 1) % 4; h.dyh = s.color; uiDirty(); }, cmdIco(h, 1)),
        cmd('W', '随', '随机技能', cmdTip(h, 2, `当前：${[1, 2, 3, 4].filter(k => s.me[k]).map(k => DYH_C[k - 1]).join('、') || '无'}`), () => dyhRandom(h), cmdIco(h, 2)),
        cmd('E', '数', `提升召唤个数（${s.max}）`, cmdTip(h, 0, L < 6 ? `需要英雄等级 ${L * 6}，${L * 1000 + 3000} 金币` : '已经最多'), () => {
          if (L >= 6) return msg('已提升最大个数'); if (h.level < L * 6) return msg('等级不足'); if (G.gold < L * 1000 + 3000) return msg('金币不足');
          G.gold -= L * 1000 + 3000; s.up++; s.max++; msg('成功提升'); uiDirty(); }, { ...cmdIco(h, 0), cost: L * 1000 + 3000 }),
        cmd('R', '火', `召唤小地狱火（${heroUnits(h).filter(t => t.kind === 'dyh').length}/${s.max}）`, '<b>召唤小地狱火</b><br>在英雄 1000 范围内召唤一个随机颜色、带一个随机技能的小地狱火', () => heroPick('召唤小地狱火：选择地点', (x, y) => dyhMinion(h, x, y)),
          { ico: 'build', active: G.pending === 'heroPick', disabled: !s.max }),
        cmd('G', '变', '小地狱火换色', '<b>小地狱火换色</b><br>选择一个小地狱火，30 魔法换成下一种颜色（同时换一个随机技能）', () => heroPick('选择一个小地狱火', (x, y, t) => {
          if (!t || t.kind !== 'dyh') return msg('要选小地狱火'); if (h.mana < 30) return msg('魔法不足');
          h.mana -= 30; t.dyh = (t.dyh + 1) % 4; t.extra = pick(DYH_EXTRA); t.title = `小地狱火（${t.extra}）`; uiDirty(); }), { ico: 'upgrade' }),
      ];
    },
    info: h => { const s = h.sk.dyh; return [`英雄 ${DYH_C[s.color]}色 · 绿 ${dyhN(h, 0)} 黄 ${dyhN(h, 1)} 橙 ${dyhN(h, 2)} 红 ${dyhN(h, 3)} · 技能 ${[1, 2, 3, 4].filter(k => s.me[k]).map(k => DYH_C[k - 1]).join('') || '无'}`,
      `地狱火之力 ${s.str} 级（攻击 +${300 * s.str}）· 地狱火之速 ${s.agi} 级（攻速 +${pctTxt(0.1 * s.agi)}）`]; },
  },
});
// ---------------------------------------------------------------- 龙鹰（BYe ~ BY7）
// 最多学 3 个技能，学会后"再次学习"升级（最多 10 级，英雄等级 ≥ 技能等级×3，花费见各技能）。随机天赋（A0V3）：20 种里随机 1 个当前天赋
// （10 + 档位×40 魔法 + 2 木材，档位 = 英雄等级 1-9 / 10-19 / 20-29 / 30），英雄到 10 / 20 / 30 级时当前天赋被永久保留。天赋 N6[k] 的效果见各技能
const LY_TAL = ['天雷 -1 秒 CD；轰雷按全属性算', '天雷最后一击 +50% 翻倍', '轰雷少 1 次攻击', '轰雷额外 0~50% 伤害', '引雷 10 倍概率 +12%', '激电出现在怪物处、伤害 +20%',
  '激电多一次 2 倍无视护甲穿刺', '幻雷变成 100 范围 等级²×800 通用', '幻雷 -0.3 秒 CD；轰雷升级不要魔法', '幻雷 -0.4 秒 CD', '天雷 -2 秒 CD', '所有技能升级金币 -50%',
  '轰雷多一个末端闪电（范围 +280）', '激电按智力算（升级多要 智力 点魔法）', '引雷 -0.1 秒 CD、减速 +30%；幻雷 -0.2 秒 CD', '引雷 10 倍改通用、降为 6 倍',
  '激电最后一击 10 倍（计算护甲）', '天雷按力量算；激电范围 +100', '引雷按敏捷算（升级魔法改金币×10）', '幻雷敏捷 ≥400 时 +1 级；天雷最后一击 +50% 翻倍'];
const lyT = (h, k) => h.sk.ly.kept[k] || h.sk.ly.cur === k ? 1 : 0;
const lyGold = (h, g) => Math.floor(g / (lyT(h, 12) + 1));
function lyThunder(h, tg) {   // 天雷：目标处 300 范围 4 波（0.85 / 1.75 / 2.65 / 3.55 秒），第 4 波一半概率翻倍
  const L = h.sk.ly.lv[0], x = tg.x, y = tg.y, s = h.stat, base = lyT(h, 18) ? s.str * L : (s.str + s.agi + s.int) * L, k = lyT(h, 18) ? 6 : 4;
  [[0.85, 1], [1.75, 2], [2.65, 3]].forEach(([t, m]) => later(t, () => { aoeAt(h, x, y, 300, base * k * m, 'hero'); FXS.beam(x, y + 600, 800, x, y, 0, '#9fd8ff', 2, 0.2); }));
  later(3.55, () => { aoeAt(h, x, y, 300, base * k * (rint(1, 2) <= lyT(h, 2) + lyT(h, 20) ? 8 : 4), 'hero'); FXS.nova(x, y, 300, '#9fd8ff', 0.4); });
}
function lyBolt(h, tg) {   // 轰雷：从英雄朝目标 100 / 350 / 600 / 850（/ 1100）处各一道 150 范围穿刺（无视护甲）
  const L = h.sk.ly.lv[1], s = h.stat, a = Math.atan2(tg.y - h.y, tg.x - h.x), stat = lyT(h, 1) ? s.str + s.agi + s.int : s.agi;
  const dists = [100, 350, 600, 850].concat(lyT(h, 13) ? [1100] : []);
  dists.forEach((d, i) => later(0.7, () => {
    const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d, last = i === 4;
    aoeAt(h, x, y, last ? 150 + 280 : 150, stat * (6 + (last ? 3 : rint(0, 3)) * lyT(h, 4)) * L, 'pierce', { ignoreArmor: true }); FXS.ring(x, y, 150, '#9fd8ff', 0.3, 3);
  }));
}
function lyCall(h) {   // 引雷：英雄 900 范围随机一个敌人处雷霆一击（减速），12%（+天赋）10 倍
  const m = pickIn(h.x, h.y, 900); if (!m) return;
  const L = h.sk.ly.lv[2], s = h.stat, crit = rint(1, 100) <= 12 + lyT(h, 5) * 12 + (lyT(h, 15) ? lyT(h, 1) * 6 : 0), agi = lyT(h, 19);
  slowM(m, 0.2 + lyT(h, 15) * 0.3, 2); m.lyClap = G.t + 2;
  const d = crit ? (lyT(h, 16) ? (agi ? s.agi * 18 : s.int * 12) : (agi ? s.agi * 30 : s.int * 20)) * L : (agi ? s.agi * 3 : s.int * 2) * L;
  aoeAt(h, m.x, m.y, 200, d, crit && lyT(h, 16) ? 'hero' : 'normal'); FXS.ring(m.x, m.y, 200, crit ? '#ffd257' : '#9fd8ff', 0.3, 3);
}
function lySpark(h, tg) {   // 激电：目标被引雷减速过（或有天赋 6）时，0.2 秒间隔 4 下 500 范围，最后一下
  if (!cdOk(h, 'lyspark', 1) || !(tg.lyClap > G.t || lyT(h, 6))) return;
  const L = h.sk.ly.lv[3], c = lyT(h, 6) ? { x: tg.x, y: tg.y } : { x: h.x, y: h.y }, r = 500 + 100 * lyT(h, 18), st = lyT(h, 14) ? h.stat.int : h.stat.str, d = st * (5 + lyT(h, 6)) * L;
  for (let k = 0; k < 4; k++) later(0.2 * (k + 1), () => { aoeAt(h, c.x, c.y, r, d, k ? 'chaos' : 'pierce', { ignoreArmor: true }); FXS.nova(c.x, c.y, r, '#9fd8ff', 0.2); });
  if (lyT(h, 7)) later(0.9, () => aoeAt(h, c.x, c.y, r, d * 2, 'pierce', { ignoreArmor: true }));
  later(1, () => aoeAt(h, c.x, c.y, r, lyT(h, 17) ? d * 10 : d, 'chaos', { ignoreArmor: !lyT(h, 17) }));
}
const lyUp = (i, cost) => ({
  tip: h => `升到 ${h.sk.ly.lv[i] + 1} 级（${cost(h).text}）`,
  why: h => { const L = h.sk.ly.lv[i], c = cost(h); return L >= 10 ? '已经是最高等级' : h.level < L * 3 ? `需要英雄等级 ${L * 3}` : c.mana2 && h.mana < c.mana2 ? '魔法值不足' : null; },
  cost: h => ({ gold: cost(h).gold }), apply(h) { h.mana -= cost(h).mana2 || 0; h.sk.ly.lv[i]++; msg(`升到 ${h.sk.ly.lv[i]} 级`); },
});
Object.assign(HERO_KITS, {
  龙鹰: [
    { init(h) { h.sk.ly.lv[0] = 1; }, up: lyUp(0, h => ({ gold: lyGold(h, 1000), mana2: h.stat.int, text: `${lyGold(h, 1000)} 金 + ${h.stat.int} 魔法` })) },
    { init(h) { h.sk.ly.lv[1] = 1; }, up: lyUp(1, h => { const L = h.sk.ly.lv[1], m = lyT(h, 9) ? 0 : L * 20; return { gold: lyGold(h, L * 200), mana2: m, text: `${lyGold(h, L * 200)} 金 + ${m} 魔法` }; }) },
    { init(h) { h.sk.ly.lv[2] = 1; }, up: lyUp(2, h => { const L = h.sk.ly.lv[2]; return lyT(h, 19) ? { gold: lyGold(h, L * 500), text: `${lyGold(h, L * 500)} 金` } : { gold: 0, mana2: L * 50, text: `${L * 50} 魔法` }; }) },
    { init(h) { h.sk.ly.lv[3] = 1; }, up: lyUp(3, h => { const L = h.sk.ly.lv[3], m = h.stat.int * lyT(h, 14); return { gold: lyGold(h, L * 300), mana2: m, text: `${lyGold(h, L * 300)} 金${m ? ` + ${m} 魔法` : ''}` }; }) },
    { init(h) { h.sk.ly.lv[4] = 1; }, cast(h, p) { h.sk.ly.zone = { x: p.x, y: p.y, until: G.t + 3600 }; FXS.ring(p.x, p.y, 600, '#c8b8ff', 0.5, 4); }, cd: 1, point: 1200,
      up: lyUp(4, h => ({ gold: lyGold(h, h.sk.ly.lv[4] * 500), text: `${lyGold(h, h.sk.ly.lv[4] * 500)} 金` })) },
  ],
});
Object.assign(HERO_DEF, {
  龙鹰: {
    maxSkills: 3,
    init(h) { h.sk.ly = { lv: [0, 0, 0, 0, 0], kept: {}, cur: 0, nk: 0, nl: 0, t: 0, ct: 0, zone: null, clouds: [] }; },
    second(h) { h.sk.ly.nk++; },
    onLevel(h) { const s = h.sk.ly; if ([10, 20, 30].includes(h.level) && s.cur) { s.kept[s.cur] = 1; msg(`保留天赋：${LY_TAL[s.cur - 1]}`); s.cur = 0; } },
    tick(h, dt) {
      const s = h.sk.ly;
      if (s.lv[2] && (s.t += dt) >= (lyT(h, 15) ? 0.4 : 0.5)) { s.t = 0; lyCall(h); }
      // 幻雷：每 1.4 秒（天赋可减）在指定区域生成一朵幻云，持续 2 + 智力×0.03 秒，敌人靠近就炸开
      if (s.lv[4] && s.zone && (s.ct += dt) >= 1.4 - 0.3 * lyT(h, 9) - 0.4 * lyT(h, 10) - 0.2 * lyT(h, 15)) {
        s.ct = 0; const a = rnd(0, TAU), r = rnd(0, 500);
        s.clouds.push({ x: s.zone.x + Math.cos(a) * r, y: s.zone.y + Math.sin(a) * r, until: G.t + 2 + h.stat.int * 0.03 });
      }
      s.clouds = s.clouds.filter(c => {
        if (c.until <= G.t) return false;
        if (!firstIn(c.x, c.y, 150)) return true;
        const L = s.lv[4] + (lyT(h, 20) && h.stat.agi >= 400 ? 1 : 0);
        if (lyT(h, 8)) aoeAt(h, c.x, c.y, 100, L * L * 800, 'hero'); else aoeAt(h, c.x, c.y, 200, L * L * 100, 'magic', { ignoreArmor: true });
        FXS.nova(c.x, c.y, 200, '#c8b8ff', 0.3); return false;
      });
    },
    onLaunch(h, tg) {
      const s = h.sk.ly;
      if (s.lv[0] && s.nk >= 5 - (lyT(h, 1) + lyT(h, 11) * 2)) { s.nk = 0; lyThunder(h, tg); }
      if (s.lv[1]) { if (s.nl >= 3 - lyT(h, 3)) { s.nl = 0; lyBolt(h, tg); } else s.nl++; }
      if (s.lv[3]) lySpark(h, tg);
    },
    cmds: h => {
      const s = h.sk.ly, tier = h.level >= 30 ? 3 : h.level >= 20 ? 2 : h.level >= 10 ? 1 : 0, mana = 10 + tier * 40;
      return [cmd('G', '天', '随机天赋', `<b>随机天赋</b>（${mana} 魔法 + 2 木材）<br>当前：${s.cur ? LY_TAL[s.cur - 1] : '无'}<br>已保留：${Object.keys(s.kept).map(k => LY_TAL[k - 1]).join('；') || '无'}<br>英雄到 10 / 20 / 30 级时自动保留当前天赋`, () => {
        if (h.mana < mana || G.wood < 2) return msg('魔法或木材不足');
        h.mana -= mana; G.wood -= 2;
        const pool = Array.from({ length: 20 }, (_, i) => i + 1).filter(k => k !== s.cur && !s.kept[k]);
        s.cur = pick(pool); msg(`天赋：${LY_TAL[s.cur - 1]}`); uiDirty();
      }, { ico: 'learn' })];
    },
    info: h => { const s = h.sk.ly; return [`技能等级：${['天雷', '轰雷', '引雷', '激电', '幻雷'].map((n, i) => s.lv[i] ? `${n} ${s.lv[i]}` : null).filter(Boolean).join(' · ') || '无'}${s.cur ? ` · 天赋：${LY_TAL[s.cur - 1]}` : ''}`]; },
  },
});
// ---------------------------------------------------------------- 月之女神（BZG ~ BZl）
// 30 个天赋分属 6 个技能（每组 5 个）。每次从随机的 3 个里选 1 个（3 木材），选到某组的天赋就解锁那个技能（最多解锁 3 个技能，之后只能选已解锁组的天赋）；
// 天赋总数不能超过 英雄等级 + 提升次数，每组最多 20 个，有的天赋有上限。重置（10+等级×4 魔法、200+等级×10 金币）重新随机 3 个。
// 提升（2000 / 3500 / 5000 / … 金币，最多 5 次）：天赋上限 +1，攻速 +10%，攻击 +500
const YN_TAL = ['[精灵一击] 增加 20% 力量的伤害', '[精灵一击] 增加攻击力 12% 的伤害', '[精灵一击] 英雄攻速 +30%', '[精灵一击] 12% 概率放 2 次', '[精灵一击] 8% 概率召唤一道流星（需学会群体流星）',
  '[群体流星] 冷却 -0.5 秒', '[群体流星] 伤害 +17%', '[群体流星] 聚拢 50 范围', '[群体流星] 伤害 +10%', '[群体流星] 伤害范围 +10%',
  '[精灵守卫] 伤害 +15%', '[大精灵守卫] 伤害 +25%', '[精灵守卫] 攻击间隔 -9%', '[大精灵守卫] 8% 放一条火焰之箭（需学会）', '[精灵守卫] 伤害按敏捷算',
  '[怒吼之箭] 伤害 +50%', '[怒吼之箭] 最小冷却 -0.4 秒', '[怒吼之箭] 概率 +10%', '[怒吼之箭] 减速 +20%', '[怒吼之箭] 伤害 + 敌人最大生命 1% + 6000',
  '[大地之力] 攻击受怒吼的敌人少 1 次攻击', '[大地之力] 范围 +12%', '[大地之力] 伤害 +12%', '[大地之力] 伤害 +18%', '[大地之力] 4% 无视护甲',
  '[火焰之箭] 伤害 +15%', '[火焰之箭] 概率 +2%', '[火焰之箭] 概率 +4%', '[火焰之箭] 敏捷 500 时伤害翻倍', '[火焰之箭] 伤害 +24%、按智力算'];
const YN_MAX = { 5: 7, 6: 8, 8: 6, 12: 8, 13: 9, 14: 5, 15: 1, 17: 7, 20: 3, 21: 5, 25: 5, 28: 5, 29: 1 };
const YN_SKILL = ['精灵一击', '群体流星', '精灵守卫', '怒吼之箭', '大地之力', '火焰之箭'];
const ynA = (h, k) => h.sk.yn.oa[k] || 0;
const ynGroup = k => Math.floor((k - 1) / 5);
function ynRoll(h) { const s = h.sk.yn, pool = Array.from({ length: 30 }, (_, i) => i + 1); s.ov = []; while (s.ov.length < 3) { const k = pick(pool); if (!s.ov.includes(k)) s.ov.push(k); } }
function ynPick(h, slot) {
  const s = h.sk.yn, k = s.ov[slot], g = ynGroup(k);
  if (s.on >= h.level + s.up) return msg('天赋数已到上限（英雄等级 + 提升次数）');
  if (G.wood < 3) return msg('木材不足（需要 3）');
  if (s.of.filter(Boolean).length >= 3 && !s.of[g]) return msg('已经解锁 3 个技能，只能选已解锁技能的天赋');
  if (s.oa.slice(g * 5 + 1, g * 5 + 6).reduce((a, b) => a + (b || 0), 0) >= 20) return msg('这个技能的天赋已经 20 个');
  if (YN_MAX[k] && ynA(h, k) >= YN_MAX[k]) return msg('这个天赋已经到上限');
  G.wood -= 3; s.oa[k] = ynA(h, k) + 1; s.on++;
  if (!s.of[g] && s.of.filter(Boolean).length < 3) { s.of[g] = 1; msg(`解锁技能：${YN_SKILL[g]}`); }
  if (k === 3) h.asBonus += 0.3;
  msg(`获得天赋：${YN_TAL[k - 1]}`); ynRoll(h); uiDirty();
}
function ynMeteor(h, tg) {   // 群体流星：目标处 + 周围 6 处，两轮
  const s = h.sk.yn, d = h.stat.int * 30 * (1 + ynA(h, 7) * 0.17 + ynA(h, 9) * 0.1), r = 150 + ynA(h, 10) * 15, R = 400 - ynA(h, 8) * 50;
  for (const t of [0.8, 1.6]) later(t, () => {
    const c = tg.dead ? { x: tg.x, y: tg.y } : tg;
    aoeAt(h, c.x, c.y, r, d, 'hero');
    for (let k = 1; k <= 6; k++) { const x = c.x + Math.cos(k * Math.PI / 3) * R, y = c.y + Math.sin(k * Math.PI / 3) * R; aoeAt(h, x, y, r, d, 'hero'); FXS.explosion(x, y, 0.4, '#c8b8ff'); }
  });
}
function ynArrows(h, tg, n = 3) {   // 火焰之箭：从英雄朝目标 3 道（左右偏 200）
  const st = ynA(h, 30) ? h.stat.int : h.stat.agi, mul = 1 + (ynA(h, 29) && h.stat.agi >= 500 ? 1 : 0) + ynA(h, 26) * 0.15 + ynA(h, 30) * 0.24;
  const a = Math.atan2(tg.y - h.y, tg.x - h.x), nx = -Math.sin(a), ny = Math.cos(a);
  [[0, 80], [200, 80], [-200, 100]].slice(0, n).forEach(([o, k]) => lineHit(h, h.x + nx * o, h.y + ny * o, tg.x + nx * o, tg.y + ny * o, 1500, 200, st * k * mul, 'hero', null, '#ff8a3c'));
}
function ynGuard(h, big) {   // 精灵守卫：在指定地点，3 秒，弹射 8 个
  const s = h.sk.yn, st = ynA(h, 15) ? h.stat.agi : h.stat.int, base = D.heroes.月之女神.dmg + h.baseBonus;
  const dmg = big ? (st * 180 + base * 3) * (1 + ynA(h, 11) * 0.15 + ynA(h, 12) * 0.25) : (st * 60 + base) * (1 + ynA(h, 11) * 0.15);
  hsum(h, s.gx, s.gy, 3, { cd: 1 - ynA(h, 13) * 0.09, range: 150, atk: 'pierce', bounce: 8, jump: 500 }, { label: big ? '卫' : '守', title: big ? '大精灵守卫' : '精灵守卫', kind: 'yngd',
    stats: () => ({ dmg }), onLaunch(u, tg) { if (big && s.of[5] && rint(1, 100) <= 8 * ynA(h, 14)) ynArrows(h, tg, 1); } });
}
Object.assign(HERO_KITS, { 月之女神: [{}, {}, {}, {}] });
Object.assign(HERO_DEF, {
  月之女神: {
    noBook: true,
    init(h) { h.sk.yn = { oa: [], of: [0, 0, 0, 0, 0, 0], on: 0, up: 0, ov: [], ok: 0, oe: 0, oo: 0, od: 0, gt: 0, bt: 0, gx: h.x, gy: h.y }; ynRoll(h); h.mana = 100; },
    second(h) { const s = h.sk.yn; s.ok++; s.oe++; s.oo++; },
    stats: h => ({ dmg: 500 * h.sk.yn.up, as: 0.1 * h.sk.yn.up }),
    tick(h, dt) {
      const s = h.sk.yn; if (!s.of[2]) return;
      if ((s.gt += dt) >= 3) { s.gt = 0; ynGuard(h, false); }
      if ((s.bt += dt) >= 10) { s.bt = 0; ynGuard(h, true); }
    },
    onLaunch(h, tg) {
      const s = h.sk.yn;
      if (s.of[1] && cdOk(h, 'ynmeteor', [5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5][Math.min(8, ynA(h, 6))])) ynMeteor(h, tg);
      if (s.of[0] && s.ok >= 3) {
        s.ok = 0;
        const d = heroStats(h).dmg * (1 + ynA(h, 2) * 0.12) * 2 + h.stat.str * (25 + ynA(h, 1) * 5), hit = () => aoe(h, tg, 200, d, 'chaos', false, '#c8b8ff');
        later(0.8, hit); if (rint(1, 100) <= ynA(h, 4) * 12) later(1, hit);
        if (s.of[1] && rint(1, 100) <= ynA(h, 5) * 8) later(0.8, () => aoe(h, tg, 150 + ynA(h, 10) * 15, h.stat.int * (25 + ynA(h, 7) * 2 + ynA(h, 9)), 'hero'));
      }
      if (s.of[3] && rint(1, 100) <= 30 + ynA(h, 18) * 10 && s.oe >= 20 - ynA(h, 17) * 2) {
        s.oe = 0;
        for (const m of inRange(h.x, h.y, 600)) { hurt(m, h.stat.str * (60 + ynA(h, 16) * 30) + ynA(h, 20) * (tg.maxHp * 0.01 + 6000), 'normal', h); slowM(m, Math.min(0.9, 0.3 + ynA(h, 19) * 0.2), 3); m.ynRoar = G.t + 3; }
        FXS.nova(h.x, h.y, 600, '#ffd257', 0.4);
      }
      if (s.of[4] && (s.od >= 5 || (s.od >= 6 - ynA(h, 21) && tg.ynRoar > G.t))) {
        s.od = 0;
        const a = rnd(0, TAU), r = 100 + 12 * ynA(h, 22), d = (h.stat.str + h.stat.agi + h.stat.int) * 75 * (1 + ynA(h, 24) * 0.18 + ynA(h, 23) * 0.12), ign = rint(1, 100) <= ynA(h, 25) * 4;
        for (let k = -3; k <= 3; k++) { const x = tg.x + Math.cos(a) * 150 * k, y = tg.y + Math.sin(a) * 150 * k; aoeAt(h, x, y, r, d, 'hero', { ignoreArmor: ign }); FXS.ring(x, y, r, '#9fffb0', 0.3, 3); }
      } else if (s.of[4]) s.od++;
      if (s.of[5] && rint(1, 100) <= 10 + ynA(h, 28) * 4 + ynA(h, 27) + 2 && s.oo >= 2) { s.oo = 0; ynArrows(h, tg); }
    },
    cmds: h => {
      const s = h.sk.yn, sk = D.heroes.月之女神.skills, cap = h.level + s.up;
      const slot = i => cmd(['Q', 'W', 'E'][i], '天', `天赋：${YN_TAL[s.ov[i] - 1].replace(/^\[[^\]]+\] /, '')}`, `<b>${YN_TAL[s.ov[i] - 1]}</b>（${ynA(h, s.ov[i])} 个${YN_MAX[s.ov[i]] ? ` / 最多 ${YN_MAX[s.ov[i]]}` : ''}）<br>选择这个天赋（3 木材），选完重新随机 3 个<br>天赋数 ${s.on}/${cap}`,
        () => ynPick(h, i), { iconKey: 'icon:skill:月之女神:' + i });
      const reCost = { mana: 10 + h.level * 4, gold: 200 + h.level * 10 };
      return [slot(0), slot(1), slot(2),
        cmd('R', '重', '重置天赋', `<b>${sk[3].name}</b><br>重新随机 3 个天赋（${reCost.mana} 魔法 + ${reCost.gold} 金币）`, () => {
          if (h.mana < reCost.mana || G.gold < reCost.gold) return msg('魔法或金币不足'); h.mana -= reCost.mana; G.gold -= reCost.gold; ynRoll(h); uiDirty(); }, { iconKey: 'icon:skill:月之女神:3', cost: reCost.gold }),
        cmd('T', '升', `提升（${s.up}/5）`, `<b>提升</b>（${500 + (s.up + 1) * 1500} 金币）<br>天赋上限 +1，攻速 +10%，攻击 +500`, () => {
          const g = 500 + (s.up + 1) * 1500; if (s.up >= 5) return msg('最多提升 5 次'); if (G.gold < g) return msg('金币不足'); G.gold -= g; s.up++; uiDirty(); }, { ico: 'upgrade', cost: 500 + (s.up + 1) * 1500 }),
        s.of[2] ? cmd('G', '守', '精灵守卫地点', '<b>精灵守卫</b><br>选择精灵守卫出现的地点（每 3 秒一个，每 10 秒一个大的）', () => heroPick('精灵守卫：选择地点', (x, y) => { s.gx = x; s.gy = y; FXS.ring(x, y, 160, '#9fffb0', 0.5, 4); }), { ico: 'build', active: G.pending === 'heroPick' }) : null,
      ];
    },
    info: h => { const s = h.sk.yn; return [`技能：${YN_SKILL.filter((_, i) => s.of[i]).join('、') || '无'} · 天赋 ${s.on}/${h.level + s.up}`]; },
  },
});
// ---------------------------------------------------------------- 巨人（BZo ~ BaG）
// 英雄之外还能放第二个巨人（召唤的巨人，500 金，可建造的地方）。巨人攻击力科技 R00N：每学 / 强化一次技能 PF+1，等级 = PF²（+100 起每级 +300）；
// 攻速科技 R01W：链接之力 +40%，其他技能各 +20%。强化（6000 金，最多 3 次）：
//   链接之力：每 0.3 秒两个巨人各向对方放出一道力量（每步 30 / 强化 60），沿途 100 范围 敏捷²/2 穿刺，相遇时 150 范围 敏捷²/2（无视护甲），每 12 次相遇六连爆
//   践踏：每个巨人每 5 次攻击 350 范围 力量² 并晕眩；强化后再加 最高属性²/4（无视护甲）
//   近战巨人：每 14 秒第二个巨人变成近战 7 秒，攻击 = 英雄基础攻击 × (4 + 随机属性/200)
//   腐蚀之雨：CD 12，目标处出现巨人分身 3 秒（强化 4 秒），攻击 = 英雄基础攻击 × (1 + 智力×1%)，减甲 150
const jrBase = h => D.heroes.巨人.dmg + h.baseBonus + jrTech(h);
const jrTech = h => { const L = h.sk.jr.pf * h.sk.jr.pf; return L ? 100 + 300 * (L - 1) : 0; };
const jrAS = h => 0.2 * h.sk.jr.r01w;
function jrSecond(h, x, y) {
  const s = h.sk.jr, gx = snap(x), gy = snap(y);
  if (s.g2 && G.towers.includes(s.g2)) return msg('已经有第二个巨人了');
  if (G.gold < 500) return msg('金币不足（需要 500）');
  if (!canPlace(gx, gy)) return msg('这里不能建造');
  G.gold -= 500;
  s.g2 = hsum(h, gx, gy, 0, { cd: 0.78, range: 600, atk: 'hero', splash: 120 }, { label: '巨', title: '巨人（召唤的）', kind: 'giant', solid: true, n: 0,
    stats: t => s.melee > G.t ? { dmg: jrBase(h) * (4 + h.stat[s.pi] / 200), cd: 0.6, as: jrAS(h) } : { dmg: 20 + jrTech(h), as: jrAS(h) },
    onLaunch(t, tg) { jrStomp(h, t); } });
  msg('第二个巨人到位');
}
function jrStomp(h, t) {
  const s = h.sk.jr; if (!learned(h, 1)) return;
  if (t.n < 5) { t.n++; return; }
  t.n = 0;
  aoeAt(h, t.x, t.y, 350, h.stat.str * h.stat.str, 'normal');
  if (s.pd) { const m = Math.max(h.stat.str, h.stat.agi, h.stat.int); aoeAt(h, t.x, t.y, 350, m * m / 4, 'normal', { ignoreArmor: true }); }
  for (const m of inRange(t.x, t.y, 350)) stun(m, 0.5);
  FXS.nova(t.x, t.y, 350, '#c8a060', 0.4);
}
const jrUp = (key, name) => ({ tip: () => `强化${name}（6000 金，三个技能里最多强化 3 次）`, why: h => h.sk.jr[key] ? '已经强化过' : h.sk.jr.pg >= 3 ? '最多强化 3 次' : null,
  cost: () => ({ gold: 6000 }), apply(h) { const s = h.sk.jr; s[key] = 1; s.pg++; if (s.pf < 6) s.pf++; msg(`强化了${name}`); } });
Object.assign(HERO_KITS, {
  巨人: [
    { init(h) { h.sk.jr.r01w += 2; jrPF(h); }, up: jrUp('pb', '链接之力') },
    { init(h) { h.sk.jr.r01w++; jrPF(h); }, up: jrUp('pd', '践踏') },
    { init(h) { h.sk.jr.r01w++; h.sk.jr.pi = pick(['str', 'agi', 'int']); jrPF(h); }, up: jrUp('pe', '近战巨人') },
    { init(h) { h.sk.jr.r01w++; jrPF(h); }, cd: 12, point: 1200, cast(h, p) {
      const s = h.sk.jr;
      hsum(h, p.x + 300, p.y, 3 + (s.pc ? 1 : 0), { cd: 0.32, range: 800, atk: 'hero' }, { label: '影', title: '巨人分身', kind: 'giantclone',
        stats: () => ({ dmg: jrBase(h) * (1 + h.stat.int * 0.01) }), onHit(t, m) { debuffM(m, 'corrode', 150, 3); } });
      FXS.ring(p.x, p.y, 200, '#9fffb0', 0.5, 4);
    }, up: jrUp('pc', '腐蚀之雨') },
  ],
});
function jrPF(h) { if (h.sk.jr.pf < 6) h.sk.jr.pf++; }
Object.assign(HERO_DEF, {
  巨人: {
    init(h) { h.sk.jr = { pf: 0, pg: 0, r01w: 0, pb: 0, pd: 0, pe: 0, pc: 0, pi: 'str', g2: null, n: 0, step: 0, hits: 0, t: 0, mt: 0, melee: 0 }; },
    stats: h => ({ dmg: jrTech(h), as: jrAS(h) }),
    onLaunch(h) { jrStomp(h, h); },
    tick(h, dt) {
      const s = h.sk.jr, g2 = s.g2 && G.towers.includes(s.g2) ? s.g2 : null;
      if (learned(h, 2) && g2 && (s.mt += dt) >= 14) { s.mt = 0; s.melee = G.t + 7 + (s.pe ? 2 : 0); msg('近战巨人'); }
      if (!learned(h, 0) || !g2 || (s.t += dt) < 0.3) return;
      s.t = 0;
      const d = Math.hypot(g2.x - h.x, g2.y - h.y) || 1, ux = (g2.x - h.x) / d, uy = (g2.y - h.y) / d, step = 30 + (s.pb ? 30 : 0), dmg = h.stat.agi * h.stat.agi / 2;
      s.step++;
      const a = Math.min(d / 2, (step + 30) * s.step), p1 = { x: h.x + ux * a, y: h.y + uy * a }, p2 = { x: g2.x - ux * a, y: g2.y - uy * a };
      aoeAt(h, p1.x, p1.y, 100, dmg, 'pierce'); aoeAt(h, p2.x, p2.y, 100, dmg, 'pierce');
      FXS.ring(p1.x, p1.y, 100, '#ffd257', 0.3, 2); FXS.ring(p2.x, p2.y, 100, '#ffd257', 0.3, 2);
      if (a >= d / 2 - step || s.step > 20) {
        if (a >= d / 2 - step) {
          aoeAt(h, p1.x, p1.y, 150, dmg, 'pierce', { ignoreArmor: true }); FXS.nova(p1.x, p1.y, 150, '#fff3a0', 0.4);
          if (++s.hits >= 12) { s.hits = 0; for (let k = 1; k <= 6; k++) aoeAt(h, p1.x + Math.cos(k * Math.PI / 3) * 250, p1.y + Math.sin(k * Math.PI / 3) * 250, 150, dmg, 'pierce', { ignoreArmor: true }); }
        }
        s.step = 0;
      }
    },
    cmds: h => [cmd('G', '巨', '第二个巨人', '<b>召唤巨人</b>（500 金）<br>在可建造的地方放第二个巨人：链接之力在两个巨人之间传递，践踏、近战巨人也用它', () => heroPick('召唤巨人：选择可建造的地点', (x, y) => jrSecond(h, x, y)),
      { ico: 'build', active: G.pending === 'heroPick', cost: 500, disabled: !!(h.sk.jr.g2 && G.towers.includes(h.sk.jr.g2)) })],
    info: h => { const s = h.sk.jr; return [`巨人攻击 +${jrTech(h)}（${s.pf * s.pf} 级）· 攻速 +${Math.round(jrAS(h) * 100)}% · 强化 ${s.pg}/3`]; },
  },
});
// ---------------------------------------------------------------- 凤凰（BaM ~ BaY）
// 殇：每次攻击目标处 150 范围；舞：每 (8 - 赤等级) 次攻击英雄身边 600 范围。两者各有：伤害公式（7 种属性组合随机）、伤害类型（普通 / 穿刺 / 魔法 / 混乱）、
// 是否无视护甲和倍数（无视护甲 1~1.2 倍，计算护甲 ×3 / ×4）；英雄到 10 / 20 / 30 级时把当前这套锁定为额外伤害，再随机一套新的。
// 重置（金币 + 魔法，随等级涨）可以重随公式 / 类型或护甲 / 倍数；殇、舞各能花金币加倍数（+10%，8 次）；赤（8×等级 木材，5 级）：殇额外 2%×等级 通用一击、舞少 1 次攻击。
// 切换舞的效果：攻速 +(60 + 舞强化×5)% / 晕眩 / 伤害 +10~30%（按力量）/ 减甲
const FH_SHANG = [s => s.str * s.str / 12, s => s.agi * s.agi / 18, s => s.int * s.int / 20, s => s.str * s.agi / 12, s => s.str * s.int / 14, s => s.agi * s.int / 16, (s, h) => (s.str + s.agi + s.int) * h.level / 4];
const FH_WU = [s => s.str * s.str / 6, s => s.agi * s.agi / 9, s => s.int * s.int / 10, s => s.str * s.agi / 6, s => s.str * s.int / 7, s => s.agi * s.int / 8, (s, h) => (s.str + s.agi + s.int) * h.level / 2];
const FH_F = ['力量²', '敏捷²', '智力²', '力量×敏捷', '力量×智力', '敏捷×智力', '三属性和×等级'];
const FH_ATK = ['normal', 'pierce', 'magic', 'chaos'];
const fhQa = h => h.level >= 30 ? 0.3 : h.level >= 20 ? 0.2 : h.level >= 10 ? 0.1 : 0;
const fhRollKind = () => ({ f: rint(0, 6), atk: rint(0, 3) });
function fhRollArmor(h, wu, first) { const ign = Math.random() < 0.5, m = rnd(first ? 1 : 0.7, (first ? 1.2 : 1) + fhQa(h)); return { ign, mul: ign ? m : m * (wu || first ? 4 : 3) }; }
function fhHit(h, slots, F, c, r, k) { for (const s of slots) aoeAt(h, c.x, c.y, r, F[s.f](h.stat, h) * s.mul * k, FH_ATK[s.atk], { ignoreArmor: s.ign }); }
Object.assign(HERO_KITS, { 凤凰: [{}, {}, {}, {}] });
Object.assign(HERO_DEF, {
  凤凰: {
    noBook: true,
    init(h) { const s = h.sk.fh = { sh: { ...fhRollKind(), ...fhRollArmor(h, false, true) }, wu: { ...fhRollKind(), ...fhRollArmor(h, true, true) }, lockSh: [], lockWu: [], pw: 1, qk: 1, p0: 0, p1: 0, chi: 1, mode: 1, n: 0 }; h.asBonus += 0.6; },
    onLevel(h) {                                         // 10 / 20 / 30 级：锁定当前伤害，再随机一套
      if (![10, 20, 30].includes(h.level)) return;
      const s = h.sk.fh;
      s.lockSh.push({ ...s.sh }); s.lockWu.push({ ...s.wu });
      s.sh = { ...fhRollKind(), ...fhRollArmor(h, false, true) }; s.wu = { ...fhRollKind(), ...fhRollArmor(h, true, true) };
      msg('凤凰锁定了当前的殇和舞，获得新的一套伤害');
    },
    onLaunch(h, tg) {
      const s = h.sk.fh;
      fhHit(h, [s.sh, ...s.lockSh], FH_SHANG, tg, 150, s.pw);
      if (rint(1, 100) <= 2 * s.chi) aoeAt(h, tg.x, tg.y, 150, FH_SHANG[s.sh.f](h.stat, h) * s.sh.mul * s.pw, 'hero');
      if (s.n >= 8 - s.chi) {
        s.n = 0;
        const qw = s.mode === 3 ? tiers(h.stat.str, [300, 200, 100], [0.3, 0.25, 0.2, 0.1]) : 0;
        fhHit(h, [s.wu, ...s.lockWu], FH_WU, h, 600, s.qk + qw);
        if (s.mode === 2) for (const m of inRange(h.x, h.y, 600)) stun(m, 1 + 0.3 * (s.chi - 1));
        if (s.mode === 4) for (const m of inRange(h.x, h.y, 600)) debuffM(m, 'fear', 40 * s.chi, 4);
        FXS.nova(h.x, h.y, 600, '#ff8a3c', 0.5);
      } else s.n++;
    },
    cmds: h => {
      const s = h.sk.fh, sk = D.heroes.凤凰.skills, qc = h.level, ic = i => ({ iconKey: 'icon:skill:凤凰:' + i });
      const desc = (x, F) => `${FH_F[x.f]}，${ATK_CN[FH_ATK[x.atk]]}，${x.ign ? '无视护甲' : '计算护甲'} ×${x.mul.toFixed(2)}`;
      const reroll = (i, key, kind) => cmd(['Q', 'W', 'E', 'R'][i], '重', sk[i].name, `<b>${sk[i].name}</b><br>当前：${desc(s[key])}<br>${kind ? `${qc * 150} 金币 + ${15 * qc} 魔法` : `${20 * qc} 魔法`}`, () => {
        if (kind) { if (G.gold < qc * 150 || h.mana < 15 * qc) return msg('金币或魔法不足'); G.gold -= qc * 150; h.mana -= 15 * qc; Object.assign(s[key], fhRollKind()); }
        else { if (h.mana < 20 * qc) return msg('魔法不足'); h.mana -= 20 * qc; Object.assign(s[key], fhRollArmor(h, key === 'wu', false)); }
        msg(`${key === 'sh' ? '殇' : '舞'}：${desc(s[key])}`); uiDirty();
      }, { ...ic(i), cost: kind ? qc * 150 : 0 });
      const buy = (key, cnt, name) => cmd('', name[0], `${name}强化（${s[cnt]}/8）`, `<b>${name}强化</b>（${s[cnt] * 500 + 1500} 金币）<br>${name}伤害倍数 +0.1`, () => {
        const g = s[cnt] * 500 + 1500; if (s[cnt] >= 8) return msg('已经强化 8 次'); if (G.gold < g) return msg('金币不足'); G.gold -= g; s[key] += 0.1; s[cnt]++; uiDirty();
      }, { ico: 'upgrade', cost: s[cnt] * 500 + 1500 });
      return [reroll(0, 'sh', true), reroll(2, 'sh', false), reroll(1, 'wu', true), reroll(3, 'wu', false),
        cmd('G', '赤', `赤（${s.chi} 级）`, `<b>赤</b>（${s.chi * 8} 木材升级，最多 5 级）<br>殇每次攻击 ${2 * s.chi}% 额外通用一击；舞需要 ${8 - s.chi} 次攻击`, () => {
          if (s.chi >= 5) return msg('已经是最高等级'); if (G.wood < s.chi * 8) return msg('木材不足'); G.wood -= s.chi * 8; s.chi++; uiDirty(); }, { ico: 'learn' }),
        cmd('H', '舞', `舞的效果：${['攻速', '晕眩', '伤害', '减甲'][s.mode - 1]}`, '<b>切换舞的效果</b><br>攻速 +(60 + 舞强化×5)% → 晕眩 → 伤害 +10~30%（按力量）→ 减甲', () => {
          if (s.mode === 1) h.asBonus -= 0.6 + s.p1 * 0.05;
          s.mode = s.mode % 4 + 1;
          if (s.mode === 1) h.asBonus += 0.6 + s.p1 * 0.05;
          uiDirty(); }, { ico: 'upgrade' }),
        buy('pw', 'p0', '殇'), buy('qk', 'p1', '舞')];
    },
    info: h => { const s = h.sk.fh; return [`殇 ×${s.pw.toFixed(1)}（锁定 ${s.lockSh.length}）· 舞 ×${s.qk.toFixed(1)}（锁定 ${s.lockWu.length}）· 舞 ${s.n}/${8 - s.chi}`]; },
  },
});
// 光环：英雄本身的 + 召唤物身上的（鱼人、冰箭、箭魂）
function heroAuraList(h) {
  const out = (HERO_DEF[h.heroName].auras || (() => []))(h);
  for (const s of heroUnits(h)) if (s.aura && (!s.until || s.until > G.t)) for (const a of [].concat(s.aura)) out.push({ x: s.x, y: s.y, ...a });
  return out;
}
const statCN = s => ({ str: '力量', agi: '敏捷', int: '智力' })[s];
// 原图英雄塔是建筑（h03R 剑神等：1500 金 + 5 木 + 4 人口），建成后触发器把它换成英雄单位；全场唯一，建造后不能回收。
// 还要 10 点当局成就（不够时原图退钱并提示"需要10点成就"），建成扣 10 点。
// 赞助英雄（18~34）只有赞助玩家能抽到，原图建成时先给赞助玩家 +10 当局成就再扣 10，等于不要成就
const heroAchCost = () => G.heroChoice && D.heroes[G.heroChoice].sponsor ? 0 : RULE.heroAch;
const heroBlock = () => G.hero ? '英雄塔全场只能建造一个' : !G.heroChoice ? '建造栏里没有英雄塔'
  : G.ach < heroAchCost() ? `需要 ${RULE.heroAch} 点当局成就（当前 ${G.ach}）` : null;
function buildHero(x, y) {
  const hd = D.heroes[G.heroChoice], why = heroBlock();
  if (why) return msg(why);
  if (G.gold < hd.gold) return msg('金币不足');
  if (G.wood < hd.wood) return msg('木材不足');
  if (foodUsed() + hd.food > G.foodCap) return msg('人口不足');
  G.gold -= hd.gold; G.wood -= hd.wood; G.ach -= heroAchCost();
  const h = { id: G.nextId++, isHero: true, fam: 'hero', heroName: hd.name, cat: 'hero', x, y, lv: 0, level: 1, spent: hd.gold, food: hd.food,
    stat: { str: 10, agi: 10, int: 10 }, growth: 'str', points: HERO_DEF[hd.name].points || 3, baseBonus: 0, mana: 0, learned: [], cdLeft: 0, cds: {}, auto: {}, asBonus: 0, sk: {},
    qs: [0, 0, 0, 0], nb: 0, last: { p: 0, m: 0, c: 0 }, xb: { hail: 0, burst: 0, freeze: 0 },   // 枪神学习次数 / 火焰暴击率 / 上次致命；邪冰技能计数器
    kills: 0, dealt: 0, attacks: 0, buff: {}, buffAS: 0, buffDmg: 0, eliteAS: 0, eliteWeak: 0, levels: [{}],
    maxMana() { return D.heroes[this.heroName].mana || 1000; } };
  h.home = { x, y };
  // 建成时随机成长值（原图 DR / DS / DT：力量 0~7，敏捷 0~剩余，智力补足 7）。每次升级英雄自带全属性 +1，再按成长值加，所以显示时各 +1，合计 10
  const r = rint(0, 7), a = rint(0, 7 - r);
  h.grow = { str: r + 1, agi: a + 1, int: 7 - r - a + 1 };
  msg(`${hd.name} 英雄成长值（每次升级自动加属性）：力量 ${h.grow.str} · 敏捷 ${h.grow.agi} · 智力 ${h.grow.int}；有 ${h.points} 点技能点可以分配`, 8);
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
  // 对地面施放的技能（大法师的印记）：手动时点地面，自动施放时放在射程内最近的敌人脚下
  if (s.point && !auto) return heroPick(`${D.heroes[h.heroName].skills[i].name}：选择地点`, (x, y) => {
    if (dist2(h.x, h.y, x, y) > s.point * s.point) return msg(`太远了（施法距离 ${s.point}）`);
    if (!skillReady(h, i) || s.cast(h, { x, y }) === false) return;
    h.cds['s' + i] = G.t + s.cd; h.spellT = G.t; SFX.ack(sndKey(h), 'yesAttack');
  });
  const tg = nearest(h.x, h.y, s.point || heroStats(h).range + 200);
  if (!tg && s.needsTarget !== false) return auto ? null : msg('射程内没有敌人');
  if (s.cast(h, tg) === false) return;
  h.cds['s' + i] = G.t + s.cd; h.spellT = G.t;
  if (!auto) SFX.ack(sndKey(h), 'yesAttack');
  if (tg) h.face = Math.atan2(tg.y - h.y, tg.x - h.x);
  if (!auto) addFx({ kind: 'text', x: h.x, y: h.y + 60, text: D.heroes[h.heroName].skills[i].name, life: 0.8, color: '#9fe3ff' });
}
function heroAttack(h, tg, st, pre = () => {}) {
  const kit = HERO_KITS[h.heroName], hd = D.heroes[h.heroName], def = HERO_DEF[h.heroName];
  let dmg = st.dmg * h.atkMul;                      // 光环等加成只加普通攻击，技能伤害不加
  for (const i of h.learned) {
    const s = kit[i], c = s.crit ? s.crit(h) : s.critChance && [s.critChance, s.critMul];
    if (c && Math.random() < c[0]) { dmg *= c[1]; SFX.spell('crit', { x: tg.x, y: tg.y }); popText(tg.x, tg.y, c[1] + '倍', '#ffd257'); break; }
  }
  shot(h, tg);
  // 原图的"攻击时"触发器（EVENT_PLAYER_UNIT_ATTACKED）在出手时就判定，造成的伤害和特效等主投射物命中再结算
  const f0 = holdHits(() => {
    if (HERO_ATTACK[h.heroName]) HERO_ATTACK[h.heroName](h, tg);
    if (def.onLaunch) def.onLaunch(h, tg);
    for (const i of h.learned) if (kit[i].onLaunch) kit[i].onLaunch(h, tg);
  }), flush = () => { pre(); f0(); };
  // 目标：弹幕（额外 multi 个，multiR 范围内）；弹射（mbounce）
  let targets = [tg];
  if (st.multi) targets = targets.concat(inRange(h.x, h.y, st.multiR).filter(m => m !== tg).slice(0, st.multi));
  const style = missileOf(h), splash = hd.splash, bounce = hd.bounce;
  SFX.ent(sndKey(h), 'launch', { x: h.x, y: h.y });
  const land = primary => (hit, x, y) => {
    if (primary) { flush(); SFX.ent(sndKey(h), 'hit', { x, y }); }
    // msplash：落点 Farea1 范围内全额伤害；其他是单体
    if (splash) for (const m of inRange(x, y, splash)) hurt(m, m === hit ? attackDmg(h, m, dmg) : dmg, st.atk, h);
    else if (hit) hurt(hit, attackDmg(h, hit, dmg), st.atk, h);
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
  if (HELD) return HELD.push(() => zone(owner, x, y, r, dur, dps, atk, endFn, style, extra));
  if (style === 'bladestorm') SFX.spell('bladestorm', { x, y });
  G.zones.push({ owner, x, y, r, t0: G.t, until: G.t + dur, dps, atk, endFn, style, fxT: 0, ...extra });
}
function later(s, fn) { G.timeouts.push({ at: G.t + s, fn }); }
// 学习技能：第 n 个（已学 DU = n-1 个）要 18×DU 木材、力量 ≥ 80×DU，最多 4 个；有的技能还有额外条件（canLearn）
const LEARN_COST = [{ wood: 0, str: 0 }, { wood: 18, str: 80 }, { wood: 36, str: 160 }, { wood: 54, str: 240 }];
function learnBlock(h, i, viaSacrifice) {
  const kit = HERO_KITS[h.heroName][i], c = LEARN_COST[h.learned.length];
  const max = HERO_DEF[h.heroName].maxSkills || 4;              // 龙鹰、月之女神最多 3 个
  if (!c || h.learned.length >= max) return `最多学习 ${max} 个技能`;
  if (h.stat.str < c.str) return `需要力量达到 ${c.str}`;
  if (G.wood < c.wood) return '木材不足';
  return !viaSacrifice && kit.canLearn ? kit.canLearn(h) : null;
}
function learnSkill(h, i, viaSacrifice) {
  const kit = HERO_KITS[h.heroName][i], sk = D.heroes[h.heroName].skills[i];
  if (!kit || !sk || HERO_DEF[h.heroName].noBook) return false;     // 没有技能书的英雄（技能在自己的命令里）
  const name = sk.name;
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
  const def = HERO_DEF[h.heroName]; if (def.onPoint) def.onPoint(h);     // 原图 EVENT_PLAYER_HERO_SKILL（学属性技能）
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
    if (a.kind === 'enemySpeed') for (const m of G.monsters) if (!m.dead && dist2(a.x, a.y, m.x, m.y) <= a.r * a.r) m.auraSpeed = Math.max(m.auraSpeed, a.v);   // 狗头人的诱导作战：敌人加速
  }
  // 技能包给的光环（五行塔的五行光环）：和同类光环塔取大
  for (const o of G.towers) {
    const k = KITS[o.fam], list = k && k.auras && k.auras(o); if (!list) continue;
    for (const a of list) {
      const near = t => dist2(o.x, o.y, t.x, t.y) <= a.r * a.r;
      if (a.kind === 'towerDmg') for (const t of G.towers) { if (near(t)) t.buffDmg = Math.max(t.buffDmg, a.v); }
      if (a.kind === 'towerAS') for (const t of G.towers) { if (near(t)) t.buffAS = Math.max(t.buffAS, a.v); }
      if (a.kind === 'armor') armorAuras.push([o, a.r, a.v]);
      if (a.kind === 'slow') slowAuras.push([o, a.r, a.v]);
    }
  }
  // 塔的召唤物身上的光环（狂狼的小狼崽：强攻 Aakb，和战鼓同类）
  for (const s of G.towers) if (s.cat === 'summon' && s.aura && !(s.owner && s.owner.isHero)) for (const a of [].concat(s.aura)) {
    const near = t => t.cat !== 'aura' && dist2(s.x, s.y, t.x, t.y) <= (a.r + FOOT_HALF) ** 2;
    if (a.kind === 'drums') for (const t of G.towers) { if (near(t)) t.drums = Math.max(t.drums, a.v); }
  }
  // 寒冰塔的冰霜光环：600 范围敌人移速 -(5 + 3×(等级-1))%（和减速光环同类，取最大）
  for (const t of G.towers) if (t.fam === '寒冰塔') slowAuras.push([t, 600, 0.05 + 0.03 * (t.ice.aura - 1)]);
  for (const m of G.monsters) {
    if (m.dead) continue;
    for (const [a, r, v] of armorAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraArmorDown = Math.max(m.auraArmorDown, v);
    for (const [a, r, v] of slowAuras) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.auraSlow = Math.max(m.auraSlow, v);
    for (const [a, r, v] of heroSlows) if (dist2(a.x, a.y, m.x, m.y) <= r * r) m.heroSlow = Math.max(m.heroSlow, v);
  }
  // 荣誉光环：加在上面同类光环取大的结果上（可与任意光环叠加），几座荣誉光环之间取大
  const honors = G.towers.filter(a => a.fam === '荣誉光环' && a.honor);
  if (honors.length) {
    const best = (x, y, k) => Math.max(0, ...honors.map(a => { const lv = a.honor[k], r = honorArea(k, lv); return dist2(a.x, a.y, x, y) <= r * r ? honorV(lv) : 0; }));
    for (const t of G.towers) { t.buffDmg += best(t.x, t.y, 0); t.buffAS += best(t.x, t.y, 3); }
    for (const m of G.monsters) if (!m.dead) { m.auraArmorDown += best(m.x, m.y, 1) * 100; m.auraSlow += best(m.x, m.y, 2); }
  }
  // 精英怪光环 (900 范围)、怪物自带的光环（魔王、熊猫 BOSS 等，monsterAuras）
  const srcs = [];
  for (const e of G.monsters) {
    if (e.dead) continue;
    if (e.elite) srcs.push([e, e.elite.aura, e.elite.aura.v[e.elite.lvl - 1], 900]);
    if (e.auras) for (const a of e.auras) srcs.push([e, a, a.v, a.r]);
  }
  for (const [e, aura, v, R] of srcs) {
    if (aura.key === 'focus' || aura.key === 'endur' || aura.key === 'unholy') {
      for (const m of G.monsters) {
        if (m.dead || dist2(e.x, e.y, m.x, m.y) > R * R) continue;
        if (aura.key === 'focus') m.auraFocus = Math.max(m.auraFocus, v);
        if (aura.key === 'endur') m.auraSpeed = Math.max(m.auraSpeed, v);
        if (aura.key === 'unholy') m.auraRegen = Math.max(m.auraRegen, v);
      }
    } else {
      for (const t of G.towers) {
        if (dist2(e.x, e.y, t.x, t.y) > R * R) continue;
        if (aura.key === 'slowas') t.eliteAS = Math.max(t.eliteAS, v);
        if (aura.key === 'weak') t.eliteWeak = Math.max(t.eliteWeak, v);
      }
    }
  }
}

// ---------------------------------------------------------------- 怪物的技能、BOSS 被攻击 / 死亡时的触发器
// 被动（tools/add_monster_extra.py 按单位表写进 data.js 的 pas）：闪避（AEev，只躲塔的普通攻击）、魔法免疫（Amim，魔法伤害打不动）、
// 硬化皮肤（Assk：一定概率把这次攻击的伤害减掉一个数，最少剩几点）。塔的攻击还会被诅咒 / 沉默魔法弄得打不中（curse / miss）。
// 原图怪物都是电脑玩家 Player(11) 的单位，带自动施放的技能（狗头人的治疗 / 嗜血 / 心灵之火 / 诅咒 / 减速）冷却好了就放；
// 其余的靠触发器：BOSS 被攻击（EVENT_PLAYER_UNIT_ATTACKED）时召唤东西或放技能，死亡时复活 / 分裂。
// 大多数被攻击触发器有按玩家的冷却：Dp[玩家] 每秒 +1（原图 BbM），够了才触发并清零；巨型 BOSS 的沉默魔法用 JE[玩家]（Bay）
// 信息面板：怪物的被动和状态
const AURA_CN = { focus: v => `周围怪护甲 +${v}`, endur: v => `周围怪移速 +${pctTxt(v)}`, unholy: v => `周围怪每秒回血 ${pctTxt(v)}`, slowas: v => `周围塔攻速 -${pctTxt(v)}`, weak: v => `周围塔伤害 -${pctTxt(v)}` };
function monsterTraits(e) { const out = monsterTraitList(e); return out.length ? `<span>特性</span><b>${out.join('；')}</b>` : ''; }
function monsterTraitList(e) {
  const out = [], p = e.pas || {}, sk = e.skin2 || p.skin, ev = Math.max(p.evade || 0, e.evade2 || 0);
  if (ev) out.push(`闪避 ${pctTxt(ev)}（躲塔的普通攻击）`);
  if (e.magicImmune && e.uid !== 'Udea') out.push('魔法免疫（魔法伤害无效）');
  if (sk) out.push(`硬化皮肤：${pctTxt(sk[0])} 概率攻击伤害 -${fmt(sk[1])}（最少 ${sk[2]}）`);
  if (e.auras) out.push('光环：' + e.auras.map(a => AURA_CN[a.key](a.v)).join('，') + (e.auras[0].r !== 900 ? `（${e.auras[0].r} 范围）` : ''));
  if (e.invulUntil > G.t) out.push('神圣护甲：无敌');
  if (e.enraged) out.push('狂暴');
  if (e.frostArmor > G.t) out.push('霜冻护甲 +120');
  if (e.innerFire > G.t) out.push('心灵之火 +200 护甲');
  if (e.ams > 0 && e.amsUntil > G.t) out.push(`反魔法外壳（还能吸收 ${fmt(e.ams)}）`);
  if (e.uid === 'Udea') out.push(`魔法免疫：${e.magicImmune ? '有' : '无'}（每 5 秒切换）`);
  return out;
}
function attackDmg(t, m, dmg) {
  const miss = Math.max(bv(t, 'curse'), bv(t, 'miss'));
  if (miss && Math.random() < miss) { popText(m.x, m.y + 60, '未命中', '#cccccc'); return 0; }
  const ev = Math.max(m.pas && m.pas.evade || 0, m.evade2 || 0);
  if (ev && Math.random() < ev) { popText(m.x, m.y + 60, '闪避', '#cccccc'); return 0; }
  if (m.etherealUntil > G.t) return 0;                                   // 放逐（虚无）：物理攻击打不到
  for (const sk of [m.pas && m.pas.skin, m.skin2]) if (sk && Math.random() < sk[0]) dmg = Math.max(sk[2], dmg - sk[1]);   // 硬化皮肤
  return dmg;
}
// 怪物身上的光环（和精英怪光环同一套：focus 护甲、endur 移速、unholy 回血；slowas / weak 作用于周围的塔）
const PANDA_AURA = [null, { key: 'focus', v: 40 }, { key: 'slowas', v: 0.8 }, null, { key: 'endur', v: 0.3 }, { key: 'unholy', v: 0.03 }];   // HL 1~5：boss 专注 / 减攻速（原图 -100%，攻速最多减 80%）/ 弱击（熊猫身上没有这个技能）/ 耐久 / 邪恶
const DEMON_AURA = lv => [{ key: 'focus', v: [10, 30, 60][lv - 1] }, { key: 'slowas', v: [0.1, 0.25, 0.5][lv - 1] }, { key: 'weak', v: [0.1, 0.3, 0.5][lv - 1] }, { key: 'endur', v: [0.05, 0.15, 0.3][lv - 1] }];   // 魔王的 jy 光环 A041 / A040 / A042 / A044
function monsterAuras(m) {
  if (m.uid === 'Udea') return DEMON_AURA(1).map(a => ({ ...a, r: 900 }));
  if (['Nalc', 'Nfir', 'Npbm', 'Ntin'].includes(m.uid) && PANDA_AURA[G.hl]) return [{ ...PANDA_AURA[G.hl], r: 900 }];
  if (m.uid === 'nanm') return [{ key: 'endur', v: 0.1, r: 200 }];      // 山岭大巨人 A0PV
  if (m.uid === 'nanw' || m.uid === 'nenp') return [{ key: 'endur', v: 0.1, r: 100 }];   // 暗黑使者 A0P2、毒性树人 A0OW
  return null;
}
// 在怪物身边刷一只（接着它的路走）；opt.life 限时，opt.boss 计进 20 波的 BOSS
function spawnBeside(id, at, opt = {}) {
  const m = spawnMonster(id, { noElite: true, gate: at.gate || 0, boss: opt.boss });
  if (!m) return null;
  Object.assign(m, { x: at.x + rnd(-40, 40), y: at.y + rnd(-40, 40), cur: at.cur, prev: at.prev, target: at.target, path: (at.path || []).slice(), lane: at.lane ?? m.lane });
  if (opt.life) m.until = G.t + opt.life;
  if (opt.boss && G.bossRule) G.bossRule.ids.push(m);
  return m;
}
function spawnAtGate(id, slot, opt = {}) {
  const g = G.gates.includes(slot) ? slot : pick(G.gates), m = spawnMonster(id, { noElite: true, gate: g, boss: opt.boss });
  if (m && opt.life) m.until = G.t + opt.life;
  if (m && opt.boss && G.bossRule) G.bossRule.ids.push(m);
  return m;
}
// 医疗波：从目标开始在 range 范围内弹 n 个友军（怪物），每弹衰减 decay
function healWave(first, amount, n, range, decay = 0) {
  let cur = first, k = amount; const done = [];
  while (cur && done.length < n) {
    done.push(cur); cur.hp = Math.min(cur.maxHp, cur.hp + k); k *= 1 - decay;
    FXS.ring(cur.x, cur.y, 80, '#9fffb0', 0.3, 3);
    cur = G.monsters.filter(o => !o.dead && !done.includes(o) && dist2(o.x, o.y, cur.x, cur.y) <= range * range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }
}
// 原图里的随机传送：按玩家顺序依次 1/8、1/7、…、1/2 的概率选这个玩家的出怪口（他要在场），都没选中就是最后一个在场玩家的口
function demonGate() {
  for (let i = 0; i < 8; i++) if (rint(1, 8 - i) === 8 - i && G.gates.includes(i)) return i;
  return G.gates.includes(7) ? 7 : null;
}
function teleportTo(m, g) {
  if (g == null) return;
  FXS.nova(m.x, m.y, 200, '#9fd8ff', 0.4);
  const path = GATES[g], [x, y] = NODES[path[0]];
  Object.assign(m, { x, y, cur: path[0], prev: null, target: null, path: path.slice(1), gate: g });
  FXS.nova(x, y, 200, '#9fd8ff', 0.4);
}
// 塔的减益：诅咒（打不中）、沉默（不能攻击）、减攻速；giveBuff 取最大值、刷新时间
function towerDebuff(cx, cy, r, k, v, dur) { for (const t of G.towers) if (t.cat !== 'aura' && dist2(cx, cy, t.x, t.y) <= r * r) giveBuff(t, k, v, dur); }
// 巨型 BOSS 被攻击（原图 Baw）：魔兵在攻击者的位置放沉默魔法 A0OL，等级随机 1~4——1 级只沉默法术（对塔没用）、
// 2 级 300 范围的塔 2.5 秒不能攻击、3 级 600 范围攻击 50% 落空 4 秒、4 级 500 范围攻速 -150%（最多 -80%）3 秒。
// 条件是"BOSS1 or … or 魔法书 and JE ≥ 12"：JASS 的 and / or 同级、从左往右算，所以 JE ≥ 12 管住所有这些 BOSS——每个玩家 12 秒最多一次
// （之前几处"X and Y or Z"两种算法结果一样，这里不一样；按从左往右，也和 JE 这个计数器的用处对得上）
const SILENCE_BOSS = new Set(['njga', 'nskg', 'nvdg', 'nelb', 'nchw', 'nanm', 'nbal', 'nlkl', 'njgb', 'njg1', 'nsoc', 'nsko', 'nslm', 'n070', 'n071', 'n074', 'n073', 'n072', 'n075', 'ndrd', 'ndmu', 'ndrh', 'nsgt', 'nchg']);
const DRAGONS = new Set(['nrdk', 'nrdr', 'nbzd', 'ngrd']);
const TANKS = new Set(['nerw', 'nfor', 'nfot', 'nfod', 'ndrj', 'n06Y']);
const SKELETON_BOSS = new Set(['nsko', 'nsoc', 'nslm']);
function monsterAttacked(m, t) {
  if (m.dead || m.neutral) return;
  const p = pidOf(t), dp = G.dp, u = m.uid;
  // 巨型 BOSS 的沉默魔法
  if ((SILENCE_BOSS.has(u) || u === 'nscb') && G.je[p] >= 12) {
    G.je[p] = 0;
    const lv = rint(1, 4), [r, dur] = [[450, 3.5], [300, 2.5], [600, 4], [500, 3]][lv - 1];
    if (lv === 2) towerDebuff(t.x, t.y, r, 'silence', 1, dur);
    if (lv === 3) towerDebuff(t.x, t.y, r, 'miss', 0.5, dur);
    if (lv === 4) towerDebuff(t.x, t.y, r, 'slowAS', 0.8, dur);
    if (lv > 1) FXS.ring(t.x, t.y, r, ['', '', '#c48bff', '#888', '#9fd8ff'][lv], 0.35, 3);
  }
  // 大红牛（BbH，1/4）：Dp ≥ 1 时 6/7 在攻击者的出怪口放一只小红牛（60 秒），否则召唤 8 只虱虫（10 秒）
  if (u === 'nsqt' && rint(1, 4) === 1 && dp[p] >= 1) {
    dp[p] = 0;
    if (rint(1, 7) <= 6) spawnAtGate('nsqo', p, { life: 60 });
    else for (let i = 0; i < 8; i++) spawnBeside('nsqe', m, { life: 10 });
  }
  if (u === 'n09B' && rint(1, 100) === 88) { dp[p] = 0; for (let i = 0; i < 8; i++) spawnBeside('nsqe', m, { life: 10 }); }   // 大豪猪（BbK）
  // 大骷髅（BbT）：条件是"1/10 且大骷髅"或复活的两种骷髅（优先级，照搬）；Dp ≥ 1 时召唤一只骷髅（60 秒）
  if (((u === 'nsko' && rint(1, 10) === 8) || u === 'nsoc' || u === 'nslm') && dp[p] >= 1) { dp[p] = 0; spawnBeside('nslf', m, { life: 60 }); }
  // 坦克 / 直升机 / 游艇（BbY）：Dp ≥ 2 时维修工给它放医疗波（10000，弹 16 个）或者嗜血术（加移速）
  if (TANKS.has(u) && dp[p] >= 2) {
    dp[p] = 0;
    if (rint(1, 2) === 1) healWave(m, 10000, 16, 500);
    else { const [b, d] = [[10, 3], [10, 6], [1.5, 9], [0.5, 15]][rint(1, 4) - 1]; m.deb.lustSpeed = { v: b, until: G.t + d }; }   // A07Q：1 级 1000 倍按上限算
  }
  // 龙：生命 ≤ 10 万时放神圣护甲（无敌 5 秒，冷却 3600 秒，等于一次）
  if (DRAGONS.has(u) && m.hp <= 100000 * G.hpScale && !m.shieldUsed) { m.shieldUsed = true; m.invulUntil = G.t + 5; FXS.nova(m.x, m.y, 160, '#ffe9a0', 0.5); msg(`${m.name}放出了神圣护甲（无敌 5 秒）`); }
  if (u === 'ndtw' && rint(1, 30) === 3) { m.ams = 300000; m.amsUntil = G.t + 90; }                       // 巨魔：反魔法外壳（吸收 30 万魔法伤害）
  if (u === 'ninm' && rint(1, 30) === 3) spawnBeside('ninc', m, { life: 8 });                               // 地狱火机械人：地狱火机关人 8 秒
  if (u === 'ncg3' && rint(1, 30) === 5) spawnBeside('ncg3', m, { life: 8 });                               // 人工地精：复制一个 8 秒
  // 熊猫（zz）
  if (u === 'Npbm' && rint(1, 35) === 1) { const b = spawnBeside('nten', m, { life: 15 }); if (b) b.speed = 0; }   // 酒仙：扔下一个酒瓶（魔法免疫，15 秒）
  if (u === 'Nalc' && rint(1, 10) === 1) t.cdLeft = Math.max(t.cdLeft, towerStats(t).cd);                // 大地：让攻击它的塔停一下
  if (u === 'Nfir' && rint(1, 55) === 4) { m.etherealUntil = G.t + 1.3; slowM(m, 0.8, 1.3); }             // 火焰：放逐自己（1.3 秒虚无，物理攻击打不到，魔法伤害 +66%）
  // 熊猫越打越硬：条件是"(生命 ≤ 1 万 且火焰熊猫) 或酒仙 或大地 或风之熊猫"（优先级，照搬），每次被打 1/3 加魔法免疫、1/3 闪避 50%、1/3 硬化皮肤（80% 减 4 万）
  if ((u === 'Nfir' && m.hp <= 10000 * G.hpScale) || u === 'Npbm' || u === 'Nalc' || u === 'Ntin') {
    if (rint(1, 3) === 2) m.magicImmune = true;
    else if (rint(1, 2) === 2) m.evade2 = 0.5;
    else m.skin2 = [0.8, 40000, 3];
  }
  if (u === 'Udea') demonAttacked(m, t);
}
// 魔王被攻击（zl / Bbb）：Dp ≥ 2 时召唤魔兵——1/25 给自己霜冻护甲（+120 护甲 30 秒），否则 1/6 诅咒攻击它的塔（80% 落空 20 秒），
// 否则 1/4 沉默魔法（1 级，对塔没用），否则医疗波（10000 弹 16 个）；生命第一次 ≤ 25 万时狂暴：移速 522、光环升到 3 级、医疗波一次。
// 另外每次被攻击 1/1600 传送到一个出怪口、1/180 在攻击者的出怪口召唤黑龙（60 秒）、1/10 在身边召唤石像鬼（10 秒）。
// 原图的怪数是 Player(11) 所有活着的单位，这些召唤物都算（魔兵、维修工这些施法的马甲这里不算）
function demonAttacked(m, t) {
  const p = pidOf(t);
  if (G.dp[p] >= 2) {
    G.dp[p] = 0;
    if (rint(1, 25) === 4) { m.frostArmor = G.t + 30; FXS.ring(m.x, m.y, 120, '#bff4ff', 0.5, 3); }
    else if (rint(1, 6) === 3) { giveBuff(t, 'curse', 0.8, 20); FXS.ring(t.x, t.y, 90, '#7a4a9a', 0.5, 3); }
    else if (rint(1, 4) !== 2) healWave(m, 10000, 16, 500);
  }
  if (!m.enraged && m.hp <= 250000 * G.hpScale) {
    m.enraged = true; m.speed = 522; m.auras = DEMON_AURA(3).map(a => ({ ...a, r: 900 })); healWave(m, 10000, 16, 500);
    msg('魔王：邪恶！赐我力量吧！', 6);
  }
  if (rint(1, 1600) === 90) { teleportTo(m, demonGate()); msg('魔王：吵死了！都给我消停点！'); }
  if (rint(1, 180) === 178) spawnAtGate('nbwm', p, { life: 60 });
  if (rint(1, 10) === 9) spawnBeside('n06W', m, { life: 10 });
}
// 魔王走到 P / M / T 三个路口（Bbj）：1/8 传送到一个出怪口
function demonNode(m) {
  if (m.uid !== 'Udea' || !['P', 'M', 'T'].includes(m.cur) || rint(1, 8) !== 6) return false;
  teleportTo(m, demonGate()); return true;
}
// 死亡触发器（BbE / BbO / BbQ）
const SKELETON_MAGE = ['n071', 'n070', 'n074', 'n073', 'n072', 'n075', 'n076'];
function monsterDied(m, src) {
  const u = m.uid;
  if (u === 'nsko') { const s = spawnBeside('nsoc', m, { boss: true }); if (s) s.speed = 0; }   // 大骷髅 → 复活了并等死的骷髅（不动）
  if (u === 'nsoc') spawnBeside('nslm', m, { boss: true });                                      // → 再次复活后疯狂的骷髅（原图让它走到凶手那个口的第一个外环路口，这里接着走环）
  const k = SKELETON_MAGE.indexOf(u);                                                            // 骷髅法师在自己的出怪口一次次复活，后面三次各 1/2
  if (k >= 0 && k < SKELETON_MAGE.length - 1 && (k < 3 || rint(1, 2) === 1)) spawnAtGate(SKELETON_MAGE[k + 1], m.gate || 0, { boss: true });
  if (u === 'ushd') { const s = spawnBeside('u000', m); if (s) s.speed = 0; }                     // 阴影 → 阴影（不动）
  if (u === 'hsor') { const s = spawnBeside('nscb', m, { life: 60 }); if (s) s.speed = 0; }       // 女巫 → 女巫的魔法书（60 秒）
  if (u === 'n08L') spawnBeside('n08M', m, { life: 15 });                                        // 坚硬的森林蜘蛛 → 小蜘蛛
  if (u === 'o009') spawnBeside('o00A', m, { life: 15 });                                        // 邪恶的狼骑士 → 小恶狼
  if (u === 'hmtt' || u === 'h07B') for (let i = rint(1, 5); i > 0; i--) { const s = spawnBeside('nsc2', m); if (s) s.speed = 0; }   // 蒸汽机车 → 1~5 个坦克子弹
}
// 狗头人的自动施放技能（最终 BOSS 波跟着龙）：医师 治疗 15000（2.5 秒）；牧师 嗜血术（移速 +200% 1 秒，6 秒）/ 心灵之火（护甲 +200 6 秒，8 秒）；
// 巫师 诅咒塔（50% 落空 5 秒，3 秒）/ 减速塔（攻速 -60% 4 秒，5 秒）。怪物是电脑玩家的单位，没有 AI 脚本，只会放能自动施放的技能——
// 医师的医疗波（AOhw）、护卫的嘲讽不能自动施放，不放；龙的神圣护甲由触发器下令（monsterAttacked）
function monsterSkills(m) {
  const u = m.uid, cd = m.cds || (m.cds = {}), ready = k => !(cd[k] > G.t), allies = r => G.monsters.filter(o => !o.dead && !o.neutral && dist2(o.x, o.y, m.x, m.y) <= r * r);
  const worst = r => allies(r).filter(o => o.hp < o.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const tower = r => G.towers.filter(t => t.cat !== 'aura' && t.cat !== 'summon' && dist2(t.x, t.y, m.x, m.y) <= r * r).sort((a, b) => (b.dealt || 0) - (a.dealt || 0))[0];
  if (u === 'nkot') {
    const w = worst(1000); if (w && ready('heal')) { cd.heal = G.t + 2.5; w.hp = Math.min(w.maxHp, w.hp + 15000); FXS.ring(w.x, w.y, 80, '#9fffb0', 0.3, 3); }
  }
  if (u === 'nkob') {
    const pick1 = r => allies(r).sort((a, b) => (DRAGONS.has(b.uid) ? 1 : 0) - (DRAGONS.has(a.uid) ? 1 : 0))[0];
    let a = pick1(900); if (a && ready('lust')) { cd.lust = G.t + 6; a.deb.lustSpeed = { v: 2, until: G.t + 1 }; }
    a = pick1(500); if (a && ready('fire')) { cd.fire = G.t + 8; a.innerFire = G.t + 6; }
  }
  if (u === 'nkog') {
    let t = tower(1200); if (t && ready('curse')) { cd.curse = G.t + 3; giveBuff(t, 'curse', 0.5, 5); FXS.ring(t.x, t.y, 90, '#7a4a9a', 0.4, 3); }
    t = tower(700); if (t && ready('slow')) { cd.slow = G.t + 5; giveBuff(t, 'slowAS', 0.6, 4); FXS.ring(t.x, t.y, 90, '#9fd8ff', 0.4, 3); }
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
function monstersAlive() { return G.monsters.filter(m => !m.dead && !m.neutral && !m.spirit).length; }   // 中立单位（小精灵、小偷）不算怪数（原图只数 Player(11)）；圣灵塔的圣灵也不算
// 场上怪物上限（原图 M3 = C9[1]+…+C9[8]）：每个在场玩家 40，无尽关卡里 15
function cap() { return G.c9.reduce((a, b) => a + b, 0); }
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
  G.bossRule = null; G.waveHook = null; G.waveNote = ''; G.curUnit = null;
  const n = G.wave, { fn, row } = G.next;
  SFX.stinger(n);                                  // 原图每波开始放一段音乐（war3map.j 的 PlaySoundBJ）
  if (RULE.rabbitWaves.includes(n)) later(RULE.rabbitDelay, () => spawnRabbit());     // 原图：BOSS 波中途 TriggerExecute(U0) 放出兔子
  if (!row.next) {                                 // 最后一个函数（原图第 47 波之后）：最终 BOSS 波，先倒计时 30 秒
    G.spawners = []; G.next = null;               // 原图在这里关掉三个出怪器
    G.finalCountdown = true; G.timer = 30;
    G.waveNote = '　<b>30 秒后最终 BOSS 波——龙 开启</b>';
    msg('30 秒后最终 BOSS 波——龙 开启');
    later(5, achFirst);
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
  else if (G.endless) {
    const E = G.endless, u = E.unit && D.units[E.unit];
    cur = (E.wave ? `无尽关卡第 ${E.wave} 波` : `无尽关卡 ${Math.ceil(G.timer)} 秒后开启`) + `　无尽积分 <b style="color:#ffd257">${E.score}</b>` +
      (u ? `　${u.name}（${ARMOR_CN[u.armorType]}护甲，生命 ${fmt(u.hp * (1 + 0.25 * (E.rhla + E.iy)) * G.hpScale)}，护甲 ${u.armor}，移速 ${u.speed + 5 * E.mg}）` : '');
    G.hint = cur; return;
  } else {
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
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsqt') m.onDeath = () => { killed++; bossCount(32, '大红牛都是钱！'); }; } };
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
    G.waveHook = { onSpawn(m) { if (m.uid === 'nsqa' || m.uid === 'n09B') m.onDeath = () => { killed++; bossCount(112, '大豪猪都是木！'); }; } };
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
    G.final.dragonAt = G.t + 0.3;
    const M3 = cap();
    if (M3 <= 50) dragon(Math.random() < 1 / 4 ? 'nbzd' : Math.random() < 1 / 3 ? 'nrdr' : pick(['nrdk', 'ngrd']), [1, 1]);
    else dragon('nbzd', [1, 2]);
    if (M3 > 50) later(0.3, () => dragon('nrdr', [2, 4]));
    if (M3 > 200) later(0.6, () => dragon('ngrd', [7, 8]));
    if (M3 > 300) later(0.9, () => dragon('nrdk', [5, 6]));
  });
  later(59.3, () => {
    G.sc = 'nndr';
    // 魔王的物品按人数（原图 CountPlayersInForceBJ）：≤2 人护甲 +22；≤4 人 +52、生命 +20 万；≤6 人 +82、+40 万；8 人 +122、+80 万。新人随机模式（JI = 1）不带物品
    const [arm, hp] = MODES[G.mode].plainBoss ? [0, 0] : G.players <= 2 ? [22, 0] : G.players <= 4 ? [52, 2e5] : G.players <= 6 ? [82, 4e5] : [122, 8e5];
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
  [[59.3, 'njga'], [114.3, 'n07W'], [169.3, 'n07V']].forEach(([t, id]) => later(t, () => { if (G.endless) return; startSpawner('少'); spawnAt('each', id, { boss: true }); }));   // 无尽开了就不再刷（原图 IsTriggerEnabled(Um)）
}

// ---------------------------------------------------------------- 当局成就（原图 H3[玩家]）
// 除了开局的拒绝逃跑 / 至尊档位和每次 Perfect，原图还有这些来源（war3map.j 里所有 "完成成就"）：
//   计数：购买人口 8 次（人口众多）、木材换金币 100 次（我是来换金币的）、放死亡之指 20 次（电电更健康），各 +2
//   组合（rG，升级完成时检查）：同时拥有指定的几座塔 +10；击杀（rE）：指定的 MAX 主塔技能练满后杀死一个敌人 +10。
//   两类共用次数 FR：组合要 FR < 2、击杀要 FR < 1，所以一局最多拿 2 个，先拿了组合就拿不到击杀成就
//   我是第一（最终 BOSS 倒计时第 5 秒，杀敌排行第一）+5；无尽我来了（开启无尽）+3；刺激（最后 10 秒倒计时里杀死龙和魔王并开启无尽）+2
//   大红牛都是钱 / 大豪猪都是木（全场杀死 32 只大红牛 / 112 只大豪猪）：给的是平台成就，这里换成账号成就 +1
// 原图电电更健康、我是第一、无尽我来了的触发器写的是 GetOwningPlayer(GetDyingUnit())，在那里拿不到单位，点数实际加到了不存在的 0 号玩家；
// 这里按提示文字加给完成的玩家。平台相关的（魔兽RPG会员、与段位少于 20 的玩家游戏）没做
const myName = () => G.player || me().name || '你';
function gainAch(key, n, text) {
  if (G.achDone[key]) return false;
  G.achDone[key] = true; G.ach += n;
  msg(text, 10); SFX.ui('hint'); uiDirty();
  return true;
}
const ACH_COUNT = { food: [8, '人口众多'], gold: [100, '我是来换金币的'], fod: [20, '电电更健康'] };
function achCount(k) {
  const [need, name] = ACH_COUNT[k];
  if (++G.achCnt[k] >= need) gainAch(name, 2, `${myName()}完成成就：${name}（当局成就 +2）`);
}
// 组合成就（单位 ID 和要求的座数）；第 4 个原图没写名字
const ACH_COMBO = [
  ['高速毒塔', { h010: 1, h00E: 1, n01B: 1, h01J: 1 }],                  // 加速光环 MAX + 萨满塔 + 火速塔 + 毒塔 MAX
  ['强力群攻', { h00P: 1, h00J: 1, h00K: 3 }],                           // 攻击光环 MAX + 兽人塔 + 3 座群攻塔 MAX
  ['原始战速团队', { n01G: 1, n01J: 1, n01N: 1 }],                       // 箭塔 / 闪电塔 / 通灵塔 MAX
  ['', { h01U: 1, n00I: 1, h00L: 1, h002: 1 }],                          // 减速光环 MAX + 精灵塔 MAX + 缓速塔 + 重击塔 MAX
  ['单杀好像很不错', { h01X: 1, h000: 1, n00X: 1, h019: 1 }],             // 减防光环 MAX + 腐蚀 / 灵魂 / 混乱塔 MAX
  ['我叫深渊流', { h03H: 1, h000: 1, h003: 1, h002: 1, n02Q: 1 }],        // 暴击 / 腐蚀 / 冰霜 / 重击塔 MAX + 超级深渊塔
  ['神图科', { h00R: 1, n00P: 1, h02O: 1 }],                             // 神圣 / 图腾 / 科技塔 MAX
  ['燃烧吧！燃烧吧！', { n01B: 1, n00S: 1, h040: 1 }],                   // 火速塔 + 炎魔 / 燃烧塔 MAX
];
function achCombo() {
  const have = {};
  for (const t of G.towers) if (mine(t) && t.levels && curLevel(t) && curLevel(t).id) { const id = curLevel(t).id; have[id] = (have[id] || 0) + 1; }
  for (const [name, need] of ACH_COMBO) {
    if (G.achFr >= 2) return;
    if (Object.entries(need).every(([id, n]) => (have[id] || 0) >= n) && gainAch('combo:' + name, 10, `${myName()}完成成就：${name}(当局成就+10)`)) G.achFr++;
  }
}
// 击杀成就：杀死敌人的是这座塔本身（GetKillingUnitBJ，召唤物不算）。原图还有天狂之神（天神塔 MAX 增加攻击上限 ≥ 30 级，技能只有 20 级），
// 条件永远达不到，没有照搬
const ACH_KILL = [
  ['魔幻之巅', t => t.fam === '魔幻塔' && isMax(t) && t.mg.lv.every(v => v === 10)],                  // 雷霆闪电 / 穿刺之镖 / 混乱流星都是 10 级
  ['至尊剑圣', t => t.fam === '剑圣塔' && isMax(t) && t.bm.lv.every(v => v >= 10)],                   // 剑刃 / 风暴之魂、致命一击 ≥ 10
  ['寒冰王者', t => t.fam === '寒冰塔' && isMax(t) && t.ice.lv.every(v => v >= 10)],                  // 冰雹 / 闪冰 / 爆冰术 ≥ 10
  ['神级弹跳', t => !!t.bmax],                                                                        // 弹跳塔 MAX
  ['激情扫射', t => t.fam === '扫射塔' && isMax(t) && t.sw.bat >= 8 && t.sw.cannon >= 8],              // 巨魔蝙蝠 / 炮都到 MAX（8 级）
  ['功勋将军', t => t.fam === '将军塔' && isMax(t) && [2, 3, 4].every(i => t.gen.store[i] >= 5)],     // 马 / 車 / 象 MAX
  ['人马首领', t => t.fam === '人马塔' && t.rm.eat >= 11 && t.rm.rage >= 11 && t.rm.bomb >= 10],      // 雷嗜 / 雷怒 ≥ 11、爆雷 ≥ 10
  ['疯狂五行', t => t.fam === '五行塔' && isMax(t) && G.wx.fu - 1 >= 5],                              // 五行激活成功 ≥ 5 次（GZ）
  ['天之风行', t => t.fam === '风行塔' && isMax(t) && t.talent && t.wind.lv[2] === 10],              // 天赋（R006）+ 削甲箭 10 级
];
function achKill(src) {
  if (G.achFr >= 1 || !src || !src.fam || !G.towers.includes(src) || !mine(src)) return;
  for (const [name, ok] of ACH_KILL) if (ok(src) && gainAch('kill:' + name, 10, `${myName()}完成成就：${name}（当局成就 +10）`)) { G.achFr++; return; }
}
function achFirst() {
  const top = board()[0];
  if (!top) return;
  if (top.local) gainAch('我是第一', 5, `${top.name}完成成就：我是第一   当局成就+5`);
  else msg(`${top.name}完成成就：我是第一   当局成就+5`, 5);
}
function bossCount(n, name) {
  if (++G.bossKills !== n) return;
  msg(`所有玩家完成成就：${name}`, 10);
  earnAch(1, name);
}

// ================================================================ 无尽关卡
// 杀死所有龙和魔王时（原图 zI）：按第一条龙出来后的秒数（C8）加 Perfect 分：≤150 秒 +3、≤250 +2、≤350 +1；Perfect 分 ≥ 10 开启无尽，否则通关结束。
// 开启后（zM）：180 秒倒计时，80 秒提示"无尽关卡是不能通关的"，120 秒提示怪物上限降到 每人 15；185 秒第一波，之后每 20 秒一波（zd）。
// 每波随机 10 种怪物之一（鬼、精灵、加理瑟斯、卡尔发丝、鹿神、幽灵、大法、风之希尔、阿尔萨斯、魔），每个出怪口每 0.6 秒 1 只、共 15 只；
// 每波怪物科技 Rhla +1（生命 +25%）；无尽积分到 10000 后每波再 +1 级 R010（生命 +25%），到 15000 后再 +1 级 R010 和 R01M（移速 +5）。
// 无尽积分 Ds：每杀一只怪 +(NM+4)，每波 +45（8 人在场）或 离开人数×45 + 空位×54（NM = 4 的 4 人局只有杀怪分，每只 +8）。
// 第一波开始时守卫者失去随机建造、使用木材、死亡之指、守护神技；塔类之球不能买。怪数超过上限时结束，按无尽积分结算（原图 RW / zr）
const ENDLESS_START = [[25000, 15], [24000, 14], [23000, 13], [22000, 12], [21000, 11], [20000, 10], [15000, 8], [10000, 6], [5000, 4], [1, 2]];
// 开局按玩家档案里的无尽最高分加当局成就（原图 qi 按平台存的无尽分 Oz：≥1 +2 … ≥25000 +15）
const endlessBonus = best => (ENDLESS_START.find(([s]) => best >= s) || [0, 0])[1];
const endlessLock = () => !!(G.endless && G.endless.locked);
// 无尽积分里程碑（原图 SG，每 3 秒检查）：给平台的至尊积分，这里换成账号成就（至尊 +1 = 账号成就 +10）
const ENDLESS_GOALS = [
  ['8人无尽达到6000分', 1, E => G.perfect >= 30 && E.score >= 6000 && G.players === 8],
  ['8人无尽达到4000分', 1, E => G.perfect >= 30 && E.score >= 4000 && G.players === 8],
  ['8人无尽达到2000分', 1, E => G.perfect >= 30 && E.score >= 2000 && G.players === 8],
  ['4人无尽达到5000分', 1, E => G.perfect >= 20 && E.score >= 5000 && G.players === 4],
  ['4人无尽达到3000分', 1, E => G.perfect >= 20 && E.score >= 3000 && G.players === 4],
  ['多人无尽达到2000分', 1, E => G.perfect >= 30 && E.score >= 2000 && G.players !== 4 && G.players !== 8],
  ['无尽达到10000分', 1, E => E.score >= 10000],
  ['无尽达到12000分', 1, E => E.score >= 12000],
  ['无尽达到15000分', 2, E => E.score >= 15000],
];
function finalCleared() {
  G.final.check = false;
  if (G.player && G.mode !== 'demo') { profileOf(G.player).clears++; earnAch(PROFILE.clear); }
  const c8 = G.t - (G.final.dragonAt ?? G.t), fp = c8 <= 150 ? 3 : c8 <= 250 ? 2 : c8 <= 350 ? 1 : 0;
  if (fp) { G.perfect += fp; msg(`${['', '快速', '超能', '完美'][fp]}杀死龙BOSS获得${fp}点perfect分`); }
  msg(`perfect分数：${G.perfect}`);
  if (G.perfect >= RULE.endlessFp) return startEndless(G.timer <= 10);
  msg('Perfect分数小于10，未达到开启【无尽关卡】条件');
  victory();
}
function startEndless(thrill) {
  G.endless = { wave: 0, score: 0, rhla: 0, iy: 0, mg: 0, unit: null, locked: false, goals: {}, hintAt: 0, nm: G.players === 4 ? 4 : 0 };
  G.spawners = []; G.sc = null; G.curUnit = null; G.bossRule = null; G.waveHook = null;     // 原图 zM 关掉最终波的出怪器
  G.timer = RULE.endlessOpen;
  G.waveNote = '　<b>无尽关卡</b>：不能通关，分数决定实力';
  msg(`Perfect分数大于10，【无尽关卡】${RULE.endlessOpen - 5}秒后开启`, 10);
  gainAch('无尽我来了', 3, '所有玩家完成成就：无尽我来了（当局成就+3）');
  if (thrill) gainAch('刺激', 2, '完成成就：刺激.......   当局成就+2');
  if (!G.rabbit) spawnRabbit(null, '我真希望能永远在大家身边！T。T');
  later(80, () => msg('无尽关卡是不能通关的，分数决定实力', 10));
  later(120, () => {
    G.c9 = G.c9.map(v => v > 0 ? RULE.endlessCap : 0);
    msg(`最大容怪数减少为【当前玩家数x${RULE.endlessCap}】`, 10);
    msg('守护者去除随机建筑、使用木材、死亡之指、守护神技；无尽怪物不会出现光环精英怪', 10);
  });
  refreshHint(); uiDirty();
}
function endlessWave() {
  const E = G.endless;
  if (!E.locked) { E.locked = true; if (G.menu === 'wood') G.menu = 'main'; if (G.pending === 'fod' || G.pending === 'talent') G.pending = null; uiDirty(); }
  E.wave++; G.timer = RULE.endlessEvery;
  E.rhla++;
  if (!E.nm) E.score += G.players === 8 ? 45 : G.roster.filter(p => p && p.out).length * 45 + (MAX_PLAYERS - G.players) * 54;
  if (E.score >= 10000) E.iy++;
  if (E.score >= 15000) { E.iy++; E.mg++; }
  E.unit = pick(D.endless);
  G.sc = G.curUnit = E.unit;
  const opt = { noWaveHp: true, noElite: true, hpMul: 1 + 0.25 * (E.rhla + E.iy), speedPlus: 5 * E.mg, ...(E.unit === 'noga' ? { mdx: 'units/nightelf/wisp/wisp.mdx', scale: 1.2 } : {}) };
  G.spawners = G.spawners.filter(s => s.word !== '无尽');
  G.spawners.push({ word: '无尽', every: 0.6, left: RULE.endlessCount, next: 0.6, opt });
  msg(`【无尽关卡第 ${E.wave} 波】`);
  earnAch(PROFILE.wave);
  refreshHint();
}
function endlessTick() {
  const E = G.endless;
  for (const [text, n, ok] of ENDLESS_GOALS) if (!E.goals[text] && ok(E)) {
    E.goals[text] = true; msg(`所有玩家 ${text}：至尊+${n}`, 10); earnAch(n * 10, text);
    if (text === '无尽达到10000分' && G.player && G.mode !== 'demo') { const p = profileOf(G.player); p.honor = Math.min(300, (p.honor || 0) + 1); saveProfiles(); msg('荣誉 +1（荣誉 ≥ 60 / 90 时荣誉光环的等级下限提高）'); }
  }
  if (G.t >= E.hintAt) { E.hintAt = G.t + 0.5; refreshHint(); }
}
function endlessEnd() {
  const E = G.endless, c = monstersAlive();
  G.phase = 'win'; G.score += 100; SFX.end('victory');
  let rec = '';
  if (G.player && G.mode !== 'demo') {
    const p = profileOf(G.player), s = Math.min(E.score, RULE.endlessBest);
    if (s > (p.endless || 0)) { p.endless = s; saveProfiles(); rec = '（新纪录）'; }
  }
  showModal(`<h2>无尽关卡结束</h2><p>当前怪数 ${c} 超过上限 ${cap()}。无尽关卡是不能通关的，分数决定实力</p>
    <p>无尽 <b>${E.wave}</b> 波 · 无尽积分 <b style="color:#ffd257">${E.score}</b>${rec} · 击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>${achSummary()}
    <div class="row"><button class="primary" id="m-restart">再来一局</button></div>`);
  document.getElementById('m-restart').onclick = () => { hideModal(); showStart(); };
}

// ---------------------------------------------------------------- 兔子（成就商店）
// 原图 nshe：中立单位，模型是复活节兔子（放大 3 倍），刷在外环外四块区域里的随机一点，小地图闪烁，60 秒后"咕~"一声消失
const RABBIT_TALK = ['跑圈啦! 跑圈啦!跑圈啦!', '咦，人呢？找不到我！啦啦啦！', '别过来，你们都别过来！我就只是想逛逛圈圈而已！',
  '这些宠物一点都比不上我，我是说速度！1，2，3虚浮！', '主塔后面不补塔，一看就是个麻瓜！', '我真希望能永远在大家身边！T。T'];
// 兔子卖的东西（原图 nshe 的物品栏，analysis/data/shops.json）。药水原图是买下后对塔使用：知识 / 重修药水只能对英雄用，单人只有一个英雄塔，买下直接用在英雄塔上；
// 魔法药水、天赋秘籍要选目标（放进守卫者物品栏）。4 种塔类之球每买一个 +1 许愿点；每局第一次在兔子这里买东西（重修药水除外）有 1/20 掉一包糖果（原图 BL1）
// 魔法药水的目标（原图 BKO：有这些功勋 / 魔法技能的塔 +200，天神塔 +600；英雄没有这些技能，用不了）
const MP_POTION_FAMS = new Set(['扫射塔', '天将塔', '巫妖塔', '剑圣塔', '魔幻塔', '风行塔', '寒冰塔', '将军塔', '神圣塔', '人马塔', '银行塔', '五行塔', '燃烧塔', '破坏塔', '小熊猫塔', '死亡塔', '狂狼塔', '深渊塔', '兽王塔', '弹跳塔']);
const noEndless = () => G.endless ? '无尽关卡不能购买' : null;   // 4 种塔类之球原图写着"无尽不能购买"
const orb = cat => () => { if (rerollSlot(cat) === false) return false; G.wish++; msg(`许愿点 +1（当前 ${G.wish}）`); };
const RABBIT_SHOP = [
  { id: 'I00K', key: 'Q', name: '原始之球', ach: 2, wood: 1, why: noEndless, tip: '随机 1 次建造栏的原始塔<br>获得 1 点许愿点', use: orb('raw') },
  { id: 'I00M', key: 'W', name: '光环之球', ach: 2, wood: 1, why: noEndless, tip: '随机 1 次建造栏的光环塔<br>获得 1 点许愿点', use: orb('aura') },
  { id: 'I00N', key: 'E', name: '辅助之球', ach: 2, wood: 1, why: noEndless, tip: '随机 1 次建造栏的 2 个辅助塔<br>获得 1 点许愿点', use: orb('sup') },
  { id: 'I00L', key: 'R', name: '另类之球', ach: 2, wood: 1, why: noEndless, tip: '随机 1 次建造栏的另类塔<br>获得 1 点许愿点', use: orb('alt') },
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
function spawnRabbit(by, talk) {
  const [a, b, c, d] = W3MAP.rects[pick(['y', 'z', 'BB', 'BC'])];      // 原图 qR：外环外的左、右、上、下四块区域等概率选一块，区域内随机一点
  const x = rnd(a, c), y = rnd(b, d);
  G.rabbit = { isRabbit: true, id: G.nextId++, x, y, hx: x, hy: y, t0: G.t, until: G.t + RULE.rabbitLife, face: rnd(0, TAU), next: G.t + 1 };
  SFX.ui('hint');
  msg(by ? `${by}召唤了一次兔子，大家快找呀！` : `兔子：${talk || pick(RABBIT_TALK)}`);
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
    // 光环之球只在 4 种普通光环里换（原图 Jx = 1~4），抽不到荣誉光环
    const s = slotOf(G.build[i]), all = slotPool(s).filter(f => !(cat === 'aura' && f === '荣誉光环')), pool = all.filter(f => f !== G.build[i]);
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
const talentName = t => t.talent === 2 ? '至尊天赋' : t.cat === 'aura' ? (t.talent ? '基础天赋' : '') : t.talentGot || (talentOf(t) ? talentOf(t).name : t.talent ? '天赋' : '');

// ---------------------------------------------------------------- 激活天赋（原图 A053：守卫者"使用木材"里的技能，施法距离 750，触发器 Bag）
// 直接扣木材激活一座塔的天赋（每座塔一次）：MAX 主塔 / 弹跳塔 MAX / 火速 · 恐惧 · 神力 · 冰封塔 30，MAX 另类塔 / 大辅助 / 巫系 / 地精塔 MAX 25，
// MAX 原始塔 20，MAX 辅助塔 10，超级深渊塔 50。天赋卷轴（A01P）只管 MAX 光环塔的基础天赋和全场唯一塔技能 +1 级。
// 技能包里写了 talent 的（主塔、另类塔）用技能包的，其余的在 TALENTS 里。字段：wood 木材、name 名字、max 要 MAX、only(t) 不能激活的原因、
// why(t) 已经激活（原图按玩家记的变量）、use(t) 激活时的效果（返回实际得到的天赋名，随机的那几种）
const TALENT_RAW = (name, tip, use) => ({ wood: 20, name, max: true, tip, use });
const TALENT_SUP = as => ({ wood: 10, name: `增加${as * 100}%攻击速度`, max: true, tip: `攻击速度 +${as * 100}%`, use(t) { t.talentAS = as; } });
const TALENT_BIG = (name, tip) => ({ wood: 25, name, tip });
const TALENT_UNIQ = (base, top) => ({ wood: 30, name: '技能等级 +3', tip: `技能 +3 级（${top - 3} 级以上直接到 ${top} 级）`,
  use(t) { const L = base + (t.ulv || 0); t.ulv = (L <= top - 3 ? L + 3 : top) - base; FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); return `${curLevel(t).name.replace(/塔$/, '')}（等级+3）`; } });
const TALENTS = {
  弹跳塔: { wood: 30, name: '弹跳天赋', only: t => t.bmax ? null : '要升到 MAX 才能激活天赋', use() { G.bounce.talent = true; }, tip: 'MAX 回收后再建弹跳塔，金币 ≥ 58000 且空余人口 ≥ 2 时直接变成 MAX' },
  恐惧塔: TALENT_UNIQ(2, 10), 火速塔: TALENT_UNIQ(2, 10), 神力塔: TALENT_UNIQ(1, 10), 冰封塔: TALENT_UNIQ(1, 13),   // 恐惧 / 火速塔建成时技能是 2 级
  闪电塔: TALENT_RAW('超级闪杀', '闪杀升到 2 级：8% 概率晕眩 5 秒', t => { t.abOv = { AHbh: { A: 8, dur: 5 } }; }),   // A0BD 2 级（2 级持续时间表里是空的，按说明 5 秒）
  箭塔: TALENT_RAW('无视箭射', '获得箭射加强（A081）', null),             // A081 是个空的致命一击，原图激活后没有实际效果（MAX 箭射的 40% 附加伤害不要天赋就有，见 primalMaxHit）
  群攻塔: TALENT_RAW('无视重击', '范围重击升到 2 级：晕眩 0.1 → 0.15 秒', null),   // A0A8 2 级（持续时间表里是空的，按说明 0.15 秒）
  牛头塔: TALENT_RAW('无视粉碎', '每次攻击塔周围 500 范围 攻击力×20% 混乱无视护甲伤害', null),
  破坏塔: TALENT_RAW('分裂破坏（分伤）', '同时攻击 9 个单位', null),
  通灵塔: TALENT_RAW('高级通灵', '8 个灵魂进入通灵状态，10 倍攻击 2 秒', null),
  毒塔: TALENT_RAW('慢性毒药 / 战略', '随机一种：1/3 巨毒（每秒 2000、减速 100%）、1/3 耐毒（每秒 1000、减速 80%）、1/3 战略（每 20 秒攻击 +600% 10 秒）', t => {
    if (rint(1, 3) === 2) { t.abOv = { Aspo: { A: 2000, C: 1, dur: 5 } }; return '慢性毒药(巨毒)'; }     // A03Q 2 级：说明写每秒 20000、5 秒，技能表是 2000
    if (rint(1, 2) === 2) { t.abOv = { Aspo: { A: 1000, C: 0.8, dur: 300 } }; return '慢性毒药(耐毒)'; }   // A03Q 3 级：说明写每秒 5000、300 秒，技能表是 1000
    t.strat = true; return '战略';
  }),
  混乱塔: TALENT_RAW('致命一击', '致命一击升级：已经是 2 级的变成强化（不变），否则一半会心（10% 7 倍）、一半致命（40% 5 倍）', t => {
    if (t.critLv === 2) return '致命一击(强化)';
    t.critLv = rint(1, 2) === 1 ? 3 : 4; return t.critLv === 3 ? '致命一击(会心)' : '致命一击(致命)';
  }),
  重击塔: TALENT_SUP(0.5), 冰霜塔: TALENT_SUP(0.5), 腐蚀塔: TALENT_SUP(0.5), 暴击塔: TALENT_SUP(0.15),
  萨满塔: TALENT_BIG('嗜血术MAX', '嗜血术 +60% 攻速 13 秒，冷却 3 秒，范围 600'), 兽人塔: TALENT_BIG('咆哮MAX', '咆哮 150 范围攻击 +85% 12 秒'),
  驱逐塔: TALENT_BIG('驱逐MAX', '驱逐移速 +200% 10 秒，附带 200 范围 300 混乱伤害'), 缓速塔: TALENT_BIG('缓速MAX', '漩涡减速 48% 3.8 秒，攻击附带 2000 魔法伤害'),
  巫医塔: TALENT_BIG('守卫MAX', '守卫 300 范围每秒 3000，冷却 9 秒'), 巫术塔: TALENT_BIG('毁灭凋零MAX', '死亡凋零 300 范围 10000，每秒消耗 7% 生命，冷却 10 秒'),
  巫法塔: TALENT_BIG('陷阱MAX', '静止陷阱 300 范围晕眩 3 秒，冷却 3.5 秒'), 巫魔塔: TALENT_BIG('恐惧之眼MAX', '恐惧之眼护甲 -100，冷却 3 秒'),
  地精塔: { wood: 25, name: '每秒回复2.5魔法', max: true, tip: '每秒多回 2.5 魔法' },
  巨箭塔: { wood: 25, name: '伤害加深', max: true, tip: '双刃箭单体 伤害等级×3000、范围 250 伤害等级×400' },
  图腾塔: { wood: 25, name: '魔法值增加', max: true, tip: '魔法上限 +400（A0HA）', use(t) { t.maxMana += 400; } },
};
const talentOf = t => t && t.fam && !t.isHero && t.cat !== 'summon' && ((KITS[t.fam] && KITS[t.fam].talent) || TALENTS[t.fam]);
const talentDone = t => { const kt = talentOf(t); return !!(t.talent || (kt && kt.why && kt.why(t))); };
function talentWhy(t) {
  if (!t || !t.fam || t.cat === 'summon') return '只能对塔使用';
  if (!mine(t)) return '只能激活自己的塔';
  const kt = talentOf(t);
  if (!kt) return t.cat === 'aura' ? '光环塔的天赋用天赋卷轴激活' : '这座塔没有天赋';
  if (kt.only && kt.only(t)) return kt.only(t);
  if (kt.max && !isMax(t)) return '非MAX塔没有天赋';
  if (talentDone(t)) return '该单位已经激活';
  if (G.wood < kt.wood) return `木材不足（激活要 ${kt.wood} 木材）`;
  return null;
}
function activateTalent(t) {
  const why = talentWhy(t); if (why) return msg(why);
  const kt = talentOf(t);
  G.wood -= kt.wood;
  const got = kt.use && kt.use(t);
  t.talent = true; t.talentGot = got || kt.name;
  FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); SFX.ui('upgrade');
  msg(`【${myName()}】的${curLevel(t).name}获得了${t.talentGot}（-${kt.wood} 木材）`);
  uiDirty();
}
function orderTalent(t, queue) {
  const why = talentWhy(t); if (why) return msg(why);
  giveOrder({ kind: 'talent', target: t, x: t.x, y: t.y, reach: 750 }, queue);
}
// 信息面板：还没激活的天赋
function talentHint(t) {
  const kt = talentOf(t); if (!kt || !mine(t)) return '';
  if (talentDone(t)) return `<b style="color:#9fffb0">已激活天赋：${talentName(t)}</b>`;
  if ((kt.max && !isMax(t)) || (kt.only && kt.only(t))) return '';
  return `<span style="color:#9fffb0">天赋（${kt.wood} 木材，守卫者「使用木材 → 激活天赋」）：${kt.name}——${kt.tip}</span>`;
}
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
    tip: `对 MAX 光环塔使用，激活<b>基础天赋</b>：光环升到 2 级（加速 +80% / 攻击 +142% / 减防 -100 / 减速 -70%），不能再激活至尊天赋<br>对全场唯一塔（恐惧 / 火速 / 神力 / 冰封 / 银行）使用：技能 +1 级<br>主塔、原始塔、辅助塔、另类塔等的天赋不用卷轴：守卫者「使用木材 → 激活天赋」直接扣木材激活<br>开局 1200 秒后开放，购买间隔 300 秒`,
    pick: '天赋卷轴：选择一座 MAX 光环塔或全场唯一塔（Esc 取消）',
    ok: t => !t || !t.fam ? '只能对塔使用' : UNIQ_TALENT.has(t.fam) ? null : t.fam === '荣誉光环' ? '荣誉光环不能激活天赋' : t.cat !== 'aura' || !isMax(t) ? '只能对MAX光环使用（其他塔的天赋用守卫者的"激活天赋"）' : t.talent ? '该单位已经激活' : null,
    use: t => {
      if (UNIQ_TALENT.has(t.fam)) return ulUp(t, 1, '天赋卷轴');
      t.talent = true; FXS.ring(t.x, t.y, 220, '#9fffb0', 0.6, 4); msg(`${curLevel(t).name}获得了基础天赋`);
    } },
  { id: 'I009', key: 'S', name: '复制卷轴', gold: 3000, inv: true, range: 600,
    tip: '对一位友军的守卫者使用，获得与其一模一样的建造能力（建造栏和英雄塔都换成他的；以后随机建筑需 6 木材），对方获得 5 木材',
    pick: '复制卷轴：选择一位队友的守卫者（Esc 取消）',
    why: () => activePlayers().some(p => !p.local && p.builder) ? null : '没有队友的守卫者可以复制（多人规模开局可以放模拟队友）',
    ok: t => !t || !t.remote ? '只能对友军的守卫者使用' : sameBuild(G.roster[t.pid]) ? '复制相同建造能力守护者无效' : null,
    use: b => copyBuild(G.roster[b.pid]) },
  { id: 'I00B', key: 'D', name: '收购卷轴', gold: 1800, inv: true, range: 600,
    tip: '对一个允许收购的友军 1 级光环塔使用，收购这个光环；出售者获得 1500 金币；收购荣誉光环时你有 10000 金币就付给对方 10000 金币（对方另得 4 木材），不够 10000 时和普通光环一样<br>自己的 1 级光环塔可以在命令面板里设成"允许收购"',
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
// 复制卷轴（原图 BKX）：建造栏换成对方的（含英雄塔），以后随机建造要 6 木材；对方 +5 木材。
// 神塔：BKX 复制了对方的 H8，但开放时按另一套编号（1 = 暗牧、3 = 驱魔；随机建造时 1 = 驱魔、3 = 暗牧），所以复制到的驱魔 / 暗牧塔对调，照搬
const GOD_COPY = { 驱魔塔: '暗牧塔', 暗牧塔: '驱魔塔' };
const sameBuild = p => p.build.map(f => GOD_COPY[f] || f).join() === G.build.join() && p.heroChoice === G.heroChoice;
function copyBuild(p) {
  G.build = p.build.map(f => GOD_COPY[f] || f); G.heroChoice = p.heroChoice; G.rerolls = Math.max(G.rerolls, 1); G.placing = null; G.honorLv = null;
  godRefresh();
  addWood(p, 5);
  NET.send({ t: 'copy', slot: G.me, target: p.slot });
  msg(`复制成功：建造栏换成了 ${p.name} 的（${G.build.join('、')}${G.heroChoice ? '、' + G.heroChoice : ''}）；${p.name} 获得 5 木材`);
}
// 收购卷轴（原图 BKC）：对方的 1 级光环塔要打开"允许收购"（A03K 2 级），收购后归你，出售者 +1500 金
// 荣誉光环（最大魔法 8）且收购者有 10000 金：收购者付 10000，出售者 +10000 金、+4 木（提示写 3 木，触发器加的是 4）；钱不够时按普通光环 +1500
function buyAura(t) {
  const p = G.roster[pidOf(t)], honor = t.fam === '荣誉光环' && G.gold >= 10000;
  if (honor) { G.gold -= 10000; addGold(p, 10000); addWood(p, 4); } else addGold(p, 1500);
  t.pid = G.me; t.forSale = false;
  NET.send({ t: 'buy', slot: G.me, tower: t.id, honor });
  msg(`收购成功：${curLevel(t).name} 现在是你的了；${p.name} 获得 ${honor ? '10000 金币、4 木材' : '1500 金币'}`);
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
  else if (ev.t === 'buy') { const t = G.towers.find(o => o.id === ev.tower); if (t && mine(t)) { t.pid = ev.slot; t.forSale = false; G.gold += ev.honor ? 10000 : 1500; if (ev.honor) G.wood += 4; msg(`${p.name}收购了你的${curLevel(t).name}，你获得 ${ev.honor ? '10000 金币、4 木材' : '1500 金币'}`); } }
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
const godStep = t => 40 * (10 + (G.godDy || 0) + G.petFx.gq + stoneLv(t, 2));     // 原图 A06X 等级 × 40 × (10 + Dy + DY 魔石塔 + Gq 宠物)

// ================================================================ 守护宗师（地图中央商店右边，原图 u01A）
// 卖的东西：兔子卷轴、重置卷轴、宠物卷轴、糖果、赞、投票卷轴、绑定卷轴、号令卷轴。英雄卷轴、轮回卷轴只能用平台成就币，没有做
// 绑定 / 号令卷轴（原图 BK5 / BK8）：绑定把这局建造栏里的成长塔（17 种主塔之一，原图 Qf）存进平台存档 bd；号令花 20 当局成就，
// 把建造栏的成长塔换成绑定的那种。这里存进玩家档案。原图绑定写着"20 点成就、2 人或以上到达无尽关卡"，触发器里既不扣也不查，
// 这里只要求本局到达无尽关卡（单人也能绑）
const mainSlot = () => SLOTS.indexOf('main');
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
  { id: 'I00T', key: 'D', name: '绑定卷轴', tip: '把这局建造栏里的成长塔（主塔）绑定到玩家档案，以后的局可以买号令卷轴把它放进建造栏<br>要到达无尽关卡；再绑定会覆盖上一次的',
    why: () => !G.endless ? '要到达无尽关卡才能绑定' : !G.player || G.mode === 'demo' ? '没有玩家档案，不能绑定' : null,
    use: () => { const f = G.build[mainSlot()]; profileOf(G.player).bound = f; saveProfiles(); msg(`绑定成功：${f}`); } },
  { id: 'I00U', key: 'F', name: '号令卷轴', ach: 20, tip: '把建造栏的成长塔（主塔）换成玩家档案里绑定的那种',
    why: () => { const b = G.player && profileOf(G.player).bound; return !b ? '未绑定成长塔，号令失败' : G.build[mainSlot()] === b ? `建造栏的成长塔已经是${b}` : null; },
    use: () => { const b = profileOf(G.player).bound; G.build[mainSlot()] = b; if (G.placing && D.towers[G.placing] && D.towers[G.placing].cat === 'main') G.placing = null; msg(`成就号令成功：建造栏的成长塔换成了${b}`); uiDirty(); } },
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
    ok: t => !t || !t.fam ? '只能对塔使用' : UNIQ_TALENT.has(t.fam) ? null : t.fam === '荣誉光环' ? '荣誉光环不能激活天赋' : t.cat !== 'aura' || !isMax(t) ? '只能对MAX光环使用' : t.talent ? '该单位已经激活' : null,
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
// 魔法药水（小）（I03Z，怪物掉落）：原图 BKR 和魔法药水同样的目标 +50 魔法，但没有天神塔 +600 那一支（天神塔用不了）；3 个自动合成魔法药水（oO）
ITEMS.I03Z = Object.assign(Object.create(ITEMS.I01T), {
  id: 'I03Z', name: '魔法药水(小)', pawn: { gold: 1250 }, pick: '魔法药水(小)：选择有魔法功勋的塔（Esc 取消）',
  tip: '对一座有魔法功勋的塔（魔幻、剑圣、寒冰、神圣、扫射、银行、弹跳塔 MAX 等）使用，获得 50 点魔法<br>天神塔、英雄塔不能使用<br>3 个魔法药水(小)会自动合成魔法药水',
  ok: t => !t || t.isHero || !(MP_POTION_FAMS.has(t.fam) && t.maxMana > 0 && (t.fam !== '弹跳塔' || t.bmax)) ? '添加失败，该单位无魔法功勋' : null,
  use: t => { addMana(t, 50); msg(`${curLevel(t).name} 魔法 +50`); },
  onPick() { const s = G.inv.filter(x => x && x.id === 'I03Z'); if (s.length >= 3) { s.slice(0, 3).forEach(invRemove); invAdd(ITEMS.I01T); msg('3 个魔法药水(小)合成了魔法药水'); } },
});
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
// 怪物死亡掉落（原图 wa：Player(11) 的单位死亡，龙鹰骑士除外）：C0 = 1~5000，
// 50~55 木、90~100 钱、155 上、359 有、799 马、1500 光环碎片、4500 且 1/5 梦、25~29 魔法药水（小）
function monsterDrop(m) {
  if (m.uid === 'hdhw') return;
  const c = rint(1, 5000);
  const id = c >= 50 && c <= 55 ? 'I008' : c >= 90 && c <= 100 ? 'I005' : c === 155 ? 'I006' : c === 359 ? 'I007' : c === 799 ? 'I004'
    : c === 1500 ? 'I01R' : rint(1, 5) === 5 && c === 4500 ? 'I03Y' : c >= 25 && c < 30 ? 'I03Z' : null;
  if (id && dropItem(id, m.x, m.y)) msg(`${m.name || '怪物'}掉下了${ITEMS[id].name}（地上，让守卫者去捡）`);
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
  n038: { name: '海龟', item: 'I020', mdx: 'units/creeps/seaturtle/seaturtle.mdx', scale: 0.25, dmg: 65, cd: 0.3, range: 300, speed: 100, wave: 9, skill: 'frost', fx: { gs: 2 }, boost: '风行塔疯狂箭的 FX箭多活 2 秒' },
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
const WILD_BONUS = [null, ['天神塔（浣熊）', { gq: 2 }], ['神牛（小牛）', { g3: 0.03 }], ['风行塔（海豹）', { gs: 2 }], ['战神塔（小狼）'], ['巫妖塔（小鬼）', { gr: 100 }], ['先知（企鹅）', { kv: 0.06 }], ['炼金塔（鹰）'],
  ['幻影（鹰）', { k4: 1.5 }], ['邪冰（绵羊）', { kx: 2 }], ['图腾（绵羊）', { r1: 0.09 }], ['渔人（小鱼人）', { go: 1 }], ['金币补贴和人马塔（小马）', { hj: 1, kw: 1.1 }], ['图腾（浣熊）', { lx: 2 }], ['狂狼塔（小狼）', { kl: 3 }]];
function applyPetFx(fx) {
  for (const [k, v] of Object.entries(fx || {})) {
    if (k === 'kl') { G.klSpd = Math.min(WOLF.spdMax, G.klSpd + v); continue; }   // 狂狼（小狼）：狼速科技 R00S +3
    G.petFx[k] = k === 'go' || k === 'kr' ? G.petFx[k] + v : Math.max(G.petFx[k] || 0, v);
  }
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
    else if (G.endless) endlessWave();
    else if (G.final) return gameOver('300 秒内没有杀死所有龙和魔王');
    else if (G.finalCountdown) startFinal();
    else startWave();
  }
  // 发金（原图 R6 / wX：开局就打开的 5 秒周期触发器）：每 5 秒给 排行榜名次 ×8 + 波数 ×2（LeaderboardGetPlayerIndexBJ，按杀敌数排，
  // 名次越靠后拿得越多；只有你一人时是第 1 名）；新人随机模式 ×12 + ×4
  if (G.knWave == null && (G.incomeT = (G.incomeT || 0) + dt) >= 5) {     // -KN 之后 R6 关掉了
    G.incomeT -= 5;
    const [gr, gw] = MODES[G.mode].waveGold || [8, 2];
    for (const p of activePlayers()) addGold(p, rankOf(p.slot) * gr + G.wave * gw);
  }
  if ((G.dpT = (G.dpT || 0) + dt) >= 1) { G.dpT -= 1; for (let i = 0; i < MAX_PLAYERS; i++) { G.dp[i]++; G.je[i]++; } }   // 原图 BbM / Bay
  // 延时事件
  const due = G.timeouts.filter(x => x.at <= G.t);
  G.timeouts = G.timeouts.filter(x => x.at > G.t);
  due.forEach(x => x.fn());
  // 出怪
  for (const s of G.spawners) {
    s.next -= dt;
    while (s.next <= 0 && s.left > 0) { if (G.sc) for (const g of G.gates) spawnMonster(G.sc, { gate: g, ...s.opt }); s.left--; s.next += s.every; }   // 每个开着的出怪口各刷 1 只"当前出怪单位"（原图的 Ul）
  }
  G.spawners = G.spawners.filter(s => s.left > 0);
  builderUpdate(dt);
  rabbitUpdate(dt);
  extrasUpdate(dt);
  applyAuras();
  // 塔
  for (const t of G.towers) towerUpdate(t, dt);
  for (const t of G.towers) if (t.until && t.until <= G.t && t.onExpire) t.onExpire(t);   // 限时召唤物到时间（虫的小虫死时尸爆）
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
    monsterSkills(m);
    if (m.burn) hurt(m, m.burn.dps * dt, 'magic', m.burn.src, { ignoreArmor: true });
    for (const d of m.dots) if (d.until > G.t) hurt(m, d.dps * dt, d.atk, d.src, { noKill: d.noKill });
    m.dots = m.dots.filter(d => d.until > G.t);
    if (!m.dead) m.hp = Math.min(m.maxHp, m.hp + (m.regen + m.auraRegen * m.maxHp) * dt);
    if (m.shredUntil < G.t) m.shred = 0;
    if (m.armorDownUntil < G.t) m.armorDown = 0;
  }
  G.monsters = G.monsters.filter(m => !m.dead);
  separateMonsters();
  // 规则检查
  if (G.phase === 'run' && monstersAlive() > cap()) return G.endless ? endlessEnd() : gameOver(`当前怪数 ${monstersAlive()} 超过上限 ${cap()}`);
  if (G.endless) endlessTick();
  if (G.bossRule && G.t > G.bossRule.killBy) {
    if (G.bossRule.ids.some(b => b && !b.dead)) return gameOver('100 秒内没有杀死所有 BOSS');
    G.bossRule = null;
  }
  if (G.bossRule && G.bossRule.ids.every(b => !b || b.dead)) { msg('BOSS 已全部击杀！'); G.bossRule = null; }
  if (G.final && G.final.check && !G.endless && G.final.need.every(m => m.dead)) return finalCleared();
  // 特效
  for (const f of G.fx) f.life -= dt;
  FXS.update(dt);
  G.fx = G.fx.filter(f => f.life > 0);
}
// 结算时附上本局获得的账号成就和档位
function achSummary() {
  if (!G.player || G.mode === 'demo') return '';
  const p = profileOf(G.player), t = achTier(p.pts);
  return `<p>${G.player}：本局账号成就 <b style="color:#ff9ad5">+${G.earned}</b>，共 ${p.pts} 点 · ${t.name}${p.endless ? ` · 无尽最高 ${p.endless} 分` : ''}（下局开局当局成就 ${RULE.startAch + t.lv + endlessBonus(p.endless || 0)}${t.next ? `，${t.next} 点升下一档` : ''}）</p>`;
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
  showModal(`<h2>通关！</h2><p>你杀死了最终 BOSS。击杀 ${G.kills} · Perfect ${G.perfect} · 得分 ${G.score}</p>${achSummary()}
    <p>Perfect 分未达到 ${RULE.endlessFp}，没有开启无尽关卡（每波开始时场上没有怪 +1，杀死龙越快加得越多）。</p>
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
  if (G.pending && mouse) { label(G.pending === 'blink' ? '闪烁到这里' : G.pending.startsWith('xfer:') ? '把魔法转给这座弹跳塔' : G.pending === 'wuji' ? '献祭这座塔' : G.pending === 'kuward' ? '在这里放重生点' : G.pending === 'heroPick' ? (G.heroPick ? G.heroPick.label : '') : G.pending.startsWith('item:') ? '对这里的光环塔使用' : '移动到这里', wx(mouse.x, mouse.y), wy(mouse.y) + 90, '#c8f5c8', 12); }
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
  荣誉光环: { c1: '#ffb52e', c2: '#ffe9a8', glyph: 'blade' },     // 荣誉：金色
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
  荣誉光环: ['abilities/spells/orc/commandaura/commandaura.mdx', [1.6]],    // 单位表的模型是统御光环
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
  if (t.hide || !onScr(t.x, t.y)) return;          // 看不见的马甲（树妖箭）
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
function addFx(f) { if (HELD) return HELD.push(() => addFx(f)); if (f.kind === 'ring') return FXS.ring(f.x, f.y, f.r, f.color, f.life, 4); if (G.fx.length < 400) G.fx.push(f); }   // 冲击波统一交给 fx.js 画

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
  $('w-title').textContent = G.phase === 'prep' ? '准备阶段' : G.endless ? (G.endless.wave ? `无尽第${G.endless.wave}波` : '无尽关卡') : G.wave >= 48 ? '最终BOSS' : `第${G.wave}波`;
  const t = Math.max(0, Math.ceil(G.timer));
  $('w-timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const c = monstersAlive(), cp = cap();
  $('w-count').textContent = c; $('w-cap').textContent = cp;
  $('w-count').className = c > cp * 0.8 ? 'danger' : c > cp * 0.5 ? 'warn' : '';
  $('w-perfect').textContent = G.perfect;
  if ($('w-hint').dataset.v !== G.hint) { $('w-hint').innerHTML = G.hint; $('w-hint').dataset.v = G.hint; }
  // 排行榜（原图 RF：按杀敌数排，每 5 秒发金按名次）
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
  : o.kind === 'use' ? `前去使用${o.item.name}` : o.kind === 'fod' ? '前去施放死亡之指' : o.kind === 'talent' ? '前去激活天赋' : o.kind === 'pick' ? `去捡${o.target.def.name}` : '移动中'; };
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
      <div class="kv"><span>移动速度</span><b>500</b><span>技能</span><b>建造 · 随机建造 · 使用木材 · 全图闪烁 · 死亡之指 · 守护神技</b>
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
    if (e.cat === 'aura') { const ab = auraAb(e) || {}; mid += `<span>光环</span><b>${auraText(e.fam, ab)}${e.talent ? `（${talentName(e)}）` : ''}</b><span>范围</span><b>${e.honor ? e.honor.map((lv, k) => honorArea(k, lv)).join(' / ') : ab.area}</b>`; }
    else mid += `<span>攻击力</span><b>${fmt(st.dmg)}${bonusTxt(towerAtk(e))}</b><span>攻击间隔</span><b>${st.cd}s${bonusTxt(towerAS(e), '攻速')}</b><span>射程</span><b>${st.range}</b>`;
    mid += `<span>击杀/伤害</span><b>${e.kills} / ${fmt(e.dealt || 0)}</b><span>已投入</span><b class="gold">${e.spent} 金</b></div>${towerInfo(e)}<div class="tip">${(lv.tip || '').replace(/\n/g, ' ')}</div>`;
  } else {
    const ar = effArmor(e);
    left = portrait(e, e.name, ARMOR_COLOR[e.type]) + bar('hp', e.hp, e.maxHp, `${fmt(e.hp)} / ${fmt(e.maxHp)}`);
    mid = `<div class="nm">${e.name}${e.boss ? ' <em>BOSS</em>' : ''}${e.elite ? ' <em style="color:#ff4fd8">精英</em>' : ''}</div><div class="sub">怪物 · <span style="color:${ARMOR_COLOR[e.type]}">${ARMOR_CN[e.type]}护甲</span> → 克制：${ATK_CN[COUNTER[ARMOR_CN[e.type]]] || '—'}</div>
      <div class="kv"><span>护甲</span><b>${Math.round(ar)}（减伤 ${Math.round((1 - armorMult(ar)) * 100)}%）</b><span>移动速度</span><b>${e.speed}</b><span>赏金</span><b class="gold">${Math.round(e.bounty)}</b>
      ${e.elite ? `<span>光环</span><b>${e.elite.aura.name} ${e.elite.lvl} 级：${e.elite.aura.desc[e.elite.lvl - 1]}</b>` : ''}
      ${e.uid === 'Udea' ? `<span>魔法免疫</span><b style="color:${e.magicImmune ? '#7ab8ff' : '#999'}">${e.magicImmune ? '有（魔法攻击无效，每 5 秒切换）' : '无（每 5 秒切换）'}</b>` : ''}${monsterTraits(e)}</div>`;
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
      if (e.cat === 'aura') { const ab = auraAb(e) || {}; c1 = stat('armor-fortified', '护甲', INVULN); c2 = `<div class="st"><div><span>光环：</span><b>${auraText(e.fam, ab)}${e.talent ? `（${talentName(e)}）` : ''}</b><br><span>范围：</span><b>${e.honor ? e.honor.map((lv, k) => honorArea(k, lv)).join(' / ') : ab.area}</b></div></div>`; }
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
    const tr = monsterTraitList(e); if (tr.length) extra += `<div class="tip">${tr.join('<br>')}</div>`;
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
  const debs = [bv(t, 'silence') && '被沉默（不能攻击）', bv(t, 'curse') && `被诅咒（${pctTxt(bv(t, 'curse'))} 打不中）`, bv(t, 'miss') && `攻击 ${pctTxt(bv(t, 'miss'))} 落空`, bv(t, 'slowAS') && `攻速 -${pctTxt(Math.min(0.8, bv(t, 'slowAS')))}`].filter(Boolean);
  if (debs.length) lines.push(`<b style="color:#ff8f86">${debs.join('，')}</b>`);
  if (t.critLv) { const c = CHAOS_CRIT[t.critLv]; lines.push(`致命一击 ${t.critLv} 级：${c.A}% 概率 ${c.B} 倍`); }
  const th = talentHint(t); if (th) lines.push(th);
  if (t.cat === 'aura' && t.lv === 0 && !mine(t) && t.forSale) lines.push('<b style="color:#9fd8ff">允许收购：可以用收购卷轴买下</b>');
  return lines.length ? `<div class="tip">${lines.join('<br>')}</div>` : '';
}
function auraText(fam, ab) {
  const v = Math.abs(ab.A || 0);
  return { 加速光环: `范围内塔攻速 +${Math.round(v * 100)}%`, 攻击光环: `范围内塔攻击 +${Math.round(v * 100)}%`, 减防光环: `范围内敌人护甲 -${v}`, 减速光环: `范围内敌人移速 -${Math.round(v * 100)}%`, 荣誉光环: '4 个光环，可与任意光环叠加' }[fam];
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
      const keys = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'];   // 8 格随机建造，英雄塔接在后面（Z）
      G.build.forEach((fam, i) => {
        const d = D.towers[fam], l = d.levels[0], blocked = buildBlock(fam);
        out.push(cmd(keys[i], fam.slice(0, 2), fam, `<b>${fam}</b> ${d.cat === 'aura' ? atkTag('aura') : atkTag(l.atk)}<br>${CAT_CN[d.cat]} · <span class="gold">${l.gold} 金</span> · ${l.food || 0} 人口<br>${l.tip.replace(/\n/g, '<br>')}${blocked ? '<br><b style="color:#ff5a4f">' + blocked + '</b>' : ''}`,
          () => { G.placing = fam; G.pending = null; uiDirty(); }, { cat: d.cat, atk: d.cat === 'aura' ? 'aura' : l.atk, active: G.placing === fam, disabled: !!blocked || G.gold < l.gold, iconKey: 'icon:' + fam,
            ico: SVG_CATS.has(d.cat) ? 'tower-' + fam : null, cost: l.gold }));
      });
      if (G.heroChoice) { const h = D.heroes[G.heroChoice], blocked = heroBlock();
        out.push(cmd('Z', h.name, h.name + '（英雄塔）', `<b>${h.name}</b> ${atkTag(h.atk)}<br>英雄塔 · 全场唯一 · 建造后不能回收<br><span class="gold">${h.gold} 金</span> · ${h.wood} 木材 · ${h.food} 人口 · ${h.sponsor ? '<b style="color:#ffd257">赞助英雄</b>' : `<b style="color:#ff9ad5">${RULE.heroAch} 当局成就</b>`}<br>${h.title}${blocked ? '<br><b style="color:#ff5a4f">' + blocked + '</b>' : ''}`,
          () => { G.placing = 'hero'; uiDirty(); }, { atk: h.atk, active: G.placing === 'hero', disabled: !!blocked || G.gold < h.gold || G.wood < h.wood, hero: true, iconKey: 'icon:hero:' + h.name, ico: 'hero-' + h.name, cost: h.gold })); }
      while (out.length < 11) out.push(null);
      out.push(back); return out;
    }
    if (G.menu === 'wood') {
      out.push(cmd('Q', '人', '购买人口', '用 <b>12 木材</b>购买 1 个人口', () => { if (G.wood < RULE.foodPrice) return msg('木材不足'); G.wood -= RULE.foodPrice; G.foodCap++; msg('用 12 木材兑换了 1 个人口'); achCount('food'); uiDirty(); }, { disabled: G.wood < 12, ico: 'buyfood' }));
      out.push(cmd('W', '金', '兑换金币', '<b>1 木材</b>兑换 300 金币', () => { if (G.wood < 1) return msg('木材不足'); G.wood--; G.gold += RULE.woodToGold; achCount('gold'); uiDirty(); }, { disabled: G.wood < 1, ico: 'wood2gold' }));
      out.push(cmd('E', '天', '激活天赋', '<b>激活天赋</b>（施法距离 750）<br>选一座自己的塔，扣木材激活它的天赋（每座塔一次）：<br>MAX 主塔、弹跳塔 MAX、火速 / 恐惧 / 神力 / 冰封塔 <b>30 木材</b><br>MAX 另类塔、大辅助、巫系、地精塔 MAX <b>25 木材</b><br>MAX 原始塔 <b>20 木材</b>，MAX 辅助塔（重击 / 冰霜 / 腐蚀 / 暴击）<b>10 木材</b>，超级深渊塔 <b>50 木材</b><br>选中塔时信息面板会写它的天赋；MAX 光环塔用天赋卷轴',
        () => { G.pending = 'talent'; G.placing = null; msg('激活天赋：选择一座塔（Esc 取消）'); uiDirty(); }, { active: G.pending === 'talent', ico: 'talent' }));
      while (out.length < 11) out.push(null); out.push(back); return out;
    }
    out.push(cmd('M', '➜', '移动', '移动守卫者。也可以选中守卫者后直接右键 / 点击地面', () => { G.pending = 'move'; G.placing = null; uiDirty(); }, { active: G.pending === 'move', ico: 'move' }));
    out.push(cmd('S', '■', '停止', '停止当前命令（包括排队的命令）', () => { e.order = null; e.queue = []; G.pending = null; G.placing = null; uiDirty(); }, { ico: 'stop' }));
    out.push(cmd('F', '✦', '闪烁', '全图闪烁：瞬间移动到目标点，冷却 1 秒', () => { G.pending = 'blink'; G.placing = null; uiDirty(); }, { active: G.pending === 'blink', ico: 'blink' }));
    out.push(cmd('B', '建', '建造', '打开建造栏（当前随机给出的 8 个塔 + 1 个英雄塔）', () => { G.menu = 'build'; uiDirty(); }, { ico: 'build' }));
    if (!endlessLock()) out.push(cmd('R', '🎲', '随机建造', `重新随机建造栏：1 主塔、1 原始塔、1 光环塔、1 新辅助（大辅助 / 巫系）、1 小辅助、1 另类塔、1 全场唯一、1 英雄塔<br>${G.rerolls === 0 ? '首次免费' : `需要 ${RULE.rerollWood} 木材`}`, () => rerollBuild(false), { disabled: G.rerolls > 0 && G.wood < RULE.rerollWood, ico: 'reroll' }));
    if (!endlessLock()) out.push(cmd('U', '木', '使用木材', '购买人口（12 木）、兑换金币（1 木 → 300 金）、激活天赋（10~50 木）。买木材去地图中央的商店', () => { G.menu = 'wood'; uiDirty(); }, { ico: 'woodmenu' }));
    const fw = fodBlock();
    if (!endlessLock()) out.push(cmd('X', '指', '死亡之指', `<span class="atk atk-magic">主动</span> 射程 ${FOD.range} · 冷却 ${FOD.cd} 秒 · <span style="color:#7ab8ff">${FOD.mana} 魔法</span><br>选择一个敌人：直接杀死它。<br>BOSS 只损失一部分生命（大红牛 7000、大骷髅 2.5 万、直升机 / 游艇 / 魔王 10 万、龙 / 狗头人 BOSS 生命高于 15 万时 10 万，按模式缩放）${fw ? `<br><b style="color:#ff5a4f">${fw}</b>` : ''}`,
      () => { const why = fodBlock(); if (why) return msg(why); G.pending = 'fod'; G.placing = null; msg('死亡之指：选择一个敌人（Esc 取消）'); uiDirty(); },
      { ico: 'fod', active: G.pending === 'fod', cdOf: () => [fodLeft(), FOD.cd] }));
    const sw = stompBlock();
    if (!endlessLock()) out.push(cmd('D', '践', '守护神技', `<span class="atk atk-magic">主动</span> 冷却 ${STOMP.cd} 秒 · <span style="color:#7ab8ff">${STOMP.mana} 魔法</span><br>震击地面，让守卫者周围 ${STOMP.r} 范围的敌人晕眩 ${STOMP.stun} 秒（BOSS 不受影响）${sw ? `<br><b style="color:#ff5a4f">${sw}</b>` : ''}`,
      castStomp, { ico: 'stomp', cdOf: () => [stompLeft(), STOMP.cd] }));
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
    // 第一行：学会的技能（按学会的顺序）。原图的主动技能都是攻击时自动放，这里显示冷却。没有技能书的英雄：这一行是它自己的命令
    const own = def.cmds ? def.cmds(h) : [], noBook = def.noBook || !hd.skills.length;   // noBook：技能书里的技能是直接点的命令（图腾）
    if (noBook) for (let k = 0; k < 4; k++) out.push(own[k] || null);
    else for (let k = 0; k < 4; k++) {
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
    if (noBook) { out.push(...own.slice(4, 6)); return out; }
    out.push(cmd('L', '书', '学习技能', `最多 4 个。第 1 个免费，第 2/3/4 个需要木材 18/36/54，力量 ≥ 80/160/240${canUp ? '<br>学会的技能有的可以再次学习' : ''}`, () => { G.menu = 'skills'; uiDirty(); }, { ico: 'learn', disabled: h.learned.length >= 4 && !canUp }));
    out.push(...own.slice(0, 2));
    return out;                                      // 英雄塔建造后不能回收（原图英雄塔说明）
  }
  if (e.kind === 'troll' && e.owner && mine(e.owner)) return jmTechCmds(e);     // 巨魔：研究巨魔科技
  if (e.fam && e.cat !== 'summon') {
    if (!mine(e)) return out;                                  // 队友的塔：只能看
    const f = famOf(e), kit = KITS[e.fam];
    if (e.cat === 'aura' && e.lv === 0) out.push(cmd('T', '售', e.forSale ? '允许收购（点击关闭）' : '当前不能收购（点击允许）', `原图 A03K：允许收购后，队友可以用收购卷轴买下这座 1 级光环塔，你获得 1500 金币<br>当前：<b>${e.forSale ? '允许收购' : '不能收购'}</b>`,
      () => { e.forSale = !e.forSale; NET.send({ t: 'state', slot: G.me, sale: { tower: e.id, on: e.forSale } }); msg(e.forSale ? '这座光环塔现在允许队友收购' : '这座光环塔现在不能收购'); uiDirty(); }, { active: !!e.forSale, ico: 'sell' }));
    if (kit && kit.cmds) out.push(...kit.cmds(e).map(c => abilIco(e, c)));
    if (f.branches && e.lv === 0 && !e.bmax) Object.keys(f.branches).forEach((k, i) => { const n = f.branches[k][0]; out.push(cmd(['Q', 'W', 'E', 'R'][i], k, k + '分支', `<b>${n.name}</b> ${atkTag(n.atk)}<br><span class="gold">${n.gold} 金</span> · 攻击 ${n.dmg} · 弹射 ${n.targets} 个`, () => upgradeTower(e, k), { atk: n.atk, disabled: G.gold < n.gold, ico: 'branch-' + n.atk, cost: n.gold })); });
    else if (e.levels[e.lv + 1]) { const n = e.levels[e.lv + 1]; out.push(cmd('U', '↑', '升级', `升级到 <b>${n.name}</b><br><span class="gold">${n.gold} 金</span>${e.cat === 'aura' ? '' : ` · 攻击 ${fmt(n.dmg)} · 间隔 ${n.cd}s · 射程 ${n.range}`}<br>${n.tip || ''}`, () => upgradeTower(e), { disabled: G.gold < n.gold, ico: 'upgrade', iconKey: `portrait:tower:${e.fam}:${e.lv + 2}`, cost: n.gold })); }
    while (out.length < 7) out.push(null);
    out.push(cmd('Y', '回', '回收', `返还建造和升级花费的 100% 金币：<b>${e.spent}</b>`, () => sellTower(e), { ico: 'sell' }));
  }
  return out;
}
// 塔的命令没指定图标时，按名字找原图塔身上的同名技能，用它的原版图标（tools/war3_icons.py 登记的 ico:abil-<技能 ID>）
const abilName = s => String(s || '').replace(/\|c[0-9a-f]{8}|\|r/gi, '').replace(/^[-*\s]+|[-*\s]+$/g, '').replace(/[（(\[].*$/, '').trim();
function abilIco(e, c) {
  if (!c || c.ico || c.iconKey) return c;
  const nm = c.name.replace(/^关闭/, '开启'), sp = window.ASSET_MANIFEST.sprites;
  for (const l of e.levels) for (const a of l.abils || []) {
    const n = abilName(a.name);
    if (n && sp['ico:abil-' + a.id] && (n === nm || (Math.min(n.length, nm.length) >= 2 && (nm.includes(n) || n.includes(nm))))) return { ...c, ico: 'abil-' + a.id };
  }
  return c;
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
  for (const t of G.towers) { if (t.hide) continue; const d = d2(t, t.cat === 'aura' ? 80 : 200); if (d < rpx(t, 120, 16) && d < bd) { bd = d; best = t; } }
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
  if (G.pending === 'heroPick') {                              // 英雄命令选目标（驯化野兽、拷贝神技等）
    const p = G.heroPick, hit = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null; G.heroPick = null; if (p) p.fn(x, y, hit); uiDirty(); return;
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
  if (G.pending === 'talent') {                               // 激活天赋：对自己的塔
    const t = mouse && hitTest(mouse.x, mouse.y);
    G.pending = null; orderTalent(t, shift); uiDirty(); return;
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
// ---------------------------------------------------------------- 聊天命令（原图 tK ~ wV 一带的 TriggerRegisterPlayerChatEvent）
// 回车打开聊天框，回车发送，Esc 取消；照原图按"包含"匹配（-CZ 是整句匹配），不分大小写。
// 做了：-KN（只有 1 号玩家能用：关掉每 5 秒发金的 R6，原图怪物生命科技 Rhar 也是 R6 每 5 秒设成当前波数的，所以一起停在当时的波数）、
// -PF（Perfect 数）、-CJ（当局成就；原图后半是平台成就币，这里换成账号成就）、-CZ（英雄成长值，妖灵再加飞鸟的 X / Y / Z）、-SC（全场玩家单位总数 De）。
// 没做：-MS（调试用的一串数字）、-YX（平台英雄点）、-CZCZ / -ZHTZ（平台赞助：重置成长值 / 召唤兔子，重置成长值见守护宗师的重置卷轴）、
// -QXPF（取消自动用英雄皮肤，皮肤没做）、-fuck02~08 / -gb00（房主踢人 / 房主掉线后接管，等联机）；地图里另外被塞进了"魔解网"的作弊脚本（cx / sc / -wp 等），不做
const CHAT_CMDS = [
  { s: '-KN', fn() { if (G.me !== 0) return; msg('难度系数增加为困难', 10); if (G.knWave == null) G.knWave = G.wave; } },
  { s: '-PF', fn() { msg(`Perfect数:${G.perfect}`, 10); } },
  { s: '-CJ', fn() { msg(`当局成就：${G.ach}   账号成就：${G.player ? profileOf(G.player).pts : 0}`, 5); } },
  { s: '-CZ', exact: true, fn() {
    const h = G.hero;
    if (!h) return msg('还没有英雄（成长值在建英雄塔时随机）', 5);
    msg(`力量:     ${h.grow.str}`); msg(`敏捷:     ${h.grow.agi}`); msg(`智力:     ${h.grow.int}`);
    if (h.heroName === '妖灵') { const x = h.sk.hx; msg(`普通X=${18 - x}`); msg(`魔法Y=${14 - x}`); msg(`混乱Z=${x + 11}`); }   // 原图这里显示 14-Hx，飞鸟科技实际按 13-Hx 算，照搬
  } },
  { s: '-SC', fn() { msg(`辅助单位总量:${G.towers.length + G.roster.filter(p => p && !p.out).length}`, 10); } },
];
function chatSend(text) {
  text = text.trim(); if (!text) return;
  msg(`[${G.player || '玩家'}]：${text}`, 8);
  const up = text.toUpperCase();
  for (const c of CHAT_CMDS) if (c.exact ? up === c.s : up.includes(c.s)) c.fn();
  uiDirty();
}
const chatBox = $('chat');
function openChat() { chatBox.value = ''; chatBox.classList.remove('hidden'); chatBox.focus(); }
function closeChat() { chatBox.classList.add('hidden'); chatBox.blur(); }
chatBox.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const v = chatBox.value; closeChat(); chatSend(v); }
  else if (e.key === 'Escape') closeChat();
});
chatBox.addEventListener('blur', () => chatBox.classList.add('hidden'));
const keys = new Set();
window.addEventListener('keydown', e => {
  if (!G || !$('modal').classList.contains('hidden')) return;
  if (e.target === chatBox) return;
  if (e.key.startsWith('Arrow')) { keys.add(e.key); e.preventDefault(); return; }
  if (e.key === 'Enter') { e.preventDefault(); openChat(); return; }
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
const profileLine = name => { const p = profileOf(name), t = achTier(p.pts); return `${p.pts} 点 · ${t.name}${p.endless ? ` · 无尽最高 ${p.endless} 分` : ''}${p.honor ? ` · 荣誉 ${p.honor}` : ''} · 开局当局成就 ${RULE.startAch + t.lv + endlessBonus(p.endless || 0)}`; };
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
    { text: '空着（只有你一个玩家）', hint: '只有你一个实际玩家：每 5 秒发金按第 1 名、飞艇奖励和投票都按 1 人算', fn: () => start('origin', n) },
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
    <p><b>商店</b>：地图中央，守卫者走到 ${RULE.shopReach} 范围内选中商店购买：1 个木材（500 金，冷却 30 秒）、10 个木材（5000 金，冷却 300 秒）、魔力卷轴（英雄塔 +120 魔法）、知识之书（英雄塔随机属性 +10）、天赋卷轴（15 木，MAX 光环塔激活基础天赋、全场唯一塔技能 +1 级，开局 1200 秒后开放）。其他 MAX 塔的天赋不用卷轴：守卫者「使用木材 → 激活天赋」直接扣木材（主塔 / 弹跳 / 火速恐惧神力冰封 30、另类塔 / 大辅助 / 巫系 25、原始塔 20、辅助塔 10、超级深渊 50）。三种卷轴买下后放进守卫者的<b>物品栏</b>（6 格），选中守卫者点物品（或小键盘 7 8 4 5 1 2），再点目标塔，守卫者走到施法距离内使用。复制 / 收购卷轴要对队友使用（守卫者 / 允许收购的 1 级光环塔）。商店两边还有<b>宠物商人</b>（左）、<b>守护宗师</b>和<b>许愿商人</b>（右）。物品栏的物品在商店旁边右键可以出售。</p>
    <p><b>宠物</b>：宠物商人卖 11 种宠物（8 当局成就，每人一只），跟着守卫者走、自动攻击，攻击每波提升；选中宠物激活普通天赋（10 木）后，对<b>小精灵</b>（外环外每 100 秒刷一只）用<b>糖果</b>（守护宗师 5 成就 5 个，地上也会掉）可以升级宠物技能。10 波 BOSS 后外环外出现野生宠物，用糖果抓（抓到的记进玩家档案，下局用宠物卷轴召唤）。</p>
    <p><b>许愿</b>：兔子的塔类之球每个 +1 许愿点，出售许愿石（BOSS 掉落）/ 梦 +5，凑齐"马上有梦" +20；在许愿商人那里花 20 许愿点把建造栏的一格换成想要的塔。</p>
    <p><b>守护宗师</b>：兔子卷轴、重置卷轴（重新随机英雄成长值）、宠物卷轴、糖果、赞（48 波后给队友点赞）、投票卷轴（投票踢人：每票 +2，超过在场人数踢出）、绑定卷轴（到达无尽关卡后把这局的主塔绑定到玩家档案）、号令卷轴（20 成就，把建造栏的主塔换成绑定的那种）。每波发金 = 杀敌排行名次 ×8 + 波数 ×2。</p>
    <p><b>兔子</b>：每个 BOSS 波（10/20/30/40 波、最终波）开始 ${RULE.rabbitDelay} 秒后，地图随机位置出现一只兔子（小地图粉点），${RULE.rabbitLife} 秒后消失。守卫者走到它 ${RULE.rabbitReach} 范围内，选中兔子就能用<b>当局成就</b>买道具：4 种塔类之球（重新随机建造栏的某一类塔）、5 个木材、魔法药水（有魔法功勋的塔 +200，天神塔 +600）、知识药水、重修药水（属性选择那项 -6、技能点 +3，每局 1 支）。当局成就开局 ${RULE.startAch} 点（拒绝逃跑）再加账号成就档位 +0~10，每次 Perfect +${RULE.achPerPerfect}；守护宗师的<b>兔子卷轴</b>（${RULE.rabbitScrollAch} 成就）可以额外召唤一次兔子；兔子还卖天赋秘籍（5 成就 + 20 木，MAX 光环至尊天赋 / 唯一塔技能 +2 级，每局 4 个）。</p>
    <p><b>当局成就的其他来源</b>：购买人口 8 次（人口众多）、木材换金币 100 次（我是来换金币的）、死亡之指 20 次（电电更健康）各 +2；
      同时拥有指定组合的塔（升级完成时检查）+10：高速毒塔（加速光环 MAX + 萨满 + 火速 + 毒塔 MAX）、强力群攻（攻击光环 MAX + 兽人 + 3 座群攻塔 MAX）、原始战速团队（箭塔 / 闪电塔 / 通灵塔 MAX）、
      无名（减速光环 MAX + 精灵塔 MAX + 缓速 + 重击塔 MAX）、单杀好像很不错（减防光环 MAX + 腐蚀 / 灵魂 / 混乱塔 MAX）；MAX 主塔技能练满后亲手杀敌 +10：魔幻之巅、至尊剑圣、寒冰王者、神级弹跳、激情扫射、功勋将军、人马首领、疯狂五行、天之风行。
      组合和击杀成就一局最多 2 个，已经拿了组合成就就拿不到击杀成就。最终 BOSS 倒计时时杀敌第一 +5（我是第一），开启无尽 +3（无尽我来了），最后 10 秒杀死龙和魔王并开启无尽 +2（刺激）。</p>
    <p><b>无尽关卡</b>：杀死龙和魔王时按出龙后的秒数加 Perfect 分（≤150 秒 +3、≤250 秒 +2、≤350 秒 +1），Perfect 分 ≥ ${RULE.endlessFp} 就开启无尽关卡，否则直接通关。
      ${RULE.endlessOpen} 秒后第一波，之后每 ${RULE.endlessEvery} 秒一波，每波随机 10 种怪物之一，每个出怪口 ${RULE.endlessCount} 只，每波生命 +25%（积分 1 万、1.5 万后涨得更快）；怪物上限降到每人 ${RULE.endlessCap}，守卫者失去随机建造、使用木材、死亡之指和守护神技，塔类之球不能买。
      无尽不能通关，怪数超过上限时结束，按无尽积分（杀怪 +4、每波按空位加分）结算。玩家档案记下无尽最高分，下局开局多给当局成就（≥1 +2、≥5000 +4、≥1 万 +6、≥1.5 万 +8、≥2 万 +10 …… ≥2.5 万 +15）。</p>
    <p><b>英雄塔</b>：每次随机建造给出 1 个英雄塔（和原图随机模式一样），1500 金 + 5 木材 + 4 人口，还要 <b>${RULE.heroAch} 点当局成就</b>（建成扣掉），全场唯一，建造后不能回收。建成时随机给出力量 / 敏捷 / 智力的成长值（合计 10），每次升级按成长值加属性；属性选择决定杀精英怪 +1 的属性和满级后升级 +3 的属性。升级要 等级×100 金 + 200 魔法（英雄每击杀 +2 魔法）。学技能：第 1 个免费；第 2/3/4 个分别要 18/36/54 木材，且力量 ≥ 80/160/240，最多 4 个（第 5 个特殊技能有额外条件）。英雄有技能点：建成 3 点、每升一级 3~9 点，每点力量 / 敏捷 / 智力 +2 或随机。
      随机建造在原图随机模式的 17 个英雄里抽，原图的主动技能都是攻击时自动放。</p>
    <p><b>荣誉光环</b>：光环格随机的第 5 种（光环之球换不到），10000 金、只有 1 级。身上有攻击 / 减防 / 减速 / 速度 4 个光环，等级在随机建造后各自随机 1~8 级（6%~20%，减防 6~20 点），可以和任意光环叠加。队友用收购卷轴买它要付 10000 金。</p>
    <p><b>神塔</b>：建造栏第 8 格，每次随机建造从驱魔 / 树妖 / 暗牧 / 海妖 / 猎人 / 圣灵塔里抽 1 座。全场唯一：任何玩家建了之后所有人都不能再建，回收也不返还建造处，要等下次随机建造（而且全场没人有这座时才放开）。
      驱魔塔（手动，晕眩 6 秒并遣返到随机出怪口）、树妖塔（纠缠，树妖箭每次永久 -20 护甲）、暗牧塔（自动减速，第 9 次起扣目标 12% 当前生命）、海妖塔（8 秒一次对精英 / 无尽怪物 200 万伤害，杀精英 +200 攻击）、
      猎人塔（手动，捕获一个敌人为你战斗 600 秒）、圣灵塔（霜冻减速，3 秒一次往出怪口派圣灵，圣灵被杀时纠缠附近敌人 3 秒）。</p>
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
newGame('rookie');
showStart();
requestAnimationFrame(frame);
window.__G = () => G;   // 调试用
window.__dbg = { get G() { return G; }, NODES, EDGES, kill, hurt, spawnMonster, FXS, buildTower, upgradeTower, learnSkill, heroLevelUp, step, canPlace, newGame, monstersAlive, towerStats, rerollBuild, orderBuild, orderMove, castSkill, spawnRabbit, buyRabbit, RABBIT_SHOP, makePet, spawnWisp, spawnWildPet, dropItem, invAdd, ITEMS, startVote, kickPlayer, giveLike, netReceive, MASTER_ITEMS, PET_ITEMS, wishBuy, petTalent, MASTER, WISHER, PETSHOP, buyItem, critterTick, sellItem, pickUp, candyWild, renderCmds, SHOP, SHOP_ITEMS, buyShop, orderFinger, KITS, towerAS, towerAtk, effArmor, applyAuras, sellTower, select, hurt, buildCmds, newTower, attack, bounceXfer, spendPoint, upSkill, wujiSacrifice, plantAncient, knWard, heroStats, HERO_KITS, HERO_DEF, heroAuraList, gateSpots, spawnAt, cap, playerLeft, startFinal, GATES, monsterAttacked, monsterDied, attackDmg, activateTalent, talentWhy, talentOf, orderTalent, TALENTS, primalMaxHit };
})();
