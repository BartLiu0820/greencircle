"""把无尽关卡的 10 种怪物补进 h5/data.js（原图 zd：每 20 秒一波，Dr = GetRandomInt(1,10) 决定出哪种）。
数据直接取 8.6.6 的单位表（analysis/raw/units_all.json），格式和 gen_data.py / add_heroes.py 写的怪物一样。
在 add_heroes.py 之后运行：python3 tools/add_endless.py，再用 tools/war3_batch.py 出这些怪物的精灵表
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = json.load(open(os.path.join(ROOT, 'analysis/raw/units_all.json'), encoding='utf-8'))
# 原图 zd 里 Dr → Ul 的对应（1~10）
ENDLESS = ['nfgl', 'noga', 'ndrt', 'ndrn', 'nogn', 'nglm', 'ndsa', 'nogo', 'ndrl', 'nsw2']


def fl(v, k, d=0.0):
    try: return float(v.get(k))
    except (TypeError, ValueError): return d


dpath = os.path.join(ROOT, 'h5/data.js')
src = open(dpath, encoding='utf-8').read()
head = src[:src.index('window.GAME_DATA')]
D = json.loads(src[src.index('{'):src.rindex('}') + 1])
for i in ENDLESS:
    v = U[i]
    d = dict(id=i, name=v.get('Name'), hp=fl(v, 'HP', 1), armor=fl(v, 'def'), armorType=v.get('defType') or 'none',
             speed=fl(v, 'spd'), bounty=fl(v, 'bountyplus') + fl(v, 'bountydice') * (fl(v, 'bountysides') + 1) / 2,
             regen=fl(v, 'regenHP'), level=int(fl(v, 'level', 1)))
    if v.get('atkType1') and v.get('weapTp1'):
        d['atk'] = dict(dmg=fl(v, 'dmgplus1') + fl(v, 'dice1', 1) * (fl(v, 'sides1', 1) + 1) / 2, cd=fl(v, 'cool1', 1.5),
                        range=max(100, fl(v, 'rangeN1', 100)), type=v.get('atkType1'), splash=fl(v, 'Farea1') if v.get('weapTp1') == 'msplash' else 0)
    D['units'][i] = d
D['endless'] = ENDLESS
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 无尽怪物：', ' '.join(f"{i}{D['units'][i]['name']}" for i in ENDLESS))
