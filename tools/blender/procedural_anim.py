"""程序化动作：在 Tripo 自动绑骨的骨架上生成 idle / walk / attack / death / spell / build。
（Tripo 的套动作接口暂时不可用，见 art/试做结果.md。以后有 Mixamo / Tripo 动作时，同名动作会被保留，不会覆盖。）

  Blender -b -P tools/blender/procedural_anim.py -- --model art/models/unit_nban.blend --category monster
  加 --force 重新生成（覆盖已有的同名动作）

骨架识别（不依赖骨骼名里的 Left/Right，Tripo 的命名不可靠）：
  - 躯干：Root → Spine_* → Head_*；名字带 Spine / Head 的骨骼
  - 四肢：名字带 Limb 的链；链首挂在 Root 下（或位置低于脊柱底部）= 腿，挂在脊柱上 = 手臂
  - 左右：链首在骨架空间的 Y 坐标正负
  - 朝向：Tripo 骨架面朝 +X（--forward 可改）
"""
import argparse, math, os, re, sys
import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 24
CATEGORY_ACTIONS = {
    'monster': ['walk', 'death'],
    'boss': ['walk', 'death', 'spell'],
    'tower': ['idle', 'attack'],
    'hero': ['idle', 'attack', 'spell'],
    'builder': ['idle', 'walk', 'build'],
}


def log(*a):
    print('[anim]', *a, flush=True)


# ---------------------------------------------------------------- 骨架分析
class Rig:
    """按骨架的结构和位置识别躯干、头、四肢（不依赖骨骼名，Tripo 有的模型命名是乱的）。"""
    def __init__(self, arm, forward):
        self.arm = arm
        bones = list(arm.data.bones)
        self.F = Vector(forward).normalized()
        self.U = Vector((0, 0, 1))
        self.L = self.U.cross(self.F).normalized()         # 面朝 +X 时左侧是 +Y
        self.root = next(b for b in bones if b.parent is None)
        zs = [b.tail_local.z for b in bones] + [b.head_local.z for b in bones]
        zmin, self.H = min(zs), max(zs) - min(zs)
        lat = lambda v: abs(v.dot(self.L))

        # 1) 躯干：根骨骼到"最高且居中"的末端骨骼（头顶）之间的路径
        leaves = [b for b in bones if not b.children]
        centered = [b for b in leaves if lat(b.tail_local) < 0.15 * self.H] or leaves
        top = max(centered, key=lambda b: b.tail_local.z)
        torso, b = [], top
        while b is not None:
            torso.append(b); b = b.parent
        torso.reverse()
        if top.tail_local.z < zmin + 0.6 * self.H:
            # 骨架没有居中的头骨骼（Tripo 有时把脊柱命名成 Limb，头不单独成骨）：
            # 从根骨骼往上走，每步选"朝上、居中、子树最高"的子骨骼，走到分叉成手臂为止
            up = lambda c: (c.tail_local - c.head_local).z > 0.5 * (c.tail_local - c.head_local).length
            top_z = lambda c: max([c.tail_local.z] + [top_z(k) for k in c.children])
            torso, b = [self.root], self.root
            while True:
                nxt = [c for c in b.children if up(c) and lat(c.head_local) < 0.15 * self.H and c.head_local.z > zmin + 0.3 * self.H]
                if not nxt:
                    break
                b = max(nxt, key=top_z); torso.append(b)
            log(f'没有居中的头骨骼，按"朝上的主干"认躯干：{[t.name for t in torso]}')
        tset = set(t.name for t in torso)

        # 2) 从躯干分出去的每个分支是肢体候选；沿"伸得最远"的子链走（手指分叉时取最长那支）
        def reach(b, origin):
            return max([(b.tail_local - origin).length] + [reach(c, origin) for c in b.children])
        def main_chain(b):
            ch = [b]
            while b.children:
                b = max(b.children, key=lambda c: reach(c, c.head_local))
                ch.append(b)
            return ch
        cands = []
        for t in torso:
            for c in t.children:
                if c.name in tset:
                    continue
                # 分支一开始就分成两条长链（如一根髋骨下挂两条腿）→ 拆成两条肢体
                long_kids = [k for k in c.children if reach(k, k.head_local) > 0.22 * self.H]
                starts = long_kids if len(long_kids) >= 2 else [c]
                for st in starts:
                    length = reach(st, st.head_local)
                    # 头发、斗篷等小骨骼忽略；挂在根骨骼下的是腿，长袍角色的腿很短，门槛放低
                    if length > (0.12 if t is torso[0] else 0.22) * self.H:
                        cands.append((c.head_local.z, main_chain(st), length))
        # 3) 挂得最低的两条 = 腿；剩下挂得高、分在左右两侧的 = 手臂
        cands.sort(key=lambda x: x[0])
        legs = [c[1] for c in cands[:2]]
        rest = [c[1] for c in cands[2:]]
        tipside = lambda ch: ch[-1].tail_local.dot(self.L)
        left = [c for c in rest if tipside(c) > 0]
        right = [c for c in rest if tipside(c) < 0]
        pick = lambda cs: max(cs, key=lambda ch: abs(tipside(ch))) if cs else None
        arms = [c for c in (pick(left), pick(right)) if c]
        self.extra_branches = [c for c in rest if c not in arms]          # 没被认成手臂的长分支（可能是道具骨骼，如法杖）

        def strip_lateral(ch):         # 跳过开头接近水平的骨骼（锁骨、髋骨），从真正的肩 / 髋关节开始摆
            while len(ch) > 2:
                v = ch[0].tail_local - ch[0].head_local
                if abs(v.z) < 0.35 * lat(v):           # 接近水平（倾斜 < 约 20°）才算锁骨 / 髋骨
                    ch = ch[1:]
                else:
                    break
            return ch
        side = lambda ch: ch[-1].tail_local.dot(self.L)
        self.legs = sorted([strip_lateral(c) for c in legs], key=side, reverse=True)       # [左, 右]
        self.arms = sorted([strip_lateral(c) for c in arms], key=side, reverse=True)
        # 脊柱 = 躯干上朝上的骨骼（不含最顶上的头）；头 = 躯干最上面一节
        self.head = [torso[-1]]
        self.spine = [t for t in torso[1:-1] if (t.tail_local - t.head_local).z > 0.3 * (t.tail_local - t.head_local).length]
        log(f'骨架：脊柱 {len(self.spine)}，头 {len(self.head)}，腿 {len(self.legs)} 条，手臂 {len(self.arms)} 条，高 {self.H:.2f}'
            f'（腿 {[c[0].name for c in self.legs]}，手臂 {[c[0].name + "…" + c[-1].name for c in self.arms]}）')
        if len(self.legs) < 2 or len(self.arms) < 2:
            log('⚠ 没认全两条腿和两条手臂，动作可能不完整')

    def pb(self, bone):
        return self.arm.pose.bones[bone.name]


