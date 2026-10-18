"""Generate h5/data.js from the data extracted from the map (analysis/). Run: python3 tools/gen_data.py <scratch json dir>"""
import json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = sys.argv[1]  # dir with units.json / abilities.json / waves_raw.json
u = json.load(open(os.path.join(J, 'units.json')))
a = json.load(open(os.path.join(J, 'abilities.json')))
waves_raw = json.load(open(os.path.join(J, 'waves_raw.json')))
heroes_all = json.load(open(os.path.join(ROOT, 'analysis/data/heroes.json')))

cl = lambda s: re.sub(r'\|c[0-9a-fA-F]{8}|\|r|\|R', '', s or '').replace('|n', '\n').replace('|N', '\n').strip('"')

def f(v, k, d=0.0):
    try:
        return float(v.get(k))
    except (TypeError, ValueError):
        return d

def unit_stats(i):
    v = u[i]
    return dict(id=i, name=v.get('Name'), hp=f(v, 'HP', 1), armor=f(v, 'def'), armorType=v.get('defType') or 'none',
                speed=f(v, 'spd', 0), bounty=f(v, 'bountyplus') + f(v, 'bountydice') * (f(v, 'bountysides') + 1) / 2,
                regen=f(v, 'regenHP'))

def abil_data(i):
    w = a[i]
    d = dict(id=i, code=w.get('code'), name=cl(w.get('Name')))
    for k in ('DataA1', 'DataB1', 'DataC1', 'DataD1', 'Area1', 'Dur1', 'Cool1'):
        try:
            d[k[4] if k.startswith('Data') else k.lower()[:-1]] = float(w.get(k))   # DataA1 -> A, Area1 -> area
        except (TypeError, ValueError):
            pass
    return d

SKIP = {'Avul', 'A04B', 'A04D', 'Aatk', 'Abun', 'ACmi', 'A08F', 'A08E', 'A07H', 'A07D', 'A00K', 'A072', 'A035', 'A05G', 'A033'}

def level(i):
    v = u[i]
    dmg = f(v, 'dmgplus1') + f(v, 'dice1') * (f(v, 'sides1') + 1) / 2
    return dict(id=i, name=v.get('Name'), gold=f(v, 'goldcost'), food=f(v, 'fused'), dmg=dmg, cd=f(v, 'cool1', 1),
                range=f(v, 'rangeN1', 600), atk=v.get('atkType1') or 'normal', targets=f(v, 'targCount1', 1) or 1,
                tip=cl(v.get('Ubertip'))[:220],
                abils=[abil_data(x) for x in (v.get('abilList') or '').split(',') if x in a and x not in SKIP])

def chain(root):
    out, k, seen = [], root, set()
    while k and k in u and k not in seen:
        seen.add(k); out.append(level(k))
        nxt = [x for x in (u[k].get('Upgrade') or '').split(',') if x in u]
        k = nxt[0] if nxt else None
    return out

FAMILIES = {
    # key: (category, root id)
    '扫射塔': ('main', 'h03U'), '天神塔': ('main', 'n00W'), '寒冰塔': ('main', 'h046'), '魔幻塔': ('main', 'n009'),
    '神圣塔': ('main', 'h00Z'), '剑圣塔': ('main', 'h02S'),
    '牛头塔': ('raw', 'n02B'), '通灵塔': ('raw', 'n01D'), '闪电塔': ('raw', 'n01C'), '箭塔': ('raw', 'n019'),
    '毒塔': ('raw', 'h00N'), '群攻塔': ('raw', 'h004'), '混乱塔': ('raw', 'h01O'), '破坏塔': ('raw', 'h01P'),
    '腐蚀塔': ('sup', 'h037'), '暴击塔': ('sup', 'h03J'), '重击塔': ('sup', 'h03O'), '冰霜塔': ('sup', 'h032'),
    '加速光环': ('aura', 'h01V'), '攻击光环': ('aura', 'h00I'), '减防光环': ('aura', 'h00G'), '减速光环': ('aura', 'h01W'),
}
# 另类塔: take the roots that the 另类塔类 placeholder upgrades into
for r in (u['h02Y'].get('Upgrade') or '').split(','):
    if r in u:
        nm = re.sub(r'\d级|1级|MAX|Max', '', u[r]['Name']).strip()
        if nm in ('灵魂塔', '图腾塔', '精灵塔', '巨箭塔', '地精塔'):
            FAMILIES[nm] = ('alt', r)

