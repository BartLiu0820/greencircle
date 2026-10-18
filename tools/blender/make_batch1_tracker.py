"""生成第 1 批任务跟踪表 art/第1批任务跟踪.csv（每个模型一行：试做标记、共用模型分组、工时估算、各环节状态列）。
  python3 tools/blender/make_batch1_tracker.py
"""
import csv, os
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
rows = list(csv.DictReader(open(os.path.join(ROOT, 'tools/blender/batch1.csv'), encoding='utf-8-sig')))

TRIAL = {'builder': 'T1', 'hero:剑神': 'T2', 'tower:冰霜塔': 'T3', 'unit:nban': 'T4', 'unit:n08Q': 'T4 变体', 'unit:nsqt': 'T5', 'unit:nsqo': 'T5 变体'}
HOURS = {'builder': 6, 'hero': 7, 'tower': 3.5, 'monster': 2.5, 'boss': 6}      # AI 初稿 + 修整 + 绑骨 + 动画，单个新模型
VARIANT_HOURS = 0.75                                                         # 共用骨架动画，只改贴图/配件/比例

# 同一原图模型的第一行做基础模型，其余是变体
base_of = OrderedDict()
out = []
# 试做的基础模型先登记，保证它们是"基础"而不是"变体"
rows.sort(key=lambda r: 0 if TRIAL.get(r['key'], '').startswith('T') and '变体' not in TRIAL.get(r['key'], '') else 1)
for r in rows:
    ref = r['原图参考'] or r['key']
    group = ref if r['category'] in ('monster', 'boss') else r['key']
    is_variant = r['category'] in ('monster', 'boss') and group in base_of
    base_of.setdefault(group, r['key'])
    hours = VARIANT_HOURS if is_variant else HOURS[r['category']]
    out.append(OrderedDict([
        ('key', r['key']), ('名称', r['名称']), ('类别', r['category']), ('试做', TRIAL.get(r['key'], '')),
        ('基础模型', '' if not is_variant else base_of[group]), ('原图参考', r['原图参考']), ('护甲或攻击', r['护甲或攻击']),
        ('预计工时(h)', hours), ('负责人', ''),
        ('1 AI初稿', ''), ('2 修整', ''), ('3 绑骨', ''), ('4 动画', ''), ('5 自检', ''), ('6 出图', ''), ('7 验收', ''), ('备注', ''),
    ]))
# 试做的排最前面
out.sort(key=lambda r: (r['试做'] == '', r['试做']))
path = os.path.join(ROOT, 'art', '第1批任务跟踪.csv')
with open(path, 'w', newline='', encoding='utf-8-sig') as fp:
    w = csv.DictWriter(fp, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
new = [r for r in out if not r['基础模型']]
var = [r for r in out if r['基础模型']]
total = sum(r['预计工时(h)'] for r in out)
by = {}
for r in new: by[r['类别']] = by.get(r['类别'], 0) + 1
print(path)
print(f'共 {len(out)} 项：新模型 {len(new)} 个 {by}，变体 {len(var)} 个；预计 {total:.0f} 小时')
