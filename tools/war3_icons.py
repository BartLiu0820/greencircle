"""命令面板图标 + 信息面板头像换成原图用的原版图标（BLP → PNG），生成 h5/assets/war3_icons.js。

  python3 tools/war3_icons.py

图标来源都是原图数据里的 Art 字段：
  - 塔：1 级塔单位的图标；英雄：英雄单位的图标；英雄技能：技能的图标
  - 头像：每个怪物 / 每级塔 / 英雄 / 守卫者自己的图标
  - 通用命令（移动、停止、建造、回收……）：原图里同名技能的图标
另外导出控制台贴图（暗夜精灵）和信息卡图标到 h5/assets/ui/。
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import blp  # noqa: E402
from war3_batch import INDEX, D, U, BUILDER_ID  # noqa: E402

OUT = os.path.join(ROOT, 'h5', 'assets', 'icons', 'war3')
A = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'abilities_all.json'), encoding='utf8'))
ITEMS = json.load(open(os.path.join(ROOT, 'analysis', 'raw', 'items_all.json'), encoding='utf8'))
# 兔子（成就商店 nshe）卖的道具 + 兔子卷轴 + 地图中央商店（u00L）卖的道具：命令面板图标 ico:item-<物品 ID>
SHOP_ITEMS = ['I00K', 'I00M', 'I00N', 'I00L', 'I01I', 'I01U', 'I02A', 'I00Q', 'I00S'] + U['u00L']['Sellitems'].split(',')
# 守护宗师 / 宠物商人 / 许愿商人卖的、兔子的天赋秘籍、地上会掉的物品（糖果、马上有钱的字、药水、光环碎片、许愿石）
SHOP_ITEMS += U['u01A']['Sellitems'].split(',') + U['u00Z']['Sellitems'].split(',') + U['u00M']['Sellitems'].split(',') + ['I01W', 'I01X', 'I00W', 'I00Y',
  'I004', 'I005', 'I006', 'I007', 'I008', 'I03Y', 'I00P', 'I029', 'I01T', 'I03Z', 'I01R', 'I01S', 'gold', 'I003'] + [f'I0{x}' for x in (
  '15 1B 19 12 10 17 1J 18 1A 16 1G 1D 2C 1K 1E 1H 1F 1L 2Q 2T 2P 2U 2W 2N 2M 1C 2F 2J 2R 2X 2O 2V 2Z 2S 2Y 11').split()]

# 游戏里的通用命令（ico 名）→ 原图里对应技能的图标
GENERIC = {
    'back': 'ReplaceableTextures/CommandButtons/BTNCancel', 'move': 'ReplaceableTextures/CommandButtons/BTNMove',
    'stop': 'ReplaceableTextures/CommandButtons/BTNStop', 'build': 'ReplaceableTextures/CommandButtons/BTNScourgeBuild',
    'blink': A['A00D']['Art'], 'reroll': A['A03C']['Art'], 'woodmenu': A['A05N']['Art'], 'buyfood': A['A05K']['Art'],
    'wood2gold': A['A05L']['Art'], 'gold2wood': 'ReplaceableTextures/CommandButtons/BTNBundleOfLumber', 'learn': A['A05X']['Art'],
    'sell': A['A04B']['Art'], 'switchdmg': A['A06V']['Art'], 'fod': A['A04W']['Art'],   # 守卫者的死亡之指
    'str': A['A05Y']['Art'], 'agi': A['A060']['Art'], 'int': A['A05Z']['Art'], 'upgrade': A['A0B6']['Art'],   # 英雄的力量 / 敏捷 / 智力、升级
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


UI = os.path.join(ROOT, 'h5', 'assets', 'ui')
CONSOLE = 'UI/Console/NightElf/NightElfUITile0{}.blp'      # 截图里的藤蔓控制台（暗夜精灵）
TOP_H, CON_Y = 100, 170                                     # 拼好的 1600×512 贴图：上 100 行是顶栏，170 行以下是底部控制台


def ui():
    """控制台贴图（4 张拼成 1600×512，切成顶栏 + 底栏）、信息卡图标（攻击 / 护甲类型、英雄属性）"""
    import numpy as np
    from PIL import Image
    os.makedirs(UI, exist_ok=True)
    tiles = [blp.decode_blp(open(INDEX[CONSOLE.format(i).lower()], 'rb').read()) for i in range(1, 5)]
    full = np.concatenate(tiles, 1)
    Image.fromarray(full[:TOP_H]).save(os.path.join(UI, 'top.png'))
    Image.fromarray(full[CON_Y:]).save(os.path.join(UI, 'console.png'))
    n = 0
    for k, src in INDEX.items():
        b = os.path.basename(k)
        if b.startswith('infocard-') and k.endswith('.blp') and 'neutral' not in b:
            blp.write_png(os.path.join(UI, b[:-4] + '.png'), blp.decode_blp(open(src, 'rb').read())); n += 1
    print(f'控制台贴图 + {n} 个信息卡图标 → h5/assets/ui/')


ESC = 'UI/Widgets/EscMenu/{}.blp'


def dialog():
    """原版对话框（DialogCreate，暗夜精灵皮肤）：背景、按钮底图 / 按下 / 高亮直接导出；
    边框是 8 格横条（左 右 上 下 左上 右上 左下 右下，上下两格是竖着存的，顺时针转 90° 才是横的），拼成 3×3 九宫格给 CSS border-image 用"""
    import numpy as np
    from PIL import Image
    def load(n, opaque=False):
        a = blp.decode_blp(open(INDEX[ESC.format(n).lower()], 'rb').read())
        if opaque: a = a.copy(); a[..., 3] = 255       # 按钮底图没有 alpha 通道，解出来是全透明
        return Image.fromarray(a)
    def nine(strip, out):
        c = strip.height
        cell = [strip.crop((i * c, 0, (i + 1) * c, c)) for i in range(8)]
        im = Image.new('RGBA', (3 * c, 3 * c))
        for img, (x, y) in [(cell[0], (0, 1)), (cell[1], (2, 1)), (cell[2].rotate(-90), (1, 0)), (cell[3].rotate(-90), (1, 2)),
                            (cell[4], (0, 0)), (cell[5], (2, 0)), (cell[6], (0, 2)), (cell[7], (2, 2))]:
            im.paste(img, (x * c, y * c))
        im.save(os.path.join(UI, out))
    load('NightElf/nightelf-options-menu-background').save(os.path.join(UI, 'dialog-bg.png'))
    nine(load('NightElf/nightelf-options-menu-border'), 'dialog-border.png')
    load('NightElf/nightelf-options-button-background', True).save(os.path.join(UI, 'dialog-btn.png'))
    load('NightElf/nightelf-options-button-background-down', True).save(os.path.join(UI, 'dialog-btn-down.png'))
    load('NightElf/nightelf-options-button-highlight').save(os.path.join(UI, 'dialog-btn-hl.png'))
    nine(load('Human/human-options-button-border-up'), 'dialog-btn-border.png')      # 暗夜精灵皮肤的按钮边框沿用人族的金边
    nine(load('Human/human-options-button-border-down'), 'dialog-btn-border-down.png')
    print('对话框贴图 → h5/assets/ui/dialog-*.png')


def main():
    ui()
    dialog()
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
            # 塔身上的技能（含 data.js 没导出的命令技能，如寒冰塔的选择升级技能 / 功勋）：命令面板配图标（game.js abilIco）
            for aid in [ab['id'] for ab in l.get('abils', [])] + str(U[l['id']].get('abilList') or '').split(','):
                if aid in A and 'ico:abil-' + aid not in reg: put('ico:abil-' + aid, A[aid].get('Art'))
    for n, h in D['heroes'].items():
        put('icon:hero:' + n, U[h['id']].get('Art')); put('portrait:hero:' + n, U[h['id']].get('Art'))
        for i, s in enumerate(h['skills']):                    # 技能书里的 4~5 个技能（tools/add_heroes.py）
            put(f'icon:skill:{n}:{i}', A.get(s['id'], {}).get('Art'))
        for i, s in enumerate(h.get('cmds', [])):             # 没有技能书的英雄：单位上的命令技能
            put(f'icon:cmd:{n}:{i}', A.get(s['id'], {}).get('Art'))
    for uid in D['units']:
        put('portrait:unit:' + uid, U.get(uid, {}).get('Art'))
    put('portrait:builder', U[BUILDER_ID].get('Art'))
    put('portrait:rabbit', U['nshe'].get('Art'))
    put('portrait:shop', U['u00L'].get('Art'))
    for iid in SHOP_ITEMS:
        put('ico:item-' + iid, ITEMS[iid].get('Art'))
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