def set_rot(rig, bone, axis, deg, extra=None):
    """绕骨架空间的轴 axis 转 deg 度（围绕骨骼根部），换算成骨骼自身空间的四元数。"""
    pb = rig.pb(bone)
    pb.rotation_mode = 'QUATERNION'
    M = bone.matrix_local.to_3x3()
    R = Quaternion(axis, math.radians(deg)).to_matrix()
    if extra is not None:
        R = extra @ R
    pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()


def rot_mat(axis, deg):
    return Quaternion(axis, math.radians(deg)).to_matrix()


def set_loc(rig, bone, vec):
    pb = rig.pb(bone)
    pb.location = bone.matrix_local.to_3x3().inverted() @ Vector(vec)


def key_all(rig, frame):
    for pb in rig.arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


def reset(rig):
    for pb in rig.arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


# 便捷：四肢绕"侧轴"前后摆。正数 = 末端往前（腿往前抬 / 手臂往前上举）
def swing(rig, bone, deg):
    set_rot(rig, bone, -rig.L, deg)


def lean(rig, bone, deg):            # 躯干前倾（正数 = 向前）
    set_rot(rig, bone, rig.L, deg)


def twist(rig, bone, deg):           # 躯干绕竖轴扭转
    set_rot(rig, bone, rig.U, deg)


def spread(rig, chain, side_sign, deg):   # 手臂向外张开（侧平举方向）
    set_rot(rig, chain[0], rig.F, deg * side_sign)


# ---------------------------------------------------------------- 动作
def pose_spine(rig, lean_deg=0, twist_deg=0):
    n = max(1, len(rig.spine))
    for b in rig.spine:
        pb = rig.pb(b)
        M = b.matrix_local.to_3x3()
        R = rot_mat(rig.U, twist_deg / n) @ rot_mat(rig.L, lean_deg / n)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()


