/* 弹道与命中特效：每种塔按自己的属性有专门的弹道（飞行物、拖尾粒子、命中效果）。
 * 世界坐标 x / y（地面，y 朝上）+ z（离地高度，世界单位）。屏幕上高度按 ZK 压缩（50° 俯视的正交相机）。
 *   const F = FX.create();
 *   F.launch(style, from, target, onHit, opt)   // 发射；from = {x, y, z}；target 是怪物对象（会追踪），死了就飞到最后位置
 *   F.instant(style, from, target)              // 瞬间命中类（闪电、圣光）只画特效，伤害由调用方当场结算
 *   F.update(dt)；F.draw(ctx, view)              // view = { W, H, S, cx, cy }
 */
window.FX = (() => {
'use strict';
const ZK = 0.64;                       // 1 个高度单位在屏幕上等于 0.64 个地面单位（cos 50°）
const MAX_PART = 1800, MAX_PROJ = 600;
const SIZE = 1.7, PSIZE = 1.4;          // 弹体 / 粒子整体放大（在正常镜头距离下要看得清）
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// 发光贴图缓存（白芯 → 颜色 → 透明），用 lighter 叠加
const GLOW = {};
function glow(color) {
  if (GLOW[color]) return GLOW[color];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(0.45, color + '88'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (GLOW[color] = c);
}
// 烟雾贴图（灰色软圆）
const SMOKE = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();

// ---------------------------------------------------------------- 形状（在弹体本地坐标里画，+x = 飞行方向，单位 = 世界单位 × S）
const SHAPES = {
  dagger(g, k, c) {           // 发光匕首
    g.fillStyle = c.light; g.beginPath(); g.moveTo(26 * k, 0); g.lineTo(-4 * k, -5 * k); g.lineTo(-4 * k, 5 * k); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(20 * k, 0); g.lineTo(0, -1.8 * k); g.lineTo(0, 1.8 * k); g.closePath(); g.fill();
    g.fillStyle = '#5a3a1a'; g.fillRect(-14 * k, -2.5 * k, 10 * k, 5 * k); g.fillStyle = c.dark; g.fillRect(-5 * k, -8 * k, 3 * k, 16 * k);
  },
  arrow(g, k, c) {
    g.strokeStyle = '#6b4a24'; g.lineWidth = Math.max(1, 2.2 * k); g.beginPath(); g.moveTo(-26 * k, 0); g.lineTo(18 * k, 0); g.stroke();
    g.fillStyle = '#d9d9d9'; g.beginPath(); g.moveTo(28 * k, 0); g.lineTo(16 * k, -5 * k); g.lineTo(16 * k, 5 * k); g.closePath(); g.fill();
    g.fillStyle = c.light; g.beginPath(); g.moveTo(-26 * k, 0); g.lineTo(-34 * k, -6 * k); g.lineTo(-20 * k, 0); g.lineTo(-34 * k, 6 * k); g.closePath(); g.fill();
  },
  bolt(g, k, c) {             // 巨箭：粗弩箭
    g.strokeStyle = '#4a3216'; g.lineWidth = Math.max(1.5, 5 * k); g.beginPath(); g.moveTo(-50 * k, 0); g.lineTo(30 * k, 0); g.stroke();
    g.fillStyle = c.light; g.beginPath(); g.moveTo(48 * k, 0); g.lineTo(26 * k, -10 * k); g.lineTo(30 * k, 0); g.lineTo(26 * k, 10 * k); g.closePath(); g.fill();
    g.fillStyle = '#c33'; g.beginPath(); g.moveTo(-50 * k, 0); g.lineTo(-62 * k, -10 * k); g.lineTo(-40 * k, 0); g.lineTo(-62 * k, 10 * k); g.closePath(); g.fill();
  },
  spear(g, k, c) {            // 冰枪
    g.fillStyle = c.dark; g.beginPath(); g.moveTo(44 * k, 0); g.lineTo(-30 * k, -6 * k); g.lineTo(-38 * k, 0); g.lineTo(-30 * k, 6 * k); g.closePath(); g.fill();
    g.fillStyle = c.light; g.beginPath(); g.moveTo(44 * k, 0); g.lineTo(-20 * k, -2.5 * k); g.lineTo(-20 * k, 2.5 * k); g.closePath(); g.fill();
  },
  axe(g, k, c, spin) {        // 旋转飞斧
    g.rotate(spin);
    g.strokeStyle = '#5a3a1a'; g.lineWidth = Math.max(1, 3 * k); g.beginPath(); g.moveTo(-16 * k, 0); g.lineTo(16 * k, 0); g.stroke();
    g.fillStyle = c.light; g.beginPath(); g.moveTo(10 * k, -3 * k); g.quadraticCurveTo(26 * k, -16 * k, 18 * k, -20 * k); g.lineTo(6 * k, -4 * k); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(10 * k, 3 * k); g.quadraticCurveTo(26 * k, 16 * k, 18 * k, 20 * k); g.lineTo(6 * k, 4 * k); g.closePath(); g.fill();
  },
  hammer(g, k, c, spin) {     // 风暴之锤
    g.rotate(spin);
    g.strokeStyle = '#5a3a1a'; g.lineWidth = Math.max(1, 3.2 * k); g.beginPath(); g.moveTo(-16 * k, 0); g.lineTo(10 * k, 0); g.stroke();
    g.fillStyle = c.light; g.fillRect(8 * k, -11 * k, 12 * k, 22 * k); g.fillStyle = c.dark; g.fillRect(8 * k, -11 * k, 3 * k, 22 * k);
  },
  glaive(g, k, c, spin) {     // 月刃：三叶旋转
    g.rotate(spin); g.fillStyle = c.light;
    for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14 * k, -16 * k, 24 * k, -2 * k); g.quadraticCurveTo(12 * k, -4 * k, 0, 0); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 4 * k, 0, TAU); g.fill();
  },
  crescent(g, k, c) {         // 剑气（月牙）
    g.fillStyle = c.light; g.beginPath(); g.arc(0, 0, 22 * k, -1.3, 1.3); g.arc(-8 * k, 0, 18 * k, 1.1, -1.1, true); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 21 * k, -1.0, 1.0); g.arc(-4 * k, 0, 19 * k, 0.9, -0.9, true); g.closePath(); g.fill();
  },
  rocket(g, k, c) {
    g.fillStyle = '#c8c0b0'; g.fillRect(-14 * k, -4 * k, 26 * k, 8 * k);
    g.fillStyle = '#d33'; g.beginPath(); g.moveTo(20 * k, 0); g.lineTo(12 * k, -4 * k); g.lineTo(12 * k, 4 * k); g.closePath(); g.fill();
    g.fillStyle = '#933'; g.beginPath(); g.moveTo(-14 * k, -4 * k); g.lineTo(-20 * k, -9 * k); g.lineTo(-10 * k, -4 * k); g.moveTo(-14 * k, 4 * k); g.lineTo(-20 * k, 9 * k); g.lineTo(-10 * k, 4 * k); g.fill();
  },
  skull(g, k, c) {            // 幽魂骷髅
    g.fillStyle = c.light; g.beginPath(); g.arc(0, -2 * k, 11 * k, 0, TAU); g.fill(); g.fillRect(-6 * k, 4 * k, 12 * k, 7 * k);
    g.fillStyle = c.dark; g.beginPath(); g.arc(-4 * k, -2 * k, 3 * k, 0, TAU); g.arc(4 * k, -2 * k, 3 * k, 0, TAU); g.fill();
  },
};

