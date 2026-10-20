// 单位的实时 3D 渲染：直接读魔兽原版 MDX（assets/w3/，tools/war3_models.py 导出），用 mdx-m3-viewer 画在地面层和界面层之间的 WebGL 画布上。
//
// 投影和精灵图一致：地面是正上方俯视（屏幕坐标 = 游戏里的 sx / sy），高度按 50° 俯角的正交相机往屏幕上方抬 cos50°
// （render_sprites.py 出精灵图就是这个相机），所以 3D 模型的脚底、大小和原来的精灵图对得上，选中圈、血条都不用改。
// 模型没加载好、没导出 assets/w3/、或浏览器没有 WebGL 时 put() 返回 false，游戏照旧画精灵图。
(() => {
'use strict';
const PITCH = 50 * Math.PI / 180, COS = Math.cos(PITCH), SIN = Math.sin(PITCH);
const DEPTH = 20000;                                   // 深度归一化的范围（世界单位）
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
  // 清屏成全透明（库默认清成黑色），透出下面的地面；给了地面画布就先把它铺满当底（见 backdrop）
  let ground = null;
  const drawGround = backdrop(viewer);
  viewer.startFrame = function () {
    const gl = this.gl; gl.depthMask(true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (ground) drawGround(ground);
  };

  const scene = viewer.addScene();
  scene.alpha = true;                                  // 不用场景底色，透出下面的地面
  const cam = scene.camera;
  cam.ortho(-1, 1, -1, 1, 1, 2);
  cam.moveToAndFace([0, -COS * 1000, SIN * 1000], [0, 0, 0], [0, 0, 1]);   // 只为了让粒子的面片朝向和俯角一致；矩阵在 frame() 里换掉
  const { mat4 } = MV.common.glMatrix, { unpackPlanes } = MV.common.glMatrixAddon;

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

  // 每帧开头：按镜头算投影矩阵（世界 → 裁剪空间）
  // 屏幕 x = (x - cx)·S，屏幕上方 = (y - cy)·S + z·cos50°·S，深度 = 沿 50° 视线的距离（北边、低处在后）
  function frame(view) {
    const { W, H, S, cx, cy } = view;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    scene.viewport[2] = W; scene.viewport[3] = H;
    const kx = 2 * S / W, ky = 2 * S / H, m = cam.viewProjectionMatrix;
    mat4.set(m,
      kx, 0, 0, 0,
      0, ky, COS / DEPTH, 0,
      0, ky * COS, -SIN / DEPTH, 0,
      -cx * kx, -cy * ky, -cy * COS / DEPTH, 1);
    mat4.invert(cam.inverseViewProjectionMatrix, m);
    unpackPlanes(cam.planes, m);
    seen = new Set();
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

  // 每帧结尾：删掉这一帧没画的实体，推进动画（游戏时间，暂停 / 倍速都跟着走），画出来
  // ground：这一帧画好的地面画布（可选）
  function render(dtGame, groundCanvas) {
    ground = groundCanvas || null;
    for (const [e, L] of live) if (!seen.has(e)) { L.inst.detach(); live.delete(e); }
    viewer.updateAndRender(Math.max(0, dtGame) * 1000);
  }

  return { frame, put, render, ready: meta => { const mdx = mdxOf(meta); return !!mdx && typeof modelOf(mdx) !== 'string'; } };
}

// 不透明层（filterMode 0 / 1）改成普通混合，整组挪进半透明那一趟
function translucent(model, gl) {
  for (const l of model.layers) if (l.filterMode < 2) { l.filterMode = 2; l.blended = true; l.blendSrc = gl.SRC_ALPHA; l.blendDst = gl.ONE_MINUS_SRC_ALPHA; }
  model.translucentGroups.unshift(...model.opaqueGroups.splice(0));
}

// 地面画布贴成全屏底图，再在上面画模型：叠加的光效（剑圣的旋风、红光，粒子的叠加）要和地面真的相加才是原版的颜色
// （红光叠在草地上发橙）。透明画布做不到 —— 透明处 alpha = 0 的"加上去的颜色"合成时会被丢掉。铺了底图画布就是不透明的，下面的规则只管颜色对。
function backdrop(viewer) {
  const gl = viewer.gl, webgl = viewer.webgl;
  const shader = webgl.createShader(
    'attribute vec2 a_p; varying vec2 v_uv; void main() { v_uv = vec2(a_p.x + 1.0, 1.0 - a_p.y) * 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }',
    'precision mediump float; uniform sampler2D u_tex; varying vec2 v_uv; void main() { gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb, 1.0); }');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return src => {
    shader.use();                                      // 走库的着色器切换，它记着当前程序和启用的顶点属性
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform1i(shader.uniforms.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.vertexAttribPointer(shader.attribs.a_p, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
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
