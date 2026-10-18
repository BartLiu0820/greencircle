"""生成第 1 批出图清单 tools/blender/batch1.csv：守卫者、4 个英雄塔、28 种塔、第 1–10 波的怪物和 BOSS。
  python3 tools/blender/make_batch1.py
建模同学按 model 列的路径交文件（.blend / .glb / .fbx 都行，文件名对上即可）。
"""
import csv, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s = open(os.path.join(ROOT, 'h5/data.js'), encoding='utf-8').read()
D = json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))
ref = {r['素材 key']: r for r in csv.DictReader(open(os.path.join(ROOT, 'h5/assets/素材清单.csv'), encoding='utf-8-sig'))}
rows = []
def add(key, cat, name):
    r = ref.get(key, {})
    rows.append({'key': key, 'category': cat, 'model': f"art/models/{key.replace(':', '_')}.blend", 'dirs': '', 'scale': '', 'actions': '',
                 '名称': name, '原图参考': r.get('原图模型参考', ''), '护甲或攻击': r.get('护甲/攻击类型', ''), '备注': r.get('设计要点', '')})
add('builder', 'builder', '循环圈守卫者')
for h in D['heroes']: add('hero:' + h, 'hero', h)
for f in D['towers']: add('tower:' + f, 'tower', f)
ids = []
for n in range(1, 11):
    for v in D['waves'][str(n)]:
        for i in v['pool'] + v['direct']:
            if i not in ids: ids.append(i)
for i in ids:
    u = D['units'][i]; add('unit:' + i, 'boss' if u['hp'] >= 3000 else 'monster', u['name'])
out = os.path.join(ROOT, 'tools/blender/batch1.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(out, len(rows))
