"""生成美术共用文件：
  art/models/_shared/tower_base.blend   标准塔座（所有塔共用，角色站在上面）
  art/models/_shared/比例参考.blend      比例参考 + 和出图脚本完全相同的相机（小键盘 0 预览出图构图）

  Blender -b -P tools/blender/make_reference_scene.py
"""
import math, os, sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_sprites as rs          # 复用出图脚本的相机参数，保证预览和出图一致

ROOT = rs.ROOT
OUT = os.path.join(ROOT, 'art', 'models', '_shared')
os.makedirs(OUT, exist_ok=True)


def mat(name, rgba, rough=0.8, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = rgba
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def build_base():
    """八角石质塔座：直径 1.8 m、高 0.6 m，顶面金边，顶面中心就是角色站立点。"""
    stone, trim, top = mat('塔座_石', (0.32, 0.31, 0.29, 1)), mat('塔座_金边', (0.75, 0.58, 0.22, 1), 0.4, 0.8), mat('塔座_顶面', (0.42, 0.4, 0.37, 1))
    parts = []
    def cyl(r, depth, z, m, verts=8):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(0, 0, z), rotation=(0, 0, math.pi / 8))
        o = bpy.context.active_object; o.data.materials.append(m); parts.append(o)
    cyl(0.9, 0.12, 0.06, stone)        # 底座
    cyl(0.8, 0.40, 0.32, stone)        # 柱身
    cyl(0.86, 0.06, 0.55, trim)        # 金边
    cyl(0.78, 0.04, 0.60, top)         # 顶面
    for i in range(8):                 # 柱身上的竖棱，增加石雕感
        a = math.pi / 8 + i * math.pi / 4
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * 0.8, math.sin(a) * 0.8, 0.32), scale=(0.06, 0.06, 0.2), rotation=(0, 0, a))
        o = bpy.context.active_object; o.data.materials.append(trim); parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    base = bpy.context.active_object
    base.name = 'TowerBase_塔座'
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return base


def dummy(name, height, x, color):
    """灰色比例人偶：胶囊体。"""
    m = mat(name, color)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=height * 0.14, depth=height * 0.72, location=(x, 0, height * 0.36))
    body = bpy.context.active_object; body.data.materials.append(m)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=height * 0.12, location=(x, 0, height * 0.86))
    head = bpy.context.active_object; head.data.materials.append(m)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=height * 0.06, depth=height * 0.15, location=(x, -height * 0.14, height * 0.86), rotation=(math.pi / 2, 0, 0))
    nose = bpy.context.active_object; nose.data.materials.append(mat('朝向标记', (1, 0.3, 0.2, 1)))   # 红色鼻子 = 正面（-Y）
    bpy.ops.object.select_all(action='DESELECT')
    for p in (body, head, nose): p.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    return o


def label(text, x, z):
    bpy.ops.object.text_add(location=(x, 0.9, z), rotation=(math.radians(90 - rs.PITCH), 0, 0))
    t = bpy.context.active_object; t.data.body = text; t.data.size = 0.28; t.data.align_x = 'CENTER'
    t.name = '标签_' + text


# 1) 标准塔座
bpy.ops.wm.read_factory_settings(use_empty=True)
build_base()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tower_base.blend'))

# 2) 比例参考场景
bpy.ops.wm.read_factory_settings(use_empty=True)
base = build_base(); base.location.x = -4.2
dummy('塔角色_1.8m', 1.8, -4.2, (0.6, 0.6, 0.62, 1)).location.z += 0.62     # 站在塔座顶面（0.62 m）上的塔角色
dummy('人形怪_1.8m', 1.8, -1.6, (0.85, 0.55, 0.3, 1))
dummy('守卫者_1.6m', 1.6, 0.6, (0.8, 0.4, 0.15, 1))
dummy('英雄塔_2.8m', 2.8, 3.0, (0.75, 0.6, 0.3, 1))
dummy('BOSS_5m', 5.0, 7.0, (0.6, 0.25, 0.25, 1))
for text, x, z in (('塔 = 塔座 + 角色', -4.2, 3.0), ('普通怪 1.8 m', -1.6, 2.3), ('守卫者', 0.6, 2.1), ('英雄塔', 3.0, 3.3), ('BOSS 4–6 m', 7.0, 5.5)):
    label(text, x, z)
rig = rs.setup_rig(rs.CATEGORY['tower']['size'])        # 和出图脚本完全相同的相机（塔的画布）
cam = bpy.context.scene.camera
cam.name = 'SPRITE_CAM（小键盘0：塔的出图构图）'
rig.location.x = -4.2                                    # 对准塔座
# 再放一台总览相机，方便一眼看全部比例
ov = bpy.data.cameras.new('总览'); ov.type = 'ORTHO'; ov.ortho_scale = 15
ovo = bpy.data.objects.new('总览相机', ov); bpy.context.scene.collection.objects.link(ovo)
t = math.radians(90 - rs.PITCH); ovo.location = (1.4, -math.sin(t) * 50, math.cos(t) * 50 + 2); ovo.rotation_euler = (t, 0, 0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, '比例参考.blend'))
# 渲染两张预览图给文档用
scene = bpy.context.scene
scene.render.filepath = os.path.join(OUT, '比例参考_塔出图构图.png'); bpy.ops.render.render(write_still=True)
scene.camera = ovo; scene.render.resolution_x, scene.render.resolution_y = 1200, 600
scene.render.filepath = os.path.join(OUT, '比例参考_总览.png'); bpy.ops.render.render(write_still=True)
print('[ref] saved to', OUT)
