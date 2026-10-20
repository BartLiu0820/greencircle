"""原图的地面贴图和树墙 → h5/assets/terrain/、h5/assets/w3terrain.js

  python3 tools/war3_terrain.py            # 贴图 + 树（树已出过图的跳过）
  python3 tools/war3_terrain.py --force    # 树全部重新出图

和原图（war3map.w3e / war3map.doo）的对应：
  - 地面贴图：w3e 里用到的地块 Lgrd 暗草地（底色）、Arck 灰绿岩石（路面、出怪口地面）、Zvin 遗迹暗草（路两侧的暗纹）、
    Crck 费伍德岩石（出怪口一圈的边）、cZc1 遗迹悬崖地面（中央十字，用遗迹泥土贴图）。
    每张都是魔兽的地块图集：左边 4×4 是过渡遮罩（按四个角是否是这种地块取第几格），512 宽的右边 4×4 是整块的变体。
  - 树墙：doo 里出怪口和中央围栏用的 5 种树墙。VTlt（乡村树墙）和 YTct（城市树墙）的贴图不在原版包里，
    都用洛丹伦夏季树代替；CTtr 是费伍德树（灰谷树模型换贴图）。
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art', 'war3_raw')
W3ROOTS = [os.path.join(RAW, 'tft'), os.path.join(RAW, 'roc')]
OUT = os.path.join(ROOT, 'h5', 'assets', 'terrain')
TMP = os.path.join(ROOT, 'art', 'models', 'war3', 'terrain')
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender')
sys.path.insert(0, os.path.join(ROOT, 'tools'))

TILES = {   # w3e 地块 ID → 贴图
    'Lgrd': 'roc/TerrainArt/LordaeronSummer/Lords_GrassDark',
    'Arck': 'roc/TerrainArt/Ashenvale/Ashen_Rock',
    'Zvin': 'tft/TerrainArt/Ruins/Ruins_GrassDark',
    'Crck': 'roc/TerrainArt/Felwood/Felwood_Rock',
    'cZc1': 'tft/TerrainArt/Ruins/Ruins_Dirt',
}
TREES = {   # doo 装饰物 ID → (模型, 可替换贴图, 出几个变体)
    'ATtr': ('roc/Doodads/Terrain/AshenTree/AshenTree', 'roc/ReplaceableTextures/AshenvaleTree/AshenTree', [0, 3, 6]),
    'CTtr': ('roc/Doodads/Terrain/AshenTree/AshenTree', 'roc/ReplaceableTextures/AshenvaleTree/FelwoodTree', [1, 4]),
    'VTlt': ('roc/Doodads/Terrain/LordaeronTree/LordaeronTree', 'roc/ReplaceableTextures/LordaeronTree/LordaeronSummerTree', [0, 1, 2, 3]),
    'ZTtw': ('tft/Doodads/Terrain/RuinsTree/RuinsTree', 'tft/ReplaceableTextures/RuinsTree/RuinsTree', [0, 2, 4]),
}
# 原图树墙里各种树的比例（YTct 的份额并给 VTlt）
TREE_WEIGHT = {'VTlt': 0.5, 'ATtr': 0.22, 'CTtr': 0.17, 'ZTtw': 0.11}


def tiles():
    import blp
    from PIL import Image
    import numpy as np
    out = {}
    for k, rel in TILES.items():
        rgba = blp.decode_blp(open(os.path.join(RAW, rel + '.blp'), 'rb').read())
        im = Image.fromarray(np.asarray(rgba, dtype=np.uint8), 'RGBA')
        im.save(os.path.join(OUT, k + '.webp'), 'WEBP', quality=92, method=6)
        out[k] = dict(src='terrain/' + k + '.webp', ext=im.size[0] >= 512)
        print('贴图', k, im.size)
    return out


def tree(tid, mdl, tex, var, force):
    from PIL import Image
    name = f'{tid}_{var}'
    png = os.path.join(TMP, name + '.png')
    if force or not os.path.exists(png):
        blend = os.path.join(TMP, name + '.blend')
        mdx = os.path.join(RAW, f'{mdl}{var}.mdx')
        subprocess.run([BLENDER, '-b', '--python-exit-code', '1', '-P', os.path.join(ROOT, 'tools', 'blender', 'import_mdx.py'), '--',
                        '--mdx', mdx, '--out', blend, '--rtex', os.path.join(RAW, tex + '.blp'),
                        *sum((['--w3root', w] for w in W3ROOTS), [])], check=True, capture_output=True)
        key = 'terrain:' + name
        subprocess.run([BLENDER, '-b', '-P', os.path.join(ROOT, 'tools', 'blender', 'render_sprites.py'), '--', '--model', blend,
                        '--key', key, '--category', 'tower', '--actions', 'idle:1', '--ppm', '36'], check=True, capture_output=True)
        spr = os.path.join(ROOT, 'h5', 'assets', 'sprites', key.replace(':', '_'))
        meta = json.load(open(spr + '.json')); os.remove(spr + '.json')
        os.replace(spr + '.png', png)
        json.dump(meta, open(png[:-4] + '.json', 'w'))
    meta = json.load(open(png[:-4] + '.json'))
    im = Image.open(png).convert('RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    ax = (meta['anchor'][0] * meta['frameW'] - bb[0]) / im.width
    ay = (meta['anchor'][1] * meta['frameH'] - bb[1]) / im.height
    print('树', name, im.size)
    return im, dict(id=tid, ax=round(ax, 3), ay=round(ay, 3), upp=meta['unitsPerPixel'])


def main():
    from PIL import Image
    os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    tex = tiles()
    ims, metas = [], []
    for tid, (mdl, t, vs) in TREES.items():
        for v in vs:
            im, m = tree(tid, mdl, t, v, '--force' in sys.argv)
            ims.append(im); metas.append(m)
    # 拼成一张横条图集
    W = sum(i.width for i in ims) + 2 * len(ims); H = max(i.height for i in ims)
    atlas = Image.new('RGBA', (W, H)); x = 0
    for im, m in zip(ims, metas):
        atlas.paste(im, (x, 0)); m.update(x=x, y=0, w=im.width, h=im.height); x += im.width + 2
    atlas.save(os.path.join(OUT, 'trees.webp'), 'WEBP', quality=90, method=6)
    data = dict(tiles=tex, order=list(TILES), trees=dict(src='terrain/trees.webp', list=metas, weight=TREE_WEIGHT))
    with open(os.path.join(ROOT, 'h5', 'assets', 'w3terrain.js'), 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：tools/war3_terrain.py —— 原图的地面贴图（w3e）和树墙（doo）\n')
        fp.write('window.W3_TERRAIN = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    print('图集', atlas.size)


if __name__ == '__main__':
    main()
