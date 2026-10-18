"""生成第 1 批剩余模型的生成清单 art/第1批生成清单.csv（含 Tripo 提示词、生成方式、积分估算）。
  python3 tools/blender/make_batch1_gen_list.py
生成方式：
  rig     Tripo 生成 + 绑骨（人物 / 怪物 / 带角色的塔），程序化动作
  static  只生成，不绑骨（建筑 / 器械类塔），静态图
  variant 不调用 Tripo，从基础模型自动做变体（缩放 + 染色），0 积分
护甲色（怪物必须醒目）：物理 = 橙，魔法 = 蓝，抗性 = 绿，神圣 = 金白
"""
import csv, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COST = {'rig': 65, 'static': 40, 'variant': 0}          # 实测：P1 生成 40 + 绑骨 25
ARMOR = {'物理': 'bright orange', '魔法': 'bright blue', '抗性': 'bright green', '神圣': 'gold and white'}

# (key, 名称, category, 方式, 身高米, 面数, 中文设定, 英文描述)
# 怪物的英文描述里会自动拼上护甲色要求
L = []
def add(*a): L.append(a)

# ---------------- 英雄塔（3）
add('hero:枪神', '枪神', 'hero', 'rig', 2.8, 12000, '科幻重装兽人枪手，背弹药箱，枪口火焰',
    'A bulky sci-fi orc gunner in heavy armor with an ammo backpack, holding a huge two-handed rifle with flames at the muzzle, orange and steel colors.')
add('hero:邪冰', '邪冰', 'hero', 'rig', 2.8, 12000, '被邪恶侵蚀的冰霜女法师，冰蓝配邪紫',
    'A corrupted frost sorceress with icy blue robes and dark purple corruption patterns, glowing purple eyes, holding a jagged ice staff, floating ice shards around her.')
add('hero:火魂', '火魂', 'hero', 'rig', 2.8, 12000, '熔岩巨人，身上裂纹透出火光',
    'A hulking lava lord made of cracked black rock with glowing orange magma seams, flaming head, huge fists, embers rising from the shoulders.')

# ---------------- 塔：带角色的（rig），角色站在标准塔座上
T = 'Character only, no base.'
add('tower:天神塔', '天神塔', 'tower', 'rig', 2.0, 6000, '雷神：持战锤的矮人雷霆之王', f'A stout dwarf thunder king with a braided beard, holding a glowing stormhammer crackling with lightning, golden armor. {T}')
add('tower:寒冰塔', '寒冰塔', 'tower', 'rig', 2.0, 6000, '冰霜大法师：手托冰球的年长法师', f'An elder ice archmage in white and pale blue robes holding a floating ice orb in one hand, frosty beard, crystal shoulder pads. {T}')
add('tower:魔幻塔', '魔幻塔', 'tower', 'rig', 2.0, 6000, '血精灵魔法窃贼，单体高伤', f'A slender blood elf spell thief in red and gold leather with a hood, two glowing magic daggers, green arcane energy around the hands. {T}')
add('tower:剑圣塔', '剑圣塔', 'tower', 'rig', 2.0, 6000, '红色混沌剑圣，攻击快', f'A red-skinned chaos orc blademaster with a tattered red cape and a long curved sword, aggressive stance. {T}')
add('tower:牛头塔', '牛头塔', 'tower', 'rig', 2.0, 6000, '牛头人挥锤，范围震地', f'A massive tauren warrior with horns, holding a huge stone totem hammer over the shoulder, purple war paint. {T}')
add('tower:毒塔', '毒塔', 'tower', 'rig', 2.0, 6000, '骷髅弓箭手，绿色毒箭', f'A skeleton archer with a green glowing poison bow and a quiver of toxic arrows, green mist leaking from the ribs. {T}')
add('tower:群攻塔', '群攻塔', 'tower', 'rig', 2.0, 6000, '石像魔像，砸地晕眩', f'A chunky stone golem statue with mossy rocks and glowing runes on the chest, huge stone fists. {T}')
add('tower:混乱塔', '混乱塔', 'tower', 'rig', 2.0, 6000, '紫色元素体，对神圣甲特攻', f'A swirling purple chaos elemental humanoid made of violet water and energy, glowing core in the chest, wispy lower body. {T}')
add('tower:腐蚀塔', '腐蚀塔', 'tower', 'rig', 2.0, 6000, '森林巨魔暗影祭司，绿色腐蚀弹', f'A lanky forest troll shadow priest with tusks, voodoo mask, bone staff dripping green acid. {T}')
add('tower:暴击塔', '暴击塔', 'tower', 'rig', 2.0, 6000, '矮人火枪手，暴击', f'A dwarf rifleman with a red beard, leather cap and goggles, aiming a long musket rifle. {T}')
add('tower:重击塔', '重击塔', 'tower', 'rig', 2.0, 6000, '山岭巨人挥树干', f'A small mountain giant made of rock and moss, wielding an uprooted tree trunk as a club. {T}')
add('tower:灵魂塔', '灵魂塔', 'tower', 'rig', 2.0, 6000, '骷髅法师，幽灵', f'A skeleton mage in tattered dark robes, holding a staff with a purple ghostly skull, ghost flames in the eye sockets. {T}')
add('tower:弹跳塔', '弹跳塔', 'tower', 'rig', 2.0, 6000, '牧师，弹射光球', f'A human priest in white and gold robes holding up a glowing bouncing light orb above the head. {T}')
add('tower:精灵塔', '精灵塔', 'tower', 'rig', 2.0, 6000, '会动的奇迹古树', f'A small walking ancient tree creature with a friendly face in the bark, glowing purple flowers on the branches. {T}')
add('tower:地精塔', '地精塔', 'tower', 'rig', 2.0, 6000, '地精修补匠机甲', f'A goblin tinker piloting a small walking mech robot with a cannon arm, rusty metal plates and gears. {T}')