// ---------------------------------------------------------------- 弹道风格
// speed：世界单位/秒；arc：抛物线最高点额外高度；core：发光核心（颜色、大小）；shape：形状；spin：旋转速度；
// trail(emit, p)：每帧拖尾；impact(F, x, y, z)：命中效果；wobble：左右摆动幅度；curve：出膛时侧向弯曲
const C = (light, dark) => ({ light, dark });
const STYLES = {
  arcaneDagger: { speed: 1500, shape: 'dagger', col: C('#9dffb0', '#2f8f45'), core: ['#3dff6a', 26], spin: 0,
    trail: (F, p) => F.glowP(p, '#4dff7a', 14, 0.25, 0.3), impact: (F, x, y, z) => { F.sparks(x, y, z, '#6dff8a', 12, 260); F.ring(x, y, 70, '#6dff8a', 0.25); } },
  frostBolt: { speed: 1100, core: ['#7fd8ff', 34], inner: ['#e8fbff', 12],
    trail: (F, p) => { F.glowP(p, '#7fd8ff', 22, 0.35, 0.25); if (Math.random() < 0.35) F.shard(p.x, p.y, p.z, '#e8fbff'); },
    impact: (F, x, y, z) => { F.snow(x, y, z); F.ring(x, y, 110, '#bff4ff', 0.3); F.flash(x, y, z, '#9fe3ff', 70) } },
  soulWisp: { speed: 800, core: ['#c48bff', 30], shape: 'skull', col: C('#f2e6ff', '#3a1660'), wobble: 26,
    trail: (F, p) => { F.glowP(p, '#a066ff', 20, 0.45, 0.3, 40); },
    impact: (F, x, y, z) => { F.flash(x, y, z, '#c48bff', 90); F.souls(x, y, z, '#c48bff'); F.ring(x, y, 90, '#c48bff', 0.3); } },
  arrow: { speed: 1900, arc: 60, shape: 'arrow', col: C('#ffffff', '#888'), impact: (F, x, y, z) => F.dust(x, y, '#b0a080', 4) },
  ballista: { speed: 2100, arc: 30, shape: 'bolt', col: C('#ffd257', '#7a5a14'), trail: (F, p) => F.glowP(p, '#ffd257', 10, 0.15, 0.2),
    impact: (F, x, y, z) => { F.sparks(x, y, z, '#ffd257', 14, 320); F.dust(x, y, '#a08860', 8); F.ring(x, y, 90, '#ffd257', 0.25); } },
  poison: { speed: 850, arc: 160, core: ['#7bdc3a', 9], ball: ['#3f9a1e', 9],
    trail: (F, p) => { if (Math.random() < 0.6) F.drop(p.x, p.y, p.z, '#5fbf2a'); },
    impact: (F, x, y, z) => { F.splat(x, y, '#5fbf2a'); F.bubbles(x, y, '#9cff5a'); } },
  acid: { speed: 1000, arc: 80, core: ['#d6ff3a', 22], inner: ['#ffffc0', 8],
    trail: (F, p) => { F.glowP(p, '#c8ff3a', 12, 0.3, 0.2); if (Math.random() < 0.3) F.smoke(p.x, p.y, p.z, '#9aaa40', 0.5, 16); },
    impact: (F, x, y, z) => { F.splat(x, y, '#b8e030'); for (let i = 0; i < 4; i++) F.smoke(x + rnd(-30, 30), y + rnd(-30, 30), 10, '#b0c050', 0.9, 30); } },
  cannon: { speed: 900, arc: 260, ball: ['#222', 13],
    trail: (F, p) => { if (Math.random() < 0.5) F.smoke(p.x, p.y, p.z, '#999', 0.6, 14); },
    impact: (F, x, y, z) => F.explosion(x, y, 1) },
  boulder: { speed: 800, arc: 220, ball: ['#7a6040', 18], spin: 6,
    impact: (F, x, y, z) => { F.dust(x, y, '#9a7a50', 16); F.ring(x, y, 280, '#c8a070', 0.35, 6); F.debris(x, y, '#6a5030'); } },
  iceSpear: { speed: 1700, shape: 'spear', col: C('#ffffff', '#59c7ff'), core: ['#59c7ff', 22],
    trail: (F, p) => { F.glowP(p, '#9fe3ff', 14, 0.25, 0.2); if (Math.random() < 0.5) F.shard(p.x, p.y, p.z, '#ffffff'); },
    impact: (F, x, y, z) => { F.snow(x, y, z, 1.4); F.ring(x, y, 300, '#9fe3ff', 0.35, 5); } },
  holy: { speed: 1300, core: ['#ffe27a', 34], inner: ['#ffffff', 14], rays: '#fff2b0',
    trail: (F, p) => F.glowP(p, '#ffe27a', 18, 0.3, 0.25),
    impact: (F, x, y, z) => { F.pillar(x, y, '#ffe9a0'); F.sparks(x, y, z, '#fff2b0', 10, 240); } },
  windSlash: { speed: 1600, shape: 'crescent', col: C('#bff4ff', '#4a9ab0'), core: ['#9fe3ff', 18], afterimage: true,
    impact: (F, x, y, z) => { F.slash(x, y, z, '#dff8ff'); } },
  necro: { speed: 1000, core: ['#3dff9a', 26], inner: ['#002a10', 9], shape: 'skull', col: C('#c8ffd8', '#0a2a14'),
    trail: (F, p) => { F.smoke(p.x, p.y, p.z, '#1a3a20', 0.6, 18); F.glowP(p, '#3dff9a', 10, 0.2, 0.2); },
    impact: (F, x, y, z) => { F.flash(x, y, z, '#3dff9a', 80); F.souls(x, y, z, '#6dffb0'); } },
  chaosOrb: { speed: 1050, core: ['#ff4a8a', 30], inner: ['#2a0018', 10], orbit: '#c48bff',
    trail: (F, p) => F.glowP(p, '#c44bff', 16, 0.35, 0.25),
    impact: (F, x, y, z) => { F.flash(x, y, z, '#ff4a8a', 100); F.sparks(x, y, z, '#c48bff', 14, 300); F.ring(x, y, 120, '#ff6ab0', 0.3); } },
  arcaneMissile: { speed: 1150, core: ['#ff7aff', 18], inner: ['#ffffff', 6], curve: 260,
    trail: (F, p) => F.glowP(p, '#d070ff', 12, 0.35, 0.25),
    impact: (F, x, y, z) => { F.sparks(x, y, z, '#ff9aff', 8, 220); F.flash(x, y, z, '#d070ff', 50); } },
  thrownAxe: { speed: 1250, arc: 70, shape: 'axe', col: C('#d0d0d0', '#555'), spin: 18, impact: (F, x, y, z) => F.sparks(x, y, z, '#ffffff', 8, 260) },
  stormHammer: { speed: 1300, shape: 'hammer', col: C('#e8e8f0', '#6a6a80'), spin: 16, core: ['#7ab8ff', 22],
    trail: (F, p) => F.glowP(p, '#7ab8ff', 12, 0.25, 0.2),
    impact: (F, x, y, z) => { F.zap(x, y, z, '#bfe0ff'); F.ring(x, y, 80, '#7ab8ff', 0.25); } },
  elemOrb: { speed: 1100, core: ['#5aa8ff', 26], inner: ['#ffffff', 9], crackle: '#bfe0ff',
    trail: (F, p) => F.glowP(p, '#5aa8ff', 14, 0.3, 0.25),
    impact: (F, x, y, z) => { F.zap(x, y, z, '#bfe0ff'); F.flash(x, y, z, '#5aa8ff', 70); } },
  wisp: { speed: 950, core: ['#c8ffe0', 26], inner: ['#ffffff', 9], wobble: 34, curve: 160,
    trail: (F, p) => F.glowP(p, '#9fffd0', 14, 0.5, 0.3, 30),
    impact: (F, x, y, z) => { F.flash(x, y, z, '#c8ffe0', 70); F.sparks(x, y, z, '#e8fff0', 10, 200); } },
  rocket: { speed: 1100, arc: 140, shape: 'rocket', col: C('#fff', '#888'), curve: 120,
    trail: (F, p) => { F.smoke(p.x, p.y, p.z, '#bbb', 0.8, 16); F.glowP(p, '#ffaa33', 10, 0.12, 0.15); },
    impact: (F, x, y, z) => F.explosion(x, y, 0.7) },
  moonGlaive: { speed: 1400, shape: 'glaive', col: C('#dff8ff', '#5a8aa0'), spin: 22, core: ['#9fe3ff', 18],
    trail: (F, p) => F.glowP(p, '#bfefff', 10, 0.2, 0.2), impact: (F, x, y, z) => F.sparks(x, y, z, '#dff8ff', 8, 240) },
  bullet: { speed: 3200, tracer: '#fff2a0', impact: (F, x, y, z) => { F.sparks(x, y, z, '#ffd257', 6, 260); F.flash(x, y, z, '#ffcc66', 40); } },
  fireball: { speed: 1000, core: ['#ff8a3c', 32], inner: ['#fff0a0', 12],
    trail: (F, p) => { F.glowP(p, '#ff6a2a', 20, 0.35, 0.3, 30); if (Math.random() < 0.4) F.smoke(p.x, p.y, p.z, '#553', 0.7, 16); },
    impact: (F, x, y, z) => { F.explosion(x, y, 0.6, '#ff8a3c'); } },
  // 瞬间命中
  lightning: { instant: true, color: '#7ab8ff', core: '#ffffff', width: 1 },
  holyBeam: { instant: true, beam: '#ffe9a0' },
};

