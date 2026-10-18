"""生成美术素材清单 assets/素材清单.csv（每个单位一行，带原图模型参考）。
用法：python3 tools/gen_asset_list.py <包含 units.json 的目录>
"""
import csv, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
u = json.load(open(os.path.join(sys.argv[1], 'units.json')))
s = open(os.path.join(ROOT, 'h5/data.js'), encoding='utf-8').read()
D = json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))
heroes_all = json.load(open(os.path.join(ROOT, 'analysis/data/heroes.json')))

ARMOR_CN = {'small': '物理', 'medium': '抗性', 'large': '魔法', 'divine': '神圣', 'hero': '英雄', 'none': '无甲', 'normal': '无甲'}
ATK_CN = {'normal': '普通', 'pierce': '穿刺', 'magic': '魔法', 'chaos': '混乱', 'hero': '英雄'}
model = lambda i: (u.get(i, {}).get('file') or '').replace('\\', '/').split('/')[-1].replace('.mdl', '')
scale = lambda i: u.get(i, {}).get('modelScale') or '1'

rows = []
def add(**k): rows.append(k)

add(key='builder', cat='建造者', name='循环圈守卫者', ref=model('u001'), type='—', scale=scale('u001'), speed='500', prio='P0',
    anim='待机 / 行走（8 方向）/ 建造 / 闪烁', note='火焰熊猫酒仙造型，无敌，全图闪烁')
# 英雄：4 个已实装 P0，其余 P2
done = {v['id'] for v in D['heroes'].values()}
seen_names = set()
for hid, h in sorted(heroes_all.items(), key=lambda kv: kv[0] not in done):    # 已实装的先登记，重名的其它版本加 ID 区分
    hkey = f"hero:{h['name']}" if h['name'] not in seen_names else f"hero:{h['name']}#{hid}"
    seen_names.add(h['name'])
    add(key=hkey, cat='英雄塔', name=f"{h['name']}（{h['title']}）", ref=model(hid), type=ATK_CN.get(h['attackType'], h['attackType']),
        scale=scale(hid), speed='不移动', prio='P0' if hid in done else 'P2', anim='待机 / 攻击 / 施法（4 个技能各一个特效）',
        note=' / '.join(x['name'] for x in h['skillPool'][:5]))
# 塔：每个家族按 1 级 / 中级 / MAX 三档外观
for fam, t in D['towers'].items():
    levels = t['levels'] + [x for b in t.get('branches', {}).values() for x in b]
    atk = '光环' if t['cat'] == 'aura' else ATK_CN.get(t['levels'][0]['atk'], '')
    add(key=f'tower:{fam}', cat={'main': '主塔', 'raw': '原始塔', 'sup': '辅助塔', 'aura': '光环塔', 'alt': '另类塔'}[t['cat']], name=fam,
        ref=model(t['levels'][0]['id']), type=atk, scale=scale(t['levels'][0]['id']), speed='不移动', prio='P0',
        anim='待机 / 攻击（光环塔为常驻光效）', note=f"共 {len(levels)} 级；建议 1 级 / 中级 / MAX 三档外观" + (f"；4 个分支：{'/'.join(t['branches'])}" if t.get('branches') else ''))
# 怪物：出现在波次里的 P0，其它（BOSS 备选等）P1
in_waves = set()
for vs in D['waves'].values():
    for v in vs: in_waves.update(v['pool']); in_waves.update(v['direct'])
first_wave = {}
for n, vs in D['waves'].items():
    for v in vs:
        for i in v['pool'] + v['direct']: first_wave.setdefault(i, int(n))
for i, m in sorted(D['units'].items(), key=lambda kv: (first_wave.get(kv[0], 99), kv[1]['hp'])):
    boss = m['hp'] >= 10000
    add(key=f'unit:{i}', cat='BOSS' if boss else '怪物', name=m['name'], ref=model(i), type=ARMOR_CN.get(m['armorType'], m['armorType']) + '护甲',
        scale=scale(i), speed=str(int(m['speed'])), prio='P0' if i in in_waves else 'P1',
        anim='行走（8 方向）/ 死亡' + ('/ 技能' if boss else ''), note=f"首次出现：第 {first_wave.get(i, '—')} 波；生命 {int(m['hp'])}，护甲 {m['armor']}")

out = os.path.join(ROOT, 'h5/assets/素材清单.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['素材 key', '类别', '名称', '原图模型参考', '护甲/攻击类型', '原图缩放', '移速', '优先级', '动作需求', '设计要点'])
    for r in rows: w.writerow([r['key'], r['cat'], r['name'], r['ref'], r['type'], r['scale'], r['speed'], r['prio'], r['anim'], r['note']])
from collections import Counter
print(out, len(rows), Counter((r['cat'], r['prio']) for r in rows))