# ---------------- 塔：建筑 / 器械类（static）
O = 'Small game prop, no ground, no pedestal, centered, stylized.'
add('tower:扫射塔', '扫射塔', 'tower', 'static', 2.0, 6000, '旋转射线炮台（巨魔地洞风格）', f'A troll burrow turret: a rounded hut of bones and hide with a rotating crossbow on top. {O}')
add('tower:通灵塔', '通灵塔', 'tower', 'static', 2.0, 6000, '通灵塔（亡灵金字形塔），绿光', f'A small undead ziggurat obelisk of dark stone with a glowing green crystal floating on top. {O}')
add('tower:闪电塔', '闪电塔', 'tower', 'static', 2.0, 6000, '特斯拉线圈，蓝色闪电', f'A tesla coil tower with copper rings and a glowing blue orb crackling with lightning. {O}')
add('tower:箭塔', '箭塔', 'tower', 'static', 2.0, 6000, '经典木石箭塔', f'A classic small wooden and stone arrow tower with a pointed roof and a mounted crossbow. {O}')
add('tower:神圣塔', '神圣塔', 'tower', 'static', 2.0, 6000, '神圣图腾柱，金白光', f'A holy golden totem pillar with white wings carved on it and a radiant sun emblem on top. {O}')
add('tower:破坏塔', '破坏塔', 'tower', 'static', 2.0, 6000, '精灵魔法塔，多道魔法弹', f'A slender elven magic spire with floating blue crystals orbiting the top. {O}')
add('tower:图腾塔', '图腾塔', 'tower', 'static', 2.0, 6000, '奇美拉栖木，喷射酸液', f'A chimaera roost: a twisted nest of branches and bones with a dripping acid pod on top. {O}')
add('tower:巨箭塔', '巨箭塔', 'tower', 'static', 2.0, 6000, '巨型弩车', f'A giant siege ballista on a wooden frame loaded with a huge golden bolt. {O}')
add('tower:加速光环', '加速光环', 'tower', 'static', 2.0, 4000, '光环柱：黄色，加攻速', f'A rune obelisk with a glowing yellow rune ring floating around it, lightning-bolt symbols. {O}')
add('tower:攻击光环', '攻击光环', 'tower', 'static', 2.0, 4000, '光环柱：红色，加攻击', f'A rune obelisk with a glowing red rune ring floating around it, crossed-swords symbols. {O}')
add('tower:减防光环', '减防光环', 'tower', 'static', 2.0, 4000, '光环柱：紫色，减护甲', f'A rune obelisk with a glowing purple rune ring floating around it, broken-shield symbols. {O}')
add('tower:减速光环', '减速光环', 'tower', 'static', 2.0, 4000, '光环柱：冰蓝，减移速', f'A rune obelisk with a glowing icy blue rune ring floating around it, snowflake symbols. {O}')

