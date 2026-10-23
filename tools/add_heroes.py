"""把原图随机模式能放开的 17 个英雄塔写进 h5/data.js 的 heroes（覆盖 gen_data.py 生成的 4 个）。
随机建造时 Hc = GetRandomInt(1,17)（有"英雄赞助"是 1~34，平台功能，不做），编号见 POOL 的顺序。
英雄塔是建筑（h03R 等，1500 金 + 5 木 + 4 人口），建成时换成英雄单位；造价取建筑的，攻击取英雄单位的。
技能列表取英雄"学习技能"技能书（Aspb）DataA 里的 5 个（有的英雄只有 4 个）。
在 gen_data.py 之后运行：python3 tools/add_heroes.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
U = json.load(open(os.path.join(ROOT, 'analysis/raw/units_all.json'), encoding='utf-8'))
A = json.load(open(os.path.join(ROOT, 'analysis/raw/abilities_all.json'), encoding='utf-8'))
cl = lambda s: re.sub(r'\|c[0-9a-fA-F]{8}|\|r|\|R', '', s or '').replace('|n', '\n').replace('|N', '\n').strip('"').strip()


def fl(v, k, d=0.0):
    try: return float(v.get(k))
    except (TypeError, ValueError): return d


# Hc 的编号顺序：名字、英雄单位、英雄塔建筑
POOL = [('剑神', 'H03Q', 'h03R'), ('大巫师', 'H05J', 'h05I'), ('幻影', 'H03I', 'h03F'), ('战神', 'Hpal', 'h01F'), ('水魔', 'Hamg', 'h04N'),
        ('渔人', 'H03M', 'h03L'), ('火魂', 'H04Z', 'h050'), ('狂牛', 'H05E', 'h05F'), ('神牛', 'H05A', 'h059'), ('电法', 'Hmkg', 'h04O'),
        ('箭灵', 'H031', 'h006'), ('神幻', 'H05C', 'h05D'), ('邪冰', 'H033', 'h035'), ('风神', 'Hblm', 'h00C'), ('枪神', 'H05K', 'h05M'),
        ('坦克', 'H07D', 'h07E'), ('古树', 'H05Q', 'h06P')]
# 技能书里名字只是代号（QS1、kn1、WS 1……）的，按技能说明起名
NAMES = {
    '大巫师': ['巫伤', '恐怖嚎叫', '死亡呐喊', '巫驱', '巫缓'],
    '渔人': ['鱼人甲', '鱼人乙', '鱼人丙', '鱼人丁', '进化药水'],
    '狂牛': ['震荡波', '祭坛守卫', '重生点', '狂暴重击'],
    '神幻': ['流星', '雷霆', '战霆', '怒霆', '霆杀'],
    '枪神': ['穿刺致命', '火焰喷射', '混乱致命', '急速枪魂'],
    '坦克': ['多重火箭弹', '巨型火炮弹', '混乱轰炸区', '小型冲锋枪', '战争科技'],
    '古树': ['清风', '粘液', '精灵', '链带', '生灵'],
}

dpath = os.path.join(ROOT, 'h5/data.js')
head, body = open(dpath, encoding='utf-8').read().split('window.GAME_DATA = ', 1)
D = json.loads(body.rstrip().rstrip(';'))
heroes = {}
for i, (nm, hid, bid) in enumerate(POOL):
    u, b = U[hid], U[bid]
    book = next(x for x in (u.get('abilList') or '').split(',') if A.get(x, {}).get('code') == 'Aspb')
    skills = []
    for j, sid in enumerate((A[book].get('DataA1') or '').split(',')):
        s = A[sid]
        name = NAMES[nm][j] if nm in NAMES else re.sub(r'^(js|xx|hh|--|-|\*|\s)+', '', cl(s.get('Name'))).replace('xx', '').strip(' -')
        skills.append(dict(id=sid, name=name, desc=cl(s.get('Ubertip')), art=s.get('Art')))
    wt = u.get('weapTp1')
    heroes[nm] = dict(id=hid, building=bid, hc=i + 1, name=nm, title=cl(u.get('Name')),
                      atk=u.get('atkType1') or 'normal', cd=fl(u, 'cool1', 1), range=fl(u, 'rangeN1', 700), mana=fl(u, 'manaN', 1000),
                      dmg=fl(u, 'dmgplus1') + fl(u, 'dice1', 1) * (fl(u, 'sides1', 1) + 1) / 2,
                      gold=fl(b, 'goldcost', 1500), wood=fl(b, 'lumbercost', 5), food=fl(b, 'fused', 4),
                      splash=fl(u, 'Farea1') if wt == 'msplash' else 0,
                      bounce=dict(n=int(fl(u, 'targCount1', 1)), jump=fl(u, 'Farea1', 500)) if wt == 'mbounce' else None,
                      instant=wt == 'instant', skills=skills)
D['heroes'] = heroes
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 英雄：', ' '.join(f"{h['hc']}{n}({len(h['skills'])})" for n, h in heroes.items()))
