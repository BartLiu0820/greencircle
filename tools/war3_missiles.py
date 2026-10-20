"""原图塔 / 英雄用的原版投射物模型（单位数据 Missileart）→ 游戏里的投射物数据 h5/assets/w3missiles.js。

  python3 tools/war3_missiles.py

WC3 的投射物主要由三部分组成，分别处理：
  - 本体：网格 + 朝向镜头的发光面片（billboard）。取飞行动作第一帧，用一个小的软件光栅器
    按游戏镜头（正面朝屏幕右方）画成两张图：普通混合层 + 叠加发光层，游戏里按飞行方向旋转
  - 粒子发射器（PRE2）：导出位置、方向、速度、寿命、发射率、贴图格子、三段颜色 / 透明度 / 大小，游戏里实时发射
  - 拖尾（RIBB）：导出位置、上下宽度、颜色、寿命，游戏里画成跟随的带子
没处理：贴图动画、粒子发射器的动画（取第一帧的值）、squirt（只在出生 / 死亡时喷一次的发射器）。
坐标：模型 +X = 飞行方向，+Y = 左，+Z = 上；1 个模型单位 = 1 个游戏单位。
"""
import json, math, os, re, struct, sys, types

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import blp  # noqa: E402
from war3_batch import INDEX, D, U  # noqa: E402

# import_mdx.py 是 Blender 脚本，这里只借用它的 MDX 解析和动画取值（不需要 bpy）
for _m in ('bpy', 'mathutils'): sys.modules.setdefault(_m, types.ModuleType(_m))
class _Quat:                                   # 只实现 sample() 用到的球面插值
    def __init__(self, wxyz): self.q = np.array(wxyz, float)

    def slerp(self, o, a):
        q0, q1 = self.q, o.q.copy(); dot = q0 @ q1
        if dot < 0: q1, dot = -q1, -dot
        if dot > 0.9995: q = q0 + (q1 - q0) * a
        else:
            th = math.acos(dot); q = (math.sin((1 - a) * th) * q0 + math.sin(a * th) * q1) / math.sin(th)
        q = q / np.linalg.norm(q); r = types.SimpleNamespace(w=q[0], x=q[1], y=q[2], z=q[3]); return r


for _n in ('Matrix', 'Vector'): setattr(sys.modules['mathutils'], _n, object)
sys.modules['mathutils'].Quaternion = _Quat
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location('import_mdx', os.path.join(ROOT, 'tools', 'blender', 'import_mdx.py'))
imx = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(imx)

OUT = os.path.join(ROOT, 'h5', 'assets', 'missiles')
ZK = 0.64                       # 和 fx.js 一致：高度在屏幕上压缩成 0.64
RES = 2                         # 本体图：每个游戏单位 2 像素
MAX_SPEED = 5000                # 原图里速度 10000 的"投射物"其实是瞬间命中，不算


# ---------------------------------------------------------------- 额外解析：GEOA 颜色、PRE2、RIBB（颜色按读出来的顺序当 RGB 用：火龙的火是橙色、水元素是蓝色）
def parse_extra(path):
    d = open(path, 'rb').read(); p = 4; geoa, pre2, ribb = [], [], []
    while p < len(d):
        tg = d[p:p + 4].decode('latin1'); size = struct.unpack_from('<I', d, p + 4)[0]; r = imx.R(d, p + 8); end = p + 8 + size
        if tg == 'GEOA':
            while r.p < end:
                s0 = r.p; sz = r.u32(); alpha = r.f32(); r.u32(); col = r.fs(3); gid = r.u32(); tr = {}
                while r.p < s0 + sz:
                    t = r.tag(); tr[t] = imx.read_track(r, 3 if t == 'KGAC' else 1)
                geoa.append(dict(geo=gid, alpha=alpha, color=list(col), tracks=tr)); r.p = s0 + sz
        elif tg == 'PRE2':
            while r.p < end:
                s0 = r.p; sz = r.u32(); node = imx.read_node(r)
                e = dict(node=node)
                for k in ('speed', 'variation', 'latitude', 'gravity', 'lifespan', 'rate', 'width', 'length'): e[k] = r.f32()
                e['filter'], e['rows'], e['cols'], e['headOrTail'] = r.u32(), r.u32(), r.u32(), r.u32()
                e['tailLength'], e['time'] = r.f32(), r.f32()
                e['colors'] = [list(r.fs(3)) for _ in range(3)]
                e['alpha'] = list(d[r.p:r.p + 3]); r.p += 3
                e['scaling'] = list(r.fs(3))
                e['head'] = [r.u32() for _ in range(3)]; e['headDecay'] = [r.u32() for _ in range(3)]
                e['tail'] = [r.u32() for _ in range(3)]; e['tailDecay'] = [r.u32() for _ in range(3)]
                e['tex'], e['squirt'], e['priority'], e['rid'] = r.u32(), r.u32(), r.i32(), r.u32()
                e['tracks'] = {}
                while r.p < s0 + sz:
                    t = r.tag(); e['tracks'][t] = imx.read_track(r, 1)
                pre2.append(e); r.p = s0 + sz
        elif tg == 'RIBB':
            while r.p < end:
                s0 = r.p; sz = r.u32(); node = imx.read_node(r)
                e = dict(node=node, above=r.f32(), below=r.f32(), alpha=r.f32(), color=list(r.fs(3)), lifespan=r.f32())
                r.u32(); e['rate'] = r.u32(); e['rows'], e['cols'] = r.u32(), r.u32(); e['mat'] = r.u32(); e['gravity'] = r.f32()
                e['tracks'] = {}
                while r.p < s0 + sz:
                    t = r.tag(); e['tracks'][t] = imx.read_track(r, 3 if t == 'KRCO' else 1)
                ribb.append(e); r.p = s0 + sz
        p = end
    return geoa, pre2, ribb


