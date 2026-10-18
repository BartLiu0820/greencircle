"""模型自动验收：检查交付的 3D 模型是否符合 art/美术配合说明.md 的规范，生成验收报告。

  Blender -b -P tools/blender/check_model.py -- --batch tools/blender/batch1.csv
  Blender -b -P tools/blender/check_model.py -- --model art/models/unit_nban.blend --category monster

报告写到 art/验收报告.md（批量时）。每项结果：✅ 通过 / ⚠ 警告（可以出图，但建议修） / ❌ 不通过（必须修）。
朝向（正面朝 -Y）和画风需要人工在 h5/sprite_viewer.html 里确认，脚本不判断。
"""
import argparse, csv, math, os, sys
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# 类别规格：高度范围（米）、占地直径上限（米）、三角面预算、必需动作
SPEC = {
    'monster': dict(h=(0.8, 2.6), foot=2.2, tris=(500, 6000), actions=['walk', 'death']),
    'boss':    dict(h=(2.5, 7.0), foot=5.5, tris=(2000, 20000), actions=['walk', 'death']),
    'tower':   dict(h=(1.8, 4.0), foot=2.2, tris=(1000, 15000), actions=['idle', 'attack']),
    'hero':    dict(h=(1.8, 4.0), foot=2.4, tris=(2000, 20000), actions=['idle', 'attack', 'spell']),
    'builder': dict(h=(1.0, 2.4), foot=2.0, tris=(1000, 10000), actions=['idle', 'walk', 'build']),
}
LOOPING = {'idle', 'walk', 'build'}
ALIASES = {'idle': ['idle', 'stand', '待机'], 'walk': ['walk', 'run', 'move', '行走'], 'attack': ['attack', 'atk', '攻击'],
           'death': ['death', 'die', 'dead', '死亡'], 'spell': ['spell', 'cast', '施法'], 'build': ['build', 'work', '建造']}
OK, WARN, FAIL = '✅', '⚠', '❌'


