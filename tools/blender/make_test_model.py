"""生成一个低模占位角色（带 idle / walk / attack / death / spell / build 动作），用来测试出图流程。
  Blender -b -P tools/blender/make_test_model.py -- --out art/models/test_unit.blend --color 1,0.6,0.24
也是给建模同学的"格式样例"：原点在脚底、面朝 -Y、1 单位 = 1 米、动作按约定命名。
"""
import argparse, math, os, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--color', default='1,0.6,0.24')     # 护甲色：物理橙
ap.add_argument('--tower', action='store_true', help='加一个塔座')
args = ap.parse_args(argv)
col = [float(x) for x in args.color.split(',')] + [1]

bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgba, emit=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = 0.6
    if emit:
        bsdf.inputs['Emission Color'].default_value = rgba
        bsdf.inputs['Emission Strength'].default_value = emit
    return m

skin, armor, dark, steel = mat('skin', (0.85, 0.65, 0.5, 1)), mat('armor', col), mat('dark', (0.12, 0.12, 0.14, 1)), mat('steel', (0.8, 0.82, 0.86, 1), 0.3)
parts = []
def add(op, m, **kw):
    op(**kw); o = bpy.context.active_object; o.data.materials.append(m); parts.append(o); return o

base_z = 0
if args.tower:
    add(bpy.ops.mesh.primitive_cylinder_add, dark, vertices=8, radius=0.9, depth=0.6, location=(0, 0, 0.3))
    add(bpy.ops.mesh.primitive_cylinder_add, steel, vertices=8, radius=0.75, depth=0.15, location=(0, 0, 0.67))
    base_z = 0.75
add(bpy.ops.mesh.primitive_cylinder_add, armor, vertices=10, radius=0.32, depth=0.8, location=(0, 0, base_z + 0.75))      # 躯干
add(bpy.ops.mesh.primitive_uv_sphere_add, skin, segments=12, ring_count=8, radius=0.22, location=(0, 0, base_z + 1.38))   # 头
add(bpy.ops.mesh.primitive_cylinder_add, dark, vertices=8, radius=0.1, depth=0.7, location=(0.15, 0, base_z + 0.35))     # 腿
add(bpy.ops.mesh.primitive_cylinder_add, dark, vertices=8, radius=0.1, depth=0.7, location=(-0.15, 0, base_z + 0.35))
add(bpy.ops.mesh.primitive_cube_add, steel, size=1, location=(0.38, -0.35, base_z + 0.95), scale=(0.06, 0.6, 0.06))       # 武器指向 -Y（正面）
add(bpy.ops.mesh.primitive_uv_sphere_add, armor, segments=8, ring_count=6, radius=0.12, location=(0, -0.2, base_z + 1.42))  # 帽檐朝前

bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.active_object
body.name = 'TestUnit'
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')       # 原点在脚底

def make_action(name, keys):
    """keys: [(帧, 位置, 旋转(度))]"""
    body.animation_data_clear()
    for f, loc, rot in keys:
        body.location = loc
        body.rotation_euler = [math.radians(r) for r in rot]
        body.keyframe_insert('location', frame=f)
        body.keyframe_insert('rotation_euler', frame=f)
    act = body.animation_data.action
    act.name = name
    act.use_fake_user = True

make_action('Idle', [(1, (0, 0, 0), (0, 0, 0)), (13, (0, 0, 0.03), (0, 0, 0)), (25, (0, 0, 0), (0, 0, 0))])
make_action('Walk', [(1, (0, 0, 0), (0, 0, -6)), (7, (0, 0, 0.12), (8, 0, 0)), (13, (0, 0, 0), (0, 0, 6)), (19, (0, 0, 0.12), (8, 0, 0)), (25, (0, 0, 0), (0, 0, -6))])
make_action('Attack', [(1, (0, 0, 0), (0, 0, 0)), (5, (0, 0.15, 0), (-12, 0, 0)), (9, (0, -0.35, 0), (25, 0, 0)), (16, (0, 0, 0), (0, 0, 0))])
make_action('Death', [(1, (0, 0, 0), (0, 0, 0)), (8, (0, 0.2, 0.05), (-30, 0, 0)), (16, (0, 0.6, 0), (-88, 0, 0))])
make_action('Spell', [(1, (0, 0, 0), (0, 0, 0)), (8, (0, 0, 0.3), (-10, 0, 0)), (12, (0, 0, 0.35), (-10, 0, 180)), (20, (0, 0, 0), (0, 0, 360))])
make_action('Build', [(1, (0, 0, 0), (0, 0, 0)), (6, (0, 0, 0), (20, 0, 0)), (12, (0, 0, 0), (0, 0, 0))])
body.animation_data_clear()
body.location = (0, 0, 0); body.rotation_euler = (0, 0, 0)

out = os.path.abspath(args.out)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out)
print('saved', out)