# ---------------------------------------------------------------- 节点矩阵（取一个时刻）
def quat_mat(x, y, z, w):
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def node_mats(nodes, piv, t, s0, s1):
    """{节点 id: 4×4 世界矩阵}；WC3：绕 pivot 先缩放、再旋转、再平移"""
    out = {}

    def get(nid):
        if nid in out: return out[nid]
        n = nodes[nid]; tr = n['tracks']
        p = np.array(piv[nid]) if piv is not None and nid < len(piv) else np.zeros(3)
        T = np.array(imx.sample(tr.get('KGTR'), t, s0, s1, (0, 0, 0)))
        Rq = imx.sample(tr.get('KGRT'), t, s0, s1, (0, 0, 0, 1))
        Sc = np.array(imx.sample(tr.get('KGSC'), t, s0, s1, (1, 1, 1)))
        M = np.eye(4); M[:3, :3] = quat_mat(*Rq) * Sc
        M[:3, 3] = p + T - M[:3, :3] @ p
        par = n['parent']
        out[nid] = (get(par) if par in nodes else np.eye(4)) @ M
        return out[nid]
    for nid in nodes: get(nid)
    return out


def all_nodes(M, pre2, ribb):
    nodes = dict(M['nodes'])
    for e in pre2 + ribb: nodes[e['node']['id']] = e['node']
    return nodes


# ---------------------------------------------------------------- 贴图
TEX_CACHE = {}


def texture(path):
    """贴图路径 → RGBA float 数组（0~1）"""
    k = path.replace('\\', '/').lower()
    if k not in TEX_CACHE:
        src = INDEX.get(k) or INDEX.get(os.path.splitext(k)[0] + '.blp')
        TEX_CACHE[k] = blp.decode_blp(open(src, 'rb').read()).astype(np.float32) / 255 if src else None
    return TEX_CACHE[k]


def tex_png(path):
    """粒子贴图另存成 PNG，返回游戏里的相对路径"""
    src = INDEX.get(path.replace('\\', '/').lower()) or INDEX.get(os.path.splitext(path.replace('\\', '/').lower())[0] + '.blp')
    if not src: return None
    name = os.path.basename(src)[:-4] + '.png'
    out = os.path.join(OUT, 'tex', name)
    if not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        blp.write_png(out, blp.decode_blp(open(src, 'rb').read()))
    return 'missiles/tex/' + name


# ---------------------------------------------------------------- 本体光栅化
def project(v):
    """模型坐标 → (屏幕右, 屏幕上, 朝向镜头的深度)。正面（+X）朝屏幕右，+Y 朝屏幕上（地面），+Z 按 ZK 压缩"""
    return np.stack([v[:, 0], v[:, 1] + v[:, 2] * ZK, v[:, 2] * 0.77 - v[:, 1] * 0.64], 1)


