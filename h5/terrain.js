/* 地图美术：照原图（war3map.w3e / war3map.doo）的地块规则铺地面，贴图和树都是魔兽原版资源（tools/war3_terrain.py 导出，见 assets/w3terrain.js）。
 *   - 底色 Lgrd 暗草地；路面 Arck 灰绿岩石（3 格宽）；路两侧 1、3 格外各一条 Zvin 遗迹暗草的细纹（原图每条路都这样）
 *   - 出怪口（spawns，可以有多个）：原图四角的围栏——Arck 岩石地面、外面一圈 2 格宽的 Crck 费伍德岩石，再围一圈树墙，路从一侧开口出去
 *   - 中央：原图中心的 cZc1 十字地面，上面是"循环圈"法阵
 *   - 地图边缘一圈原版树墙
 * 地块和魔兽一样定义在格点上（每 64 单位一个，和建造网格的格子中心重合），每个格子按四个角的地块从低到高叠图：
 * 最低的一层画整块（偶尔用带花草碎石的变体），更高的每层按"哪几个角是这种地块"取图集左边 4×4 里对应的过渡遮罩。
 * 地面按 16×16 格分块，用到时才画、画好缓存；镜头拉远时改用一张低分辨率的整图。
 * 传了 map（assets/w3map.js，tools/war3_map.py 导出的原图 w3e 地块和 doo 树）时，地块和树都照原图摆：格点间距 128（和魔兽一样，一格贴图 64 像素），
 * 不传时按路网程序生成（格点间距 64）。
 * 用法：const T = Terrain.create({ world, roadSegs, roadHalf, spawns, center, map });
 *       每帧 T.drawGround(ctx, view, t)；T.drawTrees(ctx, view)（在单位之前画）；T.drawOverlay(ctx, view)（最后画）
 *       view = { W, H, S, cx, cy }：画布像素尺寸、每世界单位的像素数、镜头中心（世界坐标，y 朝上）
 *       3D 镜头时 view 还带 sx(x, y, z) / sy(y, z) / k(y)（透视投影、y 处每世界单位的像素数）：地块和树由 units3d.js 画
 *       （T.glSource()、T.trees），这里只画法阵、出怪口这些叠在地面上的东西
 */