def act_idle(rig):
    for i, f in enumerate(range(0, 49, 6)):
        t = 2 * math.pi * f / 48
        reset(rig)
        pose_spine(rig, lean_deg=2 + 2 * math.sin(t))
        if rig.head:
            lean(rig, rig.head[0], -2 * math.sin(t))
        for k, arm in enumerate(rig.arms):
            swing(rig, arm[0], 4 * math.sin(t + k))
            if len(arm) > 1:
                swing(rig, arm[1], 6 + 3 * math.sin(t))
        set_loc(rig, rig.root, rig.U * (0.006 * rig.H * math.sin(2 * t)))
        key_all(rig, f + 1)
    return 49


def act_walk(rig):
    N = 24
    for f in range(0, N + 1, 3):
        t = 2 * math.pi * f / N
        reset(rig)
        for k, leg in enumerate(rig.legs[:2]):
            ph = t + k * math.pi
            swing(rig, leg[0], 36 * math.sin(ph))
            if len(leg) > 1:      # 膝盖：腿往前收的半程弯曲（小腿往后折）
                swing(rig, leg[1], -(8 + 50 * max(0.0, math.cos(ph))))
            if len(leg) > 2:
                swing(rig, leg[2], 10 * max(0.0, -math.sin(ph)))
        for k, arm in enumerate(rig.arms[:2]):
            ph = t + k * math.pi + math.pi            # 手臂和同侧腿反相
            swing(rig, arm[0], 34 * math.sin(ph))
            if len(arm) > 1:
                swing(rig, arm[1], 12 + 10 * max(0.0, math.sin(ph)))
        pose_spine(rig, lean_deg=8, twist_deg=10 * math.sin(t))
        set_loc(rig, rig.root, rig.U * (0.04 * rig.H * math.cos(2 * t)))
        key_all(rig, f + 1)
    return N + 1


def strike_arm(rig):
    """持武器的手：右手（Y 负的一侧），没有就第一条手臂。"""
    return rig.arms[-1] if rig.arms else None


def act_attack(rig, frames=18):
    arm = strike_arm(rig)
    keys = [  # (帧, 肩, 肘, 前倾, 扭转)
        (1, 0, 8, 0, 0),
        (6, 150, 40, -8, 18),      # 抬手蓄力（举过头顶）
        (9, 45, 5, 14, -22),       # 劈下
        (12, 35, 10, 12, -18),
        (frames, 0, 8, 0, 0),
    ]
    for f, sh, el, ln, tw in keys:
        reset(rig)
        pose_spine(rig, lean_deg=ln, twist_deg=tw)
        if arm:
            swing(rig, arm[0], sh)
            if len(arm) > 1:
                swing(rig, arm[1], el)
        for other in rig.arms[:-1]:
            swing(rig, other[0], -10 + ln * 0.5)
        key_all(rig, f)
    return frames


def act_build(rig):
    # 循环的敲锤动作
    arm = strike_arm(rig)
    for f, sh, el, ln in [(1, 30, 20, 10), (6, 130, 50, 0), (10, 25, 10, 18), (16, 30, 20, 10)]:
        reset(rig)
        pose_spine(rig, lean_deg=ln)
        if arm:
            swing(rig, arm[0], sh)
            if len(arm) > 1:
                swing(rig, arm[1], el)
        for leg in rig.legs:
            if len(leg) > 1:
                swing(rig, leg[0], 10); swing(rig, leg[1], -18)
        set_loc(rig, rig.root, -rig.U * (0.02 * rig.H))
        key_all(rig, f)
    return 16


def act_spell(rig):
    keys = [  # (帧, 双臂, 肘, 前倾, 头仰)
        (1, 0, 8, 0, 0),
        (8, 160, 20, -12, -10),    # 双手高举
        (12, 85, 0, 14, 6),        # 向前释放
        (16, 80, 5, 10, 4),
        (22, 0, 8, 0, 0),
    ]
    for f, sh, el, ln, hd in keys:
        reset(rig)
        pose_spine(rig, lean_deg=ln)
        if rig.head:
            lean(rig, rig.head[0], hd)
        for k, arm in enumerate(rig.arms[:2]):
            side = 1 if k == 0 else -1
            pb = rig.pb(arm[0]); M = arm[0].matrix_local.to_3x3()
            R = rot_mat(-rig.L, sh) @ rot_mat(rig.F, side * -12)      # 前举 + 稍微外张
            pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
            if len(arm) > 1:
                swing(rig, arm[1], el)
        key_all(rig, f)
    return 22


