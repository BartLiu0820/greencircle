"""绿色循环圈 H5：Blender 批量出图脚本（3D 模型 → 2.5D 精灵表）

单个模型：
  Blender -b -P tools/blender/render_sprites.py -- --model art/models/unit_hfoo.glb --key unit:hfoo --category monster
批量（第 1 批清单）：
  Blender -b -P tools/blender/render_sprites.py -- --batch tools/blender/batch1.csv
只渲染清单里还没出图的：加 --skip-done

输出到 h5/assets/sprites/：<文件名>.png（精灵表）+ <文件名>.json（帧信息）。
出完图后运行 python3 tools/register_sprites.py，游戏就会用上新图。

模型约定（给建模同学）：
  - 单位：1 Blender 单位 = 1 米。人形约 1.8 m 高，塔座直径约 1.8 m。
  - 原点在脚底中心，模型正面朝 -Y（Blender 的"前视图"方向），Z 轴朝上。
  - 动画做在一个骨架上，动作（Action）按下面的名字命名（不区分大小写，可加前缀，如 "Bandit_Walk"）：
      idle 待机 / walk 行走 / attack 攻击 / death 死亡 / spell 施法 / build 建造
  - 支持 .blend / .glb / .gltf / .fbx / .obj。
"""
import argparse, csv, json, math, os, sys, tempfile

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'h5', 'assets', 'sprites')

PPM = 40                     # 像素 / 米（@2x 分辨率）
GAME_UNITS_PER_METER = 80    # 游戏世界单位 / 米（塔座 1.8 m ≈ 游戏里 150 单位的塔位）
PITCH = 50                   # 相机俯角（度，接近 WC3 默认镜头）
ANCHOR = (0.5, 0.7)          # 脚底在画面中的位置（从左上角算，比例）；下方留出倒地动作的空间

# 各类别默认规格：画布边长、方向数、动作 → 帧数
CATEGORY = {
    'monster': dict(size=128, dirs=8, actions={'walk': 8, 'death': 6}),
    'boss':    dict(size=192, dirs=8, ppm=24, actions={'walk': 8, 'death': 6, 'spell': 6}),   # BOSS 体型大，用较低像素密度，图不至于太大
    'tower':   dict(size=160, dirs=1, actions={'idle': 10, 'attack': 6}),
    'hero':    dict(size=192, dirs=8, actions={'idle': 10, 'attack': 8, 'spell': 8}),
    'builder': dict(size=128, dirs=8, actions={'idle': 8, 'walk': 8, 'build': 6}),
}
FPS = {'idle': 8, 'walk': 12, 'attack': 14, 'death': 12, 'spell': 12, 'build': 10, 'spin': 18}
REAL_TIME = ('idle', 'spin')   # 这些动作按模型里的原始时长播放（待机压缩了会像在不停摇摆）
LOOP = {'idle': True, 'walk': True, 'build': True, 'attack': False, 'death': False, 'spell': False, 'spin': True}
ALIASES = {'idle': ['idle', 'stand', '待机'], 'walk': ['walk', 'run', 'move', '行走'], 'attack': ['attack', 'atk', '攻击'],
           'death': ['death', 'die', 'dead', '死亡'], 'spell': ['spell', 'cast', '施法'], 'build': ['build', 'work', '建造'], 'spin': ['spin']}


def log(*a):
    print('[sprites]', *a, flush=True)


# ---------------------------------------------------------------- 场景准备
def load_model(path):
    path = os.path.abspath(path)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path)
        for o in list(bpy.data.objects):                     # 用脚本自己的相机和灯光
            if o.type in ('CAMERA', 'LIGHT'):
                bpy.data.objects.remove(o, do_unlink=True)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if ext in ('.glb', '.gltf'):
            bpy.ops.import_scene.gltf(filepath=path)
        elif ext == '.fbx':
            bpy.ops.import_scene.fbx(filepath=path)
        elif ext == '.obj':
            bpy.ops.wm.obj_import(filepath=path)
        else:
            raise SystemExit('不支持的模型格式: ' + ext)


def apply_scale(scale):
    if abs(scale - 1) < 1e-6:
        return
    root = bpy.data.objects.new('SPRITE_SCALE', None)
    bpy.context.scene.collection.objects.link(root)
    for o in bpy.context.scene.objects:
        if o.parent is None and o is not root:
            o.parent = root
    root.scale = (scale, scale, scale)