window.Terrain = (() => {
'use strict';
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const hash = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const DATA = window.W3_TERRAIN;
const CH = 16;                                   // 每块多少格
const HI = 64;                                   // 高清块：每格像素（= 原版贴图一格的像素）
const LO = 12;                                   // 低清整图：每格像素
const PRIO = ['Zvin', 'Crck', 'cZc1', 'Lgrd', 'Arck'];   // 叠放顺序（原图 w3e 地块表的顺序，后面的盖在前面上）
const PLAIN = [0, 15, 16, 17, 20, 21];           // 整块时常用的几格（较素）；其余变体（花草、碎石）偶尔用

function create({ world, roadSegs, roadHalf, spawns = [], center = [0, 0], map = null }) {
  const R = rng(1234);
  const ground = map && map.ground;
  const T = ground ? ground.step : 64;           // 格点间距（世界单位）
  // 横平竖直的路段：到路中线的"方形距离"（切比雪夫距离），让拐角是方的，和原图一样
  const roadDist = (x, y) => {
    let m = Infinity;
    for (const [a, b] of roadSegs) {
      const dx = Math.max(Math.min(a[0], b[0]) - x, 0, x - Math.max(a[0], b[0]));
      const dy = Math.max(Math.min(a[1], b[1]) - y, 0, y - Math.max(a[1], b[1]));
      m = Math.min(m, Math.max(dx, dy));
    }
    return m;
  };
  const cheb = (x, y, p) => Math.max(Math.abs(x - p[0]), Math.abs(y - p[1]));

  // ------------------------------------------------ 格点地块
  const N = ground ? (ground.w - 1) / 2 : Math.ceil((world + 420) / T);   // 格点范围 -N..N
  const NV = 2 * N + 1;
  const vt = new Uint8Array(NV * NV);
  const K = Object.fromEntries(PRIO.map((k, i) => [k, i]));
  if (ground) {                                  // 原图 w3e：格点 (i, j) 在 (ox + i×step, oy + j×step)，地块名转成叠放顺序
    const idx = ground.names.map(n => K[n] ?? K.Lgrd);
    for (let k = 0; k < NV * NV; k++) vt[k] = idx[+ground.t[k]];
  } else for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = (i - N) * T, y = (j - N) * T, d = roadDist(x, y), ds = Math.min(Infinity, ...spawns.map(p => cheb(x, y, p)));
    const ax = Math.abs(x - center[0]), ay = Math.abs(y - center[1]);
    let k = 'Lgrd';
    if (d <= T + 1 || ds <= 3 * T) k = 'Arck';
    else if (ds <= 5 * T) k = 'Crck';
    else if (center && (Math.max(ax, ay) <= 6 * T || (Math.min(ax, ay) <= 2 * T && Math.max(ax, ay) <= 12 * T))) k = 'cZc1';
    else if (Math.abs(d - 2 * T) < 1 || Math.abs(d - 4 * T) < 1) k = 'Zvin';
    vt[j * NV + i] = K[k];
  }
  const vtype = (i, j) => vt[Math.max(0, Math.min(NV - 1, j + N)) * NV + Math.max(0, Math.min(NV - 1, i + N))];

  // ------------------------------------------------ 贴图
  const img = {};
  let pending = 0, ready = false;
  const onAll = [];
  const load = (src, cb) => { pending++; const im = new Image(); im.onload = () => { cb && cb(im); if (--pending === 0) { ready = true; onAll.forEach(f => f()); } }; im.onerror = im.onload; im.src = 'assets/' + src; return im; };
  if (DATA) {
    for (const k of PRIO) img[k] = load(DATA.tiles[k].src);
    img.trees = load(DATA.trees.src);
  }
  const tileXY = (k, idx) => {
    if (idx >= 16 && !DATA.tiles[k].ext) idx = 15;
    return idx < 16 ? [(idx % 4) * 64, (idx >> 2) * 64] : [256 + ((idx - 16) % 4) * 64, ((idx - 16) >> 2) * 64];
  };
  // 一格：四个角 TL TR BL BR（图上北在上）
  function drawCell(g, i, j, px, py, P) {
    const bl = vtype(i, j), br = vtype(i + 1, j), tl = vtype(i, j + 1), tr = vtype(i + 1, j + 1);
    const lo = Math.min(bl, br, tl, tr), hi = Math.max(bl, br, tl, tr);
    for (let k = lo; k <= hi; k++) {
      let idx;
      if (k === lo) {                             // 最低一层：整块
        const h = hash(i, j);
        idx = h < 0.8 ? PLAIN[(h * 1000 | 0) % PLAIN.length] : 16 + ((h * 7919 | 0) % 16);
        if (lo !== hi) idx = 15;
      } else {
        idx = (br === k) | (bl === k) << 1 | (tr === k) << 2 | (tl === k) << 3;
        if (!idx) continue;
      }
      const name = PRIO[k], [sx, sy] = tileXY(name, idx);
      g.drawImage(img[name], sx, sy, 64, 64, px, py, P, P);
    }
  }
  // 高清块（世界坐标：格 i0..i0+CH，j0..j0+CH；格 (i,j) 的左下角格点是 (i,j)）
  const chunks = new Map(), MAXC = 30;
  function chunk(ci, cj) {
    const key = ci + ',' + cj;
    let c = chunks.get(key);
    if (c) { chunks.delete(key); chunks.set(key, c); return c; }   // 最近用过的放到最后
    c = mkCanvas(CH * HI, CH * HI); const g = c.getContext('2d');
    const i0 = ci * CH, j0 = cj * CH;
    for (let a = 0; a < CH; a++) for (let b = 0; b < CH; b++) drawCell(g, i0 + a, j0 + b, a * HI, (CH - 1 - b) * HI, HI);
    chunks.set(key, c);
    if (chunks.size > MAXC) chunks.delete(chunks.keys().next().value);
    return c;
  }
  // 低清整图
  let low = null;
  function buildLow() {
    low = mkCanvas(2 * N * LO, 2 * N * LO); const g = low.getContext('2d');
    for (let j = -N; j < N; j++) for (let i = -N; i < N; i++) drawCell(g, i, j, (i + N) * LO, (N - 1 - j) * LO, LO);
  }
  onAll.push(buildLow);

  // 地图外圈压暗（原图边界外是黑的），柔和过渡
  const L = N * T, MK = 0.05, msz = Math.ceil(2 * L * MK);
  const shade = mkCanvas(msz, msz), sg = shade.getContext('2d');
  sg.filter = 'blur(5px)'; sg.fillStyle = 'rgba(0,0,0,.6)';
  const e = (world + 60 + L) * MK;
  sg.fillRect(0, 0, msz, msz - e); sg.fillRect(0, e, msz, msz - e); sg.fillRect(0, 0, msz - e, msz); sg.fillRect(e, 0, msz - e, msz);

  // ------------------------------------------------ 树墙
  const trees = [];
  const TREE_SCALE = 0.62;                       // 程序生成的地图比原图小，树也跟着按比例缩小（原图的树用 doo 里的缩放）
  const tlist = DATA ? DATA.trees.list : [];
  const pickTree = (id) => {
    let r = R();
    if (!id) { id = 'VTlt'; for (const [k, w] of Object.entries(DATA.trees.weight)) { if ((r -= w) < 0) { id = k; break; } } }
    const opts = tlist.filter(t => t.id === id);
    return opts[(R() * opts.length) | 0];
  };
  const addTree = (x, y, id, s) => trees.push({ x, y, t: pickTree(id), s: s ?? TREE_SCALE * (0.85 + R() * 0.3), flip: R() < 0.5 });
  if (DATA && map) {                             // 原图 doo 里的树（出怪口围栏一圈）；YTct 城市树墙没有贴图，按乡村树墙画
    for (const [id, x, y, sc] of map.trees) addTree(x, y, id === 'YTct' ? 'VTlt' : id, sc);
  } else if (DATA) {
    // 地图边缘：建造区外一圈，越往外越密
    for (let y = -L; y <= L; y += T) for (let x = -L; x <= L; x += T) {
      const out = Math.max(Math.abs(x), Math.abs(y)) - world;
      if (out < -90 || R() > (out < 60 ? 0.55 : 0.9)) continue;
      if (roadDist(x, y) < roadHalf + 140) continue;
      addTree(x + (R() - 0.5) * 40, y + (R() - 0.5) * 40);
    }
    // 出怪口围栏：Crck 那一圈上种树，路出去的那边留口子
    for (const spawn of spawns) for (const r of [4.5 * T, 5.5 * T]) {
      for (let a = -r; a < r; a += T * 0.9) for (const [x, y] of [[a, r], [r, -a], [-a, -r], [-r, a]]) {
        const X = spawn[0] + x, Y = spawn[1] + y;
        if (roadDist(X, Y) < roadHalf + 70 || (r > 5 * T && R() < 0.35)) continue;
        addTree(X + (R() - 0.5) * 16, Y + (R() - 0.5) * 16);
      }
    }
  }
  trees.sort((a, b) => b.y - a.y);

  // ------------------------------------------------ 每帧绘制
  const worldTf = (ctx, v) => ctx.setTransform(v.S, 0, 0, -v.S, v.W / 2 - v.cx * v.S, v.H / 2 + v.cy * v.S);
  const kOf = (v, y) => v.k ? v.k(y) : v.S;
  const px = (v, x, y) => v.sx ? v.sx(x, y) : v.W / 2 + (x - v.cx) * v.S, py = (v, y) => v.sy ? v.sy(y) : v.H / 2 - (y - v.cy) * v.S;
  const visible = (v, x, y, pad) => { if (v.vis) return v.vis(x, y, pad); const k = kOf(v, y); return Math.abs(px(v, x, y) - v.W / 2) < v.W / 2 + pad * k && Math.abs(py(v, y) - v.H / 2) < v.H / 2 + pad * k; };

  function drawGround(ctx, v, t) {
    if (v.sx) {                                  // 3D 镜头：地块由 units3d.js 贴；法阵按中心处的局部比例画（压扁成透视里的样子）
      if (center && visible(v, center[0], center[1], 400)) {
        const k = v.k(center[1]);
        ctx.save(); ctx.setTransform(k, 0, 0, -k * v.q(center[1]), px(v, center[0], center[1]), py(v, center[1])); ctx.translate(-center[0], -center[1]);
        drawEmblem(ctx, center, t); ctx.restore();
      }
      for (const p of spawns) drawPortal(ctx, v, p, t);
      return;
    }
    ctx.save();
    ctx.fillStyle = '#1d3314'; ctx.fillRect(0, 0, v.W, v.H);
    ctx.imageSmoothingEnabled = true;
    if (ready) {
      if (v.S * T < 22) {                        // 拉远：低清整图
        ctx.drawImage(low, px(v, -L), py(v, L), 2 * L * v.S, 2 * L * v.S);
      } else {                                   // 高清块：只画看得见的
        const x0 = v.cx - v.W / 2 / v.S, x1 = v.cx + v.W / 2 / v.S, y0 = v.cy - v.H / 2 / v.S, y1 = v.cy + v.H / 2 / v.S;
        const span = CH * T;
        const ci0 = Math.max(Math.floor(x0 / span), -Math.ceil(N / CH)), ci1 = Math.min(Math.floor(x1 / span), Math.ceil(N / CH) - 1);
        const cj0 = Math.max(Math.floor(y0 / span), -Math.ceil(N / CH)), cj1 = Math.min(Math.floor(y1 / span), Math.ceil(N / CH) - 1);
        for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
          const X = Math.floor(px(v, ci * span)), Y = Math.floor(py(v, (cj + 1) * span));
          const X2 = Math.ceil(px(v, (ci + 1) * span)), Y2 = Math.ceil(py(v, cj * span));
          ctx.drawImage(chunk(ci, cj), X, Y, X2 - X + 1, Y2 - Y + 1);   // 多画 1 像素，块与块之间不露缝
        }
      }
    }
    worldTf(ctx, v);
    ctx.save(); ctx.scale(1, -1); ctx.drawImage(shade, -L, -L, 2 * L, 2 * L); ctx.restore();   // 低分辨率图的 y 朝下
    if (center) drawEmblem(ctx, center, t);
    ctx.restore();
    for (const p of spawns) drawPortal(ctx, v, p, t);
  }

  // 中央"循环圈"法阵：缓慢旋转的绿色符文环（画在 cZc1 十字地面上，世界坐标下绘制）
  function drawEmblem(ctx, [x, y], t) {
    const r = 330;
    ctx.fillStyle = 'rgba(20,40,20,.35)'; ctx.beginPath(); ctx.arc(x, y, r - 30, 0, 7); ctx.fill();
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

  // 出怪口：原图只是一块围起来的岩石空地；这里在地面上加一点暗红的光和往上飘的火星，好认出怪的位置（屏幕坐标绘制）
  const embers = Array.from({ length: 28 }, () => ({ a: R() * 7, r: R(), sp: 0.4 + R() * 0.8, ph: R() }));
  function drawPortal(ctx, v, [x, y], t) {
    if (!visible(v, x, y, 400)) return;
    const X = px(v, x, y), Y = py(v, y), S = kOf(v, y), r = 170 * S, pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
    const gr = ctx.createRadialGradient(X, Y, 0, X, Y, r);
    gr.addColorStop(0, `rgba(255,70,40,${0.28 + 0.12 * pulse})`); gr.addColorStop(0.6, 'rgba(160,30,20,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
    for (const e of embers) {
      const life = (t * e.sp + e.ph) % 1, rr = e.r * r * 0.9;
      const ex = X + Math.cos(e.a) * rr, ey = Y + Math.sin(e.a) * rr * 0.6 - life * 180 * S;
      ctx.fillStyle = `rgba(255,${150 + 80 * (1 - life) | 0},80,${(1 - life) * 0.85})`;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, 4 * S * (1 - life)), 0, 7); ctx.fill();
    }
  }

  function drawTrees(ctx, v) {
    if (!ready || !img.trees) return;
    const vis = trees.filter(o => visible(v, o.x, o.y, 260));
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    for (const o of vis) {
      const w = o.t.w * o.t.upp * o.s * kOf(v, o.y);
      ctx.beginPath(); ctx.ellipse(px(v, o.x, o.y) + w * 0.12, py(v, o.y), w * 0.36, w * 0.14, 0, 0, 7); ctx.fill();
    }
    for (const o of vis) {
      const { x: sx, y: sy, w, h, ax, ay, upp } = o.t, k = upp * o.s * kOf(v, o.y), dw = w * k, dh = h * k;
      const X = px(v, o.x, o.y), Y = py(v, o.y);
      if (o.flip) { ctx.save(); ctx.translate(X, Y); ctx.scale(-1, 1); ctx.drawImage(img.trees, sx, sy, w, h, -dw * ax, -dh * ay, dw, dh); ctx.restore(); }
      else ctx.drawImage(img.trees, sx, sy, w, h, X - dw * ax, Y - dh * ay, dw, dh);
    }
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
  // 小地图用：低清整图和它覆盖的世界范围（-L..L），贴图没加载完时是 null
  const groundImage = () => ready ? { img: low, L } : null;
  // units3d.js 贴地面用：块的范围、按块取高清图、低清整图和外圈压暗
  const nc = Math.ceil(N / CH);
  const glSource = { get ready() { return ready && !!low; }, L, span: CH * T, cmin: -nc, cmax: nc - 1, chunk, get low() { return low; }, shade };
  return { drawGround, drawTrees, drawOverlay, groundImage, glSource: () => glSource, trees };
}
return { create };
})();