def act_death(rig):
    keys = [  # (帧, 后倒角度, 手臂外张, 屈膝, 前倾)
        (1, 0, 0, 0, 0),
        (5, 18, 12, 20, -10),      # 受击后仰
        (10, 55, 18, 25, -18),
        (15, 84, 22, 8, -24),      # 倒地，脊柱伸直（驼背角色躺下才不会缩成一团）
        (20, 86, 22, 4, -26),      # 手臂只微微张开：长臂角色（大红牛）摊开会占满画面
    ]
    for f, fall, out, knee, ln in keys:
        reset(rig)
        set_rot(rig, rig.root, -rig.L, fall)       # 绕脚底向后倒
        # 同时往前挪半个身长：躺平的身体以原站立点为中心，画布不用是身高的两倍
        set_loc(rig, rig.root, rig.F * (0.5 * rig.H * math.sin(math.radians(fall))))
        pose_spine(rig, lean_deg=ln)
        if rig.head:
            lean(rig, rig.head[0], ln * 0.6)
        for k, arm in enumerate(rig.arms[:2]):     # 手臂向两侧摊开（不举过头顶，躺下后不会太长）
            side = 1 if k == 0 else -1
            pb = rig.pb(arm[0]); M = arm[0].matrix_local.to_3x3()
            R = rot_mat(rig.F, -side * out) @ rot_mat(-rig.L, out * 0.4)
            pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
        for leg in rig.legs:
            swing(rig, leg[0], knee)
            if len(leg) > 1:
                swing(rig, leg[1], -knee * 1.4)
        key_all(rig, f)
    return 20