def set_engine(scene):
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    try:
        scene.eevee.taa_render_samples = 16
    except AttributeError:
        pass


def setup_rig(size, ppm=PPM):
    """相机和灯光挂在一个空物体上，转这个空物体就能从 8 个方向拍模型，且光照方向相对屏幕不变。"""
    scene = bpy.context.scene
    set_engine(scene)
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        scene.view_settings.view_transform = 'Standard'
    except TypeError:
        pass

    rig = bpy.data.objects.new('SPRITE_RIG', None)
    scene.collection.objects.link(rig)

    cam_data = bpy.data.cameras.new('SPRITE_CAM')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size / ppm
    cam_data.shift_x = ANCHOR[0] - 0.5
    cam_data.shift_y = ANCHOR[1] - 0.5          # 让脚底（原点）落在画面下方 1/4 处
    cam_data.clip_end = 200
    cam = bpy.data.objects.new('SPRITE_CAM', cam_data)
    scene.collection.objects.link(cam)
    tilt = math.radians(90 - PITCH)
    dist = 50
    cam.location = (0, -math.sin(tilt) * dist, math.cos(tilt) * dist)
    cam.rotation_euler = (tilt, 0, 0)
    cam.parent = rig
    scene.camera = cam

    sun_data = bpy.data.lights.new('SPRITE_SUN', 'SUN')
    sun_data.energy = 3.5
    sun = bpy.data.objects.new('SPRITE_SUN', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(45), math.radians(-35), math.radians(-30))   # 屏幕左上方来光
    sun.parent = rig

    fill_data = bpy.data.lights.new('SPRITE_FILL', 'SUN')
    fill_data.energy = 1.0
    fill = bpy.data.objects.new('SPRITE_FILL', fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(60), math.radians(40), math.radians(150))
    fill.parent = rig

    if scene.world is None:
        scene.world = bpy.data.worlds.new('SPRITE_WORLD')
    scene.world.color = (0.35, 0.37, 0.4)
    return rig


# ---------------------------------------------------------------- 动画
def anim_targets():
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if arms:
        return arms
    root = bpy.data.objects.get('MODEL_ROOT')      # 静态模型的整体动画挂在根节点上（procedural_anim.static_actions）
    if root is not None and root.animation_data:
        return [root]
    return [o for o in bpy.context.scene.objects if o.animation_data or o.type == 'MESH']


def find_action(name):
    keys = ALIASES[name]
    for act in bpy.data.actions:
        low = act.name.lower()
        if any(k in low for k in keys):
            return act
    return None


def assign_action(targets, act):
    for o in targets:
        if o.animation_data is None:
            o.animation_data_create()
        o.animation_data.action = act
        if act is not None and hasattr(o.animation_data, 'action_slot') and getattr(act, 'slots', None):
            slot = next((s for s in act.slots if getattr(s, 'target_id_type', 'OBJECT') == 'OBJECT'), act.slots[0])
            try:
                o.animation_data.action_slot = slot
            except (TypeError, RuntimeError):
                pass


def apply_vis(name, f):
    """WC3 模型的 geoset 显隐（import_mdx.py 存在 mdx_vis 上）：比如攻击时才出现的飞刃、施法时才出现的光效"""
    for o in bpy.context.scene.objects:
        if 'mdx_vis' not in o: continue
        v = json.loads(o['mdx_vis']).get(name)
        o.hide_render = bool(v) and not v[min(len(v) - 1, max(0, int(round(f - 1))))]


def sample_frames(act, n, loop):
    if act is None:
        return [bpy.context.scene.frame_current] * 1
    a, b = act.frame_range
    if n <= 1 or b <= a:
        return [a]
    if loop:
        return [a + (b - a) * k / n for k in range(n)]
    return [a + (b - a) * k / (n - 1) for k in range(n)]


# ---------------------------------------------------------------- 渲染与拼图
GLOW = False                 # 光效模式：黑底出图，再把亮度换成 alpha（游戏里用 lighter 叠加，结果和原来一样）


def render_to_array(tmp_path):
    scene = bpy.context.scene
    scene.render.filepath = tmp_path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp_path, check_existing=False)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    arr = arr.reshape(h, w, 4)[::-1]           # Blender 像素从下往上，翻成从上往下
    if GLOW:                                   # 加法颜色 c → (c / a, a)，a = 最亮的通道
        a = np.clip(arr[..., :3].max(-1), 0, 1)
        arr[..., :3] = np.clip(arr[..., :3] / np.maximum(a, 1e-4)[..., None], 0, 1); arr[..., 3] = a
    return arr


