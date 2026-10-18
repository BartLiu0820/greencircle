/* 地图美术：草地 / 泥土 / 石板路纹理、路边细节、外围森林、出怪口传送阵、中央法阵。
 * 纹理全部在启动时用 Canvas 程序化生成（不需要图片素材），之后每帧只做贴图和裁剪，开销很小。
 * 用法：const T = Terrain.create({ world, roadSegs, roadHalf, spawn, center });
 *       每帧 T.drawGround(ctx, view, t)；T.drawTrees(ctx, view)（在单位之前画）；T.drawOverlay(ctx, view)（最后画）
 *       view = { W, H, S, cx, cy }：画布像素尺寸、每世界单位的像素数、镜头中心（世界坐标，y 朝上）
 */
window.Terrain = (() => {
'use strict';
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const segDist2 = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
};
// 在可平铺的纹理上画东西：越过边界的部分在对边再画一次，保证无缝
function wrapDraw(size, x, y, r, fn) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size])
    if (x + ox + r > 0 && x + ox - r < size && y + oy + r > 0 && y + oy - r < size) fn(x + ox, y + oy);
}

// ---------------------------------------------------------------- 纹理
function grassTile(size = 512) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), R = rng(7);
  g.fillStyle = '#35632d'; g.fillRect(0, 0, size, size);
  const pal = ['#2b5425', '#3d6f32', '#467b37', '#30592a', '#4f853b', '#3a6a2f', '#5a8a40'];
  for (let i = 0; i < 900; i++) {                         // 色块：大小不一的柔和斑点
    const x = R() * size, y = R() * size, r = 6 + R() ** 2 * 46, col = pal[(R() * pal.length) | 0];
    wrapDraw(size, x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, col); gr.addColorStop(1, col + '00');
      g.globalAlpha = 0.35; g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill();
    });
  }
  g.globalAlpha = 1; g.lineCap = 'round';
  for (let i = 0; i < 7000; i++) {                        // 草叶：短斜线，亮暗两种
    const x = R() * size, y = R() * size, l = 2 + R() * 5, a = -Math.PI / 2 + (R() - 0.5) * 1.1, light = R() < 0.55;
    g.strokeStyle = light ? `rgba(${120 + R() * 50 | 0},${170 + R() * 40 | 0},${70 + R() * 30 | 0},.55)` : `rgba(20,${45 + R() * 25 | 0},18,.5)`;
    g.lineWidth = 0.8 + R() * 0.8;
    wrapDraw(size, x, y, l, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); g.stroke(); });
  }
  const flowers = ['#f4e98a', '#ffffff', '#d9a8ff', '#ffb3c6'];
  for (let i = 0; i < 60; i++) {                          // 小花
    const x = R() * size, y = R() * size, col = flowers[(R() * flowers.length) | 0];
    for (let k = 0; k < 3 + R() * 4; k++) {
      const X = (x + (R() - 0.5) * 14 + size) % size, Y = (y + (R() - 0.5) * 14 + size) % size;
      g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.arc(X, Y, 1.2 + R(), 0, 7); g.fill();
    }
  }
  g.globalAlpha = 1;
  return c;
}
function dirtTile(size = 256) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), R = rng(11);
  g.fillStyle = '#6e5636'; g.fillRect(0, 0, size, size);
  const pal = ['#5d4829', '#7d6340', '#866b45', '#614c2e', '#735a37'];
  for (let i = 0; i < 500; i++) {
    const x = R() * size, y = R() * size, r = 3 + R() ** 2 * 26, col = pal[(R() * pal.length) | 0];
    wrapDraw(size, x, y, r, (X, Y) => { g.globalAlpha = 0.4; g.fillStyle = col; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill(); });
  }
  for (let i = 0; i < 260; i++) {                         // 小石子
    const x = R() * size, y = R() * size, r = 0.8 + R() * 2.2;
    g.globalAlpha = 0.8; g.fillStyle = R() < 0.5 ? '#9a8a70' : '#4a3a24'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  return c;
}
function cobbleTile(size = 256) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), R = rng(23);
  g.fillStyle = '#3a362f'; g.fillRect(0, 0, size, size);               // 缝隙
  const n = 8, cell = size / n, pal = ['#8c8677', '#7d786b', '#979080', '#6f6a5f', '#857d6c', '#a09684'];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const off = (j % 2) * cell * 0.5;                                     // 错缝铺法
    const x = i * cell + off + cell / 2 + (R() - 0.5) * 4, y = j * cell + cell / 2 + (R() - 0.5) * 4;
    const w = cell * (0.8 + R() * 0.12), h = cell * (0.78 + R() * 0.12), col = pal[(R() * pal.length) | 0], rot = (R() - 0.5) * 0.25;
    wrapDraw(size, x, y, cell, (X, Y) => {
      g.save(); g.translate(X, Y); g.rotate(rot);
      const rr = Math.min(w, h) * 0.32;
      const path = new Path2D(); path.roundRect(-w / 2, -h / 2, w, h, rr);
      g.fillStyle = col; g.fill(path);
      const sh = g.createLinearGradient(0, -h / 2, 0, h / 2);              // 上亮下暗，有立体感
      sh.addColorStop(0, 'rgba(255,250,230,.28)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.32)');
      g.fillStyle = sh; g.fill(path);
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,35,28' : '200,190,170'},.18)`; g.beginPath(); g.arc((R() - 0.5) * w * 0.7, (R() - 0.5) * h * 0.7, 1 + R() * 2.5, 0, 7); g.fill(); }
      g.restore();
    });
  }
  for (let i = 0; i < 90; i++) {                                         // 缝里的青苔
    const x = R() * size, y = R() * size;
    g.fillStyle = 'rgba(70,110,45,.55)'; g.beginPath(); g.arc(x, y, 1 + R() * 2, 0, 7); g.fill();
  }
  return c;
}

