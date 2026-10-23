"""把原图随机模式能放开的英雄塔写进 h5/data.js 的 heroes（覆盖 gen_data.py 生成的 4 个）。
随机建造时 Hc = GetRandomInt(1,17)，有"英雄赞助"是 1~34（18~34 是赞助英雄，sponsor: true），编号见 POOL 的顺序。
没有技能书的英雄（伏魔、驯龙、先知、鬼、巨魔召唤师、地狱火）技能直接挂在单位上，写进 cmds（命令按钮）。
另外把怪物的等级和攻击写进 units（伏魔驯化怪物后，随从用怪物自己的攻击）。
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
        ('坦克', 'H07D', 'h07E'), ('古树', 'H05Q', 'h06P'),
        # 赞助英雄（Hc 18~34）
        ('伏魔', 'H05Y', 'h05Z'), ('驯龙', 'H062', 'h061'), ('恶魔之子', 'H06B', 'h06A'), ('图腾', 'H06K', 'h06L'), ('猛犸', 'H060', 'h05R'),
        ('先知', 'H06S', 'h06T'), ('鬼', 'H074', 'h075'), ('虫', 'H07A', 'h072'), ('妖灵', 'H05O', 'h05N'), ('大法师', 'H07N', 'h07P'),
        ('狗头人觉醒者', 'H07Z', 'h086'), ('巨魔召唤师', 'H08A', 'h08B'), ('地狱火', 'H08W', 'h08O'), ('龙鹰', 'H092', 'h093'), ('月之女神', 'H095', 'h097'),
        ('巨人', 'H099', 'h098'), ('凤凰', 'H09F', 'h073')]
SPONSOR_FROM = 18
# 技能书里名字只是代号（QS1、kn1、WS 1……）的，按技能说明起名
NAMES = {
    '大巫师': ['巫伤', '恐怖嚎叫', '死亡呐喊', '巫驱', '巫缓'],
    '渔人': ['鱼人甲', '鱼人乙', '鱼人丙', '鱼人丁', '进化药水'],
    '狂牛': ['震荡波', '祭坛守卫', '重生点', '狂暴重击'],
    '神幻': ['流星', '雷霆', '战霆', '怒霆', '霆杀'],
    '枪神': ['穿刺致命', '火焰喷射', '混乱致命', '急速枪魂'],
    '坦克': ['多重火箭弹', '巨型火炮弹', '混乱轰炸区', '小型冲锋枪', '战争科技'],
    '古树': ['清风', '粘液', '精灵', '链带', '生灵'],
    '恶魔之子': ['地狱火', '地狱刺', '傲慢', '变身', '恶魔吞噬'],
    '图腾': ['切换', '提升上限'],
    '猛犸': ['雷霆', '践踏', '刷新', '力量之源', '元神'],
    '虫': ['路刺', '飞虫', '虫巢', '尸爆', '甲虫'],
    '妖灵': ['普通飞鸟', '魔法飞鸟', '混乱飞鸟', '通用飞鸟', '冰冻冷箭'],
    '大法师': ['火焰之印', '雷电之印', '冰雪之印', '暗黑之印', '印记掌控'],
    '狗头人觉醒者': ['额外伤害', '属性转换', '属性掌控', '禁止通行', '狗头分身'],
    '龙鹰': ['天雷', '轰雷', '引雷', '激电', '幻云'],
    '月之女神': ['天赋一', '天赋二', '天赋三', '重置天赋'],
    '巨人': ['链接之力', '践踏', '近战巨人', '腐蚀之雨'],
    '凤凰': ['重置殇', '重置舞', '殇的护甲', '舞的护甲'],
}
CMD_NAMES = {'先知': ['释魂', '命运', '强化最小攻击', '强化最大攻击', '吸收'], '鬼': ['提升属性', '药水 Q', '药水 W', '药水 E', '药水 R'],
             '地狱火': ['增加召唤数', '切换颜色', '随机技能']}
# 不在单位命令面板上的通用技能（升级、属性选择、无敌、查询等）
NOT_CMD = {'A0B6', 'A0CD', 'A0V9', 'Avul', 'Aloc', 'AInv', 'A04D', 'A04B'}

dpath = os.path.join(ROOT, 'h5/data.js')
head, body = open(dpath, encoding='utf-8').read().split('window.GAME_DATA = ', 1)
D = json.loads(body.rstrip().rstrip(';'))
heroes = {}
for i, (nm, hid, bid) in enumerate(POOL):
    u, b = U[hid], U[bid]
    abil = [x for x in (u.get('abilList') or '').split(',') if x]
    book = next((x for x in abil if A.get(x, {}).get('code') == 'Aspb'), None)
    skills, cmds = [], []
    if not book:
        for sid in abil:
            if sid in NOT_CMD or sid not in A: continue
            s = A[sid]
            nm2 = CMD_NAMES.get(nm, [])
            cmds.append(dict(id=sid, name=nm2[len(cmds)] if len(cmds) < len(nm2) else re.sub(r'^(js|xx|hh|dyh|DYH|JM|--|-|\*|\s|666|888+)+', '', cl(s.get('Name'))).strip(' -'), desc=cl(s.get('Ubertip')), art=s.get('Art')))
    for j, sid in enumerate((A[book].get('DataA1') or '').split(',') if book else []):
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
                      instant=wt == 'instant', skills=skills, cmds=cmds, sponsor=i + 1 >= SPONSOR_FROM)
D['heroes'] = heroes
# 怪物的等级和攻击（伏魔驯化后的随从用）
for uid, v in D['units'].items():
    u = U.get(uid)
    if not u: continue
    v['level'] = int(fl(u, 'level', 1))
    if u.get('atkType1') and u.get('weapTp1'):
        v['atk'] = dict(dmg=fl(u, 'dmgplus1') + fl(u, 'dice1', 1) * (fl(u, 'sides1', 1) + 1) / 2, cd=fl(u, 'cool1', 1.5),
                        range=max(100, fl(u, 'rangeN1', 100)), type=u.get('atkType1'), splash=fl(u, 'Farea1') if u.get('weapTp1') == 'msplash' else 0)
open(dpath, 'w', encoding='utf-8').write(head + 'window.GAME_DATA = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('data.js 英雄：', ' '.join(f"{h['hc']}{n}({len(h['skills'])})" for n, h in heroes.items()))