# ---------------- 怪物（第 1–10 波）
add('unit:ndth', '民兵', 'monster', 'rig', 1.6, 3000, '物理', 'A clumsy peasant militia man with a pitchfork and a pot helmet.')
add('unit:hfoo', '步兵', 'monster', 'rig', 1.7, 3000, '物理', 'A human footman soldier with a sword and a round shield, plate armor.')
add('unit:n090', '大蜘蛛', 'monster', 'rig', 1.0, 3000, '魔法', 'A big hairy spider monster with eight legs and glowing eyes.')
add('unit:nspb', '黑蜘蛛', 'monster', 'rig', 0.8, 3000, '魔法', 'A small black spider with spiky legs and red eyes.')
add('unit:n08L', '坚硬的森林蜘蛛', 'monster', 'rig', 0.9, 3000, '魔法', 'A forest spider with a hard armored shell on its back and mossy legs.')
add('unit:hrif', '矮人火枪手', 'monster', 'rig', 1.3, 3000, '魔法', 'A short dwarf rifleman with a big beard and a musket, leather cap.')
add('unit:h07M', '暗黑的女巫', 'monster', 'rig', 1.7, 3000, '物理', 'A dark sorceress in a hooded robe holding a crooked staff with a dark orb.')
add('unit:h06V', '小鱼人', 'monster', 'rig', 1.3, 3000, '物理', 'A small murloc fishman with a big mouth, fins and a little spear.')
add('unit:ngrk', '泥潭傀儡', 'monster', 'rig', 1.6, 3000, '物理', 'A mud golem made of dripping swamp mud and stones.')
add('unit:h07Y', '智慧的魔法破坏者', 'monster', 'rig', 1.7, 3000, '魔法', 'An elf spellbreaker warrior with a round glaive and a tall crested helmet.')
add('unit:nenf', '强制者', 'monster', 'rig', 1.8, 3000, '抗性', 'A broken draenei enforcer, hunched and scarred, holding a heavy mace.')
add('unit:h083', '迅捷的小蜥蜴', 'monster', 'rig', 0.8, 3000, '魔法', 'A small fast lizard creature running on its hind legs, long tail.')
add('unit:nder', '小小强', 'monster', 'rig', 0.6, 3000, '神圣', 'A small scarab beetle bug with a shiny carapace and pincers.')
add('unit:h07L', '大牧师', 'monster', 'rig', 1.7, 3000, '神圣', 'A human high priest in white robes with a holy book and a glowing halo.')
add('unit:h09H', '金色的骑士', 'monster', 'rig', 2.2, 3000, '物理', 'A golden armored knight riding a warhorse, holding a lance.')
add('unit:hgyr', '血精灵工人', 'monster', 'rig', 1.6, 3000, '物理', 'A blood elf worker carrying a sack of goods and a pick.')
add('unit:ndrf', '达拉内尔守卫', 'monster', 'rig', 2.0, 3000, '物理', 'A tall draenei guard with hooves, tentacle beard, polearm and plated armor.')
add('unit:ndrd', '屠杀者', 'monster', 'rig', 2.4, 3000, '魔法', 'A huge white-skinned draenei slaughterer with two great axes and heavy armor.')
add('unit:ncea', '半人马弓箭手', 'monster', 'rig', 2.0, 3000, '抗性', 'A centaur archer, half horse half man, with a long bow.')
add('unit:nspd', '小蚂蚁', 'monster', 'rig', 0.9, 3000, '抗性', 'A small nerubian ant-spider insect warrior with sharp mandibles.')
add('unit:hmtm', '迫击炮小队', 'monster', 'rig', 1.3, 3000, '抗性', 'A dwarf mortar team: a dwarf pushing a small mortar cannon on wheels.')
add('unit:njg1', '人马将领', 'boss', 'rig', 3.2, 12000, '抗性', 'A large centaur warlord with a horned helmet, a giant axe and war paint.')
add('unit:h07B', '敏捷的蒸汽机车', 'monster', 'rig', 1.6, 3000, '神圣', 'A small steam-powered war wagon vehicle with a smokestack and spiked wheels.')
add('unit:n08T', '大苦工', 'monster', 'rig', 1.6, 3000, '神圣', 'A big corrupted orc peon worker with a pickaxe and red skin.')
add('unit:h07X', '剑士', 'monster', 'rig', 1.8, 3000, '抗性', 'A human swordsman captain with a long sword and a feathered hat.')
add('unit:ogru', '兽族步兵', 'monster', 'rig', 1.9, 3000, '抗性', 'An orc grunt warrior with a big battle axe and spiked shoulder pads.')
add('unit:n09B', '大豪猪', 'monster', 'rig', 2.0, 3000, '魔法', 'A big quilboar porcupine boar-man with long spikes on the back, standing upright.')
add('unit:nsty', '小豪猪', 'monster', 'rig', 1.3, 3000, '物理', 'A small spiky porcupine boar-man warrior with a spear.')

