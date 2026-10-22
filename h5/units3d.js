// 单位的实时 3D 渲染：直接读魔兽原版 MDX（assets/w3/，tools/war3_models.py 导出），用 mdx-m3-viewer 画在 WebGL 画布上。
//
// 镜头和魔兽一样是透视相机（game.js 的 camera()：镜头朝北、俯角随远近变化），这一层先画地面（terrain.js 的地块图，贴在 z = 0 的平面上），
// 再把这一帧的地面画布（选中圈、光环、阴影这些贴地的东西，已按同一个相机投影到屏幕上）整张叠上去，最后画模型和树。
// 模型没加载好、没导出 assets/w3/ 时 put() 返回 false，游戏照旧画精灵图。
(() => {
'use strict';
// 我们的动作名 → 按优先级匹配的 WC3 序列名（同 tools/blender/import_mdx.py 的 WANT）
const WANT = {
  idle: ['stand', 'stand ready'],
  walk: ['walk', 'walk fast', 'run'],
  attack: ['attack', 'attack slam', 'attack 2'],
  death: ['death'],
  spell: ['spell', 'spell throw', 'spell slam', 'attack slam'],
  spin: ['attack walk stand spin'],
  build: ['stand work', 'attack'],
};
const seqKey = n => n.toLowerCase().trim().replace(/\s*(-\s*)?\d+$/, '').trim();
// 原图包里没有 Splats 数据表（模型事件的脚印 / 血迹），给一张空表，不去请求
const EMPTY_SLK = 'data:text/plain,' + encodeURIComponent('ID;PWXL;N;E\nB;X1;Y1;D0\nC;X1;Y1;K"ID"\nE\n');
const solver = src => typeof src !== 'string' ? src
  : /\.slk$/i.test(src) ? EMPTY_SLK
  : /\.(mdx|mdl|blp|tga)$/i.test(src) ? 'assets/w3/' + src.replace(/\\/g, '/').toLowerCase() : src;

function create(canvas, sheets) {
  const MV = window.ModelViewer;
  if (!MV) return null;
  let viewer;
  try { viewer = new MV.viewer.ModelViewer(canvas, { alpha: true, premultipliedAlpha: true, antialias: true, depth: true }); }
  catch (e) { console.warn('[3d] 没有 WebGL，用精灵图', e); return null; }
  patchGl(viewer.gl);
  const H = MV.viewer.handlers;
  viewer.addHandler(H.mdx, solver); viewer.addHandler(H.blp); viewer.addHandler(H.tga);
  viewer.on('error', e => console.warn('[3d]', e.error, e.fetchUrl || ''));
  // 每帧开头：清屏成地图外的暗色 → 地块（groundPass）→ 叠上这一帧的地面画布（backdrop）→ 库再画模型
  let ground = null, terrain = null;
  const drawGround = backdrop(viewer), drawTerrain = groundPass(viewer);
  viewer.startFrame = function () {
    const gl = this.gl; gl.viewport(0, 0, canvas.width, canvas.height); gl.depthMask(true); gl.clearColor(0.03, 0.05, 0.03, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (terrain) drawTerrain(terrain, cam.viewProjectionMatrix, view3);
    if (ground) drawGround(ground);
  };

  const scene = viewer.addScene();
  scene.alpha = true;                                  // 不用场景底色，透出下面的地面
  const cam = scene.camera;
  let view3 = null;

  const models = new Map();                            // mdx 路径 → { model, seq: {动作名: 序列号} } | 'loading' | 'fail'
  const live = new Map();                              // 实体 → { inst, mdx, anim }
  let seen = new Set();

  // ghost = true：半透明的那份（剑魂这类"幽灵"单位、建造预览、淡出的尸体）。原模型的不透明层是 1 位透明（alpha < 0.75 直接丢掉），
  // 顶点 alpha 一调低整个身体就没了 —— 另载一份，把这些层改成普通混合、挪到半透明那一趟画（在所有不透明的单位之后，不挡后面的怪）
  function modelOf(mdx, ghost) {
    const id = ghost ? mdx + '#ghost' : mdx, m = models.get(id);
    if (m) return m;
    models.set(id, 'loading');
    viewer.load(mdx, ghost ? src => src === mdx ? solver(src) + '?ghost' : solver(src) : solver).then(model => {
      if (!model || !model.sequences) { models.set(id, 'fail'); return; }
      if (ghost) translucent(model, viewer.gl);
      const names = model.sequences.map(s => s.name.toLowerCase().trim()), keys = names.map(seqKey), seq = {};
      for (const [want, cands] of Object.entries(WANT)) {
        for (const c of cands) {                         // 先找名字完全一样的（"Stand"），再找带编号的变体
          let i = names.indexOf(c); if (i < 0) i = keys.indexOf(c);
          if (i >= 0) { seq[want] = i; break; }
        }
      }
      models.set(id, { model, seq });
    }, () => models.set(id, 'fail'));
    return 'loading';
  }
  const mdxOf = meta => meta && meta.war3 && meta.aliasOf ? meta.aliasOf.split(':').slice(2).join(':') + '.mdx' : null;

  // 单位缩放：别名的 unitsPerPixel = 模型表的 unitsPerPixel × 单位缩放 / 模型表的 modelScale（tools/war3_batch.py 的 register）
  function unitScale(meta) {
    const base = sheets[meta.aliasOf] || meta;
    return meta.unitsPerPixel / base.unitsPerPixel * (base.modelScale || 1);
  }

  // 每帧开头：按镜头摆相机。view.cam = { eye, target, fovy, near, far }（game.js 的 camera() 算好的，屏幕投影也用它）
  // terrainSrc：terrain.js 的 glSource()，地块图在这里贴成地面
  function frame(view, terrainSrc) {
    const { W, H } = view, c = view.cam;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    scene.viewport[2] = W; scene.viewport[3] = H;
    cam.perspective(c.fovy, W / H, c.near, c.far);
    cam.moveToAndFace(c.eye, c.target, [0, 0, 1]);
    view3 = view; terrain = terrainSrc || null;
    seen = new Set();
  }

  // 装饰物（树墙）：一直在场上，不用每帧 put。retex = [原贴图, 换成的贴图]（同一个模型换贴图另载一份，如费伍德树）
  function doodad(mdx, x, y, face, scale, retex) {
    const id = retex ? mdx + '#' + retex[1] : mdx;
    let m = models.get(id);
    const place = md => {
      const inst = md.model.addInstance();
      inst.setLocation([x, y, 0]); inst.setRotation([0, 0, Math.sin(face / 2), Math.cos(face / 2)]); inst.setUniformScale(scale);
      inst.setSequence(md.seq.idle ?? 0); inst.setSequenceLoopMode(2);
      inst.frame = Math.random() * 1000;
      scene.addInstance(inst);
    };
    if (m && m.model) return place(m);
    if (m === 'fail') return;
    if (!m) {
      m = { wait: [] }; models.set(id, m);
      const sv = !retex ? solver : src => src === mdx ? solver(src) + '?' + retex[1] : solver(typeof src === 'string' && src.toLowerCase().replace(/\\/g, '/').endsWith(retex[0]) ? src.slice(0, -retex[0].length) + retex[1] : src);
      viewer.load(mdx, sv).then(model => {
        if (!model || !model.sequences) { models.set(id, 'fail'); return; }
        const names = model.sequences.map(s => s.name.toLowerCase().trim()), md = { model, seq: { idle: Math.max(0, names.findIndex(n => seqKey(n) === 'stand')) } };
        const wait = m.wait; models.set(id, md); wait.forEach(f => f(md));
      }, () => models.set(id, 'fail'));
    }
    if (m.wait) m.wait.push(place);
  }

  // 画一个实体；返回 false 表示这一帧 3D 画不了（调用方退回精灵图）
  // anim = [动作名, 开始时间, 停在最后一帧]，t = 游戏时间；opt: { scale, alpha, team }
  function put(e, meta, x, y, face, anim, t, opt = {}) {
    const mdx = mdxOf(meta); if (!mdx) return false;
    const ghost = opt.alpha != null && opt.alpha < 1, md = modelOf(mdx, ghost);
    if (typeof md === 'string') return false;
    let L = live.get(e);
    if (L && (L.mdx !== mdx || L.ghost !== ghost)) { L.inst.detach(); L = null; }
    if (!L) {
      const inst = md.model.addInstance();
      inst.setTeamColor(opt.team || 0);
      scene.addInstance(inst);
      L = { inst, mdx, ghost, anim: '', phase: Math.random() };
      live.set(e, L);
    }
    seen.add(e);
    const inst = L.inst, [name, t0, hold] = anim, act = meta.actions[name];
    inst.setLocation([x, y, 0]);
    inst.setRotation([0, 0, Math.sin(face / 2), Math.cos(face / 2)]);   // 模型默认朝 +X，face 是游戏里的朝向角
    inst.setUniformScale(unitScale(meta) * (opt.scale || 1));
    const c = meta.tint || [1, 1, 1];
    inst.setVertexColor([c[0], c[1], c[2], opt.alpha == null ? 1 : opt.alpha]);
    // 动作：时长和精灵图一样（帧数 / fps），游戏逻辑按这个时长算攻击、施法、倒地
    const id = md.seq[name] ?? md.seq.idle ?? 0, sq = md.model.sequences[id];
    const key = name + '|' + t0;
    if (L.anim !== key) {
      L.anim = key;
      inst.setSequence(id);
      inst.setSequenceLoopMode(act && act.loop ? 2 : 1);
      if (sq && act) inst.timeScale = (sq.interval[1] - sq.interval[0]) / 1000 / (act.frames / act.fps);
      if (sq && act && act.loop) inst.frame = sq.interval[0] + L.phase * (sq.interval[1] - sq.interval[0]);   // 循环动作错开，不然一群怪步调一致
      else if (sq) inst.frame = Math.min(sq.interval[1], sq.interval[0] + Math.max(0, t - t0) * 1000 * inst.timeScale);
    }
    if (hold && sq) inst.frame = sq.interval[1];
    return true;
  }

  // 精灵表里没有登记、直接按 MDX 路径画的模型（光环塔：原图单位的模型就是光环特效），一直循环第一个 Stand
  function putModel(e, mdx, x, y, scale) {
    const md = modelOf(mdx); if (typeof md === 'string') return false;
    let L = live.get(e);
    if (L && L.mdx !== mdx) { L.inst.detach(); L = null; }
    if (!L) {
      const inst = md.model.addInstance();
      inst.setSequence(md.seq.idle ?? 0); inst.setSequenceLoopMode(2);
      scene.addInstance(inst);
      L = { inst, mdx }; live.set(e, L);
    }
    seen.add(e);
    L.inst.setLocation([x, y, 0]); L.inst.setUniformScale(scale);
    return true;
  }
  // 一次性的法术特效（命中）：放完第一个序列就删。模型还没载好时返回 false（调用方用 2D 特效）
  const shots = [];
  function burst(mdx, x, y, scale = 1) {
    const md = modelOf(mdx); if (typeof md === 'string') return false;
    const inst = md.model.addInstance(), sq = md.model.sequences[0];
    inst.setLocation([x, y, 0]); inst.setUniformScale(scale); inst.setSequence(0); inst.setSequenceLoopMode(1);
    scene.addInstance(inst);
    shots.push({ inst, left: sq ? sq.interval[1] - sq.interval[0] : 1000 });
    return true;
  }

  // 每帧结尾：删掉这一帧没画的实体，推进动画（游戏时间，暂停 / 倍速都跟着走），画出来
  // ground：这一帧画好的地面画布（可选）
  function render(dtGame, groundCanvas) {
    ground = groundCanvas || null;
    for (const [e, L] of live) if (!seen.has(e)) { L.inst.detach(); live.delete(e); }
    for (let i = shots.length - 1; i >= 0; i--) if ((shots[i].left -= Math.max(0, dtGame) * 1000) <= 0) { shots[i].inst.detach(); shots.splice(i, 1); }
    viewer.updateAndRender(Math.max(0, dtGame) * 1000);
  }

  return { frame, put, putModel, burst, render, doodad, preload: mdx => typeof modelOf(mdx) !== 'string',
    ready: meta => { const mdx = mdxOf(meta); return !!mdx && typeof modelOf(mdx) !== 'string'; } };
}

// 不透明层（filterMode 0 / 1）改成普通混合，整组挪进半透明那一趟
function translucent(model, gl) {
  for (const l of model.layers) if (l.filterMode < 2) { l.filterMode = 2; l.blended = true; l.blendSrc = gl.SRC_ALPHA; l.blendDst = gl.ONE_MINUS_SRC_ALPHA; }
  model.translucentGroups.unshift(...model.opaqueGroups.splice(0));
}

// 地面画布（透明底，贴地的圈、光环、阴影，已投影到屏幕）整张叠在地块上，再在上面画模型：叠加的光效（剑圣的旋风、红光，粒子的叠加）
// 要和地面真的相加才是原版的颜色（红光叠在草地上发橙），所以模型和地面画在同一张不透明的画布上。
function backdrop(viewer) {
  const gl = viewer.gl, webgl = viewer.webgl;
  const shader = webgl.createShader(
    'attribute vec2 a_p; varying vec2 v_uv; void main() { v_uv = vec2(a_p.x + 1.0, 1.0 - a_p.y) * 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }',
    'precision mediump float; uniform sampler2D u_tex; varying vec2 v_uv; void main() { gl_FragColor = texture2D(u_tex, v_uv); }');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return src => {
    shader.use();                                      // 走库的着色器切换，它记着当前程序和启用的顶点属性
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.uniform1i(shader.uniforms.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.vertexAttribPointer(shader.attribs.a_p, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);   // 预乘过的颜色叠上去，画布 alpha 保持 1
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true); gl.disable(gl.BLEND);
  };
}

// 地块：terrain.js 画好的图贴在 z = 0 的平面上。整张地图先铺低清整图，近处（屏幕上每世界单位够大）再盖 16×16 格的高清块；
// 高清块用到时才生成、传成贴图（每帧最多新做 2 块，没做好的先露着低清图），最近用过的留 24 块。最后盖一层地图外圈的压暗。
// src = { ready, L, span, cmin, cmax, chunk(ci, cj) → 画布, low, shade }；v = game.js 的 view（v.k(y) 是 y 处每世界单位的像素数）
function groundPass(viewer) {
  const gl = viewer.gl, webgl = viewer.webgl;
  const shader = webgl.createShader(
    'uniform mat4 u_vp; uniform vec4 u_rect; attribute vec2 a_p; varying vec2 v_uv;' +
    'void main() { v_uv = vec2(a_p.x, 1.0 - a_p.y); gl_Position = u_vp * vec4(mix(u_rect.xy, u_rect.zw, a_p), 0.0, 1.0); }',
    'precision mediump float; uniform sampler2D u_tex; uniform float u_a; varying vec2 v_uv; void main() { vec4 c = texture2D(u_tex, v_uv); gl_FragColor = vec4(c.rgb, c.a * u_a); }');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const pow2 = n => (n & (n - 1)) === 0;
  function upload(canvas) {
    const tex = gl.createTexture(), mip = pow2(canvas.width) && pow2(canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return tex;
  }
  let low = null, lowSrc = null, shade = null;
  const hi = new Map(), MAXHI = 24;
  function quad(tex, x0, y0, x1, y1, a = 1) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform4f(shader.uniforms.u_rect, x0, y0, x1, y1); gl.uniform1f(shader.uniforms.u_a, a);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return (src, vp, v) => {
    if (!src.ready || !v) return;
    if (lowSrc !== src.low) { lowSrc = src.low; low = upload(src.low); shade = upload(src.shade); }
    shader.use();
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(shader.uniforms.u_tex, 0);
    gl.uniformMatrix4fv(shader.uniforms.u_vp, false, vp);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.vertexAttribPointer(shader.attribs.a_p, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.disable(gl.BLEND);
    const L = src.L, sp = src.span;
    quad(low, -L, -L, L, L);
    // 看得见的范围（屏幕四角打到地面上的点围成的框），框里够近的块用高清图
    const [x0, y0, x1, y1] = v.footprint();
    let made = 0;
    for (let cj = Math.max(src.cmin, Math.floor(y0 / sp)); cj <= Math.min(src.cmax, Math.floor(y1 / sp)); cj++) {
      const yn = Math.max(cj * sp, Math.min((cj + 1) * sp, v.camY));   // 块里离镜头最近的一排
      if (v.k(yn) * 64 < 20) continue;                                 // 一格不到 20 像素：低清图就够
      for (let ci = Math.max(src.cmin, Math.floor(x0 / sp)); ci <= Math.min(src.cmax, Math.floor(x1 / sp)); ci++) {
        const key = ci + ',' + cj;
        let t = hi.get(key);
        if (t) { hi.delete(key); hi.set(key, t); }
        else if (made < 2) {
          made++; t = upload(src.chunk(ci, cj)); hi.set(key, t);
          if (hi.size > MAXHI) { const [k0, t0] = hi.entries().next().value; gl.deleteTexture(t0); hi.delete(k0); }
        }
        if (t) quad(t, ci * sp, cj * sp, (ci + 1) * sp, (cj + 1) * sp);
      }
    }
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    quad(shade, -L, -L, L, L);
    gl.disable(gl.BLEND); gl.depthMask(true);
  };
}

// 画布带透明通道（没给地面底图时透出下面的地面）：
// 1) 不透明 / 1 位透明的材质（filterMode 0、1）不混合，直接写贴图的 alpha，会把模型画成半透明 —— 片元着色器里改成写 1；
//    粒子着色器（有 u_emitter）的 filterMode 是粒子自己的编号（0 混合 1 叠加 2 相乘 3 相乘×2 4 透明键），只有条带（ribbon）按材质层的编号算
// 2) 混合的材质 alpha 通道按预乘的规则累积（普通混合 src + dst·(1-src)，叠加 / 相乘的光效不改 alpha）
function patchGl(gl) {
  const shaderSource = gl.shaderSource.bind(gl);
  gl.shaderSource = (sh, src) => {
    if (/uniform float u_filterMode;/.test(src) && /void main\(\)/.test(src)) {
      const opaque = /u_emitter/.test(src) ? 'u_emitter == EMITTER_RIBBON && u_filterMode < 2.0' : 'u_filterMode < 2.0';
      src = src.replace(/void main\(\)/, 'void main_()') + `\nvoid main() { main_(); if (${opaque}) gl_FragColor.a = 1.0; }\n`;
    }
    shaderSource(sh, src);
  };
  gl.blendFunc = (s, d) => d === gl.ONE_MINUS_SRC_ALPHA
    ? gl.blendFuncSeparate(s, d, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    : gl.blendFuncSeparate(s, d, gl.ZERO, gl.ONE);
}

window.Units3D = { create };
})();