def load(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        {'.glb': lambda: bpy.ops.import_scene.gltf(filepath=path), '.gltf': lambda: bpy.ops.import_scene.gltf(filepath=path),
         '.fbx': lambda: bpy.ops.import_scene.fbx(filepath=path), '.obj': lambda: bpy.ops.wm.obj_import(filepath=path)}[ext]()


def find_action(name):
    for act in bpy.data.actions:
        if any(k in act.name.lower() for k in ALIASES[name]):
            return act
    return None


def world_bbox(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            v = ev.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
    return lo, hi


def tri_count(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in meshes:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles(); n += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def assign(targets, act):
    for o in targets:
        if o.animation_data is None:
            o.animation_data_create()
        o.animation_data.action = act
        if act is not None and hasattr(o.animation_data, 'action_slot') and getattr(act, 'slots', None):
            try:
                o.animation_data.action_slot = act.slots[0]
            except (TypeError, RuntimeError):
                pass


def pose_signature(targets):
    sig = []
    for o in targets:
        if o.type == 'ARMATURE' and o.pose:
            for b in o.pose.bones:
                sig.extend(b.matrix.to_translation()); sig.extend(b.matrix.to_euler())
        else:
            sig.extend(o.matrix_world.to_translation()); sig.extend(o.matrix_world.to_euler())
    return sig


def check(key, category, path):
    spec = SPEC[category]
    res = []                                     # (结果, 项目, 说明)
    try:
        load(path)
    except Exception as ex:
        return [(FAIL, '文件', f'打不开：{ex}')]
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == 'MESH' and o.visible_get()]
    arms = [o for o in scene.objects if o.type == 'ARMATURE']
    if not meshes:
        return [(FAIL, '网格', '文件里没有可见的网格')]
    targets = arms or [o for o in scene.objects if o.animation_data or o.type == 'MESH']

    # 在静止姿势（不放动作、骨骼归位）下量尺寸，动作里的起伏 / 摆动不影响结果
    assign(targets, None)
    for o in arms:
        for pb in o.pose.bones:
            pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    h = hi.z - lo.z
    foot = max(hi.x - lo.x, hi.y - lo.y)
    a, b = spec['h']
    res.append((OK if a <= h <= b else FAIL, '高度', f'{h:.2f} m（要求 {a}–{b} m{"；检查单位是否为米" if h > b * 5 or h < a / 5 else ""}）'))
    res.append((OK if foot <= spec['foot'] else WARN, '占地', f'{foot:.2f} m（建议 ≤ {spec["foot"]} m；含武器、披风等外伸部分）'))
    res.append((OK if abs(lo.z) <= 0.05 else FAIL, '原点高度', f'模型最低点 z = {lo.z:+.2f} m（脚底应在 0 附近，误差 ≤ 0.05 m）'))
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    res.append((OK if math.hypot(cx, cy) <= 0.35 else WARN, '原点居中', f'包围盒中心偏离原点 {math.hypot(cx, cy):.2f} m（建议 ≤ 0.35 m）'))

    if arms:
        res.append((OK if len(arms) == 1 else WARN, '骨架', f'{len(arms)} 个骨架（规范：1 个）'))
    else:
        res.append((WARN, '骨架', '没有骨架（只用物体动画也能出图，但正式模型应绑骨）'))

    for name in spec['actions']:
        act = find_action(name)
        if not act:
            res.append((FAIL, f'动作 {name}', f'没找到。动作名要包含关键词：{" / ".join(ALIASES[name][:3])}'))
            continue
        f0, f1 = act.frame_range
        dur = (f1 - f0) / (scene.render.fps or 24)
        note = f'"{act.name}"，{int(f1 - f0)} 帧（{dur:.1f} 秒）'
        status = OK
        if name in LOOPING:
            assign(targets, act)
            scene.frame_set(int(f0)); s0 = pose_signature(targets)
            scene.frame_set(int(f1)); s1 = pose_signature(targets)
            diff = max((abs(x - y) for x, y in zip(s0, s1)), default=0)
            if diff > 0.05:
                status = WARN; note += f'；首尾帧不一致（差 {diff:.2f}），循环时会跳一下'
        if dur < 0.2:
            status = WARN; note += '；时长过短'
        res.append((status, f'动作 {name}', note))

    tris = tri_count(meshes)
    lo_t, hi_t = spec['tris']
    res.append((OK if lo_t <= tris <= hi_t else WARN, '面数', f'{tris} 三角面（建议 {lo_t}–{hi_t}；AI 初稿通常过高，需要减面）'))

    big, missing = [], []
    for im in bpy.data.images:
        if im.source == 'FILE':
            if im.size[0] == 0 and not im.packed_file:
                missing.append(im.name)
            elif max(im.size) > 2048:
                big.append(f'{im.name} {im.size[0]}×{im.size[1]}')
    res.append((FAIL if missing else WARN if big else OK, '贴图', ('丢失：' + '、'.join(missing) if missing else '') + ('过大：' + '、'.join(big) if big else '') or '正常（建议打包进 .blend：文件 → 外部数据 → 打包资源）'))
    return res


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--model'); ap.add_argument('--category', default='monster', choices=list(SPEC)); ap.add_argument('--key', default='')
    ap.add_argument('--batch'); ap.add_argument('--report', default=os.path.join(ROOT, 'art', '验收报告.md'))
    args = ap.parse_args(argv)
    entries = []
    if args.batch:
        for e in csv.DictReader(open(args.batch, encoding='utf-8-sig')):
            p = os.path.join(ROOT, e['model'])
            stem = os.path.splitext(p)[0]
            p = next((stem + x for x in ('.blend', '.glb', '.gltf', '.fbx', '.obj') if os.path.exists(stem + x)), None)
            if p:
                entries.append((e['key'], e['category'], p, e.get('名称', '')))
    else:
        entries.append((args.key or os.path.basename(args.model), args.category, os.path.abspath(args.model), ''))
    lines = ['# 模型验收报告', '', '由 `tools/blender/check_model.py` 自动生成。✅ 通过 / ⚠ 警告（可以出图，建议修） / ❌ 不通过（必须修）。',
             '朝向和画风需要在 `h5/sprite_viewer.html` 里人工确认。', '']
    summary = []
    for key, cat, path, name in entries:
        res = check(key, cat, path)
        worst = FAIL if any(r[0] == FAIL for r in res) else WARN if any(r[0] == WARN for r in res) else OK
        summary.append(f'| {worst} | `{key}` | {name} | {cat} | {os.path.relpath(path, ROOT)} |')
        lines += [f'## {worst} {key} {name}', '', f'文件：`{os.path.relpath(path, ROOT)}`　类别：{cat}', '', '| 结果 | 项目 | 说明 |', '|---|---|---|']
        lines += [f'| {r[0]} | {r[1]} | {r[2]} |' for r in res] + ['']
        print(f'[check] {worst} {key}: ' + '；'.join(f'{r[1]}{r[0]}' for r in res if r[0] != OK) or '全部通过', flush=True)
    lines[5:5] = ['## 总览', '', '| 结果 | key | 名称 | 类别 | 文件 |', '|---|---|---|---|---|'] + summary + ['']
    if args.batch or args.report != os.path.join(ROOT, 'art', '验收报告.md'):
        with open(args.report, 'w', encoding='utf-8') as fp:
            fp.write('\n'.join(lines) + '\n')
        print('[check] 报告：', args.report, f'（{len(entries)} 个模型）', flush=True)
    else:
        print('\n'.join(lines))


main()
