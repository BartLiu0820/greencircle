"""把 gen_data.py 没收的塔补进 h5/data.js：大辅助、巫系、全场唯一塔，以及大辅助"进化"后的 4 座塔。
数据直接取 8.6.6 的单位表 / 技能表（analysis/raw/units_all.json、abilities_all.json）。
在 gen_data.py 之后运行：python3 tools/add_towers.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = json.load(open(os.path.join(ROOT, 'analysis/raw/units_all.json'), encoding='utf-8'))
A = json.load(open(os.path.join(ROOT, 'analysis/raw/abilities_all.json'), encoding='utf-8'))
cl = lambda s: re.sub(r'\|c[0-9a-fA-F]{8}|\|r|\|R', '', s or '').replace('|n', '\n').replace('|N', '\n').strip('"')


def fl(v, k, d=0.0):
    try: return float(v.get(k))
    except (TypeError, ValueError): return d


def abil(i):
    w = A[i]
    d = dict(id=i, code=w.get('code'), name=cl(w.get('Name')))
    for k in ('DataA1', 'DataB1', 'DataC1', 'DataD1', 'Area1', 'Dur1', 'Cool1'):
        if fl(w, k, None) is not None: d[k[4] if k.startswith('Data') else k.lower()[:-1]] = fl(w, k)
    return d


SKIP = {'Avul', 'A04B', 'A04D'}
# 单位表里塔的说明（Ubertip）不全，名字和说明用 analysis/data/towers_all_buildable.json 里整理好的
TIPS = {v['id']: v.get('tip') for v in json.load(open(os.path.join(ROOT, 'analysis/data/towers_all_buildable.json'), encoding='utf-8')).values()}


def level(i):
    v = U[i]
    return dict(id=i, name=v.get('Name'), gold=fl(v, 'goldcost'), food=fl(v, 'fused'),
                dmg=fl(v, 'dmgplus1') + fl(v, 'dice1') * (fl(v, 'sides1') + 1) / 2, cd=fl(v, 'cool1', 1), range=fl(v, 'rangeN1', 600),
                atk=v.get('atkType1') or 'normal', targets=1, mana=fl(v, 'manaN'), manaRegen=fl(v, 'regenMana'),
                tip=cl(TIPS.get(i) or v.get('Ubertip'))[:220],
                abils=[abil(x) for x in (v.get('abilList') or '').split(',') if x in A and x not in SKIP])


FAMILIES = {
    # 大辅助（原图"新辅助"，每人最多 2 个）
    '萨满塔': ('big', 'h00E'), '兽人塔': ('big', 'h00J'), '驱逐塔': ('big', 'h014'), '缓速塔': ('big', 'h00L'),
    # 巫系（每人最多 1 个）
    '巫医塔': ('witch', 'h042'), '巫术塔': ('witch', 'h04S'), '巫法塔': ('witch', 'h00V'), '巫魔塔': ('witch', 'h03Y'),
    # 全场唯一
    '恐惧塔': ('uniq', 'n029'), '火速塔': ('uniq', 'n01B'), '神力塔': ('uniq', 'n00L'), '冰封塔': ('uniq', 'n02A'),
    '银行塔': ('uniq', 'n02S'), '魔法塔': ('uniq', 'n03V'),
    # 大辅助进化（不出现在建造栏）：萨满 → 小熊猫（风）、兽人 → 小熊猫（火）、驱逐 → 巫师（光明）、缓速 → 巫师（暗黑）
    '小熊猫塔（风）': ('evo', 'h039'), '小熊猫塔（火）': ('evo', 'h03D'), '巫师塔（光明）': ('evo', 'h05G'), '巫师塔（暗黑）': ('evo', 'h05H'),
}

# 随机模式主塔池（Qf = 1~17）里 gen_data.py 没收的 10 种：都要求 ovln（只能建造一个主塔）；
# 狂狼塔 / 兽王塔还要 h06O / hhou（"只能被一个玩家建造"，全场只有一个玩家能建）
MAIN = {'原始指挥官': 'n078', '风行塔': 'n041', '五行塔': 'n03I', '将军塔': 'n01T', '狂狼塔': 'n069', '天将塔': 'n05Q',
        '小熊猫塔（土）': 'h03C', '巫妖塔': 'h043', '人马塔': 'n02F', '兽王塔': 'n06N'}


def chain(root):
    out, k = [], root
    while k and k in U and k not in [x['id'] for x in out]:
        lv = level(k)
        v = U[k]
        lv['targets'] = int(fl(v, 'targCount1', 1)) or 1
        if v.get('weapTp1') == 'msplash':                                       # 溅射：攻击目标周围 Farea1 范围同样伤害，Harea1 范围 Hfact1 倍
            lv['splash'] = fl(v, 'Farea1')
            if fl(v, 'Harea1') > lv['splash']: lv['splashH'], lv['splashF'] = fl(v, 'Harea1'), fl(v, 'Hfact1')
        if v.get('atkType2') and fl(v, 'dmgplus2') > 0:                        # 第二武器（五行塔金·强化五行 R003、风行塔天赋 R006 用科技打开）
            lv['weap2'] = dict(dmg=fl(v, 'dmgplus2') + fl(v, 'dice2') * (fl(v, 'sides2') + 1) / 2, cd=fl(v, 'cool2', 1), range=fl(v, 'rangeN2', 800),
                               atk=v.get('atkType2'), splash=fl(v, 'Farea2') if v.get('weapTp2') == 'msplash' else 0)
        out.append(lv)
        nxt = [x for x in (v.get('Upgrade') or '').split(',') if x in U]
        k = nxt[0] if nxt else None
    return out


dpath = os.path.join(ROOT, 'h5/data.js')
head, body = open(dpath, encoding='utf-8').read().split('window.GAME_DATA = ', 1)
D = json.loads(body.rstrip().rstrip(';'))
for name, (cat, uid) in FAMILIES.items():
    D['towers'][name] = dict(name=name, cat=cat, levels=[level(uid)])
for name, uid in MAIN.items():
    D['towers'][name] = dict(name=name, cat='main', levels=chain(uid))
# 兽王驯化的怪物吃不吃训兽科技 R00Z（+700 攻击 / 级）：看单位的科技列表
for uid, u in D['units'].items():
    if 'R00Z' in (U.get(uid, {}).get('upgrades') or ''): u['train'] = 1
# 弹跳塔 MAX（h021）：不在建造栏，由 3 座 4 级弹跳塔合成（A0CI）或天赋快建得到；武器是 mbounce，17 个目标
bmax = level('h021')
bmax.update(targets=int(fl(U['h021'], 'targCount1', 1)), tip='伤害类型为【通用】，弹射 17 个目标；每次攻击放灵魂重击')
D['towers']['弹跳塔']['max'] = bmax
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 补进塔：', ' '.join(f'{n}({c})' for n, (c, _) in FAMILIES.items()), ' 主塔：', ' '.join(MAIN))
