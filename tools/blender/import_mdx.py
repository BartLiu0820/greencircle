"""魔兽争霸 3 经典版模型（.mdx v800）→ Blender 场景（.blend），可直接交给 render_sprites.py 出图。

  Blender -b -P tools/blender/import_mdx.py -- --mdx 模型.mdx --out art/models/unit_n090.blend [--scale 1] [--team 1,0.1,0.1]

做了什么：
  - 网格（多个 geoset）+ UV + 贴图材质（BLP 用 tools/blp.py 解码，按文件名在 .mdx 同目录及上级目录里找）
  - 骨架：每个 BONE / HELP 节点一根骨头，放在 pivot 点、朝向与骨架坐标轴一致，
    这样 MDX 的"绕 pivot 平移 / 旋转 / 缩放"可以原样写进 pose（location / rotation_quaternion / scale）
  - 蒙皮：MDX 的 matrix group（一组骨头平均分配权重）→ 顶点组
  - 动画：按序列名挑出 idle(Stand) / walk / attack / death / spell，各存成一个 Action（30 fps）
  - 坐标：WC3 是 Z 朝上、正面朝 +X，单位约等于游戏单位；转成 Blender 的米（÷80）、正面朝 -Y
根骨骼的水平位移（比如死亡时被击飞）会去掉，让精灵原地播放。
没处理：粒子、拖尾、贴图动画、全局序列（按静止处理）。geoset 透明度动画只做显隐：每个动作逐帧的可见性存在网格物体的 mdx_vis 上，render_sprites.py 出图时按帧切换。
"""
import argparse, json, math, os, struct, sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import blp  # noqa: E402

GAME_UNITS_PER_METER = 80
FPS = 30
WANT = {   # 我们的动作名 → 按优先级匹配的 WC3 序列名（小写、去掉 " - 2" 之类的编号）
    'idle': ['stand', 'stand ready'],
    'walk': ['walk', 'walk fast', 'run'],
    'attack': ['attack', 'attack slam', 'attack 2'],
    'death': ['death'],
    'spell': ['spell', 'spell throw', 'spell slam', 'attack slam'],
    'spin': ['attack walk stand spin'],                    # 剑圣的旋风斩（剑刃风暴）
}
SHOW_IN = ('attack', 'spell', 'spin')                       # 这些动作里会出现的 geoset 也导入（出图时按帧显隐）


def seqkey(name):
    """序列名归一：'Walk - 2' / 'Walk 1' / 'walk' → 'walk'"""
    import re
    return re.sub(r'\s*(-\s*)?\d+$', '', name.lower().strip()).strip()


def log(*a):
    print('[mdx]', *a, flush=True)


# ---------------------------------------------------------------- 解析
class R:
    def __init__(self, d, p=0): self.d, self.p = d, p
    def u32(self): v = struct.unpack_from('<I', self.d, self.p)[0]; self.p += 4; return v
    def i32(self): v = struct.unpack_from('<i', self.d, self.p)[0]; self.p += 4; return v
    def f32(self): v = struct.unpack_from('<f', self.d, self.p)[0]; self.p += 4; return v
    def fs(self, n): v = struct.unpack_from('<%df' % n, self.d, self.p); self.p += 4 * n; return v
    def tag(self): v = self.d[self.p:self.p + 4].decode('latin1'); self.p += 4; return v
    def s(self, n): v = self.d[self.p:self.p + n].split(b'\0')[0].decode('latin1'); self.p += n; return v
    def arr(self, fmt, n): v = np.frombuffer(self.d, fmt, n, self.p); self.p += np.dtype(fmt).itemsize * n; return v


TRACK_DIM = {'KGTR': 3, 'KGRT': 4, 'KGSC': 3, 'KGAO': 1, 'KMTA': 1, 'KMTF': 1, 'KATV': 1, 'KGAC': 3}


