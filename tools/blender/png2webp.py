"""把 h5/assets/sprites/ 里比 WebP 新（或没有 WebP）的 PNG 精灵表转成 WebP（质量 90，保留透明）。
  Blender -b -P tools/blender/png2webp.py
之后运行 python3 tools/register_sprites.py，游戏就会用 WebP。"""
import glob, os, sys
import bpy

SP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'h5', 'assets', 'sprites')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
scene = bpy.context.scene
s = scene.render.image_settings
s.file_format = 'WEBP'; s.color_mode = 'RGBA'; s.quality = 90
n = before = after = 0
for png in sorted(glob.glob(os.path.join(SP, '*.png'))):
    if argv and not any(a in os.path.basename(png) for a in argv): continue
    webp = png[:-4] + '.webp'
    if os.path.exists(webp) and os.path.getmtime(webp) >= os.path.getmtime(png): continue
    img = bpy.data.images.load(png)
    img.save_render(webp, scene=scene)
    bpy.data.images.remove(img)
    n += 1; before += os.path.getsize(png); after += os.path.getsize(webp)
print(f'[webp] 转了 {n} 张：{before / 2**20:.1f} MB → {after / 2**20:.1f} MB')