def raster(tris, w, h, ox, oy):
    """tris：[(屏幕三角形 3×3, uv 3×2, 贴图, 过滤模式, 颜色 rgb, 透明度)] → (普通层 RGBA, 叠加层 RGB)"""
    S = RES * 2                                  # 2 倍超采样
    W, H = int(w * S) + 2, int(h * S) + 2
    zbuf = np.full((H, W), -1e9, np.float32)
    col = np.zeros((H, W, 4), np.float32); add = np.zeros((H, W, 3), np.float32)
    order = sorted(tris, key=lambda t: (t[3] >= 2, t[3] >= 3))    # 先画不透明 / 镂空（写深度），再画混合，最后叠加
    for P, uv, tex, flt, rgb, alpha in order:
        if tex is None: continue
        px = (P[:, 0] - ox) * S; py = (oy - P[:, 1]) * S; pz = P[:, 2]
        x0, x1 = int(max(0, np.floor(px.min()))), int(min(W - 1, np.ceil(px.max())))
        y0, y1 = int(max(0, np.floor(py.min()))), int(min(H - 1, np.ceil(py.max())))
        if x1 < x0 or y1 < y0: continue
        den = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2])
        if abs(den) < 1e-9: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a = ((py[1] - py[2]) * (X - px[2]) + (px[2] - px[1]) * (Y - py[2])) / den
        b = ((py[2] - py[0]) * (X - px[2]) + (px[0] - px[2]) * (Y - py[2])) / den
        c = 1 - a - b
        m = (a >= 0) & (b >= 0) & (c >= 0)
        if not m.any(): continue
        z = a * pz[0] + b * pz[1] + c * pz[2]
        zb = zbuf[y0:y1 + 1, x0:x1 + 1]
        m &= z >= zb - 0.5
        u = (a * uv[0, 0] + b * uv[1, 0] + c * uv[2, 0]) % 1; v = (a * uv[0, 1] + b * uv[1, 1] + c * uv[2, 1]) % 1
        th, tw = tex.shape[:2]
        s = tex[np.clip((v * th).astype(int), 0, th - 1), np.clip((u * tw).astype(int), 0, tw - 1)]
        rgbx, ax = s[..., :3] * rgb, s[..., 3] * alpha
        if flt in (0, 1):                                   # 不透明 / 镂空
            if flt == 1: m &= s[..., 3] > 0.75
            zb[m] = z[m]
            col[y0:y1 + 1, x0:x1 + 1][m] = np.concatenate([rgbx, np.ones_like(ax)[..., None]], -1)[m]
        elif flt == 2:                                      # 半透明混合
            dst = col[y0:y1 + 1, x0:x1 + 1]; k = ax[..., None]
            out = np.concatenate([rgbx * k + dst[..., :3] * (1 - k), (k + dst[..., 3:] * (1 - k))], -1)
            dst[m] = out[m]
        elif flt in (3, 4):                                 # 叠加 / 带透明度的叠加
            k = (ax if flt == 4 else np.full_like(ax, alpha))[..., None]
            dst = add[y0:y1 + 1, x0:x1 + 1]; dst[m] = (dst + rgbx * k)[m]
    small = lambda arr: np.asarray(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.LANCZOS))
    return small(col), small(add)


