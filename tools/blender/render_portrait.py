"""WC3 头像模型（*_Portrait.mdx）→ 信息面板里会动的头像（一行帧的 PNG + JSON）。

  Blender -b -P tools/blender/render_portrait.py -- --mdx 模型_Portrait.mdx --out h5/assets/portraits/xxx.png --w3root art/war3_raw/tft --w3root art/war3_raw/roc

用模型自带的镜头（CAMS 块：位置、目标点、视角）取景，和游戏里头像窗口看到的一样；
动作取 Portrait（没有就取 Stand），按原始时长播放。
"""
import argparse, json, math, os, struct, sys, tempfile

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_mdx  # noqa: E402

FRAMES = 16


def cameras(path):
    """CAMS：[(名字, 位置, 视角, 目标点)]，模型坐标"""
    d = open(path, 'rb').read(); p = 4; out = []
    while p < len(d):
        tg = d[p:p + 4]; size = struct.unpack_from('<I', d, p + 4)[0]; end = p + 8 + size
        if tg == b'CAMS':
            q = p + 8
            while q < end:
                sz = struct.unpack_from('<I', d, q)[0]
                name = d[q + 4:q + 84].split(b'\0')[0].decode('latin1')
                pos = struct.unpack_from('<3f', d, q + 84); fov, far, near = struct.unpack_from('<3f', d, q + 96)
                tgt = struct.unpack_from('<3f', d, q + 108)
                out.append((name, pos, fov, tgt)); q += sz
        p = end
    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--mdx', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--team', default='1,0.012,0.012'); ap.add_argument('--w3root', action='append')
    ap.add_argument('--size', default='144,168', help='宽,高（像素，和控制台头像窗口的比例一样）')
    a = ap.parse_args(argv)
    W, H = (int(x) for x in a.size.split(','))
    import_mdx.OPT.update(w3roots=a.w3root and [os.path.abspath(r) for r in a.w3root])
    import_mdx.WANT = {'idle': ['portrait', 'portrait 1', 'stand', 'stand 1']}
    tmp = os.path.join(tempfile.mkdtemp(prefix='portrait_'), 'p.blend')
    team = tuple(float(x) for x in a.team.split(','))
    import_mdx.build(a.mdx, tmp, 1.0, team)

    scene = bpy.context.scene
    root = bpy.data.objects['MODEL_ROOT']
    cams = cameras(a.mdx)
    if not cams: raise SystemExit('模型里没有镜头')
    _, pos, fov, tgt = cams[0]
    mw = root.matrix_world
    cpos, ctgt = mw @ Vector(pos), mw @ Vector(tgt)
    cd = bpy.data.cameras.new('PCAM'); cd.lens_unit = 'FOV'; cd.sensor_fit = 'VERTICAL'
    cd.angle = fov * H / max(W, H) if W > H else fov            # WC3 的视角按长边算
    cd.clip_start = 0.01; cd.clip_end = 100
    cam = bpy.data.objects.new('PCAM', cd); scene.collection.objects.link(cam)
    cam.location = cpos
    cam.rotation_euler = (ctgt - cpos).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam

    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: scene.render.engine = eng; break
        except TypeError: continue
    try: scene.eevee.taa_render_samples = 16
    except AttributeError: pass
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    try: scene.view_settings.view_transform = 'Standard'
    except TypeError: pass
    for nm, en, rot in (('KEY', 3.2, (50, -20, -40)), ('FILL', 1.2, (60, 30, 140))):
        ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en
        lo = bpy.data.objects.new(nm, ld); scene.collection.objects.link(lo)
        lo.rotation_euler = tuple(math.radians(v) for v in rot)
    if scene.world is None: scene.world = bpy.data.worlds.new('W')
    scene.world.color = (0.4, 0.4, 0.42)

    arm = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
    act = bpy.data.actions.get('idle')
    if arm and act: arm.animation_data.action = act
    a0, a1 = act.frame_range if act else (1, 1)
    n = FRAMES if act and a1 > a0 else 1
    frames = [a0 + (a1 - a0) * k / n for k in range(n)]
    sheet = np.zeros((H, W * n, 4), np.float32)
    shot = os.path.join(os.path.dirname(tmp), 'f.png')
    for i, f in enumerate(frames):
        scene.frame_set(int(f), subframe=f - int(f))
        scene.render.filepath = shot; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(shot, check_existing=False); px = np.empty(W * H * 4, np.float32); im.pixels.foreach_get(px)
        bpy.data.images.remove(im)
        sheet[:, i * W:(i + 1) * W] = px.reshape(H, W, 4)[::-1]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    img = bpy.data.images.new('sheet', W * n, H, alpha=True); img.pixels.foreach_set(sheet[::-1].ravel())
    img.filepath_raw = os.path.abspath(a.out); img.file_format = 'PNG'; img.save()
    dur = (a1 - a0) / scene.render.fps if n > 1 else 1
    json.dump(dict(w=W, h=H, frames=n, fps=round(n / dur, 2) if dur else 8), open(os.path.splitext(a.out)[0] + '.json', 'w'))
    print('[portrait] ✓', a.out, f'{n} 帧', flush=True)


main()