# ---------------- 自动变体（0 积分）：(key, 名称, category, 基础模型, 缩放, 染色, 说明)
V = [
    ('unit:nssp', '敏捷的蜘蛛', 'monster', 'unit:n090', 0.9, '0.8,0.9,1.1', '同为魔法甲，体型略小'),
    ('unit:nspg', '森林蜘蛛', 'monster', 'unit:n08L', 0.9, '0.9,1,0.9', '同为魔法甲'),
    ('unit:hsor', '女巫', 'monster', 'unit:h07M', 0.95, '1.15,1.05,1', '同为物理甲，颜色更亮'),
    ('unit:hspt', '魔法破坏者', 'monster', 'unit:h07Y', 0.95, '0.9,0.9,0.9', '同为魔法甲'),
    ('unit:hmpr', '牧师', 'monster', 'unit:h07L', 0.95, '0.95,0.95,0.9', '同为神圣甲'),
    ('unit:ndmu', '大小强', 'monster', 'unit:nder', 1.8, '1,0.9,0.8', '同为神圣甲，放大到 1.8 倍'),
    ('unit:hkni', '骑士', 'monster', 'unit:h09H', 1.0, '0.8,0.8,0.85', '同为物理甲，去掉金色'),
    ('unit:hmtt', '蒸汽机车', 'monster', 'unit:h07B', 1.0, '0.85,0.85,0.85', '同为神圣甲'),
    ('unit:ncpn', '邪恶的苦工', 'monster', 'unit:n08T', 0.85, '1,0.85,0.85', '同为神圣甲，体型较小'),
    ('unit:hcth', '船长', 'monster', 'unit:h07X', 1.0, '0.9,0.9,1', '同为抗性甲'),
    ('unit:nsqa', '大豪猪（BOSS）', 'boss', 'unit:n09B', 1.5, '1,0.85,0.85', '同为魔法甲，BOSS 放大 1.5 倍'),
]

rows = []
for key, name, cat, mode, h, faces, note, desc in L:
    prompt = desc
    if key.startswith('unit:'):
        prompt = f'{desc} Clearly visible {ARMOR[note]} armor pieces / cloth on the body (team color), readable from far away.'
        note = f'{note}护甲'
    folder = key.replace(':', '_')
    rows.append(dict(folder=folder, key=key, 名称=name, 类别=cat, 方式=mode, 身高=h, 面数=faces, 基础模型='', 缩放='', 染色='',
                     设定=note, 提示词=prompt, 预计积分=COST[mode]))
for key, name, cat, base, sc, tint, note in V:
    rows.append(dict(folder=key.replace(':', '_'), key=key, 名称=name, 类别=cat, 方式='variant', 身高='', 面数='', 基础模型=base, 缩放=sc, 染色=tint,
                     设定=note, 提示词='', 预计积分=0))

out = os.path.join(ROOT, 'art', '第1批生成清单.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
from collections import Counter
cnt = Counter(r['方式'] for r in rows)
total = sum(r['预计积分'] for r in rows)
print(out)
print(f'共 {len(rows)} 项：{dict(cnt)}；预计 {total} 积分（不含重做）')