# ---------------------------------------------------------------- 道具权重修正
def mesh_parts(me):
    """网格的真实部件：边相连 + 位置重合（贴图接缝处被拆开的顶点）的顶点归为一块。"""
    parent = list(range(len(me.vertices)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for e in me.edges:
        ra, rb = find(e.vertices[0]), find(e.vertices[1])
        if ra != rb: parent[ra] = rb
    pos = {}
    for v in me.vertices:
        k = tuple(round(c, 4) for c in v.co)
        if k in pos:
            ra, rb = find(v.index), find(pos[k])
            if ra != rb: parent[ra] = rb
        else:
            pos[k] = v.index
    parts = {}
    for v in me.vertices:
        parts.setdefault(find(v.index), []).append(v.index)
    return sorted(parts.values(), key=len, reverse=True)


def fix_props(rig, mo):
    """手持道具（锤、刀、杖）被 AI 绑到了腿 / 根骨骼上时，改绑到最近那只手。
    道具 = 伸出主体包围盒的独立部件，当前主要绑在腿、根骨骼或躯干上，且离某只手不远。"""
    if not rig.arms:
        return
    me = mo.data
    M = rig.arm.matrix_world.inverted() @ mo.matrix_world
    co = [M @ v.co for v in me.vertices]
    parts = mesh_parts(me)
    def extent(part):
        ps = [co[i] for i in part]
        return (max(p.x for p in ps) - min(p.x for p in ps)) * (max(p.y for p in ps) - min(p.y for p in ps)) * (max(p.z for p in ps) - min(p.z for p in ps))
    body = max(parts, key=extent)            # 主体 = 空间范围最大的部件（不是顶点最多的：装饰物可能顶点很多）
    lo = Vector([min(co[i][j] for i in body) for j in range(3)]); hi = Vector([max(co[i][j] for i in body) for j in range(3)])
    pad = 0.02 * rig.H
    gname = {g.index: g.name for g in mo.vertex_groups}
    def subtree(b):
        out, st = set(), [b]
        while st:
            x = st.pop(); out.add(x.name); st.extend(x.children)
        return out
    arm_set = set().union(*[subtree(ch[0]) for ch in rig.arms]) if rig.arms else set()
    head_set = set().union(*[subtree(b) for b in rig.head]) if rig.head else set()
    leg_set = set().union(*[subtree(ch[0]) for ch in rig.legs]) if rig.legs else set()
    torso_set = set(b.name for b in rig.spine) | {rig.root.name}
    hands = [(ch[-1], ch) for ch in rig.arms]
    shoulder_z = min(ch[0].head_local.z for ch in rig.arms)
    fixed = 0
    accepted = {}                              # 被认定为道具的独立骨骼 → 改绑到的手
    singles = []
    for part in parts:
        if part is body or len(part) < 20:
            continue
        c = sum((co[i] for i in part), Vector()) / len(part)
        if c.z > shoulder_z and abs(c.dot(rig.L)) < 0.12 * rig.H:
            continue                           # 肩膀以上、左右居中：帽子 / 兜帽，不是手持道具
        w = {}
        for i in part:
            for g in me.vertices[i].groups:
                w[gname[g.group]] = w.get(gname[g.group], 0) + g.weight
        if not w:
            continue
        dom = max(w, key=w.get)
        if w[dom] / len(part) < 0.6:
            continue                           # 权重分散在多根骨骼上（如裤子、衣摆），是身体的一部分
        if dom in arm_set or dom in head_set:
            continue                           # 已经跟着手 / 头走了
        if dom in leg_set or dom in torso_set:
            outside = any(c[j] < lo[j] - pad or c[j] > hi[j] + pad for j in range(3))
            if not outside:
                continue                       # 绑在腿 / 躯干上且在身体范围内：是身体的一部分
        # 其余情况：绑在不属于任何肢体的独立短骨骼上（如 Tripo 给法杖长的小骨骼）→ 当作道具
        def dist(b):
            near = min((co[i] for i in part), key=lambda p: (p - b.tail_local).length)
            return (near - b.tail_local).length
        hand, chain = min(hands, key=lambda h: dist(h[0]))
        if dist(hand) > 0.6 * rig.H:
            continue
        if dom in leg_set or dom in torso_set:
            singles.append((part, dom, hand))  # 绑在腿 / 躯干上的道具：只挪这一块
        else:
            accepted.setdefault(dom, hand)     # 独立短骨骼：这根骨骼上的部件一起挪
    # 绑在同一根独立骨骼上的部件一起改绑（如法杖顶上的雪花装饰，离手较远但和法杖是一体的）
    todo = list(singles)
    for part in parts:
        if part is body:
            continue
        w = {}
        for i in part:
            for g in me.vertices[i].groups:
                w[gname[g.group]] = w.get(gname[g.group], 0) + g.weight
        if not w:
            continue
        dom = max(w, key=w.get)
        if dom in accepted and w[dom] / len(part) >= 0.6:
            todo.append((part, dom, accepted[dom]))
    for part, dom, hand in todo:
        vg = mo.vertex_groups.get(hand.name) or mo.vertex_groups.new(name=hand.name)
        for i in part:
            for g in list(me.vertices[i].groups):
                mo.vertex_groups[g.group].remove([i])
            vg.add([i], 1.0, 'REPLACE')
        fixed += 1
        log(f'道具修正：{len(part)} 个顶点的部件（原绑在 {dom}）改绑到手 {hand.name}')
    # 道具有自己的骨骼分支（Tripo 给法杖单独长了一根骨骼，挂在脊柱上）：靠近手的就整体挂到手上
    moves = []
    def seg_dist(p, a, b):                 # 点到线段的距离（手常握在杖身中段，不在骨骼端点）
        ab = b - a
        t = 0.0 if ab.length_squared == 0 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (a + ab * t - p).length
    for ch in getattr(rig, 'extra_branches', []):
        branch_d = lambda hb: min(seg_dist(hb.tail_local, b.head_local, b.tail_local) for b in ch)
        hand = min((h for h, _ in hands), key=branch_d)
        d = branch_d(hand)
        if d < 0.3 * rig.H:
            moves.append((ch[0].name, hand.name, d))
    if moves:
        bpy.context.view_layer.objects.active = rig.arm
        bpy.ops.object.mode_set(mode='EDIT')
        eb = rig.arm.data.edit_bones
        for bone, hand, d in moves:
            eb[bone].use_connect = False
            eb[bone].parent = eb[hand]
            log(f'道具修正：骨骼分支 {bone} 改挂到手 {hand}（相距 {d:.2f}）')
            fixed += 1
        bpy.ops.object.mode_set(mode='OBJECT')
    if not fixed:
        log('道具修正：没有需要改绑的部件')


BUILDERS = {'idle': act_idle, 'walk': act_walk, 'attack': act_attack, 'death': act_death, 'spell': act_spell, 'build': act_build}


def make_action(rig, name, force):
    old = bpy.data.actions.get(name)
    if old and not force:
        log(f'保留已有动作 "{name}"')
        return
    if old:
        bpy.data.actions.remove(old)
    arm = rig.arm
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = None
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and getattr(act, 'slots', None) is not None and len(act.slots) == 0:
        try:
            slot = act.slots.new(id_type='OBJECT', name=arm.name)
            arm.animation_data.action_slot = slot
        except Exception:
            pass
    end = (MULTILEG_BUILDERS if isinstance(rig, MultiLeg) else BUILDERS)[name](rig)
    reset(rig)
    log(f'生成动作 "{name}"：{end} 帧')


# ---------------------------------------------------------------- 多足生物（蜘蛛、甲虫……）
class MultiLeg:
    """一根骨骼下挂 ≥ 6 条长分支 → 按多足处理（蜘蛛、甲虫……）。"""
    def __init__(self, arm, forward):
        self.arm = arm
        bones = list(arm.data.bones)
        self.F = Vector(forward).normalized(); self.U = Vector((0, 0, 1)); self.L = self.U.cross(self.F).normalized()
        self.root = next(b for b in bones if b.parent is None)
        zs = [b.tail_local.z for b in bones] + [b.head_local.z for b in bones]
        zmin, self.H = min(zs), max(zs) - min(zs)
        def reach(b, origin):
            return max([(b.tail_local - origin).length] + [reach(c, origin) for c in b.children])
        def main_chain(b):
            ch = [b]
            while b.children:
                b = max(b.children, key=lambda c: reach(c, c.head_local)); ch.append(b)
            return ch
        # 腿 = 同一根"中心骨骼"下挂出的长分支（Tripo 多足骨架：8 条肢体都挂在 Root 下；很短的是螯牙）
        self.legs, self.body, self.groups = [], None, []
        for hub in bones:
            long = [c for c in hub.children if reach(c, c.head_local) > 0.3 * self.H]
            if len(long) >= 6:
                self.legs = [main_chain(c) for c in long]
                self.body = hub
                break
        # 按脚尖绕身体一圈的角度排序，相邻的腿分到不同组 → 交替步态（总有一半的腿撑地）
        if self.body is None:
            return
        c0 = self.body.head_local
        ang = lambda ch: math.atan2((ch[-1].tail_local - c0).dot(self.L), (ch[-1].tail_local - c0).dot(self.F))
        ring = sorted(self.legs, key=ang)
        self.groups = [ring[0::2], ring[1::2]]
        left = sum(1 for c in self.legs if (c[-1].tail_local - c0).dot(self.L) > 0)
        log(f'多足：{len(self.legs)} 条腿（左 {left}，右 {len(self.legs) - left}），高 {self.H:.2f}')

    def pb(self, bone):
        return self.arm.pose.bones[bone.name]

    def out_axis(self, ch):            # 绕这根轴转正角度 = 脚尖往下
        o = ch[-1].tail_local - ch[0].head_local; o.z = 0
        return self.U.cross(o.normalized())


def multileg_walk(rig):
    N = 16
    for f in range(0, N + 1, 2):
        t = 2 * math.pi * f / N
        reset(rig)
        for g, grp in enumerate(rig.groups):
            ph = t + g * math.pi
            for ch in grp:
                swing_deg = 18 * math.sin(ph)                         # 前后摆（绕竖轴）
                lift = -14 * max(0.0, math.cos(ph))                  # 往前摆的半程抬腿
                set_rot(rig, ch[0], rig.U * (1 if (ch[-1].tail_local - rig.body.head_local).dot(rig.L) > 0 else -1), swing_deg,
                        extra=rot_mat(rig.out_axis(ch), lift))
                if len(ch) > 1:
                    set_rot(rig, ch[1], rig.out_axis(ch), -0.6 * lift)
        set_loc(rig, rig.root, rig.U * (0.03 * rig.H * math.cos(2 * t)))
        key_all(rig, f + 1)
    return N + 1


def multileg_death(rig):
    keys = [(1, 0, 0, 0), (4, -10, 25, 0.08), (9, -40, 70, 0.0), (14, -70, 95, -0.15), (20, -75, 100, -0.2)]   # (帧, 腿根上抬, 关节内收, 身体升降)
    for f, up, curl, dz in keys:
        reset(rig)
        for ch in rig.legs:
            a = rig.out_axis(ch)
            set_rot(rig, ch[0], a, up)
            for b in ch[1:]:
                set_rot(rig, b, a, curl / max(1, len(ch) - 1))
        set_rot(rig, rig.root, rig.F, 20 * f / 20)                # 翻倒时侧倾
        set_loc(rig, rig.root, rig.U * (dz * rig.H))
        key_all(rig, f)
    return 20


MULTILEG_BUILDERS = {'walk': multileg_walk, 'death': multileg_death, 'spell': multileg_walk, 'idle': multileg_walk, 'attack': multileg_walk}


# ---------------------------------------------------------------- 没有骨架的模型（器械 / 建筑类塔）：整体物体动画
# 动的是 MODEL_ROOT（prep_model 建的根节点，原点在脚底），塔座不挂在它下面，保持不动
STATIC_KEYS = {   # 帧: (竖向缩放, 横向缩放, 绕竖轴转角°, 上浮 m)
    'idle':   [(1, 1, 1, 0, 0), (13, 1.015, 0.992, 3, 0.02), (25, 1, 1, 0, 0), (37, 0.99, 1.006, -3, -0.01), (49, 1, 1, 0, 0)],
    'attack': [(1, 1, 1, 0, 0), (5, 0.93, 1.04, 0, -0.02), (8, 1.09, 0.95, 0, 0.05), (12, 0.98, 1.01, 0, 0), (18, 1, 1, 0, 0)],
    'walk':   [(1, 1, 1, 0, 0), (7, 0.97, 1.02, 0, 0), (13, 1, 1, 0, 0.04), (19, 0.97, 1.02, 0, 0), (25, 1, 1, 0, 0)],
    'death':  [(1, 1, 1, 0, 0), (6, 0.9, 1.06, 0, 0), (14, 0.35, 1.15, 0, 0), (20, 0.25, 1.2, 0, 0)],
}
STATIC_KEYS['spell'] = STATIC_KEYS['attack']
STATIC_KEYS['build'] = STATIC_KEYS['attack']


def static_actions(names, force):
    root = bpy.data.objects.get('MODEL_ROOT')
    if root is None:
        log('没有骨架也没有 MODEL_ROOT，跳过'); return
    base_s, base_r, base_l = root.scale.copy(), root.rotation_euler.copy(), root.location.copy()
    if root.animation_data is None:
        root.animation_data_create()
    for name in names:
        old = bpy.data.actions.get(name)
        if old and not force:
            log(f'保留已有动作 "{name}"'); continue
        if old:
            bpy.data.actions.remove(old)
        root.animation_data.action = None
        for f, sz, sxy, rz, up in STATIC_KEYS[name]:
            root.scale = (base_s.x * sxy, base_s.y * sxy, base_s.z * sz)
            root.rotation_euler = (base_r.x, base_r.y, base_r.z + math.radians(rz))
            root.location = (base_l.x, base_l.y, base_l.z + up)
            for path in ('scale', 'rotation_euler', 'location'):
                root.keyframe_insert(path, frame=f)
        act = root.animation_data.action
        act.name = name; act.use_fake_user = True
        log(f'生成物体动作 "{name}"：{STATIC_KEYS[name][-1][0]} 帧')
    root.scale, root.rotation_euler, root.location = base_s, base_r, base_l
    root.animation_data.action = bpy.data.actions.get(names[0])


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True); ap.add_argument('--category', required=True, choices=list(CATEGORY_ACTIONS))
    ap.add_argument('--forward', default='1,0,0', help='骨架空间里角色面朝的方向（Tripo 为 +X）')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.model))
    bpy.context.scene.render.fps = FPS
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if not arms:
        static_actions(CATEGORY_ACTIONS[args.category], args.force)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.model))
        log('已保存', args.model); return
    fwd = [float(x) for x in args.forward.split(',')]
    ml = MultiLeg(arms[0], fwd)
    if len(ml.legs) >= 6:
        rig = ml
        for name in CATEGORY_ACTIONS[args.category]:
            make_action(rig, name, args.force)
        rig.arm.animation_data.action = bpy.data.actions.get(CATEGORY_ACTIONS[args.category][0])
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.model))
        log('已保存', args.model); return
    rig = Rig(arms[0], fwd)
    for mo in [o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]:
        fix_props(rig, mo)
    for name in CATEGORY_ACTIONS[args.category]:
        make_action(rig, name, args.force)
    first = bpy.data.actions.get(CATEGORY_ACTIONS[args.category][0])
    rig.arm.animation_data.action = first
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.model))
    log('已保存', args.model)


main()
