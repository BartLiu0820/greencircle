"""演示批次：能演示前两波的最小模型集合（跑通画风和流程用）。
  python3 tools/blender/make_demo_gen_list.py   → art/演示批次生成清单.csv
塔每种做 3 档外观（初级 / 中级 / MAX），每档都是重新生成的模型，造型逐档升级，不是换色。
文件夹命名：tower_魔幻塔（初级） / tower_魔幻塔@L3（从第 3 级起用） / tower_魔幻塔@L5（MAX）
"""
import csv, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COST = {'rig': 65, 'static': 40}
T = 'Character only, no base.'
O = 'Small game prop, no ground, no pedestal, centered, stylized.'
ARMOR = {'物理': 'bright orange', '魔法': 'bright blue'}

# (文件夹, key, 名称, 类别, 方式, 身高, 面数, 适用等级, 说明, 英文提示词)
R = []
def tower(fam, mode, tiers, levels, note):
    for (lv, label, prompt) in tiers:
        folder = f'tower_{fam}' if lv == 1 else f'tower_{fam}@L{lv}'
        key = f'tower:{fam}' if lv == 1 else f'tower:{fam}:{lv}'
        R.append((folder, key, f'{fam}·{label}', 'tower', mode, 2.0 if mode == 'rig' else 2.0, 6000, levels[label], note, prompt + (' ' + (T if mode == 'rig' else O))))

# ---- 主塔：魔幻塔（穿刺，单体高伤；第 2 波魔法甲的克制塔）5 级
tower('魔幻塔', 'rig', [
    (1, '初级', 'A young blood elf spell thief in simple red leather with a hood, holding one glowing green dagger.'),
    (3, '中级', 'A veteran blood elf spell thief with a clearly visible face, long pointed elf ears and long blond hair, no helmet, in red and gold leather armor with shoulder guards and a short cape, two glowing green magic daggers, green arcane runes floating around the hands.'),
    (5, 'MAX', 'A master blood elf spellblade in ornate crimson and gold armor with a long flowing cape and a winged helmet, two large green crystal blades, a halo of floating green arcane sigils behind the back.'),
], {'初级': '1–2 级', '中级': '3–4 级', 'MAX': '5 级（MAX）'}, '主塔 · 穿刺')
# ---- 原始塔：闪电塔（魔法；第 1 波物理甲的克制塔）4 级，器械类
tower('闪电塔', 'static', [
    (1, '初级', 'A small tesla coil on a wooden base with one copper ring and a small blue spark orb on top.'),
    (3, '中级', 'A taller tesla tower of stone and copper with two copper rings and a glowing blue orb crackling with lightning.'),
    (4, 'MAX', 'A grand arcane tesla spire of dark stone and gold with three floating copper rings and a huge radiant blue lightning orb on top, lightning arcs around it.'),
], {'初级': '1–2 级', '中级': '3 级', 'MAX': '4 级（MAX）'}, '原始塔 · 魔法')
# ---- 光环塔：攻击光环（加攻击）6 级，器械类
tower('攻击光环', 'static', [
    (1, '初级', 'A small grey stone obelisk with a glowing red upward-pointing sword symbol carved on the front and a small red crystal on top.'),
    (3, '中级', 'A taller carved stone obelisk covered in glowing red runes with one floating red rune ring around it and a crossed-swords emblem.'),
    (6, 'MAX', 'A grand obelisk of black stone and gold topped with a large crimson crystal, two orbiting glowing red rune rings and floating sword emblems.'),
], {'初级': '1–2 级', '中级': '3–5 级', 'MAX': '6 级（MAX）'}, '光环塔 · 加攻击')
# ---- 辅助塔：冰霜塔（魔法，减速）4 级；初级已在试做里完成
tower('冰霜塔', 'rig', [
    (3, '中级', 'A young frost sorceress in light blue and white robes with silver trims and an ice-crystal shoulder mantle, tall pointed hood, holding a longer staff topped with a larger glowing ice crystal, snowflake decorations.'),
    (4, 'MAX', 'A frost archsorceress with a crown of ice shards on a tall pointed hood, flowing layered blue and white robes, floating snowflake orbs around her, holding a staff with a huge radiant ice crystal.'),
], {'中级': '3 级', 'MAX': '4 级（MAX）'}, '辅助塔 · 魔法（初级已完成）')
# ---- 另类塔：灵魂塔（混乱）4 级
tower('灵魂塔', 'rig', [
    (1, '初级', 'A small skeleton apprentice mage with a clearly visible white skull head with glowing purple eye sockets and bony white skeleton hands, tattered grey-purple hooded robe, holding a small bone wand with a purple flame.'),
    (3, '中级', 'A skeleton mage with a clearly visible white skull head with purple ghost flames in the eye sockets and bony white skeleton hands, dark purple hooded robe with bone shoulder ornaments, holding a tall staff topped with a glowing purple ghost skull.'),
    (4, 'MAX', 'A skeleton lich archmage with a horned bone crown and an ornate dark purple robe with gold trims, floating ghost souls circling around, a large staff with a screaming purple skull.'),
], {'初级': '1–2 级', '中级': '3 级', 'MAX': '4 级（MAX）'}, '另类塔 · 混乱')

# ---- 怪物：前两波实际会出现的
STYLE_OF = {}
def monster(key, name, h, armor, desc, wave, style=''):
    STYLE_OF[key] = style
    R.append((key.replace(':', '_'), key, name, 'monster', 'rig', h, 3000, wave, f'{armor}护甲',
              f'{desc} Clearly visible {ARMOR[armor]} armor pieces / cloth on the body (team color), readable from far away.'))
monster('unit:hfoo', '步兵', 1.7, '物理', 'A human footman soldier in plate armor, a short sword firmly gripped in the right hand, a round shield strapped on the left forearm, nothing floating.', '第 1 波（多 物理）')
monster('unit:hrif', '矮人火枪手', 1.3, '魔法', 'A short dwarf rifleman with a big beard and a musket, leather cap.', '第 2 波（多 魔法）')
monster('unit:n08L', '坚硬的森林蜘蛛', 0.9, '魔法', 'A giant forest spider with eight long jointed legs spread wide, a hard armored shell on its back and mossy legs, low body close to the ground, side view readable.', '第 2 波（中 魔法）', 'creature')

rows = [dict(folder=f, key=k, 名称=n, 类别=c, 方式=m, 身高=h, 面数=fc, 基础模型='', 缩放='', 染色='', 设定=f'{note}；{lv}', 提示词=p, 预计积分=COST[m], 风格=STYLE_OF.get(k, ''))
        for f, k, n, c, m, h, fc, lv, note, p in R]
out = os.path.join(ROOT, 'art', '演示批次生成清单.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
from collections import Counter
print(out, len(rows), dict(Counter(r['方式'] for r in rows)), '预计', sum(r['预计积分'] for r in rows), '积分')