function create() {
  const P = [], parts = [], fxs = [];          // 弹体、粒子、一次性特效（闪电、光柱、冲击波……）
  const F = {};

  // ------------------------------ 粒子
  function part(o) { if (parts.length < MAX_PART) parts.push(Object.assign({ vx: 0, vy: 0, vz: 0, g: 0, drag: 0, t: 0, add: true }, o)); }
  F.glowP = (p, color, size, life, spread = 0.2, rise = 0) => part({ x: p.x + rnd(-6, 6), y: p.y + rnd(-6, 6), z: p.z, vz: rise, life, max: life, size, color, kind: 'glow', drag: 2 });
  F.sparks = (x, y, z, color, n, sp) => { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(0.4, 1) * sp; part({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(50, 260), g: 700, life: rnd(0.25, 0.5), max: 0.5, size: rnd(6, 10), color, kind: 'spark', drag: 2 }); } };
  F.shard = (x, y, z, color) => part({ x, y, z, vx: rnd(-40, 40), vy: rnd(-40, 40), vz: rnd(-20, 40), g: 400, life: 0.5, max: 0.5, size: 5, color, kind: 'shard', spin: rnd(-8, 8), add: false });
  F.drop = (x, y, z, color) => part({ x, y, z, vz: -50, g: 600, life: 0.45, max: 0.45, size: 4, color, kind: 'dot', add: false });
  F.smoke = (x, y, z, color, life, size) => part({ x, y, z, vx: rnd(-15, 15), vy: rnd(-15, 15), vz: rnd(20, 60), life, max: life, size, grow: 2.2, color, kind: 'smoke', add: false });
  F.dust = (x, y, color, n) => { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(60, 200); part({ x, y, z: 5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(10, 60), life: rnd(0.4, 0.8), max: 0.8, size: rnd(14, 26), grow: 1.5, color, kind: 'smoke', add: false, drag: 3 }); } };
  F.debris = (x, y, color) => { for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), v = rnd(100, 260); part({ x, y, z: 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(150, 350), g: 900, life: 0.6, max: 0.6, size: rnd(5, 9), color, kind: 'dot', add: false }); } };
  F.bubbles = (x, y, color) => { for (let i = 0; i < 6; i++) part({ x: x + rnd(-40, 40), y: y + rnd(-40, 40), z: 0, vz: rnd(40, 90), life: rnd(0.5, 0.9), max: 0.9, size: rnd(4, 8), color, kind: 'bubble', add: false }); };
  F.souls = (x, y, z, color) => { for (let i = 0; i < 5; i++) part({ x: x + rnd(-30, 30), y: y + rnd(-30, 30), z, vz: rnd(120, 220), vx: rnd(-30, 30), life: rnd(0.5, 0.9), max: 0.9, size: rnd(16, 24), color, kind: 'glow', drag: 1 }); };
  F.snow = (x, y, z, k = 1) => {
    for (let i = 0; i < 10 * k; i++) { const a = rnd(0, TAU), v = rnd(80, 260) * k; part({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(40, 180), g: 500, life: rnd(0.4, 0.7), max: 0.7, size: rnd(5, 8), color: '#e8fbff', kind: 'shard', spin: rnd(-10, 10), add: false, drag: 2 }); }
    F.flash(x, y, z, '#bff4ff', 80 * k);
  };

  // ------------------------------ 一次性特效
  F.ring = (x, y, r, color, life = 0.3, w = 3) => fxs.push({ k: 'ring', x, y, r, color, life, max: life, w });
  F.flash = (x, y, z, color, r) => fxs.push({ k: 'flash', x, y, z, color, r, life: 0.18, max: 0.18 });
  F.splat = (x, y, color) => fxs.push({ k: 'splat', x, y, color, life: 1.6, max: 1.6, seed: Math.random() * 1000 });
  F.pillar = (x, y, color) => fxs.push({ k: 'pillar', x, y, color, life: 0.45, max: 0.45 });
  F.slash = (x, y, z, color) => fxs.push({ k: 'slash', x, y, z, color, life: 0.22, max: 0.22, a: rnd(0, Math.PI) });
  F.zap = (x, y, z, color) => { for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), l = rnd(40, 90); fxs.push({ k: 'bolt', x1: x, y1: y, z1: z, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, z2: z + rnd(-30, 30), color, life: 0.15, max: 0.15, w: 0.6 }); } };
  F.explosion = (x, y, k = 1, color = '#ffaa33') => {
    F.flash(x, y, 30, color, 160 * k); F.ring(x, y, 220 * k, '#ffcc66', 0.3, 4);
    for (let i = 0; i < 10 * k; i++) { const a = rnd(0, TAU), v = rnd(60, 220) * k; part({ x, y, z: 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(40, 160), life: rnd(0.25, 0.45), max: 0.45, size: rnd(26, 40) * k, color: i % 2 ? '#ff7a2a' : '#ffd060', kind: 'glow', drag: 3 }); }
    for (let i = 0; i < 8 * k; i++) F.smoke(x + rnd(-50, 50) * k, y + rnd(-50, 50) * k, rnd(10, 50), '#555', rnd(0.7, 1.2), rnd(30, 50) * k);
    F.sparks(x, y, 30, '#ffd060', 10 * k, 380 * k);
  };
  // 从天上砸下来的东西（冰雹、陨石）：斜着落下，带拖尾，落地时调用 onEnd(F, x, y)
  F.fall = (x, y, o = {}) => fxs.push({ k: 'fall', x, y, z0: o.z || 700, dx: o.dx ?? -260, dy: o.dy ?? 120, color: o.color || '#bff4ff', core: o.core || '#ffffff',
    size: o.size || 24, life: o.dur || 0.35, max: o.dur || 0.35, onEnd: o.onEnd, rock: o.rock });
  // 贴地扩散的冲击波（实心渐变圆盘 + 亮边），比 ring 更有分量
  F.nova = (x, y, r, color, life = 0.45) => fxs.push({ k: 'nova', x, y, r, color, life, max: life });
  F.beam = (x1, y1, z1, x2, y2, z2, color, w = 1, life = 0.1) => fxs.push({ k: 'beam', x1, y1, z1, x2, y2, z2, color, w, life, max: life });

  // ------------------------------ 发射
  F.launch = (style, from, target, onHit, opt = {}) => {
    const st = STYLES[style] || STYLES.arcaneDagger;
    const tz = opt.tz ?? 50;
    if (st.instant) { F.instant(style, from, target, tz); if (onHit) onHit(target); return; }
    if (P.length >= MAX_PROJ) { if (onHit) onHit(target); return; }        // 太多弹体时直接结算，不丢伤害
    const dx = target.x - from.x, dy = target.y - from.y, d0 = Math.max(1, Math.hypot(dx, dy));
    const side = st.curve ? rnd(-1, 1) * st.curve : 0;
    P.push({ st, x: from.x, y: from.y, z: from.z, x0: from.x, y0: from.y, z0: from.z, target, tx: target.x, ty: target.y, tz,
      d0, prog: 0, onHit, t: 0, side, ph: rnd(0, TAU), ang: Math.atan2(dy, dx), scale: opt.scale || 1, hist: [] });
  };
  F.instant = (style, from, target, tz = 50) => {
    const st = STYLES[style];
    if (st.beam) {      // 圣光：天上落下的光柱 + 塔到目标的金线
      F.pillar(target.x, target.y, st.beam); F.beam(from.x, from.y, from.z, target.x, target.y, tz, st.beam, 1.2, 0.14);
      F.sparks(target.x, target.y, tz, '#fff2b0', 8, 220); return;
    }
    fxs.push({ k: 'bolt', x1: from.x, y1: from.y, z1: from.z, x2: target.x, y2: target.y, z2: tz, color: st.color, life: 0.2, max: 0.2, w: st.width });
    F.flash(target.x, target.y, tz, st.color, 70); F.sparks(target.x, target.y, tz, '#dff0ff', 7, 260);
    F.flash(from.x, from.y, from.z, st.color, 50);
  };

  // ------------------------------ 更新
  F.update = dt => {
    for (const p of P) {
      p.t += dt;
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      // 进度 = 已飞路程 /（已飞 + 剩余），目标移动时也能平滑追上
      const rem = Math.hypot(p.tx - p.x, p.ty - p.y), step = p.st.speed * dt;
      const k = rem <= step ? 1 : step / rem;
      const nx = p.x + (p.tx - p.x) * k, ny = p.y + (p.ty - p.y) * k;
      p.trav = (p.trav || 0) + Math.min(step, rem);
      const pr = p.prog = rem <= step ? 1 : p.trav / (p.trav + rem - step);
      // 侧向弯曲（魔法飞弹、小精灵）：中途偏出去，快到时收回
      const perp = p.side * Math.sin(Math.PI * pr), ux = -(p.ty - p.y0), uy = p.tx - p.x0, ul = Math.hypot(ux, uy) || 1;
      const wob = p.st.wobble ? Math.sin(p.t * 14 + p.ph) * p.st.wobble : 0;
      const px = p.x, py = p.y;
      p.x = nx; p.y = ny;
      p.rx = p.x + (ux / ul) * (perp + wob); p.ry = p.y + (uy / ul) * (perp + wob);
      p.z = p.z0 + (p.tz - p.z0) * pr + (p.st.arc || 0) * 4 * pr * (1 - pr);
      const vz = (p.tz - p.z0) + (p.st.arc || 0) * 4 * (1 - 2 * pr);
      p.ang = Math.atan2(p.y - py, p.x - px) || p.ang;
      p.pitch = Math.atan2(vz * ZK, p.d0);
      if (p.st.afterimage || p.st.tracer) { p.hist.push([p.rx, p.ry, p.z]); if (p.hist.length > 5) p.hist.shift(); }
      if (p.st.trail) p.st.trail(F, { x: p.rx, y: p.ry, z: p.z });
      if (rem <= step) {
        p.done = true;
        if (p.st.impact) p.st.impact(F, p.tx, p.ty, p.tz);
        if (p.onHit) p.onHit(p.target && !p.target.dead ? p.target : null, p.tx, p.ty);
      }
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].done) P.splice(i, 1);
    for (const q of parts) {
      q.t += dt; q.life -= dt;
      const dr = Math.max(0, 1 - q.drag * dt);
      q.vx *= dr; q.vy *= dr; q.vz -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z = Math.max(0, q.z + q.vz * dt);
      if (q.grow) q.size *= 1 + (q.grow - 1) * dt;
    }
    let j = 0; for (const q of parts) if (q.life > 0) parts[j++] = q; parts.length = j;
    for (const f of fxs) { f.life -= dt; if (f.k === 'fall' && f.life <= 0 && f.onEnd) { const cb = f.onEnd; f.onEnd = null; cb(F, f.x, f.y); } if (f.k === 'bolt' && (f.jt = (f.jt || 0) - dt) <= 0) { f.jt = 0.04; f.pts = null; } }
    j = 0; for (const f of fxs) if (f.life > 0) fxs[j++] = f; fxs.length = j;
  };
  F.clear = () => { P.length = 0; parts.length = 0; fxs.length = 0; };
  F.count = () => ({ proj: P.length, parts: parts.length, fx: fxs.length });

  // ------------------------------ 绘制
  F.draw = (g, v) => {
    const S = v.S, X = x => v.W / 2 + (x - v.cx) * S, Y = (y, z = 0) => v.H / 2 - (y - v.cy) * S - z * ZK * S;
    const onScreen = (x, y) => Math.abs(x - v.cx) * S < v.W / 2 + 200 && Math.abs(y - v.cy) * S < v.H / 2 + 300;
    // 地面类：溅射斑、冲击波
    for (const f of fxs) {
      const a = f.life / f.max;
      if (f.k === 'splat') {
        g.globalAlpha = Math.min(1, a * 1.5) * 0.7; g.fillStyle = f.color;
        let s = f.seed; const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        g.beginPath(); g.ellipse(X(f.x), Y(f.y), 60 * S, 34 * S, 0, 0, TAU); g.fill();
        for (let i = 0; i < 6; i++) { const an = rr() * TAU, d = (50 + rr() * 40) * S; g.beginPath(); g.ellipse(X(f.x) + Math.cos(an) * d, Y(f.y) + Math.sin(an) * d * 0.55, (8 + rr() * 10) * S, (5 + rr() * 6) * S, 0, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      } else if (f.k === 'nova') {
        const k = 1 - a, r = f.r * (0.25 + 0.75 * Math.sqrt(k)) * S, x = X(f.x), y = Y(f.y);
        const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
        gr.addColorStop(0, f.color + '00'); gr.addColorStop(0.75, f.color + '44'); gr.addColorStop(0.95, f.color + 'cc'); gr.addColorStop(1, f.color + '00');
        g.globalAlpha = Math.min(1, a * 1.6); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
      } else if (f.k === 'ring') {
        const r = f.r * (1 - a * 0.65) * S;
        g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = Math.max(1.5, f.w * S * 4 * a + 1);
        g.beginPath(); g.ellipse(X(f.x), Y(f.y), r, r * 0.62, 0, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
    }
    // 弹体的地面阴影（抛物线类才明显）
    g.fillStyle = 'rgba(0,0,0,.28)';
    for (const p of P) if ((p.st.arc || p.st.ball) && onScreen(p.rx, p.ry)) { g.beginPath(); g.ellipse(X(p.rx), Y(p.ry), 12 * S * p.scale * SIZE + 1, 6 * S * p.scale * SIZE + 0.5, 0, 0, TAU); g.fill(); }
    // 非发光粒子（烟、水滴、冰屑）
    for (const q of parts) if (!q.add && onScreen(q.x, q.y)) {
      const a = Math.max(0, q.life / q.max), sx = X(q.x), sy = Y(q.y, q.z), s = q.size * S * PSIZE;
      if (q.kind === 'smoke') { g.globalAlpha = a * 0.45; g.drawImage(tint(SMOKE, q.color), sx - s, sy - s, s * 2, s * 2); }
      else if (q.kind === 'shard') { g.globalAlpha = a; g.fillStyle = q.color; g.save(); g.translate(sx, sy); g.rotate(q.t * (q.spin || 0)); g.fillRect(-s / 2, -s / 5, s, s / 2.5); g.restore(); }
      else if (q.kind === 'bubble') { g.globalAlpha = a; g.strokeStyle = q.color; g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, s, 0, TAU); g.stroke(); }
      else { g.globalAlpha = a; g.fillStyle = q.color; g.beginPath(); g.arc(sx, sy, Math.max(0.8, s * 0.5), 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
    // 弹体
    for (const p of P) {
      if (!onScreen(p.rx, p.ry)) continue;
      const st = p.st, sx = X(p.rx), sy = Y(p.ry, p.z), k = S * p.scale * SIZE;
      const ang = Math.atan2(-Math.sin(p.ang) - Math.sin(p.pitch || 0) * 0.6, Math.cos(p.ang));   // 屏幕上的朝向（y 翻转 + 抛物线俯仰）
      if (st.tracer && p.hist.length) {             // 子弹：亮色曳光
        const [hx, hy, hz] = p.hist[0]; g.globalCompositeOperation = 'lighter';
        g.strokeStyle = st.tracer; g.lineWidth = Math.max(1.5, 4 * k); g.lineCap = 'round';
        g.beginPath(); g.moveTo(X(hx), Y(hy, hz)); g.lineTo(sx, sy); g.stroke(); g.globalCompositeOperation = 'source-over'; continue;
      }
      if (st.afterimage) {                          // 剑气残影
        p.hist.forEach(([hx, hy, hz], i) => { g.globalAlpha = (i + 1) / (p.hist.length + 1) * 0.35; g.save(); g.translate(X(hx), Y(hy, hz)); g.rotate(ang); SHAPES[st.shape](g, k * 1.4, st.col); g.restore(); });
        g.globalAlpha = 1;
      }
      if (st.core) { g.globalCompositeOperation = 'lighter'; const r = st.core[1] * k * (1 + 0.12 * Math.sin(p.t * 30)); g.drawImage(glow(st.core[0]), sx - r * 1.6, sy - r * 1.6, r * 3.2, r * 3.2); g.globalCompositeOperation = 'source-over'; }
      if (st.rays) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = st.rays; g.lineWidth = Math.max(1, 2 * k); g.globalAlpha = 0.6;
        for (let i = 0; i < 6; i++) { const a2 = p.t * 6 + i * TAU / 6; g.beginPath(); g.moveTo(sx + Math.cos(a2) * 10 * k, sy + Math.sin(a2) * 10 * k); g.lineTo(sx + Math.cos(a2) * 26 * k, sy + Math.sin(a2) * 26 * k); g.stroke(); }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      if (st.orbit) { g.fillStyle = st.orbit; for (let i = 0; i < 3; i++) { const a2 = p.t * 12 + i * TAU / 3; g.beginPath(); g.arc(sx + Math.cos(a2) * 16 * k, sy + Math.sin(a2) * 9 * k, Math.max(1, 3.5 * k), 0, TAU); g.fill(); } }
      if (st.crackle && Math.random() < 0.5) { g.strokeStyle = st.crackle; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); for (let i = 0; i < 3; i++) g.lineTo(sx + rnd(-22, 22) * k, sy + rnd(-22, 22) * k); g.stroke(); }
      if (st.inner) { const r = st.inner[1] * k; g.fillStyle = st.inner[0]; g.beginPath(); g.arc(sx, sy, Math.max(1.2, r), 0, TAU); g.fill(); }
      if (st.ball) { const r = st.ball[1] * k; g.fillStyle = st.ball[0]; g.beginPath(); g.arc(sx, sy, Math.max(1.5, r), 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(sx - r * 0.35, sy - r * 0.35, Math.max(0.6, r * 0.35), 0, TAU); g.fill(); }
      if (st.shape) { g.save(); g.translate(sx, sy); g.rotate(ang); SHAPES[st.shape](g, k, st.col, p.t * (st.spin || 0)); g.restore(); }
    }
    // 发光粒子
    g.globalCompositeOperation = 'lighter';
    for (const q of parts) if (q.add && onScreen(q.x, q.y)) {
      const a = Math.max(0, q.life / q.max), s = q.size * S * PSIZE * (q.kind === 'spark' ? 1 : 0.6 + 0.4 * a);
      g.globalAlpha = a; g.drawImage(glow(q.color), X(q.x) - s, Y(q.y, q.z) - s, s * 2, s * 2);
    }
    // 闪光、闪电、光柱、刀光
    for (const f of fxs) {
      const a = f.life / f.max;
      if (f.k === 'flash') { const r = f.r * S * (1.4 - a * 0.4); g.globalAlpha = a; g.drawImage(glow(f.color), X(f.x) - r, Y(f.y, f.z) - r, r * 2, r * 2); }
      else if (f.k === 'bolt') {
        if (!f.pts) {                                 // 锯齿折线，每 0.04 秒重新生成一次（闪烁感）
          const n = 7, pts = [];
          for (let i = 0; i <= n; i++) { const t = i / n, j = i === 0 || i === n ? 0 : 1; pts.push([f.x1 + (f.x2 - f.x1) * t + rnd(-28, 28) * j, f.y1 + (f.y2 - f.y1) * t + rnd(-28, 28) * j, f.z1 + (f.z2 - f.z1) * t + rnd(-20, 20) * j]); }
          f.pts = pts;
        }
        for (const [w, c, al] of [[10, f.color, 0.35], [4, f.color, 0.9], [1.6, '#ffffff', 1]]) {
          g.globalAlpha = a * al; g.strokeStyle = c; g.lineWidth = Math.max(1, w * S * 2 * f.w); g.lineJoin = 'round'; g.beginPath();
          f.pts.forEach(([x, y, z], i) => g[i ? 'lineTo' : 'moveTo'](X(x), Y(y, z))); g.stroke();
        }
      } else if (f.k === 'beam') {
        for (const [w, c, al] of [[16, f.color, 0.35], [6, f.color, 0.8], [2, '#ffffff', 1]]) {
          g.globalAlpha = a * al; g.strokeStyle = c; g.lineWidth = Math.max(1, w * S * 1.5 * f.w); g.lineCap = 'round';
          g.beginPath(); g.moveTo(X(f.x1), Y(f.y1, f.z1)); g.lineTo(X(f.x2), Y(f.y2, f.z2)); g.stroke();
        }
      } else if (f.k === 'pillar') {                  // 从天而降的光柱
        const x = X(f.x), y = Y(f.y), w = 46 * S * (0.5 + a * 0.5), h = 900 * S;
        const gr = g.createLinearGradient(0, y - h, 0, y); gr.addColorStop(0, f.color + '00'); gr.addColorStop(0.7, f.color + 'aa'); gr.addColorStop(1, '#ffffff');
        g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x - w / 2, y - h, w, h);
        g.drawImage(glow(f.color), x - w * 2, y - w * 1.2, w * 4, w * 2.4);
      } else if (f.k === 'fall') {
        const k = Math.max(0, a), z = f.z0 * k, x = X(f.x + f.dx * k), y = Y(f.y + f.dy * k, z);
        const tx = X(f.x + f.dx * Math.min(1, k + 0.35)), ty = Y(f.y + f.dy * Math.min(1, k + 0.35), f.z0 * Math.min(1, k + 0.35));
        const r = f.size * S * SIZE;
        g.globalAlpha = 0.9; g.strokeStyle = f.color; g.lineCap = 'round';
        for (const [w, al] of [[2.2, 0.25], [1.1, 0.6]]) { g.globalAlpha = al; g.lineWidth = r * w; g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke(); }
        g.globalAlpha = 1; g.drawImage(glow(f.color), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        if (f.rock) { g.globalCompositeOperation = 'source-over'; g.fillStyle = f.rock; g.beginPath(); g.arc(x, y, r * 0.7, 0, TAU); g.fill(); g.globalCompositeOperation = 'lighter'; }
        g.drawImage(glow(f.core), x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        // 地面上的落点阴影
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.35 * (1 - k); g.fillStyle = '#000';
        g.beginPath(); g.ellipse(X(f.x), Y(f.y), r * (1.2 - 0.6 * k), r * (0.6 - 0.3 * k), 0, 0, TAU); g.fill(); g.globalCompositeOperation = 'lighter';
      } else if (f.k === 'slash') {
        const x = X(f.x), y = Y(f.y, f.z), r = 60 * S;
        g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = Math.max(1.5, 7 * S * a); g.lineCap = 'round';
        g.beginPath(); g.arc(x, y, r, f.a, f.a + 2.2); g.stroke();
        g.beginPath(); g.arc(x, y, r * 0.8, f.a + Math.PI, f.a + Math.PI + 2); g.stroke();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
  return F;
}
// 烟雾按颜色着色的缓存
const TINT = {};
function tint(img, color) {
  const key = color; if (TINT[key]) return TINT[key];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return (TINT[key] = c);
}
return { create, STYLES };
})();