def read_track(r, dim):
    n, interp, gseq = r.u32(), r.u32(), r.i32()
    keys = []
    for _ in range(n):
        t = r.u32(); v = r.fs(dim)
        if interp > 1: r.fs(dim * 2)                     # Hermite / Bezier 的切线：按线性插值处理
        keys.append((t, v))
    return dict(interp=interp, gseq=gseq, keys=keys)


def read_node(r):
    start = r.p; size = r.u32()
    node = dict(name=r.s(80), id=r.u32(), parent=r.i32(), flags=r.u32(), tracks={})
    while r.p < start + size:
        tg = r.tag()
        node['tracks'][tg] = read_track(r, TRACK_DIM.get(tg, 3))
    r.p = start + size
    return node


def parse(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'MDLX', '不是 MDX 文件'
    M = dict(seqs=[], tex=[], mats=[], geos=[], geoa=[], nodes={}, pivots=None)
    p = 4; ver = 800
    while p < len(d):
        tg = d[p:p + 4].decode('latin1'); size = struct.unpack_from('<I', d, p + 4)[0]; r = R(d, p + 8); end = p + 8 + size
        if tg == 'VERS':
            ver = r.u32(); assert ver in (800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800), f'不认识的版本 v{ver}'
        elif tg == 'SEQS':
            while r.p < end:
                name = r.s(80); a, b = r.u32(), r.u32(); r.f32(); flags = r.u32(); r.p += 4 + 4 + 28
                M['seqs'].append(dict(name=name, start=a, end=b, loop=not (flags & 1)))
        elif tg == 'TEXS':
            while r.p < end:
                rid = r.u32(); path_ = r.s(260); r.u32()
                M['tex'].append(dict(rid=rid, path=path_))
        elif tg == 'MTLS':
            while r.p < end:
                ms = r.p; msize = r.u32(); r.i32(); r.u32()
                if 900 <= ver <= 1000: r.p += 80                 # 重制版 v900/v1000：着色器名
                assert r.tag() == 'LAYS'
                layers = []
                for _ in range(r.u32()):
                    ls = r.p; lsize = r.u32()
                    L = dict(filter=r.u32(), shading=r.u32(), tex=r.u32(), texanim=r.u32(), coord=r.u32(), alpha=r.f32())
                    if ver >= 1100:                              # 新版：每层带一组贴图（漫反射/法线/ORM…），取槽位 0（漫反射）
                        r.p += 4 * 6                             # emissiveGain, fresnelColor×3, fresnelOpacity, fresnelTeamColor
                        r.u32(); n = r.u32()
                        if n < 16 and r.p + 8 * n <= ls + lsize:
                            pairs = [(r.u32(), r.u32()) for _ in range(n)]
                            L['tex'] = next((t for t, slot in pairs if slot == 0), pairs[0][0] if pairs else L['tex'])
                    layers.append(L)
                    r.p = ls + lsize
                M['mats'].append(layers); r.p = ms + msize
        elif tg == 'GEOS':
            while r.p < end:
                gs = r.p; gsize = r.u32(); g = {}
                assert r.tag() == 'VRTX'; n = r.u32(); g['v'] = r.arr('<f4', n * 3).reshape(n, 3)
                assert r.tag() == 'NRMS'; n = r.u32(); g['n'] = r.arr('<f4', n * 3).reshape(n, 3)
                assert r.tag() == 'PTYP'; n = r.u32(); ptyp = r.arr('<u4', n)
                assert r.tag() == 'PCNT'; n = r.u32(); r.arr('<u4', n)
                assert r.tag() == 'PVTX'; n = r.u32(); g['f'] = r.arr('<u2', n).reshape(-1, 3)
                assert (ptyp == 4).all(), '只支持三角形'
                assert r.tag() == 'GNDX'; n = r.u32(); g['gndx'] = r.arr('<u1', n)
                assert r.tag() == 'MTGC'; n = r.u32(); g['mtgc'] = r.arr('<u4', n)
                assert r.tag() == 'MATS'; n = r.u32(); g['mats'] = r.arr('<u4', n)
                g['mat'] = r.u32(); r.u32(); r.u32()
                g['lod'] = 0
                if ver > 800: g['lod'] = r.u32(); r.p += 80          # LOD 级别 + 名字
                r.p += 28; ne = r.u32(); r.p += 28 * ne
                g['skin'] = None
                while r.d[r.p:r.p + 4] in (b'TANG', b'SKIN'):          # 重制版：切线、4 骨骼蒙皮
                    t = r.tag(); n = r.u32()
                    if t == 'TANG': r.p += 16 * n
                    else:                                       # 每顶点 4 个骨骼索引 + 4 个权重；新版本用 16 位，按后面紧跟的标签判断
                        wide = r.d[r.p + n:r.p + n + 4] not in (b'UVAS', b'TANG')
                        g['skin'] = r.arr('<u2' if wide else '<u1', n).reshape(-1, 8).astype(np.int32)
                assert r.tag() == 'UVAS'; nuv = r.u32(); uvs = []
                for _ in range(nuv):
                    assert r.tag() == 'UVBS'; n = r.u32(); uvs.append(r.arr('<f4', n * 2).reshape(n, 2))
                g['uv'] = uvs[0] if uvs else None
                M['geos'].append(g); r.p = gs + gsize
        elif tg == 'GEOA':
            while r.p < end:
                s0 = r.p; sz = r.u32(); alpha = r.f32(); r.u32(); col = r.fs(3); gid = r.u32(); tr = {}
                while r.p < s0 + sz:
                    t = r.tag(); tr[t] = read_track(r, TRACK_DIM.get(t, 3))
                M['geoa'].append(dict(alpha=alpha, geo=gid, color=tuple(col), tracks=tr)); r.p = s0 + sz
        elif tg == 'BONE':
            while r.p < end:
                n = read_node(r); n['kind'] = 'bone'; r.u32(); r.u32(); M['nodes'][n['id']] = n
        elif tg == 'HELP':
            while r.p < end:
                n = read_node(r); n['kind'] = 'helper'; M['nodes'][n['id']] = n
        elif tg == 'PIVT':
            M['pivots'] = np.frombuffer(d, '<f4', size // 4, p + 8).reshape(-1, 3)
        p = end
    return M


# ---------------------------------------------------------------- 动画取值
def sample(track, t, start, end, default):
    """在序列 [start, end] 内取 t 时刻的值；序列里没有关键帧就用默认值（WC3 的规则）"""
    if track is None or track['gseq'] >= 0:
        ks = [] if track is None else track['keys']
        return ks[0][1] if track is not None and track['gseq'] >= 0 and ks else default
    ks = [k for k in track['keys'] if start <= k[0] <= end]
    if not ks: return default
    if t <= ks[0][0]: return ks[0][1]
    if t >= ks[-1][0]: return ks[-1][1]
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t0 <= t <= t1:
            if track['interp'] == 0 or t1 == t0: return v0
            a = (t - t0) / (t1 - t0)
            if len(v0) == 4:                              # 四元数：球面插值
                q0 = Quaternion((v0[3], v0[0], v0[1], v0[2])); q1 = Quaternion((v1[3], v1[0], v1[1], v1[2]))
                q = q0.slerp(q1, a); return (q.x, q.y, q.z, q.w)
            return tuple(x0 + (x1 - x0) * a for x0, x1 in zip(v0, v1))
    return ks[-1][1]


def vis_times(tr, s):
    """取可见性要看的时刻：序列首尾、中点和序列内的关键帧"""
    return sorted({s['start'], (s['start'] + s['end']) // 2, s['end']} | {k[0] for k in tr['keys'] if s['start'] <= k[0] <= s['end']})


def key_times(nodes, start, end):
    ts = {start, end}
    for n in nodes.values():
        for tr in n['tracks'].values():
            if tr['gseq'] < 0:
                ts.update(k[0] for k in tr['keys'] if start <= k[0] <= end)
    return sorted(ts)


# ---------------------------------------------------------------- 贴图
TEX_EXT = ('.blp', '.dds', '.tga', '.png', '.tif', '.tiff')


W3_INDEX = None


def w3_lookup(tex_path):
    """原版资源（--w3root，tft 在前覆盖 roc）：按贴图的完整路径找，不区分大小写"""
    global W3_INDEX
    if not OPT.get('w3roots'): return None
    if W3_INDEX is None:
        W3_INDEX = {}
        for root in reversed(OPT['w3roots']):            # 后面的先放，前面的覆盖
            for dp, _, fs in os.walk(root):
                for f in fs:
                    W3_INDEX[os.path.relpath(os.path.join(dp, f), root).replace(os.sep, '/').lower()] = os.path.join(dp, f)
    k = tex_path.replace('\\', '/').lower()
    return W3_INDEX.get(k) or W3_INDEX.get(os.path.splitext(k)[0] + '.blp')


def find_texture(mdx_path, tex_path):
    """按文件名在模型所在的下载包里找贴图；同名不同扩展名（如模型写 .tga、包里给 .blp）也认"""
    hit = w3_lookup(tex_path)
    if hit: return hit
    base = tex_path.replace('\\', '/').split('/')[-1].lower()
    stem = os.path.splitext(base)[0]
    d = os.path.dirname(os.path.abspath(mdx_path))
    roots = [d]
    while os.path.basename(d) != 'x' and os.path.dirname(d) != d and len(roots) < 4:   # 往上找到下载包根目录（.../hNNN/x）为止
        d = os.path.dirname(d); roots.append(d)
    loose = None
    for root in roots:
        for dp, _, fs in os.walk(root):
            for f in fs:
                fl = f.lower()
                if fl == base: return os.path.join(dp, f)
                if loose is None and os.path.splitext(fl)[0] == stem and fl.endswith(TEX_EXT): loose = os.path.join(dp, f)
    return loose


OPT = dict(skin=None, skin_from=None, tint=None, w3roots=None, rtex=None, glow=False)


def tint(nt, color_out):
    """--tint：贴图颜色乘一个颜色（区分同一模型的不同变体）"""
    if not OPT['tint']: return color_out
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = 'COLOR'     # 换色相/饱和度、保留明暗
    m.inputs['Factor'].default_value = 0.6; m.inputs['B'].default_value = (*OPT['tint'], 1)
    nt.links.new(color_out, m.inputs['A'])
    return m.outputs['Result']


def main_texture(M):
    """被最多材质当主贴图用的那张（换配色时替换它）"""
    from collections import Counter
    c = Counter()
    for layers in M['mats']:
        for L in layers:
            if L['tex'] < len(M['tex']) and M['tex'][L['tex']]['rid'] == 0 and M['tex'][L['tex']]['path']:
                c[os.path.basename(M['tex'][L['tex']]['path'].replace('\\', '/')).lower()] += 1; break
    return c.most_common(1)[0][0] if c else None


def make_material(name, layers, M, mdx_path, team, png_dir):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    try: bsdf.inputs['Specular IOR Level'].default_value = 0.15
    except KeyError: pass
    bsdf.inputs['Roughness'].default_value = 0.85
    team_under = False
    main = None
    for L in layers:
        t = M['tex'][L['tex']] if L['tex'] < len(M['tex']) else None
        if t is None: continue
        if t['rid'] in (1, 2):                            # 队伍颜色 / 队伍光晕：用指定颜色
            if main is None: team_under = t['rid'] == 1
            continue
        if main is None: main = (L, t)
    if main is None:
        bsdf.inputs['Base Color'].default_value = (*team, 1); return mat, False
    L, t = main
    src = find_texture(mdx_path, t['path'])
    if not t['path'] and t['rid'] > 2 and OPT.get('rtex'): src = OPT['rtex']   # 可替换贴图（树 = 31 等）：由地形 / 装饰物数据指定
    if OPT['skin'] and t['path'] and os.path.basename(t['path'].replace('\\', '/')).lower() == OPT['skin_from']:   # 换一套配色
        src = OPT['skin']
    if not src:
        log(f'  ⚠ 找不到贴图 {t["path"]}，用灰色代替'); bsdf.inputs['Base Color'].default_value = (0.5, 0.5, 0.5, 1); return mat, False
    if open(src, 'rb').read(4) in (b'BLP1', b'BLP2'):                # 按内容判断（有的包把 TGA 起名成 .blp）
        import hashlib
        png = os.path.join(png_dir, os.path.splitext(os.path.basename(src))[0] + '_' + hashlib.md5(src.encode()).hexdigest()[:6] + '.png')
        if not os.path.exists(png): blp.write_png(png, blp.decode_blp(open(src, 'rb').read()))
        img = bpy.data.images.load(png)
    else:                                                 # DDS / TGA / PNG / TIF：Blender 自己能读
        img = bpy.data.images.load(src)
    img.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
    if team_under:                                        # 贴图透明处露出队伍颜色
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs['A'].default_value = (*team, 1)
        nt.links.new(tex.outputs['Alpha'], mix.inputs['Factor'])
        nt.links.new(tint(nt, tex.outputs['Color']), mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        return mat, False
    nt.links.new(tint(nt, tex.outputs['Color']), bsdf.inputs['Base Color'])
    cut = L['filter'] in (1, 2, 4)                        # 透明 / 混合：用贴图 alpha 镂空
    if L['filter'] in (3, 4):                             # 叠加发光
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
    if cut:
        alpha = tex.outputs['Alpha']
        if L['alpha'] < 0.999:                            # 材质层自带的透明度（魔幻塔攻击时飞刃的运动模糊片只有 0.2）
            k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = L['alpha']
            nt.links.new(alpha, k.inputs[0]); alpha = k.outputs['Value']
        nt.links.new(alpha, bsdf.inputs['Alpha'])
        try: mat.surface_render_method = 'DITHERED'
        except AttributeError: mat.blend_method = 'CLIP'
    if L['shading'] & 0x10: mat.use_backface_culling = False  # two sided
    return mat, cut


def make_glow_material(name, L, M, mdx_path, png_dir, color):
    """光效模式：叠加层画成纯自发光（贴图颜色 × 贴图 alpha × geoset 颜色），黑底上出图，游戏里用 lighter 叠上去"""
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    t = M['tex'][L['tex']]; src = find_texture(mdx_path, t['path'])
    png = os.path.join(png_dir, os.path.splitext(os.path.basename(src))[0] + '_glow.png')
    if not os.path.exists(png): blp.write_png(png, blp.decode_blp(open(src, 'rb').read()))
    img = bpy.data.images.load(png); img.pack()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    nt.links.new(tex.outputs['Color'], mul.inputs['A']); mul.inputs['B'].default_value = (*color, 1)
    nt.links.new(mul.outputs['Result'], em.inputs['Color'])
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = L['alpha']
    nt.links.new(tex.outputs['Alpha'], k.inputs[0]); nt.links.new(k.outputs['Value'], em.inputs['Strength'])
    add = nt.nodes.new('ShaderNodeAddShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    nt.links.new(em.outputs[0], add.inputs[0]); nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    try: mat.surface_render_method = 'BLENDED'
    except AttributeError: mat.blend_method = 'BLEND'
    mat.use_backface_culling = False
    return mat, False


# ---------------------------------------------------------------- 搭场景
def build(mdx_path, out, scale, team, height=None):
    M = parse(mdx_path)
    log(f'{os.path.basename(mdx_path)}: {len(M["geos"])} 个 geoset，{len(M["nodes"])} 个节点，序列 {[s["name"] for s in M["seqs"]]}')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    k = scale / GAME_UNITS_PER_METER
    png_dir = os.path.join(os.path.dirname(os.path.abspath(out)), '_tex'); os.makedirs(png_dir, exist_ok=True)

    root = bpy.data.objects.new('MODEL_ROOT', None); bpy.context.scene.collection.objects.link(root)
    root.rotation_euler = (0, 0, math.radians(-90))       # WC3 正面 +X → Blender 正面 -Y
    root.scale = (k, k, k)
    if OPT['skin']: OPT['skin_from'] = main_texture(M); log(f'  换配色：{OPT["skin_from"]} → {os.path.basename(OPT["skin"])}')

    # 骨架：骨头放在 pivot，朝向 +Y、roll 0 → 骨头矩阵 = 纯平移
    arm_data = bpy.data.armatures.new('MDX_ARM'); arm = bpy.data.objects.new('MDX_ARM', arm_data)
    bpy.context.scene.collection.objects.link(arm); arm.parent = root
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    nodes = M['nodes']; piv = M['pivots']
    names = {}
    for nid, n in sorted(nodes.items()):
        b = arm_data.edit_bones.new(f'{nid:03d}_{n["name"]}'[:60]); names[nid] = b.name
        h = Vector(piv[nid]) if piv is not None and nid < len(piv) else Vector()
        b.head = h; b.tail = h + Vector((0, 4, 0)); b.roll = 0
    for nid, n in nodes.items():
        if n['parent'] in nodes:
            arm_data.edit_bones[names[nid]].parent = arm_data.edit_bones[names[n['parent']]]
    bpy.ops.object.mode_set(mode='OBJECT')

    pick = {}
    for want, cands in WANT.items():
        for c in cands:                                   # 先找名字完全一样的（"Stand"），再找带编号的变体（"Stand - 2" 常是东张西望的长动作）
            s = next((s for s in M['seqs'] if s['name'].lower().strip() == c), None) or next((s for s in M['seqs'] if seqkey(s['name']) == c), None)
            if s: pick[want] = s; break

    # 一直透明的 geoset 去掉（比如单独的阴影片）
    # 以及待机（Stand）和攻击 / 施法动作里都看不见的（比如死亡后才出现的内脏 gutz）；
    # 只在攻击 / 施法里出现的（魔幻塔攻击时的旋转飞刃、剑圣旋风斩的旋风）留下，按动作逐帧显隐（vis_frames）
    stand = next((s for s in M['seqs'] if seqkey(s['name']) == 'stand'), M['seqs'][0] if M['seqs'] else None)
    shown = [stand] + [pick[w] for w in SHOW_IN if w in pick]
    def seen(ga, s):
        tr = ga['tracks'].get('KGAO')
        if tr is None: return ga['alpha'] > 0.01
        if s is None: return True
        return max(sample(tr, t, s['start'], s['end'], (ga['alpha'],))[0] for t in vis_times(tr, s)) > 0.01
    hidden = {ga['geo'] for ga in M['geoa'] if not any(seen(ga, s) for s in shown)}
    if hidden and not OPT['glow']: log(f'  隐藏待机 / 攻击 / 施法时都看不见的 geoset：{sorted(hidden)}')
    geo_ob = {}
    gcol = {ga['geo']: ga.get('color', (1, 1, 1)) for ga in M['geoa']}
    mats = {}
    for gi, g in enumerate(M['geos']):
        if 0 < g.get('lod', 0) < 0xFFFFFFFF: continue                   # 低精度 LOD 是重复的网格（0xFFFFFFFF = 所有精度都显示）
        layers = M['mats'][g['mat']]
        glow = all(L['filter'] in (3, 4) and M['tex'][L['tex']]['path'] for L in layers)   # 有贴图的叠加层（不含队伍光晕）
        if OPT['glow']:                                                 # 光效模式：只出叠加层，动作里才出现的也要（剑圣旋风斩的旋风）
            if not glow or gi in hidden: continue
            if (g['mat'], gi) not in mats: mats[(g['mat'], gi)] = make_glow_material(f'MDX_GLOW_{gi}', layers[0], M, mdx_path, png_dir, gcol.get(gi, (1, 1, 1)))
            mats[g['mat']] = mats[(g['mat'], gi)]
        elif gi in hidden or all(L['filter'] in (3, 4, 5, 6) for L in layers):   # 纯叠加 / 调制层（光效、阴影）不渲染
            continue
        if g['mat'] not in mats: mats[g['mat']] = make_material(f'MDX_MAT_{g["mat"]}', layers, M, mdx_path, team, png_dir)
        me = bpy.data.meshes.new(f'geoset_{gi}')
        me.from_pydata([tuple(v) for v in g['v']], [], [tuple(int(i) for i in f) for f in g['f']])
        if g['uv'] is not None:
            uvl = me.uv_layers.new(); loops = np.array([l.vertex_index for l in me.loops])
            uv = g['uv'][loops].copy(); uv[:, 1] = 1 - uv[:, 1]
            uvl.data.foreach_set('uv', uv.ravel())
        me.materials.append(mats[g['mat']][0])
        for poly in me.polygons: poly.use_smooth = True
        ob = bpy.data.objects.new(f'geoset_{gi}', me); bpy.context.scene.collection.objects.link(ob); geo_ob[gi] = ob
        ob.parent = arm
        # 蒙皮：GNDX[顶点] = matrix group 编号；group 由 MTGC 个连续的 MATS 骨头组成，平均分权重
        groups, i = [], 0
        for c in g['mtgc']: groups.append([int(x) for x in g['mats'][i:i + c]]); i += c
        vg = {}
        def add(vi, bid, w):
            if bid not in names or w <= 0: return
            if bid not in vg: vg[bid] = ob.vertex_groups.new(name=names[bid])
            vg[bid].add([vi], w, 'ADD')
        if g.get('skin') is not None:                                   # 重制版：每个顶点 4 根骨头 + 权重（索引指向 MATS）
            for vi, row in enumerate(g['skin']):
                for k in range(4):
                    if row[4 + k]: add(vi, int(g['mats'][row[k]]) if row[k] < len(g['mats']) else -1, row[4 + k] / 255)
        for vi, gidx in enumerate(g['gndx'] if g.get('skin') is None else []):
            bones = groups[gidx] if gidx < len(groups) else []
            for bid in bones:
                if bid not in names: continue
                if bid not in vg: vg[bid] = ob.vertex_groups.new(name=names[bid])
                vg[bid].add([vi], 1.0 / len(bones), 'ADD')
        mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

    if OPT['glow'] and not geo_ob:
        log('  没有叠加发光的 geoset'); sys.exit(3)                     # 光效模式：没东西可出，war3_batch.py 据此跳过
    # 每个动作里 geoset 的逐帧可见性（帧号和动作关键帧一致：1 + 毫秒 × FPS / 1000），透明度动画会变的才存
    for ga in M['geoa']:
        tr = ga['tracks'].get('KGAO'); ob = geo_ob.get(ga['geo'])
        if tr is None or ob is None: continue
        vis = {want: [int(sample(tr, s['start'] + f * 1000 / FPS, s['start'], s['end'], (ga['alpha'],))[0] > 0.01)
                      for f in range(int((s['end'] - s['start']) * FPS / 1000) + 2)] for want, s in pick.items()}
        if any(0 in v for v in vis.values()): ob['mdx_vis'] = json.dumps(vis)

    # 动作
    arm.animation_data_create()
    for o in arm.pose.bones: o.rotation_mode = 'QUATERNION'
    for want, s in pick.items():
        act = bpy.data.actions.new(want); act.use_fake_user = True
        arm.animation_data.action = act
        times = key_times(nodes, s['start'], s['end'])
        for t in times:
            f = 1 + (t - s['start']) * FPS / 1000.0
            for nid, n in nodes.items():
                pb = arm.pose.bones[names[nid]]; tr = n['tracks']
                loc = sample(tr.get('KGTR'), t, s['start'], s['end'], (0, 0, 0))
                if n['parent'] not in nodes: loc = (0, 0, loc[2])     # 根骨骼的水平位移去掉：精灵原地播放，尸体留在怪死的位置
                pb.location = loc
                x, y, z, w = sample(tr.get('KGRT'), t, s['start'], s['end'], (0, 0, 0, 1))
                pb.rotation_quaternion = (w, x, y, z)
                pb.scale = sample(tr.get('KGSC'), t, s['start'], s['end'], (1, 1, 1))
                pb.keyframe_insert('location', frame=f); pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('scale', frame=f)
        log(f'  {want} ← "{s["name"]}"（{(s["end"] - s["start"]) / 1000:.2f}s，{len(times)} 个关键帧）')
    if 'idle' in pick: arm.animation_data.action = bpy.data.actions['idle']
    missing = [w for w in ('idle', 'walk', 'attack', 'death') if w not in pick]
    if missing: log('  没有对应序列：', missing)

    bpy.context.scene.render.fps = FPS
    # 统计尺寸（idle 第 1 帧）
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); zs = []
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            e = ob.evaluated_get(dg); zs += [(e.matrix_world @ v.co).z for v in e.data.vertices]
    if zs and height and max(zs) - min(zs) > 1e-4:                   # 指定身高：整体缩放到这个高度（不同作者的模型尺度差很多）
        f = height / (max(zs) - min(zs)); root.scale = tuple(c * f for c in root.scale)
        zs = [z * f for z in zs]
    if zs: log(f'  模型高度约 {max(zs) - min(zs):.2f} m（{(max(zs) - min(zs)) * GAME_UNITS_PER_METER:.0f} 游戏单位）')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    if OPT.get('pedestal'):                                         # 塔：放到标准塔座上（和已有的塔一致）
        root.location.z += 0.62
        base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'art', 'models', '_shared', 'tower_base.blend')
        with bpy.data.libraries.load(base) as (src_, dst):
            dst.objects = [n for n in src_.objects if n.startswith('TowerBase')]
        for o in dst.objects: bpy.context.scene.collection.objects.link(o)
        log('  放到标准塔座上')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    log('✓ 保存', out)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--mdx', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--scale', type=float, default=1.0, help='模型缩放（单位数据里的 modelScale）')
    ap.add_argument('--team', default='0.85,0.1,0.1', help='队伍颜色 r,g,b（0~1）')
    ap.add_argument('--height', type=float, help='把待机姿势的高度缩放到这么多米（优先于 --scale）')
    ap.add_argument('--skin', help='换配色：用这张贴图替换模型的主贴图（同一套 UV 的其他配色）')
    ap.add_argument('--tint', help='染色 r,g,b（0~1，乘到贴图颜色上）')
    ap.add_argument('--pedestal', action='store_true', help='塔：放到标准塔座上')
    ap.add_argument('--glow', action='store_true', help='光效模式：只导入叠加发光的 geoset（另出一张光效精灵表）')
    ap.add_argument('--rtex', help='可替换贴图（ReplaceableId > 2，如树的贴图）用这个文件')
    ap.add_argument('--w3root', action='append', help='原版资源目录（可多个，前面的优先），贴图按模型里写的完整路径在这里找')
    a = ap.parse_args(argv)
    OPT.update(skin=a.skin and os.path.abspath(a.skin), tint=a.tint and tuple(float(x) for x in a.tint.split(',')), pedestal=a.pedestal,
               w3roots=a.w3root and [os.path.abspath(r) for r in a.w3root], rtex=a.rtex and os.path.abspath(a.rtex), glow=a.glow)
    build(a.mdx, a.out, a.scale, tuple(float(x) for x in a.team.split(',')), a.height)
