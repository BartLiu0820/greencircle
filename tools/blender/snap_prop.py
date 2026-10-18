"""把生成时"漂在旁边"的道具（没拿在手上的法杖、魔杖等）挪到最近的手里，并只绑到手骨上。
  Blender -b -P tools/blender/snap_prop.py -- --model art/models/tower_灵魂塔.blend [--flip] [--grip 0.3]
  --flip：道具上下颠倒（比如火焰朝下）时翻过来；--grip：握在道具从下往上的哪个位置（0 = 底端）
自动找离身体最远、而且不和身体相连的一块网格作为道具。改完只需重新出图，不要再跑 process_incoming（会覆盖）。
"""
import argparse, os, sys
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser(); ap.add_argument('--model', required=True); ap.add_argument('--flip', action='store_true')
ap.add_argument('--grip', type=float, default=0.3)
args = ap.parse_args(argv)
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.model))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mo = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
for o in (arm,):
    o.data.pose_position = 'REST'
bpy.context.view_layer.update()
me = mo.data
# 网格分块（边相连）
parent = list(range(len(me.vertices)))
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for e in me.edges:
    a, b = find(e.vertices[0]), find(e.vertices[1])
    if a != b: parent[a] = b
parts = {}
for v in me.vertices:
    parts.setdefault(find(v.index), []).append(v.index)
W = mo.matrix_world
pos = lambda i: W @ me.vertices[i].co
# Tripo 的网格常被拆成很多块，身体中心用全部顶点的平均
allc = sum((pos(v.index) for v in me.vertices), Vector()) / len(me.vertices)
ctr = lambda p: sum((pos(i) for i in p), Vector()) / len(p)
cands = [p for p in parts.values() if len(p) < 0.2 * len(me.vertices)]
# 道具 = 离身体中心（水平）最远的那块，加上中心离它 0.35 m 以内的其它块（杖身 + 火焰等）
far = max(cands, key=lambda p: (ctr(p) - allc).xy.length)
# 从最远那块开始往外扩：中心落在已选部分包围盒（外扩 0.3 m，杖身和火焰之间可能有空隙）里、且离身体比较远的块都算进来
def bbox(ix):
    q = [pos(i) for i in ix]
    return (Vector((min(p.x for p in q), min(p.y for p in q), min(p.z for p in q))) - Vector((0.3,) * 3),
            Vector((max(p.x for p in q), max(p.y for p in q), max(p.z for p in q))) + Vector((0.3,) * 3))
sel, prop = [far], list(far)
dfar = (ctr(far) - allc).xy.length
while True:
    lo_, hi_ = bbox(prop)
    add = [p for p in cands if p not in sel and all(lo_[k] <= ctr(p)[k] <= hi_[k] for k in range(3))
           and (ctr(p) - allc).xy.length > 0.6 * dfar]
    if not add:
        break
    sel += add; prop += [i for p in add for i in p]
pts = [pos(i) for i in prop]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (lo + hi) / 2
# 手 = 水平方向伸得最远的两根末端骨骼（左右手）里离道具近的那根
tips = sorted([b for b in arm.data.bones if not b.children],
              key=lambda b: -((arm.matrix_world @ b.tail_local) - allc).xy.length)[:2]
hand = min(tips, key=lambda b: ((arm.matrix_world @ b.tail_local) - c).length)
ht = arm.matrix_world @ hand.tail_local
R = Matrix.Rotation(3.14159265, 4, 'X') if args.flip else Matrix.Identity(4)
grip_z = lo.z + args.grip * (hi.z - lo.z)
if args.flip:
    grip_z = hi.z - args.grip * (hi.z - lo.z)
grip = Vector((c.x, c.y, grip_z))
T = Matrix.Translation(ht) @ R @ Matrix.Translation(-grip)
Wi = W.inverted()
for i in prop:
    me.vertices[i].co = Wi @ (T @ pos(i))
# 只绑到手骨
g = mo.vertex_groups.get(hand.name) or mo.vertex_groups.new(name=hand.name)
for i in prop:
    for vg in mo.vertex_groups:
        vg.remove([i])
    g.add([i], 1.0, 'REPLACE')
arm.data.pose_position = 'POSE'
print(f'[snap] 道具 {len(prop)} 个顶点（{len(cands)} 个候选块）挪到手 {hand.name}，翻转={args.flip}')
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.model))