def body(M, geoa, mats, t, s0, s1, name):
    """本体：返回 {'img', 'add', 'ox', 'oy', 'w', 'h'}（ox/oy = 模型原点在图里的位置，像素）或 None"""
    nodes, piv = M['nodes'], M['pivots']
    W = node_mats(nodes, piv, t, s0, s1)
    ga = {g['geo']: g for g in geoa}
    tris = []
    for gi, g in enumerate(M['geos']):
        if 0 < g.get('lod', 0) < 0xFFFFFFFF: continue
        gcol, galpha = np.ones(3), 1.0
        if gi in ga:
            a = ga[gi]
            galpha = imx.sample(a['tracks'].get('KGAO'), t, s0, s1, (a['alpha'],))[0]
            c = a['tracks'].get('KGAC'); cc = imx.sample(c, t, s0, s1, tuple(a['color']))
            gcol = np.array(cc if c else a['color'], np.float32)
            if all(x == 1 or x < 0 for x in a['color']) and not c: gcol = np.ones(3)
            gcol = np.clip(gcol, 0, 1)
        if galpha <= 0.01: continue
        groups, i = [], 0
        for cnt in g['mtgc']: groups.append([int(x) for x in g['mats'][i:i + cnt]]); i += cnt
        P = np.zeros((len(g['v']), 3))                                       # 屏幕坐标（右, 上, 深度）
        for vi, gidx in enumerate(g['gndx']):
            bones = [b for b in (groups[gidx] if gidx < len(groups) else []) if b in W]
            bb = [b for b in bones if nodes[b]['flags'] & 0x8]                # 朝向镜头的面片：局部 Y → 屏幕右，Z → 屏幕上
            if bb:
                b = bb[0]; pv = np.array(piv[b]); Mw = W[b]
                c = (Mw @ np.append(pv, 1))[:3]; sc = np.linalg.norm(Mw[:3, :3], axis=0).mean()
                off = (g['v'][vi] - pv) * sc
                P[vi] = (c[0] + off[1], c[1] + c[2] * ZK + off[2], c[2] * 0.77 - c[1] * 0.64 + 1)
            else:
                v = np.append(g['v'][vi], 1)
                w = (sum((W[b] @ v for b in bones), np.zeros(4)) / len(bones))[:3] if bones else g['v'][vi]
                P[vi] = project(w[None])[0]
        for L in mats[g['mat']][:1] if mats[g['mat']] else []:
            if L['filter'] in (5, 6) or L['tex'] >= len(M['tex']): continue
            tx = M['tex'][L['tex']]
            tex = texture(tx['path']) if tx['path'] else None
            if tex is None: continue
            for f in g['f']:
                tris.append((P[list(f)], g['uv'][list(f)] if g['uv'] is not None else np.zeros((3, 2)), tex, L['filter'], gcol, L['alpha'] * galpha))
    if not tris: return None
    allp = np.concatenate([t_[0] for t_ in tris])
    ox, oy = allp[:, 0].min() - 2, allp[:, 1].max() + 2
    w, h = allp[:, 0].max() + 2 - ox, oy - (allp[:, 1].min() - 2)
    if w * h > 600 * 600:                                    # 太大的多半是缩放没取对，不要
        return None
    col, add = raster(tris, w, h, ox, oy)
    m = (col[..., 3] > 8) | (add.max(-1) > 8)                      # 裁掉空白边（有的模型带着很远的看不见的点）
    if not m.any(): return None
    ys, xs = np.where(m); x0, x1, y0, y1 = max(0, xs.min() - 2), xs.max() + 3, max(0, ys.min() - 2), ys.max() + 3
    col, add = np.ascontiguousarray(col[y0:y1, x0:x1]), np.ascontiguousarray(add[y0:y1, x0:x1])
    out = dict(ox=round(-ox * RES - x0, 1), oy=round(oy * RES - y0, 1), res=RES)
    if col[..., 3].max() > 8:
        Image.fromarray(col).save(os.path.join(OUT, name + '.png')); out['img'] = f'missiles/{name}.png'
    if add.max() > 8:
        Image.fromarray(add).save(os.path.join(OUT, name + '_add.png')); out['add'] = f'missiles/{name}_add.png'
    return out if ('img' in out or 'add' in out) else None


# ---------------------------------------------------------------- 粒子 / 拖尾
def emitters(M, pre2, ribb, t, s0, s1):
    nodes = all_nodes(M, pre2, ribb)
    piv = M['pivots']; W = node_mats(nodes, piv, t, s0, s1)
    em = []
    for e in pre2:
        tr = e['tracks']; smp = lambda k, dv: imx.sample(tr.get(k), t, s0, s1, (dv,))[0]
        vis = smp('KP2V', 1)
        rate = max([smp('KP2E', e['rate'])] + [k[1][0] for k in (tr.get('KP2E') or {}).get('keys', []) if s0 <= k[0] <= s1])
        if vis <= 0 or rate <= 0 or e['squirt'] or e['tex'] >= len(M['tex']): continue
        nid = e['node']['id']; Mw = W[nid]
        pos = (Mw @ np.append(piv[nid] if nid < len(piv) else np.zeros(3), 1))[:3]
        dirv = Mw[:3, :3] @ np.array([0, 0, 1.0]); dirv /= (np.linalg.norm(dirv) or 1)
        tex = tex_png(M['tex'][e['tex']]['path']) if M['tex'][e['tex']]['path'] else None
        if not tex: continue
        fl = e['node']['flags']
        em.append(dict(pos=[round(float(x), 1) for x in pos], dir=[round(float(x), 3) for x in dirv],
                       speed=smp('KP2S', e['speed']), variation=smp('KP2R', e['variation']), latitude=smp('KP2L', e['latitude']),
                       gravity=smp('KP2G', e['gravity']), lifespan=e['lifespan'], rate=rate, width=smp('KP2W', e['width']), length=smp('KP2N', e['length']),
                       filter=e['filter'], rows=e['rows'], cols=e['cols'], headOrTail=e['headOrTail'], tailLength=e['tailLength'], time=e['time'],
                       colors=[[round(c, 3) for c in cc] for cc in e['colors']], alpha=e['alpha'], scaling=e['scaling'],
                       head=e['head'], headDecay=e['headDecay'], tail=e['tail'], tailDecay=e['tailDecay'],
                       modelSpace=bool(fl & 0x80000), xyQuad=bool(fl & 0x100000), tex=tex))
    rb = []
    for e in ribb:
        tr = e['tracks']; smp = lambda k, dv: imx.sample(tr.get(k), t, s0, s1, (dv,))[0]
        if smp('KRVS', 1) <= 0: continue
        nid = e['node']['id']; Mw = W[nid]
        pos = (Mw @ np.append(piv[nid] if nid < len(piv) else np.zeros(3), 1))[:3]
        layers = M['mats'][e['mat']] if e['mat'] < len(M['mats']) else []
        flt = layers[0]['filter'] if layers else 2
        dens = 1.0                                           # 贴图的平均覆盖度（叠加看亮度、混合看透明度），游戏里画实心带子时乘上
        if layers and layers[0]['tex'] < len(M['tex']) and M['tex'][layers[0]['tex']]['path']:
            tx = texture(M['tex'][layers[0]['tex']]['path'])
            if tx is not None: dens = float((tx[..., :3].mean(-1) * (tx[..., 3] if flt == 4 else 1)).mean() if flt >= 3 else tx[..., 3].mean())
        c = tr.get('KRCO'); col = imx.sample(c, t, s0, s1, tuple(e['color'])) if c else e['color']
        rb.append(dict(pos=[round(float(x), 1) for x in pos], above=smp('KRHA', e['above']), below=smp('KRHB', e['below']),
                       alpha=smp('KRAL', e['alpha']) * min(1, dens * 1.5), color=[round(float(x), 3) for x in col], lifespan=e['lifespan'], filter=flt))
    return em, rb


