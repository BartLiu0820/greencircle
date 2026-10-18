"""AI 初稿自动修整：把 AI 生成 / Mixamo 下载的模型整理成符合规范的 .blend。
做的是"机械"的那部分；贴图修整、造型调整仍需人工。

  Blender -b -P tools/blender/prep_model.py -- --in 下载/bandit.glb --out art/models/unit_nban.blend --category monster \
      --height 1.7 --anims 下载/bandit_anims/

做了什么：
  1. 导入（.glb / .gltf / .fbx / .obj / .blend），删掉自带的相机和灯光
  2. 可选旋转（--rotate 90/180/270，模型正面不朝 -Y 时用）
  3. 统一缩放到目标身高（米），原点放到脚底中心
  4. 面数超预算时自动减面（--tris 指定目标，默认按类别）
  5. 合并动作：--anims 文件夹里的 walk.fbx / attack.fbx / death.fbx …（Mixamo 下载时选 "Without Skin"）
     按文件名改成规范的动作名；行走动作如果带位移，会自动去掉水平位移（等同于 Mixamo 的 In Place）
  6. --pedestal：塔专用，把角色放到标准塔座顶面（art/models/_shared/tower_base.blend）
  7. 打包贴图，另存为 .blend
完成后再跑 check_model.py 自动验收。
"""
import argparse, glob, math, os, sys
import bpy
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HEIGHT = {'monster': 1.8, 'boss': 4.5, 'tower': 2.0, 'hero': 2.8, 'builder': 1.6}       # 塔指的是角色身高（不含塔座）；试做后从 1.7 调到 2.0，站在塔座上更醒目
TRIS = {'monster': 3000, 'boss': 12000, 'tower': 6000, 'hero': 12000, 'builder': 6000}
PEDESTAL_TOP = 0.62
ACTION_NAMES = ['idle', 'walk', 'attack', 'death', 'spell', 'build']
DEFAULT_RENAME = 'idle:idle,walk:walk,fall:death,dying:death,slash:attack,shoot:attack,jump:spell'
# 文件名 → 规范动作名（按顺序匹配；最稳妥的是直接把文件命名成 walk.fbx 这样）
FILE_ALIASES = [('idle', ['idle', 'stand', 'breath']), ('walk', ['walk', 'run', 'move']), ('death', ['death', 'dying', 'die', 'dead']),
                ('attack', ['attack', 'slash', 'punch', 'swing', 'shoot', 'stab', 'atk']), ('spell', ['spell', 'cast', 'magic', 'roar']),
                ('build', ['build', 'hammer', 'work'])]


def log(*a):
    print('[prep]', *a, flush=True)


def import_file(path):
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == '.blend':
        with bpy.data.libraries.load(path) as (src, dst):
            dst.objects = src.objects
            dst.actions = src.actions
        for o in dst.objects:
            if o is not None:
                bpy.context.scene.collection.objects.link(o)
    else:
        raise SystemExit('不支持的格式：' + ext)
    return [o for o in bpy.data.objects if o not in before]


