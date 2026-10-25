"""怪物的被动技能和触发器刷出来的单位补进 h5/data.js。
  - 所有怪物：按单位表的技能列表写进被动 pas = { evade 闪避概率, mi 魔法免疫, skin [概率, 减少伤害, 最少伤害] 硬化皮肤 }
  - 原图触发器刷出来、波次里没有的单位（大骷髅 / 骷髅法师的复活、死亡分裂、BOSS 被攻击时召唤的东西）
数据直接取 8.6.6 的单位表 / 技能表（analysis/raw/），格式和 add_endless.py 一样。
在 add_endless.py 之后运行：python3 tools/add_monster_extra.py，再用 tools/war3_batch.py 出新单位的精灵表
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = json.load(open(os.path.join(ROOT, 'analysis/raw/units_all.json'), encoding='utf-8'))
A = json.load(open(os.path.join(ROOT, 'analysis/raw/abilities_all.json'), encoding='utf-8'))
EXTRA = [
    'nsoc', 'nslm', 'nslf',                                   # 大骷髅死了复活成等死的骷髅（不动），再死复活成疯狂的骷髅；大骷髅被打时召唤骷髅
    'n070', 'n074', 'n073', 'n072', 'n075', 'n076',           # 骷髅法师一次次复活
    'u000', 'nscb', 'n08M', 'o00A', 'nsc2',                   # 阴影 / 女巫 / 森林蜘蛛 / 狼骑士 / 蒸汽机车死了留下的
    'nsqe', 'ninc', 'nten', 'ncg3', 'nbwm', 'n06W',           # 大红牛 / 大豪猪的虱虫，地狱火机关人，酒瓶，人工地精，魔王召唤的黑龙 / 石像鬼
]


def fl(v, k, d=0.0):
    try: return float(v.get(k))
    except (TypeError, ValueError): return d


def unit(i):
    v = U[i]
    d = dict(id=i, name=v.get('Name'), hp=fl(v, 'HP', 1), armor=fl(v, 'def'), armorType=v.get('defType') or 'none',
             speed=fl(v, 'spd'), bounty=fl(v, 'bountyplus') + fl(v, 'bountydice') * (fl(v, 'bountysides') + 1) / 2,
             regen=fl(v, 'regenHP'), level=int(fl(v, 'level', 1)))
    if v.get('atkType1') and v.get('weapTp1'):
        d['atk'] = dict(dmg=fl(v, 'dmgplus1') + fl(v, 'dice1', 1) * (fl(v, 'sides1', 1) + 1) / 2, cd=fl(v, 'cool1', 1.5),
                        range=max(100, fl(v, 'rangeN1', 100)), type=v.get('atkType1'), splash=fl(v, 'Farea1') if v.get('weapTp1') == 'msplash' else 0)
    return d


def passives(i):
    p = {}
    for a in (U.get(i, {}).get('abilList') or '').split(','):
        ab = A.get(a, {})
        code = ab.get('code')
        if code == 'AEev': p['evade'] = fl(ab, 'DataA1')
        if code == 'Amim': p['mi'] = 1
        if code == 'Assk': p['skin'] = [fl(ab, 'DataA1') / 100, fl(ab, 'DataC1'), fl(ab, 'DataB1')]
    return p


dpath = os.path.join(ROOT, 'h5/data.js')
src = open(dpath, encoding='utf-8').read()
head = src[:src.index('window.GAME_DATA')]
D = json.loads(src[src.index('{'):src.rindex('}') + 1])
for i in EXTRA:
    if i not in D['units']: D['units'][i] = unit(i)
for i, d in D['units'].items():
    d.pop('pas', None)
    p = passives(i)
    if p: d['pas'] = p
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 补进单位：', ' '.join(f"{i}{D['units'][i]['name']}" for i in EXTRA))
print('有被动的怪物：', ' '.join(f"{i}{d['name']}{d['pas']}" for i, d in D['units'].items() if 'pas' in d))
