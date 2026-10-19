"""从基础模型自动生成"粗变体"：整体缩放 + 给所有材质乘一个颜色。动作完全复用。
配件（护肩、换武器等）仍需人工补，生成的只是能先进游戏看效果的版本。

  Blender -b -P tools/blender/make_variant.py -- --base art/models/unit_nban.blend --out art/models/unit_n08Q.blend --scale 1.1 --tint 1,0.85,0.7
"""
import argparse, os, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--base', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--tint', default='1,1,1', help='RGB 乘数，如 0.8,1,0.8 偏绿')
ap.add_argument('--mode', default='multiply', choices=['multiply', 'color'],
                help='multiply：乘颜色（暗色贴图变化很小）；color：换色相和饱和度、保留明暗（变体区分更明显）')
ap.add_argument('--strength', type=float, default=0.6, help='color 模式的混合强度 0~1')
args = ap.parse_args(argv)
tint = [float(x) for x in args.tint.split(',')] + [1.0]

bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.base))

# 在原点（脚底）加一个父节点整体缩放，脚底位置不变
if abs(args.scale - 1) > 1e-6:
    root = bpy.data.objects.new('VARIANT_SCALE', None)
    bpy.context.scene.collection.objects.link(root)
    for o in bpy.context.scene.objects:
        if o.parent is None and o is not root:
            o.parent = root
    root.scale = (args.scale,) * 3

# 材质染色：Base Color 前面串一个"相乘"节点
if tint[:3] != [1.0, 1.0, 1.0]:
    for m in bpy.data.materials:
        if not m.use_nodes or m.name.startswith('塔座'):
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        inp = bsdf.inputs['Base Color']
        if inp.is_linked:
            src = inp.links[0].from_socket
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
            mix.blend_type = 'COLOR' if args.mode == 'color' else 'MULTIPLY'
            mix.inputs['Factor'].default_value = args.strength if args.mode == 'color' else 1.0
            nt.links.new(src, mix.inputs[6]); mix.inputs[7].default_value = tint
            nt.links.new(mix.outputs[2], inp)
        else:
            inp.default_value = [a * b for a, b in zip(inp.default_value, tint)]

out = os.path.abspath(args.out)
bpy.ops.wm.save_as_mainfile(filepath=out)
print('[variant] 已生成', out, f'缩放 ×{args.scale}，染色 {args.tint}', flush=True)