def world_bbox(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            v = ev.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    return lo, hi


def tri_count(o):
    me = o.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def decimate(meshes, target):
    total = sum(tri_count(o) for o in meshes)
    if total <= target:
        log(f'面数 {total}，在预算 {target} 以内，不减面')
        return
    ratio = max(0.02, target / total)
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('自动减面', 'DECIMATE')
        mod.ratio = ratio
        while o.modifiers.find(mod.name) > 0:              # 放到骨骼修改器之前再应用
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    log(f'面数 {total} → {sum(tri_count(o) for o in meshes)}（目标 {target}）')


def assign(o, act):
    if o.animation_data is None:
        o.animation_data_create()
    o.animation_data.action = act
    if act is not None and hasattr(o.animation_data, 'action_slot') and getattr(act, 'slots', None):
        try:
            o.animation_data.action_slot = act.slots[0]
        except (TypeError, RuntimeError):
            pass


def fcurves_of(act):
    """兼容 Blender 4.4+ 的分层动作（layers → strips → channelbags）和旧版 act.fcurves。"""
    if hasattr(act, 'layers') and act.layers:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    out.extend(bag.fcurves)
        if out:
            return out
    return list(getattr(act, 'fcurves', []))


def strip_root_motion(act):
    """去掉根骨骼（髋部）的水平位移：首尾差值占整个范围一半以上的位置通道视为"在走路"，压平到第一帧的值。"""
    fixed = 0
    for fc in fcurves_of(act):
        if not fc.data_path.endswith('location'):
            continue
        if 'pose.bones' in fc.data_path and not any(k in fc.data_path.lower() for k in ('hips', 'root', 'pelvis')):
            continue
        pts = fc.keyframe_points
        if len(pts) < 2:
            continue
        vals = [p.co[1] for p in pts]
        span = max(vals) - min(vals)
        if span > 0.2 and abs(vals[-1] - vals[0]) > span * 0.5:
            for p in pts:
                p.co[1] = vals[0]; p.handle_left[1] = vals[0]; p.handle_right[1] = vals[0]
            fixed += 1
    return fixed


def merge_anims(arm, folder):
    files = sorted(glob.glob(os.path.join(folder, '*.fbx')) + glob.glob(os.path.join(folder, '*.glb')))
    if not files:
        log('动作文件夹里没有 .fbx / .glb'); return
    for f in files:
        stem = os.path.splitext(os.path.basename(f))[0].lower()
        name = next((n for n, keys in FILE_ALIASES if any(k in stem for k in keys)), stem)
        acts_before = set(bpy.data.actions)
        new = import_file(f)
        new_acts = [a for a in bpy.data.actions if a not in acts_before]
        if not new_acts:
            log(f'  {os.path.basename(f)}：没有动作数据，跳过')
        else:
            act = max(new_acts, key=lambda a: a.frame_range[1] - a.frame_range[0])
            old = bpy.data.actions.get(name)
            if old and old is not act:
                old.name = name + '_旧'
            act.name = name
            act.use_fake_user = True
            n = strip_root_motion(act) if name in ('walk', 'idle', 'build') else 0
            log(f'  {os.path.basename(f)} → 动作 "{name}"（{int(act.frame_range[1] - act.frame_range[0])} 帧）' + (f'，去掉了 {n} 条水平位移曲线' if n else ''))
            for a in new_acts:
                if a is not act:
                    bpy.data.actions.remove(a)
        for o in new:                                       # 删掉动作文件带进来的骨架 / 网格
            bpy.data.objects.remove(o, do_unlink=True)
    assign(arm, bpy.data.actions.get('idle') or bpy.data.actions.get('walk'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--category', default='monster', choices=list(HEIGHT))
    ap.add_argument('--height', type=float); ap.add_argument('--tris', type=int)
    ap.add_argument('--rotate', type=float, default=0, help='绕竖轴旋转的角度（模型正面不朝 -Y 时用）')
    ap.add_argument('--anims', help='动作文件夹：walk.fbx、attack.fbx、death.fbx …')
    ap.add_argument('--pedestal', action='store_true', help='塔：放到标准塔座上')
    ap.add_argument('--rename', default='', help='动作改名，如 fall:death,slash:attack（按包含关系匹配）')
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = import_file(os.path.abspath(args.src))
    for o in list(objs):
        if o.type in ('CAMERA', 'LIGHT'):
            objs.remove(o); bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in objs if o.type == 'MESH']
    arms = [o for o in objs if o.type == 'ARMATURE']
    if arms:   # 有骨架时，没绑到骨架上的网格是辅助物体（如 Tripo 绑骨输出里的 Icosphere），删掉，否则会把身高量错
        skinned = [o for o in meshes if o.parent in arms or any(m.type == 'ARMATURE' for m in o.modifiers)]
        for o in meshes:
            if o not in skinned:
                log(f'删除未绑定骨架的辅助网格：{o.name}')
                objs.remove(o); bpy.data.objects.remove(o, do_unlink=True)
        meshes = skinned
    if not meshes:
        raise SystemExit('没有找到网格')
    log(f'导入：{len(meshes)} 个网格，{len(arms)} 个骨架，{len(bpy.data.actions)} 个动作')

    # 所有顶层物体挂到一个根节点上，统一缩放、平移、旋转（不改骨骼本身，动画不受影响）
    root = bpy.data.objects.new('MODEL_ROOT', None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    if args.rotate:
        root.rotation_euler.z = math.radians(args.rotate)
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    h = hi.z - lo.z
    target_h = args.height or HEIGHT[args.category]
    k = target_h / h if h > 0 else 1
    root.scale = (k, k, k)
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z + (PEDESTAL_TOP if args.pedestal else 0))
    log(f'高度 {h:.3f} → {target_h} m（缩放 ×{k:.3f}），原点移到脚底')

    decimate(meshes, args.tris or TRIS[args.category])

    if args.anims:
        if not arms:
            log('⚠ 没有骨架，无法合并动作（先用 Mixamo 绑骨，下载带骨架的 FBX 作为 --in）')
        else:
            if not args.src.lower().endswith('.fbx'):
                log('⚠ 模型不是 FBX，而动作一般是 FBX：两种格式导入后骨骼方向可能不一致，导致动作歪斜。'
                    '建议模型也用 Mixamo 下载的 FBX（With Skin）')
            merge_anims(arms[0], args.anims)

    if args.pedestal:
        base = os.path.join(ROOT, 'art', 'models', '_shared', 'tower_base.blend')
        with bpy.data.libraries.load(base) as (src, dst):
            dst.objects = [n for n in src.objects if n.startswith('TowerBase')]
        for o in dst.objects:
            bpy.context.scene.collection.objects.link(o)
        log('已放到标准塔座上（顶面 z = 0.62 m）')

    # 动作改名：Tripo 预设动作（fall / slash / shoot / jump）等 → 规范名
    rules = [r.split(':') for r in (args.rename or DEFAULT_RENAME).split(',') if ':' in r]
    for a in list(bpy.data.actions):
        low = a.name.lower()
        if low in ACTION_NAMES:
            continue
        for src, dst in rules:
            if src.strip().lower() in low and not bpy.data.actions.get(dst.strip()):
                log(f'动作改名："{a.name}" → "{dst.strip()}"')
                a.name = dst.strip()
                break
    for a in bpy.data.actions:
        if a.name in ('walk', 'idle', 'build'):
            n = strip_root_motion(a)
            if n:
                log(f'  "{a.name}" 去掉了 {n} 条水平位移曲线')
        a.use_fake_user = True
    try:
        bpy.ops.file.pack_all()
    except RuntimeError as ex:
        log('⚠ 打包贴图失败：', ex)
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    log('已保存', out, '｜动作：', '、'.join(a.name for a in bpy.data.actions) or '无')
    log('下一步：Blender -b -P tools/blender/check_model.py -- --model', os.path.relpath(out, ROOT), '--category', args.category)


main()