towers = {}
for name, (cat, root) in FAMILIES.items():
    towers[name] = dict(name=name, cat=cat, levels=chain(root))
# 弹跳塔: base + 4 branches
bounce_base = level('h01Y')
branches = {}
for b in (u['h01Y'].get('Upgrade') or '').split(','):
    if b in u:
        lv = chain(b)
        tag = re.search(r'（(.+?)\d级）', u[b]['Name']).group(1)
        branches[tag] = lv
towers['弹跳塔'] = dict(name='弹跳塔', cat='main', levels=[bounce_base], branches=branches)

# heroes (skills are implemented in game.js; we export text + base stats)
HERO_IDS = {'剑神': 'H03Q', '枪神': 'H05K', '邪冰': 'H033', '火魂': 'H04Z'}
heroes = {}
for nm, hid in HERO_IDS.items():
    h = heroes_all[hid]
    heroes[nm] = dict(id=hid, name=nm, title=h['title'], atk=h['attackType'], cd=h['cooldown'], range=h['range'], mana=f(u[hid], 'manaN', 1000),
                      gold=h['gold'] or 425, skills=[dict(name=re.sub(r'^(js|xx|--|-|\s)+', '', s['name']).replace('xx', '').strip(), desc=s['desc']) for s in h['skillPool']])
# 枪神的技能在地图里只叫 QS1~QS4，按技能说明起名
for s, nm in zip(heroes['枪神']['skills'], ['穿刺致命', '火焰喷射', '混乱致命', '急速枪魂']):
    s['name'] = nm

# waves
def cn2i(t):
    d = {c: i + 1 for i, c in enumerate('一二三四五六七八九')}
    if '十' not in t: return d[t]
    x, y = t.split('十')
    return (d[x] if x else 1) * 10 + (d[y] if y else 0)
waves, n, prev_boss, ids = {}, 0, False, set()
for w in waves_raw:
    if w['wave'] == 'BOSS波开始':
        if not prev_boss: n += 1
        prev_boss = True
    else:
        n = cn2i(re.match(r'第(.+)波开始', w['wave']).group(1)); prev_boss = False
    pool = [x for x in dict.fromkeys(w['monsters']) if x in u]
    direct = [x for x in dict.fromkeys(w['direct']) if x in u and x not in pool]
    ids.update(pool); ids.update(direct)
    waves.setdefault(str(n), []).append(dict(boss=w['wave'] == 'BOSS波开始', hints=[h for h in w['labels'] if h != 'BOSS波'] or ['多 物理'], pool=pool, direct=direct))
EXTRA = ['nsqt', 'nsqo', 'nsko', 'n071', 'ncim', 'nrdk', 'nrdr', 'nbzd', 'ngrd', 'Udea', 'Nalc', 'Nfir', 'Npbm', 'Ntin', 'nfor', 'nfod', 'nfot', 'nerw', 'n06Y', 'ndrj', 'n09B', 'nsqa', 'nsty', 'nsog', 'n06Z']
ids.update(EXTRA)
units = {i: unit_stats(i) for i in sorted(ids) if i in u}

DMG = {  # war3mapMisc.txt: columns small, medium, large, fort, normal(none), hero, divine, unarmored
    'normal': [0.20, 1.00, 0.65, 1, 1, 0.10, 0.30, 1.00], 'pierce': [0.60, 0.35, 1.15, 1, 1, 0.10, 0.10, 1.00],
    'magic': [1.10, 0.65, 0.15, 1, 1, 0.10, 0.20, 1.00], 'chaos': [0.35, 0.30, 0.40, 1, 1, 0.10, 1.10, 1.00],
    'hero': [1, 1, 1, 1, 1, 1, 1, 1], 'spells': [1.10, 0.65, 0.15, 1, 1, 0.10, 0.20, 1.00]}

out = dict(towers=towers, heroes=heroes, waves=waves, units=units, damage=DMG)
os.makedirs(os.path.join(ROOT, 'h5'), exist_ok=True)
with open(os.path.join(ROOT, 'h5/data.js'), 'w', encoding='utf-8') as fp:
    fp.write('// 自动生成：tools/gen_data.py —— 数据来自《绿色循环圈外传 8.6.6》地图文件\n')
    fp.write('window.GAME_DATA = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('towers', len(towers), 'heroes', len(heroes), 'waves', len(waves), 'units', len(units))