def edge_clipped(arr):
    """返回被裁到的边：画面边缘有不透明像素 = 模型被画布裁掉了（arr 已是从上到下的行序）。"""
    a = arr[..., 3]
    edges = set()
    if a[0].max() > 0.1: edges.add('top')
    if a[-1].max() > 0.1: edges.add('bottom')
    if a[:, 0].max() > 0.1 or a[:, -1].max() > 0.1: edges.add('side')
    return edges


def render_entry(key, category, model, dirs=None, scale=1.0, actions=None, ppm=None):
    spec = CATEGORY[category]
    size = spec['size']
    dirs = int(dirs or spec['dirs'])
    actions = actions or spec['actions']
    load_model(model)
    apply_scale(float(scale or 1))
    ppm = float(ppm or spec.get('ppm', PPM))
    rig = setup_rig(size, ppm)
    if GLOW:
        w = bpy.context.scene.world; bpy.context.scene.render.film_transparent = False; w.color = (0, 0, 0)
        for n in (w.node_tree.nodes if w.node_tree else []):     # 世界默认是节点背景（灰色），也压成黑
            if n.type == 'BACKGROUND': n.inputs['Color'].default_value = (0, 0, 0, 1)
    targets = anim_targets()

    plan = []                                    # (动作名, Action, 帧时间列表)
    for name, n in actions.items():
        act = find_action(name)
        if act is None and name not in ('idle',):
            log(f'  - 没找到动作 "{name}"，跳过')
            continue
        frames = sample_frames(act, n if act else 1, LOOP[name])
        plan.append((name, act, frames))
    if not plan:
        plan.append(('idle', None, [bpy.context.scene.frame_current]))

    cols = max(len(f) for _, _, f in plan)
    rows = sum(dirs for _ in plan)
    tmp = os.path.join(tempfile.mkdtemp(prefix='sprites_'), 'frame.png')
    scene = bpy.context.scene
    # 有帧被裁切时自动调整后重渲（像素/米不变，游戏里的大小不受影响）：
    #   只裁到底边 / 顶边 → 先挪脚底锚点；裁到左右或锚点挪不动了 → 画布放大 25%
    anchor_y = ANCHOR[1]
    seen = set()
    MAX_TRY = 6
    for attempt in range(MAX_TRY):
        scene.render.resolution_x = scene.render.resolution_y = size
        scene.camera.data.ortho_scale = size / ppm
        scene.camera.data.shift_y = anchor_y - 0.5
        sheet = np.zeros((rows * size, cols * size, 4), dtype=np.float32)
        meta_actions, row, clipped, edges = {}, 0, set(), set()
        for name, act, frames in plan:
            assign_action(targets, act)
            fps = FPS[name]
            if name in REAL_TIME and act is not None and act.frame_range[1] > act.frame_range[0] and len(frames) > 1:
                fps = round(len(frames) * scene.render.fps / (act.frame_range[1] - act.frame_range[0]), 2)
            meta_actions[name] = dict(row=row, dirs=dirs, frames=len(frames), fps=fps, loop=LOOP[name])
            for d in range(dirs):
                # 方向 d：0=朝下(南) 1=西南 2=西 3=西北 4=北 5=东北 6=东 7=东南（顺时针）
                rig.rotation_euler = (0, 0, math.radians(45 * d))
                for c, f in enumerate(frames):
                    scene.frame_set(int(f), subframe=f - int(f)); apply_vis(name, f)
                    frame = render_to_array(tmp)
                    e = edge_clipped(frame)
                    if e:
                        clipped.add(name); edges |= e
                    sheet[row * size:(row + 1) * size, c * size:(c + 1) * size] = frame
                row += 1
            if attempt == 0:
                log(f'  {name}: {dirs} 方向 × {len(frames)} 帧')
        if not clipped:
            break
        seen |= edges
        if attempt == MAX_TRY - 1:
            log(f'  ⚠ 调整后仍被裁切：{"、".join(sorted(clipped))}。请在清单里调小 scale，或检查动作是否位移过大')
            break
        if 'side' in edges or {'top', 'bottom'} <= seen:      # 上下都裁过 / 左右被裁 → 只能放大画布
            size = int(round(size * 1.25 / 16) * 16)
            log(f'  画布太小（{"、".join(sorted(clipped))} 被裁切），放大到 {size}px 重渲')
        elif edges == {'bottom'} and anchor_y > 0.5:
            anchor_y = round(anchor_y - 0.08, 2)
            log(f'  {"、".join(sorted(clipped))} 裁到底边，脚底锚点上移到 {anchor_y} 重渲')
        elif edges == {'top'} and anchor_y < 0.8:
            anchor_y = round(anchor_y + 0.06, 2)
            log(f'  {"、".join(sorted(clipped))} 裁到顶边，脚底锚点下移到 {anchor_y} 重渲')
        else:
            size = int(round(size * 1.25 / 16) * 16)
            log(f'  画布太小（{"、".join(sorted(clipped))} 被裁切），放大到 {size}px 重渲')

    os.makedirs(OUT_DIR, exist_ok=True)
    fname = key.replace(':', '_')
    out_png = os.path.join(OUT_DIR, fname + '.png')
    img = bpy.data.images.new(fname, cols * size, rows * size, alpha=True)
    img.pixels.foreach_set(sheet[::-1].ravel())
    img.filepath_raw = out_png
    img.file_format = 'PNG'
    img.save()
    meta = dict(key=key, src='sprites/' + fname + '.png', frameW=size, frameH=size, cols=cols, rows=rows,
                anchor=[ANCHOR[0], anchor_y], unitsPerPixel=GAME_UNITS_PER_METER / ppm, pitch=PITCH, actions=meta_actions)
    with open(os.path.join(OUT_DIR, fname + '.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)
    log(f'✓ {key} → {out_png}（{cols * size}×{rows * size}）')


def parse_actions(s):
    if not s:
        return None
    out = {}
    for part in s.split(','):
        k, _, n = part.strip().partition(':')
        out[k.strip()] = int(n or 6)
    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--model'); ap.add_argument('--key'); ap.add_argument('--category', default='monster', choices=list(CATEGORY))
    ap.add_argument('--dirs'); ap.add_argument('--scale', default='1'); ap.add_argument('--actions', help='如 walk:8,death:6')
    ap.add_argument('--ppm', help='像素/米（覆盖类别默认值；大模型用小一点，图不至于太大）')
    ap.add_argument('--batch', help='清单 CSV（列：key,category,model,dirs,scale,actions）')
    ap.add_argument('--glow', action='store_true', help='光效模式（模型用 import_mdx.py --glow 导入）：黑底出图，亮度当 alpha')
    ap.add_argument('--skip-done', action='store_true', help='批量时跳过已经出过图的')
    args = ap.parse_args(argv)
    global GLOW; GLOW = args.glow
    if args.batch:
        base = os.path.dirname(os.path.abspath(args.batch))
        with open(args.batch, encoding='utf-8-sig') as fp:
            entries = list(csv.DictReader(fp))
        done = fail = skip = 0
        for e in entries:
            model = e.get('model', '').strip()
            mpath = model if os.path.isabs(model) else os.path.join(ROOT, model)
            if model and not os.path.exists(mpath):                 # 清单写的是 .blend，实际交的是 .glb/.fbx 也认
                stem = os.path.splitext(mpath)[0]
                mpath = next((stem + e for e in ('.blend', '.glb', '.gltf', '.fbx', '.obj') if os.path.exists(stem + e)), mpath)
            if not model or not os.path.exists(mpath):
                skip += 1
                continue
            if args.skip_done and os.path.exists(os.path.join(OUT_DIR, e['key'].replace(':', '_') + '.png')):
                skip += 1
                continue
            log(f'[{done + fail + 1}] {e["key"]}  ({e["category"]})  {model}')
            try:
                render_entry(e['key'], e['category'], mpath, e.get('dirs') or None, e.get('scale') or 1, parse_actions(e.get('actions')))
                done += 1
            except Exception as ex:                  # 单个失败不影响整批
                fail += 1
                log(f'✗ {e["key"]} 失败：{ex}')
        log(f'完成 {done}，失败 {fail}，跳过（没有模型文件或已完成）{skip}')
    else:
        if not args.model or not args.key:
            raise SystemExit('需要 --model 和 --key，或者用 --batch')
        render_entry(args.key, args.category, args.model, args.dirs, args.scale, parse_actions(args.actions), args.ppm)


if __name__ == '__main__':
    main()