// ---------------------------------------------------------------- 装饰物精灵（底部中心为锚点）
function pine(R, hue) {
  const w = 120, h = 170, c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#4a3220'; g.fillRect(w / 2 - 6, h - 30, 12, 26);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), y0 = h - 24 - t * (h - 50), hw = 54 - t * 34, th = 62 - t * 12;
    const gr = g.createLinearGradient(w / 2 - hw, 0, w / 2 + hw, 0);
    gr.addColorStop(0, `hsl(${hue},45%,${30 + i * 2}%)`); gr.addColorStop(0.45, `hsl(${hue},40%,${22 + i * 2}%)`); gr.addColorStop(1, `hsl(${hue},45%,11%)`);
    g.fillStyle = gr; g.beginPath();
    g.moveTo(w / 2, y0 - th);
    for (let k = 0; k <= 6; k++) { const x = w / 2 - hw + (2 * hw * k) / 6; g.lineTo(x, y0 + (k % 2 ? -4 : 3) + (R() - 0.5) * 3); }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.stroke();
  }
  return { c, ax: 0.5, ay: 0.95 };
}
function oak(R, hue) {
  const w = 150, h = 160, c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#4d3522'; g.beginPath(); g.moveTo(w / 2 - 8, h - 6); g.lineTo(w / 2 - 5, h - 60); g.lineTo(w / 2 + 5, h - 60); g.lineTo(w / 2 + 8, h - 6); g.fill();
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([w / 2 + (R() - 0.5) * 80, h - 85 + (R() - 0.5) * 60, 22 + R() * 16]);
  blobs.sort((a, b) => a[1] - b[1]).reverse();
  for (const [x, y, r] of blobs) {                          // 暗边
    g.fillStyle = `hsl(${hue},45%,13%)`; g.beginPath(); g.arc(x + 2, y + 3, r + 2, 0, 7); g.fill();
  }
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    gr.addColorStop(0, `hsl(${hue},50%,42%)`); gr.addColorStop(0.6, `hsl(${hue},45%,26%)`); gr.addColorStop(1, `hsl(${hue},45%,17%)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return { c, ax: 0.5, ay: 0.96 };
}
function rock(R) {
  const w = 90, h = 70, c = mkCanvas(w, h), g = c.getContext('2d');
  const pts = []; const n = 7 + (R() * 3 | 0);
  for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI; pts.push([w / 2 + Math.cos(a) * (30 + R() * 12), h - 10 + Math.sin(a) * (28 + R() * 18)]); }
  const p = new Path2D(); p.moveTo(...pts[0]); pts.forEach(q => p.lineTo(...q)); p.closePath();
  const gr = g.createLinearGradient(0, h - 60, 0, h); gr.addColorStop(0, '#a8a397'); gr.addColorStop(0.5, '#7a766c'); gr.addColorStop(1, '#4b4841');
  g.fillStyle = gr; g.fill(p); g.strokeStyle = 'rgba(20,18,15,.6)'; g.lineWidth = 2; g.stroke(p);
  g.fillStyle = 'rgba(80,120,50,.6)'; g.beginPath(); g.ellipse(w / 2 - 6, h - 40, 12, 5, -0.3, 0, 7); g.fill();       // 青苔
  return { c, ax: 0.5, ay: 0.86 };
}
function bush(R, hue) {
  const w = 80, h = 56, c = mkCanvas(w, h), g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = w / 2 + (R() - 0.5) * 44, y = h - 18 - R() * 14, r = 12 + R() * 8;
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, `hsl(${hue},50%,40%)`); gr.addColorStop(1, `hsl(${hue},45%,16%)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  if (R() < 0.5) for (let i = 0; i < 5; i++) { g.fillStyle = R() < 0.5 ? '#ffd0e0' : '#fff6a0'; g.beginPath(); g.arc(w / 2 + (R() - 0.5) * 50, h - 22 - R() * 18, 2, 0, 7); g.fill(); }
  return { c, ax: 0.5, ay: 0.85 };
}
function tuft(R) {
  const w = 40, h = 30, c = mkCanvas(w, h), g = c.getContext('2d'); g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x = w / 2 + (R() - 0.5) * 18, a = -Math.PI / 2 + (R() - 0.5) * 1.2, l = 10 + R() * 14;
    g.strokeStyle = R() < 0.5 ? '#5f9a3e' : '#3f7a2c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, h - 3); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, h - 3 + Math.sin(a) * l * 0.6, x + Math.cos(a) * l, h - 3 + Math.sin(a) * l); g.stroke();
  }
  return { c, ax: 0.5, ay: 0.9 };
}
function pebbles(R) {
  const w = 50, h = 26, c = mkCanvas(w, h), g = c.getContext('2d');
  for (let i = 0; i < 5; i++) {
    const x = 8 + R() * 34, y = 8 + R() * 12, rx = 3 + R() * 5, ry = rx * 0.7;
    g.fillStyle = '#3a372f'; g.beginPath(); g.ellipse(x + 1, y + 1.5, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = ['#a39d8e', '#8a8475', '#bdb5a2'][i % 3]; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
  }
  return { c, ax: 0.5, ay: 0.7 };
}
function mushroom(R) {
  const w = 30, h = 30, c = mkCanvas(w, h), g = c.getContext('2d');
  for (let i = 0; i < 3; i++) {
    const x = 8 + i * 7 + R() * 3, s = 4 + R() * 3;
    g.fillStyle = '#efe6cf'; g.fillRect(x - 1.5, h - 4 - s * 1.4, 3, s * 1.4);
    g.fillStyle = R() < 0.6 ? '#c8402e' : '#d9a046'; g.beginPath(); g.ellipse(x, h - 4 - s * 1.4, s, s * 0.65, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - s * 0.3, h - 5 - s * 1.7, 1, 0, 7); g.fill();
  }
  return { c, ax: 0.5, ay: 0.9 };
}

// ---------------------------------------------------------------- 主体
function create({ world, roadSegs, roadHalf, spawn, center = [0, 0] }) {
  const R = rng(1234);
  const tex = { grass: grassTile(), dirt: dirtTile(), cobble: cobbleTile() };
  const pats = {};
  const pattern = (ctx, k) => pats[k] || (pats[k] = ctx.createPattern(tex[k], 'repeat'));
  const TEXK = { grass: 1.3, dirt: 1.1, cobble: 1.25 };        // 每个纹理像素对应多少世界单位
  const nearRoad = (x, y) => Math.min(...roadSegs.map(s => Math.sqrt(segDist2(x, y, s[0], s[1]))));

  // 路径（世界坐标），供每帧描边
  const roadPath = new Path2D();
  for (const [a, b] of roadSegs) { roadPath.moveTo(a[0], a[1]); roadPath.lineTo(b[0], b[1]); }

  // 大尺度明暗变化：低分辨率图，整体拉伸后叠加（让大片草地不单调）
  const L = world + 2600, MK = 0.06, msz = Math.ceil(2 * L * MK);
  const macro = mkCanvas(msz, msz), mg = macro.getContext('2d');
  const mx = x => (x + L) * MK, my = y => (L - y) * MK;
  for (let i = 0; i < 160; i++) {
    const x = (R() * 2 - 1) * L, y = (R() * 2 - 1) * L, r = (300 + R() * 900) * MK, dark = R() < 0.55;
    const gr = mg.createRadialGradient(mx(x), my(y), 0, mx(x), my(y), r);
    gr.addColorStop(0, dark ? 'rgba(10,25,8,.32)' : 'rgba(190,210,120,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = gr; mg.beginPath(); mg.arc(mx(x), my(y), r, 0, 7); mg.fill();
  }
  // 路两边被踩秃的泥土（柔和过渡）
  mg.save(); mg.filter = 'blur(3px)'; mg.lineCap = 'round'; mg.lineJoin = 'round';
  mg.strokeStyle = 'rgba(95,72,40,.55)'; mg.lineWidth = (roadHalf * 2 + 170) * MK; mg.beginPath();
  for (const [a, b] of roadSegs) { mg.moveTo(mx(a[0]), my(a[1])); mg.lineTo(mx(b[0]), my(b[1])); }
  mg.stroke(); mg.restore();
  // 可建造区以外（森林地面）压暗
  mg.save(); mg.filter = 'blur(6px)'; mg.fillStyle = 'rgba(8,18,8,.55)';
  const e = world + 40;
  mg.fillRect(0, 0, msz, my(e)); mg.fillRect(0, my(-e), msz, msz - my(-e)); mg.fillRect(0, 0, mx(-e), msz); mg.fillRect(mx(e), 0, msz - mx(e), msz);
  mg.restore();

  // 装饰物
  const SPR = { pine: [], oak: [], rock: [], bush: [], tuft: [], pebbles: [], mushroom: [] };
  for (let i = 0; i < 4; i++) { SPR.pine.push(pine(R, 95 + i * 12)); SPR.oak.push(oak(R, 85 + i * 14)); SPR.bush.push(bush(R, 90 + i * 10)); SPR.rock.push(rock(R)); }
  for (let i = 0; i < 3; i++) { SPR.tuft.push(tuft(R)); SPR.pebbles.push(pebbles(R)); SPR.mushroom.push(mushroom(R)); }
  const pickS = k => SPR[k][(R() * SPR[k].length) | 0];
  const trees = [], flat = [];
  // 外围森林：地图边缘往外一圈，越往外越密
  for (let i = 0; i < 2600; i++) {
    const x = (R() * 2 - 1) * (world + 2400), y = (R() * 2 - 1) * (world + 2400);
    const out = Math.max(Math.abs(x), Math.abs(y)) - world;
    if (out < -60 || (out < 300 && R() < 0.45)) continue;
    if (spawn && Math.hypot(x - spawn[0], y - spawn[1]) < 650) continue;
    if (nearRoad(x, y) < roadHalf + 160) continue;
    const kind = R() < 0.62 ? 'pine' : 'oak';
    trees.push({ x, y, s: kind === 'pine' ? 230 + R() * 140 : 250 + R() * 120, spr: pickS(kind) });
  }
  // 林缘的灌木和石头
  for (let i = 0; i < 260; i++) {
    const side = (R() * 4) | 0, t = (R() * 2 - 1) * world, d = world - 60 + R() * 240;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? d : -d, y = side === 0 ? d : side === 1 ? -d : t;
    if (nearRoad(x, y) < roadHalf + 120 || (spawn && Math.hypot(x - spawn[0], y - spawn[1]) < 500)) continue;
    const kind = R() < 0.6 ? 'bush' : 'rock';
    trees.push({ x, y, s: kind === 'bush' ? 90 + R() * 60 : 70 + R() * 70, spr: pickS(kind) });
  }
  trees.sort((a, b) => b.y - a.y);
  // 地面小细节（扁平，画在塔和单位下面）：草丛、小花丛、蘑菇；路边的碎石
  for (let i = 0; i < 1500; i++) {
    const x = (R() * 2 - 1) * world, y = (R() * 2 - 1) * world, d = nearRoad(x, y);
    if (d < roadHalf + 10) continue;
    const kind = d < roadHalf + 70 ? (R() < 0.7 ? 'pebbles' : 'tuft') : R() < 0.8 ? 'tuft' : R() < 0.75 ? 'mushroom' : 'pebbles';
    flat.push({ x, y, s: kind === 'tuft' ? 40 + R() * 30 : kind === 'pebbles' ? 45 + R() * 25 : 32 + R() * 14, spr: pickS(kind) });
  }
  // 路边石：沿每段路两侧，间隔随机
  const curb = [];
  for (const [a, b] of roadSegs) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let t = 0; t < len; t += 70 + R() * 90) for (const side of [1, -1]) {
      if (R() < 0.45) continue;
      const off = roadHalf + 8 + R() * 18, x = a[0] + dx * t / len + nx * off * side, y = a[1] + dy * t / len + ny * off * side;
      if (nearRoad(x, y) < roadHalf - 5) continue;
      curb.push({ x, y, r: 10 + R() * 14, c: ['#8f897a', '#7a7466', '#a39c8a'][(R() * 3) | 0] });
    }
  }

  // ------------------------------------------------ 每帧绘制
  const worldTf = (ctx, v) => ctx.setTransform(v.S, 0, 0, -v.S, v.W / 2 - v.cx * v.S, v.H / 2 + v.cy * v.S);
  const usePattern = (ctx, k) => { const p = pattern(ctx, k); p.setTransform(new DOMMatrix([TEXK[k], 0, 0, TEXK[k], 0, 0])); return p; };
  const visible = (v, x, y, pad) => Math.abs(x - v.cx) * v.S < v.W / 2 + pad * v.S && Math.abs(y - v.cy) * v.S < v.H / 2 + pad * v.S;
  function sprite(ctx, v, o, alpha = 1) {
    const { c, ax, ay } = o.spr, w = o.s * v.S, h = w * c.height / c.width;
    const px = v.W / 2 + (o.x - v.cx) * v.S, py = v.H / 2 - (o.y - v.cy) * v.S;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(c, px - w * ax, py - h * ay, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  function drawGround(ctx, v, t) {
    ctx.save();
    worldTf(ctx, v);
    const hw = v.W / 2 / v.S + 50, hh = v.H / 2 / v.S + 50;
    ctx.fillStyle = usePattern(ctx, 'grass'); ctx.fillRect(v.cx - hw, v.cy - hh, hw * 2, hh * 2);
    ctx.imageSmoothingEnabled = true;
    ctx.save(); ctx.scale(1, -1); ctx.drawImage(macro, -L, -L, 2 * L, 2 * L); ctx.restore();   // 低分辨率图的 y 朝下
    // 路：泥土路肩 → 暗色路沿 → 石板路面 → 路中间踩出来的泥
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85; ctx.strokeStyle = usePattern(ctx, 'dirt'); ctx.lineWidth = roadHalf * 2 + 70; ctx.stroke(roadPath);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#2f2b24'; ctx.lineWidth = roadHalf * 2 + 16; ctx.stroke(roadPath);
    ctx.strokeStyle = usePattern(ctx, 'cobble'); ctx.lineWidth = roadHalf * 2; ctx.stroke(roadPath);
    ctx.globalAlpha = 0.28; ctx.strokeStyle = usePattern(ctx, 'dirt'); ctx.lineWidth = roadHalf * 0.75; ctx.stroke(roadPath);
    ctx.globalAlpha = 1;
    // 中央法阵
    if (center) drawEmblem(ctx, center, t);
    ctx.restore();
    // 路边石、地面小细节
    for (const o of curb) if (visible(v, o.x, o.y, 40)) {
      const px = v.W / 2 + (o.x - v.cx) * v.S, py = v.H / 2 - (o.y - v.cy) * v.S, r = o.r * v.S;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(px + r * 0.15, py + r * 0.25, r, r * 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.68, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,240,.25)'; ctx.beginPath(); ctx.ellipse(px - r * 0.2, py - r * 0.22, r * 0.5, r * 0.3, 0, 0, 7); ctx.fill();
    }
    if (v.S * 60 > 3) for (const o of flat) if (visible(v, o.x, o.y, 60)) sprite(ctx, v, o);   // 太小时不画
    if (spawn) drawPortal(ctx, v, spawn, t);
  }

  // 中央"循环圈"法阵：石圈 + 缓慢旋转的绿色符文环（世界坐标下绘制）
  function drawEmblem(ctx, [x, y], t) {
    const r = 330;
    ctx.fillStyle = usePattern(ctx, 'cobble'); ctx.beginPath(); ctx.arc(x, y, r + 40, 0, 7); ctx.fill();
    ctx.lineWidth = 16; ctx.strokeStyle = '#2f2b24'; ctx.stroke();
    ctx.fillStyle = 'rgba(20,40,20,.55)'; ctx.beginPath(); ctx.arc(x, y, r - 30, 0, 7); ctx.fill();
    const pulse = 0.55 + 0.25 * Math.sin(t * 1.6);
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = '#6dff6d'; ctx.shadowBlur = 25 * pulse;
    ctx.strokeStyle = `rgba(120,255,120,${0.55 * pulse + 0.2})`; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 0, r - 55, 0, 7); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, r - 120, 0, 7); ctx.stroke();
    // 两个首尾相接的箭头圆弧 = 循环
    ctx.rotate(t * 0.25);
    for (let k = 0; k < 2; k++) {
      ctx.rotate(Math.PI);
      ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(0, 0, r - 190, 0.15, Math.PI - 0.35); ctx.stroke();
      const a = Math.PI - 0.35, ex = Math.cos(a) * (r - 190), ey = Math.sin(a) * (r - 190);
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a + Math.PI / 2) * 45, ey + Math.sin(a + Math.PI / 2) * 45);
      ctx.lineTo(ex + Math.cos(a) * 32, ey + Math.sin(a) * 32); ctx.lineTo(ex - Math.cos(a) * 32, ey - Math.sin(a) * 32); ctx.fill();
    }
    ctx.rotate(-t * 0.5);                         // 外圈符文反向转
    ctx.fillStyle = `rgba(150,255,150,${0.5 * pulse + 0.25})`;
    for (let k = 0; k < 16; k++) {
      ctx.rotate(Math.PI / 8); ctx.fillRect(r - 88, -10, 22, 20);
    }
    ctx.restore();
  }

  // 出怪口：烧焦的地面 + 旋转的红色传送阵 + 往上飘的火星（屏幕坐标绘制）
  const embers = Array.from({ length: 40 }, () => ({ a: R() * 7, r: R(), sp: 0.4 + R() * 0.8, ph: R() }));
  function drawPortal(ctx, v, [x, y], t) {
    if (!visible(v, x, y, 600)) return;
    const px = v.W / 2 + (x - v.cx) * v.S, py = v.H / 2 - (y - v.cy) * v.S, S = v.S, r = 250 * S;
    let gr = ctx.createRadialGradient(px, py, 0, px, py, r * 1.6);
    gr.addColorStop(0, 'rgba(20,5,5,.75)'); gr.addColorStop(0.6, 'rgba(40,12,8,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(px, py, r * 1.6, r * 1.6, 0, 0, 7); ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.save(); ctx.translate(px, py); ctx.scale(1, 1);
    ctx.shadowColor = '#ff3a2a'; ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = `rgba(255,80,50,${0.5 + 0.4 * pulse})`; ctx.lineWidth = Math.max(1.5, 10 * S);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.lineWidth = Math.max(1, 5 * S); ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, 7); ctx.stroke();
    ctx.rotate(t * 0.8);                          // 五芒星
    ctx.beginPath();
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + k * 4 * Math.PI / 5; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72); }
    ctx.stroke();
    ctx.rotate(-t * 1.6); ctx.fillStyle = `rgba(255,120,80,${0.6 + 0.3 * pulse})`;
    for (let k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.fillRect(r * 0.8, -6 * S, 14 * S, 12 * S); }
    ctx.restore();
    gr = ctx.createRadialGradient(px, py, 0, px, py, r * 0.7);          // 中心的光
    gr.addColorStop(0, `rgba(255,140,90,${0.45 * pulse})`); gr.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, r * 0.7, 0, 7); ctx.fill();
    for (const e of embers) {                                              // 火星
      const life = (t * e.sp + e.ph) % 1, rr = e.r * r * 0.8;
      const ex = px + Math.cos(e.a) * rr, ey = py + Math.sin(e.a) * rr * 0.6 - life * 220 * S;
      ctx.fillStyle = `rgba(255,${150 + 80 * (1 - life) | 0},80,${(1 - life) * 0.9})`;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, 5 * S * (1 - life)), 0, 7); ctx.fill();
    }
  }

  function drawTrees(ctx, v) {
    const sh = 'rgba(0,0,0,.3)';
    for (const o of trees) if (visible(v, o.x, o.y, 400)) {
      const px = v.W / 2 + (o.x - v.cx) * v.S, py = v.H / 2 - (o.y - v.cy) * v.S;
      ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(px + o.s * 0.08 * v.S, py, o.s * 0.32 * v.S, o.s * 0.12 * v.S, 0, 0, 7); ctx.fill();
    }
    for (const o of trees) if (visible(v, o.x, o.y, 400)) sprite(ctx, v, o);
  }

  // 屏幕四周压暗（暗角），让视线集中在中间
  let vig = null, vigKey = '';
  function drawOverlay(ctx, v) {
    const key = v.W + 'x' + v.H;
    if (key !== vigKey) {
      vigKey = key; vig = mkCanvas(v.W, v.H); const g = vig.getContext('2d');
      const gr = g.createRadialGradient(v.W / 2, v.H / 2, Math.min(v.W, v.H) * 0.35, v.W / 2, v.H / 2, Math.hypot(v.W, v.H) * 0.62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = gr; g.fillRect(0, 0, v.W, v.H);
    }
    ctx.drawImage(vig, 0, 0);
  }
  return { drawGround, drawTrees, drawOverlay, textures: tex };
}
return { create };
})();
