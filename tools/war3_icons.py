"""命令面板图标 + 信息面板头像换成原图用的原版图标（BLP → PNG），生成 h5/assets/war3_icons.js。

  python3 tools/war3_icons.py

图标来源都是原图数据里的 Art 字段：
  - 塔：1 级塔单位的图标；英雄：英雄单位的图标；英雄技能：技能的图标
  - 头像：每个怪物 / 每级塔 / 英雄 / 守卫者自己的图标
  - 通用命令（移动、停止、建造、回收……）：原图里同名技能的图标
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import blp  # noqa: E402
from war3_batch import INDEX, D, U, BUILDER_ID  # noqa: E402

OUT = os.path.join(ROOT, 'h5', 'assets', 'icons', 'war3')
A = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'abilities_all.json'), encoding='utf8'))
H = json.load(open(os.path.join(ROOT, 'analysis', 'data', 'heroes.json'), encoding='utf8'))
H = {h['id']: h for h in (H if isinstance(H, list) else H.values())}

# 游戏里的通用命令（ico 名）→ 原图里对应技能的图标
GENERIC = {
    'back': 'ReplaceableTextures/CommandButtons/BTNCancel', 'move': 'ReplaceableTextures/CommandButtons/BTNMove',
    'stop': 'ReplaceableTextures/CommandButtons/BTNStop', 'build': 'ReplaceableTextures/CommandButtons/BTNScourgeBuild',
    'blink': A['A00D']['Art'], 'reroll': A['A03C']['Art'], 'woodmenu': A['A05N']['Art'], 'buyfood': A['A05K']['Art'],
    'wood2gold': A['A05L']['Art'], 'gold2wood': 'ReplaceableTextures/CommandButtons/BTNBundleOfLumber', 'learn': A['A05X']['Art'],
    'sell': A['A04B']['Art'], 'switchdmg': A['A06V']['Art'],
    'branch-pierce': A['A03H']['Art'], 'branch-magic': A['A04E']['Art'], 'branch-normal': A['A04G']['Art'], 'branch-chaos': A['A04H']['Art'],
}


def png_for(art):
    """Art 字段（可能带 .blp 或不带）→ 游戏里的相对路径；找不到返回 None"""
    if not art: return None
    k = re.sub(r'\.blp$', '', art.split(',')[0].replace('\\', '/').strip(), flags=re.I).lower()
    src = INDEX.get(k + '.blp')
    if not src: return None
    name = os.path.basename(src)[:-4] + '.png'
    out = os.path.join(OUT, name)
    if not os.path.exists(out):
        blp.write_png(out, blp.decode_blp(open(src, 'rb').read()))
    return 'icons/war3/' + name


def main():
    os.makedirs(OUT, exist_ok=True)
    reg, miss = {}, []

    def put(key, art):
        p = png_for(art)
        if p: reg[key] = p
        else: miss.append((key, art))

    for fam, t in D['towers'].items():
        lv = t['levels']
        put('icon:' + fam, U[lv[0]['id']].get('Art'))
        for i, l in enumerate(lv):
            put(f'portrait:tower:{fam}:{i + 1}', U[l['id']].get('Art'))
    for n, h in D['heroes'].items():
        put('icon:hero:' + n, U[h['id']].get('Art')); put('portrait:hero:' + n, U[h['id']].get('Art'))
        for i, s in enumerate(H[h['id']]['skillPool'][:4]):
            put(f'icon:skill:{n}:{i}', A.get(s['id'], {}).get('Art'))
    for uid in D['units']:
        put('portrait:unit:' + uid, U.get(uid, {}).get('Art'))
    put('portrait:builder', U[BUILDER_ID].get('Art'))
    for k, art in GENERIC.items():
        put('ico:' + k, art)

    with open(os.path.join(ROOT, 'h5', 'assets', 'war3_icons.js'), 'w', encoding='utf-8') as fp:
        fp.write('// 自动生成：tools/war3_icons.py —— 原图用的原版图标（命令面板 icon:* / ico:*，信息面板头像 portrait:*）\n')
        fp.write('window.ASSET_MANIFEST = window.ASSET_MANIFEST || {};\n')
        fp.write('window.ASSET_MANIFEST.sprites = Object.assign(window.ASSET_MANIFEST.sprites || {}, ' + json.dumps(reg, ensure_ascii=False, indent=1) + ');\n')
    print(f'登记了 {len(reg)} 个图标（{len(set(reg.values()))} 张图）')
    for k, a in miss: print('  找不到：', k, a)


if __name__ == '__main__':
    main()
