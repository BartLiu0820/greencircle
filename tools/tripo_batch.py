"""按 art/第1批生成清单.csv 批量调用 Tripo 生成模型，放进 art/incoming/<文件夹>/model.glb。
  python3 tools/tripo_batch.py --dry-run              # 校验全部提示词和参数，不花积分
  python3 tools/tripo_batch.py                        # 全部生成（默认 4 个并行）
  python3 tools/tripo_batch.py --limit 10             # 只生成前 10 个还没做的
  python3 tools/tripo_batch.py unit_hfoo tower_箭塔    # 只生成指定的
  python3 tools/tripo_batch.py --jobs 2               # 改并行数
  python3 tools/tripo_batch.py --list art/演示批次生成清单.csv   # 换一份清单（如演示批次）
断点续跑：每个模型的任务记录在 art/incoming/<文件夹>/tripo.json，已完成的跳过，不会重复扣费。
积分不足会停下（已提交的照常完成）。生成完运行 python3 tools/process_incoming.py。
"""
import csv, json, os, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.path.join(ROOT, 'art', '第1批生成清单.csv')
INCOMING = os.path.join(ROOT, 'art', 'incoming')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tripo_trial import STYLE, NEGATIVE, tripo, save        # 和试做共用风格前缀、负面提示词、调用封装

STATIC_STYLE = ('Stylized low-poly fantasy RTS game asset, hand-painted texture, chunky exaggerated shapes, bold readable silhouette, '
                'saturated colors, flat diffuse texture with no baked lighting or shadows, clean geometry.')

# 非人形生物（蜘蛛、四足兽……）：不能用人形角色的前缀（A-pose、头身比、大手），否则会被生成成人形
CREATURE_STYLE = ('Stylized low-poly fantasy RTS game creature, hand-painted texture, chunky exaggerated shapes, bold readable silhouette, '
                  'saturated colors, flat diffuse texture with no baked lighting or shadows, full body, neutral standing pose, '
                  'single creature, no ground, no pedestal, clean geometry.')


def run_one(row, dry):
    folder, mode = row['folder'], row['方式']
    d = os.path.join(INCOMING, folder)
    sp = os.path.join(d, 'tripo.json')
    state = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
    if state.get('gen') and os.path.exists(os.path.join(d, 'model.glb')) and not dry:
        return folder, '已完成（跳过）', 0
    style = CREATURE_STYLE if row.get('风格') == 'creature' else STYLE if mode == 'rig' else STATIC_STYLE
    args = ['make', f'{style} {row["提示词"]}', '--model', 'tripo-p1', '-p', f'face_limit={row["面数"]}',
            '-p', f'negative_prompt={NEGATIVE}', '--name', 'b1-' + folder.replace('_', '-')]
    if mode == 'rig':
        args += ['--then', 'rig-check,rig']
    if dry:
        plan = tripo(args + ['--dry-run'])
        return folder, ('✓ ' if plan.get('valid') else '✗ ' + '；'.join(plan.get('errors', []))) + ' → '.join(s['name'] for s in plan.get('steps', [])), 0
    os.makedirs(os.path.join(d, 'anims'), exist_ok=True)
    res = tripo(args + ['-o', os.path.join(d, '_tripo_gen')])
    state['gen'] = res; save(state, sp)
    mf = res.get('model_file') or next((os.path.join(res['output_dir'], f) for f in res.get('files', []) if f.endswith('.glb')), None)
    shutil.copy(mf, os.path.join(d, 'model.glb'))
    if res.get('preview') and os.path.exists(res['preview']):
        shutil.copy(res['preview'], os.path.join(d, '_preview.png'))
    with open(os.path.join(d, 'options.txt'), 'w', encoding='utf-8') as fp:
        # Tripo 的输出（绑骨和普通生成都一样）面朝 +X，转 -90° 才是规范的 -Y（2026-10 演示批次实测）
        fp.write('rotate=-90\n')
    note = '' if res.get('type') == 'animate_rig' or mode == 'static' else '（检查不可绑骨，按静态处理）'
    return folder, f'✓ {res.get("credits_consumed")} 积分{note}', res.get('credits_consumed') or 0


def main():
    names = [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit()]
    dry = '--dry-run' in sys.argv
    jobs = int(sys.argv[sys.argv.index('--jobs') + 1]) if '--jobs' in sys.argv else 4
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
    lst = sys.argv[sys.argv.index('--list') + 1] if '--list' in sys.argv else LIST
    names = [n for n in names if n != lst]
    rows = [r for r in csv.DictReader(open(lst, encoding='utf-8-sig')) if r['方式'] in ('rig', 'static')]
    if names:
        rows = [r for r in rows if r['folder'] in names]
    if not dry:
        rows = [r for r in rows if not (os.path.exists(os.path.join(INCOMING, r['folder'], 'model.glb'))
                                        and os.path.exists(os.path.join(INCOMING, r['folder'], 'tripo.json')))]
        if limit:
            rows = rows[:limit]
        need = sum(int(r['预计积分']) for r in rows)
        bal = tripo(['balance'])
        print(f'待生成 {len(rows)} 个，预计 {need} 积分；当前余额 {bal.get("balance")}（冻结 {bal.get("frozen")}）')
        if bal.get('balance', 0) < need:
            print('⚠ 余额不够全部生成：会先生成到积分不足为止，充值后重跑即可续上')
    spent, failed = 0, []
    with ThreadPoolExecutor(max_workers=1 if dry else jobs) as ex:
        futs = {ex.submit(run_one, r, dry): r for r in rows}
        for f in as_completed(futs):
            r = futs[f]
            try:
                folder, msg, c = f.result()
                spent += c
                print(f'  {folder:22s} {r["名称"]:10s} {msg}', flush=True)
            except RuntimeError as e:
                failed.append(r['folder'])
                print(f'  {r["folder"]:22s} {r["名称"]:10s} ✗ {e}', flush=True)
    if not dry:
        print(f'\n本次花费 {spent} 积分，失败 {len(failed)} 个：{"、".join(failed) or "无"}。下一步：python3 tools/process_incoming.py')


if __name__ == '__main__':
    main()