def export(art):
    mdx = INDEX.get(re.sub(r'\.(mdl|mdx)$', '', art.replace('\\', '/').lower()) + '.mdx')
    if not mdx: return None, '原版包里没有'
    M = imx.parse(mdx); geoa, pre2, ribb = parse_extra(mdx)
    seq = next((s for s in M['seqs'] if imx.seqkey(s['name']) == 'stand'), None) or next((s for s in M['seqs'] if imx.seqkey(s['name']) == 'birth'), None) or (M['seqs'][0] if M['seqs'] else dict(start=0, end=0))
    s0, s1 = seq['start'], seq['end']; t = s0 + min(100, (s1 - s0) // 4)
    name = os.path.splitext(os.path.basename(mdx))[0]
    b = body(M, geoa, M['mats'], t, s0, s1, name)
    em, rb = emitters(M, pre2, ribb, t, s0, s1)
    if not (b or em or rb): return None, '没有可画的部分'
    return dict(name=name, body=b, emitters=em, ribbons=rb), f'本体 {"有" if b else "无"} | 粒子 {len(em)} | 拖尾 {len(rb)}'


def main():
    os.makedirs(OUT, exist_ok=True)
    use = {}                                                 # 塔 / 英雄 → 投射物
    for fam, t in D['towers'].items():
        if t['cat'] == 'aura': continue
        u = U[t['levels'][0]['id']]; use['tower:' + fam] = u
    for n, h in D['heroes'].items(): use['hero:' + n] = U[h['id']]
    data, who = {}, {}
    for k, u in use.items():
        art = (u.get('Missileart') or '').split(',')[0].strip()
        spd = float((u.get('Missilespeed') or '0').split(',')[0] or 0)
        arc = float((u.get('Missilearc') or '0').split(',')[0] or 0)
        if not re.search(r'\w\.(mdl|mdx)$', art, re.I) or u.get('weapTp1') == 'instant' or spd >= MAX_SPEED:
            print(f'{k}: 不用（{art or "无"}，{u.get("weapTp1")}，速度 {spd:g}）'); continue
        if art not in data:
            d, note = export(art)
            print(f'{k}: {art} → {note}')
            if not d: continue
            data[art] = d
        who[k] = dict(missile=data[art]['name'], speed=spd, arc=arc)
    with open(os.path.join(ROOT, 'h5', 'assets', 'w3missiles.js'), 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：tools/war3_missiles.py —— 原版投射物（本体图 + 粒子发射器 + 拖尾），fx.js 用\n')
        fp.write('window.W3_MISSILES = ' + json.dumps({d['name']: d for d in data.values()}, ensure_ascii=False) + ';\n')
        fp.write('window.W3_MISSILE_OF = ' + json.dumps(who, ensure_ascii=False, indent=1) + ';\n')
    print(f'导出了 {len(data)} 种投射物，{len(who)} 个塔 / 英雄用上')


if __name__ == '__main__':
    main()
